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
  static override properties = { candidate: { state: true }, error: { state: true }, pending: { state: true }, reference: { state: true } };

  declare private candidate: OpenAccessPdfCandidate | null;
  declare private error: string;
  declare private pending: boolean;
  declare private reference: BibliographicRecord | null;

  constructor() {
    super();
    this.candidate = null;
    this.error = "";
    this.pending = false;
    this.reference = null;
  }

  async open(reference: BibliographicRecord): Promise<void> {
    this.reference = reference;
    this.candidate = null;
    this.error = "";
    this.pending = true;
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
      this.pending = false;
    }
  }

  protected override render(): TemplateResult {
    const candidate = this.candidate;
    return html`<dialog class="ui-dialog open-access-pdf-dialog" @close=${this.reset}>
      <header class="ui-dialog-header">
        <p class="eyebrow">Open-access acquisition</p>
        <h2>Find open PDF</h2>
        <p>${this.reference?.title ?? "Library reference"}</p>
      </header>
      <div class="ui-dialog-body open-access-pdf-body">
        ${
          this.pending
            ? html`<p role="status">Checking trusted scholarly providers…</p>`
            : this.error
              ? html`<p class="ui-status" data-tone="error" role="alert">${this.error}</p>`
              : candidate
                ? this.renderCandidate(candidate)
                : html`<p role="status">No provider supplied a directly downloadable open PDF for this DOI.</p>`
        }
      </div>
      <footer class="ui-dialog-actions">
        <button class="button-secondary" type="button" @click=${this.close}>Close</button>
        ${
          candidate
            ? html`<button class="button-primary" type="button" ?disabled=${this.pending} @click=${this.importCandidate}>
                ${this.pending ? "Importing…" : "Import private PDF"}
              </button>`
            : nothing
        }
      </footer>
    </dialog>`;
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
    this.pending = true;
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
      this.error = error instanceof Error ? error.message : "Open PDF import failed";
    } finally {
      this.pending = false;
    }
  }

  private readonly close = (): void => this.dialog()?.close();

  private readonly reset = (): void => {
    this.candidate = null;
    this.error = "";
    this.pending = false;
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
