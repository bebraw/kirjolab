import { defaultProjectPublicationProfile, type WorkspaceSnapshot } from "../domain/workspace/workspace";
import { createEvidencePdf } from "./pdf-fixture";

export function projectArchiveFixture(): WorkspaceSnapshot {
  const at = "2026-10-01T10:00:00.000Z";
  return {
    id: "source-project",
    title: "Portable paper",
    entryFileId: "entry",
    revision: 7,
    files: [
      {
        id: "entry",
        path: "paper.md",
        mediaType: "text/markdown",
        content: "# Paper\n\nEvidence :cite[CustomAlias].\n::include[sections/result.md]\n::bibliography[]\n",
        createdAt: at,
        updatedAt: at,
      },
      { id: "section", path: "sections/result.md", mediaType: "text/markdown", content: "Result.\n", createdAt: at, updatedAt: at },
    ],
    folders: [
      { id: "empty", path: "empty", createdAt: at, updatedAt: at },
      { id: "sections", path: "sections", createdAt: at, updatedAt: at },
    ],
    assets: [],
    pdfs: [],
    publications: [],
    publicationPdfLinks: [],
    composition: { content: "", sourceMap: [], diagnostics: [], dependencies: {} },
    source: "",
    bibliography:
      "@misc{CustomAlias,\n  title = {Pinned source},\n  author = {Writer, Ada},\n  year = {2026},\n  doi = {10.1000/portable}\n}\n\n@misc{Uncited,\n  title = {Uncited source}\n}\n",
    publicationProfile: { ...defaultProjectPublicationProfile, citationStyle: "ieee" },
    projectReferences: [
      {
        id: "link",
        referenceId: "reference",
        citationAlias: "CustomAlias",
        snapshot: {
          referenceId: "reference",
          type: "manual",
          title: "Pinned source",
          authors: ["Writer, Ada"],
          year: "2026",
          venue: "",
          doi: "10.1000/portable",
          url: "",
          capturedAt: at,
          tombstone: false,
          webSnapshot: null,
        },
        createdAt: at,
        updatedAt: at,
      },
      {
        id: "uncited-link",
        referenceId: "uncited",
        citationAlias: "Uncited",
        snapshot: {
          referenceId: "uncited",
          type: "manual",
          title: "Uncited source",
          authors: [],
          year: "",
          venue: "",
          doi: "",
          url: "",
          capturedAt: at,
          tombstone: false,
          webSnapshot: null,
        },
        createdAt: at,
        updatedAt: at,
      },
    ],
    researchShares: [],
    annotations: [],
    links: [],
    claims: [],
    claimEvidenceLinks: [],
    claimLinks: [],
    candidates: [],
    reviewArtifactPins: [],
    comments: [
      {
        id: "comment",
        authorId: "author",
        authorLabel: "Writer",
        body: "Check this",
        status: "open",
        createdAt: at,
        updatedAt: at,
        anchor: {
          version: 1,
          fileId: "section",
          relativeStart: null,
          relativeEnd: null,
          exact: "Result",
          prefix: "",
          suffix: ".\n",
          originalRange: { start: 0, end: 6 },
          anchoredRevision: 7,
        },
        resolution: { status: "resolved", start: 0, end: 6, text: "Result", exactMatch: true },
      },
    ],
  };
}

export function projectArchiveResearchFixture(): { snapshot: WorkspaceSnapshot; binaries: Map<string, Uint8Array> } {
  const snapshot = projectArchiveFixture();
  const at = snapshot.files[0]!.createdAt;
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
    (value) => value.charCodeAt(0),
  );
  const pdf = new Uint8Array(createEvidencePdf("Evidence"));
  const html = new TextEncoder().encode("<h1>Captured web research</h1>");
  snapshot.assets = [
    {
      id: "figure",
      path: "figures/result.png",
      mediaType: "image/png",
      size: png.length,
      objectKey: "old/image",
      fingerprint: "old",
      createdAt: at,
      updatedAt: at,
    },
  ];
  snapshot.folders.push({ id: "figures", path: "figures", createdAt: at, updatedAt: at });
  snapshot.pdfs = [
    {
      id: "pdf",
      name: "source.pdf",
      contentType: "application/pdf",
      size: pdf.length,
      objectKey: "old/pdf",
      fingerprint: "old",
      createdAt: at,
    },
  ];
  snapshot.publicationPdfLinks = [{ id: "pdf-link", publicationId: "reference", pdfId: "pdf", createdAt: at }];
  const rects = [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }];
  snapshot.annotations = [
    {
      id: "annotation",
      pdfId: "pdf",
      page: 1,
      quote: "Evidence",
      prefix: "Before",
      suffix: "After",
      comment: "Annotation note",
      rects,
      fragments: [{ id: "fragment", quote: "Evidence", prefix: "Before", suffix: "After", rects, createdAt: at }],
      createdAt: at,
      updatedAt: at,
    },
  ];
  const { anchor, resolution } = snapshot.comments[0]!;
  snapshot.links = [{ id: "passage", annotationId: "annotation", anchor, resolution, createdAt: at }];
  snapshot.claims = [{ id: "claim", text: "A claim", note: "Claim note", createdAt: at, updatedAt: at }];
  snapshot.claimEvidenceLinks = [{ id: "evidence", claimId: "claim", annotationId: "annotation", relation: "supports", createdAt: at }];
  snapshot.claimLinks = [{ id: "claim-passage", claimId: "claim", anchor, resolution, createdAt: at }];
  const share = { projectId: snapshot.id, referenceId: "reference", createdAt: at, revokedAt: null };
  snapshot.researchShares = [
    { ...share, id: "shared-note", resourceId: "note", kind: "note", content: { kind: "note", body: "Explicitly shared note" } },
    {
      ...share,
      id: "shared-pdf",
      resourceId: "artifact",
      kind: "artifact",
      content: { kind: "artifact", name: "shared.pdf", size: pdf.length, objectKey: "old/shared-pdf", fingerprint: "old" },
    },
    {
      ...share,
      id: "shared-web",
      resourceId: "web",
      kind: "web-snapshot",
      content: {
        kind: "web-snapshot",
        snapshotId: "web",
        accessedAt: at,
        finalUrl: "https://example.test/paper",
        contentHash: "a".repeat(64),
        rawObjectKey: "old/web",
        readableObjectKey: "old/readable",
        complete: true,
        diagnostics: [],
      },
    },
    {
      ...share,
      id: "shared-highlight",
      resourceId: "highlight",
      kind: "highlight",
      content: { kind: "highlight", page: 1, quote: "Shared quote", comment: "Shared comment" },
    },
  ];
  snapshot.files.push({
    id: "review-output",
    path: "review/source-review/synthesis.md",
    mediaType: "text/markdown",
    content: "# Pinned synthesis\n",
    createdAt: at,
    updatedAt: at,
  });
  snapshot.reviewArtifactPins = [
    {
      path: "review/source-review/synthesis.md",
      reviewId: "source-review",
      linkId: "review-link",
      publicationId: "source-publication",
      reviewRevision: 7,
      protocolRevision: 2,
      analysisDefinitionId: "review-synthesis-report",
      analysisDefinitionRevision: 1,
      generator: "kirjolab-review-synthesis",
      generatorSchema: "kirjolab-review-analysis-v1",
      digest: "a".repeat(64),
      publishedBy: "researcher@example.test",
      generatedAt: at,
    },
  ];
  return {
    snapshot,
    binaries: new Map([
      ["old/image", png],
      ["old/pdf", pdf],
      ["old/shared-pdf", pdf],
      ["old/web", html],
      ["old/readable", new TextEncoder().encode("Captured web research")],
    ]),
  };
}
