import { describe, expect, it } from "vitest";
import {
  citationExpansion as expansion,
  citationExpansionAssertion as assertion,
  citationExpansionResponseId as responseId,
} from "../test-support/citation-expansion-fixtures";
import { isCitationExpansionResult } from "./citation-expansion";

function expectInvalidExpansion(...values: unknown[]) {
  for (const value of values) expect(isCitationExpansionResult(value)).toBe(false);
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
});
