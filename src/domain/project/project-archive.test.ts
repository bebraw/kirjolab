import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { projectArchiveFixture, projectArchiveResearchFixture } from "../../test-support/project-archive";
import { buildProjectArchive, inspectProjectArchive } from "./project-archive";

describe("native project archives", () => {
  it("round-trips exact files, entry, folders, settings and uncited reference aliases", async () => {
    const source = projectArchiveFixture();
    const bytes = await buildProjectArchive(source, new Map());
    const archive = await inspectProjectArchive(bytes);
    expect(archive.kind).toBe("native");
    if (archive.kind !== "native") throw new Error("Expected native archive");
    expect(archive.project.files).toEqual(source.files);
    expect(archive.project.entryFileId).toBe("entry");
    expect(archive.project.folders).toEqual(source.folders);
    expect(archive.project.publicationProfile.citationStyle).toBe("ieee");
    expect(archive.project.projectReferences.map(({ citationAlias }) => citationAlias)).toEqual(["CustomAlias", "Uncited"]);
    expect(archive.project.comments[0]?.resolution).toEqual(source.comments[0]?.resolution);
    expect(archive.summary.exclusions).toContain("Revision history and milestones");
    expect(archive.summary.files).toBe(2);
  });
  it("preserves the full evidence graph and shared snapshots with exact binary bytes", async () => {
    const { snapshot, binaries } = projectArchiveResearchFixture();
    const result = await inspectProjectArchive(await buildProjectArchive(snapshot, binaries));
    if (result.kind !== "native") throw new Error("Expected native archive");
    for (const field of ["annotations", "links", "claims", "claimEvidenceLinks", "claimLinks", "comments", "reviewArtifactPins"] as const)
      expect(result.project[field]).toEqual(snapshot[field]);
    const pdf = result.project.pdfs[0]!;
    expect(result.payloads.get(pdf.objectKey)).toEqual(binaries.get("old/pdf"));
    expect(result.project.researchShares.find(({ kind }) => kind === "note")?.content).toEqual({
      kind: "note",
      body: "Explicitly shared note",
    });
  });
  it("rejects conflicting paths, duplicate relationships, unsafe images and malformed annotation coordinates", async () => {
    const { snapshot, binaries } = projectArchiveResearchFixture();
    snapshot.claimEvidenceLinks.push({ ...snapshot.claimEvidenceLinks[0]!, id: "duplicate" });
    await expect(buildProjectArchive(snapshot, binaries)).rejects.toThrow(/Duplicate project relationships/u);
    snapshot.claimEvidenceLinks.pop();
    snapshot.files[1] = { ...snapshot.files[1]!, path: "paper.md/nested.md" };
    await expect(buildProjectArchive(snapshot, binaries)).rejects.toThrow(/nest beneath a file/u);
    snapshot.files[1] = { ...snapshot.files[1]!, path: "sections/result.md" };
    snapshot.annotations[0]!.rects[0]!.width = -1;
    await expect(buildProjectArchive(snapshot, binaries)).rejects.toThrow(/metadata/u);
    snapshot.annotations[0]!.rects[0]!.width = 0.3;
    binaries.set("old/image", new Uint8Array(snapshot.assets[0]!.size));
    await expect(buildProjectArchive(snapshot, binaries)).rejects.toThrow(/image/u);
  });
  it("rejects non-PDF bytes in explicitly shared PDF artifacts", async () => {
    const { snapshot, binaries } = projectArchiveResearchFixture();
    const html = strToU8("<html><script>alert('unexpected')</script></html>");
    snapshot.researchShares = snapshot.researchShares.map((share) =>
      share.content.kind === "artifact" ? { ...share, content: { ...share.content, size: html.length } } : share,
    );
    binaries.set("old/shared-pdf", html);
    await expect(buildProjectArchive(snapshot, binaries)).rejects.toThrow(/PDF signature/u);
  });

  it("preserves stale anchors for deleted files and removes revoked binary access", async () => {
    const { snapshot, binaries } = projectArchiveResearchFixture();
    snapshot.comments[0] = {
      ...snapshot.comments[0]!,
      anchor: { ...snapshot.comments[0]!.anchor, fileId: "removed-file" },
      resolution: { status: "stale" },
    };
    snapshot.researchShares = snapshot.researchShares.map((share) =>
      share.kind === "artifact" ? { ...share, revokedAt: snapshot.files[0]!.createdAt } : share,
    );
    const result = await inspectProjectArchive(await buildProjectArchive(snapshot, binaries));
    if (result.kind !== "native") throw new Error("Expected native archive");
    expect(result.project.comments[0]!.resolution).toEqual({ status: "stale" });
    expect(result.project.researchShares.find(({ kind }) => kind === "artifact")?.content).toMatchObject({ objectKey: "" });
  });

  it("detects metadata tampering before any import can occur", async () => {
    const entries = unzipSync(await buildProjectArchive(projectArchiveFixture(), new Map()));
    entries["project.json"] = strToU8("{}");
    await expect(inspectProjectArchive(zipSync(entries))).rejects.toThrow(/digest|integrity/iu);
  });

  it("rejects missing binary payloads and preserves only portable pointers", async () => {
    const source = projectArchiveFixture();
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    source.assets = [
      {
        id: "image",
        path: "figures/chart.png",
        mediaType: "image/png",
        size: bytes.length,
        objectKey: "private/source-key",
        fingerprint: "old",
        createdAt: source.files[0]!.createdAt,
        updatedAt: source.files[0]!.updatedAt,
      },
    ];
    await expect(buildProjectArchive(source, new Map())).rejects.toThrow(/unavailable|missing/iu);
    const zip = await buildProjectArchive(source, new Map([["private/source-key", bytes]]));
    const entries = unzipSync(zip);
    expect(new TextDecoder().decode(entries["project.json"])).not.toContain("private/source-key");
    const result = await inspectProjectArchive(zip);
    if (result.kind !== "native") throw new Error("Expected native archive");
    const pointer = result.project.assets[0]!.objectKey;
    expect(result.payloads.get(pointer)).toEqual(bytes);
    delete entries[pointer];
    await expect(inspectProjectArchive(zipSync(entries))).rejects.toThrow(/missing|payload/iu);
  });

  it("rejects broken evidence graphs and duplicate citation aliases", async () => {
    const source = projectArchiveFixture();
    source.claimEvidenceLinks = [
      { id: "broken", claimId: "missing", annotationId: "missing", relation: "supports", createdAt: source.files[0]!.createdAt },
    ];
    await expect(buildProjectArchive(source, new Map())).rejects.toThrow(/relationship|claim/iu);
    source.claimEvidenceLinks = [];
    source.projectReferences[1]!.citationAlias = "customalias";
    await expect(buildProjectArchive(source, new Map())).rejects.toThrow(/alias|duplicate/iu);
  });

  it("identifies legacy source archives without offering lossless confirmation", async () => {
    const archive = await inspectProjectArchive(
      zipSync({ "project/paper.md": strToU8("Paper"), "project/project-snapshot.json": strToU8("{}") }),
    );
    expect(archive.kind).toBe("legacy");
    expect(archive.summary.exclusions.join(" ")).toMatch(/PDF|history/iu);
  });

  it("rejects traversal and archives outside the compressed size limit", async () => {
    await expect(inspectProjectArchive(zipSync({ "../project.json": strToU8("{}") }))).rejects.toThrow(/path/iu);
    await expect(inspectProjectArchive(new Uint8Array(20 * 1024 * 1024 + 1))).rejects.toThrow(/20 MiB|size/iu);
    await expect(inspectProjectArchive(zipSync({ "payloads/0.bin": new Uint8Array(20 * 1024 * 1024 + 1) }))).rejects.toThrow(
      /Expanded Project archive/u,
    );
  });

  it("rejects exports whose required payloads exceed the import entry limit", async () => {
    const { snapshot, binaries } = projectArchiveResearchFixture();
    const web = snapshot.researchShares.find(({ kind }) => kind === "web-snapshot")!;
    snapshot.researchShares = Array.from({ length: 512 }, (_, index) => ({
      ...web,
      id: `share-${index}`,
      resourceId: `web-${index}`,
    }));
    await expect(async () => {
      await buildProjectArchive(snapshot, binaries);
    }).rejects.toThrow(/1,024 entries/u);
  });
});
