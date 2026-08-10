import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextContent } from "pdfjs-dist/types/src/display/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfContinuousView } from "./pdf-continuous-view";
import type { PdfJsRuntime } from "./pdfjs-runtime";

class FakeStyle {
  width = "";
  height = "";
  pointerEvents = "";
  readonly properties = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }
}

class FakeElement {
  readonly tagName: string;
  readonly style = new FakeStyle();
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, ((event: Event) => void)[]>();
  className = "";
  hidden = false;
  parentElement: FakeElement | null = null;
  top = 0;
  fixedClientWidth = 0;
  readonly scrollIntoView = vi.fn();

  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
  }

  get childElementCount(): number {
    return this.children.length;
  }

  get clientWidth(): number {
    return this.fixedClientWidth || Number.parseFloat(this.style.width) || 0;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  addEventListener(name: string, listener: (event: Event) => void): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  dispatch(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener(new Event(name));
  }

  listenerCount(name: string): number {
    return this.listeners.get(name)?.length ?? 0;
  }

  closest(selector: string): FakeElement | null {
    if (selector === "[data-pdf-page]" && this.dataset.pdfPage) return this;
    return this.parentElement?.closest(selector) ?? null;
  }

  getBoundingClientRect(): DOMRect {
    const height = Number.parseFloat(this.style.height) || 0;
    return { top: this.top, bottom: this.top + height, height, left: 0, right: this.clientWidth, width: this.clientWidth } as DOMRect;
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === "canvas") return this.find((element) => element.tagName === "CANVAS");
    return null;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.length = 0;
    this.append(...children);
  }

  replaceWith(element: FakeElement): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index < 0) return;
    this.parentElement.children.splice(index, 1, element);
    element.parentElement = this.parentElement;
    this.parentElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  find(predicate: (element: FakeElement) => boolean): FakeElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.find(predicate);
      if (nested) return nested;
    }
    return null;
  }
}

class FakeCanvas extends FakeElement {
  width = 0;
  height = 0;

  constructor() {
    super("canvas");
  }
}

class TextLayerStub {
  readonly container: FakeElement;

  constructor(options: { container: FakeElement }) {
    this.container = options.container;
  }

  async render(): Promise<void> {
    this.container.append(new FakeElement("span"));
  }
}

class IntersectionObserverStub {
  static instance: IntersectionObserverStub | null = null;
  readonly callback: IntersectionObserverCallback;
  readonly observed: FakeElement[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    IntersectionObserverStub.instance = this;
  }

  observe(element: FakeElement): void {
    this.observed.push(element);
  }

  disconnect(): void {
    this.observed.length = 0;
  }
}

const runtime: Pick<PdfJsRuntime, "TextLayer"> = { TextLayer: TextLayerStub as never };

beforeEach(() => {
  const body = new FakeElement("body");
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("Node", FakeElement);
  vi.stubGlobal("document", {
    body,
    createElement: (tagName: string) => (tagName === "canvas" ? new FakeCanvas() : new FakeElement(tagName)),
  });
  vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("window", { devicePixelRatio: 1 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  IntersectionObserverStub.instance = null;
});

describe("continuous PDF view", () => {
  it("creates page placeholders, lazily renders text, and navigates by page", async () => {
    const overlays: number[] = [];
    const markupPages: number[] = [];
    const pages: number[] = [];
    const { container, reader } = viewerElements();
    const view = new PdfContinuousView({
      container: container as never,
      createPageOverlay: (page) => {
        markupPages.push(page);
        const layer = new FakeElement("library-pdf-markup-layer");
        layer.className = "pdf-markups";
        return layer as never;
      },
      reader: reader as never,
      onPageChange: (page) => pages.push(page),
      renderOverlays: (page) => overlays.push(page.page),
    });

    await view.open(pdfDocument(3), runtime, 2, 500);

    expect(pageElements(container)).toHaveLength(3);
    expect(view.currentPage).toBe(2);
    expect(pageElement(container, 2).style.height).toBe("700px");
    expect(textLayer(pageElement(container, 2)).children).toHaveLength(1);
    expect(markupPages).toEqual([2]);
    expect(pageElement(container, 2).find((element) => element.className === "pdf-markups")).not.toBeNull();
    expect(pageElement(container, 1).find((element) => element.className === "pdf-markups")).toBeNull();
    expect(overlays).toEqual([2]);
    expect(IntersectionObserverStub.instance?.observed).toHaveLength(3);

    await view.ensurePageRendered(3);
    expect(markupPages).toEqual([2, 3]);
    const thirdText = textLayer(pageElement(container, 3)).children[0]!;
    expect(view.pageViewForNode(thirdText as never)).toMatchObject({ page: 3, text: "Page 3" });

    view.setTextSelectionEnabled(false);
    expect(textLayer(pageElement(container, 3)).style.pointerEvents).toBe("none");
    view.scrollToPage(3);
    expect(pageElement(container, 3).scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
    expect(pages).toEqual([3]);

    view.refreshOverlays();
    await vi.waitFor(() => expect(overlays.filter((page) => page === 3)).toHaveLength(2));
  });

  it("releases distant rendered content without releasing its page overlay", async () => {
    const { container, reader } = viewerElements();
    const createPageOverlay = vi.fn((page: number) => {
      const layer = new FakeElement("library-pdf-markup-layer");
      layer.className = `pdf-markups page-${page}`;
      return layer as never;
    });
    const view = new PdfContinuousView({
      container: container as never,
      createPageOverlay,
      reader: reader as never,
      onPageChange: vi.fn(),
      renderOverlays: (page) => {
        page.links.append(new FakeElement("a") as never);
        page.highlights.append(new FakeElement("span") as never);
      },
    });
    await view.open(pdfDocument(5), runtime, 1, 400);
    await view.ensurePageRendered(5);
    const distantPage = pageElement(container, 5);
    const distantCanvas = distantPage.find((element) => element instanceof FakeCanvas) as FakeCanvas;
    const distantOverlay = distantPage.find((element) => element.className === "pdf-markups page-5");
    expect(distantCanvas.width).toBeGreaterThan(0);
    expect(expensiveLayerChildCounts(distantPage)).toEqual([1, 1, 1]);
    expect(distantOverlay).not.toBeNull();

    const observer = IntersectionObserverStub.instance;
    if (!observer) throw new Error("Expected a page observer");
    observer.callback([{ isIntersecting: false, target: distantPage }] as never, observer as never);
    expect(distantCanvas.width).toBe(0);
    expect(expensiveLayerChildCounts(distantPage)).toEqual([0, 0, 0]);
    expect(distantPage.find((element) => element.className === "pdf-markups page-5") === distantOverlay).toBe(true);

    await view.ensurePageRendered(5);
    expect(expensiveLayerChildCounts(distantPage)).toEqual([1, 1, 1]);
    expect(distantPage.find((element) => element.className === "pdf-markups page-5") === distantOverlay).toBe(true);
    expect(createPageOverlay.mock.calls.map(([page]) => page)).toEqual([1, 5]);

    view.close();
    expect(container.childElementCount).toBe(0);
  });

  it("reuses page overlays across same-document reopen and resize", async () => {
    const { container, reader } = viewerElements();
    const documentModel = pdfDocument(3);
    const createPageOverlay = vi.fn((page: number) => {
      const layer = new FakeElement("library-pdf-markup-layer");
      layer.className = `pdf-markups page-${page}`;
      return layer as never;
    });
    const view = new PdfContinuousView({
      container: container as never,
      createPageOverlay,
      reader: reader as never,
      onPageChange: vi.fn(),
      renderOverlays: vi.fn(),
    });
    await view.open(documentModel, runtime, 1, 400);
    await view.ensurePageRendered(2);
    const firstOverlay = pageElement(container, 1).find((element) => element.className === "pdf-markups page-1");
    const secondOverlay = pageElement(container, 2).find((element) => element.className === "pdf-markups page-2");

    await view.open(documentModel, runtime, 1, 520, 90);
    expect(pageElement(container, 1).find((element) => element.className === "pdf-markups page-1") === firstOverlay).toBe(true);
    expect(pageElement(container, 2).find((element) => element.className === "pdf-markups page-2") === secondOverlay).toBe(true);
    expect(createPageOverlay).toHaveBeenCalledTimes(2);

    await view.resize(640);
    expect(pageElement(container, 1).style.width).toBe("640px");
    expect(pageElement(container, 1).find((element) => element.className === "pdf-markups page-1") === firstOverlay).toBe(true);
    expect(pageElement(container, 2).find((element) => element.className === "pdf-markups page-2") === secondOverlay).toBe(true);
    expect(createPageOverlay).toHaveBeenCalledTimes(2);
  });

  it("rerenders a flowing document without forcing its current page to the top", async () => {
    const { container, reader } = viewerElements();
    const documentModel = pdfDocument(3);
    const view = new PdfContinuousView({
      container: container as never,
      reader: reader as never,
      onPageChange: vi.fn(),
      renderOverlays: vi.fn(),
    });
    await view.open(documentModel, runtime, 2, 500);
    const secondPage = pageElement(container, 2);
    expect(secondPage.scrollIntoView).toHaveBeenCalledOnce();

    await view.open(documentModel, runtime, 2, 520, 0, false);

    expect(secondPage.scrollIntoView).toHaveBeenCalledOnce();
  });

  it("does not scroll after a stale flowing open loses to a newer render", async () => {
    const { container, reader } = viewerElements();
    const staleRender = deferredVoid();
    const stalePage = Object.assign(pdfPage(2), {
      render: vi.fn(() => ({ promise: staleRender.promise })),
    });
    const documentModel = {
      numPages: 3,
      getPage: vi
        .fn()
        .mockResolvedValueOnce(pdfPage(2))
        .mockResolvedValueOnce(stalePage)
        .mockResolvedValueOnce(pdfPage(2))
        .mockResolvedValueOnce(pdfPage(2))
        .mockResolvedValue(pdfPage(2)),
    };
    const view = new PdfContinuousView({
      container: container as never,
      reader: reader as never,
      onPageChange: vi.fn(),
      renderOverlays: vi.fn(),
    });

    const staleOpen = view.open(documentModel as never, runtime, 2, 500);
    await vi.waitFor(() => expect(stalePage.render).toHaveBeenCalledOnce());
    await view.open(documentModel as never, runtime, 2, 520);
    const secondPage = pageElement(container, 2);
    expect(secondPage.scrollIntoView).toHaveBeenCalledOnce();

    staleRender.resolve();
    await staleOpen;

    expect(secondPage.scrollIntoView).toHaveBeenCalledOnce();
  });

  it("activates the pointer-owning right spread page across equal-row reuse", async () => {
    const { container, reader } = viewerElements();
    const pages: number[] = [];
    const documentModel = pdfDocument(3);
    const view = new PdfContinuousView({
      container: container as never,
      createPageOverlay: (page) => {
        const layer = new FakeElement("library-pdf-markup-layer");
        layer.className = `pdf-markups page-${page}`;
        return layer as never;
      },
      reader: reader as never,
      onPageChange: (page) => pages.push(page),
      renderOverlays: vi.fn(),
    });
    await view.open(documentModel, runtime, 2, 500);
    await view.ensurePageRendered(3);
    pageElement(container, 1).top = -1_000;
    pageElement(container, 2).top = 0;
    pageElement(container, 3).top = 0;

    reader.dispatch("scroll");
    expect(view.currentPage).toBe(2);
    const thirdOverlay = pageOverlay(container, 3);
    thirdOverlay.dispatch("pointerdown");

    expect(view.currentPage).toBe(3);
    expect(pages).toEqual([3]);
    expect(thirdOverlay.listenerCount("pointerdown")).toBe(1);

    await view.open(documentModel, runtime, 2, 520);
    expect(pageOverlay(container, 3)).toBe(thirdOverlay);
    expect(thirdOverlay.listenerCount("pointerdown")).toBe(1);
    thirdOverlay.dispatch("pointerdown");
    expect(pages).toEqual([3, 3]);
  });
});

function viewerElements(): { container: FakeElement; reader: FakeElement } {
  const reader = new FakeElement();
  reader.fixedClientWidth = 700;
  reader.style.height = "800px";
  const container = new FakeElement();
  reader.append(container);
  return { container, reader };
}

function pageElements(container: FakeElement): FakeElement[] {
  return container.children.filter((element) => element.dataset.pdfPage);
}

function pageElement(container: FakeElement, page: number): FakeElement {
  const element = pageElements(container).find((candidate) => candidate.dataset.pdfPage === String(page));
  if (!element) throw new Error(`Missing page ${page}`);
  return element;
}

function pageOverlay(container: FakeElement, page: number): FakeElement {
  const overlay = pageElement(container, page).find((element) => element.className === `pdf-markups page-${page}`);
  if (!overlay) throw new Error(`Missing page overlay ${page}`);
  return overlay;
}

function textLayer(page: FakeElement): FakeElement {
  return pageLayer(page, "textLayer");
}

function pageLayer(page: FakeElement, className: string): FakeElement {
  const element = page.find((candidate) => candidate.className === className);
  if (!element) throw new Error(`Missing ${className} layer`);
  return element;
}

function expensiveLayerChildCounts(page: FakeElement): readonly [number, number, number] {
  return [
    pageLayer(page, "textLayer").childElementCount,
    pageLayer(page, "pdf-links").childElementCount,
    pageLayer(page, "pdf-highlights").childElementCount,
  ];
}

function pdfDocument(pages: number): Pick<PDFDocumentProxy, "getPage" | "numPages"> {
  return {
    numPages: pages,
    getPage: async (page) => pdfPage(page),
  };
}

function pdfPage(page: number): PDFPageProxy {
  const baseHeight = 120 + page * 10;
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 100 * scale,
      height: baseHeight * scale,
      scale,
      convertToViewportPoint: (x: number, y: number) => [x * scale, y * scale],
    }),
    getAnnotations: async () => [],
    render: () => ({ promise: Promise.resolve() }),
    streamTextContent: () =>
      new ReadableStream<TextContent>({
        start(controller) {
          controller.enqueue({
            items: [{ str: `Page ${page}`, dir: "ltr", transform: [1, 0, 0, 1, 0, 0], width: 1, height: 1, fontName: "f1", hasEOL: false }],
            styles: {},
            lang: null,
          });
          controller.close();
        },
      }),
  } as never;
}

function deferredVoid(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
