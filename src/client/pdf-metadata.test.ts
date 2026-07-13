import { describe, expect, it } from "vitest";
import { derivePdfMetadataCandidates } from "./pdf-metadata";

describe("PDF metadata candidates", () => {
  it("derives bounded embedded fields and an opening-page DOI", () => {
    expect(
      derivePdfMetadataCandidates(
        { Title: "Inspectable Evidence", Author: "Doe, Jane; Roe, Alex", CreationDate: "D:20250711120000" },
        "Published as https://doi.org/10.5555/Example.Item.",
        8,
      ),
    ).toEqual({
      title: "Inspectable Evidence",
      authors: ["Doe, Jane", "Roe, Alex"],
      year: "2025",
      doi: "10.5555/example.item",
      pagesScanned: 3,
      diagnostics: [],
    });
  });

  it("reports sparse files without fabricating metadata", () => {
    expect(derivePdfMetadataCandidates(null, "ordinary page text", -1)).toEqual({
      title: "",
      authors: [],
      year: "",
      doi: "",
      pagesScanned: 0,
      diagnostics: ["No useful metadata was found in the PDF.", "No DOI was detected in the embedded metadata or opening pages."],
    });
  });

  it("bounds strings, author counts, and trailing DOI punctuation", () => {
    const result = derivePdfMetadataCandidates(
      {
        Title: "x".repeat(2_100),
        Author: Array.from({ length: 70 }, (_, index) => `Author ${index}`).join(" and "),
        ModDate: "updated 1999",
        Subject: "doi:10.1000/test);",
      },
      "",
      2,
    );
    expect(result.title).toHaveLength(2_000);
    expect(result.authors).toHaveLength(64);
    expect(result.year).toBe("1999");
    expect(result.doi).toBe("10.1000/test");
  });
});
