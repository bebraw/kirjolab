import type { LatexArchiveFile, LatexArchiveInspection, LatexIncludeReference } from "./latex-archive.js";
import type {
  LatexBibliographyEntryInventory,
  LatexCitationInventory,
  LatexCodeBlockInventory,
  LatexConversionDiagnostic,
  LatexDocumentMetadata,
  LatexEquationInventory,
  LatexFigureInventory,
  LatexLabelInventory,
  LatexProjectConversion,
  LatexProseBlockInventory,
  LatexReferenceInventory,
  LatexSectionInventory,
  LatexTableInventory,
  PaperSourceRange,
  SourcedLatexValue,
} from "./latex-contracts.js";
import {
  LatexConversionError,
  latexMaximumCitationKeys,
  latexMaximumFigureProvenanceCodeUnits,
  latexMaximumListNestingDepth,
  latexMaximumProseProvenanceCodeUnits,
} from "./latex-contracts.js";
import type { LatexConversionReport } from "./latex-renderer.js";
import { resolveLatexImageReferences, type LatexImageReferenceResolution } from "./latex-images.js";
import {
  displayMathOccurrences,
  isActiveLatexCommandStart,
  latexDocumentWindow,
  latexSourceProjections,
  maskedLatex,
  nextActiveLatexMatch,
  type LatexLiteralEnvironmentOccurrence,
} from "./latex-source.js";
import { sha256Hex } from "./sha256.js";

export type LatexSemanticInventory = Pick<
  LatexProjectConversion,
  | "metadata"
  | "abstracts"
  | "sections"
  | "proseBlocks"
  | "citations"
  | "bibliographyEntries"
  | "labels"
  | "references"
  | "equations"
  | "tables"
  | "codeBlocks"
  | "footnotes"
  | "figures"
  | "sourceFingerprints"
>;

export type LatexSemanticAnalysis = LatexSemanticInventory & {
  readonly provenanceDiagnostics: readonly LatexConversionDiagnostic[];
};

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
  readonly valueStart: number;
  readonly valueEnd: number;
  readonly options?: string;
}

export function analyzeLatexSemantics(
  inspection: LatexArchiveInspection,
  report: LatexConversionReport,
  maximumProseBlocks: number,
  semanticRecordLimit: number,
): LatexSemanticAnalysis {
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
  const prose = manuscriptProseBlockInventory(
    inspection,
    report,
    sections,
    (file) => projectionsFor(file).semantic,
    maximumProseBlocks,
    semanticRecordLimit,
  );
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
    const window = file.path === report.rootPath ? latexDocumentWindow(source, projections.semantic) : { start: 0, end: source.length };
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
    proseBlocks: prose.blocks,
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
    provenanceDiagnostics: prose.diagnostics,
  };
}

interface ProseInventoryState {
  readonly inspection: LatexArchiveInspection;
  readonly rootPath: string;
  readonly semanticFor: (file: LatexArchiveFile) => string;
  readonly maximumBlocks: number;
  readonly semanticRecordLimit: number;
  readonly reachable: ReadonlySet<string>;
  readonly includesBySource: ReadonlyMap<string, readonly LatexIncludeReference[]>;
  readonly sectionsByPath: ReadonlyMap<string, readonly LatexSectionInventory[]>;
  readonly visited: Set<string>;
  readonly localCounts: Map<string, number>;
  readonly blocks: LatexProseBlockInventory[];
  readonly diagnostics: LatexConversionDiagnostic[];
  retainedProvenanceCodeUnits: number;
  sectionId: string | null;
}

type ProseStructureEvent =
  | { readonly kind: "section"; readonly position: number; readonly section: LatexSectionInventory }
  | { readonly kind: "include"; readonly position: number; readonly reference: LatexIncludeReference };

function manuscriptProseBlockInventory(
  inspection: LatexArchiveInspection,
  report: LatexConversionReport,
  sections: readonly LatexSectionInventory[],
  semanticFor: (file: LatexArchiveFile) => string,
  maximumBlocks: number,
  semanticRecordLimit: number,
): { readonly blocks: LatexProseBlockInventory[]; readonly diagnostics: readonly LatexConversionDiagnostic[] } {
  const groupedSections = new Map<string, LatexSectionInventory[]>();
  for (const section of sections) {
    const grouped = groupedSections.get(section.range.path);
    if (grouped) grouped.push(section);
    else groupedSections.set(section.range.path, [section]);
  }
  const state: ProseInventoryState = {
    inspection,
    rootPath: report.rootPath,
    semanticFor,
    maximumBlocks,
    semanticRecordLimit,
    reachable: new Set(report.sourceFiles),
    includesBySource: includesBySourcePath(inspection.includes),
    sectionsByPath: groupedSections,
    visited: new Set(),
    localCounts: new Map(),
    blocks: [],
    diagnostics: [],
    retainedProvenanceCodeUnits: 0,
    sectionId: null,
  };
  visitProseSource(state, report.rootPath);
  return { blocks: state.blocks, diagnostics: state.diagnostics };
}

function visitProseSource(state: ProseInventoryState, path: string): void {
  const sourceVisit = beginSourceVisit(state, path);
  if (!sourceVisit) return;
  const { source, semantic } = sourceVisit;
  if (semantic.length !== source.length) {
    state.diagnostics.push({
      code: "prose-provenance-unavailable",
      severity: "warning",
      message: "Ordinary prose was omitted because exact original-source offsets could not be established",
      sourcePath: path,
    });
    return;
  }
  const window = sourceWindow(path, state.rootPath, source, semantic);
  const excludedEnvironments = proseExcludedEnvironmentOccurrences(source, semantic, window);
  const listEnvironments = proseListEnvironmentOccurrences(source, semantic, window);
  const reachableIncludes = (state.includesBySource.get(path) ?? []).filter((reference) =>
    isReachableInclude(reference, path, window, state.reachable),
  );
  const visibleIncludes = reachableIncludes.filter(
    (reference) => !occurrenceContainsAny(excludedEnvironments, reference.from, reference.to),
  );
  const listIncludes = visibleIncludes
    .filter((reference) => occurrenceContainsAny(listEnvironments, reference.from, reference.to))
    .sort((left, right) => left.from - right.from || left.to - right.to);
  const listIncludeOccurrences = listIncludes.map(({ from: start, to: end }) => ({ start, end }));
  for (const reference of listIncludes) {
    state.diagnostics.push({
      code: "prose-provenance-unavailable",
      severity: "warning",
      message: "Included prose was omitted because a cross-file list-item relationship cannot retain exact provenance",
      sourcePath: path,
      range: range(path, reference.from, reference.to),
    });
  }
  const events: ProseStructureEvent[] = [
    ...(state.sectionsByPath.get(path) ?? [])
      .filter((section) => !occurrenceContainsAny(excludedEnvironments, section.range.start, section.range.end))
      .map((section) => ({ kind: "section" as const, position: section.range.start, section })),
    ...visibleIncludes
      .filter((reference) => !occurrenceContainsAny(listEnvironments, reference.from, reference.to))
      .map((reference) => ({ kind: "include" as const, position: reference.from, reference })),
  ].sort((left, right) => left.position - right.position || (left.kind === "section" ? -1 : 1));

  let cursor = window.start;
  for (const event of events) {
    appendProseBlocks(state, path, source, semantic, cursor, event.position, listIncludeOccurrences);
    if (event.kind === "section") {
      state.sectionId = event.section.id;
      cursor = event.section.range.end;
    } else {
      const resolvedPath = event.reference.resolvedPath;
      if (resolvedPath) visitProseSource(state, resolvedPath);
      cursor = event.reference.to;
    }
  }
  appendProseBlocks(state, path, source, semantic, cursor, window.end, listIncludeOccurrences);
}

const proseListEnvironments = ["itemize", "enumerate"] as const;
const proseExcludedEnvironments = [
  "abstract",
  "figure",
  "figure*",
  "table",
  "table*",
  "tabular",
  "tabularx",
  "lstlisting",
  "minted",
  "verbatim",
  "tikzpicture",
  "equation",
  "equation*",
  "align",
  "align*",
] as const;
const proseExcludedCommands = ["bibliography", "addbibresource", "bibliographystyle"] as const;

function proseExcludedEnvironmentOccurrences(source: string, semantic: string, window: SourceWindow): readonly EnvironmentOccurrence[] {
  return proseExcludedEnvironments.flatMap((environment) => environmentOccurrences(source, semantic, window, environment));
}

function proseListEnvironmentOccurrences(source: string, semantic: string, window: SourceWindow): readonly EnvironmentOccurrence[] {
  return proseListEnvironments.flatMap((environment) => environmentOccurrences(source, semantic, window, environment));
}

type ProseContentEvent =
  | { readonly kind: "list"; readonly position: number; readonly occurrence: EnvironmentOccurrence }
  | {
      readonly kind: "exclude";
      readonly position: number;
      readonly occurrence: SourceOccurrence;
    };

type SourceOccurrence = Pick<EnvironmentOccurrence, "start" | "end">;

function appendProseBlocks(
  state: ProseInventoryState,
  path: string,
  source: string,
  semantic: string,
  start: number,
  end: number,
  listIncludeOccurrences: readonly SourceOccurrence[],
): void {
  const windowSource = source.slice(start, end);
  const windowSemantic = semantic.slice(start, end);
  if (!/\S/u.test(windowSemantic)) return;
  const window = { start: 0, end: windowSemantic.length };
  const lists = proseListEnvironments.flatMap((environment) =>
    environmentOccurrences(windowSource, windowSemantic, window, environment).map((occurrence) => offsetOccurrence(occurrence, start)),
  );
  const excludedEnvironments = proseExcludedEnvironmentOccurrences(windowSource, windowSemantic, window).map((occurrence) =>
    offsetOccurrence(occurrence, start),
  );
  const excludedCommands = commandOccurrences(windowSource, windowSemantic, window, proseExcludedCommands).map((occurrence) =>
    offsetOccurrence(occurrence, start),
  );
  const excludedOccurrences = [
    ...excludedEnvironments,
    ...excludedCommands,
    ...listIncludeOccurrences.filter((occurrence) => occurrenceOverlaps(occurrence, start, end)),
  ];
  const events: ProseContentEvent[] = [
    ...lists.map((occurrence) => ({ kind: "list" as const, position: occurrence.start, occurrence })),
    ...excludedOccurrences.map((occurrence) => ({ kind: "exclude" as const, position: occurrence.start, occurrence })),
  ].sort((left, right) => left.position - right.position || right.occurrence.end - left.occurrence.end);
  let cursor = start;
  for (const event of events) {
    if (event.occurrence.start < cursor) continue;
    appendParagraphBlocks(state, path, source, semantic, cursor, event.occurrence.start);
    if (event.kind === "list") appendListItemBlocks(state, path, source, semantic, event.occurrence, excludedOccurrences);
    cursor = event.occurrence.end;
  }
  appendParagraphBlocks(state, path, source, semantic, cursor, end);
}

function offsetOccurrence<T extends CommandOccurrence | EnvironmentOccurrence>(occurrence: T, offset: number): T {
  return {
    ...occurrence,
    start: occurrence.start + offset,
    end: occurrence.end + offset,
    valueStart: occurrence.valueStart + offset,
    valueEnd: occurrence.valueEnd + offset,
  };
}

function appendParagraphBlocks(
  state: ProseInventoryState,
  path: string,
  source: string,
  semantic: string,
  start: number,
  end: number,
): void {
  const separator = /\r?\n[\t ]*\r?\n+|\\par(?![A-Za-z])/gu;
  separator.lastIndex = start;
  let cursor = start;
  while (cursor < end) {
    const match = nextParagraphSeparator(separator, semantic, end);
    const paragraphEnd = match?.index ?? end;
    appendParagraphBlock(state, path, source, semantic, cursor, paragraphEnd);
    if (!match) break;
    cursor = match.index + match[0].length;
  }
}

function nextParagraphSeparator(pattern: RegExp, semantic: string, end: number): RegExpExecArray | null {
  while (true) {
    const match = pattern.exec(semantic);
    if (!match || match.index >= end) return null;
    if (!match[0].startsWith("\\") || isActiveLatexCommandStart(semantic, match.index)) return match;
  }
}

function appendParagraphBlock(
  state: ProseInventoryState,
  path: string,
  source: string,
  semantic: string,
  start: number,
  end: number,
): void {
  while (start < end && /\s/u.test(semantic[start]!)) start += 1;
  while (end > start && /\s/u.test(semantic[end - 1]!)) end -= 1;
  const itemPattern = /\\item(?![A-Za-z])/gu;
  itemPattern.lastIndex = start;
  const item = nextActiveLatexMatch(itemPattern, semantic);
  if (item && item.index < end) {
    state.diagnostics.push({
      code: "prose-provenance-unavailable",
      severity: "warning",
      message: "Ordinary prose was omitted because an item command occurred outside a recognized list",
      sourcePath: path,
      range: range(path, item.index, item.index + item[0].length),
    });
    return;
  }
  const paragraphSemantic = semantic.slice(start, end);
  const displayMath = displayMathOccurrences(paragraphSemantic);
  if (displayMath.length === 1 && displayMath[0]?.start === 0 && displayMath[0].end === paragraphSemantic.length) return;
  const text = normalizeProseText(paragraphSemantic);
  if (!text) return;
  appendProseBlock(state, path, "paragraph", text, source, start, end);
}

function normalizeProseText(value: string): string {
  return value
    .replaceAll(/\\(?:begin|end)\s*\{[^{}\r\n]+\}/gu, (whole, offset: number) => (isActiveLatexCommandStart(value, offset) ? " " : whole))
    .replace(/^\\[A-Za-z@]+$/u, "")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function appendListItemBlocks(
  state: ProseInventoryState,
  path: string,
  source: string,
  semantic: string,
  list: EnvironmentOccurrence,
  excludedOccurrences: readonly SourceOccurrence[],
  nestingDepth = 1,
): void {
  if (nestingDepth > latexMaximumListNestingDepth) {
    throw new LatexConversionError("provenance-limit", `LaTeX list nesting exceeds ${latexMaximumListNestingDepth} environments`);
  }
  const nestedLists = immediateNestedListOccurrences(source, semantic, list);
  const nestedExcludedOccurrences = excludedOccurrences.filter((excluded) => occurrenceOverlaps(excluded, list.valueStart, list.valueEnd));
  const omittedOccurrences = outermostOccurrences([...nestedLists, ...nestedExcludedOccurrences]);
  const items = listItemOccurrences(semantic, list, omittedOccurrences);
  for (const [index, item] of items.entries()) {
    let end = items[index + 1]?.start ?? list.valueEnd;
    while (end > item.bodyStart && /\s/u.test(semantic[end - 1]!)) end -= 1;
    const itemNestedLists = nestedLists.filter((nested) => nested.start >= item.bodyStart && nested.end <= end);
    const itemOmittedOccurrences = omittedOccurrences.filter((omitted) => occurrenceOverlaps(omitted, item.bodyStart, end));
    const text = normalizeProseText(sourceWithoutOccurrences(semantic, item.bodyStart, end, itemOmittedOccurrences));
    if (text) appendProseBlock(state, path, "list-item", text, source, item.start, end);
    for (const nested of itemNestedLists) {
      if (!itemOmittedOccurrences.includes(nested)) continue;
      const childExcludedOccurrences = nestedExcludedOccurrences.filter((excluded) =>
        occurrenceOverlaps(excluded, nested.valueStart, nested.valueEnd),
      );
      appendListItemBlocks(state, path, source, semantic, nested, childExcludedOccurrences, nestingDepth + 1);
    }
  }
}

interface ProseListItemOccurrence {
  readonly start: number;
  readonly bodyStart: number;
}

function listItemOccurrences(
  semantic: string,
  list: EnvironmentOccurrence,
  omittedOccurrences: readonly SourceOccurrence[],
): ProseListItemOccurrence[] {
  const pattern = /\\item(?![A-Za-z])/gu;
  pattern.lastIndex = list.valueStart;
  const items: ProseListItemOccurrence[] = [];
  while (true) {
    const match = nextTopLevelListItem(pattern, semantic, list.valueEnd, omittedOccurrences);
    if (!match) break;
    const bodyStart = listItemBodyStart(semantic, match.index + match[0].length, list.valueEnd);
    if (bodyStart === null) break;
    pattern.lastIndex = bodyStart;
    items.push({ start: match.index, bodyStart });
  }
  return items;
}

function nextTopLevelListItem(
  pattern: RegExp,
  semantic: string,
  end: number,
  omittedOccurrences: readonly SourceOccurrence[],
): RegExpExecArray | null {
  while (true) {
    const match = nextActiveLatexMatch(pattern, semantic);
    if (!match || match.index >= end) return null;
    if (!omittedOccurrences.some((omitted) => match.index >= omitted.start && match.index < omitted.end)) return match;
  }
}

function listItemBodyStart(semantic: string, start: number, end: number): number | null {
  if (semantic[start] !== "[") return start;
  const optionsEnd = semantic.indexOf("]", start + 1);
  return optionsEnd < 0 || optionsEnd >= end ? null : optionsEnd + 1;
}

function immediateNestedListOccurrences(source: string, semantic: string, list: EnvironmentOccurrence): readonly EnvironmentOccurrence[] {
  const window = { start: list.valueStart, end: list.valueEnd };
  const nested = proseListEnvironments
    .flatMap((environment) => environmentOccurrences(source, semantic, window, environment))
    .sort((left, right) => left.start - right.start || right.end - left.end);
  return outermostOccurrences(nested);
}

function outermostOccurrences<Occurrence extends SourceOccurrence>(occurrences: readonly Occurrence[]): readonly Occurrence[] {
  const outermost: Occurrence[] = [];
  let coveredUntil = -1;
  for (const occurrence of [...occurrences].sort((left, right) => left.start - right.start || right.end - left.end)) {
    if (occurrence.end <= coveredUntil) continue;
    outermost.push(occurrence);
    coveredUntil = occurrence.end;
  }
  return outermost;
}

function occurrenceOverlaps(occurrence: SourceOccurrence, start: number, end: number): boolean {
  return occurrence.end > start && occurrence.start < end;
}

function occurrenceContains(occurrence: SourceOccurrence, start: number, end: number): boolean {
  return occurrence.start <= start && occurrence.end >= end;
}

function occurrenceContainsAny(occurrences: readonly SourceOccurrence[], start: number, end: number): boolean {
  return occurrences.some((occurrence) => occurrenceContains(occurrence, start, end));
}

function sourceWithoutOccurrences(source: string, start: number, end: number, occurrences: readonly SourceOccurrence[]): string {
  const parts: string[] = [];
  let cursor = start;
  for (const occurrence of occurrences) {
    if (occurrence.end <= cursor) continue;
    if (occurrence.start < cursor) {
      cursor = Math.min(occurrence.end, end);
      continue;
    }
    parts.push(source.slice(cursor, occurrence.start), " ");
    cursor = Math.min(occurrence.end, end);
  }
  parts.push(source.slice(cursor, end));
  return parts.join("");
}

function appendProseBlock(
  state: ProseInventoryState,
  path: string,
  kind: LatexProseBlockInventory["kind"],
  text: string,
  source: string,
  start: number,
  end: number,
): void {
  const retainedProvenanceCodeUnits = end - start + text.length;
  if (state.retainedProvenanceCodeUnits + retainedProvenanceCodeUnits > latexMaximumProseProvenanceCodeUnits) {
    throw new LatexConversionError(
      "provenance-limit",
      `LaTeX prose provenance exceeds ${latexMaximumProseProvenanceCodeUnits} retained UTF-16 code units`,
    );
  }
  const localIndex = (state.localCounts.get(path) ?? 0) + 1;
  if (state.blocks.length >= state.maximumBlocks) {
    throw new LatexConversionError(
      "semantic-record-limit",
      `LaTeX conversion exceeds the semantic record limit of ${state.semanticRecordLimit}`,
    );
  }
  state.retainedProvenanceCodeUnits += retainedProvenanceCodeUnits;
  state.localCounts.set(path, localIndex);
  state.blocks.push({
    id: `${path}#prose-${localIndex}`,
    kind,
    sectionId: state.sectionId,
    text,
    source: source.slice(start, end),
    range: range(path, start, end),
  });
}

function figureInventory(
  inspection: LatexArchiveInspection,
  report: LatexConversionReport,
  projectionsFor: (file: LatexArchiveFile) => SourceProjections,
): LatexFigureInventory[] {
  const state: FigureInventoryState = {
    inspection,
    rootPath: report.rootPath,
    projectionsFor,
    imageFiles: new Map(inspection.files.filter((file) => file.kind === "image").map((file) => [file.path, file])),
    sourceContexts: new Map(),
    contentHashes: new Map(),
    destinations: new Map(),
    retainedProvenanceCodeUnits: 0,
  };
  return resolveLatexImageReferences(inspection, report.rootPath, report.sourceFiles).map((reference) =>
    figureForReference(state, reference),
  );
}

interface FigureSourceContext {
  readonly source: string;
  readonly figures: readonly EnvironmentOccurrence[];
  readonly starredFigures: readonly EnvironmentOccurrence[];
  readonly captions: readonly CommandOccurrence[];
  readonly labels: readonly CommandOccurrence[];
}

interface FigureInventoryState {
  readonly inspection: LatexArchiveInspection;
  readonly rootPath: string;
  readonly projectionsFor: (file: LatexArchiveFile) => SourceProjections;
  readonly imageFiles: ReadonlyMap<string, LatexArchiveFile>;
  readonly sourceContexts: Map<string, FigureSourceContext>;
  readonly contentHashes: Map<string, string>;
  readonly destinations: Map<string, { readonly contentHash: string; readonly path: string }>;
  retainedProvenanceCodeUnits: number;
}

interface FigureAsset {
  readonly archivePath: string | null;
  readonly assetPath: string | null;
  readonly contentHash: string | null;
  readonly collision: boolean;
  readonly resolvedAssetPath: string | null;
}

function figureForReference(state: FigureInventoryState, reference: LatexImageReferenceResolution): LatexFigureInventory {
  const { sourcePath, requestedPath, start, end } = reference;
  const context = figureContextFor(state, sourcePath);
  const asset = resolveFigureAsset(state, reference);
  const enclosing = enclosingOccurrence(context.figures, start, end) ?? enclosingOccurrence(context.starredFigures, start, end);
  const captionCommand = enclosing ? firstCommandInWindow(context.captions, enclosing) : undefined;
  const labelCommand = enclosing ? firstCommandInWindow(context.labels, enclosing) : undefined;
  const retainedProvenanceCodeUnits =
    end -
    start +
    (captionCommand ? captionCommand.end - captionCommand.start + captionCommand.valueEnd - captionCommand.valueStart : 0) +
    (labelCommand ? labelCommand.end - labelCommand.start + labelCommand.valueEnd - labelCommand.valueStart : 0) +
    (enclosing ? enclosing.end - enclosing.start : 0);
  if (state.retainedProvenanceCodeUnits + retainedProvenanceCodeUnits > latexMaximumFigureProvenanceCodeUnits) {
    throw new LatexConversionError(
      "provenance-limit",
      `LaTeX figure provenance exceeds ${latexMaximumFigureProvenanceCodeUnits} retained UTF-16 code units`,
    );
  }
  state.retainedProvenanceCodeUnits += retainedProvenanceCodeUnits;
  return {
    sourcePath,
    requestedPath,
    archivePath: asset.archivePath,
    resolvedAssetPath: asset.resolvedAssetPath,
    contentHash: asset.contentHash,
    mediaType: asset.archivePath ? imageMediaType(asset.archivePath) : null,
    ...(captionCommand ? { caption: sourcedCommand(sourcePath, captionCommand) } : {}),
    ...(labelCommand ? { label: sourcedCommand(sourcePath, labelCommand) } : {}),
    source: context.source.slice(start, end),
    referenceRange: range(sourcePath, start, end),
    ...(enclosing
      ? {
          figureSource: context.source.slice(enclosing.start, enclosing.end),
          figureRange: range(sourcePath, enclosing.start, enclosing.end),
        }
      : {}),
    resolutionDiagnostics: figureResolutionDiagnostics(reference, asset),
  };
}

function figureContextFor(state: FigureInventoryState, path: string): FigureSourceContext {
  const existing = state.sourceContexts.get(path);
  if (existing) return existing;
  const file = requiredTextFile(state.inspection.files, path);
  const source = file.text ?? "";
  const semantic = state.projectionsFor(file).semantic;
  const window = sourceWindow(path, state.rootPath, source, semantic);
  const context: FigureSourceContext = {
    source,
    figures: environmentOccurrences(source, semantic, window, "figure"),
    starredFigures: environmentOccurrences(source, semantic, window, "figure*"),
    captions: commandOccurrences(source, semantic, window, ["caption"]),
    labels: commandOccurrences(source, semantic, window, ["label"]),
  };
  state.sourceContexts.set(path, context);
  return context;
}

function resolveFigureAsset(state: FigureInventoryState, reference: LatexImageReferenceResolution): FigureAsset {
  const archivePath = reference.candidates.length === 1 ? reference.candidates[0]! : null;
  const image = archivePath ? state.imageFiles.get(archivePath) : undefined;
  const assetPath = archivePath ? figureAssetPath(archivePath) : null;
  const contentHash = image ? imageContentHash(state, image) : null;
  const destinationKey = assetPath?.toLowerCase();
  const existing = destinationKey ? state.destinations.get(destinationKey) : undefined;
  const collision = Boolean(existing && contentHash && existing.contentHash !== contentHash);
  if (destinationKey && assetPath && contentHash && !existing) {
    state.destinations.set(destinationKey, { contentHash, path: assetPath });
  }
  return {
    archivePath,
    assetPath,
    contentHash,
    collision,
    resolvedAssetPath: collision ? null : (existing?.path ?? assetPath),
  };
}

function figureAssetPath(archivePath: string): string {
  return archivePath.startsWith("figures/") ? archivePath : `figures/${archivePath.split("/").at(-1)!}`;
}

function imageContentHash(state: FigureInventoryState, image: LatexArchiveFile): string {
  const existing = state.contentHashes.get(image.path);
  if (existing) return existing;
  const contentHash = sha256Hex(image.bytes);
  state.contentHashes.set(image.path, contentHash);
  return contentHash;
}

function figureResolutionDiagnostics(
  reference: LatexImageReferenceResolution,
  asset: FigureAsset,
): LatexFigureInventory["resolutionDiagnostics"] {
  if (reference.candidates.length === 0) {
    return [{ code: "missing-image", severity: "warning", message: `Referenced figure was not found: ${reference.requestedPath}` }];
  }
  if (reference.candidates.length > 1) {
    return [
      {
        code: "ambiguous-image",
        severity: "warning",
        message: `Referenced figure matches more than one archive file: ${reference.requestedPath}`,
      },
    ];
  }
  return asset.collision
    ? [{ code: "ambiguous-image", severity: "warning", message: `Referenced figures collide at project path: ${asset.assetPath}` }]
    : [];
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

const imageMediaTypes = new Map<string, NonNullable<LatexFigureInventory["mediaType"]>>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
]);

function imageMediaType(path: string): NonNullable<LatexFigureInventory["mediaType"]> {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  return imageMediaTypes.get(extension) ?? "image/svg+xml";
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

const sectionNames = ["section", "subsection", "subsubsection", "paragraph"] as const;
type SectionLevel = 1 | 2 | 3 | 4;

const sectionLevels = new Map<string, SectionLevel>([
  ["section", 1],
  ["subsection", 2],
  ["subsubsection", 3],
  ["paragraph", 4],
]);

interface SectionInventoryState {
  readonly inspection: LatexArchiveInspection;
  readonly rootPath: string;
  readonly semanticFor: (file: LatexArchiveFile) => string;
  readonly parents: Map<number, string>;
  readonly reachable: ReadonlySet<string>;
  readonly includesBySource: ReadonlyMap<string, readonly LatexIncludeReference[]>;
  readonly visited: Set<string>;
  readonly sections: LatexSectionInventory[];
}

interface SectionSourceContext {
  readonly path: string;
  readonly source: string;
  readonly semantic: string;
  readonly window: SourceWindow;
  readonly labelsByStart: ReadonlyMap<number, CommandOccurrence>;
}

type SectionEvent =
  | { readonly kind: "section"; readonly position: number; readonly command: CommandOccurrence; readonly localIndex: number }
  | { readonly kind: "include"; readonly position: number; readonly reference: LatexIncludeReference };

function manuscriptSectionInventory(
  inspection: LatexArchiveInspection,
  report: LatexConversionReport,
  semanticFor: (file: LatexArchiveFile) => string,
): LatexSectionInventory[] {
  const state: SectionInventoryState = {
    inspection,
    rootPath: report.rootPath,
    semanticFor,
    parents: new Map(),
    reachable: new Set(report.sourceFiles),
    includesBySource: includesBySourcePath(inspection.includes),
    visited: new Set(),
    sections: [],
  };
  visitSectionSource(state, report.rootPath);
  return state.sections;
}

function includesBySourcePath(references: readonly LatexIncludeReference[]): ReadonlyMap<string, readonly LatexIncludeReference[]> {
  const includes = new Map<string, LatexIncludeReference[]>();
  for (const reference of references) {
    const grouped = includes.get(reference.sourcePath);
    if (grouped) grouped.push(reference);
    else includes.set(reference.sourcePath, [reference]);
  }
  return includes;
}

function beginSourceVisit(
  state: {
    readonly inspection: LatexArchiveInspection;
    readonly semanticFor: (file: LatexArchiveFile) => string;
    readonly visited: Set<string>;
    readonly reachable: ReadonlySet<string>;
  },
  path: string,
): { readonly source: string; readonly semantic: string } | null {
  if (state.visited.has(path) || !state.reachable.has(path)) return null;
  state.visited.add(path);
  const file = requiredTextFile(state.inspection.files, path);
  return { source: file.text ?? "", semantic: state.semanticFor(file) };
}

function visitSectionSource(state: SectionInventoryState, path: string): void {
  const sourceVisit = beginSourceVisit(state, path);
  if (!sourceVisit) return;
  const { source, semantic } = sourceVisit;
  const window = sourceWindow(path, state.rootPath, source, semantic);
  const context: SectionSourceContext = {
    path,
    source,
    semantic,
    window,
    labelsByStart: new Map(commandOccurrences(source, semantic, window, ["label"]).map((label) => [label.start, label])),
  };
  for (const event of sectionEvents(state, context)) {
    if (event.kind === "section") appendSection(state, context, event);
    else if (event.reference.resolvedPath) visitSectionSource(state, event.reference.resolvedPath);
  }
}

function sectionEvents(state: SectionInventoryState, context: SectionSourceContext): SectionEvent[] {
  const excludedEnvironments = proseExcludedEnvironmentOccurrences(context.source, context.semantic, context.window);
  const listEnvironments = proseListEnvironmentOccurrences(context.source, context.semantic, context.window);
  const sections: SectionEvent[] = commandOccurrences(context.source, context.semantic, context.window, sectionNames)
    .filter((command) => !occurrenceContainsAny(excludedEnvironments, command.start, command.end))
    .map((command, localIndex) => ({
      kind: "section",
      position: command.start,
      command,
      localIndex,
    }));
  const includes: SectionEvent[] = (state.includesBySource.get(context.path) ?? [])
    .filter((reference) => isReachableInclude(reference, context.path, context.window, state.reachable))
    .filter((reference) => !occurrenceContainsAny(excludedEnvironments, reference.from, reference.to))
    .filter((reference) => !occurrenceContainsAny(listEnvironments, reference.from, reference.to))
    .map((reference) => ({ kind: "include", position: reference.from, reference }));
  return [...sections, ...includes].sort((left, right) => left.position - right.position || (left.kind === "section" ? -1 : 1));
}

function isReachableInclude(
  reference: LatexIncludeReference,
  sourcePath: string,
  window: SourceWindow,
  reachable: ReadonlySet<string>,
): boolean {
  return (
    reference.sourcePath === sourcePath &&
    reference.from >= window.start &&
    reference.to <= window.end &&
    reference.resolvedPath !== null &&
    reachable.has(reference.resolvedPath)
  );
}

function appendSection(
  state: SectionInventoryState,
  context: SectionSourceContext,
  event: Extract<SectionEvent, { readonly kind: "section" }>,
): void {
  const { command, localIndex } = event;
  const level = sectionLevels.get(command.name)!;
  clearSectionParentsAtOrBelow(state.parents, level);
  const parentId = closestSectionParent(state.parents, level);
  const id = `${context.path}#section-${localIndex + 1}`;
  state.parents.set(level, id);
  const label = context.labelsByStart.get(skipWhitespace(context.semantic, command.end, context.semantic.length));
  const end = label?.end ?? command.end;
  state.sections.push({
    id,
    parentId,
    level,
    title: command.value.trim(),
    ...(label?.value.trim() ? { label: label.value.trim() } : {}),
    source: context.source.slice(command.start, end),
    range: range(context.path, command.start, end),
  });
}

function clearSectionParentsAtOrBelow(parents: Map<number, string>, level: SectionLevel): void {
  for (const prior of parents.keys()) {
    if (prior >= level) parents.delete(prior);
  }
}

function closestSectionParent(parents: ReadonlyMap<number, string>, level: SectionLevel): string | null {
  for (let prior = level - 1; prior >= 1; prior -= 1) {
    const parent = parents.get(prior);
    if (parent) return parent;
  }
  return null;
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
  for (const key of citationKeys(value)) {
    keys.push(key);
    if (keys.length > latexMaximumCitationKeys) {
      throw new LatexConversionError("semantic-record-limit", `LaTeX citation exceeds ${latexMaximumCitationKeys} keys`);
    }
  }
  return keys;
}

function* citationKeys(value: string): Generator<string> {
  for (const match of value.matchAll(/(?:^|,)([^,]*)/gu)) {
    const key = (match[1] ?? "").trim();
    if (key) yield key;
  }
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
  const delimiter: BibtexDelimiterState = { depth: 0, braceDepth: 0 };
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
    updateBibtexDelimiter(delimiter, opening, closing, character);
    if (delimiter.depth === 0) return index;
  }
  return -1;
}

interface BibtexDelimiterState {
  depth: number;
  braceDepth: number;
}

function updateBibtexDelimiter(state: BibtexDelimiterState, opening: string, closing: string, character: string | undefined): void {
  if (opening === "(" && character === "{") {
    state.braceDepth += 1;
    return;
  }
  if (opening === "(" && character === "}" && state.braceDepth > 0) {
    state.braceDepth -= 1;
    return;
  }
  if (state.braceDepth > 0) return;
  if (character === opening) state.depth += 1;
  else if (character === closing) state.depth -= 1;
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
    const match = nextActiveLatexMatch(pattern, active);
    if (!match || match.index >= window.end) break;
    const result = commandOccurrenceAt(source, active, match, window.end);
    if (result.kind === "stop") break;
    if (result.kind === "skip") {
      pattern.lastIndex = Math.max(pattern.lastIndex, result.next);
      continue;
    }
    occurrences.push(result.occurrence);
    pattern.lastIndex = result.occurrence.end;
  }
  return occurrences;
}

type CommandOccurrenceResult =
  | { readonly kind: "found"; readonly occurrence: CommandOccurrence }
  | { readonly kind: "skip"; readonly next: number }
  | { readonly kind: "stop" };

function commandOccurrenceAt(source: string, active: string, match: RegExpExecArray, windowEnd: number): CommandOccurrenceResult {
  const matchEnd = match.index + match[0].length;
  const argument = commandArgument(active, matchEnd + (active[matchEnd] === "*" ? 1 : 0), windowEnd);
  if (argument.kind === "malformed") return { kind: "stop" };
  if (argument.kind === "absent") return { kind: "skip", next: argument.next };
  const close = matchingDelimiter(active, argument.open, "{", "}");
  if (close < 0 || close >= windowEnd) return { kind: "stop" };
  return {
    kind: "found",
    occurrence: {
      name: match[1] ?? "",
      source: source.slice(match.index, close + 1),
      value: source.slice(argument.open + 1, close),
      start: match.index,
      end: close + 1,
      valueStart: argument.open + 1,
      valueEnd: close,
    },
  };
}

function environmentOccurrences(source: string, active: string, window: SourceWindow, environment: string): EnvironmentOccurrence[] {
  const escaped = environment.replaceAll("*", "\\*");
  const begin = new RegExp(`\\\\begin\\s*\\{${escaped}\\}`, "gu");
  begin.lastIndex = window.start;
  const occurrences: EnvironmentOccurrence[] = [];
  while (true) {
    const open = nextActiveLatexMatch(begin, active);
    if (!open || open.index >= window.end) break;
    let valueStart = open.index + open[0].length;
    let options: string | undefined;
    if (active[valueStart] === "[") {
      const optionsEnd = active.indexOf("]", valueStart + 1);
      if (optionsEnd < 0 || optionsEnd >= window.end) break;
      options = source.slice(valueStart + 1, optionsEnd);
      valueStart = optionsEnd + 1;
    }
    const close = matchingEnvironmentEnd(active, escaped, valueStart, window.end);
    if (!close || close.index + close[0].length > window.end) break;
    const wholeEnd = close.index + close[0].length;
    occurrences.push({
      source: source.slice(open.index, wholeEnd),
      value: source.slice(valueStart, close.index),
      start: open.index,
      end: wholeEnd,
      valueStart,
      valueEnd: close.index,
      ...(options !== undefined ? { options } : {}),
    });
    begin.lastIndex = wholeEnd;
  }
  return occurrences;
}

function matchingEnvironmentEnd(source: string, escapedEnvironment: string, start: number, end: number): RegExpExecArray | null {
  const boundary = new RegExp(`\\\\(begin|end)\\s*\\{${escapedEnvironment}\\}`, "gu");
  boundary.lastIndex = start;
  let depth = 1;
  while (true) {
    const match = nextActiveLatexMatch(boundary, source);
    if (!match || match.index + match[0].length > end) return null;
    depth += match[1] === "begin" ? 1 : -1;
    if (depth === 0) return match;
  }
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

function sourceWindow(path: string, rootPath: string, source: string, semantic: string): SourceWindow {
  return path === rootPath ? latexDocumentWindow(source, semantic) : { start: 0, end: source.length };
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
