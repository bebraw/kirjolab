import { isRecord } from "../unknown-value";
import { isBibliographicRecord, type BibliographicRecord } from "./metadata";

export interface LibraryPdfArtifact {
  readonly id: string;
  readonly referenceId: string | null;
  readonly name: string;
  readonly contentType: "application/pdf";
  readonly size: number;
  readonly objectKey: string;
  readonly fingerprint: string;
  readonly rights: "private" | "shareable" | "unknown";
  readonly createdAt: string;
}

/** Safe project-facing metadata for an owner's PDF attached to a linked reference. */
export interface ProjectReferencePdf {
  readonly id: string;
  readonly referenceId: string;
  readonly name: string;
  readonly size: number;
  readonly fingerprint: string;
}

export interface PdfDraftResult {
  readonly reference: BibliographicRecord;
  readonly artifact: LibraryPdfArtifact;
  readonly created: boolean;
}

/** Narrow authority record used by consumers that need PDF catalog metadata. */
export interface LibraryPdfArtifactItem {
  readonly artifact: LibraryPdfArtifact;
  readonly reference: BibliographicRecord | null;
}

/** A bounded page selected beside the owner-scoped Library storage authority. */
export interface LibraryPdfArtifactPage {
  readonly items: readonly LibraryPdfArtifactItem[];
  readonly next: string | null;
}

export function isProjectReferencePdfs(value: unknown): value is ProjectReferencePdf[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        Object.keys(item).length === 5 &&
        ["id", "referenceId", "name", "size", "fingerprint"].every((key) => key in item) &&
        typeof item.id === "string" &&
        typeof item.referenceId === "string" &&
        typeof item.name === "string" &&
        typeof item.size === "number" &&
        Number.isInteger(item.size) &&
        item.size >= 0 &&
        typeof item.fingerprint === "string",
    )
  );
}

export function isPdfDraftResult(value: unknown): value is PdfDraftResult {
  return (
    isRecord(value) && isBibliographicRecord(value.reference) && isLibraryPdfArtifact(value.artifact) && typeof value.created === "boolean"
  );
}

export function isLibraryPdfArtifactItem(value: unknown): value is LibraryPdfArtifactItem {
  if (!isRecord(value) || !isLibraryPdfArtifact(value.artifact)) return false;
  if (value.reference === null) return value.artifact.referenceId === null;
  return isBibliographicRecord(value.reference) && value.artifact.referenceId === value.reference.id;
}

export function isLibraryPdfArtifactPage(value: unknown): value is LibraryPdfArtifactPage {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.length <= 100 &&
    value.items.every(isLibraryPdfArtifactItem) &&
    (value.next === null || typeof value.next === "string")
  );
}

export function isLibraryPdfArtifact(value: unknown): value is LibraryPdfArtifact {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.referenceId === null || typeof value.referenceId === "string") &&
    typeof value.name === "string" &&
    value.contentType === "application/pdf" &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    value.size >= 0 &&
    typeof value.objectKey === "string" &&
    typeof value.fingerprint === "string" &&
    (value.rights === "private" || value.rights === "shareable" || value.rights === "unknown") &&
    typeof value.createdAt === "string"
  );
}
