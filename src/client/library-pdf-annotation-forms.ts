import { html, LitElement, type TemplateResult } from "lit";
import { libraryPdfRectsOverlap, type LibraryHighlight } from "../domain/reference-library";
import type { PdfSelectionRect } from "../domain/workspace";
import { errorMessage, expectOk, jsonFetch } from "./http";

export interface LibraryHighlightDraft {
  readonly highlightId: string | null;
  readonly page: number;
  readonly quote: string;
  readonly comment: string;
  readonly rects: readonly PdfSelectionRect[];
}

export interface LibraryMarkupSelection {
  readonly id: string;
  readonly label: string;
  readonly kind: "drawing" | "note";
  readonly referenceId: string;
  readonly color?: string;
  readonly width?: number;
}

interface LibraryHighlightContext {
  readonly artifactId: string;
  readonly highlights: readonly LibraryHighlight[];
  readonly referenceId: string;
}

interface LibraryNoteContext {
  readonly artifactId: string;
  readonly editingId: string | null;
  readonly page: number;
  readonly referenceId: string;
  readonly x: number;
  readonly y: number;
}

export type LibraryPdfAnnotationAction =
  | { readonly action: "highlight-saved"; readonly kind: "created" | "extended" | "updated" }
  | { readonly action: "cancel-highlight" }
  | { readonly action: "note-saved"; readonly kind: "created" | "updated" }
  | { readonly action: "cancel-note" }
  | { readonly action: "markup-saved"; readonly kind: "deleted" | "updated" }
  | { readonly action: "edit-note" | "clear-markup" };

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
    saving: { state: true },
    status: { state: true },
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
  declare private saving: "" | "highlight" | "markup" | "note";
  declare private status: string;
  private highlightContext: LibraryHighlightContext | null = null;
  private noteContext: LibraryNoteContext | null = null;
  private markupTarget: Pick<LibraryMarkupSelection, "id" | "referenceId"> | null = null;
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
    this.saving = "";
    this.status = "";
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

  setHighlightContext(context: LibraryHighlightContext): void {
    this.highlightContext = context;
  }

  clearHighlight(page: number): void {
    this.#highlightId = null;
    this.#highlightRects = [];
    this.highlightPage = page;
    this.highlightQuote = "";
    this.highlightComment = "";
    this.highlightVisible = false;
    this.status = "";
  }

  showNote(body = "", context?: LibraryNoteContext): void {
    this.noteBody = body;
    if (context) this.noteContext = context;
    this.noteVisible = true;
  }

  clearNote(): void {
    this.noteBody = "";
    this.noteContext = null;
    this.noteVisible = false;
    this.status = "";
  }

  showMarkup(selection: LibraryMarkupSelection): void {
    this.markupTarget = { id: selection.id, referenceId: selection.referenceId };
    this.markupLabel = selection.label;
    this.markupKind = selection.kind;
    if (selection.color) this.drawingColor = selection.color;
    if (selection.width !== undefined) this.drawingWidth = selection.width;
    this.markupVisible = true;
  }

  clearMarkup(): void {
    this.markupTarget = null;
    this.markupVisible = false;
    this.status = "";
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
        <button class="button-primary" id="save-library-highlight" type="submit" ?disabled=${Boolean(this.saving)}>
          ${this.saving === "highlight" ? "Saving…" : this.#highlightId ? "Save note" : "Save"}
        </button>
        <button
          class="button-secondary"
          id="cancel-library-highlight"
          type="button"
          ?disabled=${Boolean(this.saving)}
          @click=${() => this.emitAction({ action: "cancel-highlight" })}
        >
          Cancel
        </button>
        <p class="status-line" role="status" ?hidden=${!this.status}>${this.status}</p>
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
        <button class="button-primary" type="submit" ?disabled=${Boolean(this.saving)}>
          ${this.saving === "note" ? "Saving…" : "Save note"}
        </button>
        <button
          class="button-secondary"
          id="cancel-library-note"
          type="button"
          ?disabled=${Boolean(this.saving)}
          @click=${() => this.emitAction({ action: "cancel-note" })}
        >
          Cancel
        </button>
        <p class="status-line" role="status" ?hidden=${!this.status}>${this.status}</p>
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
          <button class="button-primary" type="submit" ?disabled=${Boolean(this.saving)}>
            ${this.saving === "markup" ? "Applying…" : "Apply style"}
          </button>
        </div>
        <button
          class="button-secondary"
          id="edit-selected-library-note"
          type="button"
          ?hidden=${this.markupKind !== "note"}
          ?disabled=${Boolean(this.saving)}
          @click=${() => this.emitAction({ action: "edit-note" })}
        >
          Edit note
        </button>
        <button
          class="button-secondary"
          id="delete-selected-library-markup"
          type="button"
          data-destructive="true"
          ?disabled=${Boolean(this.saving)}
          @click=${this.deleteMarkup}
        >
          Delete
        </button>
        <button
          class="button-secondary"
          id="cancel-library-markup-selection"
          type="button"
          ?disabled=${Boolean(this.saving)}
          @click=${() => this.emitAction({ action: "clear-markup" })}
        >
          Done
        </button>
        <p class="status-line" role="status" ?hidden=${!this.status}>${this.status}</p>
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

  protected async saveHighlight(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const context = this.highlightContext;
    const quote = this.highlightQuote.trim();
    if (this.saving || !context || !quote) return;
    this.saving = "highlight";
    this.status = "Saving private highlight…";
    try {
      let kind: Extract<LibraryPdfAnnotationAction, { action: "highlight-saved" }>["kind"];
      if (this.#highlightId) {
        const response = await fetch(
          `/api/library/references/${encodeURIComponent(context.referenceId)}/highlights/${encodeURIComponent(this.#highlightId)}`,
          {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ comment: this.highlightComment }),
          },
        );
        await expectOk(response);
        kind = "updated";
      } else {
        const extendsExisting = context.highlights.some(
          (highlight) =>
            highlight.artifactId === context.artifactId &&
            highlight.page === this.highlightPage &&
            libraryPdfRectsOverlap(highlight.rects, this.#highlightRects),
        );
        const response = await jsonFetch(`/api/library/references/${encodeURIComponent(context.referenceId)}/highlights`, {
          artifactId: context.artifactId,
          page: this.highlightPage,
          quote,
          comment: this.highlightComment,
          rects: this.#highlightRects,
        });
        await expectOk(response);
        kind = extendsExisting ? "extended" : "created";
      }
      this.clearHighlight(this.highlightPage);
      this.emitAction({ action: "highlight-saved", kind });
    } catch (error) {
      this.status = errorMessage(error, "Could not save the private highlight.");
    } finally {
      this.saving = "";
    }
  }

  protected async saveNote(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const body = this.noteBody.trim();
    const context = this.noteContext;
    if (this.saving || !body || !context) return;
    this.saving = "note";
    this.status = "Saving private note…";
    try {
      const { artifactId, editingId, referenceId, ...anchor } = context;
      let kind: Extract<LibraryPdfAnnotationAction, { action: "note-saved" }>["kind"];
      if (editingId) {
        const response = await fetch(
          `/api/library/references/${encodeURIComponent(referenceId)}/pdf-markups/${encodeURIComponent(editingId)}`,
          {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...anchor, body }),
          },
        );
        await expectOk(response);
        kind = "updated";
      } else {
        const response = await jsonFetch(`/api/library/references/${encodeURIComponent(referenceId)}/pdf-markups`, {
          kind: "note",
          artifactId,
          ...anchor,
          body,
        });
        await expectOk(response);
        kind = "created";
      }
      this.clearNote();
      this.emitAction({ action: "note-saved", kind });
    } catch (error) {
      this.status = errorMessage(error, "Could not save the private note.");
    } finally {
      this.saving = "";
    }
  }

  protected async applyDrawing(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const target = this.markupTarget;
    if (this.saving || !target || this.markupKind !== "drawing") return;
    this.saving = "markup";
    this.status = "Updating private line…";
    try {
      const response = await fetch(
        `/api/library/references/${encodeURIComponent(target.referenceId)}/pdf-markups/${encodeURIComponent(target.id)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ color: this.drawingColor, width: this.drawingWidth }),
        },
      );
      await expectOk(response);
      this.status = "";
      this.emitAction({ action: "markup-saved", kind: "updated" });
    } catch (error) {
      this.status = errorMessage(error, "Could not update the private line.");
    } finally {
      this.saving = "";
    }
  }

  protected async deleteMarkup(): Promise<void> {
    const target = this.markupTarget;
    if (this.saving || !target) return;
    this.saving = "markup";
    this.status = "Deleting private annotation…";
    try {
      const response = await fetch(
        `/api/library/references/${encodeURIComponent(target.referenceId)}/pdf-markups/${encodeURIComponent(target.id)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      await expectOk(response);
      this.clearMarkup();
      this.emitAction({ action: "markup-saved", kind: "deleted" });
    } catch (error) {
      this.status = errorMessage(error, "Could not delete the private annotation.");
    } finally {
      this.saving = "";
    }
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
