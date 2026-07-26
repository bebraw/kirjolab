import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceLayoutControl, workspaceLayoutChangeEvent } from "./workspace-layout-control";
import type { WorkspaceLayout } from "./workspace-ui-route";

class TestWorkspaceLayoutControl extends WorkspaceLayoutControl {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  changeForTest(value: string): void {
    const event = new Event("change");
    Object.defineProperty(event, "currentTarget", { value: { value } });
    this.change(event);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("workspace layout control", () => {
  it("owns normalized selection and workspace-scoped persistence", () => {
    const storage = { getItem: vi.fn(() => "context"), setItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    const control = new TestWorkspaceLayoutControl();
    control.configure("workspace-1");

    expect(control.restore()).toBe("context");
    expect(control.value).toBe("context");
    expect(control.setLayout("unknown")).toBe("split");
    expect(storage.setItem).toHaveBeenCalledWith("kirjolab:layout:workspace-1", "split");
    expect(control.renderForTest()).toBeDefined();
    expect(control.rootForTest()).toBe(control);
  });

  it("emits only normalized persisted layout changes", () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    const control = new TestWorkspaceLayoutControl();
    const layouts: WorkspaceLayout[] = [];
    control.configure("workspace-2");
    control.addEventListener(workspaceLayoutChangeEvent, (event) => {
      layouts.push((event as CustomEvent<WorkspaceLayout>).detail);
    });

    control.changeForTest("pdf");
    control.changeForTest("invalid");

    expect(layouts).toEqual(["pdf", "split"]);
    expect(storage.setItem).toHaveBeenLastCalledWith("kirjolab:layout:workspace-2", "split");
  });

  it("remains usable when browser storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    });
    const control = new TestWorkspaceLayoutControl();

    expect(control.restore()).toBe("split");
    expect(control.setLayout("editor")).toBe("editor");
    expect(control.value).toBe("editor");
  });
});
