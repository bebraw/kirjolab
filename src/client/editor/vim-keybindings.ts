export type VimMode = "insert" | "normal" | "visual";

export interface VimEditorSnapshot {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly selectionDirection: "forward" | "backward" | "none";
}

export interface VimSession {
  readonly mode: VimMode;
  readonly pending: "d" | "y" | "c" | "g" | null;
  readonly count: string;
  readonly register: { readonly text: string; readonly linewise: boolean };
}

export interface VimCommandResult extends VimEditorSnapshot {
  readonly session: VimSession;
  readonly handled: boolean;
  readonly changed: boolean;
}

interface TextRange {
  readonly start: number;
  readonly end: number;
}

const wordCharacter = /[\p{L}\p{N}_]/u;

export function createVimSession(mode: VimMode = "normal"): VimSession {
  return { mode, pending: null, count: "", register: { text: "", linewise: false } };
}

export function handleVimKey(session: VimSession, editor: VimEditorSnapshot, key: string): VimCommandResult {
  if (session.mode === "insert") {
    if (key !== "Escape" && key !== "Ctrl-[") return result(session, editor, false, false);
    const line = lineAt(editor.value, editor.selectionStart);
    const cursor = Math.max(line.start, editor.selectionStart - 1);
    return selection({ ...session, mode: "normal", pending: null, count: "" }, editor.value, cursor);
  }

  if (/^[1-9]$/u.test(key) || (key === "0" && session.count)) {
    return result({ ...session, count: `${session.count}${key}` }, editor, true, false);
  }

  if (session.mode === "visual") return handleVisualKey(session, editor, key);
  if (session.pending) return handlePendingKey(session, editor, key);

  const count = commandCount(session);
  const reset = { ...session, count: "", pending: null };
  const cursor = editor.selectionStart;
  const line = lineAt(editor.value, cursor);

  if (key === "i") return selection({ ...reset, mode: "insert" }, editor.value, cursor);
  if (key === "a") return selection({ ...reset, mode: "insert" }, editor.value, Math.min(cursor + 1, line.end));
  if (key === "I") return selection({ ...reset, mode: "insert" }, editor.value, firstNonWhitespace(editor.value, line));
  if (key === "A") return selection({ ...reset, mode: "insert" }, editor.value, line.end);
  if (key === "o") return openLine(reset, editor, false);
  if (key === "O") return openLine(reset, editor, true);
  if (key === "v") return visualSelection({ ...reset, mode: "visual" }, editor.value, cursor, cursor);
  if (key === "d" || key === "y" || key === "c" || key === "g") {
    return result({ ...session, pending: key, count: session.count }, editor, true, false);
  }
  if (key === "x" || key === "Delete") return deleteForward(reset, editor, count);
  if (key === "X") return deleteBackward(reset, editor, count);
  if (key === "D") {
    const register = { text: editor.value.slice(cursor, line.end), linewise: false };
    return replaceRange({ ...reset, register }, editor, { start: cursor, end: line.end }, "", cursor);
  }
  if (key === "p" || key === "P") return paste(reset, editor, key === "P", count);
  if (key === "Escape") return selection(reset, editor.value, cursor);
  if (key === "G") {
    const targetLine = session.count ? count : lineStarts(editor.value).length;
    return selection(reset, editor.value, lineStartByNumber(editor.value, targetLine));
  }

  const moved = moveCursor(editor.value, cursor, key, count);
  return moved === null ? result(session, editor, key.length === 1, false) : selection(reset, editor.value, moved);
}

export function visualVimSession(session: VimSession): VimSession {
  return { ...session, mode: "visual", pending: null, count: "" };
}

function handlePendingKey(session: VimSession, editor: VimEditorSnapshot, key: string): VimCommandResult {
  const pending = session.pending;
  const count = commandCount(session);
  const reset = { ...session, pending: null, count: "" };
  if (pending === "g" && key === "g") return selection(reset, editor.value, lineStartByNumber(editor.value, count));
  if (key !== pending || pending === "g") return result(reset, editor, true, false);

  const range = lineRange(editor.value, editor.selectionStart, count);
  const text = linewiseText(editor.value.slice(range.start, range.end));
  if (pending === "y") {
    return selection({ ...reset, register: { text, linewise: true } }, editor.value, editor.selectionStart);
  }
  const register = { text, linewise: true };
  if (pending === "c") {
    const replacement = editor.value[range.end - 1] === "\n" ? "\n" : "";
    return replaceRange({ ...reset, mode: "insert", register }, editor, range, replacement, range.start);
  }
  const deletion =
    range.end === editor.value.length && range.start > 0 && !editor.value.endsWith("\n")
      ? { start: range.start - 1, end: range.end }
      : range;
  return replaceRange({ ...reset, mode: "normal", register }, editor, deletion, "", deletion.start);
}

function handleVisualKey(session: VimSession, editor: VimEditorSnapshot, key: string): VimCommandResult {
  const count = commandCount(session);
  const reset = { ...session, count: "", pending: null };
  const { anchor, cursor } = visualEnds(editor);
  if (key === "Escape") return selection({ ...reset, mode: "normal" }, editor.value, cursor);
  if (key === "d" || key === "x" || key === "c" || key === "y") {
    const range = { start: Math.min(anchor, cursor), end: Math.min(editor.value.length, Math.max(anchor, cursor) + 1) };
    const register = { text: editor.value.slice(range.start, range.end), linewise: false };
    if (key === "y") return selection({ ...reset, mode: "normal", register }, editor.value, range.start);
    return replaceRange({ ...reset, mode: key === "c" ? "insert" : "normal", register }, editor, range, "", range.start);
  }
  const moved = moveCursor(editor.value, cursor, key, count);
  return moved === null ? result(session, editor, key.length === 1, false) : visualSelection(reset, editor.value, anchor, moved);
}

function moveCursor(value: string, cursor: number, key: string, count: number): number | null {
  const mapped = { ArrowLeft: "h", ArrowDown: "j", ArrowUp: "k", ArrowRight: "l", Home: "0", End: "$" }[key] ?? key;
  let next = cursor;
  for (let step = 0; step < count; step += 1) {
    const line = lineAt(value, next);
    if (mapped === "h") next = Math.max(line.start, next - 1);
    else if (mapped === "l") next = Math.min(Math.max(line.start, line.end - 1), next + 1);
    else if (mapped === "j" || mapped === "k") next = moveVertical(value, next, mapped === "j" ? 1 : -1);
    else if (mapped === "w") next = nextWord(value, next);
    else if (mapped === "b") next = previousWord(value, next);
    else if (mapped === "e") next = endWord(value, next);
    else if (mapped === "0") next = line.start;
    else if (mapped === "$") next = Math.max(line.start, line.end - 1);
    else return null;
  }
  return next;
}

function openLine(session: VimSession, editor: VimEditorSnapshot, before: boolean): VimCommandResult {
  const line = lineAt(editor.value, editor.selectionStart);
  const at = before ? line.start : line.endWithBreak;
  const cursor = before ? at : at + (line.endWithBreak === line.end ? 1 : 0);
  return replaceRange({ ...session, mode: "insert" }, editor, { start: at, end: at }, "\n", cursor);
}

function deleteForward(session: VimSession, editor: VimEditorSnapshot, count: number): VimCommandResult {
  const line = lineAt(editor.value, editor.selectionStart);
  const end = Math.min(line.end, editor.selectionStart + count);
  const register = { text: editor.value.slice(editor.selectionStart, end), linewise: false };
  return replaceRange({ ...session, register }, editor, { start: editor.selectionStart, end }, "", editor.selectionStart);
}

function deleteBackward(session: VimSession, editor: VimEditorSnapshot, count: number): VimCommandResult {
  const line = lineAt(editor.value, editor.selectionStart);
  const start = Math.max(line.start, editor.selectionStart - count);
  const register = { text: editor.value.slice(start, editor.selectionStart), linewise: false };
  return replaceRange({ ...session, register }, editor, { start, end: editor.selectionStart }, "", start);
}

function paste(session: VimSession, editor: VimEditorSnapshot, before: boolean, count: number): VimCommandResult {
  const register = session.register;
  if (!register.text) return result(session, editor, true, false);
  const text = register.text.repeat(count);
  if (!register.linewise) {
    const at = before ? editor.selectionStart : Math.min(editor.value.length, editor.selectionStart + 1);
    return replaceRange(session, editor, { start: at, end: at }, text, at + text.length - 1);
  }
  const line = lineAt(editor.value, editor.selectionStart);
  if (before) return replaceRange(session, editor, { start: line.start, end: line.start }, text, line.start);
  const prefix = line.endWithBreak === line.end ? "\n" : "";
  return replaceRange(
    session,
    editor,
    { start: line.endWithBreak, end: line.endWithBreak },
    `${prefix}${text}`,
    line.endWithBreak + prefix.length,
  );
}

function replaceRange(
  session: VimSession,
  editor: VimEditorSnapshot,
  range: TextRange,
  replacement: string,
  cursor: number,
): VimCommandResult {
  const value = `${editor.value.slice(0, range.start)}${replacement}${editor.value.slice(range.end)}`;
  return { ...selection(session, value, Math.min(cursor, value.length)), handled: true, changed: value !== editor.value };
}

function selection(session: VimSession, value: string, cursor: number): VimCommandResult {
  const at = Math.max(0, Math.min(cursor, value.length));
  return { session, value, selectionStart: at, selectionEnd: at, selectionDirection: "none", handled: true, changed: false };
}

function visualSelection(session: VimSession, value: string, anchor: number, cursor: number): VimCommandResult {
  const boundedAnchor = Math.max(0, Math.min(anchor, Math.max(0, value.length - 1)));
  const boundedCursor = Math.max(0, Math.min(cursor, Math.max(0, value.length - 1)));
  const backward = boundedCursor < boundedAnchor;
  return {
    session,
    value,
    selectionStart: Math.min(boundedAnchor, boundedCursor),
    selectionEnd: Math.min(value.length, Math.max(boundedAnchor, boundedCursor) + 1),
    selectionDirection: backward ? "backward" : "forward",
    handled: true,
    changed: false,
  };
}

function result(session: VimSession, editor: VimEditorSnapshot, handled: boolean, changed: boolean): VimCommandResult {
  return { ...editor, session, handled, changed };
}

function commandCount(session: VimSession): number {
  return session.count ? Math.min(999, Math.max(1, Number(session.count))) : 1;
}

function visualEnds(editor: VimEditorSnapshot): { anchor: number; cursor: number } {
  return editor.selectionDirection === "backward"
    ? { anchor: Math.max(editor.selectionStart, editor.selectionEnd - 1), cursor: editor.selectionStart }
    : { anchor: editor.selectionStart, cursor: Math.max(editor.selectionStart, editor.selectionEnd - 1) };
}

function lineAt(value: string, cursor: number): { start: number; end: number; endWithBreak: number } {
  const bounded = Math.max(0, Math.min(cursor, value.length));
  const start = value.lastIndexOf("\n", Math.max(0, bounded - 1)) + 1;
  const newline = value.indexOf("\n", bounded);
  const end = newline === -1 ? value.length : newline;
  return { start, end, endWithBreak: newline === -1 ? end : end + 1 };
}

function lineRange(value: string, cursor: number, count: number): TextRange {
  const first = lineAt(value, cursor);
  let end = first.endWithBreak;
  for (let index = 1; index < count && end < value.length; index += 1) end = lineAt(value, end).endWithBreak;
  return { start: first.start, end };
}

function linewiseText(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function firstNonWhitespace(value: string, line: ReturnType<typeof lineAt>): number {
  const match = /\S/u.exec(value.slice(line.start, line.end));
  return line.start + (match?.index ?? 0);
}

function lineStarts(value: string): readonly number[] {
  const starts = [0];
  for (let index = value.indexOf("\n"); index !== -1; index = value.indexOf("\n", index + 1)) starts.push(index + 1);
  return starts;
}

function lineStartByNumber(value: string, number: number): number {
  const starts = lineStarts(value);
  return starts[Math.max(0, Math.min(number - 1, starts.length - 1))] ?? 0;
}

function moveVertical(value: string, cursor: number, delta: number): number {
  const starts = lineStarts(value);
  let lineIndex = 0;
  for (let index = 1; index < starts.length && (starts[index] ?? value.length + 1) <= cursor; index += 1) lineIndex = index;
  const currentStart = starts[lineIndex] ?? 0;
  const targetStart = starts[Math.max(0, Math.min(lineIndex + delta, starts.length - 1))] ?? currentStart;
  const target = lineAt(value, targetStart);
  return Math.min(target.end, targetStart + (cursor - currentStart));
}

function nextWord(value: string, cursor: number): number {
  let index = Math.min(value.length, cursor + 1);
  while (index < value.length && wordCharacter.test(value[index] ?? "")) index += 1;
  while (index < value.length && !wordCharacter.test(value[index] ?? "")) index += 1;
  return index;
}

function previousWord(value: string, cursor: number): number {
  let index = Math.max(0, cursor - 1);
  while (index > 0 && !wordCharacter.test(value[index] ?? "")) index -= 1;
  while (index > 0 && wordCharacter.test(value[index - 1] ?? "")) index -= 1;
  return index;
}

function endWord(value: string, cursor: number): number {
  let index = cursor;
  while (index < value.length && !wordCharacter.test(value[index] ?? "")) index += 1;
  while (index + 1 < value.length && wordCharacter.test(value[index + 1] ?? "")) index += 1;
  return index;
}
