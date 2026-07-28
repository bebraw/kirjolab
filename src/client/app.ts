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
const workspaceMode = appMode === "workspace";
const elements = collectAppElements();
const refresh = new CoalescedRefresh(async () => elements.projectFileDialog.refreshProject());
const session = new CollaborationSession(new Y.Doc());
const offline = new OfflineWorkspaceSession({
  browser: { logout: document.querySelector<HTMLAnchorElement>("#log-out") },
  collaboration: session,
  owners: elements,
  store: createOfflineWorkspaceStore(typeof indexedDB === "undefined" ? undefined : indexedDB, identityEmail, workspaceId),
  workspaceId,
});
const socket = new CollaborationSocket(session, apiBase, offline, refresh, elements);

function bindUi(): void {
  elements.contextResourcePresenter.bindApplication(apiBase, workspaceMode, session, refresh, socket, elements);
  elements.workspaceSettingsPanel.bindApplication(workspaceId, apiBase, workspaceMode, refresh, elements);
  elements.projectFileDialog.bindApplication(apiBase, workspaceId, workspaceMode, elements, session, offline);
}

async function start(): Promise<void> {
  bindUi();
  void elements.applicationVersion.prepareOfflineShell(workspaceMode, offline, elements.toast);
  if (await elements.referenceLibraryWorkspace.start(workspaceId, workspaceMode ? apiBase : null, elements)) return;
  await elements.projectFileDialog.startWorkspace(elements, socket);
}

if (typeof document !== "undefined") {
  void start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Kirjolab failed to start";
    document.body.textContent = message;
  });
}
