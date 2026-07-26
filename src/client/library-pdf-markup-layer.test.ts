import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryPdfDrawing, LibraryPdfNote } from "../domain/reference-library";
import {
  LibraryPdfMarkupLayer,
  libraryPdfMarkupActionEvent,
  libraryPdfShapeRecognizedEvent,
  type LibraryPdfMarkupAction,
  type LibraryPdfShapeRecognition,
} from "./library-pdf-markup-layer";

class TestMarkupLayer extends LibraryPdfMarkupLayer {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("owns empty, drawing, draft, selected-note, and open-note presentation", () => {
    const layer = new TestMarkupLayer();
    Object.defineProperty(layer, "dataset", { value: {} });
    expect(layer.rootForTest()).toBe(layer);
    expect(layer.renderForTest()).toBeDefined();
    layer.setData({
      drawingStyle: { color: "#000000", width: 3 },
      drawings: [drawing, { ...drawing, id: "draft" }],
      notes: [note],
      page: 2,
    });
    layer.chooseTool("note");
    layer.placeNote(2, { x: 0.2, y: 0.3 });
    layer.chooseTool("select");
    layer.selectMarkup(note.id);
    layer.toggleNoteCard(note.id);
    expect(layer.renderForTest()).toBeDefined();
    layer.setData({
      drawingStyle: { color: "#000000", width: 3 },
      drawings: [],
      notes: [note],
      page: 2,
    });
    layer.editNote(note);
    expect(layer.renderForTest()).toBeDefined();
  });

  it("owns tool, selection, note composition, and note-card state", () => {
    const layer = new TestMarkupLayer();
    Object.defineProperty(layer, "dataset", { value: {} });
    expect(layer.tool).toBe("text");
    layer.placeNote(2, { x: 0.2, y: 0.3 });
    expect(layer.noteDraft).toBeNull();
    layer.chooseTool("note");
    layer.placeNote(2, { x: 0.2, y: 0.3 });
    expect(layer.noteDraft).toEqual({ page: 2, x: 0.2, y: 0.3, editingId: null });
    layer.clearNote();
    expect(layer.noteDraft).toBeNull();

    layer.chooseTool("select");
    layer.selectHighlight("highlight-1");
    expect(layer.selectedHighlightId).toBe("highlight-1");
    layer.selectMarkup(note.id);
    expect(layer.selectedHighlightId).toBeNull();
    expect(layer.selectedMarkupId).toBe(note.id);
    layer.toggleNoteCard(note.id);
    layer.toggleNoteCard(note.id);
    layer.editNote(note);
    expect(layer.noteDraft).toEqual({ page: 2, x: 0.4, y: 0.5, editingId: note.id });
    layer.clearSelection();
    expect(layer.selectedMarkupId).toBeNull();
    layer.resetState();
    expect(layer.tool).toBe("select");
  });

  it("owns interaction state and normalized pointer geometry", () => {
    const layer = new TestMarkupLayer();
    const dataset: Record<string, string> = {};
    Object.defineProperties(layer, {
      dataset: { value: dataset },
      getBoundingClientRect: { configurable: true, value: () => ({ height: 200, left: 10, top: 20, width: 400 }) },
      querySelector: { configurable: true, value: () => null },
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
    ).toEqual([
      { x: 0.1, y: 0.2 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(layer.extendDrawing({ clientX: 50, clientY: 60 }, [{ x: 0.1, y: 0.2 }])).toBeNull();
    const preventDefault = vi.fn();
    expect(layer.continueDrawing({ clientX: 210, clientY: 120, pointerId: 9, preventDefault })).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    layer.cancelShapeRecognition();
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

  it("resolves markup targets and persists note moves without exposing component selectors", async () => {
    const layer = new TestMarkupLayer();
    const actions: LibraryPdfMarkupAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const pin = { dataset: { markupId: "note-1" }, style: { left: "", top: "" } };
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: {
        configurable: true,
        value: () => ({ height: 200, left: 10, top: 20, width: 400 }),
      },
      querySelector: { value: () => null },
      querySelectorAll: { value: () => [pin] },
      setPointerCapture: { value: vi.fn() },
    });
    layer.setData({ drawingStyle: { color: "#000000", width: 3 }, drawings: [], notes: [note], page: 2 });
    layer.addEventListener(libraryPdfMarkupActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfMarkupAction>).detail));
    const target = (selector: string, id: string | null) =>
      Object.assign(new EventTarget(), {
        closest: (candidate: string) =>
          candidate === selector ? { getAttribute: (name: string) => (name === "data-markup-id" ? id : null) } : null,
      });
    const preventDefault = vi.fn();
    const pointer = (pointerTarget: EventTarget, pointerType = "mouse") => ({
      clientX: 210,
      clientY: 120,
      pointerId: 7,
      pointerType,
      preventDefault,
      target: pointerTarget,
    });

    expect(layer.markupTarget(target(".pdf-note-pin", "note-1"))).toEqual({ id: "note-1", kind: "note" });
    expect(layer.markupTarget(target(".pdf-note-pin", null))).toEqual({ id: null, kind: "note" });
    expect(layer.markupTarget(target(".pdf-ink-stroke", "drawing-1"))).toEqual({ id: "drawing-1", kind: "drawing" });
    expect(layer.markupTarget(target(".pdf-ink-stroke", null))).toBeNull();

    layer.setInteraction("select");
    expect(layer.pointerAction(pointer(target(".pdf-note-pin", "note-1")))).toEqual({ id: "note-1", kind: "note" });
    expect(layer.continueNoteDrag({ clientX: 213, clientY: 120, pointerId: 7, preventDefault })).toBe(true);
    expect(layer.continueNoteDrag({ clientX: 220, clientY: 120, pointerId: 7, preventDefault })).toBe(true);
    expect(pin.style).toEqual({ left: "52.5%", top: "50%" });
    await expect(layer.finishNoteDrag({ clientX: 220, clientY: 120, pointerId: 8 })).resolves.toBe(false);
    await expect(layer.finishNoteDrag({ clientX: 220, clientY: 120, pointerId: 7 })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/references/reference-1/pdf-markups/note-1",
      expect.objectContaining({ body: JSON.stringify({ x: 0.525, y: 0.5 }), method: "PATCH" }),
    );
    expect(actions).toEqual([{ action: "note-moved" }]);
    expect(layer.cancelNoteDrag()).toBe(false);
    expect(layer.pointerAction(pointer(target(".pdf-note-pin", null)))).toBeNull();
    expect(layer.pointerAction(pointer(target(".pdf-ink-stroke", "drawing-1")))).toEqual({ id: "drawing-1", kind: "drawing" });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(layer.pointerAction(pointer(new EventTarget()))).toBeNull();
    layer.setInteraction("note");
    expect(layer.pointerAction(pointer(new EventTarget()))).toEqual({ kind: "start-note" });
    expect(layer.continueNotePress({ clientX: 213, clientY: 120, pointerId: 8, preventDefault })).toBe(false);
    expect(layer.continueNotePress({ clientX: 213, clientY: 120, pointerId: 7, preventDefault })).toBe(true);
    expect(layer.finishNotePress(8)).toBeNull();
    expect(layer.finishNotePress(7)).toEqual({ point: { x: 0.5, y: 0.5 } });
    expect(layer.pointerAction(pointer(new EventTarget()))).toEqual({ kind: "start-note" });
    expect(layer.continueNotePress({ clientX: 220, clientY: 120, pointerId: 7, preventDefault })).toBe(true);
    expect(layer.finishNotePress(7)).toEqual({ point: null });
    expect(layer.pointerAction(pointer(new EventTarget()))).toEqual({ kind: "start-note" });
    layer.cancelNotePress();
    expect(layer.finishNotePress(7)).toBeNull();
    layer.setInteraction("draw");
    expect(layer.pointerAction(pointer(new EventTarget(), "touch"))).toEqual({ kind: "touch-drawing" });
    expect(layer.pointerAction(pointer(new EventTarget()))).toEqual({ kind: "start-drawing" });
    expect(layer.continueDrawing({ clientX: 250, clientY: 120, pointerId: 8, preventDefault })).toBe(false);
    expect(layer.continueDrawing({ clientX: 250, clientY: 120, pointerId: 7, preventDefault })).toBe(true);
    expect(layer.finishDrawing(8)).toBeNull();
    expect(layer.finishDrawing(7)).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 0.6, y: 0.5 },
    ]);
    expect(layer.cancelDrawing()).toBe(false);
    expect(preventDefault).toHaveBeenCalledTimes(4);
    expect(layer.setPointerCapture).toHaveBeenCalledTimes(2);
  });

  it("reports note-move failures, blocks overlap, and permits retry", async () => {
    const layer = new TestMarkupLayer();
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(pendingResponse)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { value: () => ({ height: 200, left: 10, top: 20, width: 400 }) },
      querySelector: { value: () => null },
      querySelectorAll: { value: () => [] },
      setPointerCapture: { value: vi.fn() },
    });
    layer.setData({ drawingStyle: { color: "#000000", width: 3 }, drawings: [], notes: [note], page: 2 });
    layer.chooseTool("select");
    const target = Object.assign(new EventTarget(), {
      closest: (selector: string) => (selector === ".pdf-note-pin" ? { getAttribute: () => note.id } : null),
    });
    const pointer = (clientX: number, pointerId: number) => ({
      clientX,
      clientY: 120,
      pointerId,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target,
    });

    expect(layer.pointerAction(pointer(210, 7))).toEqual({ id: note.id, kind: "note" });
    layer.continueNoteDrag(pointer(220, 7));
    const first = layer.finishNoteDrag(pointer(220, 7));
    expect(layer.pointerAction(pointer(220, 8))).toBeNull();
    respond(new Response("Unavailable", { status: 503 }));
    await first;
    expect(layer.renderForTest()).toBeDefined();

    expect(layer.pointerAction(pointer(220, 8))).toEqual({ id: note.id, kind: "note" });
    layer.continueNoteDrag(pointer(230, 8));
    await layer.finishNoteDrag(pointer(230, 8));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("owns delayed shape recognition and cancellation", () => {
    vi.useFakeTimers();
    const layer = new TestMarkupLayer();
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { configurable: true, value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
      querySelector: { configurable: true, value: () => null },
      setPointerCapture: { value: vi.fn() },
    });
    layer.setInteraction("draw");
    expect(
      layer.pointerAction({
        clientX: 40,
        clientY: 40,
        pointerId: 7,
        pointerType: "mouse",
        preventDefault: vi.fn(),
        target: new EventTarget(),
      }),
    ).toEqual({ kind: "start-drawing" });
    const recognized: LibraryPdfShapeRecognition[] = [];
    layer.addEventListener(libraryPdfShapeRecognizedEvent, (event) => {
      recognized.push((event as CustomEvent<LibraryPdfShapeRecognition>).detail);
    });

    layer.scheduleShapeRecognition([
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.2 },
    ]);
    vi.advanceTimersByTime(849);
    expect(recognized).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(recognized).toEqual([{ kind: "line" }]);

    const preventDefault = vi.fn();
    expect(layer.adjustRecognizedShape({ clientX: 210, clientY: 220, pointerId: 7, preventDefault })).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(layer.finishDrawing(7)).toEqual(expect.any(Array));

    layer.setInteraction("draw");
    layer.pointerAction({
      clientX: 40,
      clientY: 40,
      pointerId: 8,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target: new EventTarget(),
    });
    layer.scheduleShapeRecognition(drawing.points);
    layer.cancelShapeRecognition();
    vi.runAllTimers();
    expect(recognized).toHaveLength(1);
    expect(layer.adjustRecognizedShape({ clientX: 0, clientY: 0, pointerId: 8, preventDefault })).toBe(false);
    expect(layer.cancelDrawing()).toBe(true);
  });
});
