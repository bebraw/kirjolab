import { html, LitElement, type TemplateResult } from "lit";

const defaultTarget = "main.md · line 1 · caret";

export class EditorStatus extends LitElement {
  static override properties = {
    save: { state: true },
    target: { state: true },
  };

  declare private save: string;
  declare private target: string;

  constructor() {
    super();
    this.save = "Opening…";
    this.target = defaultTarget;
  }

  setSave(save: string): void {
    this.save = save;
  }

  setTarget(target: string): void {
    this.target = target;
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
      <p class="editor-target-status" id="editor-target-status" title=${this.target}>${this.target}</p>
      <p class="text-xs text-app-text-soft" id="save-status">${this.save}</p>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("editor-status")) {
  customElements.define("editor-status", EditorStatus);
}

declare global {
  interface HTMLElementTagNameMap {
    "editor-status": EditorStatus;
  }
}
