import { describe, expect, it } from "vitest";
import type { ReferenceLibrarySnapshot } from "../../domain/reference-library";
import type { ReferenceLibraryFilters } from "../../domain/reference-library/reference-filters";
import { ReferenceLibraryFilterPanel, referenceLibraryFilterChangeEvent } from "./reference-library-filters";

class TestReferenceLibraryFilterPanel extends ReferenceLibraryFilterPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  changeForTest(field: "completeness" | "linkage" | "organization" | "query" | "reading" | "sort" | "type", value: string): void {
    const event = eventWithValue(value);
    if (field === "query") this.changeQuery(event);
    else if (field === "type") this.changeType(event);
    else if (field === "reading") this.changeReading(event);
    else if (field === "organization") this.changeOrganization(event);
    else if (field === "linkage") this.changeLinkage(event);
    else if (field === "completeness") this.changeCompleteness(event);
    else this.changeSort(event);
  }
}

function eventWithValue(value: string): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: { value } });
  return event;
}

describe("reference library filter panel", () => {
  it("renders dynamic types, counts, and reset state", () => {
    const panel = new TestReferenceLibraryFilterPanel();
    expect(panel.rootForTest()).toBe(panel);
    const references = panel.filterLibrary(library("article", "book"), []);
    expect(references).toHaveLength(2);
    expect(panel.renderForTest()).toBeDefined();
    panel.changeForTest("type", "article");
    panel.filterLibrary(library("book"), []);
    expect(panel.value.type).toBe("");
    panel.reset("sourceunderreview");
    expect(panel.value.query).toBe("sourceunderreview");
    panel.reset();
    expect(panel.value).toMatchObject({ query: "", readingStatus: "all", sort: "updated" });
  });

  it("owns validated filter values and emits changes", () => {
    const panel = new TestReferenceLibraryFilterPanel();
    let changes = 0;
    panel.addEventListener(referenceLibraryFilterChangeEvent, () => {
      changes += 1;
    });

    panel.changeForTest("query", "evidence");
    panel.changeForTest("type", "article");
    panel.changeForTest("reading", "reading");
    panel.changeForTest("organization", "methods");
    panel.changeForTest("linkage", "linked");
    panel.changeForTest("completeness", "incomplete");
    panel.changeForTest("sort", "priority");

    expect(panel.value).toEqual<ReferenceLibraryFilters>({
      completeness: "incomplete",
      linkage: "linked",
      organization: "methods",
      query: "evidence",
      readingStatus: "reading",
      sort: "priority",
      type: "article",
    });
    expect(changes).toBe(7);

    panel.changeForTest("reading", "invalid");
    panel.changeForTest("linkage", "invalid");
    panel.changeForTest("completeness", "invalid");
    panel.changeForTest("sort", "invalid");
    expect(panel.value).toMatchObject({ completeness: "all", linkage: "all", readingStatus: "all", sort: "updated" });
  });

  it("derives project linkage from canonical project references", () => {
    const panel = new TestReferenceLibraryFilterPanel();
    panel.changeForTest("linkage", "linked");

    expect(panel.filterLibrary(library("article", "book"), [{ referenceId: "reference-1" }]).map(({ id }) => id)).toEqual(["reference-1"]);
  });
});

function library(...types: string[]): ReferenceLibrarySnapshot {
  return {
    artifacts: [],
    collections: {},
    highlights: [],
    notes: [],
    reading: [],
    referenceKeyStates: {},
    references: types.map((type, index) => ({
      abstract: "",
      archivedAt: null,
      authors: [],
      createdAt: "2026-01-01",
      deletedAt: null,
      doi: "",
      id: `reference-${index}`,
      provenance: {},
      referenceKey: `reference${index}`,
      title: `Reference ${index}`,
      type,
      updatedAt: "2026-01-01",
      url: "",
      venue: "",
      year: "",
    })),
    tags: {},
    webSnapshots: [],
    webSources: [],
  };
}
