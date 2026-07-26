import { describe, expect, it } from "vitest";
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
});
