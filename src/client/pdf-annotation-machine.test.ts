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
      openNoteId: null,
      note: null,
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

  it("toggles an opened note card and closes it before editing", () => {
    const value = actor();
    value.send({ type: "TOGGLE_NOTE_CARD", id: "note-1" });
    expect(value.getSnapshot().context.openNoteId).toBe("note-1");
    value.send({ type: "TOGGLE_NOTE_CARD", id: "note-1" });
    expect(value.getSnapshot().context.openNoteId).toBeNull();

    value.send({ type: "TOGGLE_NOTE_CARD", id: "note-2" });
    value.send({ type: "CLOSE_NOTE_CARD" });
    expect(value.getSnapshot().context.openNoteId).toBeNull();

    value.send({ type: "TOGGLE_NOTE_CARD", id: "note-1" });
    value.send({ type: "EDIT_NOTE", id: "note-1", page: 4, point });
    expect(value.getSnapshot().context.openNoteId).toBeNull();
  });

  it("keeps highlight and markup selection within select mode", () => {
    const value = actor();
    value.send({ type: "CHOOSE_TOOL", tool: "select" });
    expect(pdfAnnotationTool(value.getSnapshot())).toBe("select");
    value.send({ type: "SELECT_HIGHLIGHT", id: "highlight-1" });
    expect(value.getSnapshot().context).toMatchObject({ selectedHighlightId: "highlight-1", selectedMarkupId: null });
    value.send({ type: "SELECT_MARKUP", id: "note-1" });
    expect(value.getSnapshot().context).toMatchObject({ selectedHighlightId: null, selectedMarkupId: "note-1" });

    value.send({ type: "CLEAR_SELECTION" });
    expect(value.getSnapshot().context).toMatchObject({ selectedHighlightId: null, selectedMarkupId: null });
  });

  it("ignores interaction events that do not belong to the active tool", () => {
    const value = actor();
    value.send({ type: "PLACE_NOTE", page: 1, point });
    expect(value.getSnapshot()).toMatchObject({ value: "text", context: { note: null } });
  });
});
