import type { LatexArchiveFile, LatexArchiveInspection, LatexIncludeReference } from "./latex-archive";
import type {
  LatexBibliographyEntryInventory,
  LatexCitationInventory,
  LatexCodeBlockInventory,
  LatexDocumentMetadata,
  LatexEquationInventory,
  LatexFigureInventory,
  LatexLabelInventory,
  LatexReferenceInventory,
  LatexSectionInventory,
  LatexSourceFingerprint,
  LatexTableInventory,
  PaperSourceRange,
  SourcedLatexValue,
} from "./latex-contracts";
import { LatexConversionError, latexMaximumCitationKeys } from "./latex-contracts";
import type { LatexConversionReport } from "./latex-renderer";
import { resolveLatexImageReferences } from "./latex-images";
import { displayMathOccurrences, latexSourceProjections, maskedLatex, type LatexLiteralEnvironmentOccurrence } from "./latex-source";
import { sha256Hex } from "./sha256";

export interface LatexSemanticInventory {
  readonly metadata: LatexDocumentMetadata;
  readonly abstracts: readonly SourcedLatexValue[];
  readonly sections: readonly LatexSectionInventory[];
  readonly citations: readonly LatexCitationInventory[];
  readonly bibliographyEntries: readonly LatexBibliographyEntryInventory[];
  readonly labels: readonly LatexLabelInventory[];
  readonly references: readonly LatexReferenceInventory[];
  readonly equations: readonly LatexEquationInventory[];
  readonly tables: readonly LatexTableInventory[];
  readonly codeBlocks: readonly LatexCodeBlockInventory[];
  readonly footnotes: readonly SourcedLatexValue[];
  readonly figures: readonly LatexFigureInventory[];
  readonly sourceFingerprints: readonly LatexSourceFingerprint[];
}

interface CommandOccurrence {
  readonly name: string;
  readonly source: string;
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly valueStart: number;
  readonly valueEnd: number;
}

interface SourceWindow {
  readonly start: number;
  readonly end: number;
}

interface SourceProjections {
  readonly semantic: string;
  readonly literals: readonly LatexLiteralEnvironmentOccurrence[];
}

interface EnvironmentOccurrence {
  readonly source: string;
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly options?: string;
}

export function analyzeLatexSemantics(inspection: LatexArchiveInspection, report: LatexConversionReport): LatexSemanticInventory {
  const root = requiredTextFile(inspection.files, report.rootPath);
  const sourceFiles = report.sourceFiles.map((path) => requiredTextFile(inspection.files, path));
  const projectionsByPath = new Map<string, SourceProjections>();
  const projectionsFor = (file: LatexArchiveFile): SourceProjections => {
    const existing = projectionsByPath.get(file.path);
    if (existing) return existing;
    const source = file.text ?? "";
    const { semantic, literals } = latexSourceProjections(source);
    const projections = { semantic, literals };
    projectionsByPath.set(file.path, projections);
    return projections;
  };
  const metadata = metadataInventory(root, projectionsFor(root).semantic);
  const abstracts: SourcedLatexValue[] = [];
  const sections = manuscriptSectionInventory(inspection, report, (file) => projectionsFor(file).semantic);
  const citations: LatexCitationInventory[] = [];
  const labels: LatexLabelInventory[] = [];
  const references: LatexReferenceInventory[] = [];
  const equations: LatexEquationInventory[] = [];
  const tables: LatexTableInventory[] = [];
  const codeBlocks: LatexCodeBlockInventory[] = [];
  const footnotes: SourcedLatexValue[] = [];

  for (const file of sourceFiles) {
    const source = file.text ?? "";
    const projections = projectionsFor(file);
    const window = file.path === report.rootPath ? documentWindow(source, projections.semantic) : { start: 0, end: source.length };
    abstracts.push(...environmentValues(source, projections.semantic, file.path, window, "abstract"));
    citations.push(...citationInventory(source, projections.semantic, file.path, window));
    labels.push(...labelInventory(source, projections.semantic, file.path, window));
    references.push(...referenceInventory(source, projections.semantic, file.path, window));
    equations.push(...equationInventory(source, projections.semantic, file.path, window));
    tables.push(...tableInventory(source, projections.semantic, file.path, window));
    codeBlocks.push(...codeInventory(source, projections.literals, file.path, window));
    footnotes.push(...commandValues(source, projections.semantic, file.path, window, ["footnote"]));
  }

  const bibliographyFile = report.bibliographyPath
    ? inspection.files.find((file) => file.path === report.bibliographyPath && file.kind === "bibtex")
    : undefined;
  const selectedPaths = [...report.sourceFiles, ...(bibliographyFile ? [bibliographyFile.path] : [])];
  return {
    metadata,
    abstracts,
    sections,
    citations,
    bibliographyEntries: bibliographyFile?.text ? bibliographyEntryInventory(bibliographyFile.path, bibliographyFile.text) : [],
    labels,
    references,
    equations,
    tables,
    codeBlocks,
    footnotes,
    figures: figureInventory(inspection, report, projectionsFor),
    sourceFingerprints: selectedPaths.map((path) => {
      const file = inspection.files.find((candidate) => candidate.path === path)!;
      return { path: file.path, kind: file.kind, bytes: file.bytes.byteLength, sha256: sha256Hex(file.bytes) };
    }),
  };
}

function figureInventory(
  inspection: LatexArchiveInspection,
  report: LatexConversionReport,
  projectionsFor: (file: LatexArchiveFile) => SourceProjections,
): LatexFigureInventory[] {
  const imageFiles = new Map(inspection.files.filter((file) => file.kind === "image").map((file) => [file.path, file]));
  const sourceContexts = new Map<string, FigureSourceContext>();
  const contentHashes = new Map<string, string>();
  const destinations = new Map<string, { readonly contentHash: string; readonly path: string }>();
  const figures: LatexFigureInventory[] = [];

  for (const reference of resolveLatexImageReferences(inspection, report.rootPath, report.sourceFiles)) {
    const { sourcePath, requestedPath, start, end, candidates } = reference;
    const context = contextFor(sourcePath);
    const { source } = context;
    const archivePath = candidates.length === 1 ? candidates[0]! : null;
    const image = archivePath ? imageFiles.get(archivePath) : undefined;
    const assetPath = archivePath ? (archivePath.startsWith("figures/") ? archivePath : `figures/${archivePath.split("/").at(-1)!}`) : null;
    const contentHash = image
      ? (contentHashes.get(image.path) ??
        (() => {
          const hash = sha256Hex(image.bytes);
          contentHashes.set(image.path, hash);
          return hash;
        })())
      : null;
    const existingDestination = assetPath ? destinations.get(assetPath.toLowerCase()) : undefined;
    const collision = Boolean(existingDestination && contentHash && existingDestination.contentHash !== contentHash);
    if (assetPath && contentHash && !existingDestination) {
      destinations.set(assetPath.toLowerCase(), { contentHash, path: assetPath });
    }
    const resolvedAssetPath = collision ? null : (existingDestination?.path ?? assetPath);
    const enclosing = enclosingOccurrence(context.figures, start, end) ?? enclosingOccurrence(context.starredFigures, start, end);
    const captionCommand = enclosing ? firstCommandInWindow(context.captions, enclosing) : undefined;
    const labelCommand = enclosing ? firstCommandInWindow(context.labels, enclosing) : undefined;
    const resolutionDiagnostics =
      candidates.length === 0
        ? [{ code: "missing-image" as const, severity: "warning" as const, message: `Referenced figure was not found: ${requestedPath}` }]
        : candidates.length > 1
          ? [
              {
                code: "ambiguous-image" as const,
                severity: "warning" as const,
                message: `Referenced figure matches more than one archive file: ${requestedPath}`,
              },
            ]
          : collision
            ? [
                {
                  code: "ambiguous-image" as const,
                  severity: "warning" as const,
                  message: `Referenced figures collide at project path: ${assetPath}`,
                },
              ]
            : [];
    figures.push({
      sourcePath,
      requestedPath,
      archivePath,
      resolvedAssetPath,
      contentHash,
      mediaType: archivePath ? imageMediaType(archivePath) : null,
      ...(captionCommand ? { caption: sourcedCommand(sourcePath, captionCommand) } : {}),
      ...(labelCommand ? { label: sourcedCommand(sourcePath, labelCommand) } : {}),
      source: source.slice(start, end),
      referenceRange: range(sourcePath, start, end),
      ...(enclosing ? { figureRange: range(sourcePath, enclosing.start, enclosing.end) } : {}),
      resolutionDiagnostics,
    });
  }
  return figures;

  function contextFor(path: string): FigureSourceContext {
    const existing = sourceContexts.get(path);
    if (existing) return existing;
    const file = requiredTextFile(inspection.files, path);
    const source = file.text ?? "";
    const semantic = projectionsFor(file).semantic;
    const window = path === report.rootPath ? documentWindow(source, semantic) : { start: 0, end: source.length };
    const context: FigureSourceContext = {
      source,
      figures: environmentOccurrences(source, semantic, window, "figure"),
      starredFigures: environmentOccurrences(source, semantic, window, "figure*"),
      captions: commandOccurrences(source, semantic, window, ["caption"]),
      labels: commandOccurrences(source, semantic, window, ["label"]),
    };
    sourceContexts.set(path, context);
    return context;
  }
}

interface FigureSourceContext {
  readonly source: string;
  readonly figures: readonly EnvironmentOccurrence[];
  readonly starredFigures: readonly EnvironmentOccurrence[];
  readonly captions: readonly CommandOccurrence[];
  readonly labels: readonly CommandOccurrence[];
}

function enclosingOccurrence(occurrences: readonly EnvironmentOccurrence[], start: number, end: number): EnvironmentOccurrence | undefined {
  let low = 0;
  let high = occurrences.length - 1;
  let candidate: EnvironmentOccurrence | undefined;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const occurrence = occurrences[middle]!;
    if (occurrence.start <= start) {
      candidate = occurrence;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return candidate && candidate.end >= end ? candidate : undefined;
}

function firstCommandInWindow(
  commands: readonly CommandOccurrence[],
  window: Pick<EnvironmentOccurrence, "start" | "end">,
): CommandOccurrence | undefined {
  let low = 0;
  let high = commands.length - 1;
  let candidate: CommandOccurrence | undefined;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const command = commands[middle]!;
    if (command.start < window.start) {
      low = middle + 1;
    } else {
      candidate = command;
      high = middle - 1;
    }
  }
  return candidate && candidate.end <= window.end ? candidate : undefined;
}

function imageMediaType(path: string): LatexFigureInventory["mediaType"] {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".avif") return "image/avif";
  return "image/svg+xml";
}

function metadataInventory(file: LatexArchiveFile, semantic: string): LatexDocumentMetadata {
  const source = file.text ?? "";
  const window = { start: 0, end: source.length };
  const commands = commandOccurrences(source, semantic, window, ["title", "author", "date", "institute"]);
  const sourced = (command: CommandOccurrence): SourcedLatexValue => sourcedCommand(file.path, command);
  const title = commands.find(({ name }) => name === "title");
  const date = commands.find(({ name }) => name === "date");
  return {
    ...(title ? { title: sourced(title) } : {}),
    authors: commands.filter(({ name }) => name === "author").map(sourced),
    ...(date ? { date: sourced(date) } : {}),
    institutes: commands.filter(({ name }) => name === "institute").map(sourced),
  };
}

function manuscriptSectionInventory(
  inspection: LatexArchiveInspection,
  report: LatexConversionReport,
  semanticFor: (file: LatexArchiveFile) => string,
): LatexSectionInventory[] {
  const levels = new Map<string, 1 | 2 | 3 | 4>([
    ["section", 1],
    ["subsection", 2],
    ["subsubsection", 3],
    ["paragraph", 4],
  ]);
  const parents = new Map<number, string>();
  const reachable = new Set(report.sourceFiles);
  const includesBySource = new Map<string, LatexIncludeReference[]>();
  for (const reference of inspection.includes) {
    const grouped = includesBySource.get(reference.sourcePath);
    if (grouped) grouped.push(reference);
    else includesBySource.set(reference.sourcePath, [reference]);
  }
  const visited = new Set<string>();
  const sections: LatexSectionInventory[] = [];
  visit(report.rootPath);
  return sections;

  function visit(path: string): void {
    if (visited.has(path) || !reachable.has(path)) return;
    visited.add(path);
    const file = requiredTextFile(inspection.files, path);
    const source = file.text ?? "";
    const semantic = semanticFor(file);
    const window = path === report.rootPath ? documentWindow(source, semantic) : { start: 0, end: source.length };
    const commands = commandOccurrences(source, semantic, window, [...levels.keys()]);
    const labelsByStart = new Map(commandOccurrences(source, semantic, window, ["label"]).map((label) => [label.start, label]));
    const adjacentWhitespace = /\s*/gy;
    const includes = (includesBySource.get(path) ?? []).filter(
      (reference) =>
        reference.sourcePath === path &&
        reference.from >= window.start &&
        reference.to <= window.end &&
        reference.resolvedPath !== null &&
        reachable.has(reference.resolvedPath),
    );
    const events: Array<
      | { readonly kind: "section"; readonly position: number; readonly command: CommandOccurrence; readonly localIndex: number }
      | { readonly kind: "include"; readonly position: number; readonly reference: LatexIncludeReference }
    > = [
      ...commands.map((command, localIndex) => ({ kind: "section" as const, position: command.start, command, localIndex })),
      ...includes.map((reference) => ({ kind: "include" as const, position: reference.from, reference })),
    ];
    events.sort((left, right) => left.position - right.position || (left.kind === "section" ? -1 : 1));
    for (const event of events) {
      if (event.kind === "include") {
        const resolvedPath = event.reference.resolvedPath;
        if (resolvedPath) visit(resolvedPath);
        continue;
      }
      const { command, localIndex } = event;
      const level = levels.get(command.name)!;
      for (const prior of parents.keys()) if (prior >= level) parents.delete(prior);
      const parentId = [...parents.entries()].sort((left, right) => right[0] - left[0]).find(([prior]) => prior < level)?.[1] ?? null;
      const id = `${path}#section-${localIndex + 1}`;
      parents.set(level, id);
      adjacentWhitespace.lastIndex = command.end;
      adjacentWhitespace.exec(semantic);
      const label = labelsByStart.get(adjacentWhitespace.lastIndex);
      const end = label?.end ?? command.end;
      sections.push({
        id,
        parentId,
        level,
        title: command.value.trim(),
        ...(label?.value.trim() ? { label: label.value.trim() } : {}),
        source: source.slice(command.start, end),
        range: range(path, command.start, end),
      });
    }
  }
}

function citationInventory(source: string, semantic: string, path: string, window: SourceWindow): LatexCitationInventory[] {
  return commandOccurrences(source, semantic, window, ["citet", "citep", "cite"]).map((command) => ({
    mode: command.name === "citet" ? "narrative" : command.name === "citep" ? "parenthetical" : "unspecified",
    keys: boundedCitationKeys(command.value),
    source: command.source,
    range: range(path, command.start, command.end),
  }));
}

function boundedCitationKeys(value: string): readonly string[] {
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
  return keys;
}

function labelInventory(source: string, semantic: string, path: string, window: SourceWindow): LatexLabelInventory[] {
  return commandOccurrences(source, semantic, window, ["label"]).map((command) => ({
    id: command.value.trim(),
    source: command.source,
    range: range(path, command.start, command.end),
  }));
}

function referenceInventory(source: string, semantic: string, path: string, window: SourceWindow): LatexReferenceInventory[] {
  return commandOccurrences(source, semantic, window, ["autoref", "cref", "Cref", "ref"]).map((command) => ({
    target: command.value.trim(),
    source: command.source,
    range: range(path, command.start, command.end),
  }));
}

function equationInventory(source: string, semantic: string, path: string, window: SourceWindow): LatexEquationInventory[] {
  const equations: LatexEquationInventory[] = [];
  for (const occurrence of displayMathOccurrences(semantic, window.start, window.end)) {
    equations.push({
      display: true,
      value: source.slice(occurrence.bodyStart, occurrence.bodyEnd).trim(),
      source: source.slice(occurrence.start, occurrence.end),
      range: range(path, occurrence.start, occurrence.end),
    });
  }
  for (const environment of ["equation", "equation*", "align", "align*"] as const) {
    for (const occurrence of environmentOccurrences(source, semantic, window, environment)) {
      equations.push({
        display: true,
        value: occurrence.value.trim(),
        source: occurrence.source,
        range: range(path, occurrence.start, occurrence.end),
      });
    }
  }
  return equations.sort((left, right) => left.range.start - right.range.start);
}

function tableInventory(source: string, semantic: string, path: string, window: SourceWindow): LatexTableInventory[] {
  return (["tabular", "tabularx"] as const)
    .flatMap((environment) =>
      environmentOccurrences(source, semantic, window, environment).map((occurrence) => ({
        environment,
        source: occurrence.source,
        range: range(path, occurrence.start, occurrence.end),
      })),
    )
    .sort((left, right) => left.range.start - right.range.start);
}

function codeInventory(
  source: string,
  literals: readonly LatexLiteralEnvironmentOccurrence[],
  path: string,
  window: SourceWindow,
): LatexCodeBlockInventory[] {
  return literals
    .filter((occurrence) => occurrence.start >= window.start && occurrence.end <= window.end)
    .flatMap((occurrence) => {
      if (source[occurrence.bodyStart] === "[" && occurrence.options === undefined) return [];
      let value = source.slice(occurrence.bodyStart, occurrence.bodyEnd);
      let language = /(?:^|,)\s*language\s*=\s*(?:\{([^{}]*)\}|([^,]+))/iu
        .exec(occurrence.options ?? "")
        ?.slice(1)
        .find(Boolean);
      if (occurrence.environment !== "verbatim") {
        const positionalLanguage = /^\s*\{([^{}\r\n]*)\}/u.exec(value);
        if (positionalLanguage) {
          language ??= positionalLanguage[1];
          value = value.slice(positionalLanguage[0].length);
        }
      }
      const normalizedLanguage = language?.trim().toLowerCase();
      return [
        {
          environment: occurrence.environment,
          value: value.replace(/^\r?\n/u, "").replace(/\r?\n$/u, ""),
          ...(normalizedLanguage && /^[a-z0-9_+.-]{1,32}$/u.test(normalizedLanguage) ? { language: normalizedLanguage } : {}),
          source: source.slice(occurrence.start, occurrence.end),
          range: range(path, occurrence.start, occurrence.end),
        },
      ];
    });
}

function bibliographyEntryInventory(path: string, source: string): LatexBibliographyEntryInventory[] {
  const active = maskedLatex(source);
  const entries: LatexBibliographyEntryInventory[] = [];
  const pattern = /@([a-z]+)\s*([({])/giu;
  let cursor = 0;
  while (cursor < active.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(active);
    if (!match) break;
    const type = match[1]?.toLowerCase();
    const opening = match[2];
    if (!type || !opening) {
      cursor = match.index + match[0].length;
      continue;
    }
    const end = bibtexEntryEnd(active, match.index + match[0].length - 1, opening);
    if (end < 0) {
      break;
    }
    cursor = end + 1;
    const body = active.slice(match.index + match[0].length, end);
    const citationKey = body.split(",", 1)[0]?.trim() ?? "";
    if (!citationKey || type === "comment" || type === "preamble" || type === "string") continue;
    entries.push({ type, citationKey, source: source.slice(match.index, end + 1), range: range(path, match.index, end + 1) });
  }
  return entries;
}

function bibtexEntryEnd(source: string, open: number, opening: string): number {
  const closing = opening === "{" ? "}" : ")";
  let depth = 0;
  let braceDepth = 0;
  let quoted = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (opening === "(" && character === "{") {
      braceDepth += 1;
      continue;
    }
    if (opening === "(" && character === "}" && braceDepth > 0) {
      braceDepth -= 1;
      continue;
    }
    if (braceDepth > 0) continue;
    if (character === opening) depth += 1;
    else if (character === closing) depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function commandValues(
  source: string,
  semantic: string,
  path: string,
  window: SourceWindow,
  names: readonly string[],
): SourcedLatexValue[] {
  return commandOccurrences(source, semantic, window, names).map((command) => sourcedCommand(path, command));
}

function sourcedCommand(path: string, command: CommandOccurrence): SourcedLatexValue {
  return { value: command.value.trim(), source: command.source, range: range(path, command.start, command.end) };
}

function environmentValues(source: string, semantic: string, path: string, window: SourceWindow, environment: string): SourcedLatexValue[] {
  return environmentOccurrences(source, semantic, window, environment).map((occurrence) => ({
    value: occurrence.value.trim(),
    source: occurrence.source,
    range: range(path, occurrence.start, occurrence.end),
  }));
}

function commandOccurrences(source: string, active: string, window: SourceWindow, names: readonly string[]): CommandOccurrence[] {
  const escaped = names.map((name) => name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|");
  const pattern = new RegExp(`\\\\(${escaped})(?![A-Za-z])`, "gu");
  pattern.lastIndex = window.start;
  const occurrences: CommandOccurrence[] = [];
  while (true) {
    const match = pattern.exec(active);
    if (!match || match.index >= window.end) break;
    const afterCommand = match.index + match[0].length + (active[match.index + match[0].length] === "*" ? 1 : 0);
    const argument = commandArgument(active, afterCommand, window.end);
    if (argument.kind === "malformed") break;
    if (argument.kind === "absent") {
      pattern.lastIndex = Math.max(pattern.lastIndex, argument.next);
      continue;
    }
    const close = matchingDelimiter(active, argument.open, "{", "}");
    if (close < 0 || close >= window.end) break;
    occurrences.push({
      name: match[1] ?? "",
      source: source.slice(match.index, close + 1),
      value: source.slice(argument.open + 1, close),
      start: match.index,
      end: close + 1,
      valueStart: argument.open + 1,
      valueEnd: close,
    });
    pattern.lastIndex = close + 1;
  }
  return occurrences;
}

function environmentOccurrences(source: string, active: string, window: SourceWindow, environment: string): EnvironmentOccurrence[] {
  const escaped = environment.replaceAll("*", "\\*");
  const begin = new RegExp(`\\\\begin\\s*\\{${escaped}\\}`, "gu");
  const end = new RegExp(`\\\\end\\s*\\{${escaped}\\}`, "gu");
  begin.lastIndex = window.start;
  const occurrences: EnvironmentOccurrence[] = [];
  while (true) {
    const open = begin.exec(active);
    if (!open || open.index >= window.end) break;
    let valueStart = open.index + open[0].length;
    let options: string | undefined;
    if (active[valueStart] === "[") {
      const optionsEnd = active.indexOf("]", valueStart + 1);
      if (optionsEnd < 0 || optionsEnd >= window.end) break;
      options = source.slice(valueStart + 1, optionsEnd);
      valueStart = optionsEnd + 1;
    }
    end.lastIndex = valueStart;
    const close = end.exec(active);
    if (!close || close.index + close[0].length > window.end) break;
    const wholeEnd = close.index + close[0].length;
    occurrences.push({
      source: source.slice(open.index, wholeEnd),
      value: source.slice(valueStart, close.index),
      start: open.index,
      end: wholeEnd,
      ...(options !== undefined ? { options } : {}),
    });
    begin.lastIndex = wholeEnd;
  }
  return occurrences;
}

type CommandArgument =
  { readonly kind: "open"; readonly open: number } | { readonly kind: "absent"; readonly next: number } | { readonly kind: "malformed" };

function commandArgument(source: string, from: number, end: number): CommandArgument {
  let cursor = skipWhitespace(source, from, end);
  while (source[cursor] === "[") {
    const close = source.indexOf("]", cursor + 1);
    if (close < 0 || close >= end) return { kind: "malformed" };
    cursor = skipWhitespace(source, close + 1, end);
  }
  return source[cursor] === "{" ? { kind: "open", open: cursor } : { kind: "absent", next: cursor };
}

function skipWhitespace(source: string, from: number, end: number): number {
  let cursor = from;
  while (cursor < end && /\s/u.test(source[cursor]!)) cursor += 1;
  return cursor;
}

function documentWindow(source: string, active: string): SourceWindow {
  const begin = /\\begin\s*\{document\}/u.exec(active);
  if (!begin) return { start: 0, end: source.length };
  const start = begin.index + begin[0].length;
  const end = /\\end\s*\{document\}/u.exec(active.slice(start));
  return { start, end: end ? start + end.index : source.length };
}

function matchingDelimiter(source: string, open: number, opening: string, closing: string): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === opening) depth += 1;
    else if (source[index] === closing) depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function range(path: string, start: number, end: number): PaperSourceRange {
  return { path, start, end, unit: "utf16-code-unit" };
}

function requiredTextFile(files: readonly LatexArchiveFile[], path: string): LatexArchiveFile {
  const file = files.find((candidate) => candidate.path === path && candidate.text !== undefined);
  if (!file) throw new Error(`LaTeX conversion source is unavailable: ${path}`);
  return file;
}
