import { html, type TemplateResult } from "lit";
import { LightDomElement } from "./light-dom-controller";
import {
  isArtifactAnalysis,
  libraryPdfRectsOverlap,
  type ArtifactAnalysis,
  type LibraryHighlight,
  type LibraryHighlightImportCandidate,
  type PdfHighlightAnalysisCandidate,
  type PdfHighlightAnalysisResult,
} from "../domain/reference-library";
import { expectOk, jsonFetch } from "./http";

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
  readonly candidate: PdfHighlightAnalysisCandidate;
  readonly comment: string;
  readonly selected: boolean;
}

export class PdfHighlightImportPanel extends LightDomElement {
  static override properties = {
    importing: { state: true },
    loading: { state: true },
    reviews: { state: true },
    status: { state: true },
  };

  declare private importing: boolean;
  declare private loading: boolean;
  declare private reviews: readonly CandidateReview[];
  declare private status: string;
  #context: PdfHighlightImportContext | null = null;
  #analysis: ArtifactAnalysis | null = null;
  #pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.importing = false;
    this.loading = false;
    this.reviews = [];
    this.status = defaultStatus;
  }

  setContext(context: PdfHighlightImportContext | null): void {
    const identityChanged = context?.artifactId !== this.#context?.artifactId || context?.referenceId !== this.#context?.referenceId;
    this.#context = context;
    if (identityChanged) {
      this.reset();
      if (context) void this.refreshAnalysis(context);
    }
  }

  protected showResult(result: PdfHighlightAnalysisResult): void {
    this.loading = false;
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
    this.loading = false;
    this.status = message;
  }

  reset(message = defaultStatus): void {
    this.importing = false;
    this.reviews = [];
    this.loading = false;
    this.#analysis = null;
    this.clearPoll();
    this.status = message;
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
        ${this.#analysis?.status === "failed"
          ? html`<button
              class="button-secondary"
              id="retry-library-pdf-highlights"
              type="button"
              ?disabled=${this.loading}
              @click=${this.retry}
            >
              ${this.loading ? "Retrying…" : "Retry analysis"}
            </button>`
          : ""}
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
            Clear selection
          </button>
        </div>
      </form>
    `;
  }

  protected async importSelected(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const context = this.#context;
    if (!context || this.loading || this.importing) return;
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
    if (this.importing) return;
    this.reviews = this.reviews.map((review) => ({ ...review, selected: false }));
    this.status = "Candidate selection cleared. Nothing was imported.";
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

  protected async load(artifactId: string, retry = false): Promise<ArtifactAnalysis> {
    const response = await fetch(`/api/library/pdfs/${encodeURIComponent(artifactId)}/analyses/pdf-highlights`, {
      method: retry ? "POST" : "GET",
      credentials: "same-origin",
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isArtifactAnalysis(value)) throw new Error("The server returned an invalid analysis status");
    return value;
  }

  protected async save(context: PdfHighlightImportContext, candidates: readonly LibraryHighlightImportCandidate[]): Promise<void> {
    await expectOk(
      await jsonFetch(`/api/library/references/${encodeURIComponent(context.referenceId)}/highlight-imports`, {
        artifactId: context.artifactId,
        candidates,
      }),
    );
  }

  protected async refreshAnalysis(context: PdfHighlightImportContext, retry = false): Promise<void> {
    if (this.loading || !this.currentContext(context)) return;
    this.loading = true;
    if (retry) this.status = "Queueing highlight analysis…";
    try {
      const analysis = await this.load(context.artifactId, retry);
      if (!this.currentContext(context)) return;
      if (analysis.artifactId !== context.artifactId) return;
      this.#analysis = analysis;
      if (analysis.status === "queued" || analysis.status === "running") {
        this.loading = false;
        this.status = analysis.status === "queued" ? "Highlight analysis is queued…" : "Analyzing PDF highlights…";
        this.schedulePoll(context);
      } else if (analysis.status === "failed") {
        this.showError(analysis.error ? `Could not analyze this PDF: ${analysis.error}` : "Could not analyze this PDF.");
      } else if (analysis.result) {
        this.showResult({
          ...analysis.result,
          candidates: analysis.result.candidates.filter(
            (candidate) =>
              !context.highlights.some(
                (highlight) => highlight.page === candidate.page && libraryPdfRectsOverlap(highlight.rects, candidate.rects),
              ),
          ),
        });
      }
    } catch (error) {
      if (this.currentContext(context)) {
        this.showError(
          error instanceof Error ? `Could not load highlight analysis: ${error.message}` : "Could not load highlight analysis.",
        );
      }
    } finally {
      if (this.currentContext(context)) this.loading = false;
    }
  }

  protected retry(): void {
    const context = this.#context;
    if (context) void this.refreshAnalysis(context, true);
  }

  private schedulePoll(context: PdfHighlightImportContext): void {
    this.clearPoll();
    this.#pollTimer = setTimeout(() => void this.refreshAnalysis(context), 2_000);
  }

  private clearPoll(): void {
    if (this.#pollTimer) clearTimeout(this.#pollTimer);
    this.#pollTimer = null;
  }

  override disconnectedCallback(): void {
    this.clearPoll();
    super.disconnectedCallback();
  }
}

const defaultStatus = "Highlights are analyzed automatically after PDF import.";
const highlightNoun = (count: number): string => (count === 1 ? "highlight" : "highlights");

if (typeof customElements !== "undefined" && !customElements.get("pdf-highlight-import-panel")) {
  customElements.define("pdf-highlight-import-panel", PdfHighlightImportPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "pdf-highlight-import-panel": PdfHighlightImportPanel;
  }
}
