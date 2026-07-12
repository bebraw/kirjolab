export const projectEntryPath = "main.md";

export interface ProjectFile {
  readonly id: string;
  readonly path: string;
  readonly mediaType: "text/markdown";
  readonly content: string;
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
  if (entry.path !== projectEntryPath) throw new Error(`The project entry file must be ${projectEntryPath}`);

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
    for (const match of file.content.matchAll(includeLine)) {
      const requested = match.groups?.path?.trim();
      if (requested && resolveProjectPath(file.path, requested) === targetPath) return true;
    }
    return false;
  });
}

export function rewriteInboundProjectIncludes(file: ProjectFile, previousPath: string, nextPath: string): string {
  return file.content.replace(includeLine, (directive, ...values: unknown[]) => {
    const groups = values.at(-1);
    if (!isStringRecord(groups)) return directive;
    const requested = groups.path?.trim();
    if (!requested || resolveProjectPath(file.path, requested) !== previousPath) return directive;
    return directive.replace(requested, relativeProjectPath(file.path, nextPath));
  });
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
  return content.replaceAll(/:cite\[(?<keys>[^\]\r\n]+)\]/gu, (directive, ...values: unknown[]) => {
    const groups = values.at(-1);
    if (!isStringRecord(groups) || !groups.keys) return directive;
    const keys = groups.keys.split(",").map((key) => key.trim());
    if (!keys.includes(previousAlias)) return directive;
    return `:cite[${keys.map((key) => (key === previousAlias ? nextAlias : key)).join(", ")}]`;
  });
}

export function projectUsesCitationAlias(files: readonly ProjectFile[], alias: string): boolean {
  return files.some((file) =>
    [...file.content.matchAll(/:cite\[(?<keys>[^\]\r\n]+)\]/gu)].some((match) =>
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

  const content = isEntry ? file.content : stripFrontmatter(file.content);
  let cursor = 0;
  for (const match of content.matchAll(includeLine)) {
    const index = match.index;
    append(file, content, cursor, index, chain, state, limits);
    if (state.stopped) return;
    const requested = match.groups?.path?.trim() ?? "";
    const resolvedPath = resolveProjectPath(file.path, requested);
    const from = index + (match[0].indexOf(requested) >= 0 ? match[0].indexOf(requested) : 0);
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
  append(file, content, cursor, content.length, chain, state, limits);
}

function append(
  file: ProjectFile,
  content: string,
  sourceStart: number,
  sourceEnd: number,
  chain: readonly string[],
  state: ExpansionState,
  limits: RequiredLimits,
): void {
  if (sourceEnd <= sourceStart || state.stopped) return;
  const fragment = content.slice(sourceStart, sourceEnd);
  if (new TextEncoder().encode(state.output + fragment).byteLength > limits.maximumOutputBytes) {
    state.diagnostics.push(
      diagnostic("output-limit", `Composed output exceeds ${limits.maximumOutputBytes} bytes`, file, sourceStart, sourceEnd, chain),
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
    sourceStart,
    sourceEnd,
    includeChain: [...chain],
  });
}

function stripFrontmatter(content: string): string {
  return content.replace(frontmatter, "");
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

function isStringRecord(value: unknown): value is Record<string, string | undefined> {
  return typeof value === "object" && value !== null;
}
