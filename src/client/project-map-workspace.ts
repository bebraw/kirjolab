import { html, LitElement, type PropertyValues, type TemplateResult } from "lit";
import type { KnowledgeSearchResult, WorkspaceKnowledgeGraph } from "../domain/knowledge";
import "./knowledge-connections-panel";
import "./knowledge-search-panel";
import "./project-map-panel";
import type { KnowledgeConnectionsPanel } from "./knowledge-connections-panel";
import type { KnowledgeSearchPanel } from "./knowledge-search-panel";
import type { ProjectMapPanel } from "./project-map-panel";

export const projectMapSearchEvent = "project-map-search";
export const projectMapResourceSelectEvent = "project-map-resource-select";

type SearchState = { kind: "idle" } | { kind: "results"; results: readonly KnowledgeSearchResult[] } | { kind: "error"; message: string };

const emptyGraph: WorkspaceKnowledgeGraph = { edges: [], nodes: [] };

export class ProjectMapWorkspace extends LitElement {
  static override properties = {
    graph: { state: true },
    searchState: { state: true },
  };

  declare private graph: WorkspaceKnowledgeGraph;
  declare private searchState: SearchState;

  constructor() {
    super();
    this.graph = emptyGraph;
    this.searchState = { kind: "idle" };
  }

  setGraph(graph: WorkspaceKnowledgeGraph): void {
    this.graph = graph;
  }

  clearSearch(): void {
    this.searchState = { kind: "idle" };
  }

  showSearchResults(results: readonly KnowledgeSearchResult[]): void {
    this.searchState = { kind: "results", results };
  }

  showSearchError(message: string): void {
    this.searchState = { kind: "error", message };
  }

  setVisible(visible: boolean): void {
    this.hidden = !visible;
    if (!visible) return;
    void this.updateComplete.then(() => {
      if (this.hidden) return;
      this.projectMapPanel()?.refreshLayout();
      this.querySelector<HTMLButtonElement>(".project-map-node")?.focus();
    });
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has("graph")) {
      this.projectMapPanel()?.setGraph(this.graph);
      this.querySelector<KnowledgeConnectionsPanel>("#knowledge-connections-panel")?.setGraph(this.graph);
    }
    if (!changed.has("searchState")) return;
    const searchPanel = this.querySelector<KnowledgeSearchPanel>("#knowledge-search-panel");
    if (this.searchState.kind === "idle") searchPanel?.clear();
    else if (this.searchState.kind === "results") searchPanel?.showResults(this.searchState.results);
    else searchPanel?.showError(this.searchState.message);
  }

  protected override render(): TemplateResult {
    const overviewHidden = this.searchState.kind === "idle" ? "" : "hidden";
    return html`
      <header class="project-map-header">
        <div>
          <p class="eyebrow">Project structure</p>
          <h2 class="project-map-title" id="project-map-heading">Evidence map</h2>
          <p class="project-map-description">Follow the typed links between the manuscript, evidence, claims, and references.</p>
        </div>
        <span class="project-map-total" id="project-map-total">
          ${this.graph.nodes.length} ${this.graph.nodes.length === 1 ? "resource" : "resources"} · ${this.graph.edges.length}
          ${this.graph.edges.length === 1 ? "link" : "links"}
        </span>
      </header>
      <knowledge-search-panel
        id="knowledge-search-panel"
        @knowledge-search=${this.forwardSearch}
        @knowledge-search-select=${this.forwardSelection}
      ></knowledge-search-panel>
      <div id="project-map-overview" class=${overviewHidden}>
        <div class="project-map-legend" aria-label="Evidence map key">
          <div class="project-map-legend-items">
            <span class="project-map-legend-item" data-lane="source">Source material</span>
            <span class="project-map-legend-item" data-lane="evidence">Evidence &amp; reasoning</span>
            <span class="project-map-legend-item" data-lane="manuscript">Manuscript</span>
          </div>
          <p>Focus a resource to trace its direct links.</p>
        </div>
        <project-map-panel
          class="project-map-canvas"
          id="project-map-canvas"
          @project-map-select=${this.forwardSelection}
        ></project-map-panel>
        <knowledge-connections-panel
          class="project-map-connections"
          id="knowledge-connections-panel"
          aria-labelledby="project-map-connections-heading"
          @knowledge-connection-select=${this.forwardSelection}
        ></knowledge-connections-panel>
      </div>
    `;
  }

  protected forwardSearch(event: CustomEvent<string>): void {
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent<string>(projectMapSearchEvent, { bubbles: true, composed: true, detail: event.detail }));
  }

  protected forwardSelection(event: CustomEvent<string>): void {
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent<string>(projectMapResourceSelectEvent, { bubbles: true, composed: true, detail: event.detail }));
  }

  private projectMapPanel(): ProjectMapPanel | null {
    return this.querySelector<ProjectMapPanel>("#project-map-canvas");
  }
}

if (typeof customElements !== "undefined" && !customElements.get("project-map-workspace")) {
  customElements.define("project-map-workspace", ProjectMapWorkspace);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-map-workspace": ProjectMapWorkspace;
  }
}
