import * as Y from "yjs";
import "./action-menu-controller";
import { parseAppBootstrap } from "./app-contracts";
import { collectAppElements } from "./app-elements";
import { reviewerResponsePath, reviewerResponseTemplate } from "../domain/reviewer-response";
import { projectFileCollaborationTextName, type ProjectFile } from "../domain/project-files";
import { researchQuestionsPath, researchQuestionsTemplate } from "../domain/research-questions";
import { researchDiaryPath, researchDiaryTemplate } from "../domain/writing-workflows";
import "./application-version-control";
import "./source-citation-control";
import "./workspace-surface-switcher";
import { expectOk } from "./http";
import { libraryPdfRoute, readLibraryUiRoute } from "./library-ui-route";
import "./project-starting-point-browser";
import { WorkspaceLayoutManager } from "./workspace-layout-manager";
import "./workspace-layout-control";
import { type WritingWorkflowBinding } from "./writing-workflow-panel";
import "./research-diary-summary";
import { type WorkspaceSnapshot } from "../domain/workspace";
import { loadWorkspaceSnapshot, parseWorkspaceSnapshot, WorkspaceAccessError } from "./workspace-snapshot-client";
import { CoalescedRefresh, DebouncedAsyncQueue } from "./collaboration";
import { CollaborationSession } from "./collaboration-session";
import { CollaborationSocket } from "./collaboration-socket";
import "./manuscript-map-panel";
import { clearOfflineShellCaches } from "./offline-service-worker";
import {
  clearAllOfflineWorkspaces,
  createOfflineWorkspaceStore,
  restoreOfflineWorkspaceState,
  type OfflineWorkspaceStore,
} from "./offline-workspace";
import { PdfEvidenceViewer } from "./pdf-viewer";
import { bindThemePreference } from "./theme";
import { RESEARCH_ASSISTANT_KEY, RESEARCH_LIBRARY_KEY, RESEARCH_PREVIEW_KEY } from "./research-context";
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
  readonly #offlineStore: OfflineWorkspaceStore | null = createOfflineWorkspaceStore(
    typeof indexedDB === "undefined" ? undefined : indexedDB,
    identityEmail,
    workspaceId,
  );
  readonly #resourceRefresh = new CoalescedRefresh(async () => this.#refreshSnapshot());
  readonly #collaboration = new CollaborationSession(this.#document, remoteOrigin);
  readonly #collaborationSocket: CollaborationSocket;
  readonly #offlineSaves = new DebouncedAsyncQueue(
    () => this.#persistOfflineWorkspace(),
    (version) => {
      document.body.dataset.offlineCached = "true";
      document.body.dataset.offlineSavedAt = String(version);
      if (!this.#collaboration.synced) this.#elements.editorStatus.setSave("Saved offline");
    },
    (error) => {
      if (!this.#collaboration.synced) this.#elements.editorStatus.setSave("Offline save failed");
      this.#elements.toast.show(error instanceof Error ? error.message : "Could not save the manuscript offline");
    },
  );
  #snapshot: WorkspaceSnapshot | null = null;
  #revision = 0;
  #hasBootstrapSnapshot = false;
  #activeFileText = this.#source;
  readonly #layout: WorkspaceLayoutManager;

  get #librarySnapshot() {
    return this.#elements.referenceLibraryWorkspace.snapshot;
  }

  get #activeFileId(): string | null {
    return this.#elements.projectFileDialog.activeFileId;
  }

  constructor() {
    this.#collaborationSocket = new CollaborationSocket(this.#collaboration, {
      beforeRemoteUpdate: () => this.#elements.editorStatus.preserveSelections(),
      clearOffline: async () => {
        await this.#offlineStore?.clear();
      },
      connectionChanged: () => this.#renderCollaborationWorkflow(),
      disconnected: () => this.#elements.collaboratorSelections.clear(),
      remoteUpdateApplied: () => this.#elements.assistantGenerationPresenter.refreshAvailability(),
      resourcesChanged: () => {
        void this.#resourceRefresh.request().catch((error: unknown) => {
          this.#elements.toast.show(error instanceof Error ? error.message : "Could not refresh project resources");
        });
      },
      revisionCompleted: (revision) => {
        this.#setRevision(revision);
        this.#elements.editorStatus.setSave(this.#collaboration.pendingCount === 0 ? "Saved" : "Saving…");
      },
      revisionObserved: (revision) => this.#setRevision(revision),
      selection: () =>
        this.#activeFileId
          ? {
              fileId: this.#activeFileId,
              start: this.#elements.source.selectionStart,
              end: this.#elements.source.selectionEnd,
              revision: this.#revision,
            }
          : null,
      selectionCleared: (collaboratorId) => this.#elements.collaboratorSelections.removeSelection(collaboratorId),
      selectionReceived: (selection) => this.#elements.collaboratorSelections.receive(selection),
      socketUrl: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${apiBase}/socket`,
    });
    this.#pdfViewer = PdfEvidenceViewer.forDocument(document, {
      onSelection: (capture) => this.#elements.contextResourcePresenter.capturePdfSelection(capture),
      onHighlight: (annotationId, fragmentId) => this.#elements.contextResourcePresenter.activateProjectHighlight(annotationId, fragmentId),
      onPageChange: (page) => {
        const presentation = this.#elements.contextResourcePresenter.presentPdfPage(page);
        if (presentation.activePdf) this.#elements.workspaceSurfaceSwitcher.syncRoute("replace");
        if (appMode === "library" && presentation.libraryPdfId && location.pathname.startsWith("/library/pdfs/")) {
          history.replaceState(history.state, "", libraryPdfRoute(presentation.libraryPdfId, page));
        }
      },
      onPrivateHighlight: (highlightId) => this.#elements.contextResourcePresenter.selectLibraryHighlight(highlightId),
    });
    this.#layout = WorkspaceLayoutManager.forWorkspace(this.#elements.workspaceSurfaces, {
      paneStorageKey: () =>
        `kirjolab:authoring-pane:${workspaceId}:${this.#elements.contextResourcePresenter.activeTab?.kind ?? "preview"}`,
      resizePdf: () => void this.#pdfViewer.resize(),
    });
    this.#elements.previewSyncControls.bindSource(this.#elements.source, this.#elements.sourceHighlight, {
      focusSource: ({ fileId, offset }) => this.#focusProjectRange(fileId, offset, offset),
      previewOffset: () => this.#elements.workspacePreview.centeredSourceOffset(),
      sourceToPreview: (explicit) => this.#elements.workspacePreview.syncFromSource(explicit),
    });
  }

  async start(): Promise<void> {
    bindThemePreference(document.documentElement, this.#elements.themePreference, localStorage);
    this.#bindUi();
    this.#elements.workspaceSurfaces.dataset.ready = "true";
    void this.#elements.applicationVersion.prepareOfflineShell(appMode === "workspace", {
      persist: () => this.#persistOfflineWorkspace(),
      pinUpdate: (refresh) =>
        this.#elements.toast.pin("A new version of Kirjolab is available.", { action: refresh, actionLabel: "Refresh now" }),
    });
    if (appMode === "library") {
      this.#elements.workspaceSurfaces.dataset.activeSurface = "context";
      this.#elements.workspaceSurfaces.dataset.layout = "context";
      this.#elements.connectionStatus.setConnection("Private library", true);
      await this.#elements.referenceLibraryWorkspace.open(false);
      await this.#elements.referenceLibraryWorkspace.restoreRoute(readLibraryUiRoute(new URL(location.href)));
      return;
    }
    void this.#elements.workspaceLayout.restore();
    this.#elements.source.disabled = true;
    this.#elements.bibliography.disabled = true;
    const restored = await this.#restoreOfflineWorkspace();
    try {
      await this.#elements.workspaceCatalogPanel.refresh();
    } catch (error) {
      if (!restored) throw new Error("Open Kirjolab online once before using it offline", { cause: error });
    }
    try {
      await this.#resourceRefresh.request();
    } catch (error) {
      if (error instanceof WorkspaceAccessError) {
        await this.#offlineStore?.clear();
        throw error;
      }
      if (!restored) throw new Error("Open this project online once before editing it offline", { cause: error });
      this.#collaboration.goOffline();
      this.#renderCollaborationWorkflow();
    }
    await this.#elements.workspaceSurfaceSwitcher.restoreRoute();
    void this.#elements.gitHubSyncMenu.refreshWorkspace(true);
    this.#collaborationSocket.connect();
    if (new URL(location.href).searchParams.get("create") === "1") {
      history.replaceState(history.state, "", location.pathname);
      await this.#elements.newWorkspaceStartingPoints.openFromBoundTrigger();
    }
  }

  #bindUi(): void {
    this.#elements.assistantGenerationPresenter.bindAuthoring({
      fileId: () => this.#activeFileId,
      manuscript: () => this.#activeFileText.toString(),
      sourceRevision: () => this.#revision,
      stableDocument: () => this.#collaboration.stable,
      target: () => this.#elements.editorStatus.authoringTarget,
    });
    this.#elements.applicationVersion.bindNotice((message) => this.#elements.toast.show(message));
    this.#elements.collaboratorSelections.bindSelectionChanged(() => this.#elements.editorStatus.renderHighlight());
    window.addEventListener("online", () => {
      this.#collaborationSocket.connect();
      if (appMode === "workspace") void this.#elements.gitHubSyncMenu.refreshWorkspace(true);
    });
    window.addEventListener("focus", () => {
      if (appMode === "workspace") void this.#elements.gitHubSyncMenu.refreshWorkspace();
    });
    document.addEventListener("visibilitychange", () => {
      if (appMode === "workspace" && document.visibilityState === "visible") void this.#elements.gitHubSyncMenu.refreshWorkspace();
    });
    window.addEventListener("offline", () => this.#collaborationSocket.goOffline());
    window.addEventListener("pagehide", () => this.#scheduleOfflineSave(0));
    window.addEventListener("popstate", () => {
      if (appMode === "library") void this.#elements.referenceLibraryWorkspace.restoreRoute(readLibraryUiRoute(new URL(location.href)));
      else void this.#elements.workspaceSurfaceSwitcher.restoreRoute();
    });
    const logOut = document.querySelector<HTMLAnchorElement>("#log-out");
    logOut?.addEventListener("click", (event) => {
      event.preventDefault();
      const href = logOut.href;
      void this.#clearOfflineBrowserData()
        .then(() => location.assign(href))
        .catch((error: unknown) => this.#elements.toast.show(error instanceof Error ? error.message : "Could not clear offline data"));
    });
    this.#elements.workspaceLayout.configure(workspaceId, this.#elements.workspaceSurfaces);
    this.#elements.workspaceLayout.bindChange(async (layout) => {
      if (layout === "pdf") await this.#elements.contextResourcePresenter.ensurePdfResource();
      this.#elements.workspaceSurfaceSwitcher.syncRoute("replace");
    });
    this.#elements.workspaceCatalogPanel.configure(catalogBase, workspaceId, this.#elements.workspaceSwitcher);
    this.#elements.workspaceCatalogPanel.bindTrigger(this.#elements.manageWorkspaces);
    this.#elements.newWorkspaceStartingPoints.bindWorkspaces(() => this.#elements.workspaceCatalogPanel.catalog);
    this.#elements.workspaceSettingsPanel.bindWorkspace(this.#elements.workspaceSettings, {
      refreshCatalog: () => this.#elements.workspaceCatalogPanel.refresh(),
      refreshGitHub: () => void this.#elements.gitHubSyncMenu.refreshWorkspace(true),
      saveTemplate: async (projectTitle) =>
        await this.#elements.saveTemplateDialog.open(projectTitle, () => this.#elements.newWorkspaceStartingPoints.refresh()),
      sources: () => ({
        catalog: this.#elements.workspaceCatalogPanel.catalog,
        hiddenFileIds: this.#elements.projectFileDialog.hiddenFiles,
        snapshot: this.#snapshot,
        workspaceId,
      }),
    });
    this.#elements.newWorkspaceStartingPoints.bindTrigger(this.#elements.newWorkspace);
    this.#elements.newWorkspaceStartingPoints.bind({
      openImport: (action) => {
        if (action === "import-latex") this.#elements.latexImportPanel.open();
        else this.#elements.gitHubImportPanel.open();
      },
      presentNotice: (message, options) => this.#elements.toast.show(message, options),
      templatesChanged: () => this.#elements.saveTemplateDialog.setTemplates(this.#elements.newWorkspaceStartingPoints.availableTemplates),
    });
    this.#elements.gitHubSyncMenu.bindWorkspace(apiBase, {
      settings: this.#elements.workspaceSettingsPanel,
      openSettings: (checkGitHub) => this.#elements.workspaceSettingsPanel.openSettings(checkGitHub),
      refreshProject: () => this.#resourceRefresh.request(),
    });
    const githubResult = new URL(location.href).searchParams.get("github");
    if (githubResult === "connected" || githubResult === "installed") {
      this.#elements.gitHubImportPanel.open();
      history.replaceState(history.state, "", location.pathname);
    }
    this.#elements.saveTemplateDialog.configure(apiBase);
    this.#elements.saveTemplateDialog.bindCompletion((message) => {
      void this.#elements.newWorkspaceStartingPoints.refresh().then(() => this.#elements.toast.show(message));
    });
    this.#elements.workspaceRailTabs.bindNavigation(() => this.#elements.workspaceSurfaceSwitcher.syncRoute("replace"));
    this.#elements.researchDiaryPanel.bindOpen(
      () =>
        void this.#elements.projectFileDialog.openWorkflowFile(researchDiaryPath, () =>
          researchDiaryTemplate(new Date().toISOString().slice(0, 10)),
        ),
    );
    this.#elements.manuscriptMapPanel.bindNavigation(({ fileId, from, to }) => this.#focusProjectRange(fileId, from, to));
    this.#elements.manuscriptMapPanel.bindProjectPresentation(this.#elements);
    const writingWorkflow: WritingWorkflowBinding = {
      notice: (message) => this.#elements.toast.show(message),
      open: (kind) =>
        void this.#elements.projectFileDialog.openWorkflowFile(
          kind === "research-questions" ? researchQuestionsPath : reviewerResponsePath,
          kind === "research-questions" ? researchQuestionsTemplate : reviewerResponseTemplate,
        ),
      select: (fileId, from, to) => this.#focusProjectRange(fileId, from, to),
    };
    for (const panel of [this.#elements.researchQuestionPanel, this.#elements.reviewerResponsePanel]) {
      panel.bind(writingWorkflow);
    }
    this.#elements.workspaceSharingPanel.configure(apiBase, {
      presentNotice: (message) => this.#elements.toast.show(message),
      trigger: this.#elements.shareWorkspace,
    });
    this.#elements.referenceLibraryWorkspace.configure(workspaceId, {
      activateLibrary: () => {
        if (this.#elements.contextResourcePresenter.activeKey !== RESEARCH_LIBRARY_KEY)
          this.#elements.contextResourcePresenter.navigateContext(RESEARCH_LIBRARY_KEY);
      },
      applyProjectMutation: (snapshot) => this.#acceptWorkspaceMutation(snapshot),
      clearRoute: () => history.replaceState({ view: "library" }, "", "/library"),
      compareSnapshots: (priorId, currentId) => void this.#elements.webSnapshotComparison.compare(priorId, currentId),
      openPdf: (artifact, page, updateHistory) =>
        void this.#elements.contextResourcePresenter.openLibraryPdf(artifact, page, updateHistory),
      openLibraryRoute: () => {
        if (appMode === "library") history.pushState({ view: "library" }, "", "/library");
      },
      openReferenceRoute: (referenceId) => {
        if (appMode === "library")
          history.pushState({ view: "library-reference", referenceId }, "", `/library?reference=${encodeURIComponent(referenceId)}`);
      },
      presentNotice: (message) => this.#elements.toast.show(message),
      refreshLibrary: () => this.#refreshReferenceLibrary(),
      refreshMetadata: async () => {
        await this.#refreshReferenceLibrary();
        await this.#refreshSnapshot();
      },
    });
    this.#elements.editorStatus.bindAuthoring(this.#document, this.#elements.source, {
      highlight: this.#elements.sourceHighlight,
      presence: (fileId) => (fileId ? this.#elements.collaboratorSelections.rangesFor(fileId) : []),
      sourceChanged: () => this.#elements.assistantGenerationPresenter.sourceChanged(),
      targetChanged: () => {
        this.#elements.sourceCitationControl.setCaret(this.#activeFileText.toString(), this.#elements.editorStatus.caret);
        this.#elements.assistantGenerationPresenter.refreshTarget();
        this.#elements.contextResourcePresenter.setCitationAvailable(this.#elements.editorStatus.caret !== null);
      },
    });
    this.#elements.editorStatus.setAuthoringContext("Manuscript", null, this.#source, true);
    this.#elements.vimModeControl.bindEditor(this.#elements.source, this.#elements.sourceEditorShell);
    this.#elements.sourceCompletion.bindEditor(this.#elements.source, this.#elements.citationCompletionScope, () => {
      if (document.activeElement === this.#elements.source) this.#elements.editorStatus.rememberSelection();
      this.#collaborationSocket.scheduleSelection();
      this.#elements.assistantGenerationPresenter.refreshAvailability();
    });
    this.#elements.editorStatus.bindCompanion(this.#elements.bibliography, this.#bibliography);
    this.#elements.projectImageUpload.configure(apiBase);
    this.#elements.projectFileDialog.configureApi(apiBase, {
      activateFile: (file, snapshot) => this.#activateProjectFile(file, snapshot),
      commit: (snapshot) => {
        this.#snapshot = snapshot;
        this.#elements.projectFileDialog.presentProject(snapshot, `${apiBase}/assets`, appMode === "workspace");
        void this.#elements.workspacePreview.renderBoundProject();
      },
      presentFile: (file, snapshot) => {
        this.#activeFileText = this.#document.getText(projectFileCollaborationTextName(file, snapshot.entryFileId));
        this.#elements.editorStatus.setAuthoringContext(file.path, file.id, this.#activeFileText);
      },
      presentNotice: (message, options) => this.#elements.toast.show(message, options),
      previewChanged: () => void this.#elements.workspacePreview.renderBoundProject(),
    });
    this.#elements.projectFileDialog.bindWorkflow({
      actionControls: [this.#elements.projectFileRailActions, this.#elements.projectFileMenuActions],
      focusEditor: () => this.#elements.source.focus(),
      imageUpload: this.#elements.projectImageUpload,
      insertImage: ({ message, syntax }) => this.#elements.editorInsertMenu.insert({ text: syntax }, message),
      prepareInclude: () => this.#elements.editorStatus.preserveInsertionPoint(),
      quickOpen: () => {
        this.#layout.setRailCollapsed(false);
        this.#elements.workspaceRailTabs.navigate("files");
      },
      saved: ({ message }) => this.#elements.toast.show(message),
      tree: this.#elements.projectTreePanel,
    });
    this.#elements.projectFileDialog.bindPresentation(this.#elements);
    this.#elements.projectFileDialog.bindLiveContent(
      (file, entryFileId) => this.#document.getText(projectFileCollaborationTextName(file, entryFileId)).toString(),
      () => this.#collaboration.synced || this.#collaboration.offlineAvailable,
    );
    this.#elements.workspacePreview.bindProject(apiBase, this.#document, () => this.#snapshot, this.#elements);
    this.#elements.editorInsertMenu.bind({
      applyInsertion: (insertion) => this.#elements.editorStatus.applyInsertion(this.#activeFileText, insertion),
      authoringTarget: () => ({
        caret: this.#elements.editorStatus.caret ?? this.#elements.source.selectionEnd,
        passage: this.#elements.editorStatus.selectedPassage(),
      }),
      presentNotice: (message) => this.#elements.toast.show(message),
    });
    this.#elements.sourceCompletion.bindProjectAcceptance(apiBase, {
      acceptMutation: (response) => this.#acceptWorkspaceMutation(response),
      preserveRange: (start, end) => this.#elements.editorStatus.preserveRange(start, end),
      presentNotice: (message) => this.#elements.toast.show(message),
      replaceRange: (start, end, replacement) => this.#elements.editorInsertMenu.replaceRange(start, end, replacement),
    });
    this.#elements.authoringModeTabs.bindNavigation((mode) => {
      if (mode === "write") {
        this.#elements.workspaceSurfaceSwitcher.navigate("authoring", false);
        this.#elements.source.focus();
      }
      this.#elements.workspaceSurfaceSwitcher.syncRoute("replace");
    });
    this.#elements.projectHistoryDialog.configure(apiBase, {
      presentNotice: (message) => this.#elements.toast.show(message),
      trigger: this.#elements.projectHistoryTrigger,
    });
    this.#elements.contextResourcePresenter.bindManuscriptComments(apiBase);
    this.#source.observe(() => void this.#elements.workspacePreview.renderBoundProject());
    this.#bibliography.observe(() => void this.#elements.workspacePreview.renderBoundProject());
    this.#document.on("update", (update: Uint8Array, origin: unknown) => {
      this.#scheduleOfflineSave();
      if (origin === remoteOrigin || origin === offlineOrigin) return;
      this.#collaboration.enqueue(update);
      this.#elements.editorStatus.setSave(this.#collaboration.synced ? "Saving…" : "Saving offline…");
      this.#elements.assistantGenerationPresenter.refreshAvailability();
      void this.#elements.workspacePreview.renderBoundProject();
      this.#collaborationSocket.flush();
    });
    this.#elements.contextResourcePresenter.bindProjectEvidence(apiBase);
    this.#elements.contextResourcePresenter.bindProjectMap(apiBase, {
      document: () => {
        this.#elements.authoringModeTabs.navigate("write");
        this.#elements.source.scrollIntoView({ behavior: "smooth", block: "center" });
      },
      project: () => this.#elements.workspaceSwitcher.focusSelect(),
      person: () => this.#elements.workspaceSharingPanel.open(),
      section: (id) => {
        this.#elements.contextResourcePresenter.navigateContext(RESEARCH_PREVIEW_KEY);
        this.#elements.workspacePreview.scrollToAnchor(id);
      },
    });
    this.#elements.contextResourcePresenter.bindPublicationList(apiBase, {
      manage: (publicationId) => void this.#elements.referenceLibraryWorkspace.openAvailableReference(publicationId),
    });
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
      activateSurface: () => this.#elements.workspaceSurfaceSwitcher.navigate("context", false),
      citationAvailable: () => this.#elements.editorStatus.caret !== null,
      openLibrary: (updateHistory) => this.#elements.referenceLibraryWorkspace.open(updateHistory),
      pushStandaloneLibraryPdfRoute: (artifactId, page) =>
        history.pushState({ view: "library-pdf", artifactId }, "", libraryPdfRoute(artifactId, page)),
      replaceStandaloneLibraryRoute: () => history.replaceState({ view: "library" }, "", "/library"),
      restorePaneWidth: () => this.#layout.restorePaneWidth(),
      sources: () => ({
        candidateDecision: this.#elements.assistantGenerationPresenter.candidateDecision(),
        library: this.#librarySnapshot,
        projectApiBase: appMode === "workspace" ? apiBase : null,
        referencePdfs: this.#elements.contextResourcePresenter.referencePdfs,
        snapshot: this.#snapshot,
        sourceRevision: this.#revision,
        standaloneLibrary: appMode === "library",
        stableDocument: this.#collaboration.stable,
      }),
      syncRoute: (mode) => this.#elements.workspaceSurfaceSwitcher.syncRoute(mode),
    });
    this.#elements.contextResourcePresenter.bindRoutes({
      authoring: () => ({
        passage: this.#elements.editorStatus.selectedPassage(),
        sourceRevision: this.#revision,
        stable: this.#collaboration.stable,
      }),
      document: () => this.#document,
      insertCitation: (citationAlias, locator) => this.#elements.sourceCitationControl.insertCitation(citationAlias, locator),
      library: () => this.#librarySnapshot,
      presentNotice: (message) => this.#elements.toast.show(message),
      project: () => this.#snapshot,
      referencePdfs: () => this.#elements.contextResourcePresenter.referencePdfs,
      refreshResources: () => this.#resourceRefresh.request(),
      refreshLibrary: () => this.#refreshReferenceLibrary(),
      selectPassage: (fileId, start, end) => {
        this.#focusProjectRange(fileId, start, end);
        this.#elements.source.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    });
    this.#elements.contextResourcePresenter.bindPdfViewer(this.#pdfViewer, apiBase);
    this.#elements.libraryPdfInspector.bindProjectMutations(
      (message, snapshot) => void this.#elements.referenceLibraryWorkspace.applyProjectMutation(snapshot, message),
    );
    this.#elements.contextResourcePresenter.bindClaimList(apiBase);
    this.#elements.workspaceSurfaceSwitcher.bindWorkspaceRoute({
      activeFileId: () => this.#activeFileId,
      activeTab: () => this.#elements.contextResourcePresenter.activeContextTab,
      contextKey: () => this.#elements.contextResourcePresenter.activeKey,
      enabled: appMode === "workspace",
      entryFileId: () => this.#snapshot?.entryFileId,
      layout: this.#elements.workspaceLayout,
      mode: this.#elements.authoringModeTabs,
      rail: this.#elements.workspaceRailTabs,
      restoreContext: (key, page, annotationId) => this.#elements.contextResourcePresenter.restoreContext(key, page, annotationId),
      selectFile: (fileId) => this.#elements.projectFileDialog.selectFile(fileId),
    });
    this.#layout.bind();
    this.#elements.workspacePreview.bindNavigation({
      openCitation: (citation) => this.#elements.contextResourcePresenter.openCitation(citation),
      selectDiagnostic: ({ fileId, from, to }) => this.#focusProjectRange(fileId || this.#snapshot?.entryFileId || "", from, to),
      showSource: (offset) => this.#elements.previewSyncControls.showSource(offset),
    });
    this.#elements.sourceCitationControl.bindNavigation((citation) => this.#elements.contextResourcePresenter.openCitation(citation));
    this.#elements.sourceCitationControl.bindInsertion({
      applyInsertion: (insertion) => {
        this.#elements.editorStatus.insertText(this.#activeFileText, insertion.index, insertion.text, insertion.caret);
        this.#elements.authoringModeTabs.navigate("write");
      },
      presentNotice: (message) => this.#elements.toast.show(message),
    });
    this.#elements.contextResourcePresenter.bindPublicationContext(apiBase);
    this.#elements.assistantGenerationPresenter.bindResources(this.#elements.contextResourcePresenter.assistantResources());
    this.#elements.assistantGenerationPresenter.bindWorkflow({
      activateAssistant: () => {
        this.#elements.contextResourcePresenter.activateContext(RESEARCH_ASSISTANT_KEY);
      },
      applyTable: (target, insertion) => this.#elements.editorInsertMenu.replacePassage(target, insertion),
      decisionChanged: () => {
        this.#elements.contextResourcePresenter.presentBoundContext(false);
        this.#elements.assistantGenerationPresenter.refreshAvailability();
      },
      openEvidenceRail: () => this.#elements.workspaceRailTabs.navigate("research"),
      presentNotice: (message) => this.#elements.toast.show(message),
      refreshResources: () => this.#resourceRefresh.request(),
      tableState: () => ({
        revision: this.#revision,
        source: this.#activeFileText.toString(),
        stableDocument: this.#collaboration.stable,
      }),
    });
    this.#elements.assistantGenerationPresenter.bindCandidate(apiBase);
    this.#elements.assistantGenerationPresenter.bindResults();
    this.#elements.assistantGenerationPresenter.bindControls();
  }

  async #refreshSnapshot(): Promise<void> {
    const snapshot = await loadWorkspaceSnapshot(apiBase, this.#document, this.#collaboration.synced);
    this.#snapshot = snapshot;
    if (!this.#hasBootstrapSnapshot) {
      this.#hasBootstrapSnapshot = true;
      this.#revision = snapshot.revision;
      this.#elements.source.value = snapshot.source;
      this.#elements.bibliography.value = snapshot.bibliography;
      void this.#elements.workspacePreview.renderBoundProject(snapshot.bibliography);
      this.#elements.projectHistoryTrigger.setRevision(this.#revision);
    } else {
      void this.#elements.workspacePreview.renderBoundProject();
    }
    this.#elements.projectFileDialog.presentProject(snapshot, `${apiBase}/assets`, appMode === "workspace");
    this.#renderResources();
    this.#scheduleOfflineSave();
    await this.#refreshProjectReferencePdfs();
  }

  #renderCollaborationWorkflow(): void {
    const status = this.#collaboration.status;
    this.#elements.connectionStatus.setConnection(status.label, status.connected);
    this.#elements.source.disabled = !this.#collaboration.canEdit;
    this.#elements.bibliography.disabled = !this.#collaboration.canEdit;
    this.#elements.assistantGenerationPresenter.refreshAvailability();
  }

  #setRevision(revision: number): void {
    this.#revision = Math.max(this.#revision, revision);
    this.#elements.collaboratorSelections.setData({ files: this.#elements.projectFileDialog.projectFiles(), revision: this.#revision });
    this.#elements.editorStatus.renderHighlight();
    this.#elements.projectHistoryTrigger.setRevision(this.#revision);
    this.#scheduleOfflineSave();
    const active = this.#elements.contextResourcePresenter.activeTab;
    if (active?.kind === "candidate") this.#elements.contextResourcePresenter.presentBoundContext(false);
  }

  #activateProjectFile(file: ProjectFile, snapshot: WorkspaceSnapshot): void {
    this.#activeFileText = this.#document.getText(projectFileCollaborationTextName(file, snapshot.entryFileId));
    this.#elements.editorStatus.setAuthoringContext(file.path, file.id, this.#activeFileText, true);
    this.#elements.projectFileDialog.presentProject(snapshot, `${apiBase}/assets`, appMode === "workspace");
    this.#elements.assistantGenerationPresenter.refreshAvailability();
    this.#elements.workspacePreview.resetScroll();
    void this.#elements.workspacePreview.renderBoundProject();
    this.#elements.workspaceSurfaceSwitcher.syncRoute("replace");
  }

  #focusProjectRange(fileId: string, from: number, to: number): void {
    if (fileId) this.#elements.projectFileDialog.selectFile(fileId);
    this.#elements.authoringModeTabs.navigate("write");
    this.#elements.editorStatus.selectRange(from, Math.max(from, to));
  }

  async #refreshReferenceLibrary(): Promise<void> {
    const library = await this.#elements.referenceLibraryWorkspace.refresh();
    await this.#refreshProjectReferencePdfs(false);
    this.#elements.contextResourcePresenter.reconcileContext(
      this.#elements.contextResourcePresenter.resourceAuthorization(this.#snapshot, library),
    );
    this.#elements.referenceLibraryWorkspace.presentProject(this.#snapshot, appMode === "workspace" ? apiBase : null);
    await this.#elements.referenceLibraryWorkspace.settled();
    this.#elements.contextResourcePresenter.presentBoundContext();
    this.#elements.workspaceSurfaceSwitcher.syncRoute("replace");
  }

  async #acceptWorkspaceMutation(result: Response | WorkspaceSnapshot): Promise<void> {
    if (result instanceof Response) await expectOk(result);
    const value: unknown = result instanceof Response ? await result.json() : result;
    const snapshot = parseWorkspaceSnapshot(value, "Project mutation returned an invalid snapshot");
    this.#snapshot = snapshot;
    await this.#refreshProjectReferencePdfs(false);
    this.#renderResources();
    this.#elements.projectFileDialog.presentProject(snapshot, `${apiBase}/assets`, appMode === "workspace");
    void this.#elements.workspacePreview.renderBoundProject();
  }

  async #refreshProjectReferencePdfs(render = true): Promise<void> {
    await this.#elements.contextResourcePresenter.refreshReferencePdfs(appMode === "workspace" ? apiBase : null);
    if (render) this.#renderResources();
  }

  #renderResources(): void {
    if (!this.#snapshot) return;
    this.#elements.contextResourcePresenter.reconcileContext(
      this.#elements.contextResourcePresenter.resourceAuthorization(this.#snapshot, this.#librarySnapshot),
    );
    this.#elements.contextResourcePresenter.presentWorkspace(this.#snapshot);
    this.#elements.contextResourcePresenter.presentBoundContext();
    this.#elements.assistantGenerationPresenter.refreshAvailability();
    this.#elements.workspaceSurfaceSwitcher.syncRoute("replace");
  }

  async #restoreOfflineWorkspace(): Promise<boolean> {
    if (!this.#offlineStore) return false;
    const restored = await restoreOfflineWorkspaceState(this.#offlineStore, this.#document, offlineOrigin, workspaceId);
    if (!restored) return false;
    const pending = this.#collaboration.restoreOffline(restored.serverStateVector);
    this.#snapshot = restored.snapshot;
    this.#hasBootstrapSnapshot = true;
    this.#collaboration.setOfflineAvailable(true);
    this.#revision = restored.snapshot.revision;
    this.#elements.workspaceCatalogPanel.setData([
      {
        id: restored.snapshot.id,
        title: restored.snapshot.title,
        href: `/editor/${encodeURIComponent(restored.snapshot.id)}`,
        createdAt: restored.savedAt,
        updatedAt: restored.savedAt,
        archivedAt: null,
      },
    ]);
    this.#elements.projectFileDialog.presentProject(restored.snapshot, `${apiBase}/assets`, appMode === "workspace");
    this.#renderResources();
    this.#elements.projectHistoryTrigger.setRevision(this.#revision);
    this.#renderCollaborationWorkflow();
    this.#elements.editorStatus.setSave(pending ? "Saved offline" : "Saved");
    void this.#elements.workspacePreview.renderBoundProject();
    return true;
  }

  #scheduleOfflineSave(delay = 120): void {
    if (!this.#offlineStore || !this.#snapshot || !this.#collaboration.offlineAvailable) return;
    this.#offlineSaves.schedule(delay);
  }

  async #persistOfflineWorkspace(): Promise<void> {
    if (!this.#offlineStore || !this.#snapshot || !this.#collaboration.offlineAvailable) return;
    await this.#offlineStore.save(this.#snapshot, Y.encodeStateAsUpdate(this.#document), this.#collaboration.serverStateVector);
  }

  async #clearOfflineBrowserData(): Promise<void> {
    await this.#offlineSaves.flush();
    await Promise.all([
      clearAllOfflineWorkspaces(typeof indexedDB === "undefined" ? undefined : indexedDB),
      clearOfflineShellCaches(typeof caches === "undefined" ? undefined : caches),
    ]);
  }
}

if (typeof document !== "undefined") {
  const app = new WorkspaceApp();
  void app.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Kirjolab failed to start";
    document.body.textContent = message;
  });
}
