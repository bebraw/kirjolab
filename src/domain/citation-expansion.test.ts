import { describe, expect, it } from "vitest";
import {
  isAcceptCitationCandidateInput,
  isCitationCandidateAcceptance,
  isCitationExpansionResult,
  type CitationExpansionResult,
} from "./citation-expansion";

const responseId = `sha256:${"a".repeat(64)}`;
const now = "2026-07-16T10:00:00.000Z";
const assertion = {
  id: "11111111-1111-4111-8111-111111111111",
  citingReferenceId: "22222222-2222-4222-8222-222222222222",
  citedReferenceId: "33333333-3333-4333-8333-333333333333",
  polarity: "cites" as const,
  evidenceState: "extracted" as const,
  method: "provider" as const,
  assertedBy: "Crossref",
  observedAt: now,
  sourceKind: "provider-response" as const,
  sourceId: responseId,
  sourceLocator: "https://api.crossref.org/works/10.1000%2Fseed",
  confidence: null,
  review: null,
  createdAt: now,
};

const expansion: CitationExpansionResult = {
  provider: "crossref",
  direction: "references",
  seedReferenceId: assertion.citingReferenceId,
  retrievedAt: now,
  responseId,
  sourceLocator: assertion.sourceLocator,
  assertions: [assertion],
  unmatched: [{ doi: "10.1000/candidate", title: "Candidate", authors: "Doe, Jane", year: "2024", unstructured: "" }],
  truncated: false,
  requestedBy: "owner@example.com",
};

describe("citation expansion contracts", () => {
  it("validates bounded fingerprinted expansion rounds", () => {
    expect(isCitationExpansionResult(expansion)).toBe(true);
    expect(isCitationExpansionResult({ ...expansion, responseId: "client-value" })).toBe(false);
    expect(isCitationExpansionResult({ ...expansion, unmatched: [{ ...expansion.unmatched[0], doi: "invalid" }] })).toBe(false);
    expect(isCitationExpansionResult({ ...expansion, unmatched: Array.from({ length: 129 }, () => expansion.unmatched[0]) })).toBe(false);
  });

  it("accepts only DOI and response fingerprint inputs", () => {
    expect(isAcceptCitationCandidateInput({ doi: "10.1000/candidate", responseId })).toBe(true);
    expect(isAcceptCitationCandidateInput({ doi: "invalid", responseId })).toBe(false);
    expect(isAcceptCitationCandidateInput({ doi: "10.1000/candidate", responseId, metadata: {} })).toBe(true);
  });

  it("requires an acceptance assertion to target the saved reference", () => {
    const reference = {
      id: assertion.citedReferenceId,
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
      createdAt: now,
      updatedAt: now,
    };
    expect(isCitationCandidateAcceptance({ reference, created: true, assertion })).toBe(true);
    expect(isCitationCandidateAcceptance({ reference: { ...reference, id: crypto.randomUUID() }, created: true, assertion })).toBe(false);
  });
});
