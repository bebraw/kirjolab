import { describe, expect, it } from "vitest";
import { WorkspaceSurfaceSwitcher, workspaceSurfaceChangeEvent } from "./workspace-surface-switcher";
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
  it("owns active presentation and emits changed surface intents", () => {
    const switcher = new TestWorkspaceSurfaceSwitcher();
    const surfaces: WorkspaceSurface[] = [];
    switcher.addEventListener(workspaceSurfaceChangeEvent, (event) => {
      surfaces.push((event as CustomEvent<WorkspaceSurface>).detail);
    });

    switcher.selectForTest();
    switcher.selectForTest("authoring");
    switcher.selectForTest("context");
    switcher.setSurface("context");
    switcher.selectForTest("context");
    switcher.selectForTest("authoring");

    expect(surfaces).toEqual(["context", "authoring"]);
    expect(switcher.renderForTest()).toBeDefined();
    expect(switcher.rootForTest()).toBe(switcher);
  });
});
