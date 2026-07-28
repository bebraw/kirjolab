import * as Y from "yjs";
import "./action-menu-controller";
import { parseAppBootstrap } from "./app-contracts";
import { collectAppElements } from "./app-elements";
import { projectFileCollaborationTextName } from "../domain/project-files";
import "./application-version-control";
import "./source-citation-control";
import "./workspace-surface-switcher";
import "./project-starting-point-browser";
import { WorkspaceLayoutManager } from "./workspace-layout-manager";
import "./workspace-layout-control";
import "./research-diary-summary";
import { loadWorkspaceSnapshot } from "./workspace-snapshot-client";
import { CoalescedRefresh } from "./collaboration";
import { CollaborationSession } from "./collaboration-session";
import { CollaborationSocket } from "./collaboration-socket";
import "./manuscript-map-panel";
import { createOfflineWorkspaceStore, OfflineWorkspaceSession } from "./offline-workspace";
import { PdfEvidenceViewer } from "./pdf-viewer";
import { bindThemePreference } from "./theme";
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
  readonly #source = this.#document.getText("source");
  readonly #bibliography = this.#document.getText("bibliography");
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
    this.#collaborationSocket = new CollaborationSocket(this.#collaboration, {
      beforeRemoteUpdate: () => this.#elements.editorStatus.preserveSelections(),
      clearOffline: () => this.#offline.clear(),
      connectionChanged: () => this.#elements.connectionStatus.presentWorkflow(),
      disconnected: () => this.#elements.collaboratorSelections.clear(),
      documentUpdated: () => this.#elements.assistantGenerationPresenter.refreshAvailability(),
      resourcesChanged: () => {
        void this.#resourceRefresh.request().catch((error: unknown) => {
          this.#elements.toast.show(error instanceof Error ? error.message : "Could not refresh project resources");
        });
      },
      revisionCompleted: (revision) => {
        this.#elements.projectHistoryTrigger.observeRevision(revision);
        this.#elements.editorStatus.setSave(this.#collaboration.pendingCount === 0 ? "Saved" : "Saving…");
      },
      revisionObserved: (revision) => this.#elements.projectHistoryTrigger.observeRevision(revision),
      selection: () => {
        const fileId = this.#elements.projectFileDialog.activeFileId;
        return fileId
          ? {
              fileId,
              start: this.#elements.source.selectionStart,
              end: this.#elements.source.selectionEnd,
              revision: this.#elements.projectHistoryTrigger.value,
            }
          : null;
      },
      selectionCleared: (collaboratorId) => this.#elements.collaboratorSelections.removeSelection(collaboratorId),
      selectionReceived: (selection) => this.#elements.collaboratorSelections.receive(selection),
      socketUrl: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${apiBase}/socket`,
    });
    this.#pdfViewer = PdfEvidenceViewer.forDocument(document, {
      onSelection: (capture) => this.#elements.contextResourcePresenter.capturePdfSelection(capture),
      onHighlight: (annotationId, fragmentId) => this.#elements.contextResourcePresenter.activateProjectHighlight(annotationId, fragmentId),
      onPageChange: (page) => this.#elements.contextResourcePresenter.presentPdfPage(page),
      onPrivateHighlight: (highlightId) => this.#elements.contextResourcePresenter.selectLibraryHighlight(highlightId),
    });
    this.#layout = WorkspaceLayoutManager.forWorkspace(this.#elements.workspaceSurfaces, {
      paneStorageKey: () =>
        `kirjolab:authoring-pane:${workspaceId}:${this.#elements.contextResourcePresenter.activeTab?.kind ?? "preview"}`,
      resizePdf: () => void this.#pdfViewer.resize(),
    });
    this.#elements.previewSyncControls.bindSource(this.#elements.source, this.#elements.sourceHighlight, {
      focusSource: ({ fileId, offset }) => this.#elements.projectFileDialog.focusRange(fileId, offset, offset),
      previewOffset: () => this.#elements.workspacePreview.centeredSourceOffset(),
      sourceToPreview: (explicit) => this.#elements.workspacePreview.syncFromSource(explicit),
    });
  }

  async start(): Promise<void> {
    bindThemePreference(document.documentElement, this.#elements.themePreference, localStorage);
    this.#bindUi();
    this.#elements.workspaceSurfaces.dataset.ready = "true";
    void this.#elements.applicationVersion.prepareOfflineShell(appMode === "workspace", {
      persist: () => this.#offline.persist(),
      pinUpdate: (refresh) =>
        this.#elements.toast.pin("A new version of Kirjolab is available.", { action: refresh, actionLabel: "Refresh now" }),
    });
    if (
      await this.#elements.referenceLibraryWorkspace.startStandalone(appMode === "library", {
        connection: this.#elements.connectionStatus,
        surfaces: this.#elements.workspaceSurfaces,
      })
    )
      return;
    await this.#elements.projectFileDialog.openWorkspace();
    await this.#elements.workspaceSurfaceSwitcher.restoreRoute();
    void this.#elements.gitHubSyncMenu.refreshWorkspace(true);
    this.#collaborationSocket.connect();
    await this.#elements.newWorkspaceStartingPoints.openFromBrowserRequest();
  }

  #bindUi(): void {
    this.#elements.assistantGenerationPresenter.bindAuthoring({
      collaboration: this.#collaboration,
      editor: this.#elements.editorStatus,
      history: this.#elements.projectHistoryTrigger,
      project: this.#elements.projectFileDialog,
    });
    this.#elements.contextResourcePresenter.bindCandidatePresentation(this.#elements.assistantGenerationPresenter);
    this.#elements.applicationVersion.bindNotice((message) => this.#elements.toast.show(message));
    this.#elements.connectionStatus.bindWorkflow(this.#collaboration, this.#elements);
    this.#collaborationSocket.bindBrowserLifecycle();
    this.#offline.bindBrowserLifecycle(document.querySelector<HTMLAnchorElement>("#log-out"), (error) =>
      this.#elements.toast.show(error instanceof Error ? error.message : "Could not clear offline data"),
    );
    this.#elements.workspaceLayout.configure(workspaceId, this.#elements.workspaceSurfaces);
    this.#elements.workspaceCatalogPanel.configure(catalogBase, workspaceId, this.#elements.workspaceSwitcher);
    this.#elements.workspaceCatalogPanel.bindTrigger(this.#elements.manageWorkspaces);
    this.#elements.newWorkspaceStartingPoints.bindWorkspaces(this.#elements.workspaceCatalogPanel);
    this.#elements.workspaceSettingsPanel.bindWorkspace(this.#elements.workspaceSettings, workspaceId, this.#elements);
    this.#elements.newWorkspaceStartingPoints.bindTrigger(this.#elements.newWorkspace);
    this.#elements.newWorkspaceStartingPoints.bind(this.#elements);
    this.#elements.gitHubSyncMenu.bindWorkspace(apiBase, {
      ambientRefresh: appMode === "workspace",
      settings: this.#elements.workspaceSettingsPanel,
      openSettings: (checkGitHub) => this.#elements.workspaceSettingsPanel.openSettings(checkGitHub),
      refreshProject: () => this.#resourceRefresh.request(),
    });
    this.#elements.gitHubImportPanel.openFromBrowserResult();
    this.#elements.saveTemplateDialog.configure(apiBase);
    this.#elements.saveTemplateDialog.bindTemplates(this.#elements.newWorkspaceStartingPoints, (message) =>
      this.#elements.toast.show(message),
    );
    this.#elements.researchDiaryPanel.bindProject(this.#elements.projectFileDialog);
    this.#elements.manuscriptMapPanel.bindProjectPresentation(this.#elements);
    for (const panel of [this.#elements.researchQuestionPanel, this.#elements.reviewerResponsePanel]) {
      panel.bindProject(this.#elements.projectFileDialog, this.#elements.toast);
    }
    this.#elements.workspaceSharingPanel.configure(apiBase, {
      presentNotice: (message) => this.#elements.toast.show(message),
      trigger: this.#elements.shareWorkspace,
    });
    this.#elements.referenceLibraryWorkspace.configure(workspaceId);
    this.#elements.referenceLibraryWorkspace.bindProject(appMode === "workspace" ? apiBase : null, this.#elements);
    this.#elements.editorStatus.bindAuthoring(this.#document, this.#elements.source, {
      authoring: this.#elements.authoringModeTabs,
      assistant: this.#elements.assistantGenerationPresenter,
      citation: this.#elements.sourceCitationControl,
      collaboration: this.#collaborationSocket,
      context: this.#elements.contextResourcePresenter,
      highlight: this.#elements.sourceHighlight,
      notices: this.#elements.toast,
      presence: this.#elements.collaboratorSelections,
    });
    this.#elements.editorStatus.setAuthoringContext("Manuscript", null, this.#source, true);
    this.#elements.vimModeControl.bindEditor(this.#elements.source, this.#elements.sourceEditorShell);
    this.#elements.sourceCompletion.bindEditor(this.#elements.source, this.#elements.citationCompletionScope);
    this.#elements.editorStatus.bindCompanion(this.#elements.bibliography, this.#bibliography);
    this.#elements.projectImageUpload.configure(apiBase);
    this.#elements.projectFileDialog.configureApi(apiBase);
    this.#elements.projectFileDialog.bindWorkflow({
      activateAuthoring: () => this.#elements.authoringModeTabs.navigate("write"),
      actionControls: [this.#elements.projectFileRailActions, this.#elements.projectFileMenuActions],
      focusEditor: () => this.#elements.source.focus(),
      imageUpload: this.#elements.projectImageUpload,
      insertImage: ({ message, syntax }) => this.#elements.editorInsertMenu.insert({ text: syntax }, message),
      prepareInclude: () => this.#elements.editorStatus.preserveInsertionPoint(),
      quickOpen: () => {
        this.#layout.setRailCollapsed(false);
        this.#elements.workspaceRailTabs.navigate("files");
      },
      revealEditor: () => this.#elements.source.scrollIntoView({ behavior: "smooth", block: "center" }),
      saved: ({ message }) => this.#elements.toast.show(message),
      selectRange: (from, to) => this.#elements.editorStatus.selectRange(from, to),
      tree: this.#elements.projectTreePanel,
    });
    this.#elements.projectFileDialog.bindPresentation(this.#elements);
    this.#elements.projectFileDialog.bindLiveContent(
      (file, entryFileId) => this.#document.getText(projectFileCollaborationTextName(file, entryFileId)).toString(),
      () => this.#collaboration.synced || this.#collaboration.offlineAvailable,
    );
    this.#elements.projectFileDialog.bindProjectRefresh({
      assetBase: `${apiBase}/assets`,
      bibliography: this.#elements.bibliography,
      catalog: this.#elements.workspaceCatalogPanel,
      collaboration: this.#collaboration,
      connection: this.#elements.connectionStatus,
      context: this.#elements.contextResourcePresenter,
      history: this.#elements.projectHistoryTrigger,
      load: () => loadWorkspaceSnapshot(apiBase, this.#document, this.#collaboration.synced),
      offline: this.#offline,
      preview: this.#elements.workspacePreview,
      source: this.#elements.source,
      workspace: appMode === "workspace",
    });
    this.#elements.workspacePreview.bindProject(apiBase, this.#document, this.#elements);
    this.#elements.editorInsertMenu.bind({
      authoring: this.#elements.editorStatus,
      notices: this.#elements.toast,
    });
    this.#elements.sourceCompletion.bindProjectAcceptance(apiBase, this.#elements);
    this.#elements.projectHistoryDialog.configure(apiBase, {
      presentNotice: (message) => this.#elements.toast.show(message),
      trigger: this.#elements.projectHistoryTrigger,
    });
    this.#elements.projectHistoryTrigger.bindRevision(this.#elements, () => this.#offline.schedule());
    this.#elements.contextResourcePresenter.bindManuscriptComments(apiBase);
    this.#collaborationSocket.bindDocument(this.#document, {
      offline: this.#offline,
      offlineOrigin,
      save: (status) => this.#elements.editorStatus.setSave(status),
    });
    this.#elements.contextResourcePresenter.bindProjectEvidence(apiBase);
    this.#elements.contextResourcePresenter.bindProjectMap(apiBase, {
      document: this.#elements.projectFileDialog,
      person: this.#elements.workspaceSharingPanel,
      preview: this.#elements.workspacePreview,
      project: this.#elements.workspaceSwitcher,
    });
    this.#elements.contextResourcePresenter.bindPublicationList(apiBase, this.#elements.referenceLibraryWorkspace);
    this.#elements.contextResourcePresenter.bindProjectAnnotationIntake();
    this.#elements.contextResourcePresenter.bindProjectAnnotationWorkflow();
    this.#elements.contextResourcePresenter.bindLibraryPdf({
      acceptProjectMutation: (snapshot) => this.#elements.referenceLibraryWorkspace.applyProjectMutation(snapshot),
      canInsertCitation: () => this.#elements.editorStatus.caret !== null,
      completeMarkup: (message) =>
        void this.#elements.referenceLibraryWorkspace.completeRefresh(
          message,
          "The annotation changed, but the refreshed Library could not be loaded.",
        ),
      openPdf: (artifact, page) => this.#elements.contextResourcePresenter.openLibraryPdf(artifact, page),
      projectApiBase: apiBase,
    });
    this.#elements.contextResourcePresenter.bindContext({
      assistant: this.#elements.assistantGenerationPresenter,
      authoring: this.#elements.editorStatus,
      layout: this.#layout,
      library: this.#elements.referenceLibraryWorkspace,
      project: this.#elements.projectFileDialog,
      projectApiBase: appMode === "workspace" ? apiBase : null,
      routes: this.#elements.workspaceSurfaceSwitcher,
      standaloneLibrary: appMode === "library",
    });
    this.#elements.contextResourcePresenter.bindRoutes({
      authoring: () => ({
        passage: this.#elements.editorStatus.selectedPassage(),
        sourceRevision: this.#elements.projectHistoryTrigger.value,
        stable: this.#collaboration.stable,
      }),
      document: () => this.#document,
      insertCitation: (citationAlias, locator) => this.#elements.sourceCitationControl.insertCitation(citationAlias, locator),
      presentNotice: (message) => this.#elements.toast.show(message),
      refreshResources: () => this.#resourceRefresh.request(),
      refreshLibrary: () => this.#elements.referenceLibraryWorkspace.refreshBoundProject(),
      selectPassage: (fileId, start, end) => this.#elements.projectFileDialog.revealRange(fileId, start, end),
    });
    this.#elements.contextResourcePresenter.bindPdfViewer(this.#pdfViewer, apiBase);
    this.#elements.libraryPdfInspector.bindProjectMutations(this.#elements.referenceLibraryWorkspace);
    this.#elements.contextResourcePresenter.bindClaimList(apiBase);
    this.#elements.workspaceSurfaceSwitcher.bindWorkspaceRoute({
      context: this.#elements.contextResourcePresenter,
      enabled: appMode === "workspace",
      layout: this.#elements.workspaceLayout,
      mode: this.#elements.authoringModeTabs,
      project: this.#elements.projectFileDialog,
      rail: this.#elements.workspaceRailTabs,
      source: this.#elements.source,
    });
    this.#layout.bind();
    this.#elements.contextResourcePresenter.bindPublicationContext(apiBase);
    this.#elements.assistantGenerationPresenter.bindResources(this.#elements.contextResourcePresenter.assistantResources());
    this.#elements.assistantGenerationPresenter.bindWorkflow({
      applyTable: (target, insertion) => this.#elements.editorInsertMenu.replacePassage(target, insertion),
      context: this.#elements.contextResourcePresenter,
      openEvidenceRail: () => this.#elements.workspaceRailTabs.navigate("research"),
      presentNotice: (message) => this.#elements.toast.show(message),
      refreshResources: () => this.#resourceRefresh.request(),
    });
    this.#elements.assistantGenerationPresenter.bindCandidate(apiBase);
    this.#elements.assistantGenerationPresenter.bindResults();
    this.#elements.assistantGenerationPresenter.bindControls();
  }
}

if (typeof document !== "undefined") {
  const app = new WorkspaceApp();
  void app.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Kirjolab failed to start";
    document.body.textContent = message;
  });
}
