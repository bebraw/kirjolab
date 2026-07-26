import { html, LitElement, type TemplateResult } from "lit";
import type { AnnotationResource, ClaimResource, ModelEvidenceReference } from "../domain/workspace";
import type { AssistantOperationId } from "./assistant-operations";
import { maximumModelEvidenceItems, type ModelEvidenceItem } from "./model-provider";

export const assistantWorkflowActionEvent = "kirjolab-assistant-workflow-action";
export type AssistantWorkflowAction = "choose-evidence" | "open-settings";

export interface SelectedModelEvidence {
  readonly annotationItems: ModelEvidenceItem[];
  readonly annotationReferences: Array<Extract<ModelEvidenceReference, { readonly kind: "annotation" }>>;
  readonly items: ModelEvidenceItem[];
  readonly references: ModelEvidenceReference[];
}

export class AssistantWorkflowStatus extends LitElement {
  static override properties = {
    operationId: { state: true },
    status: { state: true },
  };

  declare operationId: string;
  declare status: string;
  private evidenceKeys = new Set<string>();

  constructor() {
    super();
    this.operationId = "revise-selection";
    this.status = "Select manuscript text and at least one annotation or claim to ground the request.";
  }

  setOperation(operationId: string): void {
    this.operationId = operationId;
    this.status =
      operationId === "draft-claim"
        ? "Select at least one annotation to ground the claim draft."
        : operationId === "phrase-passage"
          ? "Choose a rhetorical purpose, then compare contextual alternatives before opening exact review."
          : "Choose a target and the required evidence, then generate a reviewable draft.";
  }

  generationStarted(operationId: AssistantOperationId): void {
    this.status =
      operationId === "draft-claim"
        ? "Asking the local model for one grounded claim draft…"
        : operationId === "clarity-drill"
          ? "Finding the single ambiguity that matters most…"
          : "Asking the local model for a grounded candidate…";
  }

  get selectedEvidenceKeys(): ReadonlySet<string> {
    return new Set(this.evidenceKeys);
  }

  setEvidenceSelected(key: string, selected: boolean): void {
    if (!/^(?:annotation|claim):[^:]+$/u.test(key)) return;
    if (selected) this.evidenceKeys.add(key);
    else this.evidenceKeys.delete(key);
    this.status =
      this.evidenceKeys.size > maximumModelEvidenceItems
        ? `Choose no more than ${maximumModelEvidenceItems} evidence resources.`
        : `${this.evidenceKeys.size} ${this.evidenceKeys.size === 1 ? "resource" : "resources"} selected for grounding.`;
  }

  reconcileEvidence(validKeys: ReadonlySet<string>): void {
    this.evidenceKeys = new Set([...this.evidenceKeys].filter((key) => validKeys.has(key)));
  }

  modelEvidence(annotations: readonly AnnotationResource[], claims: readonly ClaimResource[]): SelectedModelEvidence {
    const annotationItems: ModelEvidenceItem[] = [];
    const annotationReferences: Array<Extract<ModelEvidenceReference, { readonly kind: "annotation" }>> = [];
    const items: ModelEvidenceItem[] = [];
    const references: ModelEvidenceReference[] = [];
    for (const key of this.evidenceKeys) {
      if (key.startsWith("annotation:")) {
        const id = key.slice("annotation:".length);
        const annotation = annotations.find((item) => item.id === id);
        if (!annotation) continue;
        const reference = { kind: "annotation" as const, id, version: annotation.updatedAt };
        const item: ModelEvidenceItem = {
          kind: "annotation",
          id,
          label: `PDF annotation on page ${annotation.page}`,
          content: [
            `Quote: ${annotation.quote}`,
            annotation.prefix ? `Context before: ${annotation.prefix}` : "",
            annotation.suffix ? `Context after: ${annotation.suffix}` : "",
            annotation.comment ? `Researcher note: ${annotation.comment}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        };
        annotationReferences.push(reference);
        references.push(reference);
        annotationItems.push(item);
        items.push(item);
        continue;
      }
      const id = key.slice("claim:".length);
      const claim = claims.find((item) => item.id === id);
      if (!claim) continue;
      references.push({ kind: "claim", id, version: claim.updatedAt });
      items.push({
        kind: "claim",
        id,
        label: "Researcher-authored claim",
        content: [`Claim: ${claim.text}`, claim.note ? `Working note: ${claim.note}` : ""].filter(Boolean).join("\n"),
      });
    }
    return { annotationItems, annotationReferences, items, references };
  }

  protected emitAction(action: AssistantWorkflowAction): void {
    this.dispatchEvent(new CustomEvent(assistantWorkflowActionEvent, { bubbles: true, composed: true, detail: action }));
  }

  protected openSettings(event: Event): void {
    event.stopPropagation();
    this.emitAction("open-settings");
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
      <details
        class="mt-4 text-xs leading-5 text-app-text-soft"
        id="assistant-phrasing-attribution"
        ?hidden=${this.operationId !== "phrase-passage"}
      >
        <summary class="cursor-pointer font-semibold">About the phrasing inventory</summary>
        <p class="mt-2">
          Patterns are independently derived from CC BY PLOS articles and adapted by the configured local model. No Academic Phrasebank
          content is included.
        </p>
        <p class="mt-2">
          <a class="link" href="/phrasing-guidance/sources.json" target="_blank" rel="noopener noreferrer">Source ledger</a> ·
          <a class="link" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> ·
          <a class="link" href="https://api.plos.org/text-and-data-mining.html" target="_blank" rel="noopener noreferrer"
            >PLOS corpus access</a
          >
        </p>
      </details>
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button class="button-secondary" id="choose-model-evidence" type="button" @click=${() => this.emitAction("choose-evidence")}>
          Choose evidence
        </button>
        <button class="assistant-connection-link" id="open-preferences-from-assistant" type="button" @click=${this.openSettings}>
          Connection settings
        </button>
      </div>
      <p class="ui-status mt-3" id="model-status" role="status" aria-live="polite">${this.status}</p>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("assistant-workflow-status")) {
  customElements.define("assistant-workflow-status", AssistantWorkflowStatus);
}

declare global {
  interface HTMLElementTagNameMap {
    "assistant-workflow-status": AssistantWorkflowStatus;
  }
}
