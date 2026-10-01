import { html, nothing, type TemplateResult } from "lit";
import type { ProjectArchiveSummary } from "../../domain/project/project-archive";
import { isProjectArchiveSummary } from "../../domain/project/project-interchange-contracts";
import { LightDomElement } from "../platform/light-dom-controller";
import { errorMessage, expectOk } from "../platform/http";

export class NativeProjectExport extends LightDomElement {
  static override properties = { summary: { state: true }, status: { state: true }, busy: { state: true } };
  declare private summary: ProjectArchiveSummary | null;
  declare private status: string;
  declare private busy: boolean;
  constructor() {
    super();
    this.summary = null;
    this.status = "";
    this.busy = false;
  }
  protected async preview(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.status = "";
    try {
      const response = await fetch(`${this.getAttribute("api-base")}/export/project-preview`, { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isProjectArchiveSummary(value)) throw new Error("The server returned an invalid export preview");
      this.summary = value;
    } catch (error) {
      this.status = errorMessage(error, "Could not inspect project export.");
    } finally {
      this.busy = false;
    }
  }
  protected async download(): Promise<void> {
    if (this.busy || !this.summary) return;
    this.busy = true;
    this.status = "Preparing the project archive…";
    try {
      const response = await fetch(`${this.getAttribute("api-base")}/export/project.zip`, { credentials: "same-origin" });
      await expectOk(response);
      this.saveArchive(await response.blob());
      this.status = "Project archive downloaded.";
    } catch (error) {
      this.status = errorMessage(error, "Could not export the project. Retry the download.");
    } finally {
      this.busy = false;
    }
  }
  protected saveArchive(blob: Blob): void {
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "kirjolab-project.zip";
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1_000);
  }
  protected override render(): TemplateResult {
    return html`<section class="mt-5 border-t border-app-line pt-4">
      <p class="eyebrow">Project transfer</p>
      <h3 class="mt-2 font-sans font-semibold">Kirjolab project (.zip)</h3>
      <p class="ui-supporting-text mt-2">Current files, linked references and project research, ready to import into Kirjolab.</p>
      ${
        this.summary
          ? html`<p class="ui-status mt-3">
                ${this.summary.files} files · ${this.summary.references} linked references · ${this.summary.images} images ·
                ${this.summary.pdfs} project PDFs · ${this.summary.sharedSnapshots} shared snapshots. Entry: ${this.summary.entryPath}
              </p>
              <p class="eyebrow mt-3">Excluded</p>
              <ul class="mt-2 space-y-1 text-xs text-app-text-soft">
                ${this.summary.exclusions.map((item) => html`<li>${item}</li>`)}
              </ul>
              <button class="button-primary mt-4" type="button" ?disabled=${this.busy} @click=${this.download}>
                Download Kirjolab project
              </button>`
          : nothing
      }
      <button class="button-secondary mt-4" type="button" ?disabled=${this.busy} @click=${this.preview}>
        ${this.busy ? "Inspecting…" : this.summary ? "Refresh scope" : "Inspect export scope"}
      </button>
      <p class="ui-status mt-3" role="status">${this.status}</p>
    </section>`;
  }
}
if (typeof customElements !== "undefined" && !customElements.get("native-project-export"))
  customElements.define("native-project-export", NativeProjectExport);
