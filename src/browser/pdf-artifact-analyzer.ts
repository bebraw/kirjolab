import * as pdfJsRuntime from "pdfjs-dist/legacy/build/pdf.mjs";
import { detectPdfHighlights } from "../client/pdf-highlight-import";
import type { PdfHighlightAnalysisResult } from "../domain/reference-library";

declare global {
  interface Window {
    analyzePdfHighlights(url: string): Promise<PdfHighlightAnalysisResult>;
  }
}

pdfJsRuntime.GlobalWorkerOptions.workerSrc = "https://artifact-analysis.invalid/pdf.worker.js";
window.analyzePdfHighlights = async (url: string) => await detectPdfHighlights(pdfJsRuntime, url);
