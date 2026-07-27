import { html, LitElement, type TemplateResult } from "lit";
import {
  defaultProjectPublicationProfile,
  isWorkspaceSummaries,
  type ProjectPublicationProfile,
  type WorkspaceSnapshot,
  type WorkspaceSummary,
} from "../domain/workspace";
import { GitHubSyncReview } from "./github-sync-review";
import { expectOk, jsonFetch } from "./http";

export interface WorkspaceSettingsValue {
  readonly entryFileId: string;
  readonly publicationProfile: ProjectPublicationProfile;
  readonly title: string;
}

export type GitHubSyncPreview = "pull" | "push";

export interface WorkspaceSettingsView extends WorkspaceSettingsValue {
  readonly archived: boolean;
  readonly files: readonly { readonly id: string; readonly path: string }[];
  readonly templateAllowed: boolean;
}

export interface WorkspaceSettingsSources {
  readonly catalog: readonly WorkspaceSummary[];
  readonly hiddenFileIds: ReadonlySet<string>;
  readonly snapshot: Pick<WorkspaceSnapshot, "entryFileId" | "files" | "publicationProfile"> | null;
  readonly workspaceId: string;
}

export interface WorkspaceSettingsBinding {
  readonly refreshCatalog: () => Promise<void> | void;
  readonly refreshGitHub: () => Promise<void> | void;
  readonly saveTemplate: (projectTitle: string) => Promise<void> | void;
  readonly sources: () => WorkspaceSettingsSources;
}

export class WorkspaceSettingsPanel extends LitElement {
  static override properties = {
    busy: { state: true },
    gitHubStatus: { state: true },
    status: { state: true },
    view: { state: true },
  };

  declare private busy: boolean;
  declare private gitHubStatus: string;
  declare private status: string;
  declare protected view: WorkspaceSettingsView;
  private gitHubApiBase = "";
  private binding: WorkspaceSettingsBinding | undefined;
  private trigger: EventTarget | undefined;
  private triggerBinding: AbortController | undefined;

  constructor() {
    super();
    this.busy = false;
    this.gitHubStatus = "Checking connection…";
    this.status = "";
    this.view = {
      archived: false,
      entryFileId: "",
      files: [],
      publicationProfile: {
        citationStyle: "apa",
        locale: "en-US",
        paperSize: "a4",
        submissionTemplate: "article",
      },
      templateAllowed: true,
      title: "",
    };
  }

  get open(): boolean {
    return this.dialog.open;
  }

  get value(): WorkspaceSettingsValue {
    return {
      entryFileId: this.select("workspace-entry-file").value,
      publicationProfile: {
        citationStyle: this.select("workspace-citation-style").value as ProjectPublicationProfile["citationStyle"],
        locale: this.select("workspace-citation-locale").value as ProjectPublicationProfile["locale"],
        paperSize: this.select("workspace-paper-size").value as ProjectPublicationProfile["paperSize"],
        submissionTemplate: this.select("workspace-submission-template").value as ProjectPublicationProfile["submissionTemplate"],
      },
      title: this.titleInput.value,
    };
  }

  get gitHubReview(): GitHubSyncReview {
    const review = this.querySelector<GitHubSyncReview>("#github-sync-review");
    if (!review) throw new Error("GitHub sync review is unavailable");
    return review;
  }

  get hasActiveGitHubPreview(): boolean {
    return this.gitHubReview.hasActivePreview;
  }

  async show(sources: WorkspaceSettingsSources): Promise<void> {
    this.setView(this.settingsView(sources));
    this.status = "";
    await this.updateComplete;
    if (!this.dialog.open) this.dialog.showModal();
  }

  close(): void {
    this.dialog.close();
  }

  setGitHubStatus(status: string): void {
    this.gitHubStatus = status;
  }

  setGitHubConnection(connected: boolean, status: string): void {
    this.gitHubReview.setConnected(connected);
    this.setGitHubStatus(status);
  }

  resetGitHubReview(): void {
    this.gitHubReview.reset();
  }

  async previewGitHub(operation: GitHubSyncPreview): Promise<void> {
    if (operation === "pull") await this.gitHubReview.previewPull();
    else await this.gitHubReview.previewPublish();
  }

  configureGitHub(apiBase: string): void {
    this.gitHubApiBase = apiBase;
    if (this.hasUpdated) this.gitHubReview.configure(apiBase);
  }

  bindWorkspace(trigger: EventTarget, binding: WorkspaceSettingsBinding): void {
    this.triggerBinding?.abort();
    this.binding = binding;
    this.trigger = trigger;
    this.bindTrigger();
  }

  private bindTrigger(): void {
    if (!this.trigger) return;
    this.triggerBinding = new AbortController();
    this.trigger.addEventListener("click", () => void this.openSettings(), { signal: this.triggerBinding.signal });
  }

  async openSettings(checkGitHub = true): Promise<void> {
    if (!this.binding) return;
    await this.show(this.binding.sources());
    if (checkGitHub) void this.binding.refreshGitHub();
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
    if (this.triggerBinding?.signal.aborted) this.bindTrigger();
  }

  override disconnectedCallback(): void {
    this.triggerBinding?.abort();
    super.disconnectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected setView(view: WorkspaceSettingsView): void {
    this.view = view;
  }

  private settingsView(sources: WorkspaceSettingsSources): WorkspaceSettingsView {
    const current = sources.catalog.find(({ id }) => id === sources.workspaceId);
    return {
      archived: Boolean(current?.archivedAt),
      entryFileId: sources.snapshot?.entryFileId ?? "",
      files: (sources.snapshot?.files ?? []).filter(({ id }) => !sources.hiddenFileIds.has(id)).map(({ id, path }) => ({ id, path })),
      publicationProfile: sources.snapshot?.publicationProfile ?? defaultProjectPublicationProfile,
      templateAllowed: sources.workspaceId !== "demo",
      title: current?.title ?? "",
    };
  }

  protected override firstUpdated(): void {
    this.gitHubReview.configure(this.gitHubApiBase);
  }

  protected override render(): TemplateResult {
    const profile = this.view.publicationProfile;
    return html`
      <dialog class="new-workspace-dialog ui-dialog" id="workspace-settings-dialog">
        <form class="p-5" id="workspace-settings-form" @submit=${this.save}>
          <p class="eyebrow">Project settings</p>
          <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Manage this project</h2>
          <label class="field-label mt-5"
            >Project title<input class="field" id="workspace-settings-title" maxlength="120" required .value=${this.view.title}
          /></label>
          <label class="field-label mt-4"
            >Entry file<select class="field" id="workspace-entry-file" .value=${this.view.entryFileId}>
              ${this.view.files.map((file) => html`<option value=${file.id}>${file.path}</option>`)}
            </select></label
          >
          <p class="mt-2 text-xs leading-5 text-app-text-soft">Preview, statistics, and publication exports compose from this file.</p>
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <label class="field-label"
              >Citation style<select class="field" id="workspace-citation-style" .value=${profile.citationStyle}>
                <option value="apa">APA</option>
                <option value="chicago-author-date">Chicago author-date</option>
                <option value="ieee">IEEE numeric</option>
              </select></label
            >
            <label class="field-label"
              >Citation locale<select class="field" id="workspace-citation-locale" .value=${profile.locale}>
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="fi-FI">Finnish</option>
              </select></label
            >
            <label class="field-label"
              >Submission template<select class="field" id="workspace-submission-template" .value=${profile.submissionTemplate}>
                <option value="article">Standard article</option>
                <option value="preprint">Preprint</option>
                <option value="anonymous-review">Anonymous review</option>
                <option value="journal-two-column">Journal two-column</option>
              </select></label
            >
            <label class="field-label"
              >Paper size<select class="field" id="workspace-paper-size" .value=${profile.paperSize}>
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
              </select></label
            >
          </div>
          <p class="mt-2 text-xs leading-5 text-app-text-soft">
            These settings affect preview and exports without changing the manuscript.
          </p>
          <div class="mt-5 flex flex-wrap gap-2">
            <button class="button-primary" type="submit" ?disabled=${this.busy}>Save title</button>
            <button
              class="button-secondary"
              id="save-workspace-template"
              type="button"
              ?hidden=${!this.view.templateAllowed}
              ?disabled=${this.busy}
              @click=${this.saveTemplate}
            >
              Save as template
            </button>
            <button class="button-secondary" id="duplicate-workspace" type="button" ?disabled=${this.busy} @click=${this.duplicate}>
              Duplicate
            </button>
            <button
              class="button-secondary"
              id="archive-workspace"
              type="button"
              data-destructive="true"
              ?disabled=${this.busy}
              @click=${this.archive}
            >
              ${this.view.archived ? "Restore" : "Archive"}
            </button>
          </div>
          <p class="ui-status mt-3" role="status" aria-live="polite">${this.status}</p>
          <section class="mt-6 border-t border-app-line pt-5">
            <p class="eyebrow">GitHub sync</p>
            <p class="mt-2 text-sm leading-6 text-app-text-soft" id="github-sync-status">${this.gitHubStatus}</p>
            <github-sync-review id="github-sync-review">
              <div class="mt-4" id="github-pull-review" aria-live="polite"></div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button class="button-secondary" id="preview-github-pull" type="button">Preview pull</button>
                <button class="button-primary" id="confirm-github-pull" type="button" disabled>Pull changes</button>
              </div>
              <label class="field-label mt-4"
                >Commit message<input class="field" id="github-publish-message" maxlength="900" value="Publish from Kirjolab"
              /></label>
              <div class="mt-3" id="github-publish-review" aria-live="polite"></div>
              <div class="mt-4 flex flex-wrap gap-2">
                <button class="button-secondary" id="preview-github-publish" type="button">Preview publish</button>
                <button class="button-primary" id="confirm-github-publish" type="button" disabled>Publish commit</button>
                <button class="button-secondary" id="disconnect-github" type="button" data-destructive="true">Disconnect</button>
              </div>
            </github-sync-review>
          </section>
          <section class="mt-6 border-t border-app-line pt-5">
            <p class="eyebrow">Danger zone</p>
            <p class="mt-2 text-sm leading-6 text-app-text-soft">
              Permanent deletion removes project revisions, collaborators, project PDFs, and project links. Private library references
              remain.
            </p>
            <button
              class="button-secondary mt-3"
              id="delete-workspace"
              type="button"
              data-destructive="true"
              ?disabled=${this.busy}
              @click=${this.deleteWorkspace}
            >
              Delete permanently
            </button>
          </section>
          <div class="mt-5 flex justify-end">
            <button class="button-secondary" id="close-workspace-settings" type="button" @click=${this.close}>Close</button>
          </div>
        </form>
      </dialog>
    `;
  }

  protected save(event: SubmitEvent): void {
    event.preventDefault();
    void this.saveSettings();
  }

  protected saveTemplate(): void {
    if (this.busy) return;
    const projectTitle = this.view.title;
    this.close();
    void this.binding?.saveTemplate(projectTitle);
  }

  protected duplicate(): void {
    void this.duplicateProject();
  }

  protected archive(): void {
    void this.toggleArchive();
  }

  protected deleteWorkspace(): void {
    void this.deleteProject();
  }

  protected async saveSettings(): Promise<void> {
    const value = this.value;
    await this.runRequest(async () => {
      await expectOk(
        await jsonFetch(
          `${this.gitHubApiBase}/settings`,
          {
            title: value.title,
            entryFileId: value.entryFileId,
            publicationProfile: value.publicationProfile,
          },
          "PATCH",
        ),
      );
      const next = new URL(location.href);
      next.searchParams.set("file", value.entryFileId);
      location.assign(`${next.pathname}${next.search}${next.hash}`);
    });
  }

  protected async toggleArchive(): Promise<void> {
    await this.runRequest(async () => {
      await expectOk(await jsonFetch(`${this.gitHubApiBase}/settings`, { archived: !this.view.archived }, "PATCH"));
      this.close();
      await this.binding?.refreshCatalog();
    });
  }

  protected async duplicateProject(): Promise<void> {
    const title = prompt("Title for the duplicate", `${this.titleInput.value} copy`)?.trim();
    if (!title) return;
    await this.runRequest(async () => {
      const response = await jsonFetch(`${this.gitHubApiBase}/duplicate`, { title });
      await expectOk(response);
      const values: unknown[] = [await response.json()];
      if (!isWorkspaceSummaries(values) || !values[0]) throw new Error("Project duplicate returned invalid data");
      location.assign(values[0].href);
    });
  }

  protected async deleteProject(): Promise<void> {
    const title = this.titleInput.value;
    const confirmation = prompt(`Type DELETE to permanently remove “${title}” and its project PDFs.`);
    if (confirmation !== "DELETE") return;
    await this.runRequest(async () => {
      await expectOk(await fetch(`${this.gitHubApiBase}/settings`, { method: "DELETE", credentials: "same-origin" }));
      location.assign("/");
    });
  }

  private async runRequest(request: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.status = "";
    try {
      await request();
    } catch (error) {
      this.status = error instanceof Error ? error.message : "Project settings request failed";
    } finally {
      this.busy = false;
    }
  }

  protected get dialog(): HTMLDialogElement {
    const dialog = this.querySelector<HTMLDialogElement>("#workspace-settings-dialog");
    if (!dialog) throw new Error("Workspace settings dialog is unavailable");
    return dialog;
  }

  protected get titleInput(): HTMLInputElement {
    const input = this.querySelector<HTMLInputElement>("#workspace-settings-title");
    if (!input) throw new Error("Workspace settings title is unavailable");
    return input;
  }

  protected select(id: string): HTMLSelectElement {
    const select = this.querySelector<HTMLSelectElement>(`#${id}`);
    if (!select) throw new Error(`Workspace settings select ${id} is unavailable`);
    return select;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("workspace-settings-panel")) {
  customElements.define("workspace-settings-panel", WorkspaceSettingsPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-settings-panel": WorkspaceSettingsPanel;
  }
}
