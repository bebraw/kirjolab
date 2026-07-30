import type { PdfHighlightAnalysisCandidate } from "../../domain/reference-library/artifact-analysis";
import type { LibraryPdfRect } from "../../domain/reference-library/pdf-annotations";
import type { PdfAnalysisBitmap, PdfAnalysisPixelRect, PdfAnalysisTextSpan, PdfAnalysisViewport, PdfNativeAnnotation } from "./contracts";

export function nativePdfHighlightCandidates(
  viewport: PdfAnalysisViewport,
  spans: readonly PdfAnalysisTextSpan[],
  annotations: readonly PdfNativeAnnotation[],
  page: number,
): PdfHighlightAnalysisCandidate[] {
  const candidates: PdfHighlightAnalysisCandidate[] = [];
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

export function detectYellowRegions(bitmap: PdfAnalysisBitmap): PdfAnalysisPixelRect[] {
  const { pixels, width, height } = bitmap;
  if (pixels.length !== width * height * 4 || width <= 0 || height <= 0) return [];
  const regions: PdfAnalysisPixelRect[] = [];
  let active: PdfAnalysisPixelRect[] = [];
  for (let y = 0; y < height; y += 1) {
    active = extendYellowRegions(active, yellowRunsForRow(pixels, width, y), y, regions);
  }
  regions.push(...active);
  return regions.filter((region) => region.right - region.left >= 4 && region.bottom - region.top >= 3);
}

export function flattenedPdfHighlightCandidates(
  bitmap: PdfAnalysisBitmap,
  spans: readonly PdfAnalysisTextSpan[],
): PdfHighlightAnalysisCandidate[] {
  return flattenedHighlightCandidates(detectYellowRegions(bitmap), spans, bitmap.page, bitmap.width, bitmap.height);
}

export function deduplicatePdfHighlightCandidates(candidates: readonly PdfHighlightAnalysisCandidate[]): PdfHighlightAnalysisCandidate[] {
  const unique: PdfHighlightAnalysisCandidate[] = [];
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

function annotationPdfRects(annotation: PdfNativeAnnotation): [number, number, number, number][] {
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

function flattenedHighlightCandidates(
  regions: readonly PdfAnalysisPixelRect[],
  spans: readonly PdfAnalysisTextSpan[],
  page: number,
  width: number,
  height: number,
): PdfHighlightAnalysisCandidate[] {
  const pieces = regions
    .map((region) => {
      const intersectingSpans = spans.filter((span) => spanOverlapRatio(region, span) >= 0.08);
      return { region, spanIndexes: intersectingSpans.map((span) => span.index), intersectingSpans };
    })
    .filter((piece) => piece.spanIndexes.length > 0 && regionMatchesTextHighlightBand(piece.region, piece.intersectingSpans))
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
  previous: { readonly region: PdfAnalysisPixelRect; readonly spanIndexes: readonly number[] },
  next: { readonly region: PdfAnalysisPixelRect; readonly spanIndexes: readonly number[] },
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

function regionMatchesTextHighlightBand(region: PdfAnalysisPixelRect, spans: readonly PdfAnalysisTextSpan[]): boolean {
  const regionHeight = region.bottom - region.top;
  const maximumTextHeight = Math.max(...spans.map((span) => span.rect.bottom - span.rect.top));
  return regionHeight <= Math.max(8, maximumTextHeight * 1.8);
}

function spanOverlapRatio(region: PdfAnalysisPixelRect, span: PdfAnalysisTextSpan): number {
  return overlapArea(region, span.rect) / area(span.rect);
}

function quoteForRegions(regions: readonly PdfAnalysisPixelRect[], spans: readonly PdfAnalysisTextSpan[]): string {
  const selected = spans.filter((span) => regions.some((region) => overlapArea(region, span.rect) >= area(span.rect) * 0.08));
  return selected
    .map((span) => span.text)
    .join(" ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, 20_000);
}

function normalizePixelRects(rects: readonly PdfAnalysisPixelRect[], width: number, height: number): LibraryPdfRect[] {
  return rects.slice(0, 512).map((rect) => ({
    x: round(rect.left / width),
    y: round(rect.top / height),
    width: round((rect.right - rect.left) / width),
    height: round((rect.bottom - rect.top) / height),
  }));
}

function isHighlightYellow(red: number, green: number, blue: number, alpha: number): boolean {
  return alpha > 180 && red > 190 && green > 165 && blue < 155 && red - blue > 65 && green - blue > 45;
}

function yellowRunsForRow(pixels: Uint8ClampedArray, width: number, y: number): PdfAnalysisPixelRect[] {
  const runs: PdfAnalysisPixelRect[] = [];
  let start = -1;
  let lastYellow = -10;
  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    if (isHighlightYellow(pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!, pixels[offset + 3]!)) {
      if (start < 0) start = x;
      lastYellow = x;
      continue;
    }
    if (start >= 0 && x - lastYellow > 5) {
      appendYellowRun(runs, start, lastYellow, y);
      start = -1;
    }
  }
  if (start >= 0) appendYellowRun(runs, start, lastYellow, y);
  return runs;
}

function appendYellowRun(runs: PdfAnalysisPixelRect[], start: number, lastYellow: number, y: number): void {
  if (lastYellow - start >= 2) runs.push({ left: start, top: y, right: lastYellow + 1, bottom: y + 1 });
}

function extendYellowRegions(
  active: readonly PdfAnalysisPixelRect[],
  runs: readonly PdfAnalysisPixelRect[],
  y: number,
  completed: PdfAnalysisPixelRect[],
): PdfAnalysisPixelRect[] {
  const nextActive: PdfAnalysisPixelRect[] = [];
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
  for (const region of active) if (!nextActive.includes(region)) completed.push(region);
  return nextActive;
}

function numericArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  if (ArrayBuffer.isView(value)) return Array.from(value as Float32Array).filter(Number.isFinite);
  return [];
}

function horizontalOverlap(left: PdfAnalysisPixelRect, right: PdfAnalysisPixelRect): number {
  return Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
}

function overlapArea(left: PdfAnalysisPixelRect, right: PdfAnalysisPixelRect): number {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

function area(rect: PdfAnalysisPixelRect): number {
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
