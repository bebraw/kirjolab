import { describe, expect, it } from "vitest";
import type { ReferenceLibrarySnapshot } from "./reference-library";
import { filterReferenceLibrary, type ReferenceLibraryFilters } from "./reference-filters";

const filters: ReferenceLibraryFilters = {
  query: "",
  type: "",
  readingStatus: "all",
  organization: "",
  linkage: "all",
  completeness: "all",
  sort: "updated",
};

describe("reference library filters", () => {
  it("combines research facets and sorts without mutating the snapshot", () => {
    const library = fixture();
    expect(
      filterReferenceLibrary(library, new Set(["complete"]), { ...filters, query: "doe", linkage: "linked" }).map((item) => item.id),
    ).toEqual(["complete"]);
    expect(
      filterReferenceLibrary(library, new Set(), { ...filters, type: "book", readingStatus: "unread" }).map((item) => item.id),
    ).toEqual(["incomplete"]);
    expect(
      filterReferenceLibrary(library, new Set(), { ...filters, organization: "chapter", completeness: "complete" }).map((item) => item.id),
    ).toEqual(["complete"]);
    expect(filterReferenceLibrary(library, new Set(), { ...filters, sort: "priority" }).map((item) => item.id)).toEqual([
      "complete",
      "incomplete",
    ]);
    expect(library.references.map((item) => item.id)).toEqual(["incomplete", "complete"]);
  });

  it("covers each facet, default reading state, and every deterministic sort", () => {
    const library = fixture();
    const ids = (changes: Partial<ReferenceLibraryFilters>, linked = new Set<string>()) =>
      filterReferenceLibrary(library, linked, { ...filters, ...changes }).map((item) => item.id);

    expect(ids({ query: "  JOURNAL " })).toEqual(["complete"]);
    expect(ids({ query: "10/EXAMPLE" })).toEqual(["complete"]);
    expect(ids({ query: "missing" })).toEqual([]);
    expect(ids({ type: "article" })).toEqual(["complete"]);
    expect(ids({ readingStatus: "reading" })).toEqual(["complete"]);
    expect(ids({ readingStatus: "unread" })).toEqual(["incomplete"]);
    expect(ids({ organization: " methods " })).toEqual(["complete"]);
    expect(ids({ organization: "ONE" })).toEqual(["complete"]);
    expect(ids({ organization: "missing" })).toEqual([]);
    expect(ids({ linkage: "linked" }, new Set(["complete"]))).toEqual(["complete"]);
    expect(ids({ linkage: "unlinked" }, new Set(["complete"]))).toEqual(["incomplete"]);
    expect(ids({ completeness: "complete" })).toEqual(["complete"]);
    expect(ids({ completeness: "incomplete" })).toEqual(["incomplete"]);
    expect(ids({ sort: "title" })).toEqual(["complete", "incomplete"]);
    expect(ids({ sort: "year" })).toEqual(["complete", "incomplete"]);
    expect(ids({ sort: "priority" })).toEqual(["complete", "incomplete"]);
    expect(ids({ sort: "updated" })).toEqual(["complete", "incomplete"]);
  });

  it("uses title tie-breakers for equal years, priorities, and update times", () => {
    const source = fixture();
    const library: ReferenceLibrarySnapshot = {
      ...source,
      references: source.references.map((reference) => ({ ...reference, year: "2026", updatedAt: "same" })),
      reading: [],
    };
    for (const sort of ["year", "priority", "updated"] as const) {
      expect(filterReferenceLibrary(library, new Set(), { ...filters, sort }).map((item) => item.title)).toEqual([
        "Methods",
        "Untitled notes",
      ]);
    }
  });

  it("requires every completeness field independently", () => {
    const source = fixture();
    const complete = source.references[1]!;
    const references = [
      complete,
      { ...complete, id: "missing-type", type: "" },
      { ...complete, id: "missing-title", title: "" },
      { ...complete, id: "missing-author", authors: [] },
      { ...complete, id: "missing-year", year: "" },
    ];
    const library = { ...source, references };
    expect(filterReferenceLibrary(library, new Set(), { ...filters, completeness: "complete" }).map((item) => item.id)).toEqual([
      "complete",
    ]);
    expect(filterReferenceLibrary(library, new Set(), { ...filters, completeness: "incomplete" }).map((item) => item.id)).toEqual([
      "missing-title",
      "missing-type",
      "missing-author",
      "missing-year",
    ]);
  });

  it("keeps each sort mode observably distinct", () => {
    const source = fixture();
    const base = source.references[1]!;
    const library: ReferenceLibrarySnapshot = {
      ...source,
      references: [
        { ...base, id: "zulu", title: "Zulu", year: "2026", updatedAt: "2026-02-01" },
        { ...base, id: "alpha", title: "Alpha", year: "2025", updatedAt: "2026-01-01" },
      ],
      reading: [
        { referenceId: "zulu", status: "read", rating: null, priority: "high", updatedAt: "now" },
        { referenceId: "alpha", status: "read", rating: null, priority: "low", updatedAt: "now" },
      ],
    };
    expect(filterReferenceLibrary(library, new Set(), { ...filters, sort: "title" }).map((item) => item.id)).toEqual(["alpha", "zulu"]);
    for (const sort of ["year", "priority", "updated"] as const) {
      expect(filterReferenceLibrary(library, new Set(), { ...filters, sort }).map((item) => item.id)).toEqual(["zulu", "alpha"]);
    }
  });
});

function fixture(): ReferenceLibrarySnapshot {
  const base = { provenance: {}, archivedAt: null, deletedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" } as const;
  return {
    references: [
      {
        ...base,
        id: "incomplete",
        referenceKey: "incomplete",
        type: "book",
        title: "Untitled notes",
        authors: [],
        year: "",
        venue: "",
        doi: "",
        url: "",
        abstract: "",
      },
      {
        ...base,
        id: "complete",
        referenceKey: "complete",
        type: "article",
        title: "Methods",
        authors: ["Doe, Jane"],
        year: "2026",
        venue: "Journal",
        doi: "10/example",
        url: "",
        abstract: "",
        updatedAt: "2026-02-01",
      },
    ],
    artifacts: [],
    webSources: [],
    webSnapshots: [],
    notes: [],
    highlights: [],
    tags: { complete: ["Methods"] },
    collections: { complete: ["Chapter one"] },
    reading: [{ referenceId: "complete", status: "reading", rating: 5, priority: "high", updatedAt: "2026-02-01" }],
  };
}
