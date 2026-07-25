import { html, LitElement, type TemplateResult } from "lit";
import type { ReadingState } from "../domain/reference-library";

type PersonalTextField = "collections" | "note" | "tags";

export interface LibraryReferencePersonalFieldsData {
  readonly archived: boolean;
  readonly collections: readonly string[];
  readonly displayTitle: string;
  readonly reading: Pick<ReadingState, "priority" | "rating" | "status"> | null;
  readonly referenceId: string;
  readonly tags: readonly string[];
}

export type LibraryReferencePersonalAction =
  | { readonly action: "save-tags"; readonly referenceId: string; readonly value: string }
  | { readonly action: "save-collections"; readonly referenceId: string; readonly value: string }
  | { readonly action: "set-archived"; readonly archived: boolean; readonly referenceId: string; readonly title: string }
  | {
      readonly action: "save-reading";
      readonly priority: ReadingState["priority"];
      readonly rating: number | null;
      readonly referenceId: string;
      readonly status: ReadingState["status"];
    }
  | { readonly action: "save-note"; readonly body: string; readonly referenceId: string };

export const libraryReferencePersonalActionEvent = "library-reference-personal-action";

export class LibraryReferencePersonalFields extends LitElement {
  static override properties = {
    archived: { state: true },
    collections: { state: true },
    displayTitle: { state: true },
    note: { state: true },
    priority: { state: true },
    rating: { state: true },
    readingStatus: { state: true },
    referenceId: { state: true },
    tags: { state: true },
  };

  declare private archived: boolean;
  declare private collections: string;
  declare private displayTitle: string;
  declare private note: string;
  declare private priority: ReadingState["priority"];
  declare private rating: string;
  declare private readingStatus: ReadingState["status"];
  declare private referenceId: string;
  declare private tags: string;

  constructor() {
    super();
    this.archived = false;
    this.collections = "";
    this.displayTitle = "";
    this.note = "";
    this.priority = "normal";
    this.rating = "";
    this.readingStatus = "unread";
    this.referenceId = "";
    this.tags = "";
  }

  setData(data: LibraryReferencePersonalFieldsData): void {
    this.archived = data.archived;
    this.collections = data.collections.join(", ");
    this.displayTitle = data.displayTitle;
    this.note = "";
    this.priority = data.reading?.priority ?? "normal";
    this.rating = data.reading?.rating === null || data.reading === null ? "" : String(data.reading.rating);
    this.readingStatus = data.reading?.status ?? "unread";
    this.referenceId = data.referenceId;
    this.tags = data.tags.join(", ");
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const fieldPrefix = `library-reference-${this.referenceId}`;
    return html`
      <input
        class="field mt-3"
        id=${`${fieldPrefix}-tags`}
        name="tags"
        .value=${this.tags}
        placeholder="Private tags, comma separated"
        aria-label=${`Private tags for ${this.displayTitle}`}
        @input=${(event: Event) => this.updateText("tags", event)}
      />
      <input
        class="field mt-2"
        id=${`${fieldPrefix}-collections`}
        name="collections"
        .value=${this.collections}
        placeholder="Collections, comma separated"
        aria-label=${`Collections for ${this.displayTitle}`}
        @input=${(event: Event) => this.updateText("collections", event)}
      />
      <div class="mt-2 flex flex-wrap gap-2">
        <button class="button-secondary" type="button" @click=${() => this.emitAction({ action: "save-tags", value: this.tags })}>
          Save tags
        </button>
        <button
          class="button-secondary"
          type="button"
          @click=${() => this.emitAction({ action: "save-collections", value: this.collections })}
        >
          Save collections
        </button>
        <button
          class="button-secondary"
          type="button"
          @click=${() =>
            this.emitAction({
              action: "set-archived",
              archived: !this.archived,
              title: this.displayTitle,
            })}
        >
          ${this.archived ? "Restore" : "Archive"}
        </button>
      </div>
      <select
        class="field mt-3"
        id=${`${fieldPrefix}-reading-status`}
        name="readingStatus"
        aria-label=${`Reading status for ${this.displayTitle}`}
        .value=${this.readingStatus}
        @change=${(event: Event) => {
          this.readingStatus = (event.currentTarget as HTMLSelectElement).value as ReadingState["status"];
        }}
      >
        <option value="unread">unread</option>
        <option value="reading">reading</option>
        <option value="read">read</option>
      </select>
      <select
        class="field mt-2"
        id=${`${fieldPrefix}-priority`}
        name="priority"
        aria-label=${`Reading priority for ${this.displayTitle}`}
        .value=${this.priority}
        @change=${(event: Event) => {
          this.priority = (event.currentTarget as HTMLSelectElement).value as ReadingState["priority"];
        }}
      >
        <option value="low">Priority: low</option>
        <option value="normal">Priority: normal</option>
        <option value="high">Priority: high</option>
      </select>
      <select
        class="field mt-2"
        id=${`${fieldPrefix}-rating`}
        name="rating"
        aria-label=${`Rating for ${this.displayTitle}`}
        .value=${this.rating}
        @change=${(event: Event) => {
          this.rating = (event.currentTarget as HTMLSelectElement).value;
        }}
      >
        <option value="">No rating</option>
        ${[1, 2, 3, 4, 5].map((value) => html`<option value=${String(value)}>${value} star${value === 1 ? "" : "s"}</option>`)}
      </select>
      <button class="button-secondary mt-2" type="button" @click=${() => this.emitReading()}>Save reading state</button>
      <textarea
        class="field mt-3 min-h-16"
        id=${`${fieldPrefix}-private-note`}
        name="privateNote"
        .value=${this.note}
        placeholder="Add a private note"
        aria-label=${`Private note for ${this.displayTitle}`}
        maxlength="20000"
        @input=${(event: Event) => this.updateText("note", event)}
      ></textarea>
      <button class="button-secondary mt-2" type="button" @click=${() => this.emitAction({ action: "save-note", body: this.note })}>
        Save private note
      </button>
    `;
  }

  protected updateText(field: PersonalTextField, event: Event): void {
    this[field] = (event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected emitReading(): void {
    this.emitAction({
      action: "save-reading",
      priority: this.priority,
      rating: this.rating ? Number(this.rating) : null,
      status: this.readingStatus,
    });
  }

  protected emitAction(
    action:
      | { readonly action: "save-tags" | "save-collections"; readonly value: string }
      | { readonly action: "set-archived"; readonly archived: boolean; readonly title: string }
      | {
          readonly action: "save-reading";
          readonly priority: ReadingState["priority"];
          readonly rating: number | null;
          readonly status: ReadingState["status"];
        }
      | { readonly action: "save-note"; readonly body: string },
  ): void {
    this.dispatchEvent(
      new CustomEvent<LibraryReferencePersonalAction>(libraryReferencePersonalActionEvent, {
        bubbles: true,
        detail: { ...action, referenceId: this.referenceId } as LibraryReferencePersonalAction,
      }),
    );
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-reference-personal-fields")) {
  customElements.define("library-reference-personal-fields", LibraryReferencePersonalFields);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-reference-personal-fields": LibraryReferencePersonalFields;
  }
}
