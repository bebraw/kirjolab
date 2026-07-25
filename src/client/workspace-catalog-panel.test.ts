import { describe, expect, it } from "vitest";
import type { WorkspaceSummary } from "../domain/workspace";
import { filterWorkspaceCatalog, workspaceCatalogMeta, WorkspaceCatalogPanel } from "./workspace-catalog-panel";

class TestWorkspaceCatalogPanel extends WorkspaceCatalogPanel {
  renderForTest() {
    return this.render();
  }
}

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
});
