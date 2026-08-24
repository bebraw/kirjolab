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
