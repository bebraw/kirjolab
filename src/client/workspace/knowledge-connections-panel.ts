import { html, nothing, type TemplateResult } from "lit";
import type { WorkspaceKnowledgeGraph } from "../../domain/knowledge";
import { LightDomElement } from "../platform/light-dom-controller";

export const knowledgeConnectionSelectEvent = "knowledge-connection-select";

export class KnowledgeConnectionsPanel extends LightDomElement {
  static override properties = {
    graph: { state: true },
  };

  declare private graph: WorkspaceKnowledgeGraph;

  constructor() {
    super();
    this.graph = { edges: [], nodes: [] };
  }

  setGraph(graph: WorkspaceKnowledgeGraph): void {
    this.graph = graph;
  }

  protected override render(): TemplateResult {
    const nodes = new Map(this.graph.nodes.map((node) => [node.id, node]));
    return html`
      <div class="project-map-connections-header">
        <h3 id="project-map-connections-heading">Connections</h3>
        <span class="count-badge" id="connection-count">${this.graph.edges.length}</span>
      </div>
      <div class="project-map-connection-list" id="knowledge-connection-list">
        ${
          this.graph.edges.length === 0
            ? html`<div class="empty-state">Citations and evidence links appear here as typed connections.</div>`
            : this.graph.edges.map((edge) => {
                const from = nodes.get(edge.from);
                const to = nodes.get(edge.to);
                if (!from || !to) return nothing;
                return html`
                  <article class="resource-card">
                    <p class="eyebrow">${edge.relation}</p>
                    <div class="mt-2 flex flex-wrap items-center gap-2 font-sans text-xs">
                      ${this.resourceLink(from.id, from.label)} <span aria-hidden="true">→</span> ${this.resourceLink(to.id, to.label)}
                    </div>
                    ${edge.label ? html`<p class="mt-2 font-sans text-xs text-app-text-soft">${edge.label}</p>` : nothing}
                  </article>
                `;
              })
        }
      </div>
    `;
  }

  protected selectResource(event: Event): void {
    const resourceId = (event.currentTarget as HTMLButtonElement).dataset.resourceId;
    if (resourceId) {
      this.dispatchEvent(new CustomEvent(knowledgeConnectionSelectEvent, { bubbles: true, composed: true, detail: resourceId }));
    }
  }

  private resourceLink(resourceId: string, label: string): TemplateResult {
    return html`
      <button
        class="font-bold text-app-accent-strong underline decoration-app-border underline-offset-4"
        type="button"
        data-resource-id=${resourceId}
        @click=${this.selectResource}
      >
        ${label}
      </button>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("knowledge-connections-panel")) {
  customElements.define("knowledge-connections-panel", KnowledgeConnectionsPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "knowledge-connections-panel": KnowledgeConnectionsPanel;
  }
}
