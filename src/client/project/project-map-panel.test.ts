import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceKnowledgeGraph } from "../../domain/knowledge";
import { ProjectMapPanel, projectMapSelectEvent } from "./project-map-panel";

const graph: WorkspaceKnowledgeGraph = {
  edges: [
    { from: "project:demo", id: "edge:1", label: "", relation: "contains", to: "section:results" },
    { from: "publication:source", id: "edge:2", label: "", relation: "supports", to: "claim:result" },
  ],
  nodes: [
    { id: "project:demo", kind: "project", label: "Demo" },
    { id: "person:author", kind: "person", label: "Author" },
    { id: "publication:source", kind: "publication", label: "Source" },
    { id: "claim:result", kind: "claim", label: "Result" },
    { id: "section:results", kind: "section", label: "Results" },
  ],
};

class TestProjectMapPanel extends ProjectMapPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  selectForTest(resourceId?: string): void {
    this.select(eventWithResource(resourceId));
  }

  emphasizeForTest(resourceId?: string): void {
    this.emphasize(eventWithResource(resourceId));
  }

  restoreForTest(): void {
    this.restoreFocusedEmphasis();
  }

  focusForTest(resourceId?: string): void {
    this.emphasizeFocused(eventWithResource(resourceId));
  }

  blurForTest(): void {
    this.restoreFocusedAfterFrame();
  }

  measureForTest(): void {
    this.measureEdges();
  }

  updatedForTest(changed: Map<PropertyKey, unknown>): void {
    this.updated(changed);
  }
}

function eventWithResource(resourceId?: string): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", {
    value: { dataset: resourceId ? { resourceId } : {}, matches: () => true },
  });
  return event;
}

describe("project map panel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders empty and populated provenance lanes", () => {
    const panel = new TestProjectMapPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setGraph(graph);
    expect(panel.renderForTest()).toBeDefined();
    panel.emphasizeForTest("project:demo");
    expect(panel.renderForTest()).toBeDefined();
    panel.emphasizeForTest();
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits bounded resource-selection intents", () => {
    const panel = new TestProjectMapPanel();
    const selections: string[] = [];
    panel.addEventListener(projectMapSelectEvent, (event) => selections.push((event as CustomEvent<string>).detail));

    panel.selectForTest();
    panel.selectForTest("claim:result");

    expect(selections).toEqual(["claim:result"]);
  });

  it("handles focus emphasis when browser scheduling is unavailable", () => {
    const panel = new TestProjectMapPanel();
    panel.restoreForTest();
    panel.focusForTest("project:demo");
    panel.blurForTest();
    expect(panel.renderForTest()).toBeDefined();
  });

  it("measures and renders connector geometry with emphasis", () => {
    const panel = new TestProjectMapPanel();
    const canvas = { bottom: 220, height: 200, left: 10, right: 310, top: 20, width: 300, x: 10, y: 20 };
    const nodeBounds = new Map([
      ["project:demo", { bottom: 80, height: 40, left: 30, right: 130, top: 40, width: 100, x: 30, y: 40 }],
      ["section:results", { bottom: 180, height: 40, left: 190, right: 290, top: 140, width: 100, x: 190, y: 140 }],
    ]);
    Object.defineProperties(panel, {
      getBoundingClientRect: { value: () => canvas },
      querySelectorAll: {
        value: () =>
          [...nodeBounds].map(([resourceId, bounds]) => ({
            dataset: { resourceId },
            getBoundingClientRect: () => bounds,
          })),
      },
    });
    panel.setGraph(graph);

    panel.measureForTest();
    expect(panel.renderForTest()).toBeDefined();
    panel.emphasizeForTest("project:demo");
    expect(panel.renderForTest()).toBeDefined();
    panel.emphasizeForTest("person:author");
    expect(panel.renderForTest()).toBeDefined();
  });

  it("observes graph layout changes and scheduled focus updates", () => {
    let observed = false;
    let disconnected = false;
    class TestResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe(): void {
        observed = true;
        this.callback([], this as unknown as ResizeObserver);
      }

      disconnect(): void {
        disconnected = true;
      }
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const panel = new TestProjectMapPanel();
    Object.defineProperties(panel, {
      getBoundingClientRect: {
        value: () => ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0 }),
      },
      querySelectorAll: { value: () => [] },
    });

    panel.updatedForTest(new Map());
    panel.updatedForTest(new Map([["graph", undefined]]));
    panel.focusForTest("project:demo");
    panel.blurForTest();
    panel.disconnectedCallback();

    expect(observed).toBe(true);
    expect(disconnected).toBe(true);
  });
});
