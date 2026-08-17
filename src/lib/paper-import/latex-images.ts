import { latexArchiveMaximumPathCodeUnits, type LatexArchiveInspection, type LatexIncludeReference } from "./latex-archive";
import { LatexConversionError } from "./latex-contracts";
import { comparePortableText, resolvePortablePath } from "./portable-path";
import { balancedLatexGroupEnd, imageLatexSource, latexDocumentWindow } from "./latex-source";

export const latexImageMaximumCandidateProbes = 100_000;
export const latexImageMaximumRequestedPathCodeUnits = latexArchiveMaximumPathCodeUnits;
export const latexImageMaximumSearchFolders = 256;
export const latexImageMaximumSearchFolderCodeUnits = 64 * 1_024;

export interface LatexImageReferenceResolution {
  readonly sourcePath: string;
  readonly requestedPath: string;
  readonly start: number;
  readonly end: number;
  readonly candidates: readonly string[];
}

interface SourceWindow {
  readonly start: number;
  readonly end: number;
}

interface GraphicPathOccurrence {
  readonly start: number;
  readonly end: number;
  readonly folders: readonly string[];
}

interface ImageOccurrence {
  readonly start: number;
  readonly end: number;
  readonly requestedPath: string;
}

interface DelimitedGroup {
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly end: number;
}

interface ImageResolutionBudget {
  candidateProbes: number;
  searchFolders: number;
  searchFolderCodeUnits: number;
}

type SourceEvent =
  | { readonly kind: "graphic-path"; readonly position: number; readonly occurrence: GraphicPathOccurrence }
  | { readonly kind: "image"; readonly position: number; readonly occurrence: ImageOccurrence }
  | { readonly kind: "include"; readonly position: number; readonly reference: LatexIncludeReference };

export function resolveLatexImageReferences(
  inspection: LatexArchiveInspection,
  rootPath: string,
  sourcePaths: readonly string[],
): readonly LatexImageReferenceResolution[] {
  const reachable = new Set(sourcePaths);
  const imagePaths = new Set(inspection.files.filter((file) => file.kind === "image").map((file) => file.path));
  const rootSource = requiredSource(inspection, rootPath);
  const rootWindow = latexDocumentWindow(rootSource);
  const resolutionBudget: ImageResolutionBudget = {
    candidateProbes: 0,
    searchFolders: 0,
    searchFolderCodeUnits: 0,
  };
  let searchFolders: readonly string[] = [];
  for (const occurrence of graphicPathOccurrences(rootSource, { start: 0, end: rootWindow.start }, resolutionBudget)) {
    searchFolders = occurrence.folders;
  }
  const resolutions: LatexImageReferenceResolution[] = [];
  const visited = new Set<string>();
  visit(rootPath);
  return resolutions;

  function visit(sourcePath: string): void {
    if (visited.has(sourcePath) || !reachable.has(sourcePath)) return;
    visited.add(sourcePath);
    const source = requiredSource(inspection, sourcePath);
    const window = sourcePath === rootPath ? latexDocumentWindow(source) : { start: 0, end: source.length };
    const events: SourceEvent[] = [
      ...graphicPathOccurrences(source, window, resolutionBudget).map((occurrence) => ({
        kind: "graphic-path" as const,
        position: occurrence.start,
        occurrence,
      })),
      ...imageOccurrences(source, window).map((occurrence) => ({ kind: "image" as const, position: occurrence.start, occurrence })),
      ...inspection.includes
        .filter(
          (reference) =>
            reference.sourcePath === sourcePath &&
            reference.from >= window.start &&
            reference.to <= window.end &&
            reference.resolvedPath !== null &&
            reachable.has(reference.resolvedPath),
        )
        .map((reference) => ({ kind: "include" as const, position: reference.from, reference })),
    ];
    events.sort((left, right) => left.position - right.position || eventOrder(left.kind) - eventOrder(right.kind));
    for (const event of events) {
      if (event.kind === "graphic-path") {
        searchFolders = event.occurrence.folders;
      } else if (event.kind === "image") {
        resolutions.push({
          sourcePath,
          requestedPath: event.occurrence.requestedPath,
          start: event.occurrence.start,
          end: event.occurrence.end,
          candidates: resolveImageCandidates(sourcePath, event.occurrence.requestedPath, searchFolders, imagePaths, resolutionBudget),
        });
      } else {
        const resolvedPath = event.reference.resolvedPath;
        if (resolvedPath) visit(resolvedPath);
      }
    }
  }
}

function eventOrder(kind: SourceEvent["kind"]): number {
  if (kind === "graphic-path") return 0;
  if (kind === "image") return 1;
  return 2;
}

function graphicPathOccurrences(source: string, window: SourceWindow, resolutionBudget: ImageResolutionBudget): GraphicPathOccurrence[] {
  const active = imageLatexSource(source);
  const occurrences: GraphicPathOccurrence[] = [];
  const command = "\\graphicspath";
  let cursor = window.start;
  while (cursor < window.end) {
    const start = active.indexOf(command, cursor);
    if (start < 0 || start >= window.end) break;
    const outerStart = skipWhitespace(active, start + command.length, window.end);
    if (active[outerStart] !== "{") {
      cursor = Math.max(outerStart, start + command.length);
      continue;
    }
    const outer = delimitedGroup(active, outerStart, "{", "}", window.end);
    if (!outer) break;
    cursor = outer.end;
    const folders = graphicPathFolders(source, active, outer, resolutionBudget);
    if (!folders) continue;
    occurrences.push({ start, end: outer.end, folders });
  }
  return occurrences;
}

function graphicPathFolders(
  source: string,
  active: string,
  outer: DelimitedGroup,
  resolutionBudget: ImageResolutionBudget,
): string[] | null {
  const folders: string[] = [];
  let folderStart = outer.bodyStart;
  while (folderStart < outer.bodyEnd && active[folderStart] === "{") {
    const folder = delimitedGroup(active, folderStart, "{", "}", outer.bodyEnd);
    if (!folder) return null;
    const authoredLength = folder.bodyEnd - folder.bodyStart;
    assertImagePathLength(authoredLength, "search path");
    acceptSearchFolder(resolutionBudget, authoredLength);
    const normalized = source.slice(folder.bodyStart, folder.bodyEnd).trim().replace(/^\.\//u, "").replace(/\/$/u, "");
    if (normalized) folders.push(normalized);
    folderStart = folder.end;
  }
  return folderStart === outer.bodyEnd && folders.length > 0 ? folders : null;
}

function imageOccurrences(source: string, window: SourceWindow): ImageOccurrence[] {
  const active = imageLatexSource(source);
  const occurrences: ImageOccurrence[] = [];
  const command = "\\includegraphics";
  let cursor = window.start;
  while (cursor < window.end) {
    const start = active.indexOf(command, cursor);
    if (start < 0 || start >= window.end) break;
    let position = start + command.length;
    if (active[position] === "[") {
      const optional = delimitedGroup(active, position, "[", "]", window.end);
      if (!optional) break;
      position = optional.end;
    }
    position = skipWhitespace(active, position, window.end);
    if (active[position] !== "{") {
      cursor = Math.max(position, start + command.length);
      continue;
    }
    const argument = delimitedGroup(active, position, "{", "}", window.end);
    if (!argument) break;
    cursor = argument.end;
    if (argument.bodyStart === argument.bodyEnd) continue;
    const authored = source.slice(argument.bodyStart, argument.bodyEnd);
    assertImagePathLength(authored.length, "reference");
    occurrences.push({ start, end: argument.end, requestedPath: authored.trim() });
  }
  return occurrences;
}

function resolveImageCandidates(
  sourcePath: string,
  requested: string,
  searchFolders: readonly string[],
  imagePaths: ReadonlySet<string>,
  resolutionBudget: ImageResolutionBudget,
): string[] {
  if (!requested || requested.startsWith("/") || requested.includes("\\") || requested.includes("..")) return [];
  const extensions = ["", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"];
  const bases = new Set<string>();
  const relative = resolvePortablePath(sourcePath, requested);
  if (relative) bases.add(relative);
  bases.add(requested.replace(/^\.\//u, ""));
  for (const folder of searchFolders) bases.add(`${folder}/${requested.replace(/^\.\//u, "")}`);
  const candidates = new Set<string>();
  for (const base of bases) {
    for (const extension of extensions) {
      resolutionBudget.candidateProbes = acceptLatexImageCandidateProbe(resolutionBudget.candidateProbes);
      const candidate = `${base}${extension}`;
      if (imagePaths.has(candidate)) candidates.add(candidate);
    }
  }
  return [...candidates].sort(comparePortableText);
}

export function acceptLatexImageCandidateProbe(candidateProbes: number, maximumCandidateProbes = latexImageMaximumCandidateProbes): number {
  const nextCandidateProbes = candidateProbes + 1;
  if (nextCandidateProbes <= Math.min(maximumCandidateProbes, latexImageMaximumCandidateProbes)) return nextCandidateProbes;
  throw new LatexConversionError("image-resolution-limit", "LaTeX image resolution exceeds the 100,000 candidate-probe limit");
}

function acceptSearchFolder(budget: ImageResolutionBudget, codeUnits: number): void {
  budget.searchFolders += 1;
  if (budget.searchFolders > latexImageMaximumSearchFolders) {
    throw new LatexConversionError("image-resolution-limit", "LaTeX image search paths exceed the 256-folder limit");
  }
  budget.searchFolderCodeUnits += codeUnits;
  if (budget.searchFolderCodeUnits <= latexImageMaximumSearchFolderCodeUnits) return;
  throw new LatexConversionError("image-resolution-limit", "LaTeX image search paths exceed the 65,536 UTF-16 code-unit limit");
}

function assertImagePathLength(codeUnits: number, kind: "reference" | "search path"): void {
  if (codeUnits <= latexImageMaximumRequestedPathCodeUnits) return;
  throw new LatexConversionError("image-resolution-limit", `LaTeX image ${kind} exceeds 1,024 UTF-16 code units`);
}

function delimitedGroup(source: string, start: number, open: "[" | "{", close: "]" | "}", limit: number): DelimitedGroup | null {
  const end = balancedLatexGroupEnd(source, start, open, close, limit);
  return end === null ? null : { bodyStart: start + 1, bodyEnd: end - 1, end };
}

function skipWhitespace(source: string, start: number, limit: number): number {
  let cursor = start;
  while (cursor < limit && /\s/u.test(source[cursor]!)) cursor += 1;
  return cursor;
}

function requiredSource(inspection: LatexArchiveInspection, path: string): string {
  const source = inspection.files.find((file) => file.path === path)?.text;
  if (source === undefined) throw new Error(`LaTeX conversion source is unavailable: ${path}`);
  return source;
}
