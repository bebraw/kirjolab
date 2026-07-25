import { html, LitElement, type TemplateResult } from "lit";
import { referenceDiscoveryTypes, type ReferenceDiscoveryQuery, type ReferenceDiscoveryType } from "../domain/reference-discovery";

export const libraryDiscoverySearchEvent = "library-discovery-search";

const initialStatus = "Search Crossref and available scholarly indexes. Results are not saved automatically.";

const typeLabels: Readonly<Record<ReferenceDiscoveryType, string>> = {
  "": "All types",
  article: "Article",
  book: "Book",
  incollection: "Book chapter",
  inproceedings: "Conference paper",
  phdthesis: "Dissertation",
  techreport: "Report",
};

export class LibraryDiscoverySearch extends LitElement {
  static override properties = {
    busy: { state: true },
    status: { state: true },
  };

  declare private busy: boolean;
  declare private status: string;

  constructor() {
    super();
    this.busy = false;
    this.status = initialStatus;
  }

  showResults(count: number): void {
    this.busy = false;
    this.status = count
      ? `${count} result${count === 1 ? "" : "s"}. Review metadata before saving.`
      : "No matching scholarly records. Try broader keywords or remove a filter.";
  }

  showError(message: string): void {
    this.busy = false;
    this.status = message;
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
      <form class="library-discovery-form" id="library-discovery-form" @submit=${this.search}>
        <label class="field-label library-discovery-query"
          >Keywords<input
            class="field"
            id="library-discovery-query"
            type="search"
            maxlength="4000"
            required
            placeholder="Topic, title, or research question…"
          />
        </label>
        <label class="field-label"
          >Author<input class="field" id="library-discovery-author" maxlength="500" placeholder="Optional author"
        /></label>
        <label class="field-label"
          >Year<input class="field" id="library-discovery-year" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="Any year"
        /></label>
        <label class="field-label"
          >Type<select class="field" id="library-discovery-type">
            ${referenceDiscoveryTypes.map((type) => html`<option value=${type}>${typeLabels[type]}</option>`)}
          </select></label
        >
        <button class="button-primary library-discovery-submit" type="submit" ?disabled=${this.busy}>
          ${this.busy ? "Searching…" : "Search references"}
        </button>
      </form>
      <p class="library-discovery-status" id="library-discovery-status" role="status" aria-live="polite">${this.status}</p>
    `;
  }

  protected search(event: SubmitEvent): void {
    event.preventDefault();
    if (this.busy) return;
    this.busy = true;
    this.status = "Searching scholarly indexes…";
    this.dispatchEvent(
      new CustomEvent<ReferenceDiscoveryQuery>(libraryDiscoverySearchEvent, {
        bubbles: true,
        detail: this.query,
      }),
    );
  }

  protected get query(): ReferenceDiscoveryQuery {
    return {
      query: this.input("library-discovery-query").value,
      author: this.input("library-discovery-author").value,
      year: this.input("library-discovery-year").value,
      type: this.select("library-discovery-type").value as ReferenceDiscoveryType,
    };
  }

  protected input(id: string): HTMLInputElement {
    const input = this.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) throw new Error(`Library discovery input ${id} is unavailable`);
    return input;
  }

  protected select(id: string): HTMLSelectElement {
    const select = this.querySelector<HTMLSelectElement>(`#${id}`);
    if (!select) throw new Error(`Library discovery select ${id} is unavailable`);
    return select;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-discovery-search")) {
  customElements.define("library-discovery-search", LibraryDiscoverySearch);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-discovery-search": LibraryDiscoverySearch;
  }
}
