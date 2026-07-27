import { describe, expect, it } from "vitest";
import { WorkspaceSurfaceSwitcher } from "./workspace-surface-switcher";
import type { WorkspaceSurface } from "./workspace-ui-route";

class TestWorkspaceSurfaceSwitcher extends WorkspaceSurfaceSwitcher {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  selectForTest(surface?: WorkspaceSurface): void {
    const event = new Event("test");
    Object.defineProperty(event, "currentTarget", { value: { dataset: { surface } } });
    this.select(event);
  }
}

describe("workspace surface switcher", () => {
  it("owns active presentation and binds changed surface navigation", () => {
    const switcher = new TestWorkspaceSurfaceSwitcher();
    const workspace = { dataset: {} } as HTMLElement;
    Object.defineProperty(switcher, "parentElement", { value: workspace });
    const surfaces: WorkspaceSurface[] = [];
    switcher.bindNavigation((surface) => surfaces.push(surface));

    switcher.selectForTest();
    switcher.selectForTest("authoring");
    switcher.selectForTest("context");
    expect(workspace.dataset.activeSurface).toBe("context");
    switcher.navigate("context", false);
    switcher.selectForTest("context");
    switcher.selectForTest("authoring");

    expect(surfaces).toEqual(["context", "authoring"]);
    expect(workspace.dataset.activeSurface).toBe("authoring");
    expect(switcher.renderForTest()).toBeDefined();
    expect(switcher.rootForTest()).toBe(switcher);
  });
});
