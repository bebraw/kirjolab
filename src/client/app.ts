import * as Y from "yjs";
import "./action-menu-controller";
import { parseAppBootstrap } from "./app-contracts";
import { collectAppElements } from "./app-elements";
import { CollaborationSession } from "./collaboration-session";
import { CollaborationSocket } from "./collaboration-socket";
import { createBrowserOfflineWorkspaceSession } from "./offline-workspace";

const { workspaceId, identityEmail, appMode } = parseAppBootstrap(document.body.dataset);
const apiBase = `/api/workspaces/${workspaceId}`;
const workspaceMode = appMode === "workspace";
const elements = collectAppElements();
const refresh = elements.projectFileDialog.refreshCoordinator;
const session = new CollaborationSession(new Y.Doc());
const offline = createBrowserOfflineWorkspaceSession(identityEmail, workspaceId, session, elements);
const socket = new CollaborationSocket(session, apiBase, offline, refresh, elements);

async function start(): Promise<void> {
  elements.contextResourcePresenter.bindApplication(apiBase, workspaceMode, session, refresh, socket, elements);
  elements.workspaceSettingsPanel.bindApplication(workspaceId, apiBase, workspaceMode, refresh, elements);
  elements.projectFileDialog.bindApplication(apiBase, workspaceId, workspaceMode, elements, session, offline);
  void elements.applicationVersion.prepareOfflineShell(workspaceMode, offline, elements.toast);
  if (await elements.referenceLibraryWorkspace.start(workspaceId, workspaceMode ? apiBase : null, elements)) return;
  await elements.projectFileDialog.startWorkspace(elements, socket);
}

void start().catch((error: unknown) => {
  document.body.textContent = error instanceof Error ? error.message : "Kirjolab failed to start";
});
