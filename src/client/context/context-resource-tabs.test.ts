import { describe, expect, it } from "vitest";
import {
  ContextResourceTabs,
  contextResourceTabActionEvent,
  contextResourceTabId,
  type ContextResourceTabItem,
} from "./context-resource-tabs";
import type { ContextTabAction } from "./context-tab-action";
import type { ResearchResourceTab } from "./research-context";

const publication: ResearchResourceTab = {
  id: "publication:1",
  key: "publication:publication:1",
  kind: "publication",
  scrollTop: 0,
};
const candidate: ResearchResourceTab = {
  id: "candidate:1",
  key: "candidate:candidate:1",
  kind: "candidate",
  scrollTop: 0,
};
const pdf: ResearchResourceTab = {
  focusedAnnotationId: null,
  id: "pdf:1",
  key: "pdf:pdf:1",
  kind: "pdf",
  page: 1,
  scrollTop: 0,
};
const items: readonly ContextResourceTabItem[] = [
  { tab: publication, title: "Reference" },
  { tab: candidate, title: "Revision" },
  { tab: pdf, title: "Paper" },
];

class TestContextResourceTabs extends ContextResourceTabs {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  actForTest(action?: string, key?: string): void {
    const event = new Event("test");
    Object.defineProperty(event, "currentTarget", {
      value: { dataset: { contextAction: action, contextKey: key } },
    });
    this.act(event);
  }
}

describe("context resource tabs", () => {
  it("renders empty and active resource tab states", () => {
    const panel = new TestContextResourceTabs();
    expect(panel.renderForTest()).toBeDefined();
    panel.setTabs({ activeKey: candidate.key, items });
    expect(panel.renderForTest()).toBeDefined();
    expect(contextResourceTabId(publication)).toBe("context-tab-publication-publication:1");
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits only bounded tab actions", () => {
    const panel = new TestContextResourceTabs();
    const actions: ContextTabAction[] = [];
    panel.addEventListener(contextResourceTabActionEvent, (event) => actions.push((event as CustomEvent<ContextTabAction>).detail));

    panel.actForTest();
    panel.actForTest("missing", publication.key);
    panel.actForTest("activate", publication.key);
    panel.actForTest("close", candidate.key);

    expect(actions).toEqual([
      { action: "activate", key: publication.key },
      { action: "close", key: candidate.key },
    ]);
  });
});
