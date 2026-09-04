import { html, type TemplateResult } from "lit";

import { LightDomElement } from "../platform/light-dom-controller";
import {
  citationContextAtPosition,
  citationPageFromLocator,
  createCitationInsertion,
  type CitationContext,
  type CitationInsertion,
} from "./citations";

export interface SourceCitationNavigation {
  openCitation(context: CitationContext): void;
}

export interface SourceCitationEditor {
  completeCitationInsertion(insertion: CitationInsertion | null, message: string): void;
}

export class SourceCitationControl extends LightDomElement {
  #context: CitationContext | null = null;
  #editor: SourceCitationEditor | null = null;
  #navigation: SourceCitationNavigation | null = null;
  #position: number | null = null;
  #source = "";

  bindWorkflow(navigation: SourceCitationNavigation, editor: SourceCitationEditor): void {
    this.#navigation = navigation;
    this.#editor = editor;
  }

  setCaret(source: string, position: number | null): void {
    this.#source = source;
    this.#position = position;
    this.#context = position === null ? null : citationContextAtPosition(source, position);
    this.requestUpdate();
  }

  openCitationAtPosition(source: string, position: number): boolean {
    const context = citationContextAtPosition(source, position);
    if (!context) return false;
    this.#navigation?.openCitation(context);
    return true;
  }

  insertCitation(citationKey: string, locator?: string): void {
    if (this.#position === null) {
      this.#editor?.completeCitationInsertion(null, "Place the manuscript caret before inserting a citation.");
      return;
    }
    const insertion = createCitationInsertion(this.#source, this.#position, citationKey, locator);
    if (!insertion) {
      this.#editor?.completeCitationInsertion(null, "This reference key cannot be represented by citation syntax.");
      return;
    }
    this.#editor?.completeCitationInsertion(
      insertion,
      `Inserted :cite[${citationKey}]${locator ? ` at ${locator}` : ""} into canonical Markdown.`,
    );
  }

  protected openCitation(): void {
    if (!this.#context) return;
    this.#navigation?.openCitation(this.#context);
  }

  protected override render(): TemplateResult {
    const available = this.#context !== null;
    const page = citationPageFromLocator(this.#context?.locator);
    const label = `Open cited paper${page ? ` · p. ${page}` : ""}`;
    return html`
      <button
        class="button-secondary"
        id="open-source-citation"
        type="button"
        title="Open the citation at the caret in Context. Command-click a citation for the same action."
        ?disabled=${!available}
        ?hidden=${!available}
        @click=${this.openCitation}
      >
        ${label}
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
