import { html, nothing, type TemplateResult } from "lit";
import type { ExistingPdfUpload, PdfUploadQueueSnapshot } from "../pdf/pdf-upload-queue";
import { LightDomElement } from "../platform/light-dom-controller";

export const libraryPdfUploadRetryEvent = "library-pdf-upload-retry";
export const libraryPdfUploadRevealEvent = "library-pdf-upload-reveal";

export class LibraryPdfUploadStatus extends LightDomElement {
  static override properties = {
    error: { state: true },
    retryFailed: { state: true },
    snapshot: { state: true },
  };

  declare private error: string;
  declare private retryFailed: boolean;
  declare private snapshot: PdfUploadQueueSnapshot | null;

  constructor() {
    super();
    this.error = "";
    this.retryFailed = false;
    this.snapshot = null;
  }

  setBusy(busy: boolean): void {
    if (typeof this.toggleAttribute === "function") this.toggleAttribute("aria-busy", busy);
  }

  showError(message: string): void {
    this.error = message;
    this.snapshot = null;
    this.classList?.remove("hidden");
  }

  showProgress(snapshot: PdfUploadQueueSnapshot, retryFailed: boolean): void {
    this.error = "";
    this.retryFailed = retryFailed;
    this.snapshot = snapshot;
    this.classList?.remove("hidden");
  }

  protected override render(): TemplateResult {
    if (this.error) {
      return html`${label("PDF intake")}
        <p class="ui-status">${this.error}</p>`;
    }
    if (!this.snapshot) return html``;
    return html`
      ${label("PDF intake")}
      <p class="ui-status">${this.snapshot.completed} of ${this.snapshot.total} processed</p>
      <ol class="mt-2 grid gap-1 font-sans text-xs">
        ${this.snapshot.items.map(
          (item) => html`
            <li class="flex items-start justify-between gap-3" data-upload-state=${item.state}>
              <span class="min-w-0 truncate text-app-text" title=${item.file.name}>${item.file.name}</span>
              <span class="flex shrink-0 items-center gap-2">
                <span class=${`shrink-0 ${item.state === "failed" ? "text-app-error" : "text-app-text-soft"}`}>
                  ${uploadStateText(item)}
                </span>
                ${this.existingAction(item)}
              </span>
            </li>
          `,
        )}
      </ol>
      ${this.retryFailed ? html`<button class="button-secondary mt-3" type="button" @click=${this.retry}>Retry failed</button>` : nothing}
    `;
  }

  protected retry(): void {
    const files = this.snapshot?.items.filter((item) => item.state === "failed").map((item) => item.file) ?? [];
    if (files.length > 0) {
      this.dispatchEvent(new CustomEvent<readonly File[]>(libraryPdfUploadRetryEvent, { bubbles: true, detail: files }));
    }
  }

  protected reveal(existing: ExistingPdfUpload): void {
    this.dispatchEvent(new CustomEvent<ExistingPdfUpload>(libraryPdfUploadRevealEvent, { bubbles: true, detail: existing }));
  }

  private existingAction(item: PdfUploadQueueSnapshot["items"][number]): TemplateResult | typeof nothing {
    const existing = item.existing;
    if (item.state !== "existing" || !existing) return nothing;
    return html`<button
      class="button-secondary"
      type="button"
      aria-label=${`Show ${existing.referenceKey} in Library`}
      @click=${() => this.reveal(existing)}
    >
      Show
    </button>`;
  }
}

function label(text: string): TemplateResult {
  return html`<p class="eyebrow">${text}</p>`;
}

function uploadStateText(item: PdfUploadQueueSnapshot["items"][number]): string {
  if (item.state === "failed") return `Failed · ${item.error ?? "Upload failed"}`;
  if (item.state === "existing" && item.existing) return `Already in library · ${item.existing.referenceKey}`;
  if (item.state === "queued") return "Queued";
  if (item.state === "uploading") return "Uploading";
  if (item.state === "existing") return "Already in library";
  return "Added";
}

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-upload-status")) {
  customElements.define("library-pdf-upload-status", LibraryPdfUploadStatus);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-upload-status": LibraryPdfUploadStatus;
  }
}
