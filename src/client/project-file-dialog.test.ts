import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProjectFileDialog,
  projectImageInsertion,
  projectFileDialogIsCreating,
  projectFileDialogIsFolder,
  projectFileSavedEvent,
  type ProjectFileDeletionCallbacks,
  type ProjectFileDialogMode,
  type ProjectFileSaved,
} from "./project-file-dialog";
import { workspaceSnapshotFixture as snapshot } from "../test-support/workspace-fixture";
import { projectFileActionEvent } from "./project-file-actions";
import { projectImagesUploadedEvent } from "./project-image-upload-control";
import { projectTreeActionEvent } from "./project-tree-panel";

class TestProjectFileDialog extends ProjectFileDialog {
  focusCount = 0;
  showCount = 0;
  readonly input = {
    focus: () => {
      this.focusCount += 1;
    },
    value: "",
  };
  readonly modal = {
    close: () => {
      this.modal.open = false;
    },
    open: false,
    showModal: () => {
      this.showCount += 1;
      this.modal.open = true;
    },
  };

  override get updateComplete(): Promise<boolean> {
    return Promise.resolve(true);
  }

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  configureForTest(mode: ProjectFileDialogMode, path = "", targetId: string | null = null): void {
    this.configure(mode, path, targetId);
  }

  saveForTest(): Promise<void> {
    return this.save(new Event("submit") as SubmitEvent);
  }

  cancelForTest(): void {
    this.cancel();
  }

  protected override get dialog(): HTMLDialogElement {
    return this.modal as HTMLDialogElement;
  }

  protected override get pathInput(): HTMLInputElement {
    return this.input as HTMLInputElement;
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function deletionCallbacks(): ProjectFileDeletionCallbacks {
  return {
    commit: vi.fn(),
    presentNotice: vi.fn(),
    selectFile: vi.fn(),
  };
}

describe("project file dialog", () => {
  it("classifies file and folder operations", () => {
    expect(projectFileDialogIsFolder("create")).toBe(false);
    expect(projectFileDialogIsFolder("create-folder")).toBe(true);
    expect(projectFileDialogIsFolder("rename-folder")).toBe(true);
    expect(projectFileDialogIsCreating("create-and-include")).toBe(true);
    expect(projectFileDialogIsCreating("rename")).toBe(false);
  });

  it("renders each operation from bounded mode and path state", () => {
    const panel = new TestProjectFileDialog();
    expect(panel.rootForTest()).toBe(panel);
    for (const mode of ["create", "create-and-include", "rename", "create-folder", "rename-folder"] as const) {
      panel.configureForTest(mode, mode.includes("folder") ? "chapters" : "chapters/method.md");
      expect(panel.renderForTest()).toBeDefined();
    }
  });

  it("derives rename paths and stable targets from project resources", async () => {
    const panel = new TestProjectFileDialog();
    const show = vi.spyOn(panel, "show").mockResolvedValue();
    const folder = { id: "folder-1", path: "chapters", createdAt: "now", updatedAt: "now" };

    await panel.showFor("rename", snapshot.files[0]);
    await panel.showFor("rename-folder", undefined, folder);
    await panel.showFor("create-and-include", snapshot.files[0]);
    await panel.showFor("rename");

    expect(show).toHaveBeenNthCalledWith(1, "rename", snapshot.files[0]?.path, snapshot.files[0]?.id);
    expect(show).toHaveBeenNthCalledWith(2, "rename-folder", folder.path, folder.id);
    expect(show).toHaveBeenNthCalledWith(3, "create-and-include", "", null);
    expect(show).toHaveBeenCalledTimes(3);
  });

  it("routes the surrounding project-file workflow", () => {
    const panel = new TestProjectFileDialog();
    const actions = new EventTarget();
    const imageUpload = Object.assign(new EventTarget(), { choose: vi.fn() });
    const tree = Object.assign(new EventTarget(), { focusFilter: vi.fn() });
    const callbacks = {
      activeFile: vi.fn(() => snapshot.files[0] ?? null),
      deleteFile: vi.fn(),
      focusEditor: vi.fn(),
      insertImage: vi.fn(),
      openDialog: vi.fn(),
      quickOpen: vi.fn(),
      saved: vi.fn(),
      selectFile: vi.fn(),
      uploaded: vi.fn(),
    };
    panel.bindWorkflow({ actionControls: [actions], imageUpload, tree, ...callbacks });
    const asset = {
      createdAt: "now",
      fingerprint: "asset-fingerprint",
      id: "asset-1",
      mediaType: "image/png" as const,
      objectKey: "asset-object",
      path: "figures/chart.png",
      size: 42,
      updatedAt: "now",
    };
    const upload = { message: "Uploaded.", snapshot };
    const saved = { message: "Saved.", mode: "create" as const, path: "chapter.md", snapshot };

    actions.dispatchEvent(new CustomEvent(projectFileActionEvent, { detail: "upload-images" }));
    actions.dispatchEvent(new CustomEvent(projectFileActionEvent, { detail: "delete" }));
    actions.dispatchEvent(new CustomEvent(projectFileActionEvent, { detail: "create-folder" }));
    tree.dispatchEvent(new CustomEvent(projectTreeActionEvent, { detail: { action: "select-file", fileId: "file-1", focusEditor: true } }));
    tree.dispatchEvent(new CustomEvent(projectTreeActionEvent, { detail: { action: "quick-open" } }));
    tree.dispatchEvent(new CustomEvent(projectTreeActionEvent, { detail: { action: "rename-folder", folderId: "folder-1" } }));
    tree.dispatchEvent(new CustomEvent(projectTreeActionEvent, { detail: { action: "insert-asset", asset } }));
    imageUpload.dispatchEvent(new CustomEvent(projectImagesUploadedEvent, { detail: upload }));
    panel.dispatchEvent(new CustomEvent(projectFileSavedEvent, { detail: saved }));

    expect(imageUpload.choose).toHaveBeenCalledOnce();
    expect(callbacks.deleteFile).toHaveBeenCalledOnce();
    expect(callbacks.openDialog).toHaveBeenNthCalledWith(1, "create-folder");
    expect(callbacks.openDialog).toHaveBeenNthCalledWith(2, "rename-folder", "folder-1");
    expect(callbacks.selectFile).toHaveBeenCalledWith("file-1");
    expect(callbacks.focusEditor).toHaveBeenCalledOnce();
    expect(callbacks.quickOpen).toHaveBeenCalledOnce();
    expect(tree.focusFilter).toHaveBeenCalledOnce();
    expect(callbacks.insertImage).toHaveBeenCalledWith({
      message: "Inserted figures/chart.png.",
      syntax: "![chart](../figures/chart.png)",
    });
    expect(callbacks.uploaded).toHaveBeenCalledWith(upload);
    expect(callbacks.saved).toHaveBeenCalledWith(saved);
  });

  it("projects image assets relative to the active file", () => {
    const activeFile = { ...snapshot.files[0]!, path: "chapters/method.md" };
    const asset = {
      createdAt: "now",
      fingerprint: "asset-fingerprint",
      id: "asset-1",
      mediaType: "image/png" as const,
      objectKey: "asset-object",
      path: "figures/result plot_(final)[1].png",
      size: 42,
      updatedAt: "now",
    };

    expect(projectImageInsertion(activeFile, asset)).toEqual({
      message: "Inserted figures/result plot_(final)[1].png.",
      syntax: "![result plot (final)1](<../figures/result plot_(final)[1].png>)",
    });
  });

  it("persists a trimmed path and emits the validated workspace", async () => {
    const panel = new TestProjectFileDialog();
    const saves: ProjectFileSaved[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(snapshot));
    panel.addEventListener(projectFileSavedEvent, (event) => saves.push((event as CustomEvent<ProjectFileSaved>).detail));
    panel.configureApi("/api/workspaces/workspace");
    panel.configureForTest("create-and-include", "", "file-1");
    panel.input.value = "  chapters/method.md  ";

    await panel.saveForTest();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/workspace/files",
      expect.objectContaining({ body: JSON.stringify({ path: "chapters/method.md" }), method: "POST" }),
    );
    expect(saves).toEqual([
      {
        message: "Created chapters/method.md and included it at the remembered caret.",
        mode: "create-and-include",
        path: "chapters/method.md",
        snapshot,
      },
    ]);
  });

  it("uses the stable target for rename and permits retry after failure", async () => {
    const panel = new TestProjectFileDialog();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json(snapshot));
    panel.configureApi("/api/workspaces/workspace");
    panel.configureForTest("rename", "main.md", "file/1");
    panel.input.value = "chapters/method.md";

    await panel.saveForTest();
    expect(panel.renderForTest()).toBeDefined();
    await panel.saveForTest();

    expect(fetchMock).toHaveBeenLastCalledWith("/api/workspaces/workspace/files/file%2F1", expect.objectContaining({ method: "PATCH" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("owns deferred encoded file deletion and commits its validated workspace", async () => {
    vi.useFakeTimers();
    const panel = new TestProjectFileDialog();
    const callbacks = deletionCallbacks();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(snapshot));
    const file = { ...snapshot.files[0]!, id: "file/1" };
    panel.configureApi("/api/workspaces/workspace", callbacks);

    panel.deleteFile(file, "entry-file");
    expect(panel.hiddenFiles.has(file.id)).toBe(true);
    expect(callbacks.selectFile).toHaveBeenCalledWith("entry-file");
    expect(callbacks.presentNotice).toHaveBeenCalledWith(`Deleted ${file.path}.`, expect.objectContaining({ actionLabel: "Undo" }));
    await vi.advanceTimersByTimeAsync(6_000);

    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/workspace/files/file%2F1", {
      credentials: "same-origin",
      method: "DELETE",
    });
    expect(panel.hiddenFiles.has(file.id)).toBe(false);
    expect(callbacks.commit).toHaveBeenCalledWith(snapshot);
  });

  it("restores a project file when deferred deletion is undone", async () => {
    vi.useFakeTimers();
    const panel = new TestProjectFileDialog();
    const callbacks = deletionCallbacks();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const file = snapshot.files[0]!;
    panel.configureApi("/api/workspaces/workspace", callbacks);

    panel.deleteFile(file, "entry-file");
    const notice = vi.mocked(callbacks.presentNotice).mock.calls[0]?.[1];
    notice?.action?.();
    await vi.advanceTimersByTimeAsync(6_000);

    expect(panel.hiddenFiles.has(file.id)).toBe(false);
    expect(callbacks.selectFile).toHaveBeenLastCalledWith(file.id);
    expect(callbacks.presentNotice).toHaveBeenLastCalledWith(`Restored ${file.path}.`, undefined);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("owns content-bearing file creation and returns the created stable file", async () => {
    const panel = new TestProjectFileDialog();
    const created = { ...snapshot.files[0]!, content: "# Questions", id: "file-2", path: "research-questions.md" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ...snapshot, files: [...snapshot.files, created] }));
    panel.configureApi("/api/workspaces/workspace");

    await expect(panel.createFile(created.path, created.content)).resolves.toEqual(created);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/workspace/files",
      expect.objectContaining({ body: JSON.stringify({ path: created.path, content: created.content }), method: "POST" }),
    );
  });

  it("rejects content-bearing creation without the requested file", async () => {
    const panel = new TestProjectFileDialog();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(snapshot));
    panel.configureApi("/api/workspaces/workspace");

    await expect(panel.createFile("missing.md", "# Missing")).rejects.toThrow("Project file operation did not create the requested path");
  });

  it("restores failed file deletion with a retryable notice", async () => {
    vi.useFakeTimers();
    const panel = new TestProjectFileDialog();
    const callbacks = deletionCallbacks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ invalid: true }));
    const file = snapshot.files[0]!;
    panel.configureApi("/api/workspaces/workspace", callbacks);

    panel.deleteFile(file, "entry-file");
    await vi.advanceTimersByTimeAsync(6_000);

    expect(panel.hiddenFiles.has(file.id)).toBe(false);
    expect(callbacks.selectFile).toHaveBeenLastCalledWith(file.id);
    expect(callbacks.commit).not.toHaveBeenCalled();
    expect(callbacks.presentNotice).toHaveBeenLastCalledWith(`Could not delete ${file.path}.`, undefined);
  });

  it("ignores mutation modes without their stable target", async () => {
    const panel = new TestProjectFileDialog();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    panel.configureForTest("rename");
    panel.input.value = "main.md";

    await panel.saveForTest();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens, focuses, reuses, and cancels its modal", async () => {
    const panel = new TestProjectFileDialog();

    await panel.show("rename-folder", "chapters");
    expect(panel.showCount).toBe(1);
    expect(panel.focusCount).toBe(1);
    expect(panel.modal.open).toBe(true);

    await panel.show("create");
    expect(panel.showCount).toBe(1);
    expect(panel.focusCount).toBe(2);

    panel.cancelForTest();
    expect(panel.modal.open).toBe(false);
  });
});
