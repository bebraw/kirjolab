import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { AnnotationResource, PdfSelectionRect } from "../domain/workspace";
import type { LibraryHighlight } from "../domain/reference-library";
import { deriveTextQuoteContext, normalizeSelectionRects } from "./pdf-selection";
import { readPdfTextContent } from "./pdf-text-content";
import {
  advancePdfWheelPaging,
  initialPdfWheelPagingState,
  pdfTouchPageDirection,
  pdfTouchPanScroll,
  pdfZoomAnchor,
  pdfZoomScrollCorrection,
  type PdfTouchPanStart,
  type PdfWheelPagingState,
  type PdfZoomAnchor,
} from "./pdf-gestures";
import { loadPdfJsRuntime, type PdfJsRuntime } from "./pdfjs-runtime";
import { createPdfViewerActor, pdfViewerDocumentRequestActive, pdfViewerRenderRequestActive } from "./pdf-viewer-machine";

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
  links: HTMLElement;
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
  mode?: "evidence" | "private-highlight" | "read-only";
  privateHighlights?: readonly LibraryHighlight[];
}

export class PdfEvidenceViewer {
  readonly #elements: PdfViewerElements;
  readonly #onSelection: (capture: PdfSelectionCapture) => void;
  readonly #onHighlight: (annotationId: string, fragmentId: string) => void;
  readonly #onPageChange: (page: number) => void;
  readonly #onPrivateHighlight: (highlightId: string) => void;
  readonly #lifecycle = createPdfViewerActor();
  #document: PDFDocumentProxy | null = null;
  #loadingTask: PDFDocumentLoadingTask | null = null;
  #runtime: PdfJsRuntime | null = null;
  #annotations: AnnotationResource[] = [];
  #privateHighlights: readonly LibraryHighlight[] = [];
  #pageNumber = 1;
  #pageText = "";
  #focusedAnnotationId: string | undefined;
  #draftSelection: PdfSelectionCapture | null = null;
  #mode: "evidence" | "private-highlight" | "read-only" = "evidence";
  #privateHighlightSelection = false;
  #selectedPrivateHighlightId: string | null = null;
  #zoom = 1;
  #renderedZoom = 1;
  #pinchStart: { distance: number; zoom: number } | null = null;
  #touchPanStart: PdfTouchPanStart | null = null;
  #swipeStart: { x: number; y: number; startedAt: number } | null = null;
  #wheelPagingState: PdfWheelPagingState = initialPdfWheelPagingState();
  #wheelZoomRenderTimer: number | undefined;
  #selectionCaptureTimer: number | undefined;
  #zoomAnchor: PdfZoomAnchor | null = null;
  #renderedViewport: { convertToViewportPoint(x: number, y: number): number[] } | null = null;

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
          this.#lifecycle.send({ type: "CANCEL_RENDER" });
          this.#previewZoom(clamp(this.#zoom * Math.exp(-event.deltaY * 0.01), 0.75, 4), event.clientX, event.clientY);
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
    this.#lifecycle.send({ type: "OPEN" });
    const documentRequest = this.#lifecycle.getSnapshot().context.documentRequest;
    const previousTask = this.#loadingTask;
    this.#loadingTask = null;
    await previousTask?.destroy();
    if (!pdfViewerDocumentRequestActive(this.#lifecycle.getSnapshot(), documentRequest)) return false;
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
    this.#zoomAnchor = null;
    this.#renderedViewport = null;
    this.#wheelPagingState = initialPdfWheelPagingState();
    this.#elements.status.textContent = "Loading PDF…";
    let runtime: PdfJsRuntime;
    try {
      runtime = await loadPdfJsRuntime();
    } catch (error) {
      if (!pdfViewerDocumentRequestActive(this.#lifecycle.getSnapshot(), documentRequest)) return false;
      const message = error instanceof Error ? error.message : "Could not load the PDF runtime";
      this.#lifecycle.send({ type: "OPEN_FAILED", documentRequest, message });
      throw error;
    }
    this.#lifecycle.send({ type: "RUNTIME_READY", documentRequest });
    if (!this.#lifecycle.getSnapshot().matches("loadingDocument")) return false;
    this.#runtime = runtime;
    runtime.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";
    const loadingTask = runtime.getDocument({ url: options.url });
    this.#loadingTask = loadingTask;
    let documentModel: PDFDocumentProxy;
    try {
      documentModel = await loadingTask.promise;
    } catch (error) {
      if (!pdfViewerDocumentRequestActive(this.#lifecycle.getSnapshot(), documentRequest)) return false;
      const message = error instanceof Error ? error.message : "Could not load the PDF";
      this.#lifecycle.send({ type: "OPEN_FAILED", documentRequest, message });
      throw error;
    }
    if (!pdfViewerDocumentRequestActive(this.#lifecycle.getSnapshot(), documentRequest)) {
      await loadingTask.destroy();
      return false;
    }
    this.#document = documentModel;
    this.#pageNumber = clamp(options.page ?? 1, 1, documentModel.numPages);
    this.#lifecycle.send({ type: "DOCUMENT_READY", documentRequest, page: this.#pageNumber, pages: documentModel.numPages });
    if (!this.#lifecycle.getSnapshot().matches("ready")) {
      await loadingTask.destroy();
      return false;
    }
    await this.#renderPage();
    const snapshot = this.#lifecycle.getSnapshot();
    return documentRequest === snapshot.context.documentRequest && snapshot.matches("ready");
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
    this.#zoomAnchor = null;
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
    await this.#goToPage(this.#pageNumber + offset);
  }

  async #renderPage(): Promise<void> {
    const documentModel = this.#document;
    const runtime = this.#runtime;
    if (!documentModel || !runtime) return;
    this.#lifecycle.send({ type: "RENDER", page: this.#pageNumber });
    const renderRequest = this.#lifecycle.getSnapshot().context.renderRequest;
    if (!pdfViewerRenderRequestActive(this.#lifecycle.getSnapshot(), renderRequest)) return;
    this.#elements.status.textContent = `Rendering page ${this.#pageNumber}…`;
    let page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>>;
    try {
      page = await documentModel.getPage(this.#pageNumber);
    } catch (error) {
      if (!pdfViewerRenderRequestActive(this.#lifecycle.getSnapshot(), renderRequest)) return;
      this.#failRender(renderRequest, error);
      throw error;
    }
    if (!pdfViewerRenderRequestActive(this.#lifecycle.getSnapshot(), renderRequest)) return;

    const unscaled = page.getViewport({ scale: 1 });
    const readerStyle = window.getComputedStyle(this.#elements.reader);
    const horizontalPadding = (Number.parseFloat(readerStyle.paddingLeft) || 0) + (Number.parseFloat(readerStyle.paddingRight) || 0);
    const readerWidth = this.#elements.reader.clientWidth || 760;
    const availableWidth = Math.max(320, Math.min(900, readerWidth - horizontalPadding));
    const renderedZoom = this.#zoom;
    const viewport = page.getViewport({ scale: (availableWidth / unscaled.width) * renderedZoom });
    const outputScale = window.devicePixelRatio || 1;
    const renderedCanvas = document.createElement("canvas");
    renderedCanvas.width = Math.floor(viewport.width * outputScale);
    renderedCanvas.height = Math.floor(viewport.height * outputScale);
    const renderedTextLayer = document.createElement("div");
    renderedTextLayer.className = "textLayer";
    renderedTextLayer.style.setProperty("--total-scale-factor", String(viewport.scale));

    const annotationsPromise = page.getAnnotations({ intent: "display" });
    let textContent: Awaited<ReturnType<typeof readPdfTextContent>>;
    try {
      textContent = await readPdfTextContent(page);
    } catch (error) {
      if (!pdfViewerRenderRequestActive(this.#lifecycle.getSnapshot(), renderRequest)) return;
      this.#failRender(renderRequest, error);
      throw error;
    }
    if (!pdfViewerRenderRequestActive(this.#lifecycle.getSnapshot(), renderRequest)) return;
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ");
    const textLayer = new runtime.TextLayer({ textContentSource: textContent, container: renderedTextLayer, viewport });
    let annotations: Awaited<typeof annotationsPromise>;
    try {
      const rendered = await Promise.all([
        page.render({
          canvas: renderedCanvas,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise,
        textLayer.render(),
        annotationsPromise,
      ]);
      annotations = rendered[2];
    } catch (error) {
      if (!pdfViewerRenderRequestActive(this.#lifecycle.getSnapshot(), renderRequest)) return;
      this.#failRender(renderRequest, error);
      throw error;
    }
    if (!pdfViewerRenderRequestActive(this.#lifecycle.getSnapshot(), renderRequest)) return;
    const canvasContext = this.#elements.canvas.getContext("2d");
    if (!canvasContext) {
      const error = new Error("PDF canvas is unavailable");
      this.#failRender(renderRequest, error);
      throw error;
    }
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
    this.#elements.page.style.removeProperty("transform-origin");
    this.#renderedZoom = renderedZoom;
    this.#renderedViewport = viewport;
    this.#pageText = pageText;
    this.#renderPdfLinks(viewport, annotations);
    this.#renderHighlights();
    this.#restoreZoomAnchor();
    for (const indicator of this.#elements.pageIndicators) indicator.textContent = `${this.#pageNumber} / ${documentModel.numPages}`;
    for (const button of this.#elements.previousPages) button.disabled = this.#pageNumber === 1;
    for (const button of this.#elements.nextPages) button.disabled = this.#pageNumber === documentModel.numPages;
    this.#elements.status.textContent =
      this.#mode === "private-highlight"
        ? "Private library PDF · select text to highlight"
        : this.#mode === "read-only"
          ? "Shared project PDF · read only"
          : "Select text to capture evidence";
    this.#lifecycle.send({ type: "RENDERED", renderRequest });
    this.#onPageChange(this.#pageNumber);
  }

  #failRender(renderRequest: number, error: unknown): void {
    const message = error instanceof Error ? error.message : "Could not render the PDF page";
    this.#lifecycle.send({ type: "RENDER_FAILED", renderRequest, message });
    if (this.#lifecycle.getSnapshot().matches("failed")) this.#elements.status.textContent = message;
  }

  #queueSelectionCapture(): void {
    if (this.#mode === "read-only") return;
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
    if (this.#touchTargetsActiveDrawing(event)) {
      event.preventDefault();
      this.#touchPanStart = null;
      this.#swipeStart = null;
      return;
    }
    if (event.touches.length === 2) {
      event.preventDefault();
      window.clearTimeout(this.#wheelZoomRenderTimer);
      this.#wheelZoomRenderTimer = undefined;
      this.#lifecycle.send({ type: "CANCEL_RENDER" });
      this.#pinchStart = { distance: touchDistance(event.touches), zoom: this.#zoom };
      const midpoint = touchMidpoint(event.touches);
      this.#setZoomAnchor(midpoint.x, midpoint.y);
      this.#touchPanStart = null;
      this.#swipeStart = null;
      return;
    }
    const touch = event.touches[0];
    if (event.touches.length === 1 && touch && event.target instanceof Element && event.target.closest('.pdf-markups[data-tool="draw"]')) {
      event.preventDefault();
      this.#touchPanStart = {
        x: touch.clientX,
        y: touch.clientY,
        scrollLeft: this.#elements.reader.scrollLeft,
        scrollTop: this.#elements.reader.scrollTop,
      };
      this.#swipeStart = null;
      return;
    }
    if (event.touches.length === 1 && touch && !touchStartsInteractivePdfControl(event.target)) {
      this.#swipeStart = { x: touch.clientX, y: touch.clientY, startedAt: performance.now() };
    }
  }

  #continueTouchGesture(event: TouchEvent): void {
    if (this.#touchTargetsActiveDrawing(event)) {
      event.preventDefault();
      return;
    }
    if (event.touches.length === 2 && this.#pinchStart) {
      event.preventDefault();
      const zoom = clamp(this.#pinchStart.zoom * (touchDistance(event.touches) / this.#pinchStart.distance), 0.75, 4);
      const midpoint = touchMidpoint(event.touches);
      this.#previewZoom(zoom, midpoint.x, midpoint.y);
      return;
    }
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch || !this.#touchPanStart) return;
    event.preventDefault();
    const scroll = pdfTouchPanScroll(this.#touchPanStart, { x: touch.clientX, y: touch.clientY });
    this.#elements.reader.scrollLeft = scroll.left;
    this.#elements.reader.scrollTop = scroll.top;
  }

  async #finishTouchGesture(event: TouchEvent): Promise<void> {
    if (event.touches.length === 0) this.#touchPanStart = null;
    if (this.#pinchStart && event.touches.length < 2) {
      this.#pinchStart = null;
      await this.#renderPage();
      return;
    }
    const start = this.#swipeStart;
    const touch = event.changedTouches[0];
    this.#swipeStart = null;
    if (!start || !touch) return;
    const direction = pdfTouchPageDirection(start, { x: touch.clientX, y: touch.clientY, endedAt: performance.now() }, this.#zoom);
    if (direction) await this.#move(direction);
  }

  #cancelTouchGesture(): void {
    this.#pinchStart = null;
    this.#touchPanStart = null;
    this.#swipeStart = null;
    this.#zoomAnchor = null;
    this.#elements.page.style.removeProperty("transform");
    this.#elements.page.style.removeProperty("transform-origin");
  }

  #touchTargetsActiveDrawing(event: TouchEvent): boolean {
    return event.target instanceof Element && event.target.closest('.pdf-markups[data-drawing-active="true"]') !== null;
  }

  #setZoomAnchor(clientX: number, clientY: number): void {
    const anchor = pdfZoomAnchor(this.#elements.page.getBoundingClientRect(), { x: clientX, y: clientY });
    this.#zoomAnchor = anchor;
    this.#elements.page.style.transformOrigin = `${anchor.x * 100}% ${anchor.y * 100}%`;
  }

  #previewZoom(zoom: number, clientX: number, clientY: number): void {
    this.#setZoomAnchor(clientX, clientY);
    this.#zoom = zoom;
    this.#elements.page.style.transform = `scale(${zoom / this.#renderedZoom})`;
  }

  #restoreZoomAnchor(): void {
    const anchor = this.#zoomAnchor;
    this.#zoomAnchor = null;
    if (!anchor) return;
    const correction = pdfZoomScrollCorrection(anchor, this.#elements.page.getBoundingClientRect());
    this.#elements.reader.scrollLeft += correction.left;
    this.#elements.reader.scrollTop += correction.top;
  }

  #renderPdfLinks(viewport: { convertToViewportPoint(x: number, y: number): number[] }, annotations: readonly unknown[]): void {
    this.#elements.links.replaceChildren();
    for (const value of annotations) {
      const annotation = pdfLinkAnnotation(value);
      if (!annotation) continue;
      const [x1 = 0, y1 = 0] = viewport.convertToViewportPoint(annotation.rect[0] ?? 0, annotation.rect[1] ?? 0);
      const [x2 = 0, y2 = 0] = viewport.convertToViewportPoint(annotation.rect[2] ?? 0, annotation.rect[3] ?? 0);
      const link = document.createElement("a");
      link.className = "pdf-link";
      link.style.left = `${Math.min(x1, x2)}px`;
      link.style.top = `${Math.min(y1, y2)}px`;
      link.style.width = `${Math.abs(x2 - x1)}px`;
      link.style.height = `${Math.abs(y2 - y1)}px`;
      if (annotation.url) {
        link.href = annotation.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer nofollow";
        link.setAttribute("aria-label", `Open PDF link: ${annotation.url}`);
      } else {
        link.href = "#";
        link.setAttribute("aria-label", "Follow link within PDF");
        link.addEventListener("click", (event) => {
          event.preventDefault();
          void this.#followPdfDestination(annotation);
        });
      }
      this.#elements.links.append(link);
    }
  }

  async #followPdfDestination(annotation: PdfLinkAnnotation): Promise<void> {
    const documentModel = this.#document;
    if (!documentModel) return;
    if (annotation.action) {
      if (annotation.action === "NextPage") return this.#move(1);
      if (annotation.action === "PrevPage") return this.#move(-1);
      if (annotation.action === "FirstPage") return this.#goToPage(1);
      if (annotation.action === "LastPage") return this.#goToPage(documentModel.numPages);
      return;
    }
    const destination = typeof annotation.dest === "string" ? await documentModel.getDestination(annotation.dest) : annotation.dest;
    if (!Array.isArray(destination)) return;
    const reference = destination[0];
    const page = Number.isInteger(reference)
      ? Number(reference) + 1
      : isPdfPageReference(reference)
        ? (await documentModel.getPageIndex(reference)) + 1
        : null;
    if (!page) return;
    await this.#goToPage(page);
    this.#scrollToPdfDestination(destination);
  }

  async #goToPage(page: number): Promise<void> {
    if (!this.#document) return;
    const next = clamp(page, 1, this.#document.numPages);
    if (next === this.#pageNumber) return;
    this.#pageNumber = next;
    this.#focusedAnnotationId = undefined;
    this.#draftSelection = null;
    this.#zoomAnchor = null;
    window.clearTimeout(this.#wheelZoomRenderTimer);
    this.#wheelZoomRenderTimer = undefined;
    await this.#renderPage();
  }

  #scrollToPdfDestination(destination: readonly unknown[]): void {
    const viewport = this.#renderedViewport;
    const mode = isUnknownRecord(destination[1]) && typeof destination[1].name === "string" ? destination[1].name : "";
    const left = mode === "XYZ" || mode === "FitR" ? finiteNumber(destination[2]) : null;
    const top =
      mode === "XYZ"
        ? finiteNumber(destination[3])
        : mode === "FitH" || mode === "FitBH"
          ? finiteNumber(destination[2])
          : mode === "FitR"
            ? finiteNumber(destination[5])
            : null;
    if (!viewport || (left === null && top === null)) return;
    const [x = 0, y = 0] = viewport.convertToViewportPoint(left ?? 0, top ?? 0);
    const readerRect = this.#elements.reader.getBoundingClientRect();
    const pageRect = this.#elements.page.getBoundingClientRect();
    if (left !== null) this.#elements.reader.scrollLeft += pageRect.left + x - readerRect.left;
    if (top !== null) this.#elements.reader.scrollTop += pageRect.top + y - readerRect.top;
  }
}

function touchDistance(touches: TouchList): number {
  const first = touches[0];
  const second = touches[1];
  return first && second ? Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY) : 1;
}

function touchMidpoint(touches: TouchList): { x: number; y: number } {
  const first = touches[0];
  const second = touches[1];
  return first && second ? { x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2 } : { x: 0, y: 0 };
}

interface PdfLinkAnnotation {
  readonly rect: number[];
  readonly url?: string;
  readonly dest?: unknown;
  readonly action?: string;
}

function pdfLinkAnnotation(value: unknown): PdfLinkAnnotation | null {
  if (!isUnknownRecord(value) || value.annotationType !== 2 || !isNumberArray(value.rect, 4)) return null;
  const url = typeof value.url === "string" ? value.url : undefined;
  const action = typeof value.action === "string" ? value.action : undefined;
  const destination = value.dest;
  if (!url && destination === undefined && !action) return null;
  return {
    rect: value.rect,
    ...(url ? { url } : {}),
    ...(destination !== undefined ? { dest: destination } : {}),
    ...(action ? { action } : {}),
  };
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumberArray(value: unknown, minimumLength: number): value is number[] {
  return Array.isArray(value) && value.length >= minimumLength && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function isPdfPageReference(value: unknown): value is { num: number; gen: number } {
  return isUnknownRecord(value) && Number.isInteger(value.num) && Number.isInteger(value.gen);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function touchStartsInteractivePdfControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest(".pdf-link, .pdf-note-pin, .pdf-ink-stroke, .pdf-highlight[data-private='true']") !== null
  );
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
