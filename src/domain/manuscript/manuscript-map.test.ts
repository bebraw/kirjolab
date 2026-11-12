import { describe, expect, it } from "vitest";
import { buildManuscriptMap, buildManuscriptOutline, manuscriptParagraphs } from "./manuscript-map";

describe("manuscript map", () => {
  it("summarizes headings, citations, and review cues", () => {
    const map = buildManuscriptMap(
      `# Paper\n\nOpening sentence.\n\n### Results\n\nThe result is supported :cite[paper].\n\nTODO explain the limitation.\n`,
    );
    expect(map.sections).toEqual([
      expect.objectContaining({ level: 1, title: "Paper", citations: 0 }),
      expect.objectContaining({ level: 3, title: "Results", citations: 1 }),
    ]);
    expect(map.cues.map((cue) => cue.kind)).toEqual(["heading-jump", "orphan-paragraph", "placeholder"]);
    expect(map.citations).toBe(1);
  });

  it("ignores comments, front matter, and fenced examples", () => {
    const map = buildManuscriptMap(
      `---\ntitle: TODO\n---\n\n# Real\n\n::: comment\n## Hidden TODO\n:::\n\n\`\`\`md\n### Example TODO\n\`\`\`\n\nDeveloped prose has two sentences. It is intentionally complete.\n`,
    );
    expect(map.sections.map((section) => section.title)).toEqual(["Real"]);
    expect(map.cues).toEqual([]);
  });

  it("excludes TOML frontmatter until its matching closing marker", () => {
    const source =
      '+++\r\ntitle = "TODO"\r\ndescription = """\r\n---\r\n# Hidden heading\r\n"""\r\n+++\r\n# Real\r\n\r\nVisible prose.\r\n';
    const map = buildManuscriptMap(source);
    const outline = buildManuscriptOutline(source);

    expect(map.sections.map(({ title }) => title)).toEqual(["Real"]);
    expect(map.cues).toEqual([]);
    expect(outline.paragraphs.map(({ text }) => text)).toEqual(["Visible prose."]);
    expect(outline.paragraphs.map(({ from, to }) => source.slice(from, to))).toEqual(["Visible prose."]);
    expect(buildManuscriptOutline('+++\ntitle = "Unclosed metadata"')).toEqual({ items: [], sections: [], paragraphs: [] });
  });

  it("derives exact section ranges, heading labels, words, and citations", () => {
    const source = `# Title
::label[title]

Opening words with Jean-Luc's result :cite[one]{locator="p. 2"}.

## Method

Method cites :CITE[two] and ignores ::cite[directive].

###### Appendix
Final words.`;
    const methodOffset = source.indexOf("## Method");
    const appendixOffset = source.indexOf("###### Appendix");

    expect(buildManuscriptMap(source)).toEqual({
      words: 23,
      citations: 2,
      sections: [
        { level: 1, title: "Title", from: 0, to: methodOffset, words: 10, citations: 1 },
        { level: 2, title: "Method", from: methodOffset, to: appendixOffset, words: 8, citations: 1 },
        { level: 6, title: "Appendix", from: appendixOffset, to: source.length, words: 2, citations: 0 },
      ],
      cues: [
        {
          kind: "orphan-paragraph",
          message: "Review this single-sentence paragraph",
          from: source.indexOf("Method cites"),
          to: source.indexOf("\n\n###### Appendix"),
        },
        {
          kind: "heading-jump",
          message: "Heading jumps from level 2 to 6",
          from: appendixOffset,
          to: appendixOffset + "###### Appendix".length,
        },
      ],
    });
  });

  it("finds every placeholder spelling case-insensitively with stable sorted ranges", () => {
    const source = "todo then TBD and FixMe plus ???.";

    expect(buildManuscriptMap(source).cues).toEqual([
      { kind: "placeholder", message: "Resolve placeholder “todo”", from: 0, to: 4 },
      { kind: "orphan-paragraph", message: "Review this single-sentence paragraph", from: 0, to: source.length },
      { kind: "placeholder", message: "Resolve placeholder “TBD”", from: 10, to: 13 },
      { kind: "placeholder", message: "Resolve placeholder “FixMe”", from: 18, to: 23 },
      { kind: "placeholder", message: "Resolve placeholder “???”", from: 29, to: 32 },
    ]);
  });

  it("requires at least five words and no more than one sentence for orphan cues", () => {
    const source = `One two three four.

One two three four five.

One two three four five! Six seven eight nine ten?

One two three four five without punctuation`;
    const map = buildManuscriptMap(source);

    expect(map.cues).toEqual([
      {
        kind: "orphan-paragraph",
        message: "Review this single-sentence paragraph",
        from: source.indexOf("One two three four five."),
        to: source.indexOf("\n\nOne two three four five!"),
      },
      {
        kind: "orphan-paragraph",
        message: "Review this single-sentence paragraph",
        from: source.lastIndexOf("One two"),
        to: source.length,
      },
    ]);
  });

  it("returns only prose paragraphs and preserves exact offsets and citation counts", () => {
    const source = `# Heading

- list item

1. ordered

> quote

::directive[value]

| table |

First prose has :cite[one].
and continues.

Second prose is here`;

    expect(manuscriptParagraphs(source)).toEqual([
      {
        text: "First prose has :cite[one].\nand continues.",
        from: source.indexOf("First prose"),
        to: source.indexOf("\n\nSecond prose"),
        words: 7,
        citations: 1,
      },
      {
        text: "Second prose is here",
        from: source.indexOf("Second prose"),
        to: source.length,
        words: 4,
        citations: 0,
      },
    ]);
  });

  it("finds prose beside headings while retaining original CRLF source ranges", () => {
    const source = "  Preamble words.  \r\n# First\r\nFirst paragraph.\r\nContinued here.\r\n## Child\r\nChild text.\r\n";

    expect(manuscriptParagraphs(source)).toEqual([
      { text: "Preamble words.", from: 2, to: 17, words: 2, citations: 0 },
      { text: "First paragraph.\r\nContinued here.", from: 30, to: 63, words: 4, citations: 0 },
      { text: "Child text.", from: 75, to: 86, words: 2, citations: 0 },
    ]);
  });

  it("masks tilde and backtick fences, including unclosed blocks, without changing line offsets", () => {
    const source = `# Visible

~~~md
## Hidden one
TODO
~~~

\`\`\`
## Hidden two
FIXME

Still hidden`;

    expect(buildManuscriptMap(source)).toEqual({
      words: 1,
      citations: 0,
      sections: [{ level: 1, title: "Visible", from: 0, to: source.length, words: 0, citations: 0 }],
      cues: [],
    });
  });

  it("retains original CRLF offsets and accepts adjacent heading levels without a jump", () => {
    const map = buildManuscriptMap("# One\r\n## Two\r\n### Three\r\n");

    expect(map.sections.map(({ level, title, from, to }) => ({ level, title, from, to }))).toEqual([
      { level: 1, title: "One", from: 0, to: 7 },
      { level: 2, title: "Two", from: 7, to: 15 },
      { level: 3, title: "Three", from: 15, to: 26 },
    ]);
    expect(map.cues).toEqual([]);
  });
});

describe("manuscript outline", () => {
  it("keeps preamble paragraphs and nests headings with distinct own and subtree metrics", () => {
    const source = "Preamble.\n# Main\nMain words.\n## Child\nChild cites :cite[one].\n# End\nEnd words.";
    const outline = buildManuscriptOutline(source);

    expect(outline.items).toMatchObject([
      { kind: "paragraph", text: "Preamble.", from: 0, to: 9 },
      {
        kind: "section",
        title: "Main",
        from: source.indexOf("# Main"),
        headingTo: source.indexOf("Main words.") - 1,
        to: source.indexOf("## Child"),
        words: 2,
        citations: 0,
        subtreeTo: source.indexOf("# End"),
        subtreeWords: 6,
        subtreeCitations: 1,
        children: [
          { kind: "paragraph", text: "Main words." },
          {
            kind: "section",
            title: "Child",
            level: 2,
            words: 4,
            subtreeWords: 4,
            subtreeCitations: 1,
            children: [{ kind: "paragraph", text: "Child cites :cite[one]." }],
          },
        ],
      },
      { kind: "section", title: "End", children: [{ kind: "paragraph", text: "End words." }] },
    ]);
    expect(outline.sections.map(({ title }) => title)).toEqual(["Main", "Child", "End"]);
    expect(outline.paragraphs.map(({ from, to }) => source.slice(from, to))).toEqual([
      "Preamble.",
      "Main words.",
      "Child cites :cite[one].",
      "End words.",
    ]);
  });

  it("excludes non-prose blocks and does not let a mismatched fence expose an example heading", () => {
    const source = [
      "---",
      "title: TODO metadata",
      "---",
      "",
      "# Real",
      "::label[TODO]",
      "Real prose.",
      "",
      "::: comment",
      "## Hidden comment TODO",
      "Hidden prose.",
      ":::",
      "",
      "````md",
      "```",
      "## Hidden example TODO",
      "~~~",
      "Hidden code.",
      "````",
      "",
      "Name | Value",
      "--- | ---",
      "Hidden | table",
      "",
      "- Hidden list",
      "  continued list",
      "",
      "> Hidden quote",
      "",
      "::figure[hidden]",
      "unsupported directive body",
      "",
      "    Hidden indented code",
      "",
      "Visible ending.",
    ].join("\n");
    const outline = buildManuscriptOutline(source);

    expect(outline.sections.map(({ title }) => title)).toEqual(["Real"]);
    expect(outline.paragraphs.map(({ text }) => text)).toEqual(["Real prose.", "Visible ending."]);
    expect(outline.paragraphs.map(({ from, to }) => source.slice(from, to))).toEqual(["Real prose.", "Visible ending."]);
    expect(buildManuscriptMap(source).cues).toEqual([]);
  });

  it("closes skipped-level branches at the next peer or ancestor and retains CRLF heading offsets", () => {
    const source = "## Parent\r\n#### Deep\r\nDeep words.\r\n### Peer\r\nPeer words.\r\n## Last\r\n";
    const outline = buildManuscriptOutline(source);

    expect(outline.items).toMatchObject([
      {
        kind: "section",
        title: "Parent",
        words: 0,
        subtreeWords: 4,
        children: [
          { kind: "section", title: "Deep", subtreeTo: 35, children: [{ text: "Deep words." }] },
          { kind: "section", title: "Peer", subtreeTo: 58, children: [{ text: "Peer words." }] },
        ],
      },
      { kind: "section", title: "Last", words: 0, subtreeWords: 0, subtreeTo: source.length, children: [] },
    ]);
    expect(outline.sections.map(({ from, headingTo }) => source.slice(from, headingTo))).toEqual([
      "## Parent",
      "#### Deep",
      "### Peer",
      "## Last",
    ]);
    expect(outline.sections.map(({ from, to }) => [from, to])).toEqual([
      [0, 11],
      [11, 35],
      [35, 58],
      [58, 67],
    ]);
    expect(outline.paragraphs.map(({ from, to }) => source.slice(from, to))).toEqual(["Deep words.", "Peer words."]);
  });

  it("handles empty and headingless manuscripts without inventing sections", () => {
    expect(buildManuscriptOutline("")).toEqual({ items: [], sections: [], paragraphs: [] });
    expect(buildManuscriptOutline("Plain text.")).toEqual({
      items: [{ kind: "paragraph", text: "Plain text.", from: 0, to: 11, words: 2, citations: 0 }],
      sections: [],
      paragraphs: [{ kind: "paragraph", text: "Plain text.", from: 0, to: 11, words: 2, citations: 0 }],
    });
  });
});
