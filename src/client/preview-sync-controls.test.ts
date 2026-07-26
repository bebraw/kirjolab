import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewSyncControls, previewSyncActionEvent, type PreviewSyncAction } from "./preview-sync-controls";

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
}

describe("preview sync controls", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("owns visibility and emits both synchronization directions", () => {
    const controls = new TestPreviewSyncControls();
    const actions: PreviewSyncAction[] = [];
    controls.addEventListener(previewSyncActionEvent, (event) => {
      actions.push((event as CustomEvent<PreviewSyncAction>).detail);
    });

    controls.setVisible(false);
    expect(controls.hidden).toBe(true);
    controls.setVisible(true);
    controls.syncForTest();
    controls.syncForTest("source-to-preview");
    controls.syncForTest("preview-to-source");

    controls.setSourceMap([
      { fileId: "part", includeChain: [], outputEnd: 15, outputStart: 5, path: "part.md", sourceEnd: 20, sourceStart: 10 },
    ]);

    expect(actions).toEqual(["source-to-preview", "preview-to-source"]);
    expect(controls.sourceLocation(9)).toEqual({ fileId: "part", offset: 14 });
    expect(controls.previewOffsets("part", 14)).toEqual([9]);
    expect(controls.renderForTest()).toBeDefined();
    expect(controls.rootForTest()).toBe(controls);
  });

  it("owns source-editor viewport translation in both directions", () => {
    const controls = new TestPreviewSyncControls();
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
    const source = document.createElement("textarea");
    const highlight = document.createElement("div");

    controls.bindSource(source, highlight);

    expect(controls.sourceOffsetAtCenter()).toBe(6);
    controls.centerSourceOffset(13);
    expect(source.scrollTop).toBe(160);
  });
});
