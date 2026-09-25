import { html, type TemplateResult } from "lit";
import { bibTeXDisplayText } from "../../domain/reference-library/bibliography";
import { LightDomElement } from "../platform/light-dom-controller";
import type { PublicationPaperOption } from "../publication/publication-context-panel";
import type { RelatedPaperGroup } from "./pdf-related-papers";

export class PdfRelatedPapersControl extends LightDomElement {
  static override properties = { groups: { state: true } };

  declare private groups: readonly RelatedPaperGroup[];
  private openPaper: ((paper: PublicationPaperOption) => void) | undefined;

  constructor() {
    super();
    this.groups = [];
    this.hidden = true;
  }

  bind(openPaper: (paper: PublicationPaperOption) => void): void {
    this.openPaper = openPaper;
  }

  setGroups(groups: readonly RelatedPaperGroup[]): void {
    this.groups = groups;
    this.hidden = groups.length === 0;
    if (this.hidden) this.querySelector?.("details")?.removeAttribute("open");
  }

  protected override render(): TemplateResult {
    return html`<details class="action-menu ui-menu pdf-related-papers-menu" data-action-menu>
      <summary
        class=${this.hasAttribute("rail") ? "library-pdf-rail-button button-icon" : "pdf-related-papers-trigger"}
        role="button"
        aria-label="Related PDFs"
        title="Related PDFs"
      >
        ${this.hasAttribute("rail") ? "↔" : "Related PDFs"}
      </summary>
      <div class="editor-command-menu ui-menu-panel pdf-related-papers-list" role="group" aria-label="Related PDFs">
        ${this.groups.map(
          (group, groupIndex) =>
            html`<div class="pdf-related-papers-group">
              <p class="eyebrow">${bibTeXDisplayText(group.referenceTitle)}</p>
              ${group.papers.map(
                (paper, paperIndex) =>
                  html`<button type="button" data-group-index=${groupIndex} data-paper-index=${paperIndex} @click=${this.choosePaper}>
                    <span>${paper.kind === "library" ? paper.artifact.name : paper.pdf.name}</span>
                    <small>${paper.kind === "project" ? "Project PDF" : "Linked reference"}</small>
                  </button>`,
              )}
            </div>`,
        )}
      </div>
    </details>`;
  }

  protected choosePaper(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const group = this.groups[Number(button.dataset.groupIndex)];
    const paper = group?.papers[Number(button.dataset.paperIndex)];
    if (!paper) return;
    this.querySelector?.("details")?.removeAttribute("open");
    this.openPaper?.(paper);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("pdf-related-papers-control")) {
  customElements.define("pdf-related-papers-control", PdfRelatedPapersControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "pdf-related-papers-control": PdfRelatedPapersControl;
  }
}
