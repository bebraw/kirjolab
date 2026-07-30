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

  addEventListener(): void {}

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
    const pages: number[] = [];
    const { container, reader } = viewerElements();
    const view = new PdfContinuousView({
      container: container as never,
      reader: reader as never,
      onPageChange: (page) => pages.push(page),
      renderOverlays: (page) => overlays.push(page.page),
    });

    await view.open(pdfDocument(3), runtime, 2, 500);

    expect(pageElements(container)).toHaveLength(3);
    expect(view.currentPage).toBe(2);
    expect(pageElement(container, 2).style.height).toBe("700px");
    expect(textLayer(pageElement(container, 2)).children).toHaveLength(1);
    expect(overlays).toEqual([2]);
    expect(IntersectionObserverStub.instance?.observed).toHaveLength(3);

    await view.ensurePageRendered(3);
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

  it("rebuilds at a new width and releases distant rendered pages", async () => {
    const { container, reader } = viewerElements();
    const view = new PdfContinuousView({
      container: container as never,
      reader: reader as never,
      onPageChange: vi.fn(),
      renderOverlays: vi.fn(),
    });
    await view.open(pdfDocument(5), runtime, 1, 400);
    await view.ensurePageRendered(5);
    const distantPage = pageElement(container, 5);
    const distantCanvas = distantPage.find((element) => element instanceof FakeCanvas) as FakeCanvas;
    expect(distantCanvas.width).toBeGreaterThan(0);

    const observer = IntersectionObserverStub.instance;
    if (!observer) throw new Error("Expected a page observer");
    observer.callback([{ isIntersecting: false, target: distantPage }] as never, observer as never);
    expect(distantCanvas.width).toBe(0);

    await view.resize(640);
    expect(pageElement(container, 1).style.width).toBe("640px");
    view.close();
    expect(container.childElementCount).toBe(0);
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

function textLayer(page: FakeElement): FakeElement {
  const element = page.find((candidate) => candidate.className === "textLayer");
  if (!element) throw new Error("Missing text layer");
  return element;
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
