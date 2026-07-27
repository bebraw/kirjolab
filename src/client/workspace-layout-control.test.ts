import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceLayoutControl } from "./workspace-layout-control";
import type { WorkspaceLayout } from "./workspace-ui-route";

class TestWorkspaceLayoutControl extends WorkspaceLayoutControl {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  async changeForTest(value: string): Promise<void> {
    const event = new Event("change");
    Object.defineProperty(event, "currentTarget", { value: { value } });
    this.change(event);
    await Promise.resolve();
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("workspace layout control", () => {
  it("owns normalized selection, workspace projection, and persistence", async () => {
    const storage = { getItem: vi.fn(() => "context"), setItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    const control = new TestWorkspaceLayoutControl();
    const workspace = { dataset: {} } as HTMLElement;
    control.configure("workspace-1", workspace);

    await expect(control.restore()).resolves.toBe("context");
    expect(control.value).toBe("context");
    await expect(control.navigate("unknown")).resolves.toBe("split");
    expect(workspace.dataset.layout).toBe("split");
    expect(dispatchEvent).toHaveBeenCalledTimes(2);
    expect(storage.setItem).toHaveBeenCalledWith("kirjolab:layout:workspace-1", "split");
    expect(control.renderForTest()).toBeDefined();
    expect(control.rootForTest()).toBe(control);
  });

  it("binds only normalized persisted layout changes", async () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    const control = new TestWorkspaceLayoutControl();
    const layouts: WorkspaceLayout[] = [];
    control.configure("workspace-2", { dataset: {} } as HTMLElement);
    control.bindChange((layout) => {
      layouts.push(layout);
    });

    await control.changeForTest("pdf");
    await control.changeForTest("invalid");

    expect(layouts).toEqual(["pdf", "split"]);
    expect(storage.setItem).toHaveBeenLastCalledWith("kirjolab:layout:workspace-2", "split");
  });

  it("remains usable when browser storage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    });
    const control = new TestWorkspaceLayoutControl();

    await expect(control.restore()).resolves.toBe("split");
    await expect(control.navigate("editor")).resolves.toBe("editor");
    expect(control.value).toBe("editor");
  });
});
