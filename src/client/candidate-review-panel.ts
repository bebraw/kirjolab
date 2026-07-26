import { html, LitElement, nothing, type TemplateResult } from "lit";
import type { AnnotationResource, ClaimResource, ModelCandidate, ModelEvidence } from "../domain/workspace";
import { errorMessage, expectOk } from "./http";

export const candidateDecisionEvent = "candidate-decision";
export const candidateDecisionOutcomeEvent = "candidate-decision-outcome";
export const candidateEvidenceEvent = "candidate-evidence";

export type CandidateDecision = "apply" | "reject";

export interface CandidateDecisionRequest {
  readonly action: CandidateDecision;
  readonly candidateId: string;
}

export interface CandidateDecisionOutcome {
  readonly action: CandidateDecision;
  readonly candidateId: string;
  readonly failure: string | null;
}

export interface CandidateReviewData {
  readonly applicable: boolean;
  readonly availableEvidenceIds: ReadonlySet<string>;
  readonly candidate: ModelCandidate;
  readonly currentAction?: "apply" | "reject";
  readonly decisionBusy: boolean;
  readonly stableDocument: boolean;
}

export interface CandidateReviewSources {
  readonly annotations: readonly Pick<AnnotationResource, "id" | "updatedAt">[];
  readonly candidate: ModelCandidate;
  readonly claims: readonly Pick<ClaimResource, "id">[];
  readonly currentAction?: "apply" | "reject";
  readonly decisionBusy: boolean;
  readonly sourceRevision: number;
  readonly stableDocument: boolean;
}

export class CandidateReviewPanel extends LitElement {
  static override properties = {
    data: { state: true },
    failure: { state: true },
  };

  declare private data: CandidateReviewData | null;
  declare private failure: string | null;
  private apiBase = "";

  constructor() {
    super();
    this.data = null;
    this.failure = null;
  }

  setCandidate({
    annotations,
    candidate,
    claims,
    currentAction,
    decisionBusy,
    sourceRevision,
    stableDocument,
  }: CandidateReviewSources): void {
    if (this.data?.candidate.id !== candidate.id || candidate.status !== "pending") this.failure = null;
    const applicable =
      candidate.status === "pending" &&
      (candidate.operation === "draft-claim"
        ? candidate.evidence.every((evidence) =>
            annotations.some((annotation) => annotation.id === evidence.id && annotation.updatedAt === evidence.version),
          )
        : candidate.sourceRevision === sourceRevision &&
          candidate.target.resolution.status === "resolved" &&
          candidate.target.resolution.exactMatch);
    this.data = {
      applicable,
      availableEvidenceIds: new Set([...annotations, ...claims].map(({ id }) => id)),
      candidate,
      ...(currentAction ? { currentAction } : {}),
      decisionBusy,
      stableDocument,
    };
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  setAvailability(stableDocument: boolean, decisionBusy: boolean): void {
    if (!this.data) return;
    this.data = { ...this.data, decisionBusy, stableDocument };
  }

  showFailure(message: string): void {
    this.failure = message;
  }

  async decide(action: CandidateDecision): Promise<void> {
    const candidate = this.data?.candidate;
    if (!candidate) return;
    this.failure = null;
    let failure: string | null = null;
    try {
      const response = await fetch(`${this.apiBase}/candidates/${encodeURIComponent(candidate.id)}/${action}`, { method: "POST" });
      await expectOk(response);
    } catch (error) {
      failure = errorMessage(error, "Candidate decision failed");
      const verb = action === "apply" ? "apply" : "reject";
      const subject = candidate.operation === "draft-claim" ? "claim draft" : "revision";
      this.failure = `Could not ${verb} ${subject}: ${failure}`;
    }
    this.dispatchEvent(
      new CustomEvent<CandidateDecisionOutcome>(candidateDecisionOutcomeEvent, {
        bubbles: true,
        detail: { action, candidateId: candidate.id, failure },
      }),
    );
  }

  get scrollPosition(): number {
    return this.querySelector<HTMLElement>("#context-candidate-scroll")?.scrollTop ?? 0;
  }

  set scrollPosition(value: number) {
    const scroll = this.querySelector<HTMLElement>("#context-candidate-scroll");
    if (scroll) scroll.scrollTop = value;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const candidate = this.data?.candidate;
    const draftsClaim = candidate?.operation === "draft-claim";
    return html`
      <header class="context-resource-header">
        <div class="min-w-0">
          <p class="eyebrow" id="context-candidate-eyebrow">${draftsClaim ? "Grounded claim draft" : "Grounded revision"}</p>
          <h2 class="context-resource-title" id="context-candidate-title">
            ${candidate ? (draftsClaim ? "Draft evidence-backed claim" : "Revise selected passage") : "No revision selected"}
          </h2>
          <p class="context-resource-meta" id="context-candidate-meta">
            ${candidate ? this.candidateMeta(candidate) : "Provider, model, and source revision appear here."}
          </p>
        </div>
      </header>
      <div class="context-candidate-scroll" id="context-candidate-scroll">
        <div class="context-candidate-review">
          <p class="context-candidate-status" id="context-candidate-status" role="status" aria-live="polite">
            ${this.failure ??
            (this.data ? candidateStatusText(this.data) : "Choose a revision candidate to inspect its scoped change and evidence.")}
          </p>
          <div class="context-candidate-comparison" aria-label="Passage revision comparison">
            <section class="context-candidate-passage context-candidate-original" aria-labelledby="context-candidate-before-label">
              <h3 class="context-candidate-passage-label" id="context-candidate-before-label">
                ${draftsClaim ? "Research instruction" : "Original passage"}
              </h3>
              <pre id="context-candidate-before" role="region" aria-labelledby="context-candidate-before-label" tabindex="0">
${candidate
                  ? candidate.operation === "draft-claim"
                    ? candidate.instruction
                    : candidate.target.anchor.exact
                  : "The selected manuscript passage appears here."}</pre
              >
            </section>
            <section class="context-candidate-passage context-candidate-proposal" aria-labelledby="context-candidate-after-label">
              <h3 class="context-candidate-passage-label" id="context-candidate-after-label">
                ${draftsClaim ? "Proposed claim and note" : "Proposed replacement"}
              </h3>
              <pre id="context-candidate-after" role="region" aria-labelledby="context-candidate-after-label" tabindex="0">
${candidate
                  ? candidate.operation === "draft-claim"
                    ? [candidate.proposedText, candidate.proposedNote].filter(Boolean).join("\n\n")
                    : candidate.proposedReplacement
                  : "The proposed replacement appears here."}</pre
              >
            </section>
          </div>
          <section class="context-candidate-provenance" aria-labelledby="context-candidate-evidence-heading">
            <div>
              <p class="eyebrow">Grounding and provenance</p>
              <h3 class="context-candidate-section-title" id="context-candidate-evidence-heading">
                ${draftsClaim ? "Annotations used for this claim" : "Evidence used for this revision"}
              </h3>
            </div>
            <div class="context-candidate-evidence" id="context-candidate-evidence">
              ${candidate
                ? candidate.evidence.map((evidence) => this.renderEvidence(evidence))
                : html`<div class="empty-state">Annotation and claim snapshots appear here with links back to their sources.</div>`}
            </div>
          </section>
          <div class="context-candidate-actions" aria-label="Revision decision">
            <button
              class="button-secondary justify-center"
              id="context-candidate-reject"
              type="button"
              ?disabled=${!candidate || this.data?.decisionBusy || candidate.status !== "pending"}
              @click=${this.reject}
            >
              ${this.data?.currentAction === "reject" ? "Rejecting…" : draftsClaim ? "Reject claim draft" : "Reject revision"}
            </button>
            <button
              class="button-primary justify-center"
              id="context-candidate-apply"
              type="button"
              ?disabled=${!candidate ||
              this.data?.decisionBusy ||
              candidate.status !== "pending" ||
              !this.data?.applicable ||
              (!draftsClaim && !this.data?.stableDocument)}
              @click=${this.apply}
            >
              ${this.data?.currentAction === "apply" ? "Applying…" : draftsClaim ? "Create claim" : "Apply replacement"}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  protected apply(): void {
    this.startDecision("apply");
  }

  protected reject(): void {
    this.startDecision("reject");
  }

  protected openEvidence(event: Event): void {
    const id = (event.currentTarget as HTMLButtonElement).dataset.evidenceId;
    const evidence = this.data?.candidate.evidence.find((item) => item.id === id);
    if (evidence) this.dispatchEvent(new CustomEvent(candidateEvidenceEvent, { bubbles: true, composed: true, detail: evidence }));
  }

  private startDecision(action: CandidateDecision): void {
    const data = this.data;
    const candidate = data?.candidate;
    if (
      !data ||
      !candidate ||
      data.decisionBusy ||
      candidate.status !== "pending" ||
      (action === "apply" && (!data.applicable || (candidate.operation !== "draft-claim" && !data.stableDocument)))
    ) {
      return;
    }
    const detail: CandidateDecisionRequest = { action, candidateId: candidate.id };
    this.dispatchEvent(new CustomEvent<CandidateDecisionRequest>(candidateDecisionEvent, { bubbles: true, composed: true, detail }));
    void this.decide(action);
  }

  private candidateMeta(candidate: ModelCandidate): string {
    return candidate.operation === "draft-claim"
      ? [candidate.model, candidate.providerLabel, candidate.promptVersion, candidate.relation].join(" · ")
      : [candidate.model, candidate.providerLabel, candidate.promptVersion, `source r${candidate.sourceRevision}`].join(" · ");
  }

  private renderEvidence(evidence: ModelEvidence): TemplateResult {
    const annotation = evidence.kind === "annotation";
    const title = annotation ? `Annotation · page ${evidence.page}` : "Claim";
    const content = annotation ? evidence.quote : evidence.text;
    const note = annotation ? evidence.comment || "No researcher note." : evidence.note || "No working note.";
    const available = this.data?.availableEvidenceIds.has(evidence.id);
    return html`
      <article class="resource-card">
        <span class="eyebrow">${title}</span>
        <strong class="mt-2 block font-sans">${content}</strong>
        <p class="mt-2 font-sans text-xs leading-5 text-app-text-soft">${note}</p>
        ${available
          ? html`<button type="button" class="button-secondary mt-3" data-evidence-id=${evidence.id} @click=${this.openEvidence}>
              ${annotation ? "Open evidence" : "Open claim"}
            </button>`
          : nothing}
      </article>
    `;
  }
}

function candidateStatusText(data: CandidateReviewData): string {
  const { applicable, candidate } = data;
  const draftsClaim = candidate.operation === "draft-claim";
  if (candidate.status === "accepted")
    return draftsClaim
      ? "Accepted. The proposal became an evidence-backed claim."
      : "Accepted. The replacement was applied to canonical Markdown.";
  if (candidate.status === "rejected")
    return draftsClaim ? "Rejected. No claim was created." : "Rejected. Canonical Markdown was not changed by this candidate.";
  if (applicable)
    return draftsClaim
      ? "Pending review. Applying creates a claim linked to these annotation snapshots."
      : "Pending review. Applying changes only this exact selected passage.";
  return draftsClaim
    ? "Pending but stale. Reject it or draft again from current annotations."
    : "Pending but stale. Reject it or generate a new revision from current prose and evidence.";
}

if (typeof customElements !== "undefined" && !customElements.get("candidate-review-panel")) {
  customElements.define("candidate-review-panel", CandidateReviewPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "candidate-review-panel": CandidateReviewPanel;
  }
}
