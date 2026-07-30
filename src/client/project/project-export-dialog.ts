import { html, LitElement, type TemplateResult } from "lit";
import type { PublicationWordStatistics } from "../../domain/publication/publication-statistics";
import "./export-statistics-panel";
import type { ExportStatisticsPanel } from "./export-statistics-panel";

export class ProjectExportDialog extends LitElement {
  private statistics: PublicationWordStatistics | null = null;

  setStatistics(statistics: PublicationWordStatistics | null): void {
    this.statistics = statistics;
    this.querySelector<ExportStatisticsPanel>("#export-statistics")?.setStatistics(statistics);
    if (typeof document !== "undefined") {
      const badge = document.getElementById("word-count-badge");
      if (badge) badge.textContent = statistics ? `${statistics.totalWords.toLocaleString()} words` : "… words";
    }
  }

  open(statistics: PublicationWordStatistics | null = this.statistics): void {
    this.setStatistics(statistics);
    const dialog = this.dialog();
    if (dialog && !dialog.open) dialog.showModal();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this.handleClick);
  }

  override disconnectedCallback(): void {
    document.removeEventListener("click", this.handleClick);
    super.disconnectedCallback();
  }

  protected override render(): TemplateResult {
    return html`<slot></slot>`;
  }

  protected readonly handleClick = (event: Event): void => {
    if ((event.target as Element).closest("[data-project-export-trigger]")) {
      this.open();
      return;
    }
    if ((event.target as Element).closest("#close-export")) this.dialog()?.close();
  };

  private dialog(): HTMLDialogElement | null {
    return this.querySelector<HTMLDialogElement>("#export-dialog");
  }
}

if (typeof customElements !== "undefined" && !customElements.get("project-export-dialog")) {
  customElements.define("project-export-dialog", ProjectExportDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-export-dialog": ProjectExportDialog;
  }
}
