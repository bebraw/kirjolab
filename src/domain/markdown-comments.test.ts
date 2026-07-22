import { describe, expect, it } from "vitest";
import { projectMarkdownComments } from "./markdown-comments";

function fencedCommentProjection(opening: string, closing: string) {
  const source = `${opening}\n::: comment\n${closing}\n::: comment\nhidden\n:::\n`;
  return { source, projection: projectMarkdownComments(source) };
}

describe("Markdown comment blocks", () => {
  it("masks complete comment blocks without changing offsets or line endings", () => {
    const source = "Before\r\n::: comment\r\nHidden :cite[source].\r\n:::\r\nAfter\r\n";
    const result = projectMarkdownComments(source);

    expect(result.masked).toBe("Before\r\n           \r\n                     \r\n   \r\nAfter\r\n");
    expect(result.masked).toHaveLength(source.length);
    expect(result.ranges).toEqual([{ from: 8, to: 47 }]);
    expect(result.unclosedFrom).toBeNull();
  });

  it("does not recognize comment markers inside frontmatter or fenced code", () => {
    const source = `---
value: ::: comment
---

\`\`\`md
::: comment
inside code
:::
\`\`\`
`;
    expect(projectMarkdownComments(source)).toEqual({ masked: source, ranges: [], unclosedFrom: null });
  });

  it("masks an unclosed comment through the end of the document", () => {
    const source = "Visible\n::: comment\nHidden\n";
    expect(projectMarkdownComments(source)).toMatchObject({
      masked: "Visible\n           \n      \n",
      ranges: [{ from: 8, to: source.length }],
      unclosedFrom: 8,
    });
  });

  it("projects a final line without a newline and preserves lone carriage returns", () => {
    expect(projectMarkdownComments("Before\n::: comment\nHidden\n:::")).toEqual({
      masked: "Before\n           \n      \n   ",
      ranges: [{ from: 7, to: 29 }],
      unclosedFrom: null,
    });
    const carriageReturns = "Before\r::: comment\rHidden\r:::\rAfter";
    const projected = projectMarkdownComments(carriageReturns);
    expect(projected.masked).toBe("Before\r           \r      \r   \rAfter");
    expect(projected.masked).toHaveLength(carriageReturns.length);
    expect(projected.ranges).toEqual([{ from: 7, to: 29 }]);
  });

  it("leaves frontmatter intact before recognizing a following comment", () => {
    const source = " +++ \nordinary\n::: comment\nfrontmatter text\n:::\n  +++  \ntext\n::: comment\nhidden\n:::\n";
    const result = projectMarkdownComments(source);
    const commentFrom = source.indexOf("::: comment", source.indexOf("text"));
    expect(result.masked.slice(0, commentFrom)).toBe(source.slice(0, commentFrom));
    expect(result.ranges).toEqual([{ from: commentFrom, to: source.lastIndexOf(":::") + 3 }]);
    expect(result.unclosedFrom).toBeNull();
  });

  it("treats a frontmatter delimiter after prose as ordinary content", () => {
    const source = "text\n+++\n::: comment\nhidden\n:::\n";
    const result = projectMarkdownComments(source);
    expect(result.masked).toBe("text\n+++\n           \n      \n   \n");
    expect(result.ranges).toEqual([{ from: 9, to: 31 }]);
  });

  it("closes matching fences at their exact or a longer marker length", () => {
    for (const [opening, closing] of [
      ["```", "```"],
      ["````", "`````"],
      ["~~~", "~~~"],
      ["~~~", "~~~~"],
      ["   ```", "   ```   "],
      ["   ~~~", "   ~~~   "],
    ] as const) {
      const { source, projection } = fencedCommentProjection(opening, closing);
      const commentFrom = source.lastIndexOf("::: comment");
      expect(projection.ranges).toEqual([{ from: commentFrom, to: source.lastIndexOf(":::") + 3 }]);
      expect(projection.unclosedFrom).toBeNull();
    }
  });

  it("keeps fence-like lines inside a fence when they are not valid closers", () => {
    for (const [opening, closing] of [
      ["````", "```"],
      ["```", "~~~"],
      ["```", "x```"],
      ["```", "```x"],
      ["```", "    ```"],
      ["~~~", "~~"],
      ["~~~", "x~~~"],
      ["~~~", "~~~x"],
      ["~~~", "    ~~~"],
    ] as const) {
      const { source, projection } = fencedCommentProjection(opening, closing);
      expect(projection).toEqual({ masked: source, ranges: [], unclosedFrom: null });
    }
  });
});
