import { html, type TemplateResult } from "lit";
import { LightDomElement } from "./light-dom-controller";
import {
  isModelCandidate,
  type CreateCandidateInput,
  type CreateClaimCandidateInput,
  type ModelCandidate,
  type ModelClaimCandidate,
  type ModelRevisionCandidate,
} from "../domain/workspace";
import { expectOk, jsonFetch } from "./http";
import type { ModelEvidenceItem, ModelProvider } from "./model-provider";

export const candidateListOpenEvent = "candidate-list-open";

type RevisionCandidateDraft = Omit<CreateCandidateInput, "promptVersion" | "providerAdapter">;
type ClaimCandidateDraft = Omit<CreateClaimCandidateInput, "promptVersion" | "providerAdapter">;

interface RevisionGeneration {
  readonly evidence: RevisionCandidateDraft["evidence"];
  readonly instruction: string;
  readonly promptEvidence: readonly ModelEvidenceItem[];
  readonly target: RevisionCandidateDraft["target"];
}

interface ClaimGeneration {
  readonly evidence: ClaimCandidateDraft["evidence"];
  readonly instruction: string;
  readonly promptEvidence: readonly ModelEvidenceItem[];
  readonly relation: ClaimCandidateDraft["relation"];
}

export class CandidateListPanel extends LightDomElement {
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

  async generateRevision(provider: Pick<ModelProvider, "reviseSelection">, input: RevisionGeneration): Promise<ModelRevisionCandidate> {
    const revision = await provider.reviseSelection({
      selectedPassage: input.target.excerpt,
      instruction: input.instruction,
      evidence: input.promptEvidence,
    });
    return this.createRevision({
      evidence: input.evidence,
      instruction: input.instruction,
      model: revision.model,
      proposedReplacement: revision.replacement,
      providerLabel: revision.providerLabel,
      target: input.target,
    });
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

  async generateClaim(provider: Pick<ModelProvider, "draftClaim">, input: ClaimGeneration): Promise<ModelClaimCandidate> {
    const draft = await provider.draftClaim({
      instruction: input.instruction,
      relation: input.relation,
      evidence: input.promptEvidence,
    });
    return this.createClaim({
      evidence: input.evidence,
      instruction: input.instruction,
      model: draft.model,
      proposedNote: draft.note,
      proposedText: draft.text,
      providerLabel: draft.providerLabel,
      relation: input.relation,
    });
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
