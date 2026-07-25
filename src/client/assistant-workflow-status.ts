import { html, LitElement, type TemplateResult } from "lit";

export const assistantWorkflowActionEvent = "kirjolab-assistant-workflow-action";
export type AssistantWorkflowAction = "choose-evidence" | "open-settings";

export class AssistantWorkflowStatus extends LitElement {
  static override properties = {
    operationId: { state: true },
    status: { state: true },
  };

  declare operationId: string;
  declare status: string;

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
