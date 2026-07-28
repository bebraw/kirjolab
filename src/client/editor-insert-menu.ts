import { html, type TemplateResult } from "lit";
import { relativeProjectPath, type ProjectFile } from "../domain/project-files";
import type { AppToast } from "./app-toast";
import { LightDomElement } from "./light-dom-controller";
import type { EditorAuthoringPassage, EditorStatus, EditorTextInsertion } from "./editor-status";

export type EditorSyntaxKind = "anchor" | "bibliography" | "citation" | "footnote" | "link" | "reference";

export interface EditorSyntaxTemplate {
  readonly text: string;
  readonly select?: string;
}

export type EditorInsertion = EditorTextInsertion;

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

export class EditorInsertMenu extends LightDomElement {
  static override properties = { data: { state: true } };

  declare private data: EditorInsertData;
  private authoring: Pick<EditorStatus, "applyAuthoringInsertion" | "insertionTarget"> | null = null;
  private notices: Pick<AppToast, "show"> | null = null;

  constructor() {
    super();
    this.data = { activeFile: null, files: [] };
  }

  setFiles(activeFile: ProjectFile | null, files: readonly ProjectFile[]): void {
    this.data = { activeFile, files };
  }

  bind(authoring: Pick<EditorStatus, "applyAuthoringInsertion" | "insertionTarget">, notices: Pick<AppToast, "show">): void {
    this.authoring = authoring;
    this.notices = notices;
  }

  insert(template: EditorSyntaxTemplate, message: string): void {
    const target = this.authoring?.insertionTarget;
    if (!target) return;
    this.applyTemplate(template, target.passage, target.caret);
    this.notices?.show(message);
  }

  replacePassage(passage: EditorAuthoringPassage, text: string): void {
    this.applyTemplate({ text }, passage, passage.end);
  }

  replaceRange(start: number, end: number, text: string): void {
    const selection = start + text.length;
    this.authoring?.applyAuthoringInsertion({ end, selectionEnd: selection, selectionStart: selection, start, text });
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
    const target = this.authoring?.insertionTarget;
    if (!target) return;
    this.applyTemplate({ text: `\n::include[${relativePath}]\n` }, null, target.caret);
    this.notices?.show(`Included ${path}.`);
    this.closeMenu();
  }

  protected insertSyntax(kind: EditorSyntaxKind, template: EditorSyntaxTemplate): void {
    const target = this.authoring?.insertionTarget;
    if (!target) return;
    const resolved = kind === "link" && target.passage ? { text: `[${target.passage.excerpt}](url)`, select: "url" } : template;
    this.applyTemplate(resolved, target.passage, target.caret);
    this.notices?.show("Inserted scholarly syntax.");
    this.closeMenu();
  }

  private closeMenu(): void {
    if (typeof this.querySelector === "function") this.querySelector<HTMLDetailsElement>("details")?.removeAttribute("open");
  }

  private selectSyntax(kind: EditorSyntaxKind, template: EditorSyntaxTemplate): void {
    this.insertSyntax(kind, template);
  }

  private applyTemplate(template: EditorSyntaxTemplate, passage: EditorAuthoringPassage | null, caret: number): void {
    const start = passage?.start ?? caret;
    const end = passage?.end ?? caret;
    const selectedOffset = template.select ? template.text.indexOf(template.select) : template.text.length;
    const selectionStart = start + (selectedOffset < 0 ? template.text.length : selectedOffset);
    this.authoring?.applyAuthoringInsertion({
      end,
      selectionEnd: selectionStart + (selectedOffset < 0 ? 0 : (template.select?.length ?? 0)),
      selectionStart,
      start,
      text: template.text,
    });
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
