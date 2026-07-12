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
});

function fixture(): ReferenceLibrarySnapshot {
  const base = { provenance: {}, archivedAt: null, deletedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" } as const;
  return {
    references: [
      {
        ...base,
        id: "incomplete",
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
