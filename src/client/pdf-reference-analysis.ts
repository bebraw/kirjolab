import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { PdfReferenceAnalysisResult } from "../domain/reference-library/artifact-analysis";
import { analyzePdfReferencePages as analyzePdfReferencePagesCore, type PdfAnalysisPage } from "../lib/pdf-analysis";
import type { PdfJsRuntime } from "./pdfjs-runtime";

const maximumPages = 200;

/* v8 ignore start -- PDF.js document orchestration is covered by the Worker/browser integration. */
export async function analyzePdfReferences(runtime: PdfJsRuntime, url: string): Promise<PdfReferenceAnalysisResult> {
  const task = runtime.getDocument({ url });
  try {
    const pdf = await task.promise;
    const pagesScanned = Math.min(pdf.numPages, maximumPages);
    const pages: Pick<PdfAnalysisPage, "page" | "text">[] = [];
    for (let pageNumber = 1; pageNumber <= pagesScanned; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        pages.push({ page: pageNumber, text: pdfTextLines(content.items).join("\n") });
      } finally {
        page.cleanup();
      }
    }
    return analyzePdfReferencePagesCore(pages, pdf.numPages);
  } finally {
    await task.destroy();
  }
}

function pdfTextLines(items: readonly unknown[]): string[] {
  const positioned = items
    .filter((value): value is TextItem => typeof value === "object" && value !== null && "str" in value && "transform" in value)
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
/* v8 ignore stop */

export function analyzePdfReferencePages(
  pages: readonly { readonly page: number; readonly lines: readonly string[] }[],
  pagesTotal: number,
): PdfReferenceAnalysisResult {
  return analyzePdfReferencePagesCore(
    pages.map((page) => ({ page: page.page, text: page.lines.join("\n") })),
    pagesTotal,
  );
}
