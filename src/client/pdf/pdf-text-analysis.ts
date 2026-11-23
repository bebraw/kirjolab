import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { PdfJsRuntime } from "./pdfjs-runtime";
import { renderPdfPageJpeg } from "./pdf-page-image";
import type { PdfTextExtraction, PdfTextExtractionPage } from "../../domain/reference-library";

const maximumPages = 200;
const maximumOcrPages = 40;

export async function extractPdfText(runtime: PdfJsRuntime, url: string): Promise<PdfTextExtraction> {
  const task = runtime.getDocument({ url });
  try {
    const pdf = await task.promise;
    const pages: PdfTextExtractionPage[] = [];
    let ocrPages = 0;
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, maximumPages); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const text = content.items
          .filter((item): item is TextItem => "str" in item)
          .map(({ str }) => str)
          .join(" ")
          .replaceAll(/\s+/gu, " ")
          .trim();
        if (text.length >= 24 || ocrPages >= maximumOcrPages) {
          pages.push({ page: pageNumber, text });
          continue;
        }
        const image = await renderPdfPageJpeg(page, { width: 1600, maxScale: 2, quality: 0.86 });
        pages.push({ image, page: pageNumber, text });
        ocrPages += 1;
      } finally {
        page.cleanup();
      }
    }
    return { pages, pagesTotal: pdf.numPages, truncated: pdf.numPages > maximumPages };
  } finally {
    await task.destroy();
  }
}
