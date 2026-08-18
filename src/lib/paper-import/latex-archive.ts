import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import { comparePortableText, normalizePortablePath, resolvePortablePath } from "./portable-path";
import { structuralLatexSource } from "./latex-source";

export const latexArchiveMaximumCompressedBytes = 20 * 1024 * 1024;
export const latexArchiveMaximumExpandedBytes = 64 * 1024 * 1024;
export const latexArchiveMaximumEntries = 1_024;
export const latexArchiveMaximumPathCodeUnits = 1_024;
export const latexArchiveMaximumPathSegments = 64;
export const latexArchiveMaximumStructuralRecords = 10_000;
export const latexArchiveMaximumTextBytes = 2 * 1024 * 1024;

export interface LatexArchiveLimits {
  readonly maximumCompressedBytes?: number;
  readonly maximumExpandedBytes?: number;
  readonly maximumEntries?: number;
  readonly maximumStructuralRecords?: number;
  readonly maximumTextBytes?: number;
}

export type LatexArchiveFileKind = "tex" | "bibtex" | "image" | "ignored";

export type LatexImportDiagnosticCode =
  | "ambiguous-root"
  | "include-cycle"
  | "ambiguous-image"
  | "invalid-bibliography-selection"
  | "invalid-root-selection"
  | "missing-bibliography"
  | "missing-include"
  | "missing-image"
  | "missing-root"
  | "tikz-preserved"
  | "tikz-translated"
  | "unsupported-command"
  | "unsupported-environment"
  | "unsafe-bibliography"
  | "unsafe-include"
  | "unreferenced-bibliography";

export interface LatexImportDiagnostic {
  readonly code: LatexImportDiagnosticCode;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly path?: string;
  readonly from?: number;
  readonly to?: number;
}

export interface LatexArchiveFile {
  readonly path: string;
  readonly kind: LatexArchiveFileKind;
  readonly bytes: Uint8Array;
  readonly text?: string;
}

export interface LatexIncludeReference {
  readonly sourcePath: string;
  readonly requestedPath: string;
  readonly resolvedPath: string | null;
  readonly from: number;
  readonly to: number;
}

export interface LatexBibliographyReference {
  readonly sourcePath: string;
  readonly requestedPath: string;
  readonly resolvedPath: string | null;
  readonly from: number;
  readonly to: number;
}

export interface LatexArchiveInspection {
  readonly files: readonly LatexArchiveFile[];
  readonly rootCandidates: readonly string[];
  readonly selectedRoot: string | null;
  readonly includes: readonly LatexIncludeReference[];
  readonly bibliographies: readonly LatexBibliographyReference[];
  readonly diagnostics: readonly LatexImportDiagnostic[];
}

export type LatexArchiveFailureCode =
  | "archive-encrypted"
  | "archive-expanded-size"
  | "archive-format"
  | "archive-invalid-limits"
  | "archive-path"
  | "archive-size"
  | "archive-structural-record-limit"
  | "archive-symlink"
  | "archive-text-encoding"
  | "archive-text-size"
  | "archive-too-many-entries"
  | "archive-unsupported-compression";

export class LatexArchiveFailure extends Error {
  readonly code: LatexArchiveFailureCode;

  constructor(code: LatexArchiveFailureCode, message: string) {
    super(message);
    this.name = "LatexArchiveFailure";
    this.code = code;
  }
}

interface CentralDirectoryEntry {
  readonly path: string;
  readonly directory: boolean;
  readonly compression: number;
  readonly compressedSize: number;
  readonly expandedSize: number;
}

interface CentralDirectoryHeader {
  readonly endOffset: number;
  readonly offset: number;
  readonly size: number;
  readonly totalEntries: number;
}

interface ParsedCentralDirectoryEntry {
  readonly entry: CentralDirectoryEntry;
  readonly hostSystem: number;
  readonly next: number;
  readonly unixMode: number;
}

interface EffectiveLatexArchiveLimits {
  readonly maximumCompressedBytes: number;
  readonly maximumExpandedBytes: number;
  readonly maximumEntries: number;
  readonly maximumStructuralRecords: number;
  readonly maximumTextBytes: number;
}

const supportedImages = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const unsafeUnzipResultPaths = new Set(["__proto__"]);
const maximumExpansionRatio = 1_000;
const expansionRatioMinimumBytes = 1024 * 1024;
const archiveExpansionInputChunkBytes = 1_024;
const documentBeginPattern = /\\begin\s*\{document\}/u;
const latexWhitespace = /\s/u;

interface LatexCommandArgumentOccurrence {
  readonly start: number;
  readonly end: number;
  readonly argument: string;
}

interface LatexCommandSpec {
  readonly name: string;
  readonly optionalArgument?: boolean;
}

interface LatexDelimitedGroup {
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly end: number;
}

type ParsedLatexCommandArgument =
  | { readonly kind: "argument"; readonly group: LatexDelimitedGroup }
  | { readonly kind: "skip"; readonly next: number }
  | { readonly kind: "stop" };

function resolveArchiveLimits(limits: LatexArchiveLimits): EffectiveLatexArchiveLimits {
  return {
    maximumCompressedBytes: tightenedLimit(limits.maximumCompressedBytes, latexArchiveMaximumCompressedBytes, "maximumCompressedBytes"),
    maximumExpandedBytes: tightenedLimit(limits.maximumExpandedBytes, latexArchiveMaximumExpandedBytes, "maximumExpandedBytes"),
    maximumEntries: tightenedLimit(limits.maximumEntries, latexArchiveMaximumEntries, "maximumEntries"),
    maximumStructuralRecords: tightenedLimit(
      limits.maximumStructuralRecords,
      latexArchiveMaximumStructuralRecords,
      "maximumStructuralRecords",
    ),
    maximumTextBytes: tightenedLimit(limits.maximumTextBytes, latexArchiveMaximumTextBytes, "maximumTextBytes"),
  };
}

function tightenedLimit(value: number | undefined, hardMaximum: number, name: keyof LatexArchiveLimits): number {
  if (value === undefined) return hardMaximum;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new LatexArchiveFailure("archive-invalid-limits", `${name} must be a positive safe integer`);
  }
  return Math.min(value, hardMaximum);
}

export async function inspectLatexArchive(bytes: Uint8Array, limits: LatexArchiveLimits = {}): Promise<LatexArchiveInspection> {
  const effectiveLimits = resolveArchiveLimits(limits);
  if (bytes.byteLength === 0 || bytes.byteLength > effectiveLimits.maximumCompressedBytes) {
    throw new LatexArchiveFailure(
      "archive-size",
      effectiveLimits.maximumCompressedBytes === latexArchiveMaximumCompressedBytes
        ? "LaTeX archive must be between 1 byte and 20 MiB"
        : `LaTeX archive exceeds the configured compressed-size limit of ${effectiveLimits.maximumCompressedBytes} bytes`,
    );
  }
  const centralEntries = readCentralDirectory(bytes, effectiveLimits);
  const extracted = expandArchive(bytes, centralEntries, effectiveLimits);
  let actualExpandedBytes = 0;
  const files = centralEntries
    .filter((entry) => !entry.directory)
    .map((entry): LatexArchiveFile => {
      const contents = extractedArchiveEntry(extracted, entry.path);
      actualExpandedBytes += contents.byteLength;
      if (actualExpandedBytes > effectiveLimits.maximumExpandedBytes) {
        throw new LatexArchiveFailure("archive-expanded-size", expandedSizeMessage(effectiveLimits.maximumExpandedBytes));
      }
      if (hasExcessiveExpansionRatio(entry.compressedSize, contents.byteLength)) {
        throw new LatexArchiveFailure("archive-expanded-size", `ZIP entry has an excessive expansion ratio: ${entry.path}`);
      }
      const kind = archiveFileKind(entry.path);
      if (kind !== "tex" && kind !== "bibtex") return { path: entry.path, kind, bytes: contents };
      if (contents.byteLength > effectiveLimits.maximumTextBytes) {
        throw new LatexArchiveFailure("archive-text-size", textLimitMessage(entry.path, effectiveLimits.maximumTextBytes));
      }
      return { path: entry.path, kind, bytes: contents, text: decodeArchiveText(contents, entry.path) };
    })
    .sort((left, right) => comparePortableText(left.path, right.path));
  return analyzeLatexArchiveFilesWithLimit(files, effectiveLimits.maximumStructuralRecords);
}

export function analyzeLatexArchiveFiles(files: readonly LatexArchiveFile[]): LatexArchiveInspection {
  return analyzeLatexArchiveFilesWithLimit(files, latexArchiveMaximumStructuralRecords);
}

function analyzeLatexArchiveFilesWithLimit(files: readonly LatexArchiveFile[], maximumStructuralRecords: number): LatexArchiveInspection {
  let structuralRecords = 0;
  const acceptStructuralRecord = (): void => {
    structuralRecords += 1;
    if (structuralRecords > maximumStructuralRecords) {
      throw new LatexArchiveFailure(
        "archive-structural-record-limit",
        `LaTeX archive exceeds the structural record limit of ${maximumStructuralRecords}`,
      );
    }
  };
  const texFiles = files.filter((file) => file.kind === "tex" && file.text !== undefined);
  const texPaths = new Set(texFiles.map((file) => file.path));
  const bibtexPaths = new Set(files.filter((file) => file.kind === "bibtex").map((file) => file.path));
  const rootCandidates = texFiles
    .filter((file) => {
      const active = structuralLatexSource(file.text ?? "");
      return hasDocumentClass(active) && documentBeginPattern.test(active);
    })
    .map((file) => file.path)
    .sort(comparePortableText);
  const includes = texFiles.flatMap((file) => latexIncludes(file, texPaths, acceptStructuralRecord));
  const bibliographies = texFiles.flatMap((file) => latexBibliographies(file, bibtexPaths, acceptStructuralRecord));
  const diagnostics: LatexImportDiagnostic[] = [];
  for (const diagnostic of archiveDiagnostics(rootCandidates, includes, bibliographies, bibtexPaths)) {
    acceptStructuralRecord();
    diagnostics.push(diagnostic);
  }
  return {
    files,
    rootCandidates,
    selectedRoot: rootCandidates.length === 1 ? rootCandidates[0]! : null,
    includes,
    bibliographies,
    diagnostics,
  };
}

function* archiveDiagnostics(
  rootCandidates: readonly string[],
  includes: readonly LatexIncludeReference[],
  bibliographies: readonly LatexBibliographyReference[],
  bibtexPaths: ReadonlySet<string>,
): Generator<LatexImportDiagnostic> {
  const rootDiagnostic = rootCandidateDiagnostic(rootCandidates);
  if (rootDiagnostic) yield rootDiagnostic;
  yield* unresolvedReferenceDiagnostics(includes, "include");
  yield* unresolvedReferenceDiagnostics(bibliographies, "bibliography");
  yield* unreferencedBibliographyDiagnostics(bibliographies, bibtexPaths);
}

function rootCandidateDiagnostic(rootCandidates: readonly string[]): LatexImportDiagnostic | null {
  if (rootCandidates.length === 0) {
    return { code: "missing-root", severity: "error", message: "No LaTeX root document was found" };
  }
  return rootCandidates.length > 1
    ? {
        code: "ambiguous-root",
        severity: "error",
        message: `Choose one of ${rootCandidates.length} LaTeX root documents`,
      }
    : null;
}

function* unresolvedReferenceDiagnostics(
  references: readonly (LatexIncludeReference | LatexBibliographyReference)[],
  kind: "bibliography" | "include",
): Generator<LatexImportDiagnostic> {
  for (const reference of references) {
    if (reference.resolvedPath) continue;
    const unsafe = !safeArchiveReference(reference.sourcePath, reference.requestedPath);
    const label = kind === "include" ? "Included LaTeX file" : "Bibliography file";
    yield {
      code: unsafe ? `unsafe-${kind}` : `missing-${kind}`,
      severity: "error",
      message: unsafe
        ? `${kind === "include" ? "Include" : "Bibliography"} escapes or uses an unsafe archive path: ${reference.requestedPath}`
        : `${label} was not found: ${reference.requestedPath}`,
      path: reference.sourcePath,
      from: reference.from,
      to: reference.to,
    };
  }
}

function* unreferencedBibliographyDiagnostics(
  bibliographies: readonly LatexBibliographyReference[],
  bibtexPaths: ReadonlySet<string>,
): Generator<LatexImportDiagnostic> {
  const referencedBibliographies = new Set(bibliographies.flatMap((reference) => (reference.resolvedPath ? [reference.resolvedPath] : [])));
  for (const path of [...bibtexPaths].sort(comparePortableText)) {
    if (referencedBibliographies.has(path)) continue;
    yield {
      code: "unreferenced-bibliography",
      severity: "warning",
      message: `Bibliography is present but not referenced by a LaTeX file: ${path}`,
      path,
    };
  }
}

function readCentralDirectory(bytes: Uint8Array, limits: EffectiveLatexArchiveLimits): readonly CentralDirectoryEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const directory = centralDirectoryHeader(view, limits.maximumEntries);
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  const paths = new Set<string>();
  const entries: CentralDirectoryEntry[] = [];
  let expandedBytes = 0;
  let cursor = directory.offset;
  for (let index = 0; index < directory.totalEntries; index += 1) {
    const parsed = centralDirectoryEntry(view, bytes, cursor, directory.endOffset, decoder);
    expandedBytes = acceptCentralDirectoryEntry(parsed, paths, expandedBytes, limits.maximumExpandedBytes);
    const kind = archiveFileKind(parsed.entry.path);
    if (!parsed.entry.directory && (kind === "tex" || kind === "bibtex") && parsed.entry.expandedSize > limits.maximumTextBytes) {
      throw new LatexArchiveFailure("archive-text-size", textLimitMessage(parsed.entry.path, limits.maximumTextBytes));
    }
    entries.push(parsed.entry);
    cursor = parsed.next;
  }
  if (cursor !== directory.offset + directory.size) {
    throw new LatexArchiveFailure("archive-format", "ZIP central-directory size is invalid");
  }
  return entries;
}

function centralDirectoryHeader(view: DataView, maximumEntries: number): CentralDirectoryHeader {
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0 || eocdOffset + 22 > view.byteLength) throw new LatexArchiveFailure("archive-format", "Invalid ZIP archive");
  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const diskEntries = view.getUint16(eocdOffset + 8, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    throw new LatexArchiveFailure("archive-format", "Multi-disk ZIP archives are not supported");
  }
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new LatexArchiveFailure("archive-format", "ZIP64 archives are not supported");
  }
  if (totalEntries === 0 || totalEntries > maximumEntries) {
    throw new LatexArchiveFailure(
      "archive-too-many-entries",
      maximumEntries === latexArchiveMaximumEntries
        ? "LaTeX archive must contain 1–1,024 entries"
        : `LaTeX archive exceeds the configured limit of ${maximumEntries} entries`,
    );
  }
  if (centralOffset + centralSize > eocdOffset) throw new LatexArchiveFailure("archive-format", "Invalid ZIP central directory");
  return { endOffset: eocdOffset, offset: centralOffset, size: centralSize, totalEntries };
}

function centralDirectoryEntry(
  view: DataView,
  bytes: Uint8Array,
  cursor: number,
  endOffset: number,
  decoder: TextDecoder,
): ParsedCentralDirectoryEntry {
  if (cursor + 46 > endOffset || view.getUint32(cursor, true) !== 0x02014b50) {
    throw new LatexArchiveFailure("archive-format", "Invalid ZIP central-directory entry");
  }
  const flags = view.getUint16(cursor + 8, true);
  const compression = view.getUint16(cursor + 10, true);
  const compressedSize = view.getUint32(cursor + 20, true);
  const expandedSize = view.getUint32(cursor + 24, true);
  const filenameLength = view.getUint16(cursor + 28, true);
  const next = cursor + 46 + filenameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  if (next > endOffset) throw new LatexArchiveFailure("archive-format", "Truncated ZIP central-directory entry");
  if ((flags & 1) !== 0) throw new LatexArchiveFailure("archive-encrypted", "Encrypted ZIP entries are not supported");
  if (compression !== 0 && compression !== 8) {
    throw new LatexArchiveFailure("archive-unsupported-compression", "ZIP entries must use store or deflate compression");
  }
  const rawPath = decodeArchivePath(decoder, bytes.subarray(cursor + 46, cursor + 46 + filenameLength));
  const directory = rawPath.endsWith("/");
  const path = validateArchivePath(directory ? rawPath.slice(0, -1) : rawPath);
  return {
    entry: { path: directory ? `${path}/` : path, directory, compression, compressedSize, expandedSize },
    hostSystem: view.getUint16(cursor + 4, true) >>> 8,
    next,
    unixMode: view.getUint32(cursor + 38, true) >>> 16,
  };
}

function decodeArchivePath(decoder: TextDecoder, bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new LatexArchiveFailure("archive-path", "ZIP entry names must be UTF-8");
  }
}

function acceptCentralDirectoryEntry(
  parsed: ParsedCentralDirectoryEntry,
  paths: Set<string>,
  expandedBytes: number,
  maximumExpandedBytes: number,
): number {
  const { compressedSize, expandedSize } = parsed.entry;
  const path = parsed.entry.directory ? parsed.entry.path.slice(0, -1) : parsed.entry.path;
  const comparisonPath = path.toLowerCase();
  if (paths.has(comparisonPath)) throw new LatexArchiveFailure("archive-path", `Duplicate archive path: ${path}`);
  paths.add(comparisonPath);
  if ((parsed.hostSystem === 3 || parsed.hostSystem === 19) && (parsed.unixMode & 0o170000) === 0o120000) {
    throw new LatexArchiveFailure("archive-symlink", `Symbolic links are not supported: ${path}`);
  }
  const totalExpandedBytes = expandedBytes + expandedSize;
  if (totalExpandedBytes > maximumExpandedBytes) {
    throw new LatexArchiveFailure("archive-expanded-size", expandedSizeMessage(maximumExpandedBytes));
  }
  if (hasExcessiveExpansionRatio(compressedSize, expandedSize)) {
    throw new LatexArchiveFailure("archive-expanded-size", `ZIP entry has an excessive expansion ratio: ${path}`);
  }
  return totalExpandedBytes;
}

function hasExcessiveExpansionRatio(compressedSize: number, expandedSize: number): boolean {
  return (
    expandedSize >= expansionRatioMinimumBytes &&
    (compressedSize === 0 || expandedSize / Math.max(1, compressedSize) > maximumExpansionRatio)
  );
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let cursor = view.byteLength - 22; cursor >= minimum; cursor -= 1) {
    if (view.getUint32(cursor, true) === 0x06054b50) return cursor;
  }
  return -1;
}

function validateArchivePath(path: string): string {
  if (path.length > latexArchiveMaximumPathCodeUnits) {
    throw new LatexArchiveFailure("archive-path", "Archive path exceeds 1,024 UTF-16 code units");
  }
  if (path.split("/").length > latexArchiveMaximumPathSegments) {
    throw new LatexArchiveFailure("archive-path", "Archive path exceeds 64 segments");
  }
  if (
    !path ||
    unsafeUnzipResultPaths.has(path) ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    /^[a-z]:/iu.test(path) ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
    normalizePortablePath(path) !== path
  ) {
    throw new LatexArchiveFailure("archive-path", `Unsafe archive path: ${path || "(empty)"}`);
  }
  return path;
}

function expandArchive(
  bytes: Uint8Array,
  entries: readonly CentralDirectoryEntry[],
  limits: EffectiveLatexArchiveLimits,
): ReadonlyMap<string, Uint8Array> {
  const centralEntries = new Map(entries.map((entry) => [entry.path, entry]));
  const extracted = new Map<string, Uint8Array>();
  const activeFiles = new Set<UnzipFile>();
  const seenPaths = new Set<string>();
  let totalExpandedBytes = 0;
  let failure: LatexArchiveFailure | null = null;
  const fail = (nextFailure: LatexArchiveFailure): void => {
    if (failure) return;
    failure = nextFailure;
    for (const activeFile of activeFiles) activeFile.terminate();
  };
  const unzipper = new Unzip((file) => {
    if (failure) return;
    const entry = centralEntries.get(file.name);
    if (
      !entry ||
      seenPaths.has(file.name) ||
      file.compression !== entry.compression ||
      (file.size !== undefined && file.size !== entry.compressedSize) ||
      (file.originalSize !== undefined && file.originalSize !== entry.expandedSize)
    ) {
      fail(new LatexArchiveFailure("archive-format", "ZIP local-file headers do not match the central directory"));
      return;
    }
    seenPaths.add(file.name);
    activeFiles.add(file);
    const contents = new Uint8Array(entry.expandedSize);
    let entryExpandedBytes = 0;
    file.ondata = (error, data, final) => {
      if (failure) return;
      if (error) {
        fail(new LatexArchiveFailure("archive-format", "Invalid ZIP archive"));
        return;
      }
      const nextEntryExpandedBytes = entryExpandedBytes + data.byteLength;
      const nextTotalExpandedBytes = totalExpandedBytes + data.byteLength;
      if (nextTotalExpandedBytes > limits.maximumExpandedBytes) {
        fail(new LatexArchiveFailure("archive-expanded-size", expandedSizeMessage(limits.maximumExpandedBytes)));
        return;
      }
      if (nextEntryExpandedBytes > entry.expandedSize) {
        fail(new LatexArchiveFailure("archive-format", "ZIP expanded size does not match the central directory"));
        return;
      }
      if (hasExcessiveExpansionRatio(entry.compressedSize, nextEntryExpandedBytes)) {
        fail(new LatexArchiveFailure("archive-expanded-size", `ZIP entry has an excessive expansion ratio: ${entry.path}`));
        return;
      }
      const kind = archiveFileKind(entry.path);
      if ((kind === "tex" || kind === "bibtex") && nextEntryExpandedBytes > limits.maximumTextBytes) {
        fail(new LatexArchiveFailure("archive-text-size", textLimitMessage(entry.path, limits.maximumTextBytes)));
        return;
      }
      contents.set(data, entryExpandedBytes);
      entryExpandedBytes = nextEntryExpandedBytes;
      totalExpandedBytes = nextTotalExpandedBytes;
      if (!final) return;
      if (entryExpandedBytes !== entry.expandedSize) {
        fail(new LatexArchiveFailure("archive-format", "ZIP expanded size does not match the central directory"));
        return;
      }
      activeFiles.delete(file);
      extracted.set(entry.path, contents);
    };
    try {
      file.start();
    } catch {
      fail(new LatexArchiveFailure("archive-format", "Invalid ZIP archive"));
    }
  });
  unzipper.register(UnzipInflate);
  try {
    for (let offset = 0; offset < bytes.byteLength && !failure; offset += archiveExpansionInputChunkBytes) {
      const end = Math.min(offset + archiveExpansionInputChunkBytes, bytes.byteLength);
      unzipper.push(bytes.subarray(offset, end), end === bytes.byteLength);
    }
  } catch {
    fail(new LatexArchiveFailure("archive-format", "Invalid ZIP archive"));
  }
  if (failure) throw failure;
  if (activeFiles.size > 0 || seenPaths.size !== entries.length || extracted.size !== entries.length) {
    throw new LatexArchiveFailure("archive-format", "ZIP local-file headers do not match the central directory");
  }
  return extracted;
}

function extractedArchiveEntry(extracted: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array {
  const contents = extracted.get(path);
  if (!(contents instanceof Uint8Array)) {
    throw new LatexArchiveFailure("archive-format", `Archive entry could not be extracted: ${path}`);
  }
  return contents;
}

function archiveFileKind(path: string): LatexArchiveFileKind {
  const extension = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase() : "";
  if (extension === ".tex") return "tex";
  if (extension === ".bib") return "bibtex";
  return supportedImages.has(extension) ? "image" : "ignored";
}

function decodeArchiveText(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new LatexArchiveFailure("archive-text-encoding", `LaTeX text file must be UTF-8: ${path}`);
  }
}

function textLimitMessage(path: string, maximumTextBytes: number): string {
  return maximumTextBytes === latexArchiveMaximumTextBytes
    ? `LaTeX text file exceeds 2 MiB: ${path}`
    : `LaTeX text file exceeds the configured limit of ${maximumTextBytes} bytes: ${path}`;
}

function expandedSizeMessage(maximumExpandedBytes: number): string {
  return maximumExpandedBytes === latexArchiveMaximumExpandedBytes
    ? "Expanded LaTeX archive exceeds 64 MiB"
    : `Expanded LaTeX archive exceeds the configured limit of ${maximumExpandedBytes} bytes`;
}

function latexIncludes(file: LatexArchiveFile, paths: ReadonlySet<string>, acceptStructuralRecord: () => void): LatexIncludeReference[] {
  const source = structuralLatexSource(file.text ?? "");
  const references: LatexIncludeReference[] = [];
  for (const occurrence of commandArgumentOccurrences(source, [{ name: "input" }, { name: "include" }])) {
    acceptStructuralRecord();
    const requestedPath = validateStructuralReferencePath(occurrence.argument.trim(), "include");
    references.push({
      sourcePath: file.path,
      requestedPath,
      resolvedPath: resolveArchiveReference(file.path, requestedPath, paths, ".tex"),
      from: occurrence.start,
      to: occurrence.end,
    });
  }
  return references;
}

function latexBibliographies(
  file: LatexArchiveFile,
  paths: ReadonlySet<string>,
  acceptStructuralRecord: () => void,
): LatexBibliographyReference[] {
  const source = structuralLatexSource(file.text ?? "");
  const references: LatexBibliographyReference[] = [];
  for (const occurrence of commandArgumentOccurrences(source, [
    { name: "bibliography" },
    { name: "addbibresource", optionalArgument: true },
  ])) {
    const requested = occurrence.argument;
    let start = 0;
    while (start <= requested.length) {
      const comma = requested.indexOf(",", start);
      const end = comma < 0 ? requested.length : comma;
      acceptStructuralRecord();
      const requestedPath = validateStructuralReferencePath(requested.slice(start, end).trim(), "bibliography");
      references.push({
        sourcePath: file.path,
        requestedPath,
        resolvedPath: resolveArchiveReference(file.path, requestedPath, paths, ".bib"),
        from: occurrence.start,
        to: occurrence.end,
      });
      if (comma < 0) break;
      start = comma + 1;
    }
  }
  return references;
}

function resolveArchiveReference(sourcePath: string, requestedPath: string, paths: ReadonlySet<string>, extension: string): string | null {
  if (!safeArchiveReference(sourcePath, requestedPath)) return null;
  const relative = resolvePortablePath(sourcePath, requestedPath);
  const rootRelative = normalizePortablePath(requestedPath);
  for (const resolved of [relative, rootRelative]) {
    if (!resolved) continue;
    if (paths.has(resolved)) return resolved;
    const withExtension = resolved.toLowerCase().endsWith(extension) ? resolved : `${resolved}${extension}`;
    if (paths.has(withExtension)) return withExtension;
  }
  return null;
}

function safeArchiveReference(sourcePath: string, requestedPath: string): boolean {
  if (!requestedPath || requestedPath.startsWith("/") || requestedPath.includes("\\") || /^[a-z]:/iu.test(requestedPath)) return false;
  return resolvePortablePath(sourcePath, requestedPath) !== null;
}

function validateStructuralReferencePath(path: string, kind: "bibliography" | "include"): string {
  if (path.length > latexArchiveMaximumPathCodeUnits) {
    throw new LatexArchiveFailure("archive-path", `LaTeX ${kind} path exceeds 1,024 UTF-16 code units`);
  }
  if (path.split("/").length > latexArchiveMaximumPathSegments) {
    throw new LatexArchiveFailure("archive-path", `LaTeX ${kind} path exceeds ${latexArchiveMaximumPathSegments} segments`);
  }
  return path;
}

function hasDocumentClass(source: string): boolean {
  const command = "\\documentclass";
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(command, cursor);
    if (start < 0) return false;
    let position = start + command.length;
    if (source[position] === "[") {
      const optionalArgument = delimitedGroup(source, position, "[", "]");
      if (!optionalArgument) return false;
      position = optionalArgument.end;
    }
    position = skipLatexWhitespace(source, position);
    if (source[position] === "{") return true;
    cursor = Math.max(position, start + command.length);
  }
  return false;
}

function* commandArgumentOccurrences(source: string, commands: readonly LatexCommandSpec[]): Generator<LatexCommandArgumentOccurrence> {
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf("\\", cursor);
    if (start < 0) return;
    const command = commands.find((candidate) => source.startsWith(candidate.name, start + 1));
    if (!command) {
      cursor = start + 1;
      continue;
    }
    const parsed = parseLatexCommandArgument(source, start, command);
    if (parsed.kind === "stop") return;
    if (parsed.kind === "skip") {
      cursor = parsed.next;
      continue;
    }
    const argument = parsed.group;
    cursor = argument.end;
    if (argument.bodyStart === argument.bodyEnd) continue;
    yield {
      start,
      end: argument.end,
      argument: source.slice(argument.bodyStart, argument.bodyEnd),
    };
  }
}

function parseLatexCommandArgument(source: string, start: number, command: LatexCommandSpec): ParsedLatexCommandArgument {
  let position = start + 1 + command.name.length;
  if (command.optionalArgument && source[position] === "[") {
    const optionalArgument = delimitedGroup(source, position, "[", "]");
    if (!optionalArgument) return { kind: "stop" };
    position = optionalArgument.end;
  }
  position = skipLatexWhitespace(source, position);
  if (source[position] !== "{") return { kind: "skip", next: Math.max(position, start + 1) };
  const group = delimitedGroup(source, position, "{", "}");
  return group ? { kind: "argument", group } : { kind: "stop" };
}

function delimitedGroup(source: string, start: number, open: "[" | "{", close: "]" | "}"): LatexDelimitedGroup | null {
  if (source[start] !== open) return null;
  let depth = 1;
  for (let cursor = start + 1; cursor < source.length; cursor += 1) {
    if (source[cursor] === open) depth += 1;
    else if (source[cursor] === close) depth -= 1;
    if (depth === 0) return { bodyStart: start + 1, bodyEnd: cursor, end: cursor + 1 };
  }
  return null;
}

function skipLatexWhitespace(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length && latexWhitespace.test(source[cursor]!)) cursor += 1;
  return cursor;
}
