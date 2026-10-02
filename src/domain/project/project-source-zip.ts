import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import { normalizePortablePath } from "../../lib/paper-import/portable-path";
import {
  LatexArchiveFailure,
  latexArchiveMaximumPathCodeUnits,
  latexArchiveMaximumPathSegments,
} from "../../lib/paper-import/latex-archive";

// The published paper-import reader is immutable; source-project tolerance lives here.
interface SourceZipLimits {
  readonly maximumCompressedBytes: number;
  readonly maximumExpandedBytes: number;
  readonly maximumEntries: number;
  readonly maximumTextBytes: number;
}
const unsafeUnzipResultPaths = new Set(["__proto__"]);
const maximumExpansionRatio = 1_000;
const expansionRatioMinimumBytes = 1024 * 1024;
const archiveExpansionInputChunkBytes = 1_024;
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

/** Bounded ZIP extraction for source projects; skipped files are never inflated. */
export function extractSourceArchive(
  bytes: Uint8Array,
  include: (path: string) => boolean,
): { readonly files: ReadonlyMap<string, Uint8Array>; readonly entryPaths: readonly string[]; readonly skippedEntries: number } {
  const limits: SourceZipLimits = {
    maximumCompressedBytes: 20 * 1024 * 1024,
    maximumExpandedBytes: 64 * 1024 * 1024,
    maximumTextBytes: 2 * 1024 * 1024,
    maximumEntries: 16_384,
  };
  if (bytes.byteLength === 0 || bytes.byteLength > limits.maximumCompressedBytes)
    throw new LatexArchiveFailure("archive-size", "Project archive must be between 1 byte and 20 MiB");
  const entries = readCentralDirectory(bytes, limits, include);
  const selected = entries.filter((entry) => !entry.directory && include(entry.path));
  if (selected.length > 1_024)
    throw new LatexArchiveFailure("archive-too-many-entries", "Project source archive exceeds 1,024 importable files");
  const maximumRetainedBytes = 20 * 1024 * 1024;
  if (selected.reduce((total, entry) => total + entry.expandedSize, 0) > maximumRetainedBytes)
    throw new LatexArchiveFailure("archive-expanded-size", "Imported project content exceeds 20 MiB");
  const files = expandArchive(bytes, entries, { ...limits, maximumExpandedBytes: maximumRetainedBytes }, include);
  return {
    files,
    entryPaths: entries.filter((entry) => !entry.directory).map((entry) => entry.path),
    skippedEntries: entries.length - selected.length,
  };
}

function readCentralDirectory(
  bytes: Uint8Array,
  limits: SourceZipLimits,
  include: (path: string) => boolean,
): readonly CentralDirectoryEntry[] {
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
    const textEntry = /\.(?:md|bib)$/u.test(parsed.entry.path);
    if (!parsed.entry.directory && include(parsed.entry.path) && textEntry && parsed.entry.expandedSize > limits.maximumTextBytes) {
      throw new LatexArchiveFailure("archive-text-size", textLimitMessage(parsed.entry.path));
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
    throw new LatexArchiveFailure("archive-too-many-entries", `Project source archive must contain 1–${maximumEntries} entries`);
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
  limits: SourceZipLimits,
  include: (path: string) => boolean,
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
    if (entry.directory || !include(entry.path)) return;
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
      const textEntry = /\.(?:md|bib)$/u.test(entry.path);
      if (textEntry && nextEntryExpandedBytes > limits.maximumTextBytes) {
        fail(new LatexArchiveFailure("archive-text-size", textLimitMessage(entry.path)));
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
  const expectedFiles = entries.filter((entry) => !entry.directory && include(entry.path)).length;
  if (activeFiles.size > 0 || seenPaths.size !== entries.length || extracted.size !== expectedFiles) {
    throw new LatexArchiveFailure("archive-format", "ZIP local-file headers do not match the central directory");
  }
  return extracted;
}

function textLimitMessage(path: string): string {
  return `Source text file exceeds 2 MiB: ${path}`;
}
function expandedSizeMessage(maximumExpandedBytes: number): string {
  return `Expanded project archive exceeds ${maximumExpandedBytes / (1024 * 1024)} MiB`;
}
