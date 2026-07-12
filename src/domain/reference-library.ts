import { normalizeDoi, projectBibTeXPublication, type BibTeXEntry } from "./bibliography";

export type ReferenceMetadataField = "type" | "title" | "authors" | "year" | "venue" | "doi" | "url" | "abstract";
export type MetadataProvenanceMethod = "bibtex" | "crossref" | "manual" | "web" | "migration";

export interface MetadataFieldProvenance {
  readonly method: MetadataProvenanceMethod;
  readonly capturedAt: string;
  readonly actor: string;
}

export interface BibliographicRecord {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly venue: string;
  readonly doi: string;
  readonly url: string;
  readonly abstract: string;
  readonly provenance: Readonly<Partial<Record<ReferenceMetadataField, MetadataFieldProvenance>>>;
  readonly archivedAt: string | null;
  readonly deletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BibliographicSnapshot {
  readonly referenceId: string;
  readonly type: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly venue: string;
  readonly doi: string;
  readonly url: string;
  readonly capturedAt: string;
  readonly tombstone: boolean;
}

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

export interface LibraryNote {
  readonly id: string;
  readonly referenceId: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LibraryHighlight {
  readonly id: string;
  readonly referenceId: string;
  readonly artifactId: string;
  readonly page: number;
  readonly quote: string;
  readonly comment: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReadingState {
  readonly referenceId: string;
  readonly status: "unread" | "reading" | "read";
  readonly rating: number | null;
  readonly updatedAt: string;
}

export interface ReferenceLibrarySnapshot {
  readonly references: readonly BibliographicRecord[];
  readonly artifacts: readonly LibraryPdfArtifact[];
  readonly notes: readonly LibraryNote[];
  readonly highlights: readonly LibraryHighlight[];
  readonly tags: Readonly<Record<string, readonly string[]>>;
  readonly reading: readonly ReadingState[];
}

export type ResearchShareKind = "artifact" | "note" | "highlight";

export type SharedResearchContent =
  | { readonly kind: "artifact"; readonly name: string; readonly size: number; readonly fingerprint: string; readonly objectKey: string }
  | { readonly kind: "note"; readonly body: string }
  | { readonly kind: "highlight"; readonly page: number; readonly quote: string; readonly comment: string };

export interface ResearchShareSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly referenceId: string;
  readonly resourceId: string;
  readonly kind: ResearchShareKind;
  readonly content: SharedResearchContent;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

const requiredFieldsByType: Readonly<Record<string, readonly ReferenceMetadataField[]>> = {
  article: ["title", "authors", "year", "venue"],
  book: ["title", "authors", "year", "venue"],
  inbook: ["title", "authors", "year", "venue"],
  incollection: ["title", "authors", "year", "venue"],
  inproceedings: ["title", "authors", "year", "venue"],
  manual: ["title"],
  mastersthesis: ["title", "authors", "year", "venue"],
  misc: ["title"],
  phdthesis: ["title", "authors", "year", "venue"],
  proceedings: ["title", "year"],
  techreport: ["title", "authors", "year", "venue"],
  unpublished: ["title", "authors"],
};

export function bibliographicSnapshot(record: BibliographicRecord, capturedAt = new Date().toISOString()): BibliographicSnapshot {
  return {
    referenceId: record.id,
    type: record.type,
    title: record.title,
    authors: [...record.authors],
    year: record.year,
    venue: record.venue,
    doi: record.doi,
    url: record.url,
    capturedAt,
    tombstone: record.deletedAt !== null,
  };
}

export function missingRequiredBibliographicFields(record: Pick<BibliographicRecord, ReferenceMetadataField>): ReferenceMetadataField[] {
  const required = requiredFieldsByType[record.type.toLowerCase()] ?? requiredFieldsByType.misc ?? ["title"];
  return required.filter((field) => {
    const value = record[field];
    return typeof value === "string" ? value.trim().length === 0 : value.length === 0;
  });
}

export function referenceFromBibTeX(
  entry: BibTeXEntry,
  id: string,
  provenance: MetadataFieldProvenance,
  createdAt = provenance.capturedAt,
): BibliographicRecord {
  const projected = projectBibTeXPublication(entry);
  const fields = Object.fromEntries(
    (["type", "title", "authors", "year", "venue", "doi", "url", "abstract"] as const).map((field) => [field, provenance]),
  );
  return {
    id,
    ...projected,
    doi: normalizeDoi(projected.doi),
    provenance: fields,
    archivedAt: null,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

export function likelyReferenceIdentity(record: Pick<BibliographicRecord, "title" | "authors" | "year" | "doi">): string {
  const doi = normalizeDoi(record.doi);
  if (doi) return `doi:${doi}`;
  return `work:${normalizeIdentityText(record.title)}|${record.year.trim()}|${normalizeIdentityText(record.authors[0] ?? "")}`;
}

export function isReferenceLibrarySnapshot(value: unknown): value is ReferenceLibrarySnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.references) &&
    value.references.every(isBibliographicRecord) &&
    Array.isArray(value.artifacts) &&
    Array.isArray(value.notes) &&
    Array.isArray(value.highlights) &&
    isRecord(value.tags) &&
    Array.isArray(value.reading)
  );
}

function isBibliographicRecord(value: unknown): value is BibliographicRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.authors) &&
    value.authors.every((author) => typeof author === "string") &&
    typeof value.year === "string" &&
    typeof value.venue === "string" &&
    typeof value.doi === "string" &&
    typeof value.url === "string" &&
    typeof value.abstract === "string" &&
    isRecord(value.provenance) &&
    (value.archivedAt === null || typeof value.archivedAt === "string") &&
    (value.deletedAt === null || typeof value.deletedAt === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function normalizeIdentityText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
