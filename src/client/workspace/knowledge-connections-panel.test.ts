import { describe, expect, it } from "vitest";
import type { WorkspaceKnowledgeGraph } from "../../domain/knowledge";
import { KnowledgeConnectionsPanel, knowledgeConnectionSelectEvent } from "./knowledge-connections-panel";

const graph: WorkspaceKnowledgeGraph = {
  edges: [
    { from: "publication:source", id: "edge:1", label: "Grounding path", relation: "supports", to: "claim:result" },
    { from: "missing:source", id: "edge:2", label: "", relation: "contains", to: "claim:result" },
  ],
  nodes: [
    { id: "publication:source", kind: "publication", label: "Source paper" },
    { id: "claim:result", kind: "claim", label: "Result claim" },
  ],
};

class TestKnowledgeConnectionsPanel extends KnowledgeConnectionsPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  selectForTest(resourceId?: string): void {
    const event = new Event("test");
    Object.defineProperty(event, "currentTarget", { value: { dataset: { resourceId } } });
    this.selectResource(event);
  }
}

describe("knowledge connections panel", () => {
  it("renders empty, linked, labelled, and unresolved-edge states", () => {
    const panel = new TestKnowledgeConnectionsPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setGraph(graph);
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits bounded resource-selection intents", () => {
    const panel = new TestKnowledgeConnectionsPanel();
    const selections: string[] = [];
    panel.addEventListener(knowledgeConnectionSelectEvent, (event) => selections.push((event as CustomEvent<string>).detail));

    panel.selectForTest("publication:source");
    panel.selectForTest();

    expect(selections).toEqual(["publication:source"]);
  });
});
