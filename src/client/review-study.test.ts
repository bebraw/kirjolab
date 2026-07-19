import { describe, expect, it } from "vitest";

import { latestExtractionValue, researchQuestionReference, resolveResearchQuestionReferences } from "./review-study";

const questions = [
  { id: "rq_internal_first", text: "What changed?" },
  { id: "rq_internal_second", text: "What did it cost?" },
];

describe("review-study research-question references", () => {
  it("resolves visible ordered references to stable internal ids", () => {
    expect(resolveResearchQuestionReferences("RQ1; rq2", questions)).toEqual(["rq_internal_first", "rq_internal_second"]);
  });

  it("preserves unknown references for domain validation", () => {
    expect(resolveResearchQuestionReferences("RQ3; custom", questions)).toEqual(["RQ3", "custom"]);
  });

  it("renders stable ids as visible ordered references", () => {
    expect(researchQuestionReference("rq_internal_second", questions)).toBe("rq2");
    expect(researchQuestionReference("legacy", questions)).toBe("legacy");
  });
});

describe("review-study extraction state", () => {
  it("returns the latest recorded value for a field", () => {
    const values = [
      {
        id: "first",
        recordId: "record",
        protocolRevision: 1,
        fieldId: "effect",
        criterionId: "effect",
        criterionText: "Effect",
        value: "small",
        missingReason: null,
        evidence: {
          kind: "pdf-annotation" as const,
          resourceId: "pdf-1",
          selectorId: "annotation-1",
          quote: "Small effect",
          page: 1,
          location: "Results",
        },
        reviewer: "one@example.org",
        createdAt: "2026-07-17T10:00:00.000Z",
      },
      {
        id: "second",
        recordId: "record",
        protocolRevision: 1,
        fieldId: "effect",
        criterionId: "effect",
        criterionText: "Effect",
        value: "moderate",
        missingReason: null,
        evidence: {
          kind: "pdf-annotation" as const,
          resourceId: "pdf-1",
          selectorId: "annotation-2",
          quote: "Moderate effect",
          page: 2,
          location: "Results",
        },
        reviewer: "two@example.org",
        createdAt: "2026-07-17T11:00:00.000Z",
      },
    ];

    expect(latestExtractionValue(values, "effect")?.id).toBe("second");
    expect(latestExtractionValue(values, "missing")).toBeNull();
  });
});
