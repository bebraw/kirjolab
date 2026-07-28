import * as Y from "yjs";
import "./action-menu-controller";
import { parseAppBootstrap } from "./app-contracts";
import { collectAppElements } from "./app-elements";
import "./application-version-control";
import "./source-citation-control";
import "./workspace-surface-switcher";
import "./project-starting-point-browser";
import { WorkspaceLayoutManager } from "./workspace-layout-manager";
import "./workspace-layout-control";
import "./research-diary-summary";
import { CoalescedRefresh } from "./collaboration";
import { CollaborationSession } from "./collaboration-session";
import { CollaborationSocket } from "./collaboration-socket";
import "./manuscript-map-panel";
import { createOfflineWorkspaceStore, OfflineWorkspaceSession } from "./offline-workspace";
import { PdfEvidenceViewer } from "./pdf-viewer";
import "./workspace-rail-tabs";
import "./authoring-mode-tabs";

const { workspaceId, identityEmail, appMode } = parseAppBootstrap(document.body.dataset);
const catalogBase = "/api/workspaces";
const apiBase = `${catalogBase}/${workspaceId}`;
const remoteOrigin = Symbol("remote");
const offlineOrigin = Symbol("offline");

class WorkspaceApp {
  readonly #elements = collectAppElements();
  readonly #pdfViewer: PdfEvidenceViewer;
  readonly #document = new Y.Doc();
  readonly #resourceRefresh = new CoalescedRefresh(async () => this.#elements.projectFileDialog.refreshProject());
  readonly #collaboration = new CollaborationSession(this.#document, remoteOrigin);
  readonly #collaborationSocket: CollaborationSocket;
  readonly #offline = new OfflineWorkspaceSession({
    document: this.#document,
    failed: (error) => {
      if (!this.#collaboration.synced) this.#elements.editorStatus.setSave("Offline save failed");
      this.#elements.toast.show(error instanceof Error ? error.message : "Could not save the manuscript offline");
    },
    offlineAvailable: () => this.#collaboration.offlineAvailable,
    origin: offlineOrigin,
    saved: (version) => {
      document.body.dataset.offlineCached = "true";
      document.body.dataset.offlineSavedAt = String(version);
      if (!this.#collaboration.synced) this.#elements.editorStatus.setSave("Saved offline");
    },
    serverStateVector: () => this.#collaboration.serverStateVector,
    snapshot: () => this.#elements.projectFileDialog.project,
    store: createOfflineWorkspaceStore(typeof indexedDB === "undefined" ? undefined : indexedDB, identityEmail, workspaceId),
    workspaceId,
  });
  readonly #layout: WorkspaceLayoutManager;

  constructor() {
    const socketUrl = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${apiBase}/socket`;
    this.#collaborationSocket = new CollaborationSocket(
      this.#collaboration,
      socketUrl,
      this.#offline,
      this.#resourceRefresh,
      this.#elements,
    );
    this.#pdfViewer = PdfEvidenceViewer.forDocument(document, this.#elements.contextResourcePresenter);
    this.#layout = WorkspaceLayoutManager.forWorkspace(workspaceId, this.#elements, this.#pdfViewer);
    this.#elements.previewSyncControls.bindSource(this.#elements);
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
    this.#elements.contextResourcePresenter.bindCandidatePresentation(this.#elements.assistantGenerationPresenter);
    this.#elements.connectionStatus.bindWorkflow(this.#collaboration, this.#elements);
    this.#offline.bindBrowserLifecycle(document.querySelector<HTMLAnchorElement>("#log-out"), this.#elements.toast);
    this.#elements.workspaceLayout.configure(workspaceId, this.#elements.workspaceSurfaces);
    this.#elements.workspaceCatalogPanel.bindWorkspace(catalogBase, workspaceId, this.#elements);
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
    this.#elements.sourceCompletion.bindEditor(this.#elements.source, this.#elements.citationCompletionScope);
    this.#elements.editorStatus.bindBibliography(this.#elements.bibliography);
    this.#elements.projectFileDialog.configureApi(apiBase, this.#elements, this.#layout);
    this.#elements.projectFileDialog.bindLiveContent(this.#document, this.#collaboration);
    this.#elements.projectFileDialog.bindProjectRefresh(appMode === "workspace", this.#elements, this.#collaboration, this.#offline);
    this.#elements.workspacePreview.bindProject(apiBase, this.#document, this.#elements);
    this.#elements.editorInsertMenu.bind(this.#elements.editorStatus, this.#elements.toast);
    this.#elements.sourceCompletion.bindProjectAcceptance(apiBase, this.#elements);
    this.#elements.projectHistoryDialog.configure(apiBase, this.#elements);
    this.#elements.projectHistoryTrigger.bindRevision(this.#elements, () => this.#offline.schedule());
    this.#elements.contextResourcePresenter.bindManuscriptComments(apiBase);
    this.#collaborationSocket.bindDocument(this.#document, offlineOrigin);
    this.#elements.contextResourcePresenter.bindProjectEvidence(apiBase);
    this.#elements.contextResourcePresenter.bindProjectMap(apiBase, this.#elements);
    this.#elements.contextResourcePresenter.bindPublicationList(apiBase, this.#elements.referenceLibraryWorkspace);
    this.#elements.contextResourcePresenter.bindProjectAnnotationIntake();
    this.#elements.contextResourcePresenter.bindProjectAnnotationWorkflow();
    this.#elements.contextResourcePresenter.bindLibraryPdf(apiBase, this.#elements);
    this.#elements.contextResourcePresenter.bindContext(appMode === "workspace" ? apiBase : null, this.#layout, this.#elements);
    this.#elements.contextResourcePresenter.bindRoutes(this.#document, this.#collaboration, this.#resourceRefresh, this.#elements);
    this.#elements.contextResourcePresenter.bindPdfViewer(this.#pdfViewer, apiBase);
    this.#elements.libraryPdfInspector.bindProjectMutations(this.#elements.referenceLibraryWorkspace);
    this.#elements.contextResourcePresenter.bindClaimList(apiBase);
    this.#elements.workspaceSurfaceSwitcher.bindWorkspaceRoute(appMode === "workspace", this.#elements);
    this.#elements.contextResourcePresenter.bindPublicationContext(apiBase);
    this.#elements.assistantGenerationPresenter.bindResources(this.#elements.contextResourcePresenter.assistantResources());
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
