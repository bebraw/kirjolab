import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindYText, captureRelativeSelection, positionSourceCompletion, resolveRelativeSelection } from "./source-editor-adapter";

class FakeClassList {
  readonly values = new Set<string>();

  toggle(name: string, force: boolean): void {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }
}

class FakeElement extends EventTarget {
  readonly attributes = new Map<string, string>();
  readonly children: unknown[] = [];
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  className = "";
  textContent = "";
  title = "";
  hidden = false;
  focused = false;
  removed = false;
  parentElement: FakeElement | null = null;
  clientWidth = 240;
  clientHeight = 120;
  offsetWidth = 80;
  offsetHeight = 24;
  offsetLeft = 40;
  offsetTop = 30;
  scrollLeft = 0;
  scrollTop = 0;

  append(...nodes: unknown[]): void {
    for (const node of nodes) {
      this.children.push(node);
      if (node instanceof FakeElement) node.parentElement = this;
    }
  }

  replaceChildren(...nodes: unknown[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  focus(): void {
    this.focused = true;
  }

  remove(): void {
    this.removed = true;
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

class TestInputEvent extends Event {
  readonly inputType: string;

  constructor(type: string, init: InputEventInit = {}) {
    super(type, init);
    this.inputType = init.inputType ?? "";
  }
}

function keyboard(key: string, overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return Object.assign(new Event("keydown", { cancelable: true }), {
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    key,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }) as KeyboardEvent;
}

const textareaElement = (textarea: FakeTextarea): HTMLTextAreaElement => textarea as never;
const htmlElement = (element: FakeElement): HTMLElement => element as never;

describe("source editor adapter", () => {
  beforeEach(() => {
    const body = new FakeElement();
    vi.stubGlobal("document", {
      body,
      createDocumentFragment: () => new FakeElement(),
      createElement: () => new FakeElement(),
      createTextNode: (value: string) => ({ textContent: value }),
    });
    vi.stubGlobal("getComputedStyle", () => ({
      border: "1px solid",
      boxSizing: "border-box",
      font: "16px monospace",
      letterSpacing: "0px",
      lineHeight: "20px",
      overflowWrap: "break-word",
      padding: "8px",
      tabSize: "4",
    }));
    vi.stubGlobal("InputEvent", TestInputEvent);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("binds textarea input, remote Yjs edits, history, highlighting, scrolling, and teardown", () => {
    const documentModel = new Y.Doc();
    const text = documentModel.getText("source");
    text.insert(0, "# A\nB");
    const textarea = new FakeTextarea();
    textarea.value = text.toString();
    textarea.setSelectionRange(2, 4);
    const highlight = new FakeElement();
    const undoManager = new Y.UndoManager(text, { trackedOrigins: new Set([textareaElement(textarea)]) });
    const binding = bindYText(
      textareaElement(textarea),
      text,
      documentModel,
      htmlElement(highlight),
      () => [
        { collaboratorId: "local", start: 0, end: 0, local: true },
        { collaboratorId: "remote", start: 2, end: 5 },
      ],
      undoManager,
    );
    expect(highlight.children).toHaveLength(1);

    textarea.scrollTop = 12;
    textarea.scrollLeft = 4;
    textarea.dispatchEvent(new Event("scroll"));
    expect(highlight.scrollTop).toBe(12);

    textarea.value = "# AB";
    textarea.dispatchEvent(new Event("input"));
    expect(text.toString()).toBe("# AB");
    documentModel.transact(() => text.insert(4, " remote"), "remote");
    expect(textarea.value).toBe("# AB remote");
    expect(textarea.selectionEnd).toBe(4);

    textarea.dispatchEvent(keyboard("z", { metaKey: true }));
    expect(text.toString()).toBe("# A\nB remote");
    textarea.dispatchEvent(new TestInputEvent("beforeinput", { inputType: "historyRedo", cancelable: true }));
    expect(textarea.focused).toBe(true);
    binding.renderHighlight();
    binding.destroy();
    textarea.value = "detached";
    textarea.dispatchEvent(new Event("input"));
    expect(text.toString()).not.toBe("detached");
  });

  it("captures collapsed and ranged selections as relative Yjs anchors", () => {
    const documentModel = new Y.Doc();
    const text = documentModel.getText("source");
    text.insert(0, "evidence");
    const textarea = new FakeTextarea();
    textarea.setSelectionRange(2, 2, "none");
    const collapsed = captureRelativeSelection(textareaElement(textarea), text);
    textarea.setSelectionRange(1, 5, "backward");
    const ranged = captureRelativeSelection(textareaElement(textarea), text);
    expect(collapsed.direction).toBe("none");
    expect(ranged.direction).toBe("backward");
    expect(Y.createAbsolutePositionFromRelativePosition(ranged.start, documentModel)?.index).toBe(1);
    expect(Y.createAbsolutePositionFromRelativePosition(ranged.end, documentModel)?.index).toBe(5);
  });

  it("resolves relative selections only while both anchors belong to their text", () => {
    const documentModel = new Y.Doc();
    const text = documentModel.getText("source");
    text.insert(0, "evidence");
    const textarea = new FakeTextarea();
    textarea.setSelectionRange(1, 5, "backward");
    const selection = captureRelativeSelection(textareaElement(textarea), text);

    text.insert(0, "new ");
    expect(resolveRelativeSelection(documentModel, selection)).toEqual({ start: 5, end: 9 });

    const otherDocument = new Y.Doc();
    expect(resolveRelativeSelection(otherDocument, selection)).toBeNull();
  });

  it("positions completion within its editor shell", () => {
    const textarea = new FakeTextarea();
    textarea.value = "citation";
    textarea.scrollLeft = 2;
    textarea.scrollTop = 3;
    textarea.parentElement = Object.assign(new FakeElement(), { clientWidth: 180, clientHeight: 90 });
    const completion = Object.assign(new FakeElement(), { offsetWidth: 70, offsetHeight: 30 });
    positionSourceCompletion(textareaElement(textarea), htmlElement(completion), 4);
    expect(completion.style.left).toBe("38px");
    expect(completion.style.top).toBe("51px");
    expect((document.body as never as FakeElement).children).toHaveLength(1);
  });
});
