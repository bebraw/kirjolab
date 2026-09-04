import { html, nothing, type TemplateResult } from "lit";
import { bibTeXDisplayText } from "../../domain/reference-library/bibliography";
import { LightDomElement } from "../platform/light-dom-controller";

export interface PdfReferenceDetails {
  readonly abstract: string;
  readonly authors: readonly string[];
  readonly citationKey: string;
  readonly doi: string;
  readonly id: string;
  readonly origin: "Library reference" | "Project reference";
  readonly title: string;
  readonly type: string;
  readonly venue: string;
  readonly year: string;
}

export interface PdfReferenceDetailsContext {
  readonly pdfId: string;
  readonly pdfName: string;
  readonly references: readonly PdfReferenceDetails[];
}

export const pdfReferenceDetailsVisibilityEvent = "pdf-reference-details-visibility";

export class PdfReferenceDetailsPanel extends LightDomElement {
  static override properties = {
    context: { state: true },
    open: { state: true },
  };

  declare private context: PdfReferenceDetailsContext | null;
  declare private open: boolean;

  constructor() {
    super();
    this.context = null;
    this.open = false;
  }

  setContext(context: PdfReferenceDetailsContext | null): void {
    this.context = context;
    if (!context) this.hide();
  }

  show(): void {
    if (!this.context) return;
    this.open = true;
    this.emitVisibility();
    void this.updateComplete.then(() => this.querySelector<HTMLElement>("#close-pdf-reference-details")?.focus());
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.emitVisibility();
  }

  protected override render(): TemplateResult {
    const context = this.context;
    return html`
      <aside class="pdf-reference-details-panel" ?hidden=${!this.open || !context} aria-label="About this paper">
        <header class="pdf-search-header">
          <div class="min-w-0">
            <p class="eyebrow">Reference metadata</p>
            <strong>About this paper</strong>
            ${context ? html`<p class="pdf-reference-filename" title=${context.pdfName}>${context.pdfName}</p>` : nothing}
          </div>
          <button
            class="library-pdf-inspector-close"
            id="close-pdf-reference-details"
            type="button"
            aria-label="Close paper details"
            @click=${this.hide}
          >
            ×
          </button>
        </header>
        ${context ? this.renderReferences(context.references) : nothing}
      </aside>
    `;
  }

  private renderReferences(references: readonly PdfReferenceDetails[]): TemplateResult {
    if (references.length === 0) {
      return html`<p class="empty-state pdf-reference-empty">No reference is connected to this PDF yet.</p>`;
    }
    return html`<div class="pdf-reference-details-list">
      ${references.map((reference) => {
        const citationSyntax = reference.citationKey ? `:cite[${reference.citationKey}]` : "";
        return html`
          <article class="pdf-reference-details-record">
            <p class="eyebrow">${reference.origin} · ${reference.type}</p>
            ${citationSyntax ? html`<code class="pdf-reference-citation-key">${citationSyntax}</code>` : nothing}
            <h3>${bibTeXDisplayText(reference.title) || "Untitled reference"}</h3>
            <p class="pdf-reference-details-meta">
              ${[
                bibTeXDisplayText(reference.authors.join("; ")),
                reference.year,
                bibTeXDisplayText(reference.venue),
                reference.doi ? `doi:${reference.doi}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p class="pdf-reference-details-abstract">
              ${bibTeXDisplayText(reference.abstract) || "No abstract is stored for this reference yet."}
            </p>
          </article>
        `;
      })}
    </div>`;
  }

  private emitVisibility(): void {
    this.dispatchEvent(
      new CustomEvent<{ readonly open: boolean }>(pdfReferenceDetailsVisibilityEvent, {
        bubbles: true,
        detail: { open: this.open },
      }),
    );
  }
}

if (typeof customElements !== "undefined" && !customElements.get("pdf-reference-details-panel")) {
  customElements.define("pdf-reference-details-panel", PdfReferenceDetailsPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "pdf-reference-details-panel": PdfReferenceDetailsPanel;
  }
}
