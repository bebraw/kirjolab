import { html, LitElement, type TemplateResult } from "lit";
import type { ProjectTemplateSummary } from "../domain/project-templates";

export const projectTemplateSaveEvent = "project-template-save";

export interface ProjectTemplateSave {
  readonly description: string;
  readonly name: string;
  readonly templateId?: string;
}

export class ProjectTemplateSaveDialog extends LitElement {
  static override properties = {
    description: { state: true },
    name: { state: true },
    selectedTemplateId: { state: true },
    status: { state: true },
    templates: { state: true },
  };

  declare private description: string;
  declare private name: string;
  declare private selectedTemplateId: string;
  declare private status: string;
  declare private templates: readonly ProjectTemplateSummary[];

  constructor() {
    super();
    this.description = "";
    this.name = "";
    this.selectedTemplateId = "";
    this.status = "";
    this.templates = [];
  }

  get value(): ProjectTemplateSave {
    return {
      description: this.description,
      name: this.name,
      ...(this.selectedTemplateId ? { templateId: this.selectedTemplateId } : {}),
    };
  }

  async showLoading(): Promise<void> {
    this.status = "Loading personal templates…";
    await this.updateComplete;
    if (!this.dialog.open) this.dialog.showModal();
  }

  async showReady(projectTitle: string): Promise<void> {
    this.selectedTemplateId = "";
    this.name = projectTitle;
    this.description = "";
    this.status = "Create a new template or explicitly replace one you already own.";
    await this.updateComplete;
    this.nameInput.focus();
  }

  showError(message: string): void {
    this.status = message;
  }

  setTemplates(templates: readonly ProjectTemplateSummary[]): void {
    this.templates = templates.filter((template) => template.source === "personal");
    if (!this.templates.some((template) => template.id === this.selectedTemplateId)) this.selectedTemplateId = "";
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
    return html`
      <dialog class="new-workspace-dialog ui-dialog" id="save-template-dialog">
        <form class="p-5" id="save-template-form" @submit=${this.save}>
          <p class="eyebrow">Personal template</p>
          <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Reuse this project structure</h2>
          <label class="field-label mt-5"
            >Save action
            <select class="field" id="save-template-target" .value=${this.selectedTemplateId} @change=${this.selectTemplate}>
              <option value="">Create a new template</option>
              ${this.templates.map((template) => html`<option value=${template.id}>Replace ${template.name}</option>`)}
            </select>
          </label>
          <label class="field-label mt-4"
            >Template name
            <input
              class="field"
              id="save-template-name"
              maxlength="120"
              required
              placeholder="Lab article"
              .value=${this.name}
              @input=${this.changeName}
            />
          </label>
          <label class="field-label mt-4"
            >Description
            <textarea
              class="field min-h-20 resize-y"
              id="save-template-description"
              maxlength="500"
              placeholder="When should this template be used?"
              .value=${this.description}
              @input=${this.changeDescription}
            ></textarea>
          </label>
          <p class="mt-3 text-xs leading-5 text-app-text-soft">
            Saves Markdown files, folders, portable bibliography, and publication settings. PDFs, images, annotations, claims, comments,
            collaborators, and history stay out.
          </p>
          <p class="mt-2 text-xs leading-5 text-app-text-soft" id="save-template-status" role="status">${this.status}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button class="button-secondary" id="cancel-save-template" type="button" @click=${this.cancel}>Cancel</button>
            <button class="button-primary" type="submit">Save template</button>
          </div>
        </form>
      </dialog>
    `;
  }

  protected selectTemplate(event: Event): void {
    this.selectedTemplateId = (event.currentTarget as HTMLSelectElement).value;
    const template = this.templates.find((candidate) => candidate.id === this.selectedTemplateId);
    if (!template) return;
    this.name = template.name;
    this.description = template.description;
    this.status = `Replacing “${template.name}” affects only projects created from it in the future.`;
  }

  protected changeName(event: Event): void {
    this.name = (event.currentTarget as HTMLInputElement).value;
  }

  protected changeDescription(event: Event): void {
    this.description = (event.currentTarget as HTMLTextAreaElement).value;
  }

  protected save(event: SubmitEvent): void {
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent<ProjectTemplateSave>(projectTemplateSaveEvent, {
        bubbles: true,
        detail: this.value,
      }),
    );
  }

  protected cancel(): void {
    this.close();
  }

  protected get dialog(): HTMLDialogElement {
    const dialog = this.querySelector<HTMLDialogElement>("#save-template-dialog");
    if (!dialog) throw new Error("Project template save dialog is unavailable");
    return dialog;
  }

  protected get nameInput(): HTMLInputElement {
    const input = this.querySelector<HTMLInputElement>("#save-template-name");
    if (!input) throw new Error("Project template name is unavailable");
    return input;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("project-template-save-dialog")) {
  customElements.define("project-template-save-dialog", ProjectTemplateSaveDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-template-save-dialog": ProjectTemplateSaveDialog;
  }
}
