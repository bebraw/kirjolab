import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { EditorStatus } from "./editor-status";

class FakeElement extends EventTarget {
  readonly children: unknown[] = [];
  readonly classList = { toggle() {} };
  readonly dataset: Record<string, string> = {};
  scrollLeft = 0;
  scrollTop = 0;
  textContent = "";

  append(...nodes: unknown[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: unknown[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }

  focus(): void {}
}

class FakeTextarea extends FakeElement {
  value = "";
  selectionStart = 0;
  selectionEnd = 0;
  selectionDirection: "forward" | "backward" | "none" = "none";

  setSelectionRange(start: number, end: number, direction: "forward" | "backward" | "none" = "none"): void {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.selectionDirection = direction;
  }
}

const textareaElement = (textarea: FakeTextarea): HTMLTextAreaElement => textarea as never;
const htmlElement = (element = new FakeElement()): HTMLElement => element as never;
const undoKey = (): KeyboardEvent =>
  Object.assign(new Event("keydown", { cancelable: true }), {
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    key: "z",
    metaKey: true,
    shiftKey: false,
  }) as KeyboardEvent;

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
  beforeEach(() => {
    vi.stubGlobal("document", {
      createDocumentFragment: () => new FakeElement(),
      createElement: () => new FakeElement(),
      createTextNode: (value: string) => ({ textContent: value }),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

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
    const source = textareaElement(new FakeTextarea());
    const status = new TestEditorStatus();
    let changes = 0;
    status.bindAuthoring(documentModel, source, {
      highlight: htmlElement(),
      presence: () => [],
      sourceChanged: () => undefined,
      targetChanged: () => changes++,
    });
    status.setAuthoringContext("chapter.md", "file-1", text, true);

    source.setSelectionRange(6, 10);
    status.rememberSelection();
    const resolveRange = status.preserveRange(6, 10);
    expect(status.authoringTarget).toEqual({ start: 6, end: 10 });
    expect(status.caret).toBe(10);
    expect(status.selectedPassage()).toEqual({ fileId: "file-1", start: 6, end: 10, excerpt: "beta" });

    text.insert(0, "x ");
    status.refreshAuthoringTarget();
    expect(resolveRange?.()).toEqual({ start: 8, end: 12 });
    expect(status.authoringTarget).toEqual({ start: 8, end: 12 });
    source.setSelectionRange(8, 12);
    expect(status.selectedPassage()).toEqual({ fileId: "file-1", start: 8, end: 12, excerpt: "beta" });

    status.selectRange(2);
    expect(source.selectionStart).toBe(2);
    expect(source.selectionEnd).toBe(2);
    expect(status.selectedPassage()).toBeNull();
    expect(changes).toBe(4);
  });

  it("invalidates a preserved range when the authoring text changes", () => {
    const documentModel = new Y.Doc();
    const first = documentModel.getText("first");
    const second = documentModel.getText("second");
    first.insert(0, "first text");
    second.insert(0, "second text");
    const source = textareaElement(new FakeTextarea());
    const status = new TestEditorStatus();
    status.bindAuthoring(documentModel, source, {
      highlight: htmlElement(),
      presence: () => [],
      sourceChanged: () => undefined,
      targetChanged: () => undefined,
    });
    status.setAuthoringContext("first.md", "first", first);
    const resolveRange = status.preserveRange(0, 5);

    status.setAuthoringContext("second.md", "second", second);

    expect(resolveRange?.()).toBeNull();
  });

  it("owns the active source binding lifecycle", () => {
    const documentModel = new Y.Doc();
    const first = documentModel.getText("first");
    const second = documentModel.getText("second");
    first.insert(0, "first");
    second.insert(0, "second");
    const source = textareaElement(new FakeTextarea());
    const status = new TestEditorStatus();
    let sourceChanges = 0;
    let presenceReads = 0;
    status.bindAuthoring(documentModel, source, {
      highlight: htmlElement(),
      presence: (fileId) => {
        presenceReads++;
        return fileId ? [{ collaboratorId: "remote", start: 0, end: 1, local: false }] : [];
      },
      sourceChanged: () => sourceChanges++,
      targetChanged: () => undefined,
    });
    status.setAuthoringContext("first.md", "first", first, true);

    source.value = "first edit";
    source.dispatchEvent(new Event("input"));
    expect(first.toString()).toBe("first edit");
    expect(sourceChanges).toBe(1);

    status.setAuthoringContext("second.md", "second", second, true);
    expect(source.value).toBe("second");
    first.insert(0, "old ");
    expect(source.value).toBe("second");
    expect(sourceChanges).toBe(1);

    second.insert(0, "new ");
    expect(source.value).toBe("new second");
    expect(sourceChanges).toBe(2);

    documentModel.transact(() => second.insert(second.length, " owned"), status);
    expect(source.value).toBe("new second owned");
    source.dispatchEvent(undoKey());
    expect(second.toString()).toBe("new second");
    status.renderHighlight();
    expect(presenceReads).toBeGreaterThan(0);
  });
});
