import { html, LitElement, nothing, type TemplateResult } from "lit";
import { relativeProjectPath, type ProjectFile } from "../domain/project-files";
import { isReferenceLibrarySnapshot } from "../domain/reference-library";
import {
  citationCompletionCandidates,
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
import { expectOk } from "./http";
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
type CitationCompletionReferences = NonNullable<Parameters<typeof citationCompletionCandidates>[1]>;

export interface SourceCompletionInputs {
  readonly activeFileId: string | null;
  readonly files: readonly Pick<ProjectFile, "id" | "path">[];
  readonly projectReferences: Parameters<typeof citationCompletionCandidates>[0];
  readonly workspace: boolean;
}

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
  private inputs: SourceCompletionInputs | null = null;
  private libraryReferences: CitationCompletionReferences | null | undefined = null;
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

  refresh(inputs: SourceCompletionInputs): void {
    this.inputs = inputs;
    const source = this.source;
    if (!source || !inputs.workspace || document.activeElement !== source) {
      this.hide();
      return;
    }
    const includeContext = includeCompletionContext(source.value, source.selectionEnd);
    if (includeContext) {
      const activeFile = inputs.files.find((file) => file.id === inputs.activeFileId);
      const includes = activeFile
        ? inputs.files
            .filter((file) => file.id !== activeFile.id)
            .map((file) => ({ reference: relativeProjectPath(activeFile.path, file.path), path: file.path }))
        : [];
      this.showIncludes(includes, includeContext, source);
      return;
    }
    const citationContext = citationCompletionContext(source.value, source.selectionEnd);
    if (!citationContext) {
      this.hide();
      return;
    }
    const libraryScope = this.scope === "library";
    if (libraryScope && this.libraryReferences === null) void this.loadLibrary();
    this.showCitations(
      citationCompletionCandidates(inputs.projectReferences, libraryScope ? (this.libraryReferences ?? []) : []),
      citationContext,
      source,
    );
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
      this.hide();
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

  protected emitIntent(intent: SourceCompletionIntent): void {
    this.dispatchEvent(new CustomEvent<SourceCompletionIntent>(sourceCompletionActionEvent, { bubbles: true, detail: intent }));
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
    if (option) this.emitIntent(option.intent);
  }

  private async loadLibrary(): Promise<void> {
    this.libraryReferences = undefined;
    try {
      const response = await fetch("/api/library", { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isReferenceLibrarySnapshot(value)) throw new Error("Reference library returned an invalid snapshot");
      this.libraryReferences = value.references;
      if (this.inputs) this.refresh(this.inputs);
    } catch {
      this.libraryReferences = null;
    }
  }

  private readonly handleEditorKey = (event: KeyboardEvent): void => {
    this.handleKey(event);
  };

  private readonly handleEditorBlur = (): void => {
    this.dismissTimer = window.setTimeout(() => this.hide(), 0);
  };

  private readonly handleScopeChange = (): void => {
    localStorage.setItem(scopeStorageKey, this.scope);
    if (this.inputs) this.refresh(this.inputs);
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
