import { html, type TemplateResult } from "lit";

import { LightDomElement } from "./light-dom-controller";
import type { PublicationWordStatistics } from "../domain/publication-statistics";

export class ExportStatisticsPanel extends LightDomElement {
  static override properties = {
    statistics: { state: true },
  };

  declare private statistics: PublicationWordStatistics | null;

  constructor() {
    super();
    this.statistics = null;
  }

  setStatistics(statistics: PublicationWordStatistics | null): void {
    this.statistics = statistics;
  }

  protected override render(): TemplateResult {
    const statistics = this.statistics;
    if (!statistics) return html`<div class="empty-state">Loading composed word counts…</div>`;
    return html`
      <p class="font-sans text-3xl font-semibold tracking-[-0.04em]">${statistics.totalWords.toLocaleString()} words</p>
      <p class="mt-1 text-xs leading-5 text-app-text-soft">
        Composed prose from main.md; code, equations, citation keys, and link destinations are excluded.
      </p>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        ${statisticsGroup(
          "Files",
          statistics.files.map((file) => ({ label: file.path, words: file.words })),
        )}
        ${statisticsGroup(
          "Headings",
          statistics.headings.map((heading) => ({ label: heading.heading, words: heading.words })),
        )}
      </div>
    `;
  }
}

function statisticsGroup(title: string, items: readonly { readonly label: string; readonly words: number }[]): TemplateResult {
  return html`
    <section>
      <h3 class="font-sans text-sm font-semibold">${title}</h3>
      ${items.length > 0
        ? html`
            <dl class="mt-2 divide-y divide-app-line border-y border-app-line">
              ${items.map(
                (item) => html`
                  <div class="flex items-center justify-between gap-3 py-2 text-xs">
                    <dt class="min-w-0 truncate">${item.label}</dt>
                    <dd class="shrink-0 font-sans font-semibold">${item.words.toLocaleString()}</dd>
                  </div>
                `,
              )}
            </dl>
          `
        : html`<p class="py-3 text-xs text-app-text-soft">No ${title.toLocaleLowerCase()} in the composed document.</p>`}
    </section>
  `;
}

if (typeof customElements !== "undefined" && !customElements.get("export-statistics-panel")) {
  customElements.define("export-statistics-panel", ExportStatisticsPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "export-statistics-panel": ExportStatisticsPanel;
  }
}
