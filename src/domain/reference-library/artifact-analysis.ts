import { isRecord } from "../unknown-value";
import { isLibraryHighlightImportCandidate, type LibraryHighlightImportCandidate } from "./pdf-annotations";

export type ArtifactAnalysisKind = "pdf-highlights" | "pdf-references";
export type ArtifactAnalysisStatus = "queued" | "running" | "ready" | "failed";

export interface PdfHighlightAnalysisCandidate extends LibraryHighlightImportCandidate {
  readonly id: string;
  readonly source: "annotation" | "flattened";
  readonly confidence: number;
}

export interface PdfHighlightAnalysisResult {
  readonly candidates: readonly PdfHighlightAnalysisCandidate[];
  readonly pagesScanned: number;
  readonly pagesTotal: number;
  readonly truncated: boolean;
}

export interface PdfReferenceAnalysisCandidate {
  readonly id: string;
  readonly page: number;
  readonly raw: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly doi: string;
  readonly url: string;
  readonly confidence: number;
}

export interface PdfReferenceAnalysisResult {
  readonly candidates: readonly PdfReferenceAnalysisCandidate[];
  readonly pagesScanned: number;
  readonly pagesTotal: number;
  readonly referencesStartPage: number | null;
  readonly truncated: boolean;
}

export type ArtifactAnalysisResult = PdfHighlightAnalysisResult | PdfReferenceAnalysisResult;

export interface ArtifactAnalysis {
  readonly artifactId: string;
  readonly fingerprint: string;
  readonly kind: ArtifactAnalysisKind;
  readonly status: ArtifactAnalysisStatus;
  readonly result: ArtifactAnalysisResult | null;
  readonly error: string;
  readonly requestedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

export interface ArtifactAnalysisJob {
  readonly version: 1;
  readonly ownerKey: string;
  readonly artifactId: string;
  readonly fingerprint: string;
  readonly kind: ArtifactAnalysisKind;
  readonly requestedAt: string;
}

export function isPdfHighlightAnalysisResult(value: unknown): value is PdfHighlightAnalysisResult {
  return (
    isRecord(value) &&
    Array.isArray(value.candidates) &&
    value.candidates.length <= 128 &&
    value.candidates.every(isPdfHighlightAnalysisCandidate) &&
    hasValidPdfAnalysisPages(value) &&
    typeof value.truncated === "boolean"
  );
}

export function isPdfReferenceAnalysisResult(value: unknown): value is PdfReferenceAnalysisResult {
  return (
    isRecord(value) &&
    Array.isArray(value.candidates) &&
    value.candidates.length <= 128 &&
    value.candidates.every(isPdfReferenceAnalysisCandidate) &&
    hasValidPdfAnalysisPages(value) &&
    (value.referencesStartPage === null ||
      (typeof value.referencesStartPage === "number" &&
        Number.isInteger(value.referencesStartPage) &&
        value.referencesStartPage > 0 &&
        value.referencesStartPage <= value.pagesTotal)) &&
    typeof value.truncated === "boolean"
  );
}

export function isArtifactAnalysis(value: unknown): value is ArtifactAnalysis {
  return (
    isRecord(value) &&
    typeof value.artifactId === "string" &&
    typeof value.fingerprint === "string" &&
    (value.kind === "pdf-highlights" || value.kind === "pdf-references") &&
    (value.status === "queued" || value.status === "running" || value.status === "ready" || value.status === "failed") &&
    (value.result === null ||
      (value.kind === "pdf-highlights" && isPdfHighlightAnalysisResult(value.result)) ||
      (value.kind === "pdf-references" && isPdfReferenceAnalysisResult(value.result))) &&
    typeof value.error === "string" &&
    typeof value.requestedAt === "string" &&
    (value.startedAt === null || typeof value.startedAt === "string") &&
    (value.completedAt === null || typeof value.completedAt === "string")
  );
}

export function isArtifactAnalysisJob(value: unknown): value is ArtifactAnalysisJob {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.ownerKey === "string" &&
    value.ownerKey.length > 0 &&
    value.ownerKey.length <= 200 &&
    typeof value.artifactId === "string" &&
    typeof value.fingerprint === "string" &&
    (value.kind === "pdf-highlights" || value.kind === "pdf-references") &&
    typeof value.requestedAt === "string"
  );
}

export function isPdfReferenceAnalysisCandidate(value: unknown): value is PdfReferenceAnalysisCandidate {
  return (
    isRecord(value) &&
    isBoundedString(value.id, 1, 500) &&
    isBoundedInteger(value.page, 1, 200) &&
    isBoundedString(value.raw, 1, 8_000) &&
    isBoundedString(value.title, 0, 2_000) &&
    isBoundedAuthors(value.authors) &&
    isBoundedString(value.year, 0, 20) &&
    isBoundedString(value.doi, 0, 500) &&
    isBoundedString(value.url, 0, 2_000) &&
    isConfidence(value.confidence)
  );
}

function hasValidPdfAnalysisPages(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { pagesScanned: number; pagesTotal: number } {
  return isBoundedInteger(value.pagesScanned, 0, 200) && isBoundedInteger(value.pagesTotal, value.pagesScanned, Number.MAX_SAFE_INTEGER);
}

function isBoundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}

function isBoundedInteger(value: unknown, minimum: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && typeof minimum === "number" && value >= minimum && value <= maximum;
}

function isBoundedAuthors(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 50 && value.every((author) => isBoundedString(author, 1, 500));
}

function isConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isPdfHighlightAnalysisCandidate(value: unknown): value is PdfHighlightAnalysisCandidate {
  if (!isRecord(value) || !isLibraryHighlightImportCandidate(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 200 &&
    (value.source === "annotation" || value.source === "flattened") &&
    isConfidence(value.confidence)
  );
}
