import type { LatexArchiveInspection } from "./latex-archive";
import { LatexConversionError } from "./latex-contracts";
import { maskedLatex, semanticLatexSource, structuralLatexSource } from "./latex-source";
import type { LatexConversionSelection } from "./latex-renderer";

export function assertLatexSemanticRecordLimit(
  inspection: LatexArchiveInspection,
  selection: LatexConversionSelection,
  maximumRecords: number,
): void {
  const root = inspection.files.find((file) => file.path === selection.rootPath && file.kind === "tex" && file.text !== undefined);
  if (!root) return;
  const reachable = new Set<string>();
  visit(selection.rootPath);
  let count = inspection.includes.length + inspection.bibliographies.length + inspection.diagnostics.length;
  assertWithinLimit();

  for (const path of reachable) {
    const source = inspection.files.find((file) => file.path === path)?.text ?? "";
    const semantic = semanticLatexSource(source);
    const window = { start: 0, end: source.length };
    countMatches(semantic, window, /\\[A-Za-z@]+|\\\[/gu);
    countCitationSeparators(semantic, window);
  }

  const bibliographyPaths = new Set<string>();
  if (selection.bibliographyPath) bibliographyPaths.add(selection.bibliographyPath);
  for (const reference of inspection.bibliographies) {
    if (reachable.has(reference.sourcePath) && reference.resolvedPath) bibliographyPaths.add(reference.resolvedPath);
  }
  for (const path of bibliographyPaths) {
    const source = inspection.files.find((file) => file.path === path && file.kind === "bibtex")?.text;
    if (source !== undefined) countMatches(maskedLatex(source), { start: 0, end: source.length }, /@[a-z]+\s*[({]/giu);
  }

  function visit(path: string): void {
    if (reachable.has(path)) return;
    reachable.add(path);
    const source = inspection.files.find((file) => file.path === path)?.text ?? "";
    const window = path === selection.rootPath ? documentWindow(source) : { start: 0, end: source.length };
    for (const reference of inspection.includes) {
      if (reference.sourcePath === path && reference.resolvedPath && reference.from >= window.start && reference.to <= window.end) {
        visit(reference.resolvedPath);
      }
    }
  }

  function countMatches(source: string, window: { readonly start: number; readonly end: number }, pattern: RegExp): void {
    pattern.lastIndex = window.start;
    while (true) {
      const match = pattern.exec(source);
      if (!match || match.index >= window.end) return;
      count += 1;
      assertWithinLimit();
    }
  }

  function countCitationSeparators(source: string, window: { readonly start: number; readonly end: number }): void {
    const pattern = /\\(?:citet|citep|cite)(?![A-Za-z])/gu;
    pattern.lastIndex = window.start;
    while (true) {
      const match = pattern.exec(source);
      if (!match || match.index >= window.end) return;
      const argument = citationArgument(source, match.index + match[0].length);
      if (argument.kind === "malformed") return;
      if (argument.kind === "absent") {
        pattern.lastIndex = Math.max(pattern.lastIndex, argument.next);
        continue;
      }
      const close = matchingBrace(source, argument.open, window.end);
      if (close < 0) return;
      for (let index = argument.open + 1; index < close; index += 1) {
        if (source[index] !== ",") continue;
        count += 1;
        assertWithinLimit();
      }
      pattern.lastIndex = close + 1;
    }
  }

  function assertWithinLimit(): void {
    if (count <= maximumRecords) return;
    throw new LatexConversionError("semantic-record-limit", `LaTeX conversion exceeds the semantic record limit of ${maximumRecords}`);
  }
}

type CitationArgument =
  { readonly kind: "open"; readonly open: number } | { readonly kind: "absent"; readonly next: number } | { readonly kind: "malformed" };

function citationArgument(source: string, from: number): CitationArgument {
  let cursor = skipWhitespace(source, from);
  while (source[cursor] === "[") {
    const close = source.indexOf("]", cursor + 1);
    if (close < 0) return { kind: "malformed" };
    cursor = skipWhitespace(source, close + 1);
  }
  return source[cursor] === "{" ? { kind: "open", open: cursor } : { kind: "absent", next: cursor };
}

function skipWhitespace(source: string, from: number): number {
  let cursor = from;
  while (cursor < source.length && /\s/u.test(source[cursor]!)) cursor += 1;
  return cursor;
}

function matchingBrace(source: string, open: number, end: number): number {
  let depth = 0;
  for (let index = open; index < end; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function documentWindow(source: string): { readonly start: number; readonly end: number } {
  const active = structuralLatexSource(source);
  const begin = /\\begin\s*\{document\}/u.exec(active);
  if (!begin) return { start: 0, end: source.length };
  const start = begin.index + begin[0].length;
  const end = /\\end\s*\{document\}/u.exec(active.slice(start));
  return { start, end: end ? start + end.index : source.length };
}
