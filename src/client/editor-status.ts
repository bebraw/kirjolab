import { html, LitElement, type TemplateResult } from "lit";

const defaultTarget = "main.md · line 1 · caret";

export interface EditorAuthoringTarget {
  readonly start: number;
  readonly end: number;
}

export class EditorStatus extends LitElement {
  static override properties = {
    save: { state: true },
    target: { state: true },
  };

  declare private save: string;
  declare protected target: string;

  constructor() {
    super();
    this.save = "Opening…";
    this.target = defaultTarget;
  }

  setSave(save: string): void {
    this.save = save;
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
