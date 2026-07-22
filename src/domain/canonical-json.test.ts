import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json";

describe("canonical JSON", () => {
  it("serializes canonical nested values", () => {
    const value = {
      z: 1,
      A: { undefined: undefined, b: 2, a: 1 },
      a: [3, { y: false, x: null }, undefined],
    };
    expect(canonicalJson(value)).toBe('{"A":{"a":1,"b":2},"a":[3,{"x":null,"y":false},null],"z":1}');
  });

  it("leaves scalar values unchanged", () => {
    for (const value of [null, false, true, 0, 42, "text"]) {
      expect(canonicalJson(value)).toBe(JSON.stringify(value));
    }
  });
});
