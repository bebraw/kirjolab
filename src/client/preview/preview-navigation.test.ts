import { describe, expect, it } from "vitest";
import { previewNavigationPresentation, previewNavigationStorageKey, storedPreviewNavigationHidden } from "./preview-navigation";

describe("preview navigation visibility", () => {
  it("restores only an explicitly hidden navigation bar", () => {
    expect(storedPreviewNavigationHidden("true")).toBe(true);
    expect(storedPreviewNavigationHidden("false")).toBe(false);
    expect(storedPreviewNavigationHidden(null)).toBe(false);
  });

  it("describes the action that the toggle will perform", () => {
    expect(previewNavigationPresentation(false)).toEqual({
      label: "Hide nav",
      title: "Hide top navigation",
    });
    expect(previewNavigationPresentation(true)).toEqual({
      label: "Show nav",
      title: "Show top navigation",
    });
  });

  it("uses a stable browser preference key", () => {
    expect(previewNavigationStorageKey).toBe("kirjolab:preview-navigation-hidden");
  });
});
