import { html, nothing, type TemplateResult } from "lit";
import { LightDomElement } from "../platform/light-dom-controller";

export interface PdfSearchResult {
  readonly page: number;
  readonly excerpt: string;
  readonly occurrences: number;
}

export interface PdfSearchBinding {
  search(query: string): Promise<readonly PdfSearchResult[]>;
  openPage(page: number): Promise<void>;
}

export class PdfSearchPanel extends LightDomElement {
  static override properties = {
    error: { state: true },
    loading: { state: true },
    open: { state: true },
    query: { state: true },
    results: { state: true },
  };

  declare private error: string;
  declare private loading: boolean;
  declare private open: boolean;
  declare private query: string;
  declare private results: readonly PdfSearchResult[];
  private binding: PdfSearchBinding | null = null;
  private request = 0;

  constructor() {
    super();
    this.error = "";
    this.loading = false;
    this.open = false;
    this.query = "";
    this.results = [];
  }

  bind(binding: PdfSearchBinding): void {
    this.binding = binding;
  }

  show(): void {
    this.open = true;
    void this.updateComplete.then(() => this.querySelector<HTMLInputElement>("input")?.focus());
  }

  hide(): void {
    this.open = false;
  }

  protected override render(): TemplateResult {
    const matchCount = this.results.reduce((total, result) => total + result.occurrences, 0);
    return html`
      <aside class="pdf-search-panel" ?hidden=${!this.open} aria-label="Search this PDF">
        <header class="pdf-search-header">
          <div>
            <p class="eyebrow">Document search</p>
            <strong>Find in this PDF</strong>
          </div>
          <button class="library-pdf-inspector-close" type="button" aria-label="Close PDF search" @click=${this.hide}>×</button>
        </header>
        <form class="pdf-search-form" @submit=${this.submit}>
          <input
            class="field"
            type="search"
            autocomplete="off"
            aria-label="Search text in PDF"
            placeholder="Term or exact phrase"
            .value=${this.query}
            @input=${this.changeQuery}
          />
          <button class="button-primary" type="submit" ?disabled=${this.loading || this.query.trim().length < 2}>
            ${this.loading ? "Searching…" : "Find"}
          </button>
        </form>
        <p class="pdf-search-status" role="status" aria-live="polite">
          ${this.error ||
          (this.loading
            ? "Reading document text…"
            : this.query.trim().length >= 2
              ? `${matchCount} match${matchCount === 1 ? "" : "es"} on ${this.results.length} page${this.results.length === 1 ? "" : "s"}`
              : "Search uses the PDF text layer. Scanned pages require OCR.")}
        </p>
        ${this.results.length
          ? html`<ol class="pdf-search-results">
              ${this.results.map(
                (result) =>
                  html`<li>
                    <button type="button" @click=${() => void this.openPage(result.page)}>
                      <span class="eyebrow">Page ${result.page} · ${result.occurrences} match${result.occurrences === 1 ? "" : "es"}</span>
                      <span>${result.excerpt}</span>
                    </button>
                  </li>`,
              )}
            </ol>`
          : nothing}
      </aside>
    `;
  }

  protected changeQuery(event: Event): void {
    this.query = (event.currentTarget as HTMLInputElement).value;
  }

  protected async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const query = this.query.trim();
    const binding = this.binding;
    if (!binding || query.length < 2) return;
    const request = ++this.request;
    this.loading = true;
    this.error = "";
    try {
      const results = await binding.search(query);
      if (request === this.request) this.results = results;
    } catch (error) {
      if (request === this.request) this.error = error instanceof Error ? error.message : "Could not search this PDF.";
    } finally {
      if (request === this.request) this.loading = false;
    }
  }

  private async openPage(page: number): Promise<void> {
    await this.binding?.openPage(page);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("pdf-search-panel")) {
  customElements.define("pdf-search-panel", PdfSearchPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "pdf-search-panel": PdfSearchPanel;
  }
}
