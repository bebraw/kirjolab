import { html, LitElement, type PropertyValues, type TemplateResult } from "lit";
import {
  buildWorkspaceKnowledgeGraph,
  isKnowledgeResourceKind,
  isKnowledgeSearchResults,
  type KnowledgeResourceKind,
  type KnowledgeSearchResult,
  type WorkspaceKnowledgeGraph,
} from "../domain/knowledge";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { errorMessage, expectOk } from "./http";
import "./knowledge-connections-panel";
import "./knowledge-search-panel";
import "./project-map-panel";
import type { KnowledgeConnectionsPanel } from "./knowledge-connections-panel";
import type { KnowledgeSearchPanel } from "./knowledge-search-panel";
import type { ProjectMapPanel } from "./project-map-panel";

type SearchState = { kind: "idle" } | { kind: "results"; results: readonly KnowledgeSearchResult[] } | { kind: "error"; message: string };

const emptyGraph: WorkspaceKnowledgeGraph = { edges: [], nodes: [] };
export type ProjectMapNavigation = Readonly<Record<KnowledgeResourceKind, (id: string) => void>>;

export class ProjectMapWorkspace extends LitElement {
  static override properties = {
    graph: { state: true },
    searchState: { state: true },
  };

  declare private graph: WorkspaceKnowledgeGraph;
  declare private searchState: SearchState;
  private apiBase = "";
  private navigation: ProjectMapNavigation | null = null;

  constructor() {
    super();
    this.graph = emptyGraph;
    this.searchState = { kind: "idle" };
  }

  setGraph(graph: WorkspaceKnowledgeGraph): void {
    this.graph = graph;
  }

  presentWorkspace(snapshot: WorkspaceSnapshot, bibliography: string, source = snapshot.composition.content): void {
    this.setGraph(buildWorkspaceKnowledgeGraph({ ...snapshot, bibliography, source }));
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  bindNavigation(navigation: ProjectMapNavigation): void {
    this.navigation = navigation;
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
        @knowledge-search=${this.search}
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

  protected async search(event: CustomEvent<string>): Promise<void> {
    event.stopPropagation();
    const query = event.detail;
    if (!query) {
      this.clearSearch();
      return;
    }
    try {
      const response = await fetch(`${this.apiBase}/search?q=${encodeURIComponent(query)}`, { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isKnowledgeSearchResults(value)) throw new Error("Project search returned invalid data");
      this.showSearchResults(value);
    } catch (error) {
      this.showSearchError(errorMessage(error, "Project search failed"));
    }
  }

  protected forwardSelection(event: CustomEvent<string>): void {
    event.stopPropagation();
    const resource = parseKnowledgeResourceKey(event.detail);
    if (resource) this.navigation?.[resource.kind](resource.id);
  }

  private projectMapPanel(): ProjectMapPanel | null {
    return this.querySelector<ProjectMapPanel>("#project-map-canvas");
  }
}

function parseKnowledgeResourceKey(value: string): { kind: KnowledgeResourceKind; id: string } | null {
  const separator = value.indexOf(":");
  if (separator < 1) return null;
  const kind = value.slice(0, separator);
  if (!isKnowledgeResourceKind(kind)) return null;
  return { kind, id: value.slice(separator + 1) };
}

if (typeof customElements !== "undefined" && !customElements.get("project-map-workspace")) {
  customElements.define("project-map-workspace", ProjectMapWorkspace);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-map-workspace": ProjectMapWorkspace;
  }
}
