import { describe, expect, it, vi } from "vitest";
import type { BibliographicRecord, LibraryPdfArtifact, ReferenceLibrarySnapshot } from "../../domain/reference-library";
import { LibraryReferenceList } from "./library-reference-list";

class TestReferenceList extends LibraryReferenceList {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  refinePdfForTest(
    detail: object,
    editor: { refineMetadata: (reference: BibliographicRecord, artifact: LibraryPdfArtifact) => void } | null,
  ) {
    const event = new CustomEvent("library-reference-pdf-action", { detail });
    Object.defineProperty(event, "currentTarget", { value: { querySelector: () => editor } });
    this.refinePdf(event);
    return event;
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

const artifact: LibraryPdfArtifact = {
  contentType: "application/pdf",
  createdAt: "created",
  fingerprint: "fingerprint",
  id: "pdf-1",
  name: "paper.pdf",
  objectKey: "pdfs/paper.pdf",
  referenceId: reference.id,
  rights: "private",
  size: 1024,
};

describe("library reference list", () => {
  it("owns loading, empty, filtered, and populated list presentation", () => {
    const list = new TestReferenceList();
    expect(list.rootForTest()).toBe(list);
    expect(list.renderForTest()).toBeDefined();
    list.setData({
      library: { ...library, references: [] },
      projectApiBase: null,
      projectReferences: [],
      references: [],
      researchShares: [],
    });
    expect(list.renderForTest()).toBeDefined();
    list.setData({ library, projectApiBase: null, projectReferences: [], references: [], researchShares: [] });
    expect(list.renderForTest()).toBeDefined();
    list.setData({
      library,
      projectApiBase: "/api/workspaces/workspace",
      projectReferences: [],
      references: [reference],
      researchShares: [],
    });
    expect(list.renderForTest()).toBeDefined();
  });

  it("keeps PDF metadata refinement inside the owning reference row", () => {
    const list = new TestReferenceList();
    const refineMetadata = vi.fn();
    const refined = list.refinePdfForTest({ action: "refine", artifact, reference }, { refineMetadata });
    const opened = list.refinePdfForTest({ action: "open", artifact }, { refineMetadata });
    list.refinePdfForTest({ action: "refine", artifact, reference }, null);

    expect(refineMetadata).toHaveBeenCalledOnce();
    expect(refineMetadata).toHaveBeenCalledWith(reference, artifact);
    expect(refined.cancelBubble).toBe(true);
    expect(opened.cancelBubble).toBe(false);
  });
});
