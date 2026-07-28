import * as Y from "yjs";
import "./action-menu-controller";
import { parseAppBootstrap } from "./app-contracts";
import { collectAppElements } from "./app-elements";
import { CollaborationSession } from "./collaboration-session";
import { CollaborationSocket } from "./collaboration-socket";
import { errorMessage } from "./http";
import { createBrowserOfflineWorkspaceSession } from "./offline-workspace";

const { workspaceId, identityEmail, apiBase, workspaceMode } = parseAppBootstrap(document.body.dataset);
const elements = collectAppElements();
const session = new CollaborationSession(new Y.Doc());
const offline = createBrowserOfflineWorkspaceSession(identityEmail, workspaceId, session, elements);
const socket = new CollaborationSocket(session, apiBase, offline, elements);

void elements.projectFileDialog
  .startApplication(apiBase, workspaceId, workspaceMode, elements, session, offline, socket)
  .catch((error: unknown) => (document.body.textContent = errorMessage(error, "Kirjolab failed to start")));
