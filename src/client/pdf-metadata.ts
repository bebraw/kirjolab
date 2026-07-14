import type { PDFDocumentProxy } from "pdfjs-dist";
import { normalizeDoi } from "../domain/bibliography";
import { loadPdfJsRuntime } from "./pdfjs-runtime";

export interface PdfMetadataCandidates {
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly doi: string;
  readonly pagesScanned: number;
  readonly diagnostics: readonly string[];
}

const maximumPages = 3;
const maximumTextLength = 65_536;

export async function extractPdfMetadata(url: string): Promise<PdfMetadataCandidates> {
  const { getDocument, GlobalWorkerOptions } = await loadPdfJsRuntime();
  GlobalWorkerOptions.workerSrc = "/pdf.worker.js";
  const loadingTask = getDocument({ url });
  let documentModel: PDFDocumentProxy | null = null;
  try {
    documentModel = await loadingTask.promise;
    const metadata = await documentModel.getMetadata();
    const pagesScanned = Math.min(maximumPages, documentModel.numPages);
    let openingText = "";
    for (let pageNumber = 1; pageNumber <= pagesScanned && openingText.length < maximumTextLength; pageNumber += 1) {
      const page = await documentModel.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        const remaining = maximumTextLength - openingText.length;
        if (remaining <= 0) break;
        openingText += `${openingText ? " " : ""}${item.str}`.slice(0, remaining);
      }
    }
    return derivePdfMetadataCandidates(metadata.info, openingText, pagesScanned);
  } finally {
    await loadingTask.destroy();
  }
}

export function derivePdfMetadataCandidates(information: unknown, openingTextValue: string, pagesScanned: number): PdfMetadataCandidates {
  const info = isUnknownRecord(information) ? information : {};
  const title = boundedString(info.Title, 2_000);
  const authors = splitAuthors(boundedString(info.Author, 2_000));
  const year = extractYear(boundedString(info.CreationDate, 100) || boundedString(info.ModDate, 100));
  const metadataText = [info.Title, info.Author, info.Subject, info.Keywords]
    .map((value) => (typeof value === "string" ? value : ""))
    .join(" ");
  const doi = extractDoi(`${metadataText} ${openingTextValue.slice(0, maximumTextLength)}`);
  const diagnostics: string[] = [];
  if (!title && authors.length === 0 && !year && !doi) diagnostics.push("No useful metadata was found in the PDF.");
  if (!doi) diagnostics.push("No DOI was detected in the embedded metadata or opening pages.");
  return { title, authors, year, doi, pagesScanned: Math.max(0, Math.min(maximumPages, pagesScanned)), diagnostics };
}

function splitAuthors(value: string): string[] {
  if (!value) return [];
  return value
    .split(/\s*(?:;|\band\b)\s*/iu)
    .map((author) => author.trim())
    .filter(Boolean)
    .slice(0, 64)
    .map((author) => author.slice(0, 300));
}

function extractYear(value: string): string {
  return /(?<year>(?:19|20)\d{2})/u.exec(value)?.groups?.year ?? "";
}

function extractDoi(value: string): string {
  const match = /\b10\.\d{4,9}\/[\w.()/:;-]+/iu.exec(value)?.[0] ?? "";
  return normalizeDoi(match.replace(/[),.;]+$/u, "")).slice(0, 500);
}

function boundedString(value: unknown, maximumLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
