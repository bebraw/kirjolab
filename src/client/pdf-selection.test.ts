import { describe, expect, it } from "vitest";
import { deriveTextQuoteContext, normalizeSelectionRects } from "./pdf-selection";

describe("PDF selection helpers", () => {
  it("normalizes viewport rectangles and clips them to the page", () => {
    expect(
      normalizeSelectionRects(
        [
          { left: 120, top: 220, right: 320, bottom: 260 },
          { left: 50, top: 190, right: 150, bottom: 230 },
          { left: 900, top: 900, right: 920, bottom: 920 },
        ],
        { left: 100, top: 200, right: 500, bottom: 600 },
      ),
    ).toEqual([
      { x: 0.05, y: 0.05, width: 0.5, height: 0.1 },
      { x: 0, y: 0, width: 0.125, height: 0.075 },
    ]);
    expect(normalizeSelectionRects([], { left: 0, top: 0, right: 0, bottom: 10 })).toEqual([]);
  });

  it("derives resilient quote context from normalized page text", () => {
    expect(deriveTextQuoteContext("Before   inspectable\nevidence after", "inspectable\nevidence", 8)).toEqual({
      quote: "inspectable evidence",
      prefix: "Before ",
      suffix: " after",
    });
    expect(deriveTextQuoteContext("Other text", "missing")).toEqual({ quote: "missing", prefix: "", suffix: "" });
    expect(deriveTextQuoteContext("Other text", "  ")).toEqual({ quote: "", prefix: "", suffix: "" });
  });
});
