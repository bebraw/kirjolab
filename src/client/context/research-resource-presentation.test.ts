import { describe, expect, it } from "vitest";
import type { ManuscriptAnchorResolution } from "../../domain/workspace/workspace";
import { accessibleEvidenceExcerpt, anchorActionLabel, anchorMatchState, modelEvidenceKey } from "./research-resource-presentation";

describe("research resource presentation", () => {
  it("labels anchor resolution states", () => {
    const exact: ManuscriptAnchorResolution = { end: 4, exactMatch: true, start: 0, status: "resolved", text: "text" };
    const changed: ManuscriptAnchorResolution = { end: 4, exactMatch: false, start: 0, status: "resolved", text: "edit" };
    const stale: ManuscriptAnchorResolution = { status: "stale" };
    expect([exact, changed, stale].map(anchorActionLabel)).toEqual([
      "Open linked passage",
      "Open changed passage",
      "Linked passage is stale",
    ]);
    expect([exact, changed, stale].map(anchorMatchState)).toEqual(["exact", "changed", "unavailable"]);
  });

  it("builds evidence keys and bounded accessible excerpts", () => {
    expect(modelEvidenceKey("claim", "1")).toBe("claim:1");
    expect(accessibleEvidenceExcerpt("  short   claim  ")).toBe("short claim");
    expect(accessibleEvidenceExcerpt("x".repeat(90))).toBe(`${"x".repeat(77)}…`);
  });
});
