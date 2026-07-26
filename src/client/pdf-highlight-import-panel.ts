import { html, LitElement, type TemplateResult } from "lit";
import type { PdfHighlightDetection, PdfHighlightImportCandidate } from "./pdf-highlight-import";

export const pdfHighlightImportActionEvent = "pdf-highlight-import-action";

export type ReviewedPdfHighlightImport = PdfHighlightImportCandidate & { readonly comment: string };
export type PdfHighlightImportAction =
  | { readonly action: "cancel" }
  | { readonly action: "detect" }
  | { readonly action: "import"; readonly artifactId: string; readonly candidates: readonly ReviewedPdfHighlightImport[] };

interface CandidateReview {
  readonly candidate: PdfHighlightImportCandidate;
  readonly comment: string;
  readonly selected: boolean;
}

export class PdfHighlightImportPanel extends LitElement {
  static override properties = {
    importing: { state: true },
    reviews: { state: true },
    scanning: { state: true },
    status: { state: true },
  };

  declare private importing: boolean;
  declare private reviews: readonly CandidateReview[];
  declare private scanning: boolean;
  declare private status: string;
  #artifactId: string | null = null;

  constructor() {
    super();
    this.importing = false;
    this.reviews = [];
    this.scanning = false;
    this.status = defaultStatus;
  }

  showResult(artifactId: string, result: PdfHighlightDetection): void {
    this.#artifactId = artifactId;
    this.scanning = false;
    this.reviews = result.candidates.map((candidate) => ({ candidate, comment: candidate.comment, selected: true }));
    if (result.candidates.length === 0) {
      this.status = `No new highlights found across ${result.pagesScanned} scanned page${result.pagesScanned === 1 ? "" : "s"}.`;
      return;
    }
    const nativeCount = result.candidates.filter((candidate) => candidate.source === "annotation").length;
    const flattenedCount = result.candidates.length - nativeCount;
    this.status = [
      `${result.candidates.length} candidate${result.candidates.length === 1 ? "" : "s"} found`,
      nativeCount ? `${nativeCount} native` : "",
      flattenedCount ? `${flattenedCount} flattened` : "",
      result.truncated ? "scan limit reached" : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  showError(message: string): void {
    this.#artifactId = null;
    this.scanning = false;
    this.status = message;
  }

  setImporting(importing: boolean): void {
    this.importing = importing;
  }

  reset(message = defaultStatus): void {
    this.#artifactId = null;
    this.importing = false;
    this.reviews = [];
    this.scanning = false;
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
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong id="library-highlight-import-title">Highlights in this PDF</strong>
          <p class="mt-1 text-xs leading-5 text-app-text-soft" id="library-highlight-import-status" role="status" aria-live="polite">
            ${this.status}
          </p>
        </div>
        <button
          class="button-secondary"
          id="detect-library-pdf-highlights"
          type="button"
          ?disabled=${this.scanning || this.importing}
          @click=${this.detect}
        >
          ${this.scanning ? "Detecting…" : "Detect highlights"}
        </button>
      </div>
      <form class="mt-3" id="library-highlight-import-form" ?hidden=${this.reviews.length === 0} @submit=${this.importSelected}>
        <div class="space-y-2" id="library-highlight-import-list">
          ${this.reviews.map(
            ({ candidate, comment, selected }) => html`
              <article class="resource-card" data-highlight-import-id=${candidate.id}>
                <label class="flex items-start gap-2">
                  <input
                    type="checkbox"
                    data-highlight-import-selection="true"
                    .checked=${selected}
                    ?disabled=${this.importing}
                    @change=${this.changeSelection}
                  />
                  <span class="min-w-0">
                    <span class="eyebrow block">
                      Page ${candidate.page} · ${candidate.source === "annotation" ? "PDF annotation" : "Detected yellow highlight"}
                    </span>
                    <strong class="mt-1 block font-sans">${candidate.quote}</strong>
                  </span>
                </label>
                <input
                  class="field mt-2"
                  maxlength="8000"
                  placeholder="Add a private note (optional)"
                  aria-label="Private note for detected highlight on page ${candidate.page}"
                  data-highlight-import-comment="true"
                  .value=${comment}
                  ?disabled=${this.importing}
                  @input=${this.changeComment}
                />
              </article>
            `,
          )}
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button class="button-primary" type="submit" ?disabled=${this.importing}>
            ${this.importing ? "Importing…" : "Import selected"}
          </button>
          <button
            class="button-secondary"
            id="cancel-library-highlight-import"
            type="button"
            ?disabled=${this.importing}
            @click=${this.cancel}
          >
            Cancel
          </button>
        </div>
      </form>
    `;
  }

  protected detect(): void {
    if (this.scanning || this.importing) return;
    this.#artifactId = null;
    this.scanning = true;
    this.reviews = [];
    this.status = "Scanning PDF annotations and page highlights…";
    this.emit({ action: "detect" });
  }

  protected importSelected(event: SubmitEvent): void {
    event.preventDefault();
    if (this.scanning || this.importing || !this.#artifactId) return;
    this.emit({
      action: "import",
      artifactId: this.#artifactId,
      candidates: this.reviews
        .filter(({ selected }) => selected)
        .map(({ candidate, comment }) => ({ ...candidate, comment: comment.trim() })),
    });
  }

  protected cancel(): void {
    if (!this.importing) {
      this.reset();
      this.emit({ action: "cancel" });
    }
  }

  protected changeSelection(event: Event): void {
    this.updateReview(event, (review, input) => ({ ...review, selected: input.checked }));
  }

  protected changeComment(event: Event): void {
    this.updateReview(event, (review, input) => ({ ...review, comment: input.value }));
  }

  private updateReview(event: Event, update: (review: CandidateReview, input: HTMLInputElement) => CandidateReview): void {
    const input = event.currentTarget as HTMLInputElement;
    const id = input.closest<HTMLElement>("[data-highlight-import-id]")?.dataset.highlightImportId;
    if (id) this.reviews = this.reviews.map((review) => (review.candidate.id === id ? update(review, input) : review));
  }

  private emit(detail: PdfHighlightImportAction): void {
    this.dispatchEvent(new CustomEvent(pdfHighlightImportActionEvent, { bubbles: true, composed: true, detail }));
  }
}

const defaultStatus = "Detect native annotations and flattened yellow highlights for review.";

if (typeof customElements !== "undefined" && !customElements.get("pdf-highlight-import-panel")) {
  customElements.define("pdf-highlight-import-panel", PdfHighlightImportPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "pdf-highlight-import-panel": PdfHighlightImportPanel;
  }
}
