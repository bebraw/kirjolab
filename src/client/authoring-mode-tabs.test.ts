import { describe, expect, it, vi } from "vitest";
import type { AuthoringMode } from "./workspace-ui-route";
import { AuthoringModeTabs } from "./authoring-mode-tabs";

class TestAuthoringModeTabs extends AuthoringModeTabs {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  selectForTest(mode?: AuthoringMode): void {
    const event = new Event("click");
    Object.defineProperty(event, "currentTarget", { value: { dataset: mode ? { authoringMode: mode } : {} } });
    this.select(event);
  }
}

describe("authoring mode tabs", () => {
  it("owns active mode presentation", () => {
    const tabs = new TestAuthoringModeTabs();
    expect(tabs.rootForTest()).toBe(tabs);
    expect(tabs.renderForTest()).toBeDefined();
    tabs.setMode("map");
    expect(tabs.mode).toBe("map");
    expect(tabs.renderForTest()).toBeDefined();
  });

  it("binds changed mode navigation only", () => {
    const tabs = new TestAuthoringModeTabs();
    const modes: AuthoringMode[] = [];
    tabs.bindNavigation((mode) => modes.push(mode));
    tabs.selectForTest();
    tabs.selectForTest("write");
    tabs.selectForTest("map");
    expect(modes).toEqual(["map"]);
  });

  it("owns controlled editor and map visibility", () => {
    const tabs = new TestAuthoringModeTabs();
    const editor = { hidden: false };
    const actions = { hidden: false };
    const map = { setVisible: vi.fn() };
    vi.stubGlobal("document", {
      getElementById: (id: string) => (id === "source-editor-shell" ? editor : actions),
      querySelector: () => map,
    });
    try {
      tabs.setMode("map");
      expect(editor.hidden).toBe(true);
      expect(actions.hidden).toBe(true);
      expect(map.setVisible).toHaveBeenLastCalledWith(true);

      tabs.setMode("write");
      expect(editor.hidden).toBe(false);
      expect(actions.hidden).toBe(false);
      expect(map.setVisible).toHaveBeenLastCalledWith(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
