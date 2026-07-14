export type MarkdownHighlightKind =
  | "code"
  | "directive"
  | "frontmatter"
  | "heading"
  | "heading-marker"
  | "link"
  | "list-marker"
  | "markup"
  | "metadata-key"
  | "quote-marker";

export interface MarkdownHighlightSegment {
  readonly text: string;
  readonly kind: MarkdownHighlightKind | null;
}

interface HighlightRange {
  readonly from: number;
  readonly to: number;
  readonly kind: MarkdownHighlightKind;
}

const inlineSyntax =
  /`[^`\r\n]+`|!?\[[^\]\r\n]*\]\([^)\r\n]*\)|:(?:cite|ref)\[[^\]\r\n]*\]|\[\^[^\]\r\n]+\]|\{#[a-zA-Z0-9:_-]+\}|\*\*[^*\r\n]+\*\*|__[^_\r\n]+__|\*[^*\r\n]+\*|_[^_\r\n]+_/gu;

export function highlightMarkdown(source: string): readonly MarkdownHighlightSegment[] {
  const segments: MarkdownHighlightSegment[] = [];
  let offset = 0;
  let inFrontmatter = false;
  let inFence = false;

  for (const match of source.matchAll(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/gu)) {
    const line = match[0];
    const content = line.replace(/(?:\r\n|\r|\n)$/u, "");
    const newline = line.slice(content.length);
    const ranges: HighlightRange[] = [];

    if (offset === 0 && content.trim() === "---") {
      inFrontmatter = true;
      ranges.push({ from: 0, to: content.length, kind: "frontmatter" });
    } else if (inFrontmatter) {
      if (content.trim() === "---") {
        ranges.push({ from: 0, to: content.length, kind: "frontmatter" });
        inFrontmatter = false;
      } else {
        const key = /^\s*([a-zA-Z][a-zA-Z0-9_-]*)(?=:)/u.exec(content);
        if (key?.[1]) ranges.push({ from: key.index, to: key.index + key[0].length, kind: "metadata-key" });
      }
    } else {
      const fence = /^\s*(?:`{3,}|~{3,})/u.exec(content);
      if (fence) {
        ranges.push({ from: 0, to: content.length, kind: "code" });
        inFence = !inFence;
      } else if (inFence) {
        ranges.push({ from: 0, to: content.length, kind: "code" });
      } else {
        ranges.push(...lineRanges(content));
      }
    }

    appendSegments(segments, content, ranges);
    if (newline) segments.push({ text: newline, kind: null });
    offset += line.length;
  }

  return segments;
}

function lineRanges(line: string): readonly HighlightRange[] {
  const heading = /^(\s*)(#{1,6})([ \t]+)(.*)$/u.exec(line);
  if (heading) {
    const markerFrom = heading[1]?.length ?? 0;
    const markerTo = markerFrom + (heading[2]?.length ?? 0);
    return [
      { from: markerFrom, to: markerTo, kind: "heading-marker" },
      { from: markerTo, to: line.length, kind: "heading" },
    ];
  }

  const ranges: HighlightRange[] = [];
  const directive = /^(\s*)(::[a-z][a-z-]*)(?:\[[^\]\r\n]*\])?/iu.exec(line);
  const quote = /^(\s*)(>+)([ \t]*)/u.exec(line);
  const list = /^(\s*)((?:[-+*])|(?:\d+[.)]))([ \t]+)/u.exec(line);
  const prefix = directive ?? quote ?? list;
  if (prefix) {
    const from = prefix[1]?.length ?? 0;
    const to = prefix[0].length;
    ranges.push({
      from,
      to,
      kind: directive ? "directive" : quote ? "quote-marker" : "list-marker",
    });
  }

  for (const match of line.matchAll(inlineSyntax)) {
    const text = match[0];
    const from = match.index;
    if (ranges.some((range) => from < range.to && from + text.length > range.from)) continue;
    ranges.push({ from, to: from + text.length, kind: inlineKind(text) });
  }
  return ranges.sort((left, right) => left.from - right.from);
}

function inlineKind(value: string): MarkdownHighlightKind {
  if (value.startsWith("`")) return "code";
  if (value.startsWith(":") || value.startsWith("[^")) return "directive";
  if (value.startsWith("[") || value.startsWith("![")) return "link";
  return "markup";
}

function appendSegments(target: MarkdownHighlightSegment[], line: string, ranges: readonly HighlightRange[]): void {
  let cursor = 0;
  for (const range of ranges) {
    if (range.from > cursor) target.push({ text: line.slice(cursor, range.from), kind: null });
    if (range.to > range.from) target.push({ text: line.slice(range.from, range.to), kind: range.kind });
    cursor = Math.max(cursor, range.to);
  }
  if (cursor < line.length) target.push({ text: line.slice(cursor), kind: null });
}
