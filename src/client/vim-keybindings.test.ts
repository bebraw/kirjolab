import { describe, expect, it } from "vitest";
import { createVimSession, handleVimKey, visualVimSession, type VimEditorSnapshot, type VimSession } from "./vim-keybindings";

const editor = (value: string, at = 0, end = at, direction: VimEditorSnapshot["selectionDirection"] = "none"): VimEditorSnapshot => ({
  value,
  selectionStart: at,
  selectionEnd: end,
  selectionDirection: direction,
});

function keys(value: string, sequence: readonly string[], at = 0): ReturnType<typeof handleVimKey> {
  let session: VimSession = createVimSession();
  let state = { ...editor(value, at), session, handled: false, changed: false };
  for (const key of sequence) {
    state = handleVimKey(session, state, key);
    session = state.session;
  }
  return state;
}

describe("Vim textarea keybindings", () => {
  it("creates explicit empty Normal and Insert sessions", () => {
    expect(createVimSession()).toEqual({ mode: "normal", pending: null, count: "", register: { text: "", linewise: false } });
    expect(createVimSession("insert")).toEqual({ mode: "insert", pending: null, count: "", register: { text: "", linewise: false } });
  });

  it("moves by character, line, word, document, and counts", () => {
    const value = "one two\nthree four\nfive";
    expect(keys(value, ["l", "l"]).selectionStart).toBe(2);
    expect(keys(value, ["2", "w"]).selectionStart).toBe(8);
    expect(keys(value, ["e"]).selectionStart).toBe(2);
    expect(keys(value, ["$", "j"]).selectionStart).toBe(14);
    expect(keys(value, ["G"]).selectionStart).toBe(19);
    expect(keys(value, ["g", "g"], 19).selectionStart).toBe(0);
    expect(keys(value, ["2", "g", "g"]).selectionStart).toBe(8);
    expect(keys(value, ["b"], 13).selectionStart).toBe(8);
    expect(keys(value, ["b"], 16).selectionStart).toBe(14);
    expect(keys(value, ["0"], 13).selectionStart).toBe(8);
  });

  it("enters and leaves insert mode at familiar positions", () => {
    const value = "  alpha\nbeta";
    expect(keys(value, ["i"], 3)).toMatchObject({ session: { mode: "insert" }, selectionStart: 3 });
    expect(keys(value, ["a"], 3)).toMatchObject({ session: { mode: "insert" }, selectionStart: 4 });
    expect(keys(value, ["I"], 3)).toMatchObject({ session: { mode: "insert" }, selectionStart: 2 });
    expect(keys(value, ["A"], 3)).toMatchObject({ session: { mode: "insert" }, selectionStart: 7 });
    expect(keys(value, ["o"], 3)).toMatchObject({ value: "  alpha\n\nbeta", selectionStart: 8, session: { mode: "insert" } });
    expect(keys(value, ["O"], 3)).toMatchObject({ value: "\n  alpha\nbeta", selectionStart: 0, session: { mode: "insert" } });
    const inserted = handleVimKey(createVimSession("insert"), editor("alpha", 4), "Escape");
    expect(inserted).toMatchObject({ selectionStart: 3, session: { mode: "normal" } });
    expect(handleVimKey(createVimSession("insert"), editor("alpha", 0), "Ctrl-[")).toEqual({
      session: createVimSession(),
      value: "alpha",
      selectionStart: 0,
      selectionEnd: 0,
      selectionDirection: "none",
      handled: true,
      changed: false,
    });
    expect(handleVimKey(createVimSession("insert"), editor("alpha", 2), "z").handled).toBe(false);
  });

  it("deletes, yanks, and pastes characterwise and linewise", () => {
    expect(keys("abcdef", ["3", "x"], 1)).toMatchObject({ value: "aef", selectionStart: 1 });
    expect(keys("abcdef", ["X"], 3)).toMatchObject({ value: "abdef", selectionStart: 2 });
    expect(keys("alpha beta", ["w", "D"])).toMatchObject({
      value: "alpha ",
      selectionStart: 6,
      session: { register: { text: "beta", linewise: false } },
    });
    expect(keys("one\ntwo\nthree", ["d", "d"], 4)).toMatchObject({ value: "one\nthree", selectionStart: 4 });
    expect(keys("one\ntwo\nthree", ["2", "d", "d"])).toMatchObject({ value: "three", selectionStart: 0 });
    expect(keys("one\ntwo", ["d", "d"], 4)).toMatchObject({ value: "one", selectionStart: 3, session: { register: { text: "two\n" } } });
    expect(keys("one\ntwo\nthree", ["c", "c"], 4)).toMatchObject({
      value: "one\n\nthree",
      selectionStart: 4,
      session: { mode: "insert", register: { text: "two\n" } },
    });

    const yanked = keys("one\ntwo", ["y", "y"]);
    const pasted = handleVimKey(yanked.session, editor(yanked.value, 4), "p");
    expect(pasted.value).toBe("one\ntwo\none\n");
    const before = handleVimKey(yanked.session, editor(yanked.value, 4), "P");
    expect(before.value).toBe("one\none\ntwo");

    const character = keys("abc", ["x"]);
    expect(handleVimKey(character.session, editor(character.value), "p")).toMatchObject({ value: "bac", selectionStart: 1 });
    expect(handleVimKey(character.session, editor(character.value), "P")).toMatchObject({ value: "abc", selectionStart: 0 });
    expect(keys("abc", ["x", "3", "p"])).toMatchObject({ value: "baaac", selectionStart: 3 });
  });

  it("supports visual motions, yank, delete, and change", () => {
    const selected = keys("alpha beta", ["v", "3", "l"]);
    expect(selected).toMatchObject({ selectionStart: 0, selectionEnd: 4, session: { mode: "visual" } });
    const yanked = handleVimKey(selected.session, selected, "y");
    expect(yanked).toMatchObject({ selectionStart: 0, selectionEnd: 0, session: { mode: "normal", register: { text: "alph" } } });
    const deleted = handleVimKey(selected.session, selected, "d");
    expect(deleted).toMatchObject({ value: "a beta", selectionStart: 0, session: { mode: "normal" } });
    const changed = handleVimKey(selected.session, selected, "c");
    expect(changed).toMatchObject({ value: "a beta", selectionStart: 0, session: { mode: "insert" } });
    expect(handleVimKey(visualVimSession(createVimSession()), editor("alpha", 1, 4, "backward"), "Escape")).toMatchObject({
      selectionStart: 1,
      session: { mode: "normal" },
    });
  });

  it("clears invalid pending commands and blocks unbound normal-mode text", () => {
    const pending = handleVimKey(createVimSession(), editor("alpha"), "d");
    expect(pending.session.pending).toBe("d");
    expect(handleVimKey(pending.session, pending, "q")).toMatchObject({ handled: true, session: { pending: null } });
    expect(handleVimKey(createVimSession(), editor("alpha"), "q").handled).toBe(true);
    expect(handleVimKey(createVimSession(), editor("alpha"), "Tab").handled).toBe(false);
    expect(handleVimKey(createVimSession(), editor("alpha", 2), "12")).toMatchObject({ handled: false, session: { count: "" } });
    expect(handleVimKey(createVimSession(), editor("alpha", 2), "0")).toMatchObject({ handled: true, selectionStart: 0 });
    expect(handleVimKey(createVimSession(), editor("alpha"), "p")).toMatchObject({ handled: true, changed: false });
  });

  it("clamps motions and edits at empty and line boundaries", () => {
    expect(keys("", ["v"])).toMatchObject({ selectionStart: 0, selectionEnd: 0, session: { mode: "visual" } });
    expect(keys("a\n\nxyz\n", ["G"])).toMatchObject({ selectionStart: 7 });
    expect(keys("a\n\nxyz", ["j", "j"])).toMatchObject({ selectionStart: 3 });
    expect(keys("a\n\nxyz", ["j", "k"])).toMatchObject({ selectionStart: 0 });
    expect(keys("abc", ["x"], 3)).toMatchObject({ value: "abc", changed: false, session: { register: { text: "" } } });
    expect(keys("abc", ["X"], 0)).toMatchObject({ value: "abc", changed: false, selectionStart: 0 });
  });

  it("preserves backward Visual direction and exact register text", () => {
    const selected = keys("alpha", ["l", "l", "v", "2", "h"]);
    expect(selected).toMatchObject({ selectionStart: 0, selectionEnd: 3, selectionDirection: "backward" });
    expect(handleVimKey(selected.session, selected, "y")).toMatchObject({
      selectionStart: 0,
      selectionEnd: 0,
      session: { mode: "normal", register: { text: "alp", linewise: false } },
    });
  });
});
