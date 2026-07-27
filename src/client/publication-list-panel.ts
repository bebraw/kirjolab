import { html, LitElement, nothing, type TemplateResult } from "lit";
import { bibTeXDisplayText } from "../domain/bibliography";
import type { PublicationResource, WorkspaceSnapshot } from "../domain/workspace";
import { errorMessage, expectOk } from "./http";

export interface PublicationListBinding {
  readonly enriched: (message: string) => void;
  readonly manage: (publicationId: string) => void;
  readonly open: (publication: PublicationResource) => void;
}

export class PublicationListPanel extends LitElement {
  static override properties = {
    data: { state: true },
    enrichingPublicationId: { state: true },
    status: { state: true },
  };

  declare private data: Pick<WorkspaceSnapshot, "projectReferences" | "publications">;
  declare private enrichingPublicationId: string;
  declare private status: string;
  private apiBase = "";
  private binding: PublicationListBinding | undefined;

  constructor() {
    super();
    this.data = { projectReferences: [], publications: [] };
    this.enrichingPublicationId = "";
    this.status = "";
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  bind(binding: PublicationListBinding): void {
    this.binding = binding;
  }

  setWorkspace({ projectReferences, publications }: Pick<WorkspaceSnapshot, "projectReferences" | "publications">): void {
    this.data = { projectReferences, publications };
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`<details class="rail-collection">
      <summary><span>References</span><span class="count-badge" id="publication-count">${this.data.publications.length}</span></summary>
      <div class="rail-collection-body" id="publication-list">
        ${this.data.publications.length === 0
          ? html`<div class="empty-state">Imported references appear here as stable publication resources.</div>`
          : this.data.publications.map((publication) => this.renderPublication(publication))}
      </div>
      <p class="status-line px-1" role="status" ?hidden=${!this.status}>${this.status}</p>
    </details>`;
  }

  protected actOnPublication(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const publication = this.data.publications.find((item) => item.id === button.dataset.publicationId);
    if (!publication) return;
    const action = button.dataset.publicationAction;
    if (action === "open") this.binding?.open(publication);
    else if (action === "manage") this.binding?.manage(publication.id);
    else if (action === "enrich") void this.enrichPublication(publication.id);
  }

  protected async enrichPublication(publicationId: string): Promise<void> {
    if (this.enrichingPublicationId) return;
    this.enrichingPublicationId = publicationId;
    this.status = "Looking up DOI metadata from Crossref…";
    try {
      const response = await fetch(`${this.apiBase}/publications/${encodeURIComponent(publicationId)}/enrich`, {
        method: "POST",
        credentials: "same-origin",
      });
      await expectOk(response);
      this.status = "";
      this.binding?.enriched("Reference enriched from Crossref.");
    } catch (error) {
      this.status = errorMessage(error, "Could not enrich the reference.");
    } finally {
      this.enrichingPublicationId = "";
    }
  }

  private renderPublication(publication: PublicationResource): TemplateResult {
    const projectReference = this.data.projectReferences.find((link) => link.referenceId === publication.id);
    const details = [bibTeXDisplayText(publication.authors.join("; ")), publication.year, bibTeXDisplayText(publication.venue)]
      .filter(Boolean)
      .join(" · ");
    return html`
      <article class="resource-card" data-publication-resource-id=${publication.id}>
        <span class="eyebrow">${publication.type} · ${publication.metadataSource}</span>
        <strong class="mt-2 block font-sans">${bibTeXDisplayText(publication.title)}</strong>
        <p class="mt-2 font-sans text-xs leading-5 text-app-text-soft">${details}</p>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="button-secondary"
            data-publication-id=${publication.id}
            data-publication-action="open"
            @click=${this.actOnPublication}
          >
            Open in context
          </button>
          ${projectReference
            ? html`
                <span class="eyebrow">alias:${projectReference.citationAlias}</span>
                <button
                  type="button"
                  class="button-secondary"
                  data-publication-id=${publication.id}
                  data-publication-action="manage"
                  @click=${this.actOnPublication}
                >
                  Manage in library
                </button>
              `
            : nothing}
          ${publication.doi
            ? html`
                <span class="eyebrow">doi:${publication.doi}</span>
                ${projectReference
                  ? nothing
                  : html`<button
                      type="button"
                      class="button-secondary"
                      data-publication-id=${publication.id}
                      data-publication-action="enrich"
                      ?disabled=${Boolean(this.enrichingPublicationId)}
                      @click=${this.actOnPublication}
                    >
                      ${this.enrichingPublicationId === publication.id ? "Enriching…" : "Enrich"}
                    </button>`}
              `
            : nothing}
        </div>
      </article>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("publication-list-panel")) {
  customElements.define("publication-list-panel", PublicationListPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "publication-list-panel": PublicationListPanel;
  }
}
