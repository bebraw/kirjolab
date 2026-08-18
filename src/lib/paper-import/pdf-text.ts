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
const pdfTextSparseNativeTextCodeUnits = 24;

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

type SettledPdfExtraction =
  { readonly ok: true; readonly result: PdfTextExtractionV1 } | { readonly ok: false; readonly failure: PdfTextExtractionFailure };

interface ExtractedPdfPage {
  readonly page: PdfTextExtractionPageV1;
  readonly diagnostics: readonly PdfTextDiagnostic[];
  readonly truncated: boolean;
  readonly documentLimitReached: boolean;
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
    const extractionOutcome = await settlePdfExtraction(extractPdfDocument(task.promise, effectiveLimits, sha256));
    try {
      await task.destroy();
    } catch (error) {
      if (extractionOutcome.ok) throw mapPdfRuntimeFailure(error);
    }
    if (!extractionOutcome.ok) throw extractionOutcome.failure;
    return extractionOutcome.result;
  };
}

async function settlePdfExtraction(pending: Promise<PdfTextExtractionV1>): Promise<SettledPdfExtraction> {
  try {
    return { ok: true, result: await pending };
  } catch (error) {
    return { failure: mapPdfExtractionFailure(error), ok: false };
  }
}

async function extractPdfDocument(
  pendingDocument: Promise<PdfTextDocument>,
  limits: EffectivePdfTextExtractionLimits,
  sha256: string,
): Promise<PdfTextExtractionV1> {
  const documentModel = await pendingDocument;
  const pages: PdfTextExtractionPageV1[] = [];
  const pagesToExtract = Math.min(documentModel.numPages, limits.maximumPages);
  const pagesTruncated = documentModel.numPages > pagesToExtract;
  const diagnostics: PdfTextDiagnostic[] = pagesTruncated
    ? [
        {
          code: "pdf-page-limit",
          severity: "warning",
          message: `PDF text extraction stopped after ${pagesToExtract} of ${documentModel.numPages} pages`,
        },
      ]
    : [];
  let documentTextCodeUnits = 0;
  let truncated = pagesTruncated;

  for (let pageNumber = 1; pageNumber <= pagesToExtract; pageNumber += 1) {
    const remaining = limits.maximumDocumentTextCodeUnits - documentTextCodeUnits;
    const extracted = await extractPdfPage(documentModel, pageNumber, remaining, limits);
    pages.push(extracted.page);
    diagnostics.push(...extracted.diagnostics);
    documentTextCodeUnits += extracted.page.text.length;
    truncated ||= extracted.truncated;
    if (extracted.documentLimitReached) break;
    if (documentTextCodeUnits >= limits.maximumDocumentTextCodeUnits && pageNumber < pagesToExtract) {
      diagnostics.push(documentTextLimitDiagnostic(limits.maximumDocumentTextCodeUnits));
      truncated = true;
      break;
    }
  }
  if (!pagesTruncated && pages.length > 0 && pages.every((page) => page.warnings.includes("no-native-text"))) {
    diagnostics.push({
      code: "pdf-no-native-text",
      severity: "warning",
      message: "PDF has no extractable native text; it may be scanned",
    });
  }
  return { schemaVersion: 1, sha256, pageCount: documentModel.numPages, pages, diagnostics, truncated };
}

async function extractPdfPage(
  documentModel: PdfTextDocument,
  pageNumber: number,
  remainingDocumentCodeUnits: number,
  limits: EffectivePdfTextExtractionLimits,
): Promise<ExtractedPdfPage> {
  const page = await documentModel.getPage(pageNumber);
  try {
    const maximumPageCodeUnits = Math.min(limits.maximumPageTextCodeUnits, remainingDocumentCodeUnits);
    const extracted = await readNormalizedPageText(page, maximumPageCodeUnits);
    return classifyExtractedPage(extracted, pageNumber, remainingDocumentCodeUnits, limits);
  } finally {
    page.cleanup();
  }
}

function classifyExtractedPage(
  extracted: NormalizedPageText,
  pageNumber: number,
  remainingDocumentCodeUnits: number,
  limits: EffectivePdfTextExtractionLimits,
): ExtractedPdfPage {
  const warnings: PdfTextPageWarningCode[] = [];
  const diagnostics: PdfTextDiagnostic[] = [];
  const documentLimitReached = extracted.truncated && remainingDocumentCodeUnits <= limits.maximumPageTextCodeUnits;
  if (documentLimitReached) {
    warnings.push("document-text-truncated");
    diagnostics.push(documentTextLimitDiagnostic(limits.maximumDocumentTextCodeUnits, pageNumber));
  } else if (extracted.truncated) {
    warnings.push("page-text-truncated");
    diagnostics.push({
      code: "pdf-page-text-limit",
      severity: "warning",
      pageNumber,
      message: `PDF page ${pageNumber} native text was truncated at ${limits.maximumPageTextCodeUnits} UTF-16 code units`,
    });
  } else if (extracted.text.length === 0) {
    warnings.push("no-native-text");
  } else if (extracted.text.length < pdfTextSparseNativeTextCodeUnits) {
    warnings.push("sparse-native-text");
  }
  return {
    page: { pageNumber, text: extracted.text, warnings },
    diagnostics,
    truncated: extracted.truncated,
    documentLimitReached,
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
        const appended = appendPageText(text, item, maximumCodeUnits);
        if (!appended) continue;
        text = appended.text;
        if (!appended.truncated) continue;
        await reader.cancel();
        return appended;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function appendPageText(text: string, item: unknown, maximumCodeUnits: number): NormalizedPageText | null {
  if (!hasText(item)) return null;
  const normalizedItem = item.str.replaceAll(/\s+/gu, " ").trim();
  if (normalizedItem.length === 0) return null;
  const addition = `${text.length === 0 ? "" : " "}${normalizedItem}`;
  const remainingCodeUnits = maximumCodeUnits - text.length;
  if (addition.length <= remainingCodeUnits) return { text: text + addition, truncated: false };
  return { text: (text + utf16Prefix(addition, remainingCodeUnits)).trimEnd(), truncated: true };
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
