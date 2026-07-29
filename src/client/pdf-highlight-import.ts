import type { PDFPageProxy, TextContent, TextItem } from "pdfjs-dist/types/src/display/api";
import type { PdfHighlightAnalysisCandidate, PdfHighlightAnalysisResult } from "../domain/reference-library/artifact-analysis";
import {
  deduplicatePdfHighlightCandidates,
  detectYellowRegions as detectYellowRegionsCore,
  flattenedPdfHighlightCandidates as flattenedPdfHighlightCandidatesCore,
  nativePdfHighlightCandidates,
  type PdfAnalysisBitmap,
  type PdfAnalysisPixelRect,
  type PdfAnalysisTextSpan,
  type PdfAnalysisViewport,
  type PdfNativeAnnotation,
} from "../lib/pdf-analysis";
import { loadPdfJsRuntime, type PdfJsRuntime } from "./pdfjs-runtime";

const maximumPages = 200;
const maximumCandidates = 128;
const renderScale = 1.25;

export type PdfHighlightImportCandidate = PdfHighlightAnalysisCandidate;
export type PdfHighlightDetection = PdfHighlightAnalysisResult;

/* v8 ignore start -- PDF.js document/canvas orchestration is exercised by the Playwright import flow. */
export async function detectImportedPdfHighlights(url: string): Promise<PdfHighlightDetection> {
  const runtime = await loadPdfJsRuntime();
  runtime.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";
  return await detectPdfHighlights(runtime, url);
}

export async function detectPdfHighlights(runtime: PdfJsRuntime, url: string): Promise<PdfHighlightDetection> {
  const task = runtime.getDocument({ url });
  try {
    const pdf = await task.promise;
    const pagesScanned = Math.min(pdf.numPages, maximumPages);
    const candidates: PdfHighlightImportCandidate[] = [];
    for (let pageNumber = 1; pageNumber <= pagesScanned && candidates.length < maximumCandidates; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        candidates.push(...(await detectPageHighlights(runtime, page, pageNumber, maximumCandidates - candidates.length)));
      } finally {
        page.cleanup();
      }
    }
    return {
      candidates,
      pagesScanned,
      pagesTotal: pdf.numPages,
      truncated: pdf.numPages > pagesScanned || candidates.length >= maximumCandidates,
    };
  } finally {
    await task.destroy();
  }
}

async function detectPageHighlights(
  runtime: PdfJsRuntime,
  page: PDFPageProxy,
  pageNumber: number,
  remaining: number,
): Promise<PdfHighlightImportCandidate[]> {
  const viewport = page.getViewport({ scale: renderScale });
  const textContent = await page.getTextContent();
  const spans = textSpans(runtime, viewport, textContent);
  const annotations = (await page.getAnnotations({ intent: "display" })) as PdfNativeAnnotation[];
  const native = nativePdfHighlightCandidates(viewport, spans, annotations, pageNumber);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  await page.render({ canvas, viewport, annotationMode: runtime.AnnotationMode.DISABLE }).promise;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const pixels = context?.getImageData(0, 0, canvas.width, canvas.height);
  const bitmap: PdfAnalysisBitmap | null = pixels
    ? { page: pageNumber, pixels: pixels.data, width: pixels.width, height: pixels.height }
    : null;
  const flattened = bitmap ? flattenedPdfHighlightCandidatesCore(bitmap, spans) : [];
  return deduplicatePdfHighlightCandidates([...native, ...flattened]).slice(0, remaining);
}

function textSpans(runtime: PdfJsRuntime, viewport: ReturnType<PDFPageProxy["getViewport"]>, content: TextContent): PdfAnalysisTextSpan[] {
  const spans: PdfAnalysisTextSpan[] = [];
  for (const [index, value] of content.items.entries()) {
    if (!("str" in value) || !value.str.trim()) continue;
    const item = value as TextItem;
    const transform = runtime.Util.transform(viewport.transform, item.transform);
    const height = Math.max(1, Math.hypot(transform[2], transform[3]));
    const width = Math.max(1, item.width * viewport.scale);
    const rect = clipPixelRect(
      {
        left: transform[4],
        top: transform[5] - height,
        right: transform[4] + width,
        bottom: transform[5] + height * 0.15,
      },
      viewport.width,
      viewport.height,
    );
    if (rect) spans.push({ index, text: item.str, rect, hasEol: item.hasEOL });
  }
  return spans;
}
/* v8 ignore stop */

function clipPixelRect(rect: PdfAnalysisPixelRect, width: number, height: number): PdfAnalysisPixelRect | null {
  const clipped = {
    left: Math.max(0, Math.min(width, rect.left)),
    top: Math.max(0, Math.min(height, rect.top)),
    right: Math.max(0, Math.min(width, rect.right)),
    bottom: Math.max(0, Math.min(height, rect.bottom)),
  };
  return clipped.right > clipped.left && clipped.bottom > clipped.top ? clipped : null;
}

export function detectYellowRegions(data: Uint8ClampedArray, width: number, height: number): PdfAnalysisPixelRect[] {
  return detectYellowRegionsCore({ page: 1, pixels: data, width, height });
}

export function flattenedPdfHighlightCandidates(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  spans: readonly PdfAnalysisTextSpan[],
  page: number,
): PdfHighlightImportCandidate[] {
  return flattenedPdfHighlightCandidatesCore({ page, pixels: data, width, height }, spans);
}

export { deduplicatePdfHighlightCandidates, nativePdfHighlightCandidates };
export type PdfHighlightTextSpan = PdfAnalysisTextSpan;
export type PdfHighlightViewport = PdfAnalysisViewport;
