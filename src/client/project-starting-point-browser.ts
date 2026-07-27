import { html, LitElement, nothing, type TemplateResult } from "lit";
import { isProjectTemplateSummaries, type ProjectTemplateSummary } from "../domain/project-templates";
import { demoWorkspaceId, isWorkspaceSummaries, type WorkspaceSummary } from "../domain/workspace";
import { DeferredDeletionController, type DeferredDeletionNoticeOptions } from "./deferred-deletion";
import { formatCalendarDate } from "./format";
import { errorMessage, expectOk, jsonFetch } from "./http";

export type StartingPointAction = "import-github" | "import-latex";

interface StartingPointBinding {
  readonly openImport: (action: StartingPointAction) => void;
  readonly presentNotice: (message: string, options?: DeferredDeletionNoticeOptions) => void;
  readonly templatesChanged: () => void;
}

export class ProjectStartingPointBrowser extends LitElement {
  static override properties = {
    busy: { state: true },
    templates: { state: true },
    workspaces: { state: true },
    hiddenTemplateIds: { state: true },
    selectedKey: { state: true },
    previewKey: { state: true },
    sourceTemplates: { state: true },
    status: { state: true },
    projectTitle: { state: true },
  };

  declare private busy: boolean;
  declare private templates: readonly ProjectTemplateSummary[];
  declare private workspaces: readonly WorkspaceSummary[];
  declare private hiddenTemplateIds: ReadonlySet<string>;
  declare private selectedKey: string;
  declare private previewKey: string;
  declare private sourceTemplates: ReadonlyMap<string, ProjectTemplateSummary>;
  declare private status: string;
  declare private projectTitle: string;
  private parentDialog: HTMLDialogElement | null = null;
  private returnFocus: HTMLElement | null = null;
  private trigger: HTMLElement | null = null;
  private loadStartingPoints: () => Promise<void> = async () => undefined;
  private workspaceSource: () => readonly WorkspaceSummary[] = () => this.workspaces;
  private binding: StartingPointBinding = {
    openImport: () => undefined,
    presentNotice: () => undefined,
    templatesChanged: () => undefined,
  };
  private readonly deletions = new DeferredDeletionController((message, options) => {
    const settled = this.isConnected ? this.updateComplete : Promise.resolve();
    void settled.then(() => this.binding.presentNotice(message, options));
  });

  constructor() {
    super();
    this.busy = false;
    this.templates = [];
    this.workspaces = [];
    this.hiddenTemplateIds = new Set();
    this.selectedKey = "";
    this.previewKey = "builtin-guided";
    this.sourceTemplates = new Map();
    this.status = "Templates and existing projects create independent projects without research history.";
    this.projectTitle = "";
  }

  reset(): void {
    this.busy = false;
    this.selectedKey = "";
    this.previewKey = "builtin-guided";
    this.sourceTemplates = new Map();
  }

  startLoading(): void {
    this.reset();
    this.status = "Loading starting points…";
  }

  open(trigger: HTMLElement): void {
    this.returnFocus = this.returnTarget(trigger);
    this.showModal();
    this.startLoading();
  }

  bindTrigger(trigger: HTMLElement, load: () => Promise<void> = () => this.refresh()): void {
    this.trigger?.removeEventListener("click", this.openFromTrigger);
    this.trigger = trigger;
    this.loadStartingPoints = load;
    trigger.addEventListener("click", this.openFromTrigger);
  }

  bindWorkspaces(source: () => readonly WorkspaceSummary[]): void {
    this.workspaceSource = source;
  }

  async openFromBoundTrigger(): Promise<void> {
    const trigger = this.trigger;
    if (!trigger) return;
    this.open(trigger);
    try {
      await this.loadStartingPoints();
      this.focusFirst();
    } catch (error) {
      this.showError(errorMessage(error, "Could not load project templates."));
    }
  }

  close(): void {
    this.closeModal();
  }

  showError(message: string): void {
    this.busy = false;
    this.status = message;
  }

  setData(templates: readonly ProjectTemplateSummary[], workspaces: readonly WorkspaceSummary[]): void {
    this.templates = templates;
    this.workspaces = workspaces;
    const templateIds = new Set(templates.map(({ id }) => id));
    this.hiddenTemplateIds = new Set([...this.hiddenTemplateIds].filter((id) => templateIds.has(id)));
    this.normalizeSelection();
  }

  async refresh(workspaces = this.workspaceSource()): Promise<void> {
    const response = await fetch("/api/project-templates", { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isProjectTemplateSummaries(value)) throw new Error("Project templates returned invalid data");
    this.setData(value, workspaces);
    this.binding.templatesChanged();
  }

  bind(binding: StartingPointBinding): void {
    this.binding = binding;
  }

  async deleteTemplate(id: string): Promise<void> {
    await expectOk(
      await fetch(`/api/project-templates/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      }),
    );
    await this.refresh(this.workspaces);
  }

  get availableTemplates(): readonly ProjectTemplateSummary[] {
    return this.templates.filter((template) => !this.hiddenTemplateIds.has(template.id));
  }

  setTemplateHidden(id: string, hidden: boolean): void {
    const hiddenIds = new Set(this.hiddenTemplateIds);
    if (hidden) hiddenIds.add(id);
    else hiddenIds.delete(id);
    this.hiddenTemplateIds = hiddenIds;
    this.normalizeSelection();
    this.binding.templatesChanged();
  }

  focusFirst(): void {
    void this.updateComplete.then(() => this.querySelector<HTMLButtonElement>("[data-template-id]")?.focus());
  }

  acceptProjectSource(workspace: WorkspaceSummary, template: ProjectTemplateSummary): void {
    const key = projectSourceKey(workspace.id);
    if (this.previewKey !== key) return;
    this.sourceTemplates = new Map(this.sourceTemplates).set(workspace.id, template);
    this.selectedKey = key;
    this.dispatchSelection(`Using “${workspace.title}”. Only reusable project structure will be copied.`);
  }

  rejectProjectSource(workspace: WorkspaceSummary, message: string): void {
    if (this.previewKey !== projectSourceKey(workspace.id)) return;
    this.dispatchSelection(message);
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
    this.parentDialog = this.resolveDialog();
    this.dialog.addEventListener("keydown", this.trapFocus);
    this.dialog.addEventListener("close", this.restoreFocus);
  }

  override disconnectedCallback(): void {
    this.parentDialog?.removeEventListener("keydown", this.trapFocus);
    this.parentDialog?.removeEventListener("close", this.restoreFocus);
    this.parentDialog = null;
    super.disconnectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const templates = this.availableTemplates;
    const workspaces = this.visibleWorkspaces;
    const preview = this.startingPoint(this.previewKey);
    return html`
      <form class="template-browser-form" id="new-workspace-form" @submit=${this.create}>
        <header class="template-browser-header">
          <div>
            <p class="eyebrow">New project</p>
            <h2 class="ui-heading mt-1">Choose a starting point</h2>
            <p class="ui-supporting-text mt-2">Browse the structure and publication setup before choosing a starting point.</p>
          </div>
          <label class="field-label template-title-field"
            >Project title
            <input
              class="field"
              id="new-workspace-title"
              type="text"
              maxlength="120"
              required
              placeholder="Working title"
              .value=${this.projectTitle}
              @input=${this.changeTitle}
            />
          </label>
        </header>
        <div class="template-browser">
          <section class="template-browser-index" aria-labelledby="template-browser-index-heading">
            <h3 class="field-label" id="template-browser-index-heading">Starting points</h3>
            <div class="template-choice-list" id="new-workspace-template-list">
              ${this.choiceGroup(
                "Built in",
                templates.filter((template) => template.source === "built-in"),
              )}
              ${this.choiceGroup(
                "Your templates",
                templates.filter((template) => template.source === "personal"),
              )}
              ${this.projectGroup(workspaces)}
            </div>
          </section>
          <section class="template-preview" id="new-workspace-template-preview" aria-live="polite">
            ${preview ? this.templatePreview(preview) : this.emptyPreview()}
          </section>
        </div>
        <input id="new-workspace-template-id" type="hidden" .value=${this.selectedKey} />
        <footer class="template-browser-footer">
          <p class="ui-status" id="new-workspace-template-status" role="status">${this.status}</p>
          <div class="ui-cluster justify-end">
            <button class="button-secondary" id="open-latex-import" type="button" @click=${() => this.openImport("import-latex")}>
              Import LaTeX
            </button>
            <button class="button-secondary" id="open-github-import" type="button" @click=${() => this.openImport("import-github")}>
              Import GitHub
            </button>
            <button class="button-secondary" id="cancel-new-workspace" type="button" @click=${this.close}>Cancel</button>
            <button class="button-primary" id="create-workspace" type="submit" ?disabled=${!this.selectedKey || this.busy}>
              Create project
            </button>
          </div>
        </footer>
      </form>
    `;
  }

  protected async create(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.selectedKey) {
      this.status = "Choose a starting point.";
      return;
    }
    this.busy = true;
    try {
      const sourceWorkspaceId = this.selectedKey.startsWith("project:") ? this.selectedKey.slice("project:".length) : null;
      const response = await jsonFetch("/api/workspaces", {
        title: this.projectTitle,
        ...(sourceWorkspaceId ? { sourceWorkspaceId } : { templateId: this.selectedKey }),
      });
      await expectOk(response);
      const values: unknown[] = [await response.json()];
      if (!isWorkspaceSummaries(values) || !values[0]) throw new Error("Project catalog returned invalid data");
      location.assign(values[0].href);
    } catch (error) {
      this.showError(errorMessage(error, "Could not create the project."));
    }
  }

  protected changeTitle(event: Event): void {
    this.projectTitle = (event.currentTarget as HTMLInputElement).value;
  }

  protected openImport(detail: StartingPointAction): void {
    this.close();
    this.binding.openImport(detail);
  }

  private readonly openFromTrigger = (): void => void this.openFromBoundTrigger();

  protected showModal(): void {
    this.dialog.showModal();
  }

  protected returnTarget(trigger: HTMLElement): HTMLElement {
    return trigger.closest("details")?.querySelector<HTMLElement>("summary") ?? trigger;
  }

  protected closeModal(): void {
    this.dialog.close();
  }

  protected focusableElements(): readonly HTMLElement[] {
    return [
      ...this.dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], summary",
      ),
    ].filter((element) => element.offsetParent !== null);
  }

  protected activeElement(): Element | null {
    return document.activeElement;
  }

  protected hasOpenDialog(): boolean {
    return Boolean(document.querySelector("dialog[open]"));
  }

  private get dialog(): HTMLDialogElement {
    return this.parentDialog ?? this.resolveDialog();
  }

  private resolveDialog(): HTMLDialogElement {
    const dialog = this.closest("dialog");
    if (!(dialog instanceof HTMLDialogElement)) throw new Error("Project starting point browser requires a dialog parent");
    return dialog;
  }

  protected readonly trapFocus = (event: KeyboardEvent): void => {
    if (event.key !== "Tab") return;
    const focusable = this.focusableElements();
    const edge = event.shiftKey ? focusable[0] : focusable.at(-1);
    const target = event.shiftKey ? focusable.at(-1) : focusable[0];
    if (this.activeElement() !== edge || !target) return;
    target.focus();
    event.preventDefault();
  };

  protected readonly restoreFocus = (): void => {
    if (!this.hasOpenDialog()) this.returnFocus?.focus();
  };

  private get visibleWorkspaces(): readonly WorkspaceSummary[] {
    return this.workspaces.filter((workspace) => workspace.id !== demoWorkspaceId && !workspace.archivedAt);
  }

  private normalizeSelection(): void {
    const previousSelection = this.selectedKey;
    const keys = new Set([
      ...this.availableTemplates.map((template) => template.id),
      ...this.visibleWorkspaces.map((workspace) => projectSourceKey(workspace.id)),
    ]);
    if (!keys.has(this.selectedKey)) this.selectedKey = "";
    if (!keys.has(this.previewKey)) this.previewKey = this.availableTemplates[0]?.id ?? "";
    if (previousSelection && !this.selectedKey) this.status = "Choose a starting point.";
  }

  private choiceGroup(label: string, templates: readonly ProjectTemplateSummary[]): TemplateResult | typeof nothing {
    if (templates.length === 0) return nothing;
    return html`
      <section class="template-choice-group">
        <h3 class="template-choice-group-title">${label}</h3>
        ${templates.map((template) => this.templateChoice(template))}
      </section>
    `;
  }

  private projectGroup(workspaces: readonly WorkspaceSummary[]): TemplateResult | typeof nothing {
    if (workspaces.length === 0) return nothing;
    return html`
      <section class="template-choice-group">
        <h3 class="template-choice-group-title">Existing projects</h3>
        ${workspaces.map((workspace) => this.projectChoice(workspace))}
      </section>
    `;
  }

  private templateChoice(template: ProjectTemplateSummary): TemplateResult {
    const selected = this.selectedKey === template.id;
    return html`
      <div class="template-choice" data-selected=${String(selected)}>
        <button
          class="template-choice-label"
          type="button"
          data-template-id=${template.id}
          data-starting-point=${template.id}
          aria-pressed=${String(selected)}
          @click=${() => this.chooseTemplate(template)}
        >
          <span class="template-choice-name">${template.name}</span>
          <span class="template-choice-description">${template.description}</span>
        </button>
        ${template.source === "personal"
          ? html`<button
              class="template-choice-remove"
              type="button"
              title=${`Delete template ${template.name}`}
              @click=${() => this.requestTemplateDelete(template)}
            >
              Remove
            </button>`
          : nothing}
      </div>
    `;
  }

  private projectChoice(workspace: WorkspaceSummary): TemplateResult {
    const key = projectSourceKey(workspace.id);
    const selected = this.selectedKey === key;
    const description =
      workspace.id === currentWorkspaceId()
        ? "Current project · copy its latest reusable structure."
        : `Updated ${formatCalendarDate(workspace.updatedAt)} · copy its latest reusable structure.`;
    return html`
      <div class="template-choice" data-selected=${String(selected)}>
        <button
          class="template-choice-label"
          type="button"
          data-project-source-id=${workspace.id}
          data-starting-point=${key}
          aria-pressed=${String(selected)}
          @click=${() => void this.chooseProject(workspace)}
        >
          <span class="template-choice-name">${workspace.title}</span>
          <span class="template-choice-description">${description}</span>
        </button>
      </div>
    `;
  }

  private templatePreview(template: ProjectTemplateSummary): TemplateResult {
    const preview = template.preview;
    const sourceLabel =
      template.source === "built-in" ? "Built-in template" : template.source === "personal" ? "Personal template" : "Existing project";
    const hiddenPaths = preview.fileCount + preview.folderCount - preview.files.length - preview.folders.length;
    return html`
      <article class="template-preview-content">
        <header>
          <p class="eyebrow">${sourceLabel}</p>
          <h3 class="template-preview-title">${template.name}</h3>
          <p class="template-preview-description">${template.description}</p>
        </header>
        <div class="template-preview-facts">
          ${templateFact(`${preview.fileCount}`, preview.fileCount === 1 ? "Markdown file" : "Markdown files")}
          ${templateFact(`${preview.folderCount}`, preview.folderCount === 1 ? "folder" : "folders")}
          ${templateFact(preview.hasBibliography ? "Included" : "Empty", "bibliography")}
        </div>
        <section class="template-preview-section">
          <h4>Starting structure</h4>
          <ul class="template-preview-tree">
            ${preview.folders.map((path) => html`<li data-kind="folder">${path}</li>`)}
            ${preview.files.map((path) => html`<li data-kind="file">${path}</li>`)}
            ${hiddenPaths > 0 ? html`<li data-kind="more">+ ${hiddenPaths} more</li>` : nothing}
          </ul>
        </section>
        <section class="template-preview-section">
          <h4>Publication setup</h4>
          <dl class="template-preview-settings">
            <div>
              <dt>Format</dt>
              <dd>${humanizeTemplateValue(preview.submissionTemplate)}</dd>
            </div>
            <div>
              <dt>Citations</dt>
              <dd>${preview.citationStyle.toUpperCase()} · ${preview.locale}</dd>
            </div>
            <div>
              <dt>Page</dt>
              <dd>${preview.paperSize === "a4" ? "A4" : "US Letter"}</dd>
            </div>
          </dl>
        </section>
        <p class="template-preview-choose text-xs text-app-text-soft">
          ${this.selectedKey === startingPointKey(template) ? "Selected starting point" : "Choose a starting point from the template list."}
        </p>
      </article>
    `;
  }

  private emptyPreview(): TemplateResult {
    return html`<div class="empty-state">
      ${this.previewKey.startsWith("project:") ? "Loading the project structure…" : "No starting points are available."}
    </div>`;
  }

  protected chooseTemplate(template: ProjectTemplateSummary): void {
    this.previewKey = template.id;
    this.selectedKey = template.id;
    this.dispatchSelection(`Using “${template.name}”. The new project will be an independent copy.`);
  }

  protected async chooseProject(workspace: WorkspaceSummary): Promise<void> {
    this.previewKey = projectSourceKey(workspace.id);
    this.selectedKey = "";
    this.dispatchSelection(`Loading “${workspace.title}”…`);
    await this.loadProjectSource(workspace);
  }

  private async loadProjectSource(workspace: WorkspaceSummary): Promise<void> {
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspace.id)}/template-preview`, {
        credentials: "same-origin",
      });
      await expectOk(response);
      const values: unknown[] = [await response.json()];
      if (!isProjectTemplateSummaries(values) || values[0]?.source !== "project" || values[0].id !== workspace.id) {
        throw new Error("Project starting point returned invalid data");
      }
      this.acceptProjectSource(workspace, values[0]);
    } catch (error) {
      this.rejectProjectSource(workspace, errorMessage(error, "Could not load the project starting point."));
    }
  }

  protected requestTemplateDelete(template: ProjectTemplateSummary): void {
    this.deletions.schedule({
      key: `project-template:${template.id}`,
      deletedMessage: `Deleted template “${template.name}”.`,
      restoredMessage: `Restored template “${template.name}”.`,
      failedMessage: `Could not delete template “${template.name}”.`,
      hide: () => this.setTemplateHidden(template.id, true),
      restore: () => this.setTemplateHidden(template.id, false),
      commit: async () => await this.deleteTemplate(template.id),
    });
  }

  private dispatchSelection(status: string): void {
    this.status = status;
  }

  private startingPoint(key: string): ProjectTemplateSummary | undefined {
    return key.startsWith("project:")
      ? this.sourceTemplates.get(key.slice("project:".length))
      : this.templates.find((candidate) => candidate.id === key);
  }
}

function templateFact(value: string, label: string): TemplateResult {
  return html`<span><strong>${value}</strong><span>${label}</span></span>`;
}

function humanizeTemplateValue(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function projectSourceKey(id: string): string {
  return `project:${id}`;
}

function startingPointKey(template: ProjectTemplateSummary): string {
  return template.source === "project" ? projectSourceKey(template.id) : template.id;
}

function currentWorkspaceId(): string {
  return document.body.dataset.workspaceId ?? "";
}

if (!customElements.get("project-starting-point-browser")) {
  customElements.define("project-starting-point-browser", ProjectStartingPointBrowser);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-starting-point-browser": ProjectStartingPointBrowser;
  }
}
