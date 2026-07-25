import { html, LitElement, type TemplateResult } from "lit";
import type { WebSnapshotComparison } from "../domain/reference-library";

export const webSourceCaptureEvent = "web-source-capture";

export class WebSourceCapture extends LitElement {
  static override properties = {
    url: { state: true },
  };

  declare private url: string;

  constructor() {
    super();
    this.url = "";
  }

  clear(): void {
    this.url = "";
  }

  /* v8 ignore start -- exercised by browser fallback rendering */
  override connectedCallback(): void {
    if (!this.hasUpdated && typeof this.replaceChildren === "function") this.replaceChildren();
    super.connectedCallback();
  }
  /* v8 ignore stop */

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
      <form class="library-url-form" id="web-source-form" @submit=${this.capture}>
        <label class="sr-only" for="web-source-url">Website URL</label>
        <input
          class="field"
          id="web-source-url"
          type="url"
          maxlength="4096"
          required
          placeholder="https://…"
          title="Add a website by URL"
          .value=${this.url}
          @input=${this.changeUrl}
        />
        <button class="button-primary justify-center" type="submit">Add URL</button>
      </form>
    `;
  }

  protected capture(event: Event): void {
    event.preventDefault();
    this.dispatchEvent(new CustomEvent<string>(webSourceCaptureEvent, { bubbles: true, detail: this.url }));
  }

  protected changeUrl(event: Event): void {
    this.url = (event.currentTarget as HTMLInputElement).value;
  }
}

export class WebSnapshotComparisonPanel extends LitElement {
  static override properties = {
    comparison: { state: true },
  };

  declare private comparison: WebSnapshotComparison | null;

  constructor() {
    super();
    this.comparison = null;
  }

  show(comparison: WebSnapshotComparison): void {
    this.comparison = comparison;
    this.classList?.remove("hidden");
    void this.updateComplete.then(() => this.scrollIntoView?.({ block: "nearest" }));
  }

  /* v8 ignore start -- exercised by browser fallback rendering */
  override connectedCallback(): void {
    if (!this.hasUpdated && typeof this.replaceChildren === "function") this.replaceChildren();
    super.connectedCallback();
  }
  /* v8 ignore stop */

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    if (!this.comparison) return html``;
    return html`
      <p class="eyebrow">Neutral snapshot comparison</p>
      <h3 class="text-lg font-semibold tracking-[-0.025em]">
        ${this.comparison.identical
          ? "No readable-text changes"
          : `${this.comparison.addedLines} added · ${this.comparison.removedLines} removed`}
      </h3>
      ${this.comparison.hunks.map(
        (hunk) => html`
          <pre class="mt-3 overflow-auto rounded-sm border border-app-line bg-app-surface p-3 font-mono text-xs leading-5">
${[
              `@@ before ${hunk.beforeLine} · after ${hunk.afterLine} @@`,
              ...hunk.removed.map((line) => `- ${line}`),
              ...hunk.added.map((line) => `+ ${line}`),
              ...(hunk.truncated ? ["… excerpt truncated"] : []),
            ].join("\n")}</pre
          >
        `,
      )}
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("web-source-capture")) {
  customElements.define("web-source-capture", WebSourceCapture);
}
if (typeof customElements !== "undefined" && !customElements.get("web-snapshot-comparison")) {
  customElements.define("web-snapshot-comparison", WebSnapshotComparisonPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "web-source-capture": WebSourceCapture;
    "web-snapshot-comparison": WebSnapshotComparisonPanel;
  }
}
