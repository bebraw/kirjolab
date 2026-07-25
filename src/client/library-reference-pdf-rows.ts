import { html, LitElement, nothing, type TemplateResult } from "lit";
import type { BibliographicRecord, LibraryPdfArtifact } from "../domain/reference-library";

export type LibraryReferencePdfAction =
  | { readonly action: "open"; readonly artifact: LibraryPdfArtifact }
  | { readonly action: "set-rights"; readonly artifactId: string; readonly rights: LibraryPdfArtifact["rights"] }
  | { readonly action: "refine"; readonly artifact: LibraryPdfArtifact; readonly reference: BibliographicRecord };

export const libraryReferencePdfActionEvent = "library-reference-pdf-action";

export class LibraryReferencePdfRows extends LitElement {
  static override properties = {
    artifacts: { state: true },
    linked: { state: true },
    reference: { state: true },
  };

  declare artifacts: readonly LibraryPdfArtifact[];
  declare linked: boolean;
  declare reference: BibliographicRecord | null;

  constructor() {
    super();
    this.artifacts = [];
    this.linked = false;
    this.reference = null;
  }

  setData(reference: BibliographicRecord, artifacts: readonly LibraryPdfArtifact[], linked: boolean): void {
    this.reference = reference;
    this.artifacts = artifacts;
    this.linked = linked;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const primaryId = this.artifacts[0]?.id;
    return html`${this.artifacts.map((artifact) => this.renderArtifact(artifact, primaryId))}`;
  }

  protected setRights(artifactId: string, event: Event): void {
    const rights = (event.currentTarget as HTMLSelectElement).value;
    if (rights === "private" || rights === "unknown" || rights === "shareable") {
      this.emitAction({ action: "set-rights", artifactId, rights });
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
        ${this.linked
          ? html`<p class="mt-1 font-sans text-xs leading-5 text-app-text-soft">
              Available to signed-in project members; excluded from public links.
            </p>`
          : nothing}
        <button class="button-secondary mt-2" type="button" @click=${() => this.emitAction({ action: "open", artifact })}>Open PDF</button>
        <select class="field mt-2" .value=${artifact.rights} @change=${(event: Event) => this.setRights(artifact.id, event)}>
          <option value="private">Rights: private</option>
          <option value="unknown">Rights: unknown</option>
          <option value="shareable">Rights: shareable</option>
        </select>
        ${artifact.id === primaryId
          ? nothing
          : html`<button class="button-secondary mt-2" type="button" @click=${() => this.refine(artifact)}>Refine from this PDF</button>`}
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
