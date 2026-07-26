import { afterEach, describe, expect, it, vi } from "vitest";
import type { Diagnostic } from "../domain/markdown";
import type { ProjectComposition, ProjectFilePreview } from "../domain/project-files";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import type { MarkdownRuntime } from "./markdown-runtime";
import type { PreviewDiagnosticsPanel } from "./preview-presentation";
import {
  previewHeadingNumbers,
  WorkspacePreview,
  type ProjectPreviewImageContext,
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

  protected override get diagnostics(): PreviewDiagnosticsPanel {
    return {
      setDiagnostics: this.setDiagnostics,
      showUnavailable: this.showUnavailable,
    } as unknown as PreviewDiagnosticsPanel;
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

  it("shows source and a local diagnostic when the renderer is unavailable", async () => {
    const preview = new TestWorkspacePreview();
    preview.runtime = Promise.reject(new Error("Renderer unavailable"));

    await expect(preview.renderDocument(request)).resolves.toEqual({ available: false });

    expect(preview.showUnavailable).toHaveBeenCalledWith("Renderer unavailable");
    expect(preview.renderForTest().values[0]).toBe("# Source");
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
