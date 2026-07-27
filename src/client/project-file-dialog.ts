import { html, LitElement, type TemplateResult } from "lit";
import { relativeProjectPath, type ProjectAsset, type ProjectFile } from "../domain/project-files";
import { isWorkspaceSnapshot, type WorkspaceSnapshot } from "../domain/workspace";
import { DeferredDeletionController, type DeferredDeletionNoticeOptions } from "./deferred-deletion";
import { errorMessage, expectOk, jsonFetch } from "./http";
import { projectFileActionEvent, type ProjectFileAction } from "./project-file-actions";
import { projectImagesUploadedEvent, type ProjectImagesUploaded } from "./project-image-upload-control";
import { projectTreeActionEvent, type ProjectTreeAction, type ProjectTreeCallbacks, type ProjectTreeData } from "./project-tree-panel";

export const projectFileSavedEvent = "project-file-saved";

export type ProjectFileDialogMode = "create" | "create-and-include" | "rename" | "create-folder" | "rename-folder";

export interface ProjectFileSaved {
  readonly message: string;
  readonly mode: ProjectFileDialogMode;
  readonly path: string;
  readonly snapshot: WorkspaceSnapshot;
}

export interface ProjectImageInsertion {
  readonly message: string;
  readonly syntax: string;
}

export interface ProjectFileMutationCallbacks {
  readonly commit: (snapshot: WorkspaceSnapshot) => void;
  readonly presentNotice: (message: string, options?: DeferredDeletionNoticeOptions) => void;
  readonly previewChanged: () => void;
  readonly selectFile: (fileId: string) => void;
}

interface ProjectImageUploadSource extends EventTarget {
  readonly choose: () => void;
}

interface ProjectFileTreeSource extends EventTarget {
  readonly focusFilter: () => void;
}

export interface ProjectFilePresentationBinding {
  readonly editorInsertMenu: { setFiles(activeFile: ProjectFile | null, files: readonly ProjectFile[]): void };
  readonly projectFileMenuActions: { setEntryFileActive(active: boolean): void };
  readonly projectTreePanel: {
    configure(apiBase: string, callbacks: ProjectTreeCallbacks): void;
    setTree(data: ProjectTreeData): void;
  };
  readonly sourceCompletion: {
    setProject(project: WorkspaceSnapshot, activeFileId: string | null, workspace: boolean): void;
  };
}

export interface ProjectFileWorkflowRouting {
  readonly activeFile: () => ProjectFile | null;
  readonly actionControls: readonly EventTarget[];
  readonly deleteFile: () => void;
  readonly focusEditor: () => void;
  readonly imageUpload: ProjectImageUploadSource;
  readonly insertImage: (insertion: ProjectImageInsertion) => void;
  readonly openDialog: (mode: ProjectFileDialogMode, folderId?: string) => void;
  readonly quickOpen: () => void;
  readonly saved: (result: ProjectFileSaved) => void;
  readonly selectFile: (fileId: string) => void;
  readonly tree: ProjectFileTreeSource;
}

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

export class ProjectFileDialog extends LitElement {
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
  private mutationCallbacks: ProjectFileMutationCallbacks = {
    commit: () => undefined,
    presentNotice: () => undefined,
    previewChanged: () => undefined,
    selectFile: () => undefined,
  };
  private readonly deletions = new DeferredDeletionController((message, options) => {
    this.mutationCallbacks.presentNotice(message, options);
  });
  private targetId: string | null = null;
  private readonly hiddenFileIds = new Set<string>();
  private presentation: ProjectFilePresentationBinding | null = null;
  private routing: ProjectFileWorkflowRouting | null = null;
  private routingAbort: AbortController | null = null;

  constructor() {
    super();
    this.initialPath = "";
    this.mode = "create";
    this.saving = false;
    this.status = "";
  }

  configureApi(apiBase: string, mutationCallbacks?: ProjectFileMutationCallbacks): void {
    this.apiBase = apiBase;
    if (mutationCallbacks) this.mutationCallbacks = mutationCallbacks;
    this.configureProjectTree();
  }

  bindWorkflow(routing: ProjectFileWorkflowRouting): void {
    this.routing = routing;
    this.connectRouting();
  }

  bindPresentation(binding: ProjectFilePresentationBinding): void {
    this.presentation = binding;
    this.configureProjectTree();
  }

  private configureProjectTree(): void {
    this.presentation?.projectTreePanel.configure(this.apiBase, {
      acceptSnapshot: this.mutationCallbacks.commit,
      presentNotice: this.mutationCallbacks.presentNotice,
      previewChanged: this.mutationCallbacks.previewChanged,
    });
  }

  presentProject(snapshot: WorkspaceSnapshot, activeFileId: string | null, assetBase: string, workspace: boolean): void {
    const presentation = this.presentation;
    if (!presentation) return;
    const files = snapshot.files.filter((file) => !this.hiddenFileIds.has(file.id));
    const activeFile = files.find((file) => file.id === activeFileId) ?? null;
    presentation.projectTreePanel.setTree({
      activeFileId,
      assetBase,
      assets: snapshot.assets,
      entryFileId: snapshot.entryFileId,
      files,
      folders: snapshot.folders,
    });
    presentation.editorInsertMenu.setFiles(activeFile, files);
    presentation.sourceCompletion.setProject(snapshot, activeFileId, workspace);
    presentation.projectFileMenuActions.setEntryFileActive(activeFileId === snapshot.entryFileId);
  }

  get hiddenFiles(): ReadonlySet<string> {
    return this.hiddenFileIds;
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
        this.mutationCallbacks.selectFile(entryFileId);
      },
      restore: () => {
        this.hiddenFileIds.delete(file.id);
        this.mutationCallbacks.selectFile(file.id);
      },
      commit: async () => {
        const response = await fetch(`${this.apiBase}/files/${encodeURIComponent(file.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        await expectOk(response);
        this.hiddenFileIds.delete(file.id);
        this.mutationCallbacks.commit(await this.workspace(response));
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

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
    this.connectRouting();
  }

  override disconnectedCallback(): void {
    this.routingAbort?.abort();
    this.routingAbort = null;
    super.disconnectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
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
      this.close();
      this.dispatchEvent(
        new CustomEvent<ProjectFileSaved>(projectFileSavedEvent, {
          bubbles: true,
          detail: { message: projectFileSavedMessage(this.mode, path), mode: this.mode, path, snapshot },
        }),
      );
    } catch (error) {
      this.status = errorMessage(error, "Could not save the project path.");
    } finally {
      this.saving = false;
    }
  }

  protected cancel(): void {
    this.close();
  }

  private readonly handleFileAction = (event: Event): void => {
    const routing = this.routing;
    if (!routing) return;
    const action = (event as CustomEvent<ProjectFileAction>).detail;
    if (action === "upload-images") routing.imageUpload.choose();
    else if (action === "delete") routing.deleteFile();
    else routing.openDialog(action);
  };

  private readonly handleTreeAction = (event: Event): void => {
    const routing = this.routing;
    if (!routing) return;
    const detail = (event as CustomEvent<ProjectTreeAction>).detail;
    if (detail.action === "select-file") {
      routing.selectFile(detail.fileId);
      if (detail.focusEditor) routing.focusEditor();
    } else if (detail.action === "quick-open") {
      routing.quickOpen();
      routing.tree.focusFilter();
    } else if (detail.action === "rename-folder") routing.openDialog("rename-folder", detail.folderId);
    else {
      const activeFile = routing.activeFile();
      if (activeFile) routing.insertImage(projectImageInsertion(activeFile, detail.asset));
    }
  };

  private readonly handleImagesUploaded = (event: Event): void => {
    const { message, snapshot } = (event as CustomEvent<ProjectImagesUploaded>).detail;
    this.mutationCallbacks.commit(snapshot);
    this.mutationCallbacks.presentNotice(message);
  };

  private readonly handleSaved = (event: Event): void => {
    this.routing?.saved((event as CustomEvent<ProjectFileSaved>).detail);
  };

  private connectRouting(): void {
    this.routingAbort?.abort();
    const routing = this.routing;
    if (!routing) return;
    this.routingAbort = new AbortController();
    const options = { signal: this.routingAbort.signal };
    for (const actions of routing.actionControls) actions.addEventListener(projectFileActionEvent, this.handleFileAction, options);
    routing.tree.addEventListener(projectTreeActionEvent, this.handleTreeAction, options);
    routing.imageUpload.addEventListener(projectImagesUploadedEvent, this.handleImagesUploaded, options);
    this.addEventListener(projectFileSavedEvent, this.handleSaved, options);
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
