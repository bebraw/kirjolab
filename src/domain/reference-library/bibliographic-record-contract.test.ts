import { describe, expect, it } from "vitest";
import { hasBibliographicRecordFields } from "./bibliographic-record-contract";

const record = {
  referenceKey: "doe2026",
  type: "article-journal",
  title: "A study",
  authors: ["Doe, Jane"],
  year: "2026",
  venue: "Journal",
  doi: "10.1000/example",
  url: "https://example.test/study",
  abstract: "Abstract",
  provenance: {},
};

describe("bibliographic record contract", () => {
  it("accepts the shared bibliographic fields", () => {
    expect(hasBibliographicRecordFields(record)).toBe(true);
  });

  it("rejects missing and malformed shared fields", () => {
    for (const key of Object.keys(record)) {
      expect(hasBibliographicRecordFields({ ...record, [key]: undefined })).toBe(false);
    }
    expect(hasBibliographicRecordFields({ ...record, authors: [42] })).toBe(false);
    expect(hasBibliographicRecordFields({ ...record, authors: ["Doe, Jane", 42] })).toBe(false);
    expect(hasBibliographicRecordFields({ ...record, provenance: null })).toBe(false);
    expect(hasBibliographicRecordFields({ ...record, provenance: [] })).toBe(false);
  });
});
