import { describe, expect, it } from "vitest";
import type { BibliographicRecord } from "../domain/reference-library";
import { LibraryPdfProjectUse, libraryPdfProjectUseActionEvent, type LibraryPdfProjectUseAction } from "./library-pdf-project-use";

class TestProjectUse extends LibraryPdfProjectUse {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitForTest(action: LibraryPdfProjectUseAction): void {
    this.emitAction(action);
  }
}

const reference: BibliographicRecord = {
  id: "reference-1",
  referenceKey: "source2026",
  type: "article",
  title: "Source",
  authors: [],
  year: "2026",
  venue: "",
  doi: "",
  url: "",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: "created",
  updatedAt: "updated",
};

describe("library PDF project use", () => {
  it("owns unidentified, unlinked, and linked presentation", () => {
    const projectUse = new TestProjectUse();
    expect(projectUse.rootForTest()).toBe(projectUse);
    expect(projectUse.renderForTest()).toBeDefined();
    projectUse.setData({ linkedCitationAlias: null, reference: null });
    expect(projectUse.renderForTest()).toBeDefined();
    projectUse.setData({ linkedCitationAlias: null, reference });
    expect(projectUse.renderForTest()).toBeDefined();
    projectUse.setData({ linkedCitationAlias: "source", reference });
    expect(projectUse.renderForTest()).toBeDefined();
  });

  it("emits a typed link intent", () => {
    const projectUse = new TestProjectUse();
    const actions: LibraryPdfProjectUseAction[] = [];
    projectUse.addEventListener(libraryPdfProjectUseActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfProjectUseAction>).detail);
    });
    projectUse.emitForTest({ action: "link-reference", referenceId: reference.id, referenceKey: reference.referenceKey });
    expect(actions).toEqual([{ action: "link-reference", referenceId: reference.id, referenceKey: reference.referenceKey }]);
  });
});
