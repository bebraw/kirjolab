import { html, LitElement, nothing, type TemplateResult } from "lit";
import type {
  LibraryHighlight,
  LibraryPdfArtifact,
  LibraryPdfMarkup,
  LibraryPdfNote,
  ResearchShareSnapshot,
} from "../domain/reference-library";

export type LibraryPdfAnnotationListAction =
  | { readonly action: "cite-highlight"; readonly highlight: LibraryHighlight }
  | { readonly action: "delete-markup"; readonly markup: LibraryPdfMarkup }
  | { readonly action: "edit-highlight"; readonly highlight: LibraryHighlight }
  | { readonly action: "edit-note"; readonly note: LibraryPdfNote }
  | { readonly action: "open-highlight"; readonly highlight: LibraryHighlight }
  | { readonly action: "open-markup"; readonly artifact: LibraryPdfArtifact; readonly page: number }
  | { readonly action: "revoke-share"; readonly shareId: string }
  | { readonly action: "share-highlight"; readonly highlight: LibraryHighlight };

export const libraryPdfAnnotationListActionEvent = "library-pdf-annotation-list-action";

interface AnnotationListData {
  readonly artifact: LibraryPdfArtifact | null;
  readonly highlights: readonly LibraryHighlight[];
  readonly linkedReferenceIds: ReadonlySet<string>;
  readonly markups: readonly LibraryPdfMarkup[];
  readonly researchShares: readonly ResearchShareSnapshot[];
  readonly workspace: boolean;
}

export class LibraryPdfAnnotationList extends LitElement {
  static override properties = { data: { state: true } };

  declare private data: AnnotationListData;

  constructor() {
    super();
    this.data = {
      artifact: null,
      highlights: [],
      linkedReferenceIds: new Set(),
      markups: [],
      researchShares: [],
      workspace: false,
    };
  }

  setData(data: AnnotationListData): void {
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
    if (this.data.highlights.length === 0 && this.data.markups.length === 0) {
      return html`<div class="empty-state">No private annotations yet.</div>`;
    }
    return html`${this.data.highlights.map((highlight) => this.renderHighlight(highlight))}${this.data.markups.map((markup) =>
      this.renderMarkup(markup),
    )}`;
  }

  protected emitAction(action: LibraryPdfAnnotationListAction): void {
    this.dispatchEvent(
      new CustomEvent<LibraryPdfAnnotationListAction>(libraryPdfAnnotationListActionEvent, { bubbles: true, detail: action }),
    );
  }

  private renderHighlight(highlight: LibraryHighlight): TemplateResult {
    const linked = this.data.linkedReferenceIds.has(highlight.referenceId);
    const share = this.data.researchShares.find((item) => item.kind === "highlight" && item.resourceId === highlight.id);
    return html`<article class="resource-card">
      <span class="eyebrow block">Page ${highlight.page}</span>
      <span class="mt-1 block text-sm leading-5 text-app-text">${highlight.quote}</span>
      ${highlight.comment
        ? html`<span class="mt-2 block font-sans text-xs leading-5 text-app-text-soft">${highlight.comment}</span>`
        : nothing}
      <div class="mt-3 flex flex-wrap gap-2">
        <button class="button-secondary" type="button" @click=${() => this.emitAction({ action: "open-highlight", highlight })}>
          Open page ${highlight.page}
        </button>
        <button class="button-secondary" type="button" @click=${() => this.emitAction({ action: "edit-highlight", highlight })}>
          Edit note
        </button>
        ${this.data.workspace
          ? html`
              <button
                class="button-primary"
                type="button"
                title="Add this source to the project if needed, then cite this page at the remembered manuscript caret"
                @click=${() => this.emitAction({ action: "cite-highlight", highlight })}
              >
                Cite in manuscript
              </button>
              <button
                class="button-secondary"
                type="button"
                ?disabled=${!share && !linked}
                title=${linked ? "" : "Add the bibliographic reference to this project first"}
                @click=${() =>
                  share
                    ? this.emitAction({ action: "revoke-share", shareId: share.id })
                    : this.emitAction({ action: "share-highlight", highlight })}
              >
                ${share ? "Revoke highlight share" : "Share highlight with project"}
              </button>
            `
          : nothing}
      </div>
    </article>`;
  }

  private renderMarkup(markup: LibraryPdfMarkup): TemplateResult {
    const artifact = this.data.artifact;
    return html`<article class="resource-card">
      <span class="eyebrow block">Page ${markup.page} · ${markup.kind}</span>
      <span class="mt-1 block text-sm leading-5 text-app-text">${markup.kind === "note" ? markup.body : "Freehand drawing"}</span>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          class="button-secondary"
          type="button"
          ?disabled=${!artifact}
          @click=${() => artifact && this.emitAction({ action: "open-markup", artifact, page: markup.page })}
        >
          Open page ${markup.page}
        </button>
        ${markup.kind === "note"
          ? html`<button class="button-secondary" type="button" @click=${() => this.emitAction({ action: "edit-note", note: markup })}>
              Edit note
            </button>`
          : nothing}
        <button class="button-secondary" type="button" @click=${() => this.emitAction({ action: "delete-markup", markup })}>Delete</button>
      </div>
    </article>`;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-annotation-list")) {
  customElements.define("library-pdf-annotation-list", LibraryPdfAnnotationList);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-annotation-list": LibraryPdfAnnotationList;
  }
}
