import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPdfText } from "./pdf-text-analysis";

afterEach(() => vi.unstubAllGlobals());

describe("PDF text extraction", () => {
  it("keeps native text and renders image-only pages for OCR", async () => {
    const cleanup = vi.fn();
    const destroy = vi.fn(async () => undefined);
    const render = vi.fn(() => ({ promise: Promise.resolve() }));
    const canvas = {
      width: 0,
      height: 0,
      toDataURL: vi.fn(() => "data:image/jpeg;base64,ocr-page"),
    };
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    const pages = [
      pdfPage("This page already contains a sufficiently long native text layer.", cleanup, render),
      pdfPage("scan", cleanup, render),
    ];
    const runtime = {
      getDocument: () => ({
        promise: Promise.resolve({ numPages: pages.length, getPage: async (page: number) => pages[page - 1] }),
        destroy,
      }),
    };

    await expect(extractPdfText(runtime as never, "/paper.pdf")).resolves.toEqual({
      pages: [
        { page: 1, text: "This page already contains a sufficiently long native text layer." },
        { image: "data:image/jpeg;base64,ocr-page", page: 2, text: "scan" },
      ],
      pagesTotal: 2,
      truncated: false,
    });
    expect(canvas).toMatchObject({ width: 1600, height: 2400 });
    expect(render).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("limits extraction to 200 pages and OCR candidates to 40 pages", async () => {
    const render = vi.fn(() => ({ promise: Promise.resolve() }));
    vi.stubGlobal("document", {
      createElement: () => ({ width: 0, height: 0, toDataURL: () => "data:image/jpeg;base64,page" }),
    });
    const page = pdfPage("", vi.fn(), render);
    const runtime = {
      getDocument: () => ({
        promise: Promise.resolve({ numPages: 205, getPage: async () => page }),
        destroy: vi.fn(async () => undefined),
      }),
    };

    const result = await extractPdfText(runtime as never, "/large.pdf");
    expect(result.pages).toHaveLength(200);
    expect(result.pages.filter((candidate) => candidate.image)).toHaveLength(40);
    expect(result).toMatchObject({ pagesTotal: 205, truncated: true });
    expect(render).toHaveBeenCalledTimes(40);
  });
});

function pdfPage(text: string, cleanup: () => void, render: () => { promise: Promise<void> }) {
  return {
    cleanup,
    getTextContent: async () => ({
      items: [{ str: `  ${text}  ` } as TextItem, { type: "beginMarkedContentProps" }],
    }),
    getViewport: ({ scale }: { scale: number }) => ({ width: 1000 * scale, height: 1500 * scale }),
    render,
  };
}
