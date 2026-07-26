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

  it("owns interaction state and normalized pointer geometry", () => {
    const layer = new TestMarkupLayer();
    const dataset: Record<string, string> = {};
    Object.defineProperties(layer, {
      dataset: { value: dataset },
      getBoundingClientRect: { configurable: true, value: () => ({ height: 200, left: 10, top: 20, width: 400 }) },
    });

    layer.setInteraction("draw", true);
    expect(dataset).toEqual({ drawingActive: "true", tool: "draw" });
    expect(layer.point({ clientX: 210, clientY: 120 })).toEqual({ x: 0.5, y: 0.5 });
    expect(layer.point({ clientX: -10, clientY: 300 })).toEqual({ x: 0, y: 1 });
    expect(
      layer.extendDrawing(
        {
          clientX: 210,
          clientY: 120,
          getCoalescedEvents: () => [
            { clientX: 50, clientY: 60 },
            { clientX: 210, clientY: 120 },
          ],
        },
        [{ x: 0.1, y: 0.2 }],
      ),
    ).toEqual({
      additions: [{ x: 0.5, y: 0.5 }],
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.5 },
      ],
    });
    expect(layer.extendDrawing({ clientX: 50, clientY: 60 }, [{ x: 0.1, y: 0.2 }])).toBeNull();
    const recognized = layer.recognizeShape([
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.2 },
    ]);
    expect(recognized?.shape.kind).toBe("line");
    expect(recognized?.points).toEqual([
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.2 },
    ]);
    expect(recognized && layer.adjustShape(recognized.shape, { clientX: 210, clientY: 220 })).toBeDefined();
    layer.setInteraction("select");
    expect(dataset).toEqual({ tool: "select" });

    Object.defineProperty(layer, "getBoundingClientRect", { value: () => ({ height: 0, left: 0, top: 0, width: 0 }) });
    expect(layer.point({ clientX: 0, clientY: 0 })).toBeNull();
    expect(layer.recognizeShape(drawing.points)).toBeNull();
    expect(recognized && layer.adjustShape(recognized.shape, { clientX: 0, clientY: 0 })).toBeNull();
  });
});
