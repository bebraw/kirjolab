import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { Diagnostic } from "../domain/markdown";
import type { ProjectComposition, ProjectFilePreview } from "../domain/project-files";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import type { MarkdownRuntime } from "./markdown-runtime";
import { ContextResourcePresenter } from "./context-resource-presenter";
import { ManuscriptMapPanel } from "./manuscript-map-panel";
import { previewDiagnosticSelectEvent, type PreviewDiagnosticsPanel } from "./preview-presentation";
import { ProjectExportDialog } from "./project-export-dialog";
import {
  previewHeadingNumbers,
  WorkspacePreview,
  workspacePreviewActionEvent,
  type ProjectPreviewImageContext,
  type ProjectPreviewOutcome,
  type WorkspacePreviewRequest,
} from "./workspace-preview";

const diagnostic: Diagnostic = { from: 2, message: "Check syntax", severity: "warning", to: 4 };
const rendered = { diagnostics: [diagnostic], html: "<p>Rendered</p>" };

const request: WorkspacePreviewRequest = {
  apiBase: "/api/workspaces/workspace-1",
  bibliography: "",
  filePreview: null,
  hiddenAssetIds: new Set(),
  publicationComposition: null,
  renderedSource: "# Source",
  snapshot: workspaceSnapshotFixture,
};

class TestWorkspacePreview extends WorkspacePreview {
  readonly presentCompanions = vi.fn();
  readonly presentProject = vi.fn();
  readonly resolveImages = vi.fn();
  readonly setDiagnostics = vi.fn();
  readonly showUnavailable = vi.fn();
  runtime: Promise<MarkdownRuntime> = Promise.resolve(runtime());

  override get updateComplete(): Promise<boolean> {
    return Promise.resolve(true);
  }

  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  protected override loadRuntime(): Promise<MarkdownRuntime> {
    return this.runtime;
  }

  protected override resolveProjectImages(context: ProjectPreviewImageContext): void {
    this.resolveImages(context);
  }

  protected override presentProjectOutcome(outcome: ProjectPreviewOutcome): void {
    this.presentProject(outcome);
  }

  protected override presentProjectCompanions(
    request: Parameters<WorkspacePreview["renderProject"]>[0],
    outcome: ProjectPreviewOutcome,
  ): void {
    this.presentCompanions(request, outcome);
  }

  protected override get diagnostics(): PreviewDiagnosticsPanel {
    return {
      setDiagnostics: this.setDiagnostics,
      showUnavailable: this.showUnavailable,
    } as unknown as PreviewDiagnosticsPanel;
  }
}

class CompanionWorkspacePreview extends WorkspacePreview {
  presentCompanionsForTest(request: Parameters<WorkspacePreview["renderProject"]>[0], outcome: ProjectPreviewOutcome): void {
    this.presentProjectCompanions(request, outcome);
  }
}

function runtime(): MarkdownRuntime {
  return {
    headingNumbersByOffset: vi.fn().mockReturnValue({}),
    renderWorkspaceMarkdown: vi.fn().mockReturnValue(rendered),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("workspace preview", () => {
  it("owns rendered content, diagnostics, and authorized image resolution", async () => {
    const preview = new TestWorkspacePreview();
    expect(preview.rootForTest()).toBe(preview);
    expect(preview.renderForTest()).toBeDefined();

    await expect(preview.renderDocument(request)).resolves.toEqual({ available: true, diagnostics: [diagnostic] });

    expect(preview.resolveImages).toHaveBeenCalledWith({
      apiBase: request.apiBase,
      hiddenAssetIds: request.hiddenAssetIds,
      snapshot: request.snapshot,
      source: request.renderedSource,
      sourceMap: [],
    });
    expect(preview.setDiagnostics).toHaveBeenCalledWith([diagnostic], null);
    expect(preview.renderForTest()).toBeDefined();
  });

  it("derives project and active-file preview inputs before rendering", async () => {
    const preview = new TestWorkspacePreview();
    const files = workspaceSnapshotFixture.files.map((file) => ({ ...file, content: `${file.content}\nUpdated` }));
    const renderDocument = vi.spyOn(preview, "renderDocument");

    const outcome = await preview.renderProject({
      activeFileId: workspaceSnapshotFixture.entryFileId,
      apiBase: request.apiBase,
      bibliography: "",
      fallbackSource: "Fallback",
      files,
      hiddenAssetIds: new Set(),
      resolvedSnapshot: workspaceSnapshotFixture,
      snapshot: workspaceSnapshotFixture,
    });

    expect(renderDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        filePreview: expect.objectContaining({ fileId: workspaceSnapshotFixture.entryFileId }),
        publicationComposition: expect.objectContaining({ content: expect.stringContaining("Updated") }),
        renderedSource: expect.stringContaining("Updated"),
      }),
    );
    expect(outcome).toMatchObject({ available: true });
    expect(preview.presentProject).toHaveBeenCalledWith(expect.objectContaining({ available: true }));
    expect(preview.presentCompanions).toHaveBeenCalledWith(
      expect.objectContaining({ files }),
      expect.objectContaining({ publicationComposition: expect.any(Object) }),
    );
  });

  it("owns the bound canonical project request", async () => {
    const preview = new TestWorkspacePreview();
    await expect(preview.renderBoundProject()).resolves.toBeNull();
    expect(preview.syncFromSource()).toBe(false);
    const documentModel = new Y.Doc();
    documentModel.getText("source").insert(0, "Bound source");
    documentModel.getText("bibliography").insert(0, "Bound bibliography");
    const hiddenAssets = new Set(["asset-1"]);
    const files = workspaceSnapshotFixture.files.map((file) => ({ ...file, content: `${file.content}\nLive` }));
    const renderProject = vi.spyOn(preview, "renderProject").mockResolvedValue(null);
    const revealNearestSource = vi.spyOn(preview, "revealNearestSource").mockReturnValue(true);
    const activeSourcePreviewOffsets = vi.fn(() => [4]);
    preview.bindProject(request.apiBase, documentModel, () => workspaceSnapshotFixture, {
      contextResourcePresenter: { activeKey: "preview" },
      previewSyncControls: { activeSourcePreviewOffsets },
      projectFileDialog: { activeFileId: workspaceSnapshotFixture.entryFileId, projectFiles: () => files },
      projectTreePanel: { hiddenAssets },
      workspaceSurfaces: { dataset: { layout: "split" } } as unknown as HTMLElement,
    });

    await preview.renderBoundProject();
    await preview.renderBoundProject("Override bibliography");
    expect(preview.syncFromSource(false)).toBe(true);

    documentModel.getText("notes").insert(0, "Observed project update");
    await vi.waitFor(() => expect(renderProject).toHaveBeenCalledTimes(3));
    preview.disconnectedCallback();
    documentModel.getText("notes").insert(0, "Detached update");
    await Promise.resolve();
    expect(renderProject).toHaveBeenCalledTimes(3);

    expect(renderProject).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        activeFileId: workspaceSnapshotFixture.entryFileId,
        bibliography: "Bound bibliography",
        fallbackSource: "Bound source",
        files,
        hiddenAssetIds: hiddenAssets,
        resolvedSnapshot: expect.objectContaining({ id: workspaceSnapshotFixture.id }),
        snapshot: workspaceSnapshotFixture,
      }),
    );
    expect(renderProject.mock.calls[1]?.[0].bibliography).toBe("Override bibliography");
    expect(activeSourcePreviewOffsets).toHaveBeenCalledWith(workspaceSnapshotFixture.entryFileId, false, true, true);
    expect(revealNearestSource).toHaveBeenCalledWith([4]);
  });

  it("projects one render outcome into manuscript-map and export companions", () => {
    const preview = new CompanionWorkspacePreview();
    const manuscriptMap = new ManuscriptMapPanel();
    const exportDialog = new ProjectExportDialog();
    const resources = new ContextResourcePresenter();
    const presentProject = vi.spyOn(manuscriptMap, "presentProject").mockImplementation(() => undefined);
    const setStatistics = vi.spyOn(exportDialog, "setStatistics").mockImplementation(() => undefined);
    const presentResolvedWorkspace = vi.spyOn(resources, "presentResolvedWorkspace").mockImplementation(() => undefined);
    Object.defineProperty(preview, "ownerDocument", {
      value: {
        getElementById: (id: string) => {
          if (id === "manuscript-map-panel") return manuscriptMap;
          if (id === "export-dialog-control") return exportDialog;
          return resources;
        },
      },
    });
    const projectRequest = {
      activeFileId: workspaceSnapshotFixture.entryFileId,
      apiBase: request.apiBase,
      bibliography: "",
      fallbackSource: "Fallback",
      files: workspaceSnapshotFixture.files,
      hiddenAssetIds: new Set<string>(),
      resolvedSnapshot: workspaceSnapshotFixture,
      snapshot: workspaceSnapshotFixture,
    };
    const publicationComposition = { content: "# Composed paper", dependencies: {}, diagnostics: [], sourceMap: [] };

    preview.presentCompanionsForTest(projectRequest, {
      available: true,
      diagnostics: [],
      filePreview: null,
      publicationComposition,
      renderedSource: "# Active file",
    });

    expect(presentProject).toHaveBeenCalledWith(
      expect.objectContaining({ files: projectRequest.files, source: publicationComposition.content }),
    );
    expect(setStatistics).toHaveBeenCalledWith(expect.objectContaining({ totalWords: 2 }));
    expect(presentResolvedWorkspace).toHaveBeenCalledWith(
      workspaceSnapshotFixture,
      projectRequest.bibliography,
      publicationComposition.content,
    );
  });

  it("shows source and a local diagnostic when the renderer is unavailable", async () => {
    const preview = new TestWorkspacePreview();
    preview.runtime = Promise.reject(new Error("Renderer unavailable"));

    await expect(preview.renderDocument(request)).resolves.toEqual({ available: false });

    expect(preview.showUnavailable).toHaveBeenCalledWith("Renderer unavailable");
    expect(preview.renderForTest().values).toContain("# Source");
  });

  it("discards a render superseded while its runtime loads", async () => {
    const preview = new TestWorkspacePreview();
    let release: ((value: MarkdownRuntime) => void) | undefined;
    preview.runtime = new Promise((resolve) => {
      release = resolve;
    });
    const stale = preview.renderDocument(request);
    preview.runtime = Promise.resolve(runtime());

    await expect(preview.renderDocument(request)).resolves.toEqual({ available: true, diagnostics: [diagnostic] });
    release?.(runtime());
    await expect(stale).resolves.toBeNull();
  });

  it("routes Preview and diagnostic navigation through one boundary", () => {
    const preview = new TestWorkspacePreview();
    const navigation = { openCitation: vi.fn(), selectDiagnostic: vi.fn(), showSource: vi.fn() };
    preview.bindNavigation(navigation);

    preview.dispatchEvent(new CustomEvent(workspacePreviewActionEvent, { detail: { action: "source", offset: 12 } }));
    preview.dispatchEvent(
      new CustomEvent(workspacePreviewActionEvent, { detail: { action: "citation", citation: { keys: ["Source2026"] } } }),
    );
    preview.dispatchEvent(new CustomEvent(previewDiagnosticSelectEvent, { detail: { fileId: "chapter", from: 4, to: 9 } }));

    expect(navigation.showSource).toHaveBeenCalledWith(12);
    expect(navigation.openCitation).toHaveBeenCalledWith({ keys: ["Source2026"] });
    expect(navigation.selectDiagnostic).toHaveBeenCalledWith({ fileId: "chapter", from: 4, to: 9 });
  });

  it("maps composed heading numbers back to an isolated file", () => {
    const sourceMap = [
      {
        fileId: "chapter",
        includeChain: ["main", "chapter"],
        outputEnd: 30,
        outputStart: 10,
        path: "chapter.md",
        sourceEnd: 20,
        sourceStart: 0,
      },
      {
        fileId: "other",
        includeChain: ["main", "other"],
        outputEnd: 50,
        outputStart: 30,
        path: "other.md",
        sourceEnd: 20,
        sourceStart: 0,
      },
    ];
    const composition: ProjectComposition = { content: "Composed", dependencies: {}, diagnostics: [], sourceMap };
    const isolated: ProjectFilePreview = { ...composition, content: "Chapter", fileId: "chapter", mode: "isolated", path: "chapter.md" };
    const markdown = runtime();
    vi.mocked(markdown.headingNumbersByOffset).mockReturnValue({ 12: "1.1", 35: "2.1", 60: "3.1" });

    expect(previewHeadingNumbers(markdown, isolated, composition)).toEqual({ 2: "1.1" });
    expect(previewHeadingNumbers(markdown, { ...isolated, mode: "composed" }, composition)).toEqual({});
    expect(previewHeadingNumbers(markdown, isolated, null)).toEqual({});
  });
});
