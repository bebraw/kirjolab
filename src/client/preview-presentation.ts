import { html, LitElement, type TemplateResult } from "lit";
import type { Diagnostic } from "../domain/markdown";
import type { ProjectFilePreview } from "../domain/project-files";
import { sourceSpanAt } from "./composition-source-map";

export const previewDiagnosticSelectEvent = "preview-diagnostic-select";

export interface PreviewDiagnosticSelection {
  readonly fileId: string;
  readonly from: number;
  readonly to: number;
}

interface PreviewStatusData {
  readonly context: string;
  readonly summary: string;
}

interface PreviewDiagnosticItem extends PreviewDiagnosticSelection {
  readonly message: string;
  readonly selectable: boolean;
}

export class PreviewContextStatus extends LitElement {
  static override properties = { data: { state: true } };
  declare private data: PreviewStatusData;

  constructor() {
    super();
    this.data = { context: "main.md · composed paper", summary: "Validating…" };
  }

  setContext(context: string): void {
    this.data = { ...this.data, context };
  }

  setSummary(summary: string): void {
    this.data = { ...this.data, summary };
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
      <span class="preview-file-context" id="preview-file-context" title=${this.data.context}>${this.data.context}</span>
      <span id="diagnostic-summary">${this.data.summary}</span>
    `;
  }
}

export class PreviewDiagnosticsPanel extends LitElement {
  static override properties = { items: { state: true } };
  declare private items: readonly PreviewDiagnosticItem[];

  constructor() {
    super();
    this.items = [];
  }

  showUnavailable(message: string): void {
    this.items = [{ fileId: "", from: 0, message, selectable: false, to: 0 }];
  }

  setDiagnostics(diagnostics: readonly Diagnostic[], filePreview: ProjectFilePreview | null): void {
    this.items = [
      ...(filePreview?.diagnostics.map(({ message, fileId, from, to }) => ({
        fileId,
        from,
        message,
        selectable: true,
        to,
      })) ?? []),
      ...diagnostics.map((diagnostic) => rendererDiagnosticItem(diagnostic, filePreview)),
    ];
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`${this.items.map((item, index) =>
      item.selectable
        ? html`
            <button
              type="button"
              class="resource-card mb-2 block w-full text-left font-sans text-xs"
              data-diagnostic-index=${index}
              @click=${this.select}
            >
              ${item.message}
            </button>
          `
        : html`<p class="resource-card mb-2 font-sans text-xs">${item.message}</p>`,
    )}`;
  }

  protected select(event: Event): void {
    const index = Number((event.currentTarget as HTMLButtonElement).dataset.diagnosticIndex);
    const item = this.items[index];
    if (!item?.selectable) return;
    const { fileId, from, to } = item;
    this.dispatchEvent(
      new CustomEvent<PreviewDiagnosticSelection>(previewDiagnosticSelectEvent, {
        bubbles: true,
        composed: true,
        detail: { fileId, from, to },
      }),
    );
  }
}

function rendererDiagnosticItem(diagnostic: Diagnostic, filePreview: ProjectFilePreview | null): PreviewDiagnosticItem {
  const span = filePreview ? sourceSpanAt(filePreview.sourceMap, diagnostic.from) : undefined;
  return span
    ? {
        fileId: span.fileId,
        from: span.sourceStart,
        message: diagnostic.message,
        selectable: true,
        to: Math.min(span.sourceEnd, span.sourceStart + diagnostic.to - diagnostic.from),
      }
    : {
        fileId: filePreview?.fileId ?? "",
        from: diagnostic.from,
        message: diagnostic.message,
        selectable: true,
        to: diagnostic.to,
      };
}

if (typeof customElements !== "undefined") {
  if (!customElements.get("preview-context-status")) customElements.define("preview-context-status", PreviewContextStatus);
  if (!customElements.get("preview-diagnostics-panel")) customElements.define("preview-diagnostics-panel", PreviewDiagnosticsPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "preview-context-status": PreviewContextStatus;
    "preview-diagnostics-panel": PreviewDiagnosticsPanel;
  }
}
