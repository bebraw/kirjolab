import * as Y from "yjs";
import "./action-menu-controller";
import { collectAppElements } from "./app-elements";
import { reviewerResponsePath, reviewerResponseTemplate } from "../domain/reviewer-response";
import { resolveManuscriptAnchor } from "../domain/manuscript-anchor";
import { resolveWorkspaceSnapshotAnchors } from "../domain/workspace-anchor-projection";
import { projectFileCollaborationTextName, relativeProjectPath, type ProjectFile } from "../domain/project-files";
import { publicationWordStatistics } from "../domain/publication-statistics";
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
import {
  type ModelCandidate,
  type PassageLink,
  type PdfResource,
  type PublicationResource,
  type WorkspaceSnapshot,
} from "../domain/workspace";
import { loadWorkspaceSnapshot, parseWorkspaceSnapshot, WorkspaceAccessError } from "./workspace-snapshot-client";
import { CoalescedRefresh, DebouncedAsyncQueue } from "./collaboration";
import { CollaborationSession } from "./collaboration-session";
import { CollaborationSocket } from "./collaboration-socket";
import { resolveAssistantTarget } from "./assistant-operations";
import { createCitationInsertion, type CitationContext } from "./citations";
import { type ProjectFileDialogMode } from "./project-file-dialog";
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
} from "./research-context";
import {
  readWorkspaceUiRoute,
  researchTargetFromContextKey,
  workspaceUiRouteUrl,
  type AuthoringMode,
  type WorkspaceRail,
  type WorkspaceSurface,
} from "./workspace-ui-route";
import "./workspace-rail-tabs";
import "./authoring-mode-tabs";
import type { EditorPresenceRange } from "./editor-presence";
import { bindYText, captureRelativeSelection, type RelativeEditorSelection } from "./source-editor-adapter";

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
    async () => await this.#persistOfflineWorkspace(),
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
  #projectFileIncludeTarget: RelativeEditorSelection | null = null;
  #projectFileIncludeFromPath: string | null = null;
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
      remoteUpdateApplied: () => this.#updateModelAvailability(),
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
      previewToSource: () => this.#syncSourceFromPreviewCenter(),
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
    void this.#applyWorkspaceLayout(this.#elements.workspaceLayout.restore(), false);
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
    this.#elements.workspaceLayout.configure(workspaceId);
    this.#elements.workspaceLayout.bindChange((layout) => void this.#applyWorkspaceLayout(layout, false));
    this.#elements.workspaceCatalogPanel.configure(catalogBase, workspaceId, this.#elements.workspaceSwitcher);
    this.#elements.workspaceCatalogPanel.bindTrigger(this.#elements.manageWorkspaces);
    this.#elements.workspaceSettingsPanel.bindWorkspace(this.#elements.workspaceSettings, {
      refreshCatalog: async () => await this.#elements.workspaceCatalogPanel.refresh(),
      refreshGitHub: () => void this.#elements.gitHubSyncMenu.refreshWorkspace(true),
      saveTemplate: async (projectTitle) =>
        await this.#elements.saveTemplateDialog.open(projectTitle, async () => await this.#refreshProjectTemplates()),
      sources: () => ({
        catalog: this.#elements.workspaceCatalogPanel.catalog,
        hiddenFileIds: this.#elements.projectFileDialog.hiddenFiles,
        snapshot: this.#snapshot,
        workspaceId,
      }),
    });
    this.#elements.newWorkspaceStartingPoints.bindTrigger(this.#elements.newWorkspace, async () => await this.#refreshProjectTemplates());
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
      openSettings: async (checkGitHub) => await this.#elements.workspaceSettingsPanel.openSettings(checkGitHub),
      refreshProject: async () => await this.#resourceRefresh.request(),
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
    this.#elements.workspaceRailTabs.bindNavigation((rail) => this.#showRail(rail));
    this.#elements.researchDiaryPanel.bindOpen(
      () => void this.#openWorkflowFile(researchDiaryPath, () => researchDiaryTemplate(new Date().toISOString().slice(0, 10))),
    );
    this.#elements.manuscriptMapPanel.bindNavigation(({ fileId, from, to }) => this.#focusProjectRange(fileId, from, to));
    this.#elements.manuscriptMapPanel.bindProjectPresentation(this.#elements);
    const writingWorkflow: WritingWorkflowBinding = {
      notice: (message) => this.#showToast(message),
      open: (kind) =>
        void this.#openWorkflowFile(
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
      refreshLibrary: async () => await this.#refreshReferenceLibrary(),
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
      this.#updateModelAvailability();
    });
    bindYText(this.#elements.bibliography, this.#bibliography, this.#document);
    this.#elements.projectImageUpload.configure(apiBase);
    this.#elements.projectFileDialog.configureApi(apiBase, {
      commit: (snapshot) => {
        this.#snapshot = snapshot;
        this.#renderProjectFiles();
        void this.#renderPreview();
      },
      presentNotice: (message, options) => this.#showToast(message, options),
      previewChanged: () => void this.#renderPreview(),
      selectFile: (fileId) => this.#selectProjectFile(fileId),
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
      prepareDialog: (mode, file) => {
        const include = mode === "create-and-include";
        this.#projectFileIncludeTarget = include ? captureRelativeSelection(this.#elements.source, this.#activeFileText) : null;
        this.#projectFileIncludeFromPath = include ? (file?.path ?? null) : null;
      },
      quickOpen: () => {
        this.#layout.setRailCollapsed(false);
        this.#showRail("files");
      },
      saved: ({ fileId, message, mode, path }) => {
        const included = this.#insertRememberedProjectInclude(mode, path);
        this.#projectFileIncludeTarget = null;
        this.#projectFileIncludeFromPath = null;
        if (!included && fileId) this.#selectProjectFile(fileId);
        this.#showToast(message);
      },
      selectFile: (fileId) => this.#selectProjectFile(fileId),
      tree: this.#elements.projectTreePanel,
    });
    this.#elements.projectFileDialog.bindPresentation(this.#elements);
    this.#elements.projectFileDialog.bindLiveContent((file, entryFileId) =>
      this.#document.getText(projectFileCollaborationTextName(file, entryFileId)).toString(),
    );
    this.#elements.editorInsertMenu.bind({
      includeFile: (relativePath, path) => this.#insertProjectIncludeFromMenu(relativePath, path),
      insertSyntax: (kind, template) => this.#insertSourceSyntax(kind, template),
    });
    this.#elements.sourceCompletion.bindAcceptance((intent) => {
      if (intent.kind === "citation") void this.#acceptCitationCompletion(intent);
      else this.#applySourceCompletion(intent.context.start, intent.context.end, intent.candidate.reference);
    });
    this.#elements.authoringModeTabs.bindNavigation((mode) => this.#setAuthoringMode(mode));
    this.#elements.projectHistoryDialog.configure(apiBase, {
      presentNotice: (message) => this.#showToast(message),
      trigger: this.#elements.projectHistoryTrigger,
    });
    this.#elements.manuscriptCommentListPanel.configure(apiBase);
    this.#elements.manuscriptCommentListPanel.bind({
      completeMutation: (message) =>
        this.#refreshResourcesWithNotice(message, "The comment changed, but project resources could not be refreshed."),
      openPassage: (anchor) => this.#showPassage(anchor),
      passage: (action) => {
        if (!this.#collaboration.stable) {
          this.#showToast(
            action === "create"
              ? "Wait for the manuscript to finish synchronizing before commenting."
              : "Wait for the manuscript to finish synchronizing before re-anchoring.",
          );
          return;
        }
        const passage = this.#selectedAuthoringPassage();
        if (!passage) {
          this.#showToast(
            action === "create"
              ? "Select manuscript text before adding a comment."
              : "Select the revised manuscript passage before re-anchoring the comment.",
          );
          return;
        }
        return { ...passage, sourceRevision: this.#revision };
      },
    });
    this.#source.observe(() => void this.#renderPreview());
    this.#bibliography.observe(() => void this.#renderPreview());
    this.#document.on("update", (update: Uint8Array, origin: unknown) => {
      this.#scheduleOfflineSave();
      if (origin === remoteOrigin || origin === offlineOrigin) return;
      this.#collaboration.enqueue(update);
      this.#elements.editorStatus.setSave(this.#collaboration.synced ? "Saving…" : "Saving offline…");
      this.#updateModelAvailability();
      void this.#renderPreview();
      this.#collaborationSocket.flush();
    });
    this.#elements.contextResourcePresenter.bindProjectEvidence(apiBase, {
      completeMutation: (message, refreshFailure) => this.#refreshResourcesWithNotice(message, refreshFailure),
      linkAnnotation: (annotationId) => void this.#linkSelectedPassage("annotation", annotationId),
      openPassage: (anchor) => this.#showPassage(anchor),
      refreshResources: async () => await this.#resourceRefresh.request(),
    });
    this.#elements.contextResourcePresenter.bindProjectMap(apiBase, {
      document: () => {
        this.#showWorkspaceSurface("authoring");
        this.#setAuthoringMode("write");
        this.#elements.source.focus();
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
      enriched: (message) =>
        this.#refreshResourcesWithNotice(message, "The reference was enriched, but project resources could not be refreshed."),
      manage: (publicationId) => void this.#openReferenceLibraryEntry(publicationId),
    });
    this.#elements.contextResourcePresenter.bindProjectAnnotationIntake(async () => await this.#resourceRefresh.request());
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
      openPdf: async (artifact, page) => await this.#openLibraryPdf(artifact, page),
      projectApiBase: apiBase,
    });
    this.#elements.contextResourcePresenter.bindRoutes({
      insertCitation: (citationAlias, locator) => this.#insertCitation(citationAlias, locator),
      library: () => this.#librarySnapshot,
      openCandidate: (candidate) => this.#openCandidateContext(candidate),
      openLibraryPdf: async (artifact, page) => await this.#openLibraryPdf(artifact, page, false),
      openProjectPdf: async (pdf, page, annotationId) => await this.#showPaper(pdf, page, annotationId),
      openPublication: (publication) => this.#openPublicationContext(publication),
      openReferencePdf: async (pdf, page) => await this.#openProjectReferencePdf(pdf, page, false),
      presentNotice: (message) => this.#showToast(message),
      project: () => this.#snapshot,
      referencePdfs: () => this.#elements.contextResourcePresenter.referencePdfs,
      refreshLibrary: async () => await this.#refreshReferenceLibrary(),
    });
    this.#elements.contextResourcePresenter.bindPdfViewer(this.#pdfViewer, apiBase);
    this.#elements.libraryPdfInspector.bindProjectMutations(
      (message, snapshot) => void this.#completeLibraryProjectMutation(message, snapshot),
    );
    this.#elements.contextResourcePresenter.bindClaimList(apiBase, {
      completeMutation: (message) =>
        this.#refreshResourcesWithNotice(message, "The claim changed, but project resources could not be refreshed."),
      linkPassage: (claimId) => void this.#linkSelectedPassage("claim", claimId),
      openPassage: (anchor) => this.#showPassage(anchor),
    });
    this.#elements.workspaceSurfaceSwitcher.bindNavigation((surface) => this.#showWorkspaceSurface(surface));
    this.#layout.bind();
    this.#elements.contextTabStrip.bindNavigation({
      activate: (key) => this.#activateContext(key),
      close: (key) => this.#closeContextTab(key),
      openLibrary: () => void this.#openReferenceLibrary(),
    });
    this.#elements.workspacePreview.bindNavigation({
      openCitation: (citation) => this.#openCitation(citation),
      selectDiagnostic: ({ fileId, from, to }) => this.#focusProjectRange(fileId || this.#snapshot?.entryFileId || "", from, to),
      showSource: (offset) => this.#syncSourceFromPreviewOffset(offset),
    });
    this.#elements.sourceCitationControl.bindNavigation((citation) => this.#openCitation(citation));
    this.#elements.contextResourcePresenter.bindPublicationContext(apiBase, {
      papersChanged: (message) =>
        this.#refreshResourcesWithNotice(message, "The paper links changed, but project resources could not be refreshed."),
    });
    this.#elements.assistantGenerationPresenter.bindResources(this.#elements.contextResourcePresenter.assistantResources());
    this.#elements.assistantGenerationPresenter.bindWorkflow({
      applyTable: (target, insertion) => this.#applyGeneratedTable(target, insertion),
      decisionChanged: () => {
        this.#renderResearchContext(false);
        this.#updateModelAvailability();
      },
      generationInput: () => {
        const input = this.#assistantGenerationContext();
        return input ? { ...input, manuscript: this.#activeFileText.toString() } : null;
      },
      openEvidenceRail: () => this.#showRail("research"),
      openGeneratedCandidate: async (candidate) => await this.#openCreatedCandidate(candidate),
      refreshAvailability: () => this.#updateModelAvailability(),
      refreshTarget: () => this.#renderAssistantTargetPreview(),
      resolveDecision: async (detail) => await this.#completeCandidateRequest(detail),
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
    this.#renderProjectFiles();
    this.#renderResources();
    this.#scheduleOfflineSave();
    await this.#refreshProjectReferencePdfs();
  }

  #showRail(mode: WorkspaceRail): void {
    this.#elements.workspaceRailTabs.setMode(mode);
    if (mode === "guide") this.#renderManuscriptMap();
    this.#syncWorkspaceRoute("replace");
  }

  async #applyWorkspaceLayout(value: string, persist = true): Promise<void> {
    const layout = this.#elements.workspaceLayout.setLayout(value, persist);
    this.#elements.workspaceSurfaces.dataset.layout = layout;
    if (layout === "pdf") await this.#ensurePdfLayoutResource();
    window.dispatchEvent(new Event("resize"));
    this.#syncWorkspaceRoute("replace");
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
    if (url.searchParams.has("rail")) this.#showRail(route.rail);
    if (url.searchParams.has("mode")) this.#setAuthoringMode(route.mode);
    if (route.fileId && this.#snapshot?.files.some((file) => file.id === route.fileId)) this.#selectProjectFile(route.fileId);
    if (url.searchParams.has("context")) await this.#restoreWorkspaceContext(route);
    if (route.layout) await this.#applyWorkspaceLayout(route.layout, false);
    if (url.searchParams.has("surface")) this.#showWorkspaceSurface(route.surface);
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
    const tabLocation = researchTabRouteLocation(activeTab);
    const next = workspaceUiRouteUrl(current, {
      ...activeWorkspaceFileRoute(this.#activeFileId, this.#snapshot?.entryFileId),
      rail: this.#elements.workspaceRailTabs.mode,
      mode: this.#elements.authoringModeTabs.mode,
      surface: this.#elements.workspaceSurfaces.dataset.activeSurface === "context" ? "context" : "authoring",
      layout: this.#elements.workspaceLayout.value,
      contextKey: this.#contextState.activeKey,
      ...tabLocation,
    });
    const currentRelative = `${current.pathname}${current.search}${current.hash}`;
    if (next === currentRelative) return;
    if (mode === "push") history.pushState({ view: "workspace" }, "", next);
    else history.replaceState(history.state, "", next);
  }

  async #refreshProjectTemplates(): Promise<void> {
    await this.#elements.newWorkspaceStartingPoints.refresh(this.#elements.workspaceCatalogPanel.catalog);
    this.#elements.saveTemplateDialog.setTemplates(this.#elements.newWorkspaceStartingPoints.availableTemplates);
  }

  #renderCollaborationWorkflow(): void {
    const status = this.#collaboration.status;
    this.#elements.connectionStatus.setConnection(status.label, status.connected);
    this.#elements.source.disabled = !this.#collaboration.canEdit;
    this.#elements.bibliography.disabled = !this.#collaboration.canEdit;
    this.#updateModelAvailability();
  }

  #captureEditorSelections(): RelativeEditorSelection[] {
    return [
      captureRelativeSelection(this.#elements.source, this.#activeFileText),
      captureRelativeSelection(this.#elements.bibliography, this.#bibliography),
    ];
  }

  #restoreEditorSelections(selections: RelativeEditorSelection[]): void {
    for (const selection of selections) {
      const start = Y.createAbsolutePositionFromRelativePosition(selection.start, this.#document);
      const end = Y.createAbsolutePositionFromRelativePosition(selection.end, this.#document);
      if (!start || !end || start.type !== selection.text || end.type !== selection.text) continue;
      selection.textarea.setSelectionRange(start.index, end.index, selection.direction ?? undefined);
    }
    if (document.activeElement === this.#elements.source) this.#rememberAuthoringSelection();
    else this.#renderAuthoringTarget();
  }

  #setRevision(revision: number): void {
    this.#revision = Math.max(this.#revision, revision);
    this.#elements.collaboratorSelections.setData({ files: this.#elements.projectFileDialog.projectFiles(true), revision: this.#revision });
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

  #updateModelAvailability(): void {
    this.#elements.assistantGenerationPresenter.presentAvailability({
      hasInsertionTarget: this.#assistantPassage("insertion") !== null,
      hasPassage: this.#assistantPassage("scope") !== null,
      stableDocument: this.#collaboration.stable,
    });
  }

  #renderAssistantTargetPreview(): void {
    const target = this.#assistantPassage("insertion");
    const passage = this.#assistantPassage("scope");
    this.#elements.assistantGenerationPresenter.presentTarget(passage?.excerpt ?? null, target);
  }

  async #renderPreview(bibliography = this.#bibliography.toString()): Promise<void> {
    const files = this.#previewProjectFiles();
    const outcome = await this.#elements.workspacePreview.renderProject({
      activeFileId: this.#activeFileId,
      apiBase,
      bibliography,
      fallbackSource: this.#source.toString(),
      files,
      hiddenAssetIds: this.#elements.projectTreePanel.hiddenAssets,
      snapshot: this.#snapshot,
    });
    if (!outcome) return;
    this.#renderManuscriptMap(outcome.publicationComposition?.content ?? outcome.renderedSource);
    if (outcome.publicationComposition && this.#snapshot) {
      this.#elements.exportDialog.setStatistics(publicationWordStatistics(outcome.publicationComposition, files));
    }
    if (!outcome.available) return;
    const snapshot = this.#snapshot;
    if (snapshot) {
      const resolved = resolveWorkspaceSnapshotAnchors(this.#document, snapshot);
      this.#elements.contextResourcePresenter.presentResolvedWorkspace(resolved, bibliography, outcome.publicationComposition?.content);
    }
  }

  #renderManuscriptMap(source?: string): void {
    const files = this.#previewProjectFiles();
    this.#elements.manuscriptMapPanel.presentProject({ fallbackSource: this.#source.toString(), files, snapshot: this.#snapshot, source });
  }

  async #openWorkflowFile(path: string, content: () => string): Promise<void> {
    const existing = this.#snapshot?.files.find((file) => file.path === path);
    if (existing) {
      this.#selectProjectFile(existing.id);
      this.#elements.source.focus();
      return;
    }
    await this.#createWorkflowFile(path, content());
  }

  async #createWorkflowFile(path: string, content: string): Promise<void> {
    const created = await this.#elements.projectFileDialog.createFile(path, content);
    const next = new URL(location.href);
    next.searchParams.set("file", created.id);
    next.searchParams.set("rail", "guide");
    location.assign(`${next.pathname}${next.search}${next.hash}`);
  }

  #syncSourceFromPreviewCenter(): void {
    const offset = this.#elements.workspacePreview.centeredSourceOffset();
    if (offset !== null) this.#syncSourceFromPreviewOffset(offset, true);
  }

  #syncSourceFromPreviewOffset(offset: number, centerEditor = false): void {
    const location = this.#elements.previewSyncControls.sourceLocation(offset);
    if (!location) return;
    this.#showWorkspaceSurface("authoring");
    this.#focusProjectRange(location.fileId, location.offset, location.offset);
    if (centerEditor) this.#elements.previewSyncControls.centerSourceOffset(location.offset);
  }

  #syncPreviewFromSource(explicit = true): void {
    const fileId = this.#activeFileId ?? this.#snapshot?.entryFileId ?? "";
    const previewActive = this.#contextState.activeKey === RESEARCH_PREVIEW_KEY;
    const splitLayout = this.#elements.workspaceSurfaces.dataset.layout === "split";
    const offsets = this.#elements.previewSyncControls.activeSourcePreviewOffsets(fileId, explicit, previewActive, splitLayout);
    if (offsets.length === 0) return;
    this.#elements.workspacePreview.revealNearestSource(offsets);
  }

  #previewProjectFiles(): ProjectFile[] {
    return this.#elements.projectFileDialog.projectFiles(
      this.#collaboration.synced || this.#collaboration.offlineAvailable,
      this.#snapshot,
    );
  }

  #renderProjectFiles(): void {
    const snapshot = this.#snapshot;
    if (!snapshot) return;
    const activeFile = this.#elements.projectFileDialog.presentProject(snapshot, `${apiBase}/assets`, appMode === "workspace");
    if (activeFile) this.#activeFileText = this.#document.getText(projectFileCollaborationTextName(activeFile, snapshot.entryFileId));
    this.#renderAuthoringTarget();
  }

  #selectProjectFile(fileId: string): void {
    const snapshot = this.#snapshot;
    if (!snapshot) return;
    const file = this.#elements.projectFileDialog.activateFile(snapshot, fileId);
    if (!file) return;
    this.#unbindSourceEditor();
    this.#activeFileText = this.#document.getText(projectFileCollaborationTextName(file, snapshot.entryFileId));
    this.#elements.source.value = this.#activeFileText.toString();
    this.#authoringSelection = null;
    this.#elements.source.setSelectionRange(0, 0);
    this.#bindSourceEditor(this.#activeFileText);
    this.#rememberAuthoringSelection();
    this.#renderProjectFiles();
    this.#updateModelAvailability();
    this.#elements.workspacePreview.resetScroll();
    void this.#renderPreview();
    this.#syncWorkspaceRoute("replace");
  }

  #insertRememberedProjectInclude(mode: ProjectFileDialogMode, path: string): boolean {
    const target = this.#projectFileIncludeTarget;
    const fromPath = this.#projectFileIncludeFromPath;
    if (mode !== "create-and-include" || !target || !fromPath) return false;
    const position = Y.createAbsolutePositionFromRelativePosition(target.end, this.#document);
    if (position?.type === target.text) this.#insertProjectInclude(target.text, position.index, relativeProjectPath(fromPath, path));
    return true;
  }

  #focusProjectRange(fileId: string, from: number, to: number): void {
    if (fileId) this.#selectProjectFile(fileId);
    this.#setAuthoringMode("write");
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(from, Math.max(from, to));
    this.#rememberAuthoringSelection();
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

  #refreshResourcesWithNotice(message: string, failureMessage: string): void {
    void this.#resourceRefresh
      .request()
      .then(() => this.#showToast(message))
      .catch(() => this.#showToast(failureMessage));
  }

  async #completeLibraryProjectMutation(message: string, snapshot: WorkspaceSnapshot): Promise<void> {
    await this.#acceptWorkspaceMutation(snapshot);
    this.#renderReferenceLibrary();
    this.#showToast(message);
  }

  async #acceptWorkspaceMutation(result: Response | WorkspaceSnapshot): Promise<void> {
    if (result instanceof Response) await expectOk(result);
    const value: unknown = result instanceof Response ? await result.json() : result;
    this.#snapshot = parseWorkspaceSnapshot(value, "Project mutation returned an invalid snapshot");
    await this.#refreshProjectReferencePdfs(false);
    this.#renderResources();
    this.#renderProjectFiles();
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
    this.#updateModelAvailability();
    this.#syncWorkspaceRoute("replace");
  }

  #setAuthoringMode(mode: AuthoringMode): void {
    const writing = mode === "write";
    this.#elements.authoringModeTabs.setMode(mode);
    if (writing) this.#elements.source.focus();
    this.#syncWorkspaceRoute("replace");
  }

  #showWorkspaceSurface(surface: WorkspaceSurface, syncRoute = true): void {
    this.#elements.workspaceSurfaces.dataset.activeSurface = surface;
    this.#elements.workspaceSurfaceSwitcher.setSurface(surface);
    if (syncRoute) this.#syncWorkspaceRoute("replace");
  }

  #captureActiveContextState(): void {
    this.#contextState = this.#elements.contextResourcePresenter.captureBoundContext(this.#contextState);
  }

  #activateContext(key: ResearchContextKey): void {
    this.#captureActiveContextState();
    this.#presentContextTransition(activateResearchTab(this.#contextState, key), key);
  }

  #openPublicationContext(publication: PublicationResource): void {
    this.#captureActiveContextState();
    const target = { kind: "publication" as const, id: publication.id };
    this.#presentContextTransition(openResearchResource(this.#contextState, target), researchResourceKey(target));
  }

  #openCandidateContext(candidate: ModelCandidate): void {
    this.#captureActiveContextState();
    const target = { kind: "candidate" as const, id: candidate.id };
    this.#presentContextTransition(openResearchResource(this.#contextState, target), researchResourceKey(target));
  }

  #presentContextTransition(context: ResearchContextState, key: ResearchContextKey, loadPdf = true, syncRoute = true): void {
    this.#contextState = context;
    this.#renderResearchContext(loadPdf);
    this.#showWorkspaceSurface("context", false);
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
    this.#document.transact(() => {
      if (end > start) this.#activeFileText.delete(start, end - start);
      this.#activeFileText.insert(start, value);
    }, this);
    const caret = start + value.length;
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(caret, caret);
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
    const start = Y.createAbsolutePositionFromRelativePosition(this.#authoringSelection.start, this.#document);
    const end = Y.createAbsolutePositionFromRelativePosition(this.#authoringSelection.end, this.#document);
    if (!start || !end || start.type !== this.#activeFileText || end.type !== this.#activeFileText) return null;
    return { start: Math.min(start.index, end.index), end: Math.max(start.index, end.index) };
  }

  #renderAuthoringTarget(): void {
    const target = this.#resolvedAuthoringTarget();
    const file = this.#snapshot?.files.find((item) => item.id === this.#activeFileId);
    this.#elements.editorStatus.setAuthoringTarget(file?.path ?? "Manuscript", this.#activeFileText.toString(), target);
    this.#renderSourceEditorHighlight();
    this.#renderAssistantTargetPreview();
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
    this.#showWorkspaceSurface("authoring");
    this.#setAuthoringMode("write");
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(insertion.caret, insertion.caret);
    this.#rememberAuthoringSelection();
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
    const start = Y.createAbsolutePositionFromRelativePosition(selection.start, this.#document);
    const end = Y.createAbsolutePositionFromRelativePosition(selection.end, this.#document);
    if (!start || !end) return null;
    if (!this.#isActiveAuthoringRange(start, end)) return null;
    const excerpt = this.#activeFileText.toString().slice(start.index, end.index);
    return excerpt.trim() && this.#activeFileId ? { fileId: this.#activeFileId, start: start.index, end: end.index, excerpt } : null;
  }

  #isActiveAuthoringRange(start: Y.AbsolutePosition, end: Y.AbsolutePosition): boolean {
    return start.type === this.#activeFileText && end.type === this.#activeFileText && start.index < end.index;
  }

  #assistantPassage(kind: "insertion" | "scope"): AuthoringPassage | null {
    if (!this.#activeFileId) return null;
    const target = this.#resolvedAuthoringTarget();
    if (!target) return null;
    const source = this.#activeFileText.toString();
    const { start, end, text } =
      kind === "scope"
        ? resolveAssistantTarget(source, target.start, target.end, this.#elements.assistantGenerationPresenter.targetScope())
        : { start: target.start, end: target.end, text: source.slice(target.start, target.end) };
    if (kind === "scope" && !text.trim()) return null;
    return { fileId: this.#activeFileId, start, end, excerpt: text };
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
    this.#document.transact(() => {
      if (end > start) this.#activeFileText.delete(start, end - start);
      this.#activeFileText.insert(start, template.text);
    }, this);
    const selectionStart = template.select ? start + template.text.indexOf(template.select) : start + template.text.length;
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(selectionStart, selectionStart + (template.select?.length ?? 0));
    this.#rememberAuthoringSelection();
  }

  #insertProjectInclude(text: Y.Text, index: number, path: string): void {
    const directive = `\n::include[${path}]\n`;
    this.#document.transact(() => text.insert(index, directive), this);
    if (text === this.#activeFileText) {
      const caret = index + directive.length;
      this.#elements.source.focus();
      this.#elements.source.setSelectionRange(caret, caret);
      this.#rememberAuthoringSelection();
    }
  }

  #assistantGenerationContext() {
    return this.#elements.assistantGenerationPresenter.prepareGeneration({
      insertionTarget: this.#assistantPassage("insertion"),
      passage: this.#assistantPassage("scope"),
      snapshotAvailable: this.#snapshot !== null,
      sourceRevision: this.#revision,
      stableDocument: this.#collaboration.stable,
    });
  }

  #applyGeneratedTable(target: AuthoringPassage, insertion: string): void {
    this.#document.transact(() => {
      if (target.end > target.start) this.#activeFileText.delete(target.start, target.end - target.start);
      this.#activeFileText.insert(target.start, insertion);
    }, this);
    const caret = target.start + insertion.length;
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(caret, caret);
    this.#rememberAuthoringSelection();
  }

  async #openCreatedCandidate(value: ModelCandidate): Promise<void> {
    await this.#resourceRefresh.request();
    this.#openCandidateContext(this.#snapshot?.candidates.find((item) => item.id === value.id) ?? value);
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
    this.#showWorkspaceSurface("authoring");
    this.#setAuthoringMode("write");
    this.#selectProjectFile(anchor.fileId);
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(resolution.start, resolution.end);
    this.#rememberAuthoringSelection();
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
    this.#renderProjectFiles();
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

function activeWorkspaceFileRoute(activeFileId: string | null, entryFileId: string | undefined): { fileId: string } | object {
  return activeFileId && activeFileId !== entryFileId ? { fileId: activeFileId } : {};
}

function researchTabRouteLocation(tab: ResearchContextState["tabs"][number] | undefined): { page: number; annotationId?: string } | object {
  if (tab?.kind !== "pdf" && tab?.kind !== "library-pdf") return {};
  if (tab.kind === "pdf" && tab.focusedAnnotationId) return { page: tab.page, annotationId: tab.focusedAnnotationId };
  return { page: tab.page };
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
