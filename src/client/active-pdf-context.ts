import type { LibraryHighlight, LibraryPdfArtifact, ProjectReferencePdf } from "../domain/reference-library";
import type { AnnotationResource, PdfResource } from "../domain/workspace";
import type { ResearchResourceTab } from "./research-context";

export interface ActivePdfLoadContext {
  readonly tab: Extract<ResearchResourceTab, { kind: "pdf" | "library-pdf" }>;
  readonly workspacePdf: PdfResource | undefined;
  readonly libraryPdf: LibraryPdfArtifact | undefined;
  readonly annotations: AnnotationResource[];
  readonly privateHighlights: LibraryHighlight[];
  readonly url: string;
}

interface ActivePdfContextSources {
  readonly activeTab: ResearchResourceTab | undefined;
  readonly annotations: readonly AnnotationResource[];
  readonly apiBase: string;
  readonly libraryArtifacts: readonly LibraryPdfArtifact[];
  readonly libraryHighlights: readonly LibraryHighlight[];
  readonly projectReferencePdfs: readonly ProjectReferencePdf[];
  readonly workspacePdfs: readonly PdfResource[];
}

export function activePdfLoadContext(sources: ActivePdfContextSources): ActivePdfLoadContext | null {
  const tab = sources.activeTab;
  if (tab?.kind !== "pdf" && tab?.kind !== "library-pdf") return null;

  const workspacePdf = tab.kind === "pdf" ? sources.workspacePdfs.find(({ id }) => id === tab.id) : undefined;
  const libraryPdf = tab.kind === "library-pdf" ? sources.libraryArtifacts.find(({ id }) => id === tab.id) : undefined;
  const referencePdf = tab.kind === "library-pdf" && !libraryPdf ? sources.projectReferencePdfs.find(({ id }) => id === tab.id) : undefined;
  const url = workspacePdf
    ? `${sources.apiBase}/pdfs/${encodeURIComponent(workspacePdf.id)}`
    : libraryPdf
      ? `/api/library/pdfs/${encodeURIComponent(libraryPdf.id)}`
      : referencePdf
        ? `${sources.apiBase}/reference-pdfs/${encodeURIComponent(referencePdf.id)}`
        : null;
  if (!url) return null;

  return {
    annotations: workspacePdf ? sources.annotations.filter(({ pdfId }) => pdfId === workspacePdf.id) : [],
    libraryPdf,
    privateHighlights: libraryPdf ? sources.libraryHighlights.filter(({ artifactId }) => artifactId === libraryPdf.id) : [],
    tab,
    url,
    workspacePdf,
  };
}
