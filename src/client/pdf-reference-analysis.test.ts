import { describe, expect, it } from "vitest";
import { analyzePdfReferencePages } from "./pdf-reference-analysis";

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

  it("returns a bounded empty result when no bibliography heading is present", () => {
    expect(analyzePdfReferencePages([{ page: 1, lines: ["Introduction", "No reference section here."] }], 3)).toEqual({
      candidates: [],
      pagesScanned: 1,
      pagesTotal: 3,
      referencesStartPage: null,
      truncated: true,
    });
  });
});
