import type { TemplateResult } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryPdfArtifact, LibraryPdfDrawing, LibraryPdfNote } from "../../domain/reference-library";
import { LibraryPdfMarkupLayer, libraryPdfMarkupActionEvent, type LibraryPdfMarkupAction } from "./library-pdf-markup-layer";

class TestMarkupLayer extends LibraryPdfMarkupLayer {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  async retryDrawingForTest(): Promise<void> {
    await this.retryDrawing();
  }

  discardDrawingForTest(): void {
    this.discardFailedDrawing();
  }
}

function requiredTemplateResult(value: unknown): TemplateResult {
  if (typeof value !== "object" || value === null || !("_$litType$" in value) || !("strings" in value) || !("values" in value)) {
    throw new Error("Expected a Lit template result");
  }
  return value as TemplateResult;
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

const artifact: LibraryPdfArtifact = {
  contentType: "application/pdf",
  createdAt: "created",
  fingerprint: "fingerprint",
  id: "artifact-1",
  name: "paper.pdf",
  objectKey: "library/paper.pdf",
  referenceId: "reference-1",
  rights: "private",
  size: 2048,
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
      drawingTarget: null,
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
      drawingTarget: null,
      drawings: [],
      notes: [note],
      page: 2,
    });
    layer.editNote(note);
    expect(layer.renderForTest()).toBeDefined();
  });

  it("renders saved drawings as painted SVG polylines", () => {
    const layer = new TestMarkupLayer();
    layer.setData({
      drawingStyle: { color: "#000000", width: 3 },
      drawingTarget: null,
      drawings: [drawing],
      notes: [],
      page: 2,
    });
    layer.selectMarkup(drawing.id);

    const inkLayer = requiredTemplateResult(layer.renderForTest().values[0]);
    const drawingTemplates = inkLayer.values[0];
    if (!Array.isArray(drawingTemplates)) throw new Error("Expected drawing templates");
    const drawingTemplate = requiredTemplateResult(drawingTemplates[0]);

    expect(drawingTemplate._$litType$).toBe(2);
    expect(drawingTemplate.strings.join("")).toContain('class="pdf-ink-stroke"');
    expect(drawingTemplate.strings.join("")).toContain('fill="none"');
    expect(drawingTemplate.strings.join("")).toContain('stroke-linecap="round"');
    expect(drawingTemplate.strings.join("")).toContain('stroke-linejoin="round"');
    expect(drawingTemplate.strings.join("")).toContain('vector-effect="non-scaling-stroke"');
    expect(drawingTemplate.values).toEqual(["100,200 300,400", "#ff0000", 4, "drawing-1", "true"]);
  });

  it("derives page-local drawings and notes from canonical Library markups", () => {
    const layer = new TestMarkupLayer();
    const setData = vi.spyOn(layer, "setData");
    const drawings = layer.setLibraryPage(
      artifact,
      [drawing, note, { ...drawing, id: "other-page", page: 3 }, { ...note, artifactId: "other-artifact", id: "other-artifact" }],
      2,
      { color: "#000000", width: 3 },
    );

    expect(drawings).toEqual([drawing]);
    expect(setData).toHaveBeenCalledWith({
      drawingStyle: { color: "#000000", width: 3 },
      drawingTarget: { artifactId: "artifact-1", referenceId: "reference-1" },
      drawings: [drawing],
      notes: [note],
      page: 2,
    });

    expect(layer.setLibraryPage(undefined, [drawing, note], 2, { color: "#000000", width: 3 })).toEqual([]);
    expect(setData).toHaveBeenLastCalledWith(expect.objectContaining({ drawingTarget: null, drawings: [], notes: [] }));
  });

  it("owns tool, selection, note composition, and note-card state", () => {
    const layer = new TestMarkupLayer();
    Object.defineProperty(layer, "dataset", { value: {} });
    expect(layer.tool).toBe("select");
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
    layer.setData({ drawingStyle: { color: "#000000", width: 3 }, drawingTarget: null, drawings: [], notes: [note], page: 2 });
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
    await layer.finishDrawing(8);
    await layer.finishDrawing(7);
    expect(layer.cancelDrawing()).toBe(false);
    expect(preventDefault).toHaveBeenCalledTimes(4);
    expect(layer.setPointerCapture).toHaveBeenCalledTimes(2);
  });

  it("owns host pointer-event routing and emits completed local intents", async () => {
    const layer = new TestMarkupLayer();
    let markupTarget: string | null = null;
    Object.defineProperties(layer, {
      closest: {
        value: (selector: string) =>
          selector === markupTarget ? { getAttribute: (name: string) => (name === "data-markup-id" ? "drawing-1" : null) } : null,
      },
      dataset: { value: {} },
      getBoundingClientRect: { value: () => ({ height: 200, left: 10, top: 20, width: 400 }) },
      setPointerCapture: { value: vi.fn() },
    });
    layer.setData({
      drawingStyle: { color: "#000000", width: 3 },
      drawingTarget: { artifactId: "artifact-1", referenceId: "reference-1" },
      drawings: [],
      notes: [],
      page: 2,
    });
    const actions: LibraryPdfMarkupAction[] = [];
    layer.addEventListener(libraryPdfMarkupActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfMarkupAction>).detail);
    });
    layer.chooseTool("note");
    layer.dispatchEvent(pointerEvent("pointerdown", { clientX: 210, clientY: 120, pointerId: 7, pointerType: "mouse" }));
    layer.dispatchEvent(pointerEvent("pointerup", { clientX: 210, clientY: 120, pointerId: 7, pointerType: "mouse" }));
    await vi.waitFor(() => expect(actions).toHaveLength(1));
    expect(actions[0]).toEqual({
      action: "place-note",
      draft: { artifactId: "artifact-1", editingId: null, page: 2, referenceId: "reference-1", x: 0.5, y: 0.5 },
    });

    layer.chooseTool("draw");
    layer.dispatchEvent(pointerEvent("pointerdown", { clientX: 210, clientY: 120, pointerId: 8, pointerType: "touch" }));
    expect(actions.at(-1)).toEqual({
      action: "status",
      message: "Use Apple Pencil or a mouse to draw; touch gestures pan and zoom the page.",
    });
    layer.dispatchEvent(pointerEvent("pointercancel", { clientX: 210, clientY: 120, pointerId: 8, pointerType: "touch" }));

    markupTarget = ".pdf-ink-stroke";
    layer.chooseTool("select");
    layer.dispatchEvent(pointerEvent("pointerdown", { clientX: 210, clientY: 120, pointerId: 9, pointerType: "mouse" }));
    expect(actions.at(-1)).toEqual({ action: "select-markup", id: "drawing-1" });

    markupTarget = null;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    layer.chooseTool("draw");
    layer.dispatchEvent(pointerEvent("pointerdown", { clientX: 210, clientY: 120, pointerId: 10, pointerType: "mouse" }));
    layer.dispatchEvent(pointerEvent("pointermove", { clientX: 250, clientY: 120, pointerId: 10, pointerType: "mouse" }));
    layer.dispatchEvent(pointerEvent("pointerup", { clientX: 250, clientY: 120, pointerId: 10, pointerType: "mouse" }));
    await vi.waitFor(() => expect(actions.at(-1)).toEqual({ action: "drawing-saved" }));
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
    layer.setData({ drawingStyle: { color: "#000000", width: 3 }, drawingTarget: null, drawings: [], notes: [note], page: 2 });
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

  it("owns drawing persistence, overlap suppression, retry, and discard", async () => {
    const layer = new TestMarkupLayer();
    const actions: LibraryPdfMarkupAction[] = [];
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(pendingResponse)
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
      querySelector: { value: () => null },
      setPointerCapture: { value: vi.fn() },
    });
    layer.setData({
      drawingStyle: { color: "#123456", width: 7 },
      drawingTarget: { artifactId: "artifact:1", referenceId: "reference/1" },
      drawings: [],
      notes: [],
      page: 3,
    });
    layer.addEventListener(libraryPdfMarkupActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfMarkupAction>).detail));
    const pointer = (clientX: number, pointerId: number) => ({
      clientX,
      clientY: 40,
      pointerId,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target: new EventTarget(),
    });
    layer.chooseTool("draw");
    layer.pointerAction(pointer(40, 7));
    layer.continueDrawing(pointer(200, 7));

    const first = layer.finishDrawing(7);
    expect(layer.pointerAction(pointer(40, 8))).toBeNull();
    respond(new Response("Unavailable", { status: 503 }));
    await first;
    expect(layer.renderForTest()).toBeDefined();
    await layer.retryDrawingForTest();
    layer.discardDrawingForTest();

    layer.pointerAction(pointer(40, 8));
    layer.continueDrawing(pointer(200, 8));
    await layer.finishDrawing(8);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/library/references/reference%2F1/pdf-markups");
    expect(init).toEqual(expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: "drawing",
      artifactId: "artifact:1",
      color: "#123456",
      page: 3,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.2 },
      ],
      width: 7,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(actions).toEqual([{ action: "drawing-saved" }]);
  });

  it("owns delayed shape recognition and cancellation", async () => {
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
    const actions: LibraryPdfMarkupAction[] = [];
    layer.addEventListener(libraryPdfMarkupActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfMarkupAction>).detail);
    });

    layer.scheduleShapeRecognition([
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.2 },
    ]);
    vi.advanceTimersByTime(849);
    expect(actions).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(actions).toEqual([{ action: "status", message: "Line snapped into place. Keep dragging to adjust it, or lift to save." }]);

    const preventDefault = vi.fn();
    expect(layer.adjustRecognizedShape({ clientX: 210, clientY: 220, pointerId: 7, preventDefault })).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    await layer.finishDrawing(7);

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
    expect(actions).toHaveLength(1);
    expect(layer.adjustRecognizedShape({ clientX: 0, clientY: 0, pointerId: 8, preventDefault })).toBe(false);
    expect(layer.cancelDrawing()).toBe(true);
  });
});

function pointerEvent(type: string, values: Record<string, number | string>): Event {
  const event = new Event(type);
  Object.defineProperties(event, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { configurable: true, value }])));
  return event;
}
