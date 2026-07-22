import { isBibliographicRecordContract, isCitationAssertionContract, isRecord, isResponseId } from "./citation-contract-validation";
import type { AcceptCitationCandidateInput, CitationCandidateAcceptance } from "./citation-expansion-types";
import { isValidDoi } from "./publication-intake";

export function isAcceptCitationCandidateInput(value: unknown): value is AcceptCitationCandidateInput {
  return isRecord(value) && typeof value.doi === "string" && isValidDoi(value.doi) && isResponseId(value.responseId);
}

export function isCitationCandidateAcceptance(value: unknown): value is CitationCandidateAcceptance {
  return (
    isRecord(value) &&
    isBibliographicRecordContract(value.reference) &&
    typeof value.created === "boolean" &&
    isCitationAssertionContract(value.assertion) &&
    value.assertion.citedReferenceId === value.reference.id
  );
}
