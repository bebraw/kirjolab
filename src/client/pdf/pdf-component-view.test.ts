import { describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfViewerRuntime } from "./pdfjs-runtime";
import { PdfComponentView, pdfPageLink } from "./pdf-component-view";

describe("PDF page links", () => {
  const rect = [12, 24, 36, 48];

  it("exposes external URLs and internal destinations from link annotations", () => {
    const dest = [1, { name: "XYZ" }, null, 120, null];
    for (const address of [{ url: "https://example.com/paper" }, { dest }, { dest: "appendix" }, { action: "NextPage" }]) {
      expect(pdfPageLink({ annotationType: 2, rect, ...address })).toEqual({ rect, ...address });
    }
  });

  it("ignores embedded actions and malformed link geometry", () => {
    for (const annotation of [
      { annotationType: 1, rect, url: "https://example.com" },
      { annotationType: 2, rect, action: "Print" },
      { annotationType: 2, rect, unsafeUrl: "javascript:void(0)" },
      { annotationType: 2, rect: [0, 1, 2, Infinity], dest: "appendix" },
    ])
      expect(pdfPageLink(annotation)).toBeNull();
  });
});

class ViewerEvents {
  readonly listeners = new Map<string, () => void>();

  on(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }
}

class ViewerStub {
  static instance: ViewerStub;
  readonly eventBus: ViewerEvents;
  readonly fittedScale = 1.34728;
  currentScale = this.fittedScale;
  currentPageNumber = 1;
  pagesCount = 0;
  pagesRotation = 0;
  scrollMode = 0;
  spreadMode = 0;
  origin?: number[];
  pagesPromise: Promise<void> = new Promise(() => undefined);

  constructor({ eventBus }: { eventBus: ViewerEvents }) {
    this.eventBus = eventBus;
    ViewerStub.instance = this;
  }

  setDocument(document: PDFDocumentProxy | null): void {
    this.pagesCount = document?.numPages ?? 0;
    if (document) queueMicrotask(() => this.eventBus.listeners.get("pagesinit")?.());
  }

  set currentScaleValue(_preset: string) {
    this.currentScale = this.fittedScale;
  }

  updateScale({ scaleFactor, origin }: { scaleFactor: number; origin?: number[] }): void {
    if (origin) this.origin = origin;
    this.currentScale = Math.round(this.currentScale * scaleFactor * 100) / 100;
  }

  update(): void {}
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

function component() {
  return new PdfComponentView({
    reader: {
      clientWidth: 640,
      clientHeight: 480,
      offsetTop: 6,
      offsetLeft: 8,
      getBoundingClientRect: () => ({ left: 80, top: 40 }),
    } as HTMLDivElement,
    container: { addEventListener: vi.fn(), querySelectorAll: vi.fn().mockReturnValue([]) } as Pick<
      HTMLDivElement,
      "querySelectorAll" | "addEventListener"
    > as HTMLDivElement,
    primaryMarkup: { parentElement: null } as HTMLElement,
    createPageOverlay: () => null,
    renderHighlights: vi.fn(),
    onPageChange: vi.fn(),
    onError: vi.fn(),
  });
}

describe("PDF component reader integration", () => {
  const document = { numPages: 3 } as PDFDocumentProxy;
  const initialView = { page: 2, mode: "single", rotation: 0, fit: "width" } as const;

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
});
