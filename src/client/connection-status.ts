import { html, LitElement, type TemplateResult } from "lit";

export class ConnectionStatus extends LitElement {
  static override properties = {
    connected: { state: true },
    label: { state: true },
  };

  declare private connected: boolean;
  declare private label: string;

  constructor() {
    super();
    this.connected = false;
    this.label = "Connecting";
  }

  setConnection(label: string, connected: boolean): void {
    this.label = label;
    this.connected = connected;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const tone = this.connected ? "bg-app-accent" : "bg-app-warn";
    return html`
      <span class="h-2 w-2 rounded-full ${tone}" id="connection-dot"></span>
      <span id="connection-status">${this.label}</span>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("connection-status-panel")) {
  customElements.define("connection-status-panel", ConnectionStatus);
}

declare global {
  interface HTMLElementTagNameMap {
    "connection-status-panel": ConnectionStatus;
  }
}
