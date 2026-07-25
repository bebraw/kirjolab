import { describe, expect, it } from "vitest";
import type { LibraryPdfDrawing, LibraryPdfNote } from "../domain/reference-library";
import { LibraryPdfMarkupLayer, libraryPdfMarkupLayerActionEvent, type LibraryPdfMarkupLayerAction } from "./library-pdf-markup-layer";

class TestMarkupLayer extends LibraryPdfMarkupLayer {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  emitForTest(action: LibraryPdfMarkupLayerAction): void {
    this.emitAction(action);
  }
}

const drawing: LibraryPdfDrawing = {
  id: "drawing-1",
  kind: "drawing",
  referenceId: "reference-1",
  artifactId: "artifact-1",
  page: 2,
  color: "#ff0000",
  width: 4,
  points: [
    { x: 0.1, y: 0.2 },
    { x: 0.3, y: 0.4 },
  ],
  createdAt: "created",
  updatedAt: "updated",
};

const note: LibraryPdfNote = {
  id: "note-1",
  kind: "note",
  referenceId: "reference-1",
  artifactId: "artifact-1",
  page: 2,
  x: 0.4,
  y: 0.5,
  body: "Private note",
  createdAt: "created",
  updatedAt: "updated",
};

describe("library PDF markup layer", () => {
  it("owns empty, drawing, draft, selected-note, and open-note presentation", () => {
    const layer = new TestMarkupLayer();
    expect(layer.rootForTest()).toBe(layer);
    expect(layer.renderForTest()).toBeDefined();
    layer.setData({
      drawings: [drawing, { ...drawing, id: "draft" }],
      noteDraft: { page: 2, x: 0.2, y: 0.3, editingId: null },
      notes: [note],
      openNoteId: note.id,
      page: 2,
      selectedMarkupId: note.id,
      tool: "select",
    });
    expect(layer.renderForTest()).toBeDefined();
    layer.setData({
      drawings: [],
      noteDraft: { page: 1, x: 0.2, y: 0.3, editingId: note.id },
      notes: [note],
      openNoteId: null,
      page: 2,
      selectedMarkupId: null,
      tool: "draw",
    });
    expect(layer.renderForTest()).toBeDefined();
  });

  it("emits a typed note-card close intent", () => {
    const layer = new TestMarkupLayer();
    const actions: LibraryPdfMarkupLayerAction[] = [];
    layer.addEventListener(libraryPdfMarkupLayerActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfMarkupLayerAction>).detail);
    });
    layer.emitForTest({ action: "close-note", noteId: note.id });
    expect(actions).toEqual([{ action: "close-note", noteId: note.id }]);
  });
});
