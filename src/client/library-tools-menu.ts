import { html, LitElement, type TemplateResult } from "lit";

export const libraryToolsActionEvent = "library-tools-action";

export type LibraryToolsAction =
  | { readonly action: "open-citation-network" }
  | { readonly action: "restore-archive"; readonly file: File }
  | { readonly action: "show-archived"; readonly show: boolean };

export class LibraryToolsMenu extends LitElement {
  static override properties = { showArchived: { state: true } };

  declare private showArchived: boolean;

  constructor() {
    super();
    this.showArchived = false;
  }

  setShowArchived(show: boolean): void {
    this.showArchived = show;
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
            <input class="sr-only" id="library-archive-upload" type="file" accept=".zip,application/zip" @change=${this.restoreArchive} />
          </label>
          <a href="/api/library/export/csl.json">Export CSL JSON</a>
          <a href="/api/library/export/library.zip">Export library</a>
          <button id="open-citation-network" type="button" @click=${this.openCitationNetwork}>Reference trail</button>
          <button id="show-archived-references" type="button" aria-pressed=${String(this.showArchived)} @click=${this.toggleArchived}>
            Show archived
          </button>
        </div>
      </details>
    `;
  }

  protected restoreArchive(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) this.emit({ action: "restore-archive", file });
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
