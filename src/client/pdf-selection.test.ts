import { describe, expect, it } from "vitest";
import { adjustSelectionRects, deriveTextQuoteContext, normalizeSelectionRects } from "./pdf-selection";

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
      { x: 0, y: 0, width: 0.125, height: 0.075 },
      { x: 0.05, y: 0.05, width: 0.5, height: 0.1 },
    ]);
    expect(normalizeSelectionRects([], { left: 0, top: 0, right: 0, bottom: 10 })).toEqual([]);
    expect(normalizeSelectionRects([], { left: 0, top: 0, right: 10, bottom: 0 })).toEqual([]);
    expect(
      normalizeSelectionRects(
        [
          { left: 4, top: 1, right: 4, bottom: 3 },
          { left: 1, top: 4, right: 3, bottom: 4 },
        ],
        { left: 0, top: 0, right: 10, bottom: 10 },
      ),
    ).toEqual([]);
  });

  it("derives resilient quote context from normalized page text", () => {
    expect(deriveTextQuoteContext("Before   inspectable\nevidence after", "inspectable\nevidence", 8)).toEqual({
      quote: "inspectable evidence",
      prefix: "Before ",
      suffix: " after",
    });
    expect(deriveTextQuoteContext("Other text", "missing")).toEqual({ quote: "missing", prefix: "", suffix: "" });
    expect(deriveTextQuoteContext("Other text", "  ")).toEqual({ quote: "", prefix: "", suffix: "" });
    expect(deriveTextQuoteContext("Starts with evidence and continues", "Starts with evidence", 5)).toEqual({
      quote: "Starts with evidence",
      prefix: "",
      suffix: " and ",
    });
  });

  it("coalesces fragmented DOM geometry into continuous visual lines", () => {
    expect(
      normalizeSelectionRects(
        [
          { left: 110, top: 210, right: 150, bottom: 230 },
          { left: 151, top: 209, right: 205, bottom: 231 },
          { left: 110, top: 210, right: 205, bottom: 230 },
          { left: 110, top: 240, right: 180, bottom: 260 },
          { left: 300, top: 240, right: 360, bottom: 260 },
        ],
        { left: 100, top: 200, right: 500, bottom: 600 },
      ),
    ).toEqual([
      { x: 0.025, y: 0.0225, width: 0.2375, height: 0.055 },
      { x: 0.025, y: 0.1, width: 0.175, height: 0.05 },
      { x: 0.5, y: 0.1, width: 0.15, height: 0.05 },
    ]);
  });

  it("retains long private selections after reducing them to line rectangles", () => {
    const lines = Array.from({ length: 70 }, (_, index) => ({
      left: 10,
      top: 10 + index * 10,
      right: 90,
      bottom: 15 + index * 10,
    }));
    const page = { left: 0, top: 0, right: 100, bottom: 800 };
    expect(normalizeSelectionRects(lines, page)).toHaveLength(64);
    expect(normalizeSelectionRects(lines, page, 512)).toHaveLength(70);
  });

  it("sorts independent rectangles and merges exact line boundaries", () => {
    expect(
      normalizeSelectionRects(
        [
          { left: 50, top: 40, right: 60, bottom: 50 },
          { left: 60, top: 10, right: 70, bottom: 20 },
          { left: 10, top: 10, right: 20, bottom: 20 },
        ],
        { left: 0, top: 0, right: 100, bottom: 100 },
      ),
    ).toEqual([
      { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
      { x: 0.6, y: 0.1, width: 0.1, height: 0.1 },
      { x: 0.5, y: 0.4, width: 0.1, height: 0.1 },
    ]);

    expect(
      normalizeSelectionRects(
        [
          { left: 0, top: 0, right: 10, bottom: 10 },
          { left: 25, top: 5, right: 35, bottom: 25 },
        ],
        { left: 0, top: 0, right: 100, bottom: 100 },
      ),
    ).toEqual([{ x: 0, y: 0, width: 0.35, height: 0.25 }]);
  });

  it("nudges and resizes imprecise touch geometry within page bounds", () => {
    const rect = [{ x: 0, y: 0.98, width: 0.2, height: 0.02 }];
    expect(adjustSelectionRects(rect, "left")).toEqual(rect);
    expect(adjustSelectionRects(rect, "right")).toEqual([{ ...rect[0]!, x: 0.005 }]);
    expect(adjustSelectionRects([{ x: 0.79, y: 0, width: 0.2, height: 0.1 }], "right", 0.05)).toEqual([
      { x: 0.8, y: 0, width: 0.2, height: 0.1 },
    ]);
    expect(adjustSelectionRects(rect, "down")).toEqual(rect);
    expect(adjustSelectionRects(rect, "up")).toEqual([{ ...rect[0]!, y: 0.975 }]);
    expect(adjustSelectionRects(rect, "wider")).toEqual([{ ...rect[0]!, width: 0.205 }]);
    expect(adjustSelectionRects([{ x: 0.9, y: 0, width: 0.1, height: 0.1 }], "wider")).toEqual([{ x: 0.9, y: 0, width: 0.1, height: 0.1 }]);
    expect(adjustSelectionRects([{ x: 0, y: 0, width: 0.2, height: 0.1 }], "narrower")).toEqual([
      { x: 0, y: 0, width: 0.195, height: 0.1 },
    ]);
    expect(adjustSelectionRects([{ x: 0, y: 0, width: 0.005, height: 0.005 }], "narrower")).toEqual([
      { x: 0, y: 0, width: 0.005, height: 0.005 },
    ]);
    expect(adjustSelectionRects(rect, "taller")).toEqual([{ ...rect[0]!, height: 0.02 }]);
    expect(adjustSelectionRects(rect, "shorter", 1)).toEqual([{ ...rect[0]!, height: 0.005 }]);
  });
});
