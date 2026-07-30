import type { LibraryHighlight, LibraryPdfArtifact, ProjectReferencePdf } from "../../domain/reference-library";
import type { AnnotationResource, PdfResource } from "../../domain/workspace/workspace";
import type { PdfEvidenceViewer } from "../pdf/pdf-viewer";
import type { PdfOutlineItem } from "../pdf/pdf-navigation-panel";
import type { PdfSearchResult } from "../pdf/pdf-search-panel";
import { activePdfLoadContext } from "./active-pdf-context";
import type { ResearchContextTab, ResearchResourceTab } from "./research-context";

export interface ContextViewerState {
  readonly focusedAnnotationId: string | null;
  readonly page: number;
  readonly renderedContextKey: ResearchContextTab["key"] | undefined;
}

export type ContextPdfViewer = Pick<
  PdfEvidenceViewer,
  "clearDraftSelection" | "resize" | "setPrivateHighlightSelection" | "setTextSelectionMode" | "setTool"
> &
  Pick<
    PdfEvidenceViewer,
    "currentPage" | "focusedAnnotationId" | "open" | "showError" | "updateAnnotations" | "updatePrivateHighlights"
  > & {
    goToPage?(page: number): Promise<void>;
    readonly documentKey?: string;
    navigation?(): Promise<{ readonly outline: readonly PdfOutlineItem[]; readonly pages: number }>;
    search?(query: string): Promise<readonly PdfSearchResult[]>;
    thumbnail?(page: number): Promise<string>;
  };

export interface PdfContextSessionSources {
  readonly activeTab: ResearchResourceTab | undefined;
  readonly annotations: readonly AnnotationResource[];
  readonly libraryArtifacts: readonly LibraryPdfArtifact[];
  readonly libraryHighlights: readonly LibraryHighlight[];
  readonly projectReferencePdfs: readonly ProjectReferencePdf[];
  readonly workspacePdfs: readonly PdfResource[];
}

interface PdfContextSessionPorts {
  readonly activeKey: () => ResearchResourceTab["key"] | undefined;
  readonly navigationDocument: (key: ResearchContextTab["key"], page: number) => void;
  readonly reader: () => { scrollTop: number } | null;
  readonly selectWorkspacePdf: (pdfId: string) => void;
}

export class PdfContextSession {
  readonly #ports: PdfContextSessionPorts;
  #apiBase = "";
  #currentWorkspacePdfId: string | undefined;
  #renderedContextKey: ResearchContextTab["key"] | undefined;
  #viewer: ContextPdfViewer | null = null;

  constructor(ports: PdfContextSessionPorts) {
    this.#ports = ports;
  }

  bind(apiBase: string, viewer: ContextPdfViewer): void {
    this.#apiBase = apiBase;
    this.#viewer = viewer;
    this.#currentWorkspacePdfId = undefined;
    this.#renderedContextKey = undefined;
  }

  get viewer(): ContextPdfViewer | null {
    return this.#viewer;
  }

  get layoutViewer(): Pick<ContextPdfViewer, "resize"> | null {
    return this.#viewer;
  }

  get currentWorkspacePdfId(): string | undefined {
    return this.#currentWorkspacePdfId;
  }

  viewerState(): ContextViewerState | null {
    const viewer = this.#viewer;
    return viewer
      ? {
          focusedAnnotationId: viewer.focusedAnnotationId,
          page: viewer.currentPage,
          renderedContextKey: this.#renderedContextKey,
        }
      : null;
  }

  async load(sources: PdfContextSessionSources, force: boolean): Promise<void> {
    const viewer = this.#viewer;
    if (!viewer) return;
    const context = activePdfLoadContext({ ...sources, apiBase: this.#apiBase });
    if (!context) return;
    if (context.workspacePdf) this.#ports.selectWorkspacePdf(context.workspacePdf.id);
    viewer.updateAnnotations(context.annotations);
    viewer.updatePrivateHighlights(context.privateHighlights);
    const reader = this.#ports.reader();
    if (!force && this.#renderedContextKey === context.tab.key) {
      if (reader) reader.scrollTop = context.tab.scrollTop;
      return;
    }
    try {
      const opened = await viewer.open({
        ...(context.libraryPdf ? { artifactId: context.libraryPdf.id } : {}),
        documentKey: context.tab.key,
        url: context.url,
        annotations: context.annotations,
        page: context.tab.page,
        ...(context.tab.focusedAnnotationId ? { focusAnnotationId: context.tab.focusedAnnotationId } : {}),
        mode: context.workspacePdf ? "evidence" : context.libraryPdf ? "private-highlight" : "read-only",
        privateHighlights: context.privateHighlights,
      });
      if (!opened || this.#ports.activeKey() !== context.tab.key) return;
      this.#renderedContextKey = context.tab.key;
      this.#ports.navigationDocument(context.tab.key, viewer.currentPage);
      this.#currentWorkspacePdfId = context.workspacePdf?.id;
      if (reader) reader.scrollTop = context.tab.scrollTop;
    } catch (error) {
      if (this.#ports.activeKey() === context.tab.key) viewer.showError(error);
    }
  }
}
