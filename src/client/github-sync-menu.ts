import { html, LitElement, type TemplateResult } from "lit";
import { isGitHubSyncState } from "./app-contracts";
import { gitHubSyncPresentation, isGitHubSyncStatus, type GitHubSyncStatus } from "./github-sync-status";

export interface GitHubSyncConnectionPresentation {
  readonly owner: string;
  readonly repository: string;
  readonly branch: string;
}

export const gitHubSyncCheckEvent = "github-sync-check";
export const gitHubSyncPullEvent = "github-sync-pull";
export const gitHubSyncPushEvent = "github-sync-push";
export const gitHubSyncSettingsEvent = "github-sync-settings";
export const gitHubSyncStateEvent = "github-sync-state";

export interface GitHubSyncStateDetail {
  readonly connected: boolean;
  readonly message: string;
}

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
  private apiBase = "";
  private refreshRequest = 0;
  private refreshedAt = 0;

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

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  refreshDue(force = false): boolean {
    return force || Date.now() - this.refreshedAt >= 60_000;
  }

  async refresh(): Promise<void> {
    const requestId = ++this.refreshRequest;
    this.refreshedAt = Date.now();
    try {
      const connectionResponse = await fetch(`${this.apiBase}/github-sync`, { credentials: "same-origin" });
      await expectOk(connectionResponse);
      const value: unknown = await connectionResponse.json();
      const connection = isGitHubSyncState(value) ? value : null;
      if (requestId !== this.refreshRequest) return;
      this.setConnection(connection);
      if (!connection) {
        this.emitState("This project is not connected to GitHub.");
        return;
      }
      const statusResponse = await fetch(`${this.apiBase}/github-sync/status`, { credentials: "same-origin" });
      await expectOk(statusResponse);
      const statusValue: unknown = await statusResponse.json();
      if (!isGitHubSyncStatus(statusValue)) throw new Error("GitHub returned an invalid synchronization status");
      if (requestId === this.refreshRequest) this.emitState(this.setStatus(statusValue));
    } catch (error) {
      if (requestId !== this.refreshRequest) return;
      const message = error instanceof Error ? error.message : "Could not load GitHub sync state.";
      this.setError(message);
      this.emitState(message);
    }
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

  private emitState(message: string): void {
    this.dispatchEvent(
      new CustomEvent<GitHubSyncStateDetail>(gitHubSyncStateEvent, {
        detail: { connected: this.connected, message },
      }),
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function expectOk(response: Response): Promise<void> {
  if (response.ok) return;
  const value: unknown = await response.json().catch(() => null);
  throw new Error(isRecord(value) && typeof value.error === "string" ? value.error : `Request failed (${response.status})`);
}

if (!customElements.get("github-sync-menu")) {
  customElements.define("github-sync-menu", GitHubSyncMenu);
}

declare global {
  interface HTMLElementTagNameMap {
    "github-sync-menu": GitHubSyncMenu;
  }
}
