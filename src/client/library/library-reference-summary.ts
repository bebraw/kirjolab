import { html, nothing, type TemplateResult } from "lit";
import { bibTeXDisplayText } from "../../domain/reference-library/bibliography";
import type { BibliographicRecord, LibraryPdfArtifact } from "../../domain/reference-library";
import { ProjectReferenceMutationElement, type ProjectReferenceMutation } from "../project/project-reference-mutation";

export interface LibraryReferenceSummaryData {
  readonly keyState: "provisional" | "final";
  readonly linkedCitationAlias: string | null;
  readonly primaryArtifact: LibraryPdfArtifact | null;
  readonly projectApiBase: string | null;
  readonly reference: BibliographicRecord;
}

export type LibraryReferenceSummaryAction =
  | { readonly action: "open-pdf"; readonly artifact: LibraryPdfArtifact }
  | { readonly action: "open-citation-network"; readonly referenceId: string }
  | { readonly action: "find-open-pdf"; readonly reference: BibliographicRecord };

export const libraryReferenceSummaryActionEvent = "library-reference-summary-action";

export class LibraryReferenceSummary extends ProjectReferenceMutationElement {
  static override properties = {
    data: { state: true },
  };

  declare private data: LibraryReferenceSummaryData | null;

  constructor() {
    super();
    this.data = null;
  }

  setData(data: LibraryReferenceSummaryData): void {
    this.data = data;
  }

  protected override render(): TemplateResult {
    const data = this.data;
    if (!data) return html``;
    const { keyState, linkedCitationAlias, primaryArtifact, projectApiBase, reference } = data;
    const displayTitle = bibTeXDisplayText(reference.title) || "Untitled reference";
    const details = [
      bibTeXDisplayText(reference.authors.join("; ")),
      reference.year,
      bibTeXDisplayText(reference.venue),
      reference.referenceKey,
      keyState === "provisional" ? "refinable key" : "",
      reference.type,
      reference.archivedAt ? "archived" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return html`
      <div class="library-reference-main">
        <h3 class="library-reference-title" title=${displayTitle}>${displayTitle}</h3>
        <p class="library-reference-meta" title=${details}>${details}</p>
      </div>
      <div class="library-reference-actions">
        <button
          class="button-secondary"
          type="button"
          title=${`Explore citations to and from ${displayTitle}`}
          @click=${() => this.emitAction({ action: "open-citation-network", referenceId: reference.id })}
        >
          Trail
        </button>
        ${
          primaryArtifact
            ? html`
                <button
                  class="button-secondary"
                  type="button"
                  title=${`Open ${primaryArtifact.name}`}
                  @click=${() => this.emitAction({ action: "open-pdf", artifact: primaryArtifact })}
                >
                  PDF
                </button>
              `
            : reference.doi
              ? html`<button
                  class="button-secondary"
                  type="button"
                  title=${`Find an open-access PDF for ${displayTitle}`}
                  @click=${() => this.emitAction({ action: "find-open-pdf", reference })}
                >
                  Find PDF
                </button>`
              : nothing
        }
        ${
          projectApiBase
            ? linkedCitationAlias
              ? html`
                  <button
                    class="button-secondary"
                    type="button"
                    title=${`Remove :cite[${linkedCitationAlias}] from this project`}
                    @click=${this.unlinkReference}
                  >
                    Linked
                  </button>
                `
              : html`
                  <button
                    class="button-primary"
                    type="button"
                    title=${`Add :cite[${reference.referenceKey}] to this project`}
                    @click=${this.linkReference}
                  >
                    Add
                  </button>
                `
            : nothing
        }
      </div>
    `;
  }

  protected emitAction(action: LibraryReferenceSummaryAction): void {
    this.dispatchEvent(
      new CustomEvent<LibraryReferenceSummaryAction>(libraryReferenceSummaryActionEvent, { bubbles: true, detail: action }),
    );
  }

  protected linkReference(): Promise<void> {
    const data = this.data;
    return data
      ? this.changeReference({ action: "link", citationAlias: data.reference.referenceKey, referenceId: data.reference.id })
      : Promise.resolve();
  }

  protected unlinkReference(): Promise<void> {
    const data = this.data;
    return data ? this.changeReference({ action: "unlink", referenceId: data.reference.id }) : Promise.resolve();
  }

  private async changeReference(mutation: ProjectReferenceMutation): Promise<void> {
    const data = this.data;
    const linked = data?.linkedCitationAlias !== null;
    if (!data?.projectApiBase || data.reference.id !== mutation.referenceId || (mutation.action === "link" ? linked : !linked)) return;
    await this.changeProjectReference(data.projectApiBase, mutation);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-reference-summary")) {
  customElements.define("library-reference-summary", LibraryReferenceSummary);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-reference-summary": LibraryReferenceSummary;
  }
}
