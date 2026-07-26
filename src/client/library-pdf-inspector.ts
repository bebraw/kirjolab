import { html, LitElement, type TemplateResult } from "lit";

export const libraryPdfInspectorCloseEvent = "library-pdf-inspector-close";

export class LibraryPdfInspector extends LitElement {
  static override properties = {
    artifactId: { state: true },
    inspectorOpen: { state: true },
    status: { state: true },
    visible: { state: true },
  };

  declare private artifactId: string;
  declare private inspectorOpen: boolean;
  declare private status: string;
  declare private visible: boolean;

  constructor() {
    super();
    this.artifactId = "";
    this.inspectorOpen = false;
    this.status = "Select text to highlight.";
    this.visible = false;
  }

  setArtifact(artifactId: string): void {
    this.artifactId = artifactId;
  }

  showsArtifact(artifactId: string): boolean {
    return this.artifactId === artifactId;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  setStatus(status: string): void {
    this.status = status;
  }

  setInspectorOpen(open: boolean, showAnnotations = false): void {
    this.inspectorOpen = open;
    if (showAnnotations) this.querySelector<HTMLDetailsElement>("#library-annotation-details")?.setAttribute("open", "");
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
      <aside
        class="annotation-composer library-pdf-tools"
        id="library-highlight-composer"
        aria-label="PDF annotation inspector"
        data-artifact-id=${this.artifactId}
        data-inspector-open=${String(this.inspectorOpen)}
        ?hidden=${!this.visible}
      >
        <header class="library-pdf-inspector-header">
          <div>
            <p class="eyebrow">PDF annotations</p>
            <p class="library-pdf-status ui-status" id="library-highlight-status" role="status" aria-live="polite">${this.status}</p>
          </div>
          <button
            class="library-pdf-inspector-close"
            id="close-library-pdf-inspector"
            type="button"
            aria-label="Close annotation inspector"
            title="Close annotation inspector"
            @click=${this.close}
          >
            ×
          </button>
        </header>
        <library-pdf-annotation-forms id="library-pdf-annotation-forms"></library-pdf-annotation-forms>
        <details class="library-annotation-details" id="library-annotation-details">
          <summary><span>Annotations</span></summary>
          <div class="library-annotation-details-body">
            <pdf-highlight-import-panel
              class="library-highlight-import"
              id="pdf-highlight-import-panel"
              aria-labelledby="library-highlight-import-title"
            ></pdf-highlight-import-panel>
            <library-pdf-annotation-list class="space-y-2" id="library-highlight-list"></library-pdf-annotation-list>
            <details class="library-project-details">
              <summary>Project sharing</summary>
              <library-pdf-project-use class="mt-2" id="library-project-use"></library-pdf-project-use>
            </details>
          </div>
        </details>
      </aside>
    `;
  }

  protected close(): void {
    this.dispatchEvent(new CustomEvent(libraryPdfInspectorCloseEvent, { bubbles: true }));
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-inspector")) {
  customElements.define("library-pdf-inspector", LibraryPdfInspector);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-inspector": LibraryPdfInspector;
  }
}
