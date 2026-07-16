import { describe, expect, it } from "vitest";
import { parseResearchQuestions, researchQuestionsTemplate } from "./research-questions";

describe("research question ledger", () => {
  it("creates a readable portable template", () => {
    expect(researchQuestionsTemplate()).toContain("## RQ1:");
    expect(researchQuestionsTemplate()).toContain("**Manuscript sections:**");
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
});
