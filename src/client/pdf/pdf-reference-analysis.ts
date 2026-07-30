import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { PdfReferenceAnalysisResult } from "../../domain/reference-library/artifact-analysis";
import { analyzePdfReferencePages as analyzePdfReferencePagesCore } from "../../lib/pdf-analysis/index";
import type { PdfJsRuntime } from "./pdfjs-runtime";

const maximumPages = 200;

interface PdfReferenceTextItemPage {
  readonly page: number;
  readonly items: readonly unknown[];
}

/* v8 ignore start -- PDF.js document orchestration is covered by the Worker/browser integration. */
export async function analyzePdfReferences(runtime: PdfJsRuntime, url: string): Promise<PdfReferenceAnalysisResult> {
  const task = runtime.getDocument({ url });
  try {
    const pdf = await task.promise;
    const pagesScanned = Math.min(pdf.numPages, maximumPages);
    const pages: PdfReferenceTextItemPage[] = [];
    for (let pageNumber = 1; pageNumber <= pagesScanned; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        pages.push({ page: pageNumber, items: content.items });
      } finally {
        page.cleanup();
      }
    }
    return analyzePdfReferenceTextItemPages(pages, pdf.numPages);
  } finally {
    await task.destroy();
  }
}

/* v8 ignore stop */

export function analyzePdfReferenceTextItemPages(
  pages: readonly PdfReferenceTextItemPage[],
  pagesTotal: number,
): PdfReferenceAnalysisResult {
  const ordered = analyzePdfReferencePagesCore(
    pages.map((page) => ({ page: page.page, text: pdfTextLinesInContentOrder(page.items).join("\n") })),
    pagesTotal,
  );
  if (ordered.referencesStartPage !== null && ordered.candidates.length > 0) return ordered;

  const positioned = analyzePdfReferencePagesCore(
    pages.map((page) => ({ page: page.page, text: pdfTextLinesByPosition(page.items).join("\n") })),
    pagesTotal,
  );
  if (positioned.referencesStartPage !== null && positioned.candidates.length > 0) return positioned;
  return ordered.referencesStartPage !== null ? ordered : positioned;
}

function pdfTextLinesInContentOrder(items: readonly unknown[]): string[] {
  const lines: string[] = [];
  let pieces: string[] = [];
  const flush = (): void => {
    const line = pieces.join(" ").replaceAll(/\s+/gu, " ").trim();
    if (line) lines.push(line);
    pieces = [];
  };
  for (const value of items) {
    if (!isPdfTextItem(value)) continue;
    const text = value.str.trim();
    if (text) pieces.push(text);
    if (value.hasEOL) flush();
  }
  flush();
  return lines;
}

function pdfTextLinesByPosition(items: readonly unknown[]): string[] {
  const positioned = items
    .filter(isPdfTextItem)
    .map((item) => ({
      height: Math.abs(item.transform[3] ?? 0),
      text: item.str.trim(),
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
    }))
    .filter(({ text }) => text.length > 0)
    .sort((left, right) => right.y - left.y || left.x - right.x);
  const rows: { pieces: { text: string; x: number }[]; tolerance: number; y: number }[] = [];
  for (const item of positioned) {
    const tolerance = Math.max(2, item.height * 0.35);
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(candidate.tolerance, tolerance));
    if (row) {
      row.pieces.push({ text: item.text, x: item.x });
      row.tolerance = Math.max(row.tolerance, tolerance);
    } else {
      rows.push({ pieces: [{ text: item.text, x: item.x }], tolerance, y: item.y });
    }
  }
  return rows.map(({ pieces }) =>
    pieces
      .sort((left, right) => left.x - right.x)
      .map(({ text }) => text)
      .join(" "),
  );
}

function isPdfTextItem(value: unknown): value is TextItem {
  return typeof value === "object" && value !== null && "str" in value && "transform" in value;
}

export function analyzePdfReferencePages(
  pages: readonly { readonly page: number; readonly lines: readonly string[] }[],
  pagesTotal: number,
): PdfReferenceAnalysisResult {
  return analyzePdfReferencePagesCore(
    pages.map((page) => ({ page: page.page, text: page.lines.join("\n") })),
    pagesTotal,
  );
}
