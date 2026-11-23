import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { AnnotationResource, PdfSelectionRect } from "../../domain/workspace/workspace";
import type { LibraryHighlight } from "../../domain/reference-library";
import { deriveTextQuoteContext, normalizeSelectionRects } from "./pdf-selection";
import { readPdfTextContent } from "./pdf-text-content";
import { PdfComponentView } from "./pdf-component-view";
import type { PdfSearchResult } from "./pdf-search-panel";
import type { PdfOutlineItem } from "./pdf-navigation-panel";
import { isArtifactAnalysis, isPdfTextAnalysisResult } from "../../domain/reference-library";
import {
  advancePdfWheelPaging,
  initialPdfWheelPagingState,
  pdfHorizontalPageEdges,
  pdfKeyboardPageDirection,
  pdfTouchPageDirection,
  pdfTouchPanScroll,
  type PdfTouchPanStart,
  type PdfWheelPagingState,
} from "./pdf-gestures";
import { loadPdfJsRuntime, type PdfJsRuntime } from "./pdfjs-runtime";
import { createPdfViewerActor, pdfViewerDocumentRequestActive } from "./pdf-viewer-machine";
import { pdfFailureMessage } from "./pdf-status";

export interface PdfSelectionCapture {
  page: number;
  quote: string;
  prefix: string;
  suffix: string;
  rects: PdfSelectionRect[];
}

interface PdfViewerElements {
  reader: HTMLDivElement;
  container: HTMLDivElement;
  primaryMarkup: HTMLElement;
  continuousModeButtons: readonly HTMLButtonElement[];
  fitModeButtons: readonly HTMLButtonElement[];
  rotateButtons: readonly HTMLButtonElement[];
  spreadButtons: readonly HTMLButtonElement[];
  zoomInButtons: readonly HTMLButtonElement[];
  zoomOutButtons: readonly HTMLButtonElement[];
  pageIndicators: readonly HTMLElement[];
  previousPages: readonly HTMLButtonElement[];
  nextPages: readonly HTMLButtonElement[];
  status: HTMLElement;
}

interface PdfViewerPresentation {
  activateProjectHighlight(annotationId: string, fragmentId: string): void;
  capturePdfSelection(capture: PdfSelectionCapture): void;
  createPdfPageOverlay(page: number): HTMLElement | null;
  presentPdfPage(page: number): void;
  selectLibraryHighlight(highlightId: string): void;
}

interface OpenPdfOptions {
  artifactId?: string;
  documentKey?: string;
  url: string;
  annotations: AnnotationResource[];
  page?: number;
  focusAnnotationId?: string;
  mode?: "evidence" | "private-highlight" | "read-only";
  privateHighlights?: readonly LibraryHighlight[];
}

export type PdfTextSelectionMode = "copy" | "disabled" | "highlight";
export type PdfDisplayMode = "continuous" | "single" | "spread";
export type PdfFitMode = "actual" | "page" | "width";
type PdfViewerStatusState = "busy" | "error" | "ready";

export class PdfEvidenceViewer {
  readonly #elements: PdfViewerElements;
  readonly #onSelection: (capture: PdfSelectionCapture) => void;
  readonly #onHighlight: (annotationId: string, fragmentId: string) => void;
  readonly #onPageChange: (page: number) => void;
  readonly #onPrivateHighlight: (highlightId: string) => void;
  readonly #view: PdfComponentView;
  readonly #lifecycle = createPdfViewerActor();
  #document: PDFDocumentProxy | null = null;
  #loadingTask: PDFDocumentLoadingTask | null = null;
  #annotations: AnnotationResource[] = [];
  #privateHighlights: readonly LibraryHighlight[] = [];
  #pageNumber = 1;
  #focusedAnnotationId: string | undefined;
  #draftSelection: PdfSelectionCapture | null = null;
  #mode: "evidence" | "private-highlight" | "read-only" = "evidence";
  #privateHighlightSelection = false;
  #textSelectionMode: PdfTextSelectionMode = "highlight";
  #selectedPrivateHighlightId: string | null = null;
  #zoom = 1;
  #pinchStart: { distance: number; zoom: number; midpoint: { x: number; y: number } } | null = null;
  #tool: "paint" | "erase" = "paint";
  #touchPanStart: PdfTouchPanStart | null = null;
  #swipeStart: { x: number; y: number; startedAt: number; edges: ReturnType<typeof pdfHorizontalPageEdges> } | null = null;
  #wheelPagingState: PdfWheelPagingState = initialPdfWheelPagingState();
  #selectionCaptureTimer: number | undefined;
  #selectionPointerActive = false;
  #selectionSettleDelay = 80;
  #displayMode: PdfDisplayMode = readPdfDisplayMode();
  #searchTextCache: readonly { readonly page: number; readonly text: string }[] | null = null;
  #documentKey = "";
  #artifactId = "";
  #fitMode: PdfFitMode = "width";
  #rotation = 0;

  static forDocument(root: Document, presentation: PdfViewerPresentation): PdfEvidenceViewer {
    return new PdfEvidenceViewer(
      {
        reader: requiredViewerElement(root, "paper-reader", HTMLDivElement),
        container: requiredViewerElement(root, "paper-continuous-pages", HTMLDivElement),
        primaryMarkup: requiredViewerElement(root, "paper-markups", HTMLElement),
        continuousModeButtons: [
          requiredViewerElement(root, "toggle-paper-continuous", HTMLButtonElement),
          requiredViewerElement(root, "toggle-library-paper-continuous", HTMLButtonElement),
        ],
        fitModeButtons: pdfButtons(root, "pdf-fit-mode"),
        rotateButtons: pdfButtons(root, "pdf-rotate"),
        spreadButtons: pdfButtons(root, "pdf-spread"),
        zoomInButtons: pdfButtons(root, "pdf-zoom-in"),
        zoomOutButtons: pdfButtons(root, "pdf-zoom-out"),
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
      (page) => presentation.createPdfPageOverlay(page),
    );
  }

  constructor(
    elements: PdfViewerElements,
    onSelection: (capture: PdfSelectionCapture) => void,
    onHighlight: (annotationId: string, fragmentId: string) => void,
    onPageChange: (page: number) => void = () => undefined,
    onPrivateHighlight: (highlightId: string) => void = () => undefined,
    createPageOverlay: (page: number) => HTMLElement | null = () => null,
  ) {
    this.#elements = elements;
    this.#onSelection = onSelection;
    this.#onHighlight = onHighlight;
    this.#onPageChange = onPageChange;
    this.#onPrivateHighlight = onPrivateHighlight;
    this.#view = new PdfComponentView({
      reader: elements.reader,
      container: elements.container,
      primaryMarkup: elements.primaryMarkup,
      createPageOverlay,
      onPageChange: (page) => this.#presentPage(page),
      onError: (error) => this.showError(error),
      renderHighlights: (page, container) => this.#renderHighlightsForPage(page, container),
    });
    for (const button of elements.previousPages) button.addEventListener("click", () => void this.#move(-1));
    for (const button of elements.nextPages) button.addEventListener("click", () => void this.#move(1));
    for (const indicator of elements.pageIndicators) this.#bindPageJump(indicator);
    for (const button of elements.continuousModeButtons) {
      button.addEventListener("click", () => void this.setDisplayMode(this.#displayMode === "continuous" ? "single" : "continuous"));
    }
    for (const button of elements.fitModeButtons) button.addEventListener("click", () => void this.cycleFitMode());
    for (const button of elements.rotateButtons) button.addEventListener("click", () => void this.rotateClockwise());
    for (const button of elements.spreadButtons) {
      button.addEventListener("click", () => void this.setDisplayMode(this.#displayMode === "spread" ? "single" : "spread"));
    }
    for (const button of elements.zoomInButtons) button.addEventListener("click", () => void this.adjustZoom(0.25));
    for (const button of elements.zoomOutButtons) button.addEventListener("click", () => void this.adjustZoom(-0.25));
    elements.container.addEventListener("pointerdown", (event) => this.#startTextSelection(event));
    elements.container.addEventListener("pointerup", () => this.#finishTextSelection());
    elements.container.addEventListener("pointercancel", () => this.#cancelTextSelection());
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
    if (mode === this.#displayMode) return;
    this.#cancelTouchGesture();
    this.#displayMode = mode;
    writePdfDisplayMode(mode);
    this.#syncDisplayModeControls();
    this.clearDraftSelection();
    this.#view.setDisplayMode(mode);
  }

  async adjustZoom(delta: number): Promise<void> {
    this.#applyZoom(adjustPdfZoom(this.#zoom, delta));
  }

  #applyZoom(zoom: number, origin?: [number, number], pan?: [number, number]): void {
    const factor = zoom / this.#zoom;
    this.#zoom = zoom;
    this.#elements.reader.dataset.zoomed = String(Math.abs(zoom - 1) > 0.01);
    this.#view.zoomBy(factor, origin, pan);
  }

  async cycleFitMode(): Promise<void> {
    this.#fitMode = nextPdfFitMode(this.#fitMode);
    this.#zoom = 1;
    this.#elements.reader.dataset.zoomed = "false";
    this.#syncReadingControls();
    this.#view.setFitMode(this.#fitMode);
  }

  async rotateClockwise(): Promise<void> {
    this.#rotation = nextPdfRotation(this.#rotation);
    this.#view.setRotation(this.#rotation);
  }

  async open(options: OpenPdfOptions): Promise<boolean> {
    this.#cancelTouchGesture();
    this.#document = null;
    this.#clearNativeSelection();
    this.#view.close();
    this.#lifecycle.send({ type: "OPEN" });
    const documentRequest = this.#lifecycle.getSnapshot().context.documentRequest;
    const previousTask = this.#loadingTask;
    this.#loadingTask = null;
    await previousTask?.destroy();
    if (!pdfViewerDocumentRequestActive(this.#lifecycle.getSnapshot(), documentRequest)) return false;
    this.#documentKey = options.documentKey ?? options.url;
    this.#artifactId = options.artifactId ?? "";
    this.#searchTextCache = null;
    this.#syncDisplayModeControls();
    this.#syncReadingControls();
    this.#annotations = options.annotations;
    this.#privateHighlights = options.privateHighlights ?? [];
    this.#focusedAnnotationId = options.focusAnnotationId;
    this.#cancelTextSelection();
    this.#draftSelection = null;
    this.#mode = options.mode ?? "evidence";
    this.#zoom = 1;
    this.#wheelPagingState = initialPdfWheelPagingState();
    this.#elements.reader.dataset.zoomed = "false";
    this.#setStatus("Loading PDF…", "busy");
    let runtime: PdfJsRuntime;
    try {
      runtime = await loadPdfJsRuntime();
    } catch (error) {
      if (!pdfViewerDocumentRequestActive(this.#lifecycle.getSnapshot(), documentRequest)) return false;
      const message = error instanceof Error ? error.message : "Could not load the PDF runtime";
      this.#lifecycle.send({ type: "OPEN_FAILED", documentRequest, message });
      throw error;
    }
    if (!pdfViewerDocumentRequestActive(this.#lifecycle.getSnapshot(), documentRequest)) return false;
    this.#lifecycle.send({ type: "RUNTIME_READY", documentRequest });
    if (!this.#lifecycle.getSnapshot().matches("loadingDocument")) return false;
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
    if (!pdfViewerDocumentRequestActive(this.#lifecycle.getSnapshot(), documentRequest)) return false;
    this.#document = documentModel;
    this.#pageNumber = clamp(options.page ?? 1, 1, documentModel.numPages);
    this.#lifecycle.send({ type: "DOCUMENT_READY", documentRequest, page: this.#pageNumber, pages: documentModel.numPages });
    if (!this.#lifecycle.getSnapshot().matches("ready")) {
      await loadingTask.destroy();
      return false;
    }
    this.#lifecycle.send({ type: "RENDER", page: this.#pageNumber });
    const renderRequest = this.#lifecycle.getSnapshot().context.renderRequest;
    try {
      await this.#view.open(documentModel, {
        page: this.#pageNumber,
        mode: this.#displayMode,
        fit: this.#fitMode,
        rotation: this.#rotation,
      });
    } catch (error) {
      if (!pdfViewerDocumentRequestActive(this.#lifecycle.getSnapshot(), documentRequest)) return false;
      this.#lifecycle.send({ type: "RENDER_FAILED", renderRequest, message: pdfFailureMessage("viewer") });
      throw error;
    }
    if (!pdfViewerDocumentRequestActive(this.#lifecycle.getSnapshot(), documentRequest)) return false;
    this.#lifecycle.send({ type: "RENDERED", renderRequest });
    this.#presentPage(this.#view.currentPage);
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
        const content = await readPdfTextContent(page);
        if (documentModel !== this.#document) return [];
        pages.push({ page: pageNumber, text: content.items.map((item) => ("str" in item ? item.str : "")).join(" ") });
      }
      this.#searchTextCache = pages;
    }
    let pages = this.#searchTextCache;
    if (this.#artifactId && pages.every(({ text }) => text.trim().length < 24)) {
      const response = await fetch(`/api/library/pdfs/${encodeURIComponent(this.#artifactId)}/analyses/pdf-text`, {
        credentials: "same-origin",
      });
      if (response.ok) {
        const value: unknown = await response.json();
        if (isArtifactAnalysis(value) && value.kind === "pdf-text" && value.status === "ready" && isPdfTextAnalysisResult(value.result)) {
          pages = value.result.pages.map(({ page, text }) => ({ page, text }));
        }
      }
    }
    return documentModel === this.#document ? searchPdfPageTexts(pages, query) : [];
  }

  async goToPage(page: number): Promise<void> {
    await this.#goToPage(page);
  }

  get documentKey(): string {
    return this.#documentKey;
  }

  async navigation(): Promise<{ readonly outline: readonly PdfOutlineItem[]; readonly pages: number }> {
    const documentModel = this.#document;
    if (!documentModel) return { outline: [], pages: 0 };
    const outline = await documentModel.getOutline();
    return { outline: await this.#resolveOutline(documentModel, outline ?? []), pages: documentModel.numPages };
  }

  async thumbnail(pageNumber: number): Promise<string> {
    const documentModel = this.#document;
    if (!documentModel) return "";
    const page = await documentModel.getPage(clamp(pageNumber, 1, documentModel.numPages));
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 128 / unscaled.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.72);
  }

  async #resolveOutline(documentModel: PDFDocumentProxy, items: readonly unknown[]): Promise<PdfOutlineItem[]> {
    const resolved: PdfOutlineItem[] = [];
    for (const value of items) {
      if (!isPdfOutlineSource(value)) continue;
      let destination = value.dest;
      if (typeof destination === "string") destination = await documentModel.getDestination(destination);
      const reference = Array.isArray(destination) ? destination[0] : null;
      let page: number | null = null;
      if (reference && typeof reference === "object") {
        try {
          page = (await documentModel.getPageIndex(reference)) + 1;
        } catch {
          page = null;
        }
      }
      resolved.push({ title: value.title, page, children: await this.#resolveOutline(documentModel, value.items ?? []) });
    }
    return resolved;
  }

  updateAnnotations(annotations: AnnotationResource[]): void {
    this.#annotations = annotations;
    this.#view.refreshOverlays();
  }

  updatePrivateHighlights(highlights: readonly LibraryHighlight[]): void {
    this.#privateHighlights = highlights;
    this.#view.refreshOverlays();
  }

  showError(_error: unknown): void {
    this.#setStatus(pdfFailureMessage("viewer"), "error");
  }

  setTextSelectionMode(mode: PdfTextSelectionMode): void {
    this.#textSelectionMode = mode;
    this.#view.setTextSelectionEnabled(mode !== "disabled");
  }

  clearDraftSelection(): void {
    window.clearTimeout(this.#selectionCaptureTimer);
    this.#clearNativeSelection();
    this.#draftSelection = null;
    this.#view.refreshOverlays();
  }

  setTool(tool: "paint" | "erase"): void {
    this.#tool = tool;
    this.#view.refreshOverlays();
  }

  setPrivateHighlightSelection(enabled: boolean, selectedId: string | null = null): void {
    this.#privateHighlightSelection = enabled;
    this.#selectedPrivateHighlightId = selectedId;
    this.#view.refreshOverlays();
  }

  async resize(): Promise<void> {
    this.#view.resize();
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
    if (event.ctrlKey) {
      event.preventDefault();
      if (this.#document && !this.#pinchStart) this.#zoomFromWheel(event);
      return;
    }
    if (this.#displayMode !== "single") return;
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
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.#elements.reader.clientHeight : 1);
    this.#applyZoom(clamp(this.#zoom * Math.exp(-delta * 0.01), 0.5, 4), [event.clientX, event.clientY]);
  }

  #presentPage(page: number): void {
    if (!this.#document || !this.#lifecycle.getSnapshot().matches("ready")) return;
    if (this.#pageNumber !== page) {
      const hadSelection = this.#draftSelection !== null || this.#focusedAnnotationId !== undefined;
      this.#draftSelection = null;
      this.#focusedAnnotationId = undefined;
      if (hadSelection) this.#view.refreshOverlays();
    }
    this.#pageNumber = page;
    this.#setStatus(
      this.#mode === "private-highlight"
        ? "Private library PDF · select text to highlight"
        : this.#mode === "read-only"
          ? "Shared project PDF · read only"
          : "Select text to capture evidence",
      "ready",
    );
    this.#onPageChange(page);
  }

  #syncDisplayModeControls(): void {
    this.#elements.reader.dataset.displayMode = this.#displayMode;
    const continuous = this.#displayMode === "continuous";
    for (const button of this.#elements.continuousModeButtons) {
      button.setAttribute("aria-pressed", String(continuous));
      button.title = continuous ? "Use single-page view" : "Use continuous scrolling";
      const label = button.querySelector("[data-pdf-display-label]");
      if (label) label.textContent = continuous ? "Single page" : "Continuous scroll";
    }
    for (const button of this.#elements.spreadButtons) button.setAttribute("aria-pressed", String(this.#displayMode === "spread"));
  }

  #syncReadingControls(): void {
    const label = this.#fitMode === "width" ? "Fit width" : this.#fitMode === "page" ? "Fit page" : "Actual size";
    for (const button of this.#elements.fitModeButtons) {
      button.title = label;
      const text = button.querySelector("[data-pdf-fit-label]");
      if (text) text.textContent = label;
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

  #setStatus(message: string, state: PdfViewerStatusState): void {
    this.#elements.status.textContent = message;
    this.#elements.status.dataset.state = state;
    const busy = state === "busy";
    this.#elements.reader.setAttribute("aria-busy", String(busy));
    const readingControls = [
      ...this.#elements.continuousModeButtons,
      ...this.#elements.fitModeButtons,
      ...this.#elements.rotateButtons,
      ...this.#elements.spreadButtons,
      ...this.#elements.zoomInButtons,
      ...this.#elements.zoomOutButtons,
    ];
    const documentModel = this.#document;
    const unavailable = busy || !documentModel;
    for (const button of readingControls) button.disabled = unavailable;
    if (unavailable) {
      for (const button of [...this.#elements.previousPages, ...this.#elements.nextPages]) button.disabled = true;
    } else {
      this.#presentPageNavigation(documentModel.numPages);
    }
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
    const source = this.#view.selectionSource(range.commonAncestorContainer);
    if (!source) return;
    const maximumRects = this.#mode === "private-highlight" ? 512 : 64;
    const rects = normalizeSelectionRects(range.getClientRects(), source.element.getBoundingClientRect(), maximumRects);
    const context = deriveTextQuoteContext(source.text, selection.toString());
    if (!context.quote || rects.length === 0) return;
    const capture = { page: source.page, ...context, rects };
    if (sameSelectionCapture(capture, this.#draftSelection)) return;
    this.#draftSelection = capture;
    this.#view.refreshOverlays();
    this.#onSelection(this.#draftSelection);
    this.#setStatus(
      this.#mode === "private-highlight"
        ? `Private selection captured from page ${source.page}`
        : `${rects.length} ${rects.length === 1 ? "line" : "lines"} captured from page ${source.page}`,
      "ready",
    );
    if (this.#mode === "evidence") selection.removeAllRanges();
  }

  #clearNativeSelection(): void {
    const selection = window.getSelection();
    if (selection?.anchorNode && this.#elements.container.contains(selection.anchorNode)) selection.removeAllRanges();
  }

  #renderHighlightsForPage(page: number, container: HTMLElement): void {
    container.dataset.tool = this.#tool;
    container.dataset.privateSelect = String(this.#privateHighlightSelection);
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
    if (this.#readerHasActiveDrawing(event)) {
      event.preventDefault();
      this.#touchPanStart = null;
      this.#swipeStart = null;
      return;
    }
    if (event.touches.length === 2) {
      event.preventDefault();
      this.#pinchStart = { distance: touchDistance(event.touches), zoom: this.#zoom, midpoint: touchMidpoint(event.touches) };
      this.#touchPanStart = null;
      this.#swipeStart = null;
      return;
    }
    const touch = event.touches[0];
    if (event.touches.length === 1 && touch && touchStartsDrawSurfacePan(event.target)) {
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
    if (this.#displayMode !== "single") return;
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
    if (this.#readerHasActiveDrawing(event)) {
      event.preventDefault();
      return;
    }
    if (event.touches.length === 2 && this.#pinchStart) {
      event.preventDefault();
      const zoom = clamp(this.#pinchStart.zoom * (touchDistance(event.touches) / this.#pinchStart.distance), 0.5, 4);
      const midpoint = touchMidpoint(event.touches);
      const previous = this.#pinchStart.midpoint;
      this.#applyZoom(zoom, [previous.x, previous.y], [midpoint.x - previous.x, midpoint.y - previous.y]);
      this.#pinchStart.midpoint = midpoint;
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
    const pinchStart = this.#pinchStart;
    if (pinchStart && event.touches.length < 2) {
      this.#pinchStart = null;
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
    if (this.#pinchStart) {
      const { zoom, midpoint } = this.#pinchStart;
      this.#applyZoom(zoom, [midpoint.x, midpoint.y]);
    }
    this.#pinchStart = null;
    this.#touchPanStart = null;
    this.#swipeStart = null;
  }

  #readerHasActiveDrawing(event: TouchEvent): boolean {
    return (
      this.#elements.reader.querySelector('.pdf-markups[data-drawing-active="true"]') !== null ||
      (event.target instanceof Element && event.target.closest('.pdf-markups[data-drawing-active="true"]') !== null)
    );
  }

  async #goToPage(page: number): Promise<void> {
    if (!this.#document) return;
    this.#view.goToPage(clamp(page, 1, this.#document.numPages));
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

function touchStartsInteractivePdfControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      "a[href], button, input, select, textarea, summary, [contenteditable]:not([contenteditable='false']), [role='button'], [role='link'], .pdf-link, .pdf-note-pin, .pdf-ink-stroke, .pdf-highlight[data-private='true']",
    ) !== null
  );
}

function touchStartsDrawSurfacePan(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('.pdf-markups[data-tool="draw"]') !== null &&
    (target.closest(".pdf-note-pin") !== null || !touchStartsInteractivePdfControl(target))
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

export function nextPdfFitMode(mode: PdfFitMode): PdfFitMode {
  return mode === "width" ? "page" : mode === "page" ? "actual" : "width";
}

export function adjustPdfZoom(zoom: number, delta: number): number {
  return clamp(zoom + delta, 0.5, 4);
}

export function nextPdfRotation(rotation: number): number {
  return (rotation + 90) % 360;
}

function pdfButtons(root: Document, suffix: string): HTMLButtonElement[] {
  return [requiredViewerElement(root, suffix, HTMLButtonElement), requiredViewerElement(root, `library-${suffix}`, HTMLButtonElement)];
}

function isPdfOutlineSource(
  value: unknown,
): value is { readonly title: string; readonly dest: unknown; readonly items?: readonly unknown[] } {
  return typeof value === "object" && value !== null && "title" in value && typeof value.title === "string" && "dest" in value;
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
    const value = window.localStorage.getItem(pdfDisplayModeStorageKey);
    return value === "continuous" || value === "spread" ? value : "single";
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
