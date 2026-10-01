import { describe, expect, it } from "vitest";
import * as v from "valibot";
import * as Y from "yjs";
import { projectArchiveFixture, projectArchiveResearchFixture } from "../../test-support/project-archive";
import { buildProjectArchive, inspectProjectArchive, parseProjectArchiveState, projectArchiveBinaryKeys } from "./project-archive";
import {
  projectArchiveIdentityProvenance,
  projectArchiveRevisionSeed,
  remapProjectArchive,
  replaceProjectArchiveBinaries,
} from "./project-archive-seed";

describe("native project identity remapping", () => {
  it("serializes complete project metadata and working anchors into a fresh revision", () => {
    const { snapshot } = projectArchiveResearchFixture();
    const at = "2026-10-01T10:00:00.000Z";
    snapshot.publications = [
      {
        id: "reference",
        citationKey: "OriginalKey",
        type: "article",
        title: "Original source",
        authors: ["Ada Writer"],
        year: "2025",
        venue: "Journal",
        doi: "10.1000/portable",
        url: "https://example.test/source",
        abstract: "Source abstract",
        metadataSource: "crossref",
        createdAt: at,
        updatedAt: at,
      },
    ];
    const { source: _source, candidates: _candidates, composition: _composition, ...state } = snapshot;
    const seed: {
      version: number;
      workspace: { title: string; yState: string; source: string; bibliography: string; entryFileId: string; publicationProfile: unknown };
      tables: Record<string, Record<string, unknown>[]>;
    } = JSON.parse(projectArchiveRevisionSeed(parseProjectArchiveState(state)));
    for (const rows of Object.values(seed.tables))
      for (const row of rows)
        for (const [key, value] of Object.entries(row)) {
          if (!key.endsWith("_json")) continue;
          expect(typeof value).toBe("string");
          if (typeof value === "string") row[key] = JSON.parse(value);
        }
    expect(seed.version).toBe(1);
    expect(seed.workspace).toEqual({
      title: "Portable paper",
      yState: expect.any(String),
      source: snapshot.files[0]!.content,
      bibliography: snapshot.bibliography,
      entryFileId: "entry",
      publicationProfile: snapshot.publicationProfile,
    });
    expect(seed.tables.project_files).toEqual([
      {
        id: "entry",
        path: "paper.md",
        media_type: "text/markdown",
        y_text_name: "source",
        content: snapshot.files[0]!.content,
        created_at: at,
        updated_at: at,
      },
      {
        id: "section",
        path: "sections/result.md",
        media_type: "text/markdown",
        y_text_name: "file:section",
        content: "Result.\n",
        created_at: at,
        updated_at: at,
      },
      {
        id: "review-output",
        path: "review/source-review/synthesis.md",
        media_type: "text/markdown",
        y_text_name: "file:review-output",
        content: "# Pinned synthesis\n",
        created_at: at,
        updated_at: at,
      },
    ]);
    expect(seed.tables.project_folders).toEqual([
      { id: "empty", path: "empty", created_at: at, updated_at: at },
      { id: "sections", path: "sections", created_at: at, updated_at: at },
      { id: "figures", path: "figures", created_at: at, updated_at: at },
    ]);
    expect(seed.tables.project_assets).toEqual([
      {
        id: "figure",
        path: "figures/result.png",
        media_type: "image/png",
        size: snapshot.assets[0]!.size,
        object_key: "old/image",
        fingerprint: "old",
        created_at: at,
        updated_at: at,
      },
    ]);
    expect(seed.tables.pdfs).toEqual([
      {
        id: "pdf",
        name: "source.pdf",
        content_type: "application/pdf",
        size: snapshot.pdfs[0]!.size,
        object_key: "old/pdf",
        fingerprint: "old",
        created_at: at,
      },
    ]);
    expect(seed.tables.publications).toEqual([
      {
        id: "reference",
        citation_key: "OriginalKey",
        entry_type: "article",
        title: "Original source",
        authors_json: ["Ada Writer"],
        publication_year: "2025",
        venue: "Journal",
        doi: "10.1000/portable",
        url: "https://example.test/source",
        abstract: "Source abstract",
        metadata_source: "crossref",
        created_at: at,
        updated_at: at,
      },
    ]);
    expect(seed.tables.project_references).toEqual([
      {
        id: "link",
        reference_id: "reference",
        citation_alias: "CustomAlias",
        snapshot_json: snapshot.projectReferences[0]!.snapshot,
        created_at: at,
        updated_at: at,
      },
      {
        id: "uncited-link",
        reference_id: "uncited",
        citation_alias: "Uncited",
        snapshot_json: snapshot.projectReferences[1]!.snapshot,
        created_at: at,
        updated_at: at,
      },
    ]);
    expect(seed.tables.project_research_shares).toEqual([
      {
        id: "shared-note",
        project_id: "source-project",
        reference_id: "reference",
        resource_id: "note",
        kind: "note",
        snapshot_json: { kind: "note", body: "Explicitly shared note" },
        created_at: at,
        revoked_at: null,
      },
      {
        id: "shared-pdf",
        project_id: "source-project",
        reference_id: "reference",
        resource_id: "artifact",
        kind: "artifact",
        snapshot_json: snapshot.researchShares[1]!.content,
        created_at: at,
        revoked_at: null,
      },
      {
        id: "shared-web",
        project_id: "source-project",
        reference_id: "reference",
        resource_id: "web",
        kind: "web-snapshot",
        snapshot_json: snapshot.researchShares[2]!.content,
        created_at: at,
        revoked_at: null,
      },
      {
        id: "shared-highlight",
        project_id: "source-project",
        reference_id: "reference",
        resource_id: "highlight",
        kind: "highlight",
        snapshot_json: { kind: "highlight", page: 1, quote: "Shared quote", comment: "Shared comment" },
        created_at: at,
        revoked_at: null,
      },
    ]);
    expect(seed.tables.annotations).toEqual([
      {
        id: "annotation",
        pdf_id: "pdf",
        page: 1,
        quote: "Evidence",
        prefix: "Before",
        suffix: "After",
        comment: "Annotation note",
        rects_json: { version: 2, fragments: snapshot.annotations[0]!.fragments, updatedAt: at },
        created_at: at,
      },
    ]);
    expect(seed.tables.claims).toEqual([{ id: "claim", text: "A claim", note: "Claim note", created_at: at, updated_at: at }]);
    expect(seed.tables.claim_evidence_links).toEqual([
      { id: "evidence", claim_id: "claim", annotation_id: "annotation", relation: "supports", created_at: at },
    ]);
    const anchor = {
      start_offset: 0,
      end_offset: 6,
      excerpt: "Result",
      anchor_version: 1,
      relative_start: { blob: expect.any(String) },
      relative_end: { blob: expect.any(String) },
      quote_prefix: "",
      quote_suffix: ".\n",
      anchored_revision: 0,
      project_file_id: "section",
    };
    expect(seed.tables.passage_links).toEqual([{ id: "passage", annotation_id: "annotation", ...anchor, created_at: at }]);
    expect(seed.tables.claim_passage_links).toEqual([{ id: "claim-passage", claim_id: "claim", ...anchor, created_at: at }]);
    expect(seed.tables.manuscript_comments).toEqual([
      {
        id: "comment",
        author_id: "author",
        author_label: "Writer",
        body: "Check this",
        ...anchor,
        status: "open",
        created_at: at,
        updated_at: at,
      },
    ]);
    expect(seed.tables.publication_pdf_links).toEqual([]);
    expect(seed.tables.project_reference_pdf_links).toEqual([
      { id: "pdf-link", publication_id: "reference", pdf_id: "pdf", created_at: at },
    ]);
    expect(seed.tables.review_artifact_pins).toEqual([
      {
        path: "review/source-review/synthesis.md",
        review_id: "source-review",
        link_id: "review-link",
        publication_id: "source-publication",
        review_revision: 7,
        protocol_revision: 2,
        analysis_definition_id: "review-synthesis-report",
        analysis_definition_revision: 1,
        generator: "kirjolab-review-synthesis",
        generator_schema: "kirjolab-review-analysis-v1",
        digest: "a".repeat(64),
        published_by: "researcher@example.test",
        generated_at: at,
      },
    ]);
    const document = new Y.Doc();
    try {
      Y.applyUpdate(
        document,
        Uint8Array.from(atob(seed.workspace.yState), (char) => char.charCodeAt(0)),
      );
      expect(document.getText("source").toString()).toBe(snapshot.files[0]!.content);
      expect(document.getText("bibliography").toString()).toBe(snapshot.bibliography);
      expect(document.getText("file:section").toString()).toBe("Result.\n");
      expect(document.getText("file:review-output").toString()).toBe("# Pinned synthesis\n");
      document.getText("file:section").insert(0, "Edited: ");
      for (const table of ["passage_links", "claim_passage_links", "manuscript_comments"]) {
        const row = v.parse(
          v.object({ relative_start: v.object({ blob: v.string() }), relative_end: v.object({ blob: v.string() }) }),
          seed.tables[table]![0],
        );
        const position = (blob: string) =>
          Y.createAbsolutePositionFromRelativePosition(
            Y.decodeRelativePosition(Uint8Array.from(atob(blob), (char) => char.charCodeAt(0))),
            document,
          );
        const start = position(row.relative_start.blob);
        const end = position(row.relative_end.blob);
        expect(start?.type).toBe(document.getText("file:section"));
        expect(end?.type).toBe(start?.type);
        expect(start?.index).toBe(8);
        expect(end?.index).toBe(14);
      }
    } finally {
      document.destroy();
    }
  });
  it("remaps files, entry and comment anchors together while preserving aliases and author provenance", () => {
    const { source: _source, candidates: _candidates, composition: _composition, ...snapshot } = projectArchiveFixture();
    let next = 0;
    const result = remapProjectArchive(
      parseProjectArchiveState(snapshot),
      "destination",
      new Map([["reference", "matched"]]),
      new Map(),
      () => `new-${++next}`,
    );
    expect(result.id).toBe("destination");
    expect(result.files[0]!.id).toBe(result.entryFileId);
    expect(result.comments[0]!.anchor.fileId).toBe(result.files[1]!.id);
    expect(result.comments[0]!.authorId).toBe("author");
    expect(result.projectReferences[0]!.snapshot.referenceId).toBe("matched");
    expect(result.projectReferences[0]!.citationAlias).toBe("CustomAlias");
    expect(projectArchiveRevisionSeed(result)).not.toContain('"relative_start":null');
  });

  it("keeps stale anchors stale and refuses unstored binary pointers", () => {
    const { source: _source, candidates: _candidates, composition: _composition, ...snapshot } = projectArchiveFixture();
    const state = parseProjectArchiveState(snapshot);
    state.comments[0]!.resolution = { status: "stale" };
    expect(projectArchiveRevisionSeed(state)).toContain('"relative_start":null');
    state.pdfs = [
      {
        id: "pdf",
        name: "paper.pdf",
        contentType: "application/pdf",
        size: 9,
        fingerprint: "source",
        objectKey: "payloads/0.bin",
        createdAt: snapshot.files[0]!.createdAt,
      },
    ];
    expect(() => remapProjectArchive(state, "new", new Map(), new Map())).toThrow("Project binary was not stored");
  });
  it("remaps every evidence endpoint and shared binary pointer while retaining review provenance", async () => {
    const { snapshot, binaries } = projectArchiveResearchFixture();
    const archive = await inspectProjectArchive(await buildProjectArchive(snapshot, binaries));
    if (archive.kind !== "native") throw new Error("Expected native archive");
    const keys = new Map(projectArchiveBinaryKeys(archive.project).map((key) => [key, { objectKey: `stored/${key}`, fingerprint: "new" }]));
    const result = remapProjectArchive(archive.project, "destination", new Map([["reference", "matched"]]), keys);
    expect(result.claimEvidenceLinks[0]).toMatchObject({ claimId: result.claims[0]!.id, annotationId: result.annotations[0]!.id });
    expect(result.publicationPdfLinks[0]).toMatchObject({ publicationId: "matched", pdfId: result.pdfs[0]!.id });
    expect(result.annotations[0]!.pdfId).toBe(result.pdfs[0]!.id);
    expect(result.annotations[0]!.fragments[0]!.id).not.toBe("fragment");
    expect(JSON.parse(projectArchiveIdentityProvenance(archive.project, result))).toContainEqual(["reference", "reference", "matched"]);
    expect(JSON.parse(projectArchiveIdentityProvenance(archive.project, result))).toContainEqual(["files", "entry", result.entryFileId]);
    expect(result.reviewArtifactPins).toEqual(snapshot.reviewArtifactPins);
    expect(projectArchiveRevisionSeed(result)).toContain("Explicitly shared note");
    const replacements = new Map(projectArchiveBinaryKeys(result).map((key) => [key, { objectKey: `final/${key}`, fingerprint: "final" }]));
    const stored = replaceProjectArchiveBinaries(result, replacements);
    expect(stored.pdfs[0]!.id).toBe(result.pdfs[0]!.id);
    expect(stored.pdfs[0]!.objectKey).toMatch(/^final\//u);
    expect(() => replaceProjectArchiveBinaries(result, new Map())).toThrow("Project binary was not stored");
  });
  it("creates fresh identities for every resource while keeping all endpoints consistent", () => {
    const { snapshot } = projectArchiveResearchFixture();
    const { source: _source, candidates: _candidates, composition: _composition, ...state } = snapshot;
    const original = parseProjectArchiveState(state);
    const keys = new Map([
      ["old/image", { objectKey: "destination/image", fingerprint: "image-hash" }],
      ["old/pdf", { objectKey: "destination/pdf", fingerprint: "pdf-hash" }],
      ["old/shared-pdf", { objectKey: "destination/shared", fingerprint: "shared-hash" }],
      ["old/web", { objectKey: "destination/raw", fingerprint: "raw-hash" }],
      ["old/readable", { objectKey: "destination/readable", fingerprint: "readable-hash" }],
    ]);
    let next = 0;
    const imported = remapProjectArchive(
      original,
      "destination",
      new Map([["reference", "existing-reference"]]),
      keys,
      () => `fresh-${++next}`,
    );
    const expectedProvenance: string[][] = [];
    for (const kind of [
      "files",
      "folders",
      "assets",
      "pdfs",
      "publications",
      "projectReferences",
      "researchShares",
      "annotations",
      "links",
      "claims",
      "claimEvidenceLinks",
      "claimLinks",
      "comments",
      "publicationPdfLinks",
    ] as const) {
      expect(imported[kind]).toHaveLength(original[kind].length);
      for (const [index, resource] of original[kind].entries()) {
        const newId = imported[kind][index]!.id;
        expect(newId).not.toBe(resource.id);
        expectedProvenance.push([kind, resource.id, newId]);
      }
    }
    const uncited = imported.projectReferences[1]!.referenceId;
    expect(uncited).not.toBe("uncited");
    expect(imported.projectReferences.map(({ snapshot }) => snapshot.referenceId)).toEqual(["existing-reference", uncited]);
    expect(imported.revision).toBe(0);
    expect(imported.entryFileId).toBe(imported.files[0]!.id);
    expect(imported.assets[0]).toMatchObject({ objectKey: "destination/image", fingerprint: "image-hash" });
    expect(imported.pdfs[0]).toMatchObject({ objectKey: "destination/pdf", fingerprint: "pdf-hash" });
    expect(imported.links[0]!.annotationId).toBe(imported.annotations[0]!.id);
    expect(imported.claimLinks[0]!.claimId).toBe(imported.claims[0]!.id);
    for (const anchored of [imported.comments[0]!, imported.links[0]!, imported.claimLinks[0]!]) {
      expect(anchored.anchor).toEqual({
        version: 1,
        fileId: imported.files[1]!.id,
        relativeStart: null,
        relativeEnd: null,
        exact: "Result",
        prefix: "",
        suffix: ".\n",
        originalRange: { start: 0, end: 6 },
        anchoredRevision: 0,
      });
    }
    expect(imported.researchShares.every((share) => share.projectId === "destination" && share.referenceId === "existing-reference")).toBe(
      true,
    );
    expect(imported.researchShares.map(({ resourceId }) => resourceId)).not.toEqual(["note", "artifact", "web", "highlight"]);
    expect(imported.researchShares[1]!.content).toEqual({
      kind: "artifact",
      name: "shared.pdf",
      size: snapshot.pdfs[0]!.size,
      objectKey: "destination/shared",
      fingerprint: "shared-hash",
    });
    expect(imported.researchShares[2]!.content).toMatchObject({
      rawObjectKey: "destination/raw",
      readableObjectKey: "destination/readable",
    });
    expectedProvenance.push(["reference", "reference", "existing-reference"], ["reference", "uncited", uncited]);
    expectedProvenance.push(["fragment", "fragment", imported.annotations[0]!.fragments[0]!.id]);
    expect(JSON.parse(projectArchiveIdentityProvenance(original, imported))).toEqual(expectedProvenance);
    const stored = replaceProjectArchiveBinaries(
      imported,
      new Map([
        ["destination/image", { objectKey: "final/image", fingerprint: "final-image" }],
        ["destination/pdf", { objectKey: "final/pdf", fingerprint: "final-pdf" }],
        ["destination/shared", { objectKey: "final/shared", fingerprint: "final-shared" }],
        ["destination/raw", { objectKey: "final/raw", fingerprint: "final-raw" }],
        ["destination/readable", { objectKey: "final/readable", fingerprint: "final-readable" }],
      ]),
    );
    expect(stored.assets[0]).toMatchObject({ objectKey: "final/image", fingerprint: "final-image" });
    expect(stored.pdfs[0]).toMatchObject({ objectKey: "final/pdf", fingerprint: "final-pdf" });
    expect(stored.researchShares[1]!.content).toMatchObject({ objectKey: "final/shared", fingerprint: "final-shared" });
    expect(stored.researchShares[2]!.content).toMatchObject({ rawObjectKey: "final/raw", readableObjectKey: "final/readable" });
    expect(stored.researchShares[0]).toEqual(imported.researchShares[0]);
    expect(stored.researchShares[3]).toEqual(imported.researchShares[3]);
  });
  it("uses the selected entry file for source and preserves other files in the CRDT", () => {
    const { source: _source, candidates: _candidates, composition: _composition, ...snapshot } = projectArchiveFixture();
    snapshot.entryFileId = "section";
    const seed: { workspace: { source: string; entryFileId: string; yState: string }; tables: Record<string, unknown[]> } = JSON.parse(
      projectArchiveRevisionSeed(parseProjectArchiveState(snapshot)),
    );
    expect(seed.workspace.source).toBe("Result.\n");
    expect(seed.workspace.entryFileId).toBe("section");
    expect(seed.tables.project_files).toEqual([
      expect.objectContaining({ id: "entry", y_text_name: "file:entry" }),
      expect.objectContaining({ id: "section", y_text_name: "source" }),
    ]);
    const document = new Y.Doc();
    try {
      Y.applyUpdate(
        document,
        Uint8Array.from(atob(seed.workspace.yState), (char) => char.charCodeAt(0)),
      );
      expect(document.getText("source").toString()).toBe("Result.\n");
      expect(document.getText("file:entry").toString()).toBe(snapshot.files[0]!.content);
    } finally {
      document.destroy();
    }
  });
});
