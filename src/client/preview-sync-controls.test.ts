import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewSyncControls, type PreviewSyncAction } from "./preview-sync-controls";

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
    const previewToSource = vi.fn();
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
    const source = Object.assign(new EventTarget(), { clientHeight: 100, scrollTop: 60, value: "first\nsecond\nthird" });
    const highlight = document.createElement("div");

    controls.bindSource(source as HTMLTextAreaElement, highlight, { previewToSource, sourceToPreview });

    source.dispatchEvent(new Event("click"));
    source.dispatchEvent(new Event("select"));
    for (const key of ["ArrowDown", "a"]) {
      const event = new Event("keyup");
      Object.defineProperty(event, "key", { value: key });
      source.dispatchEvent(event);
    }
    controls.syncForTest();
    controls.syncForTest("source-to-preview");
    controls.syncForTest("preview-to-source");

    expect(controls.sourceOffsetAtCenter()).toBe(6);
    controls.centerSourceOffset(13);
    expect(source.scrollTop).toBe(160);
    expect(sourceToPreview.mock.calls).toEqual([[false], [false], [false], [true]]);
    expect(previewToSource).toHaveBeenCalledOnce();
  });
});
