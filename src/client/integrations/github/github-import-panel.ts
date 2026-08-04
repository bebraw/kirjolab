import { html, type TemplateResult } from "lit";
import { LightDomElement } from "../../platform/light-dom-controller";
import {
  type AppCapabilities,
  isGitHubBranchList,
  isGitHubConnectionState,
  isGitHubImportPreview,
  isGitHubImportResult,
  isGitHubInstallationList,
  isGitHubRepositoryList,
  type GitHubBranchOption,
  type GitHubImportPreview,
  type GitHubInstallationOption,
  type GitHubRepositoryOption,
} from "../../app/app-contracts";
import { formatBytes } from "../../platform/format";
import { errorMessage, expectOk } from "../../platform/http";

export interface GitHubImportSelection {
  readonly installationId: number | null;
  readonly repository: GitHubRepositoryOption | null;
  readonly branch: string;
  readonly rootPath: string;
  readonly entryPath: string;
}

export interface GitHubConnectionPresentation {
  readonly connected: boolean;
  readonly message: string;
}

export class GitHubImportPanel extends LightDomElement {
  static override properties = {
    projectTitleValue: { state: true },
    installations: { state: true },
    installationId: { state: true },
    installationPlaceholder: { state: true },
    repositories: { state: true },
    repositoryId: { state: true },
    repositoryPlaceholder: { state: true },
    branches: { state: true },
    branch: { state: true },
    branchPlaceholder: { state: true },
    rootPath: { state: true },
    entryPath: { state: true },
    preview: { state: true },
    status: { state: true },
    working: { state: true },
    canConfirm: { state: true },
    connected: { state: true },
    connectionMessage: { state: true },
    available: { state: true },
  };

  declare private projectTitleValue: string;
  declare private installations: readonly GitHubInstallationOption[];
  declare private installationId: string;
  declare private installationPlaceholder: string;
  declare private repositories: readonly GitHubRepositoryOption[];
  declare private repositoryId: string;
  declare private repositoryPlaceholder: string;
  declare private branches: readonly GitHubBranchOption[];
  declare private branch: string;
  declare private branchPlaceholder: string;
  declare private rootPath: string;
  declare private entryPath: string;
  declare private preview: GitHubImportPreview | null;
  declare private status: string;
  declare private working: boolean;
  declare private canConfirm: boolean;
  declare private connected: boolean;
  declare private connectionMessage: string;
  declare private available: boolean;
  private pickerRequest = 0;
  private browserResultInitialized = false;
  private capabilityConfigured = false;
  private lifecycleConnected = false;

  constructor() {
    super();
    this.projectTitleValue = "";
    this.installations = [];
    this.installationId = "";
    this.installationPlaceholder = "Connect GitHub first";
    this.repositories = [];
    this.repositoryId = "";
    this.repositoryPlaceholder = "Choose an account";
    this.branches = [];
    this.branch = "";
    this.branchPlaceholder = "Choose a repository";
    this.rootPath = "";
    this.entryPath = "";
    this.preview = null;
    this.status = "";
    this.working = false;
    this.canConfirm = false;
    this.connected = false;
    this.connectionMessage = "Checking connection…";
    this.available = false;
  }

  configure(capabilities: AppCapabilities): void {
    this.capabilityConfigured = true;
    this.available = capabilities.github;
    if (!this.available) {
      this.pickerRequest += 1;
      this.resetPreview();
    }
    this.initializeBrowserResult();
  }

  get selection(): GitHubImportSelection {
    return {
      installationId: this.installationId ? Number(this.installationId) : null,
      repository: this.repositories.find((repository) => String(repository.id) === this.repositoryId) ?? null,
      branch: this.branch,
      rootPath: this.rootPath,
      entryPath: this.entryPath.trim(),
    };
  }

  get projectTitle(): string {
    return this.projectTitleValue;
  }

  open(): void {
    if (!this.available) return;
    this.resetPreview();
    this.dialog.showModal();
    this.focusTitle();
    void this.refreshConnection();
  }

  openFromBrowserResult(
    url = new URL(location.href),
    replace = (path: string): void => history.replaceState(history.state, "", path),
  ): boolean {
    const result = url.searchParams.get("github");
    if (!this.available || (result !== "connected" && result !== "installed")) return false;
    this.open();
    replace(url.pathname);
    return true;
  }

  close(): void {
    this.dialog.close();
  }

  resetPreview(): void {
    this.preview = null;
    this.status = "";
    this.working = false;
    this.canConfirm = false;
  }

  focusTitle(): void {
    void this.updateComplete.then(() => this.querySelector<HTMLInputElement>("#github-import-title")?.focus());
  }

  async refreshConnection(): Promise<void> {
    if (!this.available) return;
    const requestId = ++this.pickerRequest;
    this.resetPreview();
    this.beginConnectionRefresh();
    try {
      const value = await requestGitHubJson(
        "/api/github/connection",
        isGitHubConnectionState,
        "GitHub returned an invalid connection state",
      );
      if (requestId !== this.pickerRequest) return;
      this.setConnection({
        connected: value.connected,
        message: value.connected
          ? `Connected as @${value.user.login}. Repository access remains controlled on GitHub.`
          : "Connect GitHub to choose repositories available to your account.",
      });
      if (value.connected) await this.loadInstallations(requestId);
      else this.resetDisconnected();
    } catch (error) {
      if (requestId === this.pickerRequest) {
        this.setConnectionMessage(error instanceof Error ? error.message : "Could not load the GitHub connection.");
      }
    }
  }

  private async loadInstallations(requestId: number): Promise<void> {
    this.setInstallationsLoading();
    const value = await requestGitHubJson(
      "/api/github/installations",
      isGitHubInstallationList,
      "GitHub returned an invalid installation list",
    );
    if (requestId !== this.pickerRequest) return;
    this.setInstallations(value.installations);
    if (value.installations.length === 0) {
      this.setConnectionMessage("Connected. Install the Kirjolab GitHub App or grant it repository access.");
      this.resetRepositoryPickers();
      return;
    }
    await this.loadRepositories(requestId);
  }

  private async loadRepositories(parentRequestId?: number): Promise<void> {
    const requestId = parentRequestId ?? ++this.pickerRequest;
    if (requestId !== this.pickerRequest) return;
    const installationId = this.selection.installationId;
    if (installationId === null) return;
    this.setRepositoriesLoading();
    const value = await requestGitHubJson(
      `/api/github/installations/${installationId}/repositories`,
      isGitHubRepositoryList,
      "GitHub returned an invalid repository list",
    );
    if (requestId !== this.pickerRequest) return;
    const repositories = [...value.repositories].sort((left, right) => left.fullName.localeCompare(right.fullName));
    this.setRepositories(repositories);
    if (repositories.length > 0) await this.loadBranches(requestId);
  }

  private async loadBranches(parentRequestId?: number): Promise<void> {
    const requestId = parentRequestId ?? ++this.pickerRequest;
    if (requestId !== this.pickerRequest) return;
    const selection = this.selection;
    const repositoryId = selection.repository?.id ?? null;
    if (selection.installationId === null || repositoryId === null) return;
    this.setBranchesLoading();
    const value = await requestGitHubJson(
      `/api/github/installations/${selection.installationId}/repositories/${repositoryId}/branches`,
      isGitHubBranchList,
      "GitHub returned an invalid branch list",
    );
    if (requestId === this.pickerRequest) this.setBranches(value.branches, value.repository.defaultBranch);
  }

  private reportPickerError(error: unknown): void {
    this.setConnectionMessage(error instanceof Error ? error.message : "Could not load GitHub repositories.");
  }

  beginConnectionRefresh(): void {
    this.installations = [];
    this.installationId = "";
    this.installationPlaceholder = "Checking connection…";
    this.resetRepositoryPickers();
  }

  setConnection(presentation: GitHubConnectionPresentation): void {
    this.connected = presentation.connected;
    this.connectionMessage = presentation.message;
  }

  setConnectionMessage(message: string): void {
    this.connectionMessage = message;
  }

  setInstallationsLoading(): void {
    this.installations = [];
    this.installationId = "";
    this.installationPlaceholder = "Loading accounts…";
    this.resetRepositoryPickers();
  }

  setInstallations(installations: readonly GitHubInstallationOption[]): void {
    this.installations = installations;
    this.installationId = installations[0] ? String(installations[0].id) : "";
    this.installationPlaceholder = installations.length === 0 ? "No installations available" : "";
  }

  setRepositoriesLoading(): void {
    this.repositories = [];
    this.repositoryId = "";
    this.repositoryPlaceholder = "Loading repositories…";
    this.setBranchesLoading("Choose a repository");
  }

  setRepositories(repositories: readonly GitHubRepositoryOption[]): void {
    this.repositories = repositories;
    this.repositoryId = repositories[0] ? String(repositories[0].id) : "";
    this.repositoryPlaceholder = repositories.length === 0 ? "No repositories available" : "";
    if (!this.projectTitleValue.trim() && repositories[0]) this.projectTitleValue = repositories[0].name;
  }

  setBranchesLoading(placeholder = "Loading branches…"): void {
    this.branches = [];
    this.branch = "";
    this.branchPlaceholder = placeholder;
  }

  setBranches(branches: readonly GitHubBranchOption[], defaultBranch: string): void {
    this.branches = branches;
    this.branch = branches.some((branch) => branch.name === defaultBranch) ? defaultBranch : (branches[0]?.name ?? "");
    this.branchPlaceholder = branches.length === 0 ? "No branches available" : "";
  }

  resetDisconnected(): void {
    this.installations = [];
    this.installationId = "";
    this.installationPlaceholder = "Connect GitHub first";
    this.resetRepositoryPickers();
  }

  resetRepositoryPickers(): void {
    this.repositories = [];
    this.repositoryId = "";
    this.repositoryPlaceholder = "Choose an account";
    this.setBranchesLoading("Choose a repository");
  }

  beginPreview(): void {
    this.preview = null;
    this.status = "Reading the selected commit…";
    this.working = true;
    this.canConfirm = false;
  }

  showPreview(preview: GitHubImportPreview): void {
    this.preview = preview;
    this.status = `${preview.commitSha.slice(0, 10)} previewed. Confirm to create the project.`;
    this.working = false;
    this.canConfirm = true;
  }

  showPreviewError(message: string): void {
    this.status = message;
    this.working = false;
  }

  beginCreation(): void {
    this.status = "Creating the project…";
    this.working = true;
    this.canConfirm = false;
  }

  showCreationError(message: string): void {
    this.status = message;
    this.working = false;
    this.canConfirm = true;
  }

  override connectedCallback(): void {
    this.lifecycleConnected = true;
    super.connectedCallback();
    this.initializeBrowserResult();
  }

  override disconnectedCallback(): void {
    this.lifecycleConnected = false;
    super.disconnectedCallback();
  }

  protected override render(): TemplateResult {
    if (!this.available) return html``;
    const ready = Boolean(this.installationId && this.repositoryId && this.branch);
    return html`
      <section class="mt-5 border-y border-app-line py-4" aria-labelledby="github-connection-heading">
        <p class="field-label" id="github-connection-heading">GitHub account</p>
        <p class="mt-1 text-sm leading-6 text-app-text-soft" id="github-connection-status" aria-live="polite">${this.connectionMessage}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <a class="button-primary" href="/api/github/connect?returnTo=%2F%3FgithubImport%3D1" ?hidden=${this.connected}>Connect GitHub</a>
          <a class="button-secondary" href="/api/github/install?returnTo=%2F%3FgithubImport%3D1" ?hidden=${!this.connected}
            >Manage repository access</a
          >
          <button class="button-secondary" type="button" ?hidden=${!this.connected} @click=${this.disconnect}>Disconnect account</button>
        </div>
      </section>
      <form id="github-import-form" @submit=${this.previewImport}>
        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <label class="field-label"
            >Project title<input
              class="field"
              id="github-import-title"
              maxlength="120"
              required
              placeholder="Scalability book"
              .value=${this.projectTitleValue}
              @input=${this.updateTitle}
          /></label>
          <label class="field-label"
            >Account<select
              class="field"
              id="github-installation-id"
              required
              ?disabled=${this.installations.length === 0}
              .value=${this.installationId}
              @change=${this.updateInstallation}
            >
              ${
                this.installations.length === 0
                  ? html`<option value="">${this.installationPlaceholder}</option>`
                  : this.installations.map(
                      (installation) =>
                        html`<option value=${String(installation.id)}>
                          ${installation.accountLogin} · ${installation.accountType === "Organization" ? "organization" : "personal"}
                        </option>`,
                    )
              }
            </select></label
          >
          <label class="field-label"
            >Repository<select
              class="field"
              id="github-repository"
              required
              ?disabled=${this.repositories.length === 0}
              .value=${this.repositoryId}
              @change=${this.updateRepository}
            >
              ${
                this.repositories.length === 0
                  ? html`<option value="">${this.repositoryPlaceholder}</option>`
                  : this.repositories.map(
                      (repository) =>
                        html`<option value=${String(repository.id)}>
                          ${repository.fullName}${repository.private ? " · private" : ""}
                        </option>`,
                    )
              }
            </select></label
          >
          <label class="field-label"
            >Branch<select
              class="field"
              id="github-branch"
              required
              ?disabled=${this.branches.length === 0}
              .value=${this.branch}
              @change=${this.updateBranch}
            >
              ${
                this.branches.length === 0
                  ? html`<option value="">${this.branchPlaceholder}</option>`
                  : this.branches.map(
                      (branch) => html`<option value=${branch.name}>${branch.name}${branch.protected ? " · protected" : ""}</option>`,
                    )
              }
            </select></label
          >
          <label class="field-label"
            >Folder<input class="field" id="github-root-path" placeholder="book" .value=${this.rootPath} @input=${this.updateRootPath}
          /></label>
          <label class="field-label sm:col-span-2"
            >Entry file <span class="font-normal normal-case text-app-text-soft">(optional)</span
            ><input class="field" id="github-entry-path" placeholder="main.md" .value=${this.entryPath} @input=${this.updateEntryPath}
          /></label>
        </div>
        <div class="mt-5 border-t border-app-line pt-4" id="github-import-preview" aria-live="polite">
          ${
            this.preview
              ? html`
                  <p class="text-sm font-semibold text-app-text">
                    ${this.preview.files.length} Markdown files · entry ${this.preview.entryPath}
                  </p>
                  <ul class="mt-3 space-y-1 font-sans text-xs text-app-text-soft">
                    ${this.preview.files.slice(0, 12).map((file) => html`<li>${file.path} · ${formatBytes(file.bytes)}</li>`)}
                    ${this.preview.files.length > 12 ? html`<li>…and ${this.preview.files.length - 12} more</li>` : null}
                  </ul>
                `
              : html`<p class="ui-status">Preview to inspect the selected files and resolved entry.</p>`
          }
        </div>
        <p class="ui-status mt-3" id="github-import-status" role="status">${this.status}</p>
        <div class="mt-5 flex justify-end gap-2">
          <button class="button-secondary" type="button" @click=${this.requestCancel}>Cancel</button>
          <button class="button-secondary" id="preview-github-import" type="submit" ?disabled=${!ready || this.working}>
            Preview import
          </button>
          <button class="button-primary" type="button" ?disabled=${!this.canConfirm || this.working} @click=${this.confirmImport}>
            Create project
          </button>
        </div>
      </form>
    `;
  }

  private updateTitle(event: Event): void {
    if (event.currentTarget instanceof HTMLInputElement) this.projectTitleValue = event.currentTarget.value;
  }

  private updateInstallation(event: Event): void {
    if (!(event.currentTarget instanceof HTMLSelectElement)) return;
    this.installationId = event.currentTarget.value;
    void this.loadRepositories().catch((error: unknown) => this.reportPickerError(error));
  }

  private updateRepository(event: Event): void {
    if (!(event.currentTarget instanceof HTMLSelectElement)) return;
    this.repositoryId = event.currentTarget.value;
    void this.loadBranches().catch((error: unknown) => this.reportPickerError(error));
  }

  private updateBranch(event: Event): void {
    if (event.currentTarget instanceof HTMLSelectElement) this.branch = event.currentTarget.value;
  }

  private updateRootPath(event: Event): void {
    if (event.currentTarget instanceof HTMLInputElement) this.rootPath = event.currentTarget.value;
  }

  private updateEntryPath(event: Event): void {
    if (event.currentTarget instanceof HTMLInputElement) this.entryPath = event.currentTarget.value;
  }

  protected requestCancel(): void {
    this.close();
  }

  protected async previewImport(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!this.available) return;
    this.beginPreview();
    try {
      const selection = this.selection;
      const repository = selection.repository;
      if (selection.installationId === null) throw new Error("Choose a GitHub account");
      if (!repository) throw new Error("Choose a GitHub repository");
      const value = await requestGitHubJson(
        "/api/github/import-previews",
        isGitHubImportPreview,
        "GitHub returned an invalid import preview",
        jsonRequest({
          installationId: selection.installationId,
          owner: repository.owner,
          repository: repository.name,
          branch: selection.branch,
          rootPath: selection.rootPath,
          ...(selection.entryPath ? { entryPath: selection.entryPath } : {}),
        }),
      );
      this.showPreview(value);
    } catch (error) {
      this.showPreviewError(errorMessage(error, "Could not preview GitHub import."));
    }
  }

  protected async confirmImport(): Promise<void> {
    if (!this.available || !this.preview) return;
    this.beginCreation();
    try {
      const value = await requestGitHubJson(
        "/api/github/imports",
        isGitHubImportResult,
        "GitHub import returned invalid project data",
        jsonRequest({ previewId: this.preview.id, title: this.projectTitle }),
      );
      location.assign(value.workspace.href);
    } catch (error) {
      this.showCreationError(errorMessage(error, "Could not import the project."));
    }
  }

  protected async disconnect(): Promise<void> {
    if (!this.available) return;
    if (!confirm("Disconnect your GitHub account from Kirjolab? Existing project files and repositories will not be deleted.")) return;
    try {
      await expectOk(await fetch("/api/github/connection", { method: "DELETE", credentials: "same-origin" }));
      await this.refreshConnection();
    } catch (error) {
      this.setConnectionMessage(errorMessage(error, "Could not disconnect GitHub."));
    }
  }

  private get dialog(): HTMLDialogElement {
    const dialog = this.closest("dialog");
    if (!(dialog instanceof HTMLDialogElement)) throw new Error("GitHub import panel requires a dialog parent");
    return dialog;
  }

  private initializeBrowserResult(): void {
    if (this.browserResultInitialized || !this.lifecycleConnected || !this.capabilityConfigured || !this.available) return;
    this.browserResultInitialized = true;
    void this.updateComplete.then(() => this.openFromBrowserResult());
  }
}

type ValueGuard<T> = (value: unknown) => value is T;

async function requestGitHubJson<T>(url: string, guard: ValueGuard<T>, invalidMessage: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  await expectOk(response);
  const value: unknown = await response.json();
  if (!guard(value)) throw new Error(invalidMessage);
  return value;
}

function jsonRequest(body: object): RequestInit {
  return { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" };
}

if (!customElements.get("github-import-panel")) {
  customElements.define("github-import-panel", GitHubImportPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "github-import-panel": GitHubImportPanel;
  }
}
