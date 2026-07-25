import { html, LitElement, type TemplateResult } from "lit";
import type { ReferenceLibraryFilters } from "../domain/reference-filters";

export const referenceLibraryFilterChangeEvent = "reference-library-filter-change";

const emptyFilters: ReferenceLibraryFilters = {
  completeness: "all",
  linkage: "all",
  organization: "",
  query: "",
  readingStatus: "all",
  sort: "updated",
  type: "",
};

export class ReferenceLibraryFilterPanel extends LitElement {
  static override properties = {
    count: { state: true },
    filters: { state: true },
    total: { state: true },
    types: { state: true },
  };

  declare private count: number;
  declare private filters: ReferenceLibraryFilters;
  declare private total: number;
  declare private types: readonly string[];

  constructor() {
    super();
    this.count = 0;
    this.filters = emptyFilters;
    this.total = 0;
    this.types = [];
  }

  get value(): ReferenceLibraryFilters {
    return this.filters;
  }

  reset(query = ""): void {
    this.filters = query ? { ...emptyFilters, query } : emptyFilters;
  }

  setCount(count: number, total: number): void {
    this.count = count;
    this.total = total;
  }

  setTypes(types: readonly string[]): void {
    this.types = types;
    if (this.filters.type && !types.includes(this.filters.type)) this.filters = { ...this.filters, type: "" };
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
      <div class="library-search">
        <label class="sr-only" for="reference-filter-query">Search library</label>
        <input
          class="field"
          id="reference-filter-query"
          type="search"
          maxlength="200"
          placeholder="Search references…"
          title="Search title, author, reference ID, DOI, or URL"
          .value=${this.filters.query}
          @input=${this.changeQuery}
        />
        <span id="reference-filter-count" aria-live="polite" title=${`${this.count} of ${this.total} references shown`}
          >${this.count} / ${this.total}</span
        >
      </div>
      <details class="action-menu library-filter-menu ui-menu" data-action-menu>
        <summary class="button-secondary" title="Filter and sort references">Filter</summary>
        <section class="library-menu library-filter-fields ui-menu-panel" aria-label="Filter reference library">
          <label class="field-label"
            >Type<select class="field" id="reference-filter-type" .value=${this.filters.type} @input=${this.changeType}>
              <option value="">All types</option>
              ${this.types.map((type) => html`<option value=${type}>${type}</option>`)}
            </select></label
          >
          <label class="field-label"
            >Reading<select class="field" id="reference-filter-reading" .value=${this.filters.readingStatus} @input=${this.changeReading}>
              <option value="all">Any status</option>
              <option value="unread">Unread</option>
              <option value="reading">Reading</option>
              <option value="read">Read</option>
            </select></label
          >
          <label class="field-label"
            >Tag or collection<input
              class="field"
              id="reference-filter-organization"
              maxlength="80"
              placeholder="Any label"
              .value=${this.filters.organization}
              @input=${this.changeOrganization}
          /></label>
          <label class="field-label"
            >Project<select class="field" id="reference-filter-linkage" .value=${this.filters.linkage} @input=${this.changeLinkage}>
              <option value="all">Linked or unlinked</option>
              <option value="linked">Linked</option>
              <option value="unlinked">Not linked</option>
            </select></label
          >
          <label class="field-label"
            >Metadata<select
              class="field"
              id="reference-filter-completeness"
              .value=${this.filters.completeness}
              @input=${this.changeCompleteness}
            >
              <option value="all">Any completeness</option>
              <option value="complete">Complete</option>
              <option value="incomplete">Needs metadata</option>
            </select></label
          >
          <label class="field-label"
            >Sort<select class="field" id="reference-filter-sort" .value=${this.filters.sort} @input=${this.changeSort}>
              <option value="updated">Recently updated</option>
              <option value="title">Title</option>
              <option value="year">Year</option>
              <option value="priority">Reading priority</option>
            </select></label
          >
        </section>
      </details>
    `;
  }

  protected changeQuery(event: Event): void {
    this.updateFilter("query", controlValue(event));
  }

  protected changeType(event: Event): void {
    this.updateFilter("type", controlValue(event));
  }

  protected changeReading(event: Event): void {
    this.updateFilter("readingStatus", readingFilter(controlValue(event)));
  }

  protected changeOrganization(event: Event): void {
    this.updateFilter("organization", controlValue(event));
  }

  protected changeLinkage(event: Event): void {
    this.updateFilter("linkage", linkageFilter(controlValue(event)));
  }

  protected changeCompleteness(event: Event): void {
    this.updateFilter("completeness", completenessFilter(controlValue(event)));
  }

  protected changeSort(event: Event): void {
    this.updateFilter("sort", referenceSort(controlValue(event)));
  }

  private updateFilter<Key extends keyof ReferenceLibraryFilters>(key: Key, value: ReferenceLibraryFilters[Key]): void {
    this.filters = { ...this.filters, [key]: value };
    this.dispatchEvent(new CustomEvent(referenceLibraryFilterChangeEvent, { bubbles: true }));
  }
}

function controlValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
}

function readingFilter(value: string): ReferenceLibraryFilters["readingStatus"] {
  return value === "unread" || value === "reading" || value === "read" ? value : "all";
}

function linkageFilter(value: string): ReferenceLibraryFilters["linkage"] {
  return value === "linked" || value === "unlinked" ? value : "all";
}

function completenessFilter(value: string): ReferenceLibraryFilters["completeness"] {
  return value === "complete" || value === "incomplete" ? value : "all";
}

function referenceSort(value: string): ReferenceLibraryFilters["sort"] {
  return value === "title" || value === "year" || value === "priority" ? value : "updated";
}

if (typeof customElements !== "undefined" && !customElements.get("reference-library-filters")) {
  customElements.define("reference-library-filters", ReferenceLibraryFilterPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "reference-library-filters": ReferenceLibraryFilterPanel;
  }
}
