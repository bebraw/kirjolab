import { html, LitElement, type TemplateResult } from "lit";
import { isProjectTemplateSummaries, type ProjectTemplateSummary } from "../domain/project-templates";
import { errorMessage, expectOk, jsonFetch } from "./http";

export interface ProjectTemplateSave {
  readonly description: string;
  readonly name: string;
  readonly templateId?: string;
}

export class ProjectTemplateSaveDialog extends LitElement {
  static override properties = {
    description: { state: true },
    busy: { state: true },
    name: { state: true },
    selectedTemplateId: { state: true },
    status: { state: true },
    templates: { state: true },
  };

  declare private description: string;
  declare private busy: boolean;
  declare private name: string;
  declare private selectedTemplateId: string;
  declare private status: string;
  declare private templates: readonly ProjectTemplateSummary[];
  private apiBase = "";
  private completeSave: ((message: string) => void) | null = null;

  constructor() {
    super();
    this.description = "";
    this.busy = false;
    this.name = "";
    this.selectedTemplateId = "";
    this.status = "";
    this.templates = [];
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  bindCompletion(completeSave: (message: string) => void): void {
    this.completeSave = completeSave;
  }

  async open(projectTitle: string, loadTemplates: () => Promise<void>): Promise<void> {
    await this.showLoading();
    try {
      await loadTemplates();
      await this.showReady(projectTitle);
    } catch (error) {
      this.showError(errorMessage(error, "Could not load personal templates."));
    }
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
            <select
              class="field"
              id="save-template-target"
              .value=${this.selectedTemplateId}
              ?disabled=${this.busy}
              @change=${this.selectTemplate}
            >
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
              ?disabled=${this.busy}
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
              ?disabled=${this.busy}
              @input=${this.changeDescription}
            ></textarea>
          </label>
          <p class="mt-3 text-xs leading-5 text-app-text-soft">
            Saves Markdown files, folders, portable bibliography, and publication settings. PDFs, images, annotations, claims, comments,
            collaborators, and history stay out.
          </p>
          <p class="mt-2 text-xs leading-5 text-app-text-soft" id="save-template-status" role="status">${this.status}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button class="button-secondary" id="cancel-save-template" type="button" ?disabled=${this.busy} @click=${this.cancel}>
              Cancel
            </button>
            <button class="button-primary" type="submit" ?disabled=${this.busy}>${this.busy ? "Saving…" : "Save template"}</button>
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

  protected async save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (this.busy) return;
    const value = this.value;
    this.busy = true;
    this.status = value.templateId ? "Replacing personal template…" : "Saving personal template…";
    try {
      if (!this.apiBase) throw new Error("Project template save is not configured");
      const response = await jsonFetch(`${this.apiBase}/template`, value);
      await expectOk(response);
      const templates: unknown[] = [await response.json()];
      if (!isProjectTemplateSummaries(templates) || !templates[0]) throw new Error("Saved project template returned invalid data");
      this.close();
      this.completeSave?.(
        value.templateId ? `Replaced template “${templates[0].name}”.` : `Saved “${templates[0].name}” as a personal template.`,
      );
    } catch (error) {
      this.status = errorMessage(error, "Could not save personal template.");
    } finally {
      this.busy = false;
    }
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
