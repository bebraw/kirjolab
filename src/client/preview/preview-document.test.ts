import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSnapshot } from "../../domain/workspace/workspace";
import { workspaceSnapshotFixture } from "../../test-support/workspace-fixture";
import {
  WorkspacePreview,
  workspacePreviewActionEvent,
  type ProjectPreviewImageContext,
  type WorkspacePreviewAction,
} from "./workspace-preview";

interface Bounds {
  readonly top: number;
  readonly left?: number;
  readonly width?: number;
  readonly height: number;
}

class FakeElement extends EventTarget {
  readonly dataset: Record<string, string> = {};
  readonly sources: FakeElement[] = [];
  readonly imageNodes: FakeElement[] = [];
  readonly anchors = new Map<string, FakeElement>();
  readonly closestMatches = new Map<string, FakeElement | null>();
  textContent = "";
  innerHTML = "";
  clientHeight = 100;
  scrollHeight = 100;
  scrollTop = 0;
  scrolled = false;
  src = "";
  #bounds: Bounds = { top: 0, left: 0, width: 100, height: 100 };

  setBounds(bounds: Bounds): void {
    this.#bounds = bounds;
  }

  getBoundingClientRect(): DOMRect {
    const { top, left = 0, width = 0, height } = this.#bounds;
    return { top, left, width, height } as DOMRect;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return selector === "img" ? this.imageNodes : this.sources;
  }

  querySelector(selector: string): FakeElement | null {
    if (selector === '[data-preview-sync-active="true"]') {
      return this.sources.find(({ dataset }) => dataset.previewSyncActive === "true") ?? null;
    }
    return this.anchors.get(selector.slice(1)) ?? null;
  }

  contains(element: unknown): boolean {
    return this.sources.includes(element as FakeElement);
  }

  closest(selector: string): FakeElement | null {
    if (this.closestMatches.has(selector)) return this.closestMatches.get(selector) ?? null;
    return selector === "[data-source-from][data-source-to]" ? this : null;
  }

  removeAttribute(name: string): void {
    if (name === "data-preview-sync-active") delete this.dataset.previewSyncActive;
  }

  scrollIntoView(): void {
    this.scrolled = true;
  }
}

const htmlElement = (element: FakeElement): HTMLElement => element as never;

class TestWorkspacePreview extends WorkspacePreview {
  constructor(
    private readonly articleNode: HTMLElement,
    private readonly viewportNode: HTMLElement,
  ) {
    super();
  }

  resolveImagesForTest(context: ProjectPreviewImageContext): void {
    this.resolveProjectImages(context);
  }

  nearestSourceElementForTest(offsets: readonly number[]): HTMLElement | null {
    return this.nearestSourceElement(offsets);
  }

  centerForTest(target: HTMLElement): void {
    this.center(target);
  }

  clickForTest(target: FakeElement): void {
    this.handleClick({ target } as unknown as MouseEvent);
  }

  protected override get article(): HTMLElement {
    return this.articleNode;
  }

  protected override get viewport(): HTMLElement {
    return this.viewportNode;
  }
}

describe("workspace preview document", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("window", { clearTimeout, setTimeout });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("owns viewport scroll reset and anchor navigation", () => {
    const article = new FakeElement();
    const viewport = new FakeElement();
    const anchor = new FakeElement();
    article.anchors.set("section", anchor);
    const preview = new TestWorkspacePreview(htmlElement(article), htmlElement(viewport));
    viewport.scrollTop = 40;
    preview.resetScroll();
    expect(viewport.scrollTop).toBe(0);
    preview.scrollToAnchor("section");
    expect(anchor.scrolled).toBe(true);
  });

  it("selects and centers the nearest matching source span", () => {
    const article = new FakeElement();
    const viewport = new FakeElement();
    viewport.setBounds({ top: 20, left: 10, width: 80, height: 100 });
    const broad = new FakeElement();
    broad.dataset.sourceFrom = "0";
    broad.dataset.sourceTo = "20";
    broad.setBounds({ top: 55, height: 20 });
    const narrow = new FakeElement();
    narrow.dataset.sourceFrom = "5";
    narrow.dataset.sourceTo = "10";
    narrow.setBounds({ top: 60, height: 10 });
    article.sources.push(broad, narrow);
    vi.stubGlobal("document", { elementFromPoint: () => null });
    const preview = new TestWorkspacePreview(htmlElement(article), htmlElement(viewport));

    expect(preview.centeredSourceOffset()).toBe(5);
    expect(preview.nearestSourceElementForTest([7])).toBe(narrow);
    expect(preview.nearestSourceElementForTest([30])).toBeNull();
    expect(preview.revealNearestSource([7])).toBe(true);
    expect(preview.revealNearestSource([30])).toBe(false);
    viewport.scrollTop = 0;
    preview.centerForTest(broad as never);
    expect(viewport.scrollTop).toBe(-5);
  });

  it("interpolates linked scrolling within rendered blocks and across their gaps", () => {
    const article = new FakeElement();
    const viewport = new FakeElement();
    viewport.scrollHeight = 400;
    viewport.scrollTop = 100;
    viewport.setBounds({ top: 0, left: 0, width: 100, height: 100 });
    const first = new FakeElement();
    first.dataset.sourceFrom = "0";
    first.dataset.sourceTo = "10";
    first.setBounds({ top: -100, height: 100 });
    const second = new FakeElement();
    second.dataset.sourceFrom = "20";
    second.dataset.sourceTo = "30";
    second.setBounds({ top: 100, height: 100 });
    article.sources.push(first, second);
    const preview = new TestWorkspacePreview(htmlElement(article), htmlElement(viewport));

    expect(preview.centeredPreviewScrollOffset()).toBe(15);
    expect(preview.centerPreviewScrollOffsets([5])).toBe(true);
    expect(viewport.scrollTop).toBe(0);
    expect(preview.centerPreviewScrollOffsets([5], "end")).toBe(true);
    expect(viewport.scrollTop).toBe(300);
  });

  it("maps source-reordered rendered blocks without interpolating across the reversal", () => {
    const article = new FakeElement();
    const viewport = new FakeElement();
    viewport.setBounds({ top: 70, left: 0, width: 100, height: 100 });
    const opening = new FakeElement();
    opening.dataset.sourceFrom = "0";
    opening.dataset.sourceTo = "9";
    opening.setBounds({ top: 0, height: 20 });
    const later = new FakeElement();
    later.dataset.sourceFrom = "33";
    later.dataset.sourceTo = "41";
    later.setBounds({ top: 40, height: 20 });
    const footnote = new FakeElement();
    footnote.dataset.sourceFrom = "11";
    footnote.dataset.sourceTo = "31";
    footnote.setBounds({ top: 100, height: 40 });
    article.sources.push(opening, later, footnote);
    const preview = new TestWorkspacePreview(htmlElement(article), htmlElement(viewport));

    expect(preview.centeredPreviewScrollOffset()).toBeCloseTo(21, 5);
    expect(preview.centerPreviewScrollOffsets([21])).toBe(true);
    expect(viewport.scrollTop).toBe(0);

    const previewGapViewport = new FakeElement();
    previewGapViewport.setBounds({ top: -20, left: 0, width: 100, height: 100 });
    const previewGap = new TestWorkspacePreview(htmlElement(article), htmlElement(previewGapViewport));
    expect(previewGap.centeredPreviewScrollOffset()).toBeNull();

    const sourceGapViewport = new FakeElement();
    sourceGapViewport.scrollTop = 7;
    sourceGapViewport.setBounds({ top: 0, left: 0, width: 100, height: 100 });
    const sourceGap = new TestWorkspacePreview(htmlElement(article), htmlElement(sourceGapViewport));
    expect(sourceGap.centerPreviewScrollOffsets([10])).toBe(false);
    expect(sourceGapViewport.scrollTop).toBe(7);
  });

  it("keeps the Preview tail inside the final half-open source range", () => {
    const article = new FakeElement();
    const viewport = new FakeElement();
    viewport.setBounds({ top: 100, left: 0, width: 100, height: 100 });
    const final = new FakeElement();
    final.dataset.sourceFrom = "10";
    final.dataset.sourceTo = "30";
    final.setBounds({ top: 0, height: 40 });
    article.sources.push(final);
    const preview = new TestWorkspacePreview(htmlElement(article), htmlElement(viewport));

    expect(preview.centeredPreviewScrollOffset()).toBeLessThan(30);
    expect(preview.centeredPreviewScrollOffset()).toBeGreaterThan(29);
  });

  it("resolves authorized project images relative to their source files", () => {
    const article = new FakeElement();
    const local = new FakeElement();
    const hidden = new FakeElement();
    const external = new FakeElement();
    article.imageNodes.push(local, hidden, external);
    const preview = new TestWorkspacePreview(htmlElement(article), htmlElement(new FakeElement()));
    const snapshot = {
      ...workspaceSnapshotFixture,
      entryFileId: "chapter",
      files: [{ ...workspaceSnapshotFixture.files[0]!, id: "chapter", path: "chapters/method.md" }],
      assets: [
        {
          id: "asset-1",
          path: "figures/result.png",
          mediaType: "image/png",
          size: 10,
          objectKey: "assets/result.png",
          fingerprint: "result",
          createdAt: "created",
          updatedAt: "updated",
        },
        {
          id: "asset-2",
          path: "figures/hidden.png",
          mediaType: "image/png",
          size: 10,
          objectKey: "assets/hidden.png",
          fingerprint: "hidden",
          createdAt: "created",
          updatedAt: "updated",
        },
      ],
    } satisfies WorkspaceSnapshot;

    preview.resolveImagesForTest({
      apiBase: "/api/workspaces/workspace",
      hiddenAssetIds: new Set(["asset-2"]),
      snapshot,
      source: "![Result](../figures/result.png)\n![Hidden](../figures/hidden.png)\n![Remote](https://example.org/x.png)",
      sourceMap: [],
    });

    expect(local.src).toBe("/api/workspaces/workspace/assets/asset-1");
    expect(hidden.src).toBe("");
    expect(external.src).toBe("");
  });

  it("prefers the centered source element and replaces transient sync emphasis", () => {
    const article = new FakeElement();
    const viewport = new FakeElement();
    const previous = new FakeElement();
    previous.dataset.previewSyncActive = "true";
    const centered = new FakeElement();
    centered.dataset.sourceFrom = "12";
    centered.dataset.sourceTo = "20";
    article.sources.push(previous, centered);
    vi.stubGlobal("document", { elementFromPoint: () => centered });
    const preview = new TestWorkspacePreview(htmlElement(article), htmlElement(viewport));

    expect(preview.centeredSourceOffset()).toBe(12);
    expect(previous.dataset.previewSyncActive).toBeUndefined();
    expect(centered.dataset.previewSyncActive).toBe("true");
    preview.markSyncTarget(previous as never);
    vi.runAllTimers();
    expect(previous.dataset.previewSyncActive).toBeUndefined();
  });

  it("turns preview DOM clicks into typed citation and source actions", () => {
    const article = new FakeElement();
    const preview = new TestWorkspacePreview(htmlElement(article), htmlElement(new FakeElement()));
    const actions: WorkspacePreviewAction[] = [];
    preview.addEventListener(workspacePreviewActionEvent, (event) => {
      actions.push((event as CustomEvent<WorkspacePreviewAction>).detail);
    });
    const citation = new FakeElement();
    citation.dataset.citation = " First, second ";
    citation.dataset.locator = "p. 4";
    citation.closestMatches.set("button.semantic-citation[data-citation]", citation);
    preview.clickForTest(citation);
    const source = new FakeElement();
    source.dataset.sourceFrom = "24";
    source.dataset.sourceTo = "30";
    article.sources.push(source);
    preview.clickForTest(source);
    const interactive = new FakeElement();
    interactive.closestMatches.set("a, button, input, select, textarea", interactive);
    preview.clickForTest(interactive);

    expect(actions).toEqual([
      { action: "citation", citation: { keys: ["First"], locator: "p. 4" } },
      { action: "source", offset: 24 },
    ]);
    expect(source.dataset.previewSyncActive).toBe("true");
  });
});
