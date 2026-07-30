import { isBibliographicRecordContract, isCitationAssertionContract, isResponseId } from "./citation-contract-validation";
import { isRecord } from "./unknown-value";
import type {
  AcceptCitationCandidateInput,
  AcceptCitationCandidatesInput,
  CitationCandidateAcceptance,
  CitationCandidateBatchAcceptance,
} from "./citation-expansion-types";
import { isValidDoi } from "./publication-intake";

export function isAcceptCitationCandidateInput(value: unknown): value is AcceptCitationCandidateInput {
  return (
    isRecord(value) &&
    typeof value.doi === "string" &&
    isValidDoi(value.doi) &&
    isResponseId(value.responseId) &&
    (value.direction === "references" || value.direction === "citations")
  );
}

export function isAcceptCitationCandidatesInput(value: unknown): value is AcceptCitationCandidatesInput {
  if (
    !isRecord(value) ||
    !Array.isArray(value.dois) ||
    value.dois.length === 0 ||
    value.dois.length > 25 ||
    !isResponseId(value.responseId) ||
    (value.direction !== "references" && value.direction !== "citations")
  ) {
    return false;
  }
  const normalized = value.dois.map((doi) => (typeof doi === "string" ? doi.trim().toLocaleLowerCase() : ""));
  return normalized.every(isValidDoi) && new Set(normalized).size === normalized.length;
}

export function isCitationCandidateAcceptance(value: unknown): value is CitationCandidateAcceptance {
  return (
    isRecord(value) &&
    isBibliographicRecordContract(value.reference) &&
    typeof value.created === "boolean" &&
    isCitationAssertionContract(value.assertion) &&
    (value.assertion.citedReferenceId === value.reference.id || value.assertion.citingReferenceId === value.reference.id)
  );
}

export function isCitationCandidateBatchAcceptance(value: unknown): value is CitationCandidateBatchAcceptance {
  return (
    isRecord(value) && Array.isArray(value.accepted) && value.accepted.length > 0 && value.accepted.every(isCitationCandidateAcceptance)
  );
}
