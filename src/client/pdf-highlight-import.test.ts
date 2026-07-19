import { describe, expect, it } from "vitest";
import {
  deduplicatePdfHighlightCandidates,
  detectYellowRegions,
  flattenedPdfHighlightCandidates,
  nativePdfHighlightCandidates,
  type PdfHighlightImportCandidate,
  type PdfHighlightTextSpan,
  type PdfHighlightViewport,
} from "./pdf-highlight-import";

describe("PDF highlight import", () => {
  it("finds yellow regions while ignoring cyan links and white page content", () => {
    const pixels = whitePixels(30, 16);
    paint(pixels, 30, { left: 2, top: 2, right: 15, bottom: 6 }, [255, 235, 0, 255]);
    paint(pixels, 30, { left: 3, top: 9, right: 18, bottom: 13 }, [0, 255, 255, 255]);

    expect(detectYellowRegions(pixels, 30, 16)).toEqual([{ left: 2, top: 2, right: 15, bottom: 6 }]);
  });

  it("reconstructs consecutive highlighted lines as one reviewed candidate", () => {
    const pixels = whitePixels(40, 24);
    paint(pixels, 40, { left: 2, top: 2, right: 30, bottom: 8 }, [255, 232, 0, 255]);
    paint(pixels, 40, { left: 2, top: 9, right: 34, bottom: 15 }, [255, 232, 0, 255]);
    const spans: PdfHighlightTextSpan[] = [
      { index: 0, text: "Evidence starts here", rect: { left: 3, top: 2, right: 29, bottom: 8 }, hasEol: true },
      { index: 1, text: "and continues here.", rect: { left: 3, top: 9, right: 33, bottom: 15 }, hasEol: true },
    ];

    expect(flattenedPdfHighlightCandidates(pixels, 40, 24, spans, 3)).toEqual([
      expect.objectContaining({
        source: "flattened",
        page: 3,
        quote: "Evidence starts here and continues here.",
        confidence: 0.85,
        rects: [
          { x: 0.05, y: 0.083_333, width: 0.7, height: 0.25 },
          { x: 0.05, y: 0.375, width: 0.8, height: 0.25 },
        ],
      }),
    ]);
  });

  it("keeps separated inline highlights as separate candidates", () => {
    const pixels = whitePixels(50, 12);
    paint(pixels, 50, { left: 2, top: 2, right: 12, bottom: 8 }, [250, 225, 10, 255]);
    paint(pixels, 50, { left: 34, top: 2, right: 47, bottom: 8 }, [250, 225, 10, 255]);
    const spans: PdfHighlightTextSpan[] = [
      { index: 0, text: "first", rect: { left: 2, top: 2, right: 12, bottom: 8 }, hasEol: false },
      { index: 1, text: "ordinary words", rect: { left: 14, top: 2, right: 32, bottom: 8 }, hasEol: false },
      { index: 2, text: "second", rect: { left: 34, top: 2, right: 47, bottom: 8 }, hasEol: true },
    ];

    expect(flattenedPdfHighlightCandidates(pixels, 50, 12, spans, 1).map((candidate) => candidate.quote)).toEqual(["first", "second"]);
  });

  it("rejects malformed pixel buffers", () => {
    expect(detectYellowRegions(new Uint8ClampedArray(3), 10, 10)).toEqual([]);
    expect(detectYellowRegions(new Uint8ClampedArray(), 0, 0)).toEqual([]);
  });

  it("recovers native highlight quads and their PDF comments", () => {
    const viewport: PdfHighlightViewport = {
      width: 100,
      height: 200,
      convertToViewportPoint: (x, y) => [x, y],
    };
    const spans: PdfHighlightTextSpan[] = [
      { index: 0, text: "Native evidence", rect: { left: 2, top: 2, right: 12, bottom: 8 }, hasEol: true },
    ];
    expect(
      nativePdfHighlightCandidates(
        viewport,
        spans,
        [
          {
            subtype: "Highlight",
            quadPoints: new Float32Array([2, 8, 12, 8, 2, 2, 12, 2]),
            contentsObj: { str: "Imported note" },
          },
          { subtype: "Link", rect: [2, 2, 12, 8] },
        ],
        4,
      ),
    ).toEqual([
      {
        id: "annotation:4:0",
        source: "annotation",
        page: 4,
        quote: "Native evidence",
        comment: "Imported note",
        rects: [{ x: 0.02, y: 0.01, width: 0.1, height: 0.03 }],
        confidence: 1,
      },
    ]);
  });

  it("uses an annotation rectangle when quads are absent and ignores highlights without recoverable text", () => {
    const viewport: PdfHighlightViewport = {
      width: 50,
      height: 50,
      convertToViewportPoint: (x, y) => [x, 50 - y],
    };
    const spans: PdfHighlightTextSpan[] = [
      { index: 0, text: "Rectangle evidence", rect: { left: 5, top: 10, right: 25, bottom: 20 }, hasEol: true },
    ];
    expect(
      nativePdfHighlightCandidates(
        viewport,
        spans,
        [
          { subtype: "Highlight", rect: [5, 30, 25, 40], contentsObj: null },
          { subtype: "Highlight", rect: [30, 30, 40, 40] },
          { subtype: "Highlight", rect: [Number.NaN, 0, 1, 1] },
        ],
        1,
      ),
    ).toEqual([
      expect.objectContaining({
        quote: "Rectangle evidence",
        comment: "",
        rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.2 }],
      }),
    ]);
  });

  it("prefers native annotations when flattened detection finds the same highlight", () => {
    const native: PdfHighlightImportCandidate = {
      id: "annotation:1:0",
      source: "annotation",
      page: 1,
      quote: "Same evidence",
      comment: "PDF note",
      rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.04 }],
      confidence: 1,
    };
    const flattened: PdfHighlightImportCandidate = {
      ...native,
      id: "flattened:1:0",
      source: "flattened",
      comment: "",
      confidence: 0.85,
    };
    const separate = { ...flattened, id: "flattened:2:0", page: 2 };
    expect(deduplicatePdfHighlightCandidates([native, flattened, separate])).toEqual([native, separate]);
  });
});

function whitePixels(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 255;
    pixels[offset + 1] = 255;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function paint(
  pixels: Uint8ClampedArray,
  width: number,
  rect: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
  color: readonly [number, number, number, number],
): void {
  for (let y = rect.top; y < rect.bottom; y += 1) {
    for (let x = rect.left; x < rect.right; x += 1) {
      const offset = (y * width + x) * 4;
      pixels.set(color, offset);
    }
  }
}
