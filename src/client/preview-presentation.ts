import { html, type TemplateResult } from "lit";
import type { Diagnostic } from "../domain/markdown";
import type { ProjectFile, ProjectFilePreview } from "../domain/project-files";
import { sourceSpanAt } from "./composition-source-map";
import { LightDomElement } from "./light-dom-controller";

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
  readonly line: number;
  readonly message: string;
  readonly selectable: boolean;
}

interface PreviewDiagnosticSources {
  readonly files: readonly Pick<ProjectFile, "content" | "id">[];
  readonly renderedSource: string;
}

export class PreviewContextStatus extends LightDomElement {
  static override properties = { data: { state: true } };
  declare private data: PreviewStatusData;

  constructor() {
    super();
    this.data = { context: "main.md · composed paper", summary: "Validating…" };
  }

  setFile(filePreview: ProjectFilePreview | null): void {
    const context = filePreview
      ? `${filePreview.path} · ${filePreview.mode === "composed" ? "composed paper" : "isolated file"}`
      : "Preview";
    this.data = { ...this.data, context };
  }

  setDiagnostics(diagnostics: readonly Diagnostic[], filePreview: ProjectFilePreview | null): void {
    const count = diagnostics.length + (filePreview?.diagnostics.length ?? 0);
    this.data = { ...this.data, summary: count === 0 ? "No syntax errors" : `${count} ${count === 1 ? "issue" : "issues"}` };
  }

  showUnavailable(): void {
    this.data = { ...this.data, summary: "Preview unavailable" };
  }

  protected override render(): TemplateResult {
    return html`
      <span class="preview-file-context" id="preview-file-context" title=${this.data.context}>${this.data.context}</span>
      <span id="diagnostic-summary">${this.data.summary}</span>
    `;
  }
}

export class PreviewDiagnosticsPanel extends LightDomElement {
  static override properties = { items: { state: true } };
  declare private items: readonly PreviewDiagnosticItem[];

  constructor() {
    super();
    this.items = [];
  }

  showUnavailable(message: string): void {
    this.items = [{ fileId: "", from: 0, line: 1, message, selectable: false, to: 0 }];
  }

  setDiagnostics(
    diagnostics: readonly Diagnostic[],
    filePreview: ProjectFilePreview | null,
    sources: PreviewDiagnosticSources = { files: [], renderedSource: filePreview?.content ?? "" },
  ): void {
    this.items = [
      ...(filePreview?.diagnostics.map(({ message, fileId, from, to }) => ({
        fileId,
        from,
        line: sourceLine(sources, fileId, from),
        message,
        selectable: true,
        to,
      })) ?? []),
      ...diagnostics.map((diagnostic) => rendererDiagnosticItem(diagnostic, filePreview, sources)),
    ];
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
              <span class="mr-2 font-semibold text-app-text-soft">Line ${item.line}</span><span>${item.message}</span>
            </button>
          `
        : html`<p class="resource-card mb-2 font-sans text-xs"><span>${item.message}</span></p>`,
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

function rendererDiagnosticItem(
  diagnostic: Diagnostic,
  filePreview: ProjectFilePreview | null,
  sources: PreviewDiagnosticSources,
): PreviewDiagnosticItem {
  const span = filePreview ? sourceSpanAt(filePreview.sourceMap, diagnostic.from) : undefined;
  if (!span) {
    const fileId = filePreview?.fileId ?? "";
    return {
      fileId,
      from: diagnostic.from,
      line: sourceLine(sources, fileId, diagnostic.from),
      message: diagnostic.message,
      selectable: true,
      to: diagnostic.to,
    };
  }
  const from = Math.min(span.sourceEnd, span.sourceStart + Math.max(0, diagnostic.from - span.outputStart));
  return {
    fileId: span.fileId,
    from,
    line: sourceLine(sources, span.fileId, from),
    message: diagnostic.message,
    selectable: true,
    to: Math.min(span.sourceEnd, from + diagnostic.to - diagnostic.from),
  };
}

function sourceLine(sources: PreviewDiagnosticSources, fileId: string, offset: number): number {
  const source = sources.files.find(({ id }) => id === fileId)?.content ?? sources.renderedSource;
  return source.slice(0, Math.max(0, Math.min(offset, source.length))).split(/\r?\n/u).length;
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
