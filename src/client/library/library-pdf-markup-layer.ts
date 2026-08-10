import { html, nothing, svg, type TemplateResult } from "lit";
import {
  isLibraryPdfMarkup,
  type LibraryPdfArtifact,
  type LibraryPdfDrawing,
  type LibraryPdfMarkup,
  type LibraryPdfNote,
  type LibraryPdfPoint,
} from "../../domain/reference-library";
import { LightDomElement } from "../platform/light-dom-controller";
import { manipulateRecognizedShape, recognizeDrawnShape, type RecognizedDrawnShape } from "../pdf/drawn-shape-recognition";
import { errorMessage, expectOk, jsonFetch } from "../platform/http";

const shapeRecognitionDelayMs = 850;
const shapeRecognitionJitterTolerancePx = 6;

export type PdfAnnotationTool = "select" | "note" | "draw";

export interface LibraryPdfNoteDraft {
  readonly editingId: string | null;
  readonly page: number;
  readonly x: number;
  readonly y: number;
}

export interface LibraryPdfMarkupLayerData {
  readonly drawingStyle: Pick<LibraryPdfDrawing, "color" | "width">;
  readonly drawingTarget: { readonly artifactId: string; readonly referenceId: string } | null;
  readonly drawings: readonly LibraryPdfDrawing[];
  readonly notes: readonly LibraryPdfNote[];
  readonly page: number;
}

export interface LibraryPdfRecognizedShape {
  readonly points: readonly LibraryPdfPoint[];
  readonly shape: RecognizedDrawnShape;
}

interface DrawingPointerSample {
  readonly clientX: number;
  readonly clientY: number;
}

interface DrawingPointerEvent extends DrawingPointerSample {
  readonly getCoalescedEvents?: () => readonly DrawingPointerSample[];
}

interface ActivePointerEvent extends DrawingPointerEvent {
  readonly pointerId: number;
  preventDefault(): void;
}

interface ActiveNoteDrag {
  readonly id: string;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
}

interface ActiveNotePress {
  readonly point: LibraryPdfPoint;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
}

interface ActiveDrawing {
  readonly pointerId: number;
  readonly points: readonly LibraryPdfPoint[];
}

export interface LibraryPdfDrawingPreview extends Pick<LibraryPdfDrawing, "color" | "page" | "points" | "width"> {
  readonly artifactId: string;
  readonly baselineDrawingIds: readonly string[];
  readonly drawingId: string | null;
  readonly provisionalId: string;
  readonly referenceId: string;
}

type DrawingSave = Omit<LibraryPdfDrawingPreview, "baselineDrawingIds" | "drawingId" | "provisionalId">;

interface OptimisticDrawing {
  readonly baselineDrawingIds: Set<string>;
  canonicalId: string | null;
  drawing: DrawingSave;
  readonly provisionalId: string;
}

interface ShapeRecognitionHold {
  readonly anchor: LibraryPdfPoint;
  readonly pointCount: number;
}

export interface LibraryPdfNotePressResult {
  readonly point: LibraryPdfPoint | null;
}

export type LibraryPdfMarkupTarget =
  { readonly id: string | null; readonly kind: "note" } | { readonly id: string; readonly kind: "drawing" };

export type LibraryPdfPointerAction =
  { readonly id: string; readonly kind: "note" | "drawing" } | { readonly kind: "start-drawing" | "start-note" | "touch-drawing" };

interface MarkupTargetElement {
  closest(selector: string): Pick<Element, "getAttribute"> | null;
}

export const libraryPdfMarkupActionEvent = "library-pdf-markup-action";

export type LibraryPdfMarkupAction =
  | {
      readonly action: "drawing-saved";
      readonly drawing: LibraryPdfDrawing | null;
      readonly drawingId: string | null;
      readonly preview: LibraryPdfDrawingPreview;
    }
  | {
      readonly action: "drawing-save-state";
      readonly failure: string | null;
      readonly pending: boolean;
      readonly preview: LibraryPdfDrawingPreview;
    }
  | { readonly action: "drawing-discarded"; readonly provisionalId: string }
  | { readonly action: "note-moved" }
  | { readonly action: "select-markup"; readonly id: string }
  | {
      readonly action: "place-note";
      readonly draft: LibraryPdfNoteDraft & { readonly artifactId: string; readonly referenceId: string };
    }
  | { readonly action: "status"; readonly message: string };

export class LibraryPdfMarkupLayer extends LightDomElement {
  static override properties = { data: { state: true }, savingDrawing: { state: true }, status: { state: true } };

  declare private data: LibraryPdfMarkupLayerData | null;
  declare private savingDrawing: boolean;
  declare private status: string;
  private drawing: ActiveDrawing | null = null;
  private failedDrawing: OptimisticDrawing | null = null;
  private interactionTool: PdfAnnotationTool = "select";
  private noteDraftValue: LibraryPdfNoteDraft | null = null;
  private noteDrag: ActiveNoteDrag | null = null;
  private noteMovePreview: { readonly id: string; readonly point: LibraryPdfPoint } | null = null;
  private notePress: ActiveNotePress | null = null;
  private movingNoteId: string | null = null;
  private openNoteId: string | null = null;
  private recognizedShape: RecognizedDrawnShape | null = null;
  private recognitionHold: ShapeRecognitionHold | null = null;
  private recognitionTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  private selectedHighlightIdValue: string | null = null;
  private selectedMarkupIdValue: string | null = null;
  private readonly pendingDrawingSaves = new Set<string>();
  private optimisticDrawings: OptimisticDrawing[] = [];

  constructor() {
    super();
    this.data = null;
    this.savingDrawing = false;
    this.status = "";
    this.addEventListener("pointerdown", this.handlePointerDown);
    this.addEventListener("pointermove", this.handlePointerMove);
    this.addEventListener("pointerup", this.handlePointerUp);
    this.addEventListener("pointercancel", this.handlePointerCancel);
  }

  setData(data: LibraryPdfMarkupLayerData): void {
    this.data = data;
    this.reconcileOptimisticDrawings(data);
    if (!this.movingNoteId) this.noteMovePreview = null;
    if (this.isConnected) this.performUpdate();
  }

  setLibraryPage(
    artifact: LibraryPdfArtifact | undefined,
    markups: readonly LibraryPdfMarkup[],
    page: number,
    drawingStyle: Pick<LibraryPdfDrawing, "color" | "width">,
  ): readonly LibraryPdfDrawing[] {
    const visible = artifact ? markups.filter((item) => item.artifactId === artifact.id && item.page === page) : [];
    const drawings = visible.filter((item): item is LibraryPdfDrawing => item.kind === "drawing");
    this.setData({
      drawingStyle,
      drawingTarget: artifact?.referenceId ? { artifactId: artifact.id, referenceId: artifact.referenceId } : null,
      drawings,
      notes: visible.filter((item): item is LibraryPdfNote => item.kind === "note"),
      page,
    });
    return drawings;
  }

  projectCreatedDrawing(drawing: LibraryPdfDrawing): void {
    const data = this.data;
    if (!data || !drawingTargetsData(drawing, data) || data.drawings.some(({ id }) => id === drawing.id)) return;
    const existing = this.optimisticDrawings.find(({ canonicalId }) => canonicalId === drawing.id);
    if (existing) {
      existing.drawing = drawingSaveFrom(drawing);
    } else {
      this.optimisticDrawings = [
        ...this.optimisticDrawings,
        {
          baselineDrawingIds: new Set(),
          canonicalId: drawing.id,
          drawing: drawingSaveFrom(drawing),
          provisionalId: nextPdfDrawingProvisionalId(),
        },
      ];
    }
    this.requestUpdate();
  }

  retireCreatedDrawing(id: string): void {
    const retained = this.optimisticDrawings.filter(({ canonicalId }) => canonicalId !== id);
    if (retained.length === this.optimisticDrawings.length) return;
    this.optimisticDrawings = retained;
    this.requestUpdate();
  }

  projectProvisionalDrawing(preview: LibraryPdfDrawingPreview): void {
    const data = this.data;
    if (!data || !drawingTargetsData(preview, data)) return;
    const existing = this.optimisticDrawings.find(({ provisionalId }) => provisionalId === preview.provisionalId);
    const projected = {
      baselineDrawingIds: new Set(preview.baselineDrawingIds),
      canonicalId: preview.drawingId,
      drawing: drawingSaveFrom(preview),
      provisionalId: preview.provisionalId,
    } satisfies OptimisticDrawing;
    if (existing) {
      existing.canonicalId = preview.drawingId;
      existing.drawing = drawingSaveFrom(preview);
    } else {
      this.optimisticDrawings = [...this.optimisticDrawings, projected];
    }
    const adoption = optimisticDrawingAdoption(this.optimisticDrawings, data.drawings);
    markClaimedCanonicalDrawings(this.optimisticDrawings, adoption);
    if (adoption.adoptedIds.has(preview.provisionalId)) {
      this.retireProvisionalDrawing(preview.provisionalId);
      return;
    }
    this.requestUpdate();
  }

  projectDrawingSaveState(preview: LibraryPdfDrawingPreview, pending: boolean, failure: string | null): void {
    const optimistic = this.optimisticDrawings.find(({ provisionalId }) => provisionalId === preview.provisionalId);
    if (!optimistic) return;
    if (pending) {
      this.pendingDrawingSaves.add(preview.provisionalId);
      if (this.failedDrawing?.provisionalId === preview.provisionalId) {
        this.failedDrawing = null;
        this.status = "";
      }
    } else {
      this.pendingDrawingSaves.delete(preview.provisionalId);
      if (failure) {
        this.failedDrawing = optimistic;
        this.status = failure;
      } else if (this.failedDrawing?.provisionalId === preview.provisionalId) {
        this.failedDrawing = null;
        this.status = "";
      }
    }
    this.requestUpdate();
  }

  retireProvisionalDrawing(provisionalId: string): void {
    const retained = this.optimisticDrawings.filter((drawing) => drawing.provisionalId !== provisionalId);
    const pending = this.pendingDrawingSaves.delete(provisionalId);
    const failed = this.failedDrawing?.provisionalId === provisionalId;
    if (failed) {
      this.failedDrawing = null;
      this.status = "";
    }
    if (retained.length === this.optimisticDrawings.length && !pending && !failed) return;
    this.optimisticDrawings = retained;
    this.requestUpdate();
  }

  get noteDraft(): LibraryPdfNoteDraft | null {
    return this.noteDraftValue;
  }

  get page(): number | null {
    return this.data?.page ?? null;
  }

  get selectedHighlightId(): string | null {
    return this.selectedHighlightIdValue;
  }

  get selectedMarkupId(): string | null {
    return this.selectedMarkupIdValue;
  }

  get tool(): PdfAnnotationTool {
    return this.interactionTool;
  }

  chooseTool(tool: PdfAnnotationTool): void {
    this.resetToolPresentation();
    this.setInteraction(tool);
  }

  private resetToolPresentation(): void {
    this.noteDraftValue = null;
    this.openNoteId = null;
    this.selectedHighlightIdValue = null;
    this.selectedMarkupIdValue = null;
    if (!this.failedDrawing) this.status = "";
    this.requestUpdate();
  }

  resetState(): void {
    this.setInteraction(this.tool);
    this.noteDraftValue = null;
    this.openNoteId = null;
    this.selectedHighlightIdValue = null;
    this.selectedMarkupIdValue = null;
    this.failedDrawing = null;
    this.pendingDrawingSaves.clear();
    this.status = "";
    this.requestUpdate();
  }

  placeNote(page: number, point: LibraryPdfPoint): void {
    if (this.tool !== "note") return;
    this.noteDraftValue = { page, ...point, editingId: null };
    this.requestUpdate();
  }

  editNote(note: Pick<LibraryPdfNote, "id" | "page" | "x" | "y">): void {
    this.setInteraction(this.tool === "note" ? "note" : "select");
    this.selectedHighlightIdValue = null;
    this.selectedMarkupIdValue = note.id;
    this.openNoteId = null;
    this.noteDraftValue = { page: note.page, x: note.x, y: note.y, editingId: note.id };
    this.requestUpdate();
  }

  clearNote(): void {
    this.noteDraftValue = null;
    this.requestUpdate();
  }

  selectHighlight(id: string): void {
    if (this.tool !== "select") return;
    this.selectedHighlightIdValue = id;
    this.selectedMarkupIdValue = null;
    this.requestUpdate();
  }

  selectMarkup(id: string): void {
    const noteSelectedInNoteMode = this.tool === "note" && this.data?.notes.some((note) => note.id === id);
    if (this.tool !== "select" && !noteSelectedInNoteMode) return;
    this.selectedHighlightIdValue = null;
    this.selectedMarkupIdValue = id;
    this.requestUpdate();
  }

  clearSelection(): void {
    this.selectedHighlightIdValue = null;
    this.selectedMarkupIdValue = null;
    this.requestUpdate();
  }

  toggleNoteCard(id: string): void {
    this.openNoteId = this.openNoteId === id ? null : id;
    this.requestUpdate();
  }

  closeNoteCard(id: string): void {
    this.openNoteId = null;
    this.requestUpdate();
    void this.updateComplete.then(() => this.focusNote(id));
  }

  setInteraction(tool: PdfAnnotationTool, drawingActive = false): void {
    if (!drawingActive) {
      this.cancelDrawing();
      this.cancelNoteDrag();
      this.cancelNotePress();
    }
    this.interactionTool = tool;
    this.dataset.tool = tool;
    if (drawingActive) this.dataset.drawingActive = "true";
    else delete this.dataset.drawingActive;
  }

  point(event: Pick<PointerEvent, "clientX" | "clientY">): LibraryPdfPoint | null {
    const rect = this.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  markupTarget(target: MarkupTargetElement): LibraryPdfMarkupTarget | null {
    const note = target.closest(".pdf-note-pin");
    if (note) return { id: note.getAttribute("data-markup-id"), kind: "note" };
    const drawingId = target.closest(".pdf-ink-stroke")?.getAttribute("data-markup-id");
    return drawingId ? { id: drawingId, kind: "drawing" } : null;
  }

  pointerAction(
    event: Pick<PointerEvent, "clientX" | "clientY" | "pointerId" | "pointerType" | "preventDefault" | "target">,
  ): LibraryPdfPointerAction | null {
    if (isMarkupTargetElement(event.target)) {
      const target = this.markupTarget(event.target);
      if (target?.kind === "note") return this.startNoteDrag(event, target.id);
      if (target?.kind === "drawing" && this.interactionTool === "select") {
        event.preventDefault();
        return target;
      }
      if (event.target.closest("button, input, textarea, select, a[href]")) return null;
    }
    const point = this.point(event);
    if (!point) return null;
    if (this.interactionTool === "note") {
      this.notePress = {
        point,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      return { kind: "start-note" };
    }
    if (this.interactionTool !== "draw") return null;
    if (event.pointerType === "touch") return { kind: "touch-drawing" };
    if (this.savingDrawing || this.pendingDrawingSaves.size > 0 || this.failedDrawing) return null;
    event.preventDefault();
    this.startDrawing(event.pointerId, point);
    return { kind: "start-drawing" };
  }

  private startDrawing(pointerId: number, point: LibraryPdfPoint): void {
    this.status = "";
    this.cancelShapeRecognition();
    this.drawing = { pointerId, points: [point] };
    this.setPointerCapture(pointerId);
    this.setInteraction("draw", true);
    this.requestUpdate();
  }

  private startNoteDrag(
    event: Pick<PointerEvent, "clientX" | "clientY" | "pointerId">,
    noteId: string | null,
  ): { readonly id: string; readonly kind: "note" } | null {
    if (!noteId || (this.interactionTool !== "select" && this.interactionTool !== "note") || this.movingNoteId) return null;
    this.noteDrag = {
      id: noteId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    this.setPointerCapture(event.pointerId);
    return { id: noteId, kind: "note" };
  }

  extendDrawing(event: DrawingPointerEvent, draft: readonly LibraryPdfPoint[]): readonly LibraryPdfPoint[] | null {
    const points = [...draft];
    for (const sample of event.getCoalescedEvents?.() ?? [event]) {
      const point = this.point(sample);
      const previous = points.at(-1);
      if (!point || (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0015)) continue;
      points.push(point);
    }
    return points.length > draft.length ? points : null;
  }

  continueDrawing(event: ActivePointerEvent): boolean {
    const drawing = this.drawing;
    if (!drawing || drawing.pointerId !== event.pointerId) return false;
    if (this.adjustRecognizedShape(event)) return true;
    // Safari can otherwise promote an active Apple Pencil stroke to a native
    // scroll once the zoomed page starts moving, despite cancelling pointerdown.
    event.preventDefault();
    const points = this.extendDrawing(event, drawing.points);
    if (!points) return true;
    this.updateDrawing(points);
    this.scheduleShapeRecognition(points);
    return true;
  }

  recognizeShape(points: readonly LibraryPdfPoint[]): LibraryPdfRecognizedShape | null {
    const rect = this.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const shape = recognizeDrawnShape(points.map((point) => ({ x: point.x * rect.width, y: point.y * rect.height })));
    return shape ? { points: relativePoints(shape.points, rect), shape } : null;
  }

  scheduleShapeRecognition(points: readonly LibraryPdfPoint[]): void {
    const pointer = points.at(-1);
    const hold = this.recognitionHold;
    const rect = this.getBoundingClientRect();
    if (
      pointer &&
      hold &&
      this.recognitionTimer !== undefined &&
      rect.width > 0 &&
      rect.height > 0 &&
      points
        .slice(hold.pointCount)
        .every(
          (point) =>
            Math.hypot((point.x - hold.anchor.x) * rect.width, (point.y - hold.anchor.y) * rect.height) <=
            shapeRecognitionJitterTolerancePx,
        )
    ) {
      return;
    }
    this.cancelShapeRecognition();
    if (!pointer) return;
    this.recognitionHold = { anchor: pointer, pointCount: points.length };
    this.recognitionTimer = globalThis.setTimeout(() => {
      this.recognitionTimer = undefined;
      this.recognitionHold = null;
      const recognized = this.recognizeShape(points);
      if (!recognized) return;
      this.recognizedShape = recognized.shape;
      this.updateDrawing(recognized.points);
      const label = { line: "Line", ellipse: "Circle", rectangle: "Rectangle", triangle: "Triangle" }[recognized.shape.kind];
      this.emitAction({ action: "status", message: `${label} snapped into place. Keep dragging to adjust it, or lift to save.` });
    }, shapeRecognitionDelayMs);
  }

  cancelShapeRecognition(): void {
    if (this.recognitionTimer !== undefined) globalThis.clearTimeout(this.recognitionTimer);
    this.recognitionTimer = undefined;
    this.recognitionHold = null;
    this.recognizedShape = null;
  }

  adjustShape(shape: RecognizedDrawnShape, event: Pick<PointerEvent, "clientX" | "clientY">): readonly LibraryPdfPoint[] | null {
    const rect = this.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const adjusted = manipulateRecognizedShape(shape, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    return relativePoints(adjusted, rect);
  }

  adjustRecognizedShape(event: ActivePointerEvent): boolean {
    const shape = this.recognizedShape;
    if (!shape || this.drawing?.pointerId !== event.pointerId) return false;
    const points = this.adjustShape(shape, event);
    if (!points) return true;
    event.preventDefault();
    this.updateDrawing(points);
    return true;
  }

  async finishDrawing(pointerId: number): Promise<void> {
    const drawing = this.drawing;
    if (!drawing || drawing.pointerId !== pointerId) return;
    const points = drawing.points;
    const data = this.data;
    const optimistic =
      data?.drawingTarget && points.length >= 2
        ? this.createOptimisticDrawing({ ...data.drawingTarget, ...data.drawingStyle, page: data.page, points }, data.drawings)
        : null;
    this.drawing = null;
    this.setInteraction("draw");
    this.requestUpdate();
    if (optimistic) await this.persistDrawing(optimistic);
  }

  cancelDrawing(): boolean {
    const hadDrawing = this.drawing !== null;
    this.drawing = null;
    this.cancelShapeRecognition();
    if (hadDrawing) this.requestUpdate();
    return hadDrawing;
  }

  continueNoteDrag(event: ActivePointerEvent): boolean {
    const drag = this.noteDrag;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    const point = this.point(event);
    if (!point) return true;
    drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;
    if (!drag.moved) return true;
    event.preventDefault();
    this.moveNote(drag.id, point);
    return true;
  }

  async finishNoteDrag(event: Pick<PointerEvent, "clientX" | "clientY" | "pointerId">): Promise<boolean> {
    const drag = this.noteDrag;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    this.noteDrag = null;
    if (!drag.moved) {
      this.toggleNoteCard(drag.id);
      return true;
    }
    const note = this.data?.notes.find((item) => item.id === drag.id);
    const point = this.point(event);
    if (!note || !point) {
      this.requestUpdate();
      return true;
    }
    this.movingNoteId = note.id;
    this.noteMovePreview = { id: note.id, point };
    this.status = "Moving private note…";
    try {
      const response = await fetch(
        `/api/library/references/${encodeURIComponent(note.referenceId)}/pdf-markups/${encodeURIComponent(note.id)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(point),
        },
      );
      await expectOk(response);
      this.status = "";
      this.emitAction({ action: "note-moved" });
    } catch (error) {
      this.noteMovePreview = null;
      this.status = errorMessage(error, "Could not move the private note.");
      this.requestUpdate();
    } finally {
      this.movingNoteId = null;
    }
    return true;
  }

  cancelNoteDrag(): boolean {
    const moved = this.noteDrag?.moved ?? false;
    this.noteDrag = null;
    if (moved) {
      this.noteMovePreview = null;
      this.requestUpdate();
    }
    return moved;
  }

  continueNotePress(event: ActivePointerEvent): boolean {
    const press = this.notePress;
    if (!press || press.pointerId !== event.pointerId) return false;
    press.moved ||= Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > 8;
    return true;
  }

  finishNotePress(pointerId: number): LibraryPdfNotePressResult | null {
    const press = this.notePress;
    if (!press || press.pointerId !== pointerId) return null;
    this.notePress = null;
    return { point: press.moved ? null : press.point };
  }

  cancelNotePress(): void {
    this.notePress = null;
  }

  updateDrawing(points: readonly LibraryPdfPoint[]): void {
    const drawing = this.drawing;
    if (!drawing) return;
    this.drawing = { ...drawing, points };
    this.requestUpdate();
  }

  moveNote(noteId: string, point: LibraryPdfPoint): void {
    const pin = [...this.querySelectorAll<HTMLElement>(".pdf-note-pin[data-markup-id]")].find(({ dataset }) => dataset.markupId === noteId);
    if (!pin) return;
    pin.style.left = `${point.x * 100}%`;
    pin.style.top = `${point.y * 100}%`;
  }

  focusNote(noteId: string): void {
    [...this.querySelectorAll<HTMLButtonElement>(".pdf-note-pin[data-markup-id]")]
      .find(({ dataset }) => dataset.markupId === noteId)
      ?.focus();
  }

  override disconnectedCallback(): void {
    this.cancelDrawing();
    this.cancelNoteDrag();
    this.cancelNotePress();
    super.disconnectedCallback();
  }

  protected override render(): TemplateResult {
    const data = this.data;
    if (!data) return html``;
    const draft = this.noteDraft;
    const drawingDrafts = [
      ...this.optimisticDrawings.filter(({ drawing }) => drawingTargetsData(drawing, data)).map(({ drawing }) => drawing),
      ...(this.drawing ? [{ ...data.drawingStyle, points: this.drawing.points }] : []),
    ];
    return html`
      ${
        data.drawings.length > 0 || drawingDrafts.length > 0
          ? html`<svg class="pdf-ink-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none">
              ${data.drawings.map((drawing) => this.renderDrawing(drawing, drawing.id === this.selectedMarkupId))}
              ${drawingDrafts.map((drawing) => this.renderDrawing({ id: null, ...drawing }, false))}
            </svg>`
          : nothing
      }
      ${
        draft?.page === data.page && !draft.editingId
          ? html`<span
              class="pdf-note-pin"
              data-draft="true"
              style=${`left: ${draft.x * 100}%; top: ${draft.y * 100}%`}
              aria-label=${`New note location on page ${data.page}`}
              title="New note location"
            ></span>`
          : nothing
      }
      ${data.notes.map((note) => this.renderNote(note))}
      <p class="status-line" role="status" ?hidden=${!this.status}>${this.status}</p>
      ${
        this.failedDrawing
          ? html`<div class="library-context-actions">
              <button
                class="button-primary"
                type="button"
                ?disabled=${this.savingDrawing || this.pendingDrawingSaves.has(this.failedDrawing.provisionalId)}
                @click=${this.retryDrawing}
              >
                ${this.savingDrawing || this.pendingDrawingSaves.has(this.failedDrawing.provisionalId) ? "Saving…" : "Retry drawing"}
              </button>
              <button
                class="button-secondary"
                type="button"
                ?disabled=${this.savingDrawing || this.pendingDrawingSaves.has(this.failedDrawing.provisionalId)}
                @click=${this.discardFailedDrawing}
              >
                Discard
              </button>
            </div>`
          : nothing
      }
    `;
  }

  protected async retryDrawing(): Promise<void> {
    if (this.failedDrawing) await this.persistDrawing(this.failedDrawing);
  }

  protected discardFailedDrawing(): void {
    this.removeFailedDrawing();
    this.status = "";
    this.requestUpdate();
  }

  private createOptimisticDrawing(drawing: DrawingSave, existingDrawings: readonly LibraryPdfDrawing[]): OptimisticDrawing {
    const optimistic = {
      baselineDrawingIds: new Set(existingDrawings.map(({ id }) => id)),
      canonicalId: null,
      drawing,
      provisionalId: nextPdfDrawingProvisionalId(),
    } satisfies OptimisticDrawing;
    this.optimisticDrawings = [...this.optimisticDrawings, optimistic];
    return optimistic;
  }

  private reconcileOptimisticDrawings(data: LibraryPdfMarkupLayerData): void {
    const candidates = this.optimisticDrawings.filter((drawing) => drawingTargetsData(drawing.drawing, data));
    const adoption = optimisticDrawingAdoption(candidates, data.drawings);
    markClaimedCanonicalDrawings(candidates, adoption);
    this.optimisticDrawings = candidates.filter(({ provisionalId }) => !adoption.adoptedIds.has(provisionalId));
    const retainedIds = new Set(this.optimisticDrawings.map(({ provisionalId }) => provisionalId));
    for (const provisionalId of this.pendingDrawingSaves) {
      if (!retainedIds.has(provisionalId)) this.pendingDrawingSaves.delete(provisionalId);
    }
    if (this.failedDrawing && (!this.optimisticDrawings.includes(this.failedDrawing) || this.failedDrawing.drawing.page !== data.page)) {
      this.failedDrawing = null;
      this.status = "";
    }
  }

  private removeFailedDrawing(): void {
    const failed = this.failedDrawing;
    if (failed) {
      this.optimisticDrawings = this.optimisticDrawings.filter(({ provisionalId }) => provisionalId !== failed.provisionalId);
      this.pendingDrawingSaves.delete(failed.provisionalId);
    }
    this.failedDrawing = null;
    if (failed) this.emitAction({ action: "drawing-discarded", provisionalId: failed.provisionalId });
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const action = this.pointerAction(event);
    if (action?.kind === "note" || action?.kind === "drawing") {
      this.emitAction({ action: "select-markup", id: action.id });
    } else if (action?.kind === "touch-drawing") {
      this.emitAction({ action: "status", message: "Use Apple Pencil or a mouse to draw; touch gestures pan and zoom the page." });
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.continueNotePress(event) || this.continueNoteDrag(event)) return;
    this.continueDrawing(event);
  };

  private readonly handlePointerUp = async (event: PointerEvent): Promise<void> => {
    const notePress = this.finishNotePress(event.pointerId);
    if (notePress) {
      const target = this.data?.drawingTarget;
      if (notePress.point && target && this.data) {
        this.placeNote(this.data.page, notePress.point);
        const draft = this.noteDraft;
        if (draft) this.emitAction({ action: "place-note", draft: { ...target, ...draft } });
      }
      return;
    }
    if (await this.finishNoteDrag(event)) return;
    await this.finishDrawing(event.pointerId);
  };

  private readonly handlePointerCancel = (): void => {
    this.setInteraction(this.tool);
  };

  private emitAction(detail: LibraryPdfMarkupAction): void {
    this.dispatchEvent(new CustomEvent<LibraryPdfMarkupAction>(libraryPdfMarkupActionEvent, { bubbles: true, detail }));
  }

  private async persistDrawing(optimistic: OptimisticDrawing): Promise<void> {
    if (this.savingDrawing) return;
    this.savingDrawing = true;
    this.status = "Saving private drawing…";
    this.emitAction({ action: "drawing-save-state", failure: null, pending: true, preview: drawingPreviewFrom(optimistic) });
    let failure: string | null = null;
    try {
      const drawing = optimistic.drawing;
      const { referenceId, ...body } = drawing;
      const response = await jsonFetch(`/api/library/references/${encodeURIComponent(referenceId)}/pdf-markups`, {
        kind: "drawing",
        mutationId: optimistic.provisionalId,
        ...body,
      });
      await expectOk(response);
      const value: unknown = await response.json().catch(() => null);
      const responseDrawing =
        isLibraryPdfMarkup(value) &&
        value.kind === "drawing" &&
        value.id === optimistic.provisionalId &&
        drawingTargetsDrawing(value, drawing) &&
        !optimistic.baselineDrawingIds.has(value.id)
          ? value
          : null;
      const createdDrawing = responseDrawing && sameDrawing(responseDrawing, drawing) ? responseDrawing : null;
      optimistic.canonicalId = responseDrawing?.id ?? null;
      if (createdDrawing) {
        optimistic.drawing = drawingSaveFrom(createdDrawing);
      }
      this.failedDrawing = null;
      this.status = "";
      if (this.data) this.reconcileOptimisticDrawings(this.data);
      this.emitAction({
        action: "drawing-saved",
        drawing: createdDrawing,
        drawingId: responseDrawing?.id ?? null,
        preview: drawingPreviewFrom(optimistic),
      });
    } catch (error) {
      const data = this.data;
      const current = this.optimisticDrawings.find(({ provisionalId }) => provisionalId === optimistic.provisionalId);
      failure = errorMessage(error, "Could not save the private drawing.");
      if (data && current && drawingTargetsData(current.drawing, data)) {
        this.failedDrawing = current;
        this.status = failure;
      }
    } finally {
      this.savingDrawing = false;
      this.emitAction({ action: "drawing-save-state", failure, pending: false, preview: drawingPreviewFrom(optimistic) });
    }
  }

  private renderDrawing(
    drawing: Pick<LibraryPdfDrawing, "color" | "points" | "width"> & { readonly id: string | null },
    selected: boolean,
  ): TemplateResult {
    return svg`<polyline
      class="pdf-ink-stroke"
      points=${drawingPoints(drawing.points)}
      fill="none"
      stroke=${drawing.color}
      stroke-width=${drawing.width}
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
      data-markup-id=${drawing.id ?? nothing}
      data-selected=${selected ? "true" : nothing}
    ></polyline>`;
  }

  private renderNote(note: LibraryPdfNote): TemplateResult {
    const point = this.noteMovePreview?.id === note.id ? this.noteMovePreview.point : note;
    return html`
      <button
        class="pdf-note-pin"
        type="button"
        data-markup-id=${note.id}
        data-selected=${note.id === this.selectedMarkupId ? "true" : nothing}
        style=${`left: ${point.x * 100}%; top: ${point.y * 100}%`}
        aria-label=${`Open note on page ${note.page}`}
        title=${this.tool === "select" || this.tool === "note" ? "Tap to select; drag to move" : "Choose Note or Select to edit this note"}
      ></button>
      ${
        this.openNoteId === note.id
          ? html`<aside
              class="pdf-note-card"
              style=${`left: ${Math.min(point.x * 100, 70)}%; top: ${Math.min(point.y * 100, 82)}%`}
              aria-label=${`Note on page ${note.page}`}
            >
              <p>${note.body}</p>
              <button
                class="pdf-note-card-close"
                type="button"
                aria-label=${`Close note on page ${note.page}`}
                title="Close note"
                @click=${(event: MouseEvent) => {
                  event.stopPropagation();
                  this.closeNoteCard(note.id);
                }}
              >
                ×
              </button>
            </aside>`
          : nothing
      }
    `;
  }
}

interface OptimisticDrawingAdoption {
  readonly adoptedIds: ReadonlySet<string>;
  readonly claimedDrawings: readonly LibraryPdfDrawing[];
}

function optimisticDrawingAdoption(
  optimisticDrawings: readonly OptimisticDrawing[],
  drawings: readonly LibraryPdfDrawing[],
): OptimisticDrawingAdoption {
  const adopted = new Set<string>();
  const usedCanonicalIds = new Set<string>();
  const drawingsById = new Map(drawings.map((drawing) => [drawing.id, drawing]));
  for (const optimistic of optimisticDrawings) {
    const expectedId = optimistic.canonicalId ?? optimistic.provisionalId;
    if (optimistic.baselineDrawingIds.has(expectedId) || !drawingsById.has(expectedId)) continue;
    adopted.add(optimistic.provisionalId);
    usedCanonicalIds.add(expectedId);
  }
  return {
    adoptedIds: adopted,
    claimedDrawings: drawings.filter(({ id }) => usedCanonicalIds.has(id)),
  };
}

function markClaimedCanonicalDrawings(optimisticDrawings: readonly OptimisticDrawing[], adoption: OptimisticDrawingAdoption): void {
  for (const optimistic of optimisticDrawings) {
    if (optimistic.canonicalId || adoption.adoptedIds.has(optimistic.provisionalId)) continue;
    for (const drawing of adoption.claimedDrawings) {
      if (sameDrawing(drawing, optimistic.drawing)) optimistic.baselineDrawingIds.add(drawing.id);
    }
  }
}

function drawingSaveFrom(
  drawing: Pick<LibraryPdfDrawing, "artifactId" | "color" | "page" | "points" | "referenceId" | "width">,
): DrawingSave {
  return {
    artifactId: drawing.artifactId,
    color: drawing.color,
    page: drawing.page,
    points: drawing.points,
    referenceId: drawing.referenceId,
    width: drawing.width,
  };
}

function drawingPreviewFrom(optimistic: OptimisticDrawing): LibraryPdfDrawingPreview {
  return {
    ...optimistic.drawing,
    baselineDrawingIds: [...optimistic.baselineDrawingIds],
    drawingId: optimistic.canonicalId,
    provisionalId: optimistic.provisionalId,
  };
}

function nextPdfDrawingProvisionalId(): string {
  return crypto.randomUUID();
}

function drawingTargetsData(drawing: DrawingSave, data: LibraryPdfMarkupLayerData): boolean {
  const target = data.drawingTarget;
  return (
    target !== null && drawing.artifactId === target.artifactId && drawing.referenceId === target.referenceId && drawing.page === data.page
  );
}

function drawingTargetsDrawing(drawing: LibraryPdfDrawing, target: DrawingSave): boolean {
  return drawing.artifactId === target.artifactId && drawing.referenceId === target.referenceId && drawing.page === target.page;
}

function sameDrawing(drawing: LibraryPdfDrawing, target: DrawingSave): boolean {
  return (
    drawingTargetsDrawing(drawing, target) &&
    drawing.color === target.color.toLocaleLowerCase() &&
    drawing.width === target.width &&
    drawing.points.length === target.points.length &&
    drawing.points.every((point, index) => point.x === target.points[index]?.x && point.y === target.points[index]?.y)
  );
}

function relativePoints(
  points: readonly { readonly x: number; readonly y: number }[],
  rect: Pick<DOMRect, "height" | "width">,
): readonly LibraryPdfPoint[] {
  return points.map((point) => ({
    x: Math.max(0, Math.min(1, point.x / rect.width)),
    y: Math.max(0, Math.min(1, point.y / rect.height)),
  }));
}

function drawingPoints(points: readonly LibraryPdfPoint[]): string {
  return points.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ");
}

function isMarkupTargetElement(target: EventTarget | null): target is EventTarget & MarkupTargetElement {
  return !!target && "closest" in target && typeof target.closest === "function";
}

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-markup-layer")) {
  customElements.define("library-pdf-markup-layer", LibraryPdfMarkupLayer);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-markup-layer": LibraryPdfMarkupLayer;
  }
}
