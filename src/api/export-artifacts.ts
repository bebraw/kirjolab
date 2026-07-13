import { strToU8, zipSync, type Zippable } from "fflate";
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { assertExportable, exportPdfEngine, type MaterializedExportBundle } from "../domain/export-pipeline";
import type { ProjectFile } from "../domain/project-files";
import {
  isPublicationReferenceDeclaration,
  publicationCitationEntries,
  publicationCitationText,
  publicationReferenceLabel,
  publicationReferenceLabels,
  replacePublicationTextDirectives,
} from "../domain/scholarly-export";
import { resolveSubmissionTemplate, submissionPageSize } from "../domain/submission-templates";
import type { ProjectPublicationProfile } from "../domain/workspace";

const reproducibleTimestamp = new Date("1980-01-01T00:00:00.000Z");
const headingLine = /^(?<marks>#{1,6})[ \t]+(?<title>.+?)[ \t]*(?:\{#[^}\r\n]+\})?[ \t]*$/u;

export function latexArchive(bundle: MaterializedExportBundle): Uint8Array {
  return deterministicZip({
    "main.tex": bundle.mainTex,
    "bibliography.bib": bundle.bibliography,
    "export-manifest.json": stableJson(bundle.manifest),
    "source-map.json": stableJson(bundle.generatedSourceMap),
    "intermediate.json": stableJson(bundle.intermediate),
    "README.txt": "This project was composed from canonical Markdown by Kirjolab. Compile main.tex with a current LaTeX distribution.\n",
  });
}

export function archivalSourceBundle(
  bundle: MaterializedExportBundle,
  projectFiles: readonly ProjectFile[],
  projectSnapshot: unknown,
  binaryFiles: Readonly<Record<string, Uint8Array>> = {},
): Uint8Array {
  const files: Record<string, string | Uint8Array> = {
    "exports/main.tex": bundle.mainTex,
    "exports/bibliography.bib": bundle.bibliography,
    "exports/export-manifest.json": stableJson(bundle.manifest),
    "exports/source-map.json": stableJson(bundle.generatedSourceMap),
    "exports/intermediate.json": stableJson(bundle.intermediate),
    "project/project-snapshot.json": stableJson(projectSnapshot),
  };
  for (const file of [...projectFiles].sort((left, right) => left.path.localeCompare(right.path))) {
    files[`project/${file.path}`] = file.content;
  }
  for (const [path, bytes] of Object.entries(binaryFiles)) files[`project-assets/${safeArchivePath(path)}`] = bytes;
  return deterministicZip(files);
}

export async function renderExportPdf(bundle: MaterializedExportBundle): Promise<Uint8Array> {
  assertExportable(bundle.intermediate);
  const document = await PDFDocument.create({ updateMetadata: false });
  document.setTitle(bundle.intermediate.title, { showInWindowTitleBar: true });
  document.setProducer(exportPdfEngine);
  document.setCreator("Kirjolab");
  document.setCreationDate(reproducibleTimestamp);
  document.setModificationDate(reproducibleTimestamp);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const renderer = new PdfTextRenderer(document, regular, bold, bundle.intermediate.publicationProfile);
  renderer.heading(bundle.intermediate.title, 22, 18);
  for (const line of pdfLines(bundle.intermediate.markdown, bundle.intermediate.bibliography, bundle.intermediate.publicationProfile)) {
    if (line.kind === "heading") renderer.heading(line.text, Math.max(12, 20 - line.depth * 1.5), 8);
    else if (line.kind === "blank") renderer.blank();
    else renderer.paragraph(line.text, line.kind === "code" ? 9 : 10.5, line.kind === "bullet" ? 14 : 0);
  }
  return await document.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
}

function deterministicZip(files: Readonly<Record<string, string | Uint8Array>>): Uint8Array {
  const zippable: Zippable = {};
  for (const path of Object.keys(files).sort()) {
    const value = files[path];
    if (value === undefined) continue;
    const bytes = typeof value === "string" ? strToU8(value) : value;
    zippable[safeArchivePath(path)] = [bytes, { mtime: reproducibleTimestamp, os: 3, attrs: 0o100644 << 16 }];
  }
  return zipSync(zippable, { level: 9, mtime: reproducibleTimestamp, os: 3 });
}

function safeArchivePath(value: string): string {
  const segments = value
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..");
  return segments.join("/") || "unnamed";
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, stableJsonReplacer, 2)}\n`;
}

function stableJsonReplacer(_key: string, value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function stripInlineMarkdown(value: string): string {
  return value.replace(/[*_`~]/gu, "").trim();
}

type PdfLine =
  | { readonly kind: "blank"; readonly text: ""; readonly depth: 0 }
  | { readonly kind: "body" | "bullet" | "code"; readonly text: string; readonly depth: 0 }
  | { readonly kind: "heading"; readonly text: string; readonly depth: number };

function pdfLines(markdown: string, bibliography: string, publicationProfile: ProjectPublicationProfile): PdfLine[] {
  const lines: PdfLine[] = [];
  const references = publicationReferenceLabels(markdown);
  const citations = publicationCitationEntries(bibliography);
  let code = false;
  for (const sourceLine of markdown.split(/\r?\n/u)) {
    if (/^[ \t]*```/u.test(sourceLine)) {
      code = !code;
      continue;
    }
    if (code) {
      lines.push({ kind: "code", text: printablePdfText(sourceLine), depth: 0 });
      continue;
    }
    if (isPublicationReferenceDeclaration(sourceLine)) continue;
    const heading = headingLine.exec(sourceLine);
    if (heading?.groups?.marks && heading.groups.title) {
      lines.push({
        kind: "heading",
        text: printablePdfText(stripInlineMarkdown(heading.groups.title)),
        depth: heading.groups.marks.length,
      });
      continue;
    }
    const bullet = /^[ \t]*[-*+]?[ \t]*(?<text>.*)$/u.exec(sourceLine)?.groups?.text ?? "";
    if (!bullet) lines.push({ kind: "blank", text: "", depth: 0 });
    else {
      const kind = /^[ \t]*[-*+][ \t]+/u.test(sourceLine) ? "bullet" : "body";
      lines.push({ kind, text: printablePdfText(pdfInlineText(bullet, publicationProfile, references, citations)), depth: 0 });
    }
  }
  return lines;
}

function pdfInlineText(
  value: string,
  publicationProfile: ProjectPublicationProfile,
  references: ReadonlyMap<string, string>,
  citations: ReturnType<typeof publicationCitationEntries>,
): string {
  return replacePublicationTextDirectives(value, (directive) => {
    if (directive.kind === "ref") return publicationReferenceLabel(directive, references);
    return publicationCitationText(directive, citations, publicationProfile.citationStyle);
  })
    .replace(/!\[(?<alt>[^\]]*)\]\([^\s)]+\)/gu, "$<alt>")
    .replace(/\[(?<label>[^\]]+)\]\([^\s)]+\)/gu, "$<label>")
    .replace(/[*_`~]/gu, "")
    .replace(/\{#[^}\r\n]+\}/gu, "")
    .trim();
}

function printablePdfText(value: string): string {
  return value.replace(/[^\u0020-\u007e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac]/gu, "?");
}

class PdfTextRenderer {
  readonly #document: PDFDocument;
  readonly #regular: PDFFont;
  readonly #bold: PDFFont;
  readonly #pageSize: readonly [number, number];
  readonly #margin: number;
  readonly #spacing: number;
  #page: PDFPage;
  #y = 0;

  constructor(document: PDFDocument, regular: PDFFont, bold: PDFFont, profile: ProjectPublicationProfile) {
    this.#document = document;
    this.#regular = regular;
    this.#bold = bold;
    const template = resolveSubmissionTemplate(profile);
    this.#pageSize = submissionPageSize(profile);
    this.#margin = template.marginPoints;
    this.#spacing = template.lineSpacing;
    this.#page = this.#newPage();
  }

  heading(text: string, size: number, spaceBefore: number): void {
    this.#y -= spaceBefore;
    this.#drawWrapped(printablePdfText(text), this.#bold, size, 0, size * 1.25);
    this.#y -= 4;
  }

  paragraph(text: string, size: number, indent: number): void {
    this.#drawWrapped(printablePdfText(text), this.#regular, size, indent, size * 1.45);
  }

  blank(): void {
    this.#y -= 7;
  }

  #drawWrapped(text: string, font: PDFFont, size: number, indent: number, leading: number): void {
    const width = this.#page.getWidth() - this.#margin * 2 - indent;
    for (const line of wrapPdfText(text, font, size, width)) {
      this.#ensureSpace(leading);
      this.#page.drawText(`${indent > 0 ? "• " : ""}${line}`, { x: this.#margin + indent, y: this.#y, size, font });
      this.#y -= leading * this.#spacing;
    }
  }

  #ensureSpace(height: number): void {
    if (this.#y - height >= this.#margin) return;
    this.#page = this.#newPage();
  }

  #newPage(): PDFPage {
    const page = this.#document.addPage([...this.#pageSize]);
    this.#y = page.getHeight() - this.#margin;
    return page;
  }
}

function wrapPdfText(value: string, font: PDFFont, size: number, maximumWidth: number): string[] {
  const words = value.split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(next, size) > maximumWidth) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}
