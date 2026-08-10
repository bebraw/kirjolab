import type { TemplateResult } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryPdfArtifact, LibraryPdfDrawing, LibraryPdfNote } from "../../domain/reference-library";
import {
  LibraryPdfMarkupLayer,
  libraryPdfMarkupActionEvent,
  type LibraryPdfDrawingPreview,
  type LibraryPdfMarkupAction,
} from "./library-pdf-markup-layer";

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
  if (!isTemplateResult(value)) {
    throw new Error("Expected a Lit template result");
  }
  return value;
}

function isTemplateResult(value: unknown): value is TemplateResult {
  return typeof value === "object" && value !== null && "_$litType$" in value && "strings" in value && "values" in value;
}

function renderedDrawings(layer: TestMarkupLayer): TemplateResult[] {
  const inkLayer = layer.renderForTest().values[0];
  if (!isTemplateResult(inkLayer)) return [];
  return inkLayer.values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(isTemplateResult)
    .filter((value) => value.strings.join("").includes('class="pdf-ink-stroke"'));
}

function renderedDrawingRecovery(layer: TestMarkupLayer): TemplateResult | null {
  return (
    layer
      .renderForTest()
      .values.find(
        (value): value is TemplateResult => isTemplateResult(value) && value.strings.join("").includes("library-context-actions"),
      ) ?? null
  );
}

function drawingRecoveryPresentation(layer: TestMarkupLayer): {
  readonly discardDisabled: unknown;
  readonly retryDisabled: unknown;
  readonly retryLabel: unknown;
} | null {
  const recovery = renderedDrawingRecovery(layer);
  return recovery ? { discardDisabled: recovery.values[3], retryDisabled: recovery.values[0], retryLabel: recovery.values[2] } : null;
}

function drawingStatusPresentation(layer: TestMarkupLayer): readonly [unknown, unknown] {
  const rendered = layer.renderForTest();
  return [rendered.values[3], rendered.values[4]];
}

function savedAction(actions: readonly LibraryPdfMarkupAction[]): Extract<LibraryPdfMarkupAction, { readonly action: "drawing-saved" }> {
  const action = actions.find(
    (candidate): candidate is Extract<LibraryPdfMarkupAction, { readonly action: "drawing-saved" }> => candidate.action === "drawing-saved",
  );
  if (!action) throw new Error("Expected a drawing-saved action");
  return action;
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

const drawingSurfaceData = {
  drawingStyle: { color: "#ABCDEF", width: 7 },
  drawingTarget: { artifactId: "artifact:1", referenceId: "reference/1" },
  drawings: [],
  notes: [],
  page: 3,
} as const;

function drawingResponse(id: string): LibraryPdfDrawing {
  return {
    ...drawing,
    artifactId: drawingSurfaceData.drawingTarget.artifactId,
    color: "#abcdef",
    id,
    page: drawingSurfaceData.page,
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.5, y: 0.2 },
    ],
    referenceId: drawingSurfaceData.drawingTarget.referenceId,
    width: drawingSurfaceData.drawingStyle.width,
  };
}

function configureDrawingSurface(layer: TestMarkupLayer, actions: LibraryPdfMarkupAction[]): void {
  Object.defineProperties(layer, {
    dataset: { value: {} },
    getBoundingClientRect: { value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
    setPointerCapture: { value: vi.fn() },
  });
  layer.setData(drawingSurfaceData);
  layer.addEventListener(libraryPdfMarkupActionEvent, (event) => {
    actions.push((event as CustomEvent<LibraryPdfMarkupAction>).detail);
  });
  layer.chooseTool("draw");
}

function drawingPointer(clientX: number, clientY = 40) {
  return {
    clientX,
    clientY,
    pointerId: 7,
    pointerType: "mouse",
    preventDefault: vi.fn(),
    target: new EventTarget(),
  } as const;
}

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

  it("describes saved-note interaction for each active tool", () => {
    const layer = new TestMarkupLayer();
    Object.defineProperty(layer, "dataset", { value: {} });
    layer.setData({
      drawingStyle: { color: "#000000", width: 3 },
      drawingTarget: null,
      drawings: [],
      notes: [note],
      page: note.page,
    });
    const title = (): unknown => {
      const notes = layer.renderForTest().values[2];
      if (!Array.isArray(notes)) throw new Error("Expected rendered notes");
      return requiredTemplateResult(notes[0]).values[4];
    };

    expect(title()).toBe("Tap to select; drag to move");
    layer.chooseTool("note");
    expect(title()).toBe("Tap to select; drag to move");
    layer.chooseTool("draw");
    expect(title()).toBe("Choose Note or Select to edit this note");
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
    expect((layer as unknown as { readonly page: number | null }).page).toBe(2);

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
    const createdDrawingBase: LibraryPdfDrawing = {
      ...drawing,
      color: "#000000",
      points: [
        { x: 0.5, y: 0.5 },
        { x: 0.6, y: 0.5 },
      ],
      width: 3,
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const mutationId = String(JSON.parse(String(init?.body)).mutationId);
      return Response.json({ ...createdDrawingBase, id: mutationId }, { status: 201 });
    });
    layer.chooseTool("draw");
    layer.dispatchEvent(pointerEvent("pointerdown", { clientX: 210, clientY: 120, pointerId: 10, pointerType: "mouse" }));
    layer.dispatchEvent(pointerEvent("pointermove", { clientX: 250, clientY: 120, pointerId: 10, pointerType: "mouse" }));
    layer.dispatchEvent(pointerEvent("pointerup", { clientX: 250, clientY: 120, pointerId: 10, pointerType: "mouse" }));
    await vi.waitFor(() => expect(actions.some(({ action }) => action === "drawing-saved")).toBe(true));
    const saved = savedAction(actions);
    expect(saved).toEqual({
      action: "drawing-saved",
      drawing: { ...createdDrawingBase, id: saved.preview.provisionalId },
      drawingId: saved.preview.provisionalId,
      preview: expect.objectContaining({
        artifactId: createdDrawingBase.artifactId,
        drawingId: saved.preview.provisionalId,
        page: createdDrawingBase.page,
        referenceId: createdDrawingBase.referenceId,
      }),
    });
  });

  it("accepts a creation response only when its complete drawing payload matches", async () => {
    const layer = new TestMarkupLayer();
    const actions: LibraryPdfMarkupAction[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const mutationId = String(JSON.parse(String(init?.body)).mutationId);
      return Response.json(drawingResponse(mutationId), { status: 201 });
    });
    configureDrawingSurface(layer, actions);

    expect(layer.pointerAction(drawingPointer(40))).toEqual({ kind: "start-drawing" });
    expect(layer.continueDrawing(drawingPointer(200))).toBe(true);
    await layer.finishDrawing(7);

    const saved = savedAction(actions);
    expect(saved.drawingId).toBe(saved.preview.provisionalId);
    expect(saved.drawing).toEqual(drawingResponse(saved.preview.provisionalId));
  });

  it.each([
    {
      difference: "artifact identity",
      exposesCreatedId: false,
      vary: (value: LibraryPdfDrawing) => ({ ...value, artifactId: "artifact:other" }),
    },
    {
      difference: "reference identity",
      exposesCreatedId: false,
      vary: (value: LibraryPdfDrawing) => ({ ...value, referenceId: "reference/other" }),
    },
    {
      difference: "page",
      exposesCreatedId: false,
      vary: (value: LibraryPdfDrawing) => ({ ...value, page: value.page + 1 }),
    },
    {
      difference: "color",
      exposesCreatedId: true,
      vary: (value: LibraryPdfDrawing) => ({ ...value, color: "#123456" }),
    },
    {
      difference: "width",
      exposesCreatedId: true,
      vary: (value: LibraryPdfDrawing) => ({ ...value, width: value.width + 1 }),
    },
    {
      difference: "point count",
      exposesCreatedId: true,
      vary: (value: LibraryPdfDrawing) => ({ ...value, points: [...value.points, { x: 0.7, y: 0.2 }] }),
    },
    {
      difference: "point x coordinate",
      exposesCreatedId: true,
      vary: (value: LibraryPdfDrawing) => ({ ...value, points: [{ x: 0.2, y: 0.2 }, value.points[1]!] }),
    },
    {
      difference: "point y coordinate",
      exposesCreatedId: true,
      vary: (value: LibraryPdfDrawing) => ({ ...value, points: [{ x: 0.1, y: 0.3 }, value.points[1]!] }),
    },
  ])("does not claim a creation response whose $difference differs", async ({ exposesCreatedId, vary }) => {
    const layer = new TestMarkupLayer();
    const actions: LibraryPdfMarkupAction[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const mutationId = String(JSON.parse(String(init?.body)).mutationId);
      return Response.json(vary(drawingResponse(mutationId)), { status: 201 });
    });
    configureDrawingSurface(layer, actions);

    layer.pointerAction(drawingPointer(40));
    layer.continueDrawing(drawingPointer(200));
    await layer.finishDrawing(7);

    const saved = savedAction(actions);
    expect(saved.drawing).toBeNull();
    expect(saved.drawingId).toBe(exposesCreatedId ? saved.preview.provisionalId : null);
    expect(renderedDrawings(layer)).toHaveLength(1);
  });

  it.each([
    {
      difference: "artifact identity",
      vary: (value: LibraryPdfDrawing) => ({ ...value, artifactId: "artifact:other" }),
    },
    {
      difference: "reference identity",
      vary: (value: LibraryPdfDrawing) => ({ ...value, referenceId: "reference/other" }),
    },
    { difference: "page", vary: (value: LibraryPdfDrawing) => ({ ...value, page: value.page + 1 }) },
    { difference: "color", vary: (value: LibraryPdfDrawing) => ({ ...value, color: "#123456" }) },
    { difference: "width", vary: (value: LibraryPdfDrawing) => ({ ...value, width: value.width + 1 }) },
    {
      difference: "point count",
      vary: (value: LibraryPdfDrawing) => ({ ...value, points: value.points.slice(0, 1) }),
    },
    {
      difference: "point x coordinate",
      vary: (value: LibraryPdfDrawing) => ({ ...value, points: [{ x: 0.2, y: 0.2 }, value.points[1]!] }),
    },
    {
      difference: "point y coordinate",
      vary: (value: LibraryPdfDrawing) => ({ ...value, points: [{ x: 0.1, y: 0.3 }, value.points[1]!] }),
    },
  ])("does not poison a sibling stroke's adoption when a claimed drawing differs by $difference", ({ vary }) => {
    const layer = new TestMarkupLayer();
    const preview = (provisionalId: string): LibraryPdfDrawingPreview => ({
      ...drawingSurfaceData.drawingStyle,
      ...drawingSurfaceData.drawingTarget,
      baselineDrawingIds: [],
      drawingId: null,
      page: drawingSurfaceData.page,
      points: drawingResponse(provisionalId).points,
      provisionalId,
    });
    const first = preview("11111111-1111-4111-8111-111111111111");
    const sibling = preview("22222222-2222-4222-8222-222222222222");
    layer.setData(drawingSurfaceData);
    layer.projectProvisionalDrawing(first);
    layer.projectProvisionalDrawing(sibling);

    const claimedDrawing = vary(drawingResponse(first.provisionalId));
    layer.setData({ ...drawingSurfaceData, drawings: [claimedDrawing] });
    expect(renderedDrawings(layer)).toHaveLength(2);

    layer.projectProvisionalDrawing({ ...sibling, drawingId: claimedDrawing.id });
    expect(renderedDrawings(layer)).toHaveLength(1);
    expect(renderedDrawings(layer)[0]?.values[3]).toBe(claimedDrawing.id);
  });

  it("does not let an equivalent claimed drawing adopt a second identical stroke", () => {
    const layer = new TestMarkupLayer();
    const preview = (provisionalId: string): LibraryPdfDrawingPreview => ({
      ...drawingSurfaceData.drawingStyle,
      ...drawingSurfaceData.drawingTarget,
      baselineDrawingIds: [],
      drawingId: null,
      page: drawingSurfaceData.page,
      points: drawingResponse(provisionalId).points,
      provisionalId,
    });
    const first = preview("11111111-1111-4111-8111-111111111111");
    const sibling = preview("22222222-2222-4222-8222-222222222222");
    const claimedDrawing = drawingResponse(first.provisionalId);
    layer.setData(drawingSurfaceData);
    layer.projectProvisionalDrawing(first);
    layer.projectProvisionalDrawing(sibling);

    layer.setData({ ...drawingSurfaceData, drawings: [claimedDrawing] });
    layer.projectProvisionalDrawing({ ...sibling, drawingId: claimedDrawing.id });

    const rendered = renderedDrawings(layer);
    expect(rendered).toHaveLength(2);
    expect(rendered[0]?.values[3]).toBe(claimedDrawing.id);
    expect(rendered[1]?.values[3]).not.toBe(claimedDrawing.id);
  });

  it("selects an existing note for editing while the Note tool is active", () => {
    const layer = new TestMarkupLayer();
    Object.defineProperties(layer, {
      closest: {
        value: (selector: string) =>
          selector === ".pdf-note-pin" ? { getAttribute: (name: string) => (name === "data-markup-id" ? note.id : null) } : null,
      },
      dataset: { value: {} },
      getBoundingClientRect: { value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
      setPointerCapture: { value: vi.fn() },
    });
    layer.setData({
      drawingStyle: { color: "#000000", width: 3 },
      drawingTarget: { artifactId: artifact.id, referenceId: note.referenceId },
      drawings: [],
      notes: [note],
      page: note.page,
    });
    const actions: LibraryPdfMarkupAction[] = [];
    layer.addEventListener(libraryPdfMarkupActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfMarkupAction>).detail);
    });
    layer.chooseTool("note");

    layer.dispatchEvent(pointerEvent("pointerdown", { clientX: 160, clientY: 100, pointerId: 7, pointerType: "mouse" }));

    expect(actions).toEqual([{ action: "select-markup", id: note.id }]);
    expect(layer.noteDraft).toBeNull();
    layer.selectMarkup(note.id);
    expect(layer.selectedMarkupId).toBe(note.id);
    layer.selectMarkup(drawing.id);
    expect(layer.selectedMarkupId).toBe(note.id);
    layer.editNote(note);
    expect(layer.tool).toBe("note");
    expect(layer.noteDraft).toEqual({ editingId: note.id, page: note.page, x: note.x, y: note.y });

    const closeButton = {
      closest: (selector: string) => (selector === "button, input, textarea, select, a[href]" ? { getAttribute: () => null } : null),
    };
    expect(
      layer.pointerAction({
        clientX: 160,
        clientY: 100,
        pointerId: 8,
        pointerType: "mouse",
        preventDefault: vi.fn(),
        target: closeButton as unknown as EventTarget,
      }),
    ).toBeNull();
    expect(layer.noteDraft?.editingId).toBe(note.id);
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
    const createdDrawingBase: LibraryPdfDrawing = {
      ...drawing,
      artifactId: "artifact:1",
      page: 3,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.2 },
      ],
      referenceId: "reference/1",
      color: "#123456",
      width: 7,
    };
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(pendingResponse)
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockImplementationOnce(async (_input, init) => {
        const mutationId = String(JSON.parse(String(init?.body)).mutationId);
        return Response.json({ ...createdDrawingBase, id: mutationId }, { status: 201 });
      });
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
    expect(renderedDrawings(layer)).toHaveLength(1);
    expect(layer.pointerAction(pointer(40, 8))).toBeNull();
    layer.chooseTool("select");
    expect(renderedDrawings(layer)).toHaveLength(1);
    layer.chooseTool("draw");
    expect(renderedDrawings(layer)).toHaveLength(1);
    await layer.retryDrawingForTest();
    expect(renderedDrawings(layer)).toHaveLength(1);
    layer.discardDrawingForTest();
    expect(renderedDrawings(layer)).toHaveLength(0);

    layer.pointerAction(pointer(40, 8));
    layer.continueDrawing(pointer(200, 8));
    await layer.finishDrawing(8);
    expect(renderedDrawings(layer)).toHaveLength(1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/library/references/reference%2F1/pdf-markups");
    expect(init).toEqual(expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: "drawing",
      artifactId: "artifact:1",
      color: "#123456",
      mutationId: expect.any(String),
      page: 3,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.2 },
      ],
      width: 7,
    });
    const firstPending = actions.find(
      (action): action is Extract<LibraryPdfMarkupAction, { readonly action: "drawing-save-state" }> =>
        action.action === "drawing-save-state" && action.pending,
    );
    const mutationIds = fetchMock.mock.calls.map(([, request]) => String(JSON.parse(String(request?.body)).mutationId));
    expect(mutationIds[0]).toBe(firstPending?.preview.provisionalId);
    expect(mutationIds[0]).toMatch(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/u);
    expect(mutationIds[1]).toBe(mutationIds[0]);
    expect(mutationIds[2]).not.toBe(mutationIds[0]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      actions
        .filter(({ action }) => action === "drawing-save-state")
        .map((action) => (action.action === "drawing-save-state" ? action.pending : null)),
    ).toEqual([true, false, true, false, true, false]);
    expect(actions.filter(({ action }) => action === "drawing-discarded")).toHaveLength(1);
    const saved = savedAction(actions);
    expect(mutationIds[2]).toBe(saved.preview.provisionalId);
    expect(saved).toEqual({
      action: "drawing-saved",
      drawing: { ...createdDrawingBase, id: mutationIds[2] },
      drawingId: mutationIds[2],
      preview: expect.objectContaining({
        artifactId: "artifact:1",
        color: "#123456",
        drawingId: mutationIds[2],
        page: 3,
        referenceId: "reference/1",
        width: 7,
      }),
    });
  });

  it("presents an exact retry lifecycle for a projected failed drawing", async () => {
    const layer = new TestMarkupLayer();
    const actions: LibraryPdfMarkupAction[] = [];
    let respond = (_response: Response): void => undefined;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    configureDrawingSurface(layer, actions);
    const preview: LibraryPdfDrawingPreview = {
      ...drawingSurfaceData.drawingStyle,
      ...drawingSurfaceData.drawingTarget,
      baselineDrawingIds: [],
      drawingId: null,
      page: drawingSurfaceData.page,
      points: drawingResponse("projected").points,
      provisionalId: "projected",
    };
    layer.projectProvisionalDrawing(preview);
    layer.projectDrawingSaveState(preview, false, "Offline");

    expect(drawingRecoveryPresentation(layer)).toEqual({
      discardDisabled: false,
      retryDisabled: false,
      retryLabel: "Retry drawing",
    });
    expect(drawingStatusPresentation(layer)).toEqual([false, "Offline"]);

    const retry = layer.retryDrawingForTest();
    expect(drawingRecoveryPresentation(layer)).toEqual({
      discardDisabled: true,
      retryDisabled: true,
      retryLabel: "Saving…",
    });
    expect(drawingStatusPresentation(layer)).toEqual([false, "Saving private drawing…"]);
    respond(new Response("Unavailable", { status: 503 }));
    await retry;

    expect(drawingRecoveryPresentation(layer)).toEqual({
      discardDisabled: false,
      retryDisabled: false,
      retryLabel: "Retry drawing",
    });
    expect(drawingStatusPresentation(layer)).toEqual([false, "Request failed (503)"]);

    layer.projectDrawingSaveState(preview, true, null);
    expect(drawingRecoveryPresentation(layer)).toBeNull();
    expect(drawingStatusPresentation(layer)).toEqual([true, ""]);
    layer.projectDrawingSaveState(preview, false, "Still offline");
    layer.discardDrawingForTest();
    expect(drawingRecoveryPresentation(layer)).toBeNull();
    expect(drawingStatusPresentation(layer)).toEqual([true, ""]);
    expect(actions).toContainEqual({ action: "drawing-discarded", provisionalId: preview.provisionalId });
  });

  it("lets a projected sibling retry a failed drawing with the same mutation id", async () => {
    const owner = new TestMarkupLayer();
    const sibling = new TestMarkupLayer();
    const actions: LibraryPdfMarkupAction[] = [];
    let rejectFirst = (_response: Response): void => undefined;
    const firstResponse = new Promise<Response>((resolve) => {
      rejectFirst = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(firstResponse)
      .mockImplementationOnce(async (_input, init) => {
        const mutationId = String(JSON.parse(String(init?.body)).mutationId);
        return Response.json(
          {
            ...drawing,
            artifactId: "artifact:1",
            color: "#123456",
            id: mutationId,
            page: 3,
            points: [
              { x: 0.1, y: 0.2 },
              { x: 0.5, y: 0.2 },
            ],
            referenceId: "reference/1",
            width: 7,
          },
          { status: 201 },
        );
      });
    const data = {
      drawingStyle: { color: "#123456", width: 7 },
      drawingTarget: { artifactId: "artifact:1", referenceId: "reference/1" },
      drawings: [],
      notes: [],
      page: 3,
    } as const;
    for (const layer of [owner, sibling]) {
      Object.defineProperties(layer, {
        dataset: { value: {} },
        getBoundingClientRect: { value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
        setPointerCapture: { value: vi.fn() },
      });
      layer.setData(data);
      layer.addEventListener(libraryPdfMarkupActionEvent, (event) => {
        const action = (event as CustomEvent<LibraryPdfMarkupAction>).detail;
        actions.push(action);
        if (action.action === "drawing-save-state") {
          for (const surface of [owner, sibling]) {
            surface.projectProvisionalDrawing(action.preview);
            surface.projectDrawingSaveState(action.preview, action.pending, action.failure);
          }
        } else if (action.action === "drawing-saved") {
          for (const surface of [owner, sibling]) surface.projectProvisionalDrawing(action.preview);
        }
      });
    }
    const pointer = (clientX: number) => ({
      clientX,
      clientY: 40,
      pointerId: 7,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target: new EventTarget(),
    });
    owner.chooseTool("draw");
    owner.pointerAction(pointer(40));
    owner.continueDrawing(pointer(200));

    const firstSave = owner.finishDrawing(7);
    expect(renderedDrawings(sibling)).toHaveLength(1);
    rejectFirst(new Response("Unavailable", { status: 503 }));
    await firstSave;

    expect(renderedDrawingRecovery(owner)).not.toBeNull();
    expect(renderedDrawingRecovery(sibling)).not.toBeNull();
    await sibling.retryDrawingForTest();

    const mutationIds = fetchMock.mock.calls.map(([, request]) => String(JSON.parse(String(request?.body)).mutationId));
    expect(mutationIds).toHaveLength(2);
    expect(mutationIds[1]).toBe(mutationIds[0]);
    expect(actions.filter(({ action }) => action === "drawing-saved")).toHaveLength(1);
    expect(renderedDrawings(sibling)).toHaveLength(1);
    expect(renderedDrawingRecovery(owner)).toBeNull();
    expect(renderedDrawingRecovery(sibling)).toBeNull();
  });

  it("keeps a completed drawing painted until its canonical projection takes over", async () => {
    const layer = new TestMarkupLayer();
    const actions: LibraryPdfMarkupAction[] = [];
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
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
    const pointer = (clientX: number) => ({
      clientX,
      clientY: 40,
      pointerId: 7,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target: new EventTarget(),
    });
    layer.chooseTool("draw");
    layer.pointerAction(pointer(40));
    layer.continueDrawing(pointer(200));

    const save = layer.finishDrawing(7);
    expect(renderedDrawings(layer)).toHaveLength(1);
    expect(renderedDrawings(layer)[0]?.values.slice(0, 3)).toEqual(["100,200 500,200", "#123456", 7]);
    const pending = actions.find(
      (action): action is Extract<LibraryPdfMarkupAction, { readonly action: "drawing-save-state" }> =>
        action.action === "drawing-save-state" && action.pending,
    );
    if (!pending) throw new Error("Expected a pending drawing preview");

    const savedDrawing: LibraryPdfDrawing = {
      id: pending.preview.provisionalId,
      kind: "drawing",
      referenceId: "reference/1",
      artifactId: "artifact:1",
      page: 3,
      color: "#123456",
      width: 7,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.2 },
      ],
      createdAt: "created",
      updatedAt: "updated",
    };
    respond(Response.json(savedDrawing, { status: 201 }));
    await save;
    expect(renderedDrawings(layer)).toHaveLength(1);
    expect(actions.map(({ action }) => action)).toEqual(["drawing-save-state", "drawing-saved", "drawing-save-state"]);
    expect(savedAction(actions)).toEqual({
      action: "drawing-saved",
      drawing: savedDrawing,
      drawingId: savedDrawing.id,
      preview: expect.objectContaining({ drawingId: savedDrawing.id }),
    });
    layer.projectCreatedDrawing(savedDrawing);
    expect(renderedDrawings(layer)).toHaveLength(1);

    layer.setData({
      drawingStyle: { color: "#123456", width: 7 },
      drawingTarget: { artifactId: "artifact:1", referenceId: "reference/1" },
      drawings: [],
      notes: [],
      page: 3,
    });
    expect(renderedDrawings(layer)).toHaveLength(1);

    layer.setData({
      drawingStyle: { color: "#123456", width: 7 },
      drawingTarget: { artifactId: "artifact:1", referenceId: "reference/1" },
      drawings: [savedDrawing],
      notes: [],
      page: 3,
    });
    expect(renderedDrawings(layer)).toHaveLength(1);
    expect(renderedDrawings(layer)[0]?.values[3]).toBe(savedDrawing.id);
  });

  it("renders one drawing when canonical projection wins a delayed creation-response race", async () => {
    const layer = new TestMarkupLayer();
    let respond = (_response: Response): void => undefined;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
      setPointerCapture: { value: vi.fn() },
    });
    const data = {
      drawingStyle: { color: "#123456", width: 7 },
      drawingTarget: { artifactId: "artifact:1", referenceId: "reference/1" },
      drawings: [],
      notes: [],
      page: 3,
    } as const;
    const savedDrawing: LibraryPdfDrawing = {
      ...drawing,
      artifactId: "artifact:1",
      color: "#123456",
      id: "drawing-saved",
      page: 3,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.2 },
      ],
      referenceId: "reference/1",
      width: 7,
    };
    layer.setData(data);
    layer.chooseTool("draw");
    const pointer = (clientX: number) => ({
      clientX,
      clientY: 40,
      pointerId: 7,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target: new EventTarget(),
    });
    layer.pointerAction(pointer(40));
    layer.continueDrawing(pointer(200));
    const save = layer.finishDrawing(7);
    const pendingRequest = vi.mocked(globalThis.fetch).mock.calls[0]?.[1];
    const mutationId = String(JSON.parse(String(pendingRequest?.body)).mutationId);
    const canonicalDrawing = { ...savedDrawing, id: mutationId };

    layer.setData({ ...data, drawings: [canonicalDrawing] });
    expect(renderedDrawings(layer)).toHaveLength(1);
    respond(Response.json(canonicalDrawing, { status: 201 }));
    await save;
    expect(renderedDrawings(layer)).toHaveLength(1);
  });

  it("projects and retires a confirmed drawing only on its matching page", () => {
    const matching = new TestMarkupLayer();
    const otherPage = new TestMarkupLayer();
    const data = {
      drawingStyle: { color: "#000000", width: 3 },
      drawingTarget: { artifactId: drawing.artifactId, referenceId: drawing.referenceId },
      drawings: [],
      notes: [],
    } as const;
    matching.setData({ ...data, page: drawing.page });
    otherPage.setData({ ...data, page: drawing.page + 1 });

    matching.projectCreatedDrawing(drawing);
    otherPage.projectCreatedDrawing(drawing);
    expect(renderedDrawings(matching)).toHaveLength(1);
    expect(renderedDrawings(otherPage)).toHaveLength(0);

    matching.retireCreatedDrawing(drawing.id);
    expect(renderedDrawings(matching)).toHaveLength(0);
    matching.projectCreatedDrawing(drawing);
    matching.setData({ ...data, drawings: [drawing], page: drawing.page });
    expect(renderedDrawings(matching)).toHaveLength(1);
    expect(renderedDrawings(matching)[0]?.values[3]).toBe(drawing.id);
  });

  it.each([
    { reason: "the layer is not bound", prepare: (_layer: TestMarkupLayer) => undefined },
    {
      reason: "the page has no drawing target",
      prepare: (layer: TestMarkupLayer) =>
        layer.setData({ drawingStyle: { color: "#000000", width: 3 }, drawingTarget: null, drawings: [], notes: [], page: drawing.page }),
    },
    {
      reason: "the artifact differs",
      prepare: (layer: TestMarkupLayer) =>
        layer.setData({
          drawingStyle: { color: "#000000", width: 3 },
          drawingTarget: { artifactId: "artifact-other", referenceId: drawing.referenceId },
          drawings: [],
          notes: [],
          page: drawing.page,
        }),
    },
    {
      reason: "the reference differs",
      prepare: (layer: TestMarkupLayer) =>
        layer.setData({
          drawingStyle: { color: "#000000", width: 3 },
          drawingTarget: { artifactId: drawing.artifactId, referenceId: "reference-other" },
          drawings: [],
          notes: [],
          page: drawing.page,
        }),
    },
    {
      reason: "the page differs",
      prepare: (layer: TestMarkupLayer) =>
        layer.setData({
          drawingStyle: { color: "#000000", width: 3 },
          drawingTarget: { artifactId: drawing.artifactId, referenceId: drawing.referenceId },
          drawings: [],
          notes: [],
          page: drawing.page + 1,
        }),
    },
    {
      reason: "the canonical drawing is already present",
      prepare: (layer: TestMarkupLayer) =>
        layer.setData({
          drawingStyle: { color: "#000000", width: 3 },
          drawingTarget: { artifactId: drawing.artifactId, referenceId: drawing.referenceId },
          drawings: [drawing],
          notes: [],
          page: drawing.page,
        }),
    },
  ])("does not project a confirmed drawing when $reason", ({ prepare }) => {
    const layer = new TestMarkupLayer();
    prepare(layer);

    layer.projectCreatedDrawing(drawing);
    layer.setData({
      drawingStyle: { color: "#000000", width: 3 },
      drawingTarget: { artifactId: drawing.artifactId, referenceId: drawing.referenceId },
      drawings: [],
      notes: [],
      page: drawing.page,
    });

    expect(renderedDrawings(layer)).toHaveLength(0);
  });

  it("projects one provisional stroke into a fresh layer and adopts its canonical drawing without duplication", () => {
    const layer = new TestMarkupLayer();
    const data = {
      drawingStyle: { color: "#000000", width: 3 },
      drawingTarget: { artifactId: drawing.artifactId, referenceId: drawing.referenceId },
      drawings: [],
      notes: [],
      page: drawing.page,
    } as const;
    const preview: LibraryPdfDrawingPreview = {
      artifactId: drawing.artifactId,
      baselineDrawingIds: [],
      color: drawing.color,
      drawingId: null,
      page: drawing.page,
      points: drawing.points,
      provisionalId: "pending-drawing",
      referenceId: drawing.referenceId,
      width: drawing.width,
    };
    layer.setData(data);

    layer.projectProvisionalDrawing(preview);
    expect(renderedDrawings(layer)).toHaveLength(1);
    expect(renderedDrawings(layer)[0]?.values.slice(0, 3)).toEqual(["100,200 300,400", "#ff0000", 4]);

    layer.setData({ ...data, drawings: [drawing] });
    layer.projectProvisionalDrawing({ ...preview, drawingId: drawing.id });
    expect(renderedDrawings(layer)).toHaveLength(1);
    expect(renderedDrawings(layer)[0]?.values[3]).toBe(drawing.id);
  });

  it("awaits authoritative refresh without retrying after an unidentified successful creation", async () => {
    const layer = new TestMarkupLayer();
    const actions: LibraryPdfMarkupAction[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
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
    layer.chooseTool("draw");
    const pointer = (clientX: number) => ({
      clientX,
      clientY: 40,
      pointerId: 7,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target: new EventTarget(),
    });
    layer.pointerAction(pointer(40));
    layer.continueDrawing(pointer(200));

    await layer.finishDrawing(7);
    expect(actions.map(({ action }) => action)).toEqual(["drawing-save-state", "drawing-saved", "drawing-save-state"]);
    const saved = savedAction(actions);
    expect(saved).toEqual({
      action: "drawing-saved",
      drawing: null,
      drawingId: null,
      preview: expect.objectContaining({
        artifactId: "artifact:1",
        drawingId: null,
        page: 3,
        referenceId: "reference/1",
      }),
    });
    expect(renderedDrawings(layer)).toHaveLength(1);
    await layer.retryDrawingForTest();
    expect(fetchMock).toHaveBeenCalledOnce();

    layer.retireProvisionalDrawing(saved.preview.provisionalId);
    expect(renderedDrawings(layer)).toHaveLength(0);
  });

  it("does not identify a completed stroke from a mismatched creation response id", async () => {
    const layer = new TestMarkupLayer();
    const actions: LibraryPdfMarkupAction[] = [];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        {
          ...drawing,
          artifactId: "artifact:1",
          color: "#123456",
          id: "11111111-1111-4111-8111-111111111111",
          page: 3,
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.5, y: 0.2 },
          ],
          referenceId: "reference/1",
          width: 7,
        },
        { status: 201 },
      ),
    );
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
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
    layer.chooseTool("draw");
    const pointer = (clientX: number) => ({
      clientX,
      clientY: 40,
      pointerId: 7,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target: new EventTarget(),
    });
    layer.pointerAction(pointer(40));
    layer.continueDrawing(pointer(200));

    await layer.finishDrawing(7);

    expect(savedAction(actions)).toEqual({
      action: "drawing-saved",
      drawing: null,
      drawingId: null,
      preview: expect.objectContaining({ drawingId: null }),
    });
    expect(renderedDrawings(layer)).toHaveLength(1);
  });

  it("retires only the provisional drawing correlated to one completed save", () => {
    const layer = new TestMarkupLayer();
    layer.setData({
      drawingStyle: { color: "#123456", width: 7 },
      drawingTarget: { artifactId: "artifact:1", referenceId: "reference/1" },
      drawings: [],
      notes: [],
      page: 3,
    });
    const preview = (provisionalId: string, y: number): LibraryPdfDrawingPreview => ({
      artifactId: "artifact:1",
      baselineDrawingIds: [],
      color: "#123456",
      drawingId: null,
      page: 3,
      points: [
        { x: 0.1, y },
        { x: 0.5, y },
      ],
      provisionalId,
      referenceId: "reference/1",
      width: 7,
    });

    layer.projectProvisionalDrawing(preview("save-a", 0.2));
    layer.projectProvisionalDrawing(preview("save-b", 0.4));
    expect(renderedDrawings(layer)).toHaveLength(2);

    layer.retireProvisionalDrawing("save-a");
    expect(renderedDrawings(layer)).toHaveLength(1);
    expect(renderedDrawings(layer)[0]?.values[0]).toBe("100,400 500,400");
  });

  it("adopts the matching one of two identical provisional strokes when the second canonical drawing arrives first", () => {
    const layer = new TestMarkupLayer();
    const data = {
      drawingStyle: { color: "#ff0000", width: 4 },
      drawingTarget: { artifactId: drawing.artifactId, referenceId: drawing.referenceId },
      drawings: [],
      notes: [],
      page: drawing.page,
    } as const;
    const preview = (provisionalId: string): LibraryPdfDrawingPreview => ({
      artifactId: drawing.artifactId,
      baselineDrawingIds: [],
      color: drawing.color,
      drawingId: null,
      page: drawing.page,
      points: drawing.points,
      provisionalId,
      referenceId: drawing.referenceId,
      width: drawing.width,
    });
    const first = preview("11111111-1111-4111-8111-111111111111");
    const second = preview("22222222-2222-4222-8222-222222222222");
    layer.setData(data);
    layer.projectProvisionalDrawing(first);
    layer.projectProvisionalDrawing(second);

    const secondCanonical = { ...drawing, id: second.provisionalId } satisfies LibraryPdfDrawing;
    layer.setData({ ...data, drawings: [secondCanonical] });
    expect(renderedDrawings(layer)).toHaveLength(2);

    layer.retireProvisionalDrawing(first.provisionalId);
    expect(renderedDrawings(layer)).toHaveLength(1);
    expect(renderedDrawings(layer)[0]?.values[3]).toBe(secondCanonical.id);
  });

  it("broadcasts a failed save without exposing recovery controls on the wrong target", async () => {
    const layer = new TestMarkupLayer();
    const actions: LibraryPdfMarkupAction[] = [];
    let respond = (_response: Response): void => undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
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
    layer.chooseTool("draw");
    const pointer = (clientX: number) => ({
      clientX,
      clientY: 40,
      pointerId: 7,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target: new EventTarget(),
    });
    layer.pointerAction(pointer(40));
    layer.continueDrawing(pointer(200));
    const save = layer.finishDrawing(7);
    const pending = actions.find(
      (action): action is Extract<LibraryPdfMarkupAction, { readonly action: "drawing-save-state" }> =>
        action.action === "drawing-save-state" && action.pending,
    );
    if (!pending) throw new Error("Expected the pending drawing preview");

    layer.setData({
      drawingStyle: { color: "#000000", width: 3 },
      drawingTarget: { artifactId: "artifact:2", referenceId: "reference/2" },
      drawings: [],
      notes: [],
      page: 1,
    });
    respond(new Response("Unavailable", { status: 503 }));
    await save;
    expect(renderedDrawings(layer)).toHaveLength(0);
    expect(actions).not.toContainEqual({ action: "drawing-discarded", provisionalId: pending.preview.provisionalId });
    expect(actions.at(-1)).toEqual({
      action: "drawing-save-state",
      failure: "Request failed (503)",
      pending: false,
      preview: pending.preview,
    });
    expect(renderedDrawingRecovery(layer)).toBeNull();
    await layer.retryDrawingForTest();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps Retry reachable when a pending save returns to its page before rejection", async () => {
    const layer = new TestMarkupLayer();
    const actions: LibraryPdfMarkupAction[] = [];
    let respond = (_response: Response): void => undefined;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
      )
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
      setPointerCapture: { value: vi.fn() },
    });
    const pageTwo = {
      drawingStyle: { color: "#123456", width: 7 },
      drawingTarget: { artifactId: "artifact:1", referenceId: "reference/1" },
      drawings: [],
      notes: [],
      page: 2,
    } as const;
    layer.setData(pageTwo);
    layer.addEventListener(libraryPdfMarkupActionEvent, (event) => actions.push((event as CustomEvent<LibraryPdfMarkupAction>).detail));
    layer.chooseTool("draw");
    const pointer = (clientX: number) => ({
      clientX,
      clientY: 40,
      pointerId: 7,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target: new EventTarget(),
    });
    layer.pointerAction(pointer(40));
    layer.continueDrawing(pointer(200));
    const save = layer.finishDrawing(7);
    const preview = actions.find(
      (action): action is Extract<LibraryPdfMarkupAction, { readonly action: "drawing-save-state" }> =>
        action.action === "drawing-save-state" && action.pending,
    )?.preview;
    if (!preview) throw new Error("Expected the pending drawing preview");

    layer.setData({ ...pageTwo, page: 3 });
    layer.setData(pageTwo);
    layer.projectProvisionalDrawing(preview);
    respond(new Response("Unavailable", { status: 503 }));
    await save;

    expect(renderedDrawings(layer)).toHaveLength(1);
    await layer.retryDrawingForTest();
    expect(renderedDrawings(layer)).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const mutationIds = fetchMock.mock.calls.map(([, request]) => String(JSON.parse(String(request?.body)).mutationId));
    expect(mutationIds).toEqual([preview.provisionalId, preview.provisionalId]);
  });

  it("keeps a failed pending preview recoverable after its owner detaches", async () => {
    const layer = new TestMarkupLayer();
    const actions: LibraryPdfMarkupAction[] = [];
    let respond = (_response: Response): void => undefined;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        respond = resolve;
      }),
    );
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
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
    layer.chooseTool("draw");
    const pointer = (clientX: number) => ({
      clientX,
      clientY: 40,
      pointerId: 7,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target: new EventTarget(),
    });
    layer.pointerAction(pointer(40));
    layer.continueDrawing(pointer(200));
    const save = layer.finishDrawing(7);
    const preview = actions.find(
      (action): action is Extract<LibraryPdfMarkupAction, { readonly action: "drawing-save-state" }> =>
        action.action === "drawing-save-state" && action.pending,
    )?.preview;
    if (!preview) throw new Error("Expected the pending drawing preview");

    layer.disconnectedCallback();
    respond(new Response("Unavailable", { status: 503 }));
    await save;

    expect(renderedDrawings(layer)).toHaveLength(1);
    expect(renderedDrawingRecovery(layer)).not.toBeNull();
    expect(actions).not.toContainEqual({ action: "drawing-discarded", provisionalId: preview.provisionalId });
    expect(actions.at(-1)).toEqual(
      expect.objectContaining({ action: "drawing-save-state", failure: "Request failed (503)", pending: false }),
    );
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

  it("recognizes a held line despite small pointer jitter", () => {
    vi.useFakeTimers();
    const layer = new TestMarkupLayer();
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { configurable: true, value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
      querySelector: { configurable: true, value: () => null },
      setPointerCapture: { value: vi.fn() },
    });
    const actions: LibraryPdfMarkupAction[] = [];
    layer.addEventListener(libraryPdfMarkupActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfMarkupAction>).detail);
    });
    const pointer = (clientX: number, clientY = 40) => ({
      clientX,
      clientY,
      pointerId: 7,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target: new EventTarget(),
    });
    layer.setInteraction("draw");
    expect(layer.pointerAction(pointer(40))).toEqual({ kind: "start-drawing" });
    expect(layer.continueDrawing(pointer(200))).toBe(true);

    for (const [clientX, clientY] of [
      [202, 41],
      [199, 39],
      [203, 40],
      [198, 41],
      [201, 39],
      [200, 41],
      [202, 39],
      [199, 40],
    ] as const) {
      vi.advanceTimersByTime(100);
      expect(layer.continueDrawing(pointer(clientX, clientY))).toBe(true);
    }
    vi.advanceTimersByTime(50);

    expect(actions).toContainEqual({
      action: "status",
      message: "Line snapped into place. Keep dragging to adjust it, or lift to save.",
    });
  });

  it("restarts the shape-recognition hold after meaningful pointer movement", () => {
    vi.useFakeTimers();
    const layer = new TestMarkupLayer();
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { configurable: true, value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
      querySelector: { configurable: true, value: () => null },
      setPointerCapture: { value: vi.fn() },
    });
    const actions: LibraryPdfMarkupAction[] = [];
    layer.addEventListener(libraryPdfMarkupActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfMarkupAction>).detail);
    });
    const pointer = (clientX: number) => ({
      clientX,
      clientY: 40,
      pointerId: 7,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      target: new EventTarget(),
    });
    layer.setInteraction("draw");
    layer.pointerAction(pointer(40));
    layer.continueDrawing(pointer(200));

    vi.advanceTimersByTime(800);
    layer.continueDrawing(pointer(208));
    vi.advanceTimersByTime(849);
    expect(actions).toEqual([]);
    vi.advanceTimersByTime(1);

    expect(actions).toContainEqual({
      action: "status",
      message: "Line snapped into place. Keep dragging to adjust it, or lift to save.",
    });
  });

  it("treats six vertical pixels as hold jitter and seven as meaningful movement", () => {
    vi.useFakeTimers();
    const createLayer = () => {
      const layer = new TestMarkupLayer();
      Object.defineProperties(layer, {
        dataset: { value: {} },
        getBoundingClientRect: { value: () => ({ height: 200, left: 0, top: 0, width: 400 }) },
        setPointerCapture: { value: vi.fn() },
      });
      const actions: LibraryPdfMarkupAction[] = [];
      layer.addEventListener(libraryPdfMarkupActionEvent, (event) => {
        actions.push((event as CustomEvent<LibraryPdfMarkupAction>).detail);
      });
      layer.setInteraction("draw");
      layer.pointerAction(drawingPointer(40));
      layer.continueDrawing(drawingPointer(200));
      return { actions, layer };
    };

    const boundary = createLayer();
    vi.advanceTimersByTime(800);
    boundary.layer.continueDrawing(drawingPointer(200, 46));
    vi.advanceTimersByTime(50);
    expect(boundary.actions).toContainEqual({
      action: "status",
      message: "Line snapped into place. Keep dragging to adjust it, or lift to save.",
    });

    vi.clearAllTimers();
    const moved = createLayer();
    vi.advanceTimersByTime(400);
    moved.layer.continueDrawing(drawingPointer(200, 42));
    vi.advanceTimersByTime(400);
    moved.layer.continueDrawing(drawingPointer(200, 47));
    vi.advanceTimersByTime(849);
    expect(moved.actions).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(moved.actions).toContainEqual({
      action: "status",
      message: "Line snapped into place. Keep dragging to adjust it, or lift to save.",
    });
  });

  it.each(["width", "height"] as const)("restarts the recognition hold while the page has zero $dimension", (dimension) => {
    vi.useFakeTimers();
    const layer = new TestMarkupLayer();
    const rect = { height: 200, left: 0, top: 0, width: 400 };
    Object.defineProperties(layer, {
      dataset: { value: {} },
      getBoundingClientRect: { value: () => rect },
      setPointerCapture: { value: vi.fn() },
    });
    const actions: LibraryPdfMarkupAction[] = [];
    layer.addEventListener(libraryPdfMarkupActionEvent, (event) => {
      actions.push((event as CustomEvent<LibraryPdfMarkupAction>).detail);
    });
    const points = [
      { x: 0.1, y: 0.2 },
      { x: 0.5, y: 0.2 },
    ];
    layer.scheduleShapeRecognition(points);

    vi.advanceTimersByTime(800);
    rect[dimension] = 0;
    layer.scheduleShapeRecognition([...points, { x: 0.505, y: 0.2 }]);
    rect[dimension] = dimension === "width" ? 400 : 200;
    vi.advanceTimersByTime(50);
    expect(actions).toEqual([]);
  });
});

function pointerEvent(type: string, values: Record<string, number | string>): Event {
  const event = new Event(type);
  Object.defineProperties(event, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { configurable: true, value }])));
  return event;
}
