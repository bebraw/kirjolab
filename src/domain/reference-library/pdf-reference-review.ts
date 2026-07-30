import * as v from "valibot";
import type { CitationAssertion } from "../citation/citation-assertions";
import { normalizeDoi } from "./bibliography";
import { isRecord } from "../unknown-value";
import { isPdfReferenceAnalysisCandidate, type PdfReferenceAnalysisCandidate } from "./artifact-analysis";
import { isBibliographicRecord, type BibliographicRecord } from "./metadata";

export type PdfReferenceMatchKind = "doi" | "bibliographic";
export type PdfReferenceReviewDecision = "accepted" | "rejected";

export interface PdfReferenceCandidateReview {
  readonly candidateId: string;
  readonly decision: PdfReferenceReviewDecision;
  readonly referenceId: string | null;
  readonly assertionId: string | null;
  readonly reviewedBy: string;
  readonly reviewedAt: string;
}

export interface PdfReferenceReviewCandidate extends PdfReferenceAnalysisCandidate {
  readonly match: BibliographicRecord | null;
  readonly matchKind: PdfReferenceMatchKind | null;
  readonly review: PdfReferenceCandidateReview | null;
}

export interface PdfReferenceReviewQueue {
  readonly artifactId: string;
  readonly fingerprint: string;
  readonly citingReferenceId: string;
  readonly candidates: readonly PdfReferenceReviewCandidate[];
}

export interface ReviewPdfReferenceCandidateInput {
  readonly fingerprint: string;
  readonly candidateId: string;
  readonly decision: PdfReferenceReviewDecision;
  readonly referenceId?: string;
}

export interface ReviewPdfReferenceCandidateBatchItem {
  readonly candidateId: string;
  readonly referenceId?: string;
}

export interface ReviewPdfReferenceCandidatesInput {
  readonly fingerprint: string;
  readonly candidates: readonly ReviewPdfReferenceCandidateBatchItem[];
}

export interface PdfReferenceCandidateReviewResult {
  readonly review: PdfReferenceCandidateReview;
  readonly reference: BibliographicRecord | null;
  readonly assertion: CitationAssertion | null;
}

const reviewInputSchema = v.variant("decision", [
  v.strictObject({
    fingerprint: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    candidateId: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    decision: v.literal("accepted"),
    referenceId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(500))),
  }),
  v.strictObject({
    fingerprint: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    candidateId: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    decision: v.literal("rejected"),
  }),
]);

const reviewBatchInputSchema = v.strictObject({
  fingerprint: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  candidates: v.pipe(
    v.array(
      v.strictObject({
        candidateId: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
        referenceId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(500))),
      }),
    ),
    v.minLength(1),
    v.maxLength(128),
  ),
});

export function isReviewPdfReferenceCandidateInput(value: unknown): value is ReviewPdfReferenceCandidateInput {
  return v.is(reviewInputSchema, value);
}

export function isReviewPdfReferenceCandidatesInput(value: unknown): value is ReviewPdfReferenceCandidatesInput {
  return (
    v.is(reviewBatchInputSchema, value) && new Set(value.candidates.map(({ candidateId }) => candidateId)).size === value.candidates.length
  );
}

export function suggestPdfReferenceMatch(
  candidate: PdfReferenceAnalysisCandidate,
  references: readonly BibliographicRecord[],
): { readonly reference: BibliographicRecord; readonly kind: PdfReferenceMatchKind } | null {
  const available = references.filter((reference) => reference.deletedAt === null);
  const doi = normalizeDoi(candidate.doi);
  if (doi) {
    const reference = available.find((item) => normalizeDoi(item.doi) === doi);
    if (reference) return { reference, kind: "doi" };
  }
  if (!candidate.title.trim() || !candidate.year.trim() || candidate.authors.length === 0) return null;
  const title = normalizeBibliographicText(candidate.title);
  const author = normalizeAuthor(candidate.authors[0] ?? "");
  const matches = available.filter(
    (reference) =>
      normalizeBibliographicText(reference.title) === title &&
      reference.year.trim() === candidate.year.trim() &&
      normalizeAuthor(reference.authors[0] ?? "") === author,
  );
  return matches.length === 1 && matches[0] ? { reference: matches[0], kind: "bibliographic" } : null;
}

export function isPdfReferenceReviewQueue(value: unknown): value is PdfReferenceReviewQueue {
  return (
    isRecord(value) &&
    typeof value.artifactId === "string" &&
    typeof value.fingerprint === "string" &&
    typeof value.citingReferenceId === "string" &&
    Array.isArray(value.candidates) &&
    value.candidates.length <= 128 &&
    value.candidates.every(
      (candidate) =>
        isRecord(candidate) &&
        isPdfReferenceAnalysisCandidate(candidate) &&
        (candidate.match === null || isBibliographicRecord(candidate.match)) &&
        (candidate.matchKind === null || candidate.matchKind === "doi" || candidate.matchKind === "bibliographic") &&
        isPdfReferenceCandidateReview(candidate.review),
    )
  );
}

function isPdfReferenceCandidateReview(value: unknown): value is PdfReferenceCandidateReview | null {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.candidateId === "string" &&
      (value.decision === "accepted" || value.decision === "rejected") &&
      (value.referenceId === null || typeof value.referenceId === "string") &&
      (value.assertionId === null || typeof value.assertionId === "string") &&
      typeof value.reviewedBy === "string" &&
      typeof value.reviewedAt === "string")
  );
}

function normalizeBibliographicText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/\p{Mark}/gu, "")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizeAuthor(value: string): string {
  const normalized = normalizeBibliographicText(value);
  const parts = normalized.split(" ").filter(Boolean);
  return value.includes(",") ? (parts[0] ?? "") : (parts.at(-1) ?? "");
}
