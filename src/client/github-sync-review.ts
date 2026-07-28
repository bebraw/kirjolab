import { html, nothing, type TemplateResult } from "lit";
import { isGitHubPublishPreview, isGitHubPullPreview, type GitHubPublishPreview, type GitHubPullPreview } from "./app-contracts";
import { LightDomElement } from "./light-dom-controller";
import { errorMessage, expectOk, jsonFetch } from "./http";

export interface GitHubPullResolutionSelection {
  readonly conflict: number;
  readonly choice: "local" | "remote";
}

export const gitHubSyncMutationEvent = "github-sync-mutation";

export type GitHubSyncMutation = "disconnect" | "publish" | "pull";

export class GitHubSyncReview extends LightDomElement {
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
  private apiBase = "";

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

  configure(apiBase: string): void {
    this.apiBase = apiBase;
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
    this.reset();
    this.pullStatus = "Pulled the reviewed changes from GitHub.";
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
    this.reset();
    this.publishStatus = `Published commit ${commitSha.slice(0, 10)}.`;
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
          @click=${this.previewPull}
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
          @click=${this.previewPublish}
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
          @click=${this.disconnect}
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

  async previewPull(): Promise<void> {
    this.beginPullPreview();
    try {
      const value = await this.post("pull-previews", {});
      if (!isGitHubPullPreview(value)) throw new Error("GitHub returned an invalid pull preview");
      this.showPullPreview(value);
    } catch (error) {
      this.showPullError(errorMessage(error, "Could not check GitHub."));
    }
  }

  protected async requestPullConfirm(): Promise<void> {
    if (!this.pullPreview) return;
    this.beginPull();
    try {
      await this.post("pulls", { previewId: this.pullPreview.id, resolutions: this.resolutions });
      this.showPullSuccess();
      this.emitMutation("pull");
    } catch (error) {
      this.showPullError(errorMessage(error, "Could not pull from GitHub."));
    }
  }

  async previewPublish(): Promise<void> {
    this.beginPublishPreview();
    try {
      const value = await this.post("publish-previews", { commitMessage: this.commitMessage });
      if (!isGitHubPublishPreview(value)) throw new Error("GitHub returned an invalid publish preview");
      this.showPublishPreview(value);
    } catch (error) {
      this.showPublishError(errorMessage(error, "Could not preview GitHub publish."));
    }
  }

  protected async requestPublishConfirm(): Promise<void> {
    if (!this.publishPreview) return;
    this.beginPublish();
    try {
      const value = await this.post("publishes", { previewId: this.publishPreview.id });
      if (!isRecord(value) || typeof value.commitSha !== "string") throw new Error("GitHub returned an invalid publish result");
      this.showPublishSuccess(value.commitSha);
      this.emitMutation("publish");
    } catch (error) {
      this.showPublishError(errorMessage(error, "Could not publish to GitHub."));
    }
  }

  private async disconnect(): Promise<void> {
    if (!confirm("Disconnect this project from GitHub? Project files and the repository will not be deleted.")) return;
    try {
      await expectOk(await fetch(`${this.apiBase}/github-sync`, { method: "DELETE", credentials: "same-origin" }));
      this.emitMutation("disconnect");
    } catch (error) {
      this.publishStatus = errorMessage(error, "Could not disconnect GitHub.");
    }
  }

  private async post(operation: string, body: object): Promise<unknown> {
    const response = await jsonFetch(`${this.apiBase}/github-sync/${operation}`, body);
    await expectOk(response);
    return response.json();
  }

  private emitMutation(detail: GitHubSyncMutation): void {
    this.dispatchEvent(new CustomEvent<GitHubSyncMutation>(gitHubSyncMutationEvent, { bubbles: true, detail }));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
