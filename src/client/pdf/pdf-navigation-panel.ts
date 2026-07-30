import { html, nothing, type TemplateResult } from "lit";
import { LightDomElement } from "../platform/light-dom-controller";

export interface PdfOutlineItem {
  readonly title: string;
  readonly page: number | null;
  readonly children: readonly PdfOutlineItem[];
}

export interface PdfNavigationBinding {
  navigation(): Promise<{ readonly outline: readonly PdfOutlineItem[]; readonly pages: number }>;
  openPage(page: number): Promise<void>;
  thumbnail(page: number): Promise<string>;
}

export class PdfNavigationPanel extends LightDomElement {
  static override properties = {
    bookmarks: { state: true },
    currentPage: { state: true },
    loading: { state: true },
    open: { state: true },
    outline: { state: true },
    pages: { state: true },
    thumbnails: { state: true },
  };

  declare private bookmarks: readonly number[];
  declare private currentPage: number;
  declare private loading: boolean;
  declare private open: boolean;
  declare private outline: readonly PdfOutlineItem[];
  declare private pages: number;
  declare private thumbnails: ReadonlyMap<number, string>;
  private binding: PdfNavigationBinding | null = null;
  private documentKey = "";

  constructor() {
    super();
    this.bookmarks = [];
    this.currentPage = 1;
    this.loading = false;
    this.open = false;
    this.outline = [];
    this.pages = 0;
    this.thumbnails = new Map();
  }

  bind(binding: PdfNavigationBinding): void {
    this.binding = binding;
  }

  setDocument(key: string, currentPage = 1): void {
    if (key !== this.documentKey) {
      this.documentKey = key;
      this.outline = [];
      this.pages = 0;
      this.thumbnails = new Map();
      this.bookmarks = readPdfBookmarks(key);
    }
    this.currentPage = currentPage;
  }

  setCurrentPage(page: number): void {
    this.currentPage = page;
  }

  show(): void {
    this.open = true;
    if (!this.pages) void this.load();
  }

  hide(): void {
    this.open = false;
  }

  protected override render(): TemplateResult {
    return html`
      <aside class="pdf-navigation-panel" ?hidden=${!this.open} aria-label="PDF navigation">
        <header class="pdf-search-header">
          <div>
            <p class="eyebrow">Document map</p>
            <strong>Navigate PDF</strong>
          </div>
          <button class="library-pdf-inspector-close" type="button" aria-label="Close PDF navigation" @click=${this.hide}>×</button>
        </header>
        <button class="button-secondary pdf-bookmark-current" type="button" @click=${this.toggleBookmark}>
          ${this.bookmarks.includes(this.currentPage) ? "Remove bookmark" : "Bookmark"} page ${this.currentPage}
        </button>
        ${this.bookmarks.length
          ? html`<section class="pdf-navigation-section">
              <h3>Bookmarks</h3>
              <div class="pdf-bookmark-list">
                ${this.bookmarks.map((page) => html`<button type="button" @click=${() => void this.openPage(page)}>Page ${page}</button>`)}
              </div>
            </section>`
          : nothing}
        ${this.outline.length
          ? html`<section class="pdf-navigation-section">
              <h3>Contents</h3>
              ${this.renderOutline(this.outline)}
            </section>`
          : nothing}
        <section class="pdf-navigation-section">
          <h3>Pages</h3>
          <div class="pdf-thumbnail-grid">
            ${Array.from({ length: Math.min(this.pages, 40) }, (_, index) => index + 1).map(
              (page) =>
                html`<button type="button" aria-label=${`Open page ${page}`} @click=${() => void this.openPage(page)}>
                  ${this.thumbnails.get(page)
                    ? html`<img src=${this.thumbnails.get(page)!} alt="" loading="lazy" />`
                    : html`<span class="pdf-thumbnail-placeholder"></span>`}
                  <span>${page}</span>
                </button>`,
            )}
          </div>
          ${this.pages > 40 ? html`<p class="pdf-search-status">Showing the first 40 of ${this.pages} page thumbnails.</p>` : nothing}
        </section>
        ${this.loading ? html`<p class="pdf-search-status" role="status">Loading document map…</p>` : nothing}
      </aside>
    `;
  }

  private renderOutline(items: readonly PdfOutlineItem[]): TemplateResult {
    return html`<ol class="pdf-outline-list">
      ${items.map(
        (item) =>
          html`<li>
            <button type="button" ?disabled=${item.page === null} @click=${() => item.page && void this.openPage(item.page)}>
              ${item.title}
            </button>
            ${item.children.length ? this.renderOutline(item.children) : nothing}
          </li>`,
      )}
    </ol>`;
  }

  private async load(): Promise<void> {
    const binding = this.binding;
    if (!binding || this.loading) return;
    this.loading = true;
    try {
      const navigation = await binding.navigation();
      this.outline = navigation.outline;
      this.pages = navigation.pages;
      for (let page = 1; page <= Math.min(navigation.pages, 40); page += 1) {
        const source = await binding.thumbnail(page);
        this.thumbnails = new Map(this.thumbnails).set(page, source);
      }
    } finally {
      this.loading = false;
    }
  }

  private async openPage(page: number): Promise<void> {
    await this.binding?.openPage(page);
  }

  private toggleBookmark(): void {
    this.bookmarks = togglePdfBookmark(this.bookmarks, this.currentPage);
    writePdfBookmarks(this.documentKey, this.bookmarks);
  }
}

export function togglePdfBookmark(bookmarks: readonly number[], page: number): number[] {
  const next = bookmarks.includes(page) ? bookmarks.filter((value) => value !== page) : [...bookmarks, page];
  return next.sort((left, right) => left - right);
}

export function readPdfBookmarks(key: string): number[] {
  if (!key || typeof localStorage === "undefined") return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`pdf-bookmarks:${key}`) ?? "[]");
    return Array.isArray(value)
      ? value.filter((page): page is number => Number.isInteger(page) && typeof page === "number" && page > 0).slice(0, 200)
      : [];
  } catch {
    return [];
  }
}

function writePdfBookmarks(key: string, bookmarks: readonly number[]): void {
  if (key && typeof localStorage !== "undefined") localStorage.setItem(`pdf-bookmarks:${key}`, JSON.stringify(bookmarks));
}

if (typeof customElements !== "undefined" && !customElements.get("pdf-navigation-panel")) {
  customElements.define("pdf-navigation-panel", PdfNavigationPanel);
}
