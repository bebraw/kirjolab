import { isPublicationReferenceDeclaration, projectMarkdownComments } from "scholarmark";

export interface ManuscriptSection {
  readonly level: number;
  readonly title: string;
  readonly from: number;
  readonly to: number;
  readonly words: number;
  readonly citations: number;
}

export interface ManuscriptCue {
  readonly kind: "heading-jump" | "orphan-paragraph" | "placeholder";
  readonly message: string;
  readonly from: number;
  readonly to: number;
}

export interface ManuscriptMap {
  readonly words: number;
  readonly citations: number;
  readonly sections: readonly ManuscriptSection[];
  readonly cues: readonly ManuscriptCue[];
}

export interface ManuscriptParagraph {
  readonly text: string;
  readonly from: number;
  readonly to: number;
  readonly words: number;
  readonly citations: number;
}

export interface ManuscriptOutlineParagraph extends ManuscriptParagraph {
  readonly kind: "paragraph";
}

export interface ManuscriptOutlineSection extends ManuscriptSection {
  readonly kind: "section";
  /** End of the heading line, excluding its newline. `to` remains the next heading's start. */
  readonly headingTo: number;
  /** Subtree includes descendant sections; words exclude heading titles. */
  readonly subtreeTo: number;
  readonly subtreeWords: number;
  readonly subtreeCitations: number;
  readonly children: readonly ManuscriptOutlineItem[];
}

export type ManuscriptOutlineItem = ManuscriptOutlineSection | ManuscriptOutlineParagraph;

export interface ManuscriptOutline {
  readonly items: readonly ManuscriptOutlineItem[];
  readonly sections: readonly ManuscriptOutlineSection[];
  readonly paragraphs: readonly ManuscriptOutlineParagraph[];
}

interface OutlineBranch extends ManuscriptOutlineSection {
  subtreeTo: number;
  subtreeWords: number;
  subtreeCitations: number;
  children: ManuscriptOutlineItem[];
}

interface CodeFence {
  readonly marker: string;
  readonly length: number;
}

const headingPattern = /^(#{1,6})[ \t]+(.+?)[ \t]*$/u;
const citationPattern = /(?<!:):cite\[[^\]]+\](?:\{[^}]*\})?/giu;
const placeholderPattern = /\b(?:TODO|TBD|FIXME)\b|\?\?\?/giu;
const wordPattern = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;

export function buildManuscriptMap(source: string): ManuscriptMap {
  const visible = maskNonProse(projectMarkdownComments(source).masked);
  const headings: Array<{ level: number; title: string; from: number; lineEnd: number }> = [];
  const cues: ManuscriptCue[] = [];
  let previousHeadingLevel: number | null = null;

  for (const line of linesWithOffsets(visible)) {
    const heading = headingPattern.exec(line.text);
    if (!heading?.[1] || !heading[2]) continue;
    const level = heading[1].length;
    const title = heading[2].trim();
    headings.push({ level, title, from: line.from, lineEnd: line.to });
    if (previousHeadingLevel !== null && level > previousHeadingLevel + 1) {
      cues.push({
        kind: "heading-jump",
        message: `Heading jumps from level ${previousHeadingLevel} to ${level}`,
        from: line.from,
        to: line.to,
      });
    }
    previousHeadingLevel = level;
  }

  for (const match of visible.matchAll(placeholderPattern)) {
    const from = match.index;
    cues.push({ kind: "placeholder", message: `Resolve placeholder “${match[0]}”`, from, to: from + match[0].length });
  }

  for (const paragraph of manuscriptParagraphs(visible)) {
    const words = paragraph.words;
    const sentences = paragraph.text.match(/[.!?](?:["')\]]+)?(?=\s|$)/gu)?.length ?? 0;
    if (words >= 5 && sentences <= 1) {
      cues.push({ kind: "orphan-paragraph", message: "Review this single-sentence paragraph", from: paragraph.from, to: paragraph.to });
    }
  }

  const sections = headings.map((heading, index) => {
    const to = headings[index + 1]?.from ?? visible.length;
    const content = visible.slice(heading.lineEnd, to);
    return {
      level: heading.level,
      title: heading.title,
      from: heading.from,
      to,
      words: wordCount(content),
      citations: citationCount(content),
    };
  });

  return {
    words: wordCount(visible),
    citations: citationCount(visible),
    sections,
    cues: cues.sort((left, right) => left.from - right.from || left.to - right.to),
  };
}

export function manuscriptParagraphs(source: string): readonly ManuscriptParagraph[] {
  return proseParagraphs(maskNonProse(projectMarkdownComments(source).masked)).map((paragraph) => ({
    ...paragraph,
    words: wordCount(paragraph.text),
    citations: citationCount(paragraph.text),
  }));
}

export function buildManuscriptOutline(source: string): ManuscriptOutline {
  const visible = maskNonProse(projectMarkdownComments(source).masked);
  const headings = linesWithOffsets(visible).flatMap((line) => {
    const heading = headingPattern.exec(line.text);
    return heading?.[1] && heading[2] ? [{ level: heading[1].length, title: heading[2].trim(), from: line.from, headingTo: line.to }] : [];
  });
  const sections: OutlineBranch[] = headings.map((heading, index) => {
    const to = headings[index + 1]?.from ?? source.length;
    const content = visible.slice(heading.headingTo, to);
    const words = wordCount(content);
    const citations = citationCount(content);
    return {
      ...heading,
      kind: "section",
      to,
      words,
      citations,
      subtreeTo: source.length,
      subtreeWords: words,
      subtreeCitations: citations,
      children: [],
    };
  });
  const paragraphs: ManuscriptOutlineParagraph[] = manuscriptParagraphs(source).map((paragraph) => ({ ...paragraph, kind: "paragraph" }));
  const items = nestOutlineItems(sections, paragraphs);
  for (const section of [...sections].reverse()) {
    for (const child of section.children) {
      if (child.kind !== "section") continue;
      section.subtreeWords += child.subtreeWords;
      section.subtreeCitations += child.subtreeCitations;
    }
  }
  return { items, sections, paragraphs };
}

function nestOutlineItems(sections: readonly OutlineBranch[], paragraphs: readonly ManuscriptOutlineParagraph[]): ManuscriptOutlineItem[] {
  const items: ManuscriptOutlineItem[] = [];
  const ancestors: OutlineBranch[] = [];
  const ordered: Array<OutlineBranch | ManuscriptOutlineParagraph> = [...sections, ...paragraphs].sort(
    (left, right) => left.from - right.from,
  );
  for (const item of ordered) {
    if (item.kind === "section") {
      while (ancestors.length && ancestors[ancestors.length - 1]!.level >= item.level) {
        ancestors.pop()!.subtreeTo = item.from;
      }
    }
    (ancestors[ancestors.length - 1]?.children ?? items).push(item);
    if (item.kind === "section") ancestors.push(item);
  }
  return items;
}

function maskNonProse(source: string): string {
  const characters = source.split("");
  const lines = linesWithOffsets(source);
  let fenced: CodeFence | null = null;
  const firstLine = lines[0]?.text.trim();
  let frontmatter = firstLine === "---" || firstLine === "+++" ? firstLine : null;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.text.trim();
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line.text);
    if (fenced || fence || frontmatter || isPublicationReferenceDeclaration(line.text)) {
      maskRange(characters, line.from, line.to);
    }
    if (!frontmatter) fenced = nextCodeFence(fenced, fence);
    if (frontmatter && index > 0 && trimmed === frontmatter) frontmatter = null;
  }
  return characters.join("");
}

function nextCodeFence(current: CodeFence | null, match: RegExpExecArray | null): CodeFence | null {
  const markers = match?.[1];
  if (!markers) return current;
  if (!current) return { marker: markers[0]!, length: markers.length };
  const closes = markers[0] === current.marker && markers.length >= current.length && !match?.[2]?.trim();
  return closes ? null : current;
}

function proseParagraphs(source: string): Array<{ text: string; from: number; to: number }> {
  const paragraphs: Array<{ text: string; from: number; to: number }> = [];
  let start: number | null = null;
  let end = 0;
  let excluded = false;
  const flush = (): void => {
    if (start === null) return;
    const raw = source.slice(start, end);
    const text = raw.trim();
    const from = start + raw.length - raw.trimStart().length;
    paragraphs.push({ text, from, to: from + text.length });
    start = null;
  };
  const lines = linesWithOffsets(source);
  for (const [index, line] of lines.entries()) {
    if (!line.text.trim() || headingPattern.test(line.text)) {
      flush();
      excluded = false;
    } else if (
      /^(?: {0,3}(?:[-*+]\s|\d+[.)]\s|>|::|\|)| {4}|\t)/u.test(line.text) ||
      /^(?:[-*_][ \t]*){3,}$/u.test(line.text.trim()) ||
      (line.text.includes("|") && /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/u.test(lines[index + 1]?.text ?? ""))
    ) {
      flush();
      excluded = true;
    } else if (!excluded) {
      start ??= line.from;
      end = line.to;
    }
  }
  flush();
  return paragraphs;
}

function citationCount(source: string): number {
  return [...source.matchAll(citationPattern)].length;
}
function wordCount(source: string): number {
  return source.match(wordPattern)?.length ?? 0;
}
function maskRange(characters: string[], from: number, to: number): void {
  for (let index = from; index < to; index += 1) if (characters[index] !== "\n") characters[index] = " ";
}
function linesWithOffsets(source: string): Array<{ text: string; from: number; to: number }> {
  const lines: Array<{ text: string; from: number; to: number }> = [];
  for (const match of source.matchAll(/([^\r\n]*)(?:\r\n|\r|\n|$)/gu)) {
    const text = match[1] ?? "";
    lines.push({ text, from: match.index, to: match.index + text.length });
  }
  return lines;
}
