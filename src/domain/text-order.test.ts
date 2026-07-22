import { describe, expect, it } from "vitest";
import { compareText } from "./text-order";

describe("compareText", () => {
  it("orders text without locale-dependent collation", () => {
    expect(compareText("A", "a")).toBe(-1);
    expect(compareText("a", "A")).toBe(1);
    expect(compareText("same", "same")).toBe(0);
    expect(["ä", "z", "A", "a"].sort(compareText)).toEqual(["A", "a", "z", "ä"]);
  });
});
