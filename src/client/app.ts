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
  readonly #document = new Y.Doc();
  readonly #resourceRefresh = new CoalescedRefresh(async () => this.#elements.projectFileDialog.refreshProject());
  readonly #collaboration = new CollaborationSession(this.#document);
  readonly #collaborationSocket: CollaborationSocket;
  readonly #offline = new OfflineWorkspaceSession({
    browser: { logout: document.querySelector<HTMLAnchorElement>("#log-out") },
    collaboration: this.#collaboration,
    owners: this.#elements,
    store: createOfflineWorkspaceStore(typeof indexedDB === "undefined" ? undefined : indexedDB, identityEmail, workspaceId),
    workspaceId,
  });
  constructor() {
    const socketUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${apiBase}/socket`;
    this.#collaborationSocket = new CollaborationSocket(
      this.#collaboration,
      socketUrl,
      this.#offline,
      this.#resourceRefresh,
      this.#elements,
    );
  }

  async start(): Promise<void> {
    this.#bindUi();
    this.#elements.workspaceSurfaces.dataset.ready = "true";
    void this.#elements.applicationVersion.prepareOfflineShell(appMode === "workspace", this.#offline, this.#elements.toast);
    if (await this.#elements.referenceLibraryWorkspace.startStandalone(appMode === "library", this.#elements)) return;
    await this.#elements.projectFileDialog.openWorkspace();
    await this.#elements.workspaceSurfaceSwitcher.restoreRoute();
    void this.#elements.gitHubSyncMenu.refreshWorkspace(true);
    this.#collaborationSocket.connect();
    await this.#elements.newWorkspaceStartingPoints.openFromBrowserRequest();
  }

  #bindUi(): void {
    this.#elements.assistantGenerationPresenter.bindAuthoring(this.#collaboration, this.#elements);
    this.#elements.workspaceCatalogPanel.bindWorkspace(workspaceId, this.#elements);
    this.#elements.workspaceSettingsPanel.bindWorkspace(this.#elements.workspaceSettings, workspaceId, this.#elements);
    this.#elements.newWorkspaceStartingPoints.bindWorkspace(this.#elements);
    this.#elements.gitHubSyncMenu.bindWorkspace(apiBase, appMode === "workspace", this.#resourceRefresh, this.#elements);
    this.#elements.saveTemplateDialog.bindWorkspace(apiBase, this.#elements.newWorkspaceStartingPoints, this.#elements.toast);
    this.#elements.researchDiaryPanel.bindProject(this.#elements.projectFileDialog);
    this.#elements.manuscriptMapPanel.bindProjectPresentation(this.#elements);
    for (const panel of [this.#elements.researchQuestionPanel, this.#elements.reviewerResponsePanel]) {
      panel.bindProject(this.#elements.projectFileDialog, this.#elements.toast);
    }
    this.#elements.workspaceSharingPanel.configure(apiBase, this.#elements);
    this.#elements.referenceLibraryWorkspace.bindWorkspace(workspaceId, appMode === "workspace" ? apiBase : null, this.#elements);
    this.#elements.editorStatus.bindAuthoring(this.#document, this.#elements.source, this.#elements, this.#collaborationSocket);
    this.#elements.vimModeControl.bindEditor(this.#elements.source, this.#elements.sourceEditorShell);
    this.#elements.sourceCompletion.bindWorkspace(apiBase, this.#elements);
    this.#elements.projectFileDialog.configureApi(apiBase, this.#elements, this.#elements.workspaceLayout);
    this.#elements.projectFileDialog.bindLiveContent(this.#document, this.#collaboration);
    this.#elements.projectFileDialog.bindProjectRefresh(appMode === "workspace", this.#elements, this.#collaboration, this.#offline);
    this.#elements.workspacePreview.bindProject(apiBase, this.#document, this.#elements);
    this.#elements.editorInsertMenu.bind(this.#elements.editorStatus, this.#elements.toast);
    this.#elements.projectHistoryDialog.configure(apiBase, this.#elements);
    this.#elements.projectHistoryTrigger.bindRevision(this.#elements, () => this.#offline.schedule());
    this.#elements.contextResourcePresenter.bindProjectKnowledge(apiBase, this.#elements);
    this.#elements.workspaceLayout.bindWorkspace(workspaceId, this.#elements);
    this.#elements.contextResourcePresenter.bindContext(appMode === "workspace" ? apiBase : null, this.#elements);
    this.#elements.contextResourcePresenter.bindRoutes(this.#document, this.#collaboration, this.#resourceRefresh, this.#elements);
    this.#elements.workspaceSurfaceSwitcher.bindWorkspaceRoute(appMode === "workspace", this.#elements);
    this.#elements.assistantGenerationPresenter.bindWorkflow(this.#resourceRefresh, this.#elements);
    this.#elements.assistantGenerationPresenter.bindWorkspace(apiBase);
  }
}

if (typeof document !== "undefined") {
  const app = new WorkspaceApp();
  void app.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Kirjolab failed to start";
    document.body.textContent = message;
  });
}
