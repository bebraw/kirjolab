import { describe, expect, it } from "vitest";
import { editorHistoryActionForInput, editorHistoryActionForKey, type EditorHistoryKey } from "./editor-history";

const key = (value: string, overrides: Partial<EditorHistoryKey> = {}): EditorHistoryKey => ({
  key: value,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...overrides,
});

describe("editor history shortcuts", () => {
  it("maps platform undo and redo shortcuts", () => {
    expect(editorHistoryActionForKey(key("z", { metaKey: true }))).toBe("undo");
    expect(editorHistoryActionForKey(key("Z", { ctrlKey: true }))).toBe("undo");
    expect(editorHistoryActionForKey(key("z", { metaKey: true, shiftKey: true }))).toBe("redo");
    expect(editorHistoryActionForKey(key("z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(editorHistoryActionForKey(key("y", { ctrlKey: true }))).toBe("redo");
  });

  it("leaves unrelated and alternate browser shortcuts alone", () => {
    expect(editorHistoryActionForKey(key("z"))).toBeNull();
    expect(editorHistoryActionForKey(key("z", { altKey: true, metaKey: true }))).toBeNull();
    expect(editorHistoryActionForKey(key("y", { metaKey: true }))).toBeNull();
    expect(editorHistoryActionForKey(key("y", { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(editorHistoryActionForKey(key("a", { ctrlKey: true }))).toBeNull();
  });

  it("maps browser and operating-system history input events", () => {
    expect(editorHistoryActionForInput("historyUndo")).toBe("undo");
    expect(editorHistoryActionForInput("historyRedo")).toBe("redo");
    expect(editorHistoryActionForInput("insertText")).toBeNull();
  });
});
