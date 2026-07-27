import { html, LitElement, type TemplateResult } from "lit";
import * as Y from "yjs";
import {
  captureRelativeSelection,
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

export class EditorStatus extends LitElement {
  static override properties = {
    save: { state: true },
    target: { state: true },
  };

  declare private save: string;
  declare protected target: string;
  private documentModel: Y.Doc | null = null;
  private fileId: string | null = null;
  private path = "Manuscript";
  private selection: RelativeEditorSelection | null = null;
  private source: HTMLTextAreaElement | null = null;
  private text: Y.Text | null = null;
  private targetChanged: (() => void) | null = null;

  constructor() {
    super();
    this.save = "Opening…";
    this.target = defaultTarget;
  }

  setSave(save: string): void {
    this.save = save;
  }

  bindAuthoring(documentModel: Y.Doc, source: HTMLTextAreaElement, targetChanged: () => void): void {
    this.documentModel = documentModel;
    this.source = source;
    this.targetChanged = targetChanged;
  }

  setAuthoringContext(path: string, fileId: string | null, text: Y.Text, reset = false): void {
    const resetSelection = reset || this.text !== text;
    this.path = path;
    this.fileId = fileId;
    this.text = text;
    if (resetSelection) {
      this.selection = null;
      this.source?.setSelectionRange(0, 0);
      this.rememberSelection();
    } else this.refreshAuthoringTarget();
  }

  rememberSelection(): void {
    this.selection = this.source && this.text ? captureRelativeSelection(this.source, this.text) : null;
    this.refreshAuthoringTarget();
  }

  selectRange(start: number, end = start): void {
    this.source?.setSelectionRange(start, end);
    this.rememberSelection();
  }

  refreshAuthoringTarget(): void {
    this.setAuthoringTarget(this.path, this.text?.toString() ?? "", this.authoringTarget);
    this.targetChanged?.();
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
