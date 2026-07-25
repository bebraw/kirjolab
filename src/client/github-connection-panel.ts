import { html, LitElement, type TemplateResult } from "lit";

export interface GitHubConnectionPresentation {
  readonly connected: boolean;
  readonly message: string;
}

export const gitHubDisconnectEvent = "github-disconnect";

export class GitHubConnectionPanel extends LitElement {
  static override properties = {
    connected: { state: true },
    message: { state: true },
  };

  declare private connected: boolean;
  declare private message: string;

  constructor() {
    super();
    this.connected = false;
    this.message = "Checking connection…";
  }

  setConnection(presentation: GitHubConnectionPresentation): void {
    this.connected = presentation.connected;
    this.message = presentation.message;
  }

  setMessage(message: string): void {
    this.message = message;
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
      <section class="mt-5 border-y border-app-line py-4" aria-labelledby="github-connection-heading">
        <p class="field-label" id="github-connection-heading">GitHub account</p>
        <p class="mt-1 text-sm leading-6 text-app-text-soft" id="github-connection-status" aria-live="polite">${this.message}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a class="button-primary" href="/api/github/connect?returnTo=%2F%3FgithubImport%3D1" ?hidden=${this.connected}>Connect GitHub</a>
          <a class="button-secondary" href="/api/github/install?returnTo=%2F%3FgithubImport%3D1" ?hidden=${!this.connected}
            >Manage repository access</a
          >
          <button class="button-secondary" type="button" ?hidden=${!this.connected} @click=${this.requestDisconnect}>
            Disconnect account
          </button>
        </div>
      </section>
    `;
  }

  private requestDisconnect(): void {
    this.dispatchEvent(new CustomEvent(gitHubDisconnectEvent));
  }
}

if (!customElements.get("github-connection-panel")) {
  customElements.define("github-connection-panel", GitHubConnectionPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "github-connection-panel": GitHubConnectionPanel;
  }
}
