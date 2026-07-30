import { html, nothing, type TemplateResult } from "lit";
import { LightDomElement } from "../platform/light-dom-controller";
import {
  isPublicationIntakePreview,
  type PublicationIntakePreview,
  type PublicationPdfLink,
  type PublicationResource,
} from "../../domain/workspace/workspace";
import { bibTeXDisplayText } from "../../domain/reference-library/bibliography";
import { errorMessage, expectOk, jsonFetch } from "../platform/http";
import { createPublicationIntakeActor, publicationIntakeBusy } from "./publication-intake-machine";

export const publicationIntakeActionEvent = "publication-intake-action";

export type PublicationIntakeAction =
  | { readonly action: "accepted"; readonly doi: string; readonly requestId: number }
  | { readonly action: "open-reference"; readonly publicationId: string };

interface PublicationIntakeView {
  readonly busy: boolean;
  readonly preview: PublicationIntakePreview | null;
  readonly publications: readonly PublicationResource[];
}

export class PublicationIntakePanel extends LightDomElement {
  static override properties = {
    citationKey: { state: true },
    doi: { state: true },
    status: { state: true },
    view: { state: true },
  };

  declare private citationKey: string;
  declare private doi: string;
  declare private status: string;
  declare private view: PublicationIntakeView;
  private apiBase = "";
  private previewFingerprint: string | null;
  private readonly workflow = createPublicationIntakeActor();

  constructor() {
    super();
    this.citationKey = "";
    this.doi = "";
    this.status = "Looking up a DOI does not change the library.";
    this.view = { busy: false, preview: null, publications: [] };
    this.previewFingerprint = null;
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  setPdf(pdfId: string, publications: readonly PublicationResource[], links: readonly PublicationPdfLink[]): void {
    if (this.workflow.getSnapshot().context.pdfId !== pdfId) this.workflow.send({ type: "OPEN", pdfId });
    const linked = links
      .filter((link) => link.pdfId === pdfId)
      .flatMap((link) => publications.filter((publication) => publication.id === link.publicationId));
    this.syncView(linked);
    if (linked.length > 0) {
      this.status = `${linked.length} ${linked.length === 1 ? "reference is" : "references are"} connected to this PDF.`;
    }
  }

  private setView(view: PublicationIntakeView): void {
    const fingerprint = view.preview?.metadataFingerprint ?? null;
    if (fingerprint && fingerprint !== this.previewFingerprint) this.citationKey = view.preview?.citationKey ?? "";
    this.previewFingerprint = fingerprint;
    this.view = view;
  }

  private focusCitationKey(): void {
    void this.updateComplete.then(() => this.querySelector<HTMLInputElement>("#publication-intake-key")?.focus());
  }

  private focusDoi(): void {
    void this.updateComplete.then(() => this.querySelector<HTMLInputElement>("#publication-intake-doi")?.focus());
  }

  completeAcceptance(requestId: number): boolean {
    this.workflow.send({ type: "ACCEPTED", requestId });
    if (!this.workflow.getSnapshot().matches("idle")) return false;
    this.status = "Reference added and PDF connected. Citation remains a separate action.";
    this.syncView();
    return true;
  }

  failAcceptance(requestId: number, error: unknown): void {
    const message = errorMessage(error, "Publication intake failed");
    this.workflow.send({ type: "ACCEPT_FAILED", requestId, message });
    if (!this.workflow.getSnapshot().matches("reviewing")) return;
    this.status = message;
    this.syncView();
    this.focusCitationKey();
  }

  protected override render(): TemplateResult {
    const linked = this.view.publications.length > 0;
    const preview = this.view.preview;
    return html`
      <p class="mt-2 text-xs leading-5 text-app-text-soft">Review DOI metadata before adding the reference and connecting this PDF.</p>
      <form class="publication-intake-form" id="publication-intake-form" ?hidden=${linked} @submit=${this.preview}>
        <label class="field-label" for="publication-intake-doi">DOI</label>
        <div class="publication-intake-lookup-row">
          <input
            class="field"
            id="publication-intake-doi"
            type="text"
            inputmode="url"
            maxlength="500"
            required
            autocomplete="off"
            placeholder="10.1234/example or doi.org URL"
            .value=${this.doi}
            ?disabled=${this.view.busy}
            @input=${this.updateDoi}
          />
          <button class="button-secondary justify-center" type="submit" ?disabled=${this.view.busy}>Look up DOI</button>
        </div>
      </form>
      <p class="publication-intake-status" id="publication-intake-status" role="status" aria-live="polite">${this.status}</p>
      <div class="publication-intake-review" id="publication-intake-review" ?hidden=${linked || !preview}>
        ${
          preview
            ? html`
                <p class="eyebrow">Review metadata</p>
                <h3 class="publication-intake-title" id="publication-intake-title">${preview.metadata.title}</h3>
                <p class="publication-intake-meta" id="publication-intake-meta">
                  ${[
                    preview.metadata.type,
                    preview.metadata.authors.join("; "),
                    preview.metadata.year,
                    preview.metadata.venue,
                    `doi:${preview.doi}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <label class="field-label mt-3" for="publication-intake-key">
                  Citation key
                  <input
                    class="field"
                    id="publication-intake-key"
                    type="text"
                    maxlength="200"
                    required
                    autocomplete="off"
                    .value=${this.citationKey}
                    ?disabled=${this.view.busy}
                    @input=${this.updateCitationKey}
                  />
                </label>
                <div class="publication-intake-actions">
                  <button
                    class="button-primary justify-center"
                    id="publication-intake-accept"
                    type="button"
                    ?disabled=${this.view.busy}
                    @click=${this.accept}
                  >
                    Add to library &amp; connect
                  </button>
                  <button
                    class="button-secondary justify-center"
                    id="publication-intake-cancel"
                    type="button"
                    ?disabled=${this.view.busy}
                    @click=${this.cancel}
                  >
                    Cancel
                  </button>
                </div>
              `
            : nothing
        }
      </div>
      <div class="publication-intake-linked" id="publication-intake-linked" ?hidden=${!linked}>
        <p class="eyebrow">Linked reference</p>
        <div class="publication-intake-linked-list" id="publication-intake-linked-list">
          ${this.view.publications.map(
            (publication) => html`
              <div class="resource-card mt-2 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="eyebrow">Reference · ${publication.citationKey}</p>
                  <h4 class="mt-1 text-base font-semibold">${bibTeXDisplayText(publication.title)}</h4>
                </div>
                <button type="button" class="button-secondary shrink-0" data-publication-id=${publication.id} @click=${this.openReference}>
                  Open reference
                </button>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  protected async preview(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const pdfId = this.workflow.getSnapshot().context.pdfId;
    if (this.view.busy || !this.doi.trim() || !pdfId) return;
    this.workflow.send({ type: "START_PREVIEW" });
    const requestId = this.workflow.getSnapshot().context.requestId;
    this.status = "Looking up DOI metadata…";
    this.syncView();
    try {
      const response = await jsonFetch(`${this.apiBase}/publication-intake/preview`, { pdfId, doi: this.doi });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isPublicationIntakePreview(value)) throw new Error("Publication intake returned an invalid preview");
      this.workflow.send({ type: "PREVIEW_READY", requestId, preview: value });
      const current = this.workflow.getSnapshot();
      if (!current.matches("reviewing") || current.context.preview !== value) return;
      this.status = value.existingPublicationId
        ? "This DOI is already in the library. Review the existing key, then connect this PDF."
        : "Review the metadata and citation key before adding it.";
      this.syncView();
      this.focusCitationKey();
    } catch (error) {
      const message = errorMessage(error, "DOI lookup failed");
      this.workflow.send({ type: "PREVIEW_FAILED", requestId, message });
      if (this.workflow.getSnapshot().matches("failed")) this.status = message;
    } finally {
      this.syncView();
    }
  }

  protected async accept(): Promise<void> {
    const preview = this.workflow.getSnapshot().context.preview;
    if (this.view.busy || !preview) return;
    this.workflow.send({ type: "ACCEPT" });
    const requestId = this.workflow.getSnapshot().context.requestId;
    this.status = "Adding the reference and connecting this PDF…";
    this.syncView();
    try {
      const response = await jsonFetch(`${this.apiBase}/publication-intake/accept`, {
        pdfId: preview.pdfId,
        doi: preview.doi,
        citationKey: this.citationKey,
        metadataFingerprint: preview.metadataFingerprint,
      });
      await expectOk(response);
      const current = this.workflow.getSnapshot();
      if (!current.matches("accepting") || current.context.pdfId !== preview.pdfId || current.context.requestId !== requestId) return;
      this.emit({ action: "accepted", doi: preview.doi, requestId });
    } catch (error) {
      this.failAcceptance(requestId, error);
    } finally {
      this.syncView();
    }
  }

  protected cancel(): void {
    if (this.view.busy || !this.view.preview) return;
    this.workflow.send({ type: "CANCEL" });
    this.status = "Lookup cancelled. The library and PDF are unchanged.";
    this.syncView();
    this.focusDoi();
  }

  protected openReference(event: Event): void {
    const publicationId = (event.currentTarget as HTMLButtonElement).dataset.publicationId;
    if (publicationId) this.emit({ action: "open-reference", publicationId });
  }

  protected updateDoi(event: Event): void {
    this.doi = (event.currentTarget as HTMLInputElement).value;
  }

  protected updateCitationKey(event: Event): void {
    this.citationKey = (event.currentTarget as HTMLInputElement).value;
  }

  private emit(detail: PublicationIntakeAction): void {
    this.dispatchEvent(new CustomEvent(publicationIntakeActionEvent, { bubbles: true, composed: true, detail }));
  }

  private syncView(publications = this.view.publications): void {
    const snapshot = this.workflow.getSnapshot();
    this.setView({
      busy: publicationIntakeBusy(snapshot),
      preview: snapshot.context.preview,
      publications,
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("publication-intake-panel")) {
  customElements.define("publication-intake-panel", PublicationIntakePanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "publication-intake-panel": PublicationIntakePanel;
  }
}
