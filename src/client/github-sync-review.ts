import { html, LitElement, nothing, type TemplateResult } from "lit";
import type { GitHubPublishPreview, GitHubPullPreview } from "./app-contracts";

export interface GitHubPullResolutionSelection {
  readonly conflict: number;
  readonly choice: "local" | "remote";
}

export const gitHubPullPreviewEvent = "github-pull-preview";
export const gitHubPullConfirmEvent = "github-pull-confirm";
export const gitHubPublishPreviewEvent = "github-publish-preview";
export const gitHubPublishConfirmEvent = "github-publish-confirm";
export const gitHubSyncDisconnectEvent = "github-sync-disconnect";

export class GitHubSyncReview extends LitElement {
  static override properties = {
    connected: { state: true },
    pullPreview: { state: true },
    pullStatus: { state: true },
    pullWorking: { state: true },
    conflictChoices: { state: true },
    publishMessage: { state: true },
    publishPreview: { state: true },
    publishStatus: { state: true },
    publishWorking: { state: true },
  };

  declare private connected: boolean;
  declare private pullPreview: GitHubPullPreview | null;
  declare private pullStatus: string;
  declare private pullWorking: boolean;
  declare private conflictChoices: readonly string[];
  declare private publishMessage: string;
  declare private publishPreview: GitHubPublishPreview | null;
  declare private publishStatus: string;
  declare private publishWorking: boolean;

  constructor() {
    super();
    this.connected = false;
    this.pullPreview = null;
    this.pullStatus = "";
    this.pullWorking = false;
    this.conflictChoices = [];
    this.publishMessage = "Publish from Kirjolab";
    this.publishPreview = null;
    this.publishStatus = "";
    this.publishWorking = false;
  }

  get commitMessage(): string {
    return this.publishMessage;
  }

  get resolutions(): readonly GitHubPullResolutionSelection[] {
    return this.conflictChoices.flatMap((choice, conflict) => (choice === "local" || choice === "remote" ? [{ conflict, choice }] : []));
  }

  get hasActivePreview(): boolean {
    return this.pullPreview !== null || this.publishPreview !== null;
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  reset(): void {
    this.pullPreview = null;
    this.pullStatus = "";
    this.pullWorking = false;
    this.conflictChoices = [];
    this.publishPreview = null;
    this.publishStatus = "";
    this.publishWorking = false;
  }

  beginPullPreview(): void {
    this.pullPreview = null;
    this.pullStatus = "Checking GitHub for changes…";
    this.pullWorking = true;
    this.conflictChoices = [];
  }

  showPullPreview(preview: GitHubPullPreview): void {
    this.pullPreview = preview;
    this.pullStatus = "";
    this.pullWorking = false;
    this.conflictChoices = preview.plan.blocking.map(() => "");
  }

  showPullError(message: string): void {
    this.pullPreview = null;
    this.pullStatus = message;
    this.pullWorking = false;
    this.conflictChoices = [];
  }

  beginPull(): void {
    this.pullWorking = true;
  }

  showPullSuccess(): void {
    this.pullPreview = null;
    this.pullStatus = "Pulled the reviewed changes from GitHub.";
    this.pullWorking = false;
    this.conflictChoices = [];
  }

  beginPublishPreview(): void {
    this.publishPreview = null;
    this.publishStatus = "Comparing Kirjolab with GitHub…";
    this.publishWorking = true;
  }

  showPublishPreview(preview: GitHubPublishPreview): void {
    this.publishPreview = preview;
    this.publishStatus = "";
    this.publishWorking = false;
  }

  showPublishError(message: string): void {
    this.publishPreview = null;
    this.publishStatus = message;
    this.publishWorking = false;
  }

  beginPublish(): void {
    this.publishWorking = true;
  }

  showPublishSuccess(commitSha: string): void {
    this.publishPreview = null;
    this.publishStatus = `Published commit ${commitSha.slice(0, 10)}.`;
    this.publishWorking = false;
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
      <div class="mt-4" id="github-pull-review" aria-live="polite">${this.pullReview()}</div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          class="button-secondary"
          id="preview-github-pull"
          type="button"
          ?disabled=${!this.connected || this.pullWorking}
          @click=${this.requestPullPreview}
        >
          Preview pull
        </button>
        <button
          class="button-primary"
          id="confirm-github-pull"
          type="button"
          ?disabled=${!this.canConfirmPull}
          @click=${this.requestPullConfirm}
        >
          Pull changes
        </button>
      </div>
      <label class="field-label mt-4"
        >Commit message<input
          class="field"
          id="github-publish-message"
          maxlength="900"
          .value=${this.publishMessage}
          ?disabled=${!this.connected || this.publishWorking}
          @input=${this.updatePublishMessage}
      /></label>
      <div class="mt-3" id="github-publish-review" aria-live="polite">${this.publishReview()}</div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button
          class="button-secondary"
          id="preview-github-publish"
          type="button"
          ?disabled=${!this.connected || this.publishWorking}
          @click=${this.requestPublishPreview}
        >
          Preview publish
        </button>
        <button
          class="button-primary"
          id="confirm-github-publish"
          type="button"
          ?disabled=${!this.canConfirmPublish}
          @click=${this.requestPublishConfirm}
        >
          Publish commit
        </button>
        <button
          class="button-secondary"
          id="disconnect-github"
          type="button"
          data-destructive="true"
          ?disabled=${!this.connected}
          @click=${this.requestDisconnect}
        >
          Disconnect
        </button>
      </div>
    `;
  }

  private get canConfirmPull(): boolean {
    if (!this.pullPreview || this.pullWorking) return false;
    const { blocking, changes } = this.pullPreview.plan;
    if (blocking.length === 0) return changes.length > 0;
    return this.conflictChoices.length === blocking.length && this.conflictChoices.every(validConflictChoice);
  }

  private get canConfirmPublish(): boolean {
    return Boolean(
      this.publishPreview &&
      !this.publishWorking &&
      this.publishPreview.plan.blocking.length === 0 &&
      this.publishPreview.plan.changes.length > 0,
    );
  }

  private pullReview(): TemplateResult | string {
    if (this.pullStatus) return this.status(this.pullStatus);
    if (!this.pullPreview) return "";
    return html`
      <p class="text-sm leading-6 text-app-text-soft">${pullSummary(this.pullPreview)}</p>
      ${pullChanges(this.pullPreview)}
      ${this.pullPreview.plan.blocking.length > 0
        ? html`<div class="mt-4 space-y-4">
            ${this.pullPreview.plan.blocking.map((change, conflict) => this.conflict(change, conflict))}
          </div>`
        : nothing}
    `;
  }

  private publishReview(): TemplateResult | string {
    if (this.publishStatus) return this.status(this.publishStatus);
    if (!this.publishPreview) return "";
    return html`
      <p class="text-sm leading-6 text-app-text-soft">${publishSummary(this.publishPreview)}</p>
      ${publishChanges(this.publishPreview)}
    `;
  }

  private conflict(change: GitHubPullPreview["plan"]["blocking"][number], conflict: number): TemplateResult {
    return html`
      <fieldset class="rounded-app border border-app-line p-3">
        <legend class="px-1 font-sans text-xs font-semibold text-app-text">Conflict · ${conflictPath(change)}</legend>
        <div class="mt-2 grid gap-3 md:grid-cols-2">
          ${conflictVersion("Kirjolab", change.local?.content ?? "File deleted in Kirjolab")}
          ${conflictVersion("GitHub", change.remote?.content ?? "File deleted on GitHub")}
        </div>
        <label class="field-label mt-3"
          >Resolution<select
            class="field"
            data-github-conflict=${conflict}
            .value=${this.conflictChoices[conflict] ?? ""}
            @change=${this.updateConflict}
          >
            <option value="">Choose a version…</option>
            <option value="local">Keep Kirjolab</option>
            <option value="remote">Use GitHub</option>
          </select></label
        >
      </fieldset>
    `;
  }

  private status(message: string): TemplateResult {
    return html`<p class="mt-2 text-xs leading-5 text-app-text-soft">${message}</p>`;
  }

  private updateConflict(event: Event): void {
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) return;
    const conflict = Number(select.dataset.githubConflict);
    this.conflictChoices = this.conflictChoices.map((choice, index) => (index === conflict ? select.value : choice));
  }

  private updatePublishMessage(event: Event): void {
    const input = event.currentTarget;
    if (input instanceof HTMLInputElement) this.publishMessage = input.value;
  }

  private requestPullPreview(): void {
    this.beginPullPreview();
    this.dispatchEvent(new CustomEvent(gitHubPullPreviewEvent));
  }

  protected requestPullConfirm(): void {
    if (!this.pullPreview) return;
    this.beginPull();
    this.dispatchEvent(new CustomEvent<string>(gitHubPullConfirmEvent, { detail: this.pullPreview.id }));
  }

  private requestPublishPreview(): void {
    this.beginPublishPreview();
    this.dispatchEvent(new CustomEvent(gitHubPublishPreviewEvent));
  }

  protected requestPublishConfirm(): void {
    if (!this.publishPreview) return;
    this.beginPublish();
    this.dispatchEvent(new CustomEvent<string>(gitHubPublishConfirmEvent, { detail: this.publishPreview.id }));
  }

  private requestDisconnect(): void {
    this.dispatchEvent(new CustomEvent(gitHubSyncDisconnectEvent));
  }
}

function validConflictChoice(value: string): value is "local" | "remote" {
  return value === "local" || value === "remote";
}

function conflictVersion(label: string, content: string): TemplateResult {
  const preview = content.length > 1_000 ? `${content.slice(0, 1_000)}\n…` : content;
  return html`<section>
    <p class="font-sans text-xs font-semibold text-app-text-soft">${label}</p>
    <pre class="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-app bg-app-surface p-2 font-mono text-xs text-app-text">
${preview}</pre
    >
  </section>`;
}

function conflictPath(change: GitHubPullPreview["plan"]["blocking"][number]): string {
  return change.local?.path ?? change.remote?.path ?? change.base?.path ?? "Unknown path";
}

function pullSummary(preview: GitHubPullPreview): string {
  const conflicts = preview.plan.blocking.length;
  if (conflicts > 0) return `${conflicts} conflict${conflicts === 1 ? "" : "s"} need review before pulling.`;
  const changes = preview.plan.changes.length;
  return changes > 0 ? `${changes} incoming change${changes === 1 ? "" : "s"} ready to pull.` : "No tracked Markdown changes to pull.";
}

function pullChanges(preview: GitHubPullPreview): TemplateResult {
  return html`<ul class="mt-2 space-y-1 font-sans text-xs text-app-text-soft">
    ${preview.plan.changes.map((change) => {
      const kind = !change.remote ? "Delete" : change.base ? "Update" : "Add";
      return html`<li>${kind} · ${change.remote?.path ?? change.base?.path ?? "Unknown path"}</li>`;
    })}
  </ul>`;
}

function publishSummary(preview: GitHubPublishPreview): string {
  if (preview.plan.blocking.length > 0)
    return `${preview.plan.blocking.length} remote change or conflict must be pulled or resolved first.`;
  if (preview.plan.changes.length === 0) return "No tracked changes to publish.";
  return `${preview.plan.changes.length} tracked path changes will be committed to ${preview.expectedRemoteHead.slice(0, 10)}.`;
}

function publishChanges(preview: GitHubPublishPreview): TemplateResult {
  return html`<ul class="mt-2 space-y-1 font-sans text-xs text-app-text-soft">
    ${preview.plan.changes.map((change) => html`<li>${change.content === null ? "Delete" : "Update"} · ${change.path}</li>`)}
    ${preview.plan.skippedLocalPaths.length > 0 ? html`<li>Not tracked · ${preview.plan.skippedLocalPaths.join(", ")}</li>` : nothing}
  </ul>`;
}

if (!customElements.get("github-sync-review")) {
  customElements.define("github-sync-review", GitHubSyncReview);
}

declare global {
  interface HTMLElementTagNameMap {
    "github-sync-review": GitHubSyncReview;
  }
}
