import { html, nothing, type TemplateResult } from "lit";
import { errorMessage, expectOk, jsonFetch } from "./http";
import { LightDomElement } from "./light-dom-controller";

type ReferenceImportKind = "bibtex" | "csl-json";

export interface LibraryReferenceImportRefresh {
  readonly message: string;
  readonly requestId: number;
}

export const libraryReferenceImportRefreshEvent = "library-reference-import-refresh";

export class LibraryReferenceImportControl extends LightDomElement {
  static override properties = {
    busy: { state: true },
    status: { state: true },
  };

  declare private busy: boolean;
  declare private status: string;
  private requestId = 0;

  constructor() {
    super();
    this.busy = false;
    this.status = "";
  }

  complete(requestId: number): void {
    if (requestId !== this.requestId) return;
    this.busy = false;
    this.status = "";
  }

  protected override render(): TemplateResult {
    return html`
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
        <span><strong>Reference data file</strong><small>CSL JSON (.json)</small></span>
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

  protected select(kind: ReferenceImportKind, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void this.importFile(kind, file);
  }

  async importFile(kind: ReferenceImportKind, file: File): Promise<void> {
    if (this.busy) return;
    const requestId = ++this.requestId;
    this.busy = true;
    this.status = "Importing references…";
    try {
      const content = await file.text();
      const response =
        kind === "bibtex"
          ? await jsonFetch("/api/library/import", { bibtex: content })
          : await fetch("/api/library/import/csl-json", {
              method: "POST",
              credentials: "same-origin",
              headers: { "content-type": "application/json" },
              body: content,
            });
      await expectOk(response);
      this.status = "Refreshing Library…";
      this.dispatchEvent(
        new CustomEvent<LibraryReferenceImportRefresh>(libraryReferenceImportRefreshEvent, {
          bubbles: true,
          detail: {
            message:
              kind === "bibtex"
                ? "References imported into your private library. Add only the ones this project uses."
                : "CSL JSON imported into the canonical library.",
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
