import * as pdfJsRuntime from "pdfjs-dist/legacy/build/pdf.mjs";
import { detectPdfHighlights } from "../client/pdf-highlight-import";
import { analyzePdfReferences } from "../client/pdf-reference-analysis";
import type { PdfHighlightAnalysisResult, PdfReferenceAnalysisResult } from "../domain/reference-library";

declare global {
  interface Window {
    analyzePdfHighlights(url: string): Promise<PdfHighlightAnalysisResult>;
    analyzePdfReferences(url: string): Promise<PdfReferenceAnalysisResult>;
  }
}

pdfJsRuntime.GlobalWorkerOptions.workerSrc = "https://artifact-analysis.invalid/pdf.worker.js";
window.analyzePdfHighlights = async (url: string) => await detectPdfHighlights(pdfJsRuntime, url);
window.analyzePdfReferences = async (url: string) => await analyzePdfReferences(pdfJsRuntime, url);
