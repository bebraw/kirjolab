import { html, nothing, type TemplateResult } from "lit";
import {
  isProjectImportPreview,
  isProjectImportResult,
  type ProjectImportPreview,
} from "../../domain/project/project-interchange-contracts";
import { LightDomElement } from "../platform/light-dom-controller";
import { errorMessage, expectOk } from "../platform/http";

export class ProjectImportPanel extends LightDomElement {
  static override properties = {
    standalone: { type: Boolean },
    busy: { state: true },
    previewData: { state: true },
    status: { state: true },
    projectTitle: { state: true },
    selection: { state: true },
  };
  declare private busy: "preview" | "confirm" | null;
  declare private previewData: ProjectImportPreview | null;
  declare private status: string;
  declare private projectTitle: string;
  declare standalone: boolean;
  declare private selection: { entryPath?: string; bibliographyPath?: string; includePdfs?: boolean };
  private archiveFile: File | null = null;
  private attemptId = crypto.randomUUID();
  private epoch = 0;
  private parentDialog: HTMLDialogElement | null = null;
  constructor() {
    super();
    this.standalone = false;
    this.busy = null;
    this.previewData = null;
    this.status = "";
    this.projectTitle = "";
    this.selection = {};
  }
  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.standalone) {
      this.parentDialog = this.dialog();
      this.parentDialog.addEventListener("cancel", this.preventBusyCancel);
    }
  }
  override disconnectedCallback(): void {
    this.parentDialog?.removeEventListener("cancel", this.preventBusyCancel);
    this.parentDialog = null;
    super.disconnectedCallback();
  }
  protected readonly preventBusyCancel = (event: Event): void => {
    if (this.busy) event.preventDefault();
  };
  open(): void {
    this.reset();
    if (!this.standalone) this.dialog().showModal();
  }
  reset(): void {
    this.querySelector<HTMLFormElement>("#project-import-form")?.reset();
    this.epoch++;
    this.busy = null;
    this.previewData = null;
    this.status = "";
    this.projectTitle = "";
    this.archiveFile = null;
    this.selection = {};
    this.attemptId = crypto.randomUUID();
  }
  protected dialog(): HTMLDialogElement {
    const dialog = this.closest("dialog");
    if (!(dialog instanceof HTMLDialogElement)) throw new Error("Project import requires a dialog");
    return dialog;
  }
  protected cancel(): void {
    if (!this.busy) {
      if (this.standalone) this.dispatchEvent(new CustomEvent("project-creation-back", { bubbles: true }));
      else this.dialog().close();
    }
  }
  edit(): void {
    this.epoch++;
    this.previewData = null;
    this.status = "Review the archive again after changing setup.";
    this.notifyCreation();
  }
  private notifyCreation(): void {
    if (this.standalone)
      this.dispatchEvent(
        new CustomEvent("project-creation-state", { bubbles: true, detail: { step: this.previewData ? 3 : 2, busy: this.busy !== null } }),
      );
  }
  protected archiveChanged(event: Event): void {
    this.archiveFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
    this.epoch++;
    this.previewData = null;
    this.status = "";
    this.attemptId = crypto.randomUUID();
    this.selection = {};
    this.projectTitle = "";
  }
  protected updateTitle(event: Event): void {
    this.projectTitle = (event.currentTarget as HTMLInputElement).value;
    this.attemptId = crypto.randomUUID();
  }
  protected async preview(event: Event): Promise<void> {
    event.preventDefault();
    const archive = this.archiveFile;
    if (this.busy || !archive) return;
    if (archive.size > 20 * 1024 * 1024) {
      this.status = "Project archive exceeds 20 MiB.";
      return;
    }
    const epoch = ++this.epoch;
    this.busy = "preview";
    this.previewData = null;
    this.status = "Inspecting the project archive…";
    try {
      const query = this.selectionQuery();
      this.notifyCreation();
      const response = await fetch(`/api/project-import-previews${query.size ? `?${query}` : ""}`, {
        method: "POST",
        body: archive,
        credentials: "same-origin",
        headers: { "content-type": "application/zip" },
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (epoch !== this.epoch) return;
      if (!isProjectImportPreview(value)) throw new Error("The server returned an invalid project preview");
      this.previewData = value;
      if (!this.projectTitle.trim()) this.projectTitle = value.summary.title;
      if (value.source)
        this.selection = {
          entryPath: value.summary.entryPath,
          bibliographyPath: value.source.bibliographyPath,
          includePdfs: value.source.includePdfs,
        };
      this.attemptId = crypto.randomUUID();
      this.status =
        value.kind === "legacy"
          ? "This source bundle cannot restore a complete project. Export a Kirjolab project ZIP from the original project."
          : "Preview ready. Create an independent project with these files and references.";
    } catch (error) {
      if (epoch === this.epoch) this.status = errorMessage(error, "Could not inspect the project archive.");
    } finally {
      if (epoch === this.epoch) this.busy = null;
      if (epoch === this.epoch) this.notifyCreation();
    }
  }
  protected async confirm(): Promise<void> {
    const preview = this.previewData,
      archive = this.archiveFile;
    if (this.busy || !archive || !preview || preview.kind === "legacy" || !preview.previewDigest || !this.projectTitle.trim()) return;
    this.busy = "confirm";
    this.status = "Creating the project…";
    const epoch = this.epoch;
    this.notifyCreation();
    try {
      const query = new URLSearchParams({
        title: this.projectTitle,
        archiveSha256: preview.archiveSha256,
        previewDigest: preview.previewDigest,
        attemptId: this.attemptId,
      });
      for (const [key, value] of this.selectionQuery()) query.set(key, value);
      const response = await fetch(`/api/project-imports?${query}`, {
        method: "POST",
        body: archive,
        credentials: "same-origin",
        headers: { "content-type": "application/zip" },
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (epoch !== this.epoch) return;
      if (!isProjectImportResult(value)) throw new Error("The server returned invalid project data");
      location.assign(value.workspace.href);
    } catch (error) {
      if (epoch === this.epoch) this.status = errorMessage(error, "Could not create the project. Retry Create project.");
    } finally {
      if (epoch === this.epoch) this.busy = null;
      if (epoch === this.epoch) this.notifyCreation();
    }
  }
  protected override render(): TemplateResult {
    const preview = this.previewData;
    return html`<form class="p-5" id="project-import-form" @submit=${this.preview}>
      <p class="eyebrow">${preview?.kind === "source" ? "Source project" : "Project import"}</p>
      <h2 class="ui-heading mt-1">${preview ? "Review your project" : "Bring your writing into Kirjolab"}</h2>
      <p class="ui-supporting-text mt-2">
        Import a Markdown project folder ZIP or a Kirjolab export. Markdown, a selected BibTeX bibliography, images and PDFs are included.
        Maximum 20 MiB.
      </p>
      <label class="field-label mt-5" ?hidden=${this.standalone && preview !== null}
        >Project ZIP<input
          class="field"
          id="project-import-archive"
          type="file"
          accept=".zip,application/zip"
          required
          ?disabled=${this.busy !== null}
          @change=${this.archiveChanged}
      /></label>
      ${!preview ? this.renderPdfChoice() : nothing} ${preview ? this.renderPreview(preview) : nothing}
      <p class="ui-status mt-3" id="project-import-status" role="status">${this.status}</p>
      <div class="mt-5 flex justify-end gap-2">
        <button class="button-secondary" type="button" ?disabled=${this.busy !== null} @click=${this.cancel}>
          ${this.standalone ? "Choose another starting point" : "Cancel"}
        </button>
        <button
          class="button-secondary"
          id="preview-project-import"
          type="submit"
          ?hidden=${this.standalone && preview !== null}
          ?disabled=${this.busy !== null}
        >
          ${this.busy === "preview" ? "Inspecting…" : "Preview import"}
        </button>
        <button
          class="button-primary"
          id="confirm-project-import"
          type="button"
          ?hidden=${this.standalone && preview === null}
          ?disabled=${this.busy !== null || !preview || preview.kind === "legacy" || !this.projectTitle.trim()}
          @click=${this.confirm}
        >
          ${this.busy === "confirm" ? "Creating…" : "Create project"}
        </button>
      </div>
    </form>`;
  }
  private renderPreview(preview: ProjectImportPreview): TemplateResult {
    return html`<section class="mt-5 border-t border-app-line pt-4" id="project-import-preview">
      <p class="text-sm font-semibold">
        ${preview.summary.files} files · ${preview.summary.references} linked references · ${preview.summary.images} images ·
        ${preview.summary.pdfs} project PDFs · ${preview.summary.sharedSnapshots} shared snapshots
      </p>
      <p class="ui-status mt-2">Entry: ${preview.summary.entryPath || "Unavailable"}</p>
      ${
        preview.kind !== "legacy"
          ? html`<p class="ui-status mt-2">
                ${preview.reusedReferences} existing Library records reused · ${preview.newReferences} new records. Project citation aliases
                and snapshots are preserved.
              </p>
              <label class="field-label mt-4"
                >Project title<input
                  class="field"
                  id="project-import-title"
                  maxlength="120"
                  required
                  .value=${this.projectTitle}
                  ?disabled=${this.busy !== null}
                  @input=${this.updateTitle}
              /></label>`
          : nothing
      }
      ${
        preview.source
          ? html`<div class="mt-4 grid gap-3 sm:grid-cols-2">
              <label class="field-label"
                >Entry document<select
                  class="field"
                  id="project-import-entry"
                  .value=${preview.summary.entryPath}
                  ?disabled=${this.busy !== null}
                  @change=${this.entryChanged}
                >
                  ${preview.source.entryCandidates.map((path) => html`<option value=${path}>${path}</option>`)}
                </select></label
              >
              <label class="field-label"
                >Bibliography<select
                  class="field"
                  id="project-import-bibliography"
                  .value=${preview.source.bibliographyPath}
                  ?disabled=${this.busy !== null}
                  @change=${this.bibliographyChanged}
                >
                  <option value="">No bibliography</option>
                  ${preview.source.bibliographyCandidates.map((path) => html`<option value=${path}>${path}</option>`)}
                </select></label
              >
              ${this.renderPdfChoice()}
            </div>`
          : nothing
      }
      <p class="eyebrow mt-4">Excluded from this archive</p>
      <ul class="mt-2 space-y-1 text-xs text-app-text-soft">
        ${preview.summary.exclusions.map((value) => html`<li>${value}</li>`)}
      </ul>
    </section>`;
  }
  private selectionQuery(): URLSearchParams {
    const query = new URLSearchParams();
    if (this.selection.entryPath !== undefined) query.set("entryPath", this.selection.entryPath);
    if (this.selection.bibliographyPath !== undefined) query.set("bibliographyPath", this.selection.bibliographyPath);
    if (this.selection.includePdfs !== undefined) query.set("includePdfs", String(this.selection.includePdfs));
    return query;
  }
  private renderPdfChoice(): TemplateResult {
    return html`<label class="field-label mt-4 sm:col-span-2"
      ><span
        ><input
          type="checkbox"
          id="project-import-pdfs"
          .checked=${this.selection.includePdfs !== false}
          ?disabled=${this.busy !== null}
          @change=${this.pdfsChanged}
        />
        Include bundled PDFs when importing a source project</span
      ></label
    >`;
  }
  protected entryChanged(event: Event): void {
    this.selection = { ...this.selection, entryPath: (event.currentTarget as HTMLSelectElement).value };
    void this.preview(event);
  }
  protected bibliographyChanged(event: Event): void {
    this.selection = { ...this.selection, bibliographyPath: (event.currentTarget as HTMLSelectElement).value };
    void this.preview(event);
  }
  protected pdfsChanged(event: Event): void {
    this.selection = { ...this.selection, includePdfs: (event.currentTarget as HTMLInputElement).checked };
    if (this.previewData) void this.preview(event);
  }
}
if (typeof customElements !== "undefined" && !customElements.get("project-import-panel"))
  customElements.define("project-import-panel", ProjectImportPanel);
declare global {
  interface HTMLElementTagNameMap {
    "project-import-panel": ProjectImportPanel;
  }
}
