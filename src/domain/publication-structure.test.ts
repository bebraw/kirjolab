import { describe, expect, it } from "vitest";
import { projectPublicationStructure, publicationFootnoteReferences, replacePublicationFootnoteReferences } from "./publication-structure";

describe("publication structure projection", () => {
  it("projects aligned pipe tables, escaped pipes, and short rows", () => {
    const structure = projectPublicationStructure(
      ["| Finding | Value | Meaning |", "| :--- | ---: | :---: |", "| A \\| B | **12** | centered |", "| Short |"].join("\n"),
    );

    expect(structure.tablesByStartLine.get(0)).toEqual({
      startLine: 0,
      endLine: 3,
      header: ["Finding", "Value", "Meaning"],
      alignments: ["left", "right", "center"],
      rows: [
        ["A | B", "**12**", "centered"],
        ["Short", "", ""],
      ],
    });
    expect([...structure.tableLines]).toEqual([0, 1, 2, 3]);
  });

  it("numbers referenced definitions by first use and joins immediate continuations", () => {
    const structure = projectPublicationStructure(
      [
        "Second[^later], first[^first], and first again[^first].",
        "",
        "[^first]: First *note*.",
        "  Continued here.",
        "[^later]: Later definition.",
        "[^unused]: Not printed.",
      ].join("\n"),
    );

    expect(structure.footnotes).toEqual([
      { id: "later", number: 1, content: "Later definition.", startLine: 4, endLine: 4 },
      { id: "first", number: 2, content: "First *note*. Continued here.", startLine: 2, endLine: 3 },
    ]);
    expect([...structure.footnoteDefinitionLines]).toEqual([2, 3, 4, 5]);
    expect(
      replacePublicationFootnoteReferences("Known[^first], unknown[^missing], escaped \\[^first].", structure.footnotesById, (note) =>
        String(note.number),
      ),
    ).toBe("Known2, unknown[^missing], escaped \\[^first].");
    expect(publicationFootnoteReferences("Again[^first], then[^later], again[^first].", structure.footnotesById)).toEqual([
      structure.footnotes[1],
      structure.footnotes[0],
    ]);
  });

  it("keeps structures inside fences literal and rejects malformed table delimiters", () => {
    const structure = projectPublicationStructure(
      [
        "```md",
        "| Hidden | Table |",
        "| --- | --- |",
        "[^hidden]: Hidden note",
        "```",
        "Bad | table",
        "-- | ---",
        "Visible[^missing]",
      ].join("\n"),
    );

    expect(structure.tablesByStartLine.size).toBe(0);
    expect(structure.footnotes).toEqual([]);
    expect(structure.footnoteDefinitionLines.size).toBe(0);
  });

  it("parses tables without outer pipes and stops at invalid, wide, footnote, or fenced rows", () => {
    const source = [
      "A | B",
      "--- | :---:",
      "one | two",
      "short",
      "",
      "| C | D |",
      "| --- | --- |",
      "| three | four | excess |",
      "",
      "| E | F |",
      "| --- | --- |",
      "[^note]: definition",
      "",
      "| G | H |",
      "| --- | --- |",
      "```",
      "| hidden | row |",
      "```",
    ].join("\n");
    const structure = projectPublicationStructure(source);

    expect([...structure.tablesByStartLine.entries()]).toEqual([
      [
        0,
        {
          startLine: 0,
          endLine: 2,
          header: ["A", "B"],
          alignments: ["left", "center"],
          rows: [["one", "two"]],
        },
      ],
      [
        5,
        {
          startLine: 5,
          endLine: 6,
          header: ["C", "D"],
          alignments: ["left", "left"],
          rows: [],
        },
      ],
      [
        9,
        {
          startLine: 9,
          endLine: 10,
          header: ["E", "F"],
          alignments: ["left", "left"],
          rows: [],
        },
      ],
      [
        13,
        {
          startLine: 13,
          endLine: 14,
          header: ["G", "H"],
          alignments: ["left", "left"],
          rows: [],
        },
      ],
    ]);
    expect([...structure.tableLines]).toEqual([0, 1, 2, 5, 6, 9, 10, 13, 14]);
  });

  it("distinguishes escaped and unescaped trailing pipes", () => {
    const structure = projectPublicationStructure(
      ["| Value | Note |", "| --- | --- |", String.raw`| one \| two | three \\\|`, String.raw`| four | five \\|`].join("\n"),
    );

    expect(structure.tablesByStartLine.get(0)?.rows).toEqual([
      ["one | two", "three \\\\|"],
      ["four", "five \\\\"],
    ]);
  });

  it.each([
    ["no pipe", ["Header", "---"]],
    ["different widths", ["A | B", "---"]],
    ["short delimiter", ["A | B", "-- | ---"]],
    ["invalid delimiter text", ["A | B", "--- | value"]],
    ["too many colons", ["A | B", "::--- | ---"]],
  ])("rejects a malformed table: %s", (_reason, lines) => {
    const structure = projectPublicationStructure(lines.join("\n"));

    expect(structure.tablesByStartLine.size).toBe(0);
    expect(structure.tableLines.size).toBe(0);
  });

  it("keeps the first duplicate footnote definition and accepts tab continuations", () => {
    const source = `Use[^a] and [^b].

[^a]: First
\tcontinued
[^a]: Duplicate
[^b]:
  second continuation`;
    const structure = projectPublicationStructure(source);

    expect(structure.footnotes).toEqual([
      { id: "a", number: 1, content: "First continued", startLine: 2, endLine: 3 },
      { id: "b", number: 2, content: "second continuation", startLine: 5, endLine: 6 },
    ]);
    expect([...structure.footnoteDefinitionLines]).toEqual([2, 3, 5, 6]);
  });

  it("ignores invalid, escaped, undefined, and definition-local footnote references", () => {
    const longId = "x".repeat(101);
    const source = `Known[^ok], escaped \\[^ok], missing[^missing], invalid[^two words], long[^${longId}].

[^ok]: Definition mentions [^other].
[^other]: Other`;
    const structure = projectPublicationStructure(source);

    expect(structure.footnotes).toEqual([{ id: "ok", number: 1, content: "Definition mentions [^other].", startLine: 2, endLine: 2 }]);
    expect(publicationFootnoteReferences(source, structure.footnotesById)).toEqual([structure.footnotes[0]]);
    expect(replacePublicationFootnoteReferences(source, structure.footnotesById, ({ id, number }) => `<${id}:${number}>`)).toContain(
      "Known<ok:1>, escaped \\[^ok], missing[^missing]",
    );
  });

  it("masks indented and unclosed backtick fences through the final line", () => {
    const source = `Visible[^visible].

[^visible]: Visible

   \`\`\`md
| Hidden | Table |
| --- | --- |
[^hidden]: Hidden`;
    const structure = projectPublicationStructure(source);

    expect(structure.footnotes).toEqual([{ id: "visible", number: 1, content: "Visible", startLine: 2, endLine: 2 }]);
    expect(structure.tablesByStartLine.size).toBe(0);
    expect(structure.footnoteDefinitionLines).toEqual(new Set([2]));
  });

  it("leaves references unchanged when the lookup map is empty", () => {
    expect(replacePublicationFootnoteReferences("A[^one] B", new Map(), () => "unused")).toBe("A[^one] B");
    expect(publicationFootnoteReferences("A[^one] B", new Map())).toEqual([]);
  });
});
