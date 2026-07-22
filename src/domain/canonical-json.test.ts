import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalValue, compareText } from "./canonical-json";

describe("canonical JSON", () => {
  it("orders nested object keys by code point and omits undefined fields", () => {
    const value = {
      z: 1,
      A: { undefined: undefined, b: 2, a: 1 },
      a: [3, { y: false, x: null }, undefined],
    };
    expect(canonicalJson(value)).toBe('{"A":{"a":1,"b":2},"a":[3,{"x":null,"y":false},null],"z":1}');
    expect(canonicalValue(value)).toEqual({ A: { a: 1, b: 2 }, a: [3, { x: null, y: false }, undefined], z: 1 });
  });

  it("leaves scalar values unchanged", () => {
    for (const value of [null, false, true, 0, 42, "text"]) {
      expect(canonicalValue(value)).toBe(value);
      expect(canonicalJson(value)).toBe(JSON.stringify(value));
    }
  });

  it("compares text without locale-dependent collation", () => {
    expect(compareText("A", "a")).toBe(-1);
    expect(compareText("a", "A")).toBe(1);
    expect(compareText("same", "same")).toBe(0);
    expect(["ä", "z", "A", "a"].sort(compareText)).toEqual(["A", "a", "z", "ä"]);
  });
});
