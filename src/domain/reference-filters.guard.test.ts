import { expect, it } from "vitest";
import { filterReferenceLibrary } from "./reference-filters";
import type { ReferenceLibrarySnapshot } from "./reference-library";

it("keeps discovery projection inputs and sorting active", () => {
  const base = { provenance: {}, archivedAt: null, deletedAt: null, createdAt: "created" } as const;
  const library: ReferenceLibrarySnapshot = {
    references: [
      {
        ...base,
        id: "recent",
        type: "article",
        title: "Zulu methods",
        authors: ["Doe"],
        year: "2026",
        venue: "Journal",
        doi: "10/recent",
        url: "https://recent.test",
        abstract: "",
        updatedAt: "2026-02-01",
      },
      {
        ...base,
        id: "older",
        type: "book",
        title: "Alpha",
        authors: ["Smith"],
        year: "2025",
        venue: "Press",
        doi: "",
        url: "",
        abstract: "",
        updatedAt: "2026-01-01",
      },
    ],
    artifacts: [],
    webSources: [],
    webSnapshots: [],
    highlights: [],
    notes: [],
    tags: { recent: ["Methods"] },
    collections: {},
    reading: [{ referenceId: "recent", status: "read", rating: 5, priority: "high", updatedAt: "now" }],
  };
  const result = filterReferenceLibrary(library, new Set(["recent"]), {
    query: " DOE ",
    type: "article",
    readingStatus: "read",
    organization: " methods ",
    linkage: "linked",
    completeness: "complete",
    sort: "updated",
  });
  expect(result).toEqual([library.references[0]]);
});

it("applies priority ordering before the default update ordering", () => {
  const base = { type: "article", authors: ["Author"], year: "2026", venue: "", doi: "", url: "", abstract: "", provenance: {} } as const;
  const library: ReferenceLibrarySnapshot = {
    references: [
      { ...base, id: "high", title: "Zulu", archivedAt: null, deletedAt: null, createdAt: "same", updatedAt: "2026-01-01" },
      { ...base, id: "low", title: "Alpha", archivedAt: null, deletedAt: null, createdAt: "same", updatedAt: "2026-02-01" },
    ],
    artifacts: [],
    webSources: [],
    webSnapshots: [],
    highlights: [],
    notes: [],
    tags: {},
    collections: {},
    reading: [
      { referenceId: "high", status: "unread", rating: null, priority: "high", updatedAt: "same" },
      { referenceId: "low", status: "unread", rating: null, priority: "low", updatedAt: "same" },
    ],
  };
  const common = { query: "", type: "", readingStatus: "all", organization: "", linkage: "all", completeness: "all" } as const;
  expect(filterReferenceLibrary(library, new Set(), { ...common, sort: "priority" }).map(({ id }) => id)).toEqual(["high", "low"]);
  expect(filterReferenceLibrary(library, new Set(), { ...common, sort: "updated" }).map(({ id }) => id)).toEqual(["low", "high"]);
});
