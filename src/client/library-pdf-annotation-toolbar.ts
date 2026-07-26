import { html, LitElement, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { renderIcon, type IconName } from "../ui/icons";
import type { PdfAnnotationTool } from "./library-pdf-markup-layer";

export type LibraryPdfToolbarAction =
  | { readonly action: "choose-tool"; readonly tool: PdfAnnotationTool }
  | { readonly action: "undo-drawing" | "export-annotated" | "open-inspector" };

export const libraryPdfToolbarActionEvent = "library-pdf-toolbar-action";

export class LibraryPdfAnnotationToolbar extends LitElement {
  static override properties = {
    tool: { state: true },
    drawingColor: { state: true },
    drawingWidth: { state: true },
    undoAvailable: { state: true },
    exportAvailable: { state: true },
    annotationCount: { state: true },
    inspectorOpen: { state: true },
  };

  declare private tool: PdfAnnotationTool;
  declare private drawingColor: string;
  declare private drawingWidth: number;
  declare private undoAvailable: boolean;
  declare private exportAvailable: boolean;
  declare private annotationCount: number;
  declare private inspectorOpen: boolean;

  constructor() {
    super();
    this.tool = "text";
    this.drawingColor = "#d33f49";
    this.drawingWidth = 4;
    this.undoAvailable = false;
    this.exportAvailable = false;
    this.annotationCount = 0;
    this.inspectorOpen = false;
  }

  get drawingStyle(): { readonly color: string; readonly width: number } {
    return { color: this.drawingColor, width: this.drawingWidth };
  }

  setTool(tool: PdfAnnotationTool): string {
    this.tool = tool;
    return toolStatus[tool];
  }

  setAnnotationAvailability(count: number, drawingCount: number): void {
    this.annotationCount = count;
    this.exportAvailable = count > 0;
    this.undoAvailable = drawingCount > 0;
  }

  setUndoAvailable(available: boolean): void {
    this.undoAvailable = available;
  }

  setInspectorOpen(open: boolean): void {
    this.inspectorOpen = open;
  }

  focusInspectorButton(): void {
    void this.updateComplete.then(() => this.querySelector<HTMLButtonElement>("#open-library-pdf-inspector")?.focus());
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
      <div class="library-pdf-annotation-tools" role="toolbar" aria-label="PDF annotation tools">
        ${this.toolButton("select", "Select, edit, move, or delete an existing annotation")}
        ${this.toolButton("text", "Select text and save a quotation")} ${this.toolButton("note", "Tap the page to attach a private note")}
        <div class="library-draw-rail-control">
          ${this.toolButton("draw", "Draw directly on the page with Apple Pencil or a mouse")}
          <div class="library-ink-options" id="library-ink-options" role="group" aria-label="Drawing style" ?hidden=${this.tool !== "draw"}>
            <label class="library-ink-color-control" title="Ink color"
              ><span class="sr-only">Ink color</span
              ><input id="library-draw-color" type="color" .value=${this.drawingColor} @input=${this.updateDrawingColor}
            /></label>
            <label class="library-width-control" title="Ink width"
              ><span class="sr-only">Ink width</span
              ><input
                id="library-draw-width"
                type="range"
                min="1"
                max="24"
                aria-orientation="vertical"
                .value=${String(this.drawingWidth)}
                @input=${this.updateDrawingWidth}
              /><output id="library-draw-width-value" for="library-draw-width">${this.drawingWidth}</output></label
            >
            <button
              class="library-pdf-rail-button library-undo-drawing button-icon"
              id="undo-library-drawing"
              type="button"
              ?disabled=${!this.undoAvailable}
              title="Remove the latest drawing on this page"
              @click=${() => this.emitAction({ action: "undo-drawing" })}
            >
              ${icon("undo")}<span class="sr-only">Undo latest drawing</span>
            </button>
          </div>
        </div>
        <span class="library-pdf-rail-divider" aria-hidden="true"></span>
        <button
          class="library-pdf-rail-button button-icon"
          id="export-library-annotated-pdf"
          type="button"
          ?disabled=${!this.exportAvailable}
          title="Download a copy with private notes and ink"
          data-touch-target="true"
          @click=${() => this.emitAction({ action: "export-annotated" })}
        >
          ${icon("download")}<span class="sr-only">Export annotated</span>
        </button>
        <button
          class="library-pdf-rail-button library-pdf-annotations-button button-icon"
          id="open-library-pdf-inspector"
          type="button"
          aria-label="Annotations"
          aria-expanded=${String(this.inspectorOpen)}
          aria-controls="library-highlight-composer"
          title="Open annotations"
          data-touch-target="true"
          @click=${() => this.emitAction({ action: "open-inspector" })}
        >
          ${icon("annotations")}<span class="sr-only">Annotations</span
          ><span class="count-badge" id="library-highlight-count">${this.annotationCount}</span>
        </button>
      </div>
    `;
  }

  protected chooseTool(tool: PdfAnnotationTool): void {
    this.emitAction({ action: "choose-tool", tool });
  }

  protected updateDrawingColor(event: Event): void {
    this.drawingColor = inputValue(event);
  }

  protected updateDrawingWidth(event: Event): void {
    this.drawingWidth = Number(inputValue(event));
  }

  protected emitAction(action: LibraryPdfToolbarAction): void {
    this.dispatchEvent(new CustomEvent(libraryPdfToolbarActionEvent, { detail: action }));
  }

  private toolButton(tool: PdfAnnotationTool, title: string): TemplateResult {
    return html`
      <button
        class="library-pdf-rail-button button-icon"
        id=${`library-${tool}-tool`}
        type="button"
        aria-pressed=${String(this.tool === tool)}
        title=${title}
        data-touch-target="true"
        @click=${() => this.chooseTool(tool)}
      >
        ${icon(tool)}<span class="sr-only">${tool === "text" ? "Text" : `${tool[0]?.toUpperCase()}${tool.slice(1)}`}</span>
      </button>
    `;
  }
}

function icon(name: IconName) {
  return unsafeHTML(renderIcon(name));
}

function inputValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value;
}

const toolStatus: Readonly<Record<PdfAnnotationTool, string>> = {
  select: "Tap an existing highlight, line, or note to edit it. Drag a selected note to move it.",
  text: "Select text to highlight.",
  note: "Tap the page to place a note.",
  draw: "Draw with Apple Pencil or a mouse. Touch gestures pan and zoom.",
};

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-annotation-toolbar")) {
  customElements.define("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-annotation-toolbar": LibraryPdfAnnotationToolbar;
  }
}
