import { describe, expect, it } from "vitest";
import { EditorStatus } from "./editor-status";

class TestEditorStatus extends EditorStatus {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }
}

describe("editor status", () => {
  it("renders defaults and accepts target and save updates", () => {
    const status = new TestEditorStatus();
    expect(status.renderForTest()).toBeDefined();

    status.setTarget("chapter.md · line 4 · 12 characters selected");
    status.setSave("Saved offline");

    expect(status.renderForTest()).toBeDefined();
    expect(status.rootForTest()).toBe(status);
  });
});
