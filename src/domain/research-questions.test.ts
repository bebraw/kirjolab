import { describe, expect, it } from "vitest";
import { parseResearchQuestions, researchQuestionsTemplate } from "./research-questions";

describe("research question ledger", () => {
  it("creates a readable portable template", () => {
    expect(researchQuestionsTemplate()).toBe(`# Research questions

Keep each question under an \`## RQ…\` heading. Use Markdown anchor labels for
manuscript sections and stable Kirjolab claim IDs where relevant.

## RQ1: Replace this with the central research question

- **Status:** refining
- **Motivation:** Explain why answering this question matters.
- **Method:** Describe how the question will be addressed.
- **Manuscript sections:** #introduction, #results, #conclusion
- **Claims:**
`);
  });

  it("parses bounded questions and traceability fields", () => {
    const source = `# Questions\n\n## RQ1: What changes?\n\n- **Status:** active\n- **Motivation:** Establish the effect.\n- **Method:** Experiment.\n- **Manuscript sections:** #methods, #results\n- **Claims:** claim-1, claim-2\n\n## RQ2: Why?\n\n- **Status:** answered\n`;
    expect(parseResearchQuestions(source)).toEqual([
      expect.objectContaining({
        id: "RQ1",
        question: "What changes?",
        status: "active",
        sections: ["#methods", "#results"],
        claims: ["claim-1", "claim-2"],
      }),
      expect.objectContaining({ id: "RQ2", question: "Why?", status: "answered", sections: [], claims: [] }),
    ]);
  });

  it("requires complete level-two RQ headings and preserves exact ranges", () => {
    const source = `prefix
##   RQ-α_2.1 \t: \t Question with spaces?${"   "}
- **Status:** DEFERRED
- **Motivation:** Why.
- **Method:** How.
- **Claims:** claim-1, , claim-2
suffix`;
    expect(parseResearchQuestions(source)).toEqual([
      {
        id: "RQ-α_2.1",
        question: "Question with spaces?",
        status: "deferred",
        motivation: "Why.",
        method: "How.",
        sections: [],
        claims: ["claim-1", "claim-2"],
        from: 7,
        to: source.length,
      },
    ]);
    for (const heading of ["prefix ## RQ1: Inline", "##RQ1: Missing space", "## RQ1 Missing colon", "### RQ1: Wrong level"]) {
      expect(parseResearchQuestions(heading), heading).toEqual([]);
    }
  });
});
