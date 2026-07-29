import { describe, expect, it } from "vitest";
import { buildManuscriptMap, manuscriptParagraphs } from "./manuscript-map";

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

  it("normalizes CRLF input and accepts adjacent heading levels without a jump", () => {
    const map = buildManuscriptMap("# One\r\n## Two\r\n### Three\r\n");

    expect(map.sections.map(({ level, title, from, to }) => ({ level, title, from, to }))).toEqual([
      { level: 1, title: "One", from: 0, to: 6 },
      { level: 2, title: "Two", from: 6, to: 13 },
      { level: 3, title: "Three", from: 13, to: 23 },
    ]);
    expect(map.cues).toEqual([]);
  });
});
