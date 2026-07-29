import type { CitationAssertion } from "./citation-assertions";
import type { BibliographicRecord } from "./reference-library";

export interface CitationExpansionCandidate {
  readonly doi: string;
  readonly title: string;
  readonly authors: string;
  readonly year: string;
  readonly unstructured: string;
}

export type CitationExpansionProvider = "crossref" | "semantic-scholar";
export type CitationExpansionDirection = "references" | "citations";

export interface CitationExpansionResult {
  readonly provider: CitationExpansionProvider;
  readonly direction: CitationExpansionDirection;
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
  readonly direction: CitationExpansionDirection;
}

export interface CitationCandidateSource {
  readonly provider: CitationExpansionProvider;
  readonly direction: CitationExpansionDirection;
  readonly observedAt: string;
  readonly responseId: string;
  readonly sourceLocator: string;
}

export interface CitationCandidateAcceptance {
  readonly reference: BibliographicRecord;
  readonly created: boolean;
  readonly assertion: CitationAssertion;
}
