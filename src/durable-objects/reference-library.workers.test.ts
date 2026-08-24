import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { LibraryPdfArtifact, WebCaptureRegistration } from "../domain/reference-library";
import { ReferenceLibrary } from "./reference-library";

describe("ReferenceLibrary in the Workers runtime", () => {
  it("pages reusable PDF catalog records beside SQLite", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`corpus-page-${crypto.randomUUID()}`);
    const older = await library.createPdfDraft(
      {
        id: crypto.randomUUID(),
        referenceId: null,
        name: "older.pdf",
        contentType: "application/pdf",
        size: 100,
        objectKey: "libraries/owner/older.pdf",
        fingerprint: `sha256:${crypto.randomUUID()}`,
        rights: "private",
        createdAt: "2026-08-23T08:00:00.000Z",
      },
      "owner@example.test",
    );
    const newer = await library.createPdfDraft(
      {
        id: crypto.randomUUID(),
        referenceId: null,
        name: "newer.pdf",
        contentType: "application/pdf",
        size: 200,
        objectKey: "libraries/owner/newer.pdf",
        fingerprint: `sha256:${crypto.randomUUID()}`,
        rights: "private",
        createdAt: "2026-08-24T08:00:00.000Z",
      },
      "owner@example.test",
    );

    const first = await library.getPdfArtifactPage(null, 1);
    const second = await library.getPdfArtifactPage(first?.next ?? null, 1);

    expect(first).toEqual({
      items: [{ artifact: newer.artifact, reference: newer.reference }],
      next: newer.artifact.id,
    });
    expect(second).toEqual({
      items: [{ artifact: older.artifact, reference: older.reference }],
      next: null,
    });
    expect(await library.getPdfArtifactPage(crypto.randomUUID(), 1)).toBeNull();
    expect(await library.getPdfArtifact(older.artifact.id)).toEqual({ artifact: older.artifact, reference: older.reference });
    expect(await library.getPdfArtifact(crypto.randomUUID())).toBeNull();
  });

  it("atomically attaches a fingerprinted PDF to an existing reference", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`oa-pdf-${crypto.randomUUID()}`);
    const [imported] = await library.importBibTeX("@article{open2026, title={Open paper}, doi={10.1000/open}}", "owner@example.test");
    const reference = imported!.reference;
    const artifact: LibraryPdfArtifact = {
      id: crypto.randomUUID(),
      referenceId: reference.id,
      name: "open2026.pdf",
      contentType: "application/pdf",
      size: 100,
      objectKey: `libraries/owner/${crypto.randomUUID()}.pdf`,
      fingerprint: "sha256:open-pdf",
      rights: "unknown",
      createdAt: "2026-07-30T09:00:00.000Z",
    };

    expect(await library.attachPdf(reference.id, artifact)).toMatchObject({ created: true, artifact });
    expect(await library.attachPdf(reference.id, { ...artifact, id: crypto.randomUUID() })).toMatchObject({
      created: false,
      artifact,
    });
    expect((await library.getSnapshot()).artifacts).toContainEqual(artifact);
  });

  it("bounds ephemeral metadata previews and invalidates them after a metadata change", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`metadata-preview-cache-${crypto.randomUUID()}`);
    const [imported] = await library.importBibTeX("@manual{guide, title={Cached Guide}}", "owner@example.test");
    const reference = imported!.reference;
    const preview = { referenceId: reference.id, artifactId: "artifact-id", candidates: [] } as const;

    for (let index = 0; index < 17; index += 1) {
      await library.cacheMetadataRefinementPreview(`cache-${index}`, preview);
    }
    expect(await library.getMetadataRefinementPreview("cache-0")).toBeNull();
    expect(await library.getMetadataRefinementPreview("cache-16")).toEqual(preview);

    await library.updateReferenceMetadata(
      reference.id,
      {
        type: reference.type,
        title: "Updated Guide",
        authors: reference.authors,
        year: reference.year,
        venue: reference.venue,
        doi: reference.doi,
        url: reference.url,
        abstract: reference.abstract,
      },
      "owner@example.test",
    );
    expect(await library.getMetadataRefinementPreview("cache-16")).toBeNull();
  });

  it("keeps one private stable record with field provenance and reusable research state", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`library-${crypto.randomUUID()}`);
    const first = await library.importBibTeX(
      `@article{doe2026,
        title = {Inspectable Evidence},
        author = {Doe, Jane},
        year = {2026},
        journal = {Open Research},
        doi = {10.1000/example}
      }`,
      "owner@example.test",
    );
    const second = await library.importBibTeX(
      `@article{localAlias,
        title = {Corrected Inspectable Evidence},
        author = {Doe, Jane},
        year = {2026},
        journal = {Open Research},
        doi = {https://doi.org/10.1000/EXAMPLE}
      }`,
      "owner@example.test",
    );
    expect(second[0]?.reference.id).toBe(first[0]?.reference.id);
    expect(first[0]?.reference.referenceKey).toBe("doe2026");
    expect(second[0]?.reference.referenceKey).toBe("doe2026");
    expect(second[0]?.created).toBe(false);
    expect(second[0]?.suggestedAlias).toBe("localAlias");
    expect(second[0]?.reference.provenance.title).toMatchObject({ method: "bibtex", actor: "owner@example.test" });
    expect((await library.getSnapshot()).referenceKeyStates[first[0]!.reference.id]).toBe("final");

    const referenceId = first[0]!.reference.id;
    expect(await library.setTags(referenceId, ["Methods", "methods", "To read"])).toEqual(["Methods", "To read"]);
    expect(await library.setCollections(referenceId, ["Dissertation", "Dissertation"])).toEqual(["Dissertation"]);
    expect((await library.createNote(referenceId, "Private interpretation")).body).toBe("Private interpretation");
    expect(await library.setReadingState(referenceId, "reading", 4, "high")).toMatchObject({
      status: "reading",
      rating: 4,
      priority: "high",
    });
    const edited = await library.updateReferenceMetadata(
      referenceId,
      {
        type: "article",
        title: "Manually corrected title",
        authors: ["Doe, Jane"],
        year: "2026",
        venue: "Open Research",
        doi: "10.1000/example",
        url: "https://example.test",
        abstract: "Reviewed abstract",
      },
      "owner@example.test",
    );
    expect(edited).toMatchObject({
      referenceKey: "doe2026",
      title: "Manually corrected title",
      provenance: { title: { method: "manual" } },
    });
    expect((await library.getSnapshot()).collections[referenceId]).toEqual(["Dissertation"]);
    expect((await library.archiveReference(referenceId, true)).archivedAt).not.toBeNull();
    expect((await library.getSnapshot()).references).toEqual([]);
    expect((await library.getSnapshot(true)).references).toHaveLength(1);

    const note = (await library.getSnapshot(true)).notes[0];
    const share = await library.shareResearch("project-a", referenceId, "note", note!.id);
    expect(share).toMatchObject({ projectId: "project-a", kind: "note", content: { kind: "note", body: "Private interpretation" } });
    expect(await library.revokeResearchShare(share.id)).toMatchObject({ revokedAt: expect.any(String) });
  });

  it("requires bibliographic identification before a PDF becomes an ordinary source artifact", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`pdf-library-${crypto.randomUUID()}`);
    const [incomplete] = await library.importBibTeX("@article{draft, title={Draft}}", "owner@example.test");
    const artifact: LibraryPdfArtifact = {
      id: crypto.randomUUID(),
      referenceId: null,
      name: "draft.pdf",
      contentType: "application/pdf",
      size: 100,
      objectKey: "libraries/owner/draft.pdf",
      fingerprint: "etag:draft",
      rights: "private",
      createdAt: "2026-07-11T10:00:00.000Z",
    };
    await library.registerPdf(artifact);
    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() => instance.identifyPdf(artifact.id, incomplete!.reference.id)).toThrow("Complete required article fields");
    });

    const [complete] = await library.importBibTeX("@manual{guide, title={Field Guide}}", "owner@example.test");
    expect(await library.identifyPdf(artifact.id, complete!.reference.id)).toMatchObject({ referenceId: complete!.reference.id });
    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() => instance.shareResearch("project-a", complete!.reference.id, "artifact", artifact.id)).toThrow("rights allow");
    });
    await library.setArtifactRights(artifact.id, "shareable");
    expect(await library.shareResearch("project-a", complete!.reference.id, "artifact", artifact.id)).toMatchObject({
      content: { kind: "artifact", objectKey: artifact.objectKey },
    });
  });

  it("extends overlapping private highlights and edits saved PDF notes", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`annotations-${crypto.randomUUID()}`);
    const artifactId = crypto.randomUUID();
    const draft = await library.createPdfDraft(
      {
        id: artifactId,
        referenceId: null,
        name: "reading.pdf",
        contentType: "application/pdf",
        size: 100,
        objectKey: `libraries/owner/${artifactId}.pdf`,
        fingerprint: `etag:${artifactId}`,
        rights: "private",
        createdAt: "2026-07-15T10:00:00.000Z",
      },
      "owner@example.test",
    );
    const first = await library.createHighlight(draft.reference.id, draft.artifact.id, 1, "Visible evidence", "First note", [
      { x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
    ]);
    const extended = await library.createHighlight(draft.reference.id, draft.artifact.id, 1, "evidence shortens review", "Second note", [
      { x: 0.25, y: 0.2, width: 0.25, height: 0.04 },
    ]);

    expect(extended).toMatchObject({
      id: first.id,
      quote: "Visible evidence shortens review",
      comment: "First note\n\nSecond note",
      rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.04 }],
    });
    expect((await library.getSnapshot()).highlights).toHaveLength(1);
    expect(await library.updateHighlightComment(draft.reference.id, first.id, "Edited insight")).toMatchObject({
      id: first.id,
      comment: "Edited insight",
    });

    const note = await library.createPdfNote(draft.reference.id, draft.artifact.id, 1, 0.3, 0.4, "Initial note");
    expect(await library.updatePdfNote(draft.reference.id, note.id, note.x, note.y, "Edited note")).toMatchObject({
      id: note.id,
      body: "Edited note",
      x: 0.3,
      y: 0.4,
    });
    const drawing = await library.createPdfDrawing(
      draft.reference.id,
      draft.artifact.id,
      1,
      "#d33f49",
      4,
      [
        { x: 0.1, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ],
      crypto.randomUUID(),
    );
    expect(await library.updatePdfDrawing(draft.reference.id, drawing.id, "#116655", 7)).toMatchObject({
      id: drawing.id,
      color: "#116655",
      width: 7,
    });
  });

  it("creates one canonical PDF drawing across mutation retries and rejects conflicting reuse", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`drawing-idempotency-${crypto.randomUUID()}`);
    const artifactId = crypto.randomUUID();
    const draft = await library.createPdfDraft(
      {
        id: artifactId,
        referenceId: null,
        name: "drawing.pdf",
        contentType: "application/pdf",
        size: 100,
        objectKey: `libraries/owner/${artifactId}.pdf`,
        fingerprint: `etag:${artifactId}`,
        rights: "private",
        createdAt: "2026-08-10T10:00:00.000Z",
      },
      "owner@example.test",
    );
    const otherArtifactId = crypto.randomUUID();
    const otherDraft = await library.createPdfDraft(
      {
        id: otherArtifactId,
        referenceId: null,
        name: "other-drawing.pdf",
        contentType: "application/pdf",
        size: 100,
        objectKey: `libraries/owner/${otherArtifactId}.pdf`,
        fingerprint: `etag:${otherArtifactId}`,
        rights: "private",
        createdAt: "2026-08-10T10:00:00.000Z",
      },
      "owner@example.test",
    );
    const mutationId = crypto.randomUUID();
    const points = [
      { x: 0.1, y: 0.2 },
      { x: 0.3, y: 0.4 },
    ] as const;

    const created = await library.createPdfDrawing(draft.reference.id, draft.artifact.id, 1, "#d33f49", 4, points, mutationId);
    const retried = await library.createPdfDrawing(draft.reference.id, draft.artifact.id, 1, "#d33f49", 4, points, mutationId);

    expect(created.id).toBe(mutationId);
    expect(retried).toEqual(created);
    await runInDurableObject(library, (instance: ReferenceLibrary, state) => {
      expect(() => instance.createPdfDrawing(draft.reference.id, draft.artifact.id, 1, "#d33f49", 5, points, mutationId)).toThrow(
        "mutation conflict",
      );
      expect(() =>
        instance.createPdfDrawing(
          draft.reference.id,
          draft.artifact.id,
          1,
          "#d33f49",
          4,
          [
            { x: 0.1, y: 0.2 },
            { x: 0.4, y: 0.5 },
          ],
          mutationId,
        ),
      ).toThrow("mutation conflict");
      expect(() => instance.createPdfDrawing(otherDraft.reference.id, otherDraft.artifact.id, 1, "#d33f49", 4, points, mutationId)).toThrow(
        "mutation conflict",
      );
      expect(
        state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM pdf_markups WHERE id = ?", mutationId).toArray(),
      ).toEqual([{ count: 1 }]);
    });
    expect((await library.getSnapshot()).pdfMarkups).toEqual([created]);

    const otherNote = await library.createPdfNote(otherDraft.reference.id, otherDraft.artifact.id, 1, 0.3, 0.4, "Other reference");
    await expect(library.deletePdfMarkup(draft.reference.id, otherNote.id)).resolves.toBeNull();
    expect((await library.getSnapshot()).pdfMarkups).toEqual(expect.arrayContaining([created, otherNote]));
  });

  it("keeps artifact analysis idempotent across duplicate and stale queue deliveries", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`artifact-analysis-${crypto.randomUUID()}`);
    const artifactId = crypto.randomUUID();
    const draft = await library.createPdfDraft(
      {
        id: artifactId,
        referenceId: null,
        name: "analysis.pdf",
        contentType: "application/pdf",
        size: 100,
        objectKey: `libraries/owner/${artifactId}.pdf`,
        fingerprint: `etag:${artifactId}`,
        rights: "private",
        createdAt: "2026-07-29T10:00:00.000Z",
      },
      "owner@example.test",
    );
    const firstRequest = "2026-07-29T10:00:01.000Z";
    const queued = await library.queueArtifactAnalysis(draft.artifact.id, "pdf-highlights", firstRequest);
    expect(queued).toMatchObject({ status: "queued", requestedAt: firstRequest, result: null });
    expect(await library.startArtifactAnalysis(draft.artifact.id, "pdf-highlights", draft.artifact.fingerprint, firstRequest)).toBe(true);
    expect(await library.startArtifactAnalysis(draft.artifact.id, "pdf-highlights", draft.artifact.fingerprint, firstRequest)).toBe(false);
    expect((await library.queueArtifactAnalysis(draft.artifact.id, "pdf-highlights", "ignored")).status).toBe("running");

    const result = {
      candidates: [
        {
          id: "annotation:1:0",
          source: "annotation" as const,
          confidence: 1,
          page: 1,
          quote: "Inspectable evidence",
          comment: "",
          rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
        },
      ],
      pagesScanned: 1,
      pagesTotal: 1,
      truncated: false,
    };
    expect(await library.completeArtifactAnalysis(draft.artifact.id, "pdf-highlights", draft.artifact.fingerprint, "stale", result)).toBe(
      false,
    );
    expect(
      await library.completeArtifactAnalysis(draft.artifact.id, "pdf-highlights", draft.artifact.fingerprint, firstRequest, result),
    ).toBe(true);
    expect(await library.getArtifactAnalysis(draft.artifact.id, "pdf-highlights")).toMatchObject({ status: "ready", result });
    expect(await library.startArtifactAnalysis(draft.artifact.id, "pdf-highlights", draft.artifact.fingerprint, firstRequest)).toBe(false);

    const retryRequest = "2026-07-29T10:01:00.000Z";
    expect((await library.queueArtifactAnalysis(draft.artifact.id, "pdf-highlights", retryRequest, true)).status).toBe("queued");
    expect(
      await library.failArtifactAnalysis(draft.artifact.id, "pdf-highlights", draft.artifact.fingerprint, firstRequest, "stale failure"),
    ).toBe(false);
    expect(
      await library.failArtifactAnalysis(
        draft.artifact.id,
        "pdf-highlights",
        draft.artifact.fingerprint,
        retryRequest,
        "Browser unavailable",
      ),
    ).toBe(true);
    expect(await library.getArtifactAnalysis(draft.artifact.id, "pdf-highlights")).toMatchObject({
      status: "failed",
      error: "Browser unavailable",
    });

    const referenceRequest = "2026-07-29T10:02:00.000Z";
    const referenceResult = {
      candidates: [
        {
          id: "doi:10.5555/reference",
          page: 8,
          raw: "Doe, Jane. 2025. Useful reference. doi:10.5555/reference",
          title: "Useful reference",
          authors: ["Doe, Jane"],
          year: "2025",
          doi: "10.5555/reference",
          url: "",
          confidence: 1,
        },
      ],
      pagesScanned: 8,
      pagesTotal: 8,
      referencesStartPage: 8,
      truncated: false,
    };
    expect((await library.queueArtifactAnalysis(draft.artifact.id, "pdf-references", referenceRequest)).status).toBe("queued");
    expect(await library.startArtifactAnalysis(draft.artifact.id, "pdf-references", draft.artifact.fingerprint, referenceRequest)).toBe(
      true,
    );
    expect(
      await library.completeArtifactAnalysis(
        draft.artifact.id,
        "pdf-references",
        draft.artifact.fingerprint,
        referenceRequest,
        referenceResult,
      ),
    ).toBe(true);
    expect(await library.getArtifactAnalysis(draft.artifact.id, "pdf-references")).toMatchObject({
      status: "ready",
      result: referenceResult,
    });
  });

  it("imports reviewed PDF highlights atomically into the private library", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`highlight-import-${crypto.randomUUID()}`);
    const artifactId = crypto.randomUUID();
    const draft = await library.createPdfDraft(
      {
        id: artifactId,
        referenceId: null,
        name: "marked.pdf",
        contentType: "application/pdf",
        size: 100,
        objectKey: `libraries/owner/${artifactId}.pdf`,
        fingerprint: `etag:${artifactId}`,
        rights: "private",
        createdAt: "2026-07-19T10:00:00.000Z",
      },
      "owner@example.test",
    );
    const imported = await library.importHighlights(draft.reference.id, draft.artifact.id, [
      {
        page: 2,
        quote: "First recovered passage",
        comment: "Native annotation note",
        rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
      },
      {
        page: 3,
        quote: "Flattened yellow passage",
        comment: "",
        rects: [{ x: 0.2, y: 0.4, width: 0.4, height: 0.04 }],
      },
    ]);
    expect(imported).toHaveLength(2);
    expect((await library.getSnapshot()).highlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ page: 2, quote: "First recovered passage", comment: "Native annotation note" }),
        expect.objectContaining({ page: 3, quote: "Flattened yellow passage", comment: "" }),
      ]),
    );

    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() =>
        instance.importHighlights(draft.reference.id, draft.artifact.id, [
          {
            page: 4,
            quote: "Would otherwise save",
            comment: "",
            rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
          },
          {
            page: 5,
            quote: "Invalid geometry",
            comment: "",
            rects: [{ x: -1, y: 0.2, width: 0.3, height: 0.04 }],
          },
        ]),
      ).toThrow("Invalid private highlight");
    });
    expect((await library.getSnapshot()).highlights).toHaveLength(2);
  });

  it("reviews persisted PDF references into citation assertions without trusting client metadata", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`pdf-reference-review-${crypto.randomUUID()}`);
    const artifactId = crypto.randomUUID();
    const draft = await library.createPdfDraft(
      {
        id: artifactId,
        referenceId: null,
        name: "seed-paper.pdf",
        contentType: "application/pdf",
        size: 100,
        objectKey: `libraries/owner/${artifactId}.pdf`,
        fingerprint: `etag:${artifactId}`,
        rights: "private",
        createdAt: "2026-07-29T10:00:00.000Z",
      },
      "owner@example.test",
    );
    const [existing] = await library.importBibTeX(
      "@article{known, title={Known paper}, author={Doe, Jane}, year={2025}, doi={10.1000/known}}",
      "owner@example.test",
    );
    const requestedAt = "2026-07-29T10:01:00.000Z";
    const result = {
      candidates: [
        {
          id: "doi:10.1000/known",
          page: 8,
          raw: "Doe, Jane. 2025. Known paper. doi:10.1000/known",
          title: "Known paper",
          authors: ["Doe, Jane"],
          year: "2025",
          doi: "10.1000/known",
          url: "https://doi.org/10.1000/known",
          confidence: 1,
        },
        {
          id: "entry:new-paper",
          page: 8,
          raw: "Roe, Richard. 2024. New paper.",
          title: "New paper",
          authors: ["Roe, Richard"],
          year: "2024",
          doi: "",
          url: "",
          confidence: 0.8,
        },
        {
          id: "entry:rejected",
          page: 9,
          raw: "Unusable entry",
          title: "",
          authors: [],
          year: "",
          doi: "",
          url: "",
          confidence: 0.3,
        },
      ],
      mentions: [
        {
          id: "pdf-mention:3:known",
          candidateId: "doi:10.1000/known",
          page: 3,
          raw: "[1]",
          style: "numeric" as const,
          confidence: 0.95,
        },
      ],
      pagesScanned: 9,
      pagesTotal: 9,
      referencesStartPage: 8,
      truncated: false,
    };
    await library.queueArtifactAnalysis(artifactId, "pdf-references", requestedAt);
    await library.startArtifactAnalysis(artifactId, "pdf-references", draft.artifact.fingerprint, requestedAt);
    await library.completeArtifactAnalysis(artifactId, "pdf-references", draft.artifact.fingerprint, requestedAt, result);

    const queue = await library.getPdfReferenceReviewQueue(artifactId);
    if (!queue) throw new Error("Expected a ready PDF reference review queue");
    expect(queue.candidates[0]).toMatchObject({ match: { id: existing!.reference.id }, matchKind: "doi", review: null });
    const acceptedExisting = await library.reviewPdfReferenceCandidate(
      artifactId,
      draft.artifact.fingerprint,
      result.candidates[0]!.id,
      "accepted",
      undefined,
      "owner@example.test",
    );
    expect(acceptedExisting).toMatchObject({
      reference: { id: existing!.reference.id },
      assertion: {
        citingReferenceId: draft.reference.id,
        citedReferenceId: existing!.reference.id,
        evidenceState: "extracted",
        method: "source-extraction",
        sourceKind: "pdf-artifact",
        sourceId: artifactId,
        sourceLocator: "PDF mention page 3 · bibliography page 8 · reference doi:10.1000/known",
      },
      review: { decision: "accepted", reviewedBy: "owner@example.test" },
    });

    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() =>
        instance.reviewPdfReferenceCandidate(
          artifactId,
          draft.artifact.fingerprint,
          result.candidates[1]!.id,
          "accepted",
          existing!.reference.id,
          "owner@example.test",
        ),
      ).toThrow("does not match");
      expect(() =>
        instance.reviewPdfReferenceCandidates(
          artifactId,
          draft.artifact.fingerprint,
          [{ candidateId: result.candidates[1]!.id }, { candidateId: "entry:missing" }],
          "owner@example.test",
        ),
      ).toThrow("candidate not found");
    });
    expect((await library.getPdfReferenceReviewQueue(artifactId))?.candidates[1]?.review).toBeNull();

    const batchAccepted = await library.reviewPdfReferenceCandidates(
      artifactId,
      draft.artifact.fingerprint,
      [{ candidateId: result.candidates[0]!.id }, { candidateId: result.candidates[1]!.id }],
      "owner@example.test",
    );
    expect(batchAccepted).toHaveLength(2);
    const acceptedNew = batchAccepted[1]!;
    expect(acceptedNew.reference).toMatchObject({
      title: "New paper",
      provenance: { title: { method: "pdf-reference", actor: "owner@example.test" } },
    });
    const rejected = await library.reviewPdfReferenceCandidate(
      artifactId,
      draft.artifact.fingerprint,
      result.candidates[2]!.id,
      "rejected",
      undefined,
      "owner@example.test",
    );
    expect(rejected).toMatchObject({ review: { decision: "rejected" }, reference: null, assertion: null });
    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() =>
        instance.reviewPdfReferenceCandidates(
          artifactId,
          draft.artifact.fingerprint,
          [{ candidateId: result.candidates[2]!.id }],
          "owner@example.test",
        ),
      ).toThrow("already skipped");
      expect(() =>
        instance.reviewPdfReferenceCandidate(
          artifactId,
          "etag:stale",
          result.candidates[1]!.id,
          "accepted",
          undefined,
          "owner@example.test",
        ),
      ).toThrow("analysis changed");
    });
    expect((await library.getPdfReferenceReviewQueue(artifactId))?.candidates.map((candidate) => candidate.review?.decision)).toEqual([
      "accepted",
      "accepted",
      "rejected",
    ]);
    expect((await library.getCitationNetwork()).edges).toHaveLength(2);
  });

  it("keeps PDF-origin keys refinable after project linking", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`pdf-drafts-${crypto.randomUUID()}`);
    const artifact = (id: string): LibraryPdfArtifact => ({
      id,
      referenceId: null,
      name: "climate_adaptation.pdf",
      contentType: "application/pdf",
      size: 100,
      objectKey: `libraries/owner/${id}.pdf`,
      fingerprint: `etag:${id}`,
      rights: "private",
      createdAt: "2026-07-13T10:00:00.000Z",
    });
    const first = await library.createPdfDraft(artifact(crypto.randomUUID()), "owner@example.test");
    const second = await library.createPdfDraft(artifact(crypto.randomUUID()), "owner@example.test");
    expect(first).toMatchObject({
      reference: {
        referenceKey: "sourceundatedclimate",
        title: "climate adaptation",
        provenance: { title: { method: "filename" }, type: { method: "migration" } },
      },
      artifact: { referenceId: first.reference.id },
    });
    expect(second.reference.referenceKey).toBe("sourceundatedclimate2");
    expect((await library.getSnapshot()).referenceKeyStates).toMatchObject({
      [first.reference.id]: "provisional",
      [second.reference.id]: "provisional",
    });
    const edited = await library.updateReferenceMetadata(
      first.reference.id,
      {
        type: "article",
        title: "Climate adaptation",
        authors: ["Smith, Jane"],
        year: "2024",
        venue: "Research Journal",
        doi: "",
        url: "",
        abstract: "",
      },
      "owner@example.test",
    );
    expect(edited.referenceKey).toBe("smith2024");
    const enriched = await library.applyReviewedPdfMetadata(
      first.reference.id,
      first.artifact.id,
      { title: "Climate evidence", authors: ["Smith, Jane"], year: "2025", doi: "https://doi.org/10.5555/Climate" },
      "owner@example.test",
    );
    expect(enriched).toMatchObject({
      referenceKey: "smith2025",
      title: "Climate evidence",
      authors: ["Smith, Jane"],
      year: "2025",
      doi: "10.5555/climate",
      provenance: {
        title: { method: "pdf-metadata", actor: "owner@example.test" },
        authors: { method: "pdf-metadata", actor: "owner@example.test" },
        year: { method: "pdf-metadata", actor: "owner@example.test" },
        doi: { method: "pdf-metadata", actor: "owner@example.test" },
      },
    });
    const crossrefEnriched = await library.applyReviewedCrossrefMetadata(
      first.reference.id,
      "10.5555/climate",
      {
        type: "article",
        title: "Climate adaptation pathways",
        authors: ["Smith, Jane", "Doe, Alex"],
        year: "2026",
        venue: "Crossref Journal",
        doi: "10.5555/climate",
        url: "https://doi.org/10.5555/climate",
        abstract: "Provider abstract",
      },
      ["title", "venue", "abstract"],
      "owner@example.test",
    );
    expect(crossrefEnriched).toMatchObject({
      referenceKey: "smith2025",
      title: "Climate adaptation pathways",
      authors: ["Smith, Jane"],
      year: "2025",
      venue: "Crossref Journal",
      abstract: "Provider abstract",
      provenance: {
        title: { method: "crossref", actor: "owner@example.test" },
        venue: { method: "crossref", actor: "owner@example.test" },
        abstract: { method: "crossref", actor: "owner@example.test" },
        authors: { method: "pdf-metadata" },
        year: { method: "pdf-metadata" },
      },
    });
    await expect(library.getPdfMetadataContext(first.reference.id, first.artifact.id)).resolves.toMatchObject({
      reference: { id: first.reference.id },
      artifact: { id: first.artifact.id, referenceId: first.reference.id },
    });
    const dataCiteEnriched = await library.applyReviewedProviderMetadata(
      first.reference.id,
      {
        type: "article",
        title: "Climate adaptation pathways",
        authors: ["Smith, Jane"],
        year: "2027",
        venue: "Data archive",
        doi: "10.5555/climate",
        url: "https://doi.org/10.5555/climate",
        abstract: "Archived dataset metadata",
      },
      ["year"],
      "datacite",
      "owner@example.test",
    );
    expect(dataCiteEnriched).toMatchObject({ year: "2027", provenance: { year: { method: "datacite" } } });
    const openAlexEnriched = await library.applyReviewedProviderMetadata(
      first.reference.id,
      { ...dataCiteEnriched, authors: [...dataCiteEnriched.authors], abstract: "OpenAlex abstract" },
      ["abstract"],
      "openalex",
      "owner@example.test",
    );
    expect(openAlexEnriched).toMatchObject({ abstract: "OpenAlex abstract", provenance: { abstract: { method: "openalex" } } });
    const semanticScholarEnriched = await library.applyReviewedProviderMetadata(
      first.reference.id,
      { ...openAlexEnriched, authors: [...openAlexEnriched.authors], venue: "Semantic Scholar venue" },
      ["venue"],
      "semantic-scholar",
      "owner@example.test",
    );
    expect(semanticScholarEnriched).toMatchObject({
      venue: "Semantic Scholar venue",
      provenance: { venue: { method: "semantic-scholar" } },
    });
    const combined = await library.applyReviewedProviderMetadataBatch(
      first.reference.id,
      [
        {
          provider: "crossref",
          metadata: { ...semanticScholarEnriched, authors: ["Crossref Author"], title: "Registry title" },
          fields: ["title", "authors"],
        },
        {
          provider: "openalex",
          metadata: { ...semanticScholarEnriched, authors: [...semanticScholarEnriched.authors], abstract: "Index abstract" },
          fields: ["abstract"],
        },
      ],
      "owner@example.test",
    );
    expect(combined).toMatchObject({
      title: "Registry title",
      authors: ["Crossref Author"],
      abstract: "Index abstract",
      provenance: {
        title: { method: "crossref" },
        authors: { method: "crossref" },
        abstract: { method: "openalex" },
      },
    });
    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() =>
        instance.applyReviewedProviderMetadataBatch(
          first.reference.id,
          [
            { provider: "crossref", metadata: { ...combined, authors: [...combined.authors] }, fields: ["title"] },
            { provider: "openalex", metadata: { ...combined, authors: [...combined.authors] }, fields: ["title"] },
          ],
          "owner@example.test",
        ),
      ).toThrow("invalid");
    });
    await library.registerProjectDependency("project-a", first.reference.id);
    expect((await library.getSnapshot()).referenceKeyStates[first.reference.id]).toBe("provisional");
    const linkedRefinement = await library.updateReferenceMetadata(
      first.reference.id,
      { ...dataCiteEnriched, year: "2027" },
      "owner@example.test",
    );
    expect(linkedRefinement.referenceKey).toBe("smith2027");
    await library.unregisterProjectDependency("project-a", first.reference.id);
    const unlinked = await library.updateReferenceMetadata(first.reference.id, { ...linkedRefinement, year: "2028" }, "owner@example.test");
    expect(unlinked.referenceKey).toBe("smith2028");
    expect((await library.getSnapshot()).referenceKeyStates[first.reference.id]).toBe("provisional");
    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() =>
        instance.applyReviewedCrossrefMetadata(
          first.reference.id,
          "10.5555/changed",
          {
            type: "article",
            title: "Stale",
            authors: [],
            year: "",
            venue: "",
            doi: "10.5555/changed",
            url: "",
            abstract: "",
          },
          ["title"],
          "owner@example.test",
        ),
      ).toThrow("DOI changed");
    });
    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() =>
        instance.applyReviewedPdfMetadata(first.reference.id, second.artifact.id, { title: "Wrong artifact" }, "owner@example.test"),
      ).toThrow("does not belong");
    });

    const longName = `${"x".repeat(100)}.pdf`;
    const longArtifact = (id: string): LibraryPdfArtifact => ({ ...artifact(id), name: longName });
    const longFirst = await library.createPdfDraft(longArtifact(crypto.randomUUID()), "owner@example.test");
    const longSecond = await library.createPdfDraft(longArtifact(crypto.randomUUID()), "owner@example.test");
    expect(longFirst.reference.referenceKey).toHaveLength(80);
    expect(longSecond.reference.referenceKey).toBe(`${longFirst.reference.referenceKey.slice(0, 79)}2`);
  });

  it("resolves exact PDF repeats to the canonical active or archived source", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`exact-pdf-${crypto.randomUUID()}`);
    const artifact = (id: string): LibraryPdfArtifact => ({
      id,
      referenceId: null,
      name: `${id}.pdf`,
      contentType: "application/pdf",
      size: 100,
      objectKey: `libraries/owner/${id}.pdf`,
      fingerprint: "r2-etag:identical",
      rights: "private",
      createdAt: "2026-07-13T10:00:00.000Z",
    });
    const first = await library.createPdfDraft(artifact(crypto.randomUUID()), "owner@example.test");
    const repeated = await library.createPdfDraft(artifact(crypto.randomUUID()), "owner@example.test");
    expect(first.created).toBe(true);
    expect(repeated).toEqual({ ...first, created: false });
    expect((await library.getSnapshot()).references).toHaveLength(1);
    expect((await library.getSnapshot()).artifacts).toHaveLength(1);

    await library.archiveReference(first.reference.id, true);
    const archivedRepeat = await library.createPdfDraft(artifact(crypto.randomUUID()), "owner@example.test");
    expect(archivedRepeat).toMatchObject({
      created: false,
      reference: { id: first.reference.id, archivedAt: expect.any(String) },
      artifact: { id: first.artifact.id },
    });

    await library.permanentlyDeleteReference(first.reference.id, []);
    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() => instance.createPdfDraft(artifact(crypto.randomUUID()), "owner@example.test")).toThrow(
        "deleted library source already owns this PDF",
      );
    });
  });

  it("distinguishes project unlink dependencies, archive, and confirmed permanent deletion", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`deletion-library-${crypto.randomUUID()}`);
    const [item] = await library.importBibTeX("@manual{guide, title={Field Guide}}", "owner@example.test");
    const referenceId = item!.reference.id;
    await library.registerProjectDependency("project-a", referenceId);
    expect(await library.getDeletionImpact(referenceId)).toMatchObject({ referenceId, projectIds: ["project-a"] });
    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() => instance.permanentlyDeleteReference(referenceId, [])).toThrow("dependencies changed");
    });
    const tombstone = await library.permanentlyDeleteReference(referenceId, ["project-a"]);
    expect(tombstone).toMatchObject({ id: referenceId, deletedAt: expect.any(String), title: "Field Guide" });
    expect((await library.getReferences([referenceId]))[0]).toMatchObject({ deletedAt: expect.any(String), authors: [] });
  });

  it("keeps immutable web captures under one stable source identity", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`web-library-${crypto.randomUUID()}`);
    const first = await library.registerWebCapture(webCapture("capture-1", "2026-07-12T08:00:00.000Z", "sha256:first", "First version"));
    const second = await library.registerWebCapture(webCapture("capture-2", "2026-07-12T09:00:00.000Z", "sha256:second", "Second version"));
    expect(second.reference.id).toBe(first.reference.id);
    expect(second.created).toBe(false);
    expect(second.reference).toMatchObject({ title: "Example source", url: "https://example.com/article", year: "2026" });
    expect((await library.getSnapshot()).referenceKeyStates[first.reference.id]).toBe("provisional");
    expect(await library.getWebSnapshots(first.reference.id)).toMatchObject([
      { id: "capture-2", contentHash: "sha256:second" },
      { id: "capture-1", contentHash: "sha256:first" },
    ]);
    expect((await library.getSnapshot()).webSources).toEqual([
      expect.objectContaining({ referenceId: first.reference.id, canonicalUrl: "https://example.com/article" }),
    ]);
    await library.registerProjectDependency("project-a", first.reference.id);
    expect((await library.getSnapshot()).referenceKeyStates[first.reference.id]).toBe("final");
    const share = await library.shareResearch("project-a", first.reference.id, "web-snapshot", first.snapshot.id);
    expect(share).toMatchObject({
      kind: "web-snapshot",
      content: { kind: "web-snapshot", snapshotId: "capture-1", contentHash: "sha256:first" },
    });
  });

  it("retains provenance-bearing citation assertions, conflicts, review, and project-filtered networks", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`citation-library-${crypto.randomUUID()}`);
    const imported = await library.importBibTeX(
      `@article{alpha, title={Alpha paper}, author={A, Ada}, year={2026}, journal={Journal}, doi={10.1000/alpha}}
       @article{beta, title={Beta paper}, author={B, Bea}, year={2025}, journal={Journal}, doi={10.1000/beta}}
       @article{gamma, title={Gamma paper}, author={G, Gio}, year={2024}, journal={Journal}, doi={10.1000/gamma}}`,
      "owner@example.test",
    );
    const alpha = imported[0]!.reference;
    const beta = imported[1]!.reference;
    const gamma = imported[2]!.reference;
    expect(await library.findReferencesByDois(["10.1000/BETA", "10.1000/beta", "10.1000/missing"])).toEqual([
      expect.objectContaining({ id: beta.id, doi: "10.1000/beta" }),
    ]);

    await library.registerProjectDependency("project-a", beta.id);
    await library.registerProjectDependency("project-a", gamma.id);
    const observedAt = "2026-07-12T10:00:00.000Z";
    const positiveInput = {
      citingReferenceId: alpha.id,
      citedReferenceId: beta.id,
      polarity: "cites" as const,
      evidenceState: "extracted" as const,
      method: "provider" as const,
      observedAt,
      sourceKind: "provider-response" as const,
      sourceId: "sha256:crossref-response",
      sourceLocator: "https://api.crossref.org/works/10.1000%2Falpha",
      confidence: null,
    };
    const [positive] = await library.createCitationAssertions([positiveInput], "Crossref");
    expect((await library.createCitationAssertions([positiveInput], "Crossref"))[0]?.id).toBe(positive!.id);
    const [negative] = await library.createCitationAssertions(
      [
        {
          ...positiveInput,
          polarity: "does-not-cite",
          evidenceState: "inferred",
          method: "model",
          sourceKind: "researcher",
          sourceId: "model-candidate-1",
          sourceLocator: "manual review queue",
          confidence: 0.4,
        },
      ],
      "owner@example.test",
    );

    expect(await library.getCitationNetwork()).toMatchObject({
      projectId: null,
      edges: [{ state: "conflicting", assertions: [{ state: "conflicting" }, { state: "conflicting" }] }],
    });
    expect((await library.getCitationAssertions(alpha.id)).map((assertion) => assertion.id).sort()).toEqual(
      [positive!.id, negative!.id].sort(),
    );
    await library.reviewCitationAssertion(negative!.id, { decision: "rejected", note: "No source support" }, "owner@example.test");
    expect((await library.getCitationNetwork()).edges[0]).toMatchObject({ state: "extracted", assertions: [{ id: positive!.id }] });
    await library.reviewCitationAssertion(
      positive!.id,
      { decision: "confirmed", note: "Checked publisher reference list" },
      "owner@example.test",
    );
    expect(await library.getCitationNetwork("project-a")).toMatchObject({
      projectId: "project-a",
      nodes: [
        expect.objectContaining({ referenceId: alpha.id, inProject: false }),
        expect.objectContaining({ referenceId: beta.id, inProject: true }),
        expect.objectContaining({ referenceId: gamma.id, inProject: true }),
      ],
      edges: [{ state: "confirmed", assertions: [{ review: { decision: "confirmed", reviewer: "owner@example.test" } }] }],
    });

    await runInDurableObject(library, (instance: ReferenceLibrary, state) => {
      expect(
        state.storage.sql
          .exec<{ version: number; name: string }>("SELECT version, name FROM _kirjolab_migrations ORDER BY version")
          .toArray(),
      ).toContainEqual({ version: 4, name: "model-citation-assertions-with-provenance" });
      expect(
        state.storage.sql
          .exec<{ version: number; name: string }>("SELECT version, name FROM _kirjolab_migrations ORDER BY version")
          .toArray(),
      ).toContainEqual({ version: 7, name: "finalize-provisional-reference-keys" });
      expect(
        state.storage.sql
          .exec<{ version: number; name: string }>("SELECT version, name FROM _kirjolab_migrations ORDER BY version")
          .toArray(),
      ).toContainEqual({ version: 10, name: "refine-linked-pdf-reference-keys" });
      expect(() => instance.createCitationAssertions([], "owner")).toThrow("between 1 and 128");
      expect(() => instance.findReferencesByDois(Array.from({ length: 129 }, () => "10.1000/x"))).toThrow("Too many");
      expect(() => instance.reviewCitationAssertion(crypto.randomUUID(), { decision: "confirmed", note: "" }, "owner")).toThrow(
        "not found",
      );
    });
  });

  it("atomically accepts and deduplicates a provider citation candidate", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`citation-candidate-${crypto.randomUUID()}`);
    const imported = await library.importBibTeX(
      "@article{seed, title={Seed paper}, author={Seed, Sam}, year={2026}, doi={10.1000/seed}}",
      "owner@example.test",
    );
    const seed = imported[0]!.reference;
    const metadata = {
      type: "article",
      title: "Discovered paper",
      authors: ["Doe, Jane"],
      year: "2024",
      venue: "Discovery Journal",
      doi: "10.1000/discovered",
      url: "https://doi.org/10.1000/discovered",
      abstract: "A discovered work.",
    };
    const source = {
      provider: "crossref" as const,
      direction: "references" as const,
      observedAt: "2026-07-16T10:00:00.000Z",
      responseId: `sha256:${"a".repeat(64)}`,
      sourceLocator: "https://api.crossref.org/works/10.1000%2Fseed",
    };

    const accepted = await library.acceptCitationCandidate(seed.id, metadata, source, "owner@example.test");
    expect(accepted).toMatchObject({
      created: true,
      reference: {
        title: metadata.title,
        doi: metadata.doi,
        provenance: {
          title: { method: "crossref", actor: "owner@example.test", capturedAt: source.observedAt },
          doi: { method: "crossref", actor: "owner@example.test", capturedAt: source.observedAt },
        },
      },
      assertion: {
        citingReferenceId: seed.id,
        polarity: "cites",
        evidenceState: "extracted",
        sourceId: source.responseId,
        assertedBy: "Crossref",
      },
    });
    expect(accepted.assertion.citedReferenceId).toBe(accepted.reference.id);

    const repeated = await library.acceptCitationCandidate(seed.id, metadata, source, "owner@example.test");
    expect(repeated).toMatchObject({ created: false, reference: { id: accepted.reference.id }, assertion: { id: accepted.assertion.id } });
    expect(await library.findReferencesByDois([metadata.doi])).toHaveLength(1);
    expect(await library.getCitationNetwork()).toMatchObject({
      nodes: [{ referenceId: accepted.reference.id }, { referenceId: seed.id }],
      edges: [{ assertions: [{ id: accepted.assertion.id }] }],
    });

    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() => instance.acceptCitationCandidate(seed.id, { ...metadata, doi: seed.doi }, source, "owner@example.test")).toThrow(
        "invalid",
      );
    });
    const forwardMetadata = { ...metadata, title: "Later citing paper", doi: "10.1000/later-citing" };
    const forward = await library.acceptCitationCandidate(
      seed.id,
      forwardMetadata,
      {
        provider: "semantic-scholar",
        direction: "citations",
        observedAt: source.observedAt,
        responseId: `sha256:${"b".repeat(64)}`,
        sourceLocator: "https://api.semanticscholar.org/graph/v1/paper/DOI:10.1000%2Fseed/citations",
      },
      "owner@example.test",
    );
    expect(forward).toMatchObject({
      reference: { provenance: { title: { method: "semantic-scholar" } } },
      assertion: { citingReferenceId: forward.reference.id, citedReferenceId: seed.id, assertedBy: "Semantic Scholar" },
    });
    const batch = await library.acceptCitationCandidates(
      seed.id,
      [metadata, { ...metadata, title: "Another discovered paper", doi: "10.1000/another" }],
      source,
      "owner@example.test",
    );
    expect(batch).toMatchObject({
      accepted: [
        { created: false, reference: { id: accepted.reference.id }, assertion: { id: accepted.assertion.id } },
        { created: true, reference: { doi: "10.1000/another" } },
      ],
    });
    expect((await library.getSnapshot()).references).toHaveLength(4);
  });

  it("persists a bounded citation trail research queue", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`citation-queue-${crypto.randomUUID()}`);
    const imported = await library.importBibTeX(
      `@article{seed, title={Seed}, year={2026}, doi={10.1000/seed}}
       @article{candidate, title={Candidate}, year={2025}, doi={10.1000/candidate}}`,
      "owner@example.test",
    );
    const seed = imported[0]!.reference;
    const candidate = imported[1]!.reference;

    const queued = await library.queueCitationReference(candidate.id, { seedReferenceId: seed.id, direction: "references" });
    expect(await library.getCitationResearchQueue()).toEqual([queued]);
    const updated = await library.queueCitationReference(candidate.id, { seedReferenceId: seed.id, direction: "citations" });
    expect(await library.getCitationResearchQueue()).toEqual([updated]);
    await expect(library.removeCitationResearchQueueItem(candidate.id)).resolves.toEqual(updated);
    expect(await library.getCitationResearchQueue()).toEqual([]);

    await runInDurableObject(library, (instance: ReferenceLibrary, state) => {
      expect(() => instance.queueCitationReference(seed.id, { seedReferenceId: seed.id, direction: "references" })).toThrow("invalid");
      expect(() => instance.removeCitationResearchQueueItem(candidate.id)).toThrow("not found");
      expect(
        state.storage.sql
          .exec<{ version: number; name: string }>("SELECT version, name FROM _kirjolab_migrations WHERE version = 14")
          .toArray(),
      ).toEqual([{ version: 14, name: "queue-citation-trail-research" }]);
    });
  });

  it("persists bounded private page notes and freehand drawings", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`pdf-markups-${crypto.randomUUID()}`);
    const draft = await library.createPdfDraft(
      {
        id: crypto.randomUUID(),
        referenceId: null,
        name: "notes.pdf",
        contentType: "application/pdf",
        size: 128,
        objectKey: "libraries/owner/notes.pdf",
        fingerprint: "etag:notes",
        rights: "private",
        createdAt: "2026-07-14T10:00:00.000Z",
      },
      "owner@example.test",
    );
    const note = await library.createPdfNote(draft.reference.id, draft.artifact.id, 2, 0.25, 0.4, "Check this claim");
    const drawing = await library.createPdfDrawing(
      draft.reference.id,
      draft.artifact.id,
      2,
      "#d33f49",
      4,
      [
        { x: 0.1, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ],
      crypto.randomUUID(),
    );
    expect((await library.getSnapshot()).pdfMarkups).toEqual(expect.arrayContaining([note, drawing]));
    await expect(library.deletePdfMarkup(draft.reference.id, note.id)).resolves.toEqual(note);
    await expect(library.deletePdfMarkup(draft.reference.id, note.id)).resolves.toBeNull();
    await expect(library.deletePdfMarkup(draft.reference.id, crypto.randomUUID())).resolves.toBeNull();
    expect((await library.getSnapshot()).pdfMarkups).toEqual([drawing]);
    await runInDurableObject(library, (instance: ReferenceLibrary, state) => {
      expect(() => instance.createPdfNote(draft.reference.id, draft.artifact.id, 1, -0.1, 0.5, "Bad")).toThrow("Invalid");
      expect(() =>
        instance.createPdfDrawing(draft.reference.id, draft.artifact.id, 1, "red", 4, [{ x: 0, y: 0 }], crypto.randomUUID()),
      ).toThrow("Invalid");
      expect(
        state.storage.sql
          .exec<{ version: number; name: string }>("SELECT version, name FROM _kirjolab_migrations ORDER BY version")
          .toArray(),
      ).toContainEqual({ version: 8, name: "annotate-private-pdfs" });
    });
  });

  it("detects and atomically reconciles strong duplicate references", async () => {
    const library = env.REFERENCE_LIBRARIES.getByName(`reconciliation-${crypto.randomUUID()}`);
    const [canonicalImport, neighborImport] = await library.importBibTeX(
      `@article{canonical, title={Same Study}, author={Doe, Jane}, year={2024}, doi={10.1000/same}}
       @article{neighbor, title={Neighbor Study}, author={Roe, Alex}, year={2023}}`,
      "owner@example.test",
    );
    const canonical = canonicalImport!.reference;
    const neighbor = neighborImport!.reference;
    const draft = await library.createPdfDraft(
      {
        id: crypto.randomUUID(),
        referenceId: null,
        name: "same-study.pdf",
        contentType: "application/pdf",
        size: 128,
        objectKey: `libraries/owner/${crypto.randomUUID()}.pdf`,
        fingerprint: `etag:${crypto.randomUUID()}`,
        rights: "private",
        createdAt: "2026-07-29T10:00:00.000Z",
      },
      "owner@example.test",
    );
    const duplicate = await library.updateReferenceMetadata(
      draft.reference.id,
      {
        type: "article",
        title: "Same Study!",
        authors: ["Doe, Jane"],
        year: "2024",
        venue: "PDF venue",
        doi: "",
        url: "",
        abstract: "PDF abstract",
      },
      "owner@example.test",
    );
    await library.setTags(canonical.id, ["shared"]);
    await library.setTags(duplicate.id, ["shared", "pdf"]);
    await library.setCollections(duplicate.id, ["Imported PDFs"]);
    await library.setReadingState(duplicate.id, "reading", 4, "high");
    await library.createNote(duplicate.id, "Moved note");
    await library.createHighlight(duplicate.id, draft.artifact.id, 1, "Moved quote", "", [{ x: 0.1, y: 0.1, width: 0.4, height: 0.05 }]);
    await library.createPdfNote(duplicate.id, draft.artifact.id, 1, 0.2, 0.2, "Moved page note");
    await library.createCitationAssertions(
      [
        {
          citingReferenceId: duplicate.id,
          citedReferenceId: neighbor.id,
          polarity: "cites",
          evidenceState: "extracted",
          method: "source-extraction",
          observedAt: "2026-07-29T10:00:00.000Z",
          sourceKind: "pdf-artifact",
          sourceId: draft.artifact.id,
          sourceLocator: "bibliography page 1",
          confidence: 1,
        },
      ],
      "owner@example.test",
    );

    const report = await library.getReferenceReconciliationReport();
    const candidate = report.candidates.find(
      ({ left, right }) => new Set([left.id, right.id]).has(canonical.id) && new Set([left.id, right.id]).has(duplicate.id),
    );
    expect(candidate).toMatchObject({ reason: "bibliographic", leftBlockers: [], rightBlockers: [] });

    const result = await library.mergeReferences(
      {
        canonicalReferenceId: canonical.id,
        duplicateReferenceId: duplicate.id,
        expectedCanonicalUpdatedAt: canonical.updatedAt,
        expectedDuplicateUpdatedAt: duplicate.updatedAt,
      },
      "owner@example.test",
    );
    expect(result).toMatchObject({
      canonicalReference: { id: canonical.id, doi: "10.1000/same", venue: "PDF venue", abstract: "PDF abstract" },
      mergedReferenceId: duplicate.id,
      moved: { artifacts: 1, notes: 1, highlights: 1, pdfMarkups: 1, citationAssertions: 1 },
    });
    const snapshot = await library.getSnapshot();
    expect(snapshot.references.map(({ id }) => id)).not.toContain(duplicate.id);
    expect(snapshot.artifacts).toContainEqual(expect.objectContaining({ id: draft.artifact.id, referenceId: canonical.id }));
    expect(snapshot.tags[canonical.id]).toEqual(["pdf", "shared"]);
    expect(snapshot.collections[canonical.id]).toEqual(["Imported PDFs"]);
    expect(snapshot.reading).toContainEqual(expect.objectContaining({ referenceId: canonical.id, status: "reading", rating: 4 }));
    expect(await library.getCitationNetwork()).toMatchObject({
      edges: [{ assertions: [{ citingReferenceId: canonical.id, citedReferenceId: neighbor.id }] }],
    });

    const blockedDraft = await library.createPdfDraft(
      {
        id: crypto.randomUUID(),
        referenceId: null,
        name: "linked-copy.pdf",
        contentType: "application/pdf",
        size: 64,
        objectKey: `libraries/owner/${crypto.randomUUID()}.pdf`,
        fingerprint: `etag:${crypto.randomUUID()}`,
        rights: "private",
        createdAt: "2026-07-29T11:00:00.000Z",
      },
      "owner@example.test",
    );
    const blocked = await library.updateReferenceMetadata(
      blockedDraft.reference.id,
      { type: "article", title: "Same Study", authors: ["Doe, Jane"], year: "2024", venue: "", doi: "", url: "", abstract: "" },
      "owner@example.test",
    );
    await library.registerProjectDependency("linked-project", blocked.id);
    const blockedCandidate = (await library.getReferenceReconciliationReport()).candidates.find(
      ({ left, right }) => new Set([left.id, right.id]).has(canonical.id) && new Set([left.id, right.id]).has(blocked.id),
    );
    expect(blockedCandidate?.left.id === blocked.id ? blockedCandidate.leftBlockers : blockedCandidate?.rightBlockers).toEqual([
      "1 linked project",
    ]);
    await runInDurableObject(library, (instance: ReferenceLibrary) => {
      expect(() =>
        instance.mergeReferences(
          {
            canonicalReferenceId: canonical.id,
            duplicateReferenceId: blocked.id,
            expectedCanonicalUpdatedAt: result.canonicalReference.updatedAt,
            expectedDuplicateUpdatedAt: blocked.updatedAt,
          },
          "owner@example.test",
        ),
      ).toThrow("1 linked project");
    });
  });
});

function webCapture(id: string, accessedAt: string, contentHash: string, readableName: string): WebCaptureRegistration {
  return {
    canonicalUrl: "https://example.com/article",
    actor: "owner@example.test",
    snapshot: {
      id,
      requestedUrl: "https://example.com/article#section",
      finalUrl: "https://example.com/article",
      accessedAt,
      status: 200,
      contentType: "text/html; charset=utf-8",
      rawObjectKey: `libraries/owner/web/${id}/raw`,
      readableObjectKey: `libraries/owner/web/${id}/${readableName}.txt`,
      rawSize: 100,
      readableSize: 50,
      contentHash,
      title: "Example source",
      authors: ["Ada Writer"],
      publisher: "Example Press",
      publishedAt: "2026-07-12",
      complete: true,
      diagnostics: [],
      redirectChain: [],
      etag: `"${id}"`,
      lastModified: accessedAt,
    },
  };
}
