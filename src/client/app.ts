import * as Y from "yjs";
import "./action-menu-controller";
import { parseAppBootstrap } from "./app-contracts";
import { collectAppElements } from "./app-elements";
import { CoalescedRefresh } from "./collaboration";
import { CollaborationSession } from "./collaboration-session";
import { CollaborationSocket } from "./collaboration-socket";
import { createOfflineWorkspaceStore, OfflineWorkspaceSession } from "./offline-workspace";

const { workspaceId, identityEmail, appMode } = parseAppBootstrap(document.body.dataset);
const apiBase = `/api/workspaces/${workspaceId}`;

class WorkspaceApp {
  readonly #elements = collectAppElements();
  readonly #refresh = new CoalescedRefresh(async () => this.#elements.projectFileDialog.refreshProject());
  readonly #session = new CollaborationSession(new Y.Doc());
  readonly #offline = new OfflineWorkspaceSession({
    browser: { logout: document.querySelector<HTMLAnchorElement>("#log-out") },
    collaboration: this.#session,
    owners: this.#elements,
    store: createOfflineWorkspaceStore(typeof indexedDB === "undefined" ? undefined : indexedDB, identityEmail, workspaceId),
    workspaceId,
  });
  readonly #socket = new CollaborationSocket(this.#session, apiBase, this.#offline, this.#refresh, this.#elements);

  async start(): Promise<void> {
    this.#bindUi();
    void this.#elements.applicationVersion.prepareOfflineShell(appMode === "workspace", this.#offline, this.#elements.toast);
    if (await this.#elements.referenceLibraryWorkspace.start(workspaceId, appMode === "workspace" ? apiBase : null, this.#elements)) return;
    await this.#elements.projectFileDialog.startWorkspace(this.#elements, this.#socket);
  }

  #bindUi(): void {
    const owners = this.#elements;
    owners.contextResourcePresenter.bindApplication(apiBase, appMode === "workspace", this.#session, this.#refresh, this.#socket, owners);
    owners.workspaceSettingsPanel.bindApplication(workspaceId, apiBase, appMode === "workspace", this.#refresh, owners);
    owners.projectFileDialog.bindApplication(apiBase, appMode === "workspace", owners, this.#session, this.#offline);
    owners.workspaceLayout.bindApplication(workspaceId, appMode === "workspace", owners);
  }
}

if (typeof document !== "undefined") {
  const app = new WorkspaceApp();
  void app.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Kirjolab failed to start";
    document.body.textContent = message;
  });
}
