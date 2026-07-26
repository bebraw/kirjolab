import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryPdfDrawing, LibraryPdfNote } from "../domain/reference-library";
import {
  LibraryPdfMarkupLayer,
  libraryPdfMarkupLayerActionEvent,
  libraryPdfShapeAdjustedEvent,
  libraryPdfShapeRecognizedEvent,
  type LibraryPdfMarkupLayerAction,
  type LibraryPdfShapeAdjustment,
  type LibraryPdfShapeRecognition,
} from "./library-pdf-markup-layer";

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
  afterEach(() => vi.useRealTimers());

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
    ).toEqual({
      additions: [{ x: 0.5, y: 0.5 }],
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.5 },
      ],
    });
    expect(layer.extendDrawing({ clientX: 50, clientY: 60 }, [{ x: 0.1, y: 0.2 }])).toBeNull();
    const preventDefault = vi.fn();
    expect(layer.continueDrawing({ clientX: 210, clientY: 120, pointerId: 9, preventDefault }, [{ x: 0.1, y: 0.2 }])).toEqual([
      { x: 0.5, y: 0.5 },
    ]);
    expect(preventDefault).toHaveBeenCalledOnce();
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

  it("resolves markup targets without exposing component selectors", () => {
    const layer = new TestMarkupLayer();
    const pin = { dataset: { markupId: "note-1" }, style: { left: "", top: "" } };
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: {
        configurable: true,
        value: () => ({ height: 200, left: 10, top: 20, width: 400 }),
      },
      querySelectorAll: { value: () => [pin] },
      setPointerCapture: { value: vi.fn() },
    });
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
    expect(layer.continueNoteDrag({ clientX: 213, clientY: 120, pointerId: 7, preventDefault }, "note-1")).toBe(false);
    expect(layer.continueNoteDrag({ clientX: 220, clientY: 120, pointerId: 7, preventDefault }, "note-1")).toBe(true);
    expect(pin.style).toEqual({ left: "52.5%", top: "50%" });
    expect(layer.finishNoteDrag({ clientX: 220, clientY: 120, pointerId: 8 })).toBeNull();
    expect(layer.finishNoteDrag({ clientX: 220, clientY: 120, pointerId: 7 })).toEqual({
      moved: true,
      point: { x: 0.525, y: 0.5 },
    });
    expect(layer.cancelNoteDrag()).toBe(false);
    expect(layer.pointerAction(pointer(target(".pdf-note-pin", null)))).toBeNull();
    expect(layer.pointerAction(pointer(target(".pdf-ink-stroke", "drawing-1")))).toEqual({ id: "drawing-1", kind: "drawing" });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(layer.pointerAction(pointer(new EventTarget()))).toBeNull();
    layer.setInteraction("note");
    expect(layer.pointerAction(pointer(new EventTarget()))).toEqual({ kind: "place-note", point: { x: 0.5, y: 0.5 } });
    layer.setInteraction("draw");
    expect(layer.pointerAction(pointer(new EventTarget(), "touch"))).toEqual({ kind: "touch-drawing" });
    expect(layer.pointerAction(pointer(new EventTarget()))).toEqual({ kind: "start-drawing", point: { x: 0.5, y: 0.5 } });
    expect(preventDefault).toHaveBeenCalledTimes(3);
    expect(layer.setPointerCapture).toHaveBeenCalledTimes(2);
  });

  it("owns delayed shape recognition and cancellation", () => {
    vi.useFakeTimers();
    const layer = new TestMarkupLayer();
    Object.defineProperties(layer, {
      getBoundingClientRect: { configurable: true, value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
      querySelector: { configurable: true, value: () => null },
    });
    const recognized: LibraryPdfShapeRecognition[] = [];
    layer.addEventListener(libraryPdfShapeRecognizedEvent, (event) => {
      recognized.push((event as CustomEvent<LibraryPdfShapeRecognition>).detail);
    });

    layer.scheduleShapeRecognition(7, [
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.2 },
    ]);
    vi.advanceTimersByTime(849);
    expect(recognized).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(recognized).toEqual([
      {
        kind: "line",
        pointerId: 7,
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.8, y: 0.2 },
        ],
      },
    ]);

    const adjusted: LibraryPdfShapeAdjustment[] = [];
    layer.addEventListener(libraryPdfShapeAdjustedEvent, (event) => {
      adjusted.push((event as CustomEvent<LibraryPdfShapeAdjustment>).detail);
    });
    const preventDefault = vi.fn();
    expect(layer.adjustRecognizedShape({ clientX: 210, clientY: 220, pointerId: 7, preventDefault })).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(adjusted).toEqual([{ pointerId: 7, points: expect.any(Array) }]);

    layer.scheduleShapeRecognition(8, drawing.points);
    layer.cancelShapeRecognition();
    vi.runAllTimers();
    expect(recognized).toHaveLength(1);
    expect(layer.adjustRecognizedShape({ clientX: 0, clientY: 0, pointerId: 8, preventDefault })).toBe(false);
  });
});
