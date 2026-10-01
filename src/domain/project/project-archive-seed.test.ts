import { describe, expect, it } from "vitest";
import { projectArchiveFixture, projectArchiveResearchFixture } from "../../test-support/project-archive";
import { buildProjectArchive, inspectProjectArchive, parseProjectArchiveState, projectArchiveBinaryKeys } from "./project-archive";
import {
  projectArchiveIdentityProvenance,
  projectArchiveRevisionSeed,
  remapProjectArchive,
  replaceProjectArchiveBinaries,
} from "./project-archive-seed";

describe("native project identity remapping", () => {
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
});
