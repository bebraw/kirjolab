import { html, LitElement, type TemplateResult } from "lit";
import { citationContextAtPosition, createCitationInsertion, type CitationContext, type CitationInsertion } from "./citations";

export interface SourceCitationInsertionBinding {
  readonly activateAuthoring: () => void;
  readonly applyInsertion: (insertion: CitationInsertion) => void;
  readonly presentNotice: (message: string) => void;
}

export class SourceCitationControl extends LitElement {
  #context: CitationContext | null = null;
  #insertion: SourceCitationInsertionBinding | null = null;
  #openContext: ((context: CitationContext) => void) | null = null;
  #position: number | null = null;
  #source = "";

  bindNavigation(openContext: (context: CitationContext) => void): void {
    this.#openContext = openContext;
  }

  bindInsertion(binding: SourceCitationInsertionBinding): void {
    this.#insertion = binding;
  }

  setCaret(source: string, position: number | null): void {
    this.#source = source;
    this.#position = position;
    this.#context = position === null ? null : citationContextAtPosition(source, position);
    this.requestUpdate();
  }

  insertCitation(citationKey: string, locator?: string): void {
    if (this.#position === null) {
      this.#insertion?.presentNotice("Place the manuscript caret before inserting a citation.");
      return;
    }
    const insertion = createCitationInsertion(this.#source, this.#position, citationKey, locator);
    if (!insertion) {
      this.#insertion?.presentNotice("This reference key cannot be represented by citation syntax.");
      return;
    }
    this.#insertion?.applyInsertion(insertion);
    this.#insertion?.activateAuthoring();
    this.#insertion?.presentNotice(`Inserted :cite[${citationKey}]${locator ? ` at ${locator}` : ""} into canonical Markdown.`);
  }

  protected openCitation(): void {
    if (!this.#context) return;
    this.#openContext?.(this.#context);
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const available = this.#context !== null;
    return html`
      <button
        class="button-secondary"
        id="open-source-citation"
        type="button"
        title="View the citation at the caret"
        ?disabled=${!available}
        ?hidden=${!available}
        @click=${this.openCitation}
      >
        View cited source
      </button>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("source-citation-control")) {
  customElements.define("source-citation-control", SourceCitationControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "source-citation-control": SourceCitationControl;
  }
}
