import type { PDFDocumentProxy } from "pdfjs-dist";
import { readPdfTextContent } from "./pdf-text-content";
import type { PdfJsRuntime } from "./pdfjs-runtime";

export interface PdfContinuousPageView {
  readonly page: number;
  readonly pageElement: HTMLElement;
  readonly links: HTMLElement;
  readonly highlights: HTMLElement;
  readonly textLayer: HTMLElement;
  text: string;
}

interface PdfContinuousViewOptions {
  readonly container: HTMLElement;
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
  readonly #reader: HTMLElement;
  readonly #onPageChange: (page: number) => void;
  readonly #renderOverlays: PdfContinuousViewOptions["renderOverlays"];
  readonly #views = new Map<number, PdfContinuousPageView>();
  readonly #rendering = new Map<number, Promise<void>>();
  #document: PdfContinuousDocument | null = null;
  #runtime: PdfContinuousRuntime | null = null;
  #observer: IntersectionObserver | null = null;
  #generation = 0;
  #currentPage = 1;
  #textLayerPointerEvents = "auto";
  #scrollFrame: number | undefined;

  constructor(options: PdfContinuousViewOptions) {
    this.#container = options.container;
    this.#reader = options.reader;
    this.#onPageChange = options.onPageChange;
    this.#renderOverlays = options.renderOverlays;
    this.#reader.addEventListener("scroll", () => this.#queueReadingPositionUpdate(), { passive: true });
  }

  get currentPage(): number {
    return this.#currentPage;
  }

  async open(documentModel: PdfContinuousDocument, runtime: PdfContinuousRuntime, initialPage: number, width: number): Promise<void> {
    const generation = ++this.#generation;
    this.#observer?.disconnect();
    this.#observer = null;
    this.#document = documentModel;
    this.#runtime = runtime;
    this.#currentPage = initialPage;
    this.#views.clear();
    this.#rendering.clear();
    this.#container.replaceChildren();

    const initialPdfPage = await documentModel.getPage(initialPage);
    if (generation !== this.#generation) return;
    const initialUnscaled = initialPdfPage.getViewport({ scale: 1 });
    const initialViewport = initialPdfPage.getViewport({ scale: width / initialUnscaled.width });
    for (let pageNumber = 1; pageNumber <= documentModel.numPages; pageNumber += 1) {
      const view = createPageView(pageNumber, initialViewport.width, initialViewport.height, this.#textLayerPointerEvents);
      this.#views.set(pageNumber, view);
      this.#container.append(view.pageElement);
    }

    this.#observePages(generation);
    await this.#renderPage(initialPage, generation);
    this.scrollToPage(initialPage, "instant");
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
    await this.open(documentModel, runtime, this.#currentPage, width);
  }

  setTextSelectionEnabled(enabled: boolean): void {
    this.#textLayerPointerEvents = enabled ? "auto" : "none";
    for (const view of this.#views.values()) view.textLayer.style.pointerEvents = this.#textLayerPointerEvents;
  }

  refreshOverlays(): void {
    for (const page of this.#views.keys()) {
      if (this.#rendering.has(page) || this.#views.get(page)?.text) void this.#renderPage(page, this.#generation, true);
    }
  }

  pageViewForNode(node: Node): PdfContinuousPageView | null {
    const pageElement =
      node instanceof Element ? node.closest<HTMLElement>("[data-pdf-page]") : node.parentElement?.closest<HTMLElement>("[data-pdf-page]");
    const page = Number(pageElement?.dataset.pdfPage);
    return Number.isInteger(page) ? (this.#views.get(page) ?? null) : null;
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
    if (!view || !documentModel || !runtime || generation !== this.#generation) return;
    if (overlaysOnly && !view.text) return;

    const task = (async () => {
      const page = await documentModel.getPage(pageNumber);
      if (generation !== this.#generation) return;
      const unscaled = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: view.pageElement.clientWidth / unscaled.width });
      view.pageElement.style.width = `${viewport.width}px`;
      view.pageElement.style.height = `${viewport.height}px`;
      const annotationsPromise = page.getAnnotations({ intent: "display" });
      if (!overlaysOnly && !view.text) {
        const outputScale = window.devicePixelRatio || 1;
        const canvas = view.pageElement.querySelector("canvas");
        if (!(canvas instanceof HTMLCanvasElement)) return;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const textContent = await readPdfTextContent(page);
        if (generation !== this.#generation) return;
        view.text = textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .filter(Boolean)
          .join(" ");
        view.textLayer.style.setProperty("--total-scale-factor", String(viewport.scale));
        const textLayer = new runtime.TextLayer({ textContentSource: textContent, container: view.textLayer, viewport });
        await Promise.all([
          page.render({
            canvas,
            viewport,
            transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          }).promise,
          textLayer.render(),
        ]);
      }
      if (generation !== this.#generation) return;
      this.#renderOverlays(view, viewport, await annotationsPromise);
    })().finally(() => this.#rendering.delete(pageNumber));
    this.#rendering.set(pageNumber, task);
    return task;
  }

  #releasePage(page: number): void {
    const view = this.#views.get(page);
    if (!view || this.#rendering.has(page)) return;
    const canvas = view.pageElement.querySelector("canvas");
    if (canvas instanceof HTMLCanvasElement) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }
    view.text = "";
    view.textLayer.replaceChildren();
    view.links.replaceChildren();
    view.highlights.replaceChildren();
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
  const canvas = document.createElement("canvas");
  canvas.className = "block";
  const links = layer("pdf-links", "PDF links");
  const highlights = layer("pdf-highlights");
  const textLayer = layer("textLayer");
  textLayer.style.pointerEvents = pointerEvents;
  pageElement.append(canvas, links, highlights, textLayer);
  return { page, pageElement, links, highlights, textLayer, text: "" };
}

function layer(className: string, label?: string): HTMLElement {
  const element = document.createElement("div");
  element.className = className;
  if (label) element.setAttribute("aria-label", label);
  return element;
}
