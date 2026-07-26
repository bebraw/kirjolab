import { html, LitElement, type PropertyValues, type TemplateResult } from "lit";
import type { CitationNetwork } from "../domain/citation-assertions";
import type { CitationExpansionResult } from "../domain/citation-expansion-types";
import "./citation-network-panel";
import type { CitationNetworkData, CitationNetworkPanel, CitationReferenceChoice } from "./citation-network-panel";

export const citationNetworkFilterEvent = "citation-network-filter";

type CitationNetworkPresentation = Omit<CitationNetworkData, "filterProject">;

const emptyData: CitationNetworkPresentation = { expansion: null, network: null, referenceTitles: {} };

export class CitationNetworkWorkspace extends LitElement {
  static override properties = {
    data: { state: true },
    filterProject: { state: true },
    references: { state: true },
  };

  declare private data: CitationNetworkPresentation;
  declare filterProject: boolean;
  declare private references: readonly CitationReferenceChoice[];

  constructor() {
    super();
    this.data = emptyData;
    this.filterProject = false;
    this.references = [];
  }

  show(): void {
    this.hidden = false;
  }

  bringIntoView(): void {
    this.scrollIntoView({ block: "start" });
  }

  setData(data: CitationNetworkPresentation): void {
    this.data = data;
  }

  setNetwork(network: CitationNetwork, referenceTitles: Readonly<Record<string, string>>): void {
    this.data = { ...this.data, network, referenceTitles };
  }

  setExpansion(expansion: CitationExpansionResult): void {
    this.data = { ...this.data, expansion };
  }

  setReferences(references: readonly CitationReferenceChoice[]): void {
    this.references = references;
  }

  setCandidateSaving(doi: string, saving: boolean): void {
    this.panel()?.setCandidateSaving(doi, saving);
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has("references")) this.panel()?.setReferences(this.references);
    if (changed.has("data") || changed.has("filterProject")) {
      this.panel()?.setData({ ...this.data, filterProject: this.filterProject });
    }
  }

  protected override render(): TemplateResult {
    return html`
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="eyebrow">Guided snowballing</p>
          <h3 class="mt-1 text-lg font-semibold" id="citation-network-heading">Reference trail</h3>
          <p class="mt-2 max-w-2xl text-xs leading-5 text-app-text-soft">
            Follow references from trusted seeds, review each candidate, and retain how every source was found.
          </p>
        </div>
        <div class="flex gap-2">
          <button
            class="button-secondary"
            id="filter-project-citations"
            type="button"
            aria-pressed=${String(this.filterProject)}
            @click=${this.toggleProjectFilter}
          >
            Current project
          </button>
          <button class="button-secondary" id="close-citation-network" type="button" @click=${this.close}>Close network</button>
        </div>
      </div>
      <citation-network-panel id="citation-network-panel"></citation-network-panel>
    `;
  }

  protected toggleProjectFilter(): void {
    this.filterProject = !this.filterProject;
    this.dispatchEvent(
      new CustomEvent<boolean>(citationNetworkFilterEvent, {
        bubbles: true,
        composed: true,
        detail: this.filterProject,
      }),
    );
  }

  protected close(): void {
    this.hidden = true;
  }

  private panel(): CitationNetworkPanel | null {
    return this.querySelector<CitationNetworkPanel>("#citation-network-panel");
  }
}

if (typeof customElements !== "undefined" && !customElements.get("citation-network-workspace")) {
  customElements.define("citation-network-workspace", CitationNetworkWorkspace);
}

declare global {
  interface HTMLElementTagNameMap {
    "citation-network-workspace": CitationNetworkWorkspace;
  }
}
