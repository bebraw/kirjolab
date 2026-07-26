import { html, LitElement, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { renderIcon } from "../ui/icons";

export const projectFileActionEvent = "project-file-action";

export type ProjectFileAction = "create" | "create-and-include" | "create-folder" | "delete" | "rename" | "upload-images";

type ProjectFileActionsVariant = "menu" | "rail";

export class ProjectFileActions extends LitElement {
  static override properties = {
    entryFileActive: { state: true },
    variant: { type: String },
  };

  declare private entryFileActive: boolean;
  declare protected variant: ProjectFileActionsVariant;

  constructor() {
    super();
    this.entryFileActive = true;
    this.variant = "menu";
  }

  setEntryFileActive(entryFileActive: boolean): void {
    this.entryFileActive = entryFileActive;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return this.variant === "rail" ? this.renderRail() : this.renderMenu();
  }

  protected emitAction(action: ProjectFileAction): void {
    this.dispatchEvent(new CustomEvent<ProjectFileAction>(projectFileActionEvent, { bubbles: true, detail: action }));
  }

  private renderRail(): TemplateResult {
    return html`
      <div class="grid gap-3">
        <h1 class="text-xl font-semibold tracking-[-0.035em]">Files</h1>
        <div class="grid grid-cols-3 gap-1">
          ${this.railAction("create", "new-project-file-rail", "Add file", "fileAdd")}
          ${this.railAction("create-folder", "new-project-folder-rail", "Add folder", "folderAdd")}
          ${this.railAction("upload-images", "upload-project-images", "Add image", "imageAdd")}
        </div>
      </div>
    `;
  }

  private renderMenu(): TemplateResult {
    return html`
      <p class="editor-command-menu-label">File</p>
      <button id="new-project-file" type="button" @click=${() => this.emitAction("create")}><strong>Add file</strong></button>
      <button id="create-and-include-project-file" type="button" @click=${() => this.emitAction("create-and-include")}>
        <strong>Create and include</strong><code>at the current caret</code>
      </button>
      <button id="rename-project-file" type="button" @click=${() => this.emitAction("rename")}>
        <strong>Move or rename file</strong>
      </button>
      <button id="delete-project-file" type="button" ?disabled=${this.entryFileActive} @click=${() => this.emitAction("delete")}>
        <strong>Delete file</strong>
      </button>
    `;
  }

  private railAction(action: ProjectFileAction, id: string, label: string, icon: "fileAdd" | "folderAdd" | "imageAdd"): TemplateResult {
    return html`
      <button
        class="button-secondary justify-center"
        id=${id}
        type="button"
        aria-label=${label}
        title=${label}
        @click=${() => this.emitAction(action)}
      >
        ${unsafeHTML(renderIcon(icon, "rail-action-icon"))}
      </button>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("project-file-actions")) {
  customElements.define("project-file-actions", ProjectFileActions);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-file-actions": ProjectFileActions;
  }
}
