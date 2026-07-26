import { html, LitElement, type TemplateResult } from "lit";
import {
  isModelCandidate,
  type CreateCandidateInput,
  type CreateClaimCandidateInput,
  type ModelCandidate,
  type ModelClaimCandidate,
  type ModelRevisionCandidate,
} from "../domain/workspace";
import { expectOk, jsonFetch } from "./http";

export const candidateListOpenEvent = "candidate-list-open";

type RevisionCandidateDraft = Omit<CreateCandidateInput, "promptVersion" | "providerAdapter">;
type ClaimCandidateDraft = Omit<CreateClaimCandidateInput, "promptVersion" | "providerAdapter">;

export class CandidateListPanel extends LitElement {
  static override properties = {
    candidates: { state: true },
  };

  declare private candidates: readonly ModelCandidate[];
  private apiBase = "";

  constructor() {
    super();
    this.candidates = [];
  }

  setCandidates(candidates: readonly ModelCandidate[]): void {
    this.candidates = candidates;
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  async createRevision(input: RevisionCandidateDraft): Promise<ModelRevisionCandidate> {
    const candidate = await this.create("candidates", {
      ...input,
      promptVersion: "revise-selection-v1",
      providerAdapter: "openai-compatible",
    });
    if (candidate.operation !== "revise-selection") throw new Error("Candidate endpoint returned an invalid targeted revision");
    return candidate;
  }

  async createClaim(input: ClaimCandidateDraft): Promise<ModelClaimCandidate> {
    const candidate = await this.create("claim-candidates", {
      ...input,
      promptVersion: "draft-claim-v1",
      providerAdapter: "openai-compatible",
    });
    if (candidate.operation !== "draft-claim") throw new Error("Candidate endpoint returned an invalid claim draft");
    return candidate;
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

  private async create(
    resource: "candidates" | "claim-candidates",
    input: CreateCandidateInput | CreateClaimCandidateInput,
  ): Promise<ModelCandidate> {
    const response = await jsonFetch(`${this.apiBase}/${resource}`, input);
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isModelCandidate(value)) throw new Error("Candidate endpoint returned an invalid candidate");
    return value;
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
