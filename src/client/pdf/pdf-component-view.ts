import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { PDFLinkService, PDFPageView, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { PdfDisplayMode, PdfFitMode } from "./pdf-viewer";
import { loadPdfJsRuntime, loadPdfViewerRuntime, pdfViewerImageResourcesPath } from "./pdfjs-runtime";

interface PdfComponentOptions {
  reader: HTMLDivElement;
  container: HTMLDivElement;
  primaryMarkup: HTMLElement;
  createPageOverlay(page: number): HTMLElement | null;
  renderHighlights(page: number, container: HTMLElement): void;
  onPageChange(page: number): void;
  onError(error: unknown): void;
}

interface PdfOpeningView {
  page: number;
  mode: PdfDisplayMode;
  fit: PdfFitMode;
  rotation: number;
}

interface PageEvent {
  source: PDFPageView;
  pageNumber: number;
  error?: unknown;
  isDetailView?: boolean;
}

interface PageOverlays {
  highlights: HTMLDivElement;
  links: HTMLDivElement;
  markup: HTMLElement | null;
  linkRotation: number | null;
}

type PdfLinkAddress = { url: string } | { dest: string | unknown[] } | { action: string };

export function pdfPageLink(value: unknown): ({ rect: [number, number, number, number] } & PdfLinkAddress) | null {
  if (!value || typeof value !== "object" || !("annotationType" in value) || value.annotationType !== 2 || !("rect" in value)) return null;
  const rect = value.rect;
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)) return null;
  const bounds: [number, number, number, number] = [rect[0], rect[1], rect[2], rect[3]];
  if ("url" in value && typeof value.url === "string" && value.url) return { rect: bounds, url: value.url };
  if ("dest" in value && (typeof value.dest === "string" || Array.isArray(value.dest))) return { rect: bounds, dest: value.dest };
  if ("action" in value && typeof value.action === "string" && ["NextPage", "PrevPage", "FirstPage", "LastPage"].includes(value.action)) {
    return { rect: bounds, action: value.action };
  }
  return null;
}

const scalePreset = { width: "page-width", page: "page-fit", actual: "page-actual" } as const;

export class PdfComponentView {
  readonly #options: PdfComponentOptions;
  readonly #dock: HTMLElement | null;
  readonly #layers = new WeakMap<Element, PageOverlays>();
  #session: AbortController | null = null;
  #viewer: PDFViewer | null = null;
  #links: PDFLinkService | null = null;
  #runtime: Awaited<ReturnType<typeof loadPdfViewerRuntime>> | null = null;
  #mode: PdfDisplayMode = "single";
  #activeSpreadPage: number | null = null;
  #fit: PdfFitMode = "width";
  #fitScale = 1;
  #zoom = 1;
  #zoomAnchor: { page: HTMLElement; clientX: number; clientY: number; x: number; y: number; at: number } | null = null;
  #selectionEnabled = true;

  constructor(options: PdfComponentOptions) {
    this.#options = options;
    this.#dock = options.primaryMarkup.parentElement;
    options.container.addEventListener(
      "pointerdown",
      (event) => {
        if (this.#mode !== "spread" || !(event.target instanceof Element)) return;
        const page = Number(event.target.closest<HTMLElement>(".page")?.dataset.pageNumber);
        if (page) this.#rememberSpreadPage(page);
      },
      { capture: true },
    );
  }

  get currentPage(): number {
    return this.#activeSpreadPage ?? this.#viewer?.currentPageNumber ?? 1;
  }

  async open(documentModel: PDFDocumentProxy, options: PdfOpeningView): Promise<void> {
    this.close();
    const session = (this.#session = new AbortController());
    const [runtime, display] = await Promise.all([loadPdfViewerRuntime(), loadPdfJsRuntime()]);
    if (session.signal.aborted) return;
    this.#runtime = runtime;

    if (!this.#viewer) {
      const eventBus = new runtime.EventBus();
      this.#viewer = new runtime.PDFViewer({
        container: this.#options.reader,
        viewer: this.#options.container,
        eventBus,
        annotationMode: display.AnnotationMode.ENABLE,
        annotationEditorMode: display.AnnotationEditorType.DISABLE,
        imageResourcesPath: pdfViewerImageResourcesPath,
        enableSelectionRendering: false,
        enableAutoLinking: false,
      });
      eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
        if (this.#mode === "single") this.#dockPrimary();
        if (this.#activeSpreadPage !== null && Math.floor(pageNumber / 2) === Math.floor(this.#activeSpreadPage / 2)) return;
        this.#activeSpreadPage = null;
        this.#options.onPageChange(pageNumber);
        this.#attachPage(pageNumber);
      });
      eventBus.on("pagerender", ({ pageNumber }: PageEvent) => this.#attachPage(pageNumber));
      eventBus.on("pagerendered", (event: PageEvent) => {
        if (event.isDetailView || !this.#currentView(event)) return;
        if (event.error) this.#options.onError(event.error);
        else this.#attachPage(event.pageNumber);
      });
      eventBus.on("textlayerrendered", (event: PageEvent) => {
        if (this.#currentView(event)) this.#setTextLayerInteraction(event.source.div);
      });
    }

    const viewer = this.#viewer;
    this.#links = new runtime.PDFLinkService({
      eventBus: viewer.eventBus,
      externalLinkTarget: runtime.LinkTarget.BLANK,
      externalLinkRel: "noopener noreferrer nofollow",
      ignoreDestinationZoom: true,
    });
    const goToPage = (page: number) => this.goToPage(page);
    this.#links.setViewer({
      set currentPageNumber(page: number) {
        goToPage(page);
      },
      previousPage: () => goToPage(this.currentPage - 1),
      nextPage: () => goToPage(this.currentPage + 1),
      scrollPageIntoView: (destination: Parameters<PDFViewer["scrollPageIntoView"]>[0]) => {
        if (session.signal.aborted) return;
        this.#rememberSpreadPage(destination.pageNumber);
        viewer.scrollPageIntoView(destination);
      },
    });
    this.#mode = options.mode;
    this.#fit = options.fit;
    this.#links.setDocument(documentModel);
    const ready = new Promise<void>((resolve) => {
      viewer.eventBus.on("pagesinit", resolve, { once: true, signal: session.signal });
      session.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    viewer.setDocument(documentModel);
    // PDF.js rejects pagesPromise on an initialization failure, before pagesinit.
    await Promise.race([ready, viewer.pagesPromise]);
    if (session.signal.aborted) return;
    this.setDisplayMode(options.mode);
    viewer.pagesRotation = options.rotation;
    this.goToPage(options.page);
    this.setFitMode(options.fit);
    viewer.update();
  }

  close(): void {
    this.#session?.abort();
    this.#session = null;
    this.#dockPrimary();
    this.#viewer?.setDocument(null);
    this.#links?.setDocument(null);
    this.#zoom = 1;
    this.#fitScale = 1;
    this.#zoomAnchor = null;
    this.#activeSpreadPage = null;
  }

  #dockPrimary(): void {
    const primary = this.#options.primaryMarkup;
    if (this.#dock && primary.parentElement !== this.#dock) this.#dock.append(primary);
  }

  setDisplayMode(mode: PdfDisplayMode): void {
    const page = this.currentPage;
    this.#mode = mode;
    this.#activeSpreadPage = null;
    const viewer = this.#viewer;
    if (!viewer?.pagesCount || !this.#runtime) return;
    this.#dockPrimary();
    if (mode === "single") {
      // Hidden spread companions are detached from the presenter. Recreate
      // their markup from current state when they return to a flowing layout.
      for (const wrapper of this.#options.container.querySelectorAll(".canvasWrapper")) {
        const layers = this.#layers.get(wrapper);
        if (layers?.markup) {
          layers.markup.remove();
          layers.markup = null;
        }
      }
    }
    viewer.scrollMode = mode === "single" ? this.#runtime.ScrollMode.PAGE : this.#runtime.ScrollMode.VERTICAL;
    viewer.spreadMode = mode === "spread" ? this.#runtime.SpreadMode.EVEN : this.#runtime.SpreadMode.NONE;
    this.goToPage(page);
    this.resize();
    // Retained pages can change layouts without a new PDF.js render event.
    for (const page of this.#options.container.querySelectorAll<HTMLElement>(".page[data-loaded]")) {
      this.#attachPage(Number(page.dataset.pageNumber));
    }
  }

  setFitMode(fit: PdfFitMode): void {
    this.#fit = fit;
    this.#zoom = 1;
    this.resize();
  }

  setRotation(rotation: number): void {
    if (!this.#viewer?.pagesCount) return;
    this.#viewer.pagesRotation = rotation;
    this.resize();
  }

  resize(): void {
    const viewer = this.#viewer;
    if (!viewer?.pagesCount || !this.#options.reader.clientWidth || !this.#options.reader.clientHeight) return;
    viewer.currentScaleValue = scalePreset[this.#fit];
    this.#fitScale = viewer.currentScale;
    if (Math.abs(this.#zoom - 1) > 0.00001) viewer.currentScale = this.#fitScale * this.#zoom;
    viewer.update();
  }

  zoomBy(factor: number, origin?: [number, number], pan?: [number, number]): void {
    const viewer = this.#viewer;
    if (!viewer?.pagesCount || factor <= 0 || !Number.isFinite(factor)) return;
    this.#zoom *= factor;
    const target = this.#fitScale * this.#zoom;
    let paneOrigin: number[] | undefined;
    const reader = this.#options.reader;
    const page = origin && reader.ownerDocument?.elementFromPoint(origin[0], origin[1])?.closest<HTMLElement>(".pdfViewer .page");
    const before = page?.getBoundingClientRect();
    let anchor = this.#zoomAnchor;
    if (origin && page && before?.width && before.height && this.#options.container.contains(page)) {
      const now = performance.now();
      if (!anchor || anchor.page !== page || anchor.clientX !== origin[0] || anchor.clientY !== origin[1] || now - anchor.at > 250) {
        anchor = {
          page,
          x: (origin[0] - before.left) / before.width,
          y: (origin[1] - before.top) / before.height,
          clientX: origin[0],
          clientY: origin[1],
          at: now,
        };
      }
      anchor.at = now;
      anchor.clientX = origin[0] + (pan?.[0] ?? 0);
      anchor.clientY = origin[1] + (pan?.[1] ?? 0);
    } else anchor = null;
    this.#zoomAnchor = anchor;
    if (origin) {
      const bounds = reader.getBoundingClientRect();
      // PDFViewer subtracts the container's offsets relative to its positioned parent.
      paneOrigin = [origin[0] - bounds.left + reader.offsetLeft, origin[1] - bounds.top + reader.offsetTop];
    }
    viewer.updateScale({ scaleFactor: target / viewer.currentScale, drawingDelay: 140, origin: paneOrigin, pan });
    // PDF.js rounds gesture scales to a percentage, while a fit preset can be fractional.
    if (Math.abs(this.#zoom - 1) < 0.00001 && viewer.currentScale !== this.#fitScale) viewer.currentScale = this.#fitScale;
    // The viewer rounds page sizes independently. Correct the residual at the
    // page under the pointer, including margins between preceding spread rows.
    if (anchor) {
      const after = anchor.page.getBoundingClientRect();
      reader.scrollLeft += after.left + anchor.x * after.width - anchor.clientX;
      reader.scrollTop += after.top + anchor.y * after.height - anchor.clientY;
    }
  }

  goToPage(page: number): void {
    const viewer = this.#viewer;
    if (!viewer?.pagesCount || !Number.isInteger(page)) return;
    const target = Math.min(viewer.pagesCount, Math.max(1, page));
    this.#rememberSpreadPage(target);
    viewer.currentPageNumber = target;
  }

  #rememberSpreadPage(page: number): void {
    if (this.#mode !== "spread") return;
    const changed = page !== this.currentPage;
    this.#activeSpreadPage = page;
    if (changed) this.#options.onPageChange(page);
  }

  setTextSelectionEnabled(enabled: boolean): void {
    this.#selectionEnabled = enabled;
    for (const layer of this.#options.container.querySelectorAll<HTMLElement>(".textLayer")) {
      layer.style.pointerEvents = enabled ? "auto" : "none";
    }
  }

  selectionSource(node: Node): { element: HTMLElement; page: number; text: string } | null {
    const element = node instanceof Element ? node : node.parentElement;
    const layer = element?.closest(".textLayer");
    const page = layer?.closest<HTMLElement>(".page[data-page-number]");
    if (!layer || !page || !this.#options.container.contains(page)) return null;
    const text = [...layer.querySelectorAll('span[role="presentation"]')].map((span) => span.textContent).join(" ");
    return { element: page, page: Number(page.dataset.pageNumber), text };
  }

  refreshOverlays(): void {
    for (const layer of this.#options.container.querySelectorAll<HTMLElement>(".pdf-highlights")) {
      const page = Number(layer.closest<HTMLElement>(".page")?.dataset.pageNumber);
      if (page) this.#options.renderHighlights(page, layer);
    }
  }

  #setTextLayerInteraction(page: HTMLElement): void {
    const layer = page.querySelector<HTMLElement>(".textLayer");
    if (layer) layer.style.pointerEvents = this.#selectionEnabled ? "auto" : "none";
  }

  #currentView(event: PageEvent): boolean {
    return this.#viewer?.getPageView(event.pageNumber - 1) === event.source;
  }

  #attachPage(page: number): void {
    const view: PDFPageView | undefined = this.#viewer?.getPageView(page - 1);
    const wrapper = view?.div.querySelector(":scope > .canvasWrapper");
    if (!view || !wrapper || (this.#mode === "single" && page !== this.currentPage)) return;
    // PDF.js retains this wrapper across redraws. A new wrapper after eviction
    // receives current annotations and a fresh markup layer from the presenter.
    let layers = this.#layers.get(wrapper);
    if (!layers) {
      const links = document.createElement("div");
      links.className = "pdf-links";
      links.setAttribute("aria-label", "PDF links");
      const highlights = document.createElement("div");
      highlights.className = "pdf-highlights";
      wrapper.append(links, highlights);
      layers = { links, highlights, markup: null, linkRotation: null };
      this.#layers.set(wrapper, layers);
    }
    if (this.#mode === "single") {
      layers.markup?.remove();
      layers.markup = null;
      if (this.#options.primaryMarkup.parentElement !== wrapper) wrapper.append(this.#options.primaryMarkup);
    } else if (!layers.markup) {
      layers.markup = this.#options.createPageOverlay(page);
      if (layers.markup) wrapper.append(layers.markup);
    }
    this.#options.renderHighlights(page, layers.highlights);
    this.#setTextLayerInteraction(view.div);
    if (layers.linkRotation !== view.viewport.rotation && view.pdfPage) {
      layers.linkRotation = view.viewport.rotation;
      void this.#renderLinks(view, layers, this.#session?.signal).catch((error: unknown) => {
        if (this.#viewer?.getPageView(page - 1) === view) this.#options.onError(error);
      });
    }
  }

  async #renderLinks(view: PDFPageView, layers: PageOverlays, signal?: AbortSignal): Promise<void> {
    const pdfPage: PDFPageProxy = view.pdfPage;
    const annotations: readonly unknown[] = await pdfPage.getAnnotations({ intent: "display" });
    if (signal?.aborted || !this.#links) return;
    const viewport = view.viewport;
    const items: HTMLAnchorElement[] = [];
    for (const annotation of annotations) {
      const link = pdfPageLink(annotation);
      if (!link) continue;
      const [left, bottom, right, top] = link.rect;
      const [x1, y1] = viewport.convertToViewportPoint(left, bottom);
      const [x2, y2] = viewport.convertToViewportPoint(right, top);
      const anchor = document.createElement("a");
      anchor.className = "pdf-link";
      anchor.style.left = (Math.min(x1, x2) / viewport.width) * 100 + "%";
      anchor.style.top = (Math.min(y1, y2) / viewport.height) * 100 + "%";
      anchor.style.width = (Math.abs(x1 - x2) / viewport.width) * 100 + "%";
      anchor.style.height = (Math.abs(y1 - y2) / viewport.height) * 100 + "%";
      if ("url" in link) {
        this.#links.addLinkAttributes(anchor, link.url);
        anchor.setAttribute("aria-label", "Open PDF link: " + link.url);
      } else {
        anchor.href = "#";
        anchor.setAttribute("aria-label", "Follow link within PDF");
        anchor.addEventListener("click", (event) => {
          event.preventDefault();
          if (signal?.aborted) return;
          if ("action" in link) this.#links?.executeNamedAction(link.action);
          else
            void this.#links?.goToDestination(link.dest).catch((error: unknown) => {
              if (!signal?.aborted) this.#options.onError(error);
            });
        });
      }
      items.push(anchor);
    }
    layers.links.replaceChildren(...items);
  }
}
