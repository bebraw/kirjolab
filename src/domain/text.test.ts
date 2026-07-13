import { describe, expect, it } from "vitest";
import { calculateTextSplice } from "./text";

describe("calculateTextSplice", () => {
  it("finds insertions, replacements, and no-op edits", () => {
    expect(calculateTextSplice("abc", "abXc")).toEqual({ start: 2, deleteCount: 0, insert: "X" });
    expect(calculateTextSplice("abc", "axc")).toEqual({ start: 1, deleteCount: 1, insert: "x" });
    expect(calculateTextSplice("same", "same")).toBeNull();
    expect(calculateTextSplice("", "a")).toEqual({ start: 0, deleteCount: 0, insert: "a" });
    expect(calculateTextSplice("a", "")).toEqual({ start: 0, deleteCount: 1, insert: "" });
    expect(calculateTextSplice("abc", "ab")).toEqual({ start: 2, deleteCount: 1, insert: "" });
    expect(calculateTextSplice("ab", "abc")).toEqual({ start: 2, deleteCount: 0, insert: "c" });
    expect(calculateTextSplice("xabc", "yabc")).toEqual({ start: 0, deleteCount: 1, insert: "y" });
    expect(calculateTextSplice("😀A", "😁A")).toEqual({ start: 0, deleteCount: 2, insert: "😁" });
    expect(calculateTextSplice("A😀", "A😁")).toEqual({ start: 1, deleteCount: 2, insert: "😁" });
    for (const [previous, next] of [
      ["😀A", "😁A"],
      ["A😀", "A😁"],
      ["A🧪Z", "A📚Z"],
    ] as const) {
      const splice = calculateTextSplice(previous, next);
      expect(splice).not.toBeNull();
      if (splice) {
        expect(previous.slice(0, splice.start) + splice.insert + previous.slice(splice.start + splice.deleteCount)).toBe(next);
      }
    }
  });

  it("keeps complete Unicode code points at prefix and suffix boundaries", () => {
    for (const codePoint of [0x1_0000, 0x1_03ff, 0x10_fc00, 0x10_ffff]) {
      const character = String.fromCodePoint(codePoint);
      expect(calculateTextSplice(`${character}old`, `${character}new`)).toEqual({
        start: 2,
        deleteCount: 3,
        insert: "new",
      });
      expect(calculateTextSplice(`old${character}`, `new${character}`)).toEqual({
        start: 0,
        deleteCount: 3,
        insert: "new",
      });
    }
  });

  it("treats unpaired surrogate code units as individual text", () => {
    for (const codeUnit of [0xd7_ff, 0xd8_00, 0xdb_ff, 0xdc_00, 0xdf_ff, 0xe0_00]) {
      const character = String.fromCharCode(codeUnit);
      expect(calculateTextSplice(`${character}a`, `${character}b`)).toEqual({ start: 1, deleteCount: 1, insert: "b" });
      expect(calculateTextSplice(`a${character}`, `b${character}`)).toEqual({ start: 0, deleteCount: 1, insert: "b" });
    }
  });

  it("returns the smallest splice across empty prefix and suffix edges", () => {
    const cases = [
      ["a", "ba", { start: 0, deleteCount: 0, insert: "b" }],
      ["ba", "a", { start: 0, deleteCount: 1, insert: "" }],
      ["a", "ab", { start: 1, deleteCount: 0, insert: "b" }],
      ["ab", "a", { start: 1, deleteCount: 1, insert: "" }],
      ["aba", "aca", { start: 1, deleteCount: 1, insert: "c" }],
      ["aaaa", "aa", { start: 2, deleteCount: 2, insert: "" }],
      ["aa", "aaaa", { start: 2, deleteCount: 0, insert: "aa" }],
    ] as const;
    for (const [previous, next, expected] of cases) expect(calculateTextSplice(previous, next)).toEqual(expected);
  });
});
