import type {
  LatexArchiveFile,
  LatexArchiveInspection,
  LatexBibliographyReference,
  LatexImportDiagnostic,
  LatexIncludeReference,
} from "./latex-archive";
import {
  LatexConversionError,
  latexMaximumCitationKeys,
  latexMaximumTableColumns,
  latexMaximumTableRows,
  latexMaximumTikzBlocks,
  latexMaximumTikzBytes,
} from "./latex-contracts";
import { resolveLatexImageReferences, type LatexImageReferenceResolution } from "./latex-images";
import { latexCommandArgument, matchingLatexBrace, skipLatexWhitespace } from "./latex-render-helpers";
import {
  addLatexRenderedFolder,
  addLatexRenderedProjectCodeUnits,
  addLatexRenderedTableLine,
  assertLatexRenderedFileCodeUnits,
  type LatexRenderedFolderUsage,
} from "./latex-render-limits";
import { displayMathOccurrences, latexDocumentWindow, latexSourceProjections, maskedLatex, structuralLatexSource } from "./latex-source";
import { comparePortableText } from "./portable-path";
import { sha256Hex } from "./sha256";

export { LatexConversionError } from "./latex-contracts";

export interface LatexConversionSelection {
  readonly rootPath: string;
  readonly bibliographyPath?: string;
}

export interface LatexConversionReport {
  readonly schemaVersion: 1;
  readonly rootPath: string;
  readonly bibliographyPath: string | null;
  readonly sourceFiles: readonly string[];
  readonly ignoredFiles: readonly string[];
  readonly diagnostics: readonly LatexImportDiagnostic[];
}

export interface LatexRenderedFile {
  readonly sourcePath: string;
  readonly path: string;
  readonly content: string;
}

export interface LatexRenderedProject {
  readonly files: readonly LatexRenderedFile[];
  readonly folders: readonly string[];
  readonly bibliography: string;
  readonly assets: readonly LatexConversionAsset[];
  readonly report: LatexConversionReport;
}

export interface LatexConversionAsset {
  readonly path: string;
  readonly mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/avif" | "image/svg+xml";
  readonly bytes: Uint8Array;
}

export function renderLatexProject(inspection: LatexArchiveInspection, selection: LatexConversionSelection): LatexRenderedProject {
  const root = inspection.files.find((file) => file.path === selection.rootPath && file.kind === "tex");
  if (!root || !inspection.rootCandidates.includes(selection.rootPath)) {
    throw new LatexConversionError("invalid-root-selection", `Selected LaTeX root is unavailable: ${selection.rootPath}`);
  }
  const rootText = root.text ?? "";
  const rootWindow = latexDocumentWindow(rootText);

  const includesBySource = groupReferences(inspection.includes);
  const reachablePaths: string[] = [];
  let diagnostics: LatexImportDiagnostic[] = inspection.diagnostics.filter(
    (diagnostic) => diagnostic.code !== "ambiguous-root" && diagnostic.code !== "unreferenced-bibliography",
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  visit(selection.rootPath);

  const reachable = new Set(reachablePaths);
  diagnostics = diagnostics.filter((diagnostic) => !diagnostic.path || reachable.has(diagnostic.path));
  const bibliographyReferences = inspection.bibliographies.filter(
    (reference) =>
      reachable.has(reference.sourcePath) &&
      reference.resolvedPath &&
      (reference.sourcePath !== selection.rootPath || insideWindow(rootWindow, reference.from)),
  );
  const bibliographyPath = selectBibliography(inspection.files, bibliographyReferences, selection.bibliographyPath);
  const pathMap = markdownPathMap(reachablePaths, selection.rootPath);
  const images = referencedImages(inspection, reachablePaths, pathMap, selection.rootPath);
  diagnostics.push(...images.diagnostics);
  const files: LatexRenderedFile[] = [];
  let tikzBlocks = 0;
  let renderedCodeUnits = 0;

  for (const path of reachablePaths) {
    const file = inspection.files.find((candidate) => candidate.path === path);
    if (!file?.text) continue;
    const conversion = convertLatexFile(
      file,
      path === selection.rootPath,
      includesBySource.get(path) ?? [],
      pathMap,
      images.references.get(path) ?? [],
    );
    assertLatexRenderedFileCodeUnits(path, conversion.markdown.length);
    renderedCodeUnits = addLatexRenderedProjectCodeUnits(renderedCodeUnits, conversion.markdown.length);
    tikzBlocks += conversion.tikzBlocks;
    diagnostics.push(...conversion.diagnostics);
    files.push({ sourcePath: path, path: pathMap.get(path)!, content: conversion.markdown });
  }
  if (tikzBlocks > latexMaximumTikzBlocks) {
    throw new LatexConversionError("unsupported-environment", `LaTeX import contains more than ${latexMaximumTikzBlocks} TikZ blocks`);
  }

  const bibliography = bibliographyPath ? (inspection.files.find((file) => file.path === bibliographyPath)?.text ?? "") : "";
  return {
    files,
    folders: projectFolders(files.map((file) => file.path)),
    bibliography,
    assets: images.assets,
    report: {
      schemaVersion: 1,
      rootPath: selection.rootPath,
      bibliographyPath,
      sourceFiles: reachablePaths,
      ignoredFiles: inspection.files.filter((file) => !reachable.has(file.path) && file.path !== bibliographyPath).map((file) => file.path),
      diagnostics,
    },
  };

  function visit(path: string): void {
    if (visited.has(path)) return;
    if (visiting.has(path)) {
      diagnostics.push({ code: "include-cycle", severity: "error", path, message: `LaTeX include cycle reaches ${path}` });
      return;
    }
    visiting.add(path);
    reachablePaths.push(path);
    for (const reference of includesBySource.get(path) ?? []) {
      if (path === selection.rootPath && !insideWindow(rootWindow, reference.from)) continue;
      if (reference.resolvedPath) visit(reference.resolvedPath);
    }
    visiting.delete(path);
    visited.add(path);
  }
}

function groupReferences(references: readonly LatexIncludeReference[]): Map<string, LatexIncludeReference[]> {
  const grouped = new Map<string, LatexIncludeReference[]>();
  for (const reference of references) {
    const existing = grouped.get(reference.sourcePath);
    if (existing) existing.push(reference);
    else grouped.set(reference.sourcePath, [reference]);
  }
  return grouped;
}

function selectBibliography(
  files: readonly LatexArchiveFile[],
  references: readonly LatexBibliographyReference[],
  selected: string | undefined,
): string | null {
  const paths = [...new Set(references.flatMap((reference) => (reference.resolvedPath ? [reference.resolvedPath] : [])))];
  if (selected !== undefined) {
    if (!paths.includes(selected) || !files.some((file) => file.path === selected && file.kind === "bibtex")) {
      throw new LatexConversionError("invalid-bibliography-selection", `Selected bibliography is unavailable: ${selected}`);
    }
    return selected;
  }
  return paths.length === 1 ? paths[0]! : null;
}

function markdownPathMap(paths: readonly string[], rootPath: string): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();
  for (const path of paths) {
    const markdownPath = path === rootPath ? "main.md" : path.replace(/\.tex$/iu, ".md");
    const key = markdownPath.toLowerCase();
    if (used.has(key)) throw new LatexConversionError("invalid-root-selection", `Converted Markdown path collides: ${markdownPath}`);
    used.add(key);
    result.set(path, markdownPath);
  }
  return result;
}

function referencedImages(
  inspection: LatexArchiveInspection,
  sourcePaths: readonly string[],
  markdownPaths: ReadonlyMap<string, string>,
  rootPath: string,
): {
  readonly assets: readonly LatexConversionAsset[];
  readonly references: ReadonlyMap<string, readonly RenderedImageReference[]>;
  readonly diagnostics: readonly LatexImportDiagnostic[];
} {
  const collection: ReferencedImageCollection = {
    imageFiles: new Map(inspection.files.filter((file) => file.kind === "image").map((file) => [file.path, file])),
    imageHashes: new Map(),
    assets: new Map(),
    assetHashes: new Map(),
    references: new Map(),
    diagnostics: [],
  };
  for (const resolution of resolveLatexImageReferences(inspection, rootPath, sourcePaths)) {
    collectReferencedImage(collection, resolution);
  }
  assertDistinctImagePaths(collection.assets.values(), markdownPaths.values());
  return {
    assets: [...collection.assets.values()].sort((left, right) => comparePortableText(left.path, right.path)),
    references: collection.references,
    diagnostics: collection.diagnostics,
  };
}

interface ReferencedImageCollection {
  readonly imageFiles: ReadonlyMap<string, LatexArchiveFile>;
  readonly imageHashes: Map<string, string>;
  readonly assets: Map<string, LatexConversionAsset>;
  readonly assetHashes: Map<string, string>;
  readonly references: Map<string, RenderedImageReference[]>;
  readonly diagnostics: LatexImportDiagnostic[];
}

function collectReferencedImage(collection: ReferencedImageCollection, resolution: LatexImageReferenceResolution): void {
  if (resolution.candidates.length !== 1) {
    addImageReference(collection.references, resolution, null);
    collection.diagnostics.push(unresolvedImageDiagnostic(resolution));
    return;
  }

  const archivePath = resolution.candidates[0]!;
  const image = collection.imageFiles.get(archivePath)!;
  const assetPath = archivePath.startsWith("figures/") ? archivePath : `figures/${archivePath.split("/").at(-1)!}`;
  const assetKey = assetPath.toLowerCase();
  const existing = collection.assets.get(assetKey);
  const imageHash = collection.imageHashes.get(archivePath) ?? sha256Hex(image.bytes);
  collection.imageHashes.set(archivePath, imageHash);

  if (existing && collection.assetHashes.get(assetKey) !== imageHash) {
    addImageReference(collection.references, resolution, null);
    collection.diagnostics.push({
      code: "ambiguous-image",
      severity: "warning",
      path: resolution.sourcePath,
      message: `Referenced figures collide at project path: ${assetPath}`,
    });
    return;
  }
  if (!existing) {
    collection.assets.set(assetKey, { path: assetPath, mediaType: imageMediaType(archivePath), bytes: image.bytes });
    collection.assetHashes.set(assetKey, imageHash);
  }
  addImageReference(collection.references, resolution, existing?.path ?? assetPath);
}

function unresolvedImageDiagnostic(resolution: LatexImageReferenceResolution): LatexImportDiagnostic {
  const missing = resolution.candidates.length === 0;
  return {
    code: missing ? "missing-image" : "ambiguous-image",
    severity: "warning",
    path: resolution.sourcePath,
    from: resolution.start,
    to: resolution.end,
    message: missing
      ? `Referenced figure was not found: ${resolution.requestedPath}`
      : `Referenced figure matches more than one archive file: ${resolution.requestedPath}`,
  };
}

function addImageReference(
  references: Map<string, RenderedImageReference[]>,
  resolution: LatexImageReferenceResolution,
  targetPath: string | null,
): void {
  const reference = {
    start: resolution.start,
    end: resolution.end,
    requestedPath: resolution.requestedPath,
    targetPath,
  };
  const grouped = references.get(resolution.sourcePath);
  if (grouped) grouped.push(reference);
  else references.set(resolution.sourcePath, [reference]);
}

function assertDistinctImagePaths(assets: Iterable<LatexConversionAsset>, markdownPaths: Iterable<string>): void {
  const markdownPathKeys = new Set([...markdownPaths].map((path) => path.toLowerCase()));
  for (const asset of assets) {
    if (markdownPathKeys.has(asset.path.toLowerCase())) {
      throw new LatexConversionError("unsupported-environment", `Figure path collides with converted Markdown: ${asset.path}`);
    }
  }
}

interface RenderedImageReference {
  readonly start: number;
  readonly end: number;
  readonly requestedPath: string;
  readonly targetPath: string | null;
}

function replaceSourceReferences(
  source: string,
  file: LatexArchiveFile,
  originalOffset: number,
  includes: readonly LatexIncludeReference[],
  markdownPaths: ReadonlyMap<string, string>,
  imageReferences: readonly RenderedImageReference[],
): string {
  const replacements: TextReplacement[] = [];
  const current = markdownPaths.get(file.path);
  const sourceEnd = originalOffset + source.length;
  for (const reference of imageReferences) {
    const replacement = imageReferenceReplacement(reference, current, originalOffset, sourceEnd);
    if (replacement) replacements.push(replacement);
  }
  for (const include of includes) {
    const replacement = includeReferenceReplacement(include, current, markdownPaths, originalOffset, sourceEnd);
    if (replacement) replacements.push(replacement);
  }
  replacements.sort((left, right) => left.start - right.start || left.end - right.end);
  return applyTextReplacements(source, replacements);
}

function imageReferenceReplacement(
  reference: RenderedImageReference,
  currentPath: string | undefined,
  sourceStart: number,
  sourceEnd: number,
): TextReplacement | null {
  if (outsideSourceRange(reference.start, reference.end, sourceStart, sourceEnd)) return null;
  const value =
    reference.targetPath && currentPath
      ? `![Imported figure](${relativeMarkdownPath(currentPath, reference.targetPath)})`
      : `[Missing figure: ${reference.requestedPath}]`;
  return { start: reference.start - sourceStart, end: reference.end - sourceStart, value };
}

function includeReferenceReplacement(
  include: LatexIncludeReference,
  currentPath: string | undefined,
  markdownPaths: ReadonlyMap<string, string>,
  sourceStart: number,
  sourceEnd: number,
): TextReplacement | null {
  if (outsideSourceRange(include.from, include.to, sourceStart, sourceEnd)) return null;
  if (!include.resolvedPath || !currentPath) return null;
  const targetPath = markdownPaths.get(include.resolvedPath);
  if (!targetPath) return null;
  return {
    start: include.from - sourceStart,
    end: include.to - sourceStart,
    value: `\n\n::include[${relativeMarkdownPath(currentPath, targetPath)}]\n\n`,
  };
}

function outsideSourceRange(start: number, end: number, sourceStart: number, sourceEnd: number): boolean {
  return start < sourceStart || end > sourceEnd;
}

function imageMediaType(path: string): LatexConversionAsset["mediaType"] {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".avif") return "image/avif";
  return "image/svg+xml";
}

function convertLatexFile(
  file: LatexArchiveFile,
  root: boolean,
  includes: readonly LatexIncludeReference[],
  pathMap: ReadonlyMap<string, string>,
  imageReferences: readonly RenderedImageReference[],
): { readonly markdown: string; readonly diagnostics: readonly LatexImportDiagnostic[]; readonly tikzBlocks: number } {
  const originalSource = file.text ?? "";
  const sourceWindow = root ? latexDocumentWindow(originalSource) : { start: 0, end: originalSource.length };
  let source = originalSource.slice(sourceWindow.start, sourceWindow.end);
  const diagnostics: LatexImportDiagnostic[] = [];
  const footnotes: string[] = [];
  const literalBlocks: string[] = [];
  let tikzBlocks = 0;

  source = replaceSourceReferences(source, file, sourceWindow.start, includes, pathMap, imageReferences);
  source = applyTextReplacements(
    source,
    latexSourceProjections(source).literalRanges.map((occurrence) => {
      const whole = source.slice(occurrence.start, occurrence.end);
      if (!occurrence.closed || (source[occurrence.bodyStart] === "[" && occurrence.options === undefined)) {
        return { start: occurrence.start, end: occurrence.end, value: protectBlock(whole) };
      }
      const listing = codeListing(source.slice(occurrence.bodyStart, occurrence.bodyEnd), occurrence.environment, occurrence.options);
      return {
        start: occurrence.start,
        end: occurrence.end,
        value: protectBlock(fencedCode(listing.source, listing.language)),
      };
    }),
  );
  source = replaceEnvironment(source, "comment", () => "");
  source = replaceEnvironment(source, "figure", (body, whole) => {
    const tikzRange = singleEnvironmentBlock(structuralLatexSource(body), "tikzpicture");
    if (!tikzRange) return whole;
    const tikz = body.slice(tikzRange.start, tikzRange.end);
    if (new TextEncoder().encode(tikz).byteLength > latexMaximumTikzBytes) {
      throw new LatexConversionError("unsupported-environment", `TikZ block exceeds 128 KiB in ${file.path}`);
    }
    const caption = normalizePgfCaption(/\\caption\s*\{([^{}]*)\}/u.exec(body)?.[1]);
    const id = /\\label\s*\{([a-z][a-z0-9:_-]{0,63})\}/iu.exec(body)?.[1];
    const nativeFigure = translatePreparedBoxplot(tikz, caption, id);
    if (!nativeFigure) return whole;
    tikzBlocks += 1;
    diagnostics.push({
      code: "tikz-translated",
      severity: "info",
      path: file.path,
      message: "PGFPlots prepared boxplot was translated to an experimental native figure",
    });
    return protectBlock(nativeFigure);
  });
  source = replaceEnvironment(source, "tikzpicture", (_body, whole) => {
    if (new TextEncoder().encode(whole).byteLength > latexMaximumTikzBytes) {
      throw new LatexConversionError("unsupported-environment", `TikZ block exceeds 128 KiB in ${file.path}`);
    }
    tikzBlocks += 1;
    const nativeFigure = translatePreparedBoxplot(whole);
    if (nativeFigure) {
      diagnostics.push({
        code: "tikz-translated",
        severity: "info",
        path: file.path,
        message: "PGFPlots prepared boxplot was translated to an experimental native figure",
      });
      return protectBlock(nativeFigure);
    }
    diagnostics.push({
      code: "tikz-preserved",
      severity: "info",
      path: file.path,
      message: "TikZ source was preserved without rendering",
    });
    return protectBlock(`\`\`\`tikz\n${whole.trim()}\n\`\`\``);
  });
  source = stripComments(source);
  source = replaceEnvironment(source, "tabularx", (body) => tableMarkdown(body, 2));
  source = replaceEnvironment(source, "tabular", (body) => tableMarkdown(body, 1));
  source = replaceEnvironment(source, "abstract", (body) => `\n\n## Abstract\n\n::label[abstract]\n\n${body.trim()}\n\n`);
  for (const environment of ["itemize", "enumerate"] as const) {
    source = replaceEnvironment(source, environment, (body) => listMarkdown(body, environment === "enumerate"));
  }
  source = replaceEnvironment(source, "opening", (body) => body);

  source = replaceSimpleCommand(source, ["bibliographystyle"], () => "");
  source = replaceSimpleCommand(source, ["bibliography", "addbibresource"], () => "\n\n::bibliography[]\n\n");
  source = replaceSectionCommands(source);
  source = replaceSimpleCommand(source, ["textbf", "bf"], (value) => `**${value}**`);
  source = replaceSimpleCommand(source, ["textit", "emph", "textsl"], (value) => `*${value}*`);
  source = replaceSimpleCommand(source, ["texttt"], (value) => `\`${value}\``);
  source = replaceSimpleCommand(source, ["citet"], (value) => `:citet[${citationKeys(value)}]`);
  source = replaceSimpleCommand(source, ["citep"], (value) => `:citep[${citationKeys(value)}]`);
  source = replaceSimpleCommand(source, ["cite"], (value) => `:cite[${citationKeys(value)}]`);
  source = replaceSimpleCommand(source, ["autoref", "cref", "Cref", "ref"], (value) => `:ref[${value.trim()}]`);
  source = replaceSimpleCommand(source, ["label"], (value) => `\n\n::label[${value.trim()}]\n\n`);
  source = replaceSimpleCommand(source, ["url"], (value) => `<${value.trim()}>`);
  source = replaceHrefCommands(source);
  source = replaceSimpleCommand(source, ["footnote"], (value, index) => {
    const id = `latex-${footnoteScope(file.path)}-${index + 1}`;
    footnotes.push(`[^${id}]: ${value.trim()}`);
    return `[^${id}]`;
  });
  source = replaceDisplayMath(source);
  source = replaceEnvironmentMarkers(source, ["figure", "figure*", "table", "table*", "center", "description"], () => "\n");
  source = replaceSimpleCommand(
    source,
    ["caption", "keywords", "institute", "author", "title", "runningtitle", "runningauthor"],
    (value) => value,
  );
  source = source.replace(/\\(?:maketitle|centering|noindent|medskip|smallskip|bigskip|newpage|clearpage|vfill)\b/gu, "");
  source = replaceEnvironmentMarkers(source, null, (environment) => {
    diagnostics.push({
      code: "unsupported-environment",
      severity: "warning",
      path: file.path,
      message: `Unsupported LaTeX environment was reduced to its contents: ${environment}`,
    });
    return "\n";
  });
  for (const match of uniqueCommandMatches(source)) {
    diagnostics.push({
      code: "unsupported-command",
      severity: "warning",
      path: file.path,
      message: `Unsupported LaTeX command remains for review: \\${match[1]}`,
    });
  }
  source = unescapeLatex(source)
    .replaceAll(/\n[ \t]+/gu, "\n")
    .replaceAll(/[ \t]+\n/gu, "\n")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trim();
  source = restoreLiteralBlocks(source, literalBlocks);
  return { markdown: `${source}${footnotes.length ? `\n\n${footnotes.join("\n")}` : ""}\n`, diagnostics, tikzBlocks };

  function protectBlock(block: string): string {
    const token = literalToken(literalBlocks.length);
    literalBlocks.push(block);
    return `\n\n${token}\n\n`;
  }
}

interface PreparedBoxplotMark {
  readonly label: string;
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly max: number;
}

interface PreparedBoxplotMetadata {
  readonly xLabel: string | undefined;
  readonly yLabel: string | undefined;
  readonly title: string | undefined;
}

function translatePreparedBoxplot(source: string, caption?: string, id?: string): string | null {
  const axis = axisOptions(source);
  if (!axis) return null;
  if (!isHorizontalBoxplot(axis)) return null;

  const labels = preparedBoxplotLabels(axis);
  if (!labels) return null;
  const marks = preparedBoxplotMarks(source, labels);
  if (!marks) return null;
  const metadata = preparedBoxplotMetadata(axis);
  if (!metadata) return null;
  return renderPreparedBoxplot(marks, metadata, caption, id);
}

function isHorizontalBoxplot(axis: string): boolean {
  const direction = /boxplot\s*\/\s*draw\s+direction\s*=\s*([xy])/u.exec(axis)?.[1];
  return direction === undefined || direction === "x";
}

function preparedBoxplotLabels(axis: string): readonly string[] | null {
  const labelsSource = /yticklabels\s*=\s*\{([^{}]*)\}/u.exec(axis)?.[1];
  if (!labelsSource) return null;
  const labels: string[] = [];
  for (const value of labelsSource.split(",")) {
    const label = normalizePgfText(value);
    if (label === null) return null;
    labels.push(label);
  }
  return labels;
}

function preparedBoxplotMarks(source: string, labels: readonly string[]): readonly PreparedBoxplotMark[] | null {
  const summaries = preparedBoxplotSummaries(source);
  if (!summaries || summaries.length === 0 || summaries.length > 32 || summaries.length !== labels.length) return null;
  const marks: PreparedBoxplotMark[] = [];
  for (const [index, summary] of summaries.entries()) {
    const label = labels[index];
    if (!label) return null;
    const mark = preparedBoxplotMark(summary, label);
    if (!mark) return null;
    marks.push(mark);
  }
  return marks;
}

function preparedBoxplotMark(summary: string, label: string): PreparedBoxplotMark | null {
  const prepared = /boxplot\s+prepared\s*=\s*\{([^{}]*)\}/u.exec(summary)?.[1];
  if (!prepared) return null;
  const values = preparedBoxplotValues(prepared);
  if (!values || !orderedBoxplotValues(values)) return null;
  return { label, ...values };
}

function preparedBoxplotValues(prepared: string): Omit<PreparedBoxplotMark, "label"> | null {
  const properties = new Map(
    prepared.split(",").map((item) => {
      const [name, ...value] = item.split("=");
      return [name?.trim().toLowerCase() ?? "", value.join("=").trim()] as const;
    }),
  );
  const min = pgfNumber(properties.get("lower whisker"));
  if (min === null) return null;
  const q1 = pgfNumber(properties.get("lower quartile"));
  if (q1 === null) return null;
  const median = pgfNumber(properties.get("median"));
  if (median === null) return null;
  const q3 = pgfNumber(properties.get("upper quartile"));
  if (q3 === null) return null;
  const max = pgfNumber(properties.get("upper whisker"));
  return max === null ? null : { min, q1, median, q3, max };
}

function orderedBoxplotValues(values: Omit<PreparedBoxplotMark, "label">): boolean {
  return values.min <= values.q1 && values.q1 <= values.median && values.median <= values.q3 && values.q3 <= values.max;
}

function preparedBoxplotMetadata(axis: string): PreparedBoxplotMetadata | null {
  const xLabel = axisText(axis, "xlabel");
  const yLabel = axisText(axis, "ylabel");
  if (xLabel === null || yLabel === null) return null;
  const title = axisText(axis, "title");
  if (title === null) return null;
  return { xLabel, yLabel, title };
}

function renderPreparedBoxplot(
  marks: readonly PreparedBoxplotMark[],
  metadata: PreparedBoxplotMetadata,
  caption: string | undefined,
  id: string | undefined,
): string {
  const attributes = ['kind="boxplot"', "version=1"];
  if (metadata.xLabel) attributes.push(`x-label="${metadata.xLabel}"`);
  if (metadata.yLabel) attributes.push(`y-label="${metadata.yLabel}"`);
  const boxes = marks.map(
    (mark) => `::box[${mark.label}]{min=${mark.min} q1=${mark.q1} median=${mark.median} q3=${mark.q3} max=${mark.max}}`,
  );
  return `:::figure{${attributes.join(" ")}}\n${boxes.join("\n")}\n::caption[${caption || metadata.title || "Imported PGFPlots boxplot."}]\n:::${id ? `\n::label[${id}]` : ""}`;
}

function axisOptions(source: string): string | null {
  const opener = /\\begin\s*\{axis\}\s*\[/gu.exec(source);
  if (!opener) return null;
  const start = opener.index + opener[0].length;
  const end = source.indexOf("]", start);
  return end < 0 ? null : source.slice(start, end);
}

function preparedBoxplotSummaries(source: string): readonly string[] | null {
  const opener = /\\addplot\+\s*\[/gu;
  const suffix = /\s*coordinates\s*\{\s*\}\s*;/uy;
  const summaries: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    opener.lastIndex = cursor;
    const open = opener.exec(source);
    if (!open) break;
    const bodyStart = open.index + open[0].length;
    const close = source.indexOf("]", bodyStart);
    if (close < 0) return null;
    suffix.lastIndex = close + 1;
    const tail = suffix.exec(source);
    if (!tail) return null;
    summaries.push(source.slice(bodyStart, close));
    if (summaries.length > 32) return null;
    cursor = tail.index + tail[0].length;
  }
  return summaries;
}

function axisText(axis: string, name: string): string | undefined | null {
  const match = new RegExp(`(?:^|,)\\s*${name}\\s*=\\s*(?:\\{([^{}]*)\\}|\\$([^$\\n]*)\\$|([^,\\n]+))`, "u").exec(axis);
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  return raw === undefined ? undefined : normalizePgfText(raw);
}

function normalizePgfText(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/^\$|\$$/gu, "")
    .replaceAll("\\&", "&")
    .replaceAll("--", "–");
  if (!normalized || normalized.length > 120 || /[\]{}"\\\n\r]/u.test(normalized)) return null;
  return normalized;
}

function normalizePgfCaption(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().replaceAll("\\&", "&").replaceAll("--", "–");
  return normalized && normalized.length <= 500 && !/[\]{}\\\n\r]/u.test(normalized) ? normalized : undefined;
}

function pgfNumber(value: string | undefined): number | null {
  if (value === undefined || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 1e12 ? parsed : null;
}

function insideWindow(window: { readonly start: number; readonly end: number }, offset: number): boolean {
  return offset >= window.start && offset < window.end;
}

function stripComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== "%") continue;
        let escapes = 0;
        for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) escapes += 1;
        if (escapes % 2 === 0) return line.slice(0, index);
      }
      return line;
    })
    .join("\n");
}

function replaceEnvironment(
  source: string,
  environment: string,
  replace: (body: string, whole: string, from: number, options?: string) => string,
): string {
  const escaped = environment.replaceAll("*", "\\*");
  const beginPattern = new RegExp(`\\\\begin\\s*\\{${escaped}\\}`, "gu");
  const endPattern = new RegExp(`\\\\end\\s*\\{${escaped}\\}`, "gu");
  const active = maskedLatex(source);
  const converted: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    beginPattern.lastIndex = cursor;
    const begin = beginPattern.exec(active);
    if (!begin) break;
    let bodyStart = begin.index + begin[0].length;
    endPattern.lastIndex = bodyStart;
    const end = endPattern.exec(active);
    if (!end) break;
    let options: string | undefined;
    if (active[bodyStart] === "[") {
      const optionsEnd = active.indexOf("]", bodyStart + 1);
      if (optionsEnd < 0 || optionsEnd >= end.index) break;
      options = source.slice(bodyStart + 1, optionsEnd);
      bodyStart = optionsEnd + 1;
    }
    const wholeEnd = end.index + end[0].length;
    const whole = source.slice(begin.index, wholeEnd);
    converted.push(source.slice(cursor, begin.index), replace(source.slice(bodyStart, end.index), whole, begin.index, options));
    cursor = wholeEnd;
  }
  converted.push(source.slice(cursor));
  return converted.join("");
}

function singleEnvironmentBlock(source: string, environment: string): { readonly start: number; readonly end: number } | null {
  const escaped = environment.replaceAll("*", "\\*");
  const beginPattern = new RegExp(`\\\\begin\\s*\\{${escaped}\\}`, "gu");
  const endPattern = new RegExp(`\\\\end\\s*\\{${escaped}\\}`, "gu");
  let block: { readonly start: number; readonly end: number } | null = null;
  let cursor = 0;
  while (cursor < source.length) {
    beginPattern.lastIndex = cursor;
    const begin = beginPattern.exec(source);
    if (!begin) break;
    endPattern.lastIndex = begin.index + begin[0].length;
    const end = endPattern.exec(source);
    if (!end) break;
    if (block !== null) return null;
    const blockEnd = end.index + end[0].length;
    block = { start: begin.index, end: blockEnd };
    cursor = blockEnd;
  }
  return block;
}

function codeListing(
  body: string,
  environment: "lstlisting" | "verbatim" | "minted",
  options?: string,
): { readonly source: string; readonly language?: string } {
  let source = body;
  let language = /(?:^|,)\s*language\s*=\s*(?:\{([^{}]*)\}|([^,]+))/iu
    .exec(options ?? "")
    ?.slice(1)
    .find(Boolean);
  if (environment !== "verbatim") {
    const positionalLanguage = /^\s*\{([^{}\r\n]*)\}/u.exec(source);
    if (positionalLanguage) {
      language ??= positionalLanguage[1];
      source = source.slice(positionalLanguage[0].length);
    }
  }
  source = source.replace(/^\r?\n/u, "").replace(/\r?\n$/u, "");
  const normalizedLanguage = language?.trim().toLowerCase();
  return {
    source,
    ...(normalizedLanguage && /^[a-z0-9_+.-]{1,32}$/u.test(normalizedLanguage) ? { language: normalizedLanguage } : {}),
  };
}

function fencedCode(source: string, language?: string): string {
  const pattern = /`+/gu;
  let longestRun = 0;
  while (true) {
    const match = pattern.exec(source);
    if (!match) break;
    if (match[0].length > longestRun) longestRun = match[0].length;
  }
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}${language ?? ""}\n${source}\n${fence}`;
}

function listMarkdown(body: string, ordered: boolean): string {
  const items: string[] = [];
  const pattern = /\\item(?![A-Za-z])/gu;
  let contentStart: number | null = null;
  while (true) {
    const match = pattern.exec(body);
    if (!match) break;
    if (contentStart !== null) items.push(body.slice(contentStart, match.index));
    contentStart = match.index + match[0].length;
    if (body[contentStart] === "[") {
      const optionsEnd = body.indexOf("]", contentStart + 1);
      if (optionsEnd < 0) {
        contentStart = null;
        break;
      }
      contentStart = optionsEnd + 1;
      pattern.lastIndex = contentStart;
    }
  }
  if (contentStart !== null) items.push(body.slice(contentStart));
  return `\n\n${items.map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${item.trim()}`).join("\n")}\n\n`;
}

function tableMarkdown(body: string, argumentCount: number): string {
  let rowsSource = body.trimStart();
  for (let index = 0; index < argumentCount; index += 1) rowsSource = removeLeadingBraceGroup(rowsSource).trimStart();
  rowsSource = rowsSource.replace(/\\(?:toprule|midrule|bottomrule|hline)\b/gu, "");
  const rows: string[][] = [];
  let columns = 0;
  for (const rowSource of boundedTableRows(rowsSource)) {
    const row = boundedTableCells(rowSource);
    rows.push(row);
    if (row.length > columns) columns = row.length;
  }
  if (rows.length === 0 || columns === 0) return "";
  const lines: string[] = [];
  let outputCodeUnits = 4;
  appendLine(tableLine(rows[0]!, columns));
  appendLine(
    tableLine(
      Array.from({ length: columns }, () => "---"),
      columns,
    ),
  );
  for (const row of rows.slice(1)) appendLine(tableLine(row, columns));
  return `\n\n${lines.join("\n")}\n\n`;

  function appendLine(line: string): void {
    outputCodeUnits = addLatexRenderedTableLine(outputCodeUnits, line.length, lines.length > 0);
    lines.push(line);
  }
}

function boundedTableRows(source: string): readonly string[] {
  const rows: string[] = [];
  let cursor = 0;
  while (cursor <= source.length) {
    const delimiter = source.indexOf("\\\\", cursor);
    const end = delimiter < 0 ? source.length : delimiter;
    const row = source.slice(cursor, end).trim();
    if (row) {
      rows.push(row);
      if (rows.length > latexMaximumTableRows) {
        throw new LatexConversionError("render-limit", `LaTeX table exceeds ${latexMaximumTableRows} rows`);
      }
    }
    if (delimiter < 0) break;
    cursor = delimiter + 2;
    if (source[cursor] === "[") {
      const optionsEnd = source.indexOf("]", cursor + 1);
      if (optionsEnd < 0) break;
      cursor = optionsEnd + 1;
    }
  }
  return rows;
}

function boundedTableCells(source: string): string[] {
  const cells: string[] = [];
  let cursor = 0;
  while (cursor <= source.length) {
    const delimiter = source.indexOf("&", cursor);
    const end = delimiter < 0 ? source.length : delimiter;
    cells.push(source.slice(cursor, end).replaceAll("|", "\\|").replaceAll(/\s+/gu, " ").trim());
    if (cells.length > latexMaximumTableColumns) {
      throw new LatexConversionError("render-limit", `LaTeX table exceeds ${latexMaximumTableColumns} columns`);
    }
    if (delimiter < 0) break;
    cursor = delimiter + 1;
  }
  return cells;
}

function tableLine(cells: readonly string[], columns: number): string {
  const padded = Array.from({ length: columns }, (_, index) => cells[index] ?? "");
  return `| ${padded.join(" | ")} |`;
}

function replaceDisplayMath(source: string): string {
  let converted = "";
  let cursor = 0;
  for (const occurrence of displayMathOccurrences(source)) {
    converted += source.slice(cursor, occurrence.start);
    converted += `\n\n$$$$\n${source.slice(occurrence.bodyStart, occurrence.bodyEnd).trim()}\n$$$$\n\n`;
    cursor = occurrence.end;
  }
  return `${converted}${source.slice(cursor)}`;
}

function removeLeadingBraceGroup(value: string): string {
  if (!value.startsWith("{")) return value;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "{") depth += 1;
    else if (value[index] === "}") depth -= 1;
    if (depth === 0) return value.slice(index + 1);
  }
  return value;
}

function replaceSectionCommands(source: string): string {
  const levels: Readonly<Record<string, number>> = { section: 2, subsection: 3, subsubsection: 4, paragraph: 5 };
  const replacements: TextReplacement[] = [];
  for (const occurrence of commandGroupOccurrences(source, Object.keys(levels), true)) {
    let end = occurrence.end;
    let label: string | undefined;
    const labelStart = skipLatexWhitespace(source, end);
    if (source.startsWith("\\label", labelStart) && !/[A-Za-z]/u.test(source[labelStart + "\\label".length] ?? "")) {
      const argument = latexCommandArgument(source, labelStart + "\\label".length);
      if (argument.kind === "open") {
        const close = matchingLatexBrace(source, argument.open);
        if (close >= 0) {
          label = source.slice(argument.open + 1, close);
          end = close + 1;
        }
      }
    }
    const title = source.slice(occurrence.valueStart, occurrence.valueEnd).trim();
    replacements.push({
      start: occurrence.start,
      end,
      value: `\n\n${"#".repeat(levels[occurrence.name] ?? 2)} ${title}${label ? `\n\n::label[${label.trim()}]` : ""}\n\n`,
    });
  }
  return applyTextReplacements(source, replacements);
}

function replaceHrefCommands(source: string): string {
  const replacements: TextReplacement[] = [];
  for (const occurrence of commandGroupOccurrences(source, ["href"])) {
    const open = skipLatexWhitespace(source, occurrence.end);
    if (source[open] !== "{") continue;
    const close = matchingLatexBrace(source, open);
    if (close < 0) break;
    const target = source.slice(occurrence.valueStart, occurrence.valueEnd);
    const label = source.slice(open + 1, close);
    replacements.push({ start: occurrence.start, end: close + 1, value: `[${label}](${target})` });
  }
  return applyTextReplacements(source, replacements);
}

function replaceEnvironmentMarkers(
  source: string,
  environments: readonly string[] | null,
  replace: (environment: string) => string,
): string {
  const allowed = environments ? new Set(environments) : null;
  const replacements: TextReplacement[] = [];
  for (const occurrence of commandGroupOccurrences(source, ["begin", "end"])) {
    const environment = source.slice(occurrence.valueStart, occurrence.valueEnd);
    if (allowed && !allowed.has(environment)) continue;
    let end = occurrence.end;
    if (allowed && occurrence.name === "begin" && source[end] === "[") {
      const optionsEnd = source.indexOf("]", end + 1);
      if (optionsEnd < 0) break;
      end = optionsEnd + 1;
    }
    replacements.push({ start: occurrence.start, end, value: replace(environment) });
  }
  return applyTextReplacements(source, replacements);
}

function replaceSimpleCommand(source: string, commands: readonly string[], replace: (value: string, index: number) => string): string {
  let count = 0;
  for (const command of commands) {
    const replacements = commandGroupOccurrences(source, [command]).map((occurrence) => ({
      start: occurrence.start,
      end: occurrence.end,
      value: replace(source.slice(occurrence.valueStart, occurrence.valueEnd), count++),
    }));
    source = applyTextReplacements(source, replacements);
  }
  return source;
}

interface CommandGroupOccurrence {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly valueStart: number;
  readonly valueEnd: number;
}

interface TextReplacement {
  readonly start: number;
  readonly end: number;
  readonly value: string;
}

function commandGroupOccurrences(source: string, commands: readonly string[], allowStar = false): readonly CommandGroupOccurrence[] {
  const alternatives = commands.map((command) => command.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|");
  const pattern = new RegExp(`\\\\(${alternatives})(?![A-Za-z])`, "gu");
  const occurrences: CommandGroupOccurrence[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(source);
    if (!match) break;
    const afterCommand = match.index + match[0].length + (allowStar && source[match.index + match[0].length] === "*" ? 1 : 0);
    const argument = latexCommandArgument(source, afterCommand);
    if (argument.kind === "malformed") break;
    if (argument.kind === "absent") {
      cursor = Math.max(match.index + match[0].length, argument.next);
      continue;
    }
    const close = matchingLatexBrace(source, argument.open);
    if (close < 0) break;
    occurrences.push({
      name: match[1] ?? "",
      start: match.index,
      end: close + 1,
      valueStart: argument.open + 1,
      valueEnd: close,
    });
    cursor = close + 1;
  }
  return occurrences;
}

function applyTextReplacements(source: string, replacements: readonly TextReplacement[]): string {
  if (replacements.length === 0) return source;
  const converted: string[] = [];
  let cursor = 0;
  for (const replacement of replacements) {
    if (replacement.start < cursor) continue;
    converted.push(source.slice(cursor, replacement.start), replacement.value);
    cursor = replacement.end;
  }
  converted.push(source.slice(cursor));
  return converted.join("");
}

function uniqueCommandMatches(source: string): RegExpMatchArray[] {
  const pattern = /\\([A-Za-z@]+)\b/gu;
  const seen = new Set<string>();
  const matches: RegExpMatchArray[] = [];
  while (true) {
    const match = pattern.exec(source);
    if (!match) break;
    const command = match[1] ?? "";
    if (seen.has(command)) continue;
    seen.add(command);
    matches.push(match);
  }
  return matches;
}

function citationKeys(value: string): string {
  const keys: string[] = [];
  let cursor = 0;
  while (cursor <= value.length) {
    const delimiter = value.indexOf(",", cursor);
    const end = delimiter < 0 ? value.length : delimiter;
    const key = value.slice(cursor, end).trim();
    if (key) {
      keys.push(key);
      if (keys.length > latexMaximumCitationKeys) {
        throw new LatexConversionError("semantic-record-limit", `LaTeX citation exceeds ${latexMaximumCitationKeys} keys`);
      }
    }
    if (delimiter < 0) break;
    cursor = delimiter + 1;
  }
  return keys.join(", ");
}

function footnoteScope(path: string): string {
  return path
    .replace(/\.tex$/iu, "")
    .replaceAll(/[^a-z0-9]+/giu, "-")
    .replaceAll(/^-|-$/gu, "")
    .toLowerCase();
}

function unescapeLatex(source: string): string {
  return source
    .replaceAll("~", " ")
    .replace(/\\([%&#_$])/gu, "$1")
    .replaceAll("\\textbackslash{}", "\\");
}

function literalToken(index: number): string {
  return `\u{e000}${index}\u{e001}`;
}

function restoreLiteralBlocks(source: string, blocks: readonly string[]): string {
  return source.replace(/\u{e000}(\d+)\u{e001}/gu, (token, index: string) => blocks[Number(index)] ?? token);
}

function relativeMarkdownPath(sourcePath: string, targetPath: string): string {
  const sourceParts = sourcePath.split("/");
  sourceParts.pop();
  const targetParts = targetPath.split("/");
  while (sourceParts.length > 0 && targetParts[0] === sourceParts[0]) {
    sourceParts.shift();
    targetParts.shift();
  }
  return `${sourceParts.map(() => "..").join("/")}${sourceParts.length ? "/" : ""}${targetParts.join("/")}`;
}

function projectFolders(paths: readonly string[]): string[] {
  const folders = new Set<string>();
  let usage: LatexRenderedFolderUsage = { folders: 0, codeUnits: 0 };
  for (const path of paths) {
    const parts = path.split("/");
    parts.pop();
    let prefix = "";
    for (const part of parts) {
      prefix = prefix ? `${prefix}/${part}` : part;
      if (folders.has(prefix)) continue;
      usage = addLatexRenderedFolder(usage, prefix);
      folders.add(prefix);
    }
  }
  return [...folders].sort(comparePortableText);
}
