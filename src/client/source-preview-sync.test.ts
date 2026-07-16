import { describe, expect, it } from "vitest";
import type { CompositionSourceSpan } from "../domain/project-files";
import { previewOffsetsForSourceLocation, sourceLocationForPreviewOffset } from "./source-preview-sync";

const sourceMap: readonly CompositionSourceSpan[] = [
  { outputStart: 0, outputEnd: 7, fileId: "main", path: "main.md", sourceStart: 0, sourceEnd: 7, includeChain: [] },
  { outputStart: 7, outputEnd: 12, fileId: "part", path: "part.md", sourceStart: 10, sourceEnd: 15, includeChain: ["main"] },
  { outputStart: 12, outputEnd: 17, fileId: "part", path: "part.md", sourceStart: 10, sourceEnd: 15, includeChain: ["main"] },
];

describe("source and preview synchronization", () => {
  it("maps a composed preview offset back to its exact source file offset", () => {
    expect(sourceLocationForPreviewOffset(sourceMap, 9)).toEqual({ fileId: "part", offset: 12 });
    expect(sourceLocationForPreviewOffset(sourceMap, 17)).toBeNull();
  });

  it("returns every composed occurrence of a repeated source location", () => {
    expect(previewOffsetsForSourceLocation(sourceMap, "part", 12)).toEqual([9, 14]);
    expect(previewOffsetsForSourceLocation(sourceMap, "missing", 12)).toEqual([]);
  });

  it("keeps an end-of-span source caret inside the rendered occurrence", () => {
    expect(previewOffsetsForSourceLocation(sourceMap, "part", 15)).toEqual([11, 16]);
  });
});
