import { describe, expect, it } from "vitest";
import type { BibliographicRecord, LibraryPdfArtifact } from "../domain/reference-library";
import { LibraryReferencePdfRows, libraryReferencePdfActionEvent, type LibraryReferencePdfAction } from "./library-reference-pdf-rows";

class TestLibraryReferencePdfRows extends LibraryReferencePdfRows {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitForTest(action: LibraryReferencePdfAction): void {
    this.emitAction(action);
  }

  refineForTest(artifact: LibraryPdfArtifact): void {
    this.refine(artifact);
  }

  setRightsForTest(artifactId: string, value: string): void {
    const event = new Event("change");
    Object.defineProperty(event, "currentTarget", { value: { value } });
    this.setRights(artifactId, event);
  }
}

const reference = {
  id: "ref-1",
  referenceKey: "doe2026",
  type: "article",
  title: "Paper",
  authors: ["Jane Doe"],
  year: "2026",
  venue: "Journal",
  doi: "",
  url: "",
  abstract: "",
  provenance: {},
  archivedAt: null,
  deletedAt: null,
  createdAt: "2026-07-25T00:00:00.000Z",
  updatedAt: "2026-07-25T00:00:00.000Z",
} satisfies BibliographicRecord;

const artifact = (id: string, rights: LibraryPdfArtifact["rights"]): LibraryPdfArtifact => ({
  id,
  referenceId: reference.id,
  name: `${id}.pdf`,
  contentType: "application/pdf",
  size: 2048,
  objectKey: `pdfs/${id}`,
  fingerprint: id,
  rights,
  createdAt: "2026-07-25T00:00:00.000Z",
});

describe("library reference PDF rows", () => {
  it("owns empty, linked, and multi-artifact light-DOM presentation", () => {
    const rows = new TestLibraryReferencePdfRows();
    expect(rows.rootForTest()).toBe(rows);
    expect(rows.renderForTest()).toBeDefined();
    rows.setData(reference, [artifact("pdf-1", "private"), artifact("pdf-2", "unknown")], true);
    expect(rows.renderForTest()).toBeDefined();
  });

  it("emits open, validated rights, and secondary refinement actions", () => {
    const rows = new TestLibraryReferencePdfRows();
    const actions: LibraryReferencePdfAction[] = [];
    rows.addEventListener(libraryReferencePdfActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryReferencePdfAction>).detail);
    });
    const primary = artifact("pdf-1", "private");
    const secondary = artifact("pdf-2", "unknown");
    rows.setData(reference, [primary, secondary], false);
    rows.emitForTest({ action: "open", artifact: primary });
    rows.setRightsForTest(primary.id, "shareable");
    rows.setRightsForTest(primary.id, "invalid");
    rows.refineForTest(secondary);
    expect(actions).toEqual([
      { action: "open", artifact: primary },
      { action: "set-rights", artifactId: "pdf-1", rights: "shareable" },
      { action: "refine", artifact: secondary, reference },
    ]);
  });
});
