import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewSyncControls, type PreviewScrollBinding, type PreviewScrollEdge, type PreviewSyncAction } from "./preview-sync-controls";

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

function fakeElement<Properties extends object>(properties: Properties): HTMLElement & Properties {
  return Object.assign(document.createElement("div"), properties);
}

describe("preview sync controls", () => {
  beforeEach(() => vi.stubGlobal("document", { createElement: vi.fn(() => new EventTarget()) }));
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
      workspacePreview: {
        bindScrollSync: vi.fn(),
        centeredPreviewScrollOffset: () => null,
        centeredSourceOffset: () => 13,
        centerPreviewScrollOffsets: () => false,
        previewScrollEdge: () => null,
        syncFromSource: sourceToPreview,
      },
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

  it("interpolates linked scrolling within a wrapped logical source line", () => {
    const controls = new TestPreviewSyncControls();
    const lines = [1, 2].map((line, index) => ({
      dataset: { lineNumber: String(line) },
      offsetHeight: 100,
      offsetTop: index * 100,
    }));
    const source = Object.assign(new EventTarget(), {
      clientHeight: 100,
      scrollHeight: 300,
      scrollTop: 25,
      selectionEnd: 0,
      value: "abcd\nwxyz",
    });
    controls.bindSource({
      projectFileDialog: { activeFileId: "part", focusRange: vi.fn(), project: null },
      source: source as HTMLTextAreaElement,
      sourceHighlight: {
        querySelector: vi.fn(),
        querySelectorAll: () => lines,
      } as unknown as HTMLElement,
      workspacePreview: {
        bindScrollSync: vi.fn(),
        centeredPreviewScrollOffset: () => null,
        centeredSourceOffset: () => null,
        centerPreviewScrollOffsets: () => false,
        previewScrollEdge: () => null,
        syncFromSource: vi.fn(),
      },
      workspaceSurfaces: { dataset: { layout: "split" } } as unknown as HTMLElement,
    });

    expect(controls.sourceScrollOffsetAtCenter()).toBe(3.75);
    controls.centerSourceScrollOffset(2.5);
    expect(source.scrollTop).toBe(0);
    controls.centerSourceScrollOffset(2.5, "end");
    expect(source.scrollTop).toBe(200);
  });

  it("preserves fractional source positions across asymmetric line geometry and boundary states", () => {
    const controls = new TestPreviewSyncControls();
    controls.centerSourceScrollOffset(3);

    const lines = [
      { dataset: { lineNumber: "1" }, offsetHeight: 80, offsetTop: 30 },
      { dataset: { lineNumber: "2" }, offsetHeight: 60, offsetTop: 140 },
      { dataset: { lineNumber: "3" }, offsetHeight: 40, offsetTop: 230 },
    ];
    const source = Object.assign(new EventTarget(), {
      clientHeight: 40,
      scrollHeight: 350,
      scrollTop: 0,
      selectionEnd: 0,
      value: "abcd\nwxyz\nlast",
    });
    const highlight = fakeElement({
      children: lines,
      querySelector: (selector: string) =>
        lines.find((line) => selector.endsWith(`[data-line-number="${line.dataset.lineNumber}"]`)) ?? null,
      querySelectorAll: () => lines,
    });
    const workspacePreview = {
      bindScrollSync: vi.fn(),
      centeredPreviewScrollOffset: () => null,
      centeredSourceOffset: () => null,
      centerPreviewScrollOffsets: () => false,
      previewScrollEdge: () => null,
      syncFromSource: vi.fn(),
    };

    controls.bindSource({
      projectFileDialog: { activeFileId: "part", focusRange: vi.fn(), project: null },
      source: source as HTMLTextAreaElement,
      sourceHighlight: highlight,
      workspacePreview,
      workspaceSurfaces: fakeElement({ dataset: { layout: "split" } }),
    });

    controls.centerSourceScrollOffset(3);
    expect(source.scrollTop).toBe(58);
    controls.centerSourceScrollOffset(7);
    expect(source.scrollTop).toBe(144);
    controls.centerSourceScrollOffset(12);
    expect(source.scrollTop).toBe(230);
    controls.centerSourceScrollOffset(7, "start");
    expect(source.scrollTop).toBe(0);
    controls.centerSourceScrollOffset(7, "end");
    expect(source.scrollTop).toBe(310);

    source.scrollTop = 135;
    expect(controls.sourceScrollOffsetAtCenter()).toBe(6.25);
    source.scrollTop = 300;
    expect(controls.sourceScrollOffsetAtCenter()).toBe(source.value.length);
    lines[1]!.offsetHeight = 0;
    source.scrollTop = 120;
    expect(controls.sourceScrollOffsetAtCenter()).toBe(5);

    lines[1]!.offsetHeight = 60;
    source.scrollTop = 100;
    expect(controls.sourceOffsetAtCenter()).toBe(5);

    const emptyHighlight = fakeElement({
      children: [],
      querySelector: () => null,
      querySelectorAll: () => [],
    });
    controls.bindSource({
      projectFileDialog: { activeFileId: "part", focusRange: vi.fn(), project: null },
      source: source as HTMLTextAreaElement,
      sourceHighlight: emptyHighlight,
      workspacePreview,
      workspaceSurfaces: fakeElement({ dataset: { layout: "split" } }),
    });
    expect(controls.sourceOffsetAtCenter()).toBe(0);
    expect(controls.sourceScrollOffsetAtCenter()).toBe(0);
  });

  it("classifies source scroll endpoints before following into Preview", () => {
    const controls = new TestPreviewSyncControls();
    const frames: FrameRequestCallback[] = [];
    let nextFrame = 1;
    vi.stubGlobal("window", {
      cancelAnimationFrame: vi.fn(),
      matchMedia: vi.fn(() => ({ matches: true })),
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return nextFrame++;
      }),
    });
    const source = Object.assign(new EventTarget(), {
      clientHeight: 100,
      scrollHeight: 300,
      scrollTop: 0,
      selectionEnd: 0,
      value: "abcdef",
    });
    const lines = [{ dataset: { lineNumber: "1" }, offsetHeight: 300, offsetTop: 0 }];
    const centerPreviewScrollOffsets = vi.fn((_offsets: readonly number[], _edge?: PreviewScrollEdge) => true);
    controls.bindSource({
      projectFileDialog: { activeFileId: null, focusRange: vi.fn(), project: { entryFileId: "entry" } },
      source: source as HTMLTextAreaElement,
      sourceHighlight: fakeElement({
        children: lines,
        querySelector: vi.fn(),
        querySelectorAll: () => lines,
      }),
      workspacePreview: {
        bindScrollSync: vi.fn(),
        centeredPreviewScrollOffset: () => null,
        centeredSourceOffset: () => null,
        centerPreviewScrollOffsets,
        previewScrollEdge: () => null,
        syncFromSource: vi.fn(),
      },
      workspaceSurfaces: fakeElement({ dataset: { layout: "split" } }),
    });
    controls.setSourceMap([
      { fileId: "entry", includeChain: [], outputEnd: 6, outputStart: 0, path: "entry.md", sourceEnd: 6, sourceStart: 0 },
    ]);
    controls.syncForTest("toggle-scroll-link");

    const follow = (): void => {
      source.dispatchEvent(new Event("wheel"));
      source.dispatchEvent(new Event("scroll"));
      const frame = frames.shift();
      expect(frame).toBeDefined();
      frame?.(0);
    };
    follow();
    source.scrollTop = 200;
    follow();
    source.scrollTop = 199;
    follow();
    source.scrollTop = 198;
    follow();
    source.scrollHeight = Number.POSITIVE_INFINITY;
    source.scrollTop = 10;
    follow();

    expect(centerPreviewScrollOffsets.mock.calls.map((call) => call[1])).toEqual(["start", "end", "end", null, null]);
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
    const querySelectorAll = vi.fn(() => trackedLines);

    controls.bindSource({
      projectFileDialog: { activeFileId: "part", focusRange: vi.fn(), project: null },
      source: source as HTMLTextAreaElement,
      sourceHighlight: {
        children: trackedLines,
        querySelector: vi.fn(),
        querySelectorAll,
      } as unknown as HTMLElement,
      workspacePreview: {
        bindScrollSync: vi.fn(),
        centeredPreviewScrollOffset: () => null,
        centeredSourceOffset: () => null,
        centerPreviewScrollOffsets: () => false,
        previewScrollEdge: () => null,
        syncFromSource: vi.fn(),
      },
      workspaceSurfaces: { dataset: { layout: "split" } } as unknown as HTMLElement,
    });

    expect(controls.sourceOffsetAtCenter()).toBe(value.indexOf(`line ${targetIndex + 1}`));
    expect(indexedReads).toBeLessThanOrEqual(20);
    expect(querySelectorAll).not.toHaveBeenCalled();
  });

  it("uses the preceding source line when it is nearest the editor center", () => {
    const controls = new TestPreviewSyncControls();
    const lines = [1, 2, 3].map((line, index) => ({
      dataset: { lineNumber: String(line) },
      offsetHeight: 20,
      offsetTop: index * 100,
    }));
    const source = Object.assign(new EventTarget(), {
      clientHeight: 100,
      scrollTop: 105,
      selectionEnd: 0,
      value: "first\nsecond\nthird",
    });
    controls.bindSource({
      projectFileDialog: { activeFileId: "part", focusRange: vi.fn(), project: null },
      source: source as HTMLTextAreaElement,
      sourceHighlight: {
        querySelector: vi.fn(),
        querySelectorAll: () => lines,
      } as unknown as HTMLElement,
      workspacePreview: {
        bindScrollSync: vi.fn(),
        centeredPreviewScrollOffset: () => null,
        centeredSourceOffset: () => null,
        centerPreviewScrollOffsets: () => false,
        previewScrollEdge: () => null,
        syncFromSource: vi.fn(),
      },
      workspaceSurfaces: { dataset: { layout: "split" } } as unknown as HTMLElement,
    });

    expect(controls.sourceOffsetAtCenter()).toBe(6);
  });

  it("requires an eligible split viewport and transfers leadership without running a stale frame", () => {
    const controls = new TestPreviewSyncControls();
    const frames: { readonly callback: FrameRequestCallback; readonly id: number }[] = [];
    const cancelAnimationFrame = vi.fn();
    let nextFrame = 1;
    let wide = false;
    vi.stubGlobal("window", {
      cancelAnimationFrame,
      matchMedia: vi.fn(() => ({ matches: wide })),
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        const id = nextFrame++;
        frames.push({ callback, id });
        return id;
      }),
    });
    const source = Object.assign(new EventTarget(), {
      clientHeight: 100,
      scrollHeight: 300,
      scrollTop: 50,
      selectionEnd: 0,
      value: "abcdef",
    });
    const lines = [{ dataset: { lineNumber: "1" }, offsetHeight: 300, offsetTop: 0 }];
    const surfaces = fakeElement({ dataset: { layout: "split" } });
    const sourceToPreview = vi.fn();
    const centerPreviewScrollOffsets = vi.fn(() => true);
    let previewOffset: number | null = null;
    let previewBinding: PreviewScrollBinding | undefined;
    controls.bindSource({
      projectFileDialog: { activeFileId: null, focusRange: vi.fn(), project: null },
      source: source as HTMLTextAreaElement,
      sourceHighlight: fakeElement({
        children: lines,
        querySelector: vi.fn(),
        querySelectorAll: () => lines,
      }),
      workspacePreview: {
        bindScrollSync: (binding) => {
          previewBinding = binding;
        },
        centeredPreviewScrollOffset: () => previewOffset,
        centeredSourceOffset: () => null,
        centerPreviewScrollOffsets,
        previewScrollEdge: () => null,
        syncFromSource: sourceToPreview,
      },
      workspaceSurfaces: surfaces,
    });
    controls.setSourceMap([
      { fileId: "part", includeChain: [], outputEnd: 6, outputStart: 0, path: "part.md", sourceEnd: 6, sourceStart: 0 },
    ]);
    controls.syncForTest("toggle-scroll-link");

    const key = (type: string, value: string): Event => {
      const event = new Event(type);
      Object.defineProperty(event, "key", { value });
      return event;
    };

    source.dispatchEvent(key("keydown", "ArrowDown"));
    expect(frames).toHaveLength(0);
    wide = true;
    surfaces.dataset.layout = "single";
    source.dispatchEvent(key("keydown", "ArrowDown"));
    expect(frames).toHaveLength(0);
    surfaces.dataset.layout = "split";
    controls.setVisible(false);
    source.dispatchEvent(key("keydown", "ArrowDown"));
    expect(frames).toHaveLength(0);
    controls.setVisible(true);
    source.dispatchEvent(key("keydown", "a"));
    expect(frames).toHaveLength(0);

    source.dispatchEvent(key("keydown", "ArrowDown"));
    expect(frames).toHaveLength(1);
    source.dispatchEvent(key("keyup", "ArrowDown"));
    expect(sourceToPreview).not.toHaveBeenCalled();
    previewBinding?.onIntent(new Event("wheel"));
    previewBinding?.onScroll();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(frames[0]?.id);
    expect(frames).toHaveLength(2);
    frames[1]?.callback(0);
    expect(centerPreviewScrollOffsets).not.toHaveBeenCalled();

    previewBinding?.onIntent(key("keydown", "a"));
    expect(frames).toHaveLength(2);
    previewOffset = 3;
    previewBinding?.onIntent(key("keydown", "Home"));
    expect(frames).toHaveLength(3);
    frames[2]?.callback(0);
    expect(source.scrollTop).toBe(50);
    source.dispatchEvent(key("keyup", "ArrowDown"));
    expect(sourceToPreview).toHaveBeenCalledWith(false);

    source.dispatchEvent(key("keydown", "ArrowDown"));
    expect(frames).toHaveLength(4);
    frames[3]?.callback(0);
    expect(centerPreviewScrollOffsets).not.toHaveBeenCalled();
  });

  it("links deliberate source and Preview scrolling without reciprocal loops or cross-file churn", () => {
    const controls = new TestPreviewSyncControls();
    const sourceToPreview = vi.fn();
    const focusSource = vi.fn();
    const centeredSourceOffset = vi.fn(() => 13);
    const centeredPreviewScrollOffset = vi.fn(() => 15.5);
    const centerPreviewScrollOffsets = vi.fn(() => true);
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
        centeredPreviewScrollOffset,
        centeredSourceOffset,
        centerPreviewScrollOffsets,
        previewScrollEdge: () => null,
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
    expect(centerPreviewScrollOffsets).toHaveBeenLastCalledWith([6], "start");

    previewBinding?.onScroll();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    previewBinding?.onIntent(new Event("wheel"));
    previewBinding?.onScroll();
    frames.shift()?.(0);
    expect(centeredPreviewScrollOffset).toHaveBeenCalledTimes(1);
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
    expect(centeredPreviewScrollOffset).toHaveBeenCalledTimes(2);

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
