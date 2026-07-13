import { describe, expect, it } from "vitest";
import { highlightMarkdown } from "./markdown-highlighting";

describe("Markdown editor highlighting", () => {
  it("classifies scholarly Markdown without changing its text", () => {
    const source = `---
title: Evidence
---
## Findings {#findings}

> Read **carefully** and use :cite[smith2024] with [context](https://example.test).
- Include \`measurement details\`[^method]
::include[methods.md]
\`\`\`text
# literal heading
\`\`\``;
    const segments = highlightMarkdown(source);

    expect(segments.map(({ text }) => text).join("")).toBe(source);
    expect(segments.filter(({ kind }) => kind !== null)).toEqual(
      expect.arrayContaining([
        { text: "---", kind: "frontmatter" },
        { text: "title", kind: "metadata-key" },
        { text: "##", kind: "heading-marker" },
        { text: " Findings {#findings}", kind: "heading" },
        { text: "> ", kind: "quote-marker" },
        { text: "**carefully**", kind: "markup" },
        { text: ":cite[smith2024]", kind: "directive" },
        { text: "[context](https://example.test)", kind: "link" },
        { text: "- ", kind: "list-marker" },
        { text: "`measurement details`", kind: "code" },
        { text: "[^method]", kind: "directive" },
        { text: "::include[methods.md]", kind: "directive" },
        { text: "# literal heading", kind: "code" },
      ]),
    );
  });

  it("leaves incomplete syntax visible as ordinary source", () => {
    const source = "Plain :cite[unfinished and **open markup\r\n";
    const segments = highlightMarkdown(source);
    expect(segments).toEqual([
      { text: "Plain :cite[unfinished and **open markup", kind: null },
      { text: "\r\n", kind: null },
    ]);
  });

  it("requires bounded frontmatter and resumes document highlighting after it", () => {
    const source = "title: prose\n---\nnot: frontmatter\n# Heading\n";
    const segments = highlightMarkdown(source);
    expect(segments.map(({ text }) => text).join("")).toBe(source);
    expect(segments).toContainEqual({ text: "#", kind: "heading-marker" });
    expect(segments).not.toContainEqual({ text: "title", kind: "metadata-key" });
    expect(segments).not.toContainEqual({ text: "not", kind: "metadata-key" });

    const frontmatter = highlightMarkdown(" --- \n  citation_style: apa\n---\n### Results\n");
    expect(frontmatter.filter(({ kind }) => kind !== null)).toEqual([
      { text: " --- ", kind: "frontmatter" },
      { text: "  citation_style", kind: "metadata-key" },
      { text: "---", kind: "frontmatter" },
      { text: "###", kind: "heading-marker" },
      { text: " Results", kind: "heading" },
    ]);
  });

  it("distinguishes fenced blocks from inline code and heading-like prose", () => {
    const source = "not ``` a fence\n~ short\n~~~ md\n## literal\n~~~\nUse `inline` now.\n";
    const segments = highlightMarkdown(source);
    expect(segments.map(({ text }) => text).join("")).toBe(source);
    expect(segments.filter(({ kind }) => kind === "code")).toEqual([
      { text: "~~~ md", kind: "code" },
      { text: "## literal", kind: "code" },
      { text: "~~~", kind: "code" },
      { text: "`inline`", kind: "code" },
    ]);
    expect(segments).not.toContainEqual({ text: "##", kind: "heading-marker" });
  });

  it("classifies indented block markers and the complete inline vocabulary", () => {
    const source = [
      "  ####\tDeep heading",
      "  >>>\tNested quote with _stress_",
      "  12)\tOrdered item with __weight__ and *care*",
      "  ::alias",
      "Use :ref[section], ![figure](figure.png), {#section:one}, and [^note].",
    ].join("\n");
    const tokens = highlightMarkdown(source).filter(({ kind }) => kind !== null);
    expect(tokens).toEqual(
      expect.arrayContaining([
        { text: "####", kind: "heading-marker" },
        { text: "\tDeep heading", kind: "heading" },
        { text: ">>>\t", kind: "quote-marker" },
        { text: "_stress_", kind: "markup" },
        { text: "12)\t", kind: "list-marker" },
        { text: "__weight__", kind: "markup" },
        { text: "*care*", kind: "markup" },
        { text: "::alias", kind: "directive" },
        { text: ":ref[section]", kind: "directive" },
        { text: "![figure](figure.png)", kind: "link" },
        { text: "{#section:one}", kind: "markup" },
        { text: "[^note]", kind: "directive" },
      ]),
    );
    expect(tokens.filter(({ text }) => text === "::alias")).toHaveLength(1);
  });

  it("does not classify markers that occur in the middle of prose", () => {
    const source = "Text > quote\nText - list\nText ::include[file.md]\n####Missing space\n";
    const segments = highlightMarkdown(source);
    expect(segments).toEqual([
      { text: "Text > quote", kind: null },
      { text: "\n", kind: null },
      { text: "Text - list", kind: null },
      { text: "\n", kind: null },
      { text: "Text ::include[file.md]", kind: null },
      { text: "\n", kind: null },
      { text: "####Missing space", kind: null },
      { text: "\n", kind: null },
    ]);
  });
});
