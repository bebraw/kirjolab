import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSurfaceSwitcher } from "./workspace-surface-switcher";
import type { AuthoringMode, WorkspaceLayout, WorkspaceRail, WorkspaceSurface } from "./workspace-ui-route";

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
  afterEach(() => vi.unstubAllGlobals());

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

  it("owns workspace route restoration and canonical URL synchronization", async () => {
    const switcher = new TestWorkspaceSurfaceSwitcher();
    let railMode: WorkspaceRail = "guide";
    let authoringMode: AuthoringMode = "map";
    let layout: WorkspaceLayout = "context";
    const railNavigate = vi.fn((value: typeof railMode) => {
      railMode = value;
    });
    const modeNavigate = vi.fn((value: typeof authoringMode) => {
      authoringMode = value;
    });
    const layoutNavigate = vi.fn(async (value: string) => {
      layout = value === "context" ? "context" : "split";
      return layout;
    });
    const restoreContext = vi.fn().mockResolvedValue(undefined);
    const selectFile = vi.fn();
    const replaceState = vi.fn();
    const pushState = vi.fn();
    vi.stubGlobal("location", {
      href: "https://example.test/editor/demo?keep=yes&file=notes&rail=guide&mode=map&surface=context&layout=context&context=pdf%3Apaper&page=3&annotation=mark",
    });
    vi.stubGlobal("history", { pushState, replaceState, state: { retained: true } });
    switcher.bindWorkspaceRoute({
      activeFileId: () => "notes",
      activeTab: () => ({ focusedAnnotationId: "mark", id: "paper", key: "pdf:paper", kind: "pdf", page: 3, scrollTop: 0 }),
      contextKey: () => "pdf:paper",
      enabled: true,
      entryFileId: () => "main",
      layout: {
        get value() {
          return layout;
        },
        navigate: layoutNavigate,
      },
      mode: {
        get mode() {
          return authoringMode;
        },
        navigate: modeNavigate,
      },
      rail: {
        get mode() {
          return railMode;
        },
        navigate: railNavigate,
      },
      restoreContext,
      selectFile,
    });

    await switcher.restoreRoute();

    expect(railNavigate).toHaveBeenCalledWith("guide");
    expect(modeNavigate).toHaveBeenCalledWith("map");
    expect(selectFile).toHaveBeenCalledWith("notes");
    expect(restoreContext).toHaveBeenCalledWith("pdf:paper", 3, "mark");
    expect(layoutNavigate).toHaveBeenCalledWith("context", false);
    expect(replaceState).not.toHaveBeenCalled();

    railMode = "comments";
    switcher.syncRoute("push");
    expect(pushState).toHaveBeenCalledWith(
      { view: "workspace" },
      "",
      "/editor/demo?keep=yes&file=notes&rail=comments&mode=map&surface=context&layout=context&context=pdf%3Apaper&page=3&annotation=mark",
    );
  });

  it("ignores route work until an enabled route is bound and restored", async () => {
    const switcher = new TestWorkspaceSurfaceSwitcher();
    const replaceState = vi.fn();
    vi.stubGlobal("location", { href: "https://example.test/editor/demo?rail=guide" });
    vi.stubGlobal("history", { pushState: vi.fn(), replaceState, state: null });

    switcher.syncRoute("replace");
    switcher.bindWorkspaceRoute({
      activeFileId: () => null,
      activeTab: () => undefined,
      contextKey: () => "preview",
      enabled: false,
      entryFileId: () => undefined,
      layout: { value: "split", navigate: vi.fn() },
      mode: { mode: "write", navigate: vi.fn() },
      rail: { mode: "files", navigate: vi.fn() },
      restoreContext: vi.fn(),
      selectFile: vi.fn(),
    });
    await switcher.restoreRoute();

    expect(replaceState).not.toHaveBeenCalled();
  });
});
