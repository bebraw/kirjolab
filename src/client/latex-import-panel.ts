import { html, nothing, type TemplateResult } from "lit";
import { isLatexImportPreview, isLatexImportResult, type LatexImportPreview } from "./app-contracts";
import { LightDomElement } from "./light-dom-controller";
import { formatBytes } from "./format";
import { errorMessage, expectOk } from "./http";

type LatexImportBusyState = "confirm" | "preview" | null;
type LatexConversion = NonNullable<LatexImportPreview["conversion"]>;

export class LatexImportPanel extends LightDomElement {
  static override properties = {
    busy: { state: true },
    conversion: { state: true },
    previewDigest: { state: true },
    rootCandidates: { state: true },
    selectedRoot: { state: true },
    status: { state: true },
    projectTitle: { state: true },
  };

  declare private busy: LatexImportBusyState;
  declare private conversion: LatexConversion | null;
  declare private previewDigest: string | null;
  declare private rootCandidates: readonly string[];
  declare private selectedRoot: string;
  declare private status: string;
  declare private projectTitle: string;
  private bibliographyPath: string | null;

  constructor() {
    super();
    this.busy = null;
    this.conversion = null;
    this.previewDigest = null;
    this.rootCandidates = [];
    this.selectedRoot = "";
    this.status = "";
    this.projectTitle = "";
    this.bibliographyPath = null;
  }

  reset(): void {
    this.querySelector<HTMLFormElement>("#latex-import-form")?.reset();
    this.busy = null;
    this.conversion = null;
    this.previewDigest = null;
    this.rootCandidates = [];
    this.selectedRoot = "";
    this.status = "";
    this.projectTitle = "";
    this.bibliographyPath = null;
  }

  open(): void {
    this.reset();
    this.dialog.showModal();
    this.focusTitle();
  }

  close(): void {
    this.dialog.close();
  }

  focusTitle(): void {
    void this.updateComplete.then(() => this.querySelector<HTMLInputElement>("#latex-import-title")?.focus());
  }

  previewSucceeded(value: LatexImportPreview): void {
    this.busy = null;
    this.rootCandidates = value.archive.rootCandidates;
    this.selectedRoot = value.conversion?.report.rootPath ?? this.selectedRoot;
    this.conversion = value.conversion;
    this.previewDigest = value.conversion ? value.digest : null;
    this.bibliographyPath = value.conversion?.report.bibliographyPath ?? null;
    if (!value.conversion) {
      this.status = "Choose a root document, then preview again.";
      return;
    }
    const blocking = blockingDiagnosticCount(value.conversion);
    this.status = blocking
      ? `${blocking} blocking diagnostic${blocking === 1 ? " requires" : "s require"} review.`
      : "Preview ready. Confirmation repeats conversion before creating the project.";
  }

  previewFailed(message: string): void {
    this.busy = null;
    this.status = message;
  }

  confirmFailed(message: string): void {
    this.busy = null;
    this.status = message;
  }

  protected override render(): TemplateResult {
    const conversion = this.conversion;
    const blocking = conversion ? blockingDiagnosticCount(conversion) : 0;
    return html`
      <form class="p-5" id="latex-import-form" @submit=${this.preview}>
        <p class="eyebrow">One-time migration</p>
        <h2 class="mt-1 text-xl font-semibold tracking-[-0.035em]">Import a LaTeX archive</h2>
        <p class="mt-2 text-sm leading-6 text-app-text-soft">
          The server converts a bounded Overleaf ZIP into reviewable Markdown. Uploaded LaTeX is not stored or executed.
        </p>
        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <label class="field-label"
            >Project title<input
              class="field"
              id="latex-import-title"
              maxlength="120"
              required
              placeholder="Paper title"
              .value=${this.projectTitle}
              ?disabled=${this.busy !== null}
              @input=${this.updateTitle}
          /></label>
          <label class="field-label"
            >Overleaf archive<input
              class="field"
              id="latex-import-archive"
              type="file"
              accept=".zip,application/zip"
              required
              ?disabled=${this.busy !== null}
              @change=${this.archiveChanged}
          /></label>
          <label class="field-label sm:col-span-2" id="latex-root-field" ?hidden=${this.rootCandidates.length <= 1}
            >Root document<select
              class="field"
              id="latex-import-root"
              .value=${this.selectedRoot}
              ?disabled=${this.busy !== null}
              @change=${this.rootChanged}
            >
              ${this.rootCandidates.length > 1 && !this.selectedRoot ? html`<option value="">Choose a root document</option>` : nothing}
              ${this.rootCandidates.map((path) => html`<option value=${path}>${path}</option>`)}
            </select></label
          >
        </div>
        <div class="mt-5 border-t border-app-line pt-4" id="latex-import-preview" aria-live="polite">
          ${conversion
            ? this.renderConversion(conversion)
            : html`<p class="ui-status">Preview to inspect the converted Markdown and diagnostics.</p>`}
        </div>
        <p class="ui-status mt-3" id="latex-import-status" role="status">${this.status}</p>
        <div class="mt-5 flex justify-end gap-2">
          <button class="button-secondary" id="cancel-latex-import" type="button" ?disabled=${this.busy !== null} @click=${this.cancel}>
            Cancel
          </button>
          <button class="button-secondary" id="preview-latex-import" type="submit" ?disabled=${this.busy !== null}>
            ${this.busy === "preview" ? "Previewing…" : "Preview import"}
          </button>
          <button
            class="button-primary"
            id="confirm-latex-import"
            type="button"
            ?disabled=${this.busy !== null || !this.previewDigest || blocking > 0}
            @click=${this.confirm}
          >
            ${this.busy === "confirm" ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    `;
  }

  protected async preview(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (this.busy) return;
    const archive = this.archive();
    if (!archive) return;
    if (archive.size > 20 * 1024 * 1024) {
      this.status = "LaTeX archive exceeds 20 MiB.";
      return;
    }
    this.clearPreview();
    this.busy = "preview";
    this.status = "Inspecting and converting the archive on the server…";
    try {
      const query = new URLSearchParams();
      if (this.selectedRoot) query.set("root", this.selectedRoot);
      const response = await fetch(`/api/latex-import-previews${query.size ? `?${query.toString()}` : ""}`, {
        body: archive,
        credentials: "same-origin",
        headers: { "content-type": "application/zip" },
        method: "POST",
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isLatexImportPreview(value)) throw new Error("LaTeX import returned an invalid preview");
      this.previewSucceeded(value);
    } catch (error) {
      this.previewFailed(errorMessage(error, "Could not preview the LaTeX archive."));
    }
  }

  protected async confirm(): Promise<void> {
    const archive = this.archive();
    if (this.busy || !archive || !this.previewDigest || !this.conversion || blockingDiagnosticCount(this.conversion) > 0) return;
    this.busy = "confirm";
    this.status = "Repeating conversion and creating the project…";
    const query = new URLSearchParams({
      title: this.projectTitle,
      previewDigest: this.previewDigest,
      root: this.selectedRoot,
    });
    if (this.bibliographyPath) query.set("bibliography", this.bibliographyPath);
    try {
      const response = await fetch(`/api/latex-imports?${query.toString()}`, {
        body: archive,
        credentials: "same-origin",
        headers: { "content-type": "application/zip" },
        method: "POST",
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isLatexImportResult(value)) throw new Error("LaTeX import returned invalid project data");
      location.assign(value.workspace.href);
    } catch (error) {
      this.confirmFailed(errorMessage(error, "Could not import the LaTeX project."));
    }
  }

  protected cancel(): void {
    if (!this.busy) this.close();
  }

  protected updateTitle(event: Event): void {
    this.projectTitle = (event.currentTarget as HTMLInputElement).value;
  }

  protected archiveChanged(event: Event): void {
    const archive = (event.currentTarget as HTMLInputElement).files?.[0];
    this.clearPreview();
    this.rootCandidates = [];
    this.selectedRoot = "";
    this.status = "";
    if (archive && !this.projectTitle.trim()) this.projectTitle = archive.name.replace(/\.zip$/iu, "").replaceAll(/[_-]+/gu, " ");
  }

  protected rootChanged(event: Event): void {
    this.selectedRoot = (event.currentTarget as HTMLSelectElement).value;
    this.clearPreview();
    this.status = "Preview the selected root before creating the project.";
  }

  private renderConversion(conversion: LatexConversion): TemplateResult {
    const imageCount = conversion.assets.length;
    return html`
      <p class="text-sm font-semibold text-app-text">
        ${conversion.seed.files.length} Markdown files · ${imageCount} figure inputs detected ·
        ${conversion.seed.bibliography ? "bibliography selected" : "no bibliography"}
      </p>
      <div class="mt-3 space-y-2">
        ${conversion.seed.files.slice(0, 12).map(
          (file) => html`
            <details class="rounded-app border border-app-line px-3 py-2">
              <summary class="cursor-pointer font-sans text-xs font-semibold text-app-text">
                ${file.path} · ${formatBytes(new TextEncoder().encode(file.content).byteLength)}
              </summary>
              <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-app-text-soft">
${file.content.length > 1_200 ? `${file.content.slice(0, 1_200)}\n…` : file.content}</pre
              >
            </details>
          `,
        )}
      </div>
      <ul class="mt-3 space-y-1 font-sans text-xs text-app-text-soft">
        ${conversion.report.diagnostics
          .slice(0, 20)
          .map((diagnostic) => html`<li>${latexDiagnosticLabel(diagnostic.severity)}: ${diagnostic.message}</li>`)}
      </ul>
    `;
  }

  private archive(): File | undefined {
    return this.querySelector<HTMLInputElement>("#latex-import-archive")?.files?.[0];
  }

  private clearPreview(): void {
    this.conversion = null;
    this.previewDigest = null;
    this.bibliographyPath = null;
  }

  private get dialog(): HTMLDialogElement {
    const dialog = this.closest("dialog");
    if (!(dialog instanceof HTMLDialogElement)) throw new Error("LaTeX import panel requires a dialog parent");
    return dialog;
  }
}

function blockingDiagnosticCount(conversion: LatexConversion): number {
  return conversion.report.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
}

function latexDiagnosticLabel(severity: "error" | "warning" | "info"): string {
  if (severity === "error") return "Blocked";
  if (severity === "warning") return "Review";
  return "Note";
}

if (typeof customElements !== "undefined" && !customElements.get("latex-import-panel")) {
  customElements.define("latex-import-panel", LatexImportPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "latex-import-panel": LatexImportPanel;
  }
}
