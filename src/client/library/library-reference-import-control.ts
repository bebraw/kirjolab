import { html, nothing, type TemplateResult } from "lit";
import { errorMessage, expectOk, jsonFetch } from "../platform/http";
import { LightDomElement } from "../platform/light-dom-controller";
import { isWorkspaceSnapshot, type WorkspaceSnapshot } from "../../domain/workspace/workspace";

type ReferenceImportKind = "bibtex" | "csl-json";

export interface LibraryReferenceImportRefresh {
  readonly message: string;
  readonly projectSnapshot: WorkspaceSnapshot | null;
  readonly requestId: number;
}

export const libraryReferenceImportRefreshEvent = "library-reference-import-refresh";

export class LibraryReferenceImportControl extends LightDomElement {
  static override properties = {
    busy: { state: true },
    destination: { state: true },
    projectApiBase: { state: true },
    status: { state: true },
  };

  declare private busy: boolean;
  declare private destination: "project" | "library";
  declare private projectApiBase: string | null;
  declare private status: string;
  private requestId = 0;

  constructor() {
    super();
    this.busy = false;
    this.destination = "library";
    this.projectApiBase = null;
    this.status = "";
  }

  configure(projectApiBase: string | null): void {
    if (projectApiBase === this.projectApiBase) return;
    this.projectApiBase = projectApiBase;
    this.destination = projectApiBase ? "project" : "library";
  }

  complete(requestId: number): void {
    if (requestId !== this.requestId) return;
    this.busy = false;
    this.status = "";
  }

  protected override render(): TemplateResult {
    return html`
      ${
        this.projectApiBase
          ? html`
              <label class="field-label px-3 py-2" for="library-bibliography-destination"
                >BibTeX destination
                <select
                  class="field"
                  id="library-bibliography-destination"
                  .value=${this.destination}
                  ?disabled=${this.busy}
                  @input=${this.changeDestination}
                >
                  <option value="project">This project</option>
                  <option value="library">Library only</option>
                </select>
              </label>
              <p class="ui-status px-3 pb-2">
                ${this.destination === "project" ? "Import and add all references to this project." : "Import into your private Library for later use."}
              </p>
            `
          : nothing
      }
      <label class="library-menu-action" title="Import references from a BibTeX file">
        <span><strong>Bibliography file</strong><small>BibTeX (.bib)</small></span>
        <input
          class="sr-only"
          id="library-bibliography-upload"
          type="file"
          accept=".bib,application/x-bibtex,text/plain"
          ?disabled=${this.busy}
          @change=${(event: Event) => this.select("bibtex", event)}
        />
      </label>
      <label class="library-menu-action" title="Import references from a CSL JSON file">
        <span><strong>Reference data file</strong><small>CSL JSON (.json) · Library only</small></span>
        <input
          class="sr-only"
          id="library-csl-upload"
          type="file"
          accept=".json,application/json"
          ?disabled=${this.busy}
          @change=${(event: Event) => this.select("csl-json", event)}
        />
      </label>
      ${this.status ? html`<p class="ui-status px-3 py-2" role="status">${this.status}</p>` : nothing}
    `;
  }

  protected changeDestination(event: Event): void {
    this.destination = (event.currentTarget as HTMLSelectElement).value === "project" ? "project" : "library";
  }

  protected select(kind: ReferenceImportKind, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void this.importFile(kind, file);
  }

  async importFile(kind: ReferenceImportKind, file: File): Promise<void> {
    if (this.busy) return;
    const requestId = ++this.requestId;
    const projectApiBase = kind === "bibtex" && this.destination === "project" ? this.projectApiBase : null;
    this.busy = true;
    this.status = "Importing references…";
    try {
      const content = await file.text();
      const response =
        kind === "bibtex"
          ? await jsonFetch(projectApiBase ? `${projectApiBase}/bibliography/import` : "/api/library/import", { bibtex: content })
          : await fetch("/api/library/import/csl-json", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: content,
            });
      await expectOk(response);
      let projectSnapshot: WorkspaceSnapshot | null = null;
      if (projectApiBase) {
        const value: unknown = await response.json();
        if (!isWorkspaceSnapshot(value)) throw new Error("Project import returned an invalid workspace");
        projectSnapshot = value;
      }
      this.status = "Refreshing Library…";
      this.dispatchEvent(
        new CustomEvent<LibraryReferenceImportRefresh>(libraryReferenceImportRefreshEvent, {
          bubbles: true,
          detail: {
            message: projectSnapshot
              ? "References imported and added to this project."
              : kind === "bibtex"
                ? "References imported into your private Library."
                : "CSL JSON imported into the canonical library.",
            projectSnapshot,
            requestId,
          },
        }),
      );
    } catch (error) {
      this.busy = false;
      this.status = errorMessage(error, "Could not import the reference file.");
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-reference-import-control")) {
  customElements.define("library-reference-import-control", LibraryReferenceImportControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-reference-import-control": LibraryReferenceImportControl;
  }
}
