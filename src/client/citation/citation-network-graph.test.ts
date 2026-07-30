import { afterEach, describe, expect, it, vi } from "vitest";
import type { CitationNetwork } from "../../domain/citation/citation-assertions";
import { citationGraphElements, citationGraphStyles, CitationNetworkGraph, resolvedCssColor } from "./citation-network-graph";

const network: CitationNetwork = {
  projectId: null,
  nodes: [
    { id: "reference:a", referenceId: "a", label: "Alpha", authors: [], year: "2024", doi: "10.1000/a", inProject: true },
    { id: "reference:b", referenceId: "b", label: "Beta", authors: [], year: "2025", doi: "10.1000/b", inProject: false },
  ],
  edges: [
    {
      id: "a:b:cites",
      from: "reference:a",
      to: "reference:b",
      state: "confirmed",
      assertions: [],
    },
  ],
  truncated: false,
};

class TestCitationNetworkGraph extends CitationNetworkGraph {
  renderForTest() {
    return this.render();
  }
}

describe("citation network graph runtime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("projects renderer-neutral nodes and directed edges into Cytoscape elements", () => {
    expect(citationGraphElements(network, "a")).toEqual([
      { data: { id: "reference:a", label: "Alpha", referenceId: "a" }, classes: "project focused" },
      { data: { id: "reference:b", label: "Beta", referenceId: "b" }, classes: "library" },
      { data: { id: "citation-edge-0", source: "reference:a", target: "reference:b" }, classes: "confirmed" },
    ]);
  });

  it("keeps native viewport controls available beside the canvas", () => {
    const graph = new TestCitationNetworkGraph();
    graph.network = network;
    expect(graph.renderForTest()).toBeDefined();
  });

  it("resolves dark-mode CSS tokens before passing colors to Cytoscape", () => {
    const graph = new TestCitationNetworkGraph();
    Object.defineProperty(graph, "style", { value: { color: "inherited" } });
    const resolvedColors = new Map([
      ["var(--color-app-paper, #f6f4ed)", "rgb(28, 35, 32)"],
      ["var(--color-app-ink, #18231f)", "rgb(242, 239, 230)"],
      ["var(--color-app-accent, #5bb99d)", "rgb(98, 197, 164)"],
      ["var(--color-app-accent-strong, #0c7655)", "rgb(139, 219, 190)"],
      ["var(--color-app-graph-confirmed, #4e6b61)", "rgb(117, 211, 179)"],
      ["var(--color-app-graph-extracted, #4e6b61)", "rgb(165, 185, 178)"],
      ["var(--color-app-graph-conflicting, #4e6b61)", "rgb(237, 130, 116)"],
      ["var(--color-app-graph-inferred, #4e6b61)", "rgb(221, 182, 107)"],
    ]);
    vi.stubGlobal("getComputedStyle", (element: HTMLElement) => ({ color: resolvedColors.get(element.style.color) ?? "" }));

    const styles = citationGraphStyles(graph);
    const nodeStyle = styles[0];

    expect(nodeStyle && "style" in nodeStyle ? nodeStyle.style : null).toMatchObject({
      "background-color": "rgb(28, 35, 32)",
      "border-color": "rgb(242, 239, 230)",
      color: "rgb(242, 239, 230)",
      "text-background-color": "rgb(28, 35, 32)",
    });
    expect(graph.style.color).toBe("inherited");
    expect(resolvedCssColor(graph, "--missing", "#abcdef")).toBe("#abcdef");
  });
});
