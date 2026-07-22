import type { CitationAssertion } from "./citation-assertions";
import { hasBibliographicRecordFields } from "./bibliographic-record-contract";
import type { BibliographicRecord } from "./reference-library";

export function isCitationAssertionContract(value: unknown): value is CitationAssertion {
  return isRecord(value) && hasCitationIdentity(value) && hasCitationEvidence(value) && isTimestamp(value.createdAt);
}

function hasCitationIdentity(value: Record<string, unknown>): boolean {
  return (
    isIdentifier(value.id) &&
    isIdentifier(value.citingReferenceId) &&
    isIdentifier(value.citedReferenceId) &&
    (value.polarity === "cites" || value.polarity === "does-not-cite")
  );
}

function hasCitationEvidence(value: Record<string, unknown>): boolean {
  return (
    (value.evidenceState === "confirmed" || value.evidenceState === "extracted" || value.evidenceState === "inferred") &&
    typeof value.method === "string" &&
    typeof value.assertedBy === "string" &&
    isTimestamp(value.observedAt) &&
    typeof value.sourceKind === "string" &&
    typeof value.sourceId === "string" &&
    typeof value.sourceLocator === "string" &&
    (value.confidence === null || (typeof value.confidence === "number" && value.confidence >= 0 && value.confidence <= 1)) &&
    (value.review === null || isRecord(value.review))
  );
}

export function isBibliographicRecordContract(value: unknown): value is BibliographicRecord {
  return (
    isRecord(value) &&
    isIdentifier(value.id) &&
    hasBibliographicRecordFields(value) &&
    (value.archivedAt === null || isTimestamp(value.archivedAt)) &&
    (value.deletedAt === null || isTimestamp(value.deletedAt)) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

export function isResponseId(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

export function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9:._/-]{0,500}$/iu.test(value);
}

export function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
