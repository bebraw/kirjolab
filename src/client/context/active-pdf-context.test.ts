import { describe, expect, it } from "vitest";
import type { LibraryHighlight, LibraryPdfArtifact, ProjectReferencePdf } from "../../domain/reference-library";
import type { AnnotationResource, PdfResource } from "../../domain/workspace/workspace";
import { activePdfLoadContext } from "./active-pdf-context";
import type { ResearchResourceTab } from "./research-context";

const createdAt = "2026-07-27T00:00:00.000Z";
const workspacePdf: PdfResource = {
  contentType: "application/pdf",
  createdAt,
  fingerprint: "workspace-fingerprint",
  id: "workspace/pdf",
  name: "workspace.pdf",
  objectKey: "pdfs/workspace.pdf",
  size: 1024,
};
const libraryPdf: LibraryPdfArtifact = {
  contentType: "application/pdf",
  createdAt,
  fingerprint: "library-fingerprint",
  id: "library/pdf",
  name: "library.pdf",
  objectKey: "library/library.pdf",
  referenceId: "reference:1",
  rights: "private",
  size: 2048,
};
const referencePdf: ProjectReferencePdf = {
  fingerprint: "reference-fingerprint",
  id: "reference/pdf",
  name: "reference.pdf",
  referenceId: "reference:1",
  size: 4096,
};
const annotation: AnnotationResource = {
  comment: "Working note",
  createdAt,
  fragments: [],
  id: "annotation:1",
  page: 2,
  pdfId: workspacePdf.id,
  prefix: "Before",
  quote: "Evidence",
  rects: [],
  suffix: "After",
  updatedAt: createdAt,
};
const highlight: LibraryHighlight = {
  artifactId: libraryPdf.id,
  comment: "Interpretation",
  createdAt,
  id: "highlight:1",
  page: 3,
  quote: "Private evidence",
  rects: [],
  referenceId: "reference:1",
  updatedAt: createdAt,
};
const unrelatedAnnotation: AnnotationResource = {
  ...annotation,
  id: "annotation:unrelated",
  pdfId: "workspace:unrelated",
};
const unrelatedHighlight: LibraryHighlight = {
  ...highlight,
  artifactId: "library:unrelated",
  id: "highlight:unrelated",
};
const unrelatedReferencePdf: ProjectReferencePdf = {
  ...referencePdf,
  id: "reference:unrelated",
};

function tab(kind: "pdf" | "library-pdf", id: string): Extract<ResearchResourceTab, { kind: "pdf" | "library-pdf" }> {
  return { focusedAnnotationId: null, id, key: `${kind}:${id}`, kind, page: 1, scrollTop: 0 };
}

function context(activeTab: ResearchResourceTab | undefined) {
  return activePdfLoadContext({
    activeTab,
    annotations: [unrelatedAnnotation, annotation],
    apiBase: "/api/workspaces/workspace:1",
    libraryArtifacts: [libraryPdf],
    libraryHighlights: [unrelatedHighlight, highlight],
    projectReferencePdfs: [unrelatedReferencePdf, referencePdf],
    workspacePdfs: [workspacePdf],
  });
}

describe("active PDF context", () => {
  it("rejects inactive and missing PDF resources", () => {
    expect(context(undefined)).toBeNull();
    expect(context({ id: "publication:1", key: "publication:publication:1", kind: "publication", scrollTop: 0 })).toBeNull();
    expect(context(tab("pdf", "missing"))).toBeNull();
    expect(context(tab("pdf", referencePdf.id))).toBeNull();
  });

  it("keeps workspace and library resource namespaces isolated", () => {
    const collidingLibraryPdf = { ...libraryPdf, id: workspacePdf.id };
    const collidingWorkspacePdf = { ...workspacePdf, id: libraryPdf.id };

    expect(
      activePdfLoadContext({
        activeTab: tab("pdf", workspacePdf.id),
        annotations: [],
        apiBase: "/api/workspaces/workspace:1",
        libraryArtifacts: [collidingLibraryPdf],
        libraryHighlights: [],
        projectReferencePdfs: [],
        workspacePdfs: [workspacePdf],
      }),
    ).toMatchObject({ libraryPdf: undefined, workspacePdf });
    expect(
      activePdfLoadContext({
        activeTab: tab("library-pdf", libraryPdf.id),
        annotations: [],
        apiBase: "/api/workspaces/workspace:1",
        libraryArtifacts: [libraryPdf],
        libraryHighlights: [],
        projectReferencePdfs: [],
        workspacePdfs: [collidingWorkspacePdf],
      }),
    ).toMatchObject({ libraryPdf, workspacePdf: undefined });
  });

  it("projects workspace evidence and an encoded URL", () => {
    expect(context(tab("pdf", workspacePdf.id))).toEqual({
      annotations: [annotation],
      libraryPdf: undefined,
      privateHighlights: [],
      tab: tab("pdf", workspacePdf.id),
      url: "/api/workspaces/workspace:1/pdfs/workspace%2Fpdf",
      workspacePdf,
    });
  });

  it("projects private highlights before a shared reference PDF", () => {
    expect(context(tab("library-pdf", libraryPdf.id))).toMatchObject({
      annotations: [],
      libraryPdf,
      privateHighlights: [highlight],
      url: "/api/library/pdfs/library%2Fpdf",
      workspacePdf: undefined,
    });
  });

  it("projects an authorized shared reference PDF", () => {
    expect(context(tab("library-pdf", referencePdf.id))).toMatchObject({
      annotations: [],
      libraryPdf: undefined,
      privateHighlights: [],
      url: "/api/workspaces/workspace:1/reference-pdfs/reference%2Fpdf",
      workspacePdf: undefined,
    });
  });
});
