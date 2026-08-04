import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { Diagnostic } from "../../domain/manuscript/markdown";
import type { ProjectComposition, ProjectFilePreview } from "../../domain/project/project-files";
import { workspaceSnapshotFixture } from "../../test-support/workspace-fixture";
import type { MarkdownRuntime } from "./markdown-runtime";
import { ContextResourcePresenter } from "../context/context-resource-presenter";
import { ManuscriptMapPanel } from "../project/manuscript-map-panel";
import { previewDiagnosticSelectEvent, type PreviewDiagnosticsPanel } from "./preview-presentation";
import { ProjectExportDialog } from "../project/project-export-dialog";
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

class ScrollElementFixture extends EventTarget {
  readonly dataset: Record<string, string> = {};
  parentElement: { closest(selector: string): ScrollElementFixture | null } | null = null;

  constructor(
    from: string | undefined,
    to: string | undefined,
    readonly top: number,
    readonly height: number,
    readonly bottom = top + height,
  ) {
    super();
    if (from !== undefined) this.dataset.sourceFrom = from;
    if (to !== undefined) this.dataset.sourceTo = to;
  }

  getBoundingClientRect(): DOMRect {
    return {
      bottom: this.bottom,
      height: this.height,
      left: 0,
      right: 100,
      top: this.top,
      width: 100,
      x: 0,
      y: this.top,
      toJSON: () => ({}),
    };
  }
}

class ScrollArticleFixture extends EventTarget {
  readonly #members: ReadonlySet<unknown>;

  constructor(readonly blocks: readonly ScrollElementFixture[]) {
    super();
    this.#members = new Set(blocks);
  }

  contains(candidate: unknown): boolean {
    return this.#members.has(candidate);
  }

  querySelectorAll(): readonly ScrollElementFixture[] {
    return this.blocks;
  }
}

class ScrollViewportFixture extends EventTarget {
  clientHeight = 100;
  scrollHeight = 500;
  scrollTop = 0;
  top = 0;

  setCenter(position: number): void {
    this.top = position - this.clientHeight / 2;
  }

  getBoundingClientRect(): DOMRect {
    return {
      bottom: this.top + this.clientHeight,
      height: this.clientHeight,
      left: 0,
      right: 100,
      top: this.top,
      width: 100,
      x: 0,
      y: this.top,
      toJSON: () => ({}),
    };
  }
}

class ScrollWorkspacePreview extends WorkspacePreview {
  constructor(
    private readonly articleFixture: ScrollArticleFixture,
    private readonly viewportFixture: ScrollViewportFixture,
  ) {
    super();
  }

  protected override get article(): HTMLElement {
    assertHTMLElementFixture(this.articleFixture, "querySelectorAll");
    return this.articleFixture;
  }

  protected override get viewport(): HTMLElement {
    assertHTMLElementFixture(this.viewportFixture, "getBoundingClientRect");
    return this.viewportFixture;
  }
}

function assertHTMLElementFixture(
  value: EventTarget,
  method: "getBoundingClientRect" | "querySelectorAll",
): asserts value is EventTarget & HTMLElement {
  const valid =
    method === "getBoundingClientRect"
      ? "getBoundingClientRect" in value && typeof value.getBoundingClientRect === "function"
      : "querySelectorAll" in value && typeof value.querySelectorAll === "function";
  if (!valid) throw new TypeError(`Scroll fixture requires ${method}`);
}

function scrollPreview(
  blocks: readonly ScrollElementFixture[],
  viewport = new ScrollViewportFixture(),
): { readonly preview: ScrollWorkspacePreview; readonly viewport: ScrollViewportFixture } {
  return { preview: new ScrollWorkspacePreview(new ScrollArticleFixture(blocks), viewport), viewport };
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
    expect(preview.setDiagnostics).toHaveBeenCalledWith([diagnostic], null, {
      files: request.snapshot?.files,
      renderedSource: request.renderedSource,
    });
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
    const bindSource = vi.fn();
    preview.bindProject(request.apiBase, documentModel, {
      contextResourcePresenter: { activeKey: "preview", openCitation: vi.fn() },
      previewSyncControls: { activeSourcePreviewOffsets, bindSource, showSource: vi.fn() },
      projectFileDialog: {
        activeFileId: workspaceSnapshotFixture.entryFileId,
        focusRange: vi.fn(),
        project: workspaceSnapshotFixture,
        projectFiles: () => files,
      },
      projectTreePanel: { hiddenAssets },
      source: new EventTarget() as HTMLTextAreaElement,
      sourceHighlight: new EventTarget() as HTMLElement,
      workspacePreview: preview,
      workspaceSurfaces: { dataset: { layout: "split" } } as unknown as HTMLElement,
    });
    expect(bindSource).toHaveBeenCalledWith(expect.objectContaining({ workspacePreview: preview }));

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
    const presentChapterNotes = vi.spyOn(resources, "presentChapterNotes").mockImplementation(() => undefined);
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
    expect(presentChapterNotes).toHaveBeenCalledWith(projectRequest.activeFileId, projectRequest.files);
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
    const openCitation = vi.fn();
    const focusRange = vi.fn();
    const showSource = vi.fn();
    preview.bindProject("/api/workspaces/workspace-1", new Y.Doc(), {
      contextResourcePresenter: { activeKey: "preview", openCitation },
      previewSyncControls: { activeSourcePreviewOffsets: () => [], bindSource: vi.fn(), showSource },
      projectFileDialog: { activeFileId: null, focusRange, project: workspaceSnapshotFixture, projectFiles: () => [] },
      projectTreePanel: { hiddenAssets: new Set() },
      source: new EventTarget() as HTMLTextAreaElement,
      sourceHighlight: new EventTarget() as HTMLElement,
      workspacePreview: preview,
      workspaceSurfaces: { dataset: {} } as unknown as HTMLElement,
    });

    preview.dispatchEvent(new CustomEvent(workspacePreviewActionEvent, { detail: { action: "source", offset: 12 } }));
    preview.dispatchEvent(
      new CustomEvent(workspacePreviewActionEvent, { detail: { action: "citation", citation: { keys: ["Source2026"] } } }),
    );
    preview.dispatchEvent(new CustomEvent(previewDiagnosticSelectEvent, { detail: { fileId: "chapter", from: 4, to: 9 } }));

    expect(showSource).toHaveBeenCalledWith(12);
    expect(openCitation).toHaveBeenCalledWith({ keys: ["Source2026"] });
    expect(focusRange).toHaveBeenCalledWith("chapter", 4, 9);
  });

  it("binds each deliberate Preview scroll input until the binding is aborted", () => {
    const { preview, viewport } = scrollPreview([]);
    const onIntent = vi.fn();
    const onScroll = vi.fn();
    const binding = new AbortController();

    preview.bindScrollSync({ onIntent, onScroll }, binding.signal);
    for (const type of ["pointerdown", "touchstart", "wheel", "keydown"]) viewport.dispatchEvent(new Event(type));
    viewport.dispatchEvent(new Event("scroll"));

    expect(onIntent).toHaveBeenCalledTimes(4);
    expect(onScroll).toHaveBeenCalledOnce();

    binding.abort();
    viewport.dispatchEvent(new Event("wheel"));
    viewport.dispatchEvent(new Event("scroll"));
    expect(onIntent).toHaveBeenCalledTimes(4);
    expect(onScroll).toHaveBeenCalledOnce();
  });

  it("excludes malformed and nested source blocks from the scroll index", () => {
    for (const [from, to] of [
      [undefined, "10"],
      ["0", undefined],
      ["-1", "10"],
      ["0.5", "10"],
      ["10", "10"],
      ["20", "10"],
    ] as const) {
      const { preview } = scrollPreview([new ScrollElementFixture(from, to, 0, 20)]);
      expect(preview.centeredPreviewScrollOffset(), `${String(from)}..${String(to)}`).toBeNull();
      expect(preview.centerPreviewScrollOffsets([5]), `${String(from)}..${String(to)}`).toBe(false);
    }

    const outer = new ScrollElementFixture("0", "100", 0, 200);
    const nested = new ScrollElementFixture("40", "60", 50, 20);
    nested.parentElement = { closest: () => outer };
    const { preview, viewport } = scrollPreview([outer, nested]);

    expect(preview.centerPreviewScrollOffsets([200])).toBe(true);
    expect(viewport.scrollTop).toBe(150);
  });

  it("maps the viewport center before, within, between, and after ordered blocks", () => {
    const first = new ScrollElementFixture("10", "20", 20, 20);
    const second = new ScrollElementFixture("30", "50", 80, 40);
    const viewport = new ScrollViewportFixture();
    viewport.clientHeight = 20;
    const { preview } = scrollPreview([first, second], viewport);

    viewport.setCenter(10);
    expect(preview.centeredPreviewScrollOffset()).toBe(10);

    viewport.setCenter(30);
    expect(preview.centeredPreviewScrollOffset()).toBeCloseTo(15, 5);

    viewport.setCenter(40);
    expect(preview.centeredPreviewScrollOffset()).toBeGreaterThan(19.999);
    expect(preview.centeredPreviewScrollOffset()).toBeLessThan(20);

    viewport.setCenter(60);
    expect(preview.centeredPreviewScrollOffset()).toBe(25);

    viewport.setCenter(140);
    expect(preview.centeredPreviewScrollOffset()).toBeGreaterThan(49.999);
    expect(preview.centeredPreviewScrollOffset()).toBeLessThan(50);
  });

  it("interpolates only across gaps ordered in both source and Preview", () => {
    const overlappingSource = scrollPreview([new ScrollElementFixture("0", "20", 0, 20), new ScrollElementFixture("10", "30", 60, 20)]);
    overlappingSource.viewport.clientHeight = 20;
    overlappingSource.viewport.setCenter(40);
    expect(overlappingSource.preview.centeredPreviewScrollOffset()).toBeNull();
    overlappingSource.viewport.setCenter(60);
    expect(overlappingSource.preview.centeredPreviewScrollOffset()).toBe(10);

    const reversed = scrollPreview([new ScrollElementFixture("20", "30", 0, 20), new ScrollElementFixture("0", "10", 60, 20)]);
    reversed.viewport.clientHeight = 20;
    reversed.viewport.setCenter(40);
    expect(reversed.preview.centeredPreviewScrollOffset()).toBeNull();

    const visualOverlap = scrollPreview([new ScrollElementFixture("0", "10", 0, 80), new ScrollElementFixture("20", "30", 60, 40)]);
    visualOverlap.viewport.clientHeight = 20;
    visualOverlap.viewport.scrollTop = 7;
    expect(visualOverlap.preview.centerPreviewScrollOffsets([15])).toBe(false);
    expect(visualOverlap.viewport.scrollTop).toBe(7);

    const touching = scrollPreview([new ScrollElementFixture("0", "10", 0, 60), new ScrollElementFixture("20", "30", 60, 40)]);
    touching.viewport.clientHeight = 20;
    expect(touching.preview.centerPreviewScrollOffsets([15])).toBe(true);
    expect(touching.viewport.scrollTop).toBe(50);
  });

  it("chooses the nearest mapped offset while preserving stable tie order", () => {
    const nearest = scrollPreview([new ScrollElementFixture("0", "10", 0, 20), new ScrollElementFixture("20", "30", 80, 40)]);
    nearest.viewport.clientHeight = 200;
    nearest.viewport.scrollTop = 5;
    expect(nearest.preview.centerPreviewScrollOffsets([5, 25])).toBe(true);
    expect(nearest.viewport.scrollTop).toBe(5);

    const tied = scrollPreview([new ScrollElementFixture("0", "10", 20, 20), new ScrollElementFixture("20", "30", 60, 20)]);
    tied.viewport.clientHeight = 100;
    tied.viewport.scrollTop = 100;
    expect(tied.preview.centerPreviewScrollOffsets([5, 25])).toBe(true);
    expect(tied.viewport.scrollTop).toBe(80);

    const finite = scrollPreview([new ScrollElementFixture("0", "10", 0, 20), new ScrollElementFixture("20", "30", 100, 20)]);
    finite.viewport.clientHeight = 20;
    expect(finite.preview.centerPreviewScrollOffsets([25, Number.NaN])).toBe(true);
    expect(finite.viewport.scrollTop).toBe(100);
  });

  it("sorts equal source starts by their range ends before locating an offset", () => {
    const long = new ScrollElementFixture("0", "100", 0, 200);
    const short = new ScrollElementFixture("0", "10", 300, 20);
    const { preview, viewport } = scrollPreview([long, short]);

    expect(preview.centerPreviewScrollOffsets([50])).toBe(true);
    expect(viewport.scrollTop).toBe(50);
  });

  it("classifies scroll edges with one-pixel tolerance and pins valid mappings", () => {
    const viewport = new ScrollViewportFixture();
    const { preview } = scrollPreview([new ScrollElementFixture("0", "10", 100, 20)], viewport);

    for (const [scrollTop, edge] of [
      [0, "start"],
      [1, "start"],
      [1.01, null],
      [200, null],
      [398.99, null],
      [399, "end"],
      [400, "end"],
    ] as const) {
      viewport.scrollTop = scrollTop;
      expect(preview.previewScrollEdge(), String(scrollTop)).toBe(edge);
    }

    viewport.scrollTop = 123;
    expect(preview.centerPreviewScrollOffsets([], "start")).toBe(false);
    expect(viewport.scrollTop).toBe(123);
    expect(preview.centerPreviewScrollOffsets([5], "start")).toBe(true);
    expect(viewport.scrollTop).toBe(0);
    expect(preview.centerPreviewScrollOffsets([5], "end")).toBe(true);
    expect(viewport.scrollTop).toBe(400);
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
