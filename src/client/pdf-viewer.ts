import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { AnnotationResource, PdfSelectionRect } from "../domain/workspace";
import type { LibraryHighlight } from "../domain/reference-library";
import { deriveTextQuoteContext, normalizeSelectionRects } from "./pdf-selection";
import { readPdfTextContent } from "./pdf-text-content";
import { advancePdfWheelPaging, initialPdfWheelPagingState, type PdfWheelPagingState } from "./pdf-gestures";
import { loadPdfJsRuntime, type PdfJsRuntime } from "./pdfjs-runtime";

export interface PdfSelectionCapture {
  page: number;
  quote: string;
  prefix: string;
  suffix: string;
  rects: PdfSelectionRect[];
}

interface PdfViewerElements {
  reader: HTMLElement;
  canvas: HTMLCanvasElement;
  page: HTMLElement;
  textLayer: HTMLElement;
  highlights: HTMLElement;
  pageIndicators: readonly HTMLElement[];
  previousPages: readonly HTMLButtonElement[];
  nextPages: readonly HTMLButtonElement[];
  status: HTMLElement;
}

interface OpenPdfOptions {
  url: string;
  annotations: AnnotationResource[];
  page?: number;
  focusAnnotationId?: string;
  mode?: "evidence" | "private-highlight";
  privateHighlights?: readonly LibraryHighlight[];
}

export class PdfEvidenceViewer {
  readonly #elements: PdfViewerElements;
  readonly #onSelection: (capture: PdfSelectionCapture) => void;
  readonly #onHighlight: (annotationId: string, fragmentId: string) => void;
  readonly #onPageChange: (page: number) => void;
  readonly #onPrivateHighlight: (highlightId: string) => void;
  #document: PDFDocumentProxy | null = null;
  #loadingTask: PDFDocumentLoadingTask | null = null;
  #runtime: PdfJsRuntime | null = null;
  #annotations: AnnotationResource[] = [];
  #privateHighlights: readonly LibraryHighlight[] = [];
  #pageNumber = 1;
  #pageText = "";
  #focusedAnnotationId: string | undefined;
  #draftSelection: PdfSelectionCapture | null = null;
  #mode: "evidence" | "private-highlight" = "evidence";
  #privateHighlightSelection = false;
  #selectedPrivateHighlightId: string | null = null;
  #renderVersion = 0;
  #openVersion = 0;
  #zoom = 1;
  #renderedZoom = 1;
  #pinchStart: { distance: number; zoom: number } | null = null;
  #swipeStart: { x: number; y: number; startedAt: number } | null = null;
  #wheelPagingState: PdfWheelPagingState = initialPdfWheelPagingState();
  #wheelZoomRenderTimer: number | undefined;
  #selectionCaptureTimer: number | undefined;

  constructor(
    elements: PdfViewerElements,
    onSelection: (capture: PdfSelectionCapture) => void,
    onHighlight: (annotationId: string, fragmentId: string) => void,
    onPageChange: (page: number) => void = () => undefined,
    onPrivateHighlight: (highlightId: string) => void = () => undefined,
  ) {
    this.#elements = elements;
    this.#onSelection = onSelection;
    this.#onHighlight = onHighlight;
    this.#onPageChange = onPageChange;
    this.#onPrivateHighlight = onPrivateHighlight;
    for (const button of elements.previousPages) button.addEventListener("click", () => void this.#move(-1));
    for (const button of elements.nextPages) button.addEventListener("click", () => void this.#move(1));
    elements.textLayer.addEventListener("pointerup", () => this.#queueSelectionCapture());
    document.addEventListener("selectionchange", () => {
      if (this.#mode === "private-highlight") this.#queueSelectionCapture();
    });
    elements.reader.addEventListener("touchstart", (event) => this.#startTouchGesture(event), { passive: false });
    elements.reader.addEventListener("touchmove", (event) => this.#continueTouchGesture(event), { passive: false });
    elements.reader.addEventListener("touchend", (event) => void this.#finishTouchGesture(event), { passive: true });
    elements.reader.addEventListener("touchcancel", () => this.#cancelTouchGesture(), { passive: true });
    elements.reader.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey) {
          event.preventDefault();
          this.#renderVersion += 1;
          this.#zoom = clamp(this.#zoom * Math.exp(-event.deltaY * 0.01), 0.75, 4);
          this.#elements.page.style.transform = `scale(${this.#zoom / this.#renderedZoom})`;
          window.clearTimeout(this.#wheelZoomRenderTimer);
          this.#wheelZoomRenderTimer = window.setTimeout(() => {
            this.#wheelZoomRenderTimer = undefined;
            void this.#renderPage();
          }, 140);
          return;
        }
        if (!this.#document || this.#zoom > 1.01) {
          this.#wheelPagingState = initialPdfWheelPagingState();
          return;
        }
        const gesture = advancePdfWheelPaging(this.#wheelPagingState, {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          now: performance.now(),
        });
        this.#wheelPagingState = gesture.state;
        if (!gesture.consumed) return;
        event.preventDefault();
        if (gesture.direction) void this.#move(gesture.direction);
      },
      { passive: false },
    );
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
    this.#privateHighlights = options.privateHighlights ?? [];
    this.#focusedAnnotationId = options.focusAnnotationId;
    window.clearTimeout(this.#selectionCaptureTimer);
    window.clearTimeout(this.#wheelZoomRenderTimer);
    this.#wheelZoomRenderTimer = undefined;
    this.#clearNativeSelection();
    this.#draftSelection = null;
    this.#mode = options.mode ?? "evidence";
    this.#zoom = 1;
    this.#renderedZoom = 1;
    this.#wheelPagingState = initialPdfWheelPagingState();
    this.#elements.status.textContent = "Loading PDF…";
    const runtime = await loadPdfJsRuntime();
    if (openVersion !== this.#openVersion) return false;
    this.#runtime = runtime;
    runtime.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";
    const loadingTask = runtime.getDocument({ url: options.url });
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

  updatePrivateHighlights(highlights: readonly LibraryHighlight[]): void {
    this.#privateHighlights = highlights;
    this.#renderHighlights();
  }

  clearDraftSelection(): void {
    window.clearTimeout(this.#selectionCaptureTimer);
    this.#clearNativeSelection();
    this.#draftSelection = null;
    this.#renderHighlights();
  }

  setTool(tool: "paint" | "erase"): void {
    this.#elements.highlights.dataset.tool = tool;
  }

  setPrivateHighlightSelection(enabled: boolean, selectedId: string | null = null): void {
    this.#privateHighlightSelection = enabled;
    this.#selectedPrivateHighlightId = selectedId;
    this.#elements.highlights.dataset.privateSelect = String(enabled);
    this.#renderHighlights();
  }

  async resize(): Promise<void> {
    window.clearTimeout(this.#wheelZoomRenderTimer);
    this.#wheelZoomRenderTimer = undefined;
    await this.#renderPage();
  }

  async #move(offset: number): Promise<void> {
    if (!this.#document) return;
    const next = clamp(this.#pageNumber + offset, 1, this.#document.numPages);
    if (next === this.#pageNumber) return;
    this.#pageNumber = next;
    this.#focusedAnnotationId = undefined;
    this.#draftSelection = null;
    window.clearTimeout(this.#wheelZoomRenderTimer);
    this.#wheelZoomRenderTimer = undefined;
    await this.#renderPage();
  }

  async #renderPage(): Promise<void> {
    const documentModel = this.#document;
    const runtime = this.#runtime;
    if (!documentModel || !runtime) return;
    const version = ++this.#renderVersion;
    this.#elements.status.textContent = `Rendering page ${this.#pageNumber}…`;
    const page = await documentModel.getPage(this.#pageNumber);
    if (version !== this.#renderVersion) return;

    const unscaled = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(320, Math.min(900, this.#elements.page.parentElement?.clientWidth ?? 760) - 32);
    const renderedZoom = this.#zoom;
    const viewport = page.getViewport({ scale: (availableWidth / unscaled.width) * renderedZoom });
    const outputScale = window.devicePixelRatio || 1;
    const renderedCanvas = document.createElement("canvas");
    renderedCanvas.width = Math.floor(viewport.width * outputScale);
    renderedCanvas.height = Math.floor(viewport.height * outputScale);
    const renderedTextLayer = document.createElement("div");
    renderedTextLayer.className = "textLayer";
    renderedTextLayer.style.setProperty("--total-scale-factor", String(viewport.scale));

    const textContent = await readPdfTextContent(page);
    if (version !== this.#renderVersion) return;
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ");
    const textLayer = new runtime.TextLayer({ textContentSource: textContent, container: renderedTextLayer, viewport });
    await Promise.all([
      page.render({
        canvas: renderedCanvas,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      }).promise,
      textLayer.render(),
    ]);
    if (version !== this.#renderVersion) return;
    const canvasContext = this.#elements.canvas.getContext("2d");
    if (!canvasContext) return;
    this.#elements.canvas.width = renderedCanvas.width;
    this.#elements.canvas.height = renderedCanvas.height;
    canvasContext.drawImage(renderedCanvas, 0, 0);
    this.#elements.canvas.style.width = `${viewport.width}px`;
    this.#elements.canvas.style.height = `${viewport.height}px`;
    const textLayerPointerEvents = this.#elements.textLayer.style.pointerEvents;
    this.#elements.textLayer.style.cssText = renderedTextLayer.style.cssText;
    this.#elements.textLayer.style.pointerEvents = textLayerPointerEvents;
    this.#elements.textLayer.replaceChildren(...renderedTextLayer.childNodes);
    this.#elements.page.style.width = `${viewport.width}px`;
    this.#elements.page.style.height = `${viewport.height}px`;
    this.#elements.page.style.setProperty("--total-scale-factor", String(viewport.scale));
    this.#elements.page.style.removeProperty("transform");
    this.#renderedZoom = renderedZoom;
    this.#pageText = pageText;
    this.#renderHighlights();
    for (const indicator of this.#elements.pageIndicators) indicator.textContent = `${this.#pageNumber} / ${documentModel.numPages}`;
    for (const button of this.#elements.previousPages) button.disabled = this.#pageNumber === 1;
    for (const button of this.#elements.nextPages) button.disabled = this.#pageNumber === documentModel.numPages;
    this.#elements.status.textContent =
      this.#mode === "private-highlight" ? "Private library PDF · select text to highlight" : "Select text to capture evidence";
    this.#onPageChange(this.#pageNumber);
  }

  #queueSelectionCapture(): void {
    window.clearTimeout(this.#selectionCaptureTimer);
    this.#selectionCaptureTimer = window.setTimeout(() => this.#captureSelection(), 80);
  }

  #captureSelection(): void {
    this.#selectionCaptureTimer = undefined;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!this.#elements.textLayer.contains(range.commonAncestorContainer)) return;
    const maximumRects = this.#mode === "private-highlight" ? 512 : 64;
    const rects = normalizeSelectionRects(range.getClientRects(), this.#elements.page.getBoundingClientRect(), maximumRects);
    const context = deriveTextQuoteContext(this.#pageText, selection.toString());
    if (!context.quote || rects.length === 0) return;
    const capture = { page: this.#pageNumber, ...context, rects };
    if (sameSelectionCapture(capture, this.#draftSelection)) return;
    this.#draftSelection = capture;
    this.#renderHighlights();
    this.#onSelection(this.#draftSelection);
    this.#elements.status.textContent =
      this.#mode === "private-highlight"
        ? `Private selection captured from page ${this.#pageNumber}`
        : `${rects.length} ${rects.length === 1 ? "line" : "lines"} captured from page ${this.#pageNumber}`;
    if (this.#mode === "evidence") selection.removeAllRanges();
  }

  #clearNativeSelection(): void {
    const selection = window.getSelection();
    if (selection?.anchorNode && this.#elements.textLayer.contains(selection.anchorNode)) selection.removeAllRanges();
  }

  #renderHighlights(): void {
    this.#elements.highlights.replaceChildren();
    for (const annotation of this.#annotations.filter((item) => item.page === this.#pageNumber)) {
      const fragments =
        annotation.fragments.length > 0 ? annotation.fragments : [{ id: `legacy-${annotation.id}`, rects: annotation.rects }];
      for (const fragment of fragments) {
        for (const rect of fragment.rects) {
          const highlight = document.createElement("button");
          highlight.type = "button";
          highlight.className = "pdf-highlight";
          if (annotation.id === this.#focusedAnnotationId) highlight.dataset.focused = "true";
          highlight.style.left = `${rect.x * 100}%`;
          highlight.style.top = `${rect.y * 100}%`;
          highlight.style.width = `${rect.width * 100}%`;
          highlight.style.height = `${rect.height * 100}%`;
          highlight.title = annotation.comment || annotation.quote;
          highlight.dataset.annotationId = annotation.id;
          highlight.dataset.fragmentId = fragment.id;
          highlight.addEventListener("click", () => this.#onHighlight(annotation.id, fragment.id));
          this.#elements.highlights.append(highlight);
        }
      }
    }
    for (const annotation of this.#privateHighlights.filter((item) => item.page === this.#pageNumber)) {
      for (const rect of annotation.rects) {
        const highlight = document.createElement(this.#privateHighlightSelection ? "button" : "span");
        if (highlight instanceof HTMLButtonElement) highlight.type = "button";
        highlight.className = "pdf-highlight";
        highlight.dataset.private = "true";
        highlight.dataset.highlightId = annotation.id;
        if (annotation.id === this.#selectedPrivateHighlightId) highlight.dataset.selected = "true";
        highlight.style.left = `${rect.x * 100}%`;
        highlight.style.top = `${rect.y * 100}%`;
        highlight.style.width = `${rect.width * 100}%`;
        highlight.style.height = `${rect.height * 100}%`;
        highlight.title = annotation.comment || annotation.quote;
        if (this.#privateHighlightSelection) highlight.addEventListener("click", () => this.#onPrivateHighlight(annotation.id));
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

  #startTouchGesture(event: TouchEvent): void {
    if (event.touches.length === 2) {
      event.preventDefault();
      window.clearTimeout(this.#wheelZoomRenderTimer);
      this.#wheelZoomRenderTimer = undefined;
      this.#renderVersion += 1;
      this.#pinchStart = { distance: touchDistance(event.touches), zoom: this.#zoom };
      this.#swipeStart = null;
      return;
    }
    const touch = event.touches[0];
    if (event.touches.length === 1 && touch && event.target instanceof Node && !this.#elements.page.contains(event.target)) {
      this.#swipeStart = { x: touch.clientX, y: touch.clientY, startedAt: performance.now() };
    }
  }

  #continueTouchGesture(event: TouchEvent): void {
    if (event.touches.length !== 2 || !this.#pinchStart) return;
    event.preventDefault();
    const zoom = clamp(this.#pinchStart.zoom * (touchDistance(event.touches) / this.#pinchStart.distance), 0.75, 4);
    this.#zoom = zoom;
    this.#elements.page.style.transform = `scale(${zoom / this.#renderedZoom})`;
  }

  async #finishTouchGesture(event: TouchEvent): Promise<void> {
    if (this.#pinchStart && event.touches.length < 2) {
      this.#pinchStart = null;
      await this.#renderPage();
      return;
    }
    const start = this.#swipeStart;
    const touch = event.changedTouches[0];
    this.#swipeStart = null;
    if (!start || !touch || performance.now() - start.startedAt > 700) return;
    const x = touch.clientX - start.x;
    const y = touch.clientY - start.y;
    if (Math.abs(x) < 54 || Math.abs(x) < Math.abs(y) * 1.4) return;
    await this.#move(x < 0 ? 1 : -1);
  }

  #cancelTouchGesture(): void {
    this.#pinchStart = null;
    this.#swipeStart = null;
    this.#elements.page.style.removeProperty("transform");
  }
}

function touchDistance(touches: TouchList): number {
  const first = touches[0];
  const second = touches[1];
  return first && second ? Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY) : 1;
}

function sameSelectionCapture(left: PdfSelectionCapture, right: PdfSelectionCapture | null): boolean {
  return (
    right !== null &&
    left.page === right.page &&
    left.quote === right.quote &&
    left.rects.length === right.rects.length &&
    left.rects.every((rect, index) => {
      const candidate = right.rects[index];
      return (
        candidate !== undefined &&
        rect.x === candidate.x &&
        rect.y === candidate.y &&
        rect.width === candidate.width &&
        rect.height === candidate.height
      );
    })
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
