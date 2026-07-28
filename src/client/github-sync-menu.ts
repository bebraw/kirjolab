import { html, LitElement, type TemplateResult } from "lit";
import { isGitHubSyncState } from "./app-contracts";
import { gitHubSyncPresentation, isGitHubSyncStatus, type GitHubSyncStatus } from "./github-sync-status";
import { gitHubSyncMutationEvent, type GitHubSyncMutation } from "./github-sync-review";
import { expectOk } from "./http";
import type { WorkspaceSettingsPanel } from "./workspace-settings-panel";

export interface GitHubSyncConnectionPresentation {
  readonly owner: string;
  readonly repository: string;
  readonly branch: string;
}

const gitHubSyncCheckEvent = "github-sync-check";
export const gitHubSyncPullEvent = "github-sync-pull";
export const gitHubSyncPushEvent = "github-sync-push";
export const gitHubSyncSettingsEvent = "github-sync-settings";
export const gitHubSyncStateEvent = "github-sync-state";

export interface GitHubSyncStateDetail {
  readonly connected: boolean;
  readonly message: string;
}

export interface GitHubSyncWorkspaceBinding {
  readonly ambientRefresh?: boolean;
  readonly settings: WorkspaceSettingsPanel;
  readonly refreshProject: () => Promise<void>;
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
  private workspace: GitHubSyncWorkspaceBinding | null = null;

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

  bindWorkspace(apiBase: string, workspace: GitHubSyncWorkspaceBinding): void {
    this.configure(apiBase);
    workspace.settings.configureGitHub(apiBase);
    this.workspace = workspace;
    workspace.settings.addEventListener(gitHubSyncMutationEvent, (event) => {
      void this.handleMutation((event as CustomEvent<GitHubSyncMutation>).detail);
    });
    this.addEventListener(gitHubSyncCheckEvent, () => void this.refreshWorkspace(true));
    this.addEventListener(gitHubSyncStateEvent, (event) => {
      const { connected, message } = (event as CustomEvent<GitHubSyncStateDetail>).detail;
      workspace.settings.setGitHubConnection(connected, message);
    });
    this.addEventListener(gitHubSyncPullEvent, () => void this.openPreview("pull"));
    this.addEventListener(gitHubSyncPushEvent, () => void this.openPreview("push"));
    this.addEventListener(gitHubSyncSettingsEvent, () => void workspace.settings.openSettings());
    if (workspace.ambientRefresh) this.bindAmbientRefresh();
  }

  async refreshWorkspace(force = false, resetReview = true): Promise<void> {
    if (!navigator.onLine || !this.workspace) return;
    if (!force && (this.workspace.settings.hasActiveGitHubPreview || this.workspace.settings.open)) return;
    if (!this.refreshDue(force)) return;
    if (resetReview) this.workspace.settings.resetGitHubReview();
    await this.refresh();
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

  override disconnectedCallback(): void {
    this.unbindAmbientRefresh();
    super.disconnectedCallback();
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

  private async openPreview(operation: "pull" | "push"): Promise<void> {
    if (!this.workspace) return;
    await this.workspace.settings.openSettings(false);
    await this.workspace.settings.previewGitHub(operation);
  }

  private async handleMutation(mutation: GitHubSyncMutation): Promise<void> {
    if (!this.workspace) return;
    if (mutation === "pull") await this.workspace.refreshProject();
    await this.refreshWorkspace(true, false);
  }

  private bindAmbientRefresh(): void {
    this.unbindAmbientRefresh();
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("focus", this.handleFocus);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  private unbindAmbientRefresh(): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("focus", this.handleFocus);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
  }

  private readonly handleOnline = (): void => void this.refreshWorkspace(true);
  private readonly handleFocus = (): void => void this.refreshWorkspace();
  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible") void this.refreshWorkspace();
  };

  private emitState(message: string): void {
    this.dispatchEvent(
      new CustomEvent<GitHubSyncStateDetail>(gitHubSyncStateEvent, {
        detail: { connected: this.connected, message },
      }),
    );
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
