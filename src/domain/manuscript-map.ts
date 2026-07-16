import { projectMarkdownComments } from "./markdown-comments";

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

const headingPattern = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+\{#[^}]+\})?[ \t]*$/u;
const citationPattern = /(?<!:):cite\[[^\]]+\](?:\{[^}]*\})?/giu;
const placeholderPattern = /\b(?:TODO|TBD|FIXME)\b|\?\?\?/giu;
const wordPattern = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;

export function buildManuscriptMap(source: string): ManuscriptMap {
  const normalized = source.replaceAll("\r\n", "\n");
  const visible = maskNonProse(projectMarkdownComments(normalized).masked);
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

  for (const paragraph of proseParagraphs(visible)) {
    const words = wordCount(paragraph.text);
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

function maskNonProse(source: string): string {
  const characters = source.split("");
  const lines = linesWithOffsets(source);
  let fenced = false;
  let frontmatter = lines[0]?.text.trim() === "---";
  for (const [index, line] of lines.entries()) {
    const trimmed = line.text.trim();
    const fence = /^(?:```|~~~)/u.test(trimmed);
    if (fenced || fence || (frontmatter && index > 0)) maskRange(characters, line.from, line.to);
    if (fence) fenced = !fenced;
    if (frontmatter && index > 0 && trimmed === "---") frontmatter = false;
  }
  return characters.join("");
}

function proseParagraphs(source: string): Array<{ text: string; from: number; to: number }> {
  const paragraphs: Array<{ text: string; from: number; to: number }> = [];
  for (const match of source.matchAll(/(?:^|\n)([^\n].*?(?=\n{2,}|$))/gsu)) {
    const raw = match[1];
    if (!raw) continue;
    const from = match.index + (match[0].startsWith("\n") ? 1 : 0);
    const text = raw.trim();
    if (!text || /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|::|\|)/u.test(text)) continue;
    paragraphs.push({ text, from, to: from + raw.length });
  }
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
  let from = 0;
  for (const text of source.split("\n")) {
    lines.push({ text, from, to: from + text.length });
    from += text.length + 1;
  }
  return lines;
}
