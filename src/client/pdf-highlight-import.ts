import type { PDFPageProxy, TextContent, TextItem } from "pdfjs-dist/types/src/display/api";
import type { LibraryPdfRect } from "../domain/reference-library";
import { loadPdfJsRuntime, type PdfJsRuntime } from "./pdfjs-runtime";

const maximumPages = 200;
const maximumCandidates = 128;
const renderScale = 1.25;

export interface PdfHighlightImportCandidate {
  readonly id: string;
  readonly source: "annotation" | "flattened";
  readonly page: number;
  readonly quote: string;
  readonly comment: string;
  readonly rects: readonly LibraryPdfRect[];
  readonly confidence: number;
}

export interface PdfHighlightDetection {
  readonly candidates: readonly PdfHighlightImportCandidate[];
  readonly pagesScanned: number;
  readonly pagesTotal: number;
  readonly truncated: boolean;
}

interface PixelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PdfHighlightTextSpan {
  readonly index: number;
  readonly text: string;
  readonly rect: PixelRect;
  readonly hasEol: boolean;
}

export interface PdfHighlightViewport {
  readonly width: number;
  readonly height: number;
  convertToViewportPoint(x: number, y: number): number[];
}

interface AnnotationLike {
  readonly subtype?: unknown;
  readonly rect?: unknown;
  readonly quadPoints?: unknown;
  readonly contentsObj?: { readonly str?: unknown } | null;
}

/* v8 ignore start -- PDF.js document/canvas orchestration is exercised by the Playwright import flow. */
export async function detectImportedPdfHighlights(url: string): Promise<PdfHighlightDetection> {
  const runtime = await loadPdfJsRuntime();
  runtime.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";
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
  const annotations = (await page.getAnnotations({ intent: "display" })) as AnnotationLike[];
  const native = nativePdfHighlightCandidates(viewport, spans, annotations, pageNumber);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  await page.render({ canvas, viewport, annotationMode: runtime.AnnotationMode.DISABLE }).promise;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const pixels = context?.getImageData(0, 0, canvas.width, canvas.height);
  const flattened = pixels ? flattenedPdfHighlightCandidates(pixels.data, pixels.width, pixels.height, spans, pageNumber) : [];
  return deduplicatePdfHighlightCandidates([...native, ...flattened]).slice(0, remaining);
}

function textSpans(runtime: PdfJsRuntime, viewport: ReturnType<PDFPageProxy["getViewport"]>, content: TextContent): PdfHighlightTextSpan[] {
  const spans: PdfHighlightTextSpan[] = [];
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

export function nativePdfHighlightCandidates(
  viewport: PdfHighlightViewport,
  spans: readonly PdfHighlightTextSpan[],
  annotations: readonly AnnotationLike[],
  page: number,
): PdfHighlightImportCandidate[] {
  const candidates: PdfHighlightImportCandidate[] = [];
  for (const [index, annotation] of annotations.entries()) {
    if (annotation.subtype !== "Highlight") continue;
    const pdfRects = annotationPdfRects(annotation);
    const pixelRects = pdfRects.map(([left, bottom, right, top]) => {
      const first = viewport.convertToViewportPoint(left, bottom);
      const second = viewport.convertToViewportPoint(right, top);
      return {
        left: Math.min(first[0]!, second[0]!),
        top: Math.min(first[1]!, second[1]!),
        right: Math.max(first[0]!, second[0]!),
        bottom: Math.max(first[1]!, second[1]!),
      };
    });
    const quote = quoteForRegions(pixelRects, spans);
    if (!quote) continue;
    candidates.push({
      id: `annotation:${page}:${index}`,
      source: "annotation",
      page,
      quote,
      comment: typeof annotation.contentsObj?.str === "string" ? annotation.contentsObj.str.trim() : "",
      rects: normalizePixelRects(pixelRects, viewport.width, viewport.height),
      confidence: 1,
    });
  }
  return candidates;
}

function annotationPdfRects(annotation: AnnotationLike): [number, number, number, number][] {
  const quadPoints = numericArray(annotation.quadPoints);
  if (quadPoints.length >= 8 && quadPoints.length % 8 === 0) {
    const rects: [number, number, number, number][] = [];
    for (let index = 0; index < quadPoints.length; index += 8) {
      const xs = [quadPoints[index]!, quadPoints[index + 2]!, quadPoints[index + 4]!, quadPoints[index + 6]!];
      const ys = [quadPoints[index + 1]!, quadPoints[index + 3]!, quadPoints[index + 5]!, quadPoints[index + 7]!];
      rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    }
    return rects;
  }
  const rect = numericArray(annotation.rect);
  return rect.length === 4 ? [[rect[0]!, rect[1]!, rect[2]!, rect[3]!]] : [];
}

export function detectYellowRegions(data: Uint8ClampedArray, width: number, height: number): PixelRect[] {
  if (data.length !== width * height * 4 || width <= 0 || height <= 0) return [];
  const regions: PixelRect[] = [];
  let active: PixelRect[] = [];
  for (let y = 0; y < height; y += 1) {
    const runs: PixelRect[] = [];
    let start = -1;
    let lastYellow = -10;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (isHighlightYellow(data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!)) {
        if (start < 0) start = x;
        lastYellow = x;
      } else if (start >= 0 && x - lastYellow > 5) {
        if (lastYellow - start >= 2) runs.push({ left: start, top: y, right: lastYellow + 1, bottom: y + 1 });
        start = -1;
      }
    }
    if (start >= 0 && lastYellow - start >= 2) runs.push({ left: start, top: y, right: lastYellow + 1, bottom: y + 1 });
    const nextActive: PixelRect[] = [];
    for (const run of runs) {
      const match = active.find(
        (region) => horizontalOverlap(region, run) >= Math.min(run.right - run.left, region.right - region.left) * 0.2,
      );
      if (match) {
        match.left = Math.min(match.left, run.left);
        match.right = Math.max(match.right, run.right);
        match.bottom = y + 1;
        nextActive.push(match);
      } else {
        nextActive.push({ ...run });
      }
    }
    for (const region of active) if (!nextActive.includes(region)) regions.push(region);
    active = nextActive;
  }
  regions.push(...active);
  return regions.filter((region) => region.right - region.left >= 4 && region.bottom - region.top >= 3);
}

export function flattenedPdfHighlightCandidates(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  spans: readonly PdfHighlightTextSpan[],
  page: number,
): PdfHighlightImportCandidate[] {
  return flattenedHighlightCandidates(detectYellowRegions(data, width, height), spans, page, width, height);
}

function flattenedHighlightCandidates(
  regions: readonly PixelRect[],
  spans: readonly PdfHighlightTextSpan[],
  page: number,
  width: number,
  height: number,
): PdfHighlightImportCandidate[] {
  const pieces = regions
    .map((region) => ({ region, spanIndexes: intersectingSpanIndexes(region, spans) }))
    .filter((piece) => piece.spanIndexes.length > 0)
    .sort((left, right) => left.spanIndexes[0]! - right.spanIndexes[0]! || left.region.top - right.region.top);
  const groups: (typeof pieces)[] = [];
  for (const piece of pieces) {
    const previous = groups.at(-1);
    const priorPiece = previous?.at(-1);
    if (priorPiece && flattenedPiecesConnect(priorPiece, piece)) previous!.push(piece);
    else groups.push([piece]);
  }
  return groups.flatMap((group, index) => {
    const groupRegions = group.map((piece) => piece.region);
    const quote = quoteForRegions(groupRegions, spans);
    if (!quote) return [];
    return [
      {
        id: `flattened:${page}:${index}`,
        source: "flattened" as const,
        page,
        quote,
        comment: "",
        rects: normalizePixelRects(groupRegions, width, height),
        confidence: 0.85,
      },
    ];
  });
}

function flattenedPiecesConnect(
  previous: { readonly region: PixelRect; readonly spanIndexes: readonly number[] },
  next: { readonly region: PixelRect; readonly spanIndexes: readonly number[] },
): boolean {
  const previousLast = previous.spanIndexes.at(-1)!;
  const nextFirst = next.spanIndexes[0]!;
  const verticalGap = next.region.top - previous.region.bottom;
  const lineHeight = Math.max(3, Math.min(previous.region.bottom - previous.region.top, next.region.bottom - next.region.top));
  return (
    nextFirst <= previousLast + 2 &&
    verticalGap >= -2 &&
    verticalGap <= lineHeight * 1.25 &&
    horizontalOverlap(previous.region, next.region) > 0
  );
}

function intersectingSpanIndexes(region: PixelRect, spans: readonly PdfHighlightTextSpan[]): number[] {
  return spans.filter((span) => overlapArea(region, span.rect) >= area(span.rect) * 0.08).map((span) => span.index);
}

function quoteForRegions(regions: readonly PixelRect[], spans: readonly PdfHighlightTextSpan[]): string {
  const selected = spans.filter((span) => regions.some((region) => overlapArea(region, span.rect) >= area(span.rect) * 0.08));
  return selected
    .map((span) => span.text)
    .join(" ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, 20_000);
}

function normalizePixelRects(rects: readonly PixelRect[], width: number, height: number): LibraryPdfRect[] {
  return rects.slice(0, 512).map((rect) => ({
    x: round(rect.left / width),
    y: round(rect.top / height),
    width: round((rect.right - rect.left) / width),
    height: round((rect.bottom - rect.top) / height),
  }));
}

export function deduplicatePdfHighlightCandidates(candidates: readonly PdfHighlightImportCandidate[]): PdfHighlightImportCandidate[] {
  const unique: PdfHighlightImportCandidate[] = [];
  for (const candidate of candidates) {
    const duplicate = unique.some(
      (other) =>
        other.page === candidate.page &&
        other.quote.toLocaleLowerCase() === candidate.quote.toLocaleLowerCase() &&
        other.rects.some((left) => candidate.rects.some((right) => normalizedRectsOverlap(left, right))),
    );
    if (!duplicate) unique.push(candidate);
  }
  return unique;
}

function isHighlightYellow(red: number, green: number, blue: number, alpha: number): boolean {
  return alpha > 180 && red > 190 && green > 165 && blue < 155 && red - blue > 65 && green - blue > 45;
}

function numericArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  if (ArrayBuffer.isView(value)) return Array.from(value as Float32Array).filter(Number.isFinite);
  return [];
}

function clipPixelRect(rect: PixelRect, width: number, height: number): PixelRect | null {
  const clipped = {
    left: Math.max(0, Math.min(width, rect.left)),
    top: Math.max(0, Math.min(height, rect.top)),
    right: Math.max(0, Math.min(width, rect.right)),
    bottom: Math.max(0, Math.min(height, rect.bottom)),
  };
  return clipped.right > clipped.left && clipped.bottom > clipped.top ? clipped : null;
}

function horizontalOverlap(left: PixelRect, right: PixelRect): number {
  return Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
}

function overlapArea(left: PixelRect, right: PixelRect): number {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

function area(rect: PixelRect): number {
  return Math.max(1, (rect.right - rect.left) * (rect.bottom - rect.top));
}

function normalizedRectsOverlap(left: LibraryPdfRect, right: LibraryPdfRect): boolean {
  return (
    Math.min(left.x + left.width, right.x + right.width) > Math.max(left.x, right.x) &&
    Math.min(left.y + left.height, right.y + right.height) > Math.max(left.y, right.y)
  );
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
