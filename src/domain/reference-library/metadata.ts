import * as v from "valibot";
import { normalizeDoi, projectBibTeXPublication, type BibTeXEntry } from "../bibliography";
import { hasBibliographicRecordFields } from "../bibliographic-record-contract";
import { isRecord } from "../unknown-value";
import type { WebCitationSnapshot, WebSnapshot } from "./web-sources";

export type ReferenceMetadataField = "type" | "title" | "authors" | "year" | "venue" | "doi" | "url" | "abstract";
export type CrossrefMetadataField = ReferenceMetadataField;
export type ScholarlyMetadataProvider = "openalex" | "crossref" | "datacite" | "semantic-scholar";
export type MetadataProvenanceMethod = "bibtex" | ScholarlyMetadataProvider | "filename" | "manual" | "pdf-metadata" | "web" | "migration";

export const crossrefMetadataFields = ["type", "title", "authors", "year", "venue", "doi", "url", "abstract"] as const;
export const maximumMetadataRefinementCandidates = 12;

const boundedString = (maximum: number) => v.pipe(v.string(), v.maxLength(maximum));
const requiredBoundedString = (maximum: number) => v.pipe(v.string(), v.minLength(1), v.maxLength(maximum));
const crossrefMetadataSchema = v.pipe(
  v.object({
    type: requiredBoundedString(100),
    title: requiredBoundedString(2_000),
    authors: v.pipe(v.array(boundedString(500)), v.maxLength(100)),
    year: boundedString(100),
    venue: boundedString(2_000),
    doi: requiredBoundedString(500),
    url: boundedString(2_000),
    abstract: boundedString(20_000),
  }),
  v.readonly(),
);

export interface ReviewedPdfMetadata {
  readonly title?: string;
  readonly authors?: readonly string[];
  readonly year?: string;
  readonly doi?: string;
}

export type CrossrefMetadata = v.InferOutput<typeof crossrefMetadataSchema>;

export interface MetadataRefinementCandidate {
  readonly provider: ScholarlyMetadataProvider;
  readonly match: "doi" | "bibliographic";
  readonly score: number | null;
  readonly metadata: CrossrefMetadata;
  readonly metadataFingerprint: string;
}

export interface MetadataRefinementPreview {
  readonly referenceId: string;
  readonly artifactId: string;
  readonly candidates: readonly MetadataRefinementCandidate[];
}

export interface ReviewedProviderMetadataSelection {
  readonly provider: ScholarlyMetadataProvider;
  readonly metadata: CrossrefMetadata;
  readonly fields: readonly CrossrefMetadataField[];
}

export interface MetadataFieldProvenance {
  readonly method: MetadataProvenanceMethod;
  readonly capturedAt: string;
  readonly actor: string;
}

export interface BibliographicRecord {
  readonly id: string;
  readonly referenceKey: string;
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
  readonly webSnapshot: WebCitationSnapshot | null;
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

const referenceKeyStopWords = new Set(["a", "an", "and", "for", "from", "in", "of", "on", "the", "to", "with"]);

export function bibliographicSnapshot(
  record: BibliographicRecord,
  capturedAt = new Date().toISOString(),
  webSnapshot: WebSnapshot | null = null,
): BibliographicSnapshot {
  return {
    referenceId: record.id,
    type: record.type,
    title: webSnapshot?.title || record.title,
    authors: webSnapshot ? [...webSnapshot.authors] : [...record.authors],
    year: webSnapshot ? (/^(\d{4})/u.exec(webSnapshot.publishedAt.trim())?.[1] ?? "") : record.year,
    venue: webSnapshot?.publisher ?? record.venue,
    doi: record.doi,
    url: record.url,
    capturedAt,
    tombstone: record.deletedAt !== null,
    webSnapshot: webSnapshot
      ? {
          id: webSnapshot.id,
          accessedAt: webSnapshot.accessedAt,
          finalUrl: webSnapshot.finalUrl,
          contentHash: webSnapshot.contentHash,
          complete: webSnapshot.complete,
          diagnostics: [...webSnapshot.diagnostics],
        }
      : null,
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
    referenceKey: memorableReferenceKey(projected),
    ...projected,
    doi: normalizeDoi(projected.doi),
    provenance: fields,
    archivedAt: null,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

export function memorableReferenceKey(record: Pick<BibliographicRecord, "title" | "authors" | "year">, includeTopic = false): string {
  const author = record.authors[0]?.trim() ?? "";
  const surname = author.includes(",") ? (author.split(",", 1)[0] ?? "") : (author.split(/\s+/u).at(-1) ?? "");
  const family = referenceKeyPart(surname) || "source";
  const year = /(?:^|\D)(\d{4})(?:\D|$)/u.exec(record.year)?.[1] ?? "undated";
  const topic = record.title
    .split(/[^\p{L}\p{N}]+/gu)
    .map(referenceKeyPart)
    .find((part) => part.length >= 3 && part !== family && !referenceKeyStopWords.has(part));
  const needsTopic = includeTopic || family === "source" || year === "undated";
  return `${family}${year}${needsTopic ? (topic ?? "work") : ""}`.slice(0, 80);
}

export function likelyReferenceIdentity(record: Pick<BibliographicRecord, "title" | "authors" | "year" | "doi">): string {
  const doi = normalizeDoi(record.doi);
  if (doi) return `doi:${doi}`;
  return `work:${normalizeIdentityText(record.title)}|${record.year.trim()}|${normalizeIdentityText(record.authors[0] ?? "")}`;
}

export function isMetadataRefinementPreview(value: unknown): value is MetadataRefinementPreview {
  return (
    isRecord(value) &&
    typeof value.referenceId === "string" &&
    typeof value.artifactId === "string" &&
    Array.isArray(value.candidates) &&
    value.candidates.length <= maximumMetadataRefinementCandidates &&
    value.candidates.every(isMetadataRefinementCandidate)
  );
}

export function isCrossrefMetadata(value: unknown): value is CrossrefMetadata {
  return v.is(crossrefMetadataSchema, value);
}

export function isBibliographicRecord(value: unknown): value is BibliographicRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    hasBibliographicRecordFields(value) &&
    value.referenceKey.length > 0 &&
    (value.archivedAt === null || typeof value.archivedAt === "string") &&
    (value.deletedAt === null || typeof value.deletedAt === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isMetadataRefinementCandidate(value: unknown): value is MetadataRefinementCandidate {
  return (
    isRecord(value) &&
    ["openalex", "crossref", "datacite", "semantic-scholar"].includes(String(value.provider)) &&
    (value.match === "doi" || value.match === "bibliographic") &&
    (value.score === null || (typeof value.score === "number" && Number.isFinite(value.score))) &&
    isCrossrefMetadata(value.metadata) &&
    typeof value.metadataFingerprint === "string" &&
    /^[a-f0-9]{64}$/u.test(value.metadataFingerprint)
  );
}

function referenceKeyPart(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/\p{Mark}/gu, "")
    .replaceAll(/[^\p{L}\p{N}]/gu, "");
}

function normalizeIdentityText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
