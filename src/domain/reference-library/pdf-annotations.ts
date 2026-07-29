import { isRecord } from "../unknown-value";

export interface LibraryHighlight {
  readonly id: string;
  readonly referenceId: string;
  readonly artifactId: string;
  readonly page: number;
  readonly quote: string;
  readonly comment: string;
  readonly rects: readonly LibraryPdfRect[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LibraryHighlightImportCandidate {
  readonly page: number;
  readonly quote: string;
  readonly comment: string;
  readonly rects: readonly LibraryPdfRect[];
}

export interface LibraryPdfPoint {
  readonly x: number;
  readonly y: number;
}

export interface LibraryPdfRect extends LibraryPdfPoint {
  readonly width: number;
  readonly height: number;
}

interface LibraryPdfMarkupBase {
  readonly id: string;
  readonly referenceId: string;
  readonly artifactId: string;
  readonly page: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LibraryPdfNote extends LibraryPdfMarkupBase {
  readonly kind: "note";
  readonly x: number;
  readonly y: number;
  readonly body: string;
}

export interface LibraryPdfDrawing extends LibraryPdfMarkupBase {
  readonly kind: "drawing";
  readonly color: string;
  readonly width: number;
  readonly points: readonly LibraryPdfPoint[];
}

export type LibraryPdfMarkup = LibraryPdfNote | LibraryPdfDrawing;

export function libraryPdfRectsOverlap(left: readonly LibraryPdfRect[], right: readonly LibraryPdfRect[]): boolean {
  return left.some((leftRect) => right.some((rightRect) => pdfRectsOverlap(leftRect, rightRect)));
}

export function mergeLibraryPdfRects(left: readonly LibraryPdfRect[], right: readonly LibraryPdfRect[]): readonly LibraryPdfRect[] {
  const merged = left.map((rect) => ({ ...rect }));
  for (const candidate of right) {
    let union = { ...candidate };
    let index = 0;
    while (index < merged.length) {
      const current = merged[index]!;
      if (!pdfRectsOverlap(union, current)) {
        index += 1;
        continue;
      }
      const x = Math.min(union.x, current.x);
      const y = Math.min(union.y, current.y);
      union = {
        x: roundPdfCoordinate(x),
        y: roundPdfCoordinate(y),
        width: roundPdfCoordinate(Math.max(union.x + union.width, current.x + current.width) - x),
        height: roundPdfCoordinate(Math.max(union.y + union.height, current.y + current.height) - y),
      };
      merged.splice(index, 1);
      index = 0;
    }
    merged.push(union);
  }
  return merged.sort((first, second) => first.y - second.y || first.x - second.x);
}

export function mergeLibraryHighlightQuote(existingValue: string, incomingValue: string): string {
  const existing = existingValue.trim();
  const incoming = incomingValue.trim();
  if (existing.includes(incoming)) return existing;
  if (incoming.includes(existing)) return incoming;
  const existingThenIncoming = overlappingTextLength(existing, incoming);
  const incomingThenExisting = overlappingTextLength(incoming, existing);
  if (existingThenIncoming >= incomingThenExisting && existingThenIncoming > 0) {
    return `${existing}${incoming.slice(existingThenIncoming)}`;
  }
  if (incomingThenExisting > 0) return `${incoming}${existing.slice(incomingThenExisting)}`;
  return `${existing} ${incoming}`;
}

export function isLibraryHighlight(value: unknown): value is LibraryHighlight {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.referenceId === "string" &&
    typeof value.artifactId === "string" &&
    typeof value.page === "number" &&
    Number.isInteger(value.page) &&
    value.page > 0 &&
    typeof value.quote === "string" &&
    typeof value.comment === "string" &&
    Array.isArray(value.rects) &&
    value.rects.every(isLibraryPdfRect) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function isLibraryHighlightImportCandidate(value: unknown): value is LibraryHighlightImportCandidate {
  return (
    isRecord(value) &&
    typeof value.page === "number" &&
    Number.isInteger(value.page) &&
    value.page > 0 &&
    typeof value.quote === "string" &&
    value.quote.length > 0 &&
    value.quote.length <= 20_000 &&
    typeof value.comment === "string" &&
    value.comment.length <= 8_000 &&
    Array.isArray(value.rects) &&
    value.rects.length > 0 &&
    value.rects.length <= 512 &&
    value.rects.every(isLibraryPdfRect)
  );
}

function isLibraryPdfRect(value: unknown): value is LibraryPdfRect {
  return (
    isRecord(value) &&
    normalizedCoordinate(value.x) &&
    normalizedCoordinate(value.y) &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    value.width > 0 &&
    value.height > 0 &&
    value.x + value.width <= 1.000_001 &&
    value.y + value.height <= 1.000_001
  );
}

export function isLibraryPdfMarkup(value: unknown): value is LibraryPdfMarkup {
  if (!hasLibraryPdfMarkupBase(value)) return false;
  return value.kind === "note" ? isLibraryPdfNote(value) : isLibraryPdfDrawing(value);
}

function hasLibraryPdfMarkupBase(value: unknown): value is Record<string, unknown> & LibraryPdfMarkupBase {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.referenceId === "string" &&
    typeof value.artifactId === "string" &&
    typeof value.page === "number" &&
    Number.isInteger(value.page) &&
    value.page >= 1 &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isLibraryPdfNote(value: Record<string, unknown> & LibraryPdfMarkupBase): boolean {
  return normalizedCoordinate(value.x) && normalizedCoordinate(value.y) && typeof value.body === "string" && value.body.length <= 8_000;
}

function isLibraryPdfDrawing(value: Record<string, unknown> & LibraryPdfMarkupBase): boolean {
  return (
    value.kind === "drawing" &&
    typeof value.color === "string" &&
    /^#[0-9a-f]{6}$/iu.test(value.color) &&
    typeof value.width === "number" &&
    Number.isFinite(value.width) &&
    value.width >= 1 &&
    value.width <= 24 &&
    Array.isArray(value.points) &&
    value.points.length >= 2 &&
    value.points.length <= 2_048 &&
    value.points.every((point) => isRecord(point) && normalizedCoordinate(point.x) && normalizedCoordinate(point.y))
  );
}

function pdfRectsOverlap(left: LibraryPdfRect, right: LibraryPdfRect): boolean {
  return (
    left.x < right.x + right.width && right.x < left.x + left.width && left.y < right.y + right.height && right.y < left.y + left.height
  );
}

function roundPdfCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function overlappingTextLength(first: string, second: string): number {
  const maximum = Math.min(first.length, second.length);
  for (let length = maximum; length > 0; length -= 1) {
    if (first.endsWith(second.slice(0, length))) return length;
  }
  return 0;
}

function normalizedCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
