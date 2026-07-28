import { html, LitElement, type TemplateResult } from "lit";
import { isWorkspaceSummaries, type WorkspaceSnapshot, type WorkspaceSummary } from "../domain/workspace";
import { formatCalendarDate } from "./format";

interface WorkspaceCatalogSwitcher {
  readonly setData: (workspaces: readonly WorkspaceSummary[], currentWorkspaceId: string) => void;
}

interface WorkspaceCatalogOwners {
  readonly manageWorkspaces: HTMLElement;
  readonly workspaceSwitcher: WorkspaceCatalogSwitcher;
}

export class WorkspaceCatalogPanel extends LitElement {
  static override properties = {
    currentWorkspaceId: { state: true },
    query: { state: true },
    workspaces: { state: true },
  };

  declare private currentWorkspaceId: string;
  declare private query: string;
  declare private workspaces: readonly WorkspaceSummary[];
  private catalogBase = "";
  private switcher: WorkspaceCatalogSwitcher | null = null;

  constructor() {
    super();
    this.currentWorkspaceId = "";
    this.query = "";
    this.workspaces = [];
  }

  bindWorkspace(catalogBase: string, currentWorkspaceId: string, owners: WorkspaceCatalogOwners): void {
    this.catalogBase = catalogBase;
    this.currentWorkspaceId = currentWorkspaceId;
    this.switcher = owners.workspaceSwitcher;
    owners.manageWorkspaces.addEventListener("click", this.openFromTrigger);
  }

  get catalog(): readonly WorkspaceSummary[] {
    return this.workspaces;
  }

  setData(workspaces: readonly WorkspaceSummary[], currentWorkspaceId = this.currentWorkspaceId): void {
    this.workspaces = workspaces;
    this.currentWorkspaceId = currentWorkspaceId;
    this.switcher?.setData(workspaces, currentWorkspaceId);
  }

  presentOfflineWorkspace(workspace: Pick<WorkspaceSnapshot, "id" | "title">, savedAt: string): void {
    this.setData([
      {
        id: workspace.id,
        title: workspace.title,
        href: `/editor/${encodeURIComponent(workspace.id)}`,
        createdAt: savedAt,
        updatedAt: savedAt,
        archivedAt: null,
      },
    ]);
  }

  async refresh(): Promise<void> {
    const response = await fetch(this.catalogBase);
    if (!response.ok) throw new Error("Could not load project navigation");
    const value: unknown = await response.json();
    if (!isWorkspaceSummaries(value)) throw new Error("Project catalog returned invalid data");
    this.setData(value);
  }

  async open(): Promise<void> {
    this.dialog.showModal();
    await this.resetFilter();
  }

  async resetFilter(): Promise<void> {
    this.query = "";
    await this.updateComplete;
    const filter = this.renderRoot.querySelector<HTMLInputElement>("#workspace-catalog-filter");
    filter?.focus();
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const workspaces = filterWorkspaceCatalog(this.workspaces, this.query);
    return html`
      <div class="p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="eyebrow">Project library</p>
            <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Open a project</h2>
          </div>
          <button class="button-secondary" id="close-workspace-catalog" type="button" @click=${this.close}>Close</button>
        </div>
        <label class="field-label mt-5" for="workspace-catalog-filter"
          >Find by title
          <input
            class="field"
            id="workspace-catalog-filter"
            type="search"
            maxlength="120"
            autocomplete="off"
            placeholder="Filter projects"
            .value=${this.query}
            @input=${this.updateQuery}
        /></label>
        <div class="mt-4 grid gap-2" id="workspace-catalog-list" aria-live="polite">
          ${workspaces.length > 0
            ? workspaces.map(
                (workspace) => html`
                  <a
                    class="project-catalog-row"
                    href=${workspace.href}
                    aria-current=${workspace.id === this.currentWorkspaceId ? "page" : null}
                  >
                    <strong>${workspace.title}</strong>
                    <span>${workspaceCatalogMeta(workspace, this.currentWorkspaceId)}</span>
                  </a>
                `,
              )
            : html`<div class="empty-state">${this.query.trim() ? "No projects match this title." : "No projects available."}</div>`}
        </div>
      </div>
    `;
  }

  private updateQuery(event: InputEvent): void {
    this.query = (event.currentTarget as HTMLInputElement).value;
  }

  private readonly openFromTrigger = (): void => void this.open();

  close(): void {
    this.dialog.close();
  }

  private get dialog(): HTMLDialogElement {
    const dialog = this.closest("dialog");
    if (!(dialog instanceof HTMLDialogElement)) throw new Error("Workspace catalog panel requires a dialog parent");
    return dialog;
  }
}

export function filterWorkspaceCatalog(workspaces: readonly WorkspaceSummary[], query: string): readonly WorkspaceSummary[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return workspaces.filter((workspace) => workspace.title.toLocaleLowerCase().includes(normalizedQuery));
}

export function workspaceCatalogMeta(workspace: WorkspaceSummary, currentWorkspaceId: string): string {
  if (workspace.id === currentWorkspaceId) return workspace.archivedAt ? "Current project · archived" : "Current project";
  return `${workspace.archivedAt ? "Archived" : "Updated"} ${formatCalendarDate(workspace.archivedAt ?? workspace.updatedAt)}`;
}

if (typeof customElements !== "undefined" && !customElements.get("workspace-catalog-panel")) {
  customElements.define("workspace-catalog-panel", WorkspaceCatalogPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-catalog-panel": WorkspaceCatalogPanel;
  }
}
