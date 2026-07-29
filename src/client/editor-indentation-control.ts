import { html, type TemplateResult } from "lit";

import { LightDomElement } from "./light-dom-controller";

export type EditorIndentationStyle = "spaces" | "tabs";

export interface EditorIndentationPreferences {
  readonly style: EditorIndentationStyle;
  readonly tabSize: number;
}

export interface EditorIndentationSnapshot {
  readonly selectionDirection: "backward" | "forward" | "none";
  readonly selectionEnd: number;
  readonly selectionStart: number;
  readonly value: string;
}

const storageKey = "kirjolab:editor-indentation";
const minimumTabSize = 1;
const maximumTabSize = 8;

export const defaultEditorIndentation: EditorIndentationPreferences = {
  style: "spaces",
  tabSize: 2,
};

export class EditorIndentationControl extends LightDomElement {
  static override properties = { preferences: { state: true } };

  declare private preferences: EditorIndentationPreferences;
  private shell: HTMLElement | undefined;
  private textarea: HTMLTextAreaElement | undefined;

  constructor() {
    super();
    this.preferences = defaultEditorIndentation;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.preferences = restoreEditorIndentation();
    super.connectedCallback();
  }

  // Called through the editor's light-DOM owner registry.
  // fallow-ignore-next-line unused-class-member
  bindEditor(textarea: HTMLTextAreaElement, shell: HTMLElement): void {
    this.unbindEditor();
    this.textarea = textarea;
    this.shell = shell;
    this.preferences = restoreEditorIndentation();
    this.applyTabSize();
    textarea.addEventListener("keydown", this.handleKey);
  }

  override disconnectedCallback(): void {
    this.unbindEditor();
    super.disconnectedCallback();
  }

  protected override render(): TemplateResult {
    return html`
      <section class="preferences-section" aria-labelledby="indentation-preference-heading">
        <div>
          <h3 id="indentation-preference-heading">Indentation</h3>
          <p>Choose what Tab inserts in the source editor.</p>
        </div>
        <div class="preferences-indentation-controls">
          <label class="field-label"
            >Insert
            <select class="field" id="editor-indentation-style" .value=${this.preferences.style} @change=${this.changeStyle}>
              <option value="spaces">Spaces</option>
              <option value="tabs">Tabs</option>
            </select>
          </label>
          <label class="field-label"
            >Tab size
            <input
              class="field"
              id="editor-tab-size"
              type="number"
              min=${String(minimumTabSize)}
              max=${String(maximumTabSize)}
              step="1"
              .value=${String(this.preferences.tabSize)}
              @change=${this.changeTabSize}
            />
          </label>
        </div>
      </section>
    `;
  }

  private readonly changeStyle = (event: Event): void => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) return;
    this.updatePreferences({ ...this.preferences, style: target.value === "tabs" ? "tabs" : "spaces" });
  };

  private readonly changeTabSize = (event: Event): void => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    const tabSize = boundedTabSize(Number(target.value));
    target.value = String(tabSize);
    this.updatePreferences({ ...this.preferences, tabSize });
  };

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (
      !this.textarea ||
      event.key !== "Tab" ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const vimMode = this.shell?.dataset.vimMode;
    if (vimMode && vimMode !== "off" && vimMode !== "insert") return;

    event.preventDefault();
    event.stopPropagation();
    const edit = applyEditorIndentation(
      {
        value: this.textarea.value,
        selectionStart: this.textarea.selectionStart,
        selectionEnd: this.textarea.selectionEnd,
        selectionDirection: this.textarea.selectionDirection,
      },
      this.preferences,
      event.shiftKey,
    );
    this.textarea.value = edit.value;
    this.textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd, edit.selectionDirection);
    this.textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  };

  protected updatePreferences(preferences: EditorIndentationPreferences): void {
    this.preferences = preferences;
    localStorage.setItem(storageKey, JSON.stringify(preferences));
    this.applyTabSize();
  }

  private applyTabSize(): void {
    if (this.textarea) this.textarea.style.tabSize = String(this.preferences.tabSize);
  }

  private unbindEditor(): void {
    this.textarea?.removeEventListener("keydown", this.handleKey);
    this.textarea = undefined;
    this.shell = undefined;
  }
}

export function applyEditorIndentation(
  snapshot: EditorIndentationSnapshot,
  preferences: EditorIndentationPreferences,
  outdent = false,
): EditorIndentationSnapshot {
  if (outdent) return outdentLines(snapshot, preferences.tabSize);
  if (snapshot.selectionStart !== snapshot.selectionEnd) return indentLines(snapshot, indentationUnit(preferences));

  const text = indentationAtCaret(snapshot, preferences);
  return {
    value: `${snapshot.value.slice(0, snapshot.selectionStart)}${text}${snapshot.value.slice(snapshot.selectionEnd)}`,
    selectionStart: snapshot.selectionStart + text.length,
    selectionEnd: snapshot.selectionStart + text.length,
    selectionDirection: snapshot.selectionDirection,
  };
}

function indentationAtCaret(snapshot: EditorIndentationSnapshot, preferences: EditorIndentationPreferences): string {
  if (preferences.style === "tabs") return "\t";
  const lineStart = snapshot.value.lastIndexOf("\n", snapshot.selectionStart - 1) + 1;
  const column = Array.from(snapshot.value.slice(lineStart, snapshot.selectionStart)).reduce(
    (current, character) => (character === "\t" ? current + preferences.tabSize - (current % preferences.tabSize) : current + 1),
    0,
  );
  return " ".repeat(preferences.tabSize - (column % preferences.tabSize));
}

function indentationUnit(preferences: EditorIndentationPreferences): string {
  return preferences.style === "tabs" ? "\t" : " ".repeat(preferences.tabSize);
}

function indentLines(snapshot: EditorIndentationSnapshot, unit: string): EditorIndentationSnapshot {
  const starts = selectedLineStarts(snapshot);
  let value = snapshot.value;
  for (const start of [...starts].reverse()) value = `${value.slice(0, start)}${unit}${value.slice(start)}`;
  const adjust = (position: number): number => position + starts.filter((start) => start <= position).length * unit.length;
  return {
    value,
    selectionStart: adjust(snapshot.selectionStart),
    selectionEnd: adjust(snapshot.selectionEnd),
    selectionDirection: snapshot.selectionDirection,
  };
}

function outdentLines(snapshot: EditorIndentationSnapshot, tabSize: number): EditorIndentationSnapshot {
  const removals = selectedLineStarts(snapshot)
    .map((start) => ({ start, count: indentationRemoval(snapshot.value, start, tabSize) }))
    .filter(({ count }) => count > 0);
  let value = snapshot.value;
  for (const removal of [...removals].reverse()) {
    value = `${value.slice(0, removal.start)}${value.slice(removal.start + removal.count)}`;
  }
  const adjust = (position: number): number => {
    let removed = 0;
    for (const removal of removals) {
      if (position <= removal.start) break;
      if (position <= removal.start + removal.count) return removal.start - removed;
      removed += removal.count;
    }
    return position - removed;
  };
  return {
    value,
    selectionStart: adjust(snapshot.selectionStart),
    selectionEnd: adjust(snapshot.selectionEnd),
    selectionDirection: snapshot.selectionDirection,
  };
}

function selectedLineStarts(snapshot: EditorIndentationSnapshot): readonly number[] {
  const first = snapshot.value.lastIndexOf("\n", snapshot.selectionStart - 1) + 1;
  const last =
    snapshot.selectionEnd > snapshot.selectionStart && snapshot.value[snapshot.selectionEnd - 1] === "\n"
      ? snapshot.selectionEnd - 1
      : snapshot.selectionEnd;
  const starts = [first];
  let newline = snapshot.value.indexOf("\n", first);
  while (newline >= 0 && newline + 1 <= last) {
    starts.push(newline + 1);
    newline = snapshot.value.indexOf("\n", newline + 1);
  }
  return starts;
}

function indentationRemoval(value: string, start: number, tabSize: number): number {
  if (value[start] === "\t") return 1;
  let count = 0;
  while (count < tabSize && value[start + count] === " ") count += 1;
  return count;
}

function restoreEditorIndentation(): EditorIndentationPreferences {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return defaultEditorIndentation;
  try {
    const candidate: unknown = JSON.parse(stored);
    if (!candidate || typeof candidate !== "object") return defaultEditorIndentation;
    const record = candidate as Record<string, unknown>;
    return {
      style: record.style === "tabs" ? "tabs" : "spaces",
      tabSize: boundedTabSize(record.tabSize),
    };
  } catch {
    return defaultEditorIndentation;
  }
}

function boundedTabSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultEditorIndentation.tabSize;
  return Math.min(maximumTabSize, Math.max(minimumTabSize, Math.round(value)));
}

if (typeof customElements !== "undefined" && !customElements.get("editor-indentation-control")) {
  customElements.define("editor-indentation-control", EditorIndentationControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "editor-indentation-control": EditorIndentationControl;
  }
}
