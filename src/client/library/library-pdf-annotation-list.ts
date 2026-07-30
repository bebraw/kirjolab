import { html, nothing, type TemplateResult } from "lit";
import type {
  LibraryHighlight,
  LibraryPdfArtifact,
  LibraryPdfMarkup,
  LibraryPdfNote,
  ResearchShareSnapshot,
} from "../../domain/reference-library";
import { errorMessage, expectOk } from "../platform/http";
import { ProjectResearchMutationElement } from "../project/project-research-mutation";

export type LibraryPdfAnnotationListAction =
  | { readonly action: "cite-highlight"; readonly highlight: LibraryHighlight }
  | { readonly action: "edit-highlight"; readonly highlight: LibraryHighlight }
  | { readonly action: "edit-note"; readonly note: LibraryPdfNote }
  | { readonly action: "open-highlight"; readonly highlight: LibraryHighlight }
  | { readonly action: "open-markup"; readonly artifact: LibraryPdfArtifact; readonly page: number }
  | { readonly action: "markup-deleted" };

export const libraryPdfAnnotationListActionEvent = "library-pdf-annotation-list-action";

interface AnnotationListData {
  readonly artifact: LibraryPdfArtifact | null;
  readonly highlights: readonly LibraryHighlight[];
  readonly linkedReferenceIds: ReadonlySet<string>;
  readonly markups: readonly LibraryPdfMarkup[];
  readonly projectApiBase: string | null;
  readonly researchShares: readonly ResearchShareSnapshot[];
}

export class LibraryPdfAnnotationList extends ProjectResearchMutationElement {
  static override properties = {
    data: { state: true },
    deletion: { state: true },
    filterKind: { state: true },
    filterPage: { state: true },
    query: { state: true },
  };

  declare private data: AnnotationListData;
  declare private deletion: { readonly id: string; readonly pending: boolean; readonly status: string } | null;
  declare private filterKind: PdfAnnotationFilterKind;
  declare private filterPage: string;
  declare private query: string;

  constructor() {
    super();
    this.data = {
      artifact: null,
      highlights: [],
      linkedReferenceIds: new Set(),
      markups: [],
      projectApiBase: null,
      researchShares: [],
    };
    this.deletion = null;
    this.filterKind = "all";
    this.filterPage = "";
    this.query = "";
  }

  setData(data: AnnotationListData): void {
    this.data = data;
  }

  protected override render(): TemplateResult {
    if (this.data.highlights.length === 0 && this.data.markups.length === 0) {
      return html`<div class="empty-state">No private annotations yet.</div>`;
    }
    const filtered = filterPdfAnnotations(this.data.highlights, this.data.markups, {
      kind: this.filterKind,
      page: Number.parseInt(this.filterPage, 10) || null,
      query: this.query,
    });
    return html`
      <div class="pdf-annotation-index-controls">
        <input
          class="field"
          type="search"
          aria-label="Search PDF annotations"
          placeholder="Search quotations and notes"
          .value=${this.query}
          @input=${this.changeQuery}
        />
        <select class="field" aria-label="Filter PDF annotation type" .value=${this.filterKind} @change=${this.changeKind}>
          <option value="all">All types</option>
          <option value="highlight">Highlights</option>
          <option value="note">Notes</option>
          <option value="drawing">Drawings</option>
        </select>
        <input
          class="field pdf-annotation-page-filter"
          type="number"
          min="1"
          inputmode="numeric"
          aria-label="Filter PDF annotations by page"
          placeholder="Page"
          .value=${this.filterPage}
          @input=${this.changePage}
        />
        <button class="button-secondary" type="button" @click=${this.exportSummary}>Export summary</button>
      </div>
      <p class="pdf-search-status" role="status">
        ${filtered.length} of ${this.data.highlights.length + this.data.markups.length} annotations
      </p>
      ${filtered.length
        ? filtered.map((item) => (item.kind === "highlight" ? this.renderHighlight(item.value) : this.renderMarkup(item.value)))
        : html`<div class="empty-state">No annotations match these filters.</div>`}
    `;
  }

  protected changeQuery(event: Event): void {
    this.query = (event.currentTarget as HTMLInputElement).value;
  }

  protected changeKind(event: Event): void {
    this.filterKind = (event.currentTarget as HTMLSelectElement).value as PdfAnnotationFilterKind;
  }

  protected changePage(event: Event): void {
    this.filterPage = (event.currentTarget as HTMLInputElement).value;
  }

  protected exportSummary(): void {
    const artifact = this.data.artifact;
    const markdown = annotationSummaryMarkdown(artifact?.name ?? "PDF", this.data.highlights, this.data.markups);
    const href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = `${(artifact?.name ?? "pdf").replace(/\.pdf$/iu, "")}-annotations.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1_000);
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
        ${this.data.projectApiBase
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
                    ? void this.changeProjectResearch(this.data.projectApiBase!, { action: "revoke", shareId: share.id })
                    : void this.changeProjectResearch(this.data.projectApiBase!, {
                        action: "share",
                        kind: "highlight",
                        referenceId: highlight.referenceId,
                        resourceId: highlight.id,
                      })}
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
        <button
          class="button-secondary"
          type="button"
          ?disabled=${Boolean(this.deletion?.pending)}
          @click=${() => void this.deleteMarkup(markup)}
        >
          ${this.deletion?.id === markup.id && this.deletion.pending ? "Deleting…" : "Delete"}
        </button>
      </div>
      <p class="status-line" role="status" ?hidden=${this.deletion?.id !== markup.id || !this.deletion.status}>${this.deletion?.status}</p>
    </article>`;
  }

  protected async deleteMarkup(markup: LibraryPdfMarkup): Promise<void> {
    if (this.deletion?.pending) return;
    this.deletion = { id: markup.id, pending: true, status: "Deleting private annotation…" };
    try {
      const response = await fetch(
        `/api/library/references/${encodeURIComponent(markup.referenceId)}/pdf-markups/${encodeURIComponent(markup.id)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      await expectOk(response);
      this.deletion = null;
      this.emitAction({ action: "markup-deleted" });
    } catch (error) {
      this.deletion = {
        id: markup.id,
        pending: false,
        status: errorMessage(error, "Could not delete the private annotation."),
      };
    }
  }
}

export type PdfAnnotationFilterKind = "all" | "drawing" | "highlight" | "note";
type PdfAnnotationIndexItem =
  | { readonly kind: "highlight"; readonly page: number; readonly text: string; readonly value: LibraryHighlight }
  | { readonly kind: "drawing" | "note"; readonly page: number; readonly text: string; readonly value: LibraryPdfMarkup };

export function filterPdfAnnotations(
  highlights: readonly LibraryHighlight[],
  markups: readonly LibraryPdfMarkup[],
  filter: { readonly kind: PdfAnnotationFilterKind; readonly page: number | null; readonly query: string },
): PdfAnnotationIndexItem[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return [
    ...highlights.map(
      (value): PdfAnnotationIndexItem => ({
        kind: "highlight",
        page: value.page,
        text: `${value.quote} ${value.comment}`,
        value,
      }),
    ),
    ...markups.map(
      (value): PdfAnnotationIndexItem => ({
        kind: value.kind,
        page: value.page,
        text: value.kind === "note" ? value.body : `${value.color} drawing`,
        value,
      }),
    ),
  ]
    .filter((item) => filter.kind === "all" || item.kind === filter.kind)
    .filter((item) => filter.page === null || item.page === filter.page)
    .filter((item) => !query || item.text.toLocaleLowerCase().includes(query))
    .sort((left, right) => left.page - right.page || left.kind.localeCompare(right.kind));
}

export function annotationSummaryMarkdown(
  title: string,
  highlights: readonly LibraryHighlight[],
  markups: readonly LibraryPdfMarkup[],
): string {
  const lines = [`# Annotations — ${title}`, ""];
  for (const item of filterPdfAnnotations(highlights, markups, { kind: "all", page: null, query: "" })) {
    lines.push(`## Page ${item.page} · ${item.kind}`);
    lines.push("");
    if (item.kind === "highlight") {
      lines.push(`> ${item.value.quote.replaceAll("\n", " ")}`);
      if (item.value.comment) lines.push("", item.value.comment);
    } else if (item.value.kind === "note") lines.push(item.value.body);
    else lines.push(`Freehand drawing · ${item.value.color} · ${item.value.width}px`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-annotation-list")) {
  customElements.define("library-pdf-annotation-list", LibraryPdfAnnotationList);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-annotation-list": LibraryPdfAnnotationList;
  }
}
