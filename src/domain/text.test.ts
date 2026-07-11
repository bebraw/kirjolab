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
});
