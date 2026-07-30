export const researchDiaryPath = "research-diary.md";

export interface ResearchDiarySummary {
  readonly entries: number;
  readonly openQuestions: number;
  readonly nextActions: number;
}

export function researchDiaryTemplate(date: string): string {
  return `# Research diary

Use this portable project file to record progress, discoveries, questions, and
the next concrete action. Add a dated section for each writing session.

## ${date}

### Progress

- Describe what changed since the previous entry.

### Discoveries

- Record useful search phrases, sources, concepts, and decisions.

### Open questions

- [ ] Add a question to resolve or discuss with collaborators.

### Next actions

- [ ] Leave one interesting, concrete place to continue.
`;
}

export function summarizeResearchDiary(source: string): ResearchDiarySummary {
  return {
    entries: [...source.matchAll(/^## (?!#).+$/gmu)].length,
    openQuestions: checklistCount(sectionBody(source, "Open questions")),
    nextActions: checklistCount(sectionBody(source, "Next actions")),
  };
}

function sectionBody(source: string, heading: string): string {
  const target = new RegExp(`^### ${escapePattern(heading)}[ \\t]*$`, "iu");
  const bodies: string[] = [];
  let active = false;
  for (const line of source.split(/\r?\n/u)) {
    if (target.test(line)) {
      active = true;
      continue;
    }
    if (/^#{1,3}\s/u.test(line)) active = false;
    else if (active) bodies.push(line);
  }
  return bodies.join("\n");
}

function checklistCount(source: string): number {
  return [...source.matchAll(/^\s*[-*+]\s+\[ \]\s+\S/gmu)].length;
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
