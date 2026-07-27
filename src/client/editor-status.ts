import { html, LitElement, type TemplateResult } from "lit";
import * as Y from "yjs";
import type { EditorPresenceRange } from "./editor-presence";
import {
  bindYText,
  captureRelativeSelection,
  replaceYTextRange,
  resolveRelativeSelection,
  type RelativeEditorSelection,
  type ResolvedEditorSelection,
} from "./source-editor-adapter";

const defaultTarget = "main.md · line 1 · caret";

export interface EditorAuthoringTarget {
  readonly start: number;
  readonly end: number;
}

export interface EditorAuthoringPassage extends EditorAuthoringTarget {
  readonly excerpt: string;
  readonly fileId: string;
}

export interface EditorTextInsertion {
  readonly end: number;
  readonly selectionEnd: number;
  readonly selectionStart: number;
  readonly start: number;
  readonly text: string;
}

export interface EditorSelectionSource {
  readonly source: HTMLTextAreaElement;
  readonly text: Y.Text;
}

export interface EditorAuthoringBinding {
  readonly highlight: HTMLElement;
  readonly presence: (fileId: string | null) => readonly EditorPresenceRange[];
  readonly sourceChanged: () => void;
  readonly targetChanged: () => void;
}

export class EditorStatus extends LitElement {
  static override properties = {
    save: { state: true },
    target: { state: true },
  };

  declare private save: string;
  declare protected target: string;
  private binding: EditorAuthoringBinding | null = null;
  private documentModel: Y.Doc | null = null;
  private fileId: string | null = null;
  private path = "Manuscript";
  private releaseText: () => void = () => undefined;
  private renderEditorHighlight: () => void = () => undefined;
  private selection: RelativeEditorSelection | null = null;
  private source: HTMLTextAreaElement | null = null;
  private text: Y.Text | null = null;
  private readonly undoManagers = new Map<Y.Text, Y.UndoManager>();

  constructor() {
    super();
    this.save = "Opening…";
    this.target = defaultTarget;
  }

  setSave(save: string): void {
    this.save = save;
  }

  bindAuthoring(documentModel: Y.Doc, source: HTMLTextAreaElement, binding: EditorAuthoringBinding): void {
    this.binding = binding;
    this.documentModel = documentModel;
    this.source = source;
    if (this.text) this.bindText(this.text);
  }

  setAuthoringContext(path: string, fileId: string | null, text: Y.Text, reset = false): void {
    const resetSelection = reset || this.text !== text;
    const textChanged = this.text !== text;
    this.path = path;
    this.fileId = fileId;
    this.text = text;
    if (resetSelection) {
      this.selection = null;
      if (this.source) this.source.value = text.toString();
      this.source?.setSelectionRange(0, 0);
    }
    if (textChanged) this.bindText(text);
    if (resetSelection) this.rememberSelection();
    else this.refreshAuthoringTarget();
  }

  rememberSelection(): void {
    this.selection = this.source && this.text ? captureRelativeSelection(this.source, this.text) : null;
    this.refreshAuthoringTarget();
  }

  selectRange(start: number, end = start): void {
    this.source?.setSelectionRange(start, end);
    this.rememberSelection();
  }

  applyInsertion(text: Y.Text, insertion: EditorTextInsertion): void {
    const documentModel = this.documentModel;
    if (!documentModel) return;
    replaceYTextRange(documentModel, text, insertion.start, insertion.end, insertion.text, this);
    if (text !== this.text) return;
    this.source?.focus();
    this.selectRange(insertion.selectionStart, insertion.selectionEnd);
  }

  insertText(text: Y.Text, index: number, value: string, caret = index + value.length): void {
    this.applyInsertion(text, { end: index, selectionEnd: caret, selectionStart: caret, start: index, text: value });
  }

  preserveInsertionPoint(): ((value: string) => boolean) | null {
    const text = this.text;
    const caret = this.source?.selectionEnd;
    if (!text || caret === undefined) return null;
    const resolveRange = this.preserveRange(caret, caret);
    if (!resolveRange) return null;
    return (value) => {
      const range = resolveRange();
      if (!range) return false;
      this.insertText(text, range.end, value);
      return true;
    };
  }

  preserveSelections(companions: readonly EditorSelectionSource[] = []): () => void {
    const active = this.source && this.text ? [{ source: this.source, text: this.text }] : [];
    const selections = [...active, ...companions].map(({ source, text }) => captureRelativeSelection(source, text));
    return () => {
      const documentModel = this.documentModel;
      if (!documentModel) return;
      for (const selection of selections) {
        const resolved = resolveRelativeSelection(documentModel, selection);
        if (resolved) selection.textarea.setSelectionRange(resolved.start, resolved.end, selection.direction ?? undefined);
      }
      if (document.activeElement === this.source) this.rememberSelection();
      else this.refreshAuthoringTarget();
    };
  }

  preserveRange(start: number, end: number): (() => EditorAuthoringTarget | null) | null {
    const documentModel = this.documentModel;
    const text = this.text;
    if (!documentModel || !text) return null;
    const relativeStart = Y.createRelativePositionFromTypeIndex(text, start);
    const relativeEnd = Y.createRelativePositionFromTypeIndex(text, end);
    return () => {
      if (this.documentModel !== documentModel || this.text !== text) return null;
      const resolvedStart = Y.createAbsolutePositionFromRelativePosition(relativeStart, documentModel);
      const resolvedEnd = Y.createAbsolutePositionFromRelativePosition(relativeEnd, documentModel);
      return resolvedStart?.type === text && resolvedEnd?.type === text ? { start: resolvedStart.index, end: resolvedEnd.index } : null;
    };
  }

  refreshAuthoringTarget(): void {
    this.setAuthoringTarget(this.path, this.text?.toString() ?? "", this.authoringTarget);
    this.renderEditorHighlight();
    this.binding?.targetChanged();
  }

  renderHighlight(): void {
    this.renderEditorHighlight();
  }

  get authoringTarget(): ResolvedEditorSelection | null {
    if (!this.documentModel || !this.selection) return null;
    return resolveRelativeSelection(this.documentModel, this.selection);
  }

  get caret(): number | null {
    return this.authoringTarget?.end ?? null;
  }

  selectedPassage(): EditorAuthoringPassage | null {
    const source = this.source;
    const text = this.text;
    const documentModel = this.documentModel;
    if (!source || !text || !documentModel || !this.fileId) return null;
    const live = source.selectionStart !== source.selectionEnd;
    const selection = live ? captureRelativeSelection(source, text) : this.selection;
    if (!selection) return null;
    const resolved = resolveRelativeSelection(documentModel, selection);
    if (!resolved || resolved.start === resolved.end) return null;
    const excerpt = text.toString().slice(resolved.start, resolved.end);
    return excerpt.trim() ? { fileId: this.fileId, ...resolved, excerpt } : null;
  }

  setAuthoringTarget(path: string, source: string, target: EditorAuthoringTarget | null): void {
    if (!target) {
      this.target = `${path} · no target`;
      return;
    }
    const startLine = lineNumberAt(source, target.start);
    const endLine = lineNumberAt(source, target.end);
    const location = startLine === endLine ? `line ${startLine}` : `lines ${startLine}–${endLine}`;
    const selection = target.start === target.end ? "caret" : `${target.end - target.start} characters selected`;
    this.target = `${path} · ${location} · ${selection}`;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
      <p class="editor-target-status" id="editor-target-status" title=${this.target}>${this.target}</p>
      <p class="text-xs text-app-text-soft" id="save-status">${this.save}</p>
    `;
  }

  private bindText(text: Y.Text): void {
    const documentModel = this.documentModel;
    const source = this.source;
    const binding = this.binding;
    if (!documentModel || !source || !binding) return;
    this.releaseText();
    text.observe(binding.sourceChanged);
    let undoManager = this.undoManagers.get(text);
    if (!undoManager) {
      undoManager = new Y.UndoManager(text, { trackedOrigins: new Set([source, this]) });
      this.undoManagers.set(text, undoManager);
    }
    const textBinding = bindYText(source, text, documentModel, binding.highlight, () => this.editorPresence(), undoManager);
    this.renderEditorHighlight = textBinding.renderHighlight;
    this.releaseText = () => {
      textBinding.destroy();
      text.unobserve(binding.sourceChanged);
    };
  }

  private editorPresence(): readonly EditorPresenceRange[] {
    const target = this.authoringTarget;
    const local: readonly EditorPresenceRange[] = target
      ? [{ collaboratorId: "local-author", start: target.start, end: target.end, local: true }]
      : [];
    return [...local, ...(this.binding?.presence(this.fileId) ?? [])];
  }
}

function lineNumberAt(source: string, offset: number): number {
  return source.slice(0, Math.max(0, Math.min(offset, source.length))).split(/\r\n|\r|\n/u).length;
}

if (typeof customElements !== "undefined" && !customElements.get("editor-status")) {
  customElements.define("editor-status", EditorStatus);
}

declare global {
  interface HTMLElementTagNameMap {
    "editor-status": EditorStatus;
  }
}
