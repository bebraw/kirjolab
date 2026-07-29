import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyEditorIndentation,
  defaultEditorIndentation,
  EditorIndentationControl,
  type EditorIndentationSnapshot,
} from "./editor-indentation-control";

const snapshot = (value: string, selectionStart: number, selectionEnd = selectionStart): EditorIndentationSnapshot => ({
  value,
  selectionStart,
  selectionEnd,
  selectionDirection: "none",
});

class FakeElement extends EventTarget {
  readonly dataset: Record<string, string> = {};
}

class FakeTextarea extends FakeElement {
  readonly style = { tabSize: "" };
  value = "alpha";
  selectionStart = 0;
  selectionEnd = 0;
  selectionDirection: "backward" | "forward" | "none" = "none";

  setSelectionRange(start: number, end: number, direction: "backward" | "forward" | "none" = "none"): void {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.selectionDirection = direction;
  }
}

class TestInputEvent extends Event {
  constructor(type: string, init: InputEventInit = {}) {
    super(type, init);
  }
}

class TestEditorIndentationControl extends EditorIndentationControl {
  setPreferencesForTest(style: "spaces" | "tabs", tabSize: number): void {
    this.updatePreferences({ style, tabSize });
  }
}

function keyboard(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return Object.assign(new Event("keydown", { cancelable: true }), {
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    key: "Tab",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }) as KeyboardEvent;
}

describe("editor indentation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to two spaces and advances to the next tab stop", () => {
    expect(defaultEditorIndentation).toEqual({ style: "spaces", tabSize: 2 });
    expect(applyEditorIndentation(snapshot("abc", 3), defaultEditorIndentation)).toEqual(snapshot("abc ", 4));
    expect(applyEditorIndentation(snapshot("abcd", 4), defaultEditorIndentation)).toEqual(snapshot("abcd  ", 6));
    expect(applyEditorIndentation(snapshot("\talpha", 2), defaultEditorIndentation)).toEqual(snapshot("\ta lpha", 3));
  });

  it("can insert literal tabs", () => {
    expect(applyEditorIndentation(snapshot("alpha", 0), { style: "tabs", tabSize: 4 })).toEqual(snapshot("\talpha", 1));
  });

  it("indents and outdents selected lines", () => {
    const indented = applyEditorIndentation(snapshot("one\ntwo\nthree", 1, 7), { style: "spaces", tabSize: 2 });
    expect(indented).toEqual(snapshot("  one\n  two\nthree", 3, 11));
    expect(applyEditorIndentation(indented, { style: "spaces", tabSize: 2 }, true)).toEqual(snapshot("one\ntwo\nthree", 1, 7));
  });

  it("outdents the current line without moving before its content", () => {
    expect(applyEditorIndentation(snapshot("  alpha", 1), defaultEditorIndentation, true)).toEqual(snapshot("alpha", 0));
    expect(applyEditorIndentation(snapshot("\talpha", 3), defaultEditorIndentation, true)).toEqual(snapshot("alpha", 2));
  });

  it("restores preferences and yields to autocomplete and Vim normal mode", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("InputEvent", TestInputEvent);
    vi.stubGlobal("HTMLSelectElement", class {});
    vi.stubGlobal("HTMLInputElement", class {});
    values.set("kirjolab:editor-indentation", JSON.stringify({ style: "tabs", tabSize: 4 }));
    const textarea = new FakeTextarea();
    const shell = new FakeElement();
    const control = new TestEditorIndentationControl();
    control.bindEditor(textarea as never, shell as never);
    expect(control.value).toEqual({ style: "tabs", tabSize: 4 });
    expect(textarea.style.tabSize).toBe("4");
    control.setPreferencesForTest("spaces", 2);
    expect(values.get("kirjolab:editor-indentation")).toBe(JSON.stringify({ style: "spaces", tabSize: 2 }));
    expect(textarea.style.tabSize).toBe("2");

    const acceptedCompletion = keyboard();
    acceptedCompletion.preventDefault();
    textarea.dispatchEvent(acceptedCompletion);
    expect(textarea.value).toBe("alpha");

    shell.dataset.vimMode = "normal";
    textarea.dispatchEvent(keyboard());
    expect(textarea.value).toBe("alpha");

    control.setPreferencesForTest("tabs", 4);
    shell.dataset.vimMode = "insert";
    textarea.dispatchEvent(keyboard());
    expect(textarea.value).toBe("\talpha");

    control.disconnectedCallback();
    textarea.dispatchEvent(keyboard());
    expect(textarea.value).toBe("\talpha");
  });
});
