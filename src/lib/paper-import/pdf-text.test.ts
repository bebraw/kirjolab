import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it, vi } from "vitest";
import { createTwoPageEvidencePdf } from "../../test-support/pdf-fixture";
import {
  createPdfTextExtractor,
  pdfTextHardMaximumDocumentTextCodeUnits,
  pdfTextHardMaximumInputBytes,
  pdfTextHardMaximumPageTextCodeUnits,
  pdfTextHardMaximumPages,
  PdfTextExtractionFailure,
  type PdfTextExtractionLimits,
  type PdfTextRuntime,
} from "./pdf-text";

const limits: PdfTextExtractionLimits = {
  maximumInputBytes: 1024,
  maximumPages: 10,
  maximumPageTextCodeUnits: 100,
  maximumDocumentTextCodeUnits: 500,
};

const limitFields = ["maximumInputBytes", "maximumPages", "maximumPageTextCodeUnits", "maximumDocumentTextCodeUnits"] as const;
const invalidPositiveSafeIntegers = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 2 ** 53];

describe("neutral PDF text extraction", () => {
  it("extracts normalized page text from PDF bytes with a stable identity", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\nfixture");
    const cleanup = vi.fn();
    const destroy = vi.fn(async () => undefined);
    const runtime = runtimeWithPages(
      [
        {
          cleanup,
          chunks: [["  Native  text\nfrom", "a deterministic page.  "]],
        },
      ],
      destroy,
    );

    const extractPdfText = createPdfTextExtractor(runtime);

    await expect(extractPdfText(bytes, limits)).resolves.toEqual({
      schemaVersion: 1,
      sha256: "7dfd2b80df499f12a5740d2f0ac27c27549ca76b03158339618d4f7d2b22d233",
      pageCount: 1,
      pages: [{ pageNumber: 1, text: "Native text from a deterministic page.", warnings: [] }],
      diagnostics: [],
      truncated: false,
    });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("extracts numbered pages and cleans them up through real PDF.js", async () => {
    const cleanedPageNumbers: number[] = [];
    const destroy = vi.fn(async () => undefined);
    const runtime: PdfTextRuntime = {
      getDocument({ data }) {
        const loadingTask = getDocument({
          data,
          standardFontDataUrl: new URL("../../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).href,
        });
        return {
          promise: loadingTask.promise.then((documentModel) => ({
            numPages: documentModel.numPages,
            getPage: async (pageNumber) => {
              const page = await documentModel.getPage(pageNumber);
              return {
                streamTextContent: () => page.streamTextContent(),
                cleanup: () => {
                  cleanedPageNumbers.push(pageNumber);
                  page.cleanup();
                },
              };
            },
          })),
          destroy: async () => {
            destroy();
            await loadingTask.destroy();
          },
        };
      },
    };

    const result = await createPdfTextExtractor(runtime)(new Uint8Array(createTwoPageEvidencePdf()), limits);

    expect(result).toEqual({
      schemaVersion: 1,
      sha256: "19ac21175b4b299831fb1a7d7e8bd046ca5bdab709f592aeb6c39384a2a01dc6",
      pageCount: 2,
      pages: [
        {
          pageNumber: 1,
          text: "First page keeps its reading position.",
          warnings: [],
        },
        {
          pageNumber: 2,
          text: "Second page verifies restored PDF context.",
          warnings: [],
        },
      ],
      diagnostics: [],
      truncated: false,
    });
    expect(cleanedPageNumbers).toEqual([1, 2]);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("rejects input above the hard byte limit before loading PDF.js", async () => {
    const getDocument = vi.fn();
    const extractPdfText = createPdfTextExtractor({ getDocument });

    await expect(extractPdfText(new Uint8Array(pdfTextHardMaximumInputBytes + 1), limits)).rejects.toEqual(
      expect.objectContaining<Partial<PdfTextExtractionFailure>>({
        name: "PdfTextExtractionFailure",
        code: "pdf-input-size",
        message: "PDF input exceeds the 25 MiB limit",
      }),
    );
    expect(getDocument).not.toHaveBeenCalled();
  });

  it.each(limitFields.flatMap((field) => invalidPositiveSafeIntegers.map((value) => ({ field, value }))))(
    "rejects invalid $field limit $value before loading PDF.js",
    async ({ field, value }) => {
      const getDocument = vi.fn();
      const extractPdfText = createPdfTextExtractor({ getDocument });

      await expect(
        extractPdfText(new TextEncoder().encode("%PDF-1.4\nlimits"), {
          ...limits,
          [field]: value,
        }),
      ).rejects.toEqual(
        expect.objectContaining<Partial<PdfTextExtractionFailure>>({
          code: "pdf-invalid-limits",
          message: `PDF extraction limit ${field} must be a positive safe integer`,
        }),
      );
      expect(getDocument).not.toHaveBeenCalled();
    },
  );

  it("allows the whole-document text ceiling to be tighter than the per-page ceiling", async () => {
    const extractPdfText = createPdfTextExtractor(
      runtimeWithPages([{ cleanup: vi.fn(), chunks: [["Native text continues beyond the document ceiling."]] }], async () => undefined),
    );

    const result = await extractPdfText(new TextEncoder().encode("%PDF-1.4\nindependent text limits"), {
      ...limits,
      maximumPageTextCodeUnits: 100,
      maximumDocumentTextCodeUnits: 10,
    });

    expect(result.pages).toEqual([{ pageNumber: 1, text: "Native tex", warnings: ["document-text-truncated"] }]);
    expect(result.diagnostics).toEqual([
      {
        code: "pdf-document-text-limit",
        severity: "warning",
        pageNumber: 1,
        message: "PDF document native text was truncated at 10 UTF-16 code units",
      },
    ]);
    expect(result.truncated).toBe(true);
  });

  it("honors a smaller caller-provided byte limit before loading PDF.js", async () => {
    const getDocument = vi.fn();
    const extractPdfText = createPdfTextExtractor({ getDocument });

    await expect(
      extractPdfText(new TextEncoder().encode("%PDF-1.4\nfixture"), {
        ...limits,
        maximumInputBytes: 8,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PdfTextExtractionFailure>>({
        code: "pdf-input-size",
        message: "PDF input exceeds the configured 8-byte limit",
      }),
    );
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("rejects bytes without an exact PDF signature before loading PDF.js", async () => {
    const getDocument = vi.fn();
    const extractPdfText = createPdfTextExtractor({ getDocument });

    await expect(extractPdfText(new TextEncoder().encode("not a PDF"), limits)).rejects.toEqual(
      expect.objectContaining<Partial<PdfTextExtractionFailure>>({
        code: "pdf-signature",
        message: "PDF input must begin with %PDF-",
      }),
    );
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("gives PDF.js an owned clone instead of transferring the caller's bytes", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\nowned input");
    const delegate = runtimeWithPages(
      [{ cleanup: vi.fn(), chunks: [["A native text page long enough to avoid a sparse warning."]] }],
      async () => undefined,
    );
    let parserBytes: Uint8Array | undefined;
    const runtime: PdfTextRuntime = {
      getDocument(source) {
        parserBytes = source.data;
        return delegate.getDocument(source);
      },
    };

    await createPdfTextExtractor(runtime)(bytes, limits);

    expect(parserBytes).not.toBe(bytes);
    expect(parserBytes).toEqual(bytes);
    expect(new TextDecoder().decode(bytes)).toBe("%PDF-1.4\nowned input");
  });

  it("snapshots caller-owned bytes before the first asynchronous boundary", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\nimmutable snapshot");
    const originalBytes = Uint8Array.from(bytes);
    const delegate = runtimeWithPages(
      [{ cleanup: vi.fn(), chunks: [["Native text that is long enough for extraction."]] }],
      async () => undefined,
    );
    let parserBytes: Uint8Array | undefined;
    const extractPdfText = createPdfTextExtractor({
      getDocument(source) {
        parserBytes = source.data;
        return delegate.getDocument(source);
      },
    });

    const extraction = extractPdfText(bytes, limits);
    bytes.fill(0);
    await extraction;

    expect(parserBytes).toEqual(originalBytes);
  });

  it("never extracts more than 200 pages and reports the partial result", async () => {
    const cleanup = vi.fn();
    const pages = Array.from({ length: 205 }, () => ({
      cleanup,
      chunks: [["Native page text that is long enough for ordinary extraction."]],
    }));
    const extractPdfText = createPdfTextExtractor(runtimeWithPages(pages, async () => undefined));

    const result = await extractPdfText(new TextEncoder().encode("%PDF-1.4\npages"), {
      ...limits,
      maximumPages: 500,
      maximumDocumentTextCodeUnits: 100_000,
    });

    expect(result.pages).toHaveLength(pdfTextHardMaximumPages);
    expect(result.pages.at(-1)?.pageNumber).toBe(pdfTextHardMaximumPages);
    expect(result).toMatchObject({
      pageCount: 205,
      diagnostics: [
        {
          code: "pdf-page-limit",
          severity: "warning",
          message: "PDF text extraction stopped after 200 of 205 pages",
        },
      ],
      truncated: true,
    });
    expect(cleanup).toHaveBeenCalledTimes(200);
  });

  it("does not classify a page-limited partial extraction as a textless document", async () => {
    const extractPdfText = createPdfTextExtractor(
      runtimeWithPages(
        [
          { cleanup: vi.fn(), chunks: [[]] },
          { cleanup: vi.fn(), chunks: [["Native text exists beyond the configured page limit."]] },
        ],
        async () => undefined,
      ),
    );

    const result = await extractPdfText(new TextEncoder().encode("%PDF-1.4\npartial scan classification"), {
      ...limits,
      maximumPages: 1,
    });

    expect(result.pages).toEqual([{ pageNumber: 1, text: "", warnings: ["no-native-text"] }]);
    expect(result.diagnostics).toEqual([
      {
        code: "pdf-page-limit",
        severity: "warning",
        message: "PDF text extraction stopped after 1 of 2 pages",
      },
    ]);
    expect(result.truncated).toBe(true);
  });

  it("caps caller-provided page and document text limits at fixed hard maxima", async () => {
    const cancel = vi.fn();
    const extractPdfText = createPdfTextExtractor(
      runtimeWithPages(
        [
          {
            cleanup: vi.fn(),
            cancel,
            chunks: [["x".repeat(pdfTextHardMaximumPageTextCodeUnits + 1)]],
          },
        ],
        async () => undefined,
      ),
    );

    const result = await extractPdfText(new TextEncoder().encode("%PDF-1.4\nhard text bounds"), {
      ...limits,
      maximumPageTextCodeUnits: Number.MAX_SAFE_INTEGER,
      maximumDocumentTextCodeUnits: Number.MAX_SAFE_INTEGER,
    });

    expect(pdfTextHardMaximumDocumentTextCodeUnits).toBe(pdfTextHardMaximumPages * pdfTextHardMaximumPageTextCodeUnits);
    expect(result.pages).toEqual([
      {
        pageNumber: 1,
        text: "x".repeat(pdfTextHardMaximumPageTextCodeUnits),
        warnings: ["page-text-truncated"],
      },
    ]);
    expect(result.diagnostics).toEqual([
      {
        code: "pdf-page-text-limit",
        severity: "warning",
        pageNumber: 1,
        message: `PDF page 1 native text was truncated at ${pdfTextHardMaximumPageTextCodeUnits} UTF-16 code units`,
      },
    ]);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("stops the page stream at the UTF-16 text bound and reports the truncation", async () => {
    const cancel = vi.fn();
    const extractPdfText = createPdfTextExtractor(
      runtimeWithPages(
        [{ cleanup: vi.fn(), cancel, chunks: [["Alpha", "beta"], ["gamma should not be buffered"]] }],
        async () => undefined,
      ),
    );

    const result = await extractPdfText(new TextEncoder().encode("%PDF-1.4\npage bound"), {
      ...limits,
      maximumPageTextCodeUnits: 10,
    });

    expect(result.pages).toEqual([{ pageNumber: 1, text: "Alpha beta", warnings: ["page-text-truncated"] }]);
    expect(result.diagnostics).toEqual([
      {
        code: "pdf-page-text-limit",
        severity: "warning",
        pageNumber: 1,
        message: "PDF page 1 native text was truncated at 10 UTF-16 code units",
      },
    ]);
    expect(result.truncated).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not split a surrogate pair or misclassify a bounded page as scanned", async () => {
    const extractPdfText = createPdfTextExtractor(
      runtimeWithPages([{ cleanup: vi.fn(), chunks: [["😀 native text"]] }], async () => undefined),
    );

    const result = await extractPdfText(new TextEncoder().encode("%PDF-1.4\nsurrogate"), {
      ...limits,
      maximumPageTextCodeUnits: 1,
    });

    expect(result.pages).toEqual([{ pageNumber: 1, text: "", warnings: ["page-text-truncated"] }]);
    expect(result.diagnostics).toEqual([
      {
        code: "pdf-page-text-limit",
        severity: "warning",
        pageNumber: 1,
        message: "PDF page 1 native text was truncated at 1 UTF-16 code units",
      },
    ]);
  });

  it("stops the document at its UTF-16 text bound and identifies the affected page", async () => {
    const cancel = vi.fn();
    const cleanup = vi.fn();
    const extractPdfText = createPdfTextExtractor(
      runtimeWithPages(
        [
          { cleanup, chunks: [["123456789012345678901234567890"]] },
          { cleanup, cancel, chunks: [["abcd"]] },
          { cleanup, chunks: [["This page must never be loaded."]] },
        ],
        async () => undefined,
      ),
    );

    const result = await extractPdfText(new TextEncoder().encode("%PDF-1.4\ndocument bound"), {
      ...limits,
      maximumPageTextCodeUnits: 32,
      maximumDocumentTextCodeUnits: 32,
    });

    expect(result.pages).toEqual([
      { pageNumber: 1, text: "123456789012345678901234567890", warnings: [] },
      { pageNumber: 2, text: "ab", warnings: ["document-text-truncated"] },
    ]);
    expect(result.diagnostics).toEqual([
      {
        code: "pdf-document-text-limit",
        severity: "warning",
        pageNumber: 2,
        message: "PDF document native text was truncated at 32 UTF-16 code units",
      },
    ]);
    expect(result.truncated).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("marks empty pages and warns when the PDF has no native text", async () => {
    const extractPdfText = createPdfTextExtractor(
      runtimeWithPages(
        [
          { cleanup: vi.fn(), chunks: [[]] },
          { cleanup: vi.fn(), chunks: [[" \n\t "]] },
        ],
        async () => undefined,
      ),
    );

    const result = await extractPdfText(new TextEncoder().encode("%PDF-1.4\nscanned"), limits);

    expect(result.pages).toEqual([
      { pageNumber: 1, text: "", warnings: ["no-native-text"] },
      { pageNumber: 2, text: "", warnings: ["no-native-text"] },
    ]);
    expect(result.diagnostics).toEqual([
      {
        code: "pdf-no-native-text",
        severity: "warning",
        message: "PDF has no extractable native text; it may be scanned",
      },
    ]);
    expect(result.truncated).toBe(false);
  });

  it("marks sparse native text without guessing that OCR is available", async () => {
    const extractPdfText = createPdfTextExtractor(
      runtimeWithPages([{ cleanup: vi.fn(), chunks: [["short native text"]] }], async () => undefined),
    );

    const result = await extractPdfText(new TextEncoder().encode("%PDF-1.4\nsparse"), limits);

    expect(result.pages).toEqual([{ pageNumber: 1, text: "short native text", warnings: ["sparse-native-text"] }]);
    expect(result.diagnostics).toEqual([]);
  });

  it("maps password-protected PDFs to a stable encrypted-input failure", async () => {
    const destroy = vi.fn(async () => undefined);
    const passwordError = Object.assign(new Error("Password required"), {
      name: "PasswordException",
    });
    const extractPdfText = createPdfTextExtractor({
      getDocument: () => ({ promise: Promise.reject(passwordError), destroy }),
    });

    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.4\nencrypted"), limits)).rejects.toEqual(
      expect.objectContaining<Partial<PdfTextExtractionFailure>>({
        name: "PdfTextExtractionFailure",
        code: "pdf-encrypted",
        message: "Encrypted PDFs are not supported",
      }),
    );
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("preserves the encrypted-input failure when PDF.js teardown also fails", async () => {
    const passwordError = Object.assign(new Error("Password required"), {
      name: "PasswordException",
    });
    const extractPdfText = createPdfTextExtractor({
      getDocument: () => ({
        promise: Promise.reject(passwordError),
        destroy: async () => {
          throw new Error("worker teardown failed");
        },
      }),
    });

    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.4\nencrypted teardown"), limits)).rejects.toEqual(
      expect.objectContaining<Partial<PdfTextExtractionFailure>>({
        code: "pdf-encrypted",
        message: "Encrypted PDFs are not supported",
      }),
    );
  });

  it("maps teardown failure after successful extraction without skipping page cleanup", async () => {
    const cleanup = vi.fn();
    const extractPdfText = createPdfTextExtractor(
      runtimeWithPages([{ cleanup, chunks: [["Native text that extracts before teardown fails."]] }], async () => {
        throw new Error("worker teardown failed");
      }),
    );

    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.4\nteardown"), limits)).rejects.toEqual(
      expect.objectContaining<Partial<PdfTextExtractionFailure>>({
        code: "pdf-runtime",
        message: "PDF text runtime failed",
      }),
    );
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("maps synchronous parser rejection to a stable malformed-input failure", async () => {
    const extractPdfText = createPdfTextExtractor({
      getDocument: () => {
        throw Object.assign(new Error("cross-reference table is broken"), {
          name: "InvalidPDFException",
        });
      },
    });

    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.4\nmalformed"), limits)).rejects.toEqual(
      expect.objectContaining<Partial<PdfTextExtractionFailure>>({
        name: "PdfTextExtractionFailure",
        code: "pdf-malformed",
        message: "PDF could not be parsed",
      }),
    );
  });

  it("maps a generic synchronous adapter failure to the runtime boundary", async () => {
    const extractPdfText = createPdfTextExtractor({
      getDocument: () => {
        throw new Error("PDF.js worker initialization failed");
      },
    });

    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.4\nruntime setup"), limits)).rejects.toEqual(
      expect.objectContaining<Partial<PdfTextExtractionFailure>>({
        code: "pdf-runtime",
        message: "PDF text runtime failed",
      }),
    );
  });

  it("maps a generic asynchronous loader failure to the runtime boundary and tears down the task", async () => {
    const destroy = vi.fn(async () => undefined);
    const extractPdfText = createPdfTextExtractor({
      getDocument: () => ({ promise: Promise.reject(new Error("PDF.js worker initialization failed")), destroy }),
    });

    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.4\nruntime loader"), limits)).rejects.toEqual(
      expect.objectContaining<Partial<PdfTextExtractionFailure>>({
        code: "pdf-runtime",
        message: "PDF text runtime failed",
      }),
    );
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("maps a streamed-content adapter failure without blaming the PDF input", async () => {
    const cleanup = vi.fn();
    const destroy = vi.fn(async () => undefined);
    const extractPdfText = createPdfTextExtractor({
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            cleanup,
            streamTextContent: () =>
              new ReadableStream({
                start(controller) {
                  controller.error(new Error("broken content stream"));
                },
              }),
          }),
        }),
        destroy,
      }),
    });

    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.4\nbroken stream"), limits)).rejects.toEqual(
      expect.objectContaining<Partial<PdfTextExtractionFailure>>({
        code: "pdf-runtime",
        message: "PDF text runtime failed",
      }),
    );
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("keeps a PDF.js format failure classified as malformed after the document loads", async () => {
    const cleanup = vi.fn();
    const destroy = vi.fn(async () => undefined);
    const formatError = Object.assign(new Error("corrupt page content stream"), { name: "FormatError" });
    const extractPdfText = createPdfTextExtractor({
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            cleanup,
            streamTextContent: () =>
              new ReadableStream({
                start(controller) {
                  controller.error(formatError);
                },
              }),
          }),
        }),
        destroy,
      }),
    });

    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.4\nmalformed page"), limits)).rejects.toEqual(
      expect.objectContaining<Partial<PdfTextExtractionFailure>>({
        code: "pdf-malformed",
        message: "PDF could not be parsed",
      }),
    );
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("maps page cleanup failure to the runtime boundary and still tears down the document", async () => {
    const destroy = vi.fn(async () => undefined);
    const extractPdfText = createPdfTextExtractor(
      runtimeWithPages(
        [
          {
            cleanup: () => {
              throw new Error("page cleanup failed");
            },
            chunks: [["Native text extracted before page cleanup failed."]],
          },
        ],
        destroy,
      ),
    );

    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.4\ncleanup"), limits)).rejects.toEqual(
      expect.objectContaining<Partial<PdfTextExtractionFailure>>({
        code: "pdf-runtime",
        message: "PDF text runtime failed",
      }),
    );
    expect(destroy).toHaveBeenCalledOnce();
  });
});

interface PageFixture {
  readonly chunks: readonly (readonly string[])[];
  readonly cancel?: () => void;
  cleanup(): void;
}

function runtimeWithPages(pages: readonly PageFixture[], destroy: () => Promise<void>): PdfTextRuntime {
  return {
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: async (pageNumber) => {
          const fixture = pages[pageNumber - 1];
          if (!fixture) throw new Error(`Missing page ${pageNumber}`);
          return {
            cleanup: fixture.cleanup,
            streamTextContent: () => {
              let chunkIndex = 0;
              return new ReadableStream(
                {
                  pull(controller) {
                    const strings = fixture.chunks[chunkIndex];
                    chunkIndex += 1;
                    if (strings) {
                      controller.enqueue({ items: strings.map((str) => ({ str })) });
                    } else {
                      controller.close();
                    }
                  },
                  cancel() {
                    fixture.cancel?.();
                  },
                },
                { highWaterMark: 0 },
              );
            },
          };
        },
      }),
      destroy,
    }),
  };
}
