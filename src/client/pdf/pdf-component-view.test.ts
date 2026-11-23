import { afterEach, describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfViewerRuntime } from "./pdfjs-runtime";
import { PdfComponentView, pdfPageLink } from "./pdf-component-view";

describe("PDF page links", () => {
  const rect = [12, 24, 36, 48];

  it("exposes external URLs and internal destinations from link annotations", () => {
    const dest = [1, { name: "XYZ" }, null, 120, null];
    const actions = ["NextPage", "PrevPage", "FirstPage", "LastPage"].map((action) => ({ action }));
    for (const address of [{ url: "https://example.com/paper" }, { dest }, { dest: "appendix" }, ...actions]) {
      expect(pdfPageLink({ annotationType: 2, rect, ...address })).toEqual({ rect, ...address });
    }
  });

  it("ignores embedded actions and malformed link geometry", () => {
    for (const annotation of [
      null,
      "appendix",
      { rect, dest: "appendix" },
      { annotationType: 1, rect, url: "https://example.com" },
      { annotationType: 2, dest: "appendix" },
      { annotationType: 2, rect: "0123", dest: "appendix" },
      { annotationType: 2, rect: [0, 1, 2], dest: "appendix" },
      { annotationType: 2, rect: [0, 1, 2, "3"], dest: "appendix" },
      { annotationType: 2, rect, url: 5 },
      { annotationType: 2, rect, url: "" },
      { annotationType: 2, rect, dest: 5 },
      { annotationType: 2, rect, action: "Print" },
      { annotationType: 2, rect, unsafeUrl: "javascript:void(0)" },
      { annotationType: 2, rect: [0, 1, 2, Infinity], dest: "appendix" },
    ])
      expect(pdfPageLink(annotation)).toBeNull();
  });
});

class ViewerEvents {
  readonly listeners = new Map<string, (event?: { pageNumber: number }) => void>();

  on(name: string, listener: (event?: { pageNumber: number }) => void): void {
    this.listeners.set(name, listener);
  }
}

class ViewerStub {
  static instance: ViewerStub;
  readonly eventBus: ViewerEvents;
  fittedScale = 1.34728;
  scalePreset = "";
  currentScale = this.fittedScale;
  currentPageNumber = 1;
  pagesCount = 0;
  pagesRotation = 0;
  scrollMode = 0;
  spreadMode = 0;
  origin?: number[];
  pan?: number[];
  pagesPromise: Promise<void> = new Promise(() => undefined);

  constructor({ eventBus }: { eventBus: ViewerEvents }) {
    this.eventBus = eventBus;
    ViewerStub.instance = this;
  }

  setDocument(document: PDFDocumentProxy | null): void {
    this.pagesCount = document?.numPages ?? 0;
    if (document) queueMicrotask(() => this.eventBus.listeners.get("pagesinit")?.());
  }

  set currentScaleValue(preset: string) {
    this.scalePreset = preset;
    this.currentScale = this.fittedScale;
  }

  updateScale({ scaleFactor, origin, pan }: { scaleFactor: number; origin?: number[]; pan?: number[] }): void {
    if (origin) this.origin = origin;
    if (pan) this.pan = pan;
    this.currentScale = Math.round(this.currentScale * scaleFactor * 100) / 100;
  }

  readonly update = vi.fn();
  getPageView(): undefined {
    return undefined;
  }
}

const fakeViewerRuntime = {
  EventBus: ViewerEvents,
  PDFLinkService: class {
    setViewer(): void {}
    setDocument(): void {}
  },
  PDFViewer: ViewerStub,
  LinkTarget: { BLANK: 2 },
  ScrollMode: { PAGE: 3, VERTICAL: 0 },
  SpreadMode: { NONE: 0, EVEN: 2 },
};

vi.mock("./pdfjs-runtime", () => ({
  loadPdfJsRuntime: async () => ({ AnnotationMode: { ENABLE: 1 }, AnnotationEditorType: { DISABLE: -1 } }),
  loadPdfViewerRuntime: vi.fn(async () => fakeViewerRuntime),
  pdfViewerImageResourcesPath: "/images/",
}));

function componentElements() {
  const page = { getBoundingClientRect: vi.fn(() => ({ left: 60, top: 100, width: 200, height: 400 })) };
  return {
    page,
    reader: {
      clientWidth: 640,
      clientHeight: 480,
      offsetTop: 6,
      offsetLeft: 8,
      scrollLeft: 13,
      scrollTop: 7,
      ownerDocument: {
        elementFromPoint: vi.fn((_x: number, _y: number) => ({
          closest: (selector: string) => (selector === ".pdfViewer .page" ? page : null),
        })),
      },
      getBoundingClientRect: () => ({ left: 80, top: 40 }),
    },
    container: {
      contains: vi.fn((candidate: typeof page) => candidate === page),
      addEventListener: vi.fn(),
      querySelectorAll: vi.fn().mockReturnValue([]),
    },
    onPageChange: vi.fn(),
  };
}

function component(elements = componentElements()) {
  return new PdfComponentView({
    reader: elements.reader as Pick<HTMLDivElement, "clientWidth" | "clientHeight" | "scrollTop" | "scrollLeft"> as HTMLDivElement,
    container: elements.container as Pick<HTMLDivElement, "querySelectorAll" | "addEventListener"> as HTMLDivElement,
    primaryMarkup: { parentElement: null } as HTMLElement,
    createPageOverlay: () => null,
    renderHighlights: vi.fn(),
    onPageChange: elements.onPageChange,
    onError: vi.fn(),
  });
}

describe("PDF component reader integration", () => {
  const document = { numPages: 3 } as PDFDocumentProxy;
  const initialView = { page: 2, mode: "single", rotation: 0, fit: "width" } as const;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves a fractional fitted scale across small gesture deltas and layout changes", async () => {
    const reader = component();
    await reader.open(document, initialView);
    const viewer = ViewerStub.instance;
    expect(reader.currentPage).toBe(2);
    expect(viewer.scrollMode).toBe(3);
    for (let i = 0; i < 10; i++) reader.zoomBy(1.001);
    expect(viewer.currentScale).toBe(1.36);
    reader.setDisplayMode("spread");
    expect(viewer.scrollMode).toBe(0);
    expect(viewer.spreadMode).toBe(2);
    reader.resize();
    for (let i = 0; i < 10; i++) reader.zoomBy(1 / 1.001);
    expect(viewer.currentScale).toBe(1.34728);
  });

  it("discards a pending viewer initialization after close", async () => {
    const reader = component();
    let finish = () => {};
    const delayed = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const runtime = await loadPdfViewerRuntime();
    vi.mocked(loadPdfViewerRuntime).mockImplementationOnce(async () => {
      await delayed;
      return runtime;
    });
    const opening = reader.open(document, initialView);
    reader.close();
    finish();
    await opening;
    expect(reader.currentPage).toBe(1);
  });

  it("anchors a pointer relative to the embedded reader pane", async () => {
    const reader = component();
    await reader.open(document, initialView);
    reader.zoomBy(1.5, [180, 220]);
    expect(ViewerStub.instance.origin).toEqual([108, 186]);
  });

  it("keeps the same point on the page under a panning pinch across consecutive scale changes", async () => {
    const elements = componentElements();
    const view = component(elements);
    await view.open(document, initialView);
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const bounds = elements.page.getBoundingClientRect;
    bounds.mockReturnValueOnce({ left: 60, top: 100, width: 200, height: 400 });
    bounds.mockReturnValueOnce({ left: 45, top: 30, width: 400, height: 800 });
    view.zoomBy(2, [110, 300], [5, -8]);
    expect(elements.reader.ownerDocument.elementFromPoint).toHaveBeenLastCalledWith(110, 300);
    expect(ViewerStub.instance.pan).toEqual([5, -8]);
    expect([elements.reader.scrollLeft, elements.reader.scrollTop]).toEqual([43, 145]);

    // A reflow happened between wheel events. Keep the original point (25%, 50%).
    now.mockReturnValue(1250);
    bounds.mockReturnValueOnce({ left: 10, top: 20, width: 400, height: 800 });
    bounds.mockReturnValueOnce({ left: 20, top: 12, width: 800, height: 1600 });
    view.zoomBy(2, [115, 292]);
    expect([elements.reader.scrollLeft, elements.reader.scrollTop]).toEqual([148, 665]);
  });

  it.each([
    { reason: "the pointer moved horizontally", x: 106, y: 250, delay: 40 },
    { reason: "the pointer moved vertically", x: 105, y: 251, delay: 40 },
    { reason: "the next gesture started later", x: 105, y: 250, delay: 251 },
  ])("captures a fresh page anchor when $reason", async ({ x, y, delay }) => {
    const elements = componentElements();
    const view = component(elements);
    await view.open(document, initialView);
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    view.zoomBy(1.5, [105, 250]);
    now.mockReturnValue(1000 + delay);
    elements.page.getBoundingClientRect.mockReturnValue({ left: 30, top: 70, width: 500, height: 1000 });
    view.zoomBy(1.5, [x, y]);
    expect([elements.reader.scrollLeft, elements.reader.scrollTop]).toEqual([13, 7]);
  });

  it.each([
    { belongsToReader: false, width: 200, height: 400 },
    { belongsToReader: true, width: 0, height: 400 },
    { belongsToReader: true, width: 200, height: 0 },
  ])(
    "zooms without moving the pane for an unusable page ($belongsToReader, $width × $height)",
    async ({ belongsToReader, width, height }) => {
      const elements = componentElements();
      const view = component(elements);
      await view.open(document, initialView);
      elements.container.contains.mockReturnValue(belongsToReader);
      elements.page.getBoundingClientRect.mockReturnValue({ left: 20, top: 40, width, height });
      view.zoomBy(2, [100, 200], [10, -20]);
      expect(ViewerStub.instance.currentScale).toBe(2.69);
      expect([elements.reader.scrollLeft, elements.reader.scrollTop]).toEqual([13, 7]);
    },
  );

  it("ignores invalid zoom factors and keeps the next valid gesture usable", async () => {
    const view = component();
    await view.open(document, initialView);
    const viewer = ViewerStub.instance;
    const update = vi.spyOn(viewer, "updateScale");
    for (const factor of [0, -1, NaN, Infinity]) view.zoomBy(factor);
    expect(update).not.toHaveBeenCalled();
    view.zoomBy(2);
    expect(viewer.currentScale).toBe(2.69);
  });

  it("clamps navigation, retains the chosen spread companion, and follows a change to another spread", async () => {
    const elements = componentElements();
    const view = component(elements);
    await view.open(document, { ...initialView, mode: "spread" });
    const viewer = ViewerStub.instance;
    expect(view.currentPage).toBe(2);
    elements.onPageChange.mockClear();
    view.goToPage(99);
    expect(viewer.currentPageNumber).toBe(3);
    expect(view.currentPage).toBe(3);
    view.goToPage(3);
    view.goToPage(1.5);
    viewer.currentPageNumber = 2;
    viewer.eventBus.listeners.get("pagechanging")?.({ pageNumber: 2 });
    expect(view.currentPage).toBe(3);
    expect(elements.onPageChange.mock.calls).toEqual([[3]]);
    viewer.currentPageNumber = 1;
    viewer.eventBus.listeners.get("pagechanging")?.({ pageNumber: 1 });
    expect(view.currentPage).toBe(1);
    expect(elements.onPageChange.mock.calls).toEqual([[3], [1]]);
    view.goToPage(2);
    view.goToPage(-5);
    expect(viewer.currentPageNumber).toBe(1);
    expect(view.currentPage).toBe(1);
  });

  it("preserves the selected page through layout changes and clears spread selection in continuous mode", async () => {
    const view = component();
    await view.open(document, { ...initialView, mode: "spread", page: 3, rotation: 90 });
    const viewer = ViewerStub.instance;
    viewer.currentPageNumber = 2;
    expect(viewer.pagesRotation).toBe(90);
    view.setDisplayMode("continuous");
    expect([viewer.scrollMode, viewer.spreadMode, view.currentPage]).toEqual([0, 0, 3]);
    viewer.currentPageNumber = 1;
    expect(view.currentPage).toBe(1);
    view.setDisplayMode("single");
    expect([viewer.scrollMode, viewer.spreadMode, view.currentPage]).toEqual([3, 0, 1]);
  });

  it("refits on rotation and resize, and resets manual zoom when selecting a fit preset", async () => {
    const elements = componentElements();
    const view = component(elements);
    await view.open(document, initialView);
    const viewer = ViewerStub.instance;
    expect(viewer.scalePreset).toBe("page-width");
    view.zoomBy(0.5);
    viewer.fittedScale = 0.9;
    view.setRotation(270);
    expect([viewer.pagesRotation, viewer.currentScale]).toEqual([270, 0.45]);
    viewer.fittedScale = 0.8;
    view.resize();
    expect(viewer.currentScale).toBe(0.4);
    view.setFitMode("page");
    expect([viewer.scalePreset, viewer.currentScale]).toEqual(["page-fit", 0.8]);
    view.zoomBy(4);
    viewer.fittedScale = 1;
    view.setFitMode("actual");
    expect([viewer.scalePreset, viewer.currentScale]).toEqual(["page-actual", 1]);
    expect(view.currentPage).toBe(2);
  });

  it("waits to refit a hidden pane until both dimensions are available", async () => {
    const elements = componentElements();
    const view = component(elements);
    await view.open(document, initialView);
    const viewer = ViewerStub.instance;
    viewer.update.mockClear();
    viewer.fittedScale = 2;
    for (const [width, height] of [
      [0, 480],
      [640, 0],
    ] as const) {
      elements.reader.clientWidth = width;
      elements.reader.clientHeight = height;
      view.resize();
    }
    expect(viewer.update).not.toHaveBeenCalled();
    expect(viewer.currentScale).toBe(1.34728);
    elements.reader.clientHeight = 480;
    view.resize();
    expect(viewer.currentScale).toBe(2);
    expect(viewer.update).toHaveBeenCalledOnce();
  });
});
