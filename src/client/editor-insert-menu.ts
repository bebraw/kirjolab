import { html, LitElement, type TemplateResult } from "lit";
import { relativeProjectPath, type ProjectFile } from "../domain/project-files";

export type EditorInsertAction =
  | { readonly action: "include-file"; readonly path: string; readonly relativePath: string }
  | { readonly action: "syntax"; readonly kind: EditorSyntaxKind };

export type EditorSyntaxKind = "anchor" | "bibliography" | "citation" | "footnote" | "link" | "reference";

export const editorInsertActionEvent = "editor-insert-action";

interface EditorInsertData {
  readonly activeFile: ProjectFile | null;
  readonly files: readonly ProjectFile[];
}

const syntaxOptions: readonly { readonly kind: EditorSyntaxKind; readonly label: string; readonly syntax: string }[] = [
  { kind: "citation", label: "Citation", syntax: ":cite[key]" },
  { kind: "reference", label: "Cross-reference", syntax: ":ref[target]" },
  { kind: "anchor", label: "Anchor", syntax: "{#label}" },
  { kind: "footnote", label: "Footnote", syntax: "[^note]" },
  { kind: "link", label: "Link", syntax: "[text](url)" },
  { kind: "bibliography", label: "Bibliography", syntax: "::bibliography[]" },
];

export class EditorInsertMenu extends LitElement {
  static override properties = { data: { state: true } };

  declare private data: EditorInsertData;

  constructor() {
    super();
    this.data = { activeFile: null, files: [] };
  }

  setFiles(activeFile: ProjectFile | null, files: readonly ProjectFile[]): void {
    this.data = { activeFile, files };
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const activeFile = this.data.activeFile;
    const includable = activeFile ? this.data.files.filter((file) => file.id !== activeFile.id) : [];
    return html`<details class="action-menu ui-menu" id="editor-insert-menu" data-action-menu>
      <summary class="button-secondary">Insert</summary>
      <div class="editor-command-menu ui-menu-panel">
        ${syntaxOptions.map(
          ({ kind, label, syntax }) =>
            html`<button type="button" data-insert-syntax=${kind} @click=${() => this.selectSyntax(kind)}>
              <strong>${label}</strong><code>${syntax}</code>
            </button>`,
        )}
        <div class="border-t border-app-line pt-1" id="include-project-file-list" aria-label="Include project file">
          ${includable.length > 0
            ? includable.map((file) => this.renderFile(file, activeFile!))
            : html`<span class="block px-3 py-2 text-xs text-app-text-soft">Add another file to include it here.</span>`}
        </div>
      </div>
    </details>`;
  }

  protected emitAction(action: EditorInsertAction): void {
    this.dispatchEvent(new CustomEvent<EditorInsertAction>(editorInsertActionEvent, { bubbles: true, detail: action }));
    if (typeof this.querySelector === "function") this.querySelector<HTMLDetailsElement>("details")?.removeAttribute("open");
  }

  private selectSyntax(kind: EditorSyntaxKind): void {
    this.emitAction({ action: "syntax", kind });
  }

  private renderFile(file: ProjectFile, activeFile: ProjectFile): TemplateResult {
    const relativePath = relativeProjectPath(activeFile.path, file.path);
    return html`<button
      type="button"
      data-include-file-id=${file.id}
      title=${`Insert ::include[${relativePath}]`}
      @click=${() => this.emitAction({ action: "include-file", path: file.path, relativePath })}
    >
      <strong title=${file.path}>${file.path}</strong><code>::include[…]</code>
    </button>`;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("editor-insert-menu")) {
  customElements.define("editor-insert-menu", EditorInsertMenu);
}

declare global {
  interface HTMLElementTagNameMap {
    "editor-insert-menu": EditorInsertMenu;
  }
}
