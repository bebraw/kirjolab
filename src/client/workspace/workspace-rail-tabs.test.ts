import { describe, expect, it } from "vitest";
import type { WorkspaceRail } from "./workspace-ui-route";
import { WorkspaceRailTabs } from "./workspace-rail-tabs";

class TestWorkspaceRailTabs extends WorkspaceRailTabs {
  readonly hiddenPanels = new Map<WorkspaceRail, boolean>();

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

  protected override setPanelHidden(mode: WorkspaceRail, hidden: boolean): void {
    this.hiddenPanels.set(mode, hidden);
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
    expect([...tabs.hiddenPanels]).toEqual([
      ["files", true],
      ["research", true],
      ["comments", false],
      ["guide", true],
    ]);
    expect(tabs.renderForTest()).toBeDefined();
  });

  it("owns changed rail navigation and emits the selected mode", () => {
    const tabs = new TestWorkspaceRailTabs();
    const modes: WorkspaceRail[] = [];
    tabs.bindNavigation((mode) => modes.push(mode));
    tabs.selectForTest();
    tabs.selectForTest("files");
    tabs.selectForTest("research");
    expect(tabs.mode).toBe("research");
    expect([...tabs.hiddenPanels]).toEqual([
      ["files", true],
      ["research", false],
      ["comments", true],
      ["guide", true],
    ]);
    expect(modes).toEqual(["research"]);
  });

  it("offers the same navigation ownership to external workflows", () => {
    const tabs = new TestWorkspaceRailTabs();
    const modes: WorkspaceRail[] = [];
    tabs.bindNavigation((mode) => modes.push(mode));
    tabs.navigate("guide");
    expect(tabs.mode).toBe("guide");
    expect(modes).toEqual(["guide"]);
  });
});
