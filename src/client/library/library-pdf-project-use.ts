import { html, nothing, type TemplateResult } from "lit";
import type { BibliographicRecord, LibraryPdfArtifact } from "../../domain/reference-library";
import type { ProjectReferenceLink } from "../../domain/workspace/workspace";
import type { PublicationResource } from "../../domain/workspace/workspace";
import { ProjectReferenceMutationElement } from "../project/project-reference-mutation";
import { expectOk, jsonFetch } from "../platform/http";

export const projectLibrarySourceChangedEvent = "project-library-source-changed";

interface VisibleSourceLink {
  readonly id: string;
  readonly publicationId: string;
  readonly libraryReferenceId: string;
  readonly active: boolean;
}

export interface LibraryPdfProjectUseContext {
  readonly artifact: Pick<LibraryPdfArtifact, "referenceId">;
  readonly projectApiBase: string | null;
  readonly projectReferences: readonly Pick<ProjectReferenceLink, "citationAlias" | "referenceId">[];
  readonly projectPublications?: readonly Pick<PublicationResource, "id" | "citationKey">[];
  readonly references: readonly BibliographicRecord[];
}

interface LibraryPdfProjectUseData {
  readonly linkedCitationAlias: string | null;
  readonly projectApiBase: string | null;
  readonly reference: BibliographicRecord | null;
  readonly targetPublications: readonly { readonly id: string; readonly label: string }[];
}

export class LibraryPdfProjectUse extends ProjectReferenceMutationElement {
  static override properties = { data: { state: true } };

  declare private data: LibraryPdfProjectUseData | null;
  private sourceLinks: readonly VisibleSourceLink[] = [];
  private selectedPublicationId = "";
  private confirmedSharing = false;
  private sourceStatus = "";
  private sourceRequest = 0;

  constructor() {
    super();
    this.data = null;
  }

  setContext(context: LibraryPdfProjectUseContext): void {
    const reference = context.references.find((item) => item.id === context.artifact.referenceId) ?? null;
    const targets = new Map<string, { id: string; label: string }>();
    for (const target of context.projectReferences)
      targets.set(target.referenceId, { id: target.referenceId, label: target.citationAlias });
    for (const target of context.projectPublications ?? []) {
      if (!targets.has(target.id)) targets.set(target.id, { id: target.id, label: target.citationKey });
    }
    this.data = {
      linkedCitationAlias: reference
        ? (context.projectReferences.find((item) => item.referenceId === reference.id)?.citationAlias ?? null)
        : null,
      projectApiBase: context.projectApiBase,
      targetPublications: [...targets.values()],
      reference,
    };
    if (!targets.has(this.selectedPublicationId)) {
      this.selectedPublicationId = targets.values().next().value?.id ?? "";
    }
    if (context.projectApiBase) void this.refreshSourceLinks(context.projectApiBase, reference?.id ?? null);
  }

  private async refreshSourceLinks(apiBase: string, referenceId: string | null): Promise<void> {
    const request = ++this.sourceRequest;
    if (!referenceId) {
      this.sourceLinks = [];
      return;
    }
    try {
      const response = await fetch(`${apiBase}/library-source-links`, { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!Array.isArray(value)) throw new Error("Invalid project source links");
      const links = value.filter(
        (link): link is VisibleSourceLink =>
          typeof link === "object" &&
          link !== null &&
          typeof link.id === "string" &&
          typeof link.publicationId === "string" &&
          typeof link.libraryReferenceId === "string" &&
          typeof link.active === "boolean" &&
          link.libraryReferenceId === referenceId,
      );
      if (request === this.sourceRequest) {
        this.sourceLinks = links;
        this.requestUpdate();
      }
    } catch {
      if (request === this.sourceRequest) {
        this.sourceStatus = "Project source links could not be loaded.";
        this.requestUpdate();
      }
    }
  }

  protected override render(): TemplateResult {
    const data = this.data;
    if (!data) return html``;
    const reference = data.reference;
    if (!reference) return html`<p class="empty-state">Identify this PDF before using it in a project.</p>`;
    const alias = data.linkedCitationAlias ?? reference.referenceKey;
    const linked = data.linkedCitationAlias !== null;
    const selectedSourceLink = this.sourceLinks.find((link) => link.active && link.publicationId === this.selectedPublicationId);
    return html`
      <p class="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-app-text-soft">
        ${linked ? "Reference in project" : "Reference not in project"}
      </p>
      <p class="mt-1 font-sans text-xs leading-5 text-app-text-soft">
        ${
          linked
            ? "Project members can use this citation. Share your Library source below to make its PDFs available to signed-in members; private annotations stay in your Library."
            : "Add the bibliographic record to this project's reference set. This does not insert a citation."
        }
      </p>
      <code class="mt-2 block truncate text-xs">:cite[${alias}]</code>
      ${
        linked
          ? nothing
          : html`<button class="button-primary mt-3" type="button" ?disabled=${!data.projectApiBase} @click=${this.linkReference}>
              Add reference to project
            </button>`
      }
      ${
        data.projectApiBase && data.targetPublications.length > 0
          ? html` <div class="mt-3 border-t border-app-line pt-3 font-sans text-xs">
              <label class="block font-semibold" for="library-source-target">Make this Library source available for</label>
              <select id="library-source-target" class="mt-1 w-full" .value=${this.selectedPublicationId} @change=${this.selectPublication}>
                ${data.targetPublications.map((target) => html`<option value=${target.id}>${target.label}</option>`)}
              </select>
              ${
                selectedSourceLink
                  ? html`<button class="button-secondary mt-2" type="button" @click=${this.removeSourceLink}>
                      Remove Library source from project
                    </button>`
                  : html` <label class="mt-2 flex gap-2 leading-5">
                        <input type="checkbox" .checked=${this.confirmedSharing} @change=${this.confirmSharing} />
                        <span>All PDFs now or later attached to this Library source will be readable by signed-in project members.</span>
                      </label>
                      <button class="button-primary mt-2" type="button" ?disabled=${!this.confirmedSharing} @click=${this.shareSource}>
                        Share Library source with project
                      </button>`
              }
              ${this.sourceStatus ? html`<p role="status" class="mt-2">${this.sourceStatus}</p>` : nothing}
            </div>`
          : nothing
      }
    `;
  }

  private selectPublication(event: Event): void {
    if (!(event.currentTarget instanceof HTMLSelectElement)) return;
    this.selectedPublicationId = event.currentTarget.value;
    this.confirmedSharing = false;
    this.sourceStatus = "";
    this.requestUpdate();
  }

  private confirmSharing(event: Event): void {
    if (!(event.currentTarget instanceof HTMLInputElement)) return;
    this.confirmedSharing = event.currentTarget.checked;
    this.requestUpdate();
  }

  private async shareSource(): Promise<void> {
    const data = this.data;
    if (!data?.projectApiBase || !data.reference || !this.selectedPublicationId || !this.confirmedSharing) return;
    try {
      const response = await jsonFetch(`${data.projectApiBase}/library-source-links`, {
        publicationId: this.selectedPublicationId,
        libraryReferenceId: data.reference.id,
        confirmAllPdfs: true,
      });
      await expectOk(response);
      this.confirmedSharing = false;
      this.sourceStatus = "Library PDFs are available to project members.";
      await this.refreshSourceLinks(data.projectApiBase, data.reference.id);
      this.dispatchEvent(new CustomEvent(projectLibrarySourceChangedEvent, { bubbles: true, composed: true }));
    } catch {
      this.sourceStatus = "The Library source could not be shared.";
      this.requestUpdate();
    }
  }

  private async removeSourceLink(): Promise<void> {
    const data = this.data;
    const link = this.sourceLinks.find((item) => item.active && item.publicationId === this.selectedPublicationId);
    if (!data?.projectApiBase || !link) return;
    try {
      const response = await fetch(`${data.projectApiBase}/library-source-links/${encodeURIComponent(link.id)}`, {
        credentials: "same-origin",
        method: "DELETE",
      });
      await expectOk(response);
      this.sourceStatus = "Library source removed from this project.";
      await this.refreshSourceLinks(data.projectApiBase, data.reference?.id ?? null);
      this.dispatchEvent(new CustomEvent(projectLibrarySourceChangedEvent, { bubbles: true, composed: true }));
    } catch {
      this.sourceStatus = "The Library source could not be removed.";
      this.requestUpdate();
    }
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
