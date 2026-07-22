import type { CitationExpansionResult } from "../domain/citation-expansion-types";

export const citationExpansionResponseId = `sha256:${"a".repeat(64)}`;
export const citationExpansionTimestamp = "2026-07-16T10:00:00.000Z";
export const citationExpansionAssertion = {
  id: "11111111-1111-4111-8111-111111111111",
  citingReferenceId: "22222222-2222-4222-8222-222222222222",
  citedReferenceId: "33333333-3333-4333-8333-333333333333",
  polarity: "cites" as const,
  evidenceState: "extracted" as const,
  method: "provider" as const,
  assertedBy: "Crossref",
  observedAt: citationExpansionTimestamp,
  sourceKind: "provider-response" as const,
  sourceId: citationExpansionResponseId,
  sourceLocator: "https://api.crossref.org/works/10.1000%2Fseed",
  confidence: null,
  review: null,
  createdAt: citationExpansionTimestamp,
};

export const citationExpansion: CitationExpansionResult = {
  provider: "crossref",
  direction: "references",
  seedReferenceId: citationExpansionAssertion.citingReferenceId,
  retrievedAt: citationExpansionTimestamp,
  responseId: citationExpansionResponseId,
  sourceLocator: citationExpansionAssertion.sourceLocator,
  assertions: [citationExpansionAssertion],
  unmatched: [{ doi: "10.1000/candidate", title: "Candidate", authors: "Doe, Jane", year: "2024", unstructured: "" }],
  truncated: false,
  requestedBy: "owner@example.com",
};

export const citationExpansionReference = {
  id: citationExpansionAssertion.citedReferenceId,
  referenceKey: "doe2024candidate",
  type: "article",
  title: "Candidate",
  authors: ["Doe, Jane"],
  year: "2024",
  venue: "Journal",
  doi: "10.1000/candidate",
  url: "https://doi.org/10.1000/candidate",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: citationExpansionTimestamp,
  updatedAt: citationExpansionTimestamp,
};
