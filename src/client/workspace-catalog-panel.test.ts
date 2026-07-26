import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSummary } from "../domain/workspace";
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
    expect(panel.renderForTest()).toBeDefined();
    panel.setData([current, archived], current.id);
    expect(panel.renderForTest()).toBeDefined();
    expect(panel).toBeInstanceOf(WorkspaceCatalogPanel);
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
});
