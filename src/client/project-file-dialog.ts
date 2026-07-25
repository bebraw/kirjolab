import { html, LitElement, type TemplateResult } from "lit";

export const projectFileSaveEvent = "project-file-save";

export type ProjectFileDialogMode = "create" | "create-and-include" | "rename" | "create-folder" | "rename-folder";

export interface ProjectFileSave {
  readonly path: string;
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
  };

  declare private initialPath: string;
  declare private mode: ProjectFileDialogMode;

  constructor() {
    super();
    this.initialPath = "";
    this.mode = "create";
  }

  async show(mode: ProjectFileDialogMode, initialPath = ""): Promise<void> {
    this.mode = mode;
    this.initialPath = initialPath;
    await this.updateComplete;
    const dialog = this.dialog;
    if (!dialog.open) dialog.showModal();
    this.pathInput.focus();
  }

  close(): void {
    this.dialog.close();
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
            <button class="button-primary" id="save-project-file" type="submit">${folderMode ? "Save folder" : "Save file"}</button>
          </div>
        </form>
      </dialog>
    `;
  }

  protected configure(mode: ProjectFileDialogMode, initialPath = ""): void {
    this.mode = mode;
    this.initialPath = initialPath;
  }

  protected save(event: SubmitEvent): void {
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent<ProjectFileSave>(projectFileSaveEvent, {
        bubbles: true,
        detail: { path: this.pathInput.value.trim() },
      }),
    );
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
}

if (typeof customElements !== "undefined" && !customElements.get("project-file-dialog-panel")) {
  customElements.define("project-file-dialog-panel", ProjectFileDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-file-dialog-panel": ProjectFileDialog;
  }
}
