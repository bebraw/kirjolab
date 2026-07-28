import { html, nothing, svg, type PropertyValues, type TemplateResult } from "lit";
import type { KnowledgeGraphNode, WorkspaceKnowledgeGraph } from "../domain/knowledge";
import { LightDomElement } from "./light-dom-controller";
import {
  groupProjectMapNodes,
  layoutProjectMapEdges,
  projectMapLaneDefinitions,
  projectMapNodeEmphasis,
  projectMapNodeGroup,
  type ProjectMapEdgeLayout,
  type ProjectMapRect,
} from "./project-map-layout";

export const projectMapSelectEvent = "project-map-select";

const emptyGraph: WorkspaceKnowledgeGraph = { edges: [], nodes: [] };

export class ProjectMapPanel extends LightDomElement {
  static override properties = {
    activeId: { state: true },
    edges: { state: true },
    graph: { state: true },
    height: { state: true },
    width: { state: true },
  };

  declare private activeId: string | null;
  declare private edges: readonly ProjectMapEdgeLayout[];
  declare private graph: WorkspaceKnowledgeGraph;
  declare private height: number;
  declare private width: number;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    super();
    this.activeId = null;
    this.edges = [];
    this.graph = emptyGraph;
    this.height = 1;
    this.width = 1;
  }

  setGraph(graph: WorkspaceKnowledgeGraph): void {
    this.activeId = null;
    this.edges = [];
    this.graph = graph;
  }

  refreshLayout(): void {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => this.measureEdges());
  }

  override disconnectedCallback(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    super.disconnectedCallback();
  }

  protected override updated(changed: PropertyValues): void {
    if (!changed.has("graph")) return;
    this.resizeObserver?.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.measureEdges());
      this.resizeObserver.observe(this);
    }
    this.refreshLayout();
  }

  protected override render(): TemplateResult {
    const grouped = groupProjectMapNodes(this.graph.nodes);
    return html`
      ${this.renderEdges()}
      <div class="project-map-nodes" id="project-map-nodes" role="group" aria-label="Project resources">
        ${this.graph.nodes.length === 0
          ? nothing
          : html`
              <div class="project-map-context-nodes" role="group" aria-label="Project context">
                ${grouped.context.map((node) => this.renderNode(node))}
              </div>
              <div class="project-map-lanes">
                ${projectMapLaneDefinitions.map(
                  (lane) => html`
                    <section class="project-map-lane" data-lane=${lane.id} aria-labelledby=${`project-map-${lane.id}-heading`}>
                      <h3 class="project-map-lane-heading" id=${`project-map-${lane.id}-heading`}>${lane.label}</h3>
                      <div class="project-map-lane-nodes">
                        ${grouped.lanes[lane.id].length === 0
                          ? html`<div class="empty-state">No resources yet.</div>`
                          : grouped.lanes[lane.id].map((node) => this.renderNode(node))}
                      </div>
                    </section>
                  `,
                )}
              </div>
            `}
      </div>
    `;
  }

  protected select(event: Event): void {
    const resourceId = (event.currentTarget as HTMLButtonElement).dataset.resourceId;
    if (resourceId) {
      this.dispatchEvent(new CustomEvent<string>(projectMapSelectEvent, { bubbles: true, composed: true, detail: resourceId }));
    }
  }

  protected emphasize(event: Event): void {
    this.activeId = (event.currentTarget as HTMLButtonElement).dataset.resourceId ?? null;
  }

  protected restoreFocusedEmphasis(): void {
    const focused =
      typeof this.querySelector === "function"
        ? this.querySelector<HTMLButtonElement>(".project-map-node:focus-visible")?.dataset.resourceId
        : undefined;
    this.activeId = focused ?? null;
  }

  protected emphasizeFocused(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    if (typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(() => {
      if (button.matches(":focus-visible")) this.activeId = button.dataset.resourceId ?? null;
    });
  }

  protected restoreFocusedAfterFrame(): void {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => this.restoreFocusedEmphasis());
  }

  private renderNode(node: KnowledgeGraphNode): TemplateResult {
    const kind = node.kind.replaceAll("-", " ");
    const emphasis = projectMapNodeEmphasis(this.graph, this.activeId, node.id);
    return html`
      <button
        type="button"
        class="project-map-node"
        data-kind=${node.kind}
        data-lane=${projectMapNodeGroup(node.kind)}
        data-resource-id=${node.id}
        data-emphasis=${emphasis ?? nothing}
        title=${`${kind}: ${node.label}`}
        @click=${this.select}
        @pointerenter=${this.emphasize}
        @pointerleave=${this.restoreFocusedEmphasis}
        @focus=${this.emphasizeFocused}
        @blur=${this.restoreFocusedAfterFrame}
      >
        <span>${kind}</span><strong>${node.label}</strong>
      </button>
    `;
  }

  private renderEdges(): TemplateResult {
    return html`<svg id="project-map-graph" viewBox=${`0 0 ${this.width} ${this.height}`} preserveAspectRatio="none" aria-hidden="true">
      ${svg`<defs>
          <marker
            id="project-map-arrow"
            viewBox="0 0 5 5"
            refX="4.5"
            refY="2.5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 5 2.5 L 0 5 z" fill="context-stroke"></path>
          </marker>
        </defs>`} ${this.edges.map((edge) => {
        const emphasis = this.activeId ? (edge.from === this.activeId || edge.to === this.activeId ? "active" : "muted") : nothing;
        return svg`
          <path
            class="project-map-edge"
            data-project-map-connector
            data-from=${edge.from}
            data-to=${edge.to}
            data-relation=${edge.relation}
            data-emphasis=${emphasis}
            marker-end="url(#project-map-arrow)"
            d=${edge.path}
          >
            <title>${edge.title}</title>
          </path>
          <text
            class="project-map-edge-label"
            data-project-map-connector
            data-from=${edge.from}
            data-to=${edge.to}
            data-emphasis=${emphasis}
            x=${edge.x}
            y=${edge.y}
          >
            ${edge.relation.replaceAll("-", " ")}
          </text>
        `;
      })}
    </svg>`;
  }

  protected measureEdges(): void {
    if (typeof this.getBoundingClientRect !== "function" || typeof this.querySelectorAll !== "function") return;
    const bounds = this.getBoundingClientRect();
    const nodes = new Map<string, ProjectMapRect>();
    for (const node of this.querySelectorAll<HTMLButtonElement>(".project-map-node")) {
      if (node.dataset.resourceId) nodes.set(node.dataset.resourceId, node.getBoundingClientRect());
    }
    this.width = bounds.width || 1;
    this.height = bounds.height || 1;
    this.edges = layoutProjectMapEdges(this.graph, bounds, nodes);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("project-map-panel")) {
  customElements.define("project-map-panel", ProjectMapPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-map-panel": ProjectMapPanel;
  }
}
