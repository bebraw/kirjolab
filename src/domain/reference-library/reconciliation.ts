import * as v from "valibot";
import { normalizeDoi } from "./bibliography";
import { isRecord } from "../unknown-value";
import { isBibliographicRecord, type BibliographicRecord } from "./metadata";

export type ReferenceReconciliationReason = "doi" | "bibliographic";

export interface ReferenceReconciliationCandidate {
  readonly left: BibliographicRecord;
  readonly right: BibliographicRecord;
  readonly reason: ReferenceReconciliationReason;
  readonly leftBlockers: readonly string[];
  readonly rightBlockers: readonly string[];
}

export interface ReferenceReconciliationReport {
  readonly candidates: readonly ReferenceReconciliationCandidate[];
  readonly truncated: boolean;
}

export interface ReferenceMergeInput {
  readonly canonicalReferenceId: string;
  readonly duplicateReferenceId: string;
  readonly expectedCanonicalUpdatedAt: string;
  readonly expectedDuplicateUpdatedAt: string;
}

export interface ReferenceMergeResult {
  readonly canonicalReference: BibliographicRecord;
  readonly mergedReferenceId: string;
  readonly moved: {
    readonly artifacts: number;
    readonly notes: number;
    readonly highlights: number;
    readonly pdfMarkups: number;
    readonly citationAssertions: number;
  };
}

const mergeInputSchema = v.strictObject({
  canonicalReferenceId: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  duplicateReferenceId: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  expectedCanonicalUpdatedAt: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  expectedDuplicateUpdatedAt: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
});

export function isReferenceMergeInput(value: unknown): value is ReferenceMergeInput {
  return v.is(mergeInputSchema, value) && value.canonicalReferenceId !== value.duplicateReferenceId;
}

export function isReferenceReconciliationReport(value: unknown): value is ReferenceReconciliationReport {
  return (
    isRecord(value) &&
    typeof value.truncated === "boolean" &&
    Array.isArray(value.candidates) &&
    value.candidates.length <= 100 &&
    value.candidates.every(
      (candidate) =>
        isRecord(candidate) &&
        isBibliographicRecord(candidate.left) &&
        isBibliographicRecord(candidate.right) &&
        (candidate.reason === "doi" || candidate.reason === "bibliographic") &&
        stringArray(candidate.leftBlockers) &&
        stringArray(candidate.rightBlockers),
    )
  );
}

export function isReferenceMergeResult(value: unknown): value is ReferenceMergeResult {
  return (
    isRecord(value) &&
    isBibliographicRecord(value.canonicalReference) &&
    typeof value.mergedReferenceId === "string" &&
    isRecord(value.moved) &&
    [value.moved.artifacts, value.moved.notes, value.moved.highlights, value.moved.pdfMarkups, value.moved.citationAssertions].every(
      (count) => typeof count === "number" && Number.isInteger(count) && count >= 0,
    )
  );
}

export function referenceReconciliationReason(
  left: Pick<BibliographicRecord, "title" | "authors" | "year" | "doi">,
  right: Pick<BibliographicRecord, "title" | "authors" | "year" | "doi">,
): ReferenceReconciliationReason | null {
  const leftDoi = normalizeDoi(left.doi);
  const rightDoi = normalizeDoi(right.doi);
  if (leftDoi && rightDoi) return leftDoi === rightDoi ? "doi" : null;
  const leftTitle = normalizeText(left.title);
  const rightTitle = normalizeText(right.title);
  const leftAuthor = normalizeAuthor(left.authors[0] ?? "");
  const rightAuthor = normalizeAuthor(right.authors[0] ?? "");
  return leftTitle &&
    leftTitle === rightTitle &&
    left.year.trim() &&
    left.year.trim() === right.year.trim() &&
    leftAuthor &&
    leftAuthor === rightAuthor
    ? "bibliographic"
    : null;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/\p{Mark}/gu, "")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizeAuthor(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const parts = normalized.split(" ");
  return value.includes(",") ? (parts[0] ?? "") : (parts.at(-1) ?? "");
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
