import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWorkspaceKnowledgeGraph, type KnowledgeSearchResult, type WorkspaceKnowledgeGraph } from "../domain/knowledge";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import { ProjectMapWorkspace } from "./project-map-workspace";

const graph: WorkspaceKnowledgeGraph = {
  edges: [{ from: "publication:source", id: "edge:1", label: "", relation: "supports", to: "claim:result" }],
  nodes: [
    { id: "publication:source", kind: "publication", label: "Source paper" },
    { id: "claim:result", kind: "claim", label: "Result claim" },
  ],
};

const results: KnowledgeSearchResult[] = [
  { excerpt: "Evidence excerpt", kind: "claim", resourceId: "claim:result", score: 10, title: "Result claim" },
];

class TestProjectMapWorkspace extends ProjectMapWorkspace {
  protected override getUpdateComplete(): Promise<boolean> {
    return Promise.resolve(true);
  }

  renderForTest() {
    return this.render();
  }

  searchForTest(detail: string): Promise<void> {
    return this.search(new CustomEvent("knowledge-search", { detail }));
  }

  forwardSelectionForTest(detail: string): void {
    this.forwardSelection(new CustomEvent("project-map-select", { detail }));
  }

  updateForTest(...properties: string[]): void {
    this.updated(new Map(properties.map((property) => [property, undefined])));
  }
}

describe("project map workspace", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders graph totals and each search presentation state", () => {
    const workspace = new TestProjectMapWorkspace();
    expect(workspace.renderForTest()).toBeDefined();
    workspace.setGraph(graph);
    expect(workspace.renderForTest()).toBeDefined();
    workspace.showSearchResults(results);
    expect(workspace.renderForTest()).toBeDefined();
    workspace.showSearchError("Search failed");
    expect(workspace.renderForTest()).toBeDefined();
    workspace.clearSearch();
    expect(workspace.renderForTest()).toBeDefined();
  });

  it("derives the evidence graph from canonical workspace inputs", () => {
    const workspace = new TestProjectMapWorkspace();
    const setGraph = vi.spyOn(workspace, "setGraph");

    workspace.presentWorkspace(workspaceSnapshotFixture, "@article{source}", "# Current manuscript");

    expect(setGraph).toHaveBeenCalledWith(
      buildWorkspaceKnowledgeGraph({
        ...workspaceSnapshotFixture,
        bibliography: "@article{source}",
        source: "# Current manuscript",
      }),
    );
  });

  it("owns project search while forwarding resource-selection intents", async () => {
    const workspace = new TestProjectMapWorkspace();
    const selections: string[] = [];
    const select = (id: string): void => void selections.push(id);
    workspace.bindNavigation({
      annotation: select,
      claim: select,
      document: select,
      "model-candidate": select,
      note: select,
      pdf: select,
      person: select,
      project: select,
      publication: select,
      section: select,
    });
    workspace.configure("/api/documents/document-1");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(results), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await workspace.searchForTest("evidence & claims");
    workspace.forwardSelectionForTest("claim:result");

    expect(fetchMock).toHaveBeenCalledWith("/api/documents/document-1/search?q=evidence%20%26%20claims", {
      credentials: "same-origin",
    });
    expect(workspace.renderForTest()).toBeDefined();
    expect(selections).toEqual(["result"]);
  });

  it("ignores malformed and unknown resource keys", () => {
    const workspace = new TestProjectMapWorkspace();
    const select = vi.fn();
    workspace.bindNavigation({
      annotation: select,
      claim: select,
      document: select,
      "model-candidate": select,
      note: select,
      pdf: select,
      person: select,
      project: select,
      publication: select,
      section: select,
    });

    workspace.forwardSelectionForTest("missing-separator");
    workspace.forwardSelectionForTest("unknown:id");

    expect(select).not.toHaveBeenCalled();
  });

  it("clears an empty search and presents request and contract errors", async () => {
    const workspace = new TestProjectMapWorkspace();
    workspace.configure("/api/documents/document-1");

    await workspace.searchForTest("");
    expect(workspace.renderForTest()).toBeDefined();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Search unavailable" }), { status: 503 })));
    await workspace.searchForTest("evidence");
    expect(workspace.renderForTest()).toBeDefined();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results }), { status: 200 })));
    await workspace.searchForTest("evidence");
    expect(workspace.renderForTest()).toBeDefined();
  });

  it("synchronizes graph, search state, and bounded map focus with its child panels", async () => {
    const workspace = new TestProjectMapWorkspace();
    const map = { refreshLayout: vi.fn(), setGraph: vi.fn() };
    const connections = { setGraph: vi.fn() };
    const search = { clear: vi.fn(), showError: vi.fn(), showResults: vi.fn() };
    const mapNode = { focus: vi.fn() };
    Object.defineProperty(workspace, "querySelector", {
      value: (selector: string) =>
        selector === "#project-map-canvas"
          ? map
          : selector === "#knowledge-connections-panel"
            ? connections
            : selector === ".project-map-node"
              ? mapNode
              : search,
    });

    workspace.setGraph(graph);
    workspace.updateForTest("graph");
    workspace.showSearchResults(results);
    workspace.updateForTest("searchState");
    workspace.showSearchError("Search failed");
    workspace.updateForTest("searchState");
    workspace.clearSearch();
    workspace.updateForTest("searchState");
    workspace.setVisible(true);
    await Promise.resolve();
    expect(map.refreshLayout).toHaveBeenCalledOnce();
    expect(mapNode.focus).toHaveBeenCalledOnce();
    map.refreshLayout.mockClear();
    mapNode.focus.mockClear();
    workspace.setVisible(true);
    workspace.setVisible(false);
    await Promise.resolve();

    expect(map.setGraph).toHaveBeenCalledWith(graph);
    expect(connections.setGraph).toHaveBeenCalledWith(graph);
    expect(search.showResults).toHaveBeenCalledWith(results);
    expect(search.showError).toHaveBeenCalledWith("Search failed");
    expect(search.clear).toHaveBeenCalled();
    expect(workspace.hidden).toBe(true);
    expect(map.refreshLayout).not.toHaveBeenCalled();
    expect(mapNode.focus).not.toHaveBeenCalled();
  });
});
