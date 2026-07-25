import { describe, expect, it } from "vitest";
import type { ProjectAsset, ProjectFile, ProjectFolder } from "../domain/project-files";
import { ProjectTreePanel, projectTreeActionEvent, type ProjectTreeAction } from "./project-tree-panel";

const createdAt = "2026-07-25T00:00:00.000Z";
const file: ProjectFile = {
  content: "# Main",
  createdAt,
  id: "file:1",
  mediaType: "text/markdown",
  path: "main.md",
  updatedAt: createdAt,
};
const nestedFile: ProjectFile = { ...file, id: "file:2", path: "sections/methods.md" };
const folder: ProjectFolder = { createdAt, id: "folder:1", path: "sections", updatedAt: createdAt };
const asset: ProjectAsset = {
  createdAt,
  fingerprint: "fingerprint",
  id: "asset:1",
  mediaType: "image/png",
  objectKey: "assets/figure.png",
  path: "figures/figure.png",
  size: 1024,
  updatedAt: createdAt,
};

class TestProjectTreePanel extends ProjectTreePanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  filterForTest(value: string): void {
    this.filter(eventWithTarget({ value }));
  }

  keyForTest(key: string): void {
    const event = new Event("keydown") as KeyboardEvent;
    Object.defineProperty(event, "key", { value: key });
    Object.defineProperty(event, "currentTarget", { value: { value: "" } });
    this.handleFilterKey(event);
  }

  actForTest(action?: string, ids: { assetId?: string; fileId?: string; folderId?: string } = {}): void {
    this.act(
      eventWithTarget({
        dataset: {
          projectAction: action,
          ...(ids.assetId ? { assetId: ids.assetId } : {}),
          ...(ids.fileId ? { fileId: ids.fileId } : {}),
          ...(ids.folderId ? { folderId: ids.folderId } : {}),
        },
      }),
    );
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

describe("project tree panel", () => {
  it("renders empty, sorted, active, entry, nested, and filtered states", () => {
    const panel = new TestProjectTreePanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setTree({
      activeFileId: nestedFile.id,
      assetBase: "/api/assets",
      assets: [asset],
      entryFileId: file.id,
      files: [nestedFile, file],
      folders: [folder],
    });
    expect(panel.renderForTest()).toBeDefined();
    panel.filterForTest("methods");
    expect(panel.renderForTest()).toBeDefined();
    panel.filterForTest("missing");
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("handles filter clearing and keyboard quick-open", () => {
    const panel = new TestProjectTreePanel();
    const actions: ProjectTreeAction[] = [];
    panel.addEventListener(projectTreeActionEvent, (event) => actions.push((event as CustomEvent<ProjectTreeAction>).detail));
    panel.setTree({
      activeFileId: file.id,
      assetBase: "/api/assets",
      assets: [],
      entryFileId: file.id,
      files: [nestedFile, file],
      folders: [],
    });

    panel.filterForTest("methods");
    panel.keyForTest("Escape");
    panel.keyForTest("Enter");
    panel.filterForTest("missing");
    panel.keyForTest("Enter");
    panel.keyForTest("ArrowDown");

    expect(actions).toEqual([{ action: "select-file", fileId: file.id, focusEditor: true }]);
  });

  it("emits only known tree actions and resources", () => {
    const panel = new TestProjectTreePanel();
    const actions: ProjectTreeAction[] = [];
    panel.addEventListener(projectTreeActionEvent, (event) => actions.push((event as CustomEvent<ProjectTreeAction>).detail));
    panel.setTree({
      activeFileId: file.id,
      assetBase: "/api/assets",
      assets: [asset],
      entryFileId: file.id,
      files: [file],
      folders: [folder],
    });

    panel.actForTest();
    panel.actForTest("select-file", { fileId: "missing" });
    panel.actForTest("select-file", { fileId: file.id });
    panel.actForTest("rename-folder", { folderId: folder.id });
    panel.actForTest("delete-folder", { folderId: folder.id });
    panel.actForTest("insert-asset", { assetId: asset.id });
    panel.actForTest("delete-asset", { assetId: asset.id });
    panel.actForTest("delete-asset", { assetId: "missing" });

    expect(actions).toEqual([
      { action: "select-file", fileId: file.id, focusEditor: false },
      { action: "rename-folder", folderId: folder.id },
      { action: "delete-folder", folderId: folder.id },
      { action: "insert-asset", asset },
      { action: "delete-asset", asset },
    ]);
  });
});
