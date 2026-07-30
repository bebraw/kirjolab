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

  it("enforces size and non-empty cell boundaries", () => {
    expect(() => parseTableRequirements("", "Only one", "value")).toThrow("between 2 and 8");
    expect(() => parseTableRequirements("", Array.from({ length: 9 }, (_, index) => `C${index}`).join("\n"), "x")).toThrow(
      "between 2 and 8",
    );
    expect(() => parseTableRequirements("", "A\nB", "")).toThrow("between 1 and 100");
    expect(() => parseTableRequirements("", "A\nB", Array.from({ length: 101 }, () => "a | b").join("\n"))).toThrow("between 1 and 100");
    expect(() => parseTableRequirements("", "A\nB", "a | ")).toThrow("non-empty cells");
  });

  it("renders portable GFM without allowing cell pipes to alter shape", () => {
    expect(tableMarkdown({ caption: "Comparison", columns: ["Name", "Value"], rows: [["A | B", "1"]] })).toBe(
      "**Comparison**\n\n| Name | Value |\n| --- | --- |\n| A \\| B | 1 |",
    );
  });

  it("omits an empty caption and escapes caption emphasis", () => {
    expect(tableMarkdown({ caption: "", columns: ["A", "B"], rows: [["x", "y"]] })).toBe("| A | B |\n| --- | --- |\n| x | y |");
    expect(tableMarkdown({ caption: "A * result", columns: ["A", "B"], rows: [["x", "y"]] })).toContain("**A \\* result**");
  });
});
