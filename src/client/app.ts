import * as Y from "yjs";
import "./app/action-menu-controller";
import { parseAppBootstrap } from "./app/app-contracts";
import { collectAppElements } from "./app/app-elements";
import { startLayoutDiagnostics } from "./app/layout-diagnostics";
import { CollaborationSession } from "./collaboration/collaboration-session";
import { CollaborationSocket } from "./collaboration/collaboration-socket";
import { errorMessage } from "./platform/http";
import { createBrowserOfflineWorkspaceSession } from "./platform/offline-workspace";

const { workspaceId, identityEmail, apiBase, workspaceMode } = parseAppBootstrap(document.body.dataset);
startLayoutDiagnostics();
const elements = collectAppElements();
const session = new CollaborationSession(new Y.Doc());
const offline = createBrowserOfflineWorkspaceSession(identityEmail, workspaceId, session, elements);
const socket = new CollaborationSocket(session, apiBase, offline, elements);

void elements.projectFileDialog
  .startApplication(apiBase, workspaceId, workspaceMode, elements, session, offline, socket)
  .catch((error: unknown) => (document.body.textContent = errorMessage(error, "Kirjolab failed to start")));
