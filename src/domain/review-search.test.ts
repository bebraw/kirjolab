import { describe, expect, it } from "vitest";
import {
  findReviewDuplicateMatches,
  parseReviewImportPreview,
  parseReviewSearchSnapshot,
  previewReviewBibTeX,
  reviewRecordIdentity,
} from "./review-search";

describe("review search imports", () => {
  it("previews bounded BibTeX with stable metadata and warnings", async () => {
    const source = `@article{one, title={A Study}, author={Doe, Jane and Roe, John}, year={2025}, doi={https://doi.org/10.1/ABC}, abstract={Evidence}}
@misc{two, title={Practice Report}}
@article{broken title={No key}}`;
    const preview = await previewReviewBibTeX(source);
    expect(preview).toMatchObject({ detectedEntries: 3, skippedEntries: 1 });
    expect(preview.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(preview.records[0]).toMatchObject({ citationKey: "one", doi: "10.1/abc", identity: "doi:10.1/abc", warnings: [] });
    expect(preview.records[1]?.warnings).toEqual(["Missing authors", "Missing year"]);
  });

  it("detects exact and probable duplicates without merging them", () => {
    const records = [
      { id: "a", title: "A Study", authors: ["Doe, Jane"], year: "2025", doi: "10.1/a" },
      { id: "b", title: "A study!", authors: ["Doe, Jane"], year: "2025", doi: "https://doi.org/10.1/A" },
      { id: "c", title: "A Study", authors: ["Other"], year: "2025", doi: "" },
    ];
    expect(findReviewDuplicateMatches(records)).toEqual([
      { leftId: "a", rightId: "b", signals: ["doi", "title-author-year"], confidence: "exact" },
      { leftId: "a", rightId: "c", signals: ["title-year"], confidence: "probable" },
      { leftId: "b", rightId: "c", signals: ["title-year"], confidence: "probable" },
    ]);
  });

  it("falls back to normalized title, year, and first author identity", async () => {
    expect(reviewRecordIdentity({ doi: "", title: "  Café-based Study ", year: "2024", authors: ["Doe, Jane"] })).toBe(
      "work:cafe based study|2024|doe jane",
    );
    await expect(previewReviewBibTeX("not bibtex")).rejects.toThrow("no valid");
  });

  it("rejects malformed browser-bound payloads", async () => {
    const preview = await previewReviewBibTeX("@misc{one, title={One}} ");
    expect(parseReviewImportPreview(preview)).toEqual(preview);
    expect(() => parseReviewSearchSnapshot({ revision: 1 })).toThrow("snapshot");
  });
});
