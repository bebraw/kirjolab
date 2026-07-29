import type cytoscape from "cytoscape";
import { html, type PropertyValues, type TemplateResult } from "lit";
import type { CitationNetwork } from "../domain/citation-assertions";
import { LightDomElement } from "./light-dom-controller";
import type { CitationNetworkAction } from "./citation-network-panel";
import { loadCytoscapeRuntime } from "./cytoscape-runtime";

type CitationGraphRuntime = cytoscape.Core;

export class CitationNetworkGraph extends LightDomElement {
  static override properties = {
    focusedReferenceId: { attribute: false },
    network: { attribute: false },
    status: { state: true },
  };

  declare focusedReferenceId: string | null;
  declare network: CitationNetwork | null;
  declare private status: string;
  private runtime: CitationGraphRuntime | null = null;
  private renderGeneration = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    super();
    this.focusedReferenceId = null;
    this.network = null;
    this.status = "";
  }

  override disconnectedCallback(): void {
    this.renderGeneration += 1;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.runtime?.destroy();
    this.runtime = null;
    super.disconnectedCallback();
  }

  protected override render(): TemplateResult {
    return html`
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-app-line px-3 py-2">
        <p class="text-xs leading-5 text-app-text-soft">Drag to pan · scroll or pinch to zoom · select a node to follow its trail.</p>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Citation graph viewport">
          <button class="button-secondary" type="button" @click=${() => this.zoom(1.25)}>Zoom in</button>
          <button class="button-secondary" type="button" @click=${() => this.zoom(0.8)}>Zoom out</button>
          <button class="button-secondary" type="button" @click=${this.fit}>Fit graph</button>
          <button class="button-secondary" type="button" @click=${this.resetLayout}>Reset layout</button>
        </div>
      </div>
      <div
        class="h-80 min-h-80 w-full"
        id="citation-network-graph"
        role="img"
        aria-label="Interactive citation network graph. Every relationship and action is also available in the list below."
      ></div>
      ${this.status ? html`<p class="border-t border-app-line px-3 py-2 text-xs text-app-text-soft" role="status">${this.status}</p>` : ""}
    `;
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has("network") || changed.has("focusedReferenceId")) void this.renderGraph();
  }

  private async renderGraph(): Promise<void> {
    const generation = ++this.renderGeneration;
    const container = this.querySelector<HTMLElement>("#citation-network-graph");
    if (!container) return;
    this.runtime?.destroy();
    this.runtime = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.status = "";
    const network = this.network;
    if (!network || network.nodes.length === 0) {
      container.textContent = "No citation assertions to draw";
      return;
    }
    container.textContent = "";
    let cytoscape: Awaited<ReturnType<typeof loadCytoscapeRuntime>>;
    try {
      cytoscape = await loadCytoscapeRuntime();
    } catch {
      if (generation === this.renderGeneration && this.isConnected) {
        this.status = "The interactive graph could not load. Every relationship and action remains available in the list below.";
      }
      return;
    }
    if (generation !== this.renderGeneration || !this.isConnected) return;
    const computed = getComputedStyle(this);
    const runtime = cytoscape({
      container,
      elements: citationGraphElements(network, this.focusedReferenceId),
      style: [
        {
          selector: "node",
          style: {
            "background-color": color(computed, "--color-app-paper", "#f6f4ed"),
            "border-color": color(computed, "--color-app-ink", "#18231f"),
            "border-width": 2,
            color: color(computed, "--color-app-ink", "#18231f"),
            "font-family": "ui-sans-serif, system-ui, sans-serif",
            "font-size": 11,
            label: "data(label)",
            "text-background-color": color(computed, "--color-app-paper", "#f6f4ed"),
            "text-background-opacity": 0.9,
            "text-background-padding": "3px",
            "text-margin-y": 24,
            "text-max-width": "130px",
            "text-wrap": "ellipsis",
            height: 28,
            width: 28,
          },
        },
        {
          selector: "node.project",
          style: { "background-color": color(computed, "--color-app-accent", "#5bb99d"), height: 34, width: 34 },
        },
        {
          selector: "node.focused, node:selected",
          style: { "border-color": color(computed, "--color-app-accent-strong", "#0c7655"), "border-width": 5 },
        },
        {
          selector: "edge",
          style: {
            "curve-style": "bezier",
            "line-color": color(computed, "--color-app-graph-extracted", "#4e6b61"),
            "target-arrow-color": color(computed, "--color-app-graph-extracted", "#4e6b61"),
            "target-arrow-shape": "triangle",
            width: 2,
          },
        },
        ...(["confirmed", "extracted", "conflicting", "inferred"] as const).map((state) => ({
          selector: `edge.${state}`,
          style: {
            "line-color": color(computed, `--color-app-graph-${state}`, "#4e6b61"),
            "target-arrow-color": color(computed, `--color-app-graph-${state}`, "#4e6b61"),
            ...(state === "inferred" ? { "line-style": "dashed" as const } : {}),
            ...(state === "confirmed" ? { width: 3 } : {}),
          },
        })),
      ],
      layout: graphLayout(),
      minZoom: 0.2,
      maxZoom: 4,
      userPanningEnabled: true,
      userZoomingEnabled: true,
      autoungrabify: true,
      boxSelectionEnabled: false,
    });
    runtime.on("tap", "node", (event) => {
      const referenceId: unknown = event.target.data("referenceId");
      if (typeof referenceId !== "string") return;
      runtime.$(event.target).select();
      this.emit({ action: "focus", referenceId });
    });
    this.runtime = runtime;
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => runtime.resize());
      this.resizeObserver.observe(container);
    }
  }

  private readonly fit = (): void => {
    this.runtime?.fit(undefined, 30);
  };

  private readonly resetLayout = (): void => {
    const runtime = this.runtime;
    if (!runtime) return;
    runtime.layout(graphLayout()).run();
  };

  private zoom(factor: number): void {
    const runtime = this.runtime;
    if (!runtime) return;
    runtime.zoom({
      level: Math.min(runtime.maxZoom(), Math.max(runtime.minZoom(), runtime.zoom() * factor)),
      renderedPosition: { x: runtime.width() / 2, y: runtime.height() / 2 },
    });
  }

  private emit(detail: CitationNetworkAction): void {
    this.dispatchEvent(new CustomEvent("citation-network-action", { bubbles: true, composed: true, detail }));
  }
}

export function citationGraphElements(network: CitationNetwork, focusedReferenceId: string | null): cytoscape.ElementDefinition[] {
  return [
    ...network.nodes.map((node) => ({
      data: { id: node.id, label: node.label, referenceId: node.referenceId },
      classes: [node.inProject ? "project" : "library", node.referenceId === focusedReferenceId ? "focused" : ""].filter(Boolean).join(" "),
    })),
    ...network.edges.map((edge, index) => ({
      data: { id: `citation-edge-${index}`, source: edge.from, target: edge.to },
      classes: edge.state,
    })),
  ];
}

function graphLayout() {
  return {
    name: "cose" as const,
    animate: false,
    fit: true,
    padding: 36,
    randomize: true,
    componentSpacing: 70,
    idealEdgeLength: 100,
    nodeRepulsion: 500_000,
    numIter: 600,
  };
}

function color(style: CSSStyleDeclaration, token: string, fallback: string): string {
  return style.getPropertyValue(token).trim() || fallback;
}

if (typeof customElements !== "undefined" && !customElements.get("citation-network-graph")) {
  customElements.define("citation-network-graph", CitationNetworkGraph);
}

declare global {
  interface HTMLElementTagNameMap {
    "citation-network-graph": CitationNetworkGraph;
  }
}
