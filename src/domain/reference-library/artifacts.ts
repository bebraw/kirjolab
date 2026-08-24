import { isRecord } from "../unknown-value";
import {
  isBibliographicRecord,
  type BibliographicRecord,
  type MetadataFieldProvenance,
  type MetadataProvenanceMethod,
  type ReferenceMetadataField,
} from "./metadata";

export const maximumLibraryPdfArtifactPageBytes = 16 * 1_024 * 1_024;

const catalogStringLimits = {
  id: 200,
  referenceKey: 80,
  name: 512,
  fingerprint: 500,
  type: 100,
  title: 2_000,
  author: 500,
  year: 100,
  venue: 2_000,
  doi: 500,
  url: 2_000,
  abstract: 20_000,
  timestamp: 100,
  actor: 500,
} as const;
const maximumCatalogAuthors = 100;
const referenceMetadataFields: readonly ReferenceMetadataField[] = ["type", "title", "authors", "year", "venue", "doi", "url", "abstract"];
const metadataProvenanceMethods = new Set<MetadataProvenanceMethod>([
  "bibtex",
  "openalex",
  "crossref",
  "datacite",
  "semantic-scholar",
  "filename",
  "manual",
  "pdf-metadata",
  "pdf-reference",
  "web",
  "migration",
]);

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

/** Byte-bounded artifact metadata safe to cross the corpus catalog RPC boundary. */
export type LibraryPdfCatalogArtifact = Omit<LibraryPdfArtifact, "objectKey">;

/** Byte-bounded bibliographic display metadata safe to cross the corpus catalog RPC boundary. */
export type LibraryPdfCatalogReference = Omit<BibliographicRecord, "archivedAt" | "deletedAt">;

export interface LibraryPdfCatalogItem {
  readonly artifact: LibraryPdfCatalogArtifact;
  readonly reference: LibraryPdfCatalogReference | null;
}

/** A bounded page selected beside the owner-scoped Library storage authority. */
export interface LibraryPdfArtifactPage {
  readonly items: readonly LibraryPdfCatalogItem[];
  readonly next: string | null;
}

export function projectLibraryPdfCatalogItem(item: LibraryPdfArtifactItem): LibraryPdfCatalogItem {
  const { artifact, reference } = item;
  const projectedArtifact: LibraryPdfCatalogArtifact = {
    id: boundedIdentity(artifact.id, "Artifact id"),
    referenceId: artifact.referenceId === null ? null : boundedIdentity(artifact.referenceId, "Reference id"),
    name: artifact.name.slice(0, catalogStringLimits.name),
    contentType: artifact.contentType,
    size: artifact.size,
    fingerprint: boundedIdentity(artifact.fingerprint, "Artifact fingerprint", catalogStringLimits.fingerprint),
    rights: artifact.rights,
    createdAt: boundedIdentity(artifact.createdAt, "Artifact timestamp", catalogStringLimits.timestamp),
  };
  if (!reference) return { artifact: projectedArtifact, reference: null };
  if (projectedArtifact.referenceId !== reference.id) throw new Error("PDF artifact reference relationship is invalid");
  return {
    artifact: projectedArtifact,
    reference: {
      id: boundedIdentity(reference.id, "Reference id"),
      referenceKey: boundedIdentity(reference.referenceKey, "Reference key", catalogStringLimits.referenceKey),
      type: reference.type.slice(0, catalogStringLimits.type),
      title: reference.title.slice(0, catalogStringLimits.title),
      authors: reference.authors.slice(0, maximumCatalogAuthors).map((author) => author.slice(0, catalogStringLimits.author)),
      year: reference.year.slice(0, catalogStringLimits.year),
      venue: reference.venue.slice(0, catalogStringLimits.venue),
      doi: reference.doi.slice(0, catalogStringLimits.doi),
      url: reference.url.slice(0, catalogStringLimits.url),
      abstract: reference.abstract.slice(0, catalogStringLimits.abstract),
      provenance: projectCatalogProvenance(reference.provenance),
      createdAt: boundedIdentity(reference.createdAt, "Reference timestamp", catalogStringLimits.timestamp),
      updatedAt: boundedIdentity(reference.updatedAt, "Reference timestamp", catalogStringLimits.timestamp),
    },
  };
}

export function libraryPdfCatalogItemByteLength(item: LibraryPdfCatalogItem): number {
  return new TextEncoder().encode(JSON.stringify(item)).byteLength;
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
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["items", "next"]) ||
    !Array.isArray(value.items) ||
    value.items.length > 100 ||
    !value.items.every(isLibraryPdfCatalogItem) ||
    !(value.next === null || boundedString(value.next, catalogStringLimits.id, true))
  ) {
    return false;
  }
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= maximumLibraryPdfArtifactPageBytes;
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

function isLibraryPdfCatalogItem(value: unknown): value is LibraryPdfCatalogItem {
  if (!isRecord(value) || !hasExactKeys(value, ["artifact", "reference"]) || !isLibraryPdfCatalogArtifact(value.artifact)) return false;
  if (value.reference === null) return value.artifact.referenceId === null;
  return isLibraryPdfCatalogReference(value.reference) && value.artifact.referenceId === value.reference.id;
}

function isLibraryPdfCatalogArtifact(value: unknown): value is LibraryPdfCatalogArtifact {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "referenceId", "name", "contentType", "size", "fingerprint", "rights", "createdAt"]) &&
    boundedString(value.id, catalogStringLimits.id, true) &&
    (value.referenceId === null || boundedString(value.referenceId, catalogStringLimits.id, true)) &&
    boundedString(value.name, catalogStringLimits.name) &&
    value.contentType === "application/pdf" &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    value.size >= 0 &&
    boundedString(value.fingerprint, catalogStringLimits.fingerprint, true) &&
    (value.rights === "private" || value.rights === "shareable" || value.rights === "unknown") &&
    boundedString(value.createdAt, catalogStringLimits.timestamp, true)
  );
}

function isLibraryPdfCatalogReference(value: unknown): value is LibraryPdfCatalogReference {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "referenceKey",
      "type",
      "title",
      "authors",
      "year",
      "venue",
      "doi",
      "url",
      "abstract",
      "provenance",
      "createdAt",
      "updatedAt",
    ]) &&
    boundedString(value.id, catalogStringLimits.id, true) &&
    boundedString(value.referenceKey, catalogStringLimits.referenceKey, true) &&
    boundedString(value.type, catalogStringLimits.type) &&
    boundedString(value.title, catalogStringLimits.title) &&
    Array.isArray(value.authors) &&
    value.authors.length <= maximumCatalogAuthors &&
    value.authors.every((author) => boundedString(author, catalogStringLimits.author)) &&
    boundedString(value.year, catalogStringLimits.year) &&
    boundedString(value.venue, catalogStringLimits.venue) &&
    boundedString(value.doi, catalogStringLimits.doi) &&
    boundedString(value.url, catalogStringLimits.url) &&
    boundedString(value.abstract, catalogStringLimits.abstract) &&
    isCatalogProvenance(value.provenance) &&
    boundedString(value.createdAt, catalogStringLimits.timestamp, true) &&
    boundedString(value.updatedAt, catalogStringLimits.timestamp, true)
  );
}

function projectCatalogProvenance(
  provenance: BibliographicRecord["provenance"],
): Partial<Record<ReferenceMetadataField, MetadataFieldProvenance>> {
  const projected: Partial<Record<ReferenceMetadataField, MetadataFieldProvenance>> = {};
  for (const field of referenceMetadataFields) {
    const value = provenance[field];
    if (!value || !metadataProvenanceMethods.has(value.method)) continue;
    projected[field] = {
      method: value.method,
      capturedAt: value.capturedAt.slice(0, catalogStringLimits.timestamp),
      actor: value.actor.slice(0, catalogStringLimits.actor),
    };
  }
  return projected;
}

function isCatalogProvenance(value: unknown): value is LibraryPdfCatalogReference["provenance"] {
  if (!isRecord(value) || Object.keys(value).some((field) => !referenceMetadataFields.includes(field as ReferenceMetadataField)))
    return false;
  return Object.values(value).every(
    (entry) =>
      isRecord(entry) &&
      hasExactKeys(entry, ["method", "capturedAt", "actor"]) &&
      typeof entry.method === "string" &&
      metadataProvenanceMethods.has(entry.method as MetadataProvenanceMethod) &&
      boundedString(entry.capturedAt, catalogStringLimits.timestamp) &&
      boundedString(entry.actor, catalogStringLimits.actor),
  );
}

function boundedIdentity(value: string, label: string, maximum: number = catalogStringLimits.id): string {
  if (!boundedString(value, maximum, true)) throw new Error(`${label} exceeds the corpus catalog boundary`);
  return value;
}

function boundedString(value: unknown, maximum: number, required = false): value is string {
  return typeof value === "string" && (!required || value.length > 0) && value.length <= maximum;
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}
