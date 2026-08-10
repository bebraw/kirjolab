import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfContinuousView } from "./pdf-continuous-view";
import { adjustPdfZoom, nextPdfFitMode, nextPdfRotation, pdfFittedScale, pdfFlowPageWidth, PdfEvidenceViewer } from "./pdf-viewer";

const pdfjs = vi.hoisted(() => ({
  GlobalWorkerOptions: { workerSrc: "" },
  TextLayer: class {
    render(): Promise<void> {
      return Promise.resolve();
    }
  },
  getDocument: vi.fn(),
}));

vi.mock("./pdfjs-runtime", () => ({ loadPdfJsRuntime: vi.fn(async () => pdfjs) }));

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly style = {
    cssText: "",
    height: "",
    pointerEvents: "",
    transform: "",
    transformOrigin: "",
    width: "",
    removeProperty: (name: string) => {
      if (name === "transform") this.style.transform = "";
      if (name === "transform-origin") this.style.transformOrigin = "";
    },
    setProperty: (_name: string, _value: string) => undefined,
  };
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, (event: never) => void>();
  readonly ownerDocument = document;
  readonly tagName: string;
  className = "";
  hidden = false;
  disabled = false;
  title = "";
  textContent = "";
  clientWidth = 900;
  clientHeight = 700;
  scrollLeft = 0;
  scrollWidth = 900;
  scrollTop = 0;
  parentElement: FakeElement | null = null;

  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
  }

  get childNodes(): readonly FakeElement[] {
    return this.children;
  }

  addEventListener(name: string, listener: (event: never) => void): void {
    this.listeners.set(name, listener);
  }

  closest(selector: string): FakeElement | null {
    if (selector === '.pdf-markups[data-tool="draw"]' && this.dataset.tool === "draw") return this;
    if (selector === '.pdf-markups[data-drawing-active="true"]' && this.dataset.drawingActive === "true") return this;
    if (selector === ".pdf-note-pin" && this.className.split(" ").includes("pdf-note-pin")) return this;
    if (selector.includes("button") && this.tagName === "BUTTON") return this;
    return this.parentElement?.closest(selector) ?? null;
  }

  dispatch(name: string, event: unknown): void {
    this.listeners.get(name)?.(event as never);
  }

  getBoundingClientRect(): Pick<DOMRect, "height" | "left" | "top" | "width"> {
    return { height: this.clientHeight, left: 0, top: 0, width: this.clientWidth };
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  contains(candidate: unknown): boolean {
    return this === candidate || this.children.some((child) => child.contains(candidate));
  }

  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (selector === '.pdf-markups[data-drawing-active="true"]' && child.dataset.drawingActive === "true") return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.length = 0;
    this.append(...children);
  }
}

class FakeCanvas extends FakeElement {
  width = 0;
  height = 0;

  getContext(): { drawImage: ReturnType<typeof vi.fn> } {
    return { drawImage: vi.fn() };
  }
}

class FakeDocument {
  readonly listeners = new Map<string, () => void>();

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }

  createElement(tagName: string): FakeElement {
    return tagName === "canvas" ? new FakeCanvas() : new FakeElement();
  }
}

const setStoredDisplayMode = vi.fn();

beforeEach(() => {
  setStoredDisplayMode.mockClear();
  pdfjs.getDocument.mockReset();
  const fakeDocument = new FakeDocument();
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("HTMLButtonElement", FakeElement);
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("Node", FakeElement);
  vi.stubGlobal("window", {
    clearTimeout,
    devicePixelRatio: 1,
    getComputedStyle: () => ({ paddingLeft: "0", paddingRight: "0" }),
    getSelection: () => null,
    localStorage: { getItem: () => null, setItem: setStoredDisplayMode },
    setTimeout,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PDF reading controls", () => {
  it.each(["continuous", "spread"] as const)("manually pans a %s Draw surface under one-finger touch", async (mode) => {
    const reader = new FakeElement();
    reader.scrollLeft = 40;
    reader.scrollTop = 60;
    const elements = viewerElements(reader);
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    const drawLayer = new FakeElement();
    drawLayer.dataset.tool = "draw";
    const startPrevented = vi.fn();
    const movePrevented = vi.fn();

    await viewer.setDisplayMode(mode);
    reader.dispatch("touchstart", {
      preventDefault: startPrevented,
      target: drawLayer,
      touches: [{ clientX: 100, clientY: 120 }],
    });
    reader.dispatch("touchmove", {
      preventDefault: movePrevented,
      target: drawLayer,
      touches: [{ clientX: 75, clientY: 90 }],
    });

    expect(startPrevented).toHaveBeenCalledOnce();
    expect(movePrevented).toHaveBeenCalledOnce();
    expect({ left: reader.scrollLeft, top: reader.scrollTop }).toEqual({ left: 65, top: 90 });
  });

  it.each(["continuous", "spread"] as const)("leaves interactive %s Draw controls available to one-finger touch", async (mode) => {
    const reader = new FakeElement();
    reader.scrollLeft = 40;
    reader.scrollTop = 60;
    const elements = viewerElements(reader);
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    const drawLayer = new FakeElement();
    drawLayer.dataset.tool = "draw";
    const retry = new FakeElement("button");
    drawLayer.append(retry);
    const startPrevented = vi.fn();
    const movePrevented = vi.fn();

    await viewer.setDisplayMode(mode);
    reader.dispatch("touchstart", {
      preventDefault: startPrevented,
      target: retry,
      touches: [{ clientX: 100, clientY: 120 }],
    });
    reader.dispatch("touchmove", {
      preventDefault: movePrevented,
      target: retry,
      touches: [{ clientX: 75, clientY: 90 }],
    });

    expect(startPrevented).not.toHaveBeenCalled();
    expect(movePrevented).not.toHaveBeenCalled();
    expect({ left: reader.scrollLeft, top: reader.scrollTop }).toEqual({ left: 40, top: 60 });
  });

  it.each(["continuous", "spread"] as const)("pans a %s Draw surface when touch starts on an inert saved note pin", async (mode) => {
    const reader = new FakeElement();
    reader.scrollLeft = 40;
    reader.scrollTop = 60;
    const elements = viewerElements(reader);
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    const drawLayer = new FakeElement();
    drawLayer.dataset.tool = "draw";
    const notePin = new FakeElement("button");
    notePin.className = "pdf-note-pin";
    drawLayer.append(notePin);
    const startPrevented = vi.fn();
    const movePrevented = vi.fn();

    await viewer.setDisplayMode(mode);
    reader.dispatch("touchstart", {
      preventDefault: startPrevented,
      target: notePin,
      touches: [{ clientX: 100, clientY: 120 }],
    });
    reader.dispatch("touchmove", {
      preventDefault: movePrevented,
      target: notePin,
      touches: [{ clientX: 75, clientY: 90 }],
    });

    expect(startPrevented).toHaveBeenCalledOnce();
    expect(movePrevented).toHaveBeenCalledOnce();
    expect({ left: reader.scrollLeft, top: reader.scrollTop }).toEqual({ left: 65, top: 90 });
  });

  it.each(["continuous", "spread"] as const)("previews and completes a %s Draw-surface pinch on the flowing pages", async (mode) => {
    const reader = new FakeElement();
    const elements = viewerElements(reader);
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    const drawLayer = new FakeElement();
    drawLayer.dataset.tool = "draw";
    const preventDefault = vi.fn();

    await viewer.setDisplayMode(mode);
    reader.dispatch("touchstart", {
      preventDefault,
      target: drawLayer,
      touches: [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 100 },
      ],
    });
    reader.dispatch("touchmove", {
      preventDefault,
      target: drawLayer,
      touches: [
        { clientX: 75, clientY: 100 },
        { clientX: 225, clientY: 100 },
      ],
    });

    const expectedScale = pdfFlowPageWidth(reader.clientWidth, 1.5, mode) / pdfFlowPageWidth(reader.clientWidth, 1, mode);
    expect(elements.continuousPages.style.transform).toBe(`scale(${expectedScale})`);
    expect(elements.page.style.transform).toBe("");

    reader.dispatch("touchend", { changedTouches: [], target: drawLayer, touches: [] });
    await vi.waitFor(() => expect(elements.continuousPages.style.transform).toBe(""));
  });

  it("does not exaggerate a spread pinch while page width remains clamped", async () => {
    const reader = new FakeElement();
    reader.clientWidth = 320;
    const elements = viewerElements(reader);
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    const drawLayer = new FakeElement();
    drawLayer.dataset.tool = "draw";

    await viewer.setDisplayMode("spread");
    startPinch(reader, drawLayer);
    movePinch(reader, drawLayer, 150);

    expect(elements.continuousPages.style.transform).toBe("scale(1)");
    reader.dispatch("touchcancel", {});
  });

  it.each(["continuous", "spread"] as const)("restores a cancelled %s pinch before the next gesture", async (mode) => {
    const reader = new FakeElement();
    const elements = viewerElements(reader);
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    const drawLayer = new FakeElement();
    drawLayer.dataset.tool = "draw";
    const startTouches = [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ];
    const movedTouches = [
      { clientX: 75, clientY: 100 },
      { clientX: 225, clientY: 100 },
    ];

    await viewer.setDisplayMode(mode);
    reader.dispatch("touchstart", { preventDefault: vi.fn(), target: drawLayer, touches: startTouches });
    reader.dispatch("touchmove", { preventDefault: vi.fn(), target: drawLayer, touches: movedTouches });
    const expectedScale = pdfFlowPageWidth(reader.clientWidth, 1.5, mode) / pdfFlowPageWidth(reader.clientWidth, 1, mode);
    expect(elements.continuousPages.style.transform).toBe(`scale(${expectedScale})`);
    expect(reader.dataset.zoomed).toBe("true");

    reader.dispatch("touchcancel", {});
    expect(elements.continuousPages.style.transform).toBe("");
    expect(elements.continuousPages.style.transformOrigin).toBe("");
    expect(reader.dataset.zoomed).toBe("false");

    reader.dispatch("touchstart", { preventDefault: vi.fn(), target: drawLayer, touches: startTouches });
    reader.dispatch("touchmove", { preventDefault: vi.fn(), target: drawLayer, touches: movedTouches });
    expect(elements.continuousPages.style.transform).toBe(`scale(${expectedScale})`);
  });

  it.each([
    { initialWidth: 900, mode: "continuous", secondZoomedWidth: 2_700, zoomedWidth: 1_350 },
    { initialWidth: 438, mode: "spread", secondZoomedWidth: 1_338, zoomedWidth: 663 },
  ] as const)(
    "rerenders a $mode pinch at the zoomed width without losing the current page",
    async ({ initialWidth, mode, secondZoomedWidth, zoomedWidth }) => {
      const elements = viewerElements();
      const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
      const documentModel = pdfDocument(3);
      pdfjs.getDocument.mockReturnValue({ destroy: vi.fn(), promise: Promise.resolve(documentModel) });
      const openFlow = vi.spyOn(PdfContinuousView.prototype, "open").mockResolvedValue();
      const drawLayer = new FakeElement();
      drawLayer.dataset.tool = "draw";

      await viewer.open({ annotations: [], page: 2, url: "/paper.pdf" });
      await viewer.setDisplayMode(mode);
      expect(openFlow).toHaveBeenLastCalledWith(documentModel, pdfjs, 2, initialWidth, 0);

      elements.reader.dispatch("touchstart", {
        preventDefault: vi.fn(),
        target: drawLayer,
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 100 },
        ],
      });
      elements.reader.dispatch("touchmove", {
        preventDefault: vi.fn(),
        target: drawLayer,
        touches: [
          { clientX: 75, clientY: 100 },
          { clientX: 225, clientY: 100 },
        ],
      });
      elements.reader.dispatch("touchend", { changedTouches: [], target: drawLayer, touches: [] });

      await vi.waitFor(() => expect(openFlow).toHaveBeenCalledTimes(2));
      expect(openFlow).toHaveBeenLastCalledWith(documentModel, pdfjs, 2, zoomedWidth, 0, false);

      elements.reader.dispatch("touchstart", {
        preventDefault: vi.fn(),
        target: drawLayer,
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 100 },
        ],
      });
      elements.reader.dispatch("touchmove", {
        preventDefault: vi.fn(),
        target: drawLayer,
        touches: [
          { clientX: 50, clientY: 100 },
          { clientX: 250, clientY: 100 },
        ],
      });

      expect(elements.continuousPages.style.transform).toBe(`scale(${secondZoomedWidth / zoomedWidth})`);
      elements.reader.dispatch("touchend", { changedTouches: [], target: drawLayer, touches: [] });
      await vi.waitFor(() => expect(openFlow).toHaveBeenCalledTimes(3));
      expect(openFlow).toHaveBeenLastCalledWith(documentModel, pdfjs, 2, secondZoomedWidth, 0, false);
    },
  );

  it.each(["continuous", "spread"] as const)("ignores a stale %s pinch completion after switching to single-page mode", async (mode) => {
    const elements = viewerElements();
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    const documentModel = pdfDocument(3);
    pdfjs.getDocument.mockReturnValue({ destroy: vi.fn(), promise: Promise.resolve(documentModel) });
    const staleFlow = deferredVoid();
    const openFlow = vi.spyOn(PdfContinuousView.prototype, "open").mockResolvedValue();
    const drawLayer = new FakeElement();
    drawLayer.dataset.tool = "draw";

    await viewer.open({ annotations: [], page: 2, url: "/paper.pdf" });
    await viewer.setDisplayMode(mode);
    openFlow.mockImplementationOnce(() => staleFlow.promise);

    startPinch(elements.reader, drawLayer);
    movePinch(elements.reader, drawLayer, 125);
    finishPinch(elements.reader, drawLayer);
    await vi.waitFor(() => expect(openFlow).toHaveBeenCalledTimes(2));

    await viewer.setDisplayMode("single");
    startPinch(elements.reader, drawLayer);
    movePinch(elements.reader, drawLayer, 200);
    expect(elements.page.style.transform).toBe("scale(2)");
    elements.reader.scrollLeft = 25;
    elements.reader.scrollTop = 55;
    elements.continuousPages.clientWidth = 450;
    elements.continuousPages.clientHeight = 350;

    staleFlow.resolve();
    await settleAsyncEvent();

    expect({ left: elements.reader.scrollLeft, top: elements.reader.scrollTop }).toEqual({ left: 25, top: 55 });
    movePinch(elements.reader, drawLayer, 160);
    expect(elements.page.style.transform).toBe("scale(1.6)");
    elements.reader.dispatch("touchcancel", {});
  });

  it.each(["continuous", "spread"] as const)("publishes the latest %s render when its initial open becomes stale", async (mode) => {
    const elements = viewerElements();
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    const documentModel = pdfDocument(3);
    pdfjs.getDocument.mockReturnValue({ destroy: vi.fn(), promise: Promise.resolve(documentModel) });
    const initialFlow = deferredVoid();
    const pinchFlow = deferredVoid();
    const openFlow = vi
      .spyOn(PdfContinuousView.prototype, "open")
      .mockImplementationOnce(() => initialFlow.promise)
      .mockImplementationOnce(() => pinchFlow.promise);
    const drawLayer = new FakeElement();
    drawLayer.dataset.tool = "draw";

    await viewer.open({ annotations: [], page: 2, url: "/paper.pdf" });
    const displayChange = viewer.setDisplayMode(mode);
    await vi.waitFor(() => expect(openFlow).toHaveBeenCalledOnce());
    expect(elements.reader.attributes.get("aria-busy")).toBe("true");
    expect(elements.zoomInButtons[0]?.disabled).toBe(true);

    startPinch(elements.reader, drawLayer);
    movePinch(elements.reader, drawLayer, 125);
    finishPinch(elements.reader, drawLayer);
    await vi.waitFor(() => expect(openFlow).toHaveBeenCalledTimes(2));
    pinchFlow.resolve();
    await settleAsyncEvent();

    expect(elements.reader.attributes.get("aria-busy")).toBe("false");
    expect(elements.zoomInButtons[0]?.disabled).toBe(false);
    expect(elements.status.dataset.state).toBe("ready");

    initialFlow.resolve();
    await displayChange;
    expect(elements.reader.attributes.get("aria-busy")).toBe("false");
    expect(elements.zoomInButtons[0]?.disabled).toBe(false);
  });

  it.each(["continuous", "spread"] as const)(
    "keeps overlapping %s pinch completions scoped to their own render and anchor",
    async (mode) => {
      const elements = viewerElements();
      const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
      const documentModel = pdfDocument(3);
      pdfjs.getDocument.mockReturnValue({ destroy: vi.fn(), promise: Promise.resolve(documentModel) });
      const firstFlow = deferredVoid();
      const secondFlow = deferredVoid();
      const openFlow = vi.spyOn(PdfContinuousView.prototype, "open").mockResolvedValue();
      const drawLayer = new FakeElement();
      drawLayer.dataset.tool = "draw";

      await viewer.open({ annotations: [], page: 2, url: "/paper.pdf" });
      await viewer.setDisplayMode(mode);
      openFlow.mockImplementationOnce(() => firstFlow.promise).mockImplementationOnce(() => secondFlow.promise);

      startPinch(elements.reader, drawLayer);
      movePinch(elements.reader, drawLayer, 125);
      finishPinch(elements.reader, drawLayer);
      await vi.waitFor(() => expect(openFlow).toHaveBeenCalledTimes(2));

      startPinch(elements.reader, drawLayer);
      movePinch(elements.reader, drawLayer, 200);
      finishPinch(elements.reader, drawLayer);
      await vi.waitFor(() => expect(openFlow).toHaveBeenCalledTimes(3));
      elements.reader.scrollLeft = 25;
      elements.reader.scrollTop = 55;
      elements.continuousPages.clientWidth = 450;
      elements.continuousPages.clientHeight = 350;

      firstFlow.resolve();
      await settleAsyncEvent();

      expect({ left: elements.reader.scrollLeft, top: elements.reader.scrollTop }).toEqual({ left: 25, top: 55 });
      startPinch(elements.reader, drawLayer);
      movePinch(elements.reader, drawLayer, 120);
      const expectedScale = pdfFlowPageWidth(elements.reader.clientWidth, 3, mode) / pdfFlowPageWidth(elements.reader.clientWidth, 1, mode);
      expect(elements.continuousPages.style.transform).toBe(`scale(${expectedScale})`);
      elements.reader.dispatch("touchcancel", {});
      secondFlow.resolve();
      await settleAsyncEvent();
    },
  );

  it.each(["continuous", "spread"] as const)("does not publish a stale %s pinch while a newer pinch is active", async (mode) => {
    const elements = viewerElements();
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    const documentModel = pdfDocument(3);
    pdfjs.getDocument.mockReturnValue({ destroy: vi.fn(), promise: Promise.resolve(documentModel) });
    const staleFlow = deferredVoid();
    const openFlow = vi.spyOn(PdfContinuousView.prototype, "open").mockResolvedValue();
    const drawLayer = new FakeElement();
    drawLayer.dataset.tool = "draw";

    await viewer.open({ annotations: [], page: 2, url: "/paper.pdf" });
    await viewer.setDisplayMode(mode);
    openFlow.mockImplementationOnce(() => staleFlow.promise);

    startPinch(elements.reader, drawLayer);
    movePinch(elements.reader, drawLayer, 125);
    finishPinch(elements.reader, drawLayer);
    await vi.waitFor(() => expect(openFlow).toHaveBeenCalledTimes(2));

    startPinch(elements.reader, drawLayer);
    movePinch(elements.reader, drawLayer, 200);
    const previewOrigin = elements.continuousPages.style.transformOrigin;
    elements.reader.scrollLeft = 25;
    elements.reader.scrollTop = 55;
    elements.continuousPages.clientWidth = 450;
    elements.continuousPages.clientHeight = 350;

    staleFlow.resolve();
    await settleAsyncEvent();

    expect({ left: elements.reader.scrollLeft, top: elements.reader.scrollTop }).toEqual({ left: 25, top: 55 });
    const expectedScale =
      pdfFlowPageWidth(elements.reader.clientWidth, 2.5, mode) / pdfFlowPageWidth(elements.reader.clientWidth, 1.25, mode);
    expect(elements.continuousPages.style.transform).toBe(`scale(${expectedScale})`);
    expect(elements.continuousPages.style.transformOrigin).toBe(previewOrigin);
    elements.reader.dispatch("touchcancel", {});

    startPinch(elements.reader, drawLayer);
    movePinch(elements.reader, drawLayer, 150);
    const nextScale =
      pdfFlowPageWidth(elements.reader.clientWidth, 1.875, mode) / pdfFlowPageWidth(elements.reader.clientWidth, 1.25, mode);
    expect(elements.continuousPages.style.transform).toBe(`scale(${nextScale})`);
    elements.reader.dispatch("touchcancel", {});
  });

  it.each(["continuous", "spread"] as const)("does not pan a %s page while a pen drawing owns the surface", async (mode) => {
    const reader = new FakeElement();
    reader.scrollLeft = 40;
    reader.scrollTop = 60;
    const elements = viewerElements(reader);
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    const activeDrawingLayer = new FakeElement();
    activeDrawingLayer.dataset.drawingActive = "true";
    activeDrawingLayer.dataset.tool = "draw";
    const startPrevented = vi.fn();
    const movePrevented = vi.fn();

    await viewer.setDisplayMode(mode);
    reader.dispatch("touchstart", {
      preventDefault: startPrevented,
      target: activeDrawingLayer,
      touches: [{ clientX: 100, clientY: 120 }],
    });
    reader.dispatch("touchmove", {
      preventDefault: movePrevented,
      target: activeDrawingLayer,
      touches: [{ clientX: 75, clientY: 90 }],
    });

    expect(startPrevented).toHaveBeenCalledOnce();
    expect(movePrevented).toHaveBeenCalledOnce();
    expect({ left: reader.scrollLeft, top: reader.scrollTop }).toEqual({ left: 40, top: 60 });
  });

  it.each(["continuous", "spread"] as const)("does not pan sibling %s pages while a pen drawing owns the reader", async (mode) => {
    const reader = new FakeElement();
    reader.scrollLeft = 40;
    reader.scrollTop = 60;
    const elements = viewerElements(reader);
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    const activeDrawingLayer = new FakeElement();
    activeDrawingLayer.dataset.drawingActive = "true";
    activeDrawingLayer.dataset.tool = "draw";
    const touchedDrawLayer = new FakeElement();
    touchedDrawLayer.dataset.tool = "draw";
    reader.append(activeDrawingLayer, touchedDrawLayer);
    const startPrevented = vi.fn();
    const movePrevented = vi.fn();

    await viewer.setDisplayMode(mode);
    reader.dispatch("touchstart", {
      preventDefault: startPrevented,
      target: touchedDrawLayer,
      touches: [{ clientX: 100, clientY: 120 }],
    });
    reader.dispatch("touchmove", {
      preventDefault: movePrevented,
      target: touchedDrawLayer,
      touches: [{ clientX: 75, clientY: 90 }],
    });

    expect(startPrevented).toHaveBeenCalledOnce();
    expect(movePrevented).toHaveBeenCalledOnce();
    expect({ left: reader.scrollLeft, top: reader.scrollTop }).toEqual({ left: 40, top: 60 });
  });

  it("cycles through explicit fit modes", () => {
    expect(nextPdfFitMode("width")).toBe("page");
    expect(nextPdfFitMode("page")).toBe("actual");
    expect(nextPdfFitMode("actual")).toBe("width");
  });

  it("clamps zoom, rotates clockwise, and sizes flow layouts", () => {
    expect(adjustPdfZoom(1, 0.25)).toBe(1.25);
    expect(adjustPdfZoom(0.5, -1)).toBe(0.5);
    expect(adjustPdfZoom(4, 1)).toBe(4);
    expect(nextPdfRotation(0)).toBe(90);
    expect(nextPdfRotation(270)).toBe(0);
    expect(pdfFlowPageWidth(800, 1.5, "continuous")).toBe(1200);
    expect(pdfFlowPageWidth(800, 1, "spread")).toBe(388);
    expect(pdfFlowPageWidth(300, 1, "spread")).toBe(240);
  });

  it("fits pages by width, whole page, or actual size", () => {
    expect(pdfFittedScale("width", 800, 600, 400, 1000)).toBe(2);
    expect(pdfFittedScale("page", 800, 600, 400, 1000)).toBe(0.6);
    expect(pdfFittedScale("actual", 800, 600, 400, 1000)).toBe(1);
  });

  it("wires reading controls and updates their presentation without an open document", async () => {
    const reader = new FakeElement();
    const page = new FakeElement();
    const continuousPages = new FakeElement();
    const continuousMode = new FakeElement();
    const fitMode = new FakeElement();
    const rotate = new FakeElement();
    const spread = new FakeElement();
    const zoomIn = new FakeElement();
    const zoomOut = new FakeElement();
    const elements = {
      reader,
      canvas: new FakeElement(),
      page,
      links: new FakeElement(),
      textLayer: new FakeElement(),
      highlights: new FakeElement(),
      continuousPages,
      continuousModeButtons: [continuousMode],
      fitModeButtons: [fitMode],
      rotateButtons: [rotate],
      spreadButtons: [spread],
      zoomInButtons: [zoomIn],
      zoomOutButtons: [zoomOut],
      pageIndicators: [new FakeElement()],
      previousPages: [new FakeElement()],
      nextPages: [new FakeElement()],
      status: new FakeElement(),
    };
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());

    viewer.showError(new Error("/private/tmp/browser-profile failed"));
    expect(elements.status.dataset.state).toBe("error");
    expect((elements.status as unknown as { textContent: string }).textContent).toBe("Could not display this PDF. Try reopening it.");
    expect(reader.attributes.get("aria-busy")).toBe("false");
    expect(zoomIn.disabled).toBe(true);

    await viewer.adjustZoom(0.25);
    expect(reader.dataset.zoomed).toBe("true");
    await viewer.cycleFitMode();
    expect(fitMode.title).toBe("Fit page");
    await viewer.rotateClockwise();
    await viewer.setDisplayMode("continuous");
    expect(continuousMode.attributes.get("aria-pressed")).toBe("true");
    expect(setStoredDisplayMode).toHaveBeenCalledTimes(1);
    viewer.setTextSelectionMode("disabled");
    expect(continuousMode.attributes.get("aria-pressed")).toBe("true");
    expect(setStoredDisplayMode).toHaveBeenCalledTimes(1);
    expect(setStoredDisplayMode).toHaveBeenLastCalledWith("kirjolab.pdf.display-mode", "continuous");
    await viewer.setDisplayMode("spread");
    expect(spread.attributes.get("aria-pressed")).toBe("true");
    expect(setStoredDisplayMode).toHaveBeenCalledTimes(2);
    viewer.setTextSelectionMode("disabled");
    expect(spread.attributes.get("aria-pressed")).toBe("true");
    expect(setStoredDisplayMode).toHaveBeenCalledTimes(2);
    expect(setStoredDisplayMode).toHaveBeenLastCalledWith("kirjolab.pdf.display-mode", "spread");
    await viewer.setDisplayMode("single");
    expect(continuousMode.attributes.get("aria-pressed")).toBe("false");
    expect(setStoredDisplayMode).toHaveBeenCalledTimes(3);
  });
});

function viewerElements(reader = new FakeElement()) {
  return {
    reader,
    canvas: new FakeCanvas(),
    page: new FakeElement(),
    links: new FakeElement(),
    textLayer: new FakeElement(),
    highlights: new FakeElement(),
    continuousPages: new FakeElement(),
    continuousModeButtons: [new FakeElement()],
    fitModeButtons: [new FakeElement()],
    rotateButtons: [new FakeElement()],
    spreadButtons: [new FakeElement()],
    zoomInButtons: [new FakeElement()],
    zoomOutButtons: [new FakeElement()],
    pageIndicators: [new FakeElement()],
    previousPages: [new FakeElement()],
    nextPages: [new FakeElement()],
    status: new FakeElement(),
  };
}

function pdfDocument(pages: number) {
  const page = {
    getAnnotations: async () => [],
    getViewport: ({ scale }: { readonly scale: number }) => ({
      convertToViewportPoint: (x: number, y: number) => [x * scale, y * scale],
      height: 600 * scale,
      scale,
      width: 400 * scale,
    }),
    render: () => ({ promise: Promise.resolve() }),
    streamTextContent: () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue({ items: [], lang: null, styles: {} });
          controller.close();
        },
      }),
  };
  return { getPage: vi.fn(async () => page), numPages: pages };
}

function deferredVoid(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function startPinch(reader: FakeElement, target: FakeElement): void {
  reader.dispatch("touchstart", { preventDefault: vi.fn(), target, touches: pinchTouches(100) });
}

function movePinch(reader: FakeElement, target: FakeElement, distance: number): void {
  reader.dispatch("touchmove", { preventDefault: vi.fn(), target, touches: pinchTouches(distance) });
}

function finishPinch(reader: FakeElement, target: FakeElement): void {
  reader.dispatch("touchend", { changedTouches: [], target, touches: [] });
}

function pinchTouches(distance: number): readonly { readonly clientX: number; readonly clientY: number }[] {
  return [
    { clientX: 150 - distance / 2, clientY: 100 },
    { clientX: 150 + distance / 2, clientY: 100 },
  ];
}

async function settleAsyncEvent(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
