import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { readPdfTextContent } from "./pdf-text-content";
import type { PdfJsRuntime } from "./pdfjs-runtime";

export interface PdfContinuousPageView {
  readonly page: number;
  readonly pageElement: HTMLElement;
  frame: PdfContinuousPageFrame;
  pageOverlay: HTMLElement | null;
  renderedGeneration: number | null;
  text: string;
}

interface PdfContinuousPageFrame {
  readonly element: HTMLElement;
  readonly width: number;
  readonly canvas: HTMLCanvasElement;
  readonly links: HTMLElement;
  readonly highlights: HTMLElement;
  readonly textLayer: HTMLElement;
}

interface PdfContinuousViewOptions {
  readonly container: HTMLElement;
  readonly createPageOverlay?: (page: number) => HTMLElement | null;
  readonly reader: HTMLElement;
  readonly onPageChange: (page: number) => void;
  readonly renderOverlays: (
    view: PdfContinuousPageView,
    viewport: { convertToViewportPoint(x: number, y: number): number[] },
    annotations: readonly unknown[],
  ) => void;
}

type PdfContinuousDocument = Pick<PDFDocumentProxy, "getPage" | "numPages">;
type PdfContinuousRuntime = Pick<PdfJsRuntime, "TextLayer">;

export class PdfContinuousView {
  readonly #container: HTMLElement;
  readonly #createPageOverlay: NonNullable<PdfContinuousViewOptions["createPageOverlay"]>;
  readonly #reader: HTMLElement;
  readonly #onPageChange: (page: number) => void;
  readonly #renderOverlays: PdfContinuousViewOptions["renderOverlays"];
  readonly #views = new Map<number, PdfContinuousPageView>();
  readonly #rendering = new Map<number, Promise<void>>();
  #document: PdfContinuousDocument | null = null;
  #runtime: PdfContinuousRuntime | null = null;
  #observer: IntersectionObserver | null = null;
  #generation = 0;
  #layoutGeneration = 0;
  #currentPage = 1;
  #textLayerPointerEvents = "auto";
  #scrollFrame: number | undefined;
  #rotation = 0;

  constructor(options: PdfContinuousViewOptions) {
    this.#container = options.container;
    this.#createPageOverlay = options.createPageOverlay ?? (() => null);
    this.#reader = options.reader;
    this.#onPageChange = options.onPageChange;
    this.#renderOverlays = options.renderOverlays;
    this.#reader.addEventListener("scroll", () => this.#queueReadingPositionUpdate(), { passive: true });
  }

  get currentPage(): number {
    return this.#currentPage;
  }

  async open(
    documentModel: PdfContinuousDocument,
    runtime: PdfContinuousRuntime,
    initialPage: number,
    width: number,
    rotation = 0,
    scrollToInitialPage = true,
    afterLayout?: () => void,
  ): Promise<void> {
    const generation = ++this.#generation;
    const reuseViews = this.#document === documentModel && this.#views.size === documentModel.numPages;
    const retainFrames = rotation === this.#rotation;
    this.#observer?.disconnect();
    this.#observer = null;
    this.#document = documentModel;
    this.#runtime = runtime;
    this.#currentPage = initialPage;
    this.#rotation = rotation;
    if (!reuseViews) this.#views.clear();
    this.#rendering.clear();
    if (!reuseViews) this.#container.replaceChildren();

    const initialPdfPage = await documentModel.getPage(initialPage);
    if (generation !== this.#generation) return;
    const initialUnscaled = initialPdfPage.getViewport({ scale: 1, rotation });
    const initialViewport = initialPdfPage.getViewport({ scale: width / initialUnscaled.width, rotation });
    if (reuseViews) {
      for (const view of this.#views.values()) {
        layoutPageView(view, initialViewport.width, initialViewport.height, this.#textLayerPointerEvents, retainFrames);
      }
    } else {
      for (let pageNumber = 1; pageNumber <= documentModel.numPages; pageNumber += 1) {
        const view = createPageView(pageNumber, initialViewport.width, initialViewport.height, this.#textLayerPointerEvents);
        this.#views.set(pageNumber, view);
        this.#container.append(view.pageElement);
      }
    }

    this.#layoutGeneration = generation;
    afterLayout?.();
    this.#observePages(generation);
    await this.#renderPage(initialPage, generation);
    if (generation !== this.#generation) return;
    if (scrollToInitialPage) this.scrollToPage(initialPage, "instant");
  }

  close(): void {
    this.#generation += 1;
    this.#observer?.disconnect();
    this.#observer = null;
    this.#document = null;
    this.#runtime = null;
    this.#views.clear();
    this.#rendering.clear();
    this.#container.replaceChildren();
  }

  async resize(width: number): Promise<void> {
    const documentModel = this.#document;
    const runtime = this.#runtime;
    if (!documentModel || !runtime) return;
    await this.open(documentModel, runtime, this.#currentPage, width, this.#rotation, false);
  }

  setTextSelectionEnabled(enabled: boolean): void {
    this.#textLayerPointerEvents = enabled ? "auto" : "none";
    for (const { frame } of this.#views.values()) frame.textLayer.style.pointerEvents = this.#textLayerPointerEvents;
  }

  refreshOverlays(): void {
    for (const view of this.#views.values()) {
      if (view.renderedGeneration === this.#generation) void this.#renderPage(view.page, this.#generation, true);
    }
  }

  pageViewForNode(node: Node): PdfContinuousPageView | null {
    const pageElement =
      node instanceof Element ? node.closest<HTMLElement>("[data-pdf-page]") : node.parentElement?.closest<HTMLElement>("[data-pdf-page]");
    const page = Number(pageElement?.dataset.pdfPage);
    return Number.isInteger(page) ? (this.#views.get(page) ?? null) : null;
  }

  pageAtPoint(x: number, y: number): HTMLElement | null {
    const element = this.#reader.ownerDocument.elementFromPoint(x, y);
    const hit = element && this.pageViewForNode(element);
    return hit?.pageElement ?? this.#views.get(this.#currentPage)?.pageElement ?? null;
  }

  scrollToPage(page: number, behavior: ScrollBehavior = "instant"): void {
    const view = this.#views.get(page);
    if (!view) return;
    view.pageElement.scrollIntoView({ behavior, block: "start" });
    this.#setCurrentPage(page);
    void this.#renderPage(page, this.#generation);
  }

  async ensurePageRendered(page: number): Promise<void> {
    await this.#renderPage(page, this.#generation);
  }

  #observePages(generation: number): void {
    if (typeof IntersectionObserver === "undefined") {
      for (const page of this.#views.keys()) void this.#renderPage(page, generation);
      return;
    }
    this.#observer = new IntersectionObserver(
      (entries) => {
        if (generation !== this.#generation) return;
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.pdfPage);
          if (!Number.isInteger(page)) continue;
          if (entry.isIntersecting) void this.#renderPage(page, generation);
          else if (Math.abs(page - this.#currentPage) > 3) this.#releasePage(page);
        }
      },
      { root: this.#reader, rootMargin: "120% 0px" },
    );
    for (const view of this.#views.values()) this.#observer.observe(view.pageElement);
  }

  async #renderPage(pageNumber: number, generation: number, overlaysOnly = false): Promise<void> {
    const pending = this.#rendering.get(pageNumber);
    if (pending) return pending;
    const view = this.#views.get(pageNumber);
    const documentModel = this.#document;
    const runtime = this.#runtime;
    if (!view || !documentModel || !runtime || generation !== this.#layoutGeneration || generation !== this.#generation) return;
    const task = this.#paintPage(view, generation, documentModel, runtime, overlaysOnly);
    this.#rendering.set(pageNumber, task);
    try {
      return await task;
    } finally {
      if (this.#rendering.get(pageNumber) === task) this.#rendering.delete(pageNumber);
    }
  }

  async #paintPage(
    view: PdfContinuousPageView,
    generation: number,
    documentModel: PdfContinuousDocument,
    runtime: PdfContinuousRuntime,
    overlaysOnly: boolean,
  ): Promise<void> {
    const page = await documentModel.getPage(view.page);
    if (generation !== this.#generation) return;
    const width = Number.parseFloat(view.pageElement.style.width);
    const unscaled = page.getViewport({ scale: 1, rotation: this.#rotation });
    const viewport = page.getViewport({ scale: width / unscaled.width, rotation: this.#rotation });
    const [annotations, replacement] = await Promise.all([
      page.getAnnotations({ intent: "display" }),
      !overlaysOnly && view.renderedGeneration !== generation ? this.#paintPageFrame(page, viewport, runtime, generation) : null,
    ]);
    if (generation !== this.#generation) return;

    if (replacement) {
      const { frame, text } = replacement;
      frame.textLayer.style.pointerEvents = this.#textLayerPointerEvents;
      view.pageElement.style.height = `${viewport.height}px`;
      view.frame.element.replaceWith(frame.element);
      view.frame = frame;
      view.text = text;
      view.renderedGeneration = generation;
    }
    if (!view.pageOverlay) this.#attachPageOverlay(view);
    this.#renderOverlays(view, viewport, annotations);
  }

  async #paintPageFrame(
    page: PDFPageProxy,
    viewport: ReturnType<PDFPageProxy["getViewport"]>,
    runtime: PdfContinuousRuntime,
    generation: number,
  ): Promise<{ frame: PdfContinuousPageFrame; text: string } | null> {
    const textContent = await readPdfTextContent(page);
    if (generation !== this.#generation) return null;
    const frame = createPageFrame(viewport.width, viewport.height);
    const outputScale = window.devicePixelRatio || 1;
    const { canvas } = frame;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    frame.textLayer.style.setProperty("--total-scale-factor", String(viewport.scale));
    const textLayer = new runtime.TextLayer({ textContentSource: textContent, container: frame.textLayer, viewport });
    await Promise.all([
      page.render({ canvas, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] }).promise,
      textLayer.render(),
    ]);
    const text = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ");
    return { frame, text };
  }

  #attachPageOverlay(view: PdfContinuousPageView): void {
    const overlay = this.#createPageOverlay(view.page);
    if (!overlay) return;
    view.pageOverlay = overlay;
    overlay.addEventListener("pointerdown", () => this.#setCurrentPage(view.page), { capture: true });
    view.pageElement.append(overlay);
  }

  #releasePage(page: number): void {
    const view = this.#views.get(page);
    if (!view || this.#rendering.has(page)) return;
    const { canvas, element, links, highlights, textLayer } = view.frame;
    canvas.width = 0;
    canvas.height = 0;
    element.style.transform = "";
    view.renderedGeneration = null;
    view.text = "";
    textLayer.replaceChildren();
    links.replaceChildren();
    highlights.replaceChildren();
  }

  #queueReadingPositionUpdate(): void {
    if (this.#container.hidden || this.#scrollFrame !== undefined) return;
    this.#scrollFrame = requestAnimationFrame(() => {
      this.#scrollFrame = undefined;
      if (this.#container.hidden) return;
      const readerRect = this.#reader.getBoundingClientRect();
      const focusY = readerRect.top + Math.min(readerRect.height * 0.38, 260);
      let closest: { distance: number; page: number } | null = null;
      for (const view of this.#views.values()) {
        const rect = view.pageElement.getBoundingClientRect();
        const distance = focusY < rect.top ? rect.top - focusY : focusY > rect.bottom ? focusY - rect.bottom : 0;
        if (!closest || distance < closest.distance) closest = { distance, page: view.page };
      }
      if (closest) this.#setCurrentPage(closest.page);
    });
  }

  #setCurrentPage(page: number): void {
    if (page === this.#currentPage) return;
    this.#currentPage = page;
    this.#onPageChange(page);
  }
}

function createPageView(page: number, width: number, height: number, pointerEvents: string): PdfContinuousPageView {
  const pageElement = document.createElement("section");
  pageElement.className = "pdf-page pdf-continuous-page";
  pageElement.dataset.pdfPage = String(page);
  pageElement.setAttribute("aria-label", `Page ${page}`);
  pageElement.style.width = `${width}px`;
  pageElement.style.height = `${height}px`;
  const frame = createPageFrame(width, height);
  frame.textLayer.style.pointerEvents = pointerEvents;
  pageElement.append(frame.element);
  return { page, pageElement, frame, pageOverlay: null, renderedGeneration: null, text: "" };
}

function createPageFrame(width: number, height: number): PdfContinuousPageFrame {
  const element = document.createElement("div");
  element.className = "pdf-continuous-page-frame";
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  const canvas = document.createElement("canvas");
  canvas.className = "block";
  canvas.width = 0;
  canvas.height = 0;
  const links = layer("pdf-links", "PDF links");
  const highlights = layer("pdf-highlights");
  const textLayer = layer("textLayer");
  element.append(canvas, links, highlights, textLayer);
  return { element, width, canvas, links, highlights, textLayer };
}

function layoutPageView(view: PdfContinuousPageView, width: number, height: number, pointerEvents: string, retainFrame: boolean): void {
  const style = view.pageElement.style;
  const pageHeight = retainFrame ? (Number.parseFloat(style.height) * width) / Number.parseFloat(style.width) : height;
  style.width = `${width}px`;
  style.height = `${pageHeight}px`;
  if (retainFrame) {
    if (view.renderedGeneration !== null) view.frame.element.style.transform = `scale(${width / view.frame.width})`;
    return;
  }
  const frame = createPageFrame(width, height);
  frame.textLayer.style.pointerEvents = pointerEvents;
  view.frame.element.replaceWith(frame.element);
  view.frame = frame;
  view.renderedGeneration = null;
  view.text = "";
}

function layer(className: string, label?: string): HTMLElement {
  const element = document.createElement("div");
  element.className = className;
  if (label) element.setAttribute("aria-label", label);
  return element;
}
