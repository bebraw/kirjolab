import { describe, expect, it } from "vitest";
import { analyzePdfReferencePages, analyzePdfReferenceTextItemPages } from "./pdf-reference-analysis";

function textItem(str: string, x: number, y: number, hasEOL: boolean): object {
  return { str, transform: [1, 0, 0, 10, x, y], hasEOL };
}

describe("PDF reference analysis", () => {
  it("extracts, parses, and deduplicates numbered bibliography entries", () => {
    const result = analyzePdfReferencePages(
      [
        { page: 1, lines: ["A paper body", "References", "[1] Doe, Jane. (2024). Inspectable evidence."] },
        {
          page: 2,
          lines: [
            "[2] Roe, Alex and Smith, Sam. 2023. Graphs for research. Journal of Useful Systems.",
            "https://doi.org/10.5555/Graph.2",
            "[3] Duplicate record. 2023. https://doi.org/10.5555/graph.2",
          ],
        },
      ],
      2,
    );

    expect(result).toMatchObject({ pagesScanned: 2, pagesTotal: 2, referencesStartPage: 1, truncated: false });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({
      authors: ["Doe, Jane"],
      page: 1,
      title: "Inspectable evidence",
      year: "2024",
    });
    expect(result.candidates[1]).toMatchObject({
      authors: ["Roe, Alex", "Smith, Sam"],
      doi: "10.5555/graph.2",
      page: 2,
      title: "Graphs for research",
      year: "2023",
    });
  });

  it("supports unnumbered references and stops at the next major section", () => {
    const result = analyzePdfReferencePages(
      [
        {
          page: 7,
          lines: [
            "Bibliography",
            "Alpha, Ada. 2020. First source. Example Press.",
            "Beta, Bea. (2021). Second source.",
            "https://example.org/second",
            "Appendix",
            "Gamma, Gia. 2022. Not a cited source.",
          ],
        },
      ],
      7,
    );

    expect(result.referencesStartPage).toBe(7);
    expect(result.candidates.map(({ title }) => title)).toEqual(["First source", "Second source"]);
    expect(result.candidates[1]?.url).toBe("https://example.org/second");
  });

  it("links conservative numeric and author-year mentions to bibliography entries", () => {
    const result = analyzePdfReferencePages(
      [
        {
          page: 1,
          lines: ["Prior work [1, 2] supports this method.", "A related result follows Doe, 2024."],
        },
        {
          page: 2,
          lines: ["References", "[1] Doe, Jane. 2024. Inspectable evidence.", "[2] Roe, Alex. 2023. Reproducible pipelines."],
        },
      ],
      2,
    );

    expect(result.mentions).toEqual([
      expect.objectContaining({ candidateId: result.candidates[0]?.id, page: 1, raw: "[1, 2]", style: "numeric" }),
      expect.objectContaining({ candidateId: result.candidates[1]?.id, page: 1, raw: "[1, 2]", style: "numeric" }),
      expect.objectContaining({ candidateId: result.candidates[0]?.id, page: 1, raw: "Doe, 2024", style: "author-year" }),
    ]);
  });

  it("returns a bounded empty result when no bibliography heading is present", () => {
    expect(analyzePdfReferencePages([{ page: 1, lines: ["Introduction", "No reference section here."] }], 3)).toEqual({
      candidates: [],
      pagesScanned: 1,
      pagesTotal: 3,
      referencesStartPage: null,
      truncated: true,
    });
  });

  it("prefers PDF content order when line numbers and two columns share visual rows", () => {
    const result = analyzePdfReferenceTextItemPages(
      [
        {
          page: 10,
          items: [
            textItem("1050", 28, 640, true),
            textItem("1051", 28, 630, true),
            textItem("1108", 578, 640, true),
            textItem("1109", 578, 630, true),
            textItem("References", 54, 640, false),
            textItem("", 54, 630, true),
            textItem("[1]", 57, 620, false),
            textItem("Alpha, Ada. 2020. First source.", 75, 620, true),
            textItem("[2]", 57, 600, false),
            textItem("Beta, Bea.", 75, 600, true),
            textItem("2021. Second source.", 75, 590, true),
            textItem("[3]", 318, 640, false),
            textItem("Gamma, Gia. 2022. Third source.", 336, 640, true),
            textItem("[4]", 318, 620, false),
            textItem("Delta, Dia. 2023. Fourth source.", 336, 620, true),
          ],
        },
        {
          page: 11,
          items: [
            textItem("1161", 28, 700, true),
            textItem("A running conference header", 54, 740, true),
            textItem("[5]", 57, 690, false),
            textItem("Epsilon, Eva. 2024. Fifth source.", 75, 690, true),
          ],
        },
      ],
      11,
    );

    expect(result.referencesStartPage).toBe(10);
    expect(result.candidates.map(({ title }) => title)).toEqual([
      "First source",
      "Second source",
      "Third source",
      "Fourth source",
      "Fifth source",
    ]);
    expect(result.candidates[3]?.raw).not.toContain("conference header");
  });

  it("falls back to positional rows when PDF content order has no line endings", () => {
    const result = analyzePdfReferenceTextItemPages(
      [
        {
          page: 4,
          items: [
            textItem("Beta, Bea. 2021. Second source.", 75, 60, false),
            textItem("[2]", 57, 60, false),
            textItem("References", 54, 100, false),
            textItem("Alpha, Ada. 2020. First source.", 75, 80, false),
            textItem("[1]", 57, 80, false),
          ],
        },
      ],
      4,
    );

    expect(result.referencesStartPage).toBe(4);
    expect(result.candidates.map(({ title }) => title)).toEqual(["First source", "Second source"]);
  });
});
