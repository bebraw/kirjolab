import { html, LitElement, type TemplateResult } from "lit";

export const projectHistoryOpenEvent = "project-history-open";

export class ProjectHistoryTrigger extends LitElement {
  static override properties = { revision: { state: true } };

  declare private revision: number;

  constructor() {
    super();
    this.revision = 0;
  }

  setRevision(revision: number): void {
    this.revision = revision;
  }

  protected open(): void {
    this.dispatchEvent(new CustomEvent(projectHistoryOpenEvent, { bubbles: true, composed: true }));
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`<button id="open-project-history" type="button" @click=${this.open}>
      <strong>History</strong><code id="revision-badge">r${this.revision}</code>
    </button>`;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("project-history-trigger")) {
  customElements.define("project-history-trigger", ProjectHistoryTrigger);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-history-trigger": ProjectHistoryTrigger;
  }
}
