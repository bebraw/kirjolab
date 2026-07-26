import { html, LitElement, nothing, type TemplateResult } from "lit";
import {
  citationCompletionContext,
  rankCitationCompletionCandidates,
  type CitationCompletionCandidate,
  type CitationCompletionContext,
} from "./citation-completions";
import {
  includeCompletionContext,
  rankIncludeCompletionCandidates,
  type IncludeCompletionCandidate,
  type IncludeCompletionContext,
} from "./include-completions";
import { positionSourceCompletion } from "./source-editor-adapter";

export type SourceCompletionIntent =
  | { readonly kind: "citation"; readonly context: CitationCompletionContext; readonly candidate: CitationCompletionCandidate }
  | { readonly kind: "include"; readonly context: IncludeCompletionContext; readonly candidate: IncludeCompletionCandidate };

export interface SourceCompletionOption {
  readonly action?: string;
  readonly intent: SourceCompletionIntent;
  readonly metadata: string;
  readonly value: string;
}

export type CitationCompletionScope = "library" | "project";

export interface SourceCompletionInputs {
  readonly citations: readonly CitationCompletionCandidate[];
  readonly includes: readonly IncludeCompletionCandidate[];
  readonly workspace: boolean;
}

export type SourceCompletionAction =
  | { readonly action: "accept"; readonly intent: SourceCompletionIntent }
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

  showIncludes(candidates: readonly IncludeCompletionCandidate[], context: IncludeCompletionContext, source: HTMLTextAreaElement): void {
    this.present(
      rankIncludeCompletionCandidates(candidates, context.query).map((candidate) => ({
        value: candidate.reference,
        metadata: `Project file · ${candidate.path}`,
        intent: { kind: "include", context, candidate },
      })),
      source,
      context.start,
    );
  }

  showCitations(candidates: readonly CitationCompletionCandidate[], context: CitationCompletionContext, source: HTMLTextAreaElement): void {
    this.present(
      rankCitationCompletionCandidates(candidates, context.query).map((candidate) => ({
        value: candidate.key,
        metadata: [candidate.authors.join("; "), candidate.title, candidate.year].filter(Boolean).join(" · "),
        ...(candidate.scope === "library" ? { action: "Add and cite" } : {}),
        intent: { kind: "citation", context, candidate },
      })),
      source,
      context.start,
    );
  }

  refresh(inputs: SourceCompletionInputs): boolean {
    const source = this.source;
    if (!source || !inputs.workspace || document.activeElement !== source) {
      this.hide();
      return false;
    }
    const includeContext = includeCompletionContext(source.value, source.selectionEnd);
    if (includeContext) {
      this.showIncludes(inputs.includes, includeContext, source);
      return false;
    }
    const citationContext = citationCompletionContext(source.value, source.selectionEnd);
    if (!citationContext) {
      this.hide();
      return false;
    }
    const libraryScope = this.scope === "library";
    this.showCitations(inputs.citations, citationContext, source);
    return libraryScope;
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
      this.accept(this.selectedIndex);
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
          @click=${() => this.accept(index)}
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

  protected position(source: HTMLTextAreaElement, start: number): void {
    positionSourceCompletion(source, this, start);
  }

  private present(options: readonly SourceCompletionOption[], source: HTMLTextAreaElement, start: number): void {
    if (options.length === 0) {
      this.hide();
      return;
    }
    this.show(options, source);
    this.position(source, start);
  }

  private accept(index: number): void {
    const option = this.options[index];
    if (option) this.emitAction({ action: "accept", intent: option.intent });
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
