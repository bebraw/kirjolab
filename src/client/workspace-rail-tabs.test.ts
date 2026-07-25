import { describe, expect, it } from "vitest";
import type { WorkspaceRail } from "./workspace-ui-route";
import { WorkspaceRailTabs, workspaceRailChangeEvent } from "./workspace-rail-tabs";

class TestWorkspaceRailTabs extends WorkspaceRailTabs {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  selectForTest(mode?: WorkspaceRail): void {
    const event = new Event("click");
    Object.defineProperty(event, "currentTarget", { value: { dataset: mode ? { railMode: mode } : {} } });
    this.select(event);
  }
}

describe("workspace rail tabs", () => {
  it("owns active mode and comment count presentation", () => {
    const tabs = new TestWorkspaceRailTabs();
    expect(tabs.rootForTest()).toBe(tabs);
    expect(tabs.renderForTest()).toBeDefined();
    tabs.setMode("comments");
    tabs.setCommentCount(3);
    expect(tabs.mode).toBe("comments");
    expect(tabs.renderForTest()).toBeDefined();
  });

  it("emits changed rail intents only", () => {
    const tabs = new TestWorkspaceRailTabs();
    const modes: WorkspaceRail[] = [];
    tabs.addEventListener(workspaceRailChangeEvent, (event) => modes.push((event as CustomEvent<WorkspaceRail>).detail));
    tabs.selectForTest();
    tabs.selectForTest("files");
    tabs.selectForTest("research");
    expect(modes).toEqual(["research"]);
  });
});
