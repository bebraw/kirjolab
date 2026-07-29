import { html, nothing, type TemplateResult } from "lit";
import {
  isArtifactAnalysis,
  isPdfReferenceAnalysisResult,
  type ArtifactAnalysis,
  type PdfReferenceAnalysisResult,
} from "../domain/reference-library";
import { loadJson } from "./http";
import { LightDomElement } from "./light-dom-controller";

const defaultStatus = "References are analyzed automatically after PDF import.";

export class PdfReferenceAnalysisPanel extends LightDomElement {
  static override properties = {
    loading: { state: true },
    result: { state: true },
    status: { state: true },
  };

  declare private loading: boolean;
  declare private result: PdfReferenceAnalysisResult | null;
  declare private status: string;
  #analysis: ArtifactAnalysis | null = null;
  #artifactId = "";
  #pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.loading = false;
    this.result = null;
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
    this.result = null;
    this.status = defaultStatus;
  }

  protected override render(): TemplateResult {
    return html`
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <strong id="pdf-reference-analysis-title">References in this PDF</strong>
          <p class="mt-1 text-xs leading-5 text-app-text-soft" role="status" aria-live="polite">${this.status}</p>
        </div>
        ${this.#analysis?.status === "failed"
          ? html`
              <button class="button-secondary" type="button" ?disabled=${this.loading} @click=${this.retry}>
                ${this.loading ? "Retrying…" : "Retry analysis"}
              </button>
            `
          : nothing}
      </div>
      ${this.result?.candidates.length
        ? html`
            <div class="mt-3 space-y-2" id="pdf-reference-analysis-list">
              ${this.result.candidates.map(
                (candidate) => html`
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
                    ${candidate.doi || candidate.url
                      ? html`
                          <div class="mt-2 flex flex-wrap gap-2">
                            ${candidate.doi
                              ? html`
                                  <a
                                    class="button-secondary"
                                    href=${`https://doi.org/${candidate.doi}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Open DOI
                                  </a>
                                `
                              : nothing}
                            ${candidate.url && !candidate.url.toLocaleLowerCase().includes("doi.org/")
                              ? html`
                                  <a class="button-secondary" href=${candidate.url} target="_blank" rel="noopener noreferrer">
                                    Open source
                                  </a>
                                `
                              : nothing}
                          </div>
                        `
                      : nothing}
                  </article>
                `,
              )}
            </div>
          `
        : nothing}
    `;
  }

  protected async load(artifactId: string, retry = false): Promise<ArtifactAnalysis> {
    const value = await loadJson(`/api/library/pdfs/${encodeURIComponent(artifactId)}/analyses/pdf-references`, retry ? "POST" : "GET");
    if (!isArtifactAnalysis(value) || value.kind !== "pdf-references") {
      throw new Error("The server returned an invalid reference analysis status");
    }
    return value;
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
      this.status = analysis.status === "queued" ? "Reference analysis is queued…" : "Reading the PDF bibliography…";
      this.loading = false;
      this.schedulePoll(artifactId);
      return;
    }
    if (analysis.status === "failed") {
      this.result = null;
      this.status = analysis.error ? `Could not analyze references: ${analysis.error}` : "Could not analyze references.";
      return;
    }
    if (!analysis.result || !isPdfReferenceAnalysisResult(analysis.result)) return;
    this.result = analysis.result;
    this.status = referenceStatus(analysis.result);
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

if (typeof customElements !== "undefined" && !customElements.get("pdf-reference-analysis-panel")) {
  customElements.define("pdf-reference-analysis-panel", PdfReferenceAnalysisPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "pdf-reference-analysis-panel": PdfReferenceAnalysisPanel;
  }
}
