import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist";
import type { AnnotationResource, PdfSelectionRect } from "../domain/workspace";
import { deriveTextQuoteContext, normalizeSelectionRects } from "./pdf-selection";

GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

export interface PdfSelectionCapture {
  page: number;
  quote: string;
  prefix: string;
  suffix: string;
  rects: PdfSelectionRect[];
}

interface PdfViewerElements {
  canvas: HTMLCanvasElement;
  page: HTMLElement;
  textLayer: HTMLElement;
  highlights: HTMLElement;
  pageIndicator: HTMLElement;
  previousPage: HTMLButtonElement;
  nextPage: HTMLButtonElement;
  status: HTMLElement;
}

interface OpenPdfOptions {
  url: string;
  annotations: AnnotationResource[];
  page?: number;
  focusAnnotationId?: string;
}

export class PdfEvidenceViewer {
  readonly #elements: PdfViewerElements;
  readonly #onSelection: (capture: PdfSelectionCapture) => void;
  readonly #onHighlight: (annotationId: string) => void;
  #document: PDFDocumentProxy | null = null;
  #loadingTask: PDFDocumentLoadingTask | null = null;
  #annotations: AnnotationResource[] = [];
  #pageNumber = 1;
  #pageText = "";
  #focusedAnnotationId: string | undefined;
  #draftSelection: PdfSelectionCapture | null = null;
  #renderVersion = 0;
  #openVersion = 0;

  constructor(
    elements: PdfViewerElements,
    onSelection: (capture: PdfSelectionCapture) => void,
    onHighlight: (annotationId: string) => void,
  ) {
    this.#elements = elements;
    this.#onSelection = onSelection;
    this.#onHighlight = onHighlight;
    elements.previousPage.addEventListener("click", () => void this.#move(-1));
    elements.nextPage.addEventListener("click", () => void this.#move(1));
    elements.textLayer.addEventListener("pointerup", () => this.#captureSelection());
  }

  get currentPage(): number {
    return this.#pageNumber;
  }

  get focusedAnnotationId(): string | null {
    return this.#focusedAnnotationId ?? null;
  }

  async open(options: OpenPdfOptions): Promise<boolean> {
    const openVersion = ++this.#openVersion;
    this.#renderVersion += 1;
    const previousTask = this.#loadingTask;
    this.#loadingTask = null;
    await previousTask?.destroy();
    if (openVersion !== this.#openVersion) return false;
    this.#document = null;
    this.#annotations = options.annotations;
    this.#focusedAnnotationId = options.focusAnnotationId;
    this.#draftSelection = null;
    this.#elements.status.textContent = "Loading PDF…";
    const loadingTask = getDocument({ url: options.url });
    this.#loadingTask = loadingTask;
    let documentModel: PDFDocumentProxy;
    try {
      documentModel = await loadingTask.promise;
    } catch (error) {
      if (openVersion !== this.#openVersion) return false;
      throw error;
    }
    if (openVersion !== this.#openVersion) {
      await loadingTask.destroy();
      return false;
    }
    this.#document = documentModel;
    this.#pageNumber = clamp(options.page ?? 1, 1, documentModel.numPages);
    await this.#renderPage();
    return openVersion === this.#openVersion;
  }

  updateAnnotations(annotations: AnnotationResource[]): void {
    this.#annotations = annotations;
    this.#renderHighlights();
  }

  clearDraftSelection(): void {
    this.#draftSelection = null;
    this.#renderHighlights();
  }

  async resize(): Promise<void> {
    await this.#renderPage();
  }

  async #move(offset: number): Promise<void> {
    if (!this.#document) return;
    const next = clamp(this.#pageNumber + offset, 1, this.#document.numPages);
    if (next === this.#pageNumber) return;
    this.#pageNumber = next;
    this.#focusedAnnotationId = undefined;
    this.#draftSelection = null;
    await this.#renderPage();
  }

  async #renderPage(): Promise<void> {
    const documentModel = this.#document;
    if (!documentModel) return;
    const version = ++this.#renderVersion;
    this.#elements.status.textContent = `Rendering page ${this.#pageNumber}…`;
    const page = await documentModel.getPage(this.#pageNumber);
    if (version !== this.#renderVersion) return;

    const unscaled = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(320, Math.min(900, this.#elements.page.parentElement?.clientWidth ?? 760) - 32);
    const viewport = page.getViewport({ scale: availableWidth / unscaled.width });
    const outputScale = window.devicePixelRatio || 1;
    this.#elements.page.style.width = `${viewport.width}px`;
    this.#elements.page.style.height = `${viewport.height}px`;
    this.#elements.page.style.setProperty("--total-scale-factor", String(viewport.scale));
    this.#elements.canvas.width = Math.floor(viewport.width * outputScale);
    this.#elements.canvas.height = Math.floor(viewport.height * outputScale);
    this.#elements.canvas.style.width = `${viewport.width}px`;
    this.#elements.canvas.style.height = `${viewport.height}px`;

    const textContent = await page.getTextContent();
    if (version !== this.#renderVersion) return;
    this.#pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ");
    this.#elements.textLayer.replaceChildren();
    const textLayer = new TextLayer({ textContentSource: textContent, container: this.#elements.textLayer, viewport });
    await Promise.all([
      page.render({
        canvas: this.#elements.canvas,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      }).promise,
      textLayer.render(),
    ]);
    if (version !== this.#renderVersion) return;
    this.#renderHighlights();
    this.#elements.pageIndicator.textContent = `${this.#pageNumber} / ${documentModel.numPages}`;
    this.#elements.previousPage.disabled = this.#pageNumber === 1;
    this.#elements.nextPage.disabled = this.#pageNumber === documentModel.numPages;
    this.#elements.status.textContent = "Select text to capture evidence";
  }

  #captureSelection(): void {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!this.#elements.textLayer.contains(range.commonAncestorContainer)) return;
    const rects = normalizeSelectionRects(range.getClientRects(), this.#elements.page.getBoundingClientRect());
    const context = deriveTextQuoteContext(this.#pageText, selection.toString());
    if (!context.quote || rects.length === 0) return;
    this.#draftSelection = { page: this.#pageNumber, ...context, rects };
    this.#renderHighlights();
    this.#onSelection(this.#draftSelection);
    this.#elements.status.textContent = `${rects.length} ${rects.length === 1 ? "fragment" : "fragments"} captured from page ${this.#pageNumber}`;
    selection.removeAllRanges();
  }

  #renderHighlights(): void {
    this.#elements.highlights.replaceChildren();
    for (const annotation of this.#annotations.filter((item) => item.page === this.#pageNumber)) {
      for (const rect of annotation.rects) {
        const highlight = document.createElement("button");
        highlight.type = "button";
        highlight.className = "pdf-highlight";
        if (annotation.id === this.#focusedAnnotationId) highlight.dataset.focused = "true";
        highlight.style.left = `${rect.x * 100}%`;
        highlight.style.top = `${rect.y * 100}%`;
        highlight.style.width = `${rect.width * 100}%`;
        highlight.style.height = `${rect.height * 100}%`;
        highlight.title = annotation.comment || annotation.quote;
        highlight.addEventListener("click", () => this.#onHighlight(annotation.id));
        this.#elements.highlights.append(highlight);
      }
    }
    if (this.#draftSelection?.page === this.#pageNumber) {
      for (const rect of this.#draftSelection.rects) {
        const highlight = document.createElement("span");
        highlight.className = "pdf-highlight";
        highlight.dataset.draft = "true";
        highlight.style.left = `${rect.x * 100}%`;
        highlight.style.top = `${rect.y * 100}%`;
        highlight.style.width = `${rect.width * 100}%`;
        highlight.style.height = `${rect.height * 100}%`;
        this.#elements.highlights.append(highlight);
      }
    }
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
