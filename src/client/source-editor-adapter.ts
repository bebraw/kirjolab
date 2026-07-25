import * as Y from "yjs";
import { calculateTextSplice } from "../domain/text";
import { editorHistoryActionForInput, editorHistoryActionForKey, type EditorHistoryAction } from "./editor-history";
import { editorPresenceSegments, type EditorPresenceRange, type EditorPresenceSegment } from "./editor-presence";
import { createVimSession, handleVimKey, visualVimSession, type VimSession } from "./vim-keybindings";

export interface RelativeEditorSelection {
  readonly text: Y.Text;
  readonly textarea: HTMLTextAreaElement;
  readonly start: Y.RelativePosition;
  readonly end: Y.RelativePosition;
  readonly direction: "forward" | "backward" | "none" | null;
}

export interface YTextBinding {
  readonly destroy: () => void;
  readonly renderHighlight: () => void;
}

type VimCommand = ReturnType<typeof handleVimKey>;

export function bindYText(
  textarea: HTMLTextAreaElement,
  text: Y.Text,
  documentModel: Y.Doc,
  highlight?: HTMLElement,
  presence: () => readonly EditorPresenceRange[] = () => [],
  undoManager?: Y.UndoManager,
): YTextBinding {
  const renderHighlight = (): void => {
    if (highlight) renderEditorHighlight(highlight, textarea.value, presence());
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
    documentModel.transact(() => {
      if (splice.deleteCount > 0) text.delete(splice.start, splice.deleteCount);
      if (splice.insert) text.insert(splice.start, splice.insert);
    }, textarea);
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

export function bindVimTextarea(textarea: HTMLTextAreaElement, shell: HTMLElement, toggle: HTMLButtonElement, status: HTMLElement): void {
  const storageKey = "kirjolab:vim-keybindings";
  let enabled = localStorage.getItem(storageKey) === "true";
  let session: VimSession = createVimSession();
  const renderMode = (): void => {
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.title = enabled ? "Disable Vim keybindings" : "Enable Vim keybindings";
    status.hidden = !enabled;
    status.textContent = session.mode.toUpperCase();
    shell.dataset.vimMode = enabled ? session.mode : "off";
  };
  const snapshot = () => ({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
    selectionDirection: textarea.selectionDirection,
  });

  toggle.addEventListener("click", () => {
    enabled = !enabled;
    localStorage.setItem(storageKey, String(enabled));
    session = createVimSession();
    if (enabled) {
      textarea.focus();
      textarea.setSelectionRange(textarea.selectionStart, textarea.selectionStart);
    }
    renderMode();
  });
  textarea.addEventListener("keydown", (event) => {
    const key = vimCommandKey(event, enabled);
    if (!key) return;
    const command = handleVimKey(session, snapshot(), key);
    if (!command.handled) return;
    event.preventDefault();
    event.stopPropagation();
    session = command.session;
    applyVimCommand(textarea, command);
    renderMode();
  });
  textarea.addEventListener("mouseup", () => {
    if (!enabled) return;
    session =
      textarea.selectionStart === textarea.selectionEnd
        ? { ...session, mode: "normal", pending: null, count: "" }
        : visualVimSession(session);
    renderMode();
  });
  renderMode();
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

function vimCommandKey(event: KeyboardEvent, enabled: boolean): string | null {
  if (!enabled || event.isComposing) return null;
  const controlBracket = event.ctrlKey && !event.altKey && !event.metaKey && event.key === "[";
  if (!controlBracket && (event.altKey || event.ctrlKey || event.metaKey)) return null;
  return controlBracket ? "Ctrl-[" : event.key;
}

function applyVimCommand(textarea: HTMLTextAreaElement, command: VimCommand): void {
  if (command.changed) textarea.value = command.value;
  textarea.setSelectionRange(command.selectionStart, command.selectionEnd, command.selectionDirection);
  if (command.changed) textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
}
