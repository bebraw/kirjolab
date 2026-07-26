import { html, LitElement, nothing, type TemplateResult } from "lit";
import type { LibraryPdfDrawing, LibraryPdfNote, LibraryPdfPoint } from "../domain/reference-library";
import { manipulateRecognizedShape, recognizeDrawnShape, type RecognizedDrawnShape } from "./drawn-shape-recognition";
import type { PdfAnnotationTool } from "./pdf-annotation-machine";

interface PdfNoteDraft {
  readonly editingId: string | null;
  readonly page: number;
  readonly x: number;
  readonly y: number;
}

export interface LibraryPdfMarkupLayerData {
  readonly drawings: readonly LibraryPdfDrawing[];
  readonly noteDraft: PdfNoteDraft | null;
  readonly notes: readonly LibraryPdfNote[];
  readonly openNoteId: string | null;
  readonly page: number;
  readonly selectedMarkupId: string | null;
  readonly tool: PdfAnnotationTool;
}

export interface LibraryPdfMarkupLayerAction {
  readonly action: "close-note";
  readonly noteId: string;
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

export interface LibraryPdfDrawingUpdate {
  readonly additions: readonly LibraryPdfPoint[];
  readonly points: readonly LibraryPdfPoint[];
}

export const libraryPdfMarkupLayerActionEvent = "library-pdf-markup-layer-action";

export class LibraryPdfMarkupLayer extends LitElement {
  static override properties = { data: { state: true } };

  declare private data: LibraryPdfMarkupLayerData | null;

  constructor() {
    super();
    this.data = null;
  }

  setData(data: LibraryPdfMarkupLayerData): void {
    this.data = data;
    if (this.isConnected) this.performUpdate();
  }

  setInteraction(tool: PdfAnnotationTool, drawingActive = false): void {
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

  extendDrawing(event: DrawingPointerEvent, draft: readonly LibraryPdfPoint[]): LibraryPdfDrawingUpdate | null {
    const points = [...draft];
    const additions: LibraryPdfPoint[] = [];
    for (const sample of event.getCoalescedEvents?.() ?? [event]) {
      const point = this.point(sample);
      const previous = points.at(-1);
      if (!point || (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0015)) continue;
      points.push(point);
      additions.push(point);
    }
    return additions.length > 0 ? { additions, points } : null;
  }

  recognizeShape(points: readonly LibraryPdfPoint[]): LibraryPdfRecognizedShape | null {
    const rect = this.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const shape = recognizeDrawnShape(points.map((point) => ({ x: point.x * rect.width, y: point.y * rect.height })));
    return shape ? { points: relativePoints(shape.points, rect), shape } : null;
  }

  adjustShape(shape: RecognizedDrawnShape, event: Pick<PointerEvent, "clientX" | "clientY">): readonly LibraryPdfPoint[] | null {
    const rect = this.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const adjusted = manipulateRecognizedShape(shape, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    return relativePoints(adjusted, rect);
  }

  updateDraft(points: readonly LibraryPdfPoint[]): void {
    this.querySelector<SVGPolylineElement>('.pdf-ink-stroke[data-markup-id="draft"]')?.setAttribute("points", drawingPoints(points));
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

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const data = this.data;
    if (!data) return html``;
    const draft = data.noteDraft;
    return html`
      ${data.drawings.length > 0
        ? html`<svg class="pdf-ink-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            ${data.drawings.map(
              (drawing) =>
                html`<polyline
                  class="pdf-ink-stroke"
                  points=${drawingPoints(drawing.points)}
                  fill="none"
                  stroke=${drawing.color}
                  stroke-width=${drawing.width}
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  vector-effect="non-scaling-stroke"
                  data-markup-id=${drawing.id}
                  data-selected=${drawing.id === data.selectedMarkupId ? "true" : nothing}
                ></polyline>`,
            )}
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
      ${data.notes.map((note) => this.renderNote(data, note))}
    `;
  }

  protected emitAction(action: LibraryPdfMarkupLayerAction): void {
    this.dispatchEvent(new CustomEvent<LibraryPdfMarkupLayerAction>(libraryPdfMarkupLayerActionEvent, { bubbles: true, detail: action }));
  }

  private renderNote(data: LibraryPdfMarkupLayerData, note: LibraryPdfNote): TemplateResult {
    return html`
      <button
        class="pdf-note-pin"
        type="button"
        data-markup-id=${note.id}
        data-selected=${note.id === data.selectedMarkupId ? "true" : nothing}
        style=${`left: ${note.x * 100}%; top: ${note.y * 100}%`}
        aria-label=${`Open note on page ${note.page}`}
        title=${data.tool === "select" ? "Tap to select; drag to move" : "Choose Select to edit this note"}
      ></button>
      ${data.openNoteId === note.id
        ? html`<aside
            class="pdf-note-card"
            style=${`left: ${Math.min(note.x * 100, 70)}%; top: ${Math.min(note.y * 100, 82)}%`}
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
                this.emitAction({ action: "close-note", noteId: note.id });
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

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-markup-layer")) {
  customElements.define("library-pdf-markup-layer", LibraryPdfMarkupLayer);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-markup-layer": LibraryPdfMarkupLayer;
  }
}
