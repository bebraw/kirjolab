import { html, LitElement, nothing, type TemplateResult } from "lit";
import { isPdfDraftResult } from "../domain/reference-library";
import { errorMessage, expectOk } from "./http";
import { libraryPdfUploadRetryEvent, type LibraryPdfUploadStatus } from "./library-pdf-upload-status";
import { uploadPdfBatch, type PdfUploadOutcome } from "./pdf-upload-queue";

export const libraryPdfUploadOutcomeEvent = "library-pdf-upload-outcome";

export type LibraryPdfUploadOutcome =
  | { readonly action: "notice"; readonly message: string }
  | { readonly action: "refresh"; readonly message: string; readonly requestId: number };

export class LibraryPdfUploadControl extends LitElement {
  static override properties = {
    dragging: { state: true },
    uploadBusy: { state: true },
  };

  declare private dragging: boolean;
  declare private uploadBusy: boolean;
  private requestId = 0;
  private status: LibraryPdfUploadStatus | null = null;

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

  bindStatus(status: LibraryPdfUploadStatus): void {
    this.status?.removeEventListener(libraryPdfUploadRetryEvent, this.retryFailed);
    this.status = status;
    status.addEventListener(libraryPdfUploadRetryEvent, this.retryFailed);
  }

  complete(requestId: number): void {
    if (requestId !== this.requestId) return;
    this.finish();
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
    void this.uploadFiles(Array.from((event.currentTarget as HTMLInputElement).files ?? []));
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
      this.emitOutcome({ action: "notice", message: "Finish the current PDF batch before adding another." });
      return;
    }
    void this.uploadFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  async uploadFiles(files: readonly File[]): Promise<void> {
    const status = this.status;
    if (files.length === 0 || this.uploadBusy || !status) return;
    const requestId = ++this.requestId;
    this.setBusy(true);
    status.setBusy(true);
    try {
      const result = await uploadPdfBatch(files, this.upload, (snapshot) => status.showProgress(snapshot, false));
      status.showProgress({ items: result.items, completed: result.items.length, total: result.items.length }, result.failed.length > 0);
      const message = uploadMessage(result.added.length, result.existing.length, result.failed.length);
      if (result.added.length > 0 || result.existing.length > 0) {
        this.emitOutcome({ action: "refresh", message, requestId });
      } else {
        this.finish();
        this.emitOutcome({ action: "notice", message });
      }
    } catch (error) {
      const message = errorMessage(error, "PDF intake failed");
      status.showError(message);
      this.finish();
      this.emitOutcome({ action: "notice", message });
    }
  }

  private readonly retryFailed = (event: Event): void => {
    void this.uploadFiles((event as CustomEvent<readonly File[]>).detail);
  };

  private readonly upload = async (file: File): Promise<PdfUploadOutcome> => {
    const response = await fetch("/api/library/pdfs", {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        "content-length": String(file.size),
        "x-file-name": encodeURIComponent(file.name),
      },
      body: file,
      credentials: "same-origin",
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isPdfDraftResult(value)) throw new Error("PDF intake returned an invalid result");
    if (value.created) return { disposition: "created" };
    return {
      disposition: "existing",
      referenceId: value.reference.id,
      referenceKey: value.reference.referenceKey,
      archived: value.reference.archivedAt !== null,
    };
  };

  private finish(): void {
    this.setBusy(false);
    this.status?.setBusy(false);
  }

  private emitOutcome(detail: LibraryPdfUploadOutcome): void {
    this.dispatchEvent(new CustomEvent<LibraryPdfUploadOutcome>(libraryPdfUploadOutcomeEvent, { bubbles: true, detail }));
  }
}

function uploadMessage(added: number, existing: number, failed: number): string {
  const addedLabel = `${added} PDF${added === 1 ? "" : "s"} added`;
  const existingLabel = `${existing} already in library`;
  if (failed > 0) return `${addedLabel}; ${existingLabel}; ${failed} failed.`;
  if (existing > 0) return `${addedLabel}; ${existingLabel}.`;
  return `${addedLabel}. Add metadata when ready.`;
}

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-upload-control")) {
  customElements.define("library-pdf-upload-control", LibraryPdfUploadControl);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-upload-control": LibraryPdfUploadControl;
  }
}
