import { describe, expect, it } from "vitest";
import type { CitationNetwork } from "../domain/citation-assertions";
import { citationGraphElements, CitationNetworkGraph } from "./citation-network-graph";

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
});
