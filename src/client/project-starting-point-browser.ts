import { html, LitElement, nothing, type TemplateResult } from "lit";
import type { ProjectTemplateSummary } from "../domain/project-templates";
import { demoWorkspaceId, type WorkspaceSummary } from "../domain/workspace";
import { formatCalendarDate } from "./format";

export interface StartingPointChange {
  readonly key: string;
  readonly status: string;
}

export const startingPointChangeEvent = "starting-point-change";
export const startingPointProjectLoadEvent = "starting-point-project-load";
export const startingPointTemplateDeleteEvent = "starting-point-template-delete";

export class ProjectStartingPointBrowser extends LitElement {
  static override properties = {
    templates: { state: true },
    workspaces: { state: true },
    hiddenTemplateIds: { state: true },
    selectedKey: { state: true },
    previewKey: { state: true },
    sourceTemplates: { state: true },
  };

  declare private templates: readonly ProjectTemplateSummary[];
  declare private workspaces: readonly WorkspaceSummary[];
  declare private hiddenTemplateIds: ReadonlySet<string>;
  declare private selectedKey: string;
  declare private previewKey: string;
  declare private sourceTemplates: ReadonlyMap<string, ProjectTemplateSummary>;

  constructor() {
    super();
    this.templates = [];
    this.workspaces = [];
    this.hiddenTemplateIds = new Set();
    this.selectedKey = "";
    this.previewKey = "builtin-guided";
    this.sourceTemplates = new Map();
  }

  get selection(): string {
    return this.selectedKey;
  }

  reset(): void {
    this.selectedKey = "";
    this.previewKey = "builtin-guided";
    this.sourceTemplates = new Map();
  }

  setData(
    templates: readonly ProjectTemplateSummary[],
    workspaces: readonly WorkspaceSummary[],
    hiddenTemplateIds: ReadonlySet<string>,
  ): void {
    this.templates = templates;
    this.workspaces = workspaces;
    this.hiddenTemplateIds = new Set(hiddenTemplateIds);
    this.normalizeSelection();
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
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const templates = this.visibleTemplates;
    const workspaces = this.visibleWorkspaces;
    const preview = this.startingPoint(this.previewKey);
    return html`
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
      <input id="new-workspace-template-id" type="hidden" .value=${this.selectedKey} />
    `;
  }

  private get visibleTemplates(): readonly ProjectTemplateSummary[] {
    return this.templates.filter((template) => !this.hiddenTemplateIds.has(template.id));
  }

  private get visibleWorkspaces(): readonly WorkspaceSummary[] {
    return this.workspaces.filter((workspace) => workspace.id !== demoWorkspaceId && !workspace.archivedAt);
  }

  private normalizeSelection(): void {
    const previousSelection = this.selectedKey;
    const keys = new Set([
      ...this.visibleTemplates.map((template) => template.id),
      ...this.visibleWorkspaces.map((workspace) => projectSourceKey(workspace.id)),
    ]);
    if (!keys.has(this.selectedKey)) this.selectedKey = "";
    if (!keys.has(this.previewKey)) this.previewKey = this.visibleTemplates[0]?.id ?? "";
    if (previousSelection && !this.selectedKey) this.dispatchSelection("Choose a starting point.");
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
          @click=${() => this.chooseProject(workspace)}
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

  private chooseTemplate(template: ProjectTemplateSummary): void {
    this.previewKey = template.id;
    this.selectedKey = template.id;
    this.dispatchSelection(`Using “${template.name}”. The new project will be an independent copy.`);
  }

  private chooseProject(workspace: WorkspaceSummary): void {
    this.previewKey = projectSourceKey(workspace.id);
    this.selectedKey = "";
    this.dispatchSelection(`Loading “${workspace.title}”…`);
    this.dispatchEvent(new CustomEvent<WorkspaceSummary>(startingPointProjectLoadEvent, { detail: workspace }));
  }

  private requestTemplateDelete(template: ProjectTemplateSummary): void {
    this.dispatchEvent(new CustomEvent<ProjectTemplateSummary>(startingPointTemplateDeleteEvent, { detail: template }));
  }

  private dispatchSelection(status: string): void {
    this.dispatchEvent(new CustomEvent<StartingPointChange>(startingPointChangeEvent, { detail: { key: this.selectedKey, status } }));
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
