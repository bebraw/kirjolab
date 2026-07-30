import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { AnnotationResource, PdfSelectionRect } from "../domain/workspace";
import type { LibraryHighlight } from "../domain/reference-library";
import { deriveTextQuoteContext, normalizeSelectionRects } from "./pdf-selection";
import { readPdfTextContent } from "./pdf-text-content";
import { PdfContinuousView } from "./pdf-continuous-view";
import type { PdfSearchResult } from "./pdf-search-panel";
import {
  advancePdfWheelPaging,
  initialPdfWheelPagingState,
  pdfHorizontalPageEdges,
  pdfKeyboardPageDirection,
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
  continuousPages: HTMLElement;
  continuousModeButtons: readonly HTMLButtonElement[];
  pageIndicators: readonly HTMLElement[];
  previousPages: readonly HTMLButtonElement[];
  nextPages: readonly HTMLButtonElement[];
  status: HTMLElement;
}

interface PdfViewerPresentation {
  activateProjectHighlight(annotationId: string, fragmentId: string): void;
  capturePdfSelection(capture: PdfSelectionCapture): void;
  presentPdfPage(page: number): void;
  selectLibraryHighlight(highlightId: string): void;
}

interface OpenPdfOptions {
  url: string;
  annotations: AnnotationResource[];
  page?: number;
  focusAnnotationId?: string;
  mode?: "evidence" | "private-highlight" | "read-only";
  privateHighlights?: readonly LibraryHighlight[];
}

export type PdfTextSelectionMode = "copy" | "disabled" | "highlight";
export type PdfDisplayMode = "continuous" | "single";

export class PdfEvidenceViewer {
  readonly #elements: PdfViewerElements;
  readonly #onSelection: (capture: PdfSelectionCapture) => void;
  readonly #onHighlight: (annotationId: string, fragmentId: string) => void;
  readonly #onPageChange: (page: number) => void;
  readonly #onPrivateHighlight: (highlightId: string) => void;
  readonly #continuousView: PdfContinuousView;
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
  #textSelectionMode: PdfTextSelectionMode = "highlight";
  #selectedPrivateHighlightId: string | null = null;
  #zoom = 1;
  #renderedZoom = 1;
  #fittedWidth: number | null = null;
  #pinchStart: { distance: number; zoom: number } | null = null;
  #touchPanStart: PdfTouchPanStart | null = null;
  #swipeStart: { x: number; y: number; startedAt: number; edges: ReturnType<typeof pdfHorizontalPageEdges> } | null = null;
  #wheelPagingState: PdfWheelPagingState = initialPdfWheelPagingState();
  #wheelZoomRenderTimer: number | undefined;
  #selectionCaptureTimer: number | undefined;
  #selectionPointerActive = false;
  #selectionSettleDelay = 80;
  #zoomAnchor: PdfZoomAnchor | null = null;
  #renderedViewport: { convertToViewportPoint(x: number, y: number): number[] } | null = null;
  #displayMode: PdfDisplayMode = readPdfDisplayMode();
  #searchTextCache: readonly { readonly page: number; readonly text: string }[] | null = null;

  static forDocument(root: Document, presentation: PdfViewerPresentation): PdfEvidenceViewer {
    return new PdfEvidenceViewer(
      {
        reader: requiredViewerElement(root, "paper-reader", HTMLElement),
        canvas: requiredViewerElement(root, "paper-canvas", HTMLCanvasElement),
        page: requiredViewerElement(root, "paper-page", HTMLElement),
        links: requiredViewerElement(root, "paper-links", HTMLElement),
        textLayer: requiredViewerElement(root, "paper-text-layer", HTMLElement),
        highlights: requiredViewerElement(root, "paper-highlights", HTMLElement),
        continuousPages: requiredViewerElement(root, "paper-continuous-pages", HTMLElement),
        continuousModeButtons: [
          requiredViewerElement(root, "toggle-paper-continuous", HTMLButtonElement),
          requiredViewerElement(root, "toggle-library-paper-continuous", HTMLButtonElement),
        ],
        pageIndicators: [
          requiredViewerElement(root, "paper-page-indicator", HTMLElement),
          requiredViewerElement(root, "library-paper-page-indicator", HTMLElement),
        ],
        previousPages: [
          requiredViewerElement(root, "previous-paper-page", HTMLButtonElement),
          requiredViewerElement(root, "previous-library-paper-page", HTMLButtonElement),
        ],
        nextPages: [
          requiredViewerElement(root, "next-paper-page", HTMLButtonElement),
          requiredViewerElement(root, "next-library-paper-page", HTMLButtonElement),
        ],
        status: requiredViewerElement(root, "paper-status", HTMLElement),
      },
      (capture) => presentation.capturePdfSelection(capture),
      (annotationId, fragmentId) => presentation.activateProjectHighlight(annotationId, fragmentId),
      (page) => presentation.presentPdfPage(page),
      (highlightId) => presentation.selectLibraryHighlight(highlightId),
    );
  }

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
    this.#continuousView = new PdfContinuousView({
      container: elements.continuousPages,
      reader: elements.reader,
      onPageChange: (page) => this.#presentContinuousPage(page),
      renderOverlays: (view, viewport, annotations) => {
        this.#renderPdfLinks(viewport, annotations, view.links);
        this.#renderHighlightsForPage(view.page, view.highlights);
      },
    });
    for (const button of elements.previousPages) button.addEventListener("click", () => void this.#move(-1));
    for (const button of elements.nextPages) button.addEventListener("click", () => void this.#move(1));
    for (const indicator of elements.pageIndicators) this.#bindPageJump(indicator);
    for (const button of elements.continuousModeButtons) {
      button.addEventListener("click", () => void this.setDisplayMode(this.#displayMode === "continuous" ? "single" : "continuous"));
    }
    elements.textLayer.addEventListener("pointerdown", (event) => this.#startTextSelection(event));
    elements.textLayer.addEventListener("pointerup", () => this.#finishTextSelection());
    elements.textLayer.addEventListener("pointercancel", () => this.#cancelTextSelection());
    elements.continuousPages.addEventListener("pointerdown", (event) => this.#startTextSelection(event));
    elements.continuousPages.addEventListener("pointerup", () => this.#finishTextSelection());
    elements.continuousPages.addEventListener("pointercancel", () => this.#cancelTextSelection());
    document.addEventListener("selectionchange", () => {
      if (this.#mode === "private-highlight") this.#queueSelectionCapture();
    });
    elements.reader.addEventListener("touchstart", (event) => this.#startTouchGesture(event), { passive: false });
    elements.reader.addEventListener("touchmove", (event) => this.#continueTouchGesture(event), { passive: false });
    elements.reader.addEventListener("touchend", (event) => void this.#finishTouchGesture(event), { passive: true });
    elements.reader.addEventListener("touchcancel", () => this.#cancelTouchGesture(), { passive: true });
    elements.reader.addEventListener("wheel", (event) => this.#handleWheel(event), { passive: false });
    elements.reader.ownerDocument.addEventListener("keydown", (event) => this.#handleKeydown(event));
  }

  get currentPage(): number {
    return this.#pageNumber;
  }

  get focusedAnnotationId(): string | null {
    return this.#focusedAnnotationId ?? null;
  }

  async setDisplayMode(mode: PdfDisplayMode): Promise<void> {
    const alreadyPresented =
      mode === "continuous"
        ? this.#elements.page.hidden && !this.#elements.continuousPages.hidden
        : !this.#elements.page.hidden && this.#elements.continuousPages.hidden;
    if (mode === this.#displayMode && alreadyPresented) return;
    this.#displayMode = mode;
    writePdfDisplayMode(mode);
    this.#syncDisplayModeControls();
    const documentModel = this.#document;
    const runtime = this.#runtime;
    if (!documentModel || !runtime) return;
    this.clearDraftSelection();
    this.#zoom = 1;
    this.#renderedZoom = 1;
    this.#elements.reader.dataset.zoomed = "false";
    if (mode === "continuous") {
      this.#elements.page.hidden = true;
      this.#elements.continuousPages.hidden = false;
      this.#elements.reader.dataset.displayMode = "continuous";
      this.#elements.status.textContent = "Preparing continuous view…";
      await this.#continuousView.open(documentModel, runtime, this.#pageNumber, this.#availablePageWidth());
      this.#presentContinuousPage(this.#pageNumber);
      return;
    }
    this.#pageNumber = this.#continuousView.currentPage;
    this.#elements.continuousPages.hidden = true;
    this.#elements.page.hidden = false;
    delete this.#elements.reader.dataset.displayMode;
    this.#elements.reader.scrollTop = 0;
    await this.#renderPage();
  }

  async open(options: OpenPdfOptions): Promise<boolean> {
    this.#lifecycle.send({ type: "OPEN" });
    const documentRequest = this.#lifecycle.getSnapshot().context.documentRequest;
    const previousTask = this.#loadingTask;
    this.#loadingTask = null;
    await previousTask?.destroy();
    if (!pdfViewerDocumentRequestActive(this.#lifecycle.getSnapshot(), documentRequest)) return false;
    this.#document = null;
    this.#searchTextCache = null;
    this.#continuousView.close();
    this.#elements.continuousPages.hidden = true;
    this.#elements.page.hidden = false;
    delete this.#elements.reader.dataset.displayMode;
    this.#syncDisplayModeControls();
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
    this.#fittedWidth = null;
    this.#zoomAnchor = null;
    this.#renderedViewport = null;
    this.#wheelPagingState = initialPdfWheelPagingState();
    this.#elements.reader.dataset.zoomed = "false";
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
    if (this.#displayMode === "continuous") await this.setDisplayMode("continuous");
    const snapshot = this.#lifecycle.getSnapshot();
    return documentRequest === snapshot.context.documentRequest && snapshot.matches("ready");
  }

  async search(query: string): Promise<readonly PdfSearchResult[]> {
    const documentModel = this.#document;
    if (!documentModel) return [];
    if (!this.#searchTextCache) {
      const pages: { page: number; text: string }[] = [];
      for (let pageNumber = 1; pageNumber <= documentModel.numPages; pageNumber += 1) {
        const page = await documentModel.getPage(pageNumber);
        try {
          const content = await readPdfTextContent(page);
          pages.push({ page: pageNumber, text: content.items.map((item) => ("str" in item ? item.str : "")).join(" ") });
        } finally {
          page.cleanup();
        }
      }
      this.#searchTextCache = pages;
    }
    return searchPdfPageTexts(this.#searchTextCache, query);
  }

  async goToPage(page: number): Promise<void> {
    await this.#goToPage(page);
  }

  updateAnnotations(annotations: AnnotationResource[]): void {
    this.#annotations = annotations;
    this.#renderHighlights();
    this.#continuousView.refreshOverlays();
  }

  updatePrivateHighlights(highlights: readonly LibraryHighlight[]): void {
    this.#privateHighlights = highlights;
    this.#renderHighlights();
    this.#continuousView.refreshOverlays();
  }

  showError(error: unknown): void {
    this.#elements.status.textContent = error instanceof Error ? error.message : "Could not render this PDF";
  }

  setTextSelectionMode(mode: PdfTextSelectionMode): void {
    this.#textSelectionMode = mode;
    this.#elements.textLayer.style.pointerEvents = mode === "disabled" ? "none" : "auto";
    this.#continuousView.setTextSelectionEnabled(mode !== "disabled");
    if (mode === "disabled" && this.#displayMode === "continuous") void this.setDisplayMode("single");
  }

  clearDraftSelection(): void {
    window.clearTimeout(this.#selectionCaptureTimer);
    this.#clearNativeSelection();
    this.#draftSelection = null;
    this.#zoomAnchor = null;
    this.#renderHighlights();
    this.#continuousView.refreshOverlays();
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
    this.#fittedWidth = null;
    if (this.#displayMode === "continuous") await this.#continuousView.resize(this.#availablePageWidth());
    else await this.#renderPage();
  }

  async #move(offset: number): Promise<void> {
    if (!this.#document) return;
    await this.#goToPage(this.#pageNumber + offset);
  }

  async #moveFromGesture(offset: -1 | 1): Promise<void> {
    const previousPage = this.#pageNumber;
    await this.#move(offset);
    if (this.#pageNumber === previousPage) return;
    this.#elements.reader.scrollLeft = offset > 0 ? 0 : Math.max(0, this.#elements.reader.scrollWidth - this.#elements.reader.clientWidth);
  }

  #handleKeydown(event: KeyboardEvent): void {
    if (!this.#document || this.#elements.reader.getClientRects().length === 0) return;
    const direction = pdfKeyboardPageDirection({
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      defaultPrevented: event.defaultPrevented,
      isComposing: event.isComposing,
      targetOwnsArrowKeys: pdfKeyboardTargetOwnsArrowKeys(event.target),
    });
    if (!direction) return;
    event.preventDefault();
    void this.#move(direction);
  }

  #handleWheel(event: WheelEvent): void {
    if (this.#displayMode === "continuous") {
      if (event.ctrlKey) event.preventDefault();
      return;
    }
    if (event.ctrlKey) {
      this.#zoomFromWheel(event);
      return;
    }
    if (!this.#document || !this.#wheelCanTurnPage(event.deltaX)) {
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
    if (gesture.direction) void this.#moveFromGesture(gesture.direction);
  }

  #wheelCanTurnPage(deltaX: number): boolean {
    if (this.#zoom <= 1.01 || performance.now() < this.#wheelPagingState.lockedUntil) return true;
    const edges = pdfHorizontalPageEdges(this.#elements.reader);
    return deltaX < 0 ? edges.previous : deltaX > 0 && edges.next;
  }

  #zoomFromWheel(event: WheelEvent): void {
    event.preventDefault();
    this.#lifecycle.send({ type: "CANCEL_RENDER" });
    this.#previewZoom(clamp(this.#zoom * Math.exp(-event.deltaY * 0.01), 0.75, 4), event.clientX, event.clientY);
    window.clearTimeout(this.#wheelZoomRenderTimer);
    this.#wheelZoomRenderTimer = window.setTimeout(() => {
      this.#wheelZoomRenderTimer = undefined;
      void this.#renderPage();
    }, 140);
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
    const availableWidth = this.#fittedWidth ?? this.#availablePageWidth();
    this.#fittedWidth = availableWidth;
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
    this.#presentPageNavigation(documentModel.numPages);
    this.#elements.status.textContent =
      this.#mode === "private-highlight"
        ? "Private library PDF · select text to highlight"
        : this.#mode === "read-only"
          ? "Shared project PDF · read only"
          : "Select text to capture evidence";
    this.#lifecycle.send({ type: "RENDERED", renderRequest });
    this.#onPageChange(this.#pageNumber);
  }

  #presentContinuousPage(page: number): void {
    const documentModel = this.#document;
    if (!documentModel) return;
    this.#pageNumber = clamp(page, 1, documentModel.numPages);
    this.#presentPageNavigation(documentModel.numPages);
    this.#elements.status.textContent =
      this.#mode === "private-highlight"
        ? "Continuous view · select text to highlight"
        : this.#mode === "read-only"
          ? "Continuous view · shared project PDF"
          : "Continuous view · select text to capture evidence";
    this.#onPageChange(this.#pageNumber);
  }

  #syncDisplayModeControls(): void {
    const continuous = this.#displayMode === "continuous";
    for (const button of this.#elements.continuousModeButtons) {
      button.setAttribute("aria-pressed", String(continuous));
      button.title = continuous ? "Use single-page view" : "Use continuous scrolling";
      const label = button.querySelector("[data-pdf-display-label]");
      if (label) label.textContent = continuous ? "Single page" : "Continuous scroll";
    }
  }

  #bindPageJump(indicator: HTMLElement): void {
    const button = indicator.querySelector<HTMLButtonElement>(".pdf-page-jump-display");
    const input = indicator.querySelector<HTMLInputElement>(".pdf-page-jump-input");
    if (!button || !input) return;
    button.addEventListener("click", () => {
      button.hidden = true;
      input.hidden = false;
      input.value = String(this.#pageNumber);
      input.focus();
      input.select();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.#closePageJump(button, input);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const page = Number(input.value);
        this.#closePageJump(button, input);
        if (Number.isInteger(page)) void this.#goToPage(page);
      }
    });
    input.addEventListener("blur", () => this.#closePageJump(button, input));
  }

  #closePageJump(button: HTMLButtonElement, input: HTMLInputElement): void {
    input.hidden = true;
    button.hidden = false;
  }

  #presentPageNavigation(totalPages: number): void {
    for (const indicator of this.#elements.pageIndicators) {
      const current = indicator.querySelector<HTMLElement>("[data-pdf-page-current]");
      const total = indicator.querySelector<HTMLElement>("[data-pdf-page-total]");
      const button = indicator.querySelector<HTMLButtonElement>(".pdf-page-jump-display");
      const input = indicator.querySelector<HTMLInputElement>(".pdf-page-jump-input");
      if (current) current.textContent = String(this.#pageNumber);
      if (total) total.textContent = String(totalPages);
      if (button) button.setAttribute("aria-label", `Page ${this.#pageNumber} of ${totalPages}. Go to a specific PDF page`);
      if (input) {
        input.max = String(totalPages);
        if (document.activeElement !== input) input.value = String(this.#pageNumber);
      }
    }
    for (const button of this.#elements.previousPages) button.disabled = this.#pageNumber === 1;
    for (const button of this.#elements.nextPages) button.disabled = this.#pageNumber === totalPages;
  }

  #availablePageWidth(): number {
    const readerStyle = window.getComputedStyle(this.#elements.reader);
    const horizontalPadding = (Number.parseFloat(readerStyle.paddingLeft) || 0) + (Number.parseFloat(readerStyle.paddingRight) || 0);
    const readerWidth = this.#elements.reader.clientWidth || 760;
    return Math.max(320, Math.min(900, readerWidth - horizontalPadding));
  }

  #failRender(renderRequest: number, error: unknown): void {
    const message = error instanceof Error ? error.message : "Could not render the PDF page";
    this.#lifecycle.send({ type: "RENDER_FAILED", renderRequest, message });
    if (this.#lifecycle.getSnapshot().matches("failed")) this.#elements.status.textContent = message;
  }

  #queueSelectionCapture(): void {
    window.clearTimeout(this.#selectionCaptureTimer);
    if (this.#mode === "read-only" || this.#textSelectionMode !== "highlight") return;
    if (this.#selectionPointerActive) return;
    this.#selectionCaptureTimer = window.setTimeout(() => this.#captureSelection(), this.#selectionSettleDelay);
  }

  #startTextSelection(event: PointerEvent): void {
    window.clearTimeout(this.#selectionCaptureTimer);
    this.#selectionPointerActive = true;
    this.#selectionSettleDelay = event.pointerType === "touch" ? 700 : 80;
  }

  #finishTextSelection(): void {
    this.#selectionPointerActive = false;
    this.#queueSelectionCapture();
  }

  #cancelTextSelection(): void {
    window.clearTimeout(this.#selectionCaptureTimer);
    this.#selectionPointerActive = false;
  }

  #captureSelection(): void {
    this.#selectionCaptureTimer = undefined;
    this.#selectionSettleDelay = 80;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const source = this.#selectionSource(range.commonAncestorContainer);
    if (!source) return;
    const maximumRects = this.#mode === "private-highlight" ? 512 : 64;
    const rects = normalizeSelectionRects(range.getClientRects(), source.element.getBoundingClientRect(), maximumRects);
    const context = deriveTextQuoteContext(source.text, selection.toString());
    if (!context.quote || rects.length === 0) return;
    const capture = { page: source.page, ...context, rects };
    if (sameSelectionCapture(capture, this.#draftSelection)) return;
    this.#draftSelection = capture;
    this.#renderHighlights();
    this.#continuousView.refreshOverlays();
    this.#onSelection(this.#draftSelection);
    this.#elements.status.textContent =
      this.#mode === "private-highlight"
        ? `Private selection captured from page ${source.page}`
        : `${rects.length} ${rects.length === 1 ? "line" : "lines"} captured from page ${source.page}`;
    if (this.#mode === "evidence") selection.removeAllRanges();
  }

  #selectionSource(node: Node): { element: HTMLElement; page: number; text: string } | null {
    if (this.#displayMode === "continuous") {
      const view = this.#continuousView.pageViewForNode(node);
      return view ? { element: view.pageElement, page: view.page, text: view.text } : null;
    }
    return this.#elements.textLayer.contains(node) ? { element: this.#elements.page, page: this.#pageNumber, text: this.#pageText } : null;
  }

  #clearNativeSelection(): void {
    const selection = window.getSelection();
    if (
      selection?.anchorNode &&
      (this.#elements.textLayer.contains(selection.anchorNode) || this.#elements.continuousPages.contains(selection.anchorNode))
    )
      selection.removeAllRanges();
  }

  #renderHighlights(): void {
    this.#renderHighlightsForPage(this.#pageNumber, this.#elements.highlights);
  }

  #renderHighlightsForPage(page: number, container: HTMLElement): void {
    container.replaceChildren();
    for (const annotation of this.#annotations.filter((item) => item.page === page)) {
      const fragments =
        annotation.fragments.length > 0 ? annotation.fragments : [{ id: `legacy-${annotation.id}`, rects: annotation.rects }];
      for (const fragment of fragments) {
        for (const rect of fragment.rects) {
          const highlight = document.createElement("button");
          highlight.type = "button";
          highlight.className = "pdf-highlight";
          if (annotation.id === this.#focusedAnnotationId) highlight.dataset.focused = "true";
          positionPdfOverlay(highlight, rect);
          highlight.title = annotation.comment || annotation.quote;
          highlight.dataset.annotationId = annotation.id;
          highlight.dataset.fragmentId = fragment.id;
          highlight.addEventListener("click", () => this.#onHighlight(annotation.id, fragment.id));
          container.append(highlight);
        }
      }
    }
    for (const annotation of this.#privateHighlights.filter((item) => item.page === page)) {
      for (const rect of annotation.rects) {
        const highlight = document.createElement(this.#privateHighlightSelection ? "button" : "span");
        if (highlight instanceof HTMLButtonElement) highlight.type = "button";
        highlight.className = "pdf-highlight";
        highlight.dataset.private = "true";
        highlight.dataset.highlightId = annotation.id;
        if (annotation.id === this.#selectedPrivateHighlightId) highlight.dataset.selected = "true";
        positionPdfOverlay(highlight, rect);
        highlight.title = annotation.comment || annotation.quote;
        if (this.#privateHighlightSelection) highlight.addEventListener("click", () => this.#onPrivateHighlight(annotation.id));
        container.append(highlight);
      }
    }
    if (this.#draftSelection?.page === page) {
      for (const rect of this.#draftSelection.rects) {
        const highlight = document.createElement("span");
        highlight.className = "pdf-highlight";
        highlight.dataset.draft = "true";
        positionPdfOverlay(highlight, rect);
        container.append(highlight);
      }
    }
  }

  #startTouchGesture(event: TouchEvent): void {
    if (this.#displayMode === "continuous") return;
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
      this.#swipeStart = {
        x: touch.clientX,
        y: touch.clientY,
        startedAt: performance.now(),
        edges: pdfHorizontalPageEdges(this.#elements.reader),
      };
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
    const direction = pdfTouchPageDirection(
      start,
      { x: touch.clientX, y: touch.clientY, endedAt: performance.now() },
      this.#zoom,
      start.edges,
    );
    if (direction) await this.#moveFromGesture(direction);
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
    this.#elements.reader.dataset.zoomed = String(zoom > 1.01);
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

  #renderPdfLinks(
    viewport: { convertToViewportPoint(x: number, y: number): number[] },
    annotations: readonly unknown[],
    container: HTMLElement = this.#elements.links,
  ): void {
    container.replaceChildren();
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
      container.append(link);
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
    if (this.#displayMode === "continuous") return;
    this.#scrollToPdfDestination(destination);
  }

  async #goToPage(page: number): Promise<void> {
    if (!this.#document) return;
    const next = clamp(page, 1, this.#document.numPages);
    if (next === this.#pageNumber) {
      if (this.#displayMode === "continuous") this.#continuousView.scrollToPage(next);
      return;
    }
    this.#pageNumber = next;
    this.#focusedAnnotationId = undefined;
    this.#draftSelection = null;
    this.#zoomAnchor = null;
    window.clearTimeout(this.#wheelZoomRenderTimer);
    this.#wheelZoomRenderTimer = undefined;
    if (this.#displayMode === "continuous") {
      this.#continuousView.scrollToPage(next);
      this.#presentContinuousPage(next);
    } else await this.#renderPage();
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

function requiredViewerElement<T extends Element>(root: Document, id: string, type: { new (): T }): T {
  const element = root.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Missing PDF viewer element #${id}`);
  return element;
}

function pdfKeyboardTargetOwnsArrowKeys(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'a, button, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="grid"], [role="listbox"], [role="menu"], [role="slider"], [role="spinbutton"], [role="tab"], [role="textbox"], [role="tree"]',
    ),
  );
}

function positionPdfOverlay(element: HTMLElement, rect: PdfSelectionRect): void {
  element.style.left = `${rect.x * 100}%`;
  element.style.top = `${rect.y * 100}%`;
  element.style.width = `${rect.width * 100}%`;
  element.style.height = `${rect.height * 100}%`;
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

export function searchPdfPageTexts(
  pages: readonly { readonly page: number; readonly text: string }[],
  sourceQuery: string,
): PdfSearchResult[] {
  const query = sourceQuery.trim().toLocaleLowerCase();
  if (query.length < 2) return [];
  const results: PdfSearchResult[] = [];
  for (const page of pages) {
    const text = page.text.replaceAll(/\s+/gu, " ").trim();
    const lower = text.toLocaleLowerCase();
    let cursor = 0;
    let occurrences = 0;
    let first = -1;
    while ((cursor = lower.indexOf(query, cursor)) >= 0) {
      if (first < 0) first = cursor;
      occurrences += 1;
      cursor += Math.max(1, query.length);
    }
    if (first < 0) continue;
    const start = Math.max(0, first - 72);
    const end = Math.min(text.length, first + query.length + 112);
    results.push({
      page: page.page,
      excerpt: `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`,
      occurrences,
    });
    if (results.length >= 200) break;
  }
  return results;
}

const pdfDisplayModeStorageKey = "kirjolab.pdf.display-mode";

function readPdfDisplayMode(): PdfDisplayMode {
  try {
    return window.localStorage.getItem(pdfDisplayModeStorageKey) === "continuous" ? "continuous" : "single";
  } catch {
    return "single";
  }
}

function writePdfDisplayMode(mode: PdfDisplayMode): void {
  try {
    window.localStorage.setItem(pdfDisplayModeStorageKey, mode);
  } catch {
    // Viewing still works when storage is unavailable.
  }
}
