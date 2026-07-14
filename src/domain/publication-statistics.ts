import type { CompositionSourceSpan, ProjectComposition, ProjectFile } from "./project-files";

export interface PublicationSourceLocation {
  readonly fileId: string;
  readonly path: string;
  readonly from: number;
  readonly to: number;
  readonly line: number;
  readonly includeChain: readonly string[];
}

export interface WordCountByFile {
  readonly fileId: string;
  readonly path: string;
  readonly words: number;
}

export interface WordCountByHeading extends PublicationSourceLocation {
  readonly depth: number;
  readonly heading: string;
  readonly words: number;
}

export interface PublicationWordStatistics {
  readonly countingRule: "kirjolab-prose-v1";
  readonly totalWords: number;
  readonly files: readonly WordCountByFile[];
  readonly headings: readonly WordCountByHeading[];
}

const citationDirective = /:cite\[(?<keys>[^\]\r\n]+)\]/gu;
const headingLine = /^(?<marks>#{1,6})[ \t]+(?<title>.+?)[ \t]*(?:\{#[^}\r\n]+\})?[ \t]*$/u;
const wordPattern = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function publicationWordStatistics(
  composition: Pick<ProjectComposition, "content" | "sourceMap">,
  files: readonly ProjectFile[],
): PublicationWordStatistics {
  const byFile = new Map<string, { path: string; words: number }>();
  for (const span of composition.sourceMap) {
    const words = countPublicationWords(composition.content.slice(span.outputStart, span.outputEnd));
    const current = byFile.get(span.fileId) ?? { path: span.path, words: 0 };
    current.words += words;
    byFile.set(span.fileId, current);
  }
  return {
    countingRule: "kirjolab-prose-v1",
    totalWords: countPublicationWords(composition.content),
    files: [...byFile.entries()]
      .map(([fileId, value]) => ({ fileId, path: value.path, words: value.words }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    headings: headingStatistics(composition, files),
  };
}

export function countPublicationWords(markdown: string): number {
  const prose = markdown
    .replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/u, "")
    .replace(/```[^\r\n]*\r?\n[\s\S]*?```/gu, " ")
    .replace(/`[^`\r\n]*`/gu, " ")
    .replace(/\$\$[\s\S]*?\$\$/gu, " ")
    .replace(/\$[^$\r\n]*\$/gu, " ")
    .replace(citationDirective, " ")
    .replace(/^[ \t]*::bibliography\[\][ \t]*$/gmu, " ")
    .replace(/!\[(?<alt>[^\]]*)\]\([^\s)]+(?:\s+"[^"]*")?\)/gu, " $<alt> ")
    .replace(/\[(?<label>[^\]]+)\]\([^\s)]+(?:\s+"[^"]*")?\)/gu, " $<label> ")
    .replace(/<https?:\/\/[^>]+>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\{#[^}\r\n]+\}/gu, " ");
  return [...prose.matchAll(wordPattern)].length;
}

export function isPublicationWordStatistics(value: unknown): value is PublicationWordStatistics {
  if (!isRecord(value) || value.countingRule !== "kirjolab-prose-v1" || !isNonNegativeInteger(value.totalWords)) return false;
  if (!Array.isArray(value.files) || !Array.isArray(value.headings)) return false;
  return (
    value.files.every(
      (file) => isRecord(file) && typeof file.fileId === "string" && typeof file.path === "string" && isNonNegativeInteger(file.words),
    ) &&
    value.headings.every(
      (heading) =>
        isRecord(heading) &&
        typeof heading.fileId === "string" &&
        typeof heading.path === "string" &&
        isNonNegativeInteger(heading.from) &&
        isNonNegativeInteger(heading.to) &&
        isNonNegativeInteger(heading.line) &&
        isNonNegativeInteger(heading.depth) &&
        typeof heading.heading === "string" &&
        isNonNegativeInteger(heading.words) &&
        Array.isArray(heading.includeChain) &&
        heading.includeChain.every((item) => typeof item === "string"),
    )
  );
}

function headingStatistics(
  composition: Pick<ProjectComposition, "content" | "sourceMap">,
  files: readonly ProjectFile[],
): WordCountByHeading[] {
  const headings: WordCountByHeading[] = [];
  let active: (WordCountByHeading & { body: string }) | undefined;
  for (const { line, offset } of sourceLines(composition.content)) {
    const match = headingLine.exec(line);
    if (match?.groups?.marks && match.groups.title) {
      if (active) headings.push(withoutBody(active));
      active = {
        ...sourceLocationAt(composition.sourceMap, files, offset, line.length),
        depth: match.groups.marks.length,
        heading: match.groups.title.replace(/[*_`~]/gu, "").trim(),
        words: 0,
        body: match.groups.title,
      };
    } else if (active) active.body += `\n${line}`;
  }
  if (active) headings.push(withoutBody(active));
  return headings;
}

function sourceLines(source: string): Array<{ line: string; offset: number }> {
  const lines: Array<{ line: string; offset: number }> = [];
  let offset = 0;
  while (offset <= source.length) {
    const newline = source.indexOf("\n", offset);
    const end = newline < 0 ? source.length : newline;
    const contentEnd = end > offset && source[end - 1] === "\r" ? end - 1 : end;
    lines.push({ line: source.slice(offset, contentEnd), offset });
    if (newline < 0) break;
    offset = newline + 1;
  }
  return lines;
}

function withoutBody(value: WordCountByHeading & { body: string }): WordCountByHeading {
  const { body, ...heading } = value;
  return { ...heading, words: countPublicationWords(body) };
}

function sourceLocationAt(
  sourceMap: readonly CompositionSourceSpan[],
  files: readonly ProjectFile[],
  outputOffset: number,
  length: number,
): PublicationSourceLocation {
  const span =
    sourceMap.find((candidate) => outputOffset >= candidate.outputStart && outputOffset < candidate.outputEnd) ?? sourceMap.at(-1);
  if (!span) return { fileId: "", path: "main.md", from: 0, to: 0, line: 1, includeChain: [] };
  const within = Math.max(0, Math.min(outputOffset - span.outputStart, span.sourceEnd - span.sourceStart));
  const from = span.sourceStart + within;
  const file = files.find((candidate) => candidate.id === span.fileId);
  return {
    fileId: span.fileId,
    path: span.path,
    from,
    to: Math.min(span.sourceEnd, from + length),
    line: (file?.content ?? "").slice(0, from).split(/\r?\n/u).length,
    includeChain: [...span.includeChain],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
