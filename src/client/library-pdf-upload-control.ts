import { html, LitElement, nothing, type TemplateResult } from "lit";

export const libraryPdfUploadActionEvent = "library-pdf-upload-action";

export type LibraryPdfUploadAction = { readonly action: "files"; readonly files: readonly File[] } | { readonly action: "busy-drop" };

export class LibraryPdfUploadControl extends LitElement {
  static override properties = {
    dragging: { state: true },
    uploadBusy: { state: true },
  };

  declare private dragging: boolean;
  declare private uploadBusy: boolean;

  constructor() {
    super();
    this.dragging = false;
    this.uploadBusy = false;
  }

  get busy(): boolean {
    return this.uploadBusy;
  }

  setBusy(busy: boolean): void {
    this.uploadBusy = busy;
    this.dragging = false;
    if (busy && typeof this.querySelector === "function") {
      const input = this.querySelector<HTMLInputElement>("#library-pdf-upload");
      if (input) input.value = "";
    }
  }

  /* v8 ignore start -- exercised by browser fallback rendering */
  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.hasUpdated && typeof this.replaceChildren === "function") {
      this.replaceChildren();
      this.performUpdate();
    }
  }
  /* v8 ignore stop */

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
      <label
        class="library-menu-action"
        id="library-pdf-dropzone"
        for="library-pdf-upload"
        title="Choose or drop up to 20 PDF files"
        data-busy=${this.uploadBusy ? "true" : nothing}
        data-dragging=${this.dragging ? "true" : nothing}
        @dragover=${this.dragOver}
        @dragleave=${this.dragLeave}
        @drop=${this.drop}
      >
        <span><strong>PDF files</strong><small id="library-pdf-upload-help">Upload up to 20</small></span
        ><span aria-hidden="true">↑</span>
        <input
          class="sr-only"
          id="library-pdf-upload"
          type="file"
          accept="application/pdf"
          multiple
          aria-describedby="library-pdf-upload-help"
          ?disabled=${this.uploadBusy}
          @change=${this.selectFiles}
        />
      </label>
    `;
  }

  protected selectFiles(event: Event): void {
    this.emitFiles(Array.from((event.currentTarget as HTMLInputElement).files ?? []));
  }

  protected dragOver(event: DragEvent): void {
    if (this.uploadBusy || !event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    this.dragging = true;
  }

  protected dragLeave(): void {
    this.dragging = false;
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    if (this.uploadBusy) {
      this.emit({ action: "busy-drop" });
      return;
    }
    this.emitFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  protected emitFiles(files: readonly File[]): void {
    if (files.length > 0) this.emit({ action: "files", files });
  }

  private emit(detail: LibraryPdfUploadAction): void {
    this.dispatchEvent(new CustomEvent<LibraryPdfUploadAction>(libraryPdfUploadActionEvent, { bubbles: true, detail }));
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-upload-control")) {
  customElements.define("library-pdf-upload-control", LibraryPdfUploadControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-upload-control": LibraryPdfUploadControl;
  }
}
