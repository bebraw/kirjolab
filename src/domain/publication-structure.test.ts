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
});
