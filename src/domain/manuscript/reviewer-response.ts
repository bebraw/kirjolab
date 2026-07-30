export const reviewerResponsePath = "reviewer-response.md";

export type ReviewerResponseStatus = "open" | "addressed" | "declined";

export interface ReviewerResponseItem {
  readonly id: string;
  readonly summary: string;
  readonly reviewer: string;
  readonly status: ReviewerResponseStatus;
  readonly manuscriptLinks: readonly string[];
  readonly comment: string;
  readonly response: string;
  readonly change: string;
  readonly from: number;
  readonly to: number;
}

const itemHeading = /^##[ \t]+(R[\p{L}\p{N}._-]+)[ \t]*:[ \t]*(.+?)[ \t]*$/gimu;

export function reviewerResponseTemplate(): string {
  return `# Reviewer response matrix

Keep one review item under each \`## R…\` heading. Preserve the reviewer's
meaning, respond cordially, and link the exact manuscript anchors that changed.

## R1.1: Summarize the reviewer comment

- **Reviewer:** Reviewer 1
- **Status:** open
- **Manuscript links:** #introduction

### Reviewer comment

> Paste or faithfully summarize the comment here.

### Response

Explain how the comment was addressed or why a different approach was chosen.

### Change made

Describe the concrete manuscript change.
`;
}

export function parseReviewerResponses(source: string): readonly ReviewerResponseItem[] {
  const headings = [...source.matchAll(itemHeading)];
  return headings.map((heading, index) => {
    const from = heading.index;
    const to = headings[index + 1]?.index ?? source.length;
    const body = source.slice(from + heading[0].length, to);
    return {
      id: heading[1] ?? "R",
      summary: heading[2]?.trim() ?? "",
      reviewer: field(body, "Reviewer"),
      status: readStatus(field(body, "Status")),
      manuscriptLinks: field(body, "Manuscript links")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      comment: subsection(body, "Reviewer comment")
        .replace(/^>[ \t]?/gmu, "")
        .trim(),
      response: subsection(body, "Response").trim(),
      change: subsection(body, "Change made").trim(),
      from,
      to,
    };
  });
}

export function reviewerResponseLetter(source: string): string {
  const items = parseReviewerResponses(source);
  const sections = items.map(
    (item) => `## ${item.id}: ${item.summary}

**Reviewer comment**

${item.comment || "No reviewer comment recorded."}

**Response**

${item.response || "No response recorded."}

**Change made**

${item.change || "No manuscript change recorded."}`,
  );
  return `# Response to reviewers\n\n${sections.join("\n\n")}\n`;
}

function field(body: string, name: string): string {
  const match = new RegExp(`^[ \\t]*[-*+][ \\t]+\\*\\*${escapePattern(name)}:\\*\\*[ \\t]*(.*)$`, "imu").exec(body);
  return match?.[1]?.trim() ?? "";
}

function subsection(body: string, name: string): string {
  const heading = new RegExp(`^### ${escapePattern(name)}[ \\t]*$`, "imu").exec(body);
  if (!heading) return "";
  const from = (heading.index ?? 0) + heading[0].length;
  const remainder = body.slice(from);
  const next = /^###\s+/mu.exec(remainder);
  return remainder.slice(0, next?.index ?? remainder.length);
}

function readStatus(value: string): ReviewerResponseStatus {
  const normalized = value.toLocaleLowerCase();
  if (normalized === "addressed" || normalized === "declined") return normalized;
  return "open";
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
