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

    workspace.setReferences(references);
    workspace.setData(data);
    workspace.updateForTest("references", "data");
    workspace.setCandidateSaving("10.1000/example", true);
    workspace.hidden = true;
    workspace.show();
    workspace.bringIntoView();
    workspace.closeForTest();

    expect(panel.setReferences).toHaveBeenCalledWith(references);
    expect(panel.setData).toHaveBeenCalledWith({ ...data, filterProject: false });
    expect(panel.setCandidateSaving).toHaveBeenCalledWith("10.1000/example", true);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(workspace.hidden).toBe(true);
  });
});
