import { describe, expect, it } from "vitest";
import { parseReviewerResponses, reviewerResponseLetter, reviewerResponsePath, reviewerResponseTemplate } from "./reviewer-response";

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

  it("exposes the exact reusable response-matrix template and path", () => {
    expect(reviewerResponsePath).toBe("reviewer-response.md");
    expect(reviewerResponseTemplate()).toBe(`# Reviewer response matrix

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
`);
  });

  it("parses multiple Unicode item ids, bullet styles, statuses, links, and exact ranges", () => {
    const source = `Preface
## Rα_1:  First summary${"  "}

* **Reviewer:**  Reviewer Alpha${"  "}
+ **Status:** DECLINED
- **Manuscript links:** #one, , #two

### Reviewer comment
> First line
> second line

### Response
Alpha response.

### Change made
Alpha change.

## R2-x: Second summary

- **Reviewer:** Reviewer Beta
- **Status:** unknown
- **Manuscript links:**${" "}

### Reviewer comment
Plain comment

### Response

### Change made
`;
    const secondOffset = source.indexOf("## R2-x");

    expect(parseReviewerResponses(source)).toEqual([
      {
        id: "Rα_1",
        summary: "First summary",
        reviewer: "Reviewer Alpha",
        status: "declined",
        manuscriptLinks: ["#one", "#two"],
        comment: "First line\nsecond line",
        response: "Alpha response.",
        change: "Alpha change.",
        from: source.indexOf("## Rα_1"),
        to: secondOffset,
      },
      {
        id: "R2-x",
        summary: "Second summary",
        reviewer: "Reviewer Beta",
        status: "open",
        manuscriptLinks: [],
        comment: "Plain comment",
        response: "",
        change: "",
        from: secondOffset,
        to: source.length,
      },
    ]);
  });

  it("accepts addressed case-insensitively and ignores lookalike headings and fields", () => {
    const source = `# R1: not an item
## X1: wrong prefix
## R3: Valid
Reviewer: not a field
- **Review.er:** wrong field
- **Status:** AdDrEsSeD

#### Reviewer comment
wrong heading level
`;

    expect(parseReviewerResponses(source)).toEqual([
      {
        id: "R3",
        summary: "Valid",
        reviewer: "",
        status: "addressed",
        manuscriptLinks: [],
        comment: "",
        response: "",
        change: "",
        from: source.indexOf("## R3"),
        to: source.length,
      },
    ]);
  });

  it("renders exact portable sections and explicit empty-state prose", () => {
    const source = `## R1: Empty
- **Status:** open

## R2: Complete
- **Status:** addressed
### Reviewer comment
> Comment
### Response
Response
### Change made
Change`;

    expect(reviewerResponseLetter(source)).toBe(`# Response to reviewers

## R1: Empty

**Reviewer comment**

No reviewer comment recorded.

**Response**

No response recorded.

**Change made**

No manuscript change recorded.

## R2: Complete

**Reviewer comment**

Comment

**Response**

Response

**Change made**

Change
`);
    expect(reviewerResponseLetter("no items")).toBe("# Response to reviewers\n\n\n");
  });
});
