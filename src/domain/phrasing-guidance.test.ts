import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import inventory from "../../phrasing-guidance/inventory.json";
import sources from "../../phrasing-guidance/sources.json";
import {
  isPhrasingPurposeId,
  phrasingGuidanceRelease,
  phrasingPatternsForPurpose,
  phrasingPurposes,
  validatePhrasingGuidanceArtifacts,
} from "./phrasing-guidance";

const attributionPath = "phrasing-guidance/ATTRIBUTION.md";

describe("phrasing guidance inventory", () => {
  it("exposes the reviewed release without source metadata", () => {
    expect(phrasingGuidanceRelease()).toEqual({
      inventoryVersion: "2026-07-17.1",
      extractionVersion: "plos-jats-patterns-v1",
      reviewedAt: "2026-07-17",
    });
    expect(phrasingPurposes().map(({ id }) => id)).toEqual([
      "qualify-claim",
      "contrast-findings",
      "introduce-evidence",
      "state-limitation",
    ]);
    expect(phrasingPatternsForPurpose("qualify-claim")).toEqual([
      { id: "qualify-suggests", purposeId: "qualify-claim", template: "These findings suggest that {claim}." },
    ]);
    expect(JSON.stringify(phrasingPatternsForPurpose("qualify-claim"))).not.toContain("10.1371");
  });

  it("bounds pattern selection and purpose parsing", () => {
    expect(phrasingPatternsForPurpose("qualify-claim", 0)).toEqual([]);
    expect(phrasingPatternsForPurpose("qualify-claim", 999)).toHaveLength(1);
    expect(isPhrasingPurposeId("state-limitation")).toBe(true);
    expect(isPhrasingPurposeId("make-grand-claim")).toBe(false);
  });

  it("validates licences, provenance, recurrence, similarity review, and attribution", async () => {
    const attribution = await readFile(attributionPath, "utf8");
    expect(() => validatePhrasingGuidanceArtifacts(inventory, sources, attribution)).not.toThrow();
  });

  it("fails closed on a disallowed licence", async () => {
    const changed = structuredClone(sources);
    changed.sources[0]!.license = "CC-BY-NC-4.0";
    const attribution = await readFile(attributionPath, "utf8");
    expect(() => validatePhrasingGuidanceArtifacts(inventory, changed, attribution)).toThrow("disallowed licence");
  });

  it("rejects stale similarity review and non-reciprocal provenance", async () => {
    const stale = structuredClone(inventory);
    stale.patterns[0]!.review.extractionVersion = "older-extraction";
    const unlinked = structuredClone(sources);
    unlinked.sources[0]!.patternIds = ["limitation-interpreted-light"];
    const attribution = await readFile(attributionPath, "utf8");
    expect(() => validatePhrasingGuidanceArtifacts(stale, sources, attribution)).toThrow("similarity review is stale");
    expect(() => validatePhrasingGuidanceArtifacts(inventory, unlinked, attribution)).toThrow("does not reciprocate");
  });
});
