import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deduplicatePdfHighlightCandidates,
  detectImportedPdfHighlights,
  detectYellowRegions,
  flattenedPdfHighlightCandidates,
  nativePdfHighlightCandidates,
  type PdfHighlightImportCandidate,
  type PdfHighlightTextSpan,
  type PdfHighlightViewport,
} from "./pdf-highlight-import";

const pdfjs = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: "" },
  AnnotationMode: { DISABLE: 0 },
  Util: {
    transform: vi.fn((left: number[], right: number[]) => [
      left[0]! * right[0]!,
      left[1]! + right[1]!,
      left[2]! + right[2]!,
      left[3]! * right[3]!,
      left[4]! + right[4]!,
      left[5]! + right[5]!,
    ]),
  },
}));

vi.mock("./pdfjs-runtime", () => ({ loadPdfJsRuntime: vi.fn().mockResolvedValue(pdfjs) }));

interface CanvasStub {
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
}

let canvases: CanvasStub[] = [];

beforeEach(() => {
  pdfjs.getDocument.mockReset();
  pdfjs.GlobalWorkerOptions.workerSrc = "";
  pdfjs.Util.transform.mockClear();
  canvases = [];
  vi.stubGlobal("document", {
    createElement: vi.fn(() => {
      const canvas: CanvasStub = { width: 0, height: 0, getContext: vi.fn(() => null) };
      canvases.push(canvas);
      return canvas;
    }),
  });
});

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

  it("rejects tall yellow figure callouts while retaining line-height highlights", () => {
    const pixels = whitePixels(80, 50);
    paint(pixels, 80, { left: 4, top: 2, right: 60, bottom: 30 }, [255, 235, 80, 255]);
    paint(pixels, 80, { left: 4, top: 38, right: 42, bottom: 46 }, [255, 235, 80, 255]);
    const spans: PdfHighlightTextSpan[] = [
      { index: 0, text: "Thought 1: determine the location", rect: { left: 8, top: 7, right: 56, bottom: 15 }, hasEol: true },
      { index: 1, text: "to query the weather service.", rect: { left: 8, top: 17, right: 51, bottom: 25 }, hasEol: true },
      { index: 2, text: "Actual highlighted evidence", rect: { left: 6, top: 38, right: 40, bottom: 46 }, hasEol: true },
    ];

    expect(flattenedPdfHighlightCandidates(pixels, 80, 50, spans, 1).map((candidate) => candidate.quote)).toEqual([
      "Actual highlighted evidence",
    ]);
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

  it.each([
    [[221, 201, 154, 181], true],
    [[190, 166, 154, 181], false],
    [[221, 165, 154, 181], false],
    [[221, 201, 155, 181], false],
    [[221, 211, 155, 181], false],
    [[219, 211, 154, 181], false],
    [[221, 199, 154, 181], false],
    [[221, 200, 154, 180], false],
  ] as const)("applies every yellow-channel boundary to %j", (color, detected) => {
    const pixels = whitePixels(6, 4);
    paint(pixels, 6, { left: 1, top: 0, right: 5, bottom: 4 }, color);

    expect(detectYellowRegions(pixels, 6, 4)).toEqual(detected ? [{ left: 1, top: 0, right: 5, bottom: 4 }] : []);
  });

  it("bridges short white gaps within a scanline but separates gaps over five pixels", () => {
    const bridged = whitePixels(20, 3);
    paint(bridged, 20, { left: 1, top: 0, right: 4, bottom: 3 }, [255, 230, 0, 255]);
    paint(bridged, 20, { left: 9, top: 0, right: 13, bottom: 3 }, [255, 230, 0, 255]);
    const separated = whitePixels(22, 3);
    paint(separated, 22, { left: 1, top: 0, right: 5, bottom: 3 }, [255, 230, 0, 255]);
    paint(separated, 22, { left: 11, top: 0, right: 16, bottom: 3 }, [255, 230, 0, 255]);

    expect(detectYellowRegions(bridged, 20, 3)).toEqual([{ left: 1, top: 0, right: 13, bottom: 3 }]);
    expect(detectYellowRegions(separated, 22, 3)).toEqual([
      { left: 1, top: 0, right: 5, bottom: 3 },
      { left: 11, top: 0, right: 16, bottom: 3 },
    ]);
  });

  it("requires regions to be at least four pixels wide and three rows tall", () => {
    const narrow = whitePixels(3, 4);
    paint(narrow, 3, { left: 0, top: 0, right: 3, bottom: 4 }, [255, 230, 0, 255]);
    const short = whitePixels(4, 2);
    paint(short, 4, { left: 0, top: 0, right: 4, bottom: 2 }, [255, 230, 0, 255]);
    const minimum = whitePixels(4, 3);
    paint(minimum, 4, { left: 0, top: 0, right: 4, bottom: 3 }, [255, 230, 0, 255]);

    expect(detectYellowRegions(narrow, 3, 4)).toEqual([]);
    expect(detectYellowRegions(short, 4, 2)).toEqual([]);
    expect(detectYellowRegions(minimum, 4, 3)).toEqual([{ left: 0, top: 0, right: 4, bottom: 3 }]);
  });

  it("merges vertically overlapping scanline runs and closes inactive regions", () => {
    const pixels = whitePixels(24, 9);
    paint(pixels, 24, { left: 2, top: 0, right: 12, bottom: 2 }, [255, 230, 0, 255]);
    paint(pixels, 24, { left: 4, top: 2, right: 14, bottom: 4 }, [255, 230, 0, 255]);
    paint(pixels, 24, { left: 15, top: 5, right: 22, bottom: 9 }, [255, 230, 0, 255]);

    expect(detectYellowRegions(pixels, 24, 9)).toEqual([
      { left: 2, top: 0, right: 14, bottom: 4 },
      { left: 15, top: 5, right: 22, bottom: 9 },
    ]);
  });

  it("uses all valid quad groups and normalizes reversed viewport coordinates", () => {
    const viewport: PdfHighlightViewport = {
      width: 200,
      height: 100,
      convertToViewportPoint: (x, y) => [200 - x, 100 - y],
    };
    const spans: PdfHighlightTextSpan[] = [
      { index: 0, text: "first", rect: { left: 180, top: 80, right: 190, bottom: 90 }, hasEol: false },
      { index: 1, text: " second ", rect: { left: 160, top: 60, right: 175, bottom: 70 }, hasEol: true },
    ];

    expect(
      nativePdfHighlightCandidates(
        viewport,
        spans,
        [
          {
            subtype: "Highlight",
            quadPoints: new Float64Array([10, 10, 20, 10, 10, 20, 20, 20, 25, 30, 40, 30, 25, 40, 40, 40]),
            contentsObj: { str: "  note  " },
          },
        ],
        2,
      ),
    ).toEqual([
      {
        id: "annotation:2:0",
        source: "annotation",
        page: 2,
        quote: "first second",
        comment: "note",
        rects: [
          { x: 0.9, y: 0.8, width: 0.05, height: 0.1 },
          { x: 0.8, y: 0.6, width: 0.075, height: 0.1 },
        ],
        confidence: 1,
      },
    ]);
  });

  it("falls back from malformed quads only when a complete finite rectangle exists", () => {
    const viewport: PdfHighlightViewport = {
      width: 100,
      height: 100,
      convertToViewportPoint: (x, y) => [x, y],
    };
    const spans: PdfHighlightTextSpan[] = [
      { index: 0, text: "fallback", rect: { left: 10, top: 10, right: 30, bottom: 20 }, hasEol: true },
    ];

    expect(
      nativePdfHighlightCandidates(
        viewport,
        spans,
        [
          { subtype: "Highlight", quadPoints: [10, 10, "bad", 20], rect: new Float32Array([10, 10, 30, 20]) },
          { subtype: "Highlight", quadPoints: [10, 10, 30, 10, 10, 20, 30], rect: [10, 10, 30] },
          { subtype: "Highlight", quadPoints: [10, 10, 30, 10, 10, 20, 30, Number.POSITIVE_INFINITY] },
          { subtype: 1, rect: [10, 10, 30, 20] },
        ],
        8,
      ),
    ).toEqual([
      expect.objectContaining({
        id: "annotation:8:0",
        quote: "fallback",
        comment: "",
      }),
    ]);
  });

  it("connects nearby flattened lines only when span order, vertical gap, and horizontal overlap agree", () => {
    const spans: PdfHighlightTextSpan[] = [
      { index: 0, text: "zero", rect: { left: 0, top: 0, right: 20, bottom: 8 }, hasEol: true },
      { index: 1, text: "one", rect: { left: 0, top: 9, right: 20, bottom: 17 }, hasEol: true },
      { index: 4, text: "four", rect: { left: 0, top: 18, right: 20, bottom: 26 }, hasEol: true },
      { index: 5, text: "five", rect: { left: 30, top: 18, right: 50, bottom: 26 }, hasEol: true },
      { index: 6, text: "six", rect: { left: 30, top: 40, right: 50, bottom: 48 }, hasEol: true },
    ];
    const pixels = whitePixels(60, 55);
    for (const span of spans) paint(pixels, 60, span.rect, [255, 230, 0, 255]);

    expect(flattenedPdfHighlightCandidates(pixels, 60, 55, spans, 5).map(({ id, quote }) => ({ id, quote }))).toEqual([
      { id: "flattened:5:0", quote: "zero one" },
      { id: "flattened:5:1", quote: "four" },
      { id: "flattened:5:2", quote: "five" },
      { id: "flattened:5:3", quote: "six" },
    ]);
  });

  it("requires eight-percent overlap, compacts quote whitespace, and truncates long quotes", () => {
    const pixels = whitePixels(100, 12);
    paint(pixels, 100, { left: 0, top: 0, right: 8, bottom: 10 }, [255, 230, 0, 255]);
    const spans: PdfHighlightTextSpan[] = [
      { index: 0, text: "  a \n b  ", rect: { left: 0, top: 0, right: 100, bottom: 10 }, hasEol: false },
      { index: 1, text: "x".repeat(20_100), rect: { left: 0, top: 0, right: 8, bottom: 10 }, hasEol: true },
      { index: 2, text: "excluded", rect: { left: 8, top: 0, right: 100, bottom: 10 }, hasEol: true },
    ];

    const [candidate] = flattenedPdfHighlightCandidates(pixels, 100, 12, spans, 1);

    expect(candidate?.quote.startsWith("a b ")).toBe(true);
    expect(candidate?.quote.length).toBe(20_000);
    expect(candidate?.quote).not.toContain("excluded");
  });

  it("normalizes at most 512 detected rectangles with six-decimal precision", () => {
    const viewport: PdfHighlightViewport = {
      width: 3,
      height: 7,
      convertToViewportPoint: (x, y) => [x, y],
    };
    const quads = Array.from({ length: 513 }, (_, index) => {
      const left = (index % 2) + 0.1;
      return [left, 1, left + 1, 1, left, 2, left + 1, 2];
    }).flat();
    const spans: PdfHighlightTextSpan[] = [{ index: 0, text: "many", rect: { left: 0, top: 1, right: 3, bottom: 2 }, hasEol: true }];

    const [candidate] = nativePdfHighlightCandidates(viewport, spans, [{ subtype: "Highlight", quadPoints: quads }], 1);

    expect(candidate?.rects).toHaveLength(512);
    expect(candidate?.rects[0]).toEqual({ x: 0.033333, y: 0.142857, width: 0.333333, height: 0.142857 });
  });

  it("deduplicates only same-page, case-insensitive quotes with strictly overlapping rectangles", () => {
    const base: PdfHighlightImportCandidate = {
      id: "base",
      source: "annotation",
      page: 1,
      quote: "Evidence",
      comment: "",
      rects: [{ x: 0, y: 0, width: 0.5, height: 0.5 }],
      confidence: 1,
    };
    const candidates: PdfHighlightImportCandidate[] = [
      base,
      { ...base, id: "duplicate", quote: "eVIDENCE", rects: [{ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }] },
      { ...base, id: "next-page", page: 2 },
      { ...base, id: "different-quote", quote: "Other" },
      { ...base, id: "touching-x", rects: [{ x: 0.5, y: 0, width: 0.5, height: 0.5 }] },
      { ...base, id: "touching-y", rects: [{ x: 0, y: 0.5, width: 0.5, height: 0.5 }] },
      { ...base, id: "no-rects", rects: [] },
    ];

    expect(deduplicatePdfHighlightCandidates(candidates).map(({ id }) => id)).toEqual([
      "base",
      "next-page",
      "different-quote",
      "touching-x",
      "touching-y",
      "no-rects",
    ]);
  });

  it("orchestrates PDF.js pages, cleans resources, and returns a native annotation", async () => {
    const cleanup = vi.fn();
    const render = vi.fn().mockReturnValue({ promise: Promise.resolve() });
    const page = {
      getViewport: vi.fn().mockReturnValue({
        width: 10.2,
        height: 5.1,
        scale: 1.25,
        transform: [1, 0, 0, 1, 0, 0],
        convertToViewportPoint: (x: number, y: number) => [x, y],
      }),
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { type: "beginMarkedContent", id: "tag" },
          { str: "   ", width: 4, transform: [1, 0, 0, 1, 0, 2], hasEOL: false },
          { str: "PDF evidence", width: 6, transform: [1, 0, 0, 2, 2, 4], hasEOL: true },
        ],
      }),
      getAnnotations: vi.fn().mockResolvedValue([{ subtype: "Highlight", rect: [2, 1, 8, 5], contentsObj: { str: " note " } }]),
      render,
      cleanup,
    };
    const destroy = vi.fn().mockResolvedValue(undefined);
    pdfjs.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn().mockResolvedValue(page) }),
      destroy,
    });

    await expect(detectImportedPdfHighlights("blob:annotated")).resolves.toEqual({
      candidates: [
        {
          id: "annotation:1:0",
          source: "annotation",
          page: 1,
          quote: "PDF evidence",
          comment: "note",
          rects: [{ x: 0.196078, y: 0.196078, width: 0.588235, height: 0.784314 }],
          confidence: 1,
        },
      ],
      pagesScanned: 1,
      pagesTotal: 1,
      truncated: false,
    });
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe("/pdf.worker.js");
    expect(pdfjs.getDocument).toHaveBeenCalledWith({ url: "blob:annotated" });
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.25 });
    expect(page.getAnnotations).toHaveBeenCalledWith({ intent: "display" });
    expect(render).toHaveBeenCalledWith({
      canvas: canvases[0],
      viewport: expect.objectContaining({ width: 10.2, height: 5.1 }),
      annotationMode: pdfjs.AnnotationMode.DISABLE,
    });
    expect(canvases[0]).toMatchObject({ width: 11, height: 6 });
    expect(canvases[0]?.getContext).toHaveBeenCalledWith("2d", { willReadFrequently: true });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("extracts flattened highlights from rendered pixels", async () => {
    vi.stubGlobal("document", {
      createElement: vi.fn(() => {
        const canvas: CanvasStub = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({
            getImageData: () => {
              const data = whitePixels(20, 10);
              paint(data, 20, { left: 2, top: 2, right: 15, bottom: 7 }, [255, 230, 0, 255]);
              return { data, width: 20, height: 10 };
            },
          })),
        };
        canvases.push(canvas);
        return canvas;
      }),
    });
    const cleanup = vi.fn();
    const page = {
      getViewport: () => ({
        width: 20,
        height: 10,
        scale: 1,
        transform: [1, 0, 0, 1, 0, 0],
        convertToViewportPoint: (x: number, y: number) => [x, y],
      }),
      getTextContent: vi.fn().mockResolvedValue({
        items: [{ str: "Rendered evidence", width: 13, transform: [1, 0, 0, 5, 2, 7], hasEOL: true }],
      }),
      getAnnotations: vi.fn().mockResolvedValue([]),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      cleanup,
    };
    const destroy = vi.fn().mockResolvedValue(undefined);
    pdfjs.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: vi.fn().mockResolvedValue(page) }),
      destroy,
    });

    const result = await detectImportedPdfHighlights("blob:flattened");

    expect(result.candidates).toEqual([
      {
        id: "flattened:1:0",
        source: "flattened",
        page: 1,
        quote: "Rendered evidence",
        comment: "",
        rects: [{ x: 0.1, y: 0.2, width: 0.65, height: 0.5 }],
        confidence: 0.85,
      },
    ]);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("scans at most 200 pages and stops page loading after 128 candidates", async () => {
    const cleanups: ReturnType<typeof vi.fn>[] = [];
    const getPage = vi.fn((pageNumber: number) => {
      const cleanup = vi.fn();
      cleanups.push(cleanup);
      return Promise.resolve({
        getViewport: () => ({
          width: 10,
          height: 10,
          scale: 1,
          transform: [1, 0, 0, 1, 0, 0],
          convertToViewportPoint: (x: number, y: number) => [x, y],
        }),
        getTextContent: () =>
          Promise.resolve({ items: [{ str: `page ${pageNumber}`, width: 8, transform: [1, 0, 0, 5, 1, 6], hasEOL: true }] }),
        getAnnotations: () => Promise.resolve([{ subtype: "Highlight", rect: [1, 1, 9, 7] }]),
        render: () => ({ promise: Promise.resolve() }),
        cleanup,
      });
    });
    const destroy = vi.fn().mockResolvedValue(undefined);
    pdfjs.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 250, getPage }), destroy });

    const result = await detectImportedPdfHighlights("blob:large");

    expect(result.candidates).toHaveLength(128);
    expect(result.candidates.at(-1)?.id).toBe("annotation:128:0");
    expect(result).toMatchObject({ pagesScanned: 200, pagesTotal: 250, truncated: true });
    expect(getPage).toHaveBeenCalledTimes(128);
    expect(getPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual(Array.from({ length: 128 }, (_, index) => index + 1));
    expect(cleanups).toHaveLength(128);
    expect(cleanups.every((cleanup) => cleanup.mock.calls.length === 1)).toBe(true);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("reports a complete untruncated scan with no canvas context", async () => {
    const getPage = vi.fn((pageNumber: number) =>
      Promise.resolve({
        getViewport: () => ({
          width: 0,
          height: -1,
          scale: 1,
          transform: [1, 0, 0, 1, 0, 0],
          convertToViewportPoint: (x: number, y: number) => [x, y],
        }),
        getTextContent: () => Promise.resolve({ items: [] }),
        getAnnotations: () => Promise.resolve([]),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: vi.fn(),
        pageNumber,
      }),
    );
    const destroy = vi.fn().mockResolvedValue(undefined);
    pdfjs.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage }), destroy });

    await expect(detectImportedPdfHighlights("blob:empty")).resolves.toEqual({
      candidates: [],
      pagesScanned: 2,
      pagesTotal: 2,
      truncated: false,
    });
    expect(canvases).toHaveLength(2);
    expect(canvases.every(({ width, height }) => width === 1 && height === 1)).toBe(true);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("cleans the current page and destroys the loading task when page rendering fails", async () => {
    const cleanup = vi.fn();
    const destroy = vi.fn().mockResolvedValue(undefined);
    pdfjs.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () =>
          Promise.resolve({
            getViewport: () => ({
              width: 10,
              height: 10,
              scale: 1,
              transform: [1, 0, 0, 1, 0, 0],
              convertToViewportPoint: (x: number, y: number) => [x, y],
            }),
            getTextContent: () => Promise.resolve({ items: [] }),
            getAnnotations: () => Promise.resolve([]),
            render: () => ({ promise: Promise.reject(new Error("render failed")) }),
            cleanup,
          }),
      }),
      destroy,
    });

    await expect(detectImportedPdfHighlights("blob:broken-render")).rejects.toThrow("render failed");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("destroys the loading task when opening or page loading fails", async () => {
    const openingDestroy = vi.fn().mockResolvedValue(undefined);
    pdfjs.getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error("open failed")), destroy: openingDestroy });
    await expect(detectImportedPdfHighlights("blob:broken-open")).rejects.toThrow("open failed");
    expect(openingDestroy).toHaveBeenCalledOnce();

    const pageDestroy = vi.fn().mockResolvedValue(undefined);
    pdfjs.getDocument.mockReturnValueOnce({
      promise: Promise.resolve({ numPages: 1, getPage: () => Promise.reject(new Error("page failed")) }),
      destroy: pageDestroy,
    });
    await expect(detectImportedPdfHighlights("blob:broken-page")).rejects.toThrow("page failed");
    expect(pageDestroy).toHaveBeenCalledOnce();
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
