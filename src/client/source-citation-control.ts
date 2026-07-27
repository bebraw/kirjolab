import { html, LitElement, type TemplateResult } from "lit";
import { citationContextAtPosition, type CitationContext } from "./citations";

export class SourceCitationControl extends LitElement {
  #context: CitationContext | null = null;
  #openContext: ((context: CitationContext) => void) | null = null;

  bindNavigation(openContext: (context: CitationContext) => void): void {
    this.#openContext = openContext;
  }

  setCaret(source: string, position: number): void {
    this.#context = citationContextAtPosition(source, position);
    this.requestUpdate();
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
