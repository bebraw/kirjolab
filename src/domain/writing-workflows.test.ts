import { describe, expect, it } from "vitest";
import { researchDiaryTemplate, summarizeResearchDiary } from "./writing-workflows";

describe("research diary workflow", () => {
  it("creates a portable dated starting point", () => {
    const template = researchDiaryTemplate("2026-07-16");
    expect(template).toBe(`# Research diary

Use this portable project file to record progress, discoveries, questions, and
the next concrete action. Add a dated section for each writing session.

## 2026-07-16

### Progress

- Describe what changed since the previous entry.

### Discoveries

- Record useful search phrases, sources, concepts, and decisions.

### Open questions

- [ ] Add a question to resolve or discuss with collaborators.

### Next actions

- [ ] Leave one interesting, concrete place to continue.
`);
  });

  it("summarizes dated entries and incomplete work", () => {
    const source = `${researchDiaryTemplate("2026-07-15")}\n## 2026-07-16\n\n### Open questions\n\n- [ ] First?\n- [x] Resolved\n\n### Next actions\n\n- [ ] Continue.\n`;
    expect(summarizeResearchDiary(source)).toEqual({ entries: 2, openQuestions: 2, nextActions: 2 });
  });

  it("counts only complete headings and unchecked list items inside the named sections", () => {
    const source = `prefix ## Inline
## Entry
### Open questions${"   "}
  + [ ] Indented question
* [ ] Second question
- [x] Resolved
#### Not a terminating level-three heading
- [ ] Still open
### Progress
- [ ] Outside
### Next actions
-[ ] Missing spaces
- [ ] Continue
text
##Entry without space`;
    expect(summarizeResearchDiary(source)).toEqual({ entries: 1, openQuestions: 3, nextActions: 1 });
  });
});
