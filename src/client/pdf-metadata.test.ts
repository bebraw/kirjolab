import { beforeEach, describe, expect, it, vi } from "vitest";
import { derivePdfMetadataCandidates, extractPdfMetadata } from "./pdf-metadata";

const pdfjs = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: "" },
}));

vi.mock("pdfjs-dist", () => pdfjs);
vi.mock("./pdfjs-runtime", () => ({ loadPdfJsRuntime: vi.fn().mockResolvedValue(pdfjs) }));

beforeEach(() => {
  pdfjs.getDocument.mockReset();
  pdfjs.GlobalWorkerOptions.workerSrc = "";
});

function textContentPage(items: Array<Record<string, unknown>>) {
  return {
    streamTextContent: () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue({ items, styles: {}, lang: null });
          controller.close();
        },
      }),
  };
}

describe("PDF metadata candidates", () => {
  it("derives bounded embedded fields and an opening-page DOI", () => {
    expect(
      derivePdfMetadataCandidates(
        { Title: "Inspectable Evidence", Author: "Doe, Jane; Roe, Alex", CreationDate: "D:20250711120000" },
        "Published as https://doi.org/10.5555/Example.Item.",
        8,
      ),
    ).toEqual({
      title: "Inspectable Evidence",
      authors: ["Doe, Jane", "Roe, Alex"],
      year: "2025",
      doi: "10.5555/example.item",
      pagesScanned: 3,
      diagnostics: [],
    });
  });

  it("reports sparse files without fabricating metadata", () => {
    expect(derivePdfMetadataCandidates(null, "ordinary page text", -1)).toEqual({
      title: "",
      authors: [],
      year: "",
      doi: "",
      pagesScanned: 0,
      diagnostics: ["No useful metadata was found in the PDF.", "No DOI was detected in the embedded metadata or opening pages."],
    });
  });

  it("bounds strings, author counts, and trailing DOI punctuation", () => {
    const result = derivePdfMetadataCandidates(
      {
        Title: "x".repeat(2_100),
        Author: Array.from({ length: 70 }, (_, index) => `Author ${index}`).join(" and "),
        ModDate: "updated 1999",
        Subject: "doi:10.1000/test);",
      },
      "",
      2,
    );
    expect(result.title).toHaveLength(2_000);
    expect(result.authors).toHaveLength(64);
    expect(result.year).toBe("1999");
    expect(result.doi).toBe("10.1000/test");
  });

  it("reports useful partial metadata without claiming the PDF is empty", () => {
    for (const information of [
      { Title: "  A title only  " },
      { Author: "Ada Example" },
      { CreationDate: "D:20240101" },
      { Subject: "doi:10.1000/only" },
    ]) {
      const result = derivePdfMetadataCandidates(information, "", 1);
      expect(result.diagnostics).not.toContain("No useful metadata was found in the PDF.");
    }
    expect(derivePdfMetadataCandidates({ Title: "  A title only  " }, "", 1)).toMatchObject({
      title: "A title only",
      diagnostics: ["No DOI was detected in the embedded metadata or opening pages."],
    });
  });

  it("normalizes sparse author separators and bounds individual names", () => {
    const longAuthor = `Ada ${"x".repeat(400)}`;
    expect(derivePdfMetadataCandidates({ Author: `  ${longAuthor}  ; ; Bob and   Carol  ` }, "", 1).authors).toEqual([
      longAuthor.slice(0, 300),
      "Bob",
      "Carol",
    ]);
  });

  it("does not combine DOI fragments across metadata fields or beyond the opening-text budget", () => {
    expect(derivePdfMetadataCandidates({ Subject: "doi:10.1000/", Keywords: "separate" }, "", 1).doi).toBe("");
    expect(derivePdfMetadataCandidates({}, `${"x".repeat(65_536)} doi:10.1000/late`, 1).doi).toBe("");
  });

  it("scans at most the first three pages and joins text items", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const getPage = vi.fn((pageNumber: number) =>
      Promise.resolve(
        textContentPage(
          pageNumber === 1
            ? [{ str: "Opening" }, { hasEol: true }, { str: "doi:10.4242/Traversal.Test." }]
            : [{ str: `page-${pageNumber}` }],
        ),
      ),
    );
    pdfjs.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 5,
        getMetadata: vi.fn().mockResolvedValue({ info: { Title: "Traversed PDF", Author: "Doe and Roe" } }),
        getPage,
      }),
      destroy,
    });

    await expect(extractPdfMetadata("blob:pdf")).resolves.toEqual({
      title: "Traversed PDF",
      authors: ["Doe", "Roe"],
      year: "",
      doi: "10.4242/traversal.test",
      pagesScanned: 3,
      diagnostics: [],
    });
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe("/pdf.worker.js");
    expect(pdfjs.getDocument).toHaveBeenCalledWith({ url: "blob:pdf" });
    expect(getPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([1, 2, 3]);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("stops collecting text at the byte budget while preserving page traversal", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const getPage = vi.fn((pageNumber: number) =>
      Promise.resolve(textContentPage([{ str: pageNumber === 1 ? "x".repeat(65_536) : "ignored" }])),
    );
    pdfjs.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 3, getMetadata: vi.fn().mockResolvedValue({ info: {} }), getPage }),
      destroy,
    });

    const result = await extractPdfMetadata("blob:large-pdf");
    expect(result.pagesScanned).toBe(3);
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(result.diagnostics).toEqual([
      "No useful metadata was found in the PDF.",
      "No DOI was detected in the embedded metadata or opening pages.",
    ]);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("destroys the loading task when opening or metadata extraction fails", async () => {
    const openingDestroy = vi.fn().mockResolvedValue(undefined);
    pdfjs.getDocument.mockReturnValueOnce({ promise: Promise.reject(new Error("cannot open")), destroy: openingDestroy });
    await expect(extractPdfMetadata("blob:broken")).rejects.toThrow("cannot open");
    expect(openingDestroy).toHaveBeenCalledOnce();

    const metadataDestroy = vi.fn().mockResolvedValue(undefined);
    pdfjs.getDocument.mockReturnValueOnce({
      promise: Promise.resolve({ numPages: 1, getMetadata: vi.fn().mockRejectedValue(new Error("bad metadata")) }),
      destroy: metadataDestroy,
    });
    await expect(extractPdfMetadata("blob:bad-metadata")).rejects.toThrow("bad metadata");
    expect(metadataDestroy).toHaveBeenCalledOnce();
  });
});
