import type { TemplateResult } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceLayoutControl, type WorkspaceLayoutElement } from "./workspace-layout-control";
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

class TestLayoutElement extends EventTarget implements WorkspaceLayoutElement {
  readonly dataset: Record<string, string | undefined> = {};
  readonly style = { removeProperty: vi.fn(), setProperty: vi.fn() };
  nextElementSibling: TestLayoutElement | null = null;
  previousElementSibling: TestLayoutElement | null = null;

  focus(): void {}
  getBoundingClientRect(): Pick<DOMRect, "left" | "right" | "width"> {
    return { left: 0, right: 1_200, width: 1_200 };
  }
  hasPointerCapture(): boolean {
    return false;
  }
  releasePointerCapture(): void {}
  setAttribute(): void {}
  setPointerCapture(): void {}
}

class TestLayoutRoot extends TestLayoutElement {
  readonly controls = new Map([
    ["#authoring-context-resizer", new TestLayoutElement()],
    ["#collapse-source-rail", new TestLayoutElement()],
    ["#expand-source-rail", new TestLayoutElement()],
    ["#source-rail-resizer", new TestLayoutElement()],
  ]);

  querySelector(selector: string): TestLayoutElement | null {
    return this.controls.get(selector) ?? null;
  }
}

function bindWorkspace(control: WorkspaceLayoutControl, workspaceId: string, workspace = new TestLayoutRoot()): TestLayoutRoot {
  control.bindWorkspace(workspaceId, {
    contextResourcePresenter: { activeTab: undefined, layoutPdfViewer: { resize: vi.fn() } },
    workspaceSurfaces: workspace,
  });
  return workspace;
}

function requiredTemplateResult(value: unknown): TemplateResult {
  if (typeof value !== "object" || value === null || !("strings" in value) || !("values" in value)) {
    throw new Error("Expected a nested Lit template result");
  }
  return value as TemplateResult;
}

afterEach(() => vi.unstubAllGlobals());

describe("workspace layout control", () => {
  it("owns normalized selection, workspace projection, and persistence", async () => {
    const storage = { getItem: vi.fn(() => "context"), setItem: vi.fn() };
    vi.stubGlobal("localStorage", storage);
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { addEventListener: vi.fn(), dispatchEvent });
    const control = new TestWorkspaceLayoutControl();
    const workspace = bindWorkspace(control, "workspace-1");

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
    vi.stubGlobal("window", { addEventListener: vi.fn(), dispatchEvent: vi.fn() });
    const control = new TestWorkspaceLayoutControl();
    const layouts: WorkspaceLayout[] = [];
    bindWorkspace(control, "workspace-2");
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
    vi.stubGlobal("window", { addEventListener: vi.fn(), dispatchEvent: vi.fn() });
    const control = new TestWorkspaceLayoutControl();
    bindWorkspace(control, "workspace-3");

    await expect(control.restore()).resolves.toBe("split");
    await expect(control.navigate("editor")).resolves.toBe("editor");
    expect(control.value).toBe("editor");
  });

  it("renders the complete workspace project-view contract", () => {
    const control = new TestWorkspaceLayoutControl();
    const layout = control.renderForTest();

    expect(layout.strings.join("")).toContain(
      'class="project-view-control hidden items-center gap-2 font-sans text-xs text-app-text-soft min-[70rem]:flex"',
    );
    expect(layout.strings.join("")).toContain("<span>View</span>");
    expect(layout.values).toHaveLength(1);
    const select = requiredTemplateResult(layout.values[0]);
    expect(select.strings.join("")).toContain(
      '<option value="split">Split</option>\n      <option value="editor">Editor + navigation</option>\n      <option value="context">Context only</option>\n      <option value="pdf">PDF only</option>',
    );
    expect(select.values).toEqual(["workspace-switcher", "Project view", "false", "0", false, "split", expect.any(Function)]);

    control.attributeChangedCallback("mode", null, "library");
    const librarySelect = control.renderForTest();
    expect(librarySelect.strings.join("")).toContain("<select");
    expect(librarySelect.strings.join("")).not.toContain("<label");
    expect(librarySelect.values).toEqual(["", "", "true", "-1", true, "split", expect.any(Function)]);
  });
});
