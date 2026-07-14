import { parseBibTeX, serializeBibTeX } from "./bibliography";
import { composeProject, type CompositionDiagnostic, type CompositionSourceSpan, type ProjectFile } from "./project-files";
import { publicationWordStatistics, type PublicationWordStatistics } from "./publication-statistics";
import { defaultProjectPublicationProfile, type ProjectPublicationProfile } from "./workspace";
import { resolveSubmissionTemplate } from "./submission-templates";
import {
  isPublicationReferenceDeclaration,
  publicationCitationEntries,
  publicationCitationText,
  publicationReferenceLabel,
  publicationReferenceLabels,
  replacePublicationTextDirectives,
} from "./scholarly-export";
import {
  projectPublicationStructure,
  replacePublicationFootnoteReferences,
  type PublicationFootnote,
  type PublicationStructure,
  type PublicationTable,
} from "./publication-structure";

export { countPublicationWords, publicationWordStatistics } from "./publication-statistics";

export const exportSchemaVersion = "kirjolab-export-v1" as const;
export const exportTemplateVersion = "kirjolab-article-v2" as const;
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
  const template = resolveSubmissionTemplate(intermediate.publicationProfile);
  const documentOptions = ["11pt", intermediate.publicationProfile.paperSize === "letter" ? "letterpaper" : "a4paper"];
  if (template.columns === 2) documentOptions.push("twocolumn");
  const lines = [
    "% Generated by Kirjolab; canonical source remains main.md.",
    `\\documentclass[${documentOptions.join(",")}]{article}`,
    `\\usepackage[T1]{fontenc}`,
    `\\usepackage[utf8]{inputenc}`,
    `\\usepackage{lmodern}`,
    `\\usepackage{hyperref}`,
    `\\usepackage{natbib}`,
    `\\usepackage{graphicx}`,
    `\\usepackage{booktabs}`,
    `\\usepackage[margin=${template.marginPoints / 72}in]{geometry}`,
    `\\usepackage{setspace}`,
    template.lineSpacing === 2 ? `\\doublespacing` : template.lineSpacing === 1.5 ? `\\onehalfspacing` : `\\singlespacing`,
    `\\title{${escapeLatex(intermediate.title)}}`,
    template.anonymize ? `\\author{Anonymous}` : `\\author{}`,
    `\\date{}`,
    `\\begin{document}`,
    ...(template.titlePage ? ["\\begin{titlepage}"] : []),
    `\\maketitle`,
    ...(template.titlePage ? ["\\end{titlepage}"] : []),
  ];
  const sourceMap: GeneratedSourceSpan[] = [];
  const references = publicationReferenceLabels(intermediate.markdown);
  const citations = publicationCitationEntries(intermediate.bibliography);
  const structure = projectPublicationStructure(intermediate.markdown);
  const emittedFootnotes = new Set<string>();
  let fencedCode = false;
  let outputOffset = 0;
  for (const [lineIndex, markdownLine] of intermediate.markdown.split(/\r?\n/u).entries()) {
    const fence = /^[ \t]*```/u.test(markdownLine);
    const generated = latexLine(
      markdownLine,
      lineIndex,
      intermediate.publicationProfile,
      references,
      citations,
      structure,
      emittedFootnotes,
      fencedCode,
    );
    if (fence) fencedCode = !fencedCode;
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

function latexLine(
  line: string,
  lineIndex: number,
  publicationProfile: ProjectPublicationProfile,
  references: ReadonlyMap<string, string>,
  citations: ReturnType<typeof publicationCitationEntries>,
  structure: PublicationStructure,
  emittedFootnotes: Set<string>,
  literal: boolean,
): string[] {
  if (/^[ \t]*```/u.test(line)) return [`% fenced code boundary`];
  if (literal) return [escapeLatex(line), ""];
  const table = structure.tablesByStartLine.get(lineIndex);
  if (table) return latexTable(table, publicationProfile, references, citations, structure, emittedFootnotes);
  if (structure.tableLines.has(lineIndex)) return ["% structured table continuation"];
  if (structure.footnoteDefinitionLines.has(lineIndex)) return ["% structured footnote definition"];
  if (isPublicationReferenceDeclaration(line)) return ["% scholarly reference declaration"];
  const heading = headingLine.exec(line);
  if (heading?.groups?.marks && heading.groups.title) {
    const commands = ["section", "subsection", "subsubsection", "paragraph", "subparagraph", "subparagraph"];
    const command = commands[heading.groups.marks.length - 1] ?? "paragraph";
    return [`\\${command}{${inlineLatex(heading.groups.title, publicationProfile, references, citations, structure, emittedFootnotes)}}`];
  }
  const bullet = /^[ \t]*[-*+][ \t]+(?<text>.+)$/u.exec(line);
  if (bullet?.groups?.text)
    return [
      `\\begin{itemize}`,
      `\\item ${inlineLatex(bullet.groups.text, publicationProfile, references, citations, structure, emittedFootnotes)}`,
      `\\end{itemize}`,
    ];
  const numbered = /^[ \t]*\d+[.)][ \t]+(?<text>.+)$/u.exec(line);
  if (numbered?.groups?.text)
    return [
      `\\begin{enumerate}`,
      `\\item ${inlineLatex(numbered.groups.text, publicationProfile, references, citations, structure, emittedFootnotes)}`,
      `\\end{enumerate}`,
    ];
  if (/^[ \t]*$/u.test(line)) return [""];
  return [inlineLatex(line, publicationProfile, references, citations, structure, emittedFootnotes), ""];
}

function latexTable(
  table: PublicationTable,
  publicationProfile: ProjectPublicationProfile,
  references: ReadonlyMap<string, string>,
  citations: ReturnType<typeof publicationCitationEntries>,
  structure: PublicationStructure,
  emittedFootnotes: Set<string>,
): string[] {
  const tableFootnoteIds = new Set<string>();
  const renderRow = (cells: readonly string[]): string =>
    `${cells
      .map((cell) => inlineLatex(cell, publicationProfile, references, citations, structure, emittedFootnotes, "table", tableFootnoteIds))
      .join(" & ")} \\\\`;
  const columns = table.alignments.map((alignment) => ({ left: "l", center: "c", right: "r" })[alignment]).join("");
  const lines = [
    "\\begin{table}[htbp]",
    "\\centering",
    `\\begin{tabular}{${columns}}`,
    "\\toprule",
    renderRow(table.header.map((cell) => `**${cell}**`)),
    "\\midrule",
    ...table.rows.map(renderRow),
    "\\bottomrule",
    "\\end{tabular}",
    "\\end{table}",
  ];
  for (const id of tableFootnoteIds) {
    const footnote = structure.footnotesById.get(id);
    if (!footnote) continue;
    lines.push(
      `\\footnotetext[${footnote.number}]{${inlineLatex(
        footnote.content,
        publicationProfile,
        references,
        citations,
        structure,
        emittedFootnotes,
      )}}`,
    );
  }
  return lines;
}

function inlineLatex(
  value: string,
  publicationProfile: ProjectPublicationProfile,
  references: ReadonlyMap<string, string>,
  citations: ReturnType<typeof publicationCitationEntries>,
  structure: PublicationStructure,
  emittedFootnotes: Set<string>,
  footnoteContext: "text" | "table" = "text",
  tableFootnoteIds?: Set<string>,
): string {
  const tokens: string[] = [];
  const token = (replacement: string): string => {
    const index = tokens.push(replacement) - 1;
    return `\u0000${index}\u0000`;
  };
  let protectedValue = replacePublicationTextDirectives(value, (directive) => {
    if (directive.kind === "ref") return token(escapeLatex(publicationReferenceLabel(directive, references)));
    const keys = directive.content
      .split(",")
      .map((key) => key.trim())
      .filter((key) => /^[a-z0-9:._+-]{1,200}$/iu.test(key));
    if (keys.length === 0) return "";
    const prefix = escapeLatex(directive.attributes.get("prefix") ?? "");
    const suffix = escapeLatex(directive.attributes.get("suffix") ?? "");
    const locator = escapeLatex(directive.attributes.get("locator") ?? "");
    const mode = directive.attributes.get("mode") ?? "parenthetical";
    if (mode === "full") return token(escapeLatex(publicationCitationText(directive, citations, publicationProfile.citationStyle)));
    const command = publicationProfile.citationStyle === "ieee" ? "cite" : mode === "textual" ? "citet" : "citep";
    const citation =
      locator && publicationProfile.citationStyle !== "ieee" && mode !== "textual"
        ? `\\${command}[${locator}]{${keys.join(",")}}`
        : `\\${command}{${keys.join(",")}}${locator ? `, ${locator}` : ""}`;
    return token(`${prefix}${citation}${suffix}`);
  });
  protectedValue = replacePublicationFootnoteReferences(protectedValue, structure.footnotesById, (footnote) =>
    token(
      latexFootnote(footnote, publicationProfile, references, citations, structure, emittedFootnotes, footnoteContext, tableFootnoteIds),
    ),
  )
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
  const protectedTokenPattern = new RegExp(String.raw`\u0000(?<index>\d+)\u0000`, "gu");
  return protectedValue.replace(protectedTokenPattern, (_match, ...values: unknown[]) => {
    const groups = values.at(-1);
    const index = Number(isStringRecord(groups) ? groups.index : Number.NaN);
    return tokens[index] ?? "";
  });
}

function latexFootnote(
  footnote: PublicationFootnote,
  publicationProfile: ProjectPublicationProfile,
  references: ReadonlyMap<string, string>,
  citations: ReturnType<typeof publicationCitationEntries>,
  structure: PublicationStructure,
  emittedFootnotes: Set<string>,
  context: "text" | "table",
  tableFootnoteIds?: Set<string>,
): string {
  if (emittedFootnotes.has(footnote.id)) return `\\footnotemark[${footnote.number}]`;
  emittedFootnotes.add(footnote.id);
  if (context === "table") {
    tableFootnoteIds?.add(footnote.id);
    return "\\footnotemark";
  }
  return `\\footnote{${inlineLatex(footnote.content, publicationProfile, references, citations, structure, emittedFootnotes)}}`;
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
