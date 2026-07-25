import { html, LitElement, type TemplateResult } from "lit";
import type { ModelCandidate } from "../domain/workspace";

export const candidateListOpenEvent = "candidate-list-open";

export class CandidateListPanel extends LitElement {
  static override properties = {
    candidates: { state: true },
  };

  declare private candidates: readonly ModelCandidate[];

  constructor() {
    super();
    this.candidates = [];
  }

  setCandidates(candidates: readonly ModelCandidate[]): void {
    this.candidates = candidates;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`<div class="mt-4" id="candidate-list">
      ${this.candidates.length === 0
        ? html`<div class="empty-state">Drafts open in Context and do not change the manuscript until applied.</div>`
        : this.candidates.map((candidate) => this.renderCandidate(candidate))}
    </div>`;
  }

  protected openCandidate(event: Event): void {
    const candidateId = (event.currentTarget as HTMLButtonElement).dataset.candidateId;
    const candidate = this.candidates.find((item) => item.id === candidateId);
    if (candidate) {
      this.dispatchEvent(new CustomEvent(candidateListOpenEvent, { bubbles: true, composed: true, detail: candidate }));
    }
  }

  private renderCandidate(candidate: ModelCandidate): TemplateResult {
    const stamp = candidate.operation === "draft-claim" ? candidate.relation : `r${candidate.sourceRevision}`;
    const excerpt = candidate.operation === "draft-claim" ? candidate.proposedText : candidate.target.anchor.exact;
    return html`
      <article class="resource-card mb-3">
        <div class="flex items-center justify-between gap-3">
          <span class="eyebrow">${candidate.model} · ${candidate.status}</span>
          <span class="font-sans text-[0.65rem] text-app-text-soft">${stamp}</span>
        </div>
        <p class="mt-2 line-clamp-2 font-mono text-xs leading-5 text-app-text-soft">${excerpt}</p>
        <button
          type="button"
          class="button-secondary mt-3 w-full justify-center"
          data-candidate-id=${candidate.id}
          @click=${this.openCandidate}
        >
          Open review
        </button>
      </article>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("candidate-list-panel")) {
  customElements.define("candidate-list-panel", CandidateListPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "candidate-list-panel": CandidateListPanel;
  }
}
