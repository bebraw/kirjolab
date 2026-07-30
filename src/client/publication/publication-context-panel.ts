import { html, type TemplateResult } from "lit";
import { bibTeXDisplayText } from "../../domain/reference-library/bibliography";
import { LightDomElement } from "../platform/light-dom-controller";
import type { LibraryPdfArtifact, ProjectReferencePdf } from "../../domain/reference-library";
import type { PdfResource, PublicationPdfLink, PublicationResource } from "../../domain/workspace/workspace";
import { formatBytes } from "../platform/format";
import { errorMessage, expectOk, jsonFetch } from "../platform/http";

export type PublicationPaperOption =
  | { readonly kind: "project"; readonly pdf: PdfResource; readonly linkId: string }
  | { readonly kind: "library"; readonly artifact: LibraryPdfArtifact }
  | { readonly kind: "reference"; readonly pdf: ProjectReferencePdf };

export interface PublicationContextBinding {
  readonly insertCitation: () => void;
  readonly openPaper: (paper: PublicationPaperOption) => void;
  readonly papersChanged: (message: string) => void;
}

interface PublicationContextData {
  readonly availablePdfs: readonly PdfResource[];
  readonly papers: readonly PublicationPaperOption[];
  readonly publication: PublicationResource;
}

export interface PublicationContextSources {
  readonly libraryArtifacts: readonly LibraryPdfArtifact[];
  readonly publicationId: string;
  readonly referencePdfs: readonly ProjectReferencePdf[];
  readonly snapshot: {
    readonly pdfs: readonly PdfResource[];
    readonly publicationPdfLinks: readonly PublicationPdfLink[];
    readonly publications: readonly PublicationResource[];
  } | null;
}

export class PublicationContextPanel extends LightDomElement {
  static override properties = {
    busy: { state: true },
    citationAvailable: { state: true },
    data: { state: true },
    status: { state: true },
  };

  declare private busy: boolean;
  declare private citationAvailable: boolean;
  declare protected data: PublicationContextData | null;
  declare private status: string;
  private apiBase = "";
  private binding: PublicationContextBinding | undefined;

  constructor() {
    super();
    this.busy = false;
    this.citationAvailable = false;
    this.data = null;
    this.status = "";
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  bind(binding: PublicationContextBinding): void {
    this.binding = binding;
  }

  setPublication({ libraryArtifacts, publicationId, referencePdfs, snapshot }: PublicationContextSources): boolean {
    const publication = snapshot?.publications.find(({ id }) => id === publicationId);
    if (!publication || !snapshot) {
      this.data = null;
      return false;
    }
    const { pdfs, publicationPdfLinks } = snapshot;
    const links = publicationPdfLinks.filter((link) => link.publicationId === publication.id);
    const linkedIds = new Set(links.map((link) => link.pdfId));
    const projectPapers = links.flatMap((link) => {
      const pdf = pdfs.find((item) => item.id === link.pdfId);
      return pdf ? [{ kind: "project" as const, pdf, linkId: link.id }] : [];
    });
    const libraryPapers = libraryArtifacts
      .filter((artifact) => artifact.referenceId === publication.id)
      .map((artifact) => ({ kind: "library" as const, artifact }));
    const localArtifactIds = new Set(libraryPapers.map((paper) => paper.artifact.id));
    const linkedReferencePapers = referencePdfs
      .filter((pdf) => pdf.referenceId === publication.id && !localArtifactIds.has(pdf.id))
      .map((pdf) => ({ kind: "reference" as const, pdf }));
    this.data = {
      availablePdfs: pdfs.filter((pdf) => !linkedIds.has(pdf.id)),
      papers: [...libraryPapers, ...linkedReferencePapers, ...projectPapers],
      publication,
    };
    return true;
  }

  setCitationAvailable(available: boolean): void {
    this.citationAvailable = available;
  }

  get scrollPosition(): number {
    return this.querySelector<HTMLElement>("#context-publication-body")?.scrollTop ?? 0;
  }

  set scrollPosition(value: number) {
    const body = this.querySelector<HTMLElement>("#context-publication-body");
    if (body) body.scrollTop = value;
  }

  protected override render(): TemplateResult {
    const publication = this.data?.publication;
    const papers = this.data?.papers ?? [];
    const availablePdfs = this.data?.availablePdfs ?? [];
    return html`
      <header class="context-resource-header">
        <div class="min-w-0">
          <p class="eyebrow">Reference</p>
          <h2 class="context-resource-title" id="context-publication-title">
            ${publication ? bibTeXDisplayText(publication.title) : "No reference selected"}
          </h2>
          <p class="context-resource-meta" id="context-publication-meta">
            ${publication
              ? [
                  bibTeXDisplayText(publication.authors.join("; ")),
                  publication.year,
                  bibTeXDisplayText(publication.venue),
                  publication.doi ? `doi:${publication.doi}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Choose a citation or reference to inspect its scholarly record."}
          </p>
        </div>
      </header>
      <div class="context-publication-body" id="context-publication-body">
        <div class="context-resource-copy" id="context-publication-details">
          ${publication
            ? html`
                <p class="eyebrow">${publication.type} · ${publication.metadataSource}</p>
                <p class="mt-3">${publication.abstract || "No abstract is stored for this publication yet."}</p>
              `
            : html`<div class="empty-state">Publication metadata and linked papers appear here.</div>`}
        </div>
        <div class="context-resource-actions">
          <button
            class="button-primary justify-center"
            id="insert-context-citation"
            type="button"
            title=${this.citationAvailable
              ? "Insert this reference at the remembered manuscript caret"
              : "Place the manuscript caret before inserting a citation"}
            ?disabled=${!this.citationAvailable}
            @click=${this.insertCitation}
          >
            Insert citation
          </button>
          <button
            class="button-secondary justify-center"
            id="open-paper"
            type="button"
            ?disabled=${papers.length !== 1}
            @click=${this.openOnlyPaper}
          >
            ${papers.length > 1 ? "Choose a paper below" : "Open linked paper"}
          </button>
        </div>
        <div class="context-linked-resources" id="context-publication-pdfs">
          ${papers.length === 0
            ? html`<p class="empty-state">No paper connected to this reference yet.</p>`
            : papers.map((paper) => this.renderPaper(paper))}
        </div>
        <form class="context-link-form" id="publication-pdf-link-form" ?hidden=${availablePdfs.length === 0} @submit=${this.linkPdf}>
          <label class="field-label" for="publication-pdf-link">
            <span data-publication-pdf-link-label>
              ${papers.length > 0 ? "Add another paper from this project" : "Add a paper from this project"}
            </span>
            <select class="field" id="publication-pdf-link" ?disabled=${this.busy || availablePdfs.length === 0}>
              <option value="">Choose a project PDF</option>
              ${availablePdfs.map((pdf) => html`<option value=${pdf.id}>${pdf.name}</option>`)}
            </select>
          </label>
          <button class="button-secondary justify-center" type="submit" ?disabled=${this.busy || availablePdfs.length === 0}>
            ${this.busy ? "Updating…" : "Add paper"}
          </button>
        </form>
        <p class="status-line" role="status" ?hidden=${!this.status}>${this.status}</p>
      </div>
    `;
  }

  protected insertCitation(): void {
    this.binding?.insertCitation();
  }

  protected openOnlyPaper(): void {
    const paper = this.data?.papers.length === 1 ? this.data.papers[0] : undefined;
    if (paper) this.binding?.openPaper(paper);
  }

  protected openPaper(event: Event): void {
    const index = Number((event.currentTarget as HTMLButtonElement).dataset.paperIndex);
    const paper = this.data?.papers[index];
    if (paper) this.binding?.openPaper(paper);
  }

  protected unlinkPaper(event: Event): void {
    const linkId = (event.currentTarget as HTMLButtonElement).dataset.linkId;
    if (linkId) void this.unlinkPdf(linkId);
  }

  protected async linkPdf(event: Event): Promise<void> {
    event.preventDefault();
    const pdfId = this.querySelector<HTMLSelectElement>("#publication-pdf-link")?.value;
    const publicationId = this.data?.publication.id;
    if (!pdfId || !publicationId || this.busy) return;
    await this.updatePapers(
      () => jsonFetch(`${this.apiBase}/publication-pdf-links`, { publicationId, pdfId }),
      "Project PDF added to this reference.",
    );
  }

  protected async unlinkPdf(linkId: string): Promise<void> {
    if (this.busy) return;
    await this.updatePapers(
      () =>
        fetch(`${this.apiBase}/publication-pdf-links/${encodeURIComponent(linkId)}`, {
          method: "DELETE",
          credentials: "same-origin",
        }),
      "Paper disconnected; both resources remain available.",
    );
  }

  private async updatePapers(request: () => Promise<Response>, message: string): Promise<void> {
    this.busy = true;
    this.status = "Updating linked papers…";
    try {
      await expectOk(await request());
      this.status = "";
      this.binding?.papersChanged(message);
    } catch (error) {
      this.status = errorMessage(error, "Could not update linked papers.");
    } finally {
      this.busy = false;
    }
  }

  private renderPaper(paper: PublicationPaperOption): TemplateResult {
    const index = this.data?.papers.indexOf(paper) ?? -1;
    const name = paper.kind === "library" ? paper.artifact.name : paper.pdf.name;
    const size = paper.kind === "library" ? paper.artifact.size : paper.pdf.size;
    const source =
      paper.kind === "project" ? "Project PDF" : paper.kind === "library" ? "Your library PDF" : "Linked reference PDF · project members";
    return html`
      <div class="resource-card mt-2 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <span class="eyebrow">${source} · ${formatBytes(size)}</span>
          <strong class="mt-2 block font-sans">${name}</strong>
        </div>
        <div class="flex shrink-0 gap-2">
          <button class="button-secondary" type="button" data-paper-index=${index} @click=${this.openPaper}>Open</button>
          ${paper.kind === "project"
            ? html`<button
                class="button-secondary"
                type="button"
                data-link-id=${paper.linkId}
                ?disabled=${this.busy}
                @click=${this.unlinkPaper}
              >
                Disconnect
              </button>`
            : ""}
        </div>
      </div>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("publication-context-panel")) {
  customElements.define("publication-context-panel", PublicationContextPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "publication-context-panel": PublicationContextPanel;
  }
}
