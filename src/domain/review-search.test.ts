import { describe, expect, it } from "vitest";
import {
  findReviewDuplicateMatches,
  parseReviewImportPreview,
  parseReviewSearchSnapshot,
  previewReviewBibTeX,
  reviewBibTeXImport,
  reviewDuplicateKeys,
  reviewRecordIdentity,
} from "./review-search";

describe("review search imports", () => {
  it("previews bounded BibTeX with stable metadata and warnings", async () => {
    const source = `@article{one, title={A Study}, author={Doe, Jane and Roe, John}, year={2025}, doi={https://doi.org/10.1/ABC}, abstract={Evidence}}
@misc{two, title={Practice Report}}
@article{broken title={No key}}`;
    const preview = await previewReviewBibTeX(source);
    expect(preview).toMatchObject({
      ...reviewBibTeXImport,
      byteCount: new TextEncoder().encode(source).byteLength,
      detectedEntries: 3,
      skippedEntries: 1,
    });
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

  it("builds deterministic indexed duplicate keys only from complete signals", () => {
    expect(reviewDuplicateKeys({ doi: "https://doi.org/10.1/ABC", title: " Café Study! ", authors: ["Doe, Jane"], year: "2025" })).toEqual({
      doi: "10.1/abc",
      titleAuthorYear: "cafe study|doe jane|2025",
      titleYear: "cafe study|2025",
    });
    expect(reviewDuplicateKeys({ doi: "", title: "Untitled", authors: [], year: "" })).toEqual({
      doi: "",
      titleAuthorYear: "",
      titleYear: "",
    });
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
    const metadata = preview.records[0]!;
    const snapshot = {
      revision: 4,
      runs: [
        {
          id: "run-1",
          protocolRevision: 2,
          sourceId: "source-1",
          sourceName: "Source",
          query: "one",
          searchedAt: "2026-07-17T00:00:00.000Z",
          importedAt: "2026-07-17T00:01:00.000Z",
          importedBy: "owner@example.com",
          digest: preview.digest,
          reportedResultCount: 1,
          detectedEntries: 1,
          skippedEntries: 0,
          occurrenceCount: 1,
          importBatchIds: ["batch-1"],
        },
      ],
      batches: [
        {
          id: "batch-1",
          runId: "run-1",
          format: "bibtex",
          filename: "source-results.bib",
          mediaType: "application/x-bibtex",
          byteCount: preview.byteCount,
          digest: preview.digest,
          parserVersion: preview.parserVersion,
          reportedResultCount: 1,
        },
      ],
      occurrences: [
        { id: "occurrence-1", runId: "run-1", batchId: "batch-1", recordId: "record-1", citationKey: "one", imported: metadata },
      ],
      records: [{ id: "record-1", state: "active", mergedInto: null, metadata }],
      duplicateCandidates: [
        {
          id: "duplicate-1",
          leftId: "record-1",
          rightId: "record-2",
          signals: ["title-year"],
          confidence: "probable",
          status: "pending",
          resolvedAt: null,
          resolvedBy: null,
        },
      ],
      counts: { identified: 1, unique: 1, duplicatesRemoved: 0 },
    };
    expect(parseReviewSearchSnapshot(snapshot)).toEqual(snapshot);
    expect(() => parseReviewImportPreview({ ...preview, parserVersion: "unknown" })).toThrow("preview");
    expect(() =>
      parseReviewSearchSnapshot({
        ...snapshot,
        batches: [{ ...snapshot.batches[0], mediaType: "text/plain" }],
      }),
    ).toThrow("batch");
    expect(() => parseReviewSearchSnapshot({ revision: 1 })).toThrow("snapshot");
  });
});
