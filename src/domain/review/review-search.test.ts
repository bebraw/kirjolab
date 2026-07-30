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
@misc   (three, note={No core metadata})
@article{broken title={No key}}`;
    const preview = await previewReviewBibTeX(source);
    expect(preview).toMatchObject({
      ...reviewBibTeXImport,
      byteCount: new TextEncoder().encode(source).byteLength,
      detectedEntries: 4,
      skippedEntries: 1,
    });
    expect(preview.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(preview.records[0]).toMatchObject({ citationKey: "one", doi: "10.1/abc", identity: "doi:10.1/abc", warnings: [] });
    expect(preview.records[1]?.warnings).toEqual(["Missing authors", "Missing year"]);
    expect(preview.records[2]).toMatchObject({
      citationKey: "three",
      title: "Untitled publication",
      warnings: ["Missing title", "Missing authors", "Missing year"],
    });
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

  it("classifies each duplicate signal independently", () => {
    const base = { title: "Study", authors: ["Doe, Jane"], year: "2025", doi: "" };
    expect(
      findReviewDuplicateMatches([
        { ...base, id: "doi-left", title: "Different", doi: "10.1/same" },
        { ...base, id: "doi-right", title: "Other", authors: ["Roe"], year: "2024", doi: "https://doi.org/10.1/SAME" },
      ]),
    ).toEqual([{ leftId: "doi-left", rightId: "doi-right", signals: ["doi"], confidence: "exact" }]);
    expect(
      findReviewDuplicateMatches([
        { ...base, id: "author-left" },
        { ...base, id: "author-right" },
      ]),
    ).toEqual([{ leftId: "author-left", rightId: "author-right", signals: ["title-author-year"], confidence: "exact" }]);
    expect(
      findReviewDuplicateMatches([
        { ...base, id: "year-left" },
        { ...base, id: "year-right", authors: ["Roe"] },
      ]),
    ).toEqual([{ leftId: "year-left", rightId: "year-right", signals: ["title-year"], confidence: "probable" }]);
    expect(
      findReviewDuplicateMatches([
        { ...base, id: "none-left" },
        { ...base, id: "none-right", title: "Other", authors: ["Roe"], year: "2024" },
      ]),
    ).toEqual([]);
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
    expect(reviewDuplicateKeys({ doi: "", title: " Study ", authors: [], year: " 2025 " })).toEqual({
      doi: "",
      titleAuthorYear: "",
      titleYear: "study|2025",
    });
  });

  it("falls back to normalized title, year, and first author identity", async () => {
    expect(reviewRecordIdentity({ doi: "", title: "  Café-based Study ", year: "2024", authors: ["Doe, Jane"] })).toBe(
      "work:cafe based study|2024|doe jane",
    );
    expect(reviewRecordIdentity({ doi: "", title: "Study", year: " 2024 ", authors: [] })).toBe("work:study|2024|");
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
    expect(
      parseReviewSearchSnapshot({
        ...snapshot,
        records: [{ ...snapshot.records[0], state: "merged", mergedInto: "record-2" }],
      }).records,
    ).toEqual([{ ...snapshot.records[0], state: "merged", mergedInto: "record-2" }]);
    expect(() => parseReviewImportPreview({ ...preview, parserVersion: "unknown" })).toThrow("preview");
    expect(() =>
      parseReviewSearchSnapshot({
        ...snapshot,
        batches: [{ ...snapshot.batches[0], mediaType: "text/plain" }],
      }),
    ).toThrow("batch");
    expect(() => parseReviewSearchSnapshot({ revision: 1 })).toThrow("snapshot");

    for (const changed of [
      null,
      { ...preview, digest: 1 },
      { ...preview, format: "csl-json" },
      { ...preview, mediaType: "text/plain" },
      { ...preview, parserVersion: "old" },
      { ...preview, records: null },
      { ...preview, byteCount: 0 },
      { ...preview, detectedEntries: -1 },
      { ...preview, skippedEntries: 1.5 },
    ]) {
      expect(() => parseReviewImportPreview(changed)).toThrow();
    }
    for (const changed of [
      null,
      { ...metadata, authors: null },
      { ...metadata, authors: [1] },
      { ...metadata, warnings: null },
      { ...metadata, warnings: [1] },
      { ...metadata, citationKey: 1 },
      { ...metadata, type: 1 },
      { ...metadata, title: 1 },
      { ...metadata, year: 1 },
      { ...metadata, venue: 1 },
      { ...metadata, doi: 1 },
      { ...metadata, url: 1 },
      { ...metadata, abstract: 1 },
      { ...metadata, identity: 1 },
    ]) {
      expect(() => parseReviewImportPreview({ ...preview, records: [changed] })).toThrow();
    }

    for (const changed of [
      null,
      [],
      { ...snapshot, runs: null },
      { ...snapshot, batches: null },
      { ...snapshot, occurrences: null },
      { ...snapshot, records: null },
      { ...snapshot, duplicateCandidates: null },
      { ...snapshot, counts: null },
      { ...snapshot, revision: -1 },
    ]) {
      expect(() => parseReviewSearchSnapshot(changed)).toThrow();
    }
    const run = snapshot.runs[0]!;
    for (const changed of [
      null,
      { ...run, id: 1 },
      { ...run, protocolRevision: -1 },
      { ...run, sourceId: 1 },
      { ...run, sourceName: 1 },
      { ...run, query: 1 },
      { ...run, searchedAt: 1 },
      { ...run, importedAt: 1 },
      { ...run, importedBy: 1 },
      { ...run, digest: 1 },
      { ...run, reportedResultCount: -1 },
      { ...run, detectedEntries: -1 },
      { ...run, skippedEntries: -1 },
      { ...run, occurrenceCount: -1 },
      { ...run, importBatchIds: null },
      { ...run, importBatchIds: [1] },
    ]) {
      expect(() => parseReviewSearchSnapshot({ ...snapshot, runs: [changed] })).toThrow();
    }
    const batch = snapshot.batches[0]!;
    for (const changed of [
      null,
      { ...batch, id: 1 },
      { ...batch, runId: 1 },
      { ...batch, format: "other" },
      { ...batch, filename: 1 },
      { ...batch, mediaType: "other" },
      { ...batch, byteCount: -1 },
      { ...batch, digest: 1 },
      { ...batch, parserVersion: 1 },
      { ...batch, reportedResultCount: -1 },
    ]) {
      expect(() => parseReviewSearchSnapshot({ ...snapshot, batches: [changed] })).toThrow();
    }
    const occurrence = snapshot.occurrences[0]!;
    for (const changed of [
      null,
      { ...occurrence, id: 1 },
      { ...occurrence, runId: 1 },
      { ...occurrence, batchId: 1 },
      { ...occurrence, recordId: 1 },
      { ...occurrence, citationKey: 1 },
      { ...occurrence, imported: null },
    ]) {
      expect(() => parseReviewSearchSnapshot({ ...snapshot, occurrences: [changed] })).toThrow();
    }
    const record = snapshot.records[0]!;
    for (const changed of [
      null,
      { ...record, id: 1 },
      { ...record, state: "other" },
      { ...record, mergedInto: 1 },
      { ...record, metadata: null },
    ]) {
      expect(() => parseReviewSearchSnapshot({ ...snapshot, records: [changed] })).toThrow();
    }
    const duplicate = snapshot.duplicateCandidates[0]!;
    expect(
      parseReviewSearchSnapshot({
        ...snapshot,
        duplicateCandidates: [
          {
            ...duplicate,
            signals: ["doi", "title-author-year", "title-year"],
            confidence: "exact",
            status: "merged",
            resolvedAt: "now",
            resolvedBy: "owner",
          },
          { ...duplicate, id: "distinct", status: "distinct" },
          { ...duplicate, id: "superseded", status: "superseded" },
        ],
      }).duplicateCandidates,
    ).toHaveLength(3);
    for (const changed of [
      null,
      { ...duplicate, signals: null },
      { ...duplicate, signals: ["other"] },
      { ...duplicate, confidence: "other" },
      { ...duplicate, status: "other" },
      { ...duplicate, resolvedAt: 1 },
      { ...duplicate, resolvedBy: 1 },
      { ...duplicate, id: 1 },
      { ...duplicate, leftId: 1 },
      { ...duplicate, rightId: 1 },
    ]) {
      expect(() => parseReviewSearchSnapshot({ ...snapshot, duplicateCandidates: [changed] })).toThrow();
    }
    for (const field of ["identified", "unique", "duplicatesRemoved"] as const) {
      expect(() => parseReviewSearchSnapshot({ ...snapshot, counts: { ...snapshot.counts, [field]: -1 } })).toThrow();
    }
  });

  it("rejects empty and oversized BibTeX sources at exact bounds", async () => {
    await expect(previewReviewBibTeX("")).rejects.toThrow("Review BibTeX import size is invalid");
    await expect(previewReviewBibTeX("x".repeat(32 * 1024 * 1024 + 1))).rejects.toThrow("Review BibTeX import size is invalid");
  });
});
