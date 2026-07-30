import * as pdfJsRuntime from "pdfjs-dist/legacy/build/pdf.mjs";
import { detectPdfHighlights } from "../client/pdf-highlight-import";
import { analyzePdfReferences } from "../client/pdf-reference-analysis";
import { extractPdfText } from "../client/pdf-text-analysis";
import type { PdfTextExtraction } from "../domain/reference-library";
import type { PdfHighlightAnalysisResult, PdfReferenceAnalysisResult } from "../domain/reference-library";

declare global {
  interface Window {
    analyzePdfHighlights(url: string): Promise<PdfHighlightAnalysisResult>;
    analyzePdfReferences(url: string): Promise<PdfReferenceAnalysisResult>;
    extractPdfText(url: string): Promise<PdfTextExtraction>;
  }
}

pdfJsRuntime.GlobalWorkerOptions.workerSrc = new URL("/pdf.worker.js", window.location.href).href;
window.analyzePdfHighlights = async (url: string) => await detectPdfHighlights(pdfJsRuntime, url);
window.analyzePdfReferences = async (url: string) => await analyzePdfReferences(pdfJsRuntime, url);
window.extractPdfText = async (url: string) => await extractPdfText(pdfJsRuntime, url);
