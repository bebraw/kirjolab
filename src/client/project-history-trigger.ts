import { html, LitElement, type TemplateResult } from "lit";
import type { CollaboratorSelectionList } from "./collaborator-selection-list";
import type { ContextResourcePresenter } from "./context-resource-presenter";
import type { EditorStatus } from "./editor-status";
import type { ProjectHistoryDialog } from "./project-history-dialog";
import type { ProjectFileDialog } from "./project-file-dialog";

export const projectHistoryOpenEvent = "project-history-open";

export interface ProjectRevisionOwners {
  readonly collaboratorSelections: Pick<CollaboratorSelectionList, "setData">;
  readonly contextResourcePresenter: Pick<ContextResourcePresenter, "activeTab" | "presentBoundContext">;
  readonly editorStatus: Pick<EditorStatus, "renderHighlight">;
  readonly projectFileDialog: Pick<ProjectFileDialog, "projectFiles">;
  readonly projectHistoryDialog: Pick<ProjectHistoryDialog, "configure">;
  readonly toast: { show(message: string): void };
}

export class ProjectHistoryTrigger extends LitElement {
  static override properties = { revision: { state: true } };

  declare private revision: number;
  private offline: { schedule(): void } | null = null;
  private revisionOwners: ProjectRevisionOwners | null = null;

  constructor() {
    super();
    this.revision = 0;
  }

  setRevision(revision: number): void {
    this.revision = revision;
  }

  get value(): number {
    return this.revision;
  }

  bindWorkspace(apiBase: string, owners: ProjectRevisionOwners, offline: { schedule(): void }): void {
    this.offline = offline;
    this.revisionOwners = owners;
    owners.projectHistoryDialog.configure(apiBase, { projectHistoryTrigger: this, toast: owners.toast });
  }

  observeRevision(revision: number): void {
    this.revision = Math.max(this.revision, revision);
    const owners = this.revisionOwners;
    if (!owners) return;
    owners.collaboratorSelections.setData({ files: owners.projectFileDialog.projectFiles(), revision: this.revision });
    owners.editorStatus.renderHighlight();
    this.offline?.schedule();
    if (owners.contextResourcePresenter.activeTab?.kind === "candidate") {
      owners.contextResourcePresenter.presentBoundContext(false);
    }
  }

  protected open(): void {
    this.dispatchEvent(new CustomEvent(projectHistoryOpenEvent, { bubbles: true, composed: true }));
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`<button id="open-project-history" type="button" @click=${this.open}>
      <strong>History</strong><code id="revision-badge">r${this.revision}</code>
    </button>`;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("project-history-trigger")) {
  customElements.define("project-history-trigger", ProjectHistoryTrigger);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-history-trigger": ProjectHistoryTrigger;
  }
}
