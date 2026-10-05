import { html, nothing, type TemplateResult } from "lit";
import {
  isOpenAccessPdfDiscovery,
  isPdfDraftResult,
  type BibliographicRecord,
  type OpenAccessPdfCandidate,
} from "../../domain/reference-library";
import { expectOk } from "../platform/http";
import { LightDomHost } from "../platform/light-dom-controller";

export const openAccessPdfImportedEvent = "open-access-pdf-imported";

export class OpenAccessPdfDialog extends LightDomHost {
  static override properties = {
    attachmentAvailable: { state: true },
    candidate: { state: true },
    error: { state: true },
    pending: { state: true },
    reference: { state: true },
  };

  declare private attachmentAvailable: boolean;
  declare private candidate: OpenAccessPdfCandidate | null;
  declare private error: string;
  declare private pending: "discover" | "import" | "upload" | null;
  declare private reference: BibliographicRecord | null;

  constructor() {
    super();
    this.attachmentAvailable = false;
    this.candidate = null;
    this.error = "";
    this.pending = null;
    this.reference = null;
  }

  async open(reference: BibliographicRecord): Promise<void> {
    this.reference = reference;
    this.attachmentAvailable = false;
    this.candidate = null;
    this.error = "";
    this.pending = "discover";
    this.dialog()?.showModal();
    try {
      const response = await fetch(`/api/library/references/${reference.id}/open-pdf/discover`, {
        method: "POST",
        credentials: "same-origin",
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isOpenAccessPdfDiscovery(value)) throw new Error("Open PDF discovery returned an invalid response");
      this.candidate = value.candidate;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Open PDF discovery failed";
    } finally {
      this.pending = null;
    }
  }

  protected override render(): TemplateResult {
    const candidate = this.candidate;
    return html`<dialog class="ui-dialog open-access-pdf-dialog" @close=${this.reset} @cancel=${this.cancel}>
      <header class="ui-dialog-header">
        <p class="eyebrow">Open-access acquisition</p>
        <h2>Find open PDF</h2>
        <p>${this.reference?.title ?? "Library reference"}</p>
      </header>
      <div class="ui-dialog-body open-access-pdf-body">
        ${this.error ? html`<p class="ui-status" data-tone="error" role="alert">${this.error}</p>` : nothing} ${this.renderReview()}
        ${
          this.attachmentAvailable
            ? html`<p class="open-access-pdf-note" id="open-access-pdf-upload-help">
                  Open the PDF location or provider landing page in your browser, download the PDF, then attach it here to this reference.
                  Maximum size: 25 MB.
                </p>
                <input
                  class="sr-only"
                  id="open-access-pdf-upload"
                  type="file"
                  accept=".pdf,application/pdf"
                  aria-label="Attach PDF to this reference"
                  aria-describedby="open-access-pdf-upload-help"
                  ?disabled=${Boolean(this.pending)}
                  @change=${this.selectPdf}
                />`
            : nothing
        }
      </div>
      <footer class="ui-dialog-actions">
        <button class="button-secondary" type="button" ?disabled=${Boolean(this.pending)} @click=${this.close}>Close</button>
        ${
          candidate
            ? html`<button
                class=${this.attachmentAvailable ? "button-secondary" : "button-primary"}
                type="button"
                ?disabled=${Boolean(this.pending)}
                @click=${this.importCandidate}
              >
                ${this.pending === "import" ? "Importing…" : "Import private PDF"}
              </button>`
            : nothing
        }
        ${this.attachmentAvailable ? html`<button class="button-primary" type="button" ?disabled=${Boolean(this.pending)} aria-busy=${this.pending === "upload" ? "true" : "false"} @click=${this.choosePdf}>${this.pending === "upload" ? "Attaching…" : "Attach PDF"}</button>` : nothing}
      </footer>
    </dialog>`;
  }

  private renderReview(): TemplateResult {
    const messages = {
      discover: "Checking trusted scholarly providers…",
      import: "Downloading the reviewed PDF…",
      upload: "Attaching the selected PDF…",
    };
    return html`
      ${this.pending ? html`<p role="status">${messages[this.pending]}</p>` : nothing}
      ${this.candidate ? this.renderCandidate(this.candidate) : this.pending || this.error ? nothing : html`<p role="status">No provider supplied a directly downloadable open PDF for this DOI.</p>`}
    `;
  }

  private renderCandidate(candidate: OpenAccessPdfCandidate): TemplateResult {
    return html`<dl class="open-access-pdf-facts">
        <div>
          <dt>Provider</dt>
          <dd>${candidate.provider === "openalex" ? "OpenAlex" : "Unpaywall"}</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>${candidate.license || "Not reported — sharing rights remain unknown"}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>${candidate.version || "Not reported"}</dd>
        </div>
      </dl>
      <p class="open-access-pdf-location">
        <a href=${candidate.pdfUrl} target="_blank" rel="noopener noreferrer">Review exact PDF location ↗</a>
        ${
          candidate.landingUrl
            ? html`<a href=${candidate.landingUrl} target="_blank" rel="noopener noreferrer">Provider landing page ↗</a>`
            : nothing
        }
      </p>
      <p class="open-access-pdf-note">Import stores an owner-only copy. Confirm sharing rights separately before sharing it.</p>`;
  }

  protected async importCandidate(): Promise<void> {
    const reference = this.reference;
    const candidate = this.candidate;
    if (!reference || !candidate || this.pending) return;
    this.pending = "import";
    this.error = "";
    try {
      const response = await fetch(`/api/library/references/${reference.id}/open-pdf/import`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: candidate.provider, fingerprint: candidate.fingerprint }),
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isPdfDraftResult(value)) throw new Error("Open PDF import returned an invalid response");
      this.dialog()?.close();
      this.dispatchEvent(
        new CustomEvent<string>(openAccessPdfImportedEvent, {
          bubbles: true,
          detail: value.created ? "Open PDF imported; analysis is queued." : "This PDF was already in the Library.",
        }),
      );
    } catch (error) {
      this.attachmentAvailable = true;
      this.error = error instanceof Error ? error.message : "Open PDF import failed";
    } finally {
      this.pending = null;
    }
  }

  protected selectPdf(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    void this.uploadPdf(input.files?.[0] ?? null).finally(() => {
      input.value = "";
    });
  }

  async uploadPdf(file: File | null): Promise<void> {
    const reference = this.reference;
    if (!file || !reference || !this.attachmentAvailable || this.pending) return;
    if (file.type !== "application/pdf" && !(file.type === "" && /\.pdf$/iu.test(file.name))) {
      this.error = "Choose a PDF file.";
      return;
    }
    if (file.size === 0 || file.size > 25 * 1024 * 1024) {
      this.error = file.size === 0 ? "Choose a non-empty PDF file." : "PDF exceeds the 25 MB limit";
      return;
    }
    this.pending = "upload";
    this.error = "";
    try {
      const response = await fetch(`/api/library/references/${encodeURIComponent(reference.id)}/pdfs`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent(file.name) },
        body: file,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isPdfDraftResult(value)) throw new Error("PDF attachment returned an invalid response");
      this.dialog()?.close();
      this.dispatchEvent(
        new CustomEvent<string>(openAccessPdfImportedEvent, {
          bubbles: true,
          detail: value.created ? "PDF attached; analysis is queued." : "This PDF was already attached to this reference.",
        }),
      );
    } catch (error) {
      this.error = error instanceof Error ? error.message : "PDF attachment failed";
    } finally {
      this.pending = null;
    }
  }

  private readonly choosePdf = (): void => this.querySelector<HTMLInputElement>("#open-access-pdf-upload")?.click();

  private readonly cancel = (event: Event): void => {
    if (this.pending) event.preventDefault();
  };

  private readonly close = (): void => this.dialog()?.close();

  private readonly reset = (): void => {
    this.attachmentAvailable = false;
    this.candidate = null;
    this.error = "";
    this.pending = null;
    this.reference = null;
  };

  protected dialog(): HTMLDialogElement | null {
    return this.querySelector("dialog");
  }
}

if (typeof customElements !== "undefined" && !customElements.get("open-access-pdf-dialog")) {
  customElements.define("open-access-pdf-dialog", OpenAccessPdfDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "open-access-pdf-dialog": OpenAccessPdfDialog;
  }
}
