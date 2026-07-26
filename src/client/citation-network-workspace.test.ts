import { describe, expect, it, vi } from "vitest";
import { CitationNetworkWorkspace, citationNetworkFilterEvent } from "./citation-network-workspace";

class TestCitationNetworkWorkspace extends CitationNetworkWorkspace {
  renderForTest() {
    return this.render();
  }

  updateForTest(...properties: string[]): void {
    this.updated(new Map(properties.map((property) => [property, undefined])));
  }

  toggleForTest(): void {
    this.toggleProjectFilter();
  }

  closeForTest(): void {
    this.close();
  }
}

describe("citation network workspace", () => {
  it("renders and emits its bounded project-filter state", () => {
    const workspace = new TestCitationNetworkWorkspace();
    const filters: boolean[] = [];
    workspace.addEventListener(citationNetworkFilterEvent, (event) => filters.push((event as CustomEvent<boolean>).detail));

    expect(workspace.renderForTest()).toBeDefined();
    workspace.toggleForTest();
    expect(workspace.renderForTest()).toBeDefined();
    workspace.toggleForTest();

    expect(filters).toEqual([true, false]);
  });

  it("owns visibility and synchronizes the nested network panel", () => {
    const workspace = new TestCitationNetworkWorkspace();
    const panel = { setCandidateSaving: vi.fn(), setData: vi.fn(), setReferences: vi.fn() };
    const scrollIntoView = vi.fn();
    Object.defineProperty(workspace, "querySelector", { value: () => panel });
    Object.defineProperty(workspace, "scrollIntoView", { value: scrollIntoView });
    const references = [{ id: "source:1", title: "Source" }];
    const data = { expansion: null, network: null, referenceTitles: { "source:1": "Source" } };
    const network = { edges: [], nodes: [], projectId: null, truncated: false };
    const expansion = {
      assertions: [],
      direction: "references" as const,
      provider: "crossref" as const,
      requestedBy: "researcher@example.com",
      responseId: "response-1",
      retrievedAt: "2026-07-26T00:00:00.000Z",
      seedReferenceId: "source:1",
      sourceLocator: "Crossref",
      truncated: false,
      unmatched: [],
    };

    workspace.setReferences(references);
    workspace.setData(data);
    workspace.setNetwork(network, { a: "Seed A" });
    workspace.setExpansion(expansion);
    workspace.updateForTest("references", "data");
    workspace.setCandidateSaving("10.1000/example", true);
    workspace.hidden = true;
    workspace.show();
    workspace.bringIntoView();
    workspace.closeForTest();

    expect(panel.setReferences).toHaveBeenCalledWith(references);
    expect(panel.setData).toHaveBeenCalledWith({ expansion, filterProject: false, network, referenceTitles: { a: "Seed A" } });
    expect(panel.setCandidateSaving).toHaveBeenCalledWith("10.1000/example", true);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(workspace.hidden).toBe(true);
  });
});
