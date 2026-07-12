import { describe, expect, it } from "vitest";
import {
  bibliographicSnapshot,
  isReferenceLibrarySnapshot,
  likelyReferenceIdentity,
  missingRequiredBibliographicFields,
  referenceFromBibTeX,
} from "./reference-library";

const provenance = { method: "bibtex", capturedAt: "2026-07-11T10:00:00.000Z", actor: "owner@example.test" } as const;

describe("shared reference library", () => {
  it("retains per-field provenance and derives a portable snapshot", () => {
    const record = referenceFromBibTeX(
      {
        type: "article",
        citationKey: "doe2026",
        fields: { title: "Evidence", author: "Doe, Jane", year: "2026", journal: "Research", doi: "https://doi.org/10.1/ABC" },
      },
      "reference-1",
      provenance,
    );
    expect(record.doi).toBe("10.1/abc");
    expect(record.provenance.title).toEqual(provenance);
    expect(missingRequiredBibliographicFields(record)).toEqual([]);
    expect(bibliographicSnapshot(record, "captured")).toMatchObject({
      referenceId: "reference-1",
      capturedAt: "captured",
      tombstone: false,
    });
  });

  it("validates BibTeX type requirements without requiring a DOI", () => {
    const record = referenceFromBibTeX({ type: "article", citationKey: "draft", fields: { title: "Draft" } }, "draft", provenance);
    expect(missingRequiredBibliographicFields(record)).toEqual(["authors", "year", "venue"]);
    const manual = referenceFromBibTeX({ type: "manual", citationKey: "guide", fields: { title: "Guide" } }, "guide", provenance);
    expect(missingRequiredBibliographicFields(manual)).toEqual([]);
  });

  it("deduplicates by DOI before a normalized bibliographic fingerprint", () => {
    const first = { title: "A Study", authors: ["Doe, Jane"], year: "2026", doi: "10.1/ABC" };
    const second = { title: "Different", authors: [], year: "", doi: "https://doi.org/10.1/abc" };
    expect(likelyReferenceIdentity(first)).toBe(likelyReferenceIdentity(second));
    expect(likelyReferenceIdentity({ ...first, doi: "" })).toBe("work:a study|2026|doe jane");
    expect(likelyReferenceIdentity({ title: " Étude—One! ", authors: ["Ångström, Ada"], year: " 2025 ", doi: "" })).toBe(
      "work:e tude one|2025|a ngstro m ada",
    );
  });

  it("covers BibTeX type-specific required fields", () => {
    const complete = {
      id: "record",
      type: "article",
      title: "Title",
      authors: ["Author"],
      year: "2026",
      venue: "Venue",
      doi: "",
      url: "",
      abstract: "",
      provenance: {},
      archivedAt: null,
      deletedAt: null,
      createdAt: provenance.capturedAt,
      updatedAt: provenance.capturedAt,
    } as const;
    for (const type of ["article", "book", "inbook", "incollection", "inproceedings", "mastersthesis", "phdthesis", "techreport"]) {
      expect(missingRequiredBibliographicFields({ ...complete, type }), type).toEqual([]);
    }
    expect(missingRequiredBibliographicFields({ ...complete, type: "proceedings", authors: [], venue: "" })).toEqual([]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "unpublished", year: "", venue: "" })).toEqual([]);
    expect(missingRequiredBibliographicFields({ ...complete, type: "unknown", authors: [], year: "", venue: "" })).toEqual([]);
    expect(missingRequiredBibliographicFields({ ...complete, authors: [] })).toEqual(["authors"]);
  });

  it("validates complete private-library snapshots and rejects malformed boundaries", () => {
    const record = referenceFromBibTeX({ type: "manual", citationKey: "guide", fields: { title: "Guide" } }, "guide", provenance);
    const valid = { references: [record], artifacts: [], notes: [], highlights: [], tags: {}, reading: [] };
    expect(isReferenceLibrarySnapshot(valid)).toBe(true);
    for (const change of [
      { references: null },
      { references: [{ ...record, id: 1 }] },
      { references: [{ ...record, authors: [1] }] },
      { references: [{ ...record, provenance: null }] },
      { references: [{ ...record, archivedAt: 1 }] },
      { references: [{ ...record, deletedAt: 1 }] },
      { artifacts: null },
      { notes: null },
      { highlights: null },
      { tags: [] },
      { reading: null },
    ]) {
      expect(isReferenceLibrarySnapshot({ ...valid, ...change }), JSON.stringify(change)).toBe(false);
    }
    expect(isReferenceLibrarySnapshot(null)).toBe(false);
    expect(bibliographicSnapshot({ ...record, deletedAt: "deleted" }, "snapshot")).toMatchObject({
      referenceId: "guide",
      capturedAt: "snapshot",
      tombstone: true,
    });
  });
});
