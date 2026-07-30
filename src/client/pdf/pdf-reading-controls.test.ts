import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adjustPdfZoom, nextPdfFitMode, nextPdfRotation, pdfFittedScale, pdfFlowPageWidth, PdfEvidenceViewer } from "./pdf-viewer";

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly style = { pointerEvents: "" };
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly ownerDocument = document;
  hidden = false;
  disabled = false;
  title = "";
  clientWidth = 900;
  clientHeight = 700;
  scrollTop = 0;

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }

  querySelector(): null {
    return null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  replaceChildren(): void {}
}

class FakeDocument {
  readonly listeners = new Map<string, () => void>();

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }
}

beforeEach(() => {
  const fakeDocument = new FakeDocument();
  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("window", {
    localStorage: { getItem: () => null, setItem: vi.fn() },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("PDF reading controls", () => {
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
    await viewer.setDisplayMode("spread");
    expect(spread.attributes.get("aria-pressed")).toBe("true");
    await viewer.setDisplayMode("single");
    expect(continuousMode.attributes.get("aria-pressed")).toBe("false");
  });
});
