import { sha256Hex } from "./sha256";

export interface PdfTextExtractionLimits {
  readonly maximumInputBytes: number;
  readonly maximumPages: number;
  readonly maximumPageTextCodeUnits: number;
  readonly maximumDocumentTextCodeUnits: number;
}

export const pdfTextHardMaximumInputBytes = 25 * 1024 * 1024;
export const pdfTextHardMaximumPages = 200;
export const pdfTextHardMaximumPageTextCodeUnits = 100_000;
export const pdfTextHardMaximumDocumentTextCodeUnits = pdfTextHardMaximumPages * pdfTextHardMaximumPageTextCodeUnits;
export const pdfTextSparseNativeTextCodeUnits = 24;

export type PdfTextExtractionFailureCode =
  "pdf-encrypted" | "pdf-input-size" | "pdf-invalid-limits" | "pdf-malformed" | "pdf-runtime" | "pdf-signature";

export class PdfTextExtractionFailure extends Error {
  readonly code: PdfTextExtractionFailureCode;

  constructor(code: PdfTextExtractionFailureCode, message: string) {
    super(message);
    this.name = "PdfTextExtractionFailure";
    this.code = code;
  }
}

export type PdfTextPageWarningCode = "document-text-truncated" | "no-native-text" | "page-text-truncated" | "sparse-native-text";

export type PdfTextDiagnosticCode = "pdf-document-text-limit" | "pdf-no-native-text" | "pdf-page-limit" | "pdf-page-text-limit";

export interface PdfTextDiagnostic {
  readonly code: PdfTextDiagnosticCode;
  readonly severity: "warning";
  readonly message: string;
  readonly pageNumber?: number;
}

export interface PdfTextExtractionPageV1 {
  readonly pageNumber: number;
  readonly text: string;
  readonly warnings: readonly PdfTextPageWarningCode[];
}

export interface PdfTextExtractionV1 {
  readonly schemaVersion: 1;
  readonly sha256: string;
  readonly pageCount: number;
  readonly pages: readonly PdfTextExtractionPageV1[];
  readonly diagnostics: readonly PdfTextDiagnostic[];
  readonly truncated: boolean;
}

export interface PdfTextContentChunk {
  readonly items: readonly unknown[];
}

export interface PdfTextPage {
  streamTextContent(): ReadableStream<PdfTextContentChunk>;
  cleanup(): void;
}

export interface PdfTextDocument {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<PdfTextPage>;
}

export interface PdfTextLoadingTask {
  readonly promise: Promise<PdfTextDocument>;
  destroy(): Promise<void>;
}

export interface PdfTextRuntime {
  getDocument(source: { readonly data: Uint8Array }): PdfTextLoadingTask;
}

export type PdfTextExtractor = (bytes: Uint8Array, limits: PdfTextExtractionLimits) => Promise<PdfTextExtractionV1>;

interface EffectivePdfTextExtractionLimits {
  readonly maximumInputBytes: number;
  readonly maximumPages: number;
  readonly maximumPageTextCodeUnits: number;
  readonly maximumDocumentTextCodeUnits: number;
}

export function createPdfTextExtractor(runtime: PdfTextRuntime): PdfTextExtractor {
  return async (bytes, limits) => {
    const effectiveLimits = resolvePdfTextExtractionLimits(limits);
    if (bytes.byteLength > pdfTextHardMaximumInputBytes) {
      throw new PdfTextExtractionFailure("pdf-input-size", "PDF input exceeds the 25 MiB limit");
    }
    if (bytes.byteLength > effectiveLimits.maximumInputBytes) {
      throw new PdfTextExtractionFailure(
        "pdf-input-size",
        `PDF input exceeds the configured ${effectiveLimits.maximumInputBytes}-byte limit`,
      );
    }
    if (!hasPdfSignature(bytes)) {
      throw new PdfTextExtractionFailure("pdf-signature", "PDF input must begin with %PDF-");
    }
    const ownedBytes = Uint8Array.from(bytes);
    const sha256 = sha256Hex(ownedBytes);
    let task: PdfTextLoadingTask;
    try {
      task = runtime.getDocument({ data: ownedBytes });
    } catch (error) {
      throw mapPdfExtractionFailure(error);
    }
    const extractionOutcome = await (async (): Promise<PdfTextExtractionV1> => {
      const documentModel = await task.promise;
      const pages: PdfTextExtractionPageV1[] = [];
      const diagnostics: PdfTextDiagnostic[] = [];
      const pageLimit = effectiveLimits.maximumPages;
      const pagesToExtract = Math.min(documentModel.numPages, pageLimit);
      const pagesTruncated = documentModel.numPages > pagesToExtract;
      let truncated = pagesTruncated;
      if (pagesTruncated) {
        diagnostics.push({
          code: "pdf-page-limit",
          severity: "warning",
          message: `PDF text extraction stopped after ${pagesToExtract} of ${documentModel.numPages} pages`,
        });
      }
      let documentTextCodeUnits = 0;
      for (let pageNumber = 1; pageNumber <= pagesToExtract; pageNumber += 1) {
        const remainingDocumentCodeUnits = effectiveLimits.maximumDocumentTextCodeUnits - documentTextCodeUnits;
        const page = await documentModel.getPage(pageNumber);
        try {
          const maximumPageCodeUnits = Math.min(effectiveLimits.maximumPageTextCodeUnits, remainingDocumentCodeUnits);
          const extractedPage = await readNormalizedPageText(page, maximumPageCodeUnits);
          const warnings: PdfTextPageWarningCode[] = [];
          if (extractedPage.truncated) {
            if (remainingDocumentCodeUnits <= effectiveLimits.maximumPageTextCodeUnits) {
              warnings.push("document-text-truncated");
              diagnostics.push(documentTextLimitDiagnostic(effectiveLimits.maximumDocumentTextCodeUnits, pageNumber));
            } else {
              warnings.push("page-text-truncated");
              diagnostics.push({
                code: "pdf-page-text-limit",
                severity: "warning",
                pageNumber,
                message: `PDF page ${pageNumber} native text was truncated at ${effectiveLimits.maximumPageTextCodeUnits} UTF-16 code units`,
              });
            }
            truncated = true;
          } else if (extractedPage.text.length === 0) {
            warnings.push("no-native-text");
          } else if (extractedPage.text.length < pdfTextSparseNativeTextCodeUnits) {
            warnings.push("sparse-native-text");
          }
          documentTextCodeUnits += extractedPage.text.length;
          pages.push({ pageNumber, text: extractedPage.text, warnings });
          if (extractedPage.truncated && remainingDocumentCodeUnits <= effectiveLimits.maximumPageTextCodeUnits) {
            break;
          }
          if (documentTextCodeUnits >= effectiveLimits.maximumDocumentTextCodeUnits && pageNumber < pagesToExtract) {
            diagnostics.push(documentTextLimitDiagnostic(effectiveLimits.maximumDocumentTextCodeUnits));
            truncated = true;
            break;
          }
        } finally {
          page.cleanup();
        }
      }
      if (!pagesTruncated && pages.length > 0 && pages.every((page) => page.warnings.includes("no-native-text"))) {
        diagnostics.push({
          code: "pdf-no-native-text",
          severity: "warning",
          message: "PDF has no extractable native text; it may be scanned",
        });
      }
      return {
        schemaVersion: 1,
        sha256,
        pageCount: documentModel.numPages,
        pages,
        diagnostics,
        truncated,
      };
    })().then(
      (result) => ({ ok: true, result }) as const,
      (error: unknown) => ({ failure: mapPdfExtractionFailure(error), ok: false }) as const,
    );
    try {
      await task.destroy();
    } catch (error) {
      if (extractionOutcome.ok) throw mapPdfRuntimeFailure(error);
    }
    if (!extractionOutcome.ok) throw extractionOutcome.failure;
    return extractionOutcome.result;
  };
}

function resolvePdfTextExtractionLimits(limits: PdfTextExtractionLimits): EffectivePdfTextExtractionLimits {
  const entries = [
    ["maximumInputBytes", limits.maximumInputBytes],
    ["maximumPages", limits.maximumPages],
    ["maximumPageTextCodeUnits", limits.maximumPageTextCodeUnits],
    ["maximumDocumentTextCodeUnits", limits.maximumDocumentTextCodeUnits],
  ] as const;
  for (const [field, value] of entries) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new PdfTextExtractionFailure("pdf-invalid-limits", `PDF extraction limit ${field} must be a positive safe integer`);
    }
  }
  return {
    maximumInputBytes: Math.min(limits.maximumInputBytes, pdfTextHardMaximumInputBytes),
    maximumPages: Math.min(limits.maximumPages, pdfTextHardMaximumPages),
    maximumPageTextCodeUnits: Math.min(limits.maximumPageTextCodeUnits, pdfTextHardMaximumPageTextCodeUnits),
    maximumDocumentTextCodeUnits: Math.min(limits.maximumDocumentTextCodeUnits, pdfTextHardMaximumDocumentTextCodeUnits),
  };
}

function mapPdfExtractionFailure(error: unknown): PdfTextExtractionFailure {
  if (error instanceof PdfTextExtractionFailure) return error;
  if (typeof error === "object" && error !== null && "name" in error && error.name === "PasswordException") {
    return new PdfTextExtractionFailure("pdf-encrypted", "Encrypted PDFs are not supported");
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "InvalidPDFException" || error.name === "FormatError")
  ) {
    return new PdfTextExtractionFailure("pdf-malformed", "PDF could not be parsed");
  }
  return mapPdfRuntimeFailure(error);
}

function mapPdfRuntimeFailure(error: unknown): PdfTextExtractionFailure {
  if (error instanceof PdfTextExtractionFailure) return error;
  return new PdfTextExtractionFailure("pdf-runtime", "PDF text runtime failed");
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

interface NormalizedPageText {
  readonly text: string;
  readonly truncated: boolean;
}

async function readNormalizedPageText(page: PdfTextPage, maximumCodeUnits: number): Promise<NormalizedPageText> {
  const reader = page.streamTextContent().getReader();
  let text = "";
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) return { text, truncated: false };
      for (const item of result.value.items) {
        if (!hasText(item)) continue;
        const normalizedItem = item.str.replaceAll(/\s+/gu, " ").trim();
        if (normalizedItem.length === 0) continue;
        const addition = `${text.length === 0 ? "" : " "}${normalizedItem}`;
        const remainingCodeUnits = maximumCodeUnits - text.length;
        if (addition.length > remainingCodeUnits) {
          text += utf16Prefix(addition, remainingCodeUnits);
          text = text.trimEnd();
          await reader.cancel();
          return { text, truncated: true };
        }
        text += addition;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function documentTextLimitDiagnostic(maximumCodeUnits: number, pageNumber?: number): PdfTextDiagnostic {
  return {
    code: "pdf-document-text-limit",
    severity: "warning",
    ...(pageNumber === undefined ? {} : { pageNumber }),
    message: `PDF document native text was truncated at ${maximumCodeUnits} UTF-16 code units`,
  };
}

function utf16Prefix(value: string, maximumCodeUnits: number): string {
  if (maximumCodeUnits <= 0) return "";
  let prefix = value.slice(0, maximumCodeUnits);
  const finalCodeUnit = prefix.charCodeAt(prefix.length - 1);
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) prefix = prefix.slice(0, -1);
  return prefix;
}

function hasText(value: unknown): value is { readonly str: string } {
  return typeof value === "object" && value !== null && "str" in value && typeof value.str === "string";
}
