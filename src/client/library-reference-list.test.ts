import { describe, expect, it } from "vitest";
import type { BibliographicRecord, ReferenceLibrarySnapshot } from "../domain/reference-library";
import { LibraryReferenceList } from "./library-reference-list";

class TestReferenceList extends LibraryReferenceList {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }
}

const reference: BibliographicRecord = {
  id: "ref-1",
  referenceKey: "vepsalainen2026",
  type: "article",
  title: "{Bounded} components",
  authors: ["Juho Vepsäläinen"],
  year: "2026",
  venue: "Journal",
  doi: "",
  url: "",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: "created",
  updatedAt: "updated",
};

const library: ReferenceLibrarySnapshot = {
  references: [reference],
  referenceKeyStates: { [reference.id]: "final" },
  artifacts: [],
  webSources: [],
  webSnapshots: [],
  notes: [],
  highlights: [],
  tags: { [reference.id]: ["architecture"] },
  collections: { [reference.id]: ["pilots"] },
  reading: [],
};

describe("library reference list", () => {
  it("owns loading, empty, filtered, and populated list presentation", () => {
    const list = new TestReferenceList();
    expect(list.rootForTest()).toBe(list);
    expect(list.renderForTest()).toBeDefined();
    list.setData({ library: { ...library, references: [] }, projectReferences: [], references: [], researchShares: [], workspace: false });
    expect(list.renderForTest()).toBeDefined();
    list.setData({ library, projectReferences: [], references: [], researchShares: [], workspace: false });
    expect(list.renderForTest()).toBeDefined();
    list.setData({ library, projectReferences: [], references: [reference], researchShares: [], workspace: true });
    expect(list.renderForTest()).toBeDefined();
  });
});
