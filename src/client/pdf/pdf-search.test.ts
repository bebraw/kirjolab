import { describe, expect, it } from "vitest";
import { searchPdfPageTexts } from "./pdf-viewer";

describe("PDF text search", () => {
  it("returns bounded page contexts and occurrence counts", () => {
    const results = searchPdfPageTexts(
      [
        { page: 1, text: "Alpha introduces a method. The alpha method is useful for evidence." },
        { page: 2, text: "No matching content." },
      ],
      "alpha",
    );

    expect(results).toEqual([
      {
        page: 1,
        excerpt: "Alpha introduces a method. The alpha method is useful for evidence.",
        occurrences: 2,
      },
    ]);
  });

  it("matches phrases case-insensitively", () => {
    expect(searchPdfPageTexts([{ page: 4, text: "A Semantic Reference Trail links evidence." }], "reference trail")).toEqual([
      { page: 4, excerpt: "A Semantic Reference Trail links evidence.", occurrences: 1 },
    ]);
  });
});
