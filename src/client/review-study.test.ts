import { describe, expect, it } from "vitest";

import { researchQuestionReference, resolveResearchQuestionReferences } from "./review-study";

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
