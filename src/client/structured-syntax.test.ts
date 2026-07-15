import { describe, expect, it } from "vitest";
import { parseTableRequirements, tableMarkdown } from "./structured-syntax";

describe("structured table syntax", () => {
  it("parses explicit columns and pipe-delimited rows", () => {
    expect(parseTableRequirements("Results", "Method\nScore", "Baseline | 0.6\nProposed | 0.8")).toEqual({
      caption: "Results",
      columns: ["Method", "Score"],
      rows: [
        ["Baseline", "0.6"],
        ["Proposed", "0.8"],
      ],
    });
  });

  it("rejects incomplete row shapes", () => {
    expect(() => parseTableRequirements("", "A\nB\nC", "one | two")).toThrow("3 non-empty cells");
  });

  it("renders portable GFM without allowing cell pipes to alter shape", () => {
    expect(tableMarkdown({ caption: "Comparison", columns: ["Name", "Value"], rows: [["A | B", "1"]] })).toBe(
      "**Comparison**\n\n| Name | Value |\n| --- | --- |\n| A \\| B | 1 |",
    );
  });
});
