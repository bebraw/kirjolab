import { describe, expect, it } from "vitest";
import { parseReviewerResponses, reviewerResponseLetter, reviewerResponseTemplate } from "./reviewer-response";

describe("reviewer response matrix", () => {
  it("parses review status, response, and manuscript links", () => {
    const source = reviewerResponseTemplate().replace("**Status:** open", "**Status:** addressed");
    expect(parseReviewerResponses(source)).toEqual([
      expect.objectContaining({
        id: "R1.1",
        reviewer: "Reviewer 1",
        status: "addressed",
        manuscriptLinks: ["#introduction"],
        comment: "Paste or faithfully summarize the comment here.",
      }),
    ]);
  });

  it("generates a clean portable response letter", () => {
    const letter = reviewerResponseLetter(reviewerResponseTemplate());
    expect(letter).toContain("# Response to reviewers");
    expect(letter).toContain("## R1.1: Summarize the reviewer comment");
    expect(letter).not.toContain("**Status:**");
    expect(letter).not.toContain("**Manuscript links:**");
  });
});
