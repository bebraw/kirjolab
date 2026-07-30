import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { workspaceSnapshotFixture } from "../../test-support/workspace-fixture";
import { EditorStatus, type EditorAuthoringOwners } from "./editor-status";

class FakeElement extends EventTarget {
  readonly children: unknown[] = [];
  readonly classList = { toggle() {} };
  readonly dataset: Record<string, string> = {};
  scrollLeft = 0;
  scrollTop = 0;
  textContent = "";
  focused = false;

  append(...nodes: unknown[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: unknown[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }

  focus(): void {
    this.focused = true;
  }
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
const authoringBinding = ({
  bibliography = textareaElement(new FakeTextarea()),
  presence = () => [],
  sourceChanged = () => undefined,
  targetChanged = () => undefined,
}: {
  bibliography?: HTMLTextAreaElement;
  presence?: EditorAuthoringOwners["collaboratorSelections"]["rangesFor"];
  sourceChanged?: () => void;
  targetChanged?: () => void;
} = {}): EditorAuthoringOwners => ({
  authoringModeTabs: { navigate: vi.fn() },
  bibliography,
  assistantGenerationPresenter: { refreshAvailability: vi.fn(), refreshTarget: targetChanged, sourceChanged },
  sourceCitationControl: { bindWorkflow: vi.fn(), setCaret: vi.fn() },
  contextResourcePresenter: { openCitation: vi.fn(), setCitationAvailable: vi.fn() },
  editorInsertMenu: { bind: vi.fn() },
  sourceHighlight: htmlElement(),
  sourceEditorShell: htmlElement(),
  toast: { show: vi.fn() },
  vimModeControl: { bindEditor: vi.fn() },
  collaboratorSelections: { bindSelectionChanged: vi.fn(), rangesFor: presence },
});
const authoringSocket = () => ({ scheduleSelection: vi.fn() });
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
      activeElement: null,
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
    const binding = authoringBinding({ targetChanged: () => changes++ });
    status.bindAuthoring(documentModel, source, binding, authoringSocket());
    expect(binding.vimModeControl.bindEditor).toHaveBeenCalledWith(source, binding.sourceEditorShell);
    expect(binding.editorInsertMenu.bind).toHaveBeenCalledWith(status, binding.toast);
    status.setAuthoringContext("chapter.md", "file-1", text, true);

    source.setSelectionRange(6, 10);
    status.rememberSelection();
    const resolveRange = status.preserveRange(6, 10);
    expect(status.authoringTarget).toEqual({ start: 6, end: 10 });
    expect(status.caret).toBe(10);
    expect(status.selectedPassage()).toEqual({ fileId: "file-1", start: 6, end: 10, excerpt: "beta" });
    expect(status.insertionTarget).toEqual({
      caret: 10,
      passage: { fileId: "file-1", start: 6, end: 10, excerpt: "beta" },
    });

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
    expect(status.insertionTarget).toEqual({ caret: 2, passage: null });
    expect(changes).toBe(5);
    expect(binding.sourceCitationControl.setCaret).toHaveBeenLastCalledWith("x alpha beta", 2);
    expect(binding.contextResourcePresenter.setCitationAvailable).toHaveBeenLastCalledWith(true);
  });

  it("invalidates a preserved range when the authoring text changes", () => {
    const documentModel = new Y.Doc();
    const first = documentModel.getText("first");
    const second = documentModel.getText("second");
    first.insert(0, "first text");
    second.insert(0, "second text");
    const source = textareaElement(new FakeTextarea());
    const status = new TestEditorStatus();
    status.bindAuthoring(documentModel, source, authoringBinding(), authoringSocket());
    status.setAuthoringContext("first.md", "first", first);
    const resolveRange = status.preserveRange(0, 5);

    status.setAuthoringContext("second.md", "second", second);

    expect(resolveRange?.()).toBeNull();
  });

  it("owns project-file text resolution and active-text insertion", () => {
    const documentModel = new Y.Doc();
    documentModel.getText("source").insert(0, "draft");
    const source = textareaElement(new FakeTextarea());
    const status = new TestEditorStatus();
    status.bindAuthoring(documentModel, source, authoringBinding(), authoringSocket());

    status.setProjectFile(workspaceSnapshotFixture.files[0]!, workspaceSnapshotFixture.entryFileId, true);
    status.applyAuthoringInsertion({ end: 5, selectionEnd: 6, selectionStart: 6, start: 5, text: "!" });
    status.insertAuthoringText(6, " ready");

    expect(status.manuscript).toBe("draft! ready");
    expect(source.value).toBe("draft! ready");
  });

  it("completes citation insertion through the bound authoring owners", () => {
    const documentModel = new Y.Doc();
    const text = documentModel.getText("source");
    text.insert(0, "Claim.");
    const source = textareaElement(new FakeTextarea());
    const status = new TestEditorStatus();
    const binding = authoringBinding();
    status.bindAuthoring(documentModel, source, binding, authoringSocket());
    status.setAuthoringContext("main.md", "main", text, true);

    expect(binding.sourceCitationControl.bindWorkflow).toHaveBeenCalledWith(binding.contextResourcePresenter, status);
    status.completeCitationInsertion({ caret: 26, index: 6, text: " :cite[source2026]" }, "Citation inserted.");
    status.completeCitationInsertion(null, "Citation unavailable.");

    expect(status.manuscript).toBe("Claim. :cite[source2026]");
    expect(binding.authoringModeTabs.navigate).toHaveBeenCalledOnce();
    expect(binding.toast.show).toHaveBeenNthCalledWith(1, "Citation inserted.");
    expect(binding.toast.show).toHaveBeenNthCalledWith(2, "Citation unavailable.");
  });

  it("preserves a live insertion point across collaborative edits", () => {
    const documentModel = new Y.Doc();
    const first = documentModel.getText("first");
    const second = documentModel.getText("second");
    first.insert(0, "first text");
    second.insert(0, "second text");
    const source = textareaElement(new FakeTextarea());
    const status = new TestEditorStatus();
    expect(status.preserveInsertionPoint()).toBeNull();
    status.bindAuthoring(documentModel, source, authoringBinding(), authoringSocket());
    status.setAuthoringContext("first.md", "first", first, true);
    source.setSelectionRange(5, 5);
    const insert = status.preserveInsertionPoint();

    first.insert(0, "new ");
    expect(insert?.(" included")).toBe(true);
    expect(first.toString()).toBe("new first included text");

    const staleInsert = status.preserveInsertionPoint();
    status.setAuthoringContext("second.md", "second", second);
    expect(staleInsert?.(" stale")).toBe(false);
    expect(first.toString()).toBe("new first included text");
  });

  it("preserves active and companion editor selections across remote edits", () => {
    const documentModel = new Y.Doc();
    const text = documentModel.getText("source");
    const companion = documentModel.getText("bibliography");
    text.insert(0, "source text");
    companion.insert(0, "reference text");
    const source = textareaElement(new FakeTextarea());
    const companionSource = textareaElement(new FakeTextarea());
    const status = new TestEditorStatus();
    status.bindAuthoring(documentModel, source, authoringBinding({ bibliography: companionSource }), authoringSocket());
    status.setAuthoringContext("source.md", "source", text, true);
    source.setSelectionRange(2, 6);
    companionSource.setSelectionRange(3, 8, "backward");
    const restore = status.preserveSelections();

    text.insert(0, "new ");
    companion.insert(0, "new ");
    source.setSelectionRange(0, 0);
    companionSource.setSelectionRange(0, 0);
    restore();

    expect(source.selectionStart).toBe(6);
    expect(source.selectionEnd).toBe(10);
    expect(companionSource.selectionStart).toBe(7);
    expect(companionSource.selectionEnd).toBe(12);
    expect(companionSource.selectionDirection).toBe("backward");
  });

  it("owns the active source binding lifecycle", () => {
    const documentModel = new Y.Doc();
    const first = documentModel.getText("first");
    const second = documentModel.getText("second");
    first.insert(0, "first");
    second.insert(0, "second");
    const sourceControl = new FakeTextarea();
    const source = textareaElement(sourceControl);
    const status = new TestEditorStatus();
    let sourceChanges = 0;
    let presenceReads = 0;
    const binding = authoringBinding({
      presence: (fileId) => {
        presenceReads++;
        return fileId ? [{ collaboratorId: "remote", start: 0, end: 1, local: false }] : [];
      },
      sourceChanged: () => sourceChanges++,
    });
    const collaborationSocket = authoringSocket();
    status.bindAuthoring(documentModel, source, binding, collaborationSocket);
    status.setAuthoringContext("first.md", "first", first, true);
    Reflect.set(document, "activeElement", source);

    source.value = "first edit";
    source.dispatchEvent(new Event("input"));
    expect(first.toString()).toBe("first edit");
    expect(sourceChanges).toBe(1);
    expect(collaborationSocket.scheduleSelection).toHaveBeenCalledOnce();
    expect(binding.assistantGenerationPresenter.refreshAvailability).toHaveBeenCalledOnce();
    expect(status.caret).toBe(source.selectionEnd);

    status.setAuthoringContext("second.md", "second", second, true);
    expect(source.value).toBe("second");
    first.insert(0, "old ");
    expect(source.value).toBe("second");
    expect(sourceChanges).toBe(1);

    second.insert(0, "new ");
    expect(source.value).toBe("new second");
    expect(sourceChanges).toBe(2);

    status.insertText(second, second.length, " owned");
    expect(source.value).toBe("new second owned");
    expect(sourceControl.focused).toBe(true);
    expect(source.selectionStart).toBe("new second owned".length);
    source.dispatchEvent(undoKey());
    expect(second.toString()).toBe("new second");
    status.insertText(first, first.length, " background");
    expect(first.toString()).toBe("old first edit background");
    expect(source.value).toBe("new second");
    const selectionChanged = vi.mocked(binding.collaboratorSelections.bindSelectionChanged).mock.calls[0]?.[0];
    selectionChanged?.();
    expect(presenceReads).toBeGreaterThan(0);
  });
});
