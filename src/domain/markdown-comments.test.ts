import { describe, expect, it } from "vitest";
import { projectMarkdownComments } from "./markdown-comments";

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
});
