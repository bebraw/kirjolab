import { unzip } from "fflate";
import { normalizeProjectPath, resolveProjectPath } from "./project-files";

export const latexArchiveMaximumCompressedBytes = 20 * 1024 * 1024;
export const latexArchiveMaximumExpandedBytes = 64 * 1024 * 1024;
export const latexArchiveMaximumEntries = 1_024;
export const latexArchiveMaximumTextBytes = 2 * 1024 * 1024;

export type LatexArchiveFileKind = "tex" | "bibtex" | "image" | "ignored";

export type LatexImportDiagnosticCode =
  | "ambiguous-root"
  | "include-cycle"
  | "invalid-bibliography-selection"
  | "invalid-root-selection"
  | "missing-bibliography"
  | "missing-include"
  | "missing-root"
  | "tikz-preserved"
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
  | "archive-path"
  | "archive-size"
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
  readonly compressedSize: number;
  readonly expandedSize: number;
}

const supportedImages = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const documentClassPattern = /\\documentclass(?:\[[^\]]*\])?\s*\{/u;
const documentBeginPattern = /\\begin\s*\{document\}/u;
const inputPattern = /\\(?:input|include)\s*\{([^}]+)\}/gu;
const bibliographyPattern = /\\bibliography\s*\{([^}]+)\}|\\addbibresource(?:\[[^\]]*\])?\s*\{([^}]+)\}/gu;

export async function inspectLatexArchive(bytes: Uint8Array): Promise<LatexArchiveInspection> {
  if (bytes.byteLength === 0 || bytes.byteLength > latexArchiveMaximumCompressedBytes) {
    throw new LatexArchiveFailure("archive-size", "LaTeX archive must be between 1 byte and 20 MiB");
  }
  const centralEntries = readCentralDirectory(bytes);
  const extracted = await expandArchive(bytes);
  const files = centralEntries
    .filter((entry) => !entry.directory)
    .map((entry): LatexArchiveFile => {
      const contents = extracted[entry.path];
      if (!contents) throw new LatexArchiveFailure("archive-format", `Archive entry could not be extracted: ${entry.path}`);
      const kind = archiveFileKind(entry.path);
      if (kind !== "tex" && kind !== "bibtex") return { path: entry.path, kind, bytes: contents };
      if (contents.byteLength > latexArchiveMaximumTextBytes) {
        throw new LatexArchiveFailure("archive-text-size", `LaTeX text file exceeds 2 MiB: ${entry.path}`);
      }
      return { path: entry.path, kind, bytes: contents, text: decodeArchiveText(contents, entry.path) };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  return analyzeLatexArchiveFiles(files);
}

export function analyzeLatexArchiveFiles(files: readonly LatexArchiveFile[]): LatexArchiveInspection {
  const texFiles = files.filter((file) => file.kind === "tex" && file.text !== undefined);
  const texPaths = new Set(texFiles.map((file) => file.path));
  const bibtexPaths = new Set(files.filter((file) => file.kind === "bibtex").map((file) => file.path));
  const rootCandidates = texFiles
    .filter((file) => {
      const active = activeLatex(file.text ?? "");
      return documentClassPattern.test(active) && documentBeginPattern.test(active);
    })
    .map((file) => file.path)
    .sort((left, right) => left.localeCompare(right));
  const includes = texFiles.flatMap((file) => latexIncludes(file, texPaths));
  const bibliographies = texFiles.flatMap((file) => latexBibliographies(file, bibtexPaths));
  const diagnostics: LatexImportDiagnostic[] = [];
  if (rootCandidates.length === 0) {
    diagnostics.push({ code: "missing-root", severity: "error", message: "No LaTeX root document was found" });
  } else if (rootCandidates.length > 1) {
    diagnostics.push({
      code: "ambiguous-root",
      severity: "error",
      message: `Choose one of ${rootCandidates.length} LaTeX root documents`,
    });
  }
  for (const include of includes) {
    if (include.resolvedPath) continue;
    const unsafe = !safeArchiveReference(include.sourcePath, include.requestedPath);
    diagnostics.push({
      code: unsafe ? "unsafe-include" : "missing-include",
      severity: "error",
      message: unsafe
        ? `Include escapes or uses an unsafe archive path: ${include.requestedPath}`
        : `Included LaTeX file was not found: ${include.requestedPath}`,
      path: include.sourcePath,
      from: include.from,
      to: include.to,
    });
  }
  for (const bibliography of bibliographies) {
    if (bibliography.resolvedPath) continue;
    const unsafe = !safeArchiveReference(bibliography.sourcePath, bibliography.requestedPath);
    diagnostics.push({
      code: unsafe ? "unsafe-bibliography" : "missing-bibliography",
      severity: "error",
      message: unsafe
        ? `Bibliography escapes or uses an unsafe archive path: ${bibliography.requestedPath}`
        : `Bibliography file was not found: ${bibliography.requestedPath}`,
      path: bibliography.sourcePath,
      from: bibliography.from,
      to: bibliography.to,
    });
  }
  const referencedBibliographies = new Set(bibliographies.flatMap((reference) => (reference.resolvedPath ? [reference.resolvedPath] : [])));
  for (const path of [...bibtexPaths].sort((left, right) => left.localeCompare(right))) {
    if (referencedBibliographies.has(path)) continue;
    diagnostics.push({
      code: "unreferenced-bibliography",
      severity: "warning",
      message: `Bibliography is present but not referenced by a LaTeX file: ${path}`,
      path,
    });
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

function readCentralDirectory(bytes: Uint8Array): readonly CentralDirectoryEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
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
  if (totalEntries === 0 || totalEntries > latexArchiveMaximumEntries) {
    throw new LatexArchiveFailure("archive-too-many-entries", "LaTeX archive must contain 1–1,024 entries");
  }
  if (centralOffset + centralSize > eocdOffset) throw new LatexArchiveFailure("archive-format", "Invalid ZIP central directory");
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  const paths = new Set<string>();
  const entries: CentralDirectoryEntry[] = [];
  let expandedBytes = 0;
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > eocdOffset || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new LatexArchiveFailure("archive-format", "Invalid ZIP central-directory entry");
    }
    const versionMadeBy = view.getUint16(cursor + 4, true);
    const flags = view.getUint16(cursor + 8, true);
    const compression = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const expandedSize = view.getUint32(cursor + 24, true);
    const filenameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const externalAttributes = view.getUint32(cursor + 38, true);
    const next = cursor + 46 + filenameLength + extraLength + commentLength;
    if (next > eocdOffset) throw new LatexArchiveFailure("archive-format", "Truncated ZIP central-directory entry");
    if ((flags & 1) !== 0) throw new LatexArchiveFailure("archive-encrypted", "Encrypted ZIP entries are not supported");
    if (compression !== 0 && compression !== 8) {
      throw new LatexArchiveFailure("archive-unsupported-compression", "ZIP entries must use store or deflate compression");
    }
    let rawPath: string;
    try {
      rawPath = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + filenameLength));
    } catch {
      throw new LatexArchiveFailure("archive-path", "ZIP entry names must be UTF-8");
    }
    const directory = rawPath.endsWith("/");
    const path = validateArchivePath(directory ? rawPath.slice(0, -1) : rawPath);
    const comparisonPath = path.toLocaleLowerCase();
    if (paths.has(comparisonPath)) throw new LatexArchiveFailure("archive-path", `Duplicate archive path: ${path}`);
    paths.add(comparisonPath);
    const hostSystem = versionMadeBy >>> 8;
    const unixMode = externalAttributes >>> 16;
    if (hostSystem === 3 && (unixMode & 0o170000) === 0o120000) {
      throw new LatexArchiveFailure("archive-symlink", `Symbolic links are not supported: ${path}`);
    }
    expandedBytes += expandedSize;
    if (expandedBytes > latexArchiveMaximumExpandedBytes) {
      throw new LatexArchiveFailure("archive-expanded-size", "Expanded LaTeX archive exceeds 64 MiB");
    }
    entries.push({ path: directory ? `${path}/` : path, directory, compressedSize, expandedSize });
    cursor = next;
  }
  if (cursor !== centralOffset + centralSize) throw new LatexArchiveFailure("archive-format", "ZIP central-directory size is invalid");
  return entries;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let cursor = view.byteLength - 22; cursor >= minimum; cursor -= 1) {
    if (view.getUint32(cursor, true) === 0x06054b50) return cursor;
  }
  return -1;
}

function validateArchivePath(path: string): string {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    /^[a-z]:/iu.test(path) ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
    normalizeProjectPath(path) !== path
  ) {
    throw new LatexArchiveFailure("archive-path", `Unsafe archive path: ${path || "(empty)"}`);
  }
  return path;
}

function expandArchive(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, files) => {
      if (error) {
        reject(new LatexArchiveFailure("archive-format", error.message || "Invalid ZIP archive"));
        return;
      }
      resolve(files);
    });
  });
}

function archiveFileKind(path: string): LatexArchiveFileKind {
  const extension = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLocaleLowerCase() : "";
  if (extension === ".tex") return "tex";
  if (extension === ".bib") return "bibtex";
  return supportedImages.has(extension) ? "image" : "ignored";
}

function decodeArchiveText(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes).replaceAll("\r\n", "\n");
  } catch {
    throw new LatexArchiveFailure("archive-text-encoding", `LaTeX text file must be UTF-8: ${path}`);
  }
}

function activeLatex(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== "%") continue;
        let backslashes = 0;
        for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) backslashes += 1;
        if (backslashes % 2 === 0) return `${line.slice(0, index)}${" ".repeat(line.length - index)}`;
      }
      return line;
    })
    .join("\n");
}

function latexIncludes(file: LatexArchiveFile, paths: ReadonlySet<string>): LatexIncludeReference[] {
  const source = activeLatex(file.text ?? "");
  return [...source.matchAll(inputPattern)].map((match) => {
    const requestedPath = (match[1] ?? "").trim();
    return {
      sourcePath: file.path,
      requestedPath,
      resolvedPath: resolveArchiveReference(file.path, requestedPath, paths, ".tex"),
      from: match.index,
      to: match.index + match[0].length,
    };
  });
}

function latexBibliographies(file: LatexArchiveFile, paths: ReadonlySet<string>): LatexBibliographyReference[] {
  const source = activeLatex(file.text ?? "");
  return [...source.matchAll(bibliographyPattern)].flatMap((match) => {
    const requested = match[1] ?? match[2] ?? "";
    return requested.split(",").map((value) => {
      const requestedPath = value.trim();
      return {
        sourcePath: file.path,
        requestedPath,
        resolvedPath: resolveArchiveReference(file.path, requestedPath, paths, ".bib"),
        from: match.index,
        to: match.index + match[0].length,
      };
    });
  });
}

function resolveArchiveReference(sourcePath: string, requestedPath: string, paths: ReadonlySet<string>, extension: string): string | null {
  if (!safeArchiveReference(sourcePath, requestedPath)) return null;
  const resolved = resolveProjectPath(sourcePath, requestedPath);
  if (!resolved) return null;
  if (paths.has(resolved)) return resolved;
  const withExtension = resolved.toLocaleLowerCase().endsWith(extension) ? resolved : `${resolved}${extension}`;
  return paths.has(withExtension) ? withExtension : null;
}

function safeArchiveReference(sourcePath: string, requestedPath: string): boolean {
  if (!requestedPath || requestedPath.startsWith("/") || requestedPath.includes("\\") || /^[a-z]:/iu.test(requestedPath)) return false;
  return resolveProjectPath(sourcePath, requestedPath) !== null;
}
