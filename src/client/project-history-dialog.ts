import { html, LitElement, type TemplateResult } from "lit";
import { isProjectRevisionContent, isProjectRevisionDiff, isProjectRevisionSummaries } from "../domain/project-history";
import { isWorkspaceSummaries } from "../domain/workspace";
import { errorMessage, expectOk, jsonFetch } from "./http";
import { createProjectHistoryActor, projectHistoryBusy, type ProjectHistoryOperation } from "./project-history-machine";
import { ProjectHistoryPanel, projectHistoryActionEvent, projectHistoryCloseEvent } from "./project-history-panel";

export const projectHistoryOutcomeEvent = "project-history-outcome";

export class ProjectHistoryDialog extends LitElement {
  private readonly workflow = createProjectHistoryActor();
  private apiBase = "";

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  async open(): Promise<void> {
    this.workflow.send({ type: "OPEN" });
    const requestId = this.workflow.getSnapshot().context.requestId;
    this.panel()?.showLoading();
    const dialog = this.dialog();
    if (dialog && !dialog.open) dialog.showModal();
    this.syncBusy();
    try {
      if (!this.apiBase) throw new Error("Project history is not configured");
      const response = await fetch(`${this.apiBase}/history`, { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isProjectRevisionSummaries(value)) throw new Error("Project history returned an invalid timeline");
      this.workflow.send({ type: "TIMELINE_READY", requestId });
      const history = this.workflow.getSnapshot();
      if (history.matches("ready") && history.context.requestId === requestId) this.panel()?.showTimeline(value);
    } catch (error) {
      const message = errorMessage(error, "Could not load project history");
      this.workflow.send({ type: "TIMELINE_FAILED", requestId, message });
      if (this.workflow.getSnapshot().matches("failed")) {
        this.panel()?.showError(message);
        this.emitNotice(message);
      }
    } finally {
      this.syncBusy();
    }
  }

  isOpen(): boolean {
    return this.dialog()?.open ?? false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(projectHistoryCloseEvent, this.handlePanelClose);
    this.addEventListener(projectHistoryActionEvent, this.handlePanelActionEvent);
    this.dialog()?.addEventListener("close", this.handleDialogClose);
  }

  override disconnectedCallback(): void {
    this.removeEventListener(projectHistoryCloseEvent, this.handlePanelClose);
    this.removeEventListener(projectHistoryActionEvent, this.handlePanelActionEvent);
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
    this.workflow.send({ type: "CLOSE" });
    this.syncBusy();
  };

  protected readonly handlePanelActionEvent = (event: Event): void => {
    void this.handleAction((event as CustomEvent<ProjectHistoryOperation>).detail);
  };

  protected async handleAction(operation: ProjectHistoryOperation): Promise<void> {
    if (operation.kind === "compare") await this.compare(operation.from, operation.to);
    else if (operation.kind === "inspect") await this.inspect(operation.revision);
    else if (operation.kind === "milestone") await this.nameMilestone(operation.revision);
    else if (operation.kind === "branch") await this.branch(operation.revision);
    else await this.restore(operation.revision);
  }

  private startOperation(operation: ProjectHistoryOperation): number | null {
    this.workflow.send({ type: "START_OPERATION", operation });
    const history = this.workflow.getSnapshot();
    this.syncBusy();
    return history.context.operation === operation ? history.context.requestId : null;
  }

  private finishOperation(requestId: number): boolean {
    this.workflow.send({ type: "OPERATION_DONE", requestId });
    this.syncBusy();
    const history = this.workflow.getSnapshot();
    return history.matches("ready") && history.context.requestId === requestId;
  }

  private failOperation(requestId: number, error: unknown, fallback: string): void {
    const message = errorMessage(error, fallback);
    this.workflow.send({ type: "OPERATION_FAILED", requestId, message });
    this.syncBusy();
    const history = this.workflow.getSnapshot();
    if (history.matches("ready") && history.context.requestId === requestId) this.emitNotice(message);
  }

  private async inspect(revision: number): Promise<void> {
    const requestId = this.startOperation({ kind: "inspect", revision });
    if (requestId === null) return;
    try {
      const response = await fetch(`${this.apiBase}/history/${revision}`, { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isProjectRevisionContent(value)) throw new Error("Project revision returned an invalid snapshot");
      if (this.finishOperation(requestId)) this.panel()?.showRevision(value);
    } catch (error) {
      this.failOperation(requestId, error, "Could not inspect project revision");
    }
  }

  private async compare(from: number, to: number): Promise<void> {
    const requestId = this.startOperation({ kind: "compare", from, to });
    if (requestId === null) return;
    try {
      const response = await fetch(`${this.apiBase}/history/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
        credentials: "same-origin",
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isProjectRevisionDiff(value)) throw new Error("Project history returned an invalid comparison");
      if (this.finishOperation(requestId)) this.panel()?.showComparison(value);
    } catch (error) {
      this.failOperation(requestId, error, "Could not compare project revisions");
    }
  }

  private async nameMilestone(revision: number): Promise<void> {
    const name = window.prompt(`Name immutable milestone v${revision}`)?.trim();
    if (!name) return;
    const description = window.prompt("Optional milestone description")?.trim() ?? "";
    const requestId = this.startOperation({ kind: "milestone", revision });
    if (requestId === null) return;
    try {
      await expectOk(await jsonFetch(`${this.apiBase}/history/${revision}/milestones`, { name, description }));
      this.finishOperation(requestId);
      this.emitNotice(`Milestone “${name}” now identifies v${revision}.`);
      if (this.isOpen()) await this.open();
    } catch (error) {
      this.failOperation(requestId, error, "Could not name the milestone");
    }
  }

  private async restore(revision: number): Promise<void> {
    if (!window.confirm(`Restore v${revision} as a new head revision? Current history will be preserved.`)) return;
    const requestId = this.startOperation({ kind: "restore", revision });
    if (requestId === null) return;
    try {
      await expectOk(await jsonFetch(`${this.apiBase}/history/${revision}/restore`, {}));
      this.finishOperation(requestId);
      this.emitNotice(`Restored v${revision} as a new head.`);
      window.location.reload();
    } catch (error) {
      this.failOperation(requestId, error, "Could not restore the revision");
    }
  }

  private async branch(revision: number): Promise<void> {
    const title = window.prompt(`Name the new project seeded from v${revision}`)?.trim();
    if (!title) return;
    const requestId = this.startOperation({ kind: "branch", revision });
    if (requestId === null) return;
    try {
      const response = await jsonFetch(`${this.apiBase}/history/${revision}/seed`, { title });
      await expectOk(response);
      const value: unknown[] = [await response.json()];
      if (!isWorkspaceSummaries(value) || !value[0]) throw new Error("Project branch returned an invalid workspace");
      this.finishOperation(requestId);
      window.location.assign(value[0].href);
    } catch (error) {
      this.failOperation(requestId, error, "Could not branch from the revision");
    }
  }

  private syncBusy(): void {
    const busy = projectHistoryBusy(this.workflow.getSnapshot());
    this.dialog()?.setAttribute("aria-busy", String(busy));
    this.panel()?.setBusy(busy);
  }

  private emitNotice(message: string): void {
    this.dispatchEvent(new CustomEvent<string>(projectHistoryOutcomeEvent, { bubbles: true, detail: message }));
  }

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
