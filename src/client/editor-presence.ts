import { highlightMarkdown, type MarkdownHighlightKind } from "./markdown-highlighting";

export interface EditorPresenceRange {
  readonly collaboratorId: string;
  readonly start: number;
  readonly end: number;
  readonly local?: boolean;
}

export type EditorPresenceColor = number | "local";

export interface EditorPresenceSegment {
  readonly text: string;
  readonly kind: MarkdownHighlightKind | null;
  readonly selectionColor: EditorPresenceColor | null;
  readonly caretColors: readonly EditorPresenceColor[];
}

const presenceColorCount = 4;

export function editorPresenceSegments(source: string, ranges: readonly EditorPresenceRange[]): readonly EditorPresenceSegment[] {
  const highlights = highlightMarkdown(source);
  const boundedRanges = ranges.map((range) => ({
    ...range,
    start: Math.min(range.start, source.length),
    end: Math.min(range.end, source.length),
    color: presenceColor(range),
  }));
  const boundaries = new Set([0, source.length]);
  let offset = 0;
  for (const highlight of highlights) {
    offset += highlight.text.length;
    boundaries.add(offset);
  }
  for (const range of boundedRanges) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }

  const orderedBoundaries = [...boundaries].sort((left, right) => left - right);
  const segments: EditorPresenceSegment[] = [];
  let highlightIndex = 0;
  let highlightEnd = highlights[0]?.text.length ?? 0;
  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const start = orderedBoundaries[index]!;
    const end = orderedBoundaries[index + 1]!;
    while (start >= highlightEnd && highlightIndex < highlights.length - 1) {
      highlightIndex += 1;
      highlightEnd += highlights[highlightIndex]!.text.length;
    }
    const selection = boundedRanges.find((range) => range.start < end && range.end > start);
    segments.push({
      text: source.slice(start, end),
      kind: highlights[highlightIndex]?.kind ?? null,
      selectionColor: selection?.color ?? null,
      caretColors: caretColorsAt(boundedRanges, start),
    });
  }

  const endCarets = caretColorsAt(boundedRanges, source.length);
  if (source.length === 0 || endCarets.length > 0) {
    segments.push({ text: "", kind: null, selectionColor: null, caretColors: endCarets });
  }
  return segments;
}

function collaboratorColor(collaboratorId: string): number {
  let hash = 0;
  for (const character of collaboratorId) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return hash % presenceColorCount;
}

function presenceColor(range: EditorPresenceRange): EditorPresenceColor {
  return range.local ? "local" : collaboratorColor(range.collaboratorId);
}

function caretColorsAt(
  ranges: readonly (EditorPresenceRange & { readonly color: EditorPresenceColor })[],
  offset: number,
): readonly EditorPresenceColor[] {
  return ranges.filter((range) => range.start === offset && range.end === offset).map((range) => range.color);
}
