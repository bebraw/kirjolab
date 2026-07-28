import { html, type TemplateResult } from "lit";
import { LightDomElement } from "./light-dom-controller";
import type { ReadingState } from "../domain/reference-library";
import { errorMessage, expectOk, jsonFetch } from "./http";

type PersonalTextField = "collections" | "note" | "tags";

export interface LibraryReferencePersonalFieldsData {
  readonly archived: boolean;
  readonly collections: readonly string[];
  readonly displayTitle: string;
  readonly reading: Pick<ReadingState, "priority" | "rating" | "status"> | null;
  readonly referenceId: string;
  readonly tags: readonly string[];
}

export const libraryReferencePersonalRefreshEvent = "library-reference-personal-refresh";

export class LibraryReferencePersonalFields extends LightDomElement {
  static override properties = {
    archived: { state: true },
    busy: { state: true },
    collections: { state: true },
    displayTitle: { state: true },
    note: { state: true },
    priority: { state: true },
    rating: { state: true },
    readingStatus: { state: true },
    referenceId: { state: true },
    status: { state: true },
    tags: { state: true },
  };

  declare private archived: boolean;
  declare private busy: boolean;
  declare private collections: string;
  declare private displayTitle: string;
  declare private note: string;
  declare private priority: ReadingState["priority"];
  declare private rating: string;
  declare private readingStatus: ReadingState["status"];
  declare private referenceId: string;
  declare private status: string;
  declare private tags: string;

  constructor() {
    super();
    this.archived = false;
    this.busy = false;
    this.collections = "";
    this.displayTitle = "";
    this.note = "";
    this.priority = "normal";
    this.rating = "";
    this.readingStatus = "unread";
    this.referenceId = "";
    this.status = "";
    this.tags = "";
  }

  setData(data: LibraryReferencePersonalFieldsData): void {
    this.archived = data.archived;
    this.busy = false;
    this.collections = data.collections.join(", ");
    this.displayTitle = data.displayTitle;
    this.note = "";
    this.priority = data.reading?.priority ?? "normal";
    this.rating = data.reading?.rating === null || data.reading === null ? "" : String(data.reading.rating);
    this.readingStatus = data.reading?.status ?? "unread";
    this.referenceId = data.referenceId;
    this.status = "";
    this.tags = data.tags.join(", ");
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
        <button class="button-secondary" type="button" ?disabled=${this.busy} @click=${() => void this.saveTags()}>Save tags</button>
        <button class="button-secondary" type="button" ?disabled=${this.busy} @click=${() => void this.saveCollections()}>
          Save collections
        </button>
        <button class="button-secondary" type="button" ?disabled=${this.busy} @click=${() => void this.setArchived(!this.archived)}>
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
      <button class="button-secondary mt-2" type="button" ?disabled=${this.busy} @click=${() => void this.saveReading()}>
        Save reading state
      </button>
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
      <button class="button-secondary mt-2" type="button" ?disabled=${this.busy} @click=${() => void this.saveNote()}>
        Save private note
      </button>
      ${this.status ? html`<p class="status-text mt-2" role="status">${this.status}</p>` : ""}
    `;
  }

  protected updateText(field: PersonalTextField, event: Event): void {
    this[field] = (event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected saveTags(): Promise<void> {
    return this.mutate(
      () =>
        jsonFetch(`/api/library/references/${encodeURIComponent(this.referenceId)}/tags`, { tags: commaSeparatedValues(this.tags) }, "PUT"),
      "Private tags saved.",
      "Could not save private tags.",
    );
  }

  protected saveCollections(): Promise<void> {
    return this.mutate(
      () =>
        jsonFetch(
          `/api/library/references/${encodeURIComponent(this.referenceId)}/collections`,
          { collections: commaSeparatedValues(this.collections) },
          "PUT",
        ),
      "Collections saved.",
      "Could not save collections.",
    );
  }

  protected saveReading(): Promise<void> {
    return this.mutate(
      () =>
        jsonFetch(
          `/api/library/references/${encodeURIComponent(this.referenceId)}/reading`,
          {
            status: this.readingStatus,
            rating: this.rating ? Number(this.rating) : null,
            priority: this.priority,
          },
          "PUT",
        ),
      "Reading state saved.",
      "Could not save reading state.",
    );
  }

  protected saveNote(): Promise<void> {
    if (!this.note.trim()) return Promise.resolve();
    return this.mutate(
      () => jsonFetch(`/api/library/references/${encodeURIComponent(this.referenceId)}/notes`, { body: this.note }),
      "Private note saved. It is not visible to project collaborators.",
      "Could not save private note.",
    );
  }

  protected setArchived(archived: boolean): Promise<void> {
    if (archived && !window.confirm(`Archive “${this.displayTitle}”? It will be hidden from the active Library until you restore it.`)) {
      return Promise.resolve();
    }
    return this.mutate(
      () => jsonFetch(`/api/library/references/${encodeURIComponent(this.referenceId)}`, { archived }, "PATCH"),
      archived ? "Reference archived." : "Reference restored.",
      archived ? "Could not archive reference." : "Could not restore reference.",
    );
  }

  private async mutate(request: () => Promise<Response>, success: string, failure: string): Promise<void> {
    if (this.busy || !this.referenceId) return;
    this.busy = true;
    this.status = "Saving…";
    try {
      await expectOk(await request());
      this.status = "";
      this.dispatchEvent(new CustomEvent<string>(libraryReferencePersonalRefreshEvent, { bubbles: true, detail: success }));
    } catch (error) {
      this.status = errorMessage(error, failure);
    } finally {
      this.busy = false;
    }
  }
}

function commaSeparatedValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

if (typeof customElements !== "undefined" && !customElements.get("library-reference-personal-fields")) {
  customElements.define("library-reference-personal-fields", LibraryReferencePersonalFields);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-reference-personal-fields": LibraryReferencePersonalFields;
  }
}
