import { describe, expect, it } from "vitest";
import {
  citationExpansionAssertion as assertion,
  citationExpansionReference as reference,
  citationExpansionResponseId as responseId,
  citationExpansionTimestamp as now,
} from "../../test-support/citation-expansion-fixtures";
import {
  isAcceptCitationCandidateInput,
  isAcceptCitationCandidatesInput,
  isCitationCandidateAcceptance,
  isCitationCandidateBatchAcceptance,
} from "./citation-expansion-acceptance";

function expectInvalidAcceptance(...values: unknown[]) {
  for (const value of values) expect(isCitationCandidateAcceptance(value)).toBe(false);
}

describe("citation candidate acceptance contracts", () => {
  it("accepts only DOI and response fingerprint inputs", () => {
    expect(isAcceptCitationCandidateInput({ doi: "10.1000/candidate", responseId, direction: "references" })).toBe(true);
    expect(isAcceptCitationCandidateInput({ doi: "10.1000/candidate", responseId, direction: "citations" })).toBe(true);
    expect(isAcceptCitationCandidateInput({ doi: "invalid", responseId, direction: "references" })).toBe(false);
    expect(isAcceptCitationCandidateInput(null)).toBe(false);
    expect(isAcceptCitationCandidateInput([])).toBe(false);
    expect(isAcceptCitationCandidateInput({ doi: "10.1000/candidate", responseId: `${responseId}0`, direction: "references" })).toBe(false);
    expect(isAcceptCitationCandidateInput({ doi: "10.1000/candidate", responseId, direction: "other" })).toBe(false);
    expect(isAcceptCitationCandidateInput({ doi: "10.1000/candidate", responseId })).toBe(false);
    expect(isAcceptCitationCandidateInput({ doi: "10.1000/candidate", responseId, direction: "references", metadata: {} })).toBe(true);
  });

  it("accepts a bounded unique DOI batch", () => {
    expect(isAcceptCitationCandidatesInput({ dois: ["10.1000/one", "10.1000/two"], responseId, direction: "references" })).toBe(true);
    expect(isAcceptCitationCandidatesInput({ dois: ["10.1000/one"], responseId, direction: "citations" })).toBe(true);
    expect(isAcceptCitationCandidatesInput({ dois: [], responseId, direction: "references" })).toBe(false);
    expect(
      isAcceptCitationCandidatesInput({
        dois: Array.from({ length: 26 }, (_, index) => `10.1000/${index}`),
        responseId,
        direction: "references",
      }),
    ).toBe(false);
    expect(isAcceptCitationCandidatesInput({ dois: ["10.1000/one", "10.1000/ONE"], responseId, direction: "references" })).toBe(false);
    expect(isAcceptCitationCandidatesInput({ dois: ["invalid"], responseId, direction: "references" })).toBe(false);
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
    expect(isCitationCandidateAcceptance({ reference, created: true, assertion: { ...assertion, citingReferenceId: reference.id } })).toBe(
      true,
    );
    expectInvalidAcceptance(
      null,
      [],
      { reference, created: "true", assertion },
      { reference: { ...reference, id: crypto.randomUUID() }, created: true, assertion },
      { reference, created: true, assertion: { ...assertion, id: " invalid" } },
    );
    expect(isCitationCandidateBatchAcceptance({ accepted: [{ reference, created: true, assertion }] })).toBe(true);
    expect(isCitationCandidateBatchAcceptance({ accepted: [] })).toBe(false);
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
