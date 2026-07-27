import { html, LitElement, type TemplateResult } from "lit";
import { relativeProjectPath, type ProjectFile } from "../domain/project-files";

export type EditorSyntaxKind = "anchor" | "bibliography" | "citation" | "footnote" | "link" | "reference";

export interface EditorSyntaxTemplate {
  readonly text: string;
  readonly select?: string;
}

export interface EditorInsertBinding {
  readonly includeFile: (relativePath: string, path: string) => void;
  readonly insertSyntax: (kind: EditorSyntaxKind, template: EditorSyntaxTemplate) => void;
}

interface EditorInsertData {
  readonly activeFile: ProjectFile | null;
  readonly files: readonly ProjectFile[];
}

const syntaxOptions: readonly { readonly kind: EditorSyntaxKind; readonly label: string; readonly template: EditorSyntaxTemplate }[] = [
  { kind: "citation", label: "Citation", template: { text: ":cite[key]", select: "key" } },
  { kind: "reference", label: "Cross-reference", template: { text: ":ref[target]", select: "target" } },
  { kind: "anchor", label: "Anchor", template: { text: "{#label}", select: "label" } },
  { kind: "footnote", label: "Footnote", template: { text: "[^note]", select: "note" } },
  { kind: "link", label: "Link", template: { text: "[text](url)", select: "text" } },
  { kind: "bibliography", label: "Bibliography", template: { text: "::bibliography[]" } },
];

export class EditorInsertMenu extends LitElement {
  static override properties = { data: { state: true } };

  declare private data: EditorInsertData;
  private binding: EditorInsertBinding | null = null;

  constructor() {
    super();
    this.data = { activeFile: null, files: [] };
  }

  setFiles(activeFile: ProjectFile | null, files: readonly ProjectFile[]): void {
    this.data = { activeFile, files };
  }

  bind(binding: EditorInsertBinding): void {
    this.binding = binding;
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
          ({ kind, label, template }) =>
            html`<button type="button" data-insert-syntax=${kind} @click=${() => this.selectSyntax(kind, template)}>
              <strong>${label}</strong><code>${template.text}</code>
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

  protected includeFile(relativePath: string, path: string): void {
    this.binding?.includeFile(relativePath, path);
    this.closeMenu();
  }

  protected insertSyntax(kind: EditorSyntaxKind, template: EditorSyntaxTemplate): void {
    this.binding?.insertSyntax(kind, template);
    this.closeMenu();
  }

  private closeMenu(): void {
    if (typeof this.querySelector === "function") this.querySelector<HTMLDetailsElement>("details")?.removeAttribute("open");
  }

  private selectSyntax(kind: EditorSyntaxKind, template: EditorSyntaxTemplate): void {
    this.insertSyntax(kind, template);
  }

  private renderFile(file: ProjectFile, activeFile: ProjectFile): TemplateResult {
    const relativePath = relativeProjectPath(activeFile.path, file.path);
    return html`<button
      type="button"
      data-include-file-id=${file.id}
      title=${`Insert ::include[${relativePath}]`}
      @click=${() => this.includeFile(relativePath, file.path)}
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
