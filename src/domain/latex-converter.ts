import type { ProjectTemplateFileSeed, ProjectTemplateSeed } from "./project-templates";
import { resolveProjectPath } from "./project-files";
import { defaultProjectPublicationProfile } from "./workspace";
import type {
  LatexArchiveFile,
  LatexArchiveInspection,
  LatexBibliographyReference,
  LatexImportDiagnostic,
  LatexIncludeReference,
} from "./latex-import";

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

export interface LatexConversionPreview {
  readonly seed: ProjectTemplateSeed;
  readonly assets: readonly LatexConversionAsset[];
  readonly report: LatexConversionReport;
}

export interface LatexConversionAsset {
  readonly path: string;
  readonly mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/avif" | "image/svg+xml";
  readonly bytes: Uint8Array;
}

const maximumTikzBlocks = 32;
const maximumTikzBytes = 128 * 1024;
const documentBegin = /\\begin\s*\{document\}/u;
const documentEnd = /\\end\s*\{document\}/u;

export function convertLatexInspection(inspection: LatexArchiveInspection, selection: LatexConversionSelection): LatexConversionPreview {
  const root = inspection.files.find((file) => file.path === selection.rootPath && file.kind === "tex");
  if (!root || !inspection.rootCandidates.includes(selection.rootPath)) {
    throw new LatexConversionError("invalid-root-selection", `Selected LaTeX root is unavailable: ${selection.rootPath}`);
  }
  const rootText = root.text ?? "";

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
      (reference.sourcePath !== selection.rootPath || insideDocumentBody(rootText, reference.from)),
  );
  const bibliographyPath = selectBibliography(inspection.files, bibliographyReferences, selection.bibliographyPath);
  const pathMap = markdownPathMap(reachablePaths, selection.rootPath);
  const images = referencedImages(inspection.files, reachablePaths, pathMap);
  diagnostics.push(...images.diagnostics);
  const files: ProjectTemplateFileSeed[] = [];
  let tikzBlocks = 0;

  for (const path of reachablePaths) {
    const file = inspection.files.find((candidate) => candidate.path === path);
    if (!file?.text) continue;
    const conversion = convertLatexFile(file, path === selection.rootPath, includesBySource.get(path) ?? [], pathMap, images.paths);
    tikzBlocks += conversion.tikzBlocks;
    diagnostics.push(...conversion.diagnostics);
    files.push({ path: pathMap.get(path)!, content: conversion.markdown });
  }
  if (tikzBlocks > maximumTikzBlocks) {
    throw new LatexConversionError("unsupported-environment", `LaTeX import contains more than ${maximumTikzBlocks} TikZ blocks`);
  }

  const bibliography = bibliographyPath ? (inspection.files.find((file) => file.path === bibliographyPath)?.text ?? "") : "";
  const seed: ProjectTemplateSeed = {
    schemaVersion: 1,
    entryPath: "main.md",
    files,
    folders: projectFolders(files.map((file) => file.path)),
    bibliography,
    publicationProfile: defaultProjectPublicationProfile,
  };
  return {
    seed,
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
      if (path === selection.rootPath && !insideDocumentBody(rootText, reference.from)) continue;
      if (reference.resolvedPath) visit(reference.resolvedPath);
    }
    visiting.delete(path);
    visited.add(path);
  }
}

export class LatexConversionError extends Error {
  readonly code: "invalid-root-selection" | "invalid-bibliography-selection" | "unsupported-environment";

  constructor(code: LatexConversionError["code"], message: string) {
    super(message);
    this.name = "LatexConversionError";
    this.code = code;
  }
}

function groupReferences(references: readonly LatexIncludeReference[]): Map<string, LatexIncludeReference[]> {
  const grouped = new Map<string, LatexIncludeReference[]>();
  for (const reference of references) grouped.set(reference.sourcePath, [...(grouped.get(reference.sourcePath) ?? []), reference]);
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
    const key = markdownPath.toLocaleLowerCase();
    if (used.has(key)) throw new LatexConversionError("invalid-root-selection", `Converted Markdown path collides: ${markdownPath}`);
    used.add(key);
    result.set(path, markdownPath);
  }
  return result;
}

function referencedImages(
  files: readonly LatexArchiveFile[],
  sourcePaths: readonly string[],
  markdownPaths: ReadonlyMap<string, string>,
): {
  readonly assets: readonly LatexConversionAsset[];
  readonly paths: ReadonlyMap<string, string>;
  readonly diagnostics: readonly LatexImportDiagnostic[];
} {
  const imageFiles = files.filter((file) => file.kind === "image");
  const imagePaths = new Set(imageFiles.map((file) => file.path));
  const searchFolders = files
    .filter((file) => sourcePaths.includes(file.path) && file.text)
    .flatMap((file) => graphicSearchFolders(file.text ?? ""));
  const assets = new Map<string, LatexConversionAsset>();
  const paths = new Map<string, string>();
  const diagnostics: LatexImportDiagnostic[] = [];

  for (const sourcePath of sourcePaths) {
    const source = files.find((file) => file.path === sourcePath)?.text ?? "";
    for (const match of stripComments(source).matchAll(/\\includegraphics(?:\[[^\]]*\])?\s*\{([^}]+)\}/gu)) {
      const requested = (match[1] ?? "").trim();
      const candidates = resolveImageCandidates(sourcePath, requested, searchFolders, imagePaths);
      if (candidates.length !== 1) {
        diagnostics.push({
          code: candidates.length === 0 ? "missing-image" : "ambiguous-image",
          severity: "warning",
          path: sourcePath,
          from: match.index,
          to: match.index + match[0].length,
          message:
            candidates.length === 0
              ? `Referenced figure was not found: ${requested}`
              : `Referenced figure matches more than one archive file: ${requested}`,
        });
        continue;
      }
      const archivePath = candidates[0]!;
      const image = imageFiles.find((file) => file.path === archivePath)!;
      const assetPath = archivePath.startsWith("figures/") ? archivePath : `figures/${archivePath.split("/").at(-1)!}`;
      const existing = assets.get(assetPath.toLocaleLowerCase());
      if (existing && !equalBytes(existing.bytes, image.bytes)) {
        diagnostics.push({
          code: "ambiguous-image",
          severity: "warning",
          path: sourcePath,
          message: `Referenced figures collide at project path: ${assetPath}`,
        });
        continue;
      }
      assets.set(assetPath.toLocaleLowerCase(), { path: assetPath, mediaType: imageMediaType(archivePath), bytes: image.bytes });
      paths.set(imageReferenceKey(sourcePath, requested), assetPath);
    }
  }
  for (const asset of assets.values()) {
    if ([...markdownPaths.values()].some((path) => path.toLocaleLowerCase() === asset.path.toLocaleLowerCase())) {
      throw new LatexConversionError("unsupported-environment", `Figure path collides with converted Markdown: ${asset.path}`);
    }
  }
  return { assets: [...assets.values()].sort((left, right) => left.path.localeCompare(right.path)), paths, diagnostics };
}

function graphicSearchFolders(source: string): string[] {
  return [...stripComments(source).matchAll(/\\graphicspath\s*\{((?:\{[^}]*\})+)\}/gu)].flatMap((match) =>
    [...(match[1] ?? "").matchAll(/\{([^}]*)\}/gu)].flatMap((folder) => {
      const normalized = (folder[1] ?? "").trim().replace(/^\.\//u, "").replace(/\/$/u, "");
      return normalized ? [normalized] : [];
    }),
  );
}

function resolveImageCandidates(
  sourcePath: string,
  requested: string,
  searchFolders: readonly string[],
  imagePaths: ReadonlySet<string>,
): string[] {
  if (!requested || requested.startsWith("/") || requested.includes("\\") || requested.includes("..")) return [];
  const extensions = ["", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"];
  const bases = new Set<string>();
  const relative = resolveProjectPath(sourcePath, requested);
  if (relative) bases.add(relative);
  bases.add(requested.replace(/^\.\//u, ""));
  for (const folder of searchFolders) bases.add(`${folder}/${requested.replace(/^\.\//u, "")}`);
  const candidates = new Set<string>();
  for (const base of bases) {
    for (const extension of extensions) if (imagePaths.has(`${base}${extension}`)) candidates.add(`${base}${extension}`);
  }
  return [...candidates].sort((left, right) => left.localeCompare(right));
}

function imageReferenceKey(sourcePath: string, requested: string): string {
  return `${sourcePath}\0${requested}`;
}

function imageMediaType(path: string): LatexConversionAsset["mediaType"] {
  const extension = path.slice(path.lastIndexOf(".")).toLocaleLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  if (extension === ".avif") return "image/avif";
  return "image/svg+xml";
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function convertLatexFile(
  file: LatexArchiveFile,
  root: boolean,
  includes: readonly LatexIncludeReference[],
  pathMap: ReadonlyMap<string, string>,
  imagePaths: ReadonlyMap<string, string>,
): { readonly markdown: string; readonly diagnostics: readonly LatexImportDiagnostic[]; readonly tikzBlocks: number } {
  let source = file.text ?? "";
  if (root) source = documentBody(source);
  const diagnostics: LatexImportDiagnostic[] = [];
  const footnotes: string[] = [];
  const literalBlocks: string[] = [];
  let tikzBlocks = 0;

  source = replaceEnvironment(source, "tikzpicture", (body, whole, from) => {
    if (new TextEncoder().encode(whole).byteLength > maximumTikzBytes) {
      throw new LatexConversionError("unsupported-environment", `TikZ block exceeds 128 KiB in ${file.path}`);
    }
    tikzBlocks += 1;
    diagnostics.push({
      code: "tikz-preserved",
      severity: "info",
      path: file.path,
      from,
      to: from + whole.length,
      message: "TikZ source was preserved without rendering",
    });
    return protectBlock(`\`\`\`tikz\n${whole.trim()}\n\`\`\``);
  });
  for (const environment of ["lstlisting", "verbatim", "minted"] as const) {
    source = replaceEnvironment(source, environment, (body) =>
      protectBlock(`\`\`\`\n${body.replace(/^\{[^}]*\}\s*/u, "").trim()}\n\`\`\``),
    );
  }
  source = replaceEnvironment(source, "comment", () => "");
  source = stripComments(source);
  source = replaceEnvironment(source, "tabularx", (body) => tableMarkdown(body, 2));
  source = replaceEnvironment(source, "tabular", (body) => tableMarkdown(body, 1));
  source = replaceEnvironment(source, "abstract", (body) => `\n\n## Abstract {#abstract}\n\n${body.trim()}\n\n`);
  for (const environment of ["itemize", "enumerate"] as const) {
    source = replaceEnvironment(source, environment, (body) => listMarkdown(body, environment === "enumerate"));
  }
  source = replaceEnvironment(source, "opening", (body) => body);

  for (const include of [...includes].sort((left, right) => right.from - left.from)) {
    if (root && !insideDocumentBody(file.text ?? "", include.from)) continue;
    if (!include.resolvedPath) continue;
    const target = pathMap.get(include.resolvedPath);
    const current = pathMap.get(file.path);
    if (!target || !current) continue;
    source = replaceSourceCommand(source, include.requestedPath, `\n\n::include[${relativeMarkdownPath(current, target)}]\n\n`);
  }

  source = source.replace(/\\bibliographystyle\s*\{[^}]*\}/gu, "");
  source = source.replace(/\\(?:bibliography|addbibresource)(?:\[[^\]]*\])?\s*\{[^}]*\}/gu, "\n\n::bibliography[]\n\n");
  source = replaceSectionCommands(source);
  source = replaceSimpleCommand(source, ["textbf", "bf"], (value) => `**${value}**`);
  source = replaceSimpleCommand(source, ["textit", "emph", "textsl"], (value) => `*${value}*`);
  source = replaceSimpleCommand(source, ["texttt"], (value) => `\`${value}\``);
  source = replaceSimpleCommand(source, ["citet"], (value) => `:citet[${citationKeys(value)}]`);
  source = replaceSimpleCommand(source, ["citep"], (value) => `:citep[${citationKeys(value)}]`);
  source = replaceSimpleCommand(source, ["cite"], (value) => `:cite[${citationKeys(value)}]`);
  source = replaceSimpleCommand(source, ["autoref", "cref", "Cref", "ref"], (value) => `:ref[${value.trim()}]`);
  source = replaceSimpleCommand(source, ["label"], (value) => `\n\n::anchor[${value.trim()}]\n\n`);
  source = replaceSimpleCommand(source, ["url"], (value) => `<${value.trim()}>`);
  source = source.replace(/\\href\s*\{([^}]*)\}\s*\{([^}]*)\}/gu, "[$2]($1)");
  source = replaceSimpleCommand(source, ["footnote"], (value, index) => {
    const id = `latex-${footnoteScope(file.path)}-${index + 1}`;
    footnotes.push(`[^${id}]: ${value.trim()}`);
    return `[^${id}]`;
  });
  source = source.replace(/\\includegraphics(?:\[[^\]]*\])?\s*\{([^}]+)\}/gu, (_whole, requested: string) => {
    const target = imagePaths.get(imageReferenceKey(file.path, requested.trim()));
    const current = pathMap.get(file.path);
    return target && current ? `![Imported figure](${relativeMarkdownPath(current, target)})` : `[Missing figure: ${requested.trim()}]`;
  });
  source = source.replace(/\\\[\s*([\s\S]*?)\s*\\\]/gu, "\n\n$$$$\n$1\n$$$$\n\n");
  source = source.replace(/\\begin\s*\{(?:figure\*?|table\*?|center|description)\}(?:\[[^\]]*\])?/gu, "\n");
  source = source.replace(/\\end\s*\{(?:figure\*?|table\*?|center|description)\}/gu, "\n");
  source = source.replace(/\\(?:caption|keywords|institute|author|title|runningtitle|runningauthor)\s*\{([^}]*)\}/gu, "$1");
  source = source.replace(/\\(?:maketitle|centering|noindent|medskip|smallskip|bigskip|newpage|clearpage|vfill)\b/gu, "");
  source = source.replace(/\\(?:begin|end)\s*\{([^}]+)\}/gu, (whole: string, environment: string, offset: number) => {
    diagnostics.push({
      code: "unsupported-environment",
      severity: "warning",
      path: file.path,
      from: offset,
      to: offset + whole.length,
      message: `Unsupported LaTeX environment was reduced to its contents: ${environment}`,
    });
    return "\n";
  });
  for (const match of uniqueCommandMatches(source)) {
    diagnostics.push({
      code: "unsupported-command",
      severity: "warning",
      path: file.path,
      from: match.index,
      to: match.index + match[0].length,
      message: `Unsupported LaTeX command remains for review: \\${match[1]}`,
    });
  }
  source = unescapeLatex(source)
    .replaceAll(/\n[ \t]+/gu, "\n")
    .replaceAll(/[ \t]+\n/gu, "\n")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trim();
  for (const [index, block] of literalBlocks.entries()) source = source.replace(literalToken(index), block);
  return { markdown: `${source}${footnotes.length ? `\n\n${footnotes.join("\n")}` : ""}\n`, diagnostics, tikzBlocks };

  function protectBlock(block: string): string {
    const token = literalToken(literalBlocks.length);
    literalBlocks.push(block);
    return `\n\n${token}\n\n`;
  }
}

function documentBody(source: string): string {
  const begin = documentBegin.exec(source);
  if (!begin) return source;
  const bodyStart = begin.index + begin[0].length;
  const end = documentEnd.exec(source.slice(bodyStart));
  return source.slice(bodyStart, end ? bodyStart + end.index : undefined);
}

function insideDocumentBody(source: string, offset: number): boolean {
  const begin = documentBegin.exec(source);
  if (!begin) return true;
  const bodyStart = begin.index + begin[0].length;
  const end = documentEnd.exec(source.slice(bodyStart));
  return offset >= bodyStart && (!end || offset < bodyStart + end.index);
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

function replaceEnvironment(source: string, environment: string, replace: (body: string, whole: string, from: number) => string): string {
  const escaped = environment.replaceAll("*", "\\*");
  const pattern = new RegExp(`\\\\begin\\s*\\{${escaped}\\}(?:\\[[^\\]]*\\])?([\\s\\S]*?)\\\\end\\s*\\{${escaped}\\}`, "gu");
  return source.replace(pattern, (whole: string, body: string, offset: number) => replace(body, whole, offset));
}

function listMarkdown(body: string, ordered: boolean): string {
  const items = body.split(/\\item(?:\[[^\]]*\])?/gu).slice(1);
  return `\n\n${items.map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${item.trim()}`).join("\n")}\n\n`;
}

function tableMarkdown(body: string, argumentCount: number): string {
  let rowsSource = body.trimStart();
  for (let index = 0; index < argumentCount; index += 1) rowsSource = removeLeadingBraceGroup(rowsSource).trimStart();
  rowsSource = rowsSource.replace(/\\(?:toprule|midrule|bottomrule|hline)\b/gu, "");
  const rows = rowsSource
    .split(/\\\\(?:\[[^\]]*\])?/gu)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.split(/\s*&\s*/gu).map((cell) => cell.replaceAll("|", "\\|").replaceAll(/\s+/gu, " ").trim()));
  const columns = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length === 0 || columns === 0) return "";
  const normalized = rows.map((row) => [...row, ...Array.from({ length: columns - row.length }, () => "")]);
  const line = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
  return `\n\n${line(normalized[0]!)}\n${line(Array.from({ length: columns }, () => "---"))}\n${normalized
    .slice(1)
    .map((row) => line(row))
    .join("\n")}\n\n`;
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

function replaceSourceCommand(source: string, requestedPath: string, replacement: string): string {
  const escaped = requestedPath.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return source.replace(new RegExp(`\\\\(?:input|include)\\s*\\{\\s*${escaped}\\s*\\}`, "u"), replacement);
}

function replaceSectionCommands(source: string): string {
  const levels: Readonly<Record<string, number>> = { section: 2, subsection: 3, subsubsection: 4, paragraph: 5 };
  return source.replace(
    /\\(section|subsection|subsubsection|paragraph)(\*)?\s*\{([^}]*)\}\s*(?:\\label\s*\{([^}]*)\})?/gu,
    (_whole, command: string, _star: string | undefined, title: string, label: string | undefined) =>
      `\n\n${"#".repeat(levels[command] ?? 2)} ${title.trim()}${label ? ` {#${label.trim()}}` : ""}\n\n`,
  );
}

function replaceSimpleCommand(source: string, commands: readonly string[], replace: (value: string, index: number) => string): string {
  let count = 0;
  for (const command of commands) {
    const pattern = new RegExp(`\\\\${command}(?![A-Za-z])(?:\\s*\\[[^\\]]*\\])*\\s*\\{`, "gu");
    let cursor = 0;
    while (cursor < source.length) {
      pattern.lastIndex = cursor;
      const match = pattern.exec(source);
      if (!match) break;
      const open = match.index + match[0].lastIndexOf("{");
      const close = matchingBrace(source, open);
      if (close < 0) {
        cursor = open + 1;
        continue;
      }
      const replacement = replace(source.slice(open + 1, close), count++);
      source = `${source.slice(0, match.index)}${replacement}${source.slice(close + 1)}`;
      cursor = match.index + replacement.length;
    }
  }
  return source;
}

function matchingBrace(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function uniqueCommandMatches(source: string): RegExpMatchArray[] {
  const matches = [...source.matchAll(/\\([A-Za-z@]+)\b/gu)];
  const seen = new Set<string>();
  return matches.filter((match) => {
    const command = match[1] ?? "";
    if (seen.has(command)) return false;
    seen.add(command);
    return true;
  });
}

function citationKeys(value: string): string {
  return value
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
    .join(", ");
}

function footnoteScope(path: string): string {
  return path
    .replace(/\.tex$/iu, "")
    .replaceAll(/[^a-z0-9]+/giu, "-")
    .replaceAll(/^-|-$/gu, "")
    .toLocaleLowerCase();
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
  for (const path of paths) {
    const parts = path.split("/");
    parts.pop();
    for (let index = 1; index <= parts.length; index += 1) folders.add(parts.slice(0, index).join("/"));
  }
  return [...folders].sort((left, right) => left.localeCompare(right));
}
