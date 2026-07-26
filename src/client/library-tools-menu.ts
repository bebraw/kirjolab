import { html, LitElement, nothing, type TemplateResult } from "lit";
import { errorMessage, expectOk } from "./http";

export const libraryToolsActionEvent = "library-tools-action";
export const libraryToolsArchiveRefreshEvent = "library-tools-archive-refresh";

export interface LibraryToolsArchiveRefresh {
  readonly message: string;
  readonly requestId: number;
}

export type LibraryToolsAction =
  | { readonly action: "open-citation-network" }
  | { readonly action: "show-archived"; readonly show: boolean };

export class LibraryToolsMenu extends LitElement {
  static override properties = {
    archiveBusy: { state: true },
    archiveStatus: { state: true },
    showArchived: { state: true },
  };

  declare private archiveBusy: boolean;
  declare private archiveStatus: string;
  declare private showArchived: boolean;
  private archiveRequestId = 0;

  constructor() {
    super();
    this.archiveBusy = false;
    this.archiveStatus = "";
    this.showArchived = false;
  }

  get includesArchivedReferences(): boolean {
    return this.showArchived;
  }

  setShowArchived(show: boolean): void {
    this.showArchived = show;
  }

  completeArchiveRestore(requestId: number): void {
    if (requestId !== this.archiveRequestId) return;
    this.archiveBusy = false;
    this.archiveStatus = "";
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
          <button id="show-archived-references" type="button" aria-pressed=${String(this.showArchived)} @click=${this.toggleArchived}>
            Show archived
          </button>
          ${this.archiveStatus ? html`<p class="ui-status px-3 py-2" role="status">${this.archiveStatus}</p>` : nothing}
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
    this.emit({ action: "open-citation-network" });
  }

  protected toggleArchived(): void {
    this.emit({ action: "show-archived", show: !this.showArchived });
  }

  private emit(detail: LibraryToolsAction): void {
    this.dispatchEvent(new CustomEvent<LibraryToolsAction>(libraryToolsActionEvent, { bubbles: true, detail }));
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-tools-menu")) {
  customElements.define("library-tools-menu", LibraryToolsMenu);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-tools-menu": LibraryToolsMenu;
  }
}
