import { describe, expect, it } from "vitest";
import { EditorStatus } from "./editor-status";

class TestEditorStatus extends EditorStatus {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  targetForTest(): string {
    return this.target;
  }
}

describe("editor status", () => {
  it("renders defaults and accepts target and save updates", () => {
    const status = new TestEditorStatus();
    expect(status.renderForTest()).toBeDefined();

    status.setAuthoringTarget("chapter.md", "one\ntwo\nthree", null);
    expect(status.targetForTest()).toBe("chapter.md · no target");
    status.setAuthoringTarget("chapter.md", "one\ntwo\nthree", { start: 4, end: 4 });
    expect(status.targetForTest()).toBe("chapter.md · line 2 · caret");
    status.setAuthoringTarget("chapter.md", "one\ntwo\nthree", { start: 2, end: 12 });
    expect(status.targetForTest()).toBe("chapter.md · lines 1–3 · 10 characters selected");
    status.setSave("Saved offline");

    expect(status.renderForTest()).toBeDefined();
    expect(status.rootForTest()).toBe(status);
  });
});
