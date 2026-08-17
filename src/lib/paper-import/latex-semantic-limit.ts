import type { LatexArchiveInspection } from "./latex-archive";
import { LatexConversionError } from "./latex-contracts";
import { latexCommandArgument, matchingLatexBrace } from "./latex-render-helpers";
import { latexDocumentWindow, maskedLatex, semanticLatexSource } from "./latex-source";
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
    const window = path === selection.rootPath ? latexDocumentWindow(source) : { start: 0, end: source.length };
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
      const argument = latexCommandArgument(source, match.index + match[0].length);
      if (argument.kind === "malformed") return;
      if (argument.kind === "absent") {
        pattern.lastIndex = Math.max(pattern.lastIndex, argument.next);
        continue;
      }
      const close = matchingLatexBrace(source, argument.open, window.end);
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
