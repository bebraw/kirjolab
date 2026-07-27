import { describe, expect, it } from "vitest";
import * as Y from "yjs";
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

  it("owns the relative authoring target, caret, passage, and range", () => {
    const documentModel = new Y.Doc();
    const text = documentModel.getText("source");
    text.insert(0, "alpha beta");
    const source = {
      selectionDirection: "none" as const,
      selectionEnd: 0,
      selectionStart: 0,
      setSelectionRange(start: number, end: number) {
        this.selectionStart = start;
        this.selectionEnd = end;
      },
    } as HTMLTextAreaElement;
    const status = new TestEditorStatus();
    let changes = 0;
    status.bindAuthoring(documentModel, source, () => changes++);
    status.setAuthoringContext("chapter.md", "file-1", text, true);

    source.setSelectionRange(6, 10);
    status.rememberSelection();
    expect(status.authoringTarget).toEqual({ start: 6, end: 10 });
    expect(status.caret).toBe(10);
    expect(status.selectedPassage()).toEqual({ fileId: "file-1", start: 6, end: 10, excerpt: "beta" });

    text.insert(0, "x ");
    status.refreshAuthoringTarget();
    expect(status.authoringTarget).toEqual({ start: 8, end: 12 });
    source.setSelectionRange(8, 12);
    expect(status.selectedPassage()).toEqual({ fileId: "file-1", start: 8, end: 12, excerpt: "beta" });

    status.selectRange(2);
    expect(source.selectionStart).toBe(2);
    expect(source.selectionEnd).toBe(2);
    expect(status.selectedPassage()).toBeNull();
    expect(changes).toBe(4);
  });
});
