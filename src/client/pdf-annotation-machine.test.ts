import { afterEach, describe, expect, it } from "vitest";
import { createPdfAnnotationActor, pdfAnnotationTool, type PdfAnnotationActor } from "./pdf-annotation-machine";

const actors: PdfAnnotationActor[] = [];
const point = { x: 0.25, y: 0.5 };

afterEach(() => {
  for (const actor of actors.splice(0)) actor.stop();
});

function actor(): PdfAnnotationActor {
  const value = createPdfAnnotationActor();
  actors.push(value);
  return value;
}

describe("PDF annotation interaction machine", () => {
  it("starts in text mode and resets transient interaction when tools change", () => {
    const value = actor();
    expect(pdfAnnotationTool(value.getSnapshot())).toBe("text");

    value.send({ type: "CHOOSE_TOOL", tool: "note" });
    expect(pdfAnnotationTool(value.getSnapshot())).toBe("note");
    value.send({ type: "PLACE_NOTE", page: 2, point });
    expect(value.getSnapshot()).toMatchObject({ value: "composingNote", context: { note: { page: 2, ...point } } });
    expect(pdfAnnotationTool(value.getSnapshot())).toBe("note");

    value.send({ type: "CHOOSE_TOOL", tool: "draw" });
    expect(pdfAnnotationTool(value.getSnapshot())).toBe("draw");
    expect(value.getSnapshot().context).toEqual({
      selectedHighlightId: null,
      selectedMarkupId: null,
      note: null,
      drawing: null,
      noteDrag: null,
      notePress: null,
    });
    value.send({ type: "RESET" });
    expect(pdfAnnotationTool(value.getSnapshot())).toBe("text");
  });

  it("models note composition and editing as exclusive states", () => {
    const value = actor();
    value.send({ type: "CHOOSE_TOOL", tool: "note" });
    value.send({ type: "PLACE_NOTE", page: 3, point });
    expect(value.getSnapshot().context.note).toEqual({ page: 3, ...point, editingId: null });
    value.send({ type: "CANCEL_NOTE" });
    expect(value.getSnapshot()).toMatchObject({ value: "noteIdle", context: { note: null } });

    value.send({ type: "PLACE_NOTE", page: 3, point });
    value.send({ type: "NOTE_SAVED" });
    expect(value.getSnapshot()).toMatchObject({ value: "noteIdle", context: { note: null } });

    value.send({ type: "EDIT_NOTE", id: "note-1", page: 4, point });
    expect(pdfAnnotationTool(value.getSnapshot())).toBe("select");
    expect(value.getSnapshot()).toMatchObject({
      value: "editingNote",
      context: { selectedMarkupId: "note-1", note: { page: 4, ...point, editingId: "note-1" } },
    });
    value.send({ type: "NOTE_SAVED" });
    expect(value.getSnapshot()).toMatchObject({ value: "selectIdle", context: { note: null } });
  });

  it("places a note only after a stationary pointer gesture completes", () => {
    const value = actor();
    value.send({ type: "CHOOSE_TOOL", tool: "note" });
    value.send({ type: "START_NOTE_PRESS", pointerId: 4, page: 2, point, x: 10, y: 10 });
    expect(value.getSnapshot()).toMatchObject({ value: "pressingNote", context: { note: null } });
    value.send({ type: "MOVE_NOTE_PRESS", pointerId: 4, x: 14, y: 13 });
    value.send({ type: "FINISH_NOTE_PRESS", pointerId: 4 });
    expect(value.getSnapshot()).toMatchObject({ value: "composingNote", context: { note: { page: 2, ...point } } });

    value.send({ type: "NOTE_SAVED" });
    value.send({ type: "START_NOTE_PRESS", pointerId: 5, page: 2, point, x: 10, y: 10 });
    value.send({ type: "MOVE_NOTE_PRESS", pointerId: 5, x: 10, y: 40 });
    value.send({ type: "FINISH_NOTE_PRESS", pointerId: 5 });
    expect(value.getSnapshot()).toMatchObject({ value: "noteIdle", context: { note: null, notePress: null } });
  });

  it("accepts drawing samples only from the active pointer", () => {
    const value = actor();
    value.send({ type: "CHOOSE_TOOL", tool: "draw" });
    value.send({ type: "START_DRAWING", pointerId: 7, point });
    value.send({ type: "ADD_DRAWING_POINTS", pointerId: 8, points: [{ x: 0.3, y: 0.6 }] });
    expect(value.getSnapshot().context.drawing?.points).toEqual([point]);

    value.send({ type: "ADD_DRAWING_POINTS", pointerId: 7, points: [{ x: 0.3, y: 0.6 }] });
    expect(value.getSnapshot().context.drawing?.points).toEqual([point, { x: 0.3, y: 0.6 }]);
    value.send({ type: "FINISH_DRAWING", pointerId: 8 });
    expect(value.getSnapshot().value).toBe("drawing");
    value.send({ type: "FINISH_DRAWING", pointerId: 7 });
    expect(value.getSnapshot()).toMatchObject({ value: "drawIdle", context: { drawing: null } });

    value.send({ type: "START_DRAWING", pointerId: 9, point });
    value.send({ type: "ADD_DRAWING_POINTS", pointerId: 9, points: [] });
    expect(value.getSnapshot().context.drawing?.points).toEqual([point]);
    value.send({ type: "CANCEL_POINTER" });
    expect(value.getSnapshot()).toMatchObject({ value: "drawIdle", context: { drawing: null } });
  });

  it("keeps selection and note dragging within select mode", () => {
    const value = actor();
    value.send({ type: "CHOOSE_TOOL", tool: "select" });
    expect(pdfAnnotationTool(value.getSnapshot())).toBe("select");
    value.send({ type: "SELECT_HIGHLIGHT", id: "highlight-1" });
    expect(value.getSnapshot().context).toMatchObject({ selectedHighlightId: "highlight-1", selectedMarkupId: null });
    value.send({ type: "SELECT_MARKUP", id: "note-1" });
    expect(value.getSnapshot().context).toMatchObject({ selectedHighlightId: null, selectedMarkupId: "note-1" });

    value.send({ type: "START_NOTE_DRAG", id: "note-1", pointerId: 2, x: 10, y: 10 });
    expect(pdfAnnotationTool(value.getSnapshot())).toBe("select");
    value.send({ type: "MOVE_NOTE_DRAG", pointerId: 3, x: 30, y: 30 });
    expect(value.getSnapshot().context.noteDrag?.moved).toBe(false);
    value.send({ type: "MOVE_NOTE_DRAG", pointerId: 2, x: 16, y: 10 });
    expect(value.getSnapshot().context.noteDrag?.moved).toBe(true);
    value.send({ type: "FINISH_NOTE_DRAG", pointerId: 3 });
    expect(value.getSnapshot().value).toBe("draggingNote");
    value.send({ type: "FINISH_NOTE_DRAG", pointerId: 2 });
    expect(value.getSnapshot()).toMatchObject({ value: "selectIdle", context: { noteDrag: null } });

    value.send({ type: "CLEAR_SELECTION" });
    expect(value.getSnapshot().context).toMatchObject({ selectedHighlightId: null, selectedMarkupId: null });

    value.send({ type: "START_NOTE_DRAG", id: "note-2", pointerId: 4, x: 0, y: 0 });
    value.send({ type: "CANCEL_POINTER" });
    expect(value.getSnapshot()).toMatchObject({ value: "selectIdle", context: { noteDrag: null } });
  });

  it("ignores interaction events that do not belong to the active tool", () => {
    const value = actor();
    value.send({ type: "START_DRAWING", pointerId: 1, point });
    value.send({ type: "PLACE_NOTE", page: 1, point });
    value.send({ type: "START_NOTE_DRAG", id: "note-1", pointerId: 1, x: 0, y: 0 });
    expect(value.getSnapshot()).toMatchObject({ value: "text", context: { note: null, drawing: null, noteDrag: null } });
  });
});
