import { describe, expect, it } from "vitest";
import { parseExtractionModelResult, parseReviewModelSnapshot, parseScreeningModelResult, type ReviewModelCandidate } from "./review-model";

const field = {
  id: "year",
  label: "Year",
  type: "integer" as const,
  values: [],
  researchQuestionIds: [],
  requiredness: "required" as const,
  cardinality: "single" as const,
  condition: null,
};

describe("review model candidates", () => {
  it("validates bounded screening and evidence-linked extraction proposals", () => {
    expect(
      parseScreeningModelResult({ decision: "include", criterion: "Relevant", rationale: "Matches scope", evidence: "Exact title" }),
    ).toEqual({ decision: "include", criterion: "Relevant", rationale: "Matches scope", evidence: "Exact title" });
    expect(
      parseExtractionModelResult(
        {
          fieldId: "year",
          value: 2025,
          missingReason: null,
          evidence: {
            kind: "pdf-annotation",
            resourceId: "pdf-1",
            selectorId: "annotation-year",
            quote: "Published in 2025",
            page: 1,
            location: "Front matter",
          },
          rationale: "The year is explicit",
        },
        field,
      ),
    ).toMatchObject({ fieldId: "year", value: 2025, missingReason: null });
    expect(
      parseExtractionModelResult(
        { fieldId: "year", value: null, missingReason: "Not reported", evidence: null, rationale: "No year appears" },
        field,
      ),
    ).toMatchObject({ value: null, missingReason: "Not reported", evidence: null });
  });

  it("validates multiple-choice and source-selector proposals", () => {
    const multiple = {
      ...field,
      id: "methods",
      type: "multiple-choice" as const,
      values: ["survey", "interview"],
      cardinality: "repeatable" as const,
    };
    expect(
      parseExtractionModelResult(
        {
          fieldId: "methods",
          value: ["survey", "interview"],
          missingReason: null,
          evidence: {
            kind: "pdf-annotation",
            resourceId: "pdf-1",
            selectorId: "annotation-method",
            quote: "Survey and interviews",
            page: 2,
            location: "Method",
          },
          rationale: "Both methods are explicit",
        },
        multiple,
      ),
    ).toMatchObject({ value: ["survey", "interview"] });

    const selector = { ...field, id: "passage", type: "source-selector" as const };
    expect(
      parseExtractionModelResult(
        {
          fieldId: "passage",
          value: { kind: "web-passage", resourceId: "shared-web", selectorId: "passage-1" },
          missingReason: null,
          evidence: {
            kind: "web-passage",
            resourceId: "share-1",
            selectorId: "snapshot-1",
            quote: "Selected passage",
            page: null,
            location: "Results",
          },
          rationale: "The selected passage is relevant",
        },
        selector,
      ),
    ).toMatchObject({ value: { kind: "web-passage", resourceId: "shared-web", selectorId: "passage-1" } });
  });

  it("parses the auditable disclosure and rejects malformed or invented candidates", () => {
    const candidate: ReviewModelCandidate = {
      id: "candidate-1",
      operation: "screen-record",
      recordId: "record-1",
      stage: "title-abstract",
      provider: "Local",
      model: "model",
      promptTemplateVersion: "v1",
      sourceScope: ["title", "abstract"],
      result: { decision: "uncertain", criterion: "", rationale: "Insufficient", evidence: "Title" },
      createdAt: "2026-07-17T00:00:00.000Z",
      createdBy: "reviewer@example.com",
      disposition: "pending",
      disposedAt: null,
      disposedBy: null,
    };
    const extractionCandidate: ReviewModelCandidate = {
      ...candidate,
      id: "candidate-2",
      operation: "extract-field",
      stage: null,
      sourceScope: ["full-text"],
      result: {
        fieldId: "year",
        value: 2025,
        missingReason: null,
        evidence: {
          kind: "pdf-annotation",
          resourceId: "pdf-1",
          selectorId: "annotation-year",
          quote: "Published in 2025",
          page: 1,
          location: "Front matter",
        },
        rationale: "The publication year is explicit",
      },
      disposition: "accepted",
      disposedAt: "2026-07-17T00:05:00.000Z",
      disposedBy: "reviewer@example.com",
    };
    expect(parseReviewModelSnapshot({ revision: 4, candidates: [candidate, extractionCandidate] })).toEqual({
      revision: 4,
      candidates: [candidate, extractionCandidate],
    });
    expect(() => parseScreeningModelResult({ decision: "yes" })).toThrow("invalid");
    expect(() =>
      parseExtractionModelResult(
        {
          fieldId: "year",
          value: 2025,
          missingReason: null,
          evidence: null,
          rationale: "Unsupported",
        },
        field,
      ),
    ).toThrow("evidence");
    expect(() => parseReviewModelSnapshot({ revision: -1, candidates: "bad" })).toThrow("invalid");
    expect(() => parseReviewModelSnapshot({ revision: 1, candidates: [{ ...candidate, operation: "unknown" }] })).toThrow("candidate");
    expect(() =>
      parseReviewModelSnapshot({
        revision: 1,
        candidates: [{ ...extractionCandidate, result: { fieldId: "year", value: [], missingReason: null, rationale: "Bad" } }],
      }),
    ).toThrow("extraction candidate");
  });
});
