import type { PDFDocumentProxy } from "pdfjs-dist";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdfComponentView } from "./pdf-component-view";

class PageElement extends EventTarget {
  className = "";
  textContent = "";
  href = "";
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: PageElement[] = [];
  parentElement: PageElement | null = null;

  constructor(className = "") {
    super();
    this.className = className;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  append(...nodes: PageElement[]) {
    for (const node of nodes) {
      node.remove();
      this.children.push(node);
      node.parentElement = this;
    }
  }

  replaceChildren(...nodes: PageElement[]) {
    for (const child of this.children) child.parentElement = null;
    this.children.length = 0;
    this.append(...nodes);
  }

  remove() {
    if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
    this.parentElement = null;
  }

  contains(node: PageElement): boolean {
    return this === node || this.children.some((child) => child.contains(node));
  }

  matchesSelector(selector: string): boolean {
    if (selector === ".page[data-loaded]") return this.className === "page" && this.dataset.loaded === "true";
    if (selector === ".page[data-page-number]") return this.className === "page" && !!this.dataset.pageNumber;
    if (selector === 'span[role="presentation"]') return this.attributes.get("role") === "presentation";
    return selector === "." + this.className;
  }

  closest(selector: string): PageElement | null {
    return this.matchesSelector(selector) ? this : (this.parentElement?.closest(selector) ?? null);
  }

  querySelectorAll(selector: string): PageElement[] {
    return this.children.flatMap((child) => [...(child.matchesSelector(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }

  querySelector(selector: string) {
    if (selector === ":scope > .canvasWrapper") return this.children.find((el) => el.className === "canvasWrapper");
    return this.querySelectorAll(selector)[0];
  }
}

// The fixture implements the DOM operations the adapter uses in the Node test runner.
function asDiv(node: Pick<HTMLDivElement, "className" | "textContent" | "dispatchEvent">): HTMLDivElement {
  return node as HTMLDivElement;
}

function makePage(number: number) {
  const div = new PageElement("page");
  div.dataset.pageNumber = String(number);
  const canvas = new PageElement("canvasWrapper");
  const textLayer = new PageElement("textLayer");
  div.append(canvas, textLayer);
  return {
    div,
    canvas,
    textLayer,
    viewport: { width: 200, height: 400, rotation: 0, convertToViewportPoint: (x: number, y: number) => [x, 400 - y] },
    pdfPage: { getAnnotations: vi.fn<() => Promise<readonly unknown[]>>().mockResolvedValue([]) },
  };
}

interface RenderEvent {
  pageNumber: number;
  source: ReturnType<typeof makePage>;
  error?: Error;
  isDetailView?: boolean;
}

const handlers = new Map<string, (event: RenderEvent) => void>();
const pages = new Map<number, ReturnType<typeof makePage>>();
const goToDestination = vi.fn<(dest: string) => Promise<void>>();
const executeNamedAction = vi.fn();

vi.mock("./pdfjs-runtime", () => ({
  pdfViewerImageResourcesPath: "/images/",
  loadPdfJsRuntime: async () => ({ AnnotationMode: { ENABLE: 1 }, AnnotationEditorType: { DISABLE: -1 } }),
  loadPdfViewerRuntime: async () => ({
    LinkTarget: { BLANK: 2 },
    ScrollMode: { PAGE: 3, VERTICAL: 0 },
    SpreadMode: { NONE: 0, EVEN: 2 },
    EventBus: class {
      on(name: string, handler: (event: RenderEvent) => void) {
        handlers.set(name, handler);
      }
    },
    PDFViewer: class {
      constructor(readonly options: { eventBus: object }) {}
      get eventBus() {
        return this.options.eventBus;
      }
      currentPageNumber = 1;
      pagesCount = 0;
      pagesPromise = Promise.resolve();
      setDocument(doc: PDFDocumentProxy | null) {
        this.pagesCount = doc?.numPages ?? 0;
      }
      getPageView(index: number) {
        return pages.get(index);
      }
      update() {}
    },
    PDFLinkService: class {
      goToDestination = goToDestination;
      executeNamedAction = executeNamedAction;
      setViewer() {}
      setDocument() {}
      addLinkAttributes(link: HTMLAnchorElement, url: string) {
        link.href = url;
      }
    },
  }),
}));

async function readerFixture() {
  vi.stubGlobal("document", { createElement: () => new PageElement() });
  vi.stubGlobal("Element", PageElement);
  const container = new PageElement("pdfViewer");
  const dock = new PageElement();
  const primary = new PageElement("primary");
  dock.append(primary);
  const onError = vi.fn();
  const renderHighlights = vi.fn();
  const reader = new PdfComponentView({
    reader: asDiv(new PageElement()),
    container: asDiv(container),
    primaryMarkup: asDiv(primary),
    createPageOverlay: (page) => asDiv(new PageElement("markup-" + page)),
    onPageChange: vi.fn(),
    onError,
    renderHighlights,
  });
  await reader.open({ numPages: 3 } as PDFDocumentProxy, { mode: "continuous", page: 1, fit: "page", rotation: 0 });
  const page = makePage(1);
  container.append(page.div);
  pages.set(0, page);
  const dispatch = (name: string, extra: Partial<RenderEvent> = {}) => handlers.get(name)?.({ source: page, pageNumber: 1, ...extra });
  return { reader, page, dock, primary, dispatch, onError, renderHighlights };
}

afterEach(() => {
  vi.unstubAllGlobals();
  handlers.clear();
  pages.clear();
  goToDestination.mockReset();
  executeNamedAction.mockReset();
});

describe("PDF.js page events", () => {
  it("keeps highlights in the retained canvas and moves the markup tool with the layout", async () => {
    const { reader, page, dock, primary, dispatch, renderHighlights } = await readerFixture();
    dispatch("pagerender");
    page.div.dataset.loaded = "true";
    dispatch("pagerendered");
    const [links, highlights, markup] = page.canvas.children;
    expect(page.canvas.children.map((node) => node.className)).toEqual(["pdf-links", "pdf-highlights", "markup-1"]);
    expect(renderHighlights).toHaveBeenLastCalledWith(1, highlights);
    renderHighlights.mockClear();
    reader.refreshOverlays();
    expect(renderHighlights).toHaveBeenCalledExactlyOnceWith(1, highlights);
    reader.setDisplayMode("single");
    expect(markup?.parentElement).toBeNull();
    expect(page.canvas.children).toEqual([links, highlights, primary]);
    reader.setDisplayMode("spread");
    expect(primary.parentElement).toBe(dock);
    expect(page.canvas.children[2]?.className).toBe("markup-1");
    expect(page.canvas.children[2]).not.toBe(markup);
  });

  it("positions links in page coordinates and routes clicks through the PDF link service", async () => {
    const { page, dispatch, reader, onError } = await readerFixture();
    const url = "https://example.org/article";
    const rect = [20, 80, 100, 240];
    page.pdfPage.getAnnotations.mockResolvedValue([
      null,
      ...[{ url }, { action: "NextPage" }, { dest: "appendix" }].map((link) => ({ annotationType: 2, rect, ...link })),
    ]);
    dispatch("pagerendered");
    await Promise.resolve();
    const links = page.canvas.querySelector(".pdf-links");
    expect(links?.attributes.get("aria-label")).toBe("PDF links");
    const [external, action, destination] = links?.children ?? [];
    expect(links?.children).toHaveLength(3);
    expect(external).toMatchObject({ href: url, className: "pdf-link", style: { top: "40%", left: "10%", height: "40%", width: "40%" } });
    expect(external?.attributes.get("aria-label")).toBe("Open PDF link: " + url);
    expect(action?.href).toBe("#");
    expect(destination?.attributes.get("aria-label")).toBe("Follow link within PDF");
    expect(action?.dispatchEvent(new Event("click", { cancelable: true }))).toBe(false);
    expect(executeNamedAction).toHaveBeenCalledExactlyOnceWith("NextPage");
    const error = new Error("Missing destination");
    goToDestination.mockRejectedValueOnce(error);
    destination?.dispatchEvent(new Event("click"));
    await Promise.resolve();
    expect(goToDestination).toHaveBeenCalledExactlyOnceWith("appendix");
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    reader.close();
    action?.dispatchEvent(new Event("click"));
    expect(executeNamedAction).toHaveBeenCalledOnce();
  });

  it("discards link annotations that resolve after the document closes", async () => {
    const { page, dispatch, reader } = await readerFixture();
    let provideAnnotations = (_items: readonly unknown[]) => {};
    const pending = new Promise<readonly unknown[]>((resolve) => {
      provideAnnotations = resolve;
    });
    page.pdfPage.getAnnotations.mockReturnValue(pending);
    dispatch("pagerender");
    const links = page.canvas.querySelector(".pdf-links");
    expect(links).toBeDefined();
    reader.close();
    provideAnnotations([{ annotationType: 2, rect: [0, 0, 10, 10], action: "PrevPage" }]);
    await pending;
    expect(links?.children).toEqual([]);
  });

  it("uses the current text layer for selection and reports rendering errors only from the active page view", async () => {
    const { reader, page, dispatch, onError } = await readerFixture();
    const stalePage = makePage(1);
    const error = new Error("Rendering failed");
    dispatch("pagerendered", { error, source: stalePage });
    dispatch("pagerendered", { error, isDetailView: true });
    expect(onError).not.toHaveBeenCalled();
    dispatch("pagerendered", { error });
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    reader.setTextSelectionEnabled(false);
    expect(page.textLayer.style.pointerEvents).toBe("none");
    dispatch("textlayerrendered", { source: stalePage });
    expect(stalePage.textLayer.style.pointerEvents).toBeUndefined();
    const replacement = new PageElement("textLayer");
    page.textLayer.remove();
    page.div.append(replacement);
    dispatch("textlayerrendered");
    expect(replacement.style.pointerEvents).toBe("none");
    reader.setTextSelectionEnabled(true);
    expect(replacement.style.pointerEvents).toBe("auto");
    const words = ["First", "passage"].map((word) => {
      const span = new PageElement();
      span.setAttribute("role", "presentation");
      span.textContent = word;
      return span;
    });
    replacement.append(...words);
    expect(reader.selectionSource(asDiv(words[0]!))).toEqual({ page: 1, element: page.div, text: "First passage" });
    expect(reader.selectionSource(asDiv(stalePage.textLayer))).toBeNull();
    expect(reader.selectionSource(asDiv(page.canvas))).toBeNull();
  });
});
