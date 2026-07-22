import {
  boundedString,
  isCitationAssertionContract,
  isIdentifier,
  isRecord,
  isResponseId,
  isTimestamp,
} from "./citation-contract-validation";
import type { CitationExpansionCandidate, CitationExpansionResult } from "./citation-expansion-types";
import { isValidDoi } from "./publication-intake";

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
    value.assertions.every(isCitationAssertionContract) &&
    Array.isArray(value.unmatched) &&
    value.unmatched.length <= 128 &&
    value.unmatched.every(isCitationExpansionCandidate) &&
    typeof value.truncated === "boolean" &&
    typeof value.requestedBy === "string" &&
    value.requestedBy.length > 0 &&
    value.requestedBy.length <= 500
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
