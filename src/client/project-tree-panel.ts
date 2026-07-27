import { html, LitElement, nothing, type TemplateResult } from "lit";
import type { ProjectAsset, ProjectFile, ProjectFolder } from "../domain/project-files";
import { isWorkspaceSnapshot, type WorkspaceSnapshot } from "../domain/workspace";
import { DeferredDeletionController, type DeferredDeletionNoticeOptions } from "./deferred-deletion";
import { expectOk } from "./http";

export const projectTreeActionEvent = "project-tree-action";

export type ProjectTreeAction =
  | { readonly action: "insert-asset"; readonly asset: ProjectAsset }
  | { readonly action: "quick-open" }
  | { readonly action: "rename-folder"; readonly folderId: string }
  | { readonly action: "select-file"; readonly fileId: string; readonly focusEditor: boolean };

export interface ProjectTreeData {
  readonly activeFileId: string | null;
  readonly assetBase: string;
  readonly assets: readonly ProjectAsset[];
  readonly entryFileId: string;
  readonly files: readonly ProjectFile[];
  readonly folders: readonly ProjectFolder[];
}

type ProjectTreeItem =
  | { readonly kind: "asset"; readonly path: string; readonly asset: ProjectAsset }
  | { readonly kind: "file"; readonly path: string; readonly file: ProjectFile }
  | { readonly kind: "folder"; readonly path: string; readonly folder: ProjectFolder };

export interface ProjectTreeCallbacks {
  readonly acceptSnapshot: (snapshot: WorkspaceSnapshot) => void;
  readonly presentNotice: (message: string, options?: DeferredDeletionNoticeOptions) => void;
  readonly previewChanged: () => void;
}

export class ProjectTreePanel extends LitElement {
  static override properties = {
    data: { state: true },
    openMenuKey: { state: true },
    query: { state: true },
  };

  declare private data: ProjectTreeData;
  declare private openMenuKey: string | null;
  declare private query: string;
  private apiBase = "";
  private callbacks: ProjectTreeCallbacks = {
    acceptSnapshot: () => undefined,
    presentNotice: () => undefined,
    previewChanged: () => undefined,
  };
  private readonly hiddenAssetIds = new Set<string>();
  private readonly hiddenFolderIds = new Set<string>();
  private readonly deletions = new DeferredDeletionController((message, options) => {
    const settled = this.isConnected ? this.updateComplete : Promise.resolve();
    void settled.then(() => this.callbacks.presentNotice(message, options));
  });

  constructor() {
    super();
    this.data = { activeFileId: "", assetBase: "", assets: [], entryFileId: "", files: [], folders: [] };
    this.openMenuKey = null;
    this.query = "";
  }

  setTree(data: ProjectTreeData): void {
    this.data = data;
  }

  get hiddenAssets(): ReadonlySet<string> {
    return this.hiddenAssetIds;
  }

  configure(apiBase: string, callbacks: ProjectTreeCallbacks): void {
    this.apiBase = apiBase;
    this.callbacks = callbacks;
  }

  focusFilter(): void {
    const input = this.querySelector<HTMLInputElement>("#project-file-filter");
    input?.focus();
    input?.select();
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
    this.ownerDocument.addEventListener("keydown", this.handleQuickOpen);
  }

  override disconnectedCallback(): void {
    this.ownerDocument.removeEventListener("keydown", this.handleQuickOpen);
    super.disconnectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const items = this.items();
    const normalizedQuery = this.query.trim().toLocaleLowerCase();
    const visible = normalizedQuery ? items.filter((item) => item.path.toLocaleLowerCase().includes(normalizedQuery)) : items;
    const status = normalizedQuery
      ? visible.length
        ? `${visible.length} of ${items.length} project items`
        : `No project items match “${this.query.trim()}”`
      : `${items.length} project items`;
    return html`
      <div class="project-file-filter">
        <label class="sr-only" for="project-file-filter">Filter project files</label>
        <input
          class="field"
          id="project-file-filter"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="Filter files…"
          aria-describedby="project-file-filter-status"
          .value=${this.query}
          @input=${this.filter}
          @keydown=${this.handleFilterKey}
        />
        <kbd title="Quick open project files">⌘P</kbd>
      </div>
      <p class="project-file-filter-status" id="project-file-filter-status" aria-live="polite">${status}</p>
      <div class="mt-2 grid gap-1" id="project-file-list">
        ${items.length === 0
          ? html`<div class="empty-state">No project files yet.</div>`
          : items.map((item) => this.renderItem(item, !visible.includes(item)))}
      </div>
    `;
  }

  protected filter(event: Event): void {
    this.query = (event.currentTarget as HTMLInputElement).value;
  }

  protected handleFilterKey(event: KeyboardEvent): void {
    if (event.key === "Escape" && this.query) {
      event.preventDefault();
      this.query = "";
      return;
    }
    if (event.key !== "Enter") return;
    const normalizedQuery = this.query.trim().toLocaleLowerCase();
    const first = this.items().find(
      (item): item is Extract<ProjectTreeItem, { readonly kind: "file" }> =>
        item.kind === "file" && (!normalizedQuery || item.path.toLocaleLowerCase().includes(normalizedQuery)),
    );
    if (!first) return;
    event.preventDefault();
    this.query = "";
    this.emit({ action: "select-file", fileId: first.file.id, focusEditor: true });
  }

  protected readonly handleQuickOpen = (event: KeyboardEvent): void => {
    if (
      this.getAttribute("app-mode") !== "workspace" ||
      event.defaultPrevented ||
      event.altKey ||
      event.shiftKey ||
      !(event.metaKey || event.ctrlKey) ||
      event.key.toLowerCase() !== "p" ||
      this.ownerDocument.querySelector("dialog[open]")
    ) {
      return;
    }
    event.preventDefault();
    this.emit({ action: "quick-open" });
  };

  protected act(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const action = button.dataset.projectAction;
    const file = this.data.files.find((item) => item.id === button.dataset.fileId);
    const folder = this.data.folders.find((item) => item.id === button.dataset.folderId);
    const asset = this.data.assets.find((item) => item.id === button.dataset.assetId);
    if (action !== "insert-asset") this.openMenuKey = null;
    if (action === "select-file" && file) this.emit({ action, fileId: file.id, focusEditor: false });
    else if (action === "rename-folder" && folder) this.emit({ action, folderId: folder.id });
    else if (action === "delete-folder" && folder) this.deleteFolder(folder);
    else if (action === "insert-asset" && asset) this.emit({ action, asset });
    else if (action === "delete-asset" && asset) this.deleteAsset(asset);
  }

  private items(): ProjectTreeItem[] {
    return [
      ...this.data.folders
        .filter((folder) => !this.hiddenFolderIds.has(folder.id))
        .map((folder) => ({ kind: "folder" as const, path: folder.path, folder })),
      ...this.data.files.map((file) => ({ kind: "file" as const, path: file.path, file })),
      ...this.data.assets
        .filter((asset) => !this.hiddenAssetIds.has(asset.id))
        .map((asset) => ({ kind: "asset" as const, path: asset.path, asset })),
    ].sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind));
  }

  private renderItem(item: ProjectTreeItem, hidden: boolean): TemplateResult {
    const depth = item.path.split("/").length - 1;
    if (item.kind === "folder") return this.renderFolder(item.folder, depth, hidden);
    if (item.kind === "asset") return this.renderAsset(item.asset, depth, hidden);
    return this.renderFile(item.file, depth, hidden);
  }

  private renderFolder(folder: ProjectFolder, depth: number, hidden: boolean): TemplateResult {
    return html`
      <div
        class="project-folder-row"
        data-project-path=${folder.path}
        style=${`padding-inline-start: ${0.55 + depth * 0.75}rem`}
        ?hidden=${hidden}
      >
        <span class="min-w-0 truncate">${folder.path.split("/").at(-1)}/</span>
        <details
          class="action-menu project-tree-actions"
          ?open=${this.openMenuKey === `folder:${folder.id}`}
          @toggle=${(event: Event) => this.rememberMenu(event, `folder:${folder.id}`)}
        >
          <summary aria-label=${`Actions for ${folder.path}`}>•••</summary>
          <div class="editor-command-menu">
            <button type="button" data-folder-id=${folder.id} data-project-action="rename-folder" @click=${this.act}>Move or rename</button>
            <button type="button" data-folder-id=${folder.id} data-project-action="delete-folder" @click=${this.act}>
              Delete empty folder
            </button>
          </div>
        </details>
      </div>
    `;
  }

  private renderAsset(asset: ProjectAsset, depth: number, hidden: boolean): TemplateResult {
    const href = `${this.data.assetBase}/${encodeURIComponent(asset.id)}`;
    return html`
      <div
        class="project-file-row project-asset-row"
        data-project-path=${asset.path}
        style=${`padding-inline-start: ${0.55 + depth * 0.75}rem`}
        ?hidden=${hidden}
      >
        <img class="project-asset-thumbnail" src=${href} alt="" />
        <span class="min-w-0 flex-1 truncate">${asset.path.split("/").at(-1) ?? asset.path}</span>
        <details
          class="action-menu project-tree-actions"
          ?open=${this.openMenuKey === `asset:${asset.id}`}
          @toggle=${(event: Event) => this.rememberMenu(event, `asset:${asset.id}`)}
        >
          <summary aria-label=${`Actions for ${asset.path}`}>•••</summary>
          <div class="editor-command-menu">
            <button type="button" data-asset-id=${asset.id} data-project-action="insert-asset" @click=${this.act}>Insert image</button>
            <a href=${href} target="_blank" rel="noopener">Open image</a>
            <button type="button" data-asset-id=${asset.id} data-project-action="delete-asset" @click=${this.act}>Delete image</button>
          </div>
        </details>
      </div>
    `;
  }

  private renderFile(file: ProjectFile, depth: number, hidden: boolean): TemplateResult {
    const active = file.id === this.data.activeFileId;
    return html`
      <button
        type="button"
        class="project-file-row"
        data-project-path=${file.path}
        data-project-file-id=${file.id}
        data-project-action="select-file"
        data-file-id=${file.id}
        data-active=${String(active)}
        aria-current=${active ? "page" : "false"}
        style=${`padding-inline-start: ${0.55 + depth * 0.75}rem`}
        ?hidden=${hidden}
        @click=${this.act}
      >
        <span class="truncate">${file.path.split("/").at(-1) ?? file.path}</span>
        ${file.id === this.data.entryFileId ? html`<span class="project-file-kind">entry</span>` : nothing}
      </button>
    `;
  }

  private async deleteResource(resource: "assets" | "folders", id: string, invalidMessage: string): Promise<WorkspaceSnapshot> {
    const response = await fetch(`${this.apiBase}/${resource}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error(invalidMessage);
    return value;
  }

  protected rememberMenu(event: Event, key: string): void {
    const open = (event.currentTarget as HTMLDetailsElement).open;
    if (open) this.openMenuKey = key;
    else if (this.openMenuKey === key) this.openMenuKey = null;
  }

  private deleteFolder(folder: ProjectFolder): void {
    this.deletions.schedule({
      key: `project-folder:${folder.id}`,
      deletedMessage: `Deleted ${folder.path}.`,
      restoredMessage: `Restored ${folder.path}.`,
      failedMessage: `Could not delete ${folder.path}.`,
      hide: () => this.setHidden(this.hiddenFolderIds, folder.id, true),
      restore: () => this.setHidden(this.hiddenFolderIds, folder.id, false),
      commit: async () => {
        const snapshot = await this.deleteResource("folders", folder.id, "Project folder operation returned an invalid workspace");
        this.hiddenFolderIds.delete(folder.id);
        this.callbacks.acceptSnapshot(snapshot);
      },
    });
  }

  private deleteAsset(asset: ProjectAsset): void {
    this.deletions.schedule({
      key: `project-image:${asset.id}`,
      deletedMessage: `Deleted ${asset.path}.`,
      restoredMessage: `Restored ${asset.path}.`,
      failedMessage: `Could not delete ${asset.path}.`,
      hide: () => this.setHidden(this.hiddenAssetIds, asset.id, true, true),
      restore: () => this.setHidden(this.hiddenAssetIds, asset.id, false, true),
      commit: async () => {
        const snapshot = await this.deleteResource("assets", asset.id, "Image deletion returned an invalid workspace");
        this.hiddenAssetIds.delete(asset.id);
        this.callbacks.acceptSnapshot(snapshot);
        this.callbacks.previewChanged();
      },
    });
  }

  private setHidden(ids: Set<string>, id: string, hidden: boolean, previewChanged = false): void {
    if (hidden) ids.add(id);
    else ids.delete(id);
    this.requestUpdate();
    if (previewChanged) this.callbacks.previewChanged();
  }

  private emit(detail: ProjectTreeAction): void {
    this.dispatchEvent(new CustomEvent(projectTreeActionEvent, { bubbles: true, composed: true, detail }));
  }
}

if (typeof customElements !== "undefined" && !customElements.get("project-tree-panel")) {
  customElements.define("project-tree-panel", ProjectTreePanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-tree-panel": ProjectTreePanel;
  }
}
