import { html, LitElement, type TemplateResult } from "lit";
import type { ProjectRevisionContent, ProjectRevisionDiff, ProjectRevisionSummary } from "../domain/project-history";
import { ProjectHistoryPanel, projectHistoryCloseEvent } from "./project-history-panel";

export const projectHistoryDialogCloseEvent = "project-history-dialog-close";

export class ProjectHistoryDialog extends LitElement {
  openLoading(): void {
    this.panel()?.showLoading();
    const dialog = this.dialog();
    if (dialog && !dialog.open) dialog.showModal();
  }

  showTimeline(revisions: readonly ProjectRevisionSummary[]): void {
    this.panel()?.showTimeline(revisions);
  }

  showError(message: string): void {
    this.panel()?.showError(message);
  }

  showRevision(value: ProjectRevisionContent): void {
    this.panel()?.showRevision(value);
  }

  showComparison(value: ProjectRevisionDiff): void {
    this.panel()?.showComparison(value);
  }

  setBusy(busy: boolean): void {
    this.dialog()?.setAttribute("aria-busy", String(busy));
    this.panel()?.setBusy(busy);
  }

  isOpen(): boolean {
    return this.dialog()?.open ?? false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(projectHistoryCloseEvent, this.handlePanelClose);
    this.dialog()?.addEventListener("close", this.handleDialogClose);
  }

  override disconnectedCallback(): void {
    this.removeEventListener(projectHistoryCloseEvent, this.handlePanelClose);
    this.dialog()?.removeEventListener("close", this.handleDialogClose);
    super.disconnectedCallback();
  }

  protected override render(): TemplateResult {
    return html`<slot></slot>`;
  }

  protected readonly handlePanelClose = (): void => {
    this.dialog()?.close();
  };

  protected readonly handleDialogClose = (): void => {
    this.dispatchEvent(new CustomEvent(projectHistoryDialogCloseEvent, { bubbles: true, composed: true }));
  };

  private dialog(): HTMLDialogElement | null {
    return this.querySelector<HTMLDialogElement>("#project-history-dialog");
  }

  private panel(): ProjectHistoryPanel | null {
    return this.querySelector<ProjectHistoryPanel>("#project-history-panel");
  }
}

if (typeof customElements !== "undefined" && !customElements.get("project-history-dialog")) {
  customElements.define("project-history-dialog", ProjectHistoryDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-history-dialog": ProjectHistoryDialog;
  }
}
