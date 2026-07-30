import { describe, expect, it } from "vitest";
import { togglePdfBookmark } from "./pdf-navigation-panel";

describe("PDF bookmarks", () => {
  it("adds, sorts, and removes personal page bookmarks", () => {
    expect(togglePdfBookmark([7, 2], 4)).toEqual([2, 4, 7]);
    expect(togglePdfBookmark([2, 4, 7], 4)).toEqual([2, 7]);
  });
});
