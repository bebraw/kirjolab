import { normalizeDoi, parseBibTeX, projectBibTeXPublication } from "./bibliography";

export const reviewImportLimits = { bibtexBytes: 32 * 1024 * 1024, records: 20_000 } as const;

export interface ReviewImportRecord {
  readonly citationKey: string;
  readonly type: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly venue: string;
  readonly doi: string;
  readonly url: string;
  readonly abstract: string;
  readonly identity: string;
  readonly warnings: readonly string[];
}

export interface ReviewImportPreview {
  readonly digest: string;
  readonly detectedEntries: number;
  readonly skippedEntries: number;
  readonly records: readonly ReviewImportRecord[];
}

export type DuplicateSignal = "doi" | "title-author-year" | "title-year";

export interface ReviewDuplicateMatch {
  readonly leftId: string;
  readonly rightId: string;
  readonly signals: readonly DuplicateSignal[];
  readonly confidence: "exact" | "probable";
}

export interface ReviewSearchRun {
  readonly id: string;
  readonly protocolRevision: number;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly query: string;
  readonly searchedAt: string;
  readonly importedAt: string;
  readonly importedBy: string;
  readonly digest: string;
  readonly detectedEntries: number;
  readonly skippedEntries: number;
  readonly occurrenceCount: number;
}

export interface ReviewImportedOccurrence {
  readonly id: string;
  readonly runId: string;
  readonly recordId: string;
  readonly citationKey: string;
  readonly imported: ReviewImportRecord;
}

export interface ReviewRecord {
  readonly id: string;
  readonly state: "active" | "merged";
  readonly mergedInto: string | null;
  readonly metadata: ReviewImportRecord;
}

export interface ReviewDuplicateCandidate extends ReviewDuplicateMatch {
  readonly id: string;
  readonly status: "pending" | "merged" | "distinct" | "superseded";
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
}

export interface ReviewSearchSnapshot {
  readonly revision: number;
  readonly runs: readonly ReviewSearchRun[];
  readonly occurrences: readonly ReviewImportedOccurrence[];
  readonly records: readonly ReviewRecord[];
  readonly duplicateCandidates: readonly ReviewDuplicateCandidate[];
  readonly counts: {
    readonly identified: number;
    readonly unique: number;
    readonly duplicatesRemoved: number;
  };
}

export async function previewReviewBibTeX(source: string): Promise<ReviewImportPreview> {
  const bytes = new TextEncoder().encode(source);
  if (bytes.byteLength === 0 || bytes.byteLength > reviewImportLimits.bibtexBytes) throw new Error("Review BibTeX import size is invalid");
  const entries = parseBibTeX(source);
  if (entries.length === 0 || entries.length > reviewImportLimits.records)
    throw new Error("Review BibTeX import contains no valid bounded records");
  const detectedEntries = [...source.matchAll(/@[a-z]+\s*[({]/giu)].length;
  const records = entries.map((entry) => {
    const publication = projectBibTeXPublication(entry);
    const warnings: string[] = [];
    if (!entry.fields.title?.trim()) warnings.push("Missing title");
    if (publication.authors.length === 0) warnings.push("Missing authors");
    if (!publication.year) warnings.push("Missing year");
    return {
      ...publication,
      title: entry.fields.title?.trim() || "Untitled publication",
      identity: reviewRecordIdentity(publication),
      warnings,
    };
  });
  return {
    digest: await sha256(bytes),
    detectedEntries,
    skippedEntries: Math.max(0, detectedEntries - entries.length),
    records,
  };
}

export function reviewRecordIdentity(record: Pick<ReviewImportRecord, "doi" | "title" | "authors" | "year">): string {
  const doi = normalizeDoi(record.doi);
  if (doi) return `doi:${doi}`;
  return `work:${normalize(record.title)}|${record.year.trim()}|${normalize(record.authors[0] ?? "")}`;
}

export function findReviewDuplicateMatches(
  records: readonly {
    readonly id: string;
    readonly title: string;
    readonly authors: readonly string[];
    readonly year: string;
    readonly doi: string;
  }[],
): ReviewDuplicateMatch[] {
  const matches: ReviewDuplicateMatch[] = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    const left = records[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const right = records[rightIndex]!;
      const signals = duplicateSignals(left, right);
      if (signals.length === 0) continue;
      matches.push({
        leftId: left.id,
        rightId: right.id,
        signals,
        confidence: signals.includes("doi") || signals.includes("title-author-year") ? "exact" : "probable",
      });
    }
  }
  return matches;
}

export function parseReviewImportPreview(value: unknown): ReviewImportPreview {
  if (!isRecord(value) || typeof value.digest !== "string" || !Array.isArray(value.records))
    throw new Error("Review import preview is invalid");
  const records = value.records.map(parseImportRecord);
  return {
    digest: value.digest,
    detectedEntries: integer(value.detectedEntries, "detected entries"),
    skippedEntries: integer(value.skippedEntries, "skipped entries"),
    records,
  };
}

export function parseReviewSearchSnapshot(value: unknown): ReviewSearchSnapshot {
  if (
    !isRecord(value) ||
    !Array.isArray(value.runs) ||
    !Array.isArray(value.occurrences) ||
    !Array.isArray(value.records) ||
    !Array.isArray(value.duplicateCandidates) ||
    !isRecord(value.counts)
  ) {
    throw new Error("Review search snapshot is invalid");
  }
  const revision = integer(value.revision, "revision");
  const runs = value.runs.map((run) => {
    if (!isRecord(run)) throw new Error("Review search run is invalid");
    return {
      id: text(run.id),
      protocolRevision: integer(run.protocolRevision, "protocol revision"),
      sourceId: text(run.sourceId),
      sourceName: text(run.sourceName),
      query: text(run.query),
      searchedAt: text(run.searchedAt),
      importedAt: text(run.importedAt),
      importedBy: text(run.importedBy),
      digest: text(run.digest),
      detectedEntries: integer(run.detectedEntries, "detected entries"),
      skippedEntries: integer(run.skippedEntries, "skipped entries"),
      occurrenceCount: integer(run.occurrenceCount, "occurrence count"),
    } satisfies ReviewSearchRun;
  });
  const occurrences = value.occurrences.map((occurrence) => {
    if (!isRecord(occurrence)) throw new Error("Review occurrence is invalid");
    return {
      id: text(occurrence.id),
      runId: text(occurrence.runId),
      recordId: text(occurrence.recordId),
      citationKey: text(occurrence.citationKey),
      imported: parseImportRecord(occurrence.imported),
    } satisfies ReviewImportedOccurrence;
  });
  const records = value.records.map((record) => {
    if (
      !isRecord(record) ||
      (record.state !== "active" && record.state !== "merged") ||
      (record.mergedInto !== null && typeof record.mergedInto !== "string")
    ) {
      throw new Error("Review record is invalid");
    }
    return {
      id: text(record.id),
      state: record.state,
      mergedInto: record.mergedInto,
      metadata: parseImportRecord(record.metadata),
    } satisfies ReviewRecord;
  });
  const duplicateCandidates = value.duplicateCandidates.map((candidate) => {
    if (
      !isRecord(candidate) ||
      !Array.isArray(candidate.signals) ||
      !candidate.signals.every(isDuplicateSignal) ||
      (candidate.confidence !== "exact" && candidate.confidence !== "probable") ||
      (candidate.status !== "pending" &&
        candidate.status !== "merged" &&
        candidate.status !== "distinct" &&
        candidate.status !== "superseded") ||
      (candidate.resolvedAt !== null && typeof candidate.resolvedAt !== "string") ||
      (candidate.resolvedBy !== null && typeof candidate.resolvedBy !== "string")
    ) {
      throw new Error("Review duplicate candidate is invalid");
    }
    return {
      id: text(candidate.id),
      leftId: text(candidate.leftId),
      rightId: text(candidate.rightId),
      signals: candidate.signals,
      confidence: candidate.confidence,
      status: candidate.status,
      resolvedAt: candidate.resolvedAt,
      resolvedBy: candidate.resolvedBy,
    } satisfies ReviewDuplicateCandidate;
  });
  return {
    revision,
    runs,
    occurrences,
    records,
    duplicateCandidates,
    counts: {
      identified: integer(value.counts.identified, "identified count"),
      unique: integer(value.counts.unique, "unique count"),
      duplicatesRemoved: integer(value.counts.duplicatesRemoved, "duplicate count"),
    },
  };
}

function duplicateSignals(
  left: Pick<ReviewImportRecord, "doi" | "title" | "authors" | "year">,
  right: Pick<ReviewImportRecord, "doi" | "title" | "authors" | "year">,
): DuplicateSignal[] {
  const signals: DuplicateSignal[] = [];
  const leftDoi = normalizeDoi(left.doi);
  const rightDoi = normalizeDoi(right.doi);
  if (leftDoi && leftDoi === rightDoi) signals.push("doi");
  const titleMatches = normalize(left.title) !== "" && normalize(left.title) === normalize(right.title);
  const yearMatches = left.year.trim() !== "" && left.year.trim() === right.year.trim();
  const authorMatches = normalize(left.authors[0] ?? "") !== "" && normalize(left.authors[0] ?? "") === normalize(right.authors[0] ?? "");
  if (titleMatches && authorMatches && yearMatches) signals.push("title-author-year");
  else if (titleMatches && yearMatches) signals.push("title-year");
  return signals;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseImportRecord(value: unknown): ReviewImportRecord {
  if (
    !isRecord(value) ||
    !Array.isArray(value.authors) ||
    !value.authors.every((author) => typeof author === "string") ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every((warning) => typeof warning === "string")
  ) {
    throw new Error("Review import record is invalid");
  }
  return {
    citationKey: text(value.citationKey),
    type: text(value.type),
    title: text(value.title),
    authors: value.authors,
    year: text(value.year),
    venue: text(value.venue),
    doi: text(value.doi),
    url: text(value.url),
    abstract: text(value.abstract),
    identity: text(value.identity),
    warnings: value.warnings,
  };
}

function isDuplicateSignal(value: unknown): value is DuplicateSignal {
  return value === "doi" || value === "title-author-year" || value === "title-year";
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`Review ${label} is invalid`);
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Review text value is invalid");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
