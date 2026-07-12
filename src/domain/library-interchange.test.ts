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
    expect(item).toEqual({
      id: "reference-id",
      type: "article-journal",
      title: "Methods",
      author: [{ family: "Doe", given: "Jane" }],
      issued: { "date-parts": [["2026"]] },
      "container-title": "Journal",
      DOI: "10/example",
      URL: "https://example.test",
      abstract: "Abstract",
    });
    expect(cslJsonToBibTeX(parseCslJson([item]))).toBe(`@article{reference-id,
  author = {Doe, Jane},
  title = {Methods},
  year = {2026},
  journal = {Journal},
  doi = {10/example},
  url = {https://example.test},
  abstract = {Abstract}
}
`);
  });

  it("maps every supported reference shape to CSL JSON", () => {
    const provenance = { method: "manual", capturedAt: "now", actor: "owner" } as const;
    const makeReference = (type: string, authors: string[] = []) =>
      referenceFromBibTeX(
        { type, citationKey: type, fields: { title: type, ...(authors.length ? { author: authors.join(" and ") } : {}) } },
        type,
        provenance,
      );

    expect(referenceToCslJson(makeReference("inproceedings", ["Ada Lovelace"]))).toEqual({
      id: "inproceedings",
      type: "paper-conference",
      title: "inproceedings",
      author: [{ literal: "Ada Lovelace" }],
    });
    expect(referenceToCslJson(makeReference("phdthesis"))).toEqual({ id: "phdthesis", type: "thesis", title: "phdthesis" });
    expect(referenceToCslJson(makeReference("mastersthesis"))).toEqual({
      id: "mastersthesis",
      type: "thesis",
      title: "mastersthesis",
    });
    expect(referenceToCslJson(makeReference("book"))).toEqual({ id: "book", type: "book", title: "book" });
    expect(referenceToCslJson(makeReference("misc"))).toEqual({ id: "misc", type: "document", title: "misc" });
  });

  it("serializes CSL types, names, duplicate keys, and optional fields", () => {
    const bibtex = cslJsonToBibTeX([
      {
        id: "unsafe key",
        type: "paper-conference",
        title: "First",
        author: [{ literal: "Collective" }, { family: "Doe", given: "Jane" }, { family: "Solo" }, {}],
        issued: { "date-parts": [[2026]] },
        "container-title": "Proceedings",
        DOI: "10/example",
        URL: "https://example.test",
        abstract: "Summary",
      },
      { id: "unsafe-key", type: "book", title: "Second" },
      { id: "unsafe-key", type: "thesis", title: "Third" },
      { id: "***", type: "unknown", title: "Fourth" },
    ]);

    expect(bibtex).toContain("@inproceedings{unsafekey,");
    expect(bibtex).toContain("author = {Collective and Doe, Jane and Solo and }");
    expect(bibtex).toContain("journal = {Proceedings}");
    expect(bibtex).toContain("doi = {10/example}");
    expect(bibtex).toContain("url = {https://example.test}");
    expect(bibtex).toContain("abstract = {Summary}");
    expect(bibtex).toContain("year = {2026}");
    expect(bibtex).toContain("@book{unsafe-key,");
    expect(bibtex).toContain("@phdthesis{unsafe-key2,");
    expect(bibtex).toContain("@misc{source4,");
  });

  it("rejects malformed and oversized CSL JSON fields", () => {
    const valid = { id: "id", type: "article-journal", title: "Title" };
    for (const invalid of [
      null,
      [],
      Array.from({ length: 2_001 }, () => valid),
      {},
      { ...valid, id: "" },
      { ...valid, id: "x".repeat(201) },
      { ...valid, type: 1 },
      { ...valid, type: "x".repeat(65) },
      { ...valid, title: "" },
      { ...valid, title: "x".repeat(2_001) },
      { ...valid, author: {} },
      { ...valid, author: [{}] },
      { ...valid, author: [{ literal: "x".repeat(501) }] },
      { ...valid, author: [{ literal: "ok", family: 1 }] },
      { ...valid, issued: null },
      { ...valid, issued: { "date-parts": [] } },
      { ...valid, issued: { "date-parts": Array.from({ length: 5 }, () => [2026]) } },
      { ...valid, issued: { "date-parts": [[]] } },
      { ...valid, issued: { "date-parts": [[2026, 1, 1, 1]] } },
      { ...valid, issued: { "date-parts": [[Number.NaN]] } },
      { ...valid, issued: { "date-parts": [["x".repeat(21)]] } },
      { ...valid, DOI: 1 },
      { ...valid, URL: "x".repeat(4_097) },
      { ...valid, abstract: "x".repeat(20_001) },
    ]) {
      expect(() => parseCslJson(invalid)).toThrowError("CSL JSON");
    }
    expect(parseCslJson([{ ...valid, author: [{ given: "Ada" }], issued: { "date-parts": [["2026", 2, 3]] } }])).toHaveLength(1);
  });

  it("accepts each documented CSL JSON boundary exactly", () => {
    const boundary = {
      id: "i".repeat(200),
      type: "t".repeat(64),
      title: "x".repeat(2_000),
      author: [{ family: "f".repeat(500), given: "g".repeat(500), literal: "l".repeat(500) }],
      issued: { "date-parts": Array.from({ length: 4 }, () => ["y".repeat(20), 1, 2]) },
      "container-title": "c".repeat(4_096),
      DOI: "d".repeat(4_096),
      URL: "u".repeat(4_096),
      abstract: "a".repeat(20_000),
    };
    expect(parseCslJson([boundary])).toEqual([boundary]);
    expect(parseCslJson(Array.from({ length: 2_000 }, () => ({ id: "id", type: "document", title: "Title" })))).toHaveLength(2_000);
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
      expect(() => parsePortableResearch(invalid)).toThrowError("Portable library research metadata is invalid");
    }
  });

  it("validates every portable note and reading-state boundary", () => {
    const valid = {
      version: "kirjolab-library-v1",
      tags: { ref: ["tag"] },
      collections: {},
      notes: [{ referenceId: "ref", body: "note", createdAt: "created", updatedAt: "updated" }],
      reading: [{ referenceId: "ref", status: "reading", rating: 3, priority: "normal", updatedAt: "updated" }],
    } as const;
    expect(parsePortableResearch(valid)).toEqual(valid);
    expect(parsePortableResearch({ ...valid, reading: [{ ...valid.reading[0], rating: null }] })).toBeTruthy();

    for (const invalid of [
      { ...valid, tags: Object.fromEntries(Array.from({ length: 2_001 }, (_, index) => [String(index), []])) },
      { ...valid, tags: { ref: Array.from({ length: 33 }, () => "tag") } },
      { ...valid, tags: { ref: ["x".repeat(121)] } },
      { ...valid, notes: {} },
      { ...valid, notes: Array.from({ length: 10_001 }, () => valid.notes[0]) },
      { ...valid, notes: [{ ...valid.notes[0], referenceId: 1 }] },
      { ...valid, notes: [{ ...valid.notes[0], body: 1 }] },
      { ...valid, notes: [{ ...valid.notes[0], body: "x".repeat(20_001) }] },
      { ...valid, notes: [{ ...valid.notes[0], createdAt: 1 }] },
      { ...valid, notes: [{ ...valid.notes[0], updatedAt: 1 }] },
      { ...valid, reading: {} },
      { ...valid, reading: Array.from({ length: 2_001 }, () => valid.reading[0]) },
      { ...valid, reading: [{ ...valid.reading[0], referenceId: 1 }] },
      { ...valid, reading: [{ ...valid.reading[0], status: "later" }] },
      { ...valid, reading: [{ ...valid.reading[0], rating: 0 }] },
      { ...valid, reading: [{ ...valid.reading[0], rating: 6 }] },
      { ...valid, reading: [{ ...valid.reading[0], rating: 1.5 }] },
      { ...valid, reading: [{ ...valid.reading[0], priority: "urgent" }] },
      { ...valid, reading: [{ ...valid.reading[0], updatedAt: 1 }] },
    ]) {
      expect(() => parsePortableResearch(invalid)).toThrowError("Portable library research metadata is invalid");
    }
    for (const status of ["unread", "reading", "read"] as const) {
      for (const priority of ["low", "normal", "high"] as const) {
        expect(parsePortableResearch({ ...valid, reading: [{ ...valid.reading[0], status, priority }] }).reading[0]).toMatchObject({
          status,
          priority,
        });
      }
    }
  });

  it("accepts portable collection-size boundaries exactly", () => {
    const note = { referenceId: "ref", body: "note", createdAt: "created", updatedAt: "updated" };
    const reading = { referenceId: "ref", status: "read" as const, rating: 5, priority: "high" as const, updatedAt: "updated" };
    const boundary = {
      version: "kirjolab-library-v1",
      tags: { ref: Array.from({ length: 32 }, () => "x".repeat(120)) },
      collections: {},
      notes: Array.from({ length: 10_000 }, () => note),
      reading: Array.from({ length: 2_000 }, () => reading),
    } as const;
    expect(parsePortableResearch(boundary)).toBe(boundary);
  });
});
