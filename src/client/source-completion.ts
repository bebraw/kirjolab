import { html, LitElement, nothing, type TemplateResult } from "lit";

export interface SourceCompletionOption {
  readonly action?: string;
  readonly metadata: string;
  readonly value: string;
}

export type CitationCompletionScope = "library" | "project";

export type SourceCompletionAction =
  | { readonly action: "accept"; readonly index: number }
  | { readonly action: "dismiss" }
  | { readonly action: "scope-change"; readonly scope: CitationCompletionScope };

export const sourceCompletionActionEvent = "source-completion-action";
const scopeStorageKey = "kirjolab:citation-completion-scope";

export class SourceCompletion extends LitElement {
  static override properties = {
    options: { state: true },
    selectedIndex: { state: true },
  };

  declare private options: readonly SourceCompletionOption[];
  declare private selectedIndex: number;
  private source: HTMLTextAreaElement | null = null;
  private scopeSelect: HTMLSelectElement | null = null;
  private dismissTimer: number | undefined;

  constructor() {
    super();
    this.options = [];
    this.selectedIndex = 0;
  }

  get scope(): CitationCompletionScope {
    return this.scopeSelect?.value === "library" ? "library" : "project";
  }

  bindEditor(source: HTMLTextAreaElement, scopeSelect: HTMLSelectElement): void {
    this.unbindEditor();
    this.source = source;
    this.scopeSelect = scopeSelect;
    scopeSelect.value = localStorage.getItem(scopeStorageKey) === "library" ? "library" : "project";
    source.addEventListener("keydown", this.handleEditorKey);
    source.addEventListener("blur", this.handleEditorBlur);
    scopeSelect.addEventListener("change", this.handleScopeChange);
  }

  show(options: readonly SourceCompletionOption[], source: HTMLTextAreaElement): void {
    this.options = options;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, options.length - 1));
    this.source = source;
    this.hidden = false;
    source.setAttribute("aria-expanded", "true");
  }

  hide(): void {
    this.options = [];
    this.selectedIndex = 0;
    this.hidden = true;
    this.source?.setAttribute("aria-expanded", "false");
    this.source?.removeAttribute("aria-activedescendant");
  }

  handleKey(event: KeyboardEvent): boolean {
    if (this.hidden || this.options.length === 0 || event.isComposing) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      this.selectedIndex = (this.selectedIndex + direction + this.options.length) % this.options.length;
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      this.emitAction({ action: "accept", index: this.selectedIndex });
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.emitAction({ action: "dismiss" });
      return true;
    }
    return false;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  override disconnectedCallback(): void {
    this.unbindEditor();
    super.disconnectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`${this.options.map(
      (option, index) =>
        html`<button
          class="source-completion-option"
          id=${`source-completion-option-${index}`}
          type="button"
          role="option"
          aria-selected=${String(index === this.selectedIndex)}
          @pointerdown=${(event: PointerEvent) => event.preventDefault()}
          @click=${() => this.emitAction({ action: "accept", index })}
          @mousemove=${() => {
            this.selectedIndex = index;
          }}
        >
          <span class="source-completion-heading">
            <code>${option.value}</code>
            ${option.action ? html`<span class="source-completion-action">${option.action}</span>` : nothing}
          </span>
          <span class="source-completion-meta">${option.metadata}</span>
        </button>`,
    )}`;
  }

  protected override updated(): void {
    const selected = this.querySelector<HTMLElement>(`#source-completion-option-${this.selectedIndex}`);
    if (!selected || !this.source) return;
    this.source.setAttribute("aria-activedescendant", selected.id);
    selected.scrollIntoView({ block: "nearest" });
  }

  protected emitAction(action: SourceCompletionAction): void {
    this.dispatchEvent(new CustomEvent<SourceCompletionAction>(sourceCompletionActionEvent, { bubbles: true, detail: action }));
  }

  private readonly handleEditorKey = (event: KeyboardEvent): void => {
    this.handleKey(event);
  };

  private readonly handleEditorBlur = (): void => {
    this.dismissTimer = window.setTimeout(() => this.emitAction({ action: "dismiss" }), 0);
  };

  private readonly handleScopeChange = (): void => {
    const scope = this.scope;
    localStorage.setItem(scopeStorageKey, scope);
    this.emitAction({ action: "scope-change", scope });
  };

  private unbindEditor(): void {
    this.source?.removeEventListener("keydown", this.handleEditorKey);
    this.source?.removeEventListener("blur", this.handleEditorBlur);
    this.scopeSelect?.removeEventListener("change", this.handleScopeChange);
    if (this.dismissTimer !== undefined) window.clearTimeout(this.dismissTimer);
    this.dismissTimer = undefined;
    this.source = null;
    this.scopeSelect = null;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("source-completion")) {
  customElements.define("source-completion", SourceCompletion);
}

declare global {
  interface HTMLElementTagNameMap {
    "source-completion": SourceCompletion;
  }
}
