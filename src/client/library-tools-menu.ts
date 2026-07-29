import { html, nothing, type TemplateResult } from "lit";
import { isArtifactAnalysisBackfillStatus, type ArtifactAnalysisBackfillStatus } from "../domain/reference-library";

import { EagerLightDomElement } from "./light-dom-controller";
import { errorMessage, expectOk } from "./http";

export const libraryToolsActionEvent = "library-tools-action";
export const libraryToolsArchiveRefreshEvent = "library-tools-archive-refresh";

export interface LibraryToolsArchiveRefresh {
  readonly message: string;
  readonly requestId: number;
}

export type LibraryToolsAction = "archive-visibility-change" | "open-citation-network" | "open-reconciliation";

export class LibraryToolsMenu extends EagerLightDomElement {
  static override properties = {
    archiveBusy: { state: true },
    archiveStatus: { state: true },
    analysisBusy: { state: true },
    analysisStatus: { state: true },
    showArchived: { state: true },
  };

  declare private archiveBusy: boolean;
  declare private archiveStatus: string;
  declare private analysisBusy: boolean;
  declare private analysisStatus: string;
  declare private showArchived: boolean;
  private archiveRequestId = 0;
  private analysisPoll: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.archiveBusy = false;
    this.archiveStatus = "";
    this.analysisBusy = false;
    this.analysisStatus = "";
    this.showArchived = false;
  }

  get includesArchivedReferences(): boolean {
    return this.showArchived;
  }

  setShowArchived(show: boolean): boolean {
    if (show === this.showArchived) return false;
    this.showArchived = show;
    return true;
  }

  completeArchiveRestore(requestId: number): void {
    if (requestId !== this.archiveRequestId) return;
    this.archiveBusy = false;
    this.archiveStatus = "";
  }

  protected override render(): TemplateResult {
    return html`
      <details class="action-menu library-tools-menu ui-menu" data-action-menu>
        <summary class="button-secondary library-more-button" aria-label="Library tools" title="Library tools">•••</summary>
        <div class="library-menu library-tools-list ui-menu-panel">
          <label class="library-menu-action" title="Restore a Kirjolab library archive">
            <span>Restore archive</span>
            <input
              class="sr-only"
              id="library-archive-upload"
              type="file"
              accept=".zip,application/zip"
              ?disabled=${this.archiveBusy}
              @change=${this.restoreArchive}
            />
          </label>
          <a href="/api/library/export/csl.json">Export CSL JSON</a>
          <a href="/api/library/export/library.zip">Export library</a>
          <button id="open-citation-network" type="button" @click=${this.openCitationNetwork}>Reference trail</button>
          <button id="open-reference-reconciliation" type="button" @click=${this.openReconciliation}>Find duplicate references</button>
          <button id="backfill-pdf-references" type="button" ?disabled=${this.analysisBusy} @click=${this.backfillPdfReferences}>
            ${this.analysisBusy ? "Queueing analysis…" : "Analyze existing PDFs"}
          </button>
          <button id="show-archived-references" type="button" aria-pressed=${String(this.showArchived)} @click=${this.toggleArchived}>
            Show archived
          </button>
          ${this.archiveStatus ? html`<p class="ui-status px-3 py-2" role="status">${this.archiveStatus}</p>` : nothing}
          ${this.analysisStatus ? html`<p class="ui-status px-3 py-2" role="status">${this.analysisStatus}</p>` : nothing}
        </div>
      </details>
    `;
  }

  protected restoreArchive(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void this.restore(file);
  }

  async restore(file: File): Promise<void> {
    if (this.archiveBusy) return;
    const requestId = ++this.archiveRequestId;
    this.archiveBusy = true;
    this.archiveStatus = "Restoring archive…";
    try {
      const response = await fetch("/api/library/import/archive", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/zip" },
        body: file,
      });
      await expectOk(response);
      this.archiveStatus = "Refreshing Library…";
      this.dispatchEvent(
        new CustomEvent<LibraryToolsArchiveRefresh>(libraryToolsArchiveRefreshEvent, {
          bubbles: true,
          detail: { message: "Portable library metadata restored.", requestId },
        }),
      );
    } catch (error) {
      this.archiveBusy = false;
      this.archiveStatus = errorMessage(error, "Could not restore the library archive.");
    }
  }

  protected openCitationNetwork(): void {
    this.emit("open-citation-network");
  }

  protected openReconciliation(): void {
    this.emit("open-reconciliation");
  }

  protected backfillPdfReferences(): Promise<void> {
    return this.analysisBusy ? Promise.resolve() : this.requestPdfReferenceBackfill("POST");
  }

  protected toggleArchived(): void {
    this.setShowArchived(!this.showArchived);
    this.emit("archive-visibility-change");
  }

  private emit(detail: LibraryToolsAction): void {
    this.dispatchEvent(new CustomEvent<LibraryToolsAction>(libraryToolsActionEvent, { bubbles: true, detail }));
  }

  private async requestPdfReferenceBackfill(method: "GET" | "POST"): Promise<void> {
    if (method === "POST") this.analysisBusy = true;
    this.clearAnalysisPoll();
    try {
      const response = await fetch("/api/library/analyses/pdf-references/backfill", { credentials: "same-origin", method });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isArtifactAnalysisBackfillStatus(value)) throw new Error("The server returned invalid reference-analysis progress");
      this.analysisStatus = formatBackfillStatus(value);
      this.analysisBusy = false;
      if (value.missing + value.failed > 0 && value.queued + value.running === 0) return;
      if (value.queued + value.running > 0) this.analysisPoll = setTimeout(() => void this.requestPdfReferenceBackfill("GET"), 2_000);
    } catch (error) {
      this.analysisBusy = false;
      this.analysisStatus = errorMessage(error, "Could not queue existing PDFs for reference analysis.");
    }
  }

  private clearAnalysisPoll(): void {
    if (this.analysisPoll) clearTimeout(this.analysisPoll);
    this.analysisPoll = null;
  }

  override disconnectedCallback(): void {
    this.clearAnalysisPoll();
    super.disconnectedCallback();
  }
}

function formatBackfillStatus(status: ArtifactAnalysisBackfillStatus): string {
  if (status.total === 0) return "Reference analysis: no PDFs in the Library.";
  const progress = [
    `${status.ready}/${status.total} ready`,
    status.running ? `${status.running} running` : "",
    status.queued ? `${status.queued} queued` : "",
    status.failed ? `${status.failed} failed` : "",
    status.missing ? `${status.missing} not queued` : "",
    status.queuedNow ? `${status.queuedNow} queued now` : "",
    status.truncated ? "first 500 shown" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `Reference analysis: ${progress}.`;
}

if (typeof customElements !== "undefined" && !customElements.get("library-tools-menu")) {
  customElements.define("library-tools-menu", LibraryToolsMenu);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-tools-menu": LibraryToolsMenu;
  }
}
