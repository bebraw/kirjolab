import { describe, expect, it } from "vitest";
import { workspaceSnapshotFixture } from "../../test-support/workspace-fixture";
import type { ProjectReferencePdf } from "../../domain/reference-library";
import type { PdfResource, PublicationResource } from "../../domain/workspace/workspace";
import { relatedPaperGroups } from "./pdf-related-papers";

const publication: PublicationResource = {
  abstract: "",
  authors: [],
  citationKey: "Study2026",
  createdAt: "created",
  doi: "",
  id: "reference:1",
  metadataSource: "bibtex",
  title: "The study",
  type: "article",
  updatedAt: "updated",
  url: "",
  venue: "",
  year: "2026",
};
const projectPdf: PdfResource = {
  id: "pdf:1",
  name: "Draft.pdf",
  contentType: "application/pdf",
  size: 100,
  objectKey: "project/draft.pdf",
  fingerprint: "draft",
  createdAt: "created",
};
const linkedPdf: ProjectReferencePdf = {
  id: "library:1",
  referenceId: publication.id,
  name: "Appendix.pdf",
  size: 200,
  fingerprint: "appendix",
};
const snapshot = {
  ...workspaceSnapshotFixture,
  pdfs: [projectPdf],
  publications: [publication],
  projectReferences: [
    {
      id: "project-reference:1",
      referenceId: publication.id,
      citationAlias: publication.citationKey,
      snapshot: {
        referenceId: publication.id,
        title: publication.title,
        authors: [],
        year: publication.year,
        venue: "",
        type: publication.type,
        doi: "",
        url: "",
        webSnapshot: null,
        tombstone: false,
        capturedAt: "created",
      },
      createdAt: "created",
      updatedAt: "updated",
    },
  ],
  publicationPdfLinks: [{ id: "pdf-link:1", publicationId: publication.id, pdfId: projectPdf.id, createdAt: "created" }],
};
const tab = (kind: "pdf" | "library-pdf", id: string) =>
  ({ kind, id, key: `${kind}:${id}`, page: 1, scrollTop: 0, focusedAnnotationId: null }) as const;

describe("related PDF choices", () => {
  it("offers linked-reference PDFs while reading a project PDF, excluding the active PDF", () => {
    expect(relatedPaperGroups(tab("pdf", projectPdf.id), snapshot, [linkedPdf], null)).toEqual([
      { referenceId: publication.id, referenceTitle: publication.title, papers: [{ kind: "reference", pdf: linkedPdf }] },
    ]);
  });

  it("offers project PDFs while reading a linked-reference PDF", () => {
    expect(relatedPaperGroups(tab("library-pdf", linkedPdf.id), snapshot, [linkedPdf], null)).toEqual([
      {
        referenceId: publication.id,
        referenceTitle: publication.title,
        papers: [{ kind: "project", pdf: projectPdf, linkId: "pdf-link:1" }],
      },
    ]);
  });

  it("omits unrelated private PDFs and references without an alternative", () => {
    expect(relatedPaperGroups(tab("library-pdf", "unrelated"), snapshot, [linkedPdf], null)).toEqual([]);
    expect(relatedPaperGroups(tab("pdf", projectPdf.id), snapshot, [], null)).toEqual([]);
  });
});
