import * as Y from "yjs";
import "./action-menu-controller";
import { collectAppElements } from "./app-elements";
import { activePdfLoadContext, type ActivePdfLoadContext } from "./active-pdf-context";
import { buildWorkspaceKnowledgeGraph } from "../domain/knowledge";
import { reviewerResponsePath, reviewerResponseTemplate } from "../domain/reviewer-response";
import { resolveManuscriptAnchor } from "../domain/manuscript-anchor";
import { resolveWorkspaceSnapshotAnchors } from "../domain/workspace-anchor-projection";
import {
  composeProject,
  projectFileCollaborationTextName,
  previewProjectFile,
  relativeProjectPath,
  type ProjectComposition,
  type ProjectAsset,
  type ProjectFile,
  type ProjectFilePreview,
} from "../domain/project-files";
import { publicationWordStatistics } from "../domain/publication-statistics";
import { suggestCitationKey } from "../domain/publication-intake";
import { researchQuestionsPath, researchQuestionsTemplate } from "../domain/research-questions";
import { researchDiaryPath, researchDiaryTemplate } from "../domain/writing-workflows";
import {
  isProjectReferencePdfs,
  isReferenceLibrarySnapshot,
  type LibraryHighlight,
  type LibraryPdfArtifact,
  type ProjectReferencePdf,
  type ReferenceLibrarySnapshot,
} from "../domain/reference-library";
import { applicationVersionNoticeEvent } from "./application-version-control";
import "./source-citation-control";
import "./workspace-surface-switcher";
import { type EditorSyntaxKind, type EditorSyntaxTemplate } from "./editor-insert-menu";
import { sourceSpanAt } from "./composition-source-map";
import { collaboratorSelectionChangeEvent } from "./collaborator-selection-list";
import type { AppToastOptions } from "./app-toast";
import { expectOk, jsonFetch } from "./http";
import { type SourceCompletionIntent } from "./source-completion";
import type { LibraryPdfSelectionPresentation, LibraryPdfToolPresentation } from "./context-resource-presenter";
import { libraryPdfRoute, readLibraryUiRoute } from "./library-ui-route";
import { startingPointActionEvent, type StartingPointAction } from "./project-starting-point-browser";
import { WorkspaceLayoutManager } from "./workspace-layout-manager";
import { workspaceLayoutChangeEvent } from "./workspace-layout-control";
import { projectReferenceChangedEvent, type ProjectReferenceChanged } from "./project-reference-mutation";
import { projectResearchChangedEvent, type ProjectResearchChanged } from "./project-research-mutation";
import { researchQuestionWorkflowData, reviewerResponseWorkflowData, type WritingWorkflowBinding } from "./writing-workflow-panel";
import "./research-diary-summary";
import { type AssistantAuthoringPassage as AuthoringPassage } from "./assistant-result-panel";
import { type CandidateDecisionOutcome } from "./candidate-review-panel";
import { type PublicationPaperOption } from "./publication-context-panel";
import {
  isWorkspaceSnapshot,
  isWorkspaceSummaries,
  type AnnotationResource,
  type ModelCandidate,
  type PassageLink,
  type PdfResource,
  type PdfSelectionRect,
  type PublicationResource,
  type WorkspaceSnapshot,
  type WorkspaceSummary,
} from "../domain/workspace";
import { CoalescedRefresh, DebouncedAsyncQueue } from "./collaboration";
import { CollaborationSession } from "./collaboration-session";
import { CollaborationSocket } from "./collaboration-socket";
import { resolveAssistantTarget } from "./assistant-operations";
import { citationPageFromLocator, createCitationInsertion, type CitationContext } from "./citations";
import { type ProjectAnnotationSaved, type ProjectHighlightTool } from "./project-annotation-form";
import { type ProjectFileDialogMode, type ProjectFileSaved } from "./project-file-dialog";
import { type ProjectImagesUploaded } from "./project-image-upload-control";
import { projectTemplateSavedEvent, type ProjectTemplateSaved } from "./project-template-save-dialog";
import "./manuscript-map-panel";
import {
  applicationVersion,
  cacheOfflineNavigation,
  clearOfflineShellCaches,
  registerOfflineServiceWorker,
} from "./offline-service-worker";
import { clearAllOfflineWorkspaces, createOfflineWorkspaceStore, type OfflineWorkspaceStore } from "./offline-workspace";
import { PdfEvidenceViewer, type PdfSelectionCapture } from "./pdf-viewer";
import type { ExistingPdfUpload } from "./pdf-upload-queue";
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
  setResearchTabScroll,
  type ResearchContextKey,
  type ResearchContextState,
  type PdfResearchLocation,
  type ResearchResourceKey,
  type ResearchResourceTab,
} from "./research-context";
import {
  readWorkspaceUiRoute,
  researchTargetFromContextKey,
  workspaceUiRouteUrl,
  type AuthoringMode,
  type WorkspaceLayout,
  type WorkspaceRail,
  type WorkspaceSurface,
} from "./workspace-ui-route";
import "./workspace-rail-tabs";
import "./authoring-mode-tabs";
import type { EditorPresenceRange } from "./editor-presence";
import { bindYText, captureRelativeSelection, type RelativeEditorSelection } from "./source-editor-adapter";

interface PreviewInputs {
  readonly files: readonly ProjectFile[];
  readonly publicationComposition: ProjectComposition | null;
  readonly filePreview: ProjectFilePreview | null;
  readonly renderedSource: string;
}

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

interface OverlappingPdfFragment {
  readonly annotation: AnnotationResource;
  readonly fragment: AnnotationResource["fragments"][number];
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
  #renderedPdfId: string | undefined;
  #renderedPdfContextKey: ResearchContextKey | undefined;
  #contextState: ResearchContextState = createResearchContext();
  #authoringSelection: RelativeEditorSelection | null = null;
  #activeFileId: string | null = null;
  #activeFileText = this.#source;
  readonly #editorUndoManagers = new Map<Y.Text, Y.UndoManager>();
  #unbindSourceEditor: () => void = () => undefined;
  #unbindAssistantSourceStale: () => void = () => undefined;
  #projectFileIncludeTarget: RelativeEditorSelection | null = null;
  #projectFileIncludeFromPath: string | null = null;
  #librarySnapshot: ReferenceLibrarySnapshot | null = null;
  #projectReferencePdfs: readonly ProjectReferencePdf[] = [];
  #workspaceCatalog: WorkspaceSummary[] = [];
  #workspaceRouteReady = false;
  readonly #layout: WorkspaceLayoutManager;

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
      revisionCompleted: (revision) => this.#completeCollaborationRevision(revision),
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
      onSelection: (capture) => this.#capturePdfSelection(capture),
      onHighlight: (annotationId, fragmentId) => void this.#activateHighlightFragment(annotationId, fragmentId),
      onPageChange: (page) => this.#handlePdfPageChange(page),
      onPrivateHighlight: (highlightId) => this.#elements.contextResourcePresenter.selectLibraryHighlight(highlightId),
    });
    this.#layout = WorkspaceLayoutManager.forWorkspace(this.#elements.workspaceSurfaces, {
      paneStorageKey: () => `kirjolab:authoring-pane:${workspaceId}:${this.#activeResourceTab()?.kind ?? "preview"}`,
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
      this.#setConnection("Private library", true);
      await this.#openReferenceLibrary(false);
      await this.#restoreLibraryRoute();
      return;
    }
    this.#restoreWorkspaceLayout();
    this.#setEditorsEnabled(false);
    const restored = await this.#restoreOfflineWorkspace();
    try {
      await this.#refreshCatalog();
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
      await this.#openNewWorkspace();
    }
  }

  #bindUi(): void {
    this.#elements.applicationVersion.addEventListener(applicationVersionNoticeEvent, (event) => {
      this.#showToast((event as CustomEvent<string>).detail);
    });
    this.#elements.collaboratorSelections.addEventListener(collaboratorSelectionChangeEvent, () => this.#renderSourceEditorHighlight());
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
    this.#elements.workspaceLayout.addEventListener(workspaceLayoutChangeEvent, (event) => {
      void this.#applyWorkspaceLayout((event as CustomEvent<WorkspaceLayout>).detail, false);
    });
    this.#elements.manageWorkspaces.addEventListener("click", () => {
      void this.#elements.workspaceCatalogPanel.open();
    });
    this.#elements.workspaceSettingsPanel.bindWorkspace(this.#elements.workspaceSettings, {
      refreshCatalog: async () => await this.#refreshCatalog(),
      refreshGitHub: () => void this.#elements.gitHubSyncMenu.refreshWorkspace(true),
      saveTemplate: async () => await this.#openSaveTemplate(),
      sources: () => ({
        catalog: this.#workspaceCatalog,
        hiddenFileIds: this.#elements.projectFileDialog.hiddenFiles,
        snapshot: this.#snapshot,
        workspaceId,
      }),
    });
    this.#elements.newWorkspace.addEventListener("click", () => void this.#openNewWorkspace());
    this.#elements.newWorkspaceStartingPoints.addEventListener(startingPointActionEvent, (event) => {
      const action = (event as CustomEvent<StartingPointAction>).detail;
      if (action === "import-latex") this.#openLatexImportDialog();
      else this.#openGitHubImportDialog();
    });
    this.#elements.newWorkspaceStartingPoints.bindDeletion({
      presentNotice: (message, options) => this.#showToast(message, options),
      templatesChanged: () => this.#syncTemplateReplacementOptions(),
    });
    this.#elements.gitHubSyncMenu.bindWorkspace(apiBase, {
      settings: this.#elements.workspaceSettingsPanel,
      openSettings: async (checkGitHub) => await this.#elements.workspaceSettingsPanel.openSettings(checkGitHub),
      refreshProject: async () => await this.#resourceRefresh.request(),
    });
    const githubResult = new URL(location.href).searchParams.get("github");
    if (githubResult === "connected" || githubResult === "installed") {
      this.#openGitHubImportDialog();
      history.replaceState(history.state, "", location.pathname);
    }
    this.#elements.saveTemplateDialog.configure(apiBase);
    this.#elements.saveTemplateDialog.addEventListener(projectTemplateSavedEvent, (event) => {
      void this.#completeProjectTemplateSave((event as CustomEvent<ProjectTemplateSaved>).detail);
    });
    this.#elements.workspaceRailTabs.bindNavigation((rail) => this.#showRail(rail));
    this.#elements.researchDiaryPanel.bindOpen(
      () => void this.#openWorkflowFile(researchDiaryPath, () => researchDiaryTemplate(new Date().toISOString().slice(0, 10))),
    );
    this.#elements.manuscriptMapPanel.bindNavigation(({ from, to }) => this.#focusComposedRange(from, to));
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
      compareSnapshots: (priorId, currentId) => void this.#elements.webSnapshotComparison.compare(priorId, currentId),
      completeRefresh: (message, fallback, options) => void this.#completeLibraryRefresh(message, fallback, options),
      openPdf: (artifact) => void this.#openLibraryPdf(artifact),
      presentNotice: (message) => this.#showToast(message),
      revealExistingPdf: (upload) => void this.#revealExistingPdfReference(upload),
      refreshLibrary: () => void this.#refreshReferenceLibrary(),
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
    this.#elements.projectTreePanel.configure(apiBase, {
      acceptSnapshot: (snapshot) => {
        this.#snapshot = snapshot;
        this.#renderProjectFiles();
      },
      presentNotice: (message, options) => this.#showToast(message, options),
      previewChanged: () => void this.#renderPreview(),
    });
    this.#elements.projectImageUpload.configure(apiBase);
    this.#elements.projectFileDialog.configureApi(apiBase, {
      commit: (snapshot) => {
        this.#snapshot = snapshot;
        this.#renderProjectFiles();
        void this.#renderPreview();
      },
      presentNotice: (message, options) => this.#showToast(message, options),
      selectFile: (fileId) => this.#selectProjectFile(fileId),
    });
    this.#elements.projectFileDialog.bindWorkflow({
      actionControls: [this.#elements.projectFileRailActions, this.#elements.projectFileMenuActions],
      deleteFile: () => this.#deleteProjectFile(),
      focusEditor: () => this.#elements.source.focus(),
      imageUpload: this.#elements.projectImageUpload,
      insertAsset: (asset) => this.#insertProjectImage(asset),
      openDialog: (mode, folderId) => this.#openProjectFileDialog(mode, folderId),
      quickOpen: () => {
        this.#layout.setRailCollapsed(false);
        this.#showRail("files");
      },
      saved: (result) => this.#completeProjectFileSave(result),
      selectFile: (fileId) => this.#selectProjectFile(fileId),
      tree: this.#elements.projectTreePanel,
      uploaded: (result) => this.#completeProjectImageUpload(result),
    });
    this.#elements.editorInsertMenu.bind({
      includeFile: (relativePath, path) => this.#insertProjectIncludeFromMenu(relativePath, path),
      insertSyntax: (kind, template) => this.#insertSourceSyntax(kind, template),
    });
    this.#elements.sourceCompletion.bindAcceptance((intent) => {
      if (intent.kind === "citation") void this.#acceptCitationCompletion(intent);
      else this.#acceptIncludeCompletion(intent);
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
        if (!this.#hasStableDocumentBase()) {
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
    this.#elements.projectEvidencePanel.configure(apiBase);
    this.#elements.projectEvidencePanel.bind({
      annotationRemoved: (annotationId, message) => {
        this.#elements.projectAnnotationForm.clearAnnotation(annotationId);
        this.#refreshResourcesWithNotice(message, "The highlight was deleted, but project resources could not be refreshed.");
      },
      completeMutation: (message) =>
        this.#refreshResourcesWithNotice(message, "The project changed, but project resources could not be refreshed."),
      editAnnotation: (annotation) => this.#editAnnotation(annotation),
      linkAnnotation: (annotationId) => void this.#linkAnnotation(annotationId),
      notice: (message) => this.#showToast(message),
      openPassage: (anchor) => this.#showPassage(anchor),
      openPdf: (pdf, page, annotationId) => {
        this.#elements.projectAnnotationForm.selectPdf(pdf.id);
        void this.#showPaper(pdf, page, annotationId);
      },
      removeFragment: (annotationId, fragmentId) => void this.#removeHighlightFragment(annotationId, fragmentId, true),
    });
    this.#elements.projectMap.configure(apiBase);
    this.#elements.projectMap.bindNavigation((resourceKey) => this.#focusKnowledgeResource(resourceKey));
    this.#elements.publicationListPanel.configure(apiBase);
    this.#elements.publicationListPanel.bind({
      enriched: (message) =>
        this.#refreshResourcesWithNotice(message, "The reference was enriched, but project resources could not be refreshed."),
      manage: (publicationId) => void this.#openReferenceLibraryEntry(publicationId),
      open: (publication) => this.#openPublicationContext(publication),
    });
    this.#elements.projectAnnotationForm.configure(apiBase);
    this.#elements.projectAnnotationForm.bindIntake({
      openPublication: (publication) => this.#openPublicationContext(publication),
      presentNotice: (message) => this.#showToast(message),
      publications: () => this.#snapshot?.publications ?? [],
      refresh: async () => await this.#resourceRefresh.request(),
    });
    this.#elements.projectAnnotationForm.bindWorkflow({
      chooseTool: (tool) => this.#setHighlightTool(tool),
      completeSave: (saved) => void this.#completeAnnotationSave(saved),
      citePage: () => this.#citeActivePdf(),
      undoHighlight: (annotationId, fragmentId) => void this.#undoLastHighlightStroke(annotationId, fragmentId),
    });
    this.#elements.contextResourcePresenter.bindLibraryPdf({
      applyViewerPresentation: (presentation) => this.#applyLibraryPdfViewerPresentation(presentation),
      citeHighlight: (highlight) => void this.#citeLibraryHighlight(highlight),
      clearViewerDraftSelection: () => this.#pdfViewer.clearDraftSelection(),
      completeMarkup: (message) => this.#completeLibraryPdfMarkup(message),
      currentPage: () => this.#pdfViewer.currentPage,
      library: () => this.#librarySnapshot,
      openHighlight: (highlight) => void this.#openLibraryHighlight(highlight),
      openPdf: (artifact, page) => void this.#openLibraryPdf(artifact, page),
      refreshLibrary: () => this.#refreshReferenceLibrary(),
      showToast: (message) => this.#showToast(message),
    });
    for (const target of [this.#elements.referenceLibraryWorkspace, this.#elements.libraryPdfInspector]) {
      target.addEventListener(projectReferenceChangedEvent, (event) => {
        const { message, snapshot } = (event as CustomEvent<ProjectReferenceChanged>).detail;
        void this.#acceptWorkspaceMutation(snapshot).then(() => {
          this.#renderReferenceLibrary();
          this.#showToast(message);
        });
      });
    }
    for (const target of [this.#elements.referenceLibraryWorkspace, this.#elements.libraryPdfInspector]) {
      target.addEventListener(projectResearchChangedEvent, (event) => {
        const { message, snapshot } = (event as CustomEvent<ProjectResearchChanged>).detail;
        void this.#acceptWorkspaceMutation(snapshot).then(() => {
          this.#renderReferenceLibrary();
          this.#showToast(message);
        });
      });
    }
    this.#elements.claimListPanel.configure(apiBase);
    this.#elements.claimListPanel.bind({
      completeMutation: (message) =>
        this.#refreshResourcesWithNotice(message, "The claim changed, but project resources could not be refreshed."),
      linkPassage: (claimId) => void this.#linkClaim(claimId),
      openAnnotation: (annotationId) => this.#elements.projectEvidencePanel.revealAnnotation(annotationId),
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
    this.#elements.publicationContextPanel.configure(apiBase);
    this.#elements.publicationContextPanel.bind({
      insertCitation: () => this.#insertActivePublicationCitation(),
      openPaper: (paper) => void this.#openPublicationPaper(paper),
      papersChanged: (message) =>
        this.#refreshResourcesWithNotice(message, "The paper links changed, but project resources could not be refreshed."),
    });
    this.#elements.assistantGenerationPresenter.bindCandidate(apiBase, {
      decisionChanged: () => {
        this.#renderResearchContext(false);
        this.#updateModelAvailability();
      },
      focusAssistant: () => this.#focusContextTab(RESEARCH_ASSISTANT_KEY),
      openCandidate: (candidate) => this.#openCandidateContext(candidate),
      openPaper: (pdf, evidence) => void this.#showPaper(pdf, evidence.page, evidence.id),
      resolveDecision: async (detail) => await this.#completeCandidateRequest(detail),
      snapshot: () => this.#snapshot,
    });
    this.#elements.assistantGenerationPresenter.bindResults({
      applyTable: (target, insertion) => this.#applyGeneratedTable(target, insertion),
      openRevisionCandidate: async (candidate) => await this.#openCreatedCandidate(candidate),
      refreshAvailability: () => this.#updateModelAvailability(),
      refreshLibrary: async () => await this.#refreshReferenceLibrary(),
      tableState: () => ({
        revision: this.#revision,
        source: this.#activeFileText.toString(),
        stableDocument: this.#hasStableDocumentBase(),
      }),
    });
    this.#elements.assistantGenerationPresenter.bindControls({
      generationInput: () => {
        const input = this.#assistantGenerationContext();
        return input ? { ...input, manuscript: this.#activeFileText.toString() } : null;
      },
      openEvidenceRail: () => this.#showRail("research"),
      openGeneratedCandidate: async (candidate) => await this.#openCreatedCandidate(candidate),
      refreshAvailability: () => this.#updateModelAvailability(),
      refreshTarget: () => this.#renderAssistantTargetPreview(),
      reportNoEvidence: () => this.#showToast("No project evidence is available yet."),
    });
  }

  async #refreshSnapshot(): Promise<void> {
    const response = await fetch(apiBase);
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      throw new WorkspaceAccessError("Project access is no longer available");
    }
    if (!response.ok) throw new Error("Could not load the project");
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error("Project returned an invalid snapshot");
    const snapshot = this.#collaboration.synced ? resolveWorkspaceSnapshotAnchors(this.#document, value) : value;
    this.#snapshot = snapshot;
    if (!this.#hasBootstrapSnapshot) {
      this.#hasBootstrapSnapshot = true;
      this.#revision = snapshot.revision;
      this.#elements.source.value = snapshot.source;
      this.#elements.bibliography.value = snapshot.bibliography;
      void this.#renderPreview(snapshot.bibliography);
      this.#updateRevision();
    } else {
      void this.#renderPreview();
    }
    this.#renderProjectFiles();
    this.#renderResources();
    this.#scheduleOfflineSave();
    await this.#refreshProjectReferencePdfs();
  }

  async #refreshCatalog(): Promise<void> {
    const response = await fetch(catalogBase);
    if (!response.ok) throw new Error("Could not load project navigation");
    const value: unknown = await response.json();
    if (!isWorkspaceSummaries(value)) throw new Error("Project catalog returned invalid data");
    this.#renderWorkspaceCatalog(value);
  }

  #renderWorkspaceCatalog(workspaces: WorkspaceSummary[]): void {
    this.#workspaceCatalog = workspaces;
    this.#elements.workspaceSwitcher.setData(workspaces, workspaceId);
    this.#elements.workspaceCatalogPanel.setData(workspaces, workspaceId);
  }

  #showRail(mode: WorkspaceRail): void {
    this.#elements.workspaceRailTabs.setMode(mode);
    if (mode === "guide") this.#renderManuscriptMap();
    this.#syncWorkspaceRoute("replace");
  }

  #restoreWorkspaceLayout(): void {
    void this.#applyWorkspaceLayout(this.#elements.workspaceLayout.restore(), false);
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
      await this.#restoreTargetedResearchContext(target, route);
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

  async #restoreTargetedResearchContext(
    target: NonNullable<ReturnType<typeof researchTargetFromContextKey>>,
    route: ReturnType<typeof readWorkspaceUiRoute>,
  ): Promise<void> {
    if (target.kind === "publication") {
      const publication = this.#snapshot?.publications.find((item) => item.id === target.id);
      if (publication) this.#openPublicationContext(publication);
      return;
    }
    if (target.kind === "pdf") {
      const pdf = this.#snapshot?.pdfs.find((item) => item.id === target.id);
      if (pdf) await this.#showPaper(pdf, route.page, route.annotationId);
      return;
    }
    if (target.kind === "candidate") {
      const candidate = this.#snapshot?.candidates.find((item) => item.id === target.id);
      if (candidate) this.#openCandidateContext(candidate);
      return;
    }
    await this.#restoreLibraryPdfContext(target.id, route.page);
  }

  async #restoreLibraryPdfContext(id: string, page: number | undefined): Promise<void> {
    if (!this.#librarySnapshot) await this.#refreshReferenceLibrary();
    const artifact = this.#librarySnapshot?.artifacts.find((item) => item.id === id);
    if (artifact) return await this.#openLibraryPdf(artifact, page, false);
    const pdf = this.#projectReferencePdf(id);
    if (pdf) await this.#openProjectReferencePdf(pdf, page, false);
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

  #openLatexImportDialog(): void {
    this.#elements.latexImportPanel.open();
  }

  #openGitHubImportDialog(): void {
    this.#elements.gitHubImportPanel.open();
    void this.#elements.gitHubImportPanel.refreshConnection();
  }

  async #openNewWorkspace(): Promise<void> {
    this.#elements.newWorkspaceStartingPoints.open(this.#elements.newWorkspace);
    try {
      await this.#refreshProjectTemplates();
      this.#elements.newWorkspaceStartingPoints.focusFirst();
    } catch (error) {
      this.#elements.newWorkspaceStartingPoints.showError(error instanceof Error ? error.message : "Could not load project templates.");
    }
  }

  async #refreshProjectTemplates(): Promise<void> {
    await this.#elements.newWorkspaceStartingPoints.refresh(this.#workspaceCatalog);
    this.#syncTemplateReplacementOptions();
  }

  async #openSaveTemplate(): Promise<void> {
    const projectTitle = this.#elements.workspaceSettingsPanel.value.title;
    this.#elements.workspaceSettingsPanel.close();
    await this.#elements.saveTemplateDialog.showLoading();
    try {
      await this.#refreshProjectTemplates();
      await this.#elements.saveTemplateDialog.showReady(projectTitle);
    } catch (error) {
      this.#elements.saveTemplateDialog.showError(error instanceof Error ? error.message : "Could not load personal templates.");
    }
  }

  #syncTemplateReplacementOptions(): void {
    this.#elements.saveTemplateDialog.setTemplates(this.#elements.newWorkspaceStartingPoints.availableTemplates);
  }

  async #completeProjectTemplateSave({ replaced, template }: ProjectTemplateSaved): Promise<void> {
    await this.#refreshProjectTemplates();
    this.#showToast(replaced ? `Replaced template “${template.name}”.` : `Saved “${template.name}” as a personal template.`);
  }

  #renderCollaborationWorkflow(): void {
    const status = this.#collaboration.status;
    this.#setConnection(status.label, status.connected);
    this.#setEditorsEnabled(this.#collaboration.canEdit);
    this.#updateModelAvailability();
  }

  #completeCollaborationRevision(revision: number): void {
    this.#setRevision(revision);
    this.#elements.editorStatus.setSave(this.#collaboration.pendingCount === 0 ? "Saved" : "Saving…");
    this.#scheduleOfflineSave();
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
    this.#elements.collaboratorSelections.setData({ files: this.#liveProjectFiles(), revision: this.#revision });
    this.#renderSourceEditorHighlight();
    this.#updateRevision();
    this.#scheduleOfflineSave();
    const active = this.#activeResourceTab();
    if (active?.kind === "candidate") this.#presentResearchResource(active, false);
  }

  #activeEditorPresence(): readonly EditorPresenceRange[] {
    const target = this.#resolvedAuthoringTarget();
    const local: readonly EditorPresenceRange[] = target
      ? [{ collaboratorId: "local-author", start: target.start, end: target.end, local: true }]
      : [];
    return [...local, ...this.#elements.collaboratorSelections.rangesFor(this.#activeFileId)];
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
      () => this.#activeEditorPresence(),
      undoManager,
    );
    this.#unbindSourceEditor = binding.destroy;
    this.#renderSourceEditorHighlight = binding.renderHighlight;
  }

  #hasStableDocumentBase(): boolean {
    return this.#collaboration.stable;
  }

  #updateModelAvailability(): void {
    this.#elements.assistantGenerationPresenter.presentAvailability({
      hasInsertionTarget: this.#assistantInsertionTarget() !== null,
      hasPassage: this.#assistantAuthoringPassage() !== null,
      stableDocument: this.#hasStableDocumentBase(),
    });
  }

  #renderAssistantTargetPreview(): void {
    const target = this.#assistantInsertionTarget();
    const passage = this.#assistantAuthoringPassage();
    this.#elements.assistantGenerationPresenter.presentTarget(passage?.excerpt ?? null, target);
  }

  async #renderPreview(bibliography = this.#bibliography.toString()): Promise<void> {
    const inputs = this.#previewInputs();
    this.#preparePreviewContext(inputs);
    const outcome = await this.#elements.workspacePreview.renderDocument({
      apiBase,
      bibliography,
      filePreview: inputs.filePreview,
      hiddenAssetIds: this.#elements.projectTreePanel.hiddenAssets,
      publicationComposition: inputs.publicationComposition,
      renderedSource: inputs.renderedSource,
      snapshot: this.#snapshot,
    });
    if (!outcome) return;
    if (!outcome.available) {
      this.#elements.previewContextControls.showUnavailable();
      return;
    }
    this.#elements.previewSyncControls.setSourceMap(inputs.filePreview?.sourceMap ?? []);
    this.#elements.previewContextControls.setDiagnostics(outcome.diagnostics, inputs.filePreview);
    this.#renderPreviewWorkspaceContext(inputs.publicationComposition, bibliography);
  }

  #previewInputs(): PreviewInputs {
    const files = this.#previewProjectFiles();
    const publicationComposition = this.#snapshot
      ? composeProject(files, this.#snapshot.entryFileId, {}, this.#snapshot.reviewArtifactPins)
      : null;
    const filePreview = this.#snapshot
      ? previewProjectFile(files, this.#snapshot.entryFileId, this.#activeFileId, this.#snapshot.reviewArtifactPins)
      : null;
    const renderedSource = filePreview?.content ?? this.#source.toString();
    return { files, publicationComposition, filePreview, renderedSource };
  }

  #preparePreviewContext(inputs: PreviewInputs): void {
    this.#renderManuscriptMap(inputs.publicationComposition?.content ?? inputs.renderedSource);
    const { filePreview, publicationComposition } = inputs;
    this.#elements.previewContextControls.setFile(filePreview);
    if (publicationComposition && this.#snapshot) {
      this.#elements.exportDialog.setStatistics(publicationWordStatistics(publicationComposition, inputs.files));
    }
  }

  #renderPreviewWorkspaceContext(publicationComposition: ProjectComposition | null, bibliography: string): void {
    const snapshot = this.#snapshot;
    if (snapshot) {
      const resolved = resolveWorkspaceSnapshotAnchors(this.#document, snapshot);
      this.#elements.projectEvidencePanel.setPassageLinks(resolved.links);
      this.#elements.claimListPanel.setPassageLinks(resolved.claimLinks);
      this.#elements.workspaceRailTabs.setCommentCount(this.#elements.manuscriptCommentListPanel.setComments(resolved.comments));
      this.#elements.projectMap.setGraph(
        buildWorkspaceKnowledgeGraph({
          ...resolved,
          source: publicationComposition?.content ?? snapshot.composition.content,
          bibliography,
        }),
      );
    }
  }

  #renderManuscriptMap(source = this.#currentComposedSource()): void {
    this.#elements.manuscriptMapPanel.setSource(source);
    const files = this.#previewProjectFiles();
    this.#elements.researchDiaryPanel.setContent(files.find((file) => file.path === researchDiaryPath)?.content ?? null);
    this.#elements.researchQuestionPanel.setData(researchQuestionWorkflowData(files.find((file) => file.path === researchQuestionsPath)));
    this.#elements.reviewerResponsePanel.setData(reviewerResponseWorkflowData(files.find((file) => file.path === reviewerResponsePath)));
  }

  #currentComposedSource(): string {
    return this.#snapshot
      ? composeProject(this.#previewProjectFiles(), this.#snapshot.entryFileId, {}, this.#snapshot.reviewArtifactPins).content
      : this.#source.toString();
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

  #focusComposedRange(from: number, to: number): void {
    const composition = this.#snapshot
      ? composeProject(this.#previewProjectFiles(), this.#snapshot.entryFileId, {}, this.#snapshot.reviewArtifactPins)
      : null;
    const start = composition ? sourceSpanAt(composition.sourceMap, from) : undefined;
    const end = composition ? sourceSpanAt(composition.sourceMap, Math.max(from, to - 1)) : undefined;
    if (start && end && start.fileId === end.fileId) {
      this.#focusProjectRange(start.fileId, start.sourceStart, end.sourceEnd);
      return;
    }
    this.#focusProjectRange(this.#snapshot?.entryFileId ?? "", from, to);
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
    if (!this.#previewSyncAvailable(explicit)) return;
    const fileId = this.#activeFileId ?? this.#snapshot?.entryFileId ?? "";
    const sourceOffset = explicit ? this.#elements.previewSyncControls.sourceOffsetAtCenter() : this.#elements.source.selectionEnd;
    const offsets = this.#elements.previewSyncControls.previewOffsets(fileId, sourceOffset);
    if (offsets.length === 0) return;
    this.#elements.workspacePreview.revealNearestSource(offsets);
  }

  #previewSyncAvailable(explicit: boolean): boolean {
    return (
      this.#contextState.activeKey === RESEARCH_PREVIEW_KEY &&
      (explicit || (window.matchMedia("(min-width: 72rem)").matches && this.#elements.workspaceSurfaces.dataset.layout === "split"))
    );
  }

  #liveProjectFiles(): ProjectFile[] {
    if (!this.#snapshot) return [];
    return this.#snapshot.files
      .filter((file) => !this.#elements.projectFileDialog.hiddenFiles.has(file.id))
      .map((file) => ({
        ...file,
        content: this.#document.getText(projectFileCollaborationTextName(file, this.#snapshot?.entryFileId ?? "")).toString(),
      }));
  }

  #previewProjectFiles(): ProjectFile[] {
    if (!this.#snapshot) return [];
    return this.#collaboration.synced || this.#collaboration.offlineAvailable
      ? this.#liveProjectFiles()
      : this.#snapshot.files.filter((file) => !this.#elements.projectFileDialog.hiddenFiles.has(file.id));
  }

  #renderProjectFiles(): void {
    const snapshot = this.#snapshot;
    if (!snapshot) return;
    this.#ensureActiveProjectFile(snapshot);
    const files = snapshot.files.filter((file) => !this.#elements.projectFileDialog.hiddenFiles.has(file.id));
    this.#elements.projectTreePanel.setTree({
      activeFileId: this.#activeFileId,
      assetBase: `${apiBase}/assets`,
      assets: snapshot.assets,
      entryFileId: snapshot.entryFileId,
      files,
      folders: snapshot.folders,
    });
    this.#elements.editorInsertMenu.setFiles(files.find((file) => file.id === this.#activeFileId) ?? null, files);
    this.#elements.sourceCompletion.setProject(snapshot, this.#activeFileId, appMode === "workspace");
    const entryActive = this.#activeFileId === snapshot.entryFileId;
    this.#elements.projectFileMenuActions.setEntryFileActive(entryActive);
    this.#renderAuthoringTarget();
  }

  #ensureActiveProjectFile(snapshot: WorkspaceSnapshot): void {
    if (this.#activeFileId && snapshot.files.some((file) => file.id === this.#activeFileId)) return;
    this.#activeFileId = snapshot.entryFileId;
    const entry = snapshot.files.find((file) => file.id === snapshot.entryFileId);
    this.#activeFileText = entry ? this.#document.getText(projectFileCollaborationTextName(entry, snapshot.entryFileId)) : this.#source;
  }

  #selectProjectFile(fileId: string): void {
    const snapshot = this.#snapshot;
    const file = snapshot?.files.find((item) => item.id === fileId);
    if (!snapshot || !file || this.#elements.projectFileDialog.hiddenFiles.has(fileId) || fileId === this.#activeFileId) return;
    this.#unbindSourceEditor();
    this.#activeFileId = fileId;
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

  #openProjectFileDialog(mode: ProjectFileDialogMode, folderId?: string): void {
    const file = this.#snapshot?.files.find((item) => item.id === this.#activeFileId);
    const folder = this.#snapshot?.folders.find((item) => item.id === folderId);
    this.#rememberProjectFileIncludeTarget(mode, file);
    void this.#elements.projectFileDialog.showFor(mode, file, folder);
  }

  #rememberProjectFileIncludeTarget(mode: ProjectFileDialogMode, file: ProjectFile | undefined): void {
    this.#projectFileIncludeTarget =
      mode === "create-and-include" ? captureRelativeSelection(this.#elements.source, this.#activeFileText) : null;
    this.#projectFileIncludeFromPath = mode === "create-and-include" ? (file?.path ?? null) : null;
  }

  #completeProjectFileSave({ message, mode, path, snapshot }: ProjectFileSaved): void {
    this.#snapshot = snapshot;
    this.#renderProjectFiles();
    const selected = snapshot.files.find((file) => file.path === path);
    if (!this.#insertRememberedProjectInclude(mode, path) && selected) this.#selectProjectFile(selected.id);
    void this.#renderPreview();
    this.#showToast(message);
    this.#resetProjectFileDialogState();
  }

  #insertRememberedProjectInclude(mode: ProjectFileDialogMode, path: string): boolean {
    const target = this.#projectFileIncludeTarget;
    const fromPath = this.#projectFileIncludeFromPath;
    if (mode !== "create-and-include" || !target || !fromPath) return false;
    const position = Y.createAbsolutePositionFromRelativePosition(target.end, this.#document);
    if (position?.type === target.text) this.#insertProjectInclude(target.text, position.index, relativeProjectPath(fromPath, path));
    return true;
  }

  #resetProjectFileDialogState(): void {
    this.#projectFileIncludeTarget = null;
    this.#projectFileIncludeFromPath = null;
  }

  #deleteProjectFile(): void {
    const snapshot = this.#snapshot;
    const file = snapshot?.files.find((item) => item.id === this.#activeFileId);
    if (!snapshot || !file || file.id === snapshot.entryFileId) return;
    this.#elements.projectFileDialog.deleteFile(file, snapshot.entryFileId);
  }

  #completeProjectImageUpload({ message, snapshot }: ProjectImagesUploaded): void {
    this.#snapshot = snapshot;
    this.#renderProjectFiles();
    void this.#renderPreview();
    this.#showToast(message);
  }

  #insertProjectImage(asset: ProjectAsset): void {
    const activeFile = this.#snapshot?.files.find((file) => file.id === this.#activeFileId);
    if (!activeFile) return;
    const path = relativeProjectPath(activeFile.path, asset.path);
    const alt = (asset.path.split("/").at(-1) ?? "image")
      .replace(/\.[^.]+$/u, "")
      .replaceAll(/[-_]+/gu, " ")
      .replaceAll("[", "")
      .replaceAll("]", "");
    const target = /[\s()]/u.test(path) ? `<${path}>` : path;
    const syntax = `![${alt}](${target})`;
    const start = this.#resolvedAuthoringCaret() ?? this.#elements.source.selectionEnd;
    this.#document.transact(() => this.#activeFileText.insert(start, syntax), this);
    const caret = start + syntax.length;
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(caret, caret);
    this.#rememberAuthoringSelection();
    this.#showToast(`Inserted ${asset.path}.`);
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
    const opened = await this.#focusReferenceLibraryEntry(referenceId);
    if (opened && appMode === "library" && updateHistory) {
      history.pushState({ view: "library-reference", referenceId }, "", `/library?reference=${encodeURIComponent(referenceId)}`);
    }
  }

  async #focusReferenceLibraryEntry(referenceId: string): Promise<boolean> {
    if (
      !this.#librarySnapshot?.references.some((reference) => reference.id === referenceId) &&
      this.#elements.referenceLibraryWorkspace.showArchivedReferences()
    ) {
      await this.#refreshReferenceLibrary();
    }
    if (!(await this.#elements.referenceLibraryWorkspace.openReference(referenceId))) {
      this.#showToast("That reference is no longer available in the Library.");
      return false;
    }
    return true;
  }

  async #refreshReferenceLibrary(): Promise<void> {
    const archived = this.#elements.referenceLibraryWorkspace.includesArchivedReferences ? "?archived=include" : "";
    const response = await fetch(`/api/library${archived}`, { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isReferenceLibrarySnapshot(value)) throw new Error("Reference library returned an invalid snapshot");
    this.#captureActiveContextState();
    this.#librarySnapshot = value;
    await this.#refreshProjectReferencePdfs(false);
    this.#contextState = reconcileResearchContext(this.#contextState, this.#researchContextAuthorization());
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

  async #completeLibraryRefresh(
    message: string,
    fallback: string,
    options: {
      readonly complete?: () => void;
      readonly failure?: (message: string) => void;
      readonly refresh?: () => Promise<void>;
      readonly success?: (message: string) => void;
    } = {},
  ): Promise<void> {
    try {
      await (options.refresh?.() ?? this.#refreshReferenceLibrary());
      if (options.success) options.success(message);
      else this.#showToast(message);
    } catch {
      if (options.failure) options.failure(fallback);
      else this.#showToast(fallback);
    } finally {
      options.complete?.();
    }
  }

  #refreshResourcesWithNotice(message: string, failureMessage: string): void {
    void this.#resourceRefresh
      .request()
      .then(() => this.#showToast(message))
      .catch(() => this.#showToast(failureMessage));
  }

  async #revealExistingPdfReference(existing: ExistingPdfUpload): Promise<void> {
    if (existing.archived && this.#elements.referenceLibraryWorkspace.showArchivedReferences()) await this.#refreshReferenceLibrary();
    if (!(await this.#elements.referenceLibraryWorkspace.revealReference(existing.referenceId, existing.referenceKey))) {
      this.#showToast(`Library source ${existing.referenceKey} is not available.`);
    }
  }

  async #acceptWorkspaceMutation(result: Response | WorkspaceSnapshot): Promise<void> {
    if (result instanceof Response) await expectOk(result);
    const value: unknown = result instanceof Response ? await result.json() : result;
    if (!isWorkspaceSnapshot(value)) throw new Error("Project mutation returned an invalid snapshot");
    this.#snapshot = value;
    await this.#refreshProjectReferencePdfs(false);
    this.#renderResources();
    this.#renderProjectFiles();
    void this.#renderPreview();
  }

  async #refreshProjectReferencePdfs(render = true): Promise<void> {
    if (appMode !== "workspace") {
      this.#projectReferencePdfs = [];
      return;
    }
    const response = await fetch(`${apiBase}/reference-pdfs`, { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isProjectReferencePdfs(value)) throw new Error("Project reference PDFs returned invalid metadata");
    this.#projectReferencePdfs = value;
    if (render) this.#renderResources();
  }

  #renderResources(): void {
    if (!this.#snapshot) return;
    this.#captureActiveContextState();
    this.#contextState = reconcileResearchContext(this.#contextState, this.#researchContextAuthorization());
    this.#pdfViewer.updateAnnotations(this.#elements.contextResourcePresenter.presentWorkspace(this.#snapshot, this.#renderedPdfId));
    this.#renderResearchContext();
    this.#updateModelAvailability();
    this.#syncWorkspaceRoute("replace");
  }

  #researchContextAuthorization(): {
    publicationIds: Set<string>;
    pdfIds: Set<string>;
    libraryPdfIds: Set<string>;
    candidateIds: Set<string>;
  } {
    return {
      publicationIds: new Set(this.#snapshot?.publications.map((publication) => publication.id) ?? []),
      pdfIds: new Set(this.#snapshot?.pdfs.map((pdf) => pdf.id) ?? []),
      libraryPdfIds: new Set([
        ...(this.#librarySnapshot?.artifacts.map((artifact) => artifact.id) ?? []),
        ...this.#projectReferencePdfs.map((pdf) => pdf.id),
      ]),
      candidateIds: new Set(this.#snapshot?.candidates.map((candidate) => candidate.id) ?? []),
    };
  }

  #openAnnotationEvidence(annotation: AnnotationResource): void {
    const pdf = this.#snapshot?.pdfs.find((item) => item.id === annotation.pdfId);
    if (pdf) void this.#showPaper(pdf, annotation.page, annotation.id);
  }

  #editAnnotation(annotation: AnnotationResource): void {
    this.#elements.projectAnnotationForm.showAnnotation(annotation);
    this.#openAnnotationEvidence(annotation);
  }

  async #linkClaim(claimId: string): Promise<void> {
    if (!this.#hasStableDocumentBase()) {
      this.#showToast("Wait for the manuscript to finish synchronizing before linking a claim.");
      return;
    }
    const passage = this.#selectedAuthoringPassage();
    if (!passage) {
      this.#showToast("Select manuscript text before linking a claim.");
      return;
    }
    await this.#elements.claimListPanel.linkPassage({
      claimId,
      ...passage,
      sourceRevision: this.#revision,
    });
  }

  #focusKnowledgeResource(resourceId: string): void {
    const separator = resourceId.indexOf(":");
    if (separator < 0) return;
    const kind = resourceId.slice(0, separator);
    const id = resourceId.slice(separator + 1);
    this.#knowledgeResourceHandlers()[kind]?.(id);
  }

  #knowledgeResourceHandlers(): Readonly<Record<string, (id: string) => void>> {
    return {
      document: () => {
        this.#showWorkspaceSurface("authoring");
        this.#setAuthoringMode("write");
        this.#elements.source.focus();
        this.#elements.source.scrollIntoView({ behavior: "smooth", block: "center" });
      },
      project: () => this.#elements.workspaceSwitcher.focusSelect(),
      person: () => this.#elements.workspaceSharingPanel.open(),
      "model-candidate": (id) => {
        const candidate = this.#snapshot?.candidates.find((item) => item.id === id);
        if (candidate) this.#openCandidateContext(candidate);
      },
      note: (id) => {
        const share = this.#snapshot?.researchShares.find(
          (item) => item.resourceId === id && item.revokedAt === null && item.content.kind === "note",
        );
        if (share?.content.kind === "note") this.#showToast(excerptForToast(share.content.body));
      },
      section: (id) => {
        this.#activateContext(RESEARCH_PREVIEW_KEY);
        this.#elements.workspacePreview.scrollToAnchor(id);
      },
      annotation: (id) => {
        const annotation = this.#snapshot?.annotations.find((item) => item.id === id);
        const pdf = annotation ? this.#snapshot?.pdfs.find((item) => item.id === annotation.pdfId) : undefined;
        if (annotation && pdf) void this.#showPaper(pdf, annotation.page, annotation.id);
      },
      claim: (id) => this.#elements.claimListPanel.revealClaim(id),
      pdf: (id) => {
        const pdf = this.#snapshot?.pdfs.find((item) => item.id === id);
        if (pdf) void this.#showPaper(pdf);
      },
      publication: (id) => {
        const publication = this.#snapshot?.publications.find((item) => item.id === id);
        if (publication) this.#openPublicationContext(publication);
      },
    };
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
    const key = this.#contextState.activeKey;
    const fixedScrollTop = this.#elements.contextTabStrip.fixedScrollTop(key);
    if (fixedScrollTop !== null) {
      this.#contextState = setResearchTabScroll(this.#contextState, key, fixedScrollTop);
      return;
    }
    const tab = this.#contextState.tabs.find((item) => item.key === key);
    if (!tab) return;
    this.#contextState = setResearchTabScroll(this.#contextState, key, this.#elements.contextResourcePresenter.resourceScrollTop(tab));
    if ((tab.kind === "pdf" || tab.kind === "library-pdf") && tab.key === this.#renderedPdfContextKey) {
      this.#contextState = setPdfResearchLocation(this.#contextState, key, {
        page: this.#pdfViewer.currentPage,
        ...(tab.kind === "pdf" ? { focusedAnnotationId: this.#pdfViewer.focusedAnnotationId } : {}),
      });
    }
  }

  #activateContext(key: ResearchContextKey): void {
    this.#captureActiveContextState();
    this.#contextState = activateResearchTab(this.#contextState, key);
    this.#renderResearchContext();
    this.#showWorkspaceSurface("context", false);
    this.#focusContextTab(key);
    this.#syncWorkspaceRoute("push");
  }

  #openPublicationContext(publication: PublicationResource): void {
    this.#captureActiveContextState();
    this.#contextState = openResearchResource(this.#contextState, { kind: "publication", id: publication.id });
    this.#renderResearchContext();
    this.#showWorkspaceSurface("context", false);
    this.#focusContextTab(researchResourceKey({ kind: "publication", id: publication.id }));
    this.#syncWorkspaceRoute("push");
  }

  #openCandidateContext(candidate: ModelCandidate): void {
    this.#captureActiveContextState();
    this.#contextState = openResearchResource(this.#contextState, { kind: "candidate", id: candidate.id });
    this.#renderResearchContext();
    this.#showWorkspaceSurface("context", false);
    this.#focusContextTab(researchResourceKey({ kind: "candidate", id: candidate.id }));
    this.#syncWorkspaceRoute("push");
  }

  #renderResearchContext(loadPdf = true): void {
    this.#elements.contextTabStrip.setTabs({
      activeKey: this.#contextState.activeKey,
      candidates: this.#snapshot?.candidates ?? [],
      libraryArtifacts: this.#librarySnapshot?.artifacts ?? [],
      pdfs: this.#snapshot?.pdfs ?? [],
      publications: this.#snapshot?.publications ?? [],
      referencePdfs: this.#projectReferencePdfs,
      standaloneLibrary: appMode === "library",
      tabs: this.#contextState.tabs,
    });
    const activeTab = this.#activeResourceTab();
    this.#layout.restorePaneWidth();
    this.#presentResearchResource(activeTab, loadPdf);
  }

  #presentResearchResource(activeTab: ResearchResourceTab | undefined, loadPdf: boolean): void {
    const presentation = this.#elements.contextResourcePresenter.present({
      activeTab,
      candidateDecision: this.#elements.assistantGenerationPresenter.candidateDecision(),
      library: this.#librarySnapshot,
      projectApiBase: appMode === "workspace" ? apiBase : null,
      referencePdfs: this.#projectReferencePdfs,
      snapshot: this.#snapshot,
      sourceRevision: this.#revision,
      stableDocument: this.#hasStableDocumentBase(),
    });
    if (presentation.privateHighlights) {
      this.#pdfViewer.updatePrivateHighlights(presentation.privateHighlights);
      this.#renderPdfMarkups();
    }
    if (presentation.publicationPresented) this.#updateCitationInsertionAvailability();
    if (loadPdf && (activeTab?.kind === "pdf" || activeTab?.kind === "library-pdf")) void this.#loadActivePdf(false);
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
    this.#focusContextTab(this.#contextState.activeKey);
    this.#syncWorkspaceRoute("replace");
  }

  #focusContextTab(key: ResearchContextKey): void {
    this.#elements.contextTabStrip.focusTab(key);
  }

  #activeResourceTab(): ResearchResourceTab | undefined {
    return this.#contextState.tabs.find(
      (tab): tab is ResearchResourceTab =>
        tab.kind !== "preview" && tab.kind !== "library" && tab.kind !== "assistant" && tab.key === this.#contextState.activeKey,
    );
  }

  #projectReferencePdf(resourceId: string): ProjectReferencePdf | undefined {
    return this.#projectReferencePdfs.find((pdf) => pdf.id === resourceId);
  }

  async #openPublicationPaper(paper: PublicationPaperOption): Promise<void> {
    if (paper.kind === "project") {
      await this.#showPaper(paper.pdf);
      return;
    }
    if (paper.kind === "library") {
      await this.#openLibraryPdf(paper.artifact);
      return;
    }
    await this.#openProjectReferencePdf(paper.pdf);
  }

  #openCitation(citation: CitationContext): void {
    if (citation.keys.length > 1) {
      this.#showToast("Open this grouped citation from Preview to choose a reference.");
      return;
    }
    const publication = this.#publicationByCitationKey(citation.keys[0] ?? "");
    if (publication) this.#navigateToCitation(publication, citation.locator);
    else this.#showToast(`No publication resource is available for ${citation.keys[0] ?? "this citation"}.`);
  }

  #navigateToCitation(publication: PublicationResource, locator: string | undefined): void {
    const page = citationPageFromLocator(locator);
    const links = this.#snapshot?.publicationPdfLinks.filter((link) => link.publicationId === publication.id) ?? [];
    const pdf = links.length === 1 ? this.#snapshot?.pdfs.find((item) => item.id === links[0]?.pdfId) : undefined;
    if (page && pdf) void this.#showPaper(pdf, page);
    else this.#openPublicationContext(publication);
  }

  #publicationByCitationKey(citationKey: string): PublicationResource | undefined {
    const normalized = citationKey.toLocaleLowerCase();
    return this.#snapshot?.publications.find((publication) => publication.citationKey.toLocaleLowerCase() === normalized);
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

  #acceptIncludeCompletion({ candidate, context }: Extract<SourceCompletionIntent, { kind: "include" }>): void {
    this.#applySourceCompletion(context.start, context.end, candidate.reference);
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
    this.#updateCitationInsertionAvailability();
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

  #updateCitationInsertionAvailability(): void {
    const available = this.#activeResourceTab()?.kind === "publication" && this.#resolvedAuthoringCaret() !== null;
    this.#elements.publicationContextPanel.setCitationAvailable(available);
  }

  #insertActivePublicationCitation(): void {
    const tab = this.#activeResourceTab();
    const publication = tab?.kind === "publication" ? this.#snapshot?.publications.find((item) => item.id === tab.id) : undefined;
    if (!publication) return;

    this.#insertPublicationCitation(publication);
  }

  #citeActivePdf(): void {
    const tab = this.#activeResourceTab();
    if (tab?.kind !== "pdf" || !this.#snapshot) return;
    const links = this.#snapshot.publicationPdfLinks.filter((link) => link.pdfId === tab.id);
    const publication = links.length === 1 ? this.#snapshot.publications.find((item) => item.id === links[0]?.publicationId) : undefined;
    if (publication) this.#insertPublicationCitation(publication, `p. ${tab.page}`);
  }

  #insertPublicationCitation(publication: PublicationResource, locator?: string): void {
    this.#insertCitation(publication.citationKey, locator);
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

  async #citeLibraryHighlight(highlight: LibraryHighlight): Promise<void> {
    if (this.#resolvedAuthoringCaret() === null) {
      this.#showToast("Place the manuscript caret before citing a highlight.");
      return;
    }
    const reference = this.#librarySnapshot?.references.find((item) => item.id === highlight.referenceId);
    if (!reference) {
      this.#showToast("The highlighted source is no longer available in the library.");
      return;
    }
    let projectReference = this.#snapshot?.projectReferences.find((item) => item.referenceId === reference.id);
    if (!projectReference) {
      const reservedAliases = this.#snapshot?.projectReferences.map((item) => item.citationAlias) ?? [];
      const preferredAlias = reservedAliases.some((alias) => alias.toLocaleLowerCase() === reference.referenceKey.toLocaleLowerCase())
        ? suggestCitationKey({ authors: [...reference.authors], year: reference.year }, reservedAliases)
        : reference.referenceKey;
      const response = await jsonFetch(`${apiBase}/references`, {
        referenceId: reference.id,
        citationAlias: preferredAlias,
      });
      await this.#acceptWorkspaceMutation(response);
      projectReference = this.#snapshot?.projectReferences.find((item) => item.referenceId === reference.id);
      this.#renderReferenceLibrary();
    }
    if (!projectReference) throw new Error("Project reference was not created");
    this.#insertCitation(projectReference.citationAlias, `p. ${highlight.page}`);
  }

  async #loadActivePdf(force: boolean): Promise<void> {
    const context = activePdfLoadContext({
      activeTab: this.#activeResourceTab(),
      annotations: this.#snapshot?.annotations ?? [],
      apiBase,
      libraryArtifacts: this.#librarySnapshot?.artifacts ?? [],
      libraryHighlights: this.#librarySnapshot?.highlights ?? [],
      projectReferencePdfs: this.#projectReferencePdfs,
      workspacePdfs: this.#snapshot?.pdfs ?? [],
    });
    if (!context) return;
    if (context.workspacePdf) this.#elements.projectAnnotationForm.selectPdf(context.workspacePdf.id);
    this.#pdfViewer.updateAnnotations(context.annotations);
    this.#pdfViewer.updatePrivateHighlights(context.privateHighlights);
    if (!force && this.#renderedPdfContextKey === context.tab.key) {
      this.#elements.paperReader.scrollTop = context.tab.scrollTop;
      return;
    }
    await this.#openActivePdf(context);
  }

  async #openActivePdf(context: ActivePdfLoadContext): Promise<void> {
    try {
      const opened = await this.#pdfViewer.open({
        url: context.url,
        annotations: context.annotations,
        page: context.tab.page,
        ...(context.tab.focusedAnnotationId ? { focusAnnotationId: context.tab.focusedAnnotationId } : {}),
        mode: context.workspacePdf ? "evidence" : context.libraryPdf ? "private-highlight" : "read-only",
        privateHighlights: context.privateHighlights,
      });
      const active = this.#activeResourceTab();
      if (!opened || active?.key !== context.tab.key) return;
      this.#renderedPdfContextKey = context.tab.key;
      this.#renderedPdfId = context.workspacePdf?.id;
      this.#elements.paperReader.scrollTop = context.tab.scrollTop;
    } catch (error) {
      if (this.#activeResourceTab()?.key === context.tab.key) this.#pdfViewer.showError(error);
    }
  }

  async #completeAnnotationSave(detail: ProjectAnnotationSaved): Promise<void> {
    await this.#resourceRefresh.request();
    if (detail.link) await this.#linkAnnotation(detail.annotationId);
    else this.#showToast(detail.message);
  }

  async #linkAnnotation(annotationId: string): Promise<void> {
    if (!this.#hasStableDocumentBase()) {
      this.#showToast("Wait for the manuscript to finish synchronizing before linking an annotation.");
      return;
    }
    const passage = this.#selectedAuthoringPassage();
    if (!passage) {
      this.#showToast("Select manuscript text before linking an annotation.");
      return;
    }
    await this.#elements.projectEvidencePanel.linkPassage({
      annotationId,
      fileId: passage.fileId,
      start: passage.start,
      end: passage.end,
      excerpt: passage.excerpt,
      sourceRevision: this.#revision,
    });
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

  #assistantAuthoringPassage(): AuthoringPassage | null {
    if (!this.#activeFileId) return null;
    const target = this.#resolvedAuthoringTarget();
    if (!target) return null;
    const source = this.#activeFileText.toString();
    const resolved = resolveAssistantTarget(source, target.start, target.end, this.#elements.assistantGenerationPresenter.targetScope());
    return resolved.text.trim() ? { fileId: this.#activeFileId, start: resolved.start, end: resolved.end, excerpt: resolved.text } : null;
  }

  #assistantInsertionTarget(): AuthoringPassage | null {
    if (!this.#activeFileId) return null;
    const target = this.#resolvedAuthoringTarget();
    if (!target) return null;
    return {
      fileId: this.#activeFileId,
      start: target.start,
      end: target.end,
      excerpt: this.#activeFileText.toString().slice(target.start, target.end),
    };
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
      insertionTarget: this.#assistantInsertionTarget(),
      passage: this.#assistantAuthoringPassage(),
      snapshotAvailable: this.#snapshot !== null,
      sourceRevision: this.#revision,
      stableDocument: this.#hasStableDocumentBase(),
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
    await this.#loadActivePdf(page !== undefined || focusAnnotationId !== undefined);
  }

  async #openLibraryPdf(artifact: LibraryPdfArtifact, page?: number, updateHistory = true): Promise<void> {
    const key = this.#preparePdfContext({ kind: "library-pdf", id: artifact.id }, page === undefined ? {} : { page });
    if (appMode === "library" && updateHistory) {
      const active = this.#contextState.tabs.find((tab) => tab.key === key);
      const route = libraryPdfRoute(artifact.id, page ?? (active?.kind === "library-pdf" ? active.page : 1));
      history.pushState({ view: "library-pdf", artifactId: artifact.id }, "", route);
    }
    if (appMode === "workspace") this.#syncWorkspaceRoute("push");
    await this.#loadActivePdf(page !== undefined);
  }

  async #openProjectReferencePdf(pdf: ProjectReferencePdf, page?: number, updateHistory = true): Promise<void> {
    this.#preparePdfContext({ kind: "library-pdf", id: pdf.id }, page === undefined ? {} : { page });
    if (appMode === "workspace" && updateHistory) this.#syncWorkspaceRoute("push");
    await this.#loadActivePdf(page !== undefined);
  }

  #preparePdfContext(
    target: { readonly kind: "pdf" | "library-pdf"; readonly id: string },
    location: PdfResearchLocation,
  ): ResearchResourceKey {
    this.#captureActiveContextState();
    const key = researchResourceKey(target);
    this.#contextState = setPdfResearchLocation(openResearchResource(this.#contextState, target), key, location);
    this.#renderResearchContext(false);
    this.#showWorkspaceSurface("context", false);
    this.#focusContextTab(key);
    return key;
  }

  async #restoreLibraryRoute(): Promise<void> {
    const route = readLibraryUiRoute(new URL(location.href));
    if (route.kind === "library") {
      if (this.#contextState.activeKey !== RESEARCH_LIBRARY_KEY) this.#activateContext(RESEARCH_LIBRARY_KEY);
      if (!route.referenceId) return;
      if (!(await this.#focusReferenceLibraryEntry(route.referenceId))) {
        history.replaceState({ view: "library" }, "", "/library");
      }
      return;
    }
    const artifact = this.#librarySnapshot?.artifacts.find((item) => item.id === route.artifactId);
    if (!artifact) {
      history.replaceState({ view: "library" }, "", "/library");
      this.#showToast("That PDF is no longer in the library.");
      return;
    }
    await this.#openLibraryPdf(artifact, route.page, false);
  }

  #handlePdfPageChange(page: number): void {
    this.#renderPdfMarkups();
    const active = this.#activeResourceTab();
    if (active?.kind === "pdf" || active?.kind === "library-pdf") {
      this.#contextState = setPdfResearchLocation(this.#contextState, active.key, { page });
      this.#syncWorkspaceRoute("replace");
    }
    const artifact = this.#activeLibraryPdf();
    if (appMode === "library" && artifact && location.pathname.startsWith("/library/pdfs/")) {
      history.replaceState(history.state, "", libraryPdfRoute(artifact.id, page));
    }
  }

  #capturePdfSelection(capture: PdfSelectionCapture): void {
    const activeTab = this.#activeResourceTab();
    if (activeTab?.kind === "library-pdf") {
      const artifact = this.#librarySnapshot?.artifacts.find((item) => item.id === activeTab.id);
      if (!artifact) return;
      this.#elements.contextResourcePresenter.beginLibraryHighlight(artifact.id, capture);
      return;
    }
    if (activeTab?.kind !== "pdf") return;
    if (this.#renderedPdfId) this.#elements.projectAnnotationForm.selectPdf(this.#renderedPdfId);
    this.#elements.projectAnnotationForm.showCapture(capture);
    void this.#persistPdfSelection(capture);
  }

  #applyLibraryPdfViewerPresentation(presentation: LibraryPdfSelectionPresentation | LibraryPdfToolPresentation): void {
    if ("clearDraftSelection" in presentation && presentation.clearDraftSelection) this.#pdfViewer.clearDraftSelection();
    if (presentation.textSelectionEnabled !== undefined) this.#pdfViewer.setTextSelectionEnabled(presentation.textSelectionEnabled);
    if (presentation.privateHighlightSelection !== undefined)
      this.#pdfViewer.setPrivateHighlightSelection(presentation.privateHighlightSelection, presentation.privateHighlightId);
  }

  #activeLibraryPdf(): LibraryPdfArtifact | undefined {
    const tab = this.#activeResourceTab();
    return tab?.kind === "library-pdf" ? this.#librarySnapshot?.artifacts.find((item) => item.id === tab.id) : undefined;
  }

  #renderPdfMarkups(): void {
    this.#elements.contextResourcePresenter.presentLibraryPdfPage(
      this.#activeLibraryPdf(),
      this.#librarySnapshot,
      this.#pdfViewer.currentPage,
    );
  }

  #completeLibraryPdfMarkup(message: string): void {
    void this.#completeLibraryRefresh(message, "The annotation changed, but the refreshed Library could not be loaded.");
  }

  async #openLibraryHighlight(highlight: LibraryHighlight): Promise<void> {
    const artifact = this.#librarySnapshot?.artifacts.find((item) => item.id === highlight.artifactId);
    if (!artifact) return;
    await this.#openLibraryPdf(artifact, highlight.page);
    this.#elements.libraryPdfInspector.setStatus(`Showing saved private highlight on page ${highlight.page}.`);
  }

  async #persistPdfSelection(capture: PdfSelectionCapture): Promise<void> {
    const pdfId = this.#renderedPdfId;
    if (!pdfId || !this.#snapshot) return;
    const overlaps = this.#overlappingPdfFragments(pdfId, capture);
    if (this.#elements.projectAnnotationForm.selectedTool === "erase") {
      await this.#erasePdfSelection(overlaps);
      return;
    }
    await this.#savePdfSelection(pdfId, capture, overlaps[0]?.annotation);
  }

  #overlappingPdfFragments(pdfId: string, capture: PdfSelectionCapture): OverlappingPdfFragment[] {
    return (
      this.#snapshot?.annotations
        .filter((annotation) => annotation.pdfId === pdfId && annotation.page === capture.page)
        .flatMap((annotation) =>
          annotation.fragments
            .filter((fragment) => fragment.rects.some((rect) => capture.rects.some((candidate) => selectionRectsOverlap(rect, candidate))))
            .map((fragment) => ({ annotation, fragment })),
        ) ?? []
    );
  }

  async #erasePdfSelection(overlaps: readonly OverlappingPdfFragment[]): Promise<void> {
    if (overlaps.length === 0) {
      this.#pdfViewer.clearDraftSelection();
      this.#elements.projectAnnotationForm.setStatus("The eraser did not cross a saved highlight stroke.");
      return;
    }
    for (const overlap of overlaps) {
      if (!(await this.#removeHighlightFragment(overlap.annotation.id, overlap.fragment.id, false))) return;
    }
    this.#pdfViewer.clearDraftSelection();
    const noun = overlaps.length === 1 ? "stroke" : "strokes";
    this.#elements.projectAnnotationForm.setStatus(`Removed ${overlaps.length} overlapping highlight ${noun}.`);
    this.#showToast("Highlight content erased.");
  }

  async #savePdfSelection(pdfId: string, capture: PdfSelectionCapture, target: AnnotationResource | undefined): Promise<void> {
    if (!(await this.#elements.projectAnnotationForm.saveCapture(pdfId, capture, target?.id))) return;
    this.#pdfViewer.clearDraftSelection();
    await this.#resourceRefresh.request();
  }

  #setHighlightTool(tool: ProjectHighlightTool): void {
    this.#elements.projectAnnotationForm.setTool(tool);
    this.#pdfViewer.setTool(tool);
  }

  async #activateHighlightFragment(annotationId: string, fragmentId: string): Promise<void> {
    if (this.#elements.projectAnnotationForm.selectedTool === "erase") {
      await this.#removeHighlightFragment(annotationId, fragmentId, true);
      return;
    }
    const annotation = this.#snapshot?.annotations.find((item) => item.id === annotationId);
    if (!annotation) return;
    this.#elements.projectAnnotationForm.showAnnotation(annotation);
    this.#elements.projectEvidencePanel.revealAnnotation(annotationId);
  }

  async #removeHighlightFragment(annotationId: string, fragmentId: string, announce: boolean): Promise<boolean> {
    const result = await this.#elements.projectEvidencePanel.removeFragment(annotationId, fragmentId);
    if (!result) return false;
    if (result.annotationDeleted) this.#elements.projectAnnotationForm.clearAnnotation(annotationId);
    await this.#resourceRefresh.request();
    if (announce) this.#showToast("Highlight stroke erased.");
    return true;
  }

  async #undoLastHighlightStroke(annotationId: string, fragmentId: string): Promise<void> {
    if (!(await this.#removeHighlightFragment(annotationId, fragmentId, false))) return;
    this.#elements.projectAnnotationForm.setUndoStroke(null);
    this.#showToast("Last highlight stroke undone.");
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
    let record;
    try {
      record = await this.#offlineStore.load();
    } catch {
      return false;
    }
    if (!record) return false;
    if (!isWorkspaceSnapshot(record.snapshot) || record.snapshot.id !== workspaceId) {
      await this.#offlineStore.clear();
      return false;
    }
    try {
      Y.applyUpdate(this.#document, new Uint8Array(record.documentUpdate), offlineOrigin);
    } catch {
      await this.#offlineStore.clear();
      return false;
    }
    const pending = this.#collaboration.restoreOffline(new Uint8Array(record.serverStateVector));
    this.#snapshot = resolveWorkspaceSnapshotAnchors(this.#document, record.snapshot);
    this.#hasBootstrapSnapshot = true;
    this.#collaboration.setOfflineAvailable(true);
    this.#revision = record.snapshot.revision;
    this.#renderWorkspaceCatalog([
      {
        id: record.snapshot.id,
        title: record.snapshot.title,
        href: `/editor/${encodeURIComponent(record.snapshot.id)}`,
        createdAt: record.savedAt,
        updatedAt: record.savedAt,
        archivedAt: null,
      },
    ]);
    this.#renderProjectFiles();
    this.#renderResources();
    this.#updateRevision();
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

  #setConnection(label: string, connected: boolean): void {
    this.#elements.connectionStatus.setConnection(label, connected);
  }

  #setEditorsEnabled(enabled: boolean): void {
    this.#elements.source.disabled = !enabled;
    this.#elements.bibliography.disabled = !enabled;
  }

  #updateRevision(): void {
    this.#elements.projectHistoryTrigger.setRevision(this.#revision);
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

function selectionRectsOverlap(left: PdfSelectionRect, right: PdfSelectionRect): boolean {
  return (
    left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y
  );
}

function excerptForToast(value: string): string {
  const compact = value.replaceAll(/\s+/gu, " ").trim();
  return compact.length <= 240 ? compact : `${compact.slice(0, 239).trimEnd()}…`;
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

class WorkspaceAccessError extends Error {}

if (typeof document !== "undefined") {
  const app = new WorkspaceApp();
  void app.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Kirjolab failed to start";
    document.body.textContent = message;
  });
}
