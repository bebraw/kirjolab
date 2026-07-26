import { html, LitElement, type TemplateResult } from "lit";
import { libraryPdfRectsOverlap, type LibraryHighlight, type LibraryHighlightImportCandidate } from "../domain/reference-library";
import { expectOk, jsonFetch } from "./http";
import { detectImportedPdfHighlights, type PdfHighlightDetection, type PdfHighlightImportCandidate } from "./pdf-highlight-import";

export const pdfHighlightImportOutcomeEvent = "pdf-highlight-import-outcome";

export interface PdfHighlightImportOutcome {
  readonly count: number;
}

export interface PdfHighlightImportContext {
  readonly artifactId: string;
  readonly highlights: readonly LibraryHighlight[];
  readonly referenceId: string;
}

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
  #context: PdfHighlightImportContext | null = null;

  constructor() {
    super();
    this.importing = false;
    this.reviews = [];
    this.scanning = false;
    this.status = defaultStatus;
  }

  setContext(context: PdfHighlightImportContext | null): void {
    const identityChanged = context?.artifactId !== this.#context?.artifactId || context?.referenceId !== this.#context?.referenceId;
    this.#context = context;
    if (identityChanged) this.reset();
  }

  protected showResult(result: PdfHighlightDetection): void {
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

  protected showError(message: string): void {
    this.scanning = false;
    this.status = message;
  }

  reset(message = defaultStatus): void {
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

  protected async detect(): Promise<void> {
    const context = this.#context;
    if (!context || this.scanning || this.importing) return;
    this.scanning = true;
    this.reviews = [];
    this.status = "Scanning PDF annotations and page highlights…";
    try {
      const result = await this.scan(`/api/library/pdfs/${encodeURIComponent(context.artifactId)}`);
      const current = this.currentContext(context);
      if (!current) return;
      this.showResult({
        ...result,
        candidates: result.candidates.filter(
          (candidate) =>
            !current.highlights.some(
              (highlight) => highlight.page === candidate.page && libraryPdfRectsOverlap(highlight.rects, candidate.rects),
            ),
        ),
      });
    } catch (error) {
      if (this.currentContext(context)) {
        this.showError(error instanceof Error ? `Could not inspect this PDF: ${error.message}` : "Could not inspect this PDF.");
      }
    }
  }

  protected async importSelected(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const context = this.#context;
    if (!context || this.scanning || this.importing) return;
    const candidates = this.reviews
      .filter(({ selected }) => selected)
      .map(({ candidate, comment }) => ({
        page: candidate.page,
        quote: candidate.quote,
        comment: comment.trim(),
        rects: candidate.rects,
      }));
    if (candidates.length === 0) {
      this.status = "Select at least one detected highlight to import.";
      return;
    }
    this.importing = true;
    try {
      await this.save(context, candidates);
      if (!this.currentContext(context)) return;
      const count = candidates.length;
      this.reset(`${count} ${highlightNoun(count)} imported privately.`);
      this.dispatchEvent(
        new CustomEvent<PdfHighlightImportOutcome>(pdfHighlightImportOutcomeEvent, {
          bubbles: true,
          composed: true,
          detail: { count },
        }),
      );
    } catch (error) {
      if (this.currentContext(context)) {
        this.status = error instanceof Error ? `Could not import highlights: ${error.message}` : "Could not import highlights.";
      }
    } finally {
      if (this.currentContext(context)) this.importing = false;
    }
  }

  protected cancel(): void {
    if (!this.importing) this.reset();
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

  private currentContext(expected: PdfHighlightImportContext): PdfHighlightImportContext | null {
    const current = this.#context;
    return current?.artifactId === expected.artifactId && current.referenceId === expected.referenceId ? current : null;
  }

  protected scan(url: string): Promise<PdfHighlightDetection> {
    return detectImportedPdfHighlights(url);
  }

  protected async save(context: PdfHighlightImportContext, candidates: readonly LibraryHighlightImportCandidate[]): Promise<void> {
    await expectOk(
      await jsonFetch(`/api/library/references/${encodeURIComponent(context.referenceId)}/highlight-imports`, {
        artifactId: context.artifactId,
        candidates,
      }),
    );
  }
}

const defaultStatus = "Detect native annotations and flattened yellow highlights for review.";
const highlightNoun = (count: number): string => (count === 1 ? "highlight" : "highlights");

if (typeof customElements !== "undefined" && !customElements.get("pdf-highlight-import-panel")) {
  customElements.define("pdf-highlight-import-panel", PdfHighlightImportPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "pdf-highlight-import-panel": PdfHighlightImportPanel;
  }
}
