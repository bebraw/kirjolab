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
import {
  projectPublicationStructure,
  publicationFootnoteReferences,
  replacePublicationFootnoteReferences,
  type PublicationFootnote,
  type PublicationStructure,
  type PublicationTableAlignment,
} from "../domain/publication-structure";
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
    if (line.kind === "heading") renderer.heading(line.text, Math.max(12, 20 - line.depth * 1.5), 8, line.footnotes);
    else if (line.kind === "blank") renderer.blank();
    else if (line.kind === "table") renderer.table(line.header, line.rows, line.alignments, line.footnotes);
    else renderer.paragraph(line.text, line.kind === "code" ? 9 : 10.5, line.kind === "bullet" ? 14 : 0, line.footnotes);
  }
  renderer.finish();
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
  | { readonly kind: "body" | "bullet" | "code"; readonly text: string; readonly depth: 0; readonly footnotes: readonly PdfNote[] }
  | { readonly kind: "heading"; readonly text: string; readonly depth: number; readonly footnotes: readonly PdfNote[] }
  | {
      readonly kind: "table";
      readonly header: readonly string[];
      readonly rows: readonly (readonly string[])[];
      readonly alignments: readonly PublicationTableAlignment[];
      readonly footnotes: readonly PdfNote[];
    };

interface PdfNote {
  readonly id: string;
  readonly number: number;
  readonly text: string;
}

function pdfLines(markdown: string, bibliography: string, publicationProfile: ProjectPublicationProfile): PdfLine[] {
  const lines: PdfLine[] = [];
  const references = publicationReferenceLabels(markdown);
  const citations = publicationCitationEntries(bibliography);
  const structure = projectPublicationStructure(markdown);
  const sourceLines = markdown.split(/\r?\n/u);
  let code = false;
  for (const [lineIndex, sourceLine] of sourceLines.entries()) {
    if (/^[ \t]*```/u.test(sourceLine)) {
      code = !code;
      continue;
    }
    if (code) {
      lines.push({ kind: "code", text: printablePdfText(sourceLine), depth: 0, footnotes: [] });
      continue;
    }
    const table = structure.tablesByStartLine.get(lineIndex);
    if (table) {
      const rawCells = [...table.header, ...table.rows.flat()];
      lines.push({
        kind: "table",
        header: table.header.map((cell) => printablePdfText(pdfInlineText(cell, publicationProfile, references, citations, structure))),
        rows: table.rows.map((row) =>
          row.map((cell) => printablePdfText(pdfInlineText(cell, publicationProfile, references, citations, structure))),
        ),
        alignments: table.alignments,
        footnotes: pdfNotes(rawCells, publicationProfile, references, citations, structure),
      });
      continue;
    }
    if (structure.tableLines.has(lineIndex) || structure.footnoteDefinitionLines.has(lineIndex)) continue;
    if (isPublicationReferenceDeclaration(sourceLine)) continue;
    const heading = headingLine.exec(sourceLine);
    if (heading?.groups?.marks && heading.groups.title) {
      lines.push({
        kind: "heading",
        text: printablePdfText(
          pdfInlineText(stripInlineMarkdown(heading.groups.title), publicationProfile, references, citations, structure),
        ),
        depth: heading.groups.marks.length,
        footnotes: pdfNotes([heading.groups.title], publicationProfile, references, citations, structure),
      });
      continue;
    }
    const bullet = /^[ \t]*[-*+]?[ \t]*(?<text>.*)$/u.exec(sourceLine)?.groups?.text ?? "";
    if (!bullet) lines.push({ kind: "blank", text: "", depth: 0 });
    else {
      const kind = /^[ \t]*[-*+][ \t]+/u.test(sourceLine) ? "bullet" : "body";
      lines.push({
        kind,
        text: printablePdfText(pdfInlineText(bullet, publicationProfile, references, citations, structure)),
        depth: 0,
        footnotes: pdfNotes([bullet], publicationProfile, references, citations, structure),
      });
    }
  }
  return lines;
}

function pdfInlineText(
  value: string,
  publicationProfile: ProjectPublicationProfile,
  references: ReadonlyMap<string, string>,
  citations: ReturnType<typeof publicationCitationEntries>,
  structure: PublicationStructure,
): string {
  const directives = replacePublicationTextDirectives(value, (directive) => {
    if (directive.kind === "ref") return publicationReferenceLabel(directive, references);
    return publicationCitationText(directive, citations, publicationProfile.citationStyle);
  });
  return replacePublicationFootnoteReferences(directives, structure.footnotesById, (footnote) => `[${footnote.number}]`)
    .replace(/!\[(?<alt>[^\]]*)\]\([^\s)]+\)/gu, "$<alt>")
    .replace(/\[(?<label>[^\]]+)\]\([^\s)]+\)/gu, "$<label>")
    .replace(/[*_`~]/gu, "")
    .replace(/\{#[^}\r\n]+\}/gu, "")
    .trim();
}

function pdfNotes(
  values: readonly string[],
  publicationProfile: ProjectPublicationProfile,
  references: ReadonlyMap<string, string>,
  citations: ReturnType<typeof publicationCitationEntries>,
  structure: PublicationStructure,
): PdfNote[] {
  const notes = new Map<string, PublicationFootnote>();
  for (const value of values) {
    for (const note of publicationFootnoteReferences(value, structure.footnotesById)) notes.set(note.id, note);
  }
  return [...notes.values()].map((note) => ({
    id: note.id,
    number: note.number,
    text: printablePdfText(pdfInlineText(note.content, publicationProfile, references, citations, structure)),
  }));
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
  #reservedNoteHeight = 0;
  readonly #notesByPage = new Map<PDFPage, PdfNote[]>();
  readonly #placedNoteIds = new Set<string>();

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

  heading(text: string, size: number, spaceBefore: number, footnotes: readonly PdfNote[] = []): void {
    this.#reserveFootnotes(footnotes);
    this.#y -= spaceBefore;
    this.#drawWrapped(printablePdfText(text), this.#bold, size, 0, size * 1.25);
    this.#y -= 4;
  }

  paragraph(text: string, size: number, indent: number, footnotes: readonly PdfNote[] = []): void {
    this.#reserveFootnotes(footnotes);
    this.#drawWrapped(printablePdfText(text), this.#regular, size, indent, size * 1.45);
  }

  table(
    header: readonly string[],
    rows: readonly (readonly string[])[],
    alignments: readonly PublicationTableAlignment[],
    footnotes: readonly PdfNote[],
  ): void {
    this.#reserveFootnotes(footnotes);
    const availableWidth = this.#page.getWidth() - this.#margin * 2;
    const columnWidth = availableWidth / header.length;
    this.#ensureSpace(18);
    this.#drawRule();
    this.#drawTableRow(header, alignments, columnWidth, this.#bold);
    this.#drawRule();
    for (const row of rows) this.#drawTableRow(row, alignments, columnWidth, this.#regular);
    this.#drawRule();
    this.#y -= 6;
  }

  finish(): void {
    for (const [page, notes] of this.#notesByPage) {
      const size = 8;
      const leading = 10;
      const width = page.getWidth() - this.#margin * 2;
      const noteLines = notes.flatMap((note) =>
        wrapPdfText(`[${note.number}] ${note.text}`, this.#regular, size, width).map((text) => ({ text, note })),
      );
      let y = this.#margin + noteLines.length * leading;
      page.drawLine({
        start: { x: this.#margin, y: y + 4 },
        end: { x: this.#margin + Math.min(72, width), y: y + 4 },
        thickness: 0.6,
      });
      for (const { text } of noteLines) {
        page.drawText(text, { x: this.#margin, y, size, font: this.#regular });
        y -= leading;
      }
    }
  }

  blank(): void {
    this.#y -= 7;
  }

  #drawTableRow(cells: readonly string[], alignments: readonly PublicationTableAlignment[], columnWidth: number, font: PDFFont): void {
    const size = 9;
    const leading = 11;
    const padding = 4;
    const wrapped = cells.map((cell) => wrapPdfText(cell, font, size, columnWidth - padding * 2));
    const rowHeight = Math.max(...wrapped.map((cell) => cell.length)) * leading + padding * 2;
    this.#ensureSpace(rowHeight);
    for (const [column, cellLines] of wrapped.entries()) {
      for (const [lineIndex, text] of cellLines.entries()) {
        const textWidth = font.widthOfTextAtSize(text, size);
        const left = this.#margin + column * columnWidth + padding;
        const alignment = alignments[column] ?? "left";
        const x =
          alignment === "right"
            ? left + columnWidth - padding * 2 - textWidth
            : alignment === "center"
              ? left + (columnWidth - padding * 2 - textWidth) / 2
              : left;
        this.#page.drawText(text, { x, y: this.#y - padding - size - lineIndex * leading, size, font });
      }
    }
    this.#y -= rowHeight;
  }

  #drawRule(): void {
    this.#page.drawLine({
      start: { x: this.#margin, y: this.#y },
      end: { x: this.#page.getWidth() - this.#margin, y: this.#y },
      thickness: 0.7,
    });
  }

  #reserveFootnotes(footnotes: readonly PdfNote[]): void {
    const additions = footnotes.filter((note) => !this.#placedNoteIds.has(note.id));
    if (additions.length === 0) return;
    const width = this.#page.getWidth() - this.#margin * 2;
    const height =
      additions.reduce((total, note) => total + wrapPdfText(`[${note.number}] ${note.text}`, this.#regular, 8, width).length * 10, 0) +
      (this.#reservedNoteHeight === 0 ? 8 : 0);
    if (this.#y - height < this.#margin + this.#reservedNoteHeight) this.#page = this.#newPage();
    this.#reservedNoteHeight += height;
    const pageNotes = this.#notesByPage.get(this.#page) ?? [];
    pageNotes.push(...additions);
    this.#notesByPage.set(this.#page, pageNotes);
    for (const note of additions) this.#placedNoteIds.add(note.id);
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
    if (this.#y - height >= this.#margin + this.#reservedNoteHeight) return;
    this.#page = this.#newPage();
  }

  #newPage(): PDFPage {
    const page = this.#document.addPage([...this.#pageSize]);
    this.#y = page.getHeight() - this.#margin;
    this.#reservedNoteHeight = 0;
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
