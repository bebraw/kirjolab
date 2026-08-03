import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewSyncControls, type PreviewScrollBinding, type PreviewSyncAction } from "./preview-sync-controls";

class TestPreviewSyncControls extends PreviewSyncControls {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  syncForTest(action?: PreviewSyncAction): void {
    const event = new Event("test");
    Object.defineProperty(event, "currentTarget", { value: { dataset: { syncAction: action } } });
    this.sync(event);
  }

  scrollLinkedForTest(): boolean {
    return this.scrollLinked;
  }
}

describe("preview sync controls", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("owns visibility and source-map translation", () => {
    const controls = new TestPreviewSyncControls();

    controls.setVisible(false);
    expect(controls.hidden).toBe(true);
    controls.setVisible(true);

    controls.setSourceMap([
      { fileId: "part", includeChain: [], outputEnd: 15, outputStart: 5, path: "part.md", sourceEnd: 20, sourceStart: 10 },
    ]);

    expect(controls.sourceLocation(9)).toEqual({ fileId: "part", offset: 14 });
    expect(controls.previewOffsets("part", 14)).toEqual([9]);
    expect(controls.renderForTest()).toBeDefined();
    expect(controls.rootForTest()).toBe(controls);
  });

  it("owns source-editor viewport translation in both directions", () => {
    const controls = new TestPreviewSyncControls();
    const focusSource = vi.fn();
    const sourceToPreview = vi.fn();
    expect(controls.sourceOffsetAtCenter()).toBe(0);
    controls.centerSourceOffset(4);

    const lines = [1, 2, 3].map((line, index) => ({
      dataset: { lineNumber: String(line) },
      offsetHeight: 20,
      offsetTop: index * 100,
    }));
    vi.stubGlobal("document", {
      createElement: vi.fn((tagName: string) =>
        tagName === "textarea"
          ? { clientHeight: 100, scrollTop: 60, value: "first\nsecond\nthird" }
          : {
              querySelector: (selector: string) =>
                lines.find((line) => selector.endsWith(`[data-line-number="${line.dataset.lineNumber}"]`)) ?? null,
              querySelectorAll: () => lines,
            },
      ),
    });
    const source = Object.assign(new EventTarget(), { clientHeight: 100, scrollTop: 60, selectionEnd: 13, value: "first\nsecond\nthird" });
    const highlight = document.createElement("div");

    controls.bindSource({
      projectFileDialog: {
        activeFileId: "part",
        focusRange: (fileId, start) => focusSource({ fileId, offset: start }),
        project: null,
      },
      source: source as HTMLTextAreaElement,
      sourceHighlight: highlight,
      workspacePreview: { bindScrollSync: vi.fn(), centeredSourceOffset: () => 13, syncFromSource: sourceToPreview },
      workspaceSurfaces: { dataset: { layout: "split" } } as unknown as HTMLElement,
    });
    controls.setSourceMap([
      { fileId: "part", includeChain: [], outputEnd: 20, outputStart: 0, path: "part.md", sourceEnd: 20, sourceStart: 0 },
    ]);
    vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: true })) });

    source.dispatchEvent(new Event("click"));
    source.dispatchEvent(new Event("select"));
    for (const key of ["ArrowDown", "a"]) {
      const event = new Event("keyup");
      Object.defineProperty(event, "key", { value: key });
      source.dispatchEvent(event);
    }
    expect(controls.sourceOffsetAtCenter()).toBe(6);
    expect(controls.activeSourcePreviewOffsets("part", true, true, false)).toEqual([6]);
    expect(controls.activeSourcePreviewOffsets("part", false, true, true)).toEqual([13]);
    expect(controls.activeSourcePreviewOffsets("part", false, false, true)).toEqual([]);
    expect(controls.activeSourcePreviewOffsets("part", false, true, false)).toEqual([]);
    controls.syncForTest();
    controls.syncForTest("source-to-preview");
    controls.syncForTest("preview-to-source");
    expect(source.scrollTop).toBe(160);
    expect(sourceToPreview.mock.calls).toEqual([[false], [false], [false], [true]]);
    expect(focusSource).toHaveBeenCalledWith({ fileId: "part", offset: 13 });
  });

  it("finds the centered line logarithmically in long manuscripts", () => {
    const controls = new TestPreviewSyncControls();
    const lineCount = 4096;
    const targetIndex = 3071;
    const value = Array.from({ length: lineCount }, (_, index) => `line ${index + 1}`).join("\n");
    const lines = Array.from({ length: lineCount }, (_, index) => ({
      dataset: { lineNumber: String(index + 1) },
      offsetHeight: 20,
      offsetTop: index * 20,
    }));
    let indexedReads = 0;
    const trackedLines = new Proxy(lines, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/u.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const source = Object.assign(new EventTarget(), {
      clientHeight: 200,
      scrollTop: lines[targetIndex]!.offsetTop + 10 - 100,
      selectionEnd: 0,
      value,
    });

    controls.bindSource({
      projectFileDialog: { activeFileId: "part", focusRange: vi.fn(), project: null },
      source: source as HTMLTextAreaElement,
      sourceHighlight: {
        querySelector: vi.fn(),
        querySelectorAll: () => trackedLines,
      } as unknown as HTMLElement,
      workspacePreview: { bindScrollSync: vi.fn(), centeredSourceOffset: () => null, syncFromSource: vi.fn() },
      workspaceSurfaces: { dataset: { layout: "split" } } as unknown as HTMLElement,
    });

    expect(controls.sourceOffsetAtCenter()).toBe(value.indexOf(`line ${targetIndex + 1}`));
    expect(indexedReads).toBeLessThanOrEqual(20);
  });

  it("links deliberate source and Preview scrolling without reciprocal loops or cross-file churn", () => {
    const controls = new TestPreviewSyncControls();
    const sourceToPreview = vi.fn();
    const focusSource = vi.fn();
    const centeredSourceOffset = vi.fn(() => 13);
    let previewBinding: PreviewScrollBinding | undefined;
    const frames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("window", {
      cancelAnimationFrame: vi.fn(),
      matchMedia: vi.fn(() => ({ matches: true })),
      requestAnimationFrame,
    });

    const lines = [1, 2, 3].map((line, index) => ({
      dataset: { lineNumber: String(line) },
      offsetHeight: 20,
      offsetTop: index * 100,
    }));
    const source = Object.assign(new EventTarget(), {
      clientHeight: 100,
      scrollTop: 0,
      selectionEnd: 0,
      value: "first\nsecond\nthird",
    });
    const highlight = {
      querySelector: (selector: string) => lines.find((line) => selector.endsWith(`[data-line-number="${line.dataset.lineNumber}"]`)),
      querySelectorAll: () => lines,
    } as unknown as HTMLElement;

    controls.bindSource({
      projectFileDialog: { activeFileId: "part", focusRange: focusSource, project: null },
      source: source as HTMLTextAreaElement,
      sourceHighlight: highlight,
      workspacePreview: {
        bindScrollSync: (binding) => {
          previewBinding = binding;
        },
        centeredSourceOffset,
        syncFromSource: sourceToPreview,
      },
      workspaceSurfaces: { dataset: { layout: "split" } } as unknown as HTMLElement,
    });
    controls.setSourceMap([
      { fileId: "part", includeChain: [], outputEnd: 20, outputStart: 0, path: "part.md", sourceEnd: 20, sourceStart: 0 },
    ]);

    controls.syncForTest("toggle-scroll-link");
    expect(controls.scrollLinkedForTest()).toBe(true);
    source.dispatchEvent(new Event("wheel"));
    source.dispatchEvent(new Event("scroll"));
    source.dispatchEvent(new Event("scroll"));
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    frames.shift()?.(0);
    expect(sourceToPreview).toHaveBeenLastCalledWith(true, false);

    previewBinding?.onScroll();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    previewBinding?.onIntent(new Event("wheel"));
    previewBinding?.onScroll();
    frames.shift()?.(0);
    expect(centeredSourceOffset).toHaveBeenLastCalledWith(false);
    expect(source.scrollTop).toBe(160);
    expect(focusSource).not.toHaveBeenCalled();

    source.dispatchEvent(new Event("wheel"));
    source.dispatchEvent(new Event("scroll"));
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3);
    const sourceSyncCount = sourceToPreview.mock.calls.length;
    source.dispatchEvent(new Event("input"));
    frames.shift()?.(0);
    expect(sourceToPreview).toHaveBeenCalledTimes(sourceSyncCount);
    source.dispatchEvent(new Event("scroll"));
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3);

    const homeKey = new Event("keydown");
    Object.defineProperty(homeKey, "key", { value: "Home" });
    previewBinding?.onIntent(homeKey);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(4);
    frames.shift()?.(0);
    expect(centeredSourceOffset).toHaveBeenLastCalledWith(false);

    controls.setSourceMap([
      { fileId: "other", includeChain: [], outputEnd: 20, outputStart: 0, path: "other.md", sourceEnd: 20, sourceStart: 0 },
    ]);
    source.scrollTop = 0;
    previewBinding?.onIntent(new Event("wheel"));
    previewBinding?.onScroll();
    frames.shift()?.(0);
    expect(source.scrollTop).toBe(0);
    expect(focusSource).not.toHaveBeenCalled();

    controls.syncForTest("toggle-scroll-link");
    expect(controls.scrollLinkedForTest()).toBe(false);
  });
});
