import { html, type TemplateResult } from "lit";
import type { KnowledgeSearchResult } from "../domain/knowledge";
import { LightDomElement } from "./light-dom-controller";

export const knowledgeSearchEvent = "knowledge-search";
export const knowledgeSearchSelectEvent = "knowledge-search-select";

export class KnowledgeSearchPanel extends LightDomElement {
  static override properties = {
    error: { state: true },
    results: { state: true },
    visible: { state: true },
  };

  declare private error: string | null;
  declare private results: readonly KnowledgeSearchResult[];
  declare private visible: boolean;

  constructor() {
    super();
    this.error = null;
    this.results = [];
    this.visible = false;
  }

  showResults(results: readonly KnowledgeSearchResult[]): void {
    this.error = null;
    this.results = results;
    this.visible = true;
  }

  showError(message: string): void {
    this.error = message;
    this.results = [];
    this.visible = true;
  }

  clear(): void {
    this.error = null;
    this.results = [];
    this.visible = false;
  }

  protected override render(): TemplateResult {
    return html`
      <form class="project-map-search" id="knowledge-search-form" role="search" @submit=${this.search}>
        <label class="sr-only" for="knowledge-search-input">Find a project resource</label>
        <input
          class="field min-w-0"
          id="knowledge-search-input"
          type="search"
          maxlength="200"
          placeholder="Find a resource in this project"
        />
        <button class="button-secondary shrink-0" type="submit">Find</button>
      </form>
      <div class=${`space-y-2${this.visible ? "" : " hidden"}`} id="knowledge-search-results" aria-live="polite">
        ${this.error
          ? html`<p class="empty-state">${this.error}</p>`
          : this.results.length === 0
            ? this.visible
              ? html`<p class="empty-state">No matching project resources.</p>`
              : ""
            : this.results.map(
                (result) => html`
                  <button
                    type="button"
                    class="resource-card block w-full text-left"
                    data-resource-id=${result.resourceId}
                    @click=${this.select}
                  >
                    <span class="eyebrow">${result.kind}</span>
                    <strong class="mt-2 block font-sans">${result.title}</strong>
                    ${result.excerpt
                      ? html`<span class="mt-2 block font-sans text-xs leading-5 text-app-text-soft">${result.excerpt}</span>`
                      : ""}
                  </button>
                `,
              )}
      </div>
    `;
  }

  protected search(event: Event): void {
    event.preventDefault();
    const query = this.querySelector<HTMLInputElement>("#knowledge-search-input")?.value.trim() ?? "";
    this.dispatchEvent(new CustomEvent(knowledgeSearchEvent, { bubbles: true, composed: true, detail: query }));
  }

  protected select(event: Event): void {
    const resourceId = (event.currentTarget as HTMLButtonElement).dataset.resourceId;
    if (resourceId) {
      this.dispatchEvent(new CustomEvent(knowledgeSearchSelectEvent, { bubbles: true, composed: true, detail: resourceId }));
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("knowledge-search-panel")) {
  customElements.define("knowledge-search-panel", KnowledgeSearchPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "knowledge-search-panel": KnowledgeSearchPanel;
  }
}
