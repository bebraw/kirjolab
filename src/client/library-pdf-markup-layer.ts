import { html, LitElement, nothing, type TemplateResult } from "lit";
import type { LibraryPdfDrawing, LibraryPdfNote, LibraryPdfPoint } from "../domain/reference-library";
import { manipulateRecognizedShape, recognizeDrawnShape, type RecognizedDrawnShape } from "./drawn-shape-recognition";
import { errorMessage, expectOk, jsonFetch } from "./http";

export type PdfAnnotationTool = "select" | "text" | "note" | "draw";

interface PdfNoteDraft {
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

export interface LibraryPdfShapeRecognition {
  readonly kind: RecognizedDrawnShape["kind"];
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

interface DrawingSave extends Pick<LibraryPdfDrawing, "color" | "page" | "points" | "width"> {
  readonly artifactId: string;
  readonly referenceId: string;
}

export interface LibraryPdfNotePressResult {
  readonly point: LibraryPdfPoint | null;
}

export type LibraryPdfMarkupTarget =
  | { readonly id: string | null; readonly kind: "note" }
  | { readonly id: string; readonly kind: "drawing" };

export type LibraryPdfPointerAction =
  | { readonly id: string; readonly kind: "note" | "drawing" }
  | { readonly kind: "start-drawing" | "start-note" | "touch-drawing" };

interface MarkupTargetElement {
  closest(selector: string): Pick<Element, "getAttribute"> | null;
}

export const libraryPdfShapeRecognizedEvent = "library-pdf-shape-recognized";
export const libraryPdfMarkupActionEvent = "library-pdf-markup-action";

export interface LibraryPdfMarkupAction {
  readonly action: "drawing-saved" | "note-moved";
}

export class LibraryPdfMarkupLayer extends LitElement {
  static override properties = { data: { state: true }, savingDrawing: { state: true }, status: { state: true } };

  declare private data: LibraryPdfMarkupLayerData | null;
  declare private savingDrawing: boolean;
  declare private status: string;
  private drawing: ActiveDrawing | null = null;
  private failedDrawing: DrawingSave | null = null;
  private interactionTool: PdfAnnotationTool = "text";
  private noteDraftValue: PdfNoteDraft | null = null;
  private noteDrag: ActiveNoteDrag | null = null;
  private noteMovePreview: { readonly id: string; readonly point: LibraryPdfPoint } | null = null;
  private notePress: ActiveNotePress | null = null;
  private movingNoteId: string | null = null;
  private openNoteId: string | null = null;
  private recognizedShape: RecognizedDrawnShape | null = null;
  private recognitionTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
  private selectedHighlightIdValue: string | null = null;
  private selectedMarkupIdValue: string | null = null;

  constructor() {
    super();
    this.data = null;
    this.savingDrawing = false;
    this.status = "";
  }

  setData(data: LibraryPdfMarkupLayerData): void {
    this.data = data;
    if (this.failedDrawing && (this.failedDrawing.artifactId !== data.drawingTarget?.artifactId || this.failedDrawing.page !== data.page)) {
      this.failedDrawing = null;
      this.status = "";
    }
    if (!this.movingNoteId) this.noteMovePreview = null;
    if (this.isConnected) this.performUpdate();
  }

  get noteDraft(): PdfNoteDraft | null {
    return this.noteDraftValue;
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
    this.resetState();
    this.setInteraction(tool);
  }

  resetState(): void {
    this.setInteraction(this.tool);
    this.noteDraftValue = null;
    this.openNoteId = null;
    this.selectedHighlightIdValue = null;
    this.selectedMarkupIdValue = null;
    this.failedDrawing = null;
    this.status = "";
    this.requestUpdate();
  }

  placeNote(page: number, point: LibraryPdfPoint): void {
    if (this.tool !== "note") return;
    this.noteDraftValue = { page, ...point, editingId: null };
    this.requestUpdate();
  }

  editNote(note: Pick<LibraryPdfNote, "id" | "page" | "x" | "y">): void {
    this.setInteraction("select");
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
    if (this.tool !== "select") return;
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
      if (target?.kind === "note") {
        if (!target.id || this.interactionTool !== "select" || this.movingNoteId) return null;
        this.noteDrag = {
          id: target.id,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        };
        this.setPointerCapture(event.pointerId);
        return { id: target.id, kind: "note" };
      }
      if (target?.kind === "drawing" && this.interactionTool === "select") {
        event.preventDefault();
        return target;
      }
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
    if (this.savingDrawing) return null;
    event.preventDefault();
    this.failedDrawing = null;
    this.status = "";
    this.cancelShapeRecognition();
    this.drawing = { pointerId: event.pointerId, points: [point] };
    this.setPointerCapture(event.pointerId);
    this.setInteraction("draw", true);
    this.requestUpdate();
    return { kind: "start-drawing" };
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
    this.cancelShapeRecognition();
    this.recognitionTimer = globalThis.setTimeout(() => {
      this.recognitionTimer = undefined;
      const recognized = this.recognizeShape(points);
      if (!recognized) return;
      this.recognizedShape = recognized.shape;
      this.updateDrawing(recognized.points);
      this.dispatchEvent(
        new CustomEvent<LibraryPdfShapeRecognition>(libraryPdfShapeRecognizedEvent, {
          bubbles: true,
          detail: { kind: recognized.shape.kind },
        }),
      );
    }, 850);
  }

  cancelShapeRecognition(): void {
    if (this.recognitionTimer !== undefined) globalThis.clearTimeout(this.recognitionTimer);
    this.recognitionTimer = undefined;
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
    this.drawing = null;
    this.setInteraction("draw");
    this.requestUpdate();
    const data = this.data;
    if (!data?.drawingTarget || points.length < 2) return;
    await this.persistDrawing({ ...data.drawingTarget, ...data.drawingStyle, page: data.page, points });
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
      this.dispatchEvent(
        new CustomEvent<LibraryPdfMarkupAction>(libraryPdfMarkupActionEvent, {
          bubbles: true,
          detail: { action: "note-moved" },
        }),
      );
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

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  override disconnectedCallback(): void {
    this.cancelDrawing();
    this.cancelNoteDrag();
    this.cancelNotePress();
    super.disconnectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const data = this.data;
    if (!data) return html``;
    const draft = this.noteDraft;
    const drawingDraft = this.drawing ? { ...data.drawingStyle, points: this.drawing.points } : this.failedDrawing;
    return html`
      ${data.drawings.length > 0 || drawingDraft
        ? html`<svg class="pdf-ink-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            ${data.drawings.map((drawing) => this.renderDrawing(drawing, drawing.id === this.selectedMarkupId))}
            ${drawingDraft ? this.renderDrawing({ id: "draft", ...drawingDraft }, false) : nothing}
          </svg>`
        : nothing}
      ${draft?.page === data.page && !draft.editingId
        ? html`<span
            class="pdf-note-pin"
            data-draft="true"
            style=${`left: ${draft.x * 100}%; top: ${draft.y * 100}%`}
            aria-label=${`New note location on page ${data.page}`}
            title="New note location"
          ></span>`
        : nothing}
      ${data.notes.map((note) => this.renderNote(note))}
      <p class="status-line" role="status" ?hidden=${!this.status}>${this.status}</p>
      ${this.failedDrawing
        ? html`<div class="library-context-actions">
            <button class="button-primary" type="button" ?disabled=${this.savingDrawing} @click=${this.retryDrawing}>
              ${this.savingDrawing ? "Saving…" : "Retry drawing"}
            </button>
            <button class="button-secondary" type="button" ?disabled=${this.savingDrawing} @click=${this.discardFailedDrawing}>
              Discard
            </button>
          </div>`
        : nothing}
    `;
  }

  protected async retryDrawing(): Promise<void> {
    if (this.failedDrawing) await this.persistDrawing(this.failedDrawing);
  }

  protected discardFailedDrawing(): void {
    this.failedDrawing = null;
    this.status = "";
    this.requestUpdate();
  }

  private async persistDrawing(drawing: DrawingSave): Promise<void> {
    if (this.savingDrawing) return;
    this.savingDrawing = true;
    this.status = "Saving private drawing…";
    try {
      const { referenceId, ...body } = drawing;
      const response = await jsonFetch(`/api/library/references/${encodeURIComponent(referenceId)}/pdf-markups`, {
        kind: "drawing",
        ...body,
      });
      await expectOk(response);
      this.failedDrawing = null;
      this.status = "";
      this.dispatchEvent(
        new CustomEvent<LibraryPdfMarkupAction>(libraryPdfMarkupActionEvent, {
          bubbles: true,
          detail: { action: "drawing-saved" },
        }),
      );
    } catch (error) {
      this.failedDrawing = drawing;
      this.status = errorMessage(error, "Could not save the private drawing.");
    } finally {
      this.savingDrawing = false;
    }
  }

  private renderDrawing(drawing: Pick<LibraryPdfDrawing, "color" | "id" | "points" | "width">, selected: boolean): TemplateResult {
    return html`<polyline
      class="pdf-ink-stroke"
      points=${drawingPoints(drawing.points)}
      fill="none"
      stroke=${drawing.color}
      stroke-width=${drawing.width}
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
      data-markup-id=${drawing.id}
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
        title=${this.tool === "select" ? "Tap to select; drag to move" : "Choose Select to edit this note"}
      ></button>
      ${this.openNoteId === note.id
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
        : nothing}
    `;
  }
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
