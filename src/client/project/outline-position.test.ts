import { describe, expect, it } from "vitest";
import { outlineSourceRange, outlineOffset } from "./outline-position";

const sourceMap = [
  { fileId: "main", path: "main.md", includeChain: [], sourceStart: 0, sourceEnd: 8, outputStart: 0, outputEnd: 8 },
  { fileId: "chapter", path: "chapter.md", includeChain: [], sourceStart: 0, sourceEnd: 20, outputStart: 8, outputEnd: 28 },
  { fileId: "chapter", path: "chapter.md", includeChain: [], sourceStart: 0, sourceEnd: 20, outputStart: 28, outputEnd: 48 },
];

describe("outline source positions", () => {
  it("navigates the precise authored passage rather than the entire composition span", () => {
    expect(outlineSourceRange(sourceMap, "main", 11, 17)).toEqual({ fileId: "chapter", from: 3, to: 9 });
    expect(outlineSourceRange(sourceMap, "main", 8, 8)).toEqual({ fileId: "chapter", from: 0, to: 0 });
  });

  it("rejects mixed files and repeated include boundaries instead of selecting unrelated source", () => {
    expect(outlineSourceRange(sourceMap, "main", 5, 12)).toBeNull();
    expect(outlineSourceRange(sourceMap, "main", 25, 32)).toBeNull();
    expect(outlineSourceRange(sourceMap, "main", 50, 55)).toBeNull();
  });

  it("uses direct source only when there is no composition map", () => {
    expect(outlineSourceRange([], "main", 2, 9)).toEqual({ fileId: "main", from: 2, to: 9 });
    expect(outlineSourceRange([], "main", -1, 9)).toBeNull();
    expect(outlineSourceRange([], "main", 9, 2)).toBeNull();
  });

  it("retains the nearest repeated occurrence and keeps unrelated files unselected", () => {
    expect(outlineOffset(sourceMap, "chapter", 4, 35)).toBe(32);
    expect(outlineOffset(sourceMap, "chapter", 4, null)).toBe(12);
    expect(outlineOffset(sourceMap, "notes", 4, 35)).toBeNull();
    expect(outlineOffset([], "main", 4, null)).toBe(4);
  });
});
