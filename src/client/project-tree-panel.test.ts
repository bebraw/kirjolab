import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectAsset, ProjectFile, ProjectFolder } from "../domain/project-files";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import type { DeferredDeletionNoticeOptions } from "./deferred-deletion";
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

  quickOpenForTest(event: KeyboardEvent): void {
    this.handleQuickOpen(event);
  }

  menuForTest(key: string, open: boolean): void {
    this.rememberMenu(eventWithTarget({ open }), key);
  }

  disconnectForTest(): void {
    this.disconnectedCallback();
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
    panel.menuForTest(`folder:${folder.id}`, true);
    expect(panel.renderForTest()).toBeDefined();
    panel.menuForTest(`folder:${folder.id}`, false);
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

  it("emits the global quick-open intent and removes its listener", () => {
    const panel = new TestProjectTreePanel();
    const actions: ProjectTreeAction[] = [];
    let removed = false;
    Object.defineProperty(panel, "ownerDocument", {
      value: {
        querySelector: () => null,
        removeEventListener: () => {
          removed = true;
        },
      },
    });
    panel.setAttribute("app-mode", "workspace");
    panel.addEventListener(projectTreeActionEvent, (event) => actions.push((event as CustomEvent<ProjectTreeAction>).detail));
    const event = new Event("keydown", { cancelable: true }) as KeyboardEvent;
    Object.defineProperties(event, {
      altKey: { value: false },
      ctrlKey: { value: true },
      key: { value: "p" },
      metaKey: { value: false },
      shiftKey: { value: false },
    });

    panel.quickOpenForTest(event);
    panel.disconnectForTest();

    expect(event.defaultPrevented).toBe(true);
    expect(actions).toEqual([{ action: "quick-open" }]);
    expect(removed).toBe(true);
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
    panel.actForTest("insert-asset", { assetId: asset.id });
    panel.actForTest("delete-asset", { assetId: "missing" });

    expect(actions).toEqual([
      { action: "select-file", fileId: file.id, focusEditor: false },
      { action: "rename-folder", folderId: folder.id },
      { action: "insert-asset", asset },
    ]);
  });

  it("owns delayed folder and image deletion through validated snapshots", async () => {
    vi.useFakeTimers();
    const panel = new TestProjectTreePanel();
    const accepted: WorkspaceSnapshot[] = [];
    const previewChanged = vi.fn();
    panel.configure("/api/workspaces/workspace", {
      acceptSnapshot: (snapshot) => accepted.push(snapshot),
      presentNotice: vi.fn(),
      previewChanged,
    });
    panel.setTree({
      activeFileId: file.id,
      assetBase: "/api/assets",
      assets: [asset],
      entryFileId: file.id,
      files: [file],
      folders: [folder],
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(workspaceSnapshotFixture))
      .mockResolvedValueOnce(Response.json(workspaceSnapshotFixture));

    panel.actForTest("delete-folder", { folderId: folder.id });
    await vi.advanceTimersByTimeAsync(6_000);
    panel.actForTest("delete-asset", { assetId: asset.id });
    await vi.advanceTimersByTimeAsync(6_000);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/workspaces/workspace/folders/folder%3A1", {
      credentials: "same-origin",
      method: "DELETE",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/workspaces/workspace/assets/asset%3A1", {
      credentials: "same-origin",
      method: "DELETE",
    });
    expect(accepted).toEqual([workspaceSnapshotFixture, workspaceSnapshotFixture]);
    expect(previewChanged).toHaveBeenCalledTimes(2);
  });

  it("restores failed deletion and supports tree-local undo", async () => {
    vi.useFakeTimers();
    const panel = new TestProjectTreePanel();
    const notices: { message: string; options: DeferredDeletionNoticeOptions | undefined }[] = [];
    panel.configure("/api/workspaces/workspace", {
      acceptSnapshot: vi.fn(),
      presentNotice: (message, options) => notices.push({ message, options }),
      previewChanged: vi.fn(),
    });
    panel.setTree({
      activeFileId: file.id,
      assetBase: "/api/assets",
      assets: [asset],
      entryFileId: file.id,
      files: [file],
      folders: [folder],
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(Response.json({ invalid: true })));

    panel.actForTest("delete-folder", { folderId: folder.id });
    await vi.advanceTimersByTimeAsync(6_000);
    await Promise.resolve();
    expect(notices.at(-1)?.message).toBe(`Could not delete ${folder.path}.`);

    panel.actForTest("delete-asset", { assetId: asset.id });
    await Promise.resolve();
    notices.at(-1)?.options?.action();
    await vi.advanceTimersByTimeAsync(6_000);
    await Promise.resolve();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(notices.at(-1)?.message).toBe(`Restored ${asset.path}.`);
  });
});
