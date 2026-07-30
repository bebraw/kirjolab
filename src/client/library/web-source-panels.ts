import { html, type TemplateResult } from "lit";
import type { WebSnapshotComparison } from "../../domain/reference-library";
import { isWebSnapshotComparisonResponse } from "../app/app-contracts";
import { errorMessage, expectOk, jsonFetch } from "../platform/http";
import { LightDomElement } from "../platform/light-dom-controller";

export const webSourceCapturedEvent = "web-source-captured";

export class WebSourceCapture extends LightDomElement {
  static override properties = {
    busy: { state: true },
    status: { state: true },
    url: { state: true },
  };

  declare private busy: boolean;
  declare private status: string;
  declare private url: string;

  constructor() {
    super();
    this.busy = false;
    this.status = "";
    this.url = "";
  }

  clear(): void {
    this.url = "";
  }

  async captureUrl(url: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.status = "Capturing web source…";
    try {
      await expectOk(await jsonFetch("/api/library/web-sources", { url }));
      this.clear();
      this.status = "Web source captured privately with an immutable access timestamp.";
      this.dispatchEvent(new CustomEvent<string>(webSourceCapturedEvent, { bubbles: true, detail: this.status }));
    } catch (error) {
      this.status = errorMessage(error, "Could not capture the web source.");
    } finally {
      this.busy = false;
    }
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
          ?disabled=${this.busy}
          @input=${this.changeUrl}
        />
        <button class="button-primary justify-center" type="submit" ?disabled=${this.busy}>${this.busy ? "Adding…" : "Add URL"}</button>
      </form>
      <p class="status-text" role="status">${this.status}</p>
    `;
  }

  protected capture(event: Event): void {
    event.preventDefault();
    void this.captureUrl(this.url);
  }

  protected changeUrl(event: Event): void {
    this.url = (event.currentTarget as HTMLInputElement).value;
  }
}

export class WebSnapshotComparisonPanel extends LightDomElement {
  static override properties = {
    busy: { state: true },
    comparison: { state: true },
    status: { state: true },
  };

  declare private busy: boolean;
  declare private comparison: WebSnapshotComparison | null;
  declare private status: string;

  constructor() {
    super();
    this.busy = false;
    this.comparison = null;
    this.status = "";
  }

  async compare(beforeId: string, afterId: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.comparison = null;
    this.status = "Comparing captured snapshots…";
    this.classList?.remove("hidden");
    try {
      const response = await fetch(`/api/library/web-snapshots/${encodeURIComponent(beforeId)}/compare/${encodeURIComponent(afterId)}`, {
        credentials: "same-origin",
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isWebSnapshotComparisonResponse(value)) throw new Error("Web snapshot comparison returned an invalid result");
      this.show(value.comparison);
    } catch (error) {
      this.status = errorMessage(error, "Could not compare web snapshots.");
    } finally {
      this.busy = false;
    }
  }

  show(comparison: WebSnapshotComparison): void {
    this.comparison = comparison;
    this.status = "";
    this.classList?.remove("hidden");
    void this.updateComplete.then(() => this.scrollIntoView?.({ block: "nearest" }));
  }

  protected override render(): TemplateResult {
    if (!this.comparison) return html`${this.status ? html`<p class="status-text" role="status">${this.status}</p>` : ""}`;
    return html`
      <p class="eyebrow">Neutral snapshot comparison</p>
      <h3 class="text-lg font-semibold tracking-[-0.025em]">
        ${
          this.comparison.identical
            ? "No readable-text changes"
            : `${this.comparison.addedLines} added · ${this.comparison.removedLines} removed`
        }
      </h3>
      ${this.comparison.hunks.map(
        (hunk) => html`
          <pre class="mt-3 overflow-auto rounded-sm border border-app-line bg-app-surface p-3 font-mono text-xs leading-5">
${[
  `@@ before ${hunk.beforeLine} · after ${hunk.afterLine} @@`,
  ...hunk.removed.map((line) => `- ${line}`),
  ...hunk.added.map((line) => `+ ${line}`),
  ...(hunk.truncated ? ["… excerpt truncated"] : []),
].join("\n")}</pre>
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
