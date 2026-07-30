import { html, type TemplateResult } from "lit";
import { LightDomElement } from "../platform/light-dom-controller";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { LibraryPdfDrawing } from "../../domain/reference-library";
import { renderIcon, type IconName } from "../../ui/icons";
import { errorMessage, expectOk } from "../platform/http";
import type { PdfAnnotationTool } from "./library-pdf-markup-layer";

export type LibraryPdfToolbarAction =
  | { readonly action: "choose-tool"; readonly tool: PdfAnnotationTool }
  | { readonly action: "drawing-undone" | "open-inspector" | "open-references" }
  | { readonly action: "export-status"; readonly message: string };

export const libraryPdfToolbarActionEvent = "library-pdf-toolbar-action";

type UndoDrawing = Pick<LibraryPdfDrawing, "createdAt" | "id" | "referenceId">;

export class LibraryPdfAnnotationToolbar extends LightDomElement {
  static override properties = {
    tool: { state: true },
    drawingColor: { state: true },
    drawingWidth: { state: true },
    undoing: { state: true },
    undoStatus: { state: true },
    exporting: { state: true },
    annotationCount: { state: true },
    inspectorOpen: { state: true },
    inspectorPanel: { state: true },
  };

  declare private tool: PdfAnnotationTool;
  declare private drawingColor: string;
  declare private drawingWidth: number;
  declare private undoing: boolean;
  declare private undoStatus: string;
  declare private exporting: boolean;
  declare private annotationCount: number;
  declare private inspectorOpen: boolean;
  declare private inspectorPanel: "annotations" | "references";
  private undoTarget: Pick<UndoDrawing, "id" | "referenceId"> | null = null;
  private exportTarget: { readonly id: string; readonly name: string } | null = null;

  constructor() {
    super();
    this.tool = "text";
    this.drawingColor = "#d33f49";
    this.drawingWidth = 4;
    this.undoing = false;
    this.undoStatus = "";
    this.exporting = false;
    this.annotationCount = 0;
    this.inspectorOpen = false;
    this.inspectorPanel = "annotations";
  }

  get drawingStyle(): { readonly color: string; readonly width: number } {
    return { color: this.drawingColor, width: this.drawingWidth };
  }

  setTool(tool: PdfAnnotationTool): string {
    this.tool = tool;
    return toolStatus[tool];
  }

  setAnnotationAvailability(count: number): void {
    this.annotationCount = count;
  }

  setExportArtifact(artifact: { readonly id: string; readonly name: string } | null): void {
    this.exportTarget = artifact ? { id: artifact.id, name: artifact.name } : null;
    this.requestUpdate();
  }

  setUndoDrawings(drawings: readonly UndoDrawing[]): void {
    const latest = drawings.reduce<UndoDrawing | undefined>(
      (current, drawing) =>
        !current || drawing.createdAt > current.createdAt || (drawing.createdAt === current.createdAt && drawing.id > current.id)
          ? drawing
          : current,
      undefined,
    );
    this.undoTarget = latest ? { id: latest.id, referenceId: latest.referenceId } : null;
    this.undoStatus = "";
    this.requestUpdate();
  }

  setInspectorOpen(open: boolean, panel: "annotations" | "references" = "annotations"): void {
    this.inspectorOpen = open;
    this.inspectorPanel = panel;
  }

  focusInspectorButton(panel: "annotations" | "references"): void {
    const id = panel === "references" ? "#open-library-pdf-references" : "#open-library-pdf-inspector";
    void this.updateComplete.then(() => this.querySelector<HTMLButtonElement>(id)?.focus());
  }

  protected override render(): TemplateResult {
    return html`
      <div class="library-pdf-annotation-tools" role="toolbar" aria-label="PDF tools">
        ${this.toolButton("select", "Select and copy text, or edit an existing annotation")}
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
              ?disabled=${!this.undoTarget || this.undoing}
              title=${this.undoStatus || "Remove the latest drawing on this page"}
              @click=${this.undoDrawing}
            >
              ${icon("undo")}<span class="sr-only">${this.undoing ? "Removing latest drawing" : "Undo latest drawing"}</span>
            </button>
          </div>
        </div>
        <span class="library-pdf-rail-divider" aria-hidden="true"></span>
        <button
          class="library-pdf-rail-button button-icon"
          id="download-library-original-pdf"
          type="button"
          ?disabled=${!this.exportTarget || this.exporting}
          title="Download the original PDF"
          data-touch-target="true"
          @click=${this.downloadOriginal}
        >
          ${icon("guide")}<span class="sr-only">${this.exporting ? "Preparing PDF download" : "Download original PDF"}</span>
        </button>
        <button
          class="library-pdf-rail-button button-icon"
          id="export-library-annotated-pdf"
          type="button"
          ?disabled=${this.annotationCount === 0 || !this.exportTarget || this.exporting}
          title="Download a copy with private notes and ink"
          data-touch-target="true"
          @click=${this.exportAnnotated}
        >
          ${icon("download")}<span class="sr-only">${this.exporting ? "Preparing annotated PDF" : "Export annotated"}</span>
        </button>
        <button
          class="library-pdf-rail-button library-pdf-annotations-button button-icon"
          id="open-library-pdf-inspector"
          type="button"
          aria-label="Annotations"
          aria-expanded=${String(this.inspectorOpen && this.inspectorPanel === "annotations")}
          aria-controls="library-highlight-composer"
          title="Open annotations"
          data-touch-target="true"
          @click=${() => this.emitAction({ action: "open-inspector" })}
        >
          ${icon("annotations")}<span class="sr-only">Annotations</span
          ><span class="count-badge" id="library-highlight-count">${this.annotationCount}</span>
        </button>
        <button
          class="library-pdf-rail-button button-icon"
          id="open-library-pdf-references"
          type="button"
          aria-label="References"
          aria-expanded=${String(this.inspectorOpen && this.inspectorPanel === "references")}
          aria-controls="library-highlight-composer"
          title="Open references"
          data-touch-target="true"
          @click=${() => this.emitAction({ action: "open-references" })}
        >
          ${icon("research")}<span class="sr-only">References</span>
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

  protected async undoDrawing(): Promise<void> {
    const target = this.undoTarget;
    if (!target || this.undoing) return;
    this.undoing = true;
    this.undoStatus = "Removing latest drawing…";
    try {
      const response = await fetch(
        `/api/library/references/${encodeURIComponent(target.referenceId)}/pdf-markups/${encodeURIComponent(target.id)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      await expectOk(response);
      this.undoTarget = null;
      this.undoStatus = "";
      this.requestUpdate();
      this.emitAction({ action: "drawing-undone" });
    } catch (error) {
      this.undoStatus = `${errorMessage(error, "Could not undo the latest drawing.")} Select Undo to retry.`;
    } finally {
      this.undoing = false;
    }
  }

  protected async exportAnnotated(): Promise<void> {
    const target = this.exportTarget;
    if (!target || this.exporting || this.annotationCount === 0) return;
    await this.exportPdf(
      `/api/library/pdfs/${encodeURIComponent(target.id)}/annotated`,
      target.name.replace(/\.pdf$/iu, "") + "-annotated.pdf",
      "Preparing annotated PDF…",
      "Choose Save to Files to keep the annotated PDF.",
    );
  }

  protected async downloadOriginal(): Promise<void> {
    const target = this.exportTarget;
    if (!target || this.exporting) return;
    await this.exportPdf(
      `/api/library/pdfs/${encodeURIComponent(target.id)}`,
      target.name,
      "Downloading original PDF…",
      "Choose Save to Files to keep the original PDF.",
    );
  }

  private async exportPdf(url: string, filename: string, downloadStatus: string, shareStatus: string): Promise<void> {
    this.exporting = true;
    try {
      const response = await fetch(url, { credentials: "same-origin" });
      await expectOk(response);
      const pdf = await response.blob();
      if (installedWebApp() && typeof navigator.share === "function") {
        try {
          const file = new File([pdf], filename, { type: "application/pdf" });
          if (!navigator.canShare || navigator.canShare({ files: [file] })) {
            this.emitAction({ action: "export-status", message: shareStatus });
            await navigator.share({ files: [file], title: filename });
            return;
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          this.emitAction({ action: "export-status", message: "Could not open the file saver. Downloading instead." });
        }
      }
      const href = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1_000);
      }
      this.emitAction({ action: "export-status", message: downloadStatus });
    } catch (error) {
      this.emitAction({ action: "export-status", message: errorMessage(error, "Could not download the PDF.") });
    } finally {
      this.exporting = false;
    }
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

function installedWebApp(): boolean {
  const iosNavigator = navigator as Navigator & { readonly standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true;
}

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-annotation-toolbar")) {
  customElements.define("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-annotation-toolbar": LibraryPdfAnnotationToolbar;
  }
}
