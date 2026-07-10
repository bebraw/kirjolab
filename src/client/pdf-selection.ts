import type { PdfSelectionRect } from "../domain/workspace";

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

export function normalizeSelectionRects(rects: Iterable<RectLike>, page: RectLike): PdfSelectionRect[] {
  const pageWidth = page.right - page.left;
  const pageHeight = page.bottom - page.top;
  if (pageWidth <= 0 || pageHeight <= 0) return [];

  const normalized: PdfSelectionRect[] = [];
  for (const rect of rects) {
    const left = clamp(rect.left, page.left, page.right);
    const top = clamp(rect.top, page.top, page.bottom);
    const right = clamp(rect.right, page.left, page.right);
    const bottom = clamp(rect.bottom, page.top, page.bottom);
    if (right <= left || bottom <= top) continue;
    normalized.push({
      x: round((left - page.left) / pageWidth),
      y: round((top - page.top) / pageHeight),
      width: round((right - left) / pageWidth),
      height: round((bottom - top) / pageHeight),
    });
  }
  return normalized.slice(0, 64);
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
