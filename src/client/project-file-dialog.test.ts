import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProjectFileDialog,
  projectImageInsertion,
  projectFileDialogIsCreating,
  projectFileDialogIsFolder,
  type ProjectFileMutationCallbacks,
  type ProjectFileDialogMode,
  type ProjectFileSaved,
} from "./project-file-dialog";
import { workspaceSnapshotFixture as snapshot } from "../test-support/workspace-fixture";
import { projectFileActionEvent } from "./project-file-actions";
import { projectImagesUploadedEvent } from "./project-image-upload-control";
import { projectTreeActionEvent } from "./project-tree-panel";
import { WorkspaceAccessError } from "./workspace-snapshot-client";

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
  vi.unstubAllGlobals();
});

function mutationCallbacks(): ProjectFileMutationCallbacks {
  return {
    fileActivated: vi.fn(),
    presentFile: vi.fn(),
    presentNotice: vi.fn(),
    previewChanged: vi.fn(),
  };
}

function projectRefreshBinding() {
  return {
    assetBase: "/assets",
    bibliography: { disabled: false, value: "" },
    catalog: { presentOfflineWorkspace: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined) },
    collaboration: { goOffline: vi.fn(), restoreOffline: vi.fn(() => false), setOfflineAvailable: vi.fn() },
    connection: { presentOfflineRestore: vi.fn(), presentWorkflow: vi.fn() },
    context: { presentBoundWorkspace: vi.fn(), refreshBoundReferencePdfs: vi.fn().mockResolvedValue(undefined) },
    history: { setRevision: vi.fn() },
    load: vi.fn().mockResolvedValue(snapshot),
    offline: { clear: vi.fn().mockResolvedValue(undefined), restore: vi.fn().mockResolvedValue(null), schedule: vi.fn() },
    preview: { renderBoundProject: vi.fn() },
    source: { disabled: false, value: "" },
    workspace: true,
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
    const mutations = mutationCallbacks();
    panel.configureApi("/api/workspaces/demo", mutations);
    const actions = new EventTarget();
    const imageUpload = Object.assign(new EventTarget(), { choose: vi.fn() });
    const tree = Object.assign(new EventTarget(), { focusFilter: vi.fn() });
    const callbacks = {
      activateAuthoring: vi.fn(),
      focusEditor: vi.fn(),
      insertImage: vi.fn(),
      prepareInclude: vi.fn(() => vi.fn(() => true)),
      quickOpen: vi.fn(),
      revealEditor: vi.fn(),
      saved: vi.fn(),
      selectRange: vi.fn(),
    };
    panel.bindWorkflow({ actionControls: [actions], imageUpload, tree, ...callbacks });
    const supporting = { ...snapshot.files[0]!, id: "file-2", path: "chapter.md" };
    const project = { ...snapshot, files: [...snapshot.files, supporting] };
    panel.presentProject(project, "/assets", true);
    const showFor = vi.spyOn(panel, "showFor").mockResolvedValue();
    const deleteFile = vi.spyOn(panel, "deleteFile");
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

    actions.dispatchEvent(new CustomEvent(projectFileActionEvent, { detail: "upload-images" }));
    actions.dispatchEvent(new CustomEvent(projectFileActionEvent, { detail: "delete" }));
    actions.dispatchEvent(new CustomEvent(projectFileActionEvent, { detail: "create-folder" }));
    actions.dispatchEvent(new CustomEvent(projectFileActionEvent, { detail: "create-and-include" }));
    tree.dispatchEvent(
      new CustomEvent(projectTreeActionEvent, { detail: { action: "select-file", fileId: supporting.id, focusEditor: true } }),
    );
    tree.dispatchEvent(new CustomEvent(projectTreeActionEvent, { detail: { action: "quick-open" } }));
    tree.dispatchEvent(new CustomEvent(projectTreeActionEvent, { detail: { action: "rename-folder", folderId: "folder-1" } }));
    tree.dispatchEvent(new CustomEvent(projectTreeActionEvent, { detail: { action: "insert-asset", asset } }));
    imageUpload.dispatchEvent(new CustomEvent(projectImagesUploadedEvent, { detail: upload }));

    expect(imageUpload.choose).toHaveBeenCalledOnce();
    expect(deleteFile).not.toHaveBeenCalled();
    expect(callbacks.prepareInclude).toHaveBeenCalledWith();
    expect(showFor).toHaveBeenNthCalledWith(1, "create-folder", snapshot.files[0], undefined);
    expect(showFor).toHaveBeenNthCalledWith(2, "create-and-include", snapshot.files[0], undefined);
    expect(showFor).toHaveBeenNthCalledWith(3, "rename-folder", supporting, undefined);
    expect(mutations.presentFile).toHaveBeenCalledWith(supporting, project, true);
    expect(mutations.fileActivated).toHaveBeenCalledOnce();
    expect(callbacks.focusEditor).toHaveBeenCalledOnce();
    expect(callbacks.quickOpen).toHaveBeenCalledOnce();
    expect(tree.focusFilter).toHaveBeenCalledOnce();
    expect(callbacks.insertImage).toHaveBeenCalledWith({
      message: "Inserted figures/chart.png.",
      syntax: "![chart](figures/chart.png)",
    });
    expect(panel.project).toEqual(snapshot);
    expect(mutations.presentNotice).toHaveBeenCalledWith("Uploaded.");
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

  it("presents canonical project files through the bound Lit owners", () => {
    const panel = new TestProjectFileDialog();
    const editorInsertMenu = { setFiles: vi.fn() };
    const projectFileMenuActions = { setEntryFileActive: vi.fn() };
    const sourceCompletion = { setProject: vi.fn() };
    const projectTreePanel = { configure: vi.fn(), setTree: vi.fn() };
    panel.bindPresentation({ editorInsertMenu, projectFileMenuActions, projectTreePanel, sourceCompletion });

    expect(projectTreePanel.configure).toHaveBeenCalledWith("", {
      acceptSnapshot: expect.any(Function),
      presentNotice: expect.any(Function),
      previewChanged: expect.any(Function),
    });

    panel.presentProject(snapshot, "/api/workspaces/demo/assets", true);

    expect(projectTreePanel.setTree).toHaveBeenCalledWith({
      activeFileId: snapshot.entryFileId,
      assetBase: "/api/workspaces/demo/assets",
      assets: snapshot.assets,
      entryFileId: snapshot.entryFileId,
      files: snapshot.files,
      folders: snapshot.folders,
    });
    expect(editorInsertMenu.setFiles).toHaveBeenCalledWith(snapshot.files[0], snapshot.files);
    expect(sourceCompletion.setProject).toHaveBeenCalledWith(snapshot, snapshot.entryFileId, true);
    expect(projectFileMenuActions.setEntryFileActive).toHaveBeenCalledWith(true);
    expect(panel.activeFileId).toBe(snapshot.entryFileId);
    expect(panel.project).toBe(snapshot);
  });

  it("projects visible snapshot or live collaborative file content", () => {
    vi.useFakeTimers();
    const panel = new TestProjectFileDialog();
    const supporting = { ...snapshot.files[0]!, id: "file-2", path: "chapter.md" };
    const project = { ...snapshot, files: [...snapshot.files, supporting] };
    panel.bindLiveContent((file, entryFileId) => `${entryFileId}:${file.id}`);
    panel.presentProject(project, "/assets", true);

    expect(panel.projectFiles(false)).toEqual(project.files);
    expect(panel.projectFiles(true).map(({ content }) => content)).toEqual([
      `${snapshot.entryFileId}:${snapshot.files[0]!.id}`,
      `${snapshot.entryFileId}:${supporting.id}`,
    ]);

    panel.deleteFile(supporting, snapshot.entryFileId);
    expect(panel.projectFiles(true).map(({ id }) => id)).toEqual([snapshot.files[0]!.id]);
  });

  it("derives live file projection readiness from its content binding", () => {
    const panel = new TestProjectFileDialog();
    let ready = false;
    panel.bindLiveContent(
      (file) => `live:${file.content}`,
      () => ready,
    );
    panel.presentProject(snapshot, "/assets", true);

    expect(panel.projectFiles()[0]?.content).toBe(snapshot.files[0]?.content);
    ready = true;
    expect(panel.projectFiles()[0]?.content).toBe(`live:${snapshot.files[0]?.content}`);
  });

  it("owns active-file fallback and selection eligibility", () => {
    const panel = new TestProjectFileDialog();
    const callbacks = mutationCallbacks();
    const supporting = { ...snapshot.files[0]!, id: "file-2", path: "chapter.md" };
    const project = { ...snapshot, files: [...snapshot.files, supporting] };
    panel.configureApi("/api/workspaces/workspace", callbacks);

    panel.presentProject(project, "/assets", true);
    expect(callbacks.presentFile).toHaveBeenLastCalledWith(snapshot.files[0], project, false);
    expect(panel.selectFile(supporting.id)).toBe(true);
    expect(panel.activeFileId).toBe(supporting.id);
    expect(callbacks.presentFile).toHaveBeenLastCalledWith(supporting, project, true);
    expect(callbacks.fileActivated).toHaveBeenCalledOnce();
    expect(panel.selectFile(supporting.id)).toBe(false);
    expect(panel.selectFile("missing-file")).toBe(false);
    panel.presentProject(snapshot, "/assets", true);
    expect(callbacks.presentFile).toHaveBeenLastCalledWith(snapshot.files[0], snapshot, false);
    expect(panel.activeFileId).toBe(snapshot.entryFileId);
  });

  it("owns project-range activation with entry-file fallback and normalized bounds", () => {
    const panel = new TestProjectFileDialog();
    const callbacks = mutationCallbacks();
    const activateAuthoring = vi.fn();
    const revealEditor = vi.fn();
    const selectRange = vi.fn();
    panel.configureApi("/api/workspaces/workspace", callbacks);
    panel.bindWorkflow({
      activateAuthoring,
      actionControls: [],
      focusEditor: vi.fn(),
      imageUpload: Object.assign(new EventTarget(), { choose: vi.fn() }),
      insertImage: vi.fn(),
      prepareInclude: vi.fn(() => null),
      quickOpen: vi.fn(),
      revealEditor,
      saved: vi.fn(),
      selectRange,
      tree: Object.assign(new EventTarget(), { focusFilter: vi.fn() }),
    });
    panel.presentProject(snapshot, "/assets", true);

    panel.focusRange(null, 12, 4);

    expect(panel.activeFileId).toBe(snapshot.entryFileId);
    expect(activateAuthoring).toHaveBeenCalledOnce();
    expect(selectRange).toHaveBeenCalledWith(12, 12);

    panel.revealAuthoring();
    panel.revealRange(null, 4, 8);

    expect(activateAuthoring).toHaveBeenCalledTimes(3);
    expect(revealEditor).toHaveBeenCalledTimes(2);
    expect(selectRange).toHaveBeenLastCalledWith(4, 8);
  });

  it("accepts validated project mutations through the canonical projection", async () => {
    const panel = new TestProjectFileDialog();
    const callbacks = mutationCallbacks();
    const updated = { ...snapshot, title: "Updated" };
    const binding = projectRefreshBinding();
    panel.configureApi("/api/workspaces/workspace", callbacks);
    panel.bindProjectRefresh(binding);
    panel.presentProject(snapshot, "/assets", true);

    await panel.acceptProjectMutation(Response.json(updated));

    expect(panel.project).toEqual(updated);
    expect(callbacks.presentFile).toHaveBeenLastCalledWith(updated.files[0], updated, false);
    expect(binding.context.refreshBoundReferencePdfs).toHaveBeenCalledWith(false);
    expect(binding.context.presentBoundWorkspace).toHaveBeenCalledOnce();
    expect(binding.preview.renderBoundProject).toHaveBeenCalledOnce();
    await expect(panel.acceptProjectMutation(Response.json({ id: "incomplete" }))).rejects.toThrow(
      "Project mutation returned an invalid snapshot",
    );
  });

  it("owns initial and subsequent project refresh projection", async () => {
    const panel = new TestProjectFileDialog();
    const callbacks = mutationCallbacks();
    const refreshed = { ...snapshot, revision: 2 };
    const binding = projectRefreshBinding();
    binding.load.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(refreshed);
    panel.configureApi("/api/workspaces/workspace", callbacks);
    panel.bindProjectRefresh(binding);

    await panel.refreshProject();
    await panel.refreshProject();

    expect(binding.history.setRevision).toHaveBeenCalledWith(snapshot.revision);
    expect(binding.source.value).toBe(snapshot.source);
    expect(binding.bibliography.value).toBe(snapshot.bibliography);
    expect(binding.preview.renderBoundProject).toHaveBeenNthCalledWith(1, snapshot.bibliography);
    expect(binding.preview.renderBoundProject).toHaveBeenNthCalledWith(2);
    expect(callbacks.presentFile).toHaveBeenLastCalledWith(refreshed.files[0], refreshed, false);
    expect(binding.context.presentBoundWorkspace).toHaveBeenCalledTimes(2);
    expect(binding.context.refreshBoundReferencePdfs).toHaveBeenCalledTimes(2);
    expect(binding.offline.schedule).toHaveBeenCalledTimes(2);
    expect(panel.project).toBe(refreshed);
  });

  it("owns offline project restoration through the canonical projection", async () => {
    const panel = new TestProjectFileDialog();
    const callbacks = mutationCallbacks();
    const binding = projectRefreshBinding();
    const restored = { savedAt: "2026-07-28T12:00:00.000Z", serverStateVector: new Uint8Array([1]), snapshot };
    binding.offline.restore.mockResolvedValueOnce(restored).mockResolvedValueOnce(null);
    binding.collaboration.restoreOffline.mockReturnValue(true);
    panel.configureApi("/api/workspaces/workspace", callbacks);
    panel.bindProjectRefresh(binding);

    await expect(panel.restoreOfflineProject()).resolves.toBe(true);
    await expect(panel.restoreOfflineProject()).resolves.toBe(false);

    expect(binding.collaboration.restoreOffline).toHaveBeenCalledWith(restored.serverStateVector);
    expect(binding.collaboration.setOfflineAvailable).toHaveBeenCalledWith(true);
    expect(binding.history.setRevision).toHaveBeenCalledWith(snapshot.revision);
    expect(binding.catalog.presentOfflineWorkspace).toHaveBeenCalledWith(snapshot, restored.savedAt);
    expect(callbacks.presentFile).toHaveBeenLastCalledWith(snapshot.files[0], snapshot, false);
    expect(binding.context.presentBoundWorkspace).toHaveBeenCalledOnce();
    expect(binding.connection.presentOfflineRestore).toHaveBeenCalledWith(true);
    expect(binding.preview.renderBoundProject).toHaveBeenCalledOnce();
  });

  it("owns online and restored-offline workspace opening policy", async () => {
    const panel = new TestProjectFileDialog();
    const callbacks = mutationCallbacks();
    const binding = projectRefreshBinding();
    panel.configureApi("/api/workspaces/workspace", callbacks);
    panel.bindProjectRefresh(binding);

    await panel.openWorkspace();
    expect(binding.catalog.refresh).toHaveBeenCalledOnce();
    expect(binding.load).toHaveBeenCalledOnce();
    expect(binding.source.disabled).toBe(true);
    expect(binding.bibliography.disabled).toBe(true);

    const restored = { savedAt: "2026-07-28T12:00:00.000Z", serverStateVector: new Uint8Array([1]), snapshot };
    binding.offline.restore.mockResolvedValueOnce(restored);
    binding.catalog.refresh.mockRejectedValueOnce(new Error("offline"));
    binding.load.mockRejectedValueOnce(new Error("offline"));

    await panel.openWorkspace();
    expect(binding.collaboration.goOffline).toHaveBeenCalledOnce();
    expect(binding.connection.presentWorkflow).toHaveBeenCalledOnce();
  });

  it("clears offline state when workspace access is revoked", async () => {
    const panel = new TestProjectFileDialog();
    const binding = projectRefreshBinding();
    const accessError = new WorkspaceAccessError("Project access is no longer available");
    binding.load.mockRejectedValue(accessError);
    panel.bindProjectRefresh(binding);

    await expect(panel.openWorkspace()).rejects.toBe(accessError);
    expect(binding.offline.clear).toHaveBeenCalledOnce();
  });

  it("commits the validated workspace and emits the saved file identity", async () => {
    const panel = new TestProjectFileDialog();
    const callbacks = mutationCallbacks();
    const saved = vi.fn<(result: ProjectFileSaved) => void>();
    const created = { ...snapshot.files[0]!, id: "file-2", path: "chapters/results.md" };
    const project = { ...snapshot, files: [...snapshot.files, created] };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(project));
    const actions = new EventTarget();
    const include = vi.fn(() => true);
    panel.configureApi("/api/workspaces/workspace", callbacks);
    panel.bindWorkflow({
      activateAuthoring: vi.fn(),
      actionControls: [actions],
      focusEditor: vi.fn(),
      imageUpload: Object.assign(new EventTarget(), { choose: vi.fn() }),
      insertImage: vi.fn(),
      prepareInclude: vi.fn(() => include),
      quickOpen: vi.fn(),
      revealEditor: vi.fn(),
      saved,
      selectRange: vi.fn(),
      tree: Object.assign(new EventTarget(), { focusFilter: vi.fn() }),
    });
    panel.presentProject(snapshot, "/assets", true);
    const presentProject = vi.spyOn(panel, "presentProject");
    actions.dispatchEvent(new CustomEvent(projectFileActionEvent, { detail: "create-and-include" }));
    panel.input.value = "  chapters/results.md  ";

    await panel.saveForTest();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/workspace/files",
      expect.objectContaining({ body: JSON.stringify({ path: "chapters/results.md" }), method: "POST" }),
    );
    expect(panel.project).toEqual(project);
    expect(include).toHaveBeenCalledWith("\n::include[results.md]\n");
    expect(presentProject.mock.invocationCallOrder[0]).toBeLessThan(include.mock.invocationCallOrder[0] ?? 0);
    expect(saved).toHaveBeenCalledWith({
      included: true,
      message: "Created chapters/results.md and included it at the remembered caret.",
    });
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
    const callbacks = mutationCallbacks();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(snapshot));
    const file = { ...snapshot.files[0]!, id: "file/1", path: "chapter.md" };
    const project = { ...snapshot, files: [...snapshot.files, file] };
    panel.configureApi("/api/workspaces/workspace", callbacks);
    panel.presentProject(project, "/assets", true);
    panel.selectFile(file.id);

    panel.deleteFile(file, snapshot.entryFileId);
    expect(panel.hiddenFiles.has(file.id)).toBe(true);
    expect(callbacks.presentFile).toHaveBeenLastCalledWith(snapshot.files[0], project, true);
    expect(callbacks.presentNotice).toHaveBeenCalledWith(`Deleted ${file.path}.`, expect.objectContaining({ actionLabel: "Undo" }));
    await vi.advanceTimersByTimeAsync(6_000);

    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/workspace/files/file%2F1", {
      credentials: "same-origin",
      method: "DELETE",
    });
    expect(panel.hiddenFiles.has(file.id)).toBe(false);
    expect(panel.project).toEqual(snapshot);
  });

  it("restores a project file when deferred deletion is undone", async () => {
    vi.useFakeTimers();
    const panel = new TestProjectFileDialog();
    const callbacks = mutationCallbacks();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const file = { ...snapshot.files[0]!, id: "file-2", path: "chapter.md" };
    const project = { ...snapshot, files: [...snapshot.files, file] };
    panel.configureApi("/api/workspaces/workspace", callbacks);
    panel.presentProject(project, "/assets", true);
    panel.selectFile(file.id);

    panel.deleteFile(file, snapshot.entryFileId);
    const notice = vi.mocked(callbacks.presentNotice).mock.calls[0]?.[1];
    notice?.action?.();
    await vi.advanceTimersByTimeAsync(6_000);

    expect(panel.hiddenFiles.has(file.id)).toBe(false);
    expect(callbacks.presentFile).toHaveBeenLastCalledWith(file, project, true);
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

  it("opens an existing workflow file or lazily creates a missing one", async () => {
    const panel = new TestProjectFileDialog();
    const callbacks = mutationCallbacks();
    const focusEditor = vi.fn();
    const content = vi.fn(() => "# Questions");
    const existing = { ...snapshot.files[0]!, id: "file-existing", path: "research-diary.md" };
    const created = { ...snapshot.files[0]!, content: "# Questions", id: "file-2", path: "research-questions.md" };
    const project = { ...snapshot, files: [...snapshot.files, existing] };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ...project, files: [...project.files, created] }));
    const assign = vi.fn();
    vi.stubGlobal("location", { assign, href: "https://example.test/editor/workspace?context=preview#paper" });
    panel.configureApi("/api/workspaces/workspace", callbacks);
    panel.bindWorkflow({
      activateAuthoring: vi.fn(),
      actionControls: [],
      focusEditor,
      imageUpload: Object.assign(new EventTarget(), { choose: vi.fn() }),
      insertImage: vi.fn(),
      prepareInclude: vi.fn(() => null),
      quickOpen: vi.fn(),
      revealEditor: vi.fn(),
      saved: vi.fn(),
      selectRange: vi.fn(),
      tree: Object.assign(new EventTarget(), { focusFilter: vi.fn() }),
    });
    panel.presentProject(project, "/assets", true);

    await expect(panel.openWorkflowFile(existing.path, content)).resolves.toBeUndefined();
    expect(callbacks.presentFile).toHaveBeenLastCalledWith(existing, project, true);
    expect(focusEditor).toHaveBeenCalledOnce();
    expect(content).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();

    await expect(panel.openWorkflowFile(created.path, content)).resolves.toBeUndefined();
    expect(content).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(`/editor/workspace?context=preview&file=${created.id}&rail=guide#paper`);
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
    const callbacks = mutationCallbacks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ invalid: true }));
    const file = { ...snapshot.files[0]!, id: "file-2", path: "chapter.md" };
    const project = { ...snapshot, files: [...snapshot.files, file] };
    panel.configureApi("/api/workspaces/workspace", callbacks);
    panel.presentProject(project, "/assets", true);
    panel.selectFile(file.id);

    panel.deleteFile(file, snapshot.entryFileId);
    await vi.advanceTimersByTimeAsync(6_000);

    expect(panel.hiddenFiles.has(file.id)).toBe(false);
    expect(callbacks.presentFile).toHaveBeenLastCalledWith(file, project, true);
    expect(panel.project).toEqual(project);
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
