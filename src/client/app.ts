import * as Y from "yjs";
import "./action-menu-controller";
import { collectAppElements } from "./app-elements";
import { reviewerResponsePath, reviewerResponseTemplate } from "../domain/reviewer-response";
import { resolveManuscriptAnchor } from "../domain/manuscript-anchor";
import { resolveWorkspaceSnapshotAnchors } from "../domain/workspace-anchor-projection";
import { projectFileCollaborationTextName, relativeProjectPath, type ProjectFile } from "../domain/project-files";
import { researchQuestionsPath, researchQuestionsTemplate } from "../domain/research-questions";
import { researchDiaryPath, researchDiaryTemplate } from "../domain/writing-workflows";
import { type LibraryPdfArtifact, type ProjectReferencePdf } from "../domain/reference-library";
import "./application-version-control";
import "./source-citation-control";
import "./workspace-surface-switcher";
import { type EditorSyntaxKind, type EditorSyntaxTemplate } from "./editor-insert-menu";
import type { AppToastOptions } from "./app-toast";
import { expectOk, jsonFetch } from "./http";
import { type SourceCompletionIntent } from "./source-completion";
import { libraryPdfRoute, readLibraryUiRoute } from "./library-ui-route";
import "./project-starting-point-browser";
import { WorkspaceLayoutManager } from "./workspace-layout-manager";
import "./workspace-layout-control";
import { type WritingWorkflowBinding } from "./writing-workflow-panel";
import "./research-diary-summary";
import { type AssistantAuthoringPassage as AuthoringPassage } from "./assistant-result-panel";
import { type CandidateDecisionOutcome } from "./candidate-review-panel";
import { type ModelCandidate, type PassageLink, type PdfResource, type WorkspaceSnapshot } from "../domain/workspace";
import { loadWorkspaceSnapshot, parseWorkspaceSnapshot, WorkspaceAccessError } from "./workspace-snapshot-client";
import { CoalescedRefresh, DebouncedAsyncQueue } from "./collaboration";
import { CollaborationSession } from "./collaboration-session";
import { CollaborationSocket } from "./collaboration-socket";
import { createCitationInsertion, type CitationContext } from "./citations";
import "./manuscript-map-panel";
import {
  applicationVersion,
  cacheOfflineNavigation,
  clearOfflineShellCaches,
  registerOfflineServiceWorker,
} from "./offline-service-worker";
import {
  clearAllOfflineWorkspaces,
  createOfflineWorkspaceStore,
  restoreOfflineWorkspaceState,
  type OfflineWorkspaceStore,
} from "./offline-workspace";
import { PdfEvidenceViewer } from "./pdf-viewer";
import { bindThemePreference } from "./theme";
import {
  activateResearchTab,
  closeResearchTab,
  createResearchContext,
  openResearchResource,
  RESEARCH_ASSISTANT_KEY,
  RESEARCH_LIBRARY_KEY,
  RESEARCH_PREVIEW_KEY,
  reconcileResearchContext,
  researchResourceKey,
  setPdfResearchLocation,
  type ResearchContextKey,
  type ResearchContextState,
  type PdfResearchLocation,
  type ResearchResourceKey,
  type ResearchResourceTarget,
} from "./research-context";
import { readWorkspaceUiRoute, researchTargetFromContextKey, workspaceUiRouteSelection, workspaceUiRouteUrl } from "./workspace-ui-route";
import "./workspace-rail-tabs";
import "./authoring-mode-tabs";
import type { EditorPresenceRange } from "./editor-presence";
import {
  bindYText,
  captureRelativeSelection,
  replaceYTextRange,
  resolveRelativeSelection,
  type RelativeEditorSelection,
} from "./source-editor-adapter";

const workspaceId = readWorkspaceId();
const identityEmail = readIdentityEmail();
const appMode = readAppMode();
const catalogBase = "/api/workspaces";
const apiBase = `${catalogBase}/${workspaceId}`;
const remoteOrigin = Symbol("remote");
const offlineOrigin = Symbol("offline");

interface ResolvedAuthoringTarget {
  readonly start: number;
  readonly end: number;
}

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
      this.#showToast(error instanceof Error ? error.message : "Could not save the manuscript offline");
    },
  );
  #snapshot: WorkspaceSnapshot | null = null;
  #revision = 0;
  #renderSourceEditorHighlight: () => void = () => undefined;
  #hasBootstrapSnapshot = false;
  #contextState: ResearchContextState = createResearchContext();
  #authoringSelection: RelativeEditorSelection | null = null;
  #activeFileText = this.#source;
  readonly #editorUndoManagers = new Map<Y.Text, Y.UndoManager>();
  #unbindSourceEditor: () => void = () => undefined;
  #unbindAssistantSourceStale: () => void = () => undefined;
  #workspaceRouteReady = false;
  readonly #layout: WorkspaceLayoutManager;

  get #librarySnapshot() {
    return this.#elements.referenceLibraryWorkspace.snapshot;
  }

  get #activeFileId(): string | null {
    return this.#elements.projectFileDialog.activeFileId;
  }

  constructor() {
    this.#collaborationSocket = new CollaborationSocket(this.#collaboration, {
      beforeRemoteUpdate: () => {
        const selections = this.#captureEditorSelections();
        return () => this.#restoreEditorSelections(selections);
      },
      clearOffline: async () => {
        await this.#offlineStore?.clear();
      },
      connectionChanged: () => this.#renderCollaborationWorkflow(),
      disconnected: () => this.#elements.collaboratorSelections.clear(),
      remoteUpdateApplied: () => this.#elements.assistantGenerationPresenter.refreshAvailability(),
      resourcesChanged: () => {
        void this.#resourceRefresh.request().catch((error: unknown) => {
          this.#showToast(error instanceof Error ? error.message : "Could not refresh project resources");
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
        const presentation = this.#elements.contextResourcePresenter.presentPdfPage(this.#contextState, page);
        this.#contextState = presentation.context;
        if (presentation.activePdf) this.#syncWorkspaceRoute("replace");
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
      sourceToPreview: (explicit) => this.#syncPreviewFromSource(explicit),
    });
  }

  async start(): Promise<void> {
    bindThemePreference(document.documentElement, this.#elements.themePreference, localStorage);
    this.#elements.applicationVersion.setVersion(applicationVersion);
    this.#bindUi();
    this.#elements.workspaceSurfaces.dataset.ready = "true";
    void this.#prepareOfflineShell();
    if (appMode === "library") {
      this.#elements.workspaceSurfaces.dataset.activeSurface = "context";
      this.#elements.workspaceSurfaces.dataset.layout = "context";
      this.#elements.connectionStatus.setConnection("Private library", true);
      await this.#openReferenceLibrary(false);
      await this.#restoreLibraryRoute();
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
    await this.#restoreWorkspaceRoute();
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
      target: () => this.#resolvedAuthoringTarget(),
    });
    this.#elements.applicationVersion.bindNotice((message) => this.#showToast(message));
    this.#elements.collaboratorSelections.bindSelectionChanged(() => this.#renderSourceEditorHighlight());
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
      if (appMode === "library") void this.#restoreLibraryRoute();
      else {
        this.#workspaceRouteReady = false;
        void this.#restoreWorkspaceRoute();
      }
    });
    const logOut = document.querySelector<HTMLAnchorElement>("#log-out");
    logOut?.addEventListener("click", (event) => {
      event.preventDefault();
      const href = logOut.href;
      void this.#clearOfflineBrowserData()
        .then(() => location.assign(href))
        .catch((error: unknown) => this.#showToast(error instanceof Error ? error.message : "Could not clear offline data"));
    });
    this.#elements.workspaceLayout.configure(workspaceId, this.#elements.workspaceSurfaces);
    this.#elements.workspaceLayout.bindChange(async (layout) => {
      if (layout === "pdf") await this.#ensurePdfLayoutResource();
      this.#syncWorkspaceRoute("replace");
    });
    this.#elements.workspaceCatalogPanel.configure(catalogBase, workspaceId, this.#elements.workspaceSwitcher);
    this.#elements.workspaceCatalogPanel.bindTrigger(this.#elements.manageWorkspaces);
    this.#elements.workspaceSettingsPanel.bindWorkspace(this.#elements.workspaceSettings, {
      refreshCatalog: () => this.#elements.workspaceCatalogPanel.refresh(),
      refreshGitHub: () => void this.#elements.gitHubSyncMenu.refreshWorkspace(true),
      saveTemplate: async (projectTitle) =>
        await this.#elements.saveTemplateDialog.open(projectTitle, () => this.#refreshProjectTemplates()),
      sources: () => ({
        catalog: this.#elements.workspaceCatalogPanel.catalog,
        hiddenFileIds: this.#elements.projectFileDialog.hiddenFiles,
        snapshot: this.#snapshot,
        workspaceId,
      }),
    });
    this.#elements.newWorkspaceStartingPoints.bindTrigger(this.#elements.newWorkspace, () => this.#refreshProjectTemplates());
    this.#elements.newWorkspaceStartingPoints.bind({
      openImport: (action) => {
        if (action === "import-latex") this.#elements.latexImportPanel.open();
        else this.#elements.gitHubImportPanel.open();
      },
      presentNotice: (message, options) => this.#showToast(message, options),
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
      void this.#refreshProjectTemplates().then(() => this.#showToast(message));
    });
    this.#elements.workspaceRailTabs.bindNavigation(() => this.#syncWorkspaceRoute("replace"));
    this.#elements.researchDiaryPanel.bindOpen(
      () =>
        void this.#elements.projectFileDialog.openWorkflowFile(researchDiaryPath, () =>
          researchDiaryTemplate(new Date().toISOString().slice(0, 10)),
        ),
    );
    this.#elements.manuscriptMapPanel.bindNavigation(({ fileId, from, to }) => this.#focusProjectRange(fileId, from, to));
    this.#elements.manuscriptMapPanel.bindProjectPresentation(this.#elements);
    const writingWorkflow: WritingWorkflowBinding = {
      notice: (message) => this.#showToast(message),
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
      presentNotice: (message) => this.#showToast(message),
      trigger: this.#elements.shareWorkspace,
    });
    this.#elements.referenceLibraryWorkspace.configure(workspaceId, {
      activateLibrary: () => {
        if (this.#contextState.activeKey !== RESEARCH_LIBRARY_KEY) this.#activateContext(RESEARCH_LIBRARY_KEY);
      },
      clearRoute: () => history.replaceState({ view: "library" }, "", "/library"),
      compareSnapshots: (priorId, currentId) => void this.#elements.webSnapshotComparison.compare(priorId, currentId),
      completeProjectMutation: (message, snapshot) => void this.#completeLibraryProjectMutation(message, snapshot),
      openPdf: (artifact, page, updateHistory) => void this.#openLibraryPdf(artifact, page, updateHistory),
      presentNotice: (message) => this.#showToast(message),
      refreshLibrary: () => this.#refreshReferenceLibrary(),
      refreshMetadata: async () => {
        await this.#refreshReferenceLibrary();
        await this.#refreshSnapshot();
      },
    });
    this.#bindSourceEditor(this.#source);
    this.#rememberAuthoringSelection();
    this.#elements.vimModeControl.bindEditor(this.#elements.source, this.#elements.sourceEditorShell);
    this.#elements.sourceCompletion.bindEditor(this.#elements.source, this.#elements.citationCompletionScope, () => {
      if (document.activeElement === this.#elements.source) this.#rememberAuthoringSelection();
      this.#collaborationSocket.scheduleSelection();
      this.#elements.assistantGenerationPresenter.refreshAvailability();
    });
    bindYText(this.#elements.bibliography, this.#bibliography, this.#document);
    this.#elements.projectImageUpload.configure(apiBase);
    this.#elements.projectFileDialog.configureApi(apiBase, {
      activateFile: (file, snapshot) => this.#activateProjectFile(file, snapshot),
      commit: (snapshot) => {
        this.#snapshot = snapshot;
        this.#elements.projectFileDialog.presentProject(snapshot, `${apiBase}/assets`, appMode === "workspace");
        void this.#renderPreview();
      },
      presentFile: (file, snapshot) => {
        this.#activeFileText = this.#document.getText(projectFileCollaborationTextName(file, snapshot.entryFileId));
        this.#renderAuthoringTarget();
      },
      presentNotice: (message, options) => this.#showToast(message, options),
      previewChanged: () => void this.#renderPreview(),
    });
    this.#elements.projectFileDialog.bindWorkflow({
      actionControls: [this.#elements.projectFileRailActions, this.#elements.projectFileMenuActions],
      focusEditor: () => this.#elements.source.focus(),
      imageUpload: this.#elements.projectImageUpload,
      insertImage: ({ message, syntax }) => {
        const caret = this.#resolvedAuthoringCaret() ?? this.#elements.source.selectionEnd;
        this.#applySourceSyntax({ text: syntax }, null, caret);
        this.#showToast(message);
      },
      prepareInclude: (file) => {
        const target = captureRelativeSelection(this.#elements.source, this.#activeFileText);
        if (!target) return null;
        return (path) => {
          const position = Y.createAbsolutePositionFromRelativePosition(target.end, this.#document);
          if (position?.type === target.text) this.#insertProjectInclude(target.text, position.index, relativeProjectPath(file.path, path));
          return true;
        };
      },
      quickOpen: () => {
        this.#layout.setRailCollapsed(false);
        this.#elements.workspaceRailTabs.navigate("files");
      },
      saved: ({ message }) => this.#showToast(message),
      tree: this.#elements.projectTreePanel,
    });
    this.#elements.projectFileDialog.bindPresentation(this.#elements);
    this.#elements.projectFileDialog.bindLiveContent(
      (file, entryFileId) => this.#document.getText(projectFileCollaborationTextName(file, entryFileId)).toString(),
      () => this.#collaboration.synced || this.#collaboration.offlineAvailable,
    );
    this.#elements.editorInsertMenu.bind({
      includeFile: (relativePath, path) => this.#insertProjectIncludeFromMenu(relativePath, path),
      insertSyntax: (kind, template) => this.#insertSourceSyntax(kind, template),
    });
    this.#elements.sourceCompletion.bindAcceptance((intent) => {
      if (intent.kind === "citation") void this.#acceptCitationCompletion(intent);
      else this.#applySourceCompletion(intent.context.start, intent.context.end, intent.candidate.reference);
    });
    this.#elements.authoringModeTabs.bindNavigation((mode) => {
      if (mode === "write") {
        this.#elements.workspaceSurfaceSwitcher.navigate("authoring", false);
        this.#elements.source.focus();
      }
      this.#syncWorkspaceRoute("replace");
    });
    this.#elements.projectHistoryDialog.configure(apiBase, {
      presentNotice: (message) => this.#showToast(message),
      trigger: this.#elements.projectHistoryTrigger,
    });
    this.#elements.contextResourcePresenter.bindManuscriptComments(apiBase, () => ({
      passage: this.#selectedAuthoringPassage(),
      sourceRevision: this.#revision,
      stable: this.#collaboration.stable,
    }));
    this.#source.observe(() => void this.#renderPreview());
    this.#bibliography.observe(() => void this.#renderPreview());
    this.#document.on("update", (update: Uint8Array, origin: unknown) => {
      this.#scheduleOfflineSave();
      if (origin === remoteOrigin || origin === offlineOrigin) return;
      this.#collaboration.enqueue(update);
      this.#elements.editorStatus.setSave(this.#collaboration.synced ? "Saving…" : "Saving offline…");
      this.#elements.assistantGenerationPresenter.refreshAvailability();
      void this.#renderPreview();
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
        this.#activateContext(RESEARCH_PREVIEW_KEY);
        this.#elements.workspacePreview.scrollToAnchor(id);
      },
    });
    this.#elements.contextResourcePresenter.bindPublicationList(apiBase, {
      manage: (publicationId) => void this.#openReferenceLibraryEntry(publicationId),
    });
    this.#elements.contextResourcePresenter.bindProjectAnnotationIntake(() => this.#resourceRefresh.request());
    this.#elements.contextResourcePresenter.bindProjectAnnotationWorkflow(async ({ linkAnnotationId, notice, refreshResources }) => {
      if (refreshResources) await this.#resourceRefresh.request();
      if (linkAnnotationId) await this.#linkSelectedPassage("annotation", linkAnnotationId);
      if (notice) this.#showToast(notice);
    });
    this.#elements.contextResourcePresenter.bindLibraryPdf({
      acceptProjectMutation: async (snapshot) => {
        await this.#acceptWorkspaceMutation(snapshot);
        this.#renderReferenceLibrary();
      },
      canInsertCitation: () => this.#resolvedAuthoringCaret() !== null,
      completeMarkup: (message) =>
        void this.#elements.referenceLibraryWorkspace.completeRefresh(
          message,
          "The annotation changed, but the refreshed Library could not be loaded.",
        ),
      openPdf: (artifact, page) => this.#openLibraryPdf(artifact, page),
      projectApiBase: apiBase,
    });
    this.#elements.contextResourcePresenter.bindRoutes({
      completeProjectMutation: (message, failureMessage) => this.#refreshResourcesWithNotice(message, failureMessage),
      insertCitation: (citationAlias, locator) => this.#insertCitation(citationAlias, locator),
      library: () => this.#librarySnapshot,
      linkPassage: (kind, id) => void this.#linkSelectedPassage(kind, id),
      openCandidate: (candidate) => this.#openResourceContext({ kind: "candidate", id: candidate.id }),
      openLibraryPdf: (artifact, page) => this.#openLibraryPdf(artifact, page, false),
      openProjectPdf: (pdf, page, annotationId) => this.#showPaper(pdf, page, annotationId),
      openPublication: (publication) => this.#openResourceContext({ kind: "publication", id: publication.id }),
      openPassage: (anchor) => this.#showPassage(anchor),
      openReferencePdf: (pdf, page) => this.#openProjectReferencePdf(pdf, page, false),
      presentNotice: (message) => this.#showToast(message),
      project: () => this.#snapshot,
      referencePdfs: () => this.#elements.contextResourcePresenter.referencePdfs,
      refreshLibrary: () => this.#refreshReferenceLibrary(),
    });
    this.#elements.contextResourcePresenter.bindPdfViewer(this.#pdfViewer, apiBase);
    this.#elements.libraryPdfInspector.bindProjectMutations(
      (message, snapshot) => void this.#completeLibraryProjectMutation(message, snapshot),
    );
    this.#elements.contextResourcePresenter.bindClaimList(apiBase);
    this.#elements.workspaceSurfaceSwitcher.bindNavigation(() => this.#syncWorkspaceRoute("replace"));
    this.#layout.bind();
    this.#elements.contextTabStrip.bindNavigation({
      activate: (key) => this.#activateContext(key),
      close: (key) => this.#closeContextTab(key),
      openLibrary: () => void this.#openReferenceLibrary(),
    });
    this.#elements.workspacePreview.bindNavigation({
      openCitation: (citation) => this.#openCitation(citation),
      selectDiagnostic: ({ fileId, from, to }) => this.#focusProjectRange(fileId || this.#snapshot?.entryFileId || "", from, to),
      showSource: (offset) => this.#elements.previewSyncControls.showSource(offset),
    });
    this.#elements.sourceCitationControl.bindNavigation((citation) => this.#openCitation(citation));
    this.#elements.contextResourcePresenter.bindPublicationContext(apiBase);
    this.#elements.assistantGenerationPresenter.bindResources(this.#elements.contextResourcePresenter.assistantResources());
    this.#elements.assistantGenerationPresenter.bindWorkflow({
      applyTable: (target, insertion) => this.#applyGeneratedTable(target, insertion),
      decisionChanged: () => {
        this.#renderResearchContext(false);
        this.#elements.assistantGenerationPresenter.refreshAvailability();
      },
      openEvidenceRail: () => this.#elements.workspaceRailTabs.navigate("research"),
      openGeneratedCandidate: (candidate) => this.#openCreatedCandidate(candidate),
      resolveDecision: (detail) => this.#completeCandidateRequest(detail),
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
      void this.#renderPreview(snapshot.bibliography);
      this.#elements.projectHistoryTrigger.setRevision(this.#revision);
    } else {
      void this.#renderPreview();
    }
    this.#elements.projectFileDialog.presentProject(snapshot, `${apiBase}/assets`, appMode === "workspace");
    this.#renderResources();
    this.#scheduleOfflineSave();
    await this.#refreshProjectReferencePdfs();
  }

  async #ensurePdfLayoutResource(): Promise<void> {
    const active = this.#contextState.tabs.find((tab) => tab.key === this.#contextState.activeKey);
    if (active?.kind === "pdf" || active?.kind === "library-pdf") return;
    const pdf = this.#snapshot?.pdfs[0];
    if (pdf) return await this.#showPaper(pdf);
    const artifact = this.#librarySnapshot?.artifacts[0];
    if (artifact) return await this.#openLibraryPdf(artifact);
    this.#showToast("Add or open a PDF before using PDF-only view.");
  }

  async #restoreWorkspaceRoute(): Promise<void> {
    const url = new URL(location.href);
    const route = readWorkspaceUiRoute(url);
    if (url.searchParams.has("rail")) this.#elements.workspaceRailTabs.navigate(route.rail);
    if (url.searchParams.has("mode")) this.#elements.authoringModeTabs.navigate(route.mode);
    if (route.fileId) this.#elements.projectFileDialog.selectFile(route.fileId);
    if (url.searchParams.has("context")) await this.#restoreWorkspaceContext(route);
    if (route.layout) await this.#elements.workspaceLayout.navigate(route.layout, false);
    if (url.searchParams.has("surface")) this.#elements.workspaceSurfaceSwitcher.navigate(route.surface);
    this.#workspaceRouteReady = true;
    this.#syncWorkspaceRoute("replace");
  }

  async #restoreWorkspaceContext(route: ReturnType<typeof readWorkspaceUiRoute>): Promise<void> {
    this.#contextState = activateResearchTab(this.#contextState, RESEARCH_PREVIEW_KEY);
    try {
      const target = researchTargetFromContextKey(route.contextKey);
      if (!target) return await this.#restoreGeneralResearchContext(route.contextKey);
      await this.#elements.contextResourcePresenter.restoreTarget(target, route.page, route.annotationId);
    } catch (error) {
      this.#contextState = activateResearchTab(this.#contextState, RESEARCH_PREVIEW_KEY);
      this.#renderResearchContext();
      this.#showToast(error instanceof Error ? error.message : "Could not restore that context");
    }
  }

  async #restoreGeneralResearchContext(contextKey: ResearchContextKey): Promise<void> {
    if (contextKey === RESEARCH_LIBRARY_KEY) return await this.#openReferenceLibrary(false);
    this.#activateContext(contextKey);
  }

  #syncWorkspaceRoute(mode: "push" | "replace"): void {
    if (appMode !== "workspace" || !this.#workspaceRouteReady) return;
    const activeTab = this.#contextState.tabs.find((tab) => tab.key === this.#contextState.activeKey);
    const current = new URL(location.href);
    const next = workspaceUiRouteUrl(current, {
      ...workspaceUiRouteSelection(this.#activeFileId, this.#snapshot?.entryFileId, activeTab),
      rail: this.#elements.workspaceRailTabs.mode,
      mode: this.#elements.authoringModeTabs.mode,
      surface: this.#elements.workspaceSurfaces.dataset.activeSurface === "context" ? "context" : "authoring",
      layout: this.#elements.workspaceLayout.value,
      contextKey: this.#contextState.activeKey,
    });
    const currentRelative = `${current.pathname}${current.search}${current.hash}`;
    if (next === currentRelative) return;
    if (mode === "push") history.pushState({ view: "workspace" }, "", next);
    else history.replaceState(history.state, "", next);
  }

  #refreshProjectTemplates(): Promise<void> {
    return this.#elements.newWorkspaceStartingPoints.refresh(this.#elements.workspaceCatalogPanel.catalog);
  }

  #renderCollaborationWorkflow(): void {
    const status = this.#collaboration.status;
    this.#elements.connectionStatus.setConnection(status.label, status.connected);
    this.#elements.source.disabled = !this.#collaboration.canEdit;
    this.#elements.bibliography.disabled = !this.#collaboration.canEdit;
    this.#elements.assistantGenerationPresenter.refreshAvailability();
  }

  #captureEditorSelections(): RelativeEditorSelection[] {
    return [
      captureRelativeSelection(this.#elements.source, this.#activeFileText),
      captureRelativeSelection(this.#elements.bibliography, this.#bibliography),
    ];
  }

  #restoreEditorSelections(selections: RelativeEditorSelection[]): void {
    for (const selection of selections) {
      const resolved = resolveRelativeSelection(this.#document, selection);
      if (resolved) selection.textarea.setSelectionRange(resolved.start, resolved.end, selection.direction ?? undefined);
    }
    if (document.activeElement === this.#elements.source) this.#rememberAuthoringSelection();
    else this.#renderAuthoringTarget();
  }

  #setRevision(revision: number): void {
    this.#revision = Math.max(this.#revision, revision);
    this.#elements.collaboratorSelections.setData({ files: this.#elements.projectFileDialog.projectFiles(), revision: this.#revision });
    this.#renderSourceEditorHighlight();
    this.#elements.projectHistoryTrigger.setRevision(this.#revision);
    this.#scheduleOfflineSave();
    const active = this.#elements.contextResourcePresenter.activeTab;
    if (active?.kind === "candidate") this.#renderResearchContext(false);
  }

  #bindSourceEditor(text: Y.Text): void {
    this.#unbindAssistantSourceStale();
    const markAssistantResultStale = (): void => this.#elements.assistantGenerationPresenter.sourceChanged();
    text.observe(markAssistantResultStale);
    this.#unbindAssistantSourceStale = () => text.unobserve(markAssistantResultStale);
    let undoManager = this.#editorUndoManagers.get(text);
    if (!undoManager) {
      undoManager = new Y.UndoManager(text, { trackedOrigins: new Set([this.#elements.source, this]) });
      this.#editorUndoManagers.set(text, undoManager);
    }
    const binding = bindYText(
      this.#elements.source,
      text,
      this.#document,
      this.#elements.sourceHighlight,
      () => {
        const target = this.#resolvedAuthoringTarget();
        const local: readonly EditorPresenceRange[] = target
          ? [{ collaboratorId: "local-author", start: target.start, end: target.end, local: true }]
          : [];
        return [...local, ...this.#elements.collaboratorSelections.rangesFor(this.#activeFileId)];
      },
      undoManager,
    );
    this.#unbindSourceEditor = binding.destroy;
    this.#renderSourceEditorHighlight = binding.renderHighlight;
  }

  async #renderPreview(bibliography = this.#bibliography.toString()): Promise<void> {
    await this.#elements.workspacePreview.renderProject({
      activeFileId: this.#activeFileId,
      apiBase,
      bibliography,
      fallbackSource: this.#source.toString(),
      files: this.#elements.projectFileDialog.projectFiles(),
      hiddenAssetIds: this.#elements.projectTreePanel.hiddenAssets,
      resolvedSnapshot: this.#snapshot ? resolveWorkspaceSnapshotAnchors(this.#document, this.#snapshot) : null,
      snapshot: this.#snapshot,
    });
  }

  #syncPreviewFromSource(explicit = true): void {
    const fileId = this.#activeFileId ?? this.#snapshot?.entryFileId ?? "";
    const previewActive = this.#contextState.activeKey === RESEARCH_PREVIEW_KEY;
    const splitLayout = this.#elements.workspaceSurfaces.dataset.layout === "split";
    const offsets = this.#elements.previewSyncControls.activeSourcePreviewOffsets(fileId, explicit, previewActive, splitLayout);
    if (offsets.length > 0) this.#elements.workspacePreview.revealNearestSource(offsets);
  }

  #activateProjectFile(file: ProjectFile, snapshot: WorkspaceSnapshot): void {
    this.#unbindSourceEditor();
    this.#activeFileText = this.#document.getText(projectFileCollaborationTextName(file, snapshot.entryFileId));
    this.#elements.source.value = this.#activeFileText.toString();
    this.#authoringSelection = null;
    this.#elements.source.setSelectionRange(0, 0);
    this.#bindSourceEditor(this.#activeFileText);
    this.#rememberAuthoringSelection();
    this.#elements.projectFileDialog.presentProject(snapshot, `${apiBase}/assets`, appMode === "workspace");
    this.#elements.assistantGenerationPresenter.refreshAvailability();
    this.#elements.workspacePreview.resetScroll();
    void this.#renderPreview();
    this.#syncWorkspaceRoute("replace");
  }

  #focusProjectRange(fileId: string, from: number, to: number): void {
    if (fileId) this.#elements.projectFileDialog.selectFile(fileId);
    this.#elements.authoringModeTabs.navigate("write");
    this.#selectAuthoringRange(from, Math.max(from, to));
  }

  async #openReferenceLibrary(updateHistory = true): Promise<void> {
    this.#activateContext(RESEARCH_LIBRARY_KEY);
    if (appMode === "library" && updateHistory) history.pushState({ view: "library" }, "", "/library");
    await this.#refreshReferenceLibrary();
  }

  async #openReferenceLibraryEntry(referenceId: string, updateHistory = true): Promise<void> {
    await this.#openReferenceLibrary(false);
    const opened = await this.#elements.referenceLibraryWorkspace.focusAvailableReference(referenceId);
    if (opened && appMode === "library" && updateHistory) {
      history.pushState({ view: "library-reference", referenceId }, "", `/library?reference=${encodeURIComponent(referenceId)}`);
    }
  }

  async #refreshReferenceLibrary(): Promise<void> {
    const library = await this.#elements.referenceLibraryWorkspace.refresh();
    this.#captureActiveContextState();
    await this.#refreshProjectReferencePdfs(false);
    this.#contextState = reconcileResearchContext(
      this.#contextState,
      this.#elements.contextResourcePresenter.resourceAuthorization(this.#snapshot, library),
    );
    this.#renderReferenceLibrary();
    await this.#elements.referenceLibraryWorkspace.settled();
    this.#renderResearchContext();
    this.#syncWorkspaceRoute("replace");
  }

  #renderReferenceLibrary(): void {
    const library = this.#librarySnapshot;
    if (!library) return;
    this.#elements.referenceLibraryWorkspace.setData({
      library,
      projectApiBase: appMode === "workspace" ? apiBase : null,
      projectReferences: this.#snapshot?.projectReferences ?? [],
      researchShares: this.#snapshot?.researchShares ?? [],
    });
  }

  async #refreshResourcesWithNotice(message?: string, failureMessage?: string): Promise<void> {
    try {
      await this.#resourceRefresh.request();
      if (message) this.#showToast(message);
    } catch (error) {
      if (!failureMessage) throw error;
      this.#showToast(failureMessage);
    }
  }

  async #completeLibraryProjectMutation(message: string, snapshot: WorkspaceSnapshot): Promise<void> {
    await this.#acceptWorkspaceMutation(snapshot);
    this.#renderReferenceLibrary();
    this.#showToast(message);
  }

  async #acceptWorkspaceMutation(result: Response | WorkspaceSnapshot): Promise<void> {
    if (result instanceof Response) await expectOk(result);
    const value: unknown = result instanceof Response ? await result.json() : result;
    const snapshot = parseWorkspaceSnapshot(value, "Project mutation returned an invalid snapshot");
    this.#snapshot = snapshot;
    await this.#refreshProjectReferencePdfs(false);
    this.#renderResources();
    this.#elements.projectFileDialog.presentProject(snapshot, `${apiBase}/assets`, appMode === "workspace");
    void this.#renderPreview();
  }

  async #refreshProjectReferencePdfs(render = true): Promise<void> {
    await this.#elements.contextResourcePresenter.refreshReferencePdfs(appMode === "workspace" ? apiBase : null);
    if (render) this.#renderResources();
  }

  #renderResources(): void {
    if (!this.#snapshot) return;
    this.#captureActiveContextState();
    this.#contextState = reconcileResearchContext(
      this.#contextState,
      this.#elements.contextResourcePresenter.resourceAuthorization(this.#snapshot, this.#librarySnapshot),
    );
    this.#elements.contextResourcePresenter.presentWorkspace(this.#snapshot);
    this.#renderResearchContext();
    this.#elements.assistantGenerationPresenter.refreshAvailability();
    this.#syncWorkspaceRoute("replace");
  }

  #captureActiveContextState(): void {
    this.#contextState = this.#elements.contextResourcePresenter.captureBoundContext(this.#contextState);
  }

  #activateContext(key: ResearchContextKey): void {
    this.#captureActiveContextState();
    this.#presentContextTransition(activateResearchTab(this.#contextState, key), key);
  }

  #openResourceContext(target: ResearchResourceTarget): void {
    this.#captureActiveContextState();
    this.#presentContextTransition(openResearchResource(this.#contextState, target), researchResourceKey(target));
  }

  #presentContextTransition(context: ResearchContextState, key: ResearchContextKey, loadPdf = true, syncRoute = true): void {
    this.#contextState = context;
    this.#renderResearchContext(loadPdf);
    this.#elements.workspaceSurfaceSwitcher.navigate("context", false);
    this.#elements.contextTabStrip.focusTab(key);
    if (syncRoute) this.#syncWorkspaceRoute("push");
  }

  #renderResearchContext(loadPdf = true): void {
    const presentation = this.#elements.contextResourcePresenter.presentContext({
      candidateDecision: this.#elements.assistantGenerationPresenter.candidateDecision(),
      context: this.#contextState,
      library: this.#librarySnapshot,
      projectApiBase: appMode === "workspace" ? apiBase : null,
      referencePdfs: this.#elements.contextResourcePresenter.referencePdfs,
      snapshot: this.#snapshot,
      sourceRevision: this.#revision,
      standaloneLibrary: appMode === "library",
      stableDocument: this.#collaboration.stable,
    });
    this.#layout.restorePaneWidth();
    if (presentation.publicationPresented)
      this.#elements.contextResourcePresenter.setCitationAvailable(this.#resolvedAuthoringCaret() !== null);
    if (loadPdf && (presentation.activeTab?.kind === "pdf" || presentation.activeTab?.kind === "library-pdf")) {
      void this.#elements.contextResourcePresenter.loadActivePdf(false);
    }
  }

  #closeContextTab(key: ResearchContextKey): void {
    this.#captureActiveContextState();
    const returnToStandaloneLibrary = appMode === "library" && this.#contextState.activeKey === key;
    this.#contextState = closeResearchTab(this.#contextState, key);
    if (returnToStandaloneLibrary) {
      this.#contextState = activateResearchTab(this.#contextState, RESEARCH_LIBRARY_KEY);
      history.replaceState({ view: "library" }, "", "/library");
    }
    this.#renderResearchContext();
    this.#elements.contextTabStrip.focusTab(this.#contextState.activeKey);
    this.#syncWorkspaceRoute("replace");
  }

  #openCitation(citation: CitationContext): void {
    const notice = this.#elements.contextResourcePresenter.openCitation(citation);
    if (notice) this.#showToast(notice);
  }

  async #acceptCitationCompletion({ candidate, context }: Extract<SourceCompletionIntent, { kind: "citation" }>): Promise<void> {
    let start = context.start;
    let end = context.end;
    if (candidate.scope === "library") {
      const relativeStart = Y.createRelativePositionFromTypeIndex(this.#activeFileText, start);
      const relativeEnd = Y.createRelativePositionFromTypeIndex(this.#activeFileText, end);
      const response = await jsonFetch(`${apiBase}/references`, { referenceId: candidate.referenceId, citationAlias: candidate.key });
      await this.#acceptWorkspaceMutation(response);
      const resolvedStart = Y.createAbsolutePositionFromRelativePosition(relativeStart, this.#document);
      const resolvedEnd = Y.createAbsolutePositionFromRelativePosition(relativeEnd, this.#document);
      if (!resolvedStart || !resolvedEnd || resolvedStart.type !== this.#activeFileText || resolvedEnd.type !== this.#activeFileText)
        return;
      start = resolvedStart.index;
      end = resolvedEnd.index;
    }
    this.#applySourceCompletion(start, end, candidate.key);
    if (candidate.scope === "library") this.#showToast(`Added and cited ${candidate.key}.`);
  }

  #applySourceCompletion(start: number, end: number, value: string): void {
    this.#elements.sourceCompletion.hide();
    replaceYTextRange(this.#document, this.#activeFileText, start, end, value, this);
    const caret = start + value.length;
    this.#elements.source.focus();
    this.#selectAuthoringRange(caret);
  }

  #selectAuthoringRange(start: number, end = start): void {
    this.#elements.source.setSelectionRange(start, end);
    this.#rememberAuthoringSelection();
  }

  #rememberAuthoringSelection(): void {
    this.#authoringSelection = captureRelativeSelection(this.#elements.source, this.#activeFileText);
    this.#elements.sourceCitationControl.setCaret(this.#activeFileText.toString(), this.#elements.source.selectionEnd);
    this.#renderAuthoringTarget();
    this.#elements.contextResourcePresenter.setCitationAvailable(this.#resolvedAuthoringCaret() !== null);
  }

  #resolvedAuthoringTarget(): ResolvedAuthoringTarget | null {
    if (!this.#authoringSelection) return null;
    return resolveRelativeSelection(this.#document, this.#authoringSelection);
  }

  #renderAuthoringTarget(): void {
    const target = this.#resolvedAuthoringTarget();
    const file = this.#snapshot?.files.find((item) => item.id === this.#activeFileId);
    this.#elements.editorStatus.setAuthoringTarget(file?.path ?? "Manuscript", this.#activeFileText.toString(), target);
    this.#renderSourceEditorHighlight();
    this.#elements.assistantGenerationPresenter.refreshTarget();
  }

  #resolvedAuthoringCaret(): number | null {
    return this.#resolvedAuthoringTarget()?.end ?? null;
  }

  #insertCitation(citationKey: string, locator?: string): void {
    const index = this.#resolvedAuthoringCaret();
    if (index === null) {
      this.#showToast("Place the manuscript caret before inserting a citation.");
      return;
    }
    const insertion = createCitationInsertion(this.#activeFileText.toString(), index, citationKey, locator);
    if (!insertion) {
      this.#showToast("This reference key cannot be represented by citation syntax.");
      return;
    }
    this.#document.transact(() => this.#activeFileText.insert(insertion.index, insertion.text), this);
    this.#elements.authoringModeTabs.navigate("write");
    this.#selectAuthoringRange(insertion.caret);
    this.#showToast(`Inserted :cite[${citationKey}]${locator ? ` at ${locator}` : ""} into canonical Markdown.`);
  }

  async #linkSelectedPassage(kind: "annotation" | "claim", id: string): Promise<void> {
    const label = kind === "claim" ? "a claim" : "an annotation";
    if (!this.#collaboration.stable) {
      this.#showToast(`Wait for the manuscript to finish synchronizing before linking ${label}.`);
      return;
    }
    const passage = this.#selectedAuthoringPassage();
    if (!passage) {
      this.#showToast(`Select manuscript text before linking ${label}.`);
      return;
    }
    const link = { ...passage, sourceRevision: this.#revision };
    if (kind === "claim") await this.#elements.claimListPanel.linkPassage({ claimId: id, ...link });
    else await this.#elements.projectEvidencePanel.linkPassage({ annotationId: id, ...link });
  }

  #selectedAuthoringPassage(): AuthoringPassage | null {
    const live = this.#elements.source.selectionStart !== this.#elements.source.selectionEnd;
    const selection = live ? captureRelativeSelection(this.#elements.source, this.#activeFileText) : this.#authoringSelection;
    if (!selection) return null;
    const resolved = resolveRelativeSelection(this.#document, selection);
    if (!resolved || resolved.start === resolved.end) return null;
    const excerpt = this.#activeFileText.toString().slice(resolved.start, resolved.end);
    return excerpt.trim() && this.#activeFileId ? { fileId: this.#activeFileId, ...resolved, excerpt } : null;
  }

  #insertSourceSyntax(kind: EditorSyntaxKind, template: EditorSyntaxTemplate): void {
    const passage = this.#selectedAuthoringPassage();
    const caret = this.#resolvedAuthoringCaret() ?? this.#elements.source.selectionEnd;
    const resolved = kind === "link" && passage ? { text: `[${passage.excerpt}](url)`, select: "url" } : template;
    this.#applySourceSyntax(resolved, passage, caret);
    this.#showToast("Inserted scholarly syntax.");
  }

  #insertProjectIncludeFromMenu(relativePath: string, path: string): void {
    const caret = this.#resolvedAuthoringCaret() ?? this.#elements.source.selectionEnd;
    this.#insertProjectInclude(this.#activeFileText, caret, relativePath);
    this.#showToast(`Included ${path}.`);
  }

  #applySourceSyntax(template: EditorSyntaxTemplate, passage: AuthoringPassage | null, caret: number): void {
    const start = passage?.start ?? caret;
    const end = passage?.end ?? caret;
    replaceYTextRange(this.#document, this.#activeFileText, start, end, template.text, this);
    const selectionStart = template.select ? start + template.text.indexOf(template.select) : start + template.text.length;
    this.#elements.source.focus();
    this.#selectAuthoringRange(selectionStart, selectionStart + (template.select?.length ?? 0));
  }

  #insertProjectInclude(text: Y.Text, index: number, path: string): void {
    const directive = `\n::include[${path}]\n`;
    this.#document.transact(() => text.insert(index, directive), this);
    if (text === this.#activeFileText) {
      const caret = index + directive.length;
      this.#elements.source.focus();
      this.#selectAuthoringRange(caret);
    }
  }

  #applyGeneratedTable(target: AuthoringPassage, insertion: string): void {
    replaceYTextRange(this.#document, this.#activeFileText, target.start, target.end, insertion, this);
    const caret = target.start + insertion.length;
    this.#elements.source.focus();
    this.#selectAuthoringRange(caret);
  }

  async #openCreatedCandidate(value: ModelCandidate): Promise<void> {
    await this.#resourceRefresh.request();
    this.#openResourceContext({ kind: "candidate", id: value.id });
  }

  async #completeCandidateRequest(detail: CandidateDecisionOutcome): Promise<string | null> {
    let failure = detail.failure;
    if (failure) {
      await this.#resourceRefresh.request().catch(() => undefined);
      this.#showToast(failure);
    } else {
      try {
        await this.#resourceRefresh.request();
        if (detail.action === "reject") this.#contextState = activateResearchTab(this.#contextState, RESEARCH_ASSISTANT_KEY);
        this.#showToast(detail.message);
      } catch (error) {
        failure = error instanceof Error ? error.message : "Candidate decision failed";
        await this.#resourceRefresh.request().catch(() => undefined);
        this.#showToast(failure);
      }
    }
    return failure;
  }

  async #showPaper(pdf: PdfResource, page?: number, focusAnnotationId?: string): Promise<void> {
    this.#preparePdfContext(
      { kind: "pdf", id: pdf.id },
      {
        ...(page !== undefined ? { page } : {}),
        ...(focusAnnotationId !== undefined ? { focusedAnnotationId: focusAnnotationId } : {}),
      },
    );
    this.#syncWorkspaceRoute("push");
    await this.#elements.contextResourcePresenter.loadActivePdf(page !== undefined || focusAnnotationId !== undefined);
  }

  async #openLibraryPdf(artifact: LibraryPdfArtifact, page?: number, updateHistory = true): Promise<void> {
    const key = this.#preparePdfContext({ kind: "library-pdf", id: artifact.id }, page === undefined ? {} : { page });
    if (appMode === "library" && updateHistory) {
      const active = this.#contextState.tabs.find((tab) => tab.key === key);
      const route = libraryPdfRoute(artifact.id, page ?? (active?.kind === "library-pdf" ? active.page : 1));
      history.pushState({ view: "library-pdf", artifactId: artifact.id }, "", route);
    }
    if (appMode === "workspace") this.#syncWorkspaceRoute("push");
    await this.#elements.contextResourcePresenter.loadActivePdf(page !== undefined);
  }

  async #openProjectReferencePdf(pdf: ProjectReferencePdf, page?: number, updateHistory = true): Promise<void> {
    this.#preparePdfContext({ kind: "library-pdf", id: pdf.id }, page === undefined ? {} : { page });
    if (appMode === "workspace" && updateHistory) this.#syncWorkspaceRoute("push");
    await this.#elements.contextResourcePresenter.loadActivePdf(page !== undefined);
  }

  #preparePdfContext(
    target: { readonly kind: "pdf" | "library-pdf"; readonly id: string },
    location: PdfResearchLocation,
  ): ResearchResourceKey {
    this.#captureActiveContextState();
    const key = researchResourceKey(target);
    const context = setPdfResearchLocation(openResearchResource(this.#contextState, target), key, location);
    this.#presentContextTransition(context, key, false, false);
    return key;
  }

  async #restoreLibraryRoute(): Promise<void> {
    await this.#elements.referenceLibraryWorkspace.restoreRoute(readLibraryUiRoute(new URL(location.href)));
  }

  #showPassage(anchor: PassageLink["anchor"]): void {
    const resolution = resolveManuscriptAnchor(this.#document, anchor);
    if (resolution.status !== "resolved") {
      this.#showToast("This manuscript anchor is stale and needs to be linked again.");
      return;
    }
    this.#focusProjectRange(anchor.fileId, resolution.start, resolution.end);
    this.#elements.source.scrollIntoView({ behavior: "smooth", block: "center" });
    this.#showToast(
      resolution.exactMatch ? "Linked manuscript passage selected." : "Changed linked passage selected; review its current text.",
    );
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
    void this.#renderPreview();
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

  async #prepareOfflineShell(): Promise<void> {
    try {
      const registered = await registerOfflineServiceWorker(navigator.serviceWorker, () => {
        this.#elements.toast.pin("A new version of Kirjolab is available.", {
          action: () => void this.#persistOfflineWorkspace().finally(() => location.reload()),
          actionLabel: "Refresh now",
        });
      });
      if (!registered || appMode !== "workspace" || typeof caches === "undefined") return;
      if (await cacheOfflineNavigation(caches, fetch, location.href)) document.body.dataset.offlineReady = "true";
    } catch {
      // The online application remains fully usable when offline APIs are unavailable.
    }
  }

  async #clearOfflineBrowserData(): Promise<void> {
    await this.#offlineSaves.flush();
    await Promise.all([
      clearAllOfflineWorkspaces(typeof indexedDB === "undefined" ? undefined : indexedDB),
      clearOfflineShellCaches(typeof caches === "undefined" ? undefined : caches),
    ]);
  }

  #showToast(message: string, options?: AppToastOptions): void {
    this.#elements.toast.show(message, options);
  }
}

function readWorkspaceId(): string {
  const value = document.body.dataset.workspaceId;
  if (!value || !/^[a-z0-9-]{1,64}$/iu.test(value)) throw new Error("Invalid project identity");
  return value;
}

function readIdentityEmail(): string {
  const value = document.body.dataset.identityEmail;
  if (!value || value.length > 320) throw new Error("Invalid offline identity");
  return value;
}

function readAppMode(): "workspace" | "library" {
  return document.body.dataset.appMode === "library" ? "library" : "workspace";
}

if (typeof document !== "undefined") {
  const app = new WorkspaceApp();
  void app.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Kirjolab failed to start";
    document.body.textContent = message;
  });
}
