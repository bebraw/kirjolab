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

    expect(actions).toEqual(["source-to-preview", "preview-to-source"]);
    expect(controls.renderForTest()).toBeDefined();
    expect(controls.rootForTest()).toBe(controls);
  });
});
