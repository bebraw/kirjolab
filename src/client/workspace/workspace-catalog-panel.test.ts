import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSummary } from "../../domain/workspace/workspace";
import { filterWorkspaceCatalog, workspaceCatalogMeta, WorkspaceCatalogPanel } from "./workspace-catalog-panel";

class TestWorkspaceCatalogPanel extends WorkspaceCatalogPanel {
  resetCount = 0;

  renderForTest() {
    return this.render();
  }

  override async resetFilter(): Promise<void> {
    this.resetCount += 1;
  }
}

class FakeDialog extends EventTarget {
  closeCount = 0;
  modalCount = 0;

  close(): void {
    this.closeCount += 1;
  }

  showModal(): void {
    this.modalCount += 1;
  }
}

afterEach(() => vi.unstubAllGlobals());

const current: WorkspaceSummary = {
  archivedAt: null,
  createdAt: "2026-07-24T00:00:00.000Z",
  href: "/editor/current",
  id: "current",
  title: "Current inquiry",
  updatedAt: "2026-07-25T00:00:00.000Z",
};

const archived: WorkspaceSummary = {
  ...current,
  archivedAt: "2026-07-25T00:00:00.000Z",
  href: "/editor/archived",
  id: "archived",
  title: "Archived inquiry",
};

function bindWorkspace(
  panel: WorkspaceCatalogPanel,
  currentWorkspaceId: string,
  switcher = { setData: vi.fn() },
  trigger = new EventTarget(),
): void {
  panel.bindWorkspace(currentWorkspaceId, {
    manageWorkspaces: trigger as HTMLElement,
    workspaceSwitcher: switcher,
  });
}

describe("workspace catalog presentation", () => {
  it("filters project titles without case or surrounding-space sensitivity", () => {
    expect(filterWorkspaceCatalog([current, archived], "  ARCHIVED ")).toEqual([archived]);
    expect(filterWorkspaceCatalog([current, archived], "")).toEqual([current, archived]);
  });

  it("describes current, archived, and updated projects", () => {
    expect(workspaceCatalogMeta(current, current.id)).toBe("Current project");
    expect(workspaceCatalogMeta(archived, archived.id)).toBe("Current project · archived");
    expect(workspaceCatalogMeta(current, "another")).toContain("Updated");
    expect(workspaceCatalogMeta(archived, "another")).toContain("Archived");
  });

  it("accepts coordinator-owned catalog state", () => {
    const panel = new TestWorkspaceCatalogPanel();
    const switcher = { setData: vi.fn() };
    expect(panel.renderForTest()).toBeDefined();
    bindWorkspace(panel, current.id, switcher);
    panel.setData([current, archived], current.id);
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.catalog).toEqual([current, archived]);
    expect(switcher.setData).toHaveBeenCalledWith([current, archived], current.id);
    expect(panel).toBeInstanceOf(WorkspaceCatalogPanel);
  });

  it("derives the offline project catalog row", () => {
    const panel = new TestWorkspaceCatalogPanel();
    const switcher = { setData: vi.fn() };
    bindWorkspace(panel, "offline/project", switcher);

    panel.presentOfflineWorkspace({ id: "offline/project", title: "Offline inquiry" }, "2026-07-28T12:00:00.000Z");

    expect(panel.catalog).toEqual([
      {
        archivedAt: null,
        createdAt: "2026-07-28T12:00:00.000Z",
        href: "/editor/offline%2Fproject",
        id: "offline/project",
        title: "Offline inquiry",
        updatedAt: "2026-07-28T12:00:00.000Z",
      },
    ]);
    expect(switcher.setData).toHaveBeenCalledWith(panel.catalog, "offline/project");
  });

  it("loads and validates the shared workspace catalog", async () => {
    const panel = new TestWorkspaceCatalogPanel();
    const switcher = { setData: vi.fn() };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json([current, archived]))
      .mockResolvedValueOnce(Response.json({ invalid: true }))
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    bindWorkspace(panel, current.id, switcher);

    await panel.refresh();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/workspaces");
    expect(panel.catalog).toEqual([current, archived]);
    await expect(panel.refresh()).rejects.toThrow("invalid data");
    await expect(panel.refresh()).rejects.toThrow("Could not load project navigation");
  });

  it("owns its native dialog lifecycle", async () => {
    const panel = new TestWorkspaceCatalogPanel();
    const dialog = new FakeDialog();
    vi.stubGlobal("HTMLDialogElement", FakeDialog);
    Object.defineProperty(panel, "closest", { value: () => dialog });

    await panel.open();
    panel.close();

    expect(dialog.modalCount).toBe(1);
    expect(dialog.closeCount).toBe(1);
    expect(panel.resetCount).toBe(1);
  });

  it("owns its shell trigger", async () => {
    const panel = new TestWorkspaceCatalogPanel();
    const dialog = new FakeDialog();
    const trigger = new EventTarget();
    vi.stubGlobal("HTMLDialogElement", FakeDialog);
    Object.defineProperty(panel, "closest", { value: () => dialog });

    bindWorkspace(panel, current.id, undefined, trigger);
    trigger.dispatchEvent(new Event("click"));
    await Promise.resolve();

    expect(dialog.modalCount).toBe(1);
    expect(panel.resetCount).toBe(1);
  });
});
