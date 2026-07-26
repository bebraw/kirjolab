import { html, LitElement, type TemplateResult } from "lit";
import type { WorkspaceSummary } from "../domain/workspace";

export class WorkspaceSwitcher extends LitElement {
  static override properties = {
    workspaces: { state: true },
    activeWorkspaceId: { attribute: "active-workspace-id" },
  };

  declare private workspaces: readonly WorkspaceSummary[];
  declare private activeWorkspaceId: string;

  constructor() {
    super();
    this.workspaces = [];
    this.activeWorkspaceId = "";
  }

  setData(workspaces: readonly WorkspaceSummary[], activeWorkspaceId: string): void {
    this.workspaces = workspaces;
    this.activeWorkspaceId = activeWorkspaceId;
  }

  focusSelect(): void {
    this.querySelector<HTMLSelectElement>("select")?.focus();
  }

  protected selectWorkspace(event: Event): void {
    const workspaceId = (event.currentTarget as HTMLSelectElement).value;
    const workspace = this.workspaces.find(({ id }) => id === workspaceId);
    if (!workspace || workspace.id === this.activeWorkspaceId) return;
    location.assign(workspace.href);
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const available = this.workspaces.filter((workspace) => !workspace.archivedAt || workspace.id === this.activeWorkspaceId);
    return html`<label class="sr-only" for="workspace-switcher">Current project</label>
      <select class="workspace-switcher" id="workspace-switcher" @change=${this.selectWorkspace}>
        ${available.length === 0
          ? html`<option value=${this.activeWorkspaceId}>Loading project…</option>`
          : available.map(
              (workspace) =>
                html`<option value=${workspace.id} ?selected=${workspace.id === this.activeWorkspaceId}>${workspace.title}</option>`,
            )}
      </select>`;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("workspace-switcher-control")) {
  customElements.define("workspace-switcher-control", WorkspaceSwitcher);
}

declare global {
  interface HTMLElementTagNameMap {
    "workspace-switcher-control": WorkspaceSwitcher;
  }
}
