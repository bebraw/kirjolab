import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { LibraryPdfArtifact, WebCaptureRegistration } from "../domain/reference-library";
import { ReferenceLibrary } from "./reference-library";

describe("ReferenceLibrary in the Workers runtime", () => {
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

  it("creates PDF drafts immediately with immutable unique reference keys", async () => {
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
    expect(edited.referenceKey).toBe("sourceundatedclimate");
    const enriched = await library.applyReviewedPdfMetadata(
      first.reference.id,
      first.artifact.id,
      { title: "Climate evidence", authors: ["Smith, Jane"], year: "2025", doi: "https://doi.org/10.5555/Climate" },
      "owner@example.test",
    );
    expect(enriched).toMatchObject({
      referenceKey: "sourceundatedclimate",
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
    expect(await library.getWebSnapshots(first.reference.id)).toMatchObject([
      { id: "capture-2", contentHash: "sha256:second" },
      { id: "capture-1", contentHash: "sha256:first" },
    ]);
    expect((await library.getSnapshot()).webSources).toEqual([
      expect.objectContaining({ referenceId: first.reference.id, canonicalUrl: "https://example.com/article" }),
    ]);
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
    expect((await library.getCitationAssertions(alpha.id)).map((assertion) => assertion.id)).toEqual([positive!.id, negative!.id]);
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
      expect(() => instance.createCitationAssertions([], "owner")).toThrow("between 1 and 128");
      expect(() => instance.findReferencesByDois(Array.from({ length: 129 }, () => "10.1000/x"))).toThrow("Too many");
      expect(() => instance.reviewCitationAssertion(crypto.randomUUID(), { decision: "confirmed", note: "" }, "owner")).toThrow(
        "not found",
      );
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
      etag: `\"${id}\"`,
      lastModified: accessedAt,
    },
  };
}
