import { html, LitElement, type TemplateResult } from "lit";
import type { ProjectFile } from "../domain/project-files";
import { isWorkspaceSnapshot, type WorkspaceSnapshot } from "../domain/workspace";
import { errorMessage, expectOk, jsonFetch } from "./http";

export const projectFileSavedEvent = "project-file-saved";

export type ProjectFileDialogMode = "create" | "create-and-include" | "rename" | "create-folder" | "rename-folder";

export interface ProjectFileSaved {
  readonly message: string;
  readonly mode: ProjectFileDialogMode;
  readonly path: string;
  readonly snapshot: WorkspaceSnapshot;
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
  private targetId: string | null = null;

  constructor() {
    super();
    this.initialPath = "";
    this.mode = "create";
    this.saving = false;
    this.status = "";
  }

  configureApi(apiBase: string): void {
    this.apiBase = apiBase;
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

  async deleteFile(fileId: string): Promise<WorkspaceSnapshot> {
    const response = await fetch(`${this.apiBase}/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    await expectOk(response);
    return this.workspace(response);
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
