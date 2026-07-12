import { parseBibTeX, serializeBibTeX } from "./bibliography";
import { composeProject, type CompositionDiagnostic, type CompositionSourceSpan, type ProjectFile } from "./project-files";
import { publicationWordStatistics, type PublicationWordStatistics } from "./publication-statistics";
import { defaultProjectPublicationProfile, type ProjectPublicationProfile } from "./workspace";

export { countPublicationWords, publicationWordStatistics } from "./publication-statistics";

export const exportSchemaVersion = "kirjolab-export-v1" as const;
export const exportTemplateVersion = "kirjolab-article-v1" as const;
export const exportPdfEngine = "kirjolab-pdf-lib@1.17.1" as const;
export const exportZipEngine = "fflate@0.8.3" as const;

export interface ExportPipelineInput {
  readonly title: string;
  readonly files: readonly ProjectFile[];
  readonly entryFileId: string;
  readonly bibliography: string;
  readonly publicationProfile?: ProjectPublicationProfile;
}

export interface ExportSourceLocation {
  readonly fileId: string;
  readonly path: string;
  readonly from: number;
  readonly to: number;
  readonly line: number;
  readonly includeChain: readonly string[];
}

export interface ExportDiagnostic extends ExportSourceLocation {
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface GeneratedSourceSpan extends ExportSourceLocation {
  readonly target: "main.tex";
  readonly generatedLineStart: number;
  readonly generatedLineEnd: number;
}

export interface SourceMappedIntermediate {
  readonly schemaVersion: typeof exportSchemaVersion;
  readonly title: string;
  readonly markdown: string;
  readonly citationKeys: readonly string[];
  readonly bibliography: string;
  readonly publicationProfile: ProjectPublicationProfile;
  readonly sourceMap: readonly CompositionSourceSpan[];
  readonly diagnostics: readonly ExportDiagnostic[];
  readonly statistics: PublicationWordStatistics;
}

export interface ExportManifest {
  readonly schemaVersion: typeof exportSchemaVersion;
  readonly templateVersion: typeof exportTemplateVersion;
  readonly pdfEngine: typeof exportPdfEngine;
  readonly zipEngine: typeof exportZipEngine;
  readonly entrypoint: "main.tex";
  readonly canonicalSource: "main.md";
  readonly citationKeys: readonly string[];
  readonly wordCount: number;
  readonly publicationProfile: ProjectPublicationProfile;
}

export interface MaterializedExportBundle {
  readonly intermediate: SourceMappedIntermediate;
  readonly manifest: ExportManifest;
  readonly mainTex: string;
  readonly bibliography: string;
  readonly generatedSourceMap: readonly GeneratedSourceSpan[];
}

const citationDirective = /:cite\[(?<keys>[^\]\r\n]+)\]/gu;
const headingLine = /^(?<marks>#{1,6})[ \t]+(?<title>.+?)[ \t]*(?:\{#[^}\r\n]+\})?[ \t]*$/u;

export function buildExportBundle(input: ExportPipelineInput): MaterializedExportBundle {
  const composition = composeProject(input.files, input.entryFileId);
  const citationKeys = citedAliases(composition.content);
  const bibliography = citedBibliography(input.bibliography, citationKeys);
  const publicationProfile = input.publicationProfile ?? defaultProjectPublicationProfile;
  const intermediate: SourceMappedIntermediate = {
    schemaVersion: exportSchemaVersion,
    title: input.title.trim() || "Untitled project",
    markdown: composition.content,
    citationKeys,
    bibliography,
    publicationProfile,
    sourceMap: composition.sourceMap,
    diagnostics: composition.diagnostics.map((diagnostic) => exportDiagnostic(diagnostic, input.files)),
    statistics: publicationWordStatistics(composition, input.files),
  };
  const latex = materializeLatex(intermediate, input.files);
  return {
    intermediate,
    manifest: {
      schemaVersion: exportSchemaVersion,
      templateVersion: exportTemplateVersion,
      pdfEngine: exportPdfEngine,
      zipEngine: exportZipEngine,
      entrypoint: "main.tex",
      canonicalSource: "main.md",
      citationKeys,
      wordCount: intermediate.statistics.totalWords,
      publicationProfile,
    },
    mainTex: latex.source,
    bibliography,
    generatedSourceMap: latex.sourceMap,
  };
}

export function assertExportable(intermediate: SourceMappedIntermediate): void {
  const error = intermediate.diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (!error) return;
  throw new ExportPipelineError("Project composition must be fixed before export", intermediate.diagnostics);
}

export class ExportPipelineError extends Error {
  readonly diagnostics: readonly ExportDiagnostic[];

  constructor(message: string, diagnostics: readonly ExportDiagnostic[]) {
    super(message);
    this.name = "ExportPipelineError";
    this.diagnostics = diagnostics;
  }
}

function citedAliases(source: string): string[] {
  const aliases = new Map<string, string>();
  for (const match of source.matchAll(citationDirective)) {
    for (const candidate of (match.groups?.keys ?? "").split(",")) {
      const alias = candidate.trim();
      const normalized = alias.toLocaleLowerCase();
      if (/^[a-z0-9:._+-]{1,200}$/iu.test(alias) && !aliases.has(normalized)) aliases.set(normalized, alias);
    }
  }
  return [...aliases.values()];
}

function citedBibliography(source: string, citationKeys: readonly string[]): string {
  const cited = new Set(citationKeys.map((key) => key.toLocaleLowerCase()));
  return serializeBibTeX(parseBibTeX(source).filter((entry) => cited.has(entry.citationKey.toLocaleLowerCase())));
}

function exportDiagnostic(diagnostic: CompositionDiagnostic, files: readonly ProjectFile[]): ExportDiagnostic {
  const file = files.find((candidate) => candidate.id === diagnostic.fileId);
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    severity: "error",
    fileId: diagnostic.fileId,
    path: diagnostic.path,
    from: diagnostic.from,
    to: diagnostic.to,
    line: lineAt(file?.content ?? "", diagnostic.from),
    includeChain: [...diagnostic.includeChain],
  };
}

function materializeLatex(
  intermediate: SourceMappedIntermediate,
  files: readonly ProjectFile[],
): { source: string; sourceMap: GeneratedSourceSpan[] } {
  const lines = [
    "% Generated by Kirjolab; canonical source remains main.md.",
    `\\documentclass[11pt]{article}`,
    `\\usepackage[T1]{fontenc}`,
    `\\usepackage[utf8]{inputenc}`,
    `\\usepackage{lmodern}`,
    `\\usepackage{hyperref}`,
    `\\usepackage{natbib}`,
    `\\usepackage{graphicx}`,
    `\\usepackage{booktabs}`,
    `\\title{${escapeLatex(intermediate.title)}}`,
    `\\date{}`,
    `\\begin{document}`,
    `\\maketitle`,
  ];
  const sourceMap: GeneratedSourceSpan[] = [];
  let outputOffset = 0;
  for (const markdownLine of intermediate.markdown.split(/\r?\n/u)) {
    const generated = latexLine(markdownLine, intermediate.publicationProfile);
    const generatedLineStart = lines.length + 1;
    lines.push(...generated);
    const location = sourceLocationAt(intermediate.sourceMap, files, outputOffset, markdownLine.length);
    sourceMap.push({
      ...location,
      target: "main.tex",
      generatedLineStart,
      generatedLineEnd: lines.length,
    });
    outputOffset += markdownLine.length + 1;
  }
  if (intermediate.bibliography) {
    const bibliographyStyle =
      intermediate.publicationProfile.citationStyle === "apa"
        ? "apalike"
        : intermediate.publicationProfile.citationStyle === "ieee"
          ? "unsrt"
          : "plainnat";
    lines.push(`\\bibliographystyle{${bibliographyStyle}}`, "\\bibliography{bibliography}");
  }
  lines.push("\\end{document}", "");
  return { source: lines.join("\n"), sourceMap };
}

function latexLine(line: string, publicationProfile: ProjectPublicationProfile): string[] {
  const heading = headingLine.exec(line);
  if (heading?.groups?.marks && heading.groups.title) {
    const commands = ["section", "subsection", "subsubsection", "paragraph", "subparagraph", "subparagraph"];
    const command = commands[heading.groups.marks.length - 1] ?? "paragraph";
    return [`\\${command}{${inlineLatex(heading.groups.title, publicationProfile)}}`];
  }
  const bullet = /^[ \t]*[-*+][ \t]+(?<text>.+)$/u.exec(line);
  if (bullet?.groups?.text) return [`\\begin{itemize}`, `\\item ${inlineLatex(bullet.groups.text, publicationProfile)}`, `\\end{itemize}`];
  const numbered = /^[ \t]*\d+[.)][ \t]+(?<text>.+)$/u.exec(line);
  if (numbered?.groups?.text)
    return [`\\begin{enumerate}`, `\\item ${inlineLatex(numbered.groups.text, publicationProfile)}`, `\\end{enumerate}`];
  if (/^[ \t]*$/u.test(line)) return [""];
  if (/^[ \t]*```/u.test(line)) return [`% fenced code boundary`];
  return [inlineLatex(line, publicationProfile), ""];
}

function inlineLatex(value: string, publicationProfile: ProjectPublicationProfile): string {
  const tokens: string[] = [];
  const token = (replacement: string): string => {
    const index = tokens.push(replacement) - 1;
    return `\u0000${index}\u0000`;
  };
  let protectedValue = value
    .replace(citationDirective, (_directive, ...values: unknown[]) => {
      const groups = values.at(-1);
      const keys = isStringRecord(groups)
        ? (groups.keys ?? "")
            .split(",")
            .map((key) => key.trim())
            .filter((key) => /^[a-z0-9:._+-]{1,200}$/iu.test(key))
        : [];
      const command = publicationProfile.citationStyle === "ieee" ? "cite" : "citep";
      return keys.length > 0 ? token(`\\${command}{${keys.join(",")}}`) : "";
    })
    .replace(/\$(?<math>[^$\r\n]+)\$/gu, (_match, ...values: unknown[]) => {
      const groups = values.at(-1);
      return token(`$${isStringRecord(groups) ? (groups.math ?? "") : ""}$`);
    })
    .replace(/`(?<code>[^`\r\n]+)`/gu, (_match, ...values: unknown[]) => {
      const groups = values.at(-1);
      return token(`\\texttt{${escapeLatex(isStringRecord(groups) ? (groups.code ?? "") : "")}}`);
    })
    .replace(/\[(?<label>[^\]]+)\]\((?<url>https?:\/\/[^\s)]+)\)/giu, (_match, ...values: unknown[]) => {
      const groups = values.at(-1);
      if (!isStringRecord(groups)) return "";
      return token(`\\href{${escapeLatexUrl(groups.url ?? "")}}{${escapeLatex(groups.label ?? "")}}`);
    });
  protectedValue = escapeLatex(protectedValue)
    .replace(/\*\*(?<text>.+?)\*\*/gu, "\\textbf{$<text>}")
    .replace(/(?<!\*)\*(?<text>[^*]+)\*(?!\*)/gu, "\\emph{$<text>}");
  return protectedValue.replace(/\u0000(?<index>\d+)\u0000/gu, (_match, ...values: unknown[]) => {
    const groups = values.at(-1);
    const index = Number(isStringRecord(groups) ? groups.index : Number.NaN);
    return tokens[index] ?? "";
  });
}

function escapeLatex(value: string): string {
  return value.replace(/[\\{}$&#%_~^]/gu, (character) => {
    const escaped: Record<string, string> = {
      "\\": "\\textbackslash{}",
      "{": "\\{",
      "}": "\\}",
      $: "\\$",
      "&": "\\&",
      "#": "\\#",
      "%": "\\%",
      _: "\\_",
      "~": "\\textasciitilde{}",
      "^": "\\textasciicircum{}",
    };
    return escaped[character] ?? character;
  });
}

function escapeLatexUrl(value: string): string {
  return value.replace(/[{}%]/gu, (character) => `\\${character}`);
}

function sourceLocationAt(
  sourceMap: readonly CompositionSourceSpan[],
  files: readonly ProjectFile[],
  outputOffset: number,
  length: number,
): ExportSourceLocation {
  const span =
    sourceMap.find((candidate) => outputOffset >= candidate.outputStart && outputOffset < candidate.outputEnd) ?? sourceMap.at(-1);
  if (!span) return { fileId: "", path: "main.md", from: 0, to: 0, line: 1, includeChain: [] };
  const within = Math.max(0, Math.min(outputOffset - span.outputStart, span.sourceEnd - span.sourceStart));
  const from = span.sourceStart + within;
  const to = Math.min(span.sourceEnd, from + length);
  const file = files.find((candidate) => candidate.id === span.fileId);
  return {
    fileId: span.fileId,
    path: span.path,
    from,
    to,
    line: lineAt(file?.content ?? "", from),
    includeChain: [...span.includeChain],
  };
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, Math.max(0, Math.min(offset, source.length))).split(/\r?\n/u).length;
}

function isStringRecord(value: unknown): value is Record<string, string | undefined> {
  return typeof value === "object" && value !== null;
}
