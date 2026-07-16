import { isValidDoi } from "./publication-intake";
import type { BibliographicRecord } from "./reference-library";
import type { CitationAssertion } from "./citation-assertions";

export interface CitationExpansionCandidate {
  readonly doi: string;
  readonly title: string;
  readonly authors: string;
  readonly year: string;
  readonly unstructured: string;
}

export interface CitationExpansionResult {
  readonly provider: "crossref";
  readonly direction: "references";
  readonly seedReferenceId: string;
  readonly retrievedAt: string;
  readonly responseId: string;
  readonly sourceLocator: string;
  readonly assertions: readonly CitationAssertion[];
  readonly unmatched: readonly CitationExpansionCandidate[];
  readonly truncated: boolean;
  readonly requestedBy: string;
}

export interface AcceptCitationCandidateInput {
  readonly doi: string;
  readonly responseId: string;
}

export interface CitationCandidateSource {
  readonly observedAt: string;
  readonly responseId: string;
  readonly sourceLocator: string;
}

export interface CitationCandidateAcceptance {
  readonly reference: BibliographicRecord;
  readonly created: boolean;
  readonly assertion: CitationAssertion;
}

export function isAcceptCitationCandidateInput(value: unknown): value is AcceptCitationCandidateInput {
  return isRecord(value) && typeof value.doi === "string" && isValidDoi(value.doi) && isResponseId(value.responseId);
}

export function isCitationExpansionResult(value: unknown): value is CitationExpansionResult {
  return (
    isRecord(value) &&
    value.provider === "crossref" &&
    value.direction === "references" &&
    isIdentifier(value.seedReferenceId) &&
    isTimestamp(value.retrievedAt) &&
    isResponseId(value.responseId) &&
    typeof value.sourceLocator === "string" &&
    value.sourceLocator.length <= 2_000 &&
    Array.isArray(value.assertions) &&
    value.assertions.length <= 128 &&
    value.assertions.every(isCitationAssertion) &&
    Array.isArray(value.unmatched) &&
    value.unmatched.length <= 128 &&
    value.unmatched.every(isCitationExpansionCandidate) &&
    typeof value.truncated === "boolean" &&
    typeof value.requestedBy === "string" &&
    value.requestedBy.length > 0 &&
    value.requestedBy.length <= 500
  );
}

export function isCitationCandidateAcceptance(value: unknown): value is CitationCandidateAcceptance {
  return (
    isRecord(value) &&
    isBibliographicRecord(value.reference) &&
    typeof value.created === "boolean" &&
    isCitationAssertion(value.assertion) &&
    value.assertion.citedReferenceId === value.reference.id
  );
}

function isCitationExpansionCandidate(value: unknown): value is CitationExpansionCandidate {
  return (
    isRecord(value) &&
    typeof value.doi === "string" &&
    isValidDoi(value.doi) &&
    boundedString(value.title, 2_000) &&
    boundedString(value.authors, 2_000) &&
    boundedString(value.year, 100) &&
    boundedString(value.unstructured, 4_000)
  );
}

function isCitationAssertion(value: unknown): value is CitationAssertion {
  return (
    isRecord(value) &&
    isIdentifier(value.id) &&
    isIdentifier(value.citingReferenceId) &&
    isIdentifier(value.citedReferenceId) &&
    (value.polarity === "cites" || value.polarity === "does-not-cite") &&
    (value.evidenceState === "confirmed" || value.evidenceState === "extracted" || value.evidenceState === "inferred") &&
    typeof value.method === "string" &&
    typeof value.assertedBy === "string" &&
    isTimestamp(value.observedAt) &&
    typeof value.sourceKind === "string" &&
    typeof value.sourceId === "string" &&
    typeof value.sourceLocator === "string" &&
    (value.confidence === null || (typeof value.confidence === "number" && value.confidence >= 0 && value.confidence <= 1)) &&
    (value.review === null || isRecord(value.review)) &&
    isTimestamp(value.createdAt)
  );
}

function isBibliographicRecord(value: unknown): value is BibliographicRecord {
  return (
    isRecord(value) &&
    isIdentifier(value.id) &&
    typeof value.referenceKey === "string" &&
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
    (value.archivedAt === null || isTimestamp(value.archivedAt)) &&
    (value.deletedAt === null || isTimestamp(value.deletedAt)) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function isResponseId(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9:._/-]{0,500}$/iu.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
