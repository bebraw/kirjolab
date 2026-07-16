export const researchQuestionsPath = "research-questions.md";

export type ResearchQuestionStatus = "refining" | "active" | "answered" | "deferred";

export interface ResearchQuestion {
  readonly id: string;
  readonly question: string;
  readonly status: ResearchQuestionStatus;
  readonly motivation: string;
  readonly method: string;
  readonly sections: readonly string[];
  readonly claims: readonly string[];
  readonly from: number;
  readonly to: number;
}

const headingPattern = /^##[ \t]+(RQ[\p{L}\p{N}._-]*)[ \t]*:[ \t]*(.+?)[ \t]*$/gimu;

export function researchQuestionsTemplate(): string {
  return `# Research questions

Keep each question under an \`## RQ…\` heading. Use Markdown anchor labels for
manuscript sections and stable Kirjolab claim IDs where relevant.

## RQ1: Replace this with the central research question

- **Status:** refining
- **Motivation:** Explain why answering this question matters.
- **Method:** Describe how the question will be addressed.
- **Manuscript sections:** #introduction, #results, #conclusion
- **Claims:**
`;
}

export function parseResearchQuestions(source: string): readonly ResearchQuestion[] {
  const headings = [...source.matchAll(headingPattern)];
  return headings.map((heading, index) => {
    const from = heading.index;
    const to = headings[index + 1]?.index ?? source.length;
    const body = source.slice(from + heading[0].length, to);
    return {
      id: heading[1] ?? "RQ",
      question: heading[2]?.trim() ?? "",
      status: readStatus(field(body, "Status")),
      motivation: field(body, "Motivation"),
      method: field(body, "Method"),
      sections: listField(body, "Manuscript sections"),
      claims: listField(body, "Claims"),
      from,
      to,
    };
  });
}

function field(body: string, name: string): string {
  const match = new RegExp(`^[ \\t]*[-*+][ \\t]+\\*\\*${escapePattern(name)}:\\*\\*[ \\t]*(.*)$`, "imu").exec(body);
  return match?.[1]?.trim() ?? "";
}

function listField(body: string, name: string): readonly string[] {
  return field(body, name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readStatus(value: string): ResearchQuestionStatus {
  const normalized = value.toLocaleLowerCase();
  if (normalized === "active" || normalized === "answered" || normalized === "deferred") return normalized;
  return "refining";
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
