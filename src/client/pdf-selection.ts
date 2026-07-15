import type { PdfSelectionRect } from "../domain/workspace";

export type HighlightGeometryAdjustment = "left" | "right" | "up" | "down" | "wider" | "narrower" | "taller" | "shorter";

export function adjustSelectionRects(
  rects: readonly PdfSelectionRect[],
  adjustment: HighlightGeometryAdjustment,
  step = 0.005,
): PdfSelectionRect[] {
  const amount = Math.max(0.001, Math.min(0.05, step));
  return rects.map((rect) => {
    if (adjustment === "left" || adjustment === "right") {
      return { ...rect, x: round(clamp(rect.x + (adjustment === "left" ? -amount : amount), 0, 1 - rect.width)) };
    }
    if (adjustment === "up" || adjustment === "down") {
      return { ...rect, y: round(clamp(rect.y + (adjustment === "up" ? -amount : amount), 0, 1 - rect.height)) };
    }
    if (adjustment === "wider" || adjustment === "narrower") {
      const width = round(clamp(rect.width + (adjustment === "wider" ? amount : -amount), 0.005, 1 - rect.x));
      return { ...rect, width };
    }
    const height = round(clamp(rect.height + (adjustment === "taller" ? amount : -amount), 0.005, 1 - rect.y));
    return { ...rect, height };
  });
}

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TextQuoteContext {
  quote: string;
  prefix: string;
  suffix: string;
}

export function normalizeSelectionRects(rects: Iterable<RectLike>, page: RectLike, maximumRects = 64): PdfSelectionRect[] {
  const pageWidth = page.right - page.left;
  const pageHeight = page.bottom - page.top;
  if (pageWidth <= 0 || pageHeight <= 0) return [];

  const clipped: RectLike[] = [];
  for (const rect of rects) {
    const left = clamp(rect.left, page.left, page.right);
    const top = clamp(rect.top, page.top, page.bottom);
    const right = clamp(rect.right, page.left, page.right);
    const bottom = clamp(rect.bottom, page.top, page.bottom);
    if (right <= left || bottom <= top) continue;
    clipped.push({ left, top, right, bottom });
  }

  return mergeLineRects(clipped)
    .slice(0, clamp(Math.floor(maximumRects), 1, 512))
    .map(
      (rect) =>
        ({
          x: round((rect.left - page.left) / pageWidth),
          y: round((rect.top - page.top) / pageHeight),
          width: round((rect.right - rect.left) / pageWidth),
          height: round((rect.bottom - rect.top) / pageHeight),
        }) satisfies PdfSelectionRect,
    );
}

function mergeLineRects(rects: readonly RectLike[]): RectLike[] {
  const lines: RectLike[] = [];
  const ordered = [...rects].sort((left, right) => left.top - right.top || left.left - right.left);
  for (const rect of ordered) {
    const match = lines.find((line) => belongsToSameLine(line, rect));
    if (!match) {
      lines.push({ ...rect });
      continue;
    }
    match.left = Math.min(match.left, rect.left);
    match.top = Math.min(match.top, rect.top);
    match.right = Math.max(match.right, rect.right);
    match.bottom = Math.max(match.bottom, rect.bottom);
  }
  return lines.sort((left, right) => left.top - right.top || left.left - right.left);
}

function belongsToSameLine(left: RectLike, right: RectLike): boolean {
  const overlap = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
  const minimumHeight = Math.min(left.bottom - left.top, right.bottom - right.top);
  if (overlap < minimumHeight * 0.5) return false;
  const gap = Math.max(left.left, right.left) - Math.min(left.right, right.right);
  return gap <= Math.max(2, minimumHeight * 1.5);
}

export function deriveTextQuoteContext(pageText: string, selectedText: string, contextLength = 160): TextQuoteContext {
  const text = normalizeWhitespace(pageText);
  const quote = normalizeWhitespace(selectedText);
  const index = text.indexOf(quote);
  if (!quote || index < 0) return { quote, prefix: "", suffix: "" };
  return {
    quote,
    prefix: text.slice(Math.max(0, index - contextLength), index),
    suffix: text.slice(index + quote.length, index + quote.length + contextLength),
  };
}

function normalizeWhitespace(value: string): string {
  return value.replaceAll(/\s+/gu, " ").trim();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
