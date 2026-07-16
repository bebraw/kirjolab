import { projectMarkdownComments } from "./markdown-comments";

export const projectEntryPath = "main.md";

export interface ProjectFile {
  readonly id: string;
  readonly path: string;
  readonly mediaType: "text/markdown";
  readonly content: string;
  readonly collaborationTextName?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectFolder {
  readonly id: string;
  readonly path: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ProjectImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/avif" | "image/svg+xml";

export interface ProjectAsset {
  readonly id: string;
  readonly path: string;
  readonly mediaType: ProjectImageMediaType;
  readonly size: number;
  readonly objectKey: string;
  readonly fingerprint: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CompositionSourceSpan {
  readonly outputStart: number;
  readonly outputEnd: number;
  readonly fileId: string;
  readonly path: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly includeChain: readonly string[];
}

export type CompositionDiagnosticCode =
  | "cycle"
  | "depth-limit"
  | "duplicate-path"
  | "file-limit"
  | "invalid-path"
  | "missing-file"
  | "output-limit";

export interface CompositionDiagnostic {
  readonly code: CompositionDiagnosticCode;
  readonly message: string;
  readonly fileId: string;
  readonly path: string;
  readonly from: number;
  readonly to: number;
  readonly includeChain: readonly string[];
}

export interface ProjectComposition {
  readonly content: string;
  readonly sourceMap: readonly CompositionSourceSpan[];
  readonly diagnostics: readonly CompositionDiagnostic[];
  readonly dependencies: Readonly<Record<string, readonly string[]>>;
}

export interface ProjectFilePreview extends ProjectComposition {
  readonly fileId: string;
  readonly path: string;
  readonly mode: "composed" | "isolated";
}

export interface CompositionLimits {
  readonly maximumDepth?: number;
  readonly maximumFiles?: number;
  readonly maximumOutputBytes?: number;
}

const defaultMaximumDepth = 32;
const defaultMaximumFiles = 512;
const defaultMaximumOutputBytes = 2 * 1024 * 1024;
const includeLine = /^(?<indent>[ \t]*)::include\[(?<path>[^\]\r\n]+)\][ \t]*(?:\r?\n|$)/gmu;
const frontmatter = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/u;
const svgRoot = /^\uFEFF?\s*(?:<\?xml(?:\s[^?]*)?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/u;
const svgForbiddenDeclaration = /<!\s*(?:doctype|entity)\b/iu;
const svgForbiddenElement = /<\s*(?:script|foreignObject|iframe|object|embed|audio|video)\b/iu;
const svgEventHandler = /\son[a-z0-9:_-]*\s*=/iu;
const svgCssImport = /@import\b/iu;
const svgReference = /\b(?:href|xlink:href)\s*=\s*(["'])([\s\S]*?)\1/giu;
const svgCssUrl = /url\(\s*(["']?)(.*?)\1\s*\)/giu;
const embeddedRasterImage = /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/iu;

export function composeProject(files: readonly ProjectFile[], entryFileId: string, limits: CompositionLimits = {}): ProjectComposition {
  const maximumDepth = limits.maximumDepth ?? defaultMaximumDepth;
  const maximumFiles = limits.maximumFiles ?? defaultMaximumFiles;
  const maximumOutputBytes = limits.maximumOutputBytes ?? defaultMaximumOutputBytes;
  assertLimit(maximumDepth, "maximumDepth");
  assertLimit(maximumFiles, "maximumFiles");
  assertLimit(maximumOutputBytes, "maximumOutputBytes");

  const byId = new Map(files.map((file) => [file.id, file]));
  const byPath = new Map<string, ProjectFile>();
  const diagnostics: CompositionDiagnostic[] = [];
  for (const file of files) {
    const normalized = normalizeProjectPath(file.path);
    if (!normalized || normalized !== file.path) {
      diagnostics.push(diagnostic("invalid-path", `Invalid project path: ${file.path}`, file, 0, file.path.length, [file.id]));
      continue;
    }
    const existing = byPath.get(normalized);
    if (existing) {
      diagnostics.push(diagnostic("duplicate-path", `Project path is used by more than one file: ${normalized}`, file, 0, 0, [file.id]));
      continue;
    }
    byPath.set(normalized, file);
  }

  const entry = byId.get(entryFileId);
  if (!entry) throw new Error("The project entry file does not exist");

  const state = {
    output: "",
    sourceMap: [] as CompositionSourceSpan[],
    diagnostics,
    dependencies: new Map<string, Set<string>>(),
    expandedFiles: new Set<string>(),
    stopped: false,
  };

  expand(entry, [entry.id], true, byPath, state, { maximumDepth, maximumFiles, maximumOutputBytes });
  return {
    content: state.output,
    sourceMap: state.sourceMap,
    diagnostics: state.diagnostics,
    dependencies: Object.fromEntries(
      [...state.dependencies.entries()].map(([fileId, dependencyIds]) => [fileId, [...dependencyIds].sort()]),
    ),
  };
}

export function resolveProjectEntryFileId(files: readonly ProjectFile[], explicitFileId?: string | null): string {
  if (explicitFileId) {
    const explicit = files.find((file) => file.id === explicitFileId);
    if (!explicit) throw new Error("The selected project entry file does not exist");
    return explicit.id;
  }
  const conventional = files.find((file) => file.path === projectEntryPath);
  if (conventional) return conventional.id;
  const first = [...files].sort((left, right) => compareProjectPaths(left.path, right.path))[0];
  if (!first) throw new Error("A project requires at least one Markdown file");
  return first.id;
}

export function projectFileCollaborationTextName(file: ProjectFile, entryFileId: string): string {
  return file.collaborationTextName ?? (file.id === entryFileId ? "source" : `file:${file.id}`);
}

export function previewProjectFile(files: readonly ProjectFile[], entryFileId: string, selectedFileId: string | null): ProjectFilePreview {
  const entry = files.find((file) => file.id === entryFileId);
  if (!entry) throw new Error("The project entry file does not exist");
  const selected = files.find((file) => file.id === selectedFileId) ?? entry;
  if (selected.id === entryFileId) {
    return { ...composeProject(files, entryFileId), fileId: entry.id, path: entry.path, mode: "composed" };
  }
  return {
    content: selected.content,
    sourceMap: [
      {
        outputStart: 0,
        outputEnd: selected.content.length,
        fileId: selected.id,
        path: selected.path,
        sourceStart: 0,
        sourceEnd: selected.content.length,
        includeChain: [selected.id],
      },
    ],
    diagnostics: [],
    dependencies: {},
    fileId: selected.id,
    path: selected.path,
    mode: "isolated",
  };
}

export function isInertSvgImage(bytes: Uint8Array): boolean {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return false;
  }
  if (
    !svgRoot.test(source) ||
    svgForbiddenDeclaration.test(source) ||
    svgForbiddenElement.test(source) ||
    svgEventHandler.test(source) ||
    svgCssImport.test(source)
  )
    return false;
  const withoutXmlDeclaration = source.replace(/^\uFEFF?\s*<\?xml(?:\s[^?]*)?\?>/u, "");
  if (/<\?/u.test(withoutXmlDeclaration)) return false;
  for (const match of source.matchAll(svgReference)) {
    if (!isLocalSvgReference(match[2] ?? "")) return false;
  }
  for (const match of source.matchAll(svgCssUrl)) {
    if (!isLocalSvgReference(match[2] ?? "")) return false;
  }
  return true;
}

function isLocalSvgReference(value: string): boolean {
  const reference = value.trim();
  return /^#[^\s]+$/u.test(reference) || embeddedRasterImage.test(reference);
}

export function normalizeProjectPath(value: string): string | null {
  const candidate = value.trim().replaceAll("\\", "/");
  if (!candidate || candidate.startsWith("/") || candidate.includes("\0")) return null;
  const segments: string[] = [];
  for (const segment of candidate.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.length === 0 ? null : segments.join("/");
}

export function resolveProjectPath(fromPath: string, includePath: string): string | null {
  const directory = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  return normalizeProjectPath(directory ? `${directory}/${includePath}` : includePath);
}

export function inboundProjectIncludes(files: readonly ProjectFile[], targetPath: string): readonly ProjectFile[] {
  return files.filter((file) => {
    for (const match of projectMarkdownComments(file.content).masked.matchAll(includeLine)) {
      const requested = match.groups?.path?.trim();
      if (requested && resolveProjectPath(file.path, requested) === targetPath) return true;
    }
    return false;
  });
}

export function rewriteInboundProjectIncludes(file: ProjectFile, previousPath: string, nextPath: string): string {
  return replaceActiveMarkdown(file.content, includeLine, (directive, match) => {
    const requested = match.groups?.path?.trim();
    if (!requested || resolveProjectPath(file.path, requested) !== previousPath) return directive;
    return directive.replace(requested, relativeProjectPath(file.path, nextPath));
  });
}

export function rewriteProjectIncludesForMoves(file: ProjectFile, movedPaths: ReadonlyMap<string, string>): string {
  const nextFilePath = movedPaths.get(file.path) ?? file.path;
  return replaceActiveMarkdown(file.content, includeLine, (directive, match) => {
    const requested = match.groups?.path?.trim();
    if (!requested) return directive;
    const previousTargetPath = resolveProjectPath(file.path, requested);
    if (!previousTargetPath) return directive;
    const nextTargetPath = movedPaths.get(previousTargetPath) ?? previousTargetPath;
    if (nextFilePath === file.path && nextTargetPath === previousTargetPath) return directive;
    return directive.replace(requested, relativeProjectPath(nextFilePath, nextTargetPath));
  });
}

export function rewriteProjectImageReferencesForMoves(file: ProjectFile, movedPaths: ReadonlyMap<string, string>): string {
  const nextFilePath = movedPaths.get(file.path) ?? file.path;
  return replaceActiveMarkdown(
    file.content,
    /!\[[^\]\r\n]*\]\((?<target><[^>\r\n]+>|[^\s)\r\n]+)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/gu,
    (syntax, match) => {
      const target = match.groups?.target;
      if (!target) return syntax;
      const bracketed = target.startsWith("<") && target.endsWith(">");
      const requested = bracketed ? target.slice(1, -1) : target;
      if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/iu.test(requested)) return syntax;
      const previousTargetPath = resolveProjectPath(file.path, requested);
      if (!previousTargetPath) return syntax;
      const nextTargetPath = movedPaths.get(previousTargetPath) ?? previousTargetPath;
      if (nextFilePath === file.path && nextTargetPath === previousTargetPath) return syntax;
      const nextReference = relativeProjectPath(nextFilePath, nextTargetPath);
      return syntax.replace(target, bracketed ? `<${nextReference}>` : nextReference);
    },
  );
}

export function relativeProjectPath(fromPath: string, toPath: string): string {
  const from = fromPath.split("/").slice(0, -1);
  const to = toPath.split("/");
  while (from[0] && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  return [...from.map(() => ".."), ...to].join("/") || toPath;
}

export function rewriteProjectCitationAlias(content: string, previousAlias: string, nextAlias: string): string {
  return replaceActiveMarkdown(content, /:(?<name>cite|citet|citep)\[(?<keys>[^\]\r\n]+)\]/gu, (directive, match) => {
    const keysValue = match.groups?.keys;
    if (!keysValue) return directive;
    const keys = keysValue.split(",").map((key) => key.trim());
    if (!keys.includes(previousAlias)) return directive;
    return `:${match.groups?.name ?? "cite"}[${keys.map((key) => (key === previousAlias ? nextAlias : key)).join(", ")}]`;
  });
}

export function projectUsesCitationAlias(files: readonly ProjectFile[], alias: string): boolean {
  return files.some((file) =>
    [...projectMarkdownComments(file.content).masked.matchAll(/:(?:cite|citet|citep)\[(?<keys>[^\]\r\n]+)\]/gu)].some((match) =>
      (match.groups?.keys ?? "")
        .split(",")
        .map((key) => key.trim())
        .includes(alias),
    ),
  );
}

interface ExpansionState {
  output: string;
  sourceMap: CompositionSourceSpan[];
  diagnostics: CompositionDiagnostic[];
  dependencies: Map<string, Set<string>>;
  expandedFiles: Set<string>;
  stopped: boolean;
}

interface RequiredLimits {
  maximumDepth: number;
  maximumFiles: number;
  maximumOutputBytes: number;
}

function expand(
  file: ProjectFile,
  chain: readonly string[],
  isEntry: boolean,
  byPath: ReadonlyMap<string, ProjectFile>,
  state: ExpansionState,
  limits: RequiredLimits,
): void {
  if (state.stopped) return;
  if (chain.length > limits.maximumDepth) {
    state.diagnostics.push(diagnostic("depth-limit", `Include depth exceeds ${limits.maximumDepth}`, file, 0, 0, chain));
    return;
  }
  state.expandedFiles.add(file.id);
  if (state.expandedFiles.size > limits.maximumFiles) {
    state.diagnostics.push(diagnostic("file-limit", `Composition includes more than ${limits.maximumFiles} files`, file, 0, 0, chain));
    state.stopped = true;
    return;
  }

  const prepared = isEntry ? { content: file.content, sourceOffset: 0 } : stripFrontmatter(file.content);
  const { content, sourceOffset } = prepared;
  let cursor = 0;
  for (const match of projectMarkdownComments(content).masked.matchAll(includeLine)) {
    const index = match.index;
    append(file, content, cursor, index, sourceOffset, chain, state, limits);
    if (state.stopped) return;
    const requested = match.groups?.path?.trim() ?? "";
    const resolvedPath = resolveProjectPath(file.path, requested);
    const from = sourceOffset + index + (match[0].indexOf(requested) >= 0 ? match[0].indexOf(requested) : 0);
    const to = from + requested.length;
    if (!resolvedPath) {
      state.diagnostics.push(diagnostic("invalid-path", `Invalid include path: ${requested}`, file, from, to, chain));
    } else {
      const dependency = byPath.get(resolvedPath);
      if (!dependency) {
        state.diagnostics.push(diagnostic("missing-file", `Included file does not exist: ${resolvedPath}`, file, from, to, chain));
      } else {
        const dependencies = state.dependencies.get(file.id) ?? new Set<string>();
        dependencies.add(dependency.id);
        state.dependencies.set(file.id, dependencies);
        if (chain.includes(dependency.id)) {
          state.diagnostics.push(
            diagnostic(
              "cycle",
              `Include cycle: ${[...chain, dependency.id].map((id) => byIdPath(byPath, id)).join(" → ")}`,
              file,
              from,
              to,
              chain,
            ),
          );
        } else {
          expand(dependency, [...chain, dependency.id], false, byPath, state, limits);
        }
      }
    }
    cursor = index + match[0].length;
  }
  append(file, content, cursor, content.length, sourceOffset, chain, state, limits);
}

function append(
  file: ProjectFile,
  content: string,
  sourceStart: number,
  sourceEnd: number,
  sourceOffset: number,
  chain: readonly string[],
  state: ExpansionState,
  limits: RequiredLimits,
): void {
  if (sourceEnd <= sourceStart || state.stopped) return;
  const fragment = content.slice(sourceStart, sourceEnd);
  if (new TextEncoder().encode(state.output + fragment).byteLength > limits.maximumOutputBytes) {
    state.diagnostics.push(
      diagnostic(
        "output-limit",
        `Composed output exceeds ${limits.maximumOutputBytes} bytes`,
        file,
        sourceStart + sourceOffset,
        sourceEnd + sourceOffset,
        chain,
      ),
    );
    state.stopped = true;
    return;
  }
  const outputStart = state.output.length;
  state.output += fragment;
  state.sourceMap.push({
    outputStart,
    outputEnd: state.output.length,
    fileId: file.id,
    path: file.path,
    sourceStart: sourceStart + sourceOffset,
    sourceEnd: sourceEnd + sourceOffset,
    includeChain: [...chain],
  });
}

function stripFrontmatter(content: string): { content: string; sourceOffset: number } {
  const match = frontmatter.exec(content);
  return match ? { content: content.slice(match[0].length), sourceOffset: match[0].length } : { content, sourceOffset: 0 };
}

function diagnostic(
  code: CompositionDiagnosticCode,
  message: string,
  file: ProjectFile,
  from: number,
  to: number,
  includeChain: readonly string[],
): CompositionDiagnostic {
  return { code, message, fileId: file.id, path: file.path, from, to, includeChain: [...includeChain] };
}

function byIdPath(files: ReadonlyMap<string, ProjectFile>, id: string): string {
  return [...files.values()].find((file) => file.id === id)?.path ?? id;
}

function assertLimit(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive safe integer`);
}

function compareProjectPaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function replaceActiveMarkdown(source: string, pattern: RegExp, replacement: (syntax: string, match: RegExpMatchArray) => string): string {
  const chunks: string[] = [];
  let cursor = 0;
  for (const match of projectMarkdownComments(source).masked.matchAll(pattern)) {
    const from = match.index;
    const to = from + match[0].length;
    chunks.push(source.slice(cursor, from), replacement(source.slice(from, to), match));
    cursor = to;
  }
  chunks.push(source.slice(cursor));
  return chunks.join("");
}
