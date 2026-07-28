import { html, type TemplateResult } from "lit";
import { projectFileCollaborationTextName, relativeProjectPath, type ProjectAsset, type ProjectFile } from "../domain/project-files";
import { isWorkspaceSnapshot, type WorkspaceSnapshot } from "../domain/workspace";
import { DeferredDeletionController, type DeferredDeletionNoticeOptions } from "./deferred-deletion";
import type { CollaborationSession } from "./collaboration-session";
import { errorMessage, expectOk, jsonFetch } from "./http";
import { LightDomElement } from "./light-dom-controller";
import { projectFileActionEvent, type ProjectFileAction } from "./project-file-actions";
import { projectImagesUploadedEvent, type ProjectImagesUploaded } from "./project-image-upload-control";
import type { ProjectHistoryTrigger, ProjectRevisionOwners } from "./project-history-trigger";
import { projectTreeActionEvent, type ProjectTreeAction, type ProjectTreeCallbacks, type ProjectTreeData } from "./project-tree-panel";
import type { RestoredOfflineWorkspace } from "./offline-workspace";
import type { WorkspacePreview, WorkspacePreviewProjectOwners } from "./workspace-preview";
import { loadWorkspaceSnapshot, WorkspaceAccessError } from "./workspace-snapshot-client";

export type ProjectFileDialogMode = "create" | "create-and-include" | "rename" | "create-folder" | "rename-folder";

export interface ProjectImageInsertion {
  readonly message: string;
  readonly syntax: string;
}

export interface ProjectRefreshOwners {
  readonly bibliography: { disabled: boolean; value: string };
  readonly workspaceCatalogPanel: {
    presentOfflineWorkspace(workspace: Pick<WorkspaceSnapshot, "id" | "title">, savedAt: string): void;
    refresh(): Promise<unknown>;
  };
  readonly connectionStatus: {
    presentOfflineRestore(pending: boolean): void;
    presentWorkflow(): void;
  };
  readonly contextResourcePresenter: {
    presentBoundWorkspace(): void;
    refreshBoundReferencePdfs(render?: boolean): Promise<void>;
  };
  readonly projectHistoryTrigger: { setRevision(revision: number): void };
  readonly workspacePreview: { renderBoundProject(bibliography?: string): unknown };
  readonly source: { disabled: boolean; value: string };
}

interface ProjectRefreshBinding {
  readonly collaboration: {
    goOffline(): void;
    restoreOffline(serverStateVector: Uint8Array): boolean;
    setOfflineAvailable(available: boolean): void;
  };
  readonly offline: {
    clear(): Promise<void>;
    restore(): Promise<RestoredOfflineWorkspace | null>;
    schedule(): void;
  };
  readonly owners: ProjectRefreshOwners;
}

export interface ProjectFilePresentationBinding {
  readonly assistantGenerationPresenter: { readonly refreshAvailability: () => void };
  readonly authoringModeTabs: { navigate(mode: "write"): void };
  readonly editorStatus: {
    preserveInsertionPoint(): ((directive: string) => boolean) | null;
    selectRange(from: number, to: number): void;
    setProjectFile(file: ProjectFile, entryFileId: string, reset: boolean): void;
  };
  readonly editorInsertMenu: {
    insert(insertion: { readonly text: string }, message?: string): void;
    setFiles(activeFile: ProjectFile | null, files: readonly ProjectFile[]): void;
  };
  readonly toast: { readonly show: (message: string, options?: DeferredDeletionNoticeOptions) => void };
  readonly projectFileMenuActions: EventTarget & { setEntryFileActive(active: boolean): void };
  readonly projectFileRailActions: EventTarget;
  readonly projectImageUpload: EventTarget & { choose(): void; configure(apiBase: string): void };
  readonly projectTreePanel: EventTarget & {
    configure(apiBase: string, callbacks: ProjectTreeCallbacks): void;
    focusFilter(): void;
    setTree(data: ProjectTreeData): void;
  };
  readonly source: { focus(): void; scrollIntoView(options?: ScrollIntoViewOptions): void };
  readonly sourceCompletion: {
    setProject(project: WorkspaceSnapshot, activeFileId: string | null, workspace: boolean): void;
  };
  readonly workspacePreview: {
    readonly renderBoundProject: () => Promise<unknown>;
    readonly resetScroll: () => void;
  };
  readonly workspaceRailTabs: { navigate(tab: "files"): void };
  readonly workspaceSurfaceSwitcher: { readonly syncRoute: (mode: "replace") => void };
}

type ProjectFileApplicationOwners = ProjectFilePresentationBinding &
  ProjectRefreshOwners &
  ProjectRevisionOwners &
  WorkspacePreviewProjectOwners & {
    readonly projectHistoryTrigger: Pick<ProjectHistoryTrigger, "bindWorkspace" | "setRevision">;
    readonly workspaceLayout: { setRailCollapsed(collapsed: boolean): void };
    readonly workspacePreview: Pick<WorkspacePreview, "bindProject" | "renderBoundProject" | "resetScroll">;
  };

export function projectImageInsertion(activeFile: ProjectFile, asset: ProjectAsset): ProjectImageInsertion {
  const path = relativeProjectPath(activeFile.path, asset.path);
  const alt = (asset.path.split("/").at(-1) ?? "image")
    .replace(/\.[^.]+$/u, "")
    .replaceAll(/[-_]+/gu, " ")
    .replaceAll("[", "")
    .replaceAll("]", "");
  return {
    message: `Inserted ${asset.path}.`,
    syntax: `![${alt}](${/[\s()]/u.test(path) ? `<${path}>` : path})`,
  };
}

export function projectFileDialogIsFolder(mode: ProjectFileDialogMode): boolean {
  return mode === "create-folder" || mode === "rename-folder";
}

export function projectFileDialogIsCreating(mode: ProjectFileDialogMode): boolean {
  return mode === "create" || mode === "create-and-include" || mode === "create-folder";
}

function projectFileDialogTitle(mode: ProjectFileDialogMode): string {
  if (mode === "create") return "Add Markdown file";
  if (mode === "create-and-include") return "Create and include file";
  if (mode === "rename") return "Move or rename file";
  if (mode === "create-folder") return "Add folder";
  return "Move or rename folder";
}

function projectFileDialogHelp(mode: ProjectFileDialogMode): string {
  if (projectFileDialogIsFolder(mode)) return "Use a relative path. Moving a folder also moves its files and keeps includes valid.";
  if (mode === "rename") return "Change the folder or filename by editing this relative path. Inbound includes stay valid.";
  return "Compose this file from the project entry with ::include[path].";
}

export class ProjectFileDialog extends LightDomElement {
  static override properties = {
    initialPath: { state: true },
    mode: { state: true },
    saving: { state: true },
    status: { state: true },
  };

  declare private initialPath: string;
  declare private mode: ProjectFileDialogMode;
  declare private saving: boolean;
  declare private status: string;
  private apiBase = "";
  private readonly deletions = new DeferredDeletionController((message, options) => {
    this.presentNotice(message, options);
  });
  private targetId: string | null = null;
  private assetBase = "";
  private readonly hiddenFileIds = new Set<string>();
  private selectedFileId: string | null = null;
  private snapshot: WorkspaceSnapshot | null = null;
  private presentation: ProjectFilePresentationBinding | null = null;
  private liveContent: Pick<CollaborationSession, "document" | "offlineAvailable" | "synced"> | null = null;
  private pendingInclude: ((path: string) => boolean) | null = null;
  private refreshBinding: ProjectRefreshBinding | null = null;
  private layout: { setRailCollapsed(collapsed: boolean): void } | null = null;
  private ownerAbort: AbortController | null = null;
  private workspaceMode = false;

  constructor() {
    super();
    this.initialPath = "";
    this.mode = "create";
    this.saving = false;
    this.status = "";
  }

  bindApplication(
    apiBase: string,
    workspace: boolean,
    owners: ProjectFileApplicationOwners,
    session: CollaborationSession,
    offline: ProjectRefreshBinding["offline"],
  ): void {
    this.configureApi(apiBase, owners, owners.workspaceLayout);
    this.bindLiveContent(session);
    this.bindProjectRefresh(workspace, owners, session, offline);
    owners.workspacePreview.bindProject(apiBase, session.document, owners);
    owners.projectHistoryTrigger.bindWorkspace(apiBase, owners, offline);
  }

  configureApi(
    apiBase: string,
    presentation?: ProjectFilePresentationBinding,
    layout?: { setRailCollapsed(collapsed: boolean): void },
  ): void {
    this.apiBase = apiBase;
    this.assetBase = `${apiBase}/assets`;
    if (presentation) {
      presentation.projectImageUpload.configure(apiBase);
      this.bindPresentation(presentation, layout);
    } else this.configureProjectTree();
  }

  bindPresentation(binding: ProjectFilePresentationBinding, layout?: { setRailCollapsed(collapsed: boolean): void }): void {
    this.presentation = binding;
    if (layout) this.layout = layout;
    this.configureProjectTree();
    this.connectOwners();
  }

  bindLiveContent(session: Pick<CollaborationSession, "document" | "offlineAvailable" | "synced">): void {
    this.liveContent = session;
  }

  bindProjectRefresh(
    workspace: boolean,
    owners: ProjectRefreshOwners,
    collaboration: ProjectRefreshBinding["collaboration"],
    offline: ProjectRefreshBinding["offline"],
  ): void {
    this.workspaceMode = workspace;
    this.refreshBinding = { collaboration, offline, owners };
  }

  private configureProjectTree(): void {
    this.presentation?.projectTreePanel.configure(this.apiBase, {
      acceptSnapshot: (snapshot) => this.commitSnapshot(snapshot),
      presentNotice: (message, options) => this.presentNotice(message, options),
      previewChanged: () => this.refreshPreview(),
    });
  }

  private presentFileActivation(): void {
    const presentation = this.presentation;
    if (!presentation) return;
    presentation.assistantGenerationPresenter.refreshAvailability();
    presentation.workspacePreview.resetScroll();
    this.refreshPreview();
    presentation.workspaceSurfaceSwitcher.syncRoute("replace");
  }

  private presentNotice(message: string, options?: DeferredDeletionNoticeOptions): void {
    this.presentation?.toast.show(message, options);
  }

  private refreshPreview(): void {
    void this.presentation?.workspacePreview.renderBoundProject();
  }

  get activeFileId(): string | null {
    return this.selectedFileId;
  }

  get activeFile(): ProjectFile | null {
    return this.snapshot?.files.find(({ id }) => id === this.selectedFileId) ?? null;
  }

  get project(): WorkspaceSnapshot | null {
    return this.snapshot;
  }

  projectFiles(
    live = Boolean(this.liveContent?.synced || this.liveContent?.offlineAvailable),
    snapshot: WorkspaceSnapshot | null = this.snapshot,
  ): ProjectFile[] {
    if (!snapshot) return [];
    const files = snapshot.files.filter((file) => !this.hiddenFileIds.has(file.id));
    const liveContent = this.liveContent;
    if (!live || !liveContent) return files;
    return files.map((file) => ({
      ...file,
      content: liveContent.document.getText(projectFileCollaborationTextName(file, snapshot.entryFileId)).toString(),
    }));
  }

  selectFile(fileId: string): boolean {
    const snapshot = this.snapshot;
    if (!snapshot) return false;
    const file = this.activateFile(snapshot, fileId);
    if (!file) return false;
    this.presentProject(snapshot, this.assetBase, this.workspaceMode, true);
    this.presentFileActivation();
    return true;
  }

  focusRange(fileId: string | null, from: number, to: number): void {
    const targetFileId = fileId || this.snapshot?.entryFileId;
    if (targetFileId) this.selectFile(targetFileId);
    this.presentation?.authoringModeTabs.navigate("write");
    this.presentation?.editorStatus.selectRange(from, Math.max(from, to));
  }

  revealAuthoring(): void {
    this.presentation?.authoringModeTabs.navigate("write");
    this.presentation?.source.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  revealRange(fileId: string | null, from: number, to: number): void {
    this.focusRange(fileId, from, to);
    this.presentation?.source.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  private activateFile(snapshot: WorkspaceSnapshot, fileId: string): ProjectFile | null {
    const file = snapshot.files.find(({ id }) => id === fileId);
    if (!file || this.hiddenFileIds.has(fileId) || fileId === this.selectedFileId) return null;
    this.selectedFileId = fileId;
    return file;
  }

  presentProject(snapshot: WorkspaceSnapshot, assetBase: string, workspace: boolean, resetFile = false): void {
    this.snapshot = snapshot;
    this.assetBase = assetBase;
    this.workspaceMode = workspace;
    const activeFile = this.ensureActiveFile(snapshot);
    const activeFileId = this.selectedFileId;
    const presentation = this.presentation;
    if (presentation) {
      const files = this.projectFiles(false);
      const visibleActiveFile = files.find((file) => file.id === activeFileId) ?? null;
      presentation.projectTreePanel.setTree({
        activeFileId,
        assetBase,
        assets: snapshot.assets,
        entryFileId: snapshot.entryFileId,
        files,
        folders: snapshot.folders,
      });
      presentation.editorInsertMenu.setFiles(visibleActiveFile, files);
      presentation.sourceCompletion.setProject(snapshot, activeFileId, workspace);
      presentation.projectFileMenuActions.setEntryFileActive(activeFileId === snapshot.entryFileId);
    }
    if (activeFile) this.presentation?.editorStatus.setProjectFile(activeFile, snapshot.entryFileId, resetFile);
  }

  get hiddenFiles(): ReadonlySet<string> {
    return this.hiddenFileIds;
  }

  async acceptProjectMutation(result: Response | WorkspaceSnapshot): Promise<void> {
    if (result instanceof Response) await expectOk(result);
    const value: unknown = result instanceof Response ? await result.json() : result;
    if (!isWorkspaceSnapshot(value)) throw new Error("Project mutation returned an invalid snapshot");
    this.presentProject(value, this.assetBase, this.workspaceMode);
    const binding = this.refreshBinding;
    if (!binding) return;
    await binding.owners.contextResourcePresenter.refreshBoundReferencePdfs(false);
    binding.owners.contextResourcePresenter.presentBoundWorkspace();
    void binding.owners.workspacePreview.renderBoundProject();
  }

  async refreshProject(): Promise<void> {
    const binding = this.refreshBinding;
    const liveContent = this.liveContent;
    if (!binding || !liveContent) return;
    const initial = this.snapshot === null;
    const snapshot = await loadWorkspaceSnapshot(this.apiBase, liveContent.document, liveContent.synced);
    if (initial) {
      binding.owners.projectHistoryTrigger.setRevision(snapshot.revision);
      binding.owners.source.value = snapshot.source;
      binding.owners.bibliography.value = snapshot.bibliography;
      void binding.owners.workspacePreview.renderBoundProject(snapshot.bibliography);
    } else {
      void binding.owners.workspacePreview.renderBoundProject();
    }
    this.presentProject(snapshot, this.assetBase, this.workspaceMode);
    binding.owners.contextResourcePresenter.presentBoundWorkspace();
    binding.offline.schedule();
    await binding.owners.contextResourcePresenter.refreshBoundReferencePdfs();
  }

  async restoreOfflineProject(): Promise<boolean> {
    const binding = this.refreshBinding;
    if (!binding) return false;
    const restored = await binding.offline.restore();
    if (!restored) return false;
    const pending = binding.collaboration.restoreOffline(restored.serverStateVector);
    binding.collaboration.setOfflineAvailable(true);
    binding.owners.projectHistoryTrigger.setRevision(restored.snapshot.revision);
    binding.owners.workspaceCatalogPanel.presentOfflineWorkspace(restored.snapshot, restored.savedAt);
    this.presentProject(restored.snapshot, this.assetBase, this.workspaceMode);
    binding.owners.contextResourcePresenter.presentBoundWorkspace();
    binding.owners.connectionStatus.presentOfflineRestore(pending);
    void binding.owners.workspacePreview.renderBoundProject();
    return true;
  }

  async openWorkspace(): Promise<void> {
    const binding = this.refreshBinding;
    if (!binding) return;
    binding.owners.source.disabled = true;
    binding.owners.bibliography.disabled = true;
    const restored = await this.restoreOfflineProject();
    try {
      await binding.owners.workspaceCatalogPanel.refresh();
    } catch (error) {
      if (!restored) throw new Error("Open Kirjolab online once before using it offline", { cause: error });
    }
    try {
      await this.refreshProject();
    } catch (error) {
      if (error instanceof WorkspaceAccessError) {
        await binding.offline.clear();
        throw error;
      }
      if (!restored) throw new Error("Open this project online once before editing it offline", { cause: error });
      binding.collaboration.goOffline();
      binding.owners.connectionStatus.presentWorkflow();
    }
  }

  private ensureActiveFile(snapshot: WorkspaceSnapshot): ProjectFile | null {
    const active = snapshot.files.find(({ id }) => id === this.selectedFileId);
    if (active) return active;
    this.selectedFileId = snapshot.entryFileId;
    return snapshot.files.find(({ id }) => id === snapshot.entryFileId) ?? null;
  }

  async show(mode: ProjectFileDialogMode, initialPath = "", targetId: string | null = null): Promise<void> {
    this.configure(mode, initialPath, targetId);
    await this.updateComplete;
    const dialog = this.dialog;
    if (!dialog.open) dialog.showModal();
    this.pathInput.focus();
  }

  async showFor(mode: ProjectFileDialogMode, file?: ProjectFile, folder?: WorkspaceSnapshot["folders"][number]): Promise<void> {
    const target = mode === "rename" ? file : mode === "rename-folder" ? folder : undefined;
    if (!projectFileDialogIsCreating(mode) && !target) return;
    await this.show(mode, target?.path ?? "", target?.id ?? null);
  }

  close(): void {
    this.dialog.close();
  }

  deleteFile(file: ProjectFile, entryFileId: string): void {
    this.deletions.schedule({
      key: `project-file:${file.id}`,
      deletedMessage: `Deleted ${file.path}.`,
      restoredMessage: `Restored ${file.path}.`,
      failedMessage: `Could not delete ${file.path}.`,
      hide: () => {
        this.hiddenFileIds.add(file.id);
        this.selectFile(entryFileId);
      },
      restore: () => {
        this.hiddenFileIds.delete(file.id);
        this.selectFile(file.id);
      },
      commit: async () => {
        const response = await fetch(`${this.apiBase}/files/${encodeURIComponent(file.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        await expectOk(response);
        this.hiddenFileIds.delete(file.id);
        this.commitSnapshot(await this.workspace(response));
      },
    });
  }

  async createFile(path: string, content: string): Promise<ProjectFile> {
    const response = await jsonFetch(`${this.apiBase}/files`, { path, content });
    await expectOk(response);
    const snapshot = await this.workspace(response);
    const created = snapshot.files.find((file) => file.path === path);
    if (!created) throw new Error("Project file operation did not create the requested path");
    return created;
  }

  async openWorkflowFile(path: string, content: () => string): Promise<void> {
    const existing = this.snapshot?.files.find((file) => file.path === path);
    if (existing) {
      this.selectFile(existing.id);
      this.presentation?.source.focus();
      return;
    }
    const created = await this.createFile(path, content());
    const next = new URL(location.href);
    next.searchParams.set("file", created.id);
    next.searchParams.set("rail", "guide");
    location.assign(`${next.pathname}${next.search}${next.hash}`);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.connectOwners();
  }

  override disconnectedCallback(): void {
    this.ownerAbort?.abort();
    this.ownerAbort = null;
    super.disconnectedCallback();
  }

  protected override render(): TemplateResult {
    const folderMode = projectFileDialogIsFolder(this.mode);
    return html`
      <dialog class="new-workspace-dialog ui-dialog" id="project-file-dialog">
        <form class="p-5" id="project-file-form" @submit=${this.save}>
          <p class="eyebrow">Project structure</p>
          <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]" id="project-file-dialog-title">
            ${projectFileDialogTitle(this.mode)}
          </h2>
          <label class="field-label mt-5"
            >Relative path
            <input
              class="field"
              id="project-file-path"
              type="text"
              maxlength="1024"
              required
              placeholder=${folderMode ? "chapters" : "chapters/01_introduction.md"}
              .value=${this.initialPath}
            />
          </label>
          <p class="mt-2 text-xs leading-5 text-app-text-soft" id="project-file-dialog-help">${projectFileDialogHelp(this.mode)}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button class="button-secondary" id="cancel-project-file" type="button" @click=${this.cancel}>Cancel</button>
            <button class="button-primary" id="save-project-file" type="submit" ?disabled=${this.saving}>
              ${this.saving ? "Saving…" : folderMode ? "Save folder" : "Save file"}
            </button>
          </div>
          <p class="status-line" role="status" ?hidden=${!this.status}>${this.status}</p>
        </form>
      </dialog>
    `;
  }

  protected configure(mode: ProjectFileDialogMode, initialPath = "", targetId: string | null = null): void {
    this.mode = mode;
    this.initialPath = initialPath;
    this.targetId = targetId;
    this.saving = false;
    this.status = "";
  }

  protected async save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const path = this.pathInput.value.trim();
    const folder = projectFileDialogIsFolder(this.mode);
    const creating = projectFileDialogIsCreating(this.mode);
    if (this.saving || (!creating && !this.targetId)) return;
    this.saving = true;
    this.status = "";
    try {
      const resource = folder ? "folders" : "files";
      const url = creating ? `${this.apiBase}/${resource}` : `${this.apiBase}/${resource}/${encodeURIComponent(this.targetId ?? "")}`;
      const response = await jsonFetch(url, { path }, creating ? "POST" : "PATCH");
      await expectOk(response);
      const snapshot = await this.workspace(response);
      const fileId = snapshot.files.find((file) => file.path === path)?.id;
      this.close();
      this.commitSnapshot(snapshot);
      const included = this.pendingInclude?.(path) ?? false;
      this.pendingInclude = null;
      if (!included && fileId) this.selectFile(fileId);
      this.presentNotice(projectFileSavedMessage(this.mode, path));
    } catch (error) {
      this.status = errorMessage(error, "Could not save the project path.");
    } finally {
      this.saving = false;
    }
  }

  protected cancel(): void {
    this.pendingInclude = null;
    this.close();
  }

  private readonly handleFileAction = (event: Event): void => {
    const owners = this.presentation;
    if (!owners) return;
    const action = (event as CustomEvent<ProjectFileAction>).detail;
    if (action === "upload-images") owners.projectImageUpload.choose();
    else if (action === "delete") this.deleteActiveFile();
    else this.openDialog(action);
  };

  private readonly handleTreeAction = (event: Event): void => {
    const owners = this.presentation;
    if (!owners) return;
    const detail = (event as CustomEvent<ProjectTreeAction>).detail;
    if (detail.action === "select-file") {
      this.selectFile(detail.fileId);
      if (detail.focusEditor) owners.source.focus();
    } else if (detail.action === "quick-open") {
      this.layout?.setRailCollapsed(false);
      owners.workspaceRailTabs.navigate("files");
      owners.projectTreePanel.focusFilter();
    } else if (detail.action === "rename-folder") this.openDialog("rename-folder", detail.folderId);
    else {
      const activeFile = this.activeFile;
      if (activeFile) {
        const insertion = projectImageInsertion(activeFile, detail.asset);
        owners.editorInsertMenu.insert({ text: insertion.syntax }, insertion.message);
      }
    }
  };

  private openDialog(mode: ProjectFileDialogMode, folderId?: string): void {
    const owners = this.presentation;
    const snapshot = this.snapshot;
    if (!owners || !snapshot) return;
    const activeFile = this.activeFile;
    const folder = snapshot.folders.find(({ id }) => id === folderId);
    const insertInclude = mode === "create-and-include" && activeFile ? owners.editorStatus.preserveInsertionPoint() : null;
    this.pendingInclude =
      insertInclude && activeFile ? (path) => insertInclude(`\n::include[${relativeProjectPath(activeFile.path, path)}]\n`) : null;
    void this.showFor(mode, activeFile ?? undefined, folder);
  }

  private deleteActiveFile(): void {
    const snapshot = this.snapshot;
    const activeFile = this.activeFile;
    if (!snapshot || !activeFile || activeFile.id === snapshot.entryFileId) return;
    this.deleteFile(activeFile, snapshot.entryFileId);
  }

  private readonly handleImagesUploaded = (event: Event): void => {
    const { message, snapshot } = (event as CustomEvent<ProjectImagesUploaded>).detail;
    this.commitSnapshot(snapshot);
    this.presentNotice(message);
  };

  private commitSnapshot(snapshot: WorkspaceSnapshot): void {
    this.presentProject(snapshot, this.assetBase, this.workspaceMode);
    void this.refreshBinding?.owners.workspacePreview.renderBoundProject();
  }

  private connectOwners(): void {
    this.ownerAbort?.abort();
    const owners = this.presentation;
    if (!owners) return;
    this.ownerAbort = new AbortController();
    const options = { signal: this.ownerAbort.signal };
    for (const actions of [owners.projectFileRailActions, owners.projectFileMenuActions])
      actions.addEventListener(projectFileActionEvent, this.handleFileAction, options);
    owners.projectTreePanel.addEventListener(projectTreeActionEvent, this.handleTreeAction, options);
    owners.projectImageUpload.addEventListener(projectImagesUploadedEvent, this.handleImagesUploaded, options);
  }

  protected get dialog(): HTMLDialogElement {
    const dialog = this.querySelector<HTMLDialogElement>("#project-file-dialog");
    if (!dialog) throw new Error("Project file dialog is unavailable");
    return dialog;
  }

  protected get pathInput(): HTMLInputElement {
    const input = this.querySelector<HTMLInputElement>("#project-file-path");
    if (!input) throw new Error("Project file path is unavailable");
    return input;
  }

  private async workspace(response: Response): Promise<WorkspaceSnapshot> {
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error("Project file operation returned an invalid workspace");
    return value;
  }
}

function projectFileSavedMessage(mode: ProjectFileDialogMode, path: string): string {
  if (mode === "create-folder") return `Added ${path}.`;
  if (mode === "rename-folder") return `Moved folder to ${path}; project paths and includes were updated.`;
  if (mode === "create-and-include") return `Created ${path} and included it at the remembered caret.`;
  if (mode === "create") return `Added ${path}.`;
  return `Renamed file to ${path}; inbound includes were updated.`;
}

if (typeof customElements !== "undefined" && !customElements.get("project-file-dialog-panel")) {
  customElements.define("project-file-dialog-panel", ProjectFileDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-file-dialog-panel": ProjectFileDialog;
  }
}
