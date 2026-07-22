import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalValue } from "./canonical-json";

describe("canonical JSON", () => {
  it("orders nested object keys by code point and omits undefined fields", () => {
    const value = {
      z: 1,
      A: { undefined: undefined, b: 2, a: 1 },
      a: [3, { y: false, x: null }, undefined],
    };
    expect(canonicalJson(value)).toBe('{"A":{"a":1,"b":2},"a":[3,{"x":null,"y":false},null],"z":1}');
    expect(canonicalValue(value)).toEqual({ A: { a: 1, b: 2 }, a: [3, { x: null, y: false }, undefined], z: 1 });
    expect(canonicalValue({ kept: 1, omitted: undefined })).toStrictEqual({ kept: 1 });
  });

  it("leaves scalar values unchanged", () => {
    for (const value of [null, false, true, 0, 42, "text"]) {
      expect(canonicalValue(value)).toBe(value);
      expect(canonicalJson(value)).toBe(JSON.stringify(value));
    }
  });
});
