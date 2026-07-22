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

function expectInvalidExpansion(...values: unknown[]) {
  for (const value of values) expect(isCitationExpansionResult(value)).toBe(false);
}

function expectInvalidAcceptance(...values: unknown[]) {
  for (const value of values) expect(isCitationCandidateAcceptance(value)).toBe(false);
}

describe("citation expansion contracts", () => {
  it("validates bounded fingerprinted expansion rounds", () => {
    expect(isCitationExpansionResult(expansion)).toBe(true);
    expect(
      isCitationExpansionResult({
        ...expansion,
        sourceLocator: "x".repeat(2_000),
        assertions: Array.from({ length: 128 }, () => assertion),
        unmatched: Array.from({ length: 128 }, () => expansion.unmatched[0]),
        requestedBy: "x".repeat(500),
      }),
    ).toBe(true);
    expectInvalidExpansion(
      null,
      [],
      { ...expansion, provider: "openalex" },
      { ...expansion, direction: "citations" },
      { ...expansion, seedReferenceId: " invalid" },
      { ...expansion, seedReferenceId: "a".repeat(502) },
      { ...expansion, retrievedAt: "not-a-timestamp" },
      { ...expansion, responseId: "client-value" },
      { ...expansion, responseId: `prefix-${responseId}` },
      { ...expansion, responseId: `${responseId}-suffix` },
      { ...expansion, sourceLocator: 42 },
      { ...expansion, sourceLocator: "x".repeat(2_001) },
      { ...expansion, assertions: "invalid" },
      { ...expansion, assertions: Array.from({ length: 129 }, () => assertion) },
      { ...expansion, assertions: [assertion, { ...assertion, id: " invalid" }] },
      { ...expansion, unmatched: "invalid" },
      { ...expansion, unmatched: Array.from({ length: 129 }, () => expansion.unmatched[0]) },
      { ...expansion, unmatched: [expansion.unmatched[0], { ...expansion.unmatched[0], doi: "invalid" }] },
      { ...expansion, truncated: "false" },
      { ...expansion, requestedBy: "" },
      { ...expansion, requestedBy: "x".repeat(501) },
    );
  });

  it("validates every unmatched candidate field and exact bound", () => {
    const candidate = expansion.unmatched[0];
    expectInvalidExpansion(
      { ...expansion, unmatched: [{ ...candidate, title: 42 }] },
      { ...expansion, unmatched: [{ ...candidate, title: "x".repeat(2_001) }] },
      { ...expansion, unmatched: [{ ...candidate, authors: 42 }] },
      { ...expansion, unmatched: [{ ...candidate, authors: "x".repeat(2_001) }] },
      { ...expansion, unmatched: [{ ...candidate, year: 42 }] },
      { ...expansion, unmatched: [{ ...candidate, year: "x".repeat(101) }] },
      { ...expansion, unmatched: [{ ...candidate, unstructured: 42 }] },
      { ...expansion, unmatched: [{ ...candidate, unstructured: "x".repeat(4_001) }] },
    );
    expect(
      isCitationExpansionResult({
        ...expansion,
        unmatched: [
          {
            ...candidate,
            title: "x".repeat(2_000),
            authors: "x".repeat(2_000),
            year: "x".repeat(100),
            unstructured: "x".repeat(4_000),
          },
        ],
      }),
    ).toBe(true);
  });

  it("validates assertion variants and confidence boundaries", () => {
    expect(isCitationExpansionResult({ ...expansion, assertions: [{ ...assertion, polarity: "does-not-cite" }] })).toBe(true);
    expect(isCitationExpansionResult({ ...expansion, assertions: [{ ...assertion, evidenceState: "confirmed" }] })).toBe(true);
    expect(isCitationExpansionResult({ ...expansion, assertions: [{ ...assertion, evidenceState: "inferred" }] })).toBe(true);
    expect(isCitationExpansionResult({ ...expansion, assertions: [{ ...assertion, confidence: 0, review: {} }] })).toBe(true);
    expect(isCitationExpansionResult({ ...expansion, assertions: [{ ...assertion, confidence: 1 }] })).toBe(true);
    for (const invalidAssertion of [
      null,
      { ...assertion, id: " invalid" },
      { ...assertion, citingReferenceId: " invalid" },
      { ...assertion, citedReferenceId: " invalid" },
      { ...assertion, polarity: "mentions" },
      { ...assertion, evidenceState: "unknown" },
      { ...assertion, method: 42 },
      { ...assertion, assertedBy: 42 },
      { ...assertion, observedAt: "invalid" },
      { ...assertion, sourceKind: 42 },
      { ...assertion, sourceId: 42 },
      { ...assertion, sourceLocator: 42 },
      { ...assertion, confidence: "high" },
      { ...assertion, confidence: -0.1 },
      { ...assertion, confidence: 1.1 },
      { ...assertion, review: "confirmed" },
      { ...assertion, createdAt: "invalid" },
    ]) {
      expectInvalidExpansion({ ...expansion, assertions: [invalidAssertion] });
    }
  });

  it("accepts only DOI and response fingerprint inputs", () => {
    expect(isAcceptCitationCandidateInput({ doi: "10.1000/candidate", responseId })).toBe(true);
    expect(isAcceptCitationCandidateInput({ doi: "invalid", responseId })).toBe(false);
    expect(isAcceptCitationCandidateInput(null)).toBe(false);
    expect(isAcceptCitationCandidateInput([])).toBe(false);
    expect(isAcceptCitationCandidateInput({ doi: "10.1000/candidate", responseId: `${responseId}0` })).toBe(false);
    expect(isAcceptCitationCandidateInput({ doi: "10.1000/candidate", responseId, metadata: {} })).toBe(true);
  });

  it("requires an acceptance assertion to target the saved reference", () => {
    expect(isCitationCandidateAcceptance({ reference, created: true, assertion })).toBe(true);
    expect(
      isCitationCandidateAcceptance({
        reference: { ...reference, archivedAt: now, deletedAt: now },
        created: false,
        assertion: { ...assertion, confidence: 0 },
      }),
    ).toBe(true);
    expectInvalidAcceptance(
      null,
      [],
      { reference, created: "true", assertion },
      { reference: { ...reference, id: crypto.randomUUID() }, created: true, assertion },
      { reference, created: true, assertion: { ...assertion, id: " invalid" } },
    );
  });

  it("rejects malformed fields in an accepted bibliographic record", () => {
    for (const invalidReference of [
      null,
      { ...reference, id: " invalid" },
      { ...reference, referenceKey: 42 },
      { ...reference, type: 42 },
      { ...reference, title: 42 },
      { ...reference, authors: "Doe" },
      { ...reference, authors: ["Doe", 42] },
      { ...reference, year: 42 },
      { ...reference, venue: 42 },
      { ...reference, doi: 42 },
      { ...reference, url: 42 },
      { ...reference, abstract: 42 },
      { ...reference, provenance: null },
      { ...reference, archivedAt: "invalid" },
      { ...reference, deletedAt: "invalid" },
      { ...reference, createdAt: "invalid" },
      { ...reference, updatedAt: "invalid" },
    ]) {
      expectInvalidAcceptance({ reference: invalidReference, created: true, assertion });
    }
  });
});
