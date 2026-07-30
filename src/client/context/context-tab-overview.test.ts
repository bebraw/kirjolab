import { describe, expect, it } from "vitest";
import type { ContextTabAction } from "./context-tab-action";
import { ContextTabOverview, contextTabOverviewActionEvent, type ContextTabOverviewItem } from "./context-tab-overview";
import type { ResearchContextTab } from "./research-context";

const tabs: readonly ResearchContextTab[] = [
  { key: "preview", kind: "preview", scrollTop: 0 },
  { key: "library", kind: "library", scrollTop: 0 },
  { key: "assistant", kind: "assistant", scrollTop: 0 },
  { id: "publication:1", key: "publication:publication:1", kind: "publication", scrollTop: 0 },
  { focusedAnnotationId: null, id: "pdf:1", key: "library-pdf:pdf:1", kind: "library-pdf", page: 1, scrollTop: 0 },
];
const items: readonly ContextTabOverviewItem[] = tabs.map((tab) => ({ tab, title: tab.kind }));

class TestContextTabOverview extends ContextTabOverview {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  actForTest(action?: string, key?: string): void {
    const event = new Event("test");
    Object.defineProperty(event, "currentTarget", {
      value: { closest: () => null, dataset: { contextAction: action, contextKey: key } },
    });
    this.act(event);
  }
}

describe("context tab overview", () => {
  it("renders hidden, populated, and standalone Library states", () => {
    const panel = new TestContextTabOverview();
    expect(panel.renderForTest()).toBeDefined();
    panel.setTabs({ activeKey: tabs[3]!.key, items, standaloneLibrary: false });
    expect(panel.renderForTest()).toBeDefined();
    panel.setTabs({ activeKey: "library", items, standaloneLibrary: true });
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits only bounded tab actions", () => {
    const panel = new TestContextTabOverview();
    const actions: ContextTabAction[] = [];
    panel.addEventListener(contextTabOverviewActionEvent, (event) => actions.push((event as CustomEvent<ContextTabAction>).detail));

    panel.actForTest();
    panel.actForTest("missing", "preview");
    panel.actForTest("activate", "preview");
    panel.actForTest("close", tabs[3]!.key);

    expect(actions).toEqual([
      { action: "activate", key: "preview" },
      { action: "close", key: tabs[3]!.key },
    ]);
  });
});
