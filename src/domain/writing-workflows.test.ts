import { describe, expect, it } from "vitest";
import { researchDiaryTemplate, summarizeResearchDiary } from "./writing-workflows";

describe("research diary workflow", () => {
  it("creates a portable dated starting point", () => {
    const template = researchDiaryTemplate("2026-07-16");
    expect(template).toContain("# Research diary");
    expect(template).toContain("## 2026-07-16");
    expect(template).toContain("### Open questions");
  });

  it("summarizes dated entries and incomplete work", () => {
    const source = `${researchDiaryTemplate("2026-07-15")}\n## 2026-07-16\n\n### Open questions\n\n- [ ] First?\n- [x] Resolved\n\n### Next actions\n\n- [ ] Continue.\n`;
    expect(summarizeResearchDiary(source)).toEqual({ entries: 2, openQuestions: 2, nextActions: 2 });
  });
});
