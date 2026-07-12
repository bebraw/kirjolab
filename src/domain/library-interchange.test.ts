import { describe, expect, it } from "vitest";
import { cslJsonToBibTeX, parseCslJson, parsePortableResearch, portableResearch, referenceToCslJson } from "./library-interchange";
import { referenceFromBibTeX } from "./reference-library";

describe("library interchange", () => {
  it("round-trips canonical fields through Zotero-compatible CSL JSON", () => {
    const reference = referenceFromBibTeX(
      {
        type: "article",
        citationKey: "doe2026",
        fields: {
          title: "Methods",
          author: "Doe, Jane",
          year: "2026",
          journal: "Journal",
          doi: "10/example",
          url: "https://example.test",
          abstract: "Abstract",
        },
      },
      "reference-id",
      { method: "manual", capturedAt: "now", actor: "owner" },
    );
    const item = referenceToCslJson(reference);
    expect(item).toMatchObject({ id: "reference-id", type: "article-journal", author: [{ family: "Doe", given: "Jane" }] });
    expect(cslJsonToBibTeX(parseCslJson([item]))).toContain("@article{reference-id,");
  });

  it("validates portable research metadata without conflating tags and collections", () => {
    const snapshot = {
      references: [],
      artifacts: [],
      webSources: [],
      webSnapshots: [],
      highlights: [],
      tags: { ref: ["method"] },
      collections: { ref: ["chapter"] },
      notes: [],
      reading: [],
    };
    const research = portableResearch(snapshot);
    expect(parsePortableResearch(research)).toEqual(research);
    for (const invalid of [
      null,
      {},
      { ...research, version: "future" },
      { ...research, tags: [] },
      { ...research, collections: { ref: [1] } },
    ]) {
      expect(() => parsePortableResearch(invalid)).toThrow();
    }
  });
});
