import { describe, expect, it } from "vitest";
import { buildGroundedPrompt, calculateTextSplice, extractCompletion, stripMarkdownFence } from "./operations";

describe("calculateTextSplice", () => {
  it("finds insertions, replacements, and no-op edits", () => {
    expect(calculateTextSplice("abc", "abXc")).toEqual({ start: 2, deleteCount: 0, insert: "X" });
    expect(calculateTextSplice("abc", "axc")).toEqual({ start: 1, deleteCount: 1, insert: "x" });
    expect(calculateTextSplice("same", "same")).toBeNull();
    expect(calculateTextSplice("", "a")).toEqual({ start: 0, deleteCount: 0, insert: "a" });
    expect(calculateTextSplice("a", "")).toEqual({ start: 0, deleteCount: 1, insert: "" });
    expect(calculateTextSplice("abc", "ab")).toEqual({ start: 2, deleteCount: 1, insert: "" });
    expect(calculateTextSplice("ab", "abc")).toEqual({ start: 2, deleteCount: 0, insert: "c" });
    expect(calculateTextSplice("xabc", "yabc")).toEqual({ start: 0, deleteCount: 1, insert: "y" });
  });
});

describe("local model operations", () => {
  it("builds a grounded prompt with annotation provenance", () => {
    const prompt = buildGroundedPrompt("Complete document", "Selected text", [
      {
        id: "a",
        pdfId: "p",
        page: 4,
        quote: "Evidence",
        prefix: "Before",
        suffix: "After",
        comment: "Useful",
        rects: [],
        createdAt: "now",
      },
    ]);

    expect(prompt).toContain("Selected text");
    expect(prompt).toContain("Evidence 1, page 4");
    expect(prompt).toContain("Complete document");
    expect(
      buildGroundedPrompt("Document", "Selection", [
        { id: "a", pdfId: "p", page: 1, quote: "One", prefix: "A", suffix: "B", comment: "C", rects: [], createdAt: "now" },
        { id: "b", pdfId: "p", page: 2, quote: "Two", prefix: "D", suffix: "E", comment: "F", rects: [], createdAt: "now" },
      ]),
    ).toContain("Researcher note: C\n\n[Evidence 2, page 2]");
  });

  it("extracts fenced and plain OpenAI-compatible completions", () => {
    expect(extractCompletion({ choices: [{ message: { content: "```markdown\n## Revised\n```" } }] })).toBe("## Revised\n");
    expect(stripMarkdownFence("plain")).toBe("plain\n");
    expect(stripMarkdownFence("  plain  ")).toBe("plain\n");
    expect(stripMarkdownFence("```md\n# Heading\n```"), "md fences").toBe("# Heading\n");
    expect(stripMarkdownFence("```\n# Heading\n```"), "unlabelled fences").toBe("# Heading\n");
    expect(stripMarkdownFence("prefix ```md\n# Heading\n```"), "fence must occupy the result").toBe("prefix ```md\n# Heading\n```\n");
    expect(extractCompletion({ choices: [] })).toBeNull();
    expect(extractCompletion({ choices: [null] })).toBeNull();
    expect(extractCompletion({ choices: [{ message: null }] })).toBeNull();
    expect(extractCompletion({ choices: [{ message: { content: 42 } }] })).toBeNull();
    expect(extractCompletion(null)).toBeNull();
  });
});
