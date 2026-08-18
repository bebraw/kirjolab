import {
  LatexConversionError,
  latexMaximumRenderedFileCodeUnits,
  latexMaximumRenderedFolderCodeUnits,
  latexMaximumRenderedFolders,
  latexMaximumRenderedProjectCodeUnits,
  latexMaximumRenderedTableCodeUnits,
} from "./latex-contracts.js";

export interface LatexRenderedFolderUsage {
  readonly folders: number;
  readonly codeUnits: number;
}

export function assertLatexRenderedFileCodeUnits(
  path: string,
  codeUnits: number,
  maximumCodeUnits = latexMaximumRenderedFileCodeUnits,
): void {
  if (codeUnits <= maximumCodeUnits) return;
  throw new LatexConversionError("render-limit", `Rendered LaTeX file exceeds ${maximumCodeUnits} UTF-16 code units: ${path}`);
}

export function addLatexRenderedProjectCodeUnits(
  renderedCodeUnits: number,
  addedCodeUnits: number,
  maximumCodeUnits = latexMaximumRenderedProjectCodeUnits,
): number {
  const nextCodeUnits = renderedCodeUnits + addedCodeUnits;
  if (nextCodeUnits <= maximumCodeUnits) return nextCodeUnits;
  throw new LatexConversionError("render-limit", `Rendered LaTeX project exceeds ${maximumCodeUnits} UTF-16 code units`);
}

export function addLatexRenderedTableLine(
  renderedCodeUnits: number,
  lineCodeUnits: number,
  hasPreviousLine: boolean,
  maximumCodeUnits = latexMaximumRenderedTableCodeUnits,
): number {
  const nextCodeUnits = renderedCodeUnits + lineCodeUnits + (hasPreviousLine ? 1 : 0);
  if (nextCodeUnits <= maximumCodeUnits) return nextCodeUnits;
  throw new LatexConversionError("render-limit", `Rendered LaTeX table exceeds ${maximumCodeUnits} UTF-16 code units`);
}

export function addLatexRenderedFolder(
  usage: LatexRenderedFolderUsage,
  folder: string,
  maximumFolders = latexMaximumRenderedFolders,
  maximumCodeUnits = latexMaximumRenderedFolderCodeUnits,
): LatexRenderedFolderUsage {
  const nextUsage = { folders: usage.folders + 1, codeUnits: usage.codeUnits + folder.length };
  if (nextUsage.folders <= maximumFolders && nextUsage.codeUnits <= maximumCodeUnits) return nextUsage;
  throw new LatexConversionError("render-limit", "Converted project exceeds the derived-folder limit");
}
