import { html, LitElement, type TemplateResult } from "lit";
import type { PdfSelectionRect } from "../domain/workspace";

export interface LibraryHighlightDraft {
  readonly highlightId: string | null;
  readonly page: number;
  readonly quote: string;
  readonly comment: string;
  readonly rects: readonly PdfSelectionRect[];
}

export interface LibraryDrawingSelection {
  readonly label: string;
  readonly kind: "drawing" | "note";
  readonly color?: string;
  readonly width?: number;
}

export type LibraryPdfAnnotationAction =
  | {
      readonly action: "save-highlight";
      readonly highlightId: string | null;
      readonly page: number;
      readonly quote: string;
      readonly comment: string;
      readonly rects: readonly PdfSelectionRect[];
    }
  | { readonly action: "cancel-highlight" }
  | { readonly action: "save-note"; readonly body: string }
  | { readonly action: "cancel-note" }
  | { readonly action: "apply-drawing"; readonly color: string; readonly width: number }
  | { readonly action: "edit-note" | "delete-markup" | "clear-markup" };

export const libraryPdfAnnotationActionEvent = "library-pdf-annotation-action";

export class LibraryPdfAnnotationForms extends LitElement {
  static override properties = {
    highlightPage: { state: true },
    highlightQuote: { state: true },
    highlightComment: { state: true },
    highlightVisible: { state: true },
    noteBody: { state: true },
    noteVisible: { state: true },
    markupLabel: { state: true },
    markupKind: { state: true },
    drawingColor: { state: true },
    drawingWidth: { state: true },
    markupVisible: { state: true },
  };

  declare private highlightPage: number;
  declare private highlightQuote: string;
  declare private highlightComment: string;
  declare private highlightVisible: boolean;
  declare private noteBody: string;
  declare private noteVisible: boolean;
  declare private markupLabel: string;
  declare private markupKind: "drawing" | "note";
  declare private drawingColor: string;
  declare private drawingWidth: number;
  declare private markupVisible: boolean;
  #highlightId: string | null = null;
  #highlightRects: readonly PdfSelectionRect[] = [];

  constructor() {
    super();
    this.highlightPage = 1;
    this.highlightQuote = "";
    this.highlightComment = "";
    this.highlightVisible = false;
    this.noteBody = "";
    this.noteVisible = false;
    this.markupLabel = "Selected annotation";
    this.markupKind = "note";
    this.drawingColor = "#d33f49";
    this.drawingWidth = 4;
    this.markupVisible = false;
  }

  get highlightOpen(): boolean {
    return this.highlightVisible;
  }

  get noteOpen(): boolean {
    return this.noteVisible;
  }

  get markupOpen(): boolean {
    return this.markupVisible;
  }

  get empty(): boolean {
    return !this.highlightVisible && !this.noteVisible && !this.markupVisible;
  }

  showHighlight(draft: LibraryHighlightDraft): void {
    this.#highlightId = draft.highlightId;
    this.#highlightRects = draft.rects;
    this.highlightPage = draft.page;
    this.highlightQuote = draft.quote;
    this.highlightComment = draft.comment;
    this.highlightVisible = true;
  }

  clearHighlight(page: number): void {
    this.#highlightId = null;
    this.#highlightRects = [];
    this.highlightPage = page;
    this.highlightQuote = "";
    this.highlightComment = "";
    this.highlightVisible = false;
  }

  showNote(body = ""): void {
    this.noteBody = body;
    this.noteVisible = true;
  }

  clearNote(): void {
    this.noteBody = "";
    this.noteVisible = false;
  }

  showMarkup(selection: LibraryDrawingSelection): void {
    this.markupLabel = selection.label;
    this.markupKind = selection.kind;
    if (selection.color) this.drawingColor = selection.color;
    if (selection.width !== undefined) this.drawingWidth = selection.width;
    this.markupVisible = true;
  }

  clearMarkup(): void {
    this.markupVisible = false;
  }

  focusHighlightComment(): void {
    void this.updateComplete.then(() => this.querySelector<HTMLInputElement>("#library-highlight-comment")?.focus());
  }

  focusNote(): void {
    void this.updateComplete.then(() => this.querySelector<HTMLTextAreaElement>("#library-note-body")?.focus());
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
      <form class="library-context-composer" id="library-highlight-form" ?hidden=${!this.highlightVisible} @submit=${this.saveHighlight}>
        <input id="library-highlight-page" type="hidden" .value=${String(this.highlightPage)} />
        <textarea id="library-highlight-quote" hidden maxlength="20000" required .value=${this.highlightQuote}></textarea>
        <blockquote class="library-selection-excerpt" id="library-highlight-excerpt">
          ${this.highlightQuote ? `“${this.highlightQuote}”` : ""}
        </blockquote>
        <input
          class="field"
          id="library-highlight-comment"
          type="text"
          maxlength="8000"
          aria-label="Private comment"
          placeholder="Add a note (optional)"
          .value=${this.highlightComment}
          @input=${this.updateHighlightComment}
        />
        <button class="button-primary" id="save-library-highlight" type="submit">${this.#highlightId ? "Save note" : "Save"}</button>
        <button
          class="button-secondary"
          id="cancel-library-highlight"
          type="button"
          @click=${() => this.emitAction({ action: "cancel-highlight" })}
        >
          Cancel
        </button>
      </form>
      <form class="library-context-composer" id="library-note-form" ?hidden=${!this.noteVisible} @submit=${this.saveNote}>
        <textarea
          class="field"
          id="library-note-body"
          maxlength="8000"
          required
          aria-label="Private PDF note"
          placeholder="Write a private note…"
          .value=${this.noteBody}
          @input=${this.updateNoteBody}
        ></textarea>
        <button class="button-primary" type="submit">Save note</button>
        <button class="button-secondary" id="cancel-library-note" type="button" @click=${() => this.emitAction({ action: "cancel-note" })}>
          Cancel
        </button>
      </form>
      <form
        class="library-context-composer library-markup-selection"
        id="library-markup-selection"
        ?hidden=${!this.markupVisible}
        @submit=${this.applyDrawing}
      >
        <strong>${this.markupLabel}</strong>
        <div class="library-selected-drawing-options" ?hidden=${this.markupKind !== "drawing"}>
          <label title="Selected line color"
            ><span class="sr-only">Selected line color</span
            ><input id="library-selected-draw-color" type="color" .value=${this.drawingColor} @input=${this.updateDrawingColor}
          /></label>
          <label class="library-width-control" title="Selected line width"
            ><span class="sr-only">Selected line width</span
            ><input
              id="library-selected-draw-width"
              type="range"
              min="1"
              max="24"
              .value=${String(this.drawingWidth)}
              @input=${this.updateDrawingWidth}
            /><output id="library-selected-draw-width-value">${this.drawingWidth}</output></label
          >
          <button class="button-primary" type="submit">Apply style</button>
        </div>
        <button
          class="button-secondary"
          id="edit-selected-library-note"
          type="button"
          ?hidden=${this.markupKind !== "note"}
          @click=${() => this.emitAction({ action: "edit-note" })}
        >
          Edit note
        </button>
        <button
          class="button-secondary"
          id="delete-selected-library-markup"
          type="button"
          data-destructive="true"
          @click=${() => this.emitAction({ action: "delete-markup" })}
        >
          Delete
        </button>
        <button
          class="button-secondary"
          id="cancel-library-markup-selection"
          type="button"
          @click=${() => this.emitAction({ action: "clear-markup" })}
        >
          Done
        </button>
      </form>
    `;
  }

  protected updateHighlightComment(event: Event): void {
    this.highlightComment = inputValue(event);
  }

  protected updateNoteBody(event: Event): void {
    this.noteBody = inputValue(event);
  }

  protected updateDrawingColor(event: Event): void {
    this.drawingColor = inputValue(event);
  }

  protected updateDrawingWidth(event: Event): void {
    this.drawingWidth = Number(inputValue(event));
  }

  protected saveHighlight(event: SubmitEvent): void {
    event.preventDefault();
    this.emitAction({
      action: "save-highlight",
      highlightId: this.#highlightId,
      page: this.highlightPage,
      quote: this.highlightQuote.trim(),
      comment: this.highlightComment,
      rects: this.#highlightRects,
    });
  }

  protected saveNote(event: SubmitEvent): void {
    event.preventDefault();
    this.emitAction({ action: "save-note", body: this.noteBody.trim() });
  }

  protected applyDrawing(event: SubmitEvent): void {
    event.preventDefault();
    this.emitAction({ action: "apply-drawing", color: this.drawingColor, width: this.drawingWidth });
  }

  protected emitAction(action: LibraryPdfAnnotationAction): void {
    this.dispatchEvent(new CustomEvent(libraryPdfAnnotationActionEvent, { detail: action }));
  }
}

function inputValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value;
}

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-annotation-forms")) {
  customElements.define("library-pdf-annotation-forms", LibraryPdfAnnotationForms);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-annotation-forms": LibraryPdfAnnotationForms;
  }
}
