import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adjustPdfZoom, nextPdfFitMode, nextPdfRotation, PdfEvidenceViewer } from "./pdf-viewer";

const pdfjs = vi.hoisted(() => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
}));

vi.mock("./pdfjs-runtime", () => ({ loadPdfJsRuntime: vi.fn(async () => pdfjs) }));

const component = vi.hoisted(() => ({
  currentPage: 1,
  open: vi.fn(),
  close: vi.fn(),
  zoomBy: vi.fn(),
  setDisplayMode: vi.fn(),
  setFitMode: vi.fn(),
  setRotation: vi.fn(),
  setTextSelectionEnabled: vi.fn(),
  refreshOverlays: vi.fn(),
}));

vi.mock("./pdf-component-view", () => ({
  PdfComponentView: class {
    constructor() {
      return component;
    }
  },
}));

class FakeElement {
  readonly dataset: Record<string, string> = {};
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
}

class FakeDocument {
  readonly listeners = new Map<string, () => void>();

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }
}

const setStoredDisplayMode = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  pdfjs.getDocument.mockReset();
  const fakeDocument = new FakeDocument();
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("HTMLButtonElement", FakeElement);
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("Node", FakeElement);
  vi.stubGlobal("window", {
    clearTimeout: (timer: number | undefined) => clearTimeout(timer),
    getSelection: () => null,
    localStorage: { getItem: () => null, setItem: setStoredDisplayMode },
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PDF reading controls", () => {
  it("zooms about the trackpad pointer in the current layout", async () => {
    const elements = viewerElements();
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    pdfjs.getDocument.mockReturnValue({ destroy: vi.fn(), promise: Promise.resolve({ numPages: 3 }) });
    await viewer.open({ annotations: [], url: "/paper.pdf" });
    await viewer.setDisplayMode("continuous");
    const preventDefault = vi.fn();
    elements.reader.dispatch("wheel", {
      clientX: 100,
      clientY: 200,
      ctrlKey: true,
      deltaY: -100 * Math.log(1.5),
      deltaMode: 0,
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(component.zoomBy).toHaveBeenLastCalledWith(expect.closeTo(1.5), [100, 200], undefined);
    expect(elements.reader.dataset.displayMode).toBe("continuous");
  });

  it("finishes only the most recent document open", async () => {
    const elements = viewerElements();
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    let finishFirst: () => void = () => undefined;
    const firstDocument = new Promise<{ numPages: number }>((resolve) => {
      finishFirst = () => resolve({ numPages: 3 });
    });
    const destroy = vi.fn();
    pdfjs.getDocument
      .mockReturnValueOnce({ destroy, promise: firstDocument })
      .mockReturnValueOnce({ destroy: vi.fn(), promise: Promise.resolve({ numPages: 5 }) });
    const firstOpen = viewer.open({ annotations: [], url: "/first.pdf" });
    await vi.waitFor(() => expect(pdfjs.getDocument).toHaveBeenCalledOnce());
    expect(await viewer.open({ annotations: [], url: "/second.pdf" })).toBe(true);
    finishFirst();
    expect(await firstOpen).toBe(false);
    expect(viewer.documentKey).toBe("/second.pdf");
    expect(component.open).toHaveBeenCalledOnce();
  });

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

  it.each(["single", "continuous", "spread"] as const)("anchors a %s touch pinch at the fingers and cancels it cleanly", async (mode) => {
    const elements = viewerElements();
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());
    await viewer.setDisplayMode(mode);
    const touches = (distance: number) => [
      { clientX: 150 - distance / 2, clientY: 100 },
      { clientX: 150 + distance / 2, clientY: 100 },
    ];
    const preventDefault = vi.fn();
    elements.reader.dispatch("touchstart", { preventDefault, touches: touches(100) });
    elements.reader.dispatch("touchmove", { preventDefault, touches: touches(150) });
    expect(component.zoomBy).toHaveBeenLastCalledWith(1.5, [150, 100], [0, 0]);
    elements.reader.dispatch("touchcancel", {});
    expect(elements.reader.dataset.zoomed).toBe("false");
    expect(component.zoomBy).toHaveBeenLastCalledWith(expect.closeTo(2 / 3), [150, 100], undefined);
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

  it("clamps zoom, rotates clockwise, and wraps clockwise rotation", () => {
    expect(adjustPdfZoom(1, 0.25)).toBe(1.25);
    expect(adjustPdfZoom(0.5, -1)).toBe(0.5);
    expect(adjustPdfZoom(4, 1)).toBe(4);
    expect(nextPdfRotation(0)).toBe(90);
    expect(nextPdfRotation(270)).toBe(0);
  });

  it("wires reading controls and updates their presentation without an open document", async () => {
    const reader = new FakeElement();
    const elements = viewerElements(reader);
    const [continuousMode] = elements.continuousModeButtons;
    const [fitMode] = elements.fitModeButtons;
    const [spread] = elements.spreadButtons;
    const [zoomIn] = elements.zoomInButtons;
    const viewer = new PdfEvidenceViewer(elements as never, vi.fn(), vi.fn());

    viewer.showError(new Error("/private/tmp/browser-profile failed"));
    expect(elements.status.dataset.state).toBe("error");
    expect(elements.status.textContent).toBe("Could not display this PDF. Try reopening it.");
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
    primaryMarkup: new FakeElement(),
    container: new FakeElement(),
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
  } as const;
}
