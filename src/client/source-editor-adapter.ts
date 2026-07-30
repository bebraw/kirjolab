import * as Y from "yjs";
import { calculateTextSplice } from "../domain/text";
import { editorHistoryActionForInput, editorHistoryActionForKey, type EditorHistoryAction } from "./editor-history";
import { editorPresenceSegments, type EditorPresenceRange, type EditorPresenceSegment } from "./editor-presence";

export interface RelativeEditorSelection {
  readonly text: Y.Text;
  readonly textarea: HTMLTextAreaElement;
  readonly start: Y.RelativePosition;
  readonly end: Y.RelativePosition;
  readonly direction: "forward" | "backward" | "none" | null;
}

export interface ResolvedEditorSelection {
  readonly start: number;
  readonly end: number;
}

export interface YTextBinding {
  readonly destroy: () => void;
  readonly renderHighlight: () => void;
}

export function replaceYTextRange(documentModel: Y.Doc, text: Y.Text, start: number, end: number, value: string, origin: unknown): void {
  documentModel.transact(() => {
    if (end > start) text.delete(start, end - start);
    if (value) text.insert(start, value);
  }, origin);
}

export function bindYText(
  textarea: HTMLTextAreaElement,
  text: Y.Text,
  documentModel: Y.Doc,
  highlight?: HTMLElement,
  presence: () => readonly EditorPresenceRange[] = () => [],
  undoManager?: Y.UndoManager,
): YTextBinding {
  let renderedPresence = "";
  let renderedSource: string | undefined;
  const renderHighlight = (): void => {
    if (!highlight) return;
    const currentPresence = presence();
    const presenceKey = JSON.stringify(currentPresence);
    if (renderedSource === textarea.value && renderedPresence === presenceKey) return;
    renderedSource = textarea.value;
    renderedPresence = presenceKey;
    renderEditorHighlight(highlight, textarea.value, currentPresence);
  };
  const syncHighlightScroll = (): void => {
    if (!highlight) return;
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  };
  const handleInput = (): void => {
    renderHighlight();
    const splice = calculateTextSplice(text.toString(), textarea.value);
    if (!splice) return;
    replaceYTextRange(documentModel, text, splice.start, splice.start + splice.deleteCount, splice.insert, textarea);
  };
  const handleText = (event: Y.YTextEvent): void => {
    if (event.transaction.origin === textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = text.toString();
    textarea.setSelectionRange(Math.min(start, textarea.value.length), Math.min(end, textarea.value.length));
    renderHighlight();
    syncHighlightScroll();
  };
  const applyHistory = (action: EditorHistoryAction): void => {
    if (!undoManager) return;
    undoManager.stopCapturing();
    if (action === "undo") undoManager.undo();
    else undoManager.redo();
    textarea.focus();
    textarea.dispatchEvent(new Event("select", { bubbles: true }));
  };
  const handleHistoryKey = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    const action = editorHistoryActionForKey(event);
    if (!action || !undoManager) return;
    event.preventDefault();
    event.stopPropagation();
    applyHistory(action);
  };
  const handleBeforeInput = (event: InputEvent): void => {
    const action = editorHistoryActionForInput(event.inputType);
    if (!action || !undoManager) return;
    event.preventDefault();
    applyHistory(action);
  };
  textarea.addEventListener("input", handleInput);
  textarea.addEventListener("keydown", handleHistoryKey);
  textarea.addEventListener("beforeinput", handleBeforeInput);
  textarea.addEventListener("scroll", syncHighlightScroll, { passive: true });
  text.observe(handleText);
  renderHighlight();
  syncHighlightScroll();
  return {
    destroy: () => {
      textarea.removeEventListener("input", handleInput);
      textarea.removeEventListener("keydown", handleHistoryKey);
      textarea.removeEventListener("beforeinput", handleBeforeInput);
      textarea.removeEventListener("scroll", syncHighlightScroll);
      text.unobserve(handleText);
    },
    renderHighlight,
  };
}

export function positionSourceCompletion(textarea: HTMLTextAreaElement, completion: HTMLElement, position: number): void {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.font = style.font;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.overflowWrap = style.overflowWrap;
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.tabSize = style.tabSize;
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);
  const lineHeight = Number.parseFloat(style.lineHeight) || 24;
  const shellWidth = textarea.parentElement?.clientWidth ?? textarea.clientWidth;
  const shellHeight = textarea.parentElement?.clientHeight ?? textarea.clientHeight;
  const left = Math.max(8, Math.min(marker.offsetLeft - textarea.scrollLeft, shellWidth - completion.offsetWidth - 8));
  const below = marker.offsetTop - textarea.scrollTop + lineHeight + 4;
  const top = Math.max(8, Math.min(below, shellHeight - completion.offsetHeight - 8));
  completion.style.left = `${left}px`;
  completion.style.top = `${top}px`;
  mirror.remove();
}

export function captureRelativeSelection(textarea: HTMLTextAreaElement, text: Y.Text): RelativeEditorSelection {
  const collapsed = textarea.selectionStart === textarea.selectionEnd;
  return {
    text,
    textarea,
    start: Y.createRelativePositionFromTypeIndex(text, textarea.selectionStart, collapsed ? -1 : 0),
    end: Y.createRelativePositionFromTypeIndex(text, textarea.selectionEnd, -1),
    direction: textarea.selectionDirection,
  };
}

export function resolveRelativeSelection(documentModel: Y.Doc, selection: RelativeEditorSelection): ResolvedEditorSelection | null {
  const start = Y.createAbsolutePositionFromRelativePosition(selection.start, documentModel);
  const end = Y.createAbsolutePositionFromRelativePosition(selection.end, documentModel);
  if (!start || !end || start.type !== selection.text || end.type !== selection.text) return null;
  return { start: Math.min(start.index, end.index), end: Math.max(start.index, end.index) };
}

function renderEditorHighlight(highlight: HTMLElement, source: string, presence: readonly EditorPresenceRange[]): void {
  const fragment = document.createDocumentFragment();
  const state = { lineNumber: 1, line: sourceEditorLine(1) };
  fragment.append(state.line);
  for (const segment of editorPresenceSegments(source, presence)) appendEditorPresenceSegment(fragment, state, segment);
  highlight.replaceChildren(fragment);
}

function appendEditorPresenceSegment(
  fragment: DocumentFragment,
  state: { lineNumber: number; line: HTMLSpanElement },
  segment: EditorPresenceSegment,
): void {
  appendEditorCarets(state.line, segment.caretColors);
  for (const part of segment.text.split(/(\r\n|\r|\n)/u).filter(Boolean)) {
    if (/^(?:\r\n|\r|\n)$/u.test(part)) {
      state.line.append(editorNewline(part));
      state.lineNumber += 1;
      state.line = sourceEditorLine(state.lineNumber);
      fragment.append(state.line);
    } else {
      state.line.append(editorPresencePart(part, segment));
    }
  }
}

function appendEditorCarets(line: HTMLElement, colors: EditorPresenceSegment["caretColors"]): void {
  for (const color of colors) {
    const caret = document.createElement("span");
    caret.className = color === "local" ? "local-author-caret" : "collaborator-caret";
    caret.dataset.collaboratorColor = String(color);
    line.append(caret);
  }
}

function editorNewline(value: string): HTMLSpanElement {
  const newline = document.createElement("span");
  newline.className = "source-editor-newline";
  newline.textContent = value;
  return newline;
}

function editorPresencePart(value: string, segment: EditorPresenceSegment): Node {
  if (segment.kind === null && segment.selectionColor === null) return document.createTextNode(value);
  const token = document.createElement("span");
  token.classList.toggle(`markdown-token-${segment.kind}`, segment.kind !== null);
  token.classList.toggle("collaborator-selection", segment.selectionColor !== null && segment.selectionColor !== "local");
  token.classList.toggle("local-author-selection", segment.selectionColor === "local");
  if (segment.selectionColor !== null) token.dataset.collaboratorColor = String(segment.selectionColor);
  token.textContent = value;
  return token;
}

function sourceEditorLine(lineNumber: number): HTMLSpanElement {
  const line = document.createElement("span");
  line.className = "source-editor-line";
  line.dataset.lineNumber = String(lineNumber);
  return line;
}
