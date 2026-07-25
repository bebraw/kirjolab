import { html, LitElement, nothing, type TemplateResult } from "lit";
import type { PublicationIntakePreview, PublicationResource } from "../domain/workspace";
import { bibTeXDisplayText } from "../domain/bibliography";

export const publicationIntakeActionEvent = "publication-intake-action";

export type PublicationIntakeAction =
  | { readonly action: "accept"; readonly citationKey: string }
  | { readonly action: "cancel" }
  | { readonly action: "open-reference"; readonly publicationId: string }
  | { readonly action: "preview"; readonly doi: string };

interface PublicationIntakeView {
  readonly busy: boolean;
  readonly preview: PublicationIntakePreview | null;
  readonly publications: readonly PublicationResource[];
}

export class PublicationIntakePanel extends LitElement {
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
  private previewFingerprint: string | null;

  constructor() {
    super();
    this.citationKey = "";
    this.doi = "";
    this.status = "Looking up a DOI does not change the library.";
    this.view = { busy: false, preview: null, publications: [] };
    this.previewFingerprint = null;
  }

  setView(view: PublicationIntakeView): void {
    const fingerprint = view.preview?.metadataFingerprint ?? null;
    if (fingerprint && fingerprint !== this.previewFingerprint) this.citationKey = view.preview?.citationKey ?? "";
    this.previewFingerprint = fingerprint;
    this.view = view;
  }

  setStatus(status: string): void {
    this.status = status;
  }

  focusCitationKey(): void {
    void this.updateComplete.then(() => this.querySelector<HTMLInputElement>("#publication-intake-key")?.focus());
  }

  focusDoi(): void {
    void this.updateComplete.then(() => this.querySelector<HTMLInputElement>("#publication-intake-doi")?.focus());
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
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
        ${preview
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
          : nothing}
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

  protected preview(event: SubmitEvent): void {
    event.preventDefault();
    if (!this.view.busy && this.doi.trim()) this.emit({ action: "preview", doi: this.doi });
  }

  protected accept(): void {
    if (!this.view.busy && this.view.preview) this.emit({ action: "accept", citationKey: this.citationKey });
  }

  protected cancel(): void {
    if (!this.view.busy && this.view.preview) this.emit({ action: "cancel" });
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
}

if (typeof customElements !== "undefined" && !customElements.get("publication-intake-panel")) {
  customElements.define("publication-intake-panel", PublicationIntakePanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "publication-intake-panel": PublicationIntakePanel;
  }
}
