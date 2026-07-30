import { html, nothing, type TemplateResult } from "lit";
import {
  isArtifactAnalysis,
  isPdfReferenceAnalysisResult,
  isPdfReferenceReviewQueue,
  type ArtifactAnalysis,
  type PdfReferenceAnalysisCandidate,
  type PdfReferenceAnalysisResult,
  type PdfReferenceReviewCandidate,
  type PdfReferenceReviewDecision,
  type PdfReferenceReviewQueue,
  type ReviewPdfReferenceCandidateBatchItem,
} from "../../domain/reference-library";
import { errorMessage, expectOk, jsonFetch, loadJson } from "../platform/http";
import { LightDomElement } from "../platform/light-dom-controller";

const defaultStatus = "References are analyzed automatically after PDF import.";

export const pdfReferenceReviewOutcomeEvent = "pdf-reference-review-outcome";
export const pdfReferenceMentionOpenEvent = "pdf-reference-mention-open";

export interface PdfReferenceReviewOutcome {
  readonly action: "library-refresh";
  readonly message: string;
}

export class PdfReferenceAnalysisPanel extends LightDomElement {
  static override properties = {
    loading: { state: true },
    reviewLoading: { state: true },
    reviewQueue: { state: true },
    reviewStatus: { state: true },
    result: { state: true },
    savingAll: { state: true },
    savingCandidateId: { state: true },
    status: { state: true },
  };

  declare private loading: boolean;
  declare private reviewLoading: boolean;
  declare private reviewQueue: PdfReferenceReviewQueue | null;
  declare private reviewStatus: string;
  declare private result: PdfReferenceAnalysisResult | null;
  declare private savingAll: boolean;
  declare private savingCandidateId: string;
  declare private status: string;
  #analysis: ArtifactAnalysis | null = null;
  #artifactId = "";
  #pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.loading = false;
    this.reviewLoading = false;
    this.reviewQueue = null;
    this.reviewStatus = "";
    this.result = null;
    this.savingAll = false;
    this.savingCandidateId = "";
    this.status = defaultStatus;
  }

  // Called through the PDF inspector's light-DOM owner registry.
  // fallow-ignore-next-line unused-class-member
  setArtifact(artifactId: string): void {
    if (artifactId === this.#artifactId) return;
    this.reset();
    this.#artifactId = artifactId;
    if (artifactId) void this.refresh(artifactId);
  }

  reset(): void {
    this.clearPoll();
    this.#analysis = null;
    this.#artifactId = "";
    this.loading = false;
    this.reviewLoading = false;
    this.reviewQueue = null;
    this.reviewStatus = "";
    this.result = null;
    this.savingAll = false;
    this.savingCandidateId = "";
    this.status = defaultStatus;
  }

  protected override render(): TemplateResult {
    return html`
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <strong id="pdf-reference-analysis-title">References in this PDF</strong>
          <p class="mt-1 text-xs leading-5 text-app-text-soft" role="status" aria-live="polite">${this.status}</p>
        </div>
        ${this.#analysis?.status === "ready" || this.#analysis?.status === "failed"
          ? html`
              <button class="button-secondary" type="button" ?disabled=${this.loading} @click=${this.retry}>
                ${this.loading ? "Queueing…" : this.#analysis.status === "ready" ? "Run analysis again" : "Retry analysis"}
              </button>
            `
          : nothing}
      </div>
      ${this.reviewStatus
        ? html`<p class="mt-2 text-xs leading-5 text-app-text-soft" role="status" aria-live="polite">${this.reviewStatus}</p>`
        : nothing}
      ${this.result?.candidates.length
        ? html`
            ${this.renderAddAllControl()}
            <div class="mt-3 space-y-2" id="pdf-reference-analysis-list">
              ${this.reviewQueue
                ? this.reviewQueue.candidates.map((candidate) => this.renderCandidate(candidate, candidate))
                : this.result.candidates.map((candidate) => this.renderCandidate(candidate, null))}
            </div>
          `
        : nothing}
    `;
  }

  private renderAddAllControl(): TemplateResult | typeof nothing {
    const pending = this.reviewQueue?.candidates.filter(({ review }) => review === null) ?? [];
    if (this.reviewLoading || pending.length === 0) return nothing;
    return html`
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-y border-app-line py-3">
        <p class="text-xs leading-5 text-app-text-soft">
          Add all ${pending.length} pending extracted reference${pending.length === 1 ? "" : "s"} using exact or suggested Library matches.
        </p>
        <button
          class="button-primary"
          type="button"
          ?disabled=${this.savingAll || Boolean(this.savingCandidateId)}
          @click=${() => void this.addAllPending()}
        >
          ${this.savingAll ? "Adding all…" : `Add all ${pending.length} to Library`}
        </button>
      </div>
    `;
  }

  private renderCandidate(candidate: PdfReferenceAnalysisCandidate, reviewed: PdfReferenceReviewCandidate | null): TemplateResult {
    const mentions = this.result?.mentions?.filter(({ candidateId }) => candidateId === candidate.id) ?? [];
    return html`
      <article class="resource-card" data-pdf-reference-id=${candidate.id}>
        <p class="eyebrow">Reference · page ${candidate.page}</p>
        <strong class="mt-1 block font-sans">${candidate.title || candidate.raw}</strong>
        ${candidate.title ? html`<p class="mt-1 text-xs leading-5 text-app-text-soft">${candidate.raw}</p>` : nothing}
        ${candidate.authors.length || candidate.year || candidate.doi
          ? html`
              <p class="mt-2 text-xs leading-5 text-app-text-soft">
                ${[candidate.authors.join("; "), candidate.year, candidate.doi].filter(Boolean).join(" · ")}
              </p>
            `
          : nothing}
        ${mentions.length
          ? html`
              <details class="pdf-reference-usage mt-2">
                <summary>Used ${mentions.length} time${mentions.length === 1 ? "" : "s"} in this PDF</summary>
                <ol>
                  ${mentions.map(
                    (mention) =>
                      html`<li>
                        <button type="button" @click=${() => this.openMention(mention.page)}>
                          <span class="eyebrow"
                            >Page ${mention.page} · ${mention.style === "numeric" ? "numeric citation" : "author–year citation"}</span
                          >
                          <span>${mention.context || mention.raw}</span>
                        </button>
                      </li>`,
                  )}
                </ol>
              </details>
            `
          : nothing}
        ${reviewed?.match
          ? html`
              <p class="mt-2 rounded-sm border border-app-line bg-app-surface px-3 py-2 text-xs leading-5">
                <span class="font-semibold">${reviewed.matchKind === "doi" ? "Exact DOI match" : "Suggested Library match"}</span>
                · ${reviewed.match.title}
              </p>
            `
          : nothing}
        ${this.renderReviewActions(reviewed)}
        ${candidate.doi || candidate.url
          ? html`
              <div class="mt-2 flex flex-wrap gap-2">
                ${candidate.doi
                  ? html`
                      <a class="button-secondary" href=${`https://doi.org/${candidate.doi}`} target="_blank" rel="noopener noreferrer">
                        Open DOI
                      </a>
                    `
                  : nothing}
                ${candidate.url && !candidate.url.toLocaleLowerCase().includes("doi.org/")
                  ? html` <a class="button-secondary" href=${candidate.url} target="_blank" rel="noopener noreferrer">Open source</a> `
                  : nothing}
              </div>
            `
          : nothing}
      </article>
    `;
  }

  private openMention(page: number): void {
    this.dispatchEvent(new CustomEvent(pdfReferenceMentionOpenEvent, { bubbles: true, detail: { page } }));
  }

  private renderReviewActions(candidate: PdfReferenceReviewCandidate | null): TemplateResult | typeof nothing {
    if (!candidate || this.reviewLoading) return nothing;
    if (candidate.review?.decision === "accepted") {
      return html`<p class="mt-2 text-xs font-semibold text-app-text">Added to Library</p>`;
    }
    const saving = this.savingAll || this.savingCandidateId === candidate.id;
    return html`
      ${candidate.review?.decision === "rejected" ? html`<p class="mt-2 text-xs font-semibold text-app-text-soft">Skipped</p>` : nothing}
      <div class="mt-2 flex flex-wrap gap-2" role="group" aria-label="Review parsed reference">
        ${candidate.match
          ? html`
              <button
                class="button-primary"
                type="button"
                ?disabled=${saving}
                @click=${() => void this.reviewCandidate(candidate, "accepted", candidate.match?.id)}
              >
                ${saving ? "Saving…" : candidate.matchKind === "doi" ? "Accept Library match" : "Use suggested match"}
              </button>
              ${candidate.matchKind === "bibliographic"
                ? html`
                    <button
                      class="button-secondary"
                      type="button"
                      ?disabled=${saving}
                      @click=${() => void this.reviewCandidate(candidate, "accepted")}
                    >
                      Add separately
                    </button>
                  `
                : nothing}
            `
          : html`
              <button
                class="button-primary"
                type="button"
                ?disabled=${saving}
                @click=${() => void this.reviewCandidate(candidate, "accepted")}
              >
                ${saving ? "Saving…" : "Add to Library"}
              </button>
            `}
        ${candidate.review?.decision !== "rejected"
          ? html`
              <button
                class="button-secondary"
                type="button"
                ?disabled=${saving}
                @click=${() => void this.reviewCandidate(candidate, "rejected")}
              >
                Skip
              </button>
            `
          : nothing}
      </div>
    `;
  }

  protected async load(artifactId: string, retry = false): Promise<ArtifactAnalysis> {
    const value = await loadJson(`/api/library/pdfs/${encodeURIComponent(artifactId)}/analyses/pdf-references`, retry ? "POST" : "GET");
    if (!isArtifactAnalysis(value) || value.kind !== "pdf-references") {
      throw new Error("The server returned an invalid reference analysis status");
    }
    return value;
  }

  protected async loadReviewQueue(artifactId: string): Promise<PdfReferenceReviewQueue> {
    const value = await loadJson(`/api/library/pdfs/${encodeURIComponent(artifactId)}/reference-review`);
    if (!isPdfReferenceReviewQueue(value)) throw new Error("The server returned an invalid reference review queue");
    return value;
  }

  protected async submitReview(
    artifactId: string,
    input: {
      readonly fingerprint: string;
      readonly candidateId: string;
      readonly decision: PdfReferenceReviewDecision;
      readonly referenceId?: string;
    },
  ): Promise<void> {
    await expectOk(await jsonFetch(`/api/library/pdfs/${encodeURIComponent(artifactId)}/reference-review`, input));
  }

  protected async submitReviewBatch(
    artifactId: string,
    fingerprint: string,
    candidates: readonly ReviewPdfReferenceCandidateBatchItem[],
  ): Promise<void> {
    await expectOk(await jsonFetch(`/api/library/pdfs/${encodeURIComponent(artifactId)}/reference-review`, { fingerprint, candidates }));
  }

  protected async refresh(artifactId: string, retry = false): Promise<void> {
    if (this.loading || artifactId !== this.#artifactId) return;
    this.loading = true;
    if (retry) this.status = "Queueing reference analysis…";
    try {
      const analysis = await this.load(artifactId, retry);
      if (artifactId !== this.#artifactId || analysis.artifactId !== artifactId) return;
      this.applyAnalysis(artifactId, analysis);
    } catch (error) {
      if (artifactId === this.#artifactId) {
        this.result = null;
        this.status = error instanceof Error ? `Could not load reference analysis: ${error.message}` : "Could not load reference analysis.";
      }
    } finally {
      if (artifactId === this.#artifactId) this.loading = false;
    }
  }

  private applyAnalysis(artifactId: string, analysis: ArtifactAnalysis): void {
    this.#analysis = analysis;
    if (analysis.status === "queued" || analysis.status === "running") {
      this.reviewQueue = null;
      this.reviewStatus = "";
      this.status = analysis.status === "queued" ? "Reference analysis is queued…" : "Reading the PDF bibliography…";
      this.loading = false;
      this.schedulePoll(artifactId);
      return;
    }
    if (analysis.status === "failed") {
      this.reviewQueue = null;
      this.reviewStatus = "";
      this.result = null;
      this.status = analysis.error ? `Could not analyze references: ${analysis.error}` : "Could not analyze references.";
      return;
    }
    if (!analysis.result || !isPdfReferenceAnalysisResult(analysis.result)) return;
    this.result = analysis.result;
    this.status = referenceStatus(analysis.result);
    void this.refreshReviewQueue(artifactId);
  }

  private async refreshReviewQueue(artifactId: string): Promise<void> {
    if (artifactId !== this.#artifactId) return;
    this.reviewLoading = true;
    this.reviewStatus = "Loading review status…";
    try {
      const queue = await this.loadReviewQueue(artifactId);
      if (artifactId !== this.#artifactId || queue.artifactId !== artifactId) return;
      this.reviewQueue = queue;
      this.reviewStatus = reviewQueueStatus(queue);
    } catch (error) {
      if (artifactId === this.#artifactId) {
        this.reviewQueue = null;
        const message = errorMessage(error, "Could not load reference review status.");
        if (message === "PDF reference analysis is not ready") {
          this.reviewStatus = "Reference review will appear when analysis finishes.";
          this.schedulePoll(artifactId);
        } else if (message === "Identify the PDF before reviewing its references") {
          this.reviewStatus = "Identify this PDF before adding its parsed references to the Library.";
        } else {
          this.reviewStatus = message;
        }
      }
    } finally {
      if (artifactId === this.#artifactId) this.reviewLoading = false;
    }
  }

  protected async reviewCandidate(
    candidate: PdfReferenceReviewCandidate,
    decision: PdfReferenceReviewDecision,
    referenceId?: string,
  ): Promise<void> {
    const artifactId = this.#artifactId;
    const fingerprint = this.reviewQueue?.fingerprint;
    if (!artifactId || !fingerprint || this.savingCandidateId) return;
    this.savingCandidateId = candidate.id;
    this.reviewStatus = decision === "accepted" ? "Saving reference…" : "Skipping reference…";
    try {
      await this.submitReview(artifactId, {
        fingerprint,
        candidateId: candidate.id,
        decision,
        ...(referenceId ? { referenceId } : {}),
      });
      await this.refreshReviewQueue(artifactId);
      if (artifactId !== this.#artifactId) return;
      if (decision === "accepted") {
        this.dispatchEvent(
          new CustomEvent<PdfReferenceReviewOutcome>(pdfReferenceReviewOutcomeEvent, {
            bubbles: true,
            composed: true,
            detail: {
              action: "library-refresh",
              message: referenceId ? "Parsed reference linked to the Library." : "Parsed reference added to the Library.",
            },
          }),
        );
      }
    } catch (error) {
      if (artifactId === this.#artifactId) this.reviewStatus = errorMessage(error, "Could not save the reference review.");
    } finally {
      if (artifactId === this.#artifactId) this.savingCandidateId = "";
    }
  }

  protected async addAllPending(): Promise<void> {
    const artifactId = this.#artifactId;
    const queue = this.reviewQueue;
    if (!artifactId || !queue || this.savingAll || this.savingCandidateId) return;
    const candidates = queue.candidates
      .filter(({ review }) => review === null)
      .map(({ id, match }) => ({ candidateId: id, ...(match ? { referenceId: match.id } : {}) }));
    if (candidates.length === 0) return;
    this.savingAll = true;
    this.reviewStatus = `Adding ${candidates.length} extracted reference${candidates.length === 1 ? "" : "s"}…`;
    try {
      await this.submitReviewBatch(artifactId, queue.fingerprint, candidates);
      await this.refreshReviewQueue(artifactId);
      if (artifactId !== this.#artifactId) return;
      this.dispatchEvent(
        new CustomEvent<PdfReferenceReviewOutcome>(pdfReferenceReviewOutcomeEvent, {
          bubbles: true,
          composed: true,
          detail: {
            action: "library-refresh",
            message: `${candidates.length} parsed reference${candidates.length === 1 ? "" : "s"} added to the Library.`,
          },
        }),
      );
    } catch (error) {
      if (artifactId === this.#artifactId) this.reviewStatus = errorMessage(error, "Could not add the extracted references.");
    } finally {
      if (artifactId === this.#artifactId) this.savingAll = false;
    }
  }

  protected retry(): void {
    if (this.#artifactId) void this.refresh(this.#artifactId, true);
  }

  private schedulePoll(artifactId: string): void {
    this.clearPoll();
    this.#pollTimer = setTimeout(() => void this.refresh(artifactId), 2_000);
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

function referenceStatus(result: PdfReferenceAnalysisResult): string {
  if (result.referencesStartPage === null) return `No bibliography heading found across ${result.pagesScanned} scanned pages.`;
  if (result.candidates.length === 0) return `No reference entries found after the bibliography on page ${result.referencesStartPage}.`;
  return `${result.candidates.length} reference${result.candidates.length === 1 ? "" : "s"} found · bibliography starts on page ${
    result.referencesStartPage
  }${result.truncated ? " · scan limit reached" : ""}`;
}

function reviewQueueStatus(queue: PdfReferenceReviewQueue): string {
  const accepted = queue.candidates.filter(({ review }) => review?.decision === "accepted").length;
  const rejected = queue.candidates.filter(({ review }) => review?.decision === "rejected").length;
  const pending = queue.candidates.length - accepted - rejected;
  return [pending ? `${pending} awaiting review` : "", accepted ? `${accepted} added` : "", rejected ? `${rejected} skipped` : ""]
    .filter(Boolean)
    .join(" · ");
}

if (typeof customElements !== "undefined" && !customElements.get("pdf-reference-analysis-panel")) {
  customElements.define("pdf-reference-analysis-panel", PdfReferenceAnalysisPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "pdf-reference-analysis-panel": PdfReferenceAnalysisPanel;
  }
}
