import { describe, expect, it } from "vitest";
import { renderNativeFigure, type NativeBoxplotFigure } from "./native-figures";

describe("renderNativeFigure", () => {
  it("pads an equal domain and emits finite repeatable geometry", () => {
    const figure: NativeBoxplotFigure = {
      schemaVersion: 1,
      kind: "boxplot",
      caption: "Equal observations",
      marks: [{ label: "A", min: 5, q1: 5, median: 5, q3: 5, max: 5 }],
    };

    const first = renderNativeFigure(figure, 12);
    const second = renderNativeFigure(figure, 12);
    const serialized = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(serialized).not.toMatch(/(?:NaN|Infinity)/u);
    expect(serialized).toContain('"viewBox":"0 0 720 130"');
  });
});
