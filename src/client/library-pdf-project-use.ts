import { html, nothing, type TemplateResult } from "lit";
import type { BibliographicRecord } from "../domain/reference-library";
import { ProjectReferenceMutationElement } from "./project-reference-mutation";

export interface LibraryPdfProjectUseData {
  readonly linkedCitationAlias: string | null;
  readonly projectApiBase: string | null;
  readonly reference: BibliographicRecord | null;
}

export class LibraryPdfProjectUse extends ProjectReferenceMutationElement {
  static override properties = { data: { state: true } };

  declare private data: LibraryPdfProjectUseData | null;

  constructor() {
    super();
    this.data = null;
  }

  setData(data: LibraryPdfProjectUseData): void {
    this.data = data;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const data = this.data;
    if (!data) return html``;
    const reference = data.reference;
    if (!reference) return html`<p class="empty-state">Identify this PDF before using it in a project.</p>`;
    const alias = data.linkedCitationAlias ?? reference.referenceKey;
    const linked = data.linkedCitationAlias !== null;
    return html`
      <p class="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-app-text-soft">
        ${linked ? "Available to project members" : "Reference not in project"}
      </p>
      <p class="mt-1 font-sans text-xs leading-5 text-app-text-soft">
        ${linked
          ? "People signed in as project members can open this PDF. Public read-only and edit links never include reference PDFs; private annotations stay in your library."
          : "Add the bibliographic record to this project's reference set. This does not insert a citation."}
      </p>
      <code class="mt-2 block truncate text-xs">:cite[${alias}]</code>
      ${linked
        ? nothing
        : html`<button class="button-primary mt-3" type="button" ?disabled=${!data.projectApiBase} @click=${this.linkReference}>
            Add reference to project
          </button>`}
    `;
  }

  protected async linkReference(): Promise<void> {
    const data = this.data;
    const reference = data?.reference;
    if (!data?.projectApiBase || !reference || data.linkedCitationAlias !== null) return;
    await this.changeProjectReference(data.projectApiBase, {
      action: "link",
      citationAlias: reference.referenceKey,
      referenceId: reference.id,
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-project-use")) {
  customElements.define("library-pdf-project-use", LibraryPdfProjectUse);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-project-use": LibraryPdfProjectUse;
  }
}
