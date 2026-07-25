import { html, LitElement, type TemplateResult } from "lit";
import { gitHubSyncPresentation, type GitHubSyncStatus } from "./github-sync-status";

export interface GitHubSyncConnectionPresentation {
  readonly owner: string;
  readonly repository: string;
  readonly branch: string;
}

export const gitHubSyncCheckEvent = "github-sync-check";
export const gitHubSyncPullEvent = "github-sync-pull";
export const gitHubSyncPushEvent = "github-sync-push";
export const gitHubSyncSettingsEvent = "github-sync-settings";

export class GitHubSyncMenu extends LitElement {
  static override properties = {
    connected: { state: true },
    label: { state: true },
    repository: { state: true },
    detail: { state: true },
    tone: { state: true },
    canPull: { state: true },
    canPush: { state: true },
  };

  declare private connected: boolean;
  declare private label: string;
  declare private repository: string;
  declare private detail: string;
  declare private tone: "quiet" | "attention" | "warning";
  declare private canPull: boolean;
  declare private canPush: boolean;

  constructor() {
    super();
    this.connected = false;
    this.label = "GitHub · Checking";
    this.repository = "GitHub project";
    this.detail = "Checking the configured branch…";
    this.tone = "quiet";
    this.canPull = false;
    this.canPush = false;
  }

  setConnection(connection: GitHubSyncConnectionPresentation | null): void {
    this.connected = connection !== null;
    if (!connection) return;
    this.label = "GitHub · Checking";
    this.repository = `${connection.owner}/${connection.repository} · ${connection.branch}`;
    this.detail = "Reading the configured branch…";
    this.tone = "quiet";
    this.canPull = false;
    this.canPush = false;
  }

  setError(message: string): void {
    if (!this.connected) return;
    this.label = "GitHub · Check failed";
    this.detail = message;
    this.tone = "warning";
  }

  setStatus(status: GitHubSyncStatus): string {
    const presentation = gitHubSyncPresentation(status);
    const root = status.rootPath ? ` · ${status.rootPath}/` : "";
    this.label = presentation.label;
    this.repository = `${status.owner}/${status.repository} · ${status.branch}${root}`;
    this.detail = presentation.detail;
    this.tone = presentation.tone;
    this.canPull = presentation.canPull;
    this.canPush = presentation.canPush;
    return `${this.repository} · ${this.detail}`;
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
      <details class="action-menu github-sync-menu ui-menu" id="github-sync-menu" data-action-menu ?hidden=${!this.connected}>
        <summary class="github-sync-trigger" id="github-sync-trigger" aria-label="GitHub synchronization status" data-tone=${this.tone}>
          <span class="github-sync-dot" aria-hidden="true"></span>
          <span id="github-sync-label">${this.label}</span>
        </summary>
        <div class="editor-command-menu github-sync-panel ui-menu-panel" aria-label="GitHub synchronization">
          <div class="github-sync-overview">
            <strong id="github-sync-repository">${this.repository}</strong>
            <span id="github-sync-detail">${this.detail}</span>
          </div>
          <button type="button" @click=${this.requestCheck}><strong>Check now</strong><span>Read-only</span></button>
          <button id="github-sync-pull" type="button" ?disabled=${!this.canPull} @click=${this.requestPull}>
            <strong>Pull from GitHub</strong><span>Preview first</span>
          </button>
          <button id="github-sync-push" type="button" ?disabled=${!this.canPush} @click=${this.requestPush}>
            <strong>Push to GitHub</strong><span>Preview first</span>
          </button>
          <button type="button" @click=${this.requestSettings}><strong>Sync settings</strong><span>Details</span></button>
        </div>
      </details>
    `;
  }

  private requestCheck(): void {
    this.dispatchEvent(new CustomEvent(gitHubSyncCheckEvent));
  }

  private requestPull(): void {
    this.dispatchEvent(new CustomEvent(gitHubSyncPullEvent));
  }

  private requestPush(): void {
    this.dispatchEvent(new CustomEvent(gitHubSyncPushEvent));
  }

  private requestSettings(): void {
    this.dispatchEvent(new CustomEvent(gitHubSyncSettingsEvent));
  }
}

if (!customElements.get("github-sync-menu")) {
  customElements.define("github-sync-menu", GitHubSyncMenu);
}

declare global {
  interface HTMLElementTagNameMap {
    "github-sync-menu": GitHubSyncMenu;
  }
}
