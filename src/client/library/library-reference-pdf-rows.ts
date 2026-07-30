import { html, nothing, type TemplateResult } from "lit";
import { LightDomElement } from "../platform/light-dom-controller";
import type { BibliographicRecord, LibraryPdfArtifact } from "../../domain/reference-library";
import { errorMessage, expectOk, jsonFetch } from "../platform/http";

export type LibraryReferencePdfAction =
  | { readonly action: "open"; readonly artifact: LibraryPdfArtifact }
  | { readonly action: "refine"; readonly artifact: LibraryPdfArtifact; readonly reference: BibliographicRecord };

export const libraryReferencePdfActionEvent = "library-reference-pdf-action";
export const libraryReferencePdfRefreshEvent = "library-reference-pdf-refresh";

export class LibraryReferencePdfRows extends LightDomElement {
  static override properties = {
    artifacts: { state: true },
    linked: { state: true },
    reference: { state: true },
    savingArtifactId: { state: true },
    status: { state: true },
  };

  declare artifacts: readonly LibraryPdfArtifact[];
  declare linked: boolean;
  declare reference: BibliographicRecord | null;
  declare private savingArtifactId: string;
  declare private status: string;

  constructor() {
    super();
    this.artifacts = [];
    this.linked = false;
    this.reference = null;
    this.savingArtifactId = "";
    this.status = "";
  }

  setData(reference: BibliographicRecord, artifacts: readonly LibraryPdfArtifact[], linked: boolean): void {
    this.reference = reference;
    this.artifacts = artifacts;
    this.linked = linked;
    this.savingArtifactId = "";
    this.status = "";
  }

  protected override render(): TemplateResult {
    const primaryId = this.artifacts[0]?.id;
    return html`${this.artifacts.map((artifact) => this.renderArtifact(artifact, primaryId))}
    ${this.status ? html`<p class="status-text mt-2" role="status">${this.status}</p>` : nothing}`;
  }

  protected async setRights(artifactId: string, event: Event): Promise<void> {
    const rights = (event.currentTarget as HTMLSelectElement).value;
    if (this.savingArtifactId || (rights !== "private" && rights !== "unknown" && rights !== "shareable")) return;
    this.savingArtifactId = artifactId;
    this.status = "Saving rights…";
    try {
      await expectOk(await jsonFetch(`/api/library/pdfs/${encodeURIComponent(artifactId)}/rights`, { rights }, "PUT"));
      this.status = "";
      this.dispatchEvent(new CustomEvent(libraryReferencePdfRefreshEvent, { bubbles: true }));
    } catch (error) {
      this.status = errorMessage(error, "Could not save PDF rights.");
    } finally {
      this.savingArtifactId = "";
    }
  }

  protected refine(artifact: LibraryPdfArtifact): void {
    if (this.reference) this.emitAction({ action: "refine", artifact, reference: this.reference });
  }

  protected emitAction(action: LibraryReferencePdfAction): void {
    this.dispatchEvent(new CustomEvent<LibraryReferencePdfAction>(libraryReferencePdfActionEvent, { bubbles: true, detail: action }));
  }

  private renderArtifact(artifact: LibraryPdfArtifact, primaryId: string | undefined): TemplateResult {
    return html`
      <div class="rounded-sm border border-app-line p-2">
        <p class="font-sans text-xs leading-5 text-app-text-soft">PDF · ${artifact.name}</p>
        ${
          this.linked
            ? html`<p class="mt-1 font-sans text-xs leading-5 text-app-text-soft">
                Available to signed-in project members; excluded from public links.
              </p>`
            : nothing
        }
        <button class="button-secondary mt-2" type="button" @click=${() => this.emitAction({ action: "open", artifact })}>Open PDF</button>
        <select
          class="field mt-2"
          .value=${artifact.rights}
          ?disabled=${Boolean(this.savingArtifactId)}
          @change=${(event: Event) => void this.setRights(artifact.id, event)}
        >
          <option value="private">Rights: private</option>
          <option value="unknown">Rights: unknown</option>
          <option value="shareable">Rights: shareable</option>
        </select>
        ${
          artifact.id === primaryId
            ? nothing
            : html`<button class="button-secondary mt-2" type="button" @click=${() => this.refine(artifact)}>Refine from this PDF</button>`
        }
      </div>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-reference-pdf-rows")) {
  customElements.define("library-reference-pdf-rows", LibraryReferencePdfRows);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-reference-pdf-rows": LibraryReferencePdfRows;
  }
}
