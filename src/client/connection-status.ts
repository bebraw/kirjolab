import { html, type TemplateResult } from "lit";
import { LightDomElement } from "./light-dom-controller";

export interface ConnectionWorkflow {
  readonly canEdit: boolean;
  readonly status: { readonly connected: boolean; readonly label: string };
}

export interface ConnectionWorkflowOwners {
  readonly assistantGenerationPresenter: { readonly refreshAvailability: () => void };
  readonly bibliography: HTMLTextAreaElement;
  readonly editorStatus: { readonly setSave: (message: string) => void };
  readonly source: HTMLTextAreaElement;
}

export class ConnectionStatus extends LightDomElement {
  static override properties = {
    connected: { state: true },
    label: { state: true },
  };

  declare private connected: boolean;
  declare private label: string;
  private workflow: ConnectionWorkflow | null = null;
  private workflowOwners: ConnectionWorkflowOwners | null = null;

  constructor() {
    super();
    this.connected = false;
    this.label = "Connecting";
  }

  setConnection(label: string, connected: boolean): void {
    this.label = label;
    this.connected = connected;
  }

  bindWorkflow(workflow: ConnectionWorkflow, owners: ConnectionWorkflowOwners): void {
    this.workflow = workflow;
    this.workflowOwners = owners;
  }

  presentWorkflow(): void {
    const workflow = this.workflow;
    const owners = this.workflowOwners;
    if (!workflow || !owners) return;
    const status = workflow.status;
    this.setConnection(status.label, status.connected);
    owners.source.disabled = !workflow.canEdit;
    owners.bibliography.disabled = !workflow.canEdit;
    owners.assistantGenerationPresenter.refreshAvailability();
  }

  presentOfflineRestore(pending: boolean): void {
    this.presentWorkflow();
    this.workflowOwners?.editorStatus.setSave(pending ? "Saved offline" : "Saved");
  }

  protected override render(): TemplateResult {
    const tone = this.connected ? "bg-app-accent" : "bg-app-warn";
    return html`
      <span class="h-2 w-2 rounded-full ${tone}" id="connection-dot"></span>
      <span id="connection-status">${this.label}</span>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("connection-status-panel")) {
  customElements.define("connection-status-panel", ConnectionStatus);
}

declare global {
  interface HTMLElementTagNameMap {
    "connection-status-panel": ConnectionStatus;
  }
}
