import * as Y from "yjs";
import "./action-menu-controller";
import { collectAppElements } from "./app-elements";
import { bibTeXDisplayText } from "../domain/bibliography";
import { buildWorkspaceKnowledgeGraph } from "../domain/knowledge";
import type { ReferenceDiscoveryResult } from "../domain/reference-discovery";
import { reviewerResponsePath, reviewerResponseTemplate } from "../domain/reviewer-response";
import {
  collaborationProtocolVersion,
  encodeClientSelectionMessage,
  parseServerCollaborationMessage,
  type ServerCollaborationMessage,
} from "../domain/collaboration";
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
import type { Diagnostic, RenderedDocument } from "../domain/markdown";
import { publicationWordStatistics } from "../domain/publication-statistics";
import { suggestCitationKey } from "../domain/publication-intake";
import { researchQuestionsPath, researchQuestionsTemplate } from "../domain/research-questions";
import { researchDiaryPath, researchDiaryTemplate } from "../domain/writing-workflows";
import type { ProjectTemplateSummary } from "../domain/project-templates";
import {
  isProjectReferencePdfs,
  isReferenceLibrarySnapshot,
  type LibraryHighlight,
  type LibraryPdfDrawing,
  type LibraryPdfMarkup,
  type LibraryPdfNote,
  type LibraryPdfArtifact,
  type ProjectReferencePdf,
  type ReferenceLibrarySnapshot,
} from "../domain/reference-library";
import { applicationVersionNoticeEvent } from "./application-version-control";
import { previewSyncActionEvent, type PreviewSyncAction } from "./preview-sync-controls";
import { PreviewDocument } from "./preview-document";
import { sourceCitationOpenEvent } from "./source-citation-control";
import { workspaceSurfaceChangeEvent } from "./workspace-surface-switcher";
import { projectHistoryOpenEvent } from "./project-history-trigger";
import { editorInsertActionEvent, type EditorInsertAction, type EditorSyntaxKind } from "./editor-insert-menu";
import { sourceSpanAt } from "./composition-source-map";
import type { AppToastOptions } from "./app-toast";
import { expectOk, jsonFetch } from "./http";
import { sourceCompletionActionEvent, type SourceCompletionIntent } from "./source-completion";
import {
  gitHubSyncCheckEvent,
  gitHubSyncPullEvent,
  gitHubSyncPushEvent,
  gitHubSyncSettingsEvent,
  gitHubSyncStateEvent,
  type GitHubSyncStateDetail,
} from "./github-sync-menu";
import { gitHubSyncMutationEvent, type GitHubSyncMutation } from "./github-sync-review";
import { libraryPdfAnnotationActionEvent, type LibraryPdfAnnotationAction } from "./library-pdf-annotation-forms";
import { libraryPdfAnnotationListActionEvent, type LibraryPdfAnnotationListAction } from "./library-pdf-annotation-list";
import {
  libraryPdfMarkupActionEvent,
  libraryPdfShapeRecognizedEvent,
  type LibraryPdfMarkupAction,
  type LibraryPdfShapeRecognition,
} from "./library-pdf-markup-layer";
import { libraryPdfToolbarActionEvent, type LibraryPdfToolbarAction } from "./library-pdf-annotation-toolbar";
import { libraryPdfInspectorCloseEvent } from "./library-pdf-inspector";
import { startingPointActionEvent, startingPointTemplateDeleteEvent, type StartingPointAction } from "./project-starting-point-browser";
import { workspaceSharingNoticeEvent } from "./workspace-sharing-panel";
import { WorkspaceLayoutManager } from "./workspace-layout-manager";
import { workspaceLayoutChangeEvent } from "./workspace-layout-control";
import { unidentifiedPdfRefreshEvent, type UnidentifiedPdfRefresh } from "./unidentified-pdf-list";
import { libraryReferenceSummaryActionEvent, type LibraryReferenceSummaryAction } from "./library-reference-summary";
import { projectReferenceChangedEvent, type ProjectReferenceChanged } from "./project-reference-mutation";
import { projectResearchChangedEvent, type ProjectResearchChanged } from "./project-research-mutation";
import { libraryReferenceImportRefreshEvent, type LibraryReferenceImportRefresh } from "./library-reference-import-control";
import { libraryReferencePersonalRefreshEvent } from "./library-reference-personal-fields";
import {
  LibraryReferenceMetadataEditor,
  libraryReferenceMetadataNoticeEvent,
  libraryReferenceMetadataRefreshEvent,
} from "./library-reference-metadata-editor";
import {
  libraryReferencePdfActionEvent,
  libraryReferencePdfRefreshEvent,
  type LibraryReferencePdfAction,
} from "./library-reference-pdf-rows";
import { libraryReferenceResearchActionEvent, type LibraryReferenceResearchAction } from "./library-reference-research-rows";
import { workspaceSettingsActionEvent, type WorkspaceSettingsAction } from "./workspace-settings-panel";
import {
  researchQuestionWorkflowData,
  reviewerResponseWorkflowData,
  writingWorkflowActionEvent,
  type WritingWorkflowActionDetail,
} from "./writing-workflow-panel";
import { researchDiaryOpenEvent } from "./research-diary-summary";
import {
  assistantResultActionEvent,
  assistantReferenceRefreshEvent,
  type AssistantReferenceRefresh,
  type AssistantAuthoringPassage as AuthoringPassage,
  type AssistantClarityContext as ClarityDrillContext,
  type AssistantResultActionDetail,
  type AssistantRevisionContext as AssistantDraftContext,
} from "./assistant-result-panel";
import {
  candidateDecisionEvent,
  candidateDecisionOutcomeEvent,
  candidateEvidenceEvent,
  type CandidateDecisionOutcome,
  type CandidateDecisionRequest,
} from "./candidate-review-panel";
import { publicationContextActionEvent, type PublicationContextAction, type PublicationPaperOption } from "./publication-context-panel";
import {
  defaultProjectPublicationProfile,
  isWorkspaceSnapshot,
  isWorkspaceSummaries,
  type AnnotationResource,
  type ClaimResource,
  type ManuscriptComment,
  type ModelCandidate,
  type ModelEvidence,
  type ModelEvidenceReference,
  type PassageLink,
  type PdfResource,
  type PdfSelectionRect,
  type PublicationResource,
  type WorkspaceSnapshot,
  type WorkspaceSummary,
} from "../domain/workspace";
import { CoalescedRefresh, DebouncedAsyncQueue, PendingUpdateQueue } from "./collaboration";
import {
  collaborationCanEdit,
  collaborationStable,
  collaborationStatus,
  collaborationSynced,
  createCollaborationWorkflowActor,
} from "./collaboration-workflow-machine";
import { assistantOperationDefinition, resolveAssistantTarget, type AssistantTargetScope } from "./assistant-operations";
import { assistantTaskChangeEvent, assistantTaskGenerateEvent, type AssistantTaskChange } from "./assistant-task-panel";
import { assistantWorkflowActionEvent, type AssistantWorkflowAction, type SelectedModelEvidence } from "./assistant-workflow-status";
import { assistantWorkflowBusy, createAssistantWorkflowActor } from "./assistant-workflow-machine";
import { citationPageFromLocator, createCitationInsertion, parseCitationKeys, type CitationContext } from "./citations";
import { loadMarkdownRuntime, type MarkdownRuntime } from "./markdown-runtime";
import { projectMapResourceSelectEvent } from "./project-map-workspace";
import { claimListActionEvent, type ClaimListAction } from "./claim-list-panel";
import { claimDialogSavedEvent } from "./claim-dialog";
import { manuscriptCommentActionEvent, manuscriptCommentCreateEvent, type ManuscriptCommentAction } from "./manuscript-comment-list";
import { publicationListActionEvent, type PublicationListAction } from "./publication-list-panel";
import { candidateListOpenEvent } from "./candidate-list-panel";
import { contextTabOverviewActionEvent, type ContextTabOverviewAction } from "./context-tab-overview";
import { contextResourceTabActionEvent, type ContextResourceTabAction } from "./context-resource-tabs";
import { contextPrimaryTabActionEvent, type ContextPrimaryTabAction } from "./context-tab-strip";
import { projectEvidenceActionEvent, type ProjectEvidenceAction } from "./project-evidence-panel";
import {
  projectAnnotationActionEvent,
  projectAnnotationSavedEvent,
  type ProjectAnnotationAction,
  type ProjectAnnotationSaved,
  type ProjectHighlightTool,
} from "./project-annotation-form";
import {
  projectFileDialogIsCreating,
  projectFileSavedEvent,
  type ProjectFileDialogMode,
  type ProjectFileSaved,
} from "./project-file-dialog";
import { projectFileActionEvent, type ProjectFileAction } from "./project-file-actions";
import { projectImagesUploadedEvent, type ProjectImagesUploaded } from "./project-image-upload-control";
import { projectTemplateSavedEvent, type ProjectTemplateSaved } from "./project-template-save-dialog";
import { projectTreeActionEvent, type ProjectTreeAction } from "./project-tree-panel";
import { manuscriptMapSelectEvent, type ManuscriptMapSelection } from "./manuscript-map-panel";
import { libraryDiscoveryRefreshEvent, type LibraryDiscoveryRefresh } from "./library-discovery-results";
import { libraryDiscoveryResultsEvent } from "./library-discovery-search";
import { referenceLibraryFilterChangeEvent } from "./reference-library-filters";
import { libraryPdfUploadRevealEvent } from "./library-pdf-upload-status";
import { libraryPdfUploadOutcomeEvent, type LibraryPdfUploadOutcome } from "./library-pdf-upload-control";
import {
  libraryToolsActionEvent,
  libraryToolsArchiveRefreshEvent,
  type LibraryToolsAction,
  type LibraryToolsArchiveRefresh,
} from "./library-tools-menu";
import { modelProviderChangeEvent } from "./model-provider-settings";
import { webSourceCapturedEvent } from "./web-source-panels";
import { citationNetworkOutcomeEvent, type CitationNetworkOutcome } from "./citation-network-workspace";
import { previewDiagnosticSelectEvent, type PreviewDiagnosticSelection } from "./preview-presentation";
import { publicationIntakeActionEvent, type PublicationIntakeAction } from "./publication-intake-panel";
import {
  applicationVersion,
  cacheOfflineNavigation,
  clearOfflineShellCaches,
  registerOfflineServiceWorker,
} from "./offline-service-worker";
import {
  clearAllOfflineWorkspaces,
  createOfflineWorkspaceStore,
  offlineDocumentDelta,
  type OfflineWorkspaceStore,
} from "./offline-workspace";
import { PdfEvidenceViewer, type PdfSelectionCapture } from "./pdf-viewer";
import { pdfHighlightImportOutcomeEvent, type PdfHighlightImportOutcome } from "./pdf-highlight-import-panel";
import type { ExistingPdfUpload } from "./pdf-upload-queue";
import { bindThemePreference } from "./theme";
import { OpenAICompatibleBrowserProvider } from "./model-provider";
import { projectHistoryOutcomeEvent, type ProjectHistoryOutcome } from "./project-history-dialog";
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
  type ResearchContextTab,
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
import { workspaceRailChangeEvent } from "./workspace-rail-tabs";
import { authoringModeChangeEvent } from "./authoring-mode-tabs";
import type { EditorPresenceRange } from "./editor-presence";
import { bindYText, captureRelativeSelection, type RelativeEditorSelection } from "./source-editor-adapter";

interface PreviewInputs {
  readonly files: readonly ProjectFile[];
  readonly publicationComposition: ProjectComposition | null;
  readonly filePreview: ProjectFilePreview | null;
  readonly renderedSource: string;
}

interface SourceSyntaxTemplate {
  readonly text: string;
  readonly select?: string;
}

const workspaceId = readWorkspaceId();
const identityEmail = readIdentityEmail();
const appMode = readAppMode();
const catalogBase = "/api/workspaces";
const apiBase = `${catalogBase}/${workspaceId}`;
const remoteOrigin = Symbol("remote");
const offlineOrigin = Symbol("offline");
const deferredDeleteGraceMs = 6_000;

interface DeferredDeletion {
  readonly key: string;
  readonly deletedMessage: string;
  readonly restoredMessage: string;
  readonly failedMessage: string;
  readonly hide: () => void;
  readonly restore: () => void;
  readonly commit: () => Promise<void>;
}

interface PendingDeletion {
  readonly deletion: DeferredDeletion;
  readonly timer: number;
}

type RemoteCollaboratorSelection = Extract<ServerCollaborationMessage, { type: "selection" }>;

interface ResolvedAuthoringTarget {
  readonly start: number;
  readonly end: number;
}

interface AssistantGenerationContext {
  readonly provider: OpenAICompatibleBrowserProvider;
  readonly operation: ReturnType<typeof assistantOperationDefinition>;
  readonly passage: AuthoringPassage | null;
  readonly evidence: SelectedModelEvidence;
  readonly insertionTarget: AuthoringPassage | null;
  readonly instruction: string;
  readonly sourceRevision: number;
}

interface ActivePdfLoadContext {
  readonly tab: Extract<ResearchResourceTab, { kind: "pdf" | "library-pdf" }>;
  readonly workspacePdf: PdfResource | undefined;
  readonly libraryPdf: LibraryPdfArtifact | undefined;
  readonly annotations: AnnotationResource[];
  readonly privateHighlights: LibraryHighlight[];
  readonly url: string;
}

interface ActivePdfResources {
  readonly workspacePdf: PdfResource | undefined;
  readonly libraryPdf: LibraryPdfArtifact | undefined;
  readonly projectReferencePdf: ProjectReferencePdf | undefined;
}

interface OverlappingPdfFragment {
  readonly annotation: AnnotationResource;
  readonly fragment: AnnotationResource["fragments"][number];
}

class WorkspaceApp {
  readonly #elements = collectAppElements();
  readonly #pdfViewer: PdfEvidenceViewer;
  readonly #previewDocument: PreviewDocument;
  readonly #document = new Y.Doc();
  readonly #source = this.#document.getText("source");
  readonly #bibliography = this.#document.getText("bibliography");
  readonly #pendingUpdates = new PendingUpdateQueue();
  readonly #offlineStore: OfflineWorkspaceStore | null = createOfflineWorkspaceStore(
    typeof indexedDB === "undefined" ? undefined : indexedDB,
    identityEmail,
    workspaceId,
  );
  readonly #resourceRefresh = new CoalescedRefresh(async () => this.#refreshSnapshot());
  readonly #assistantWorkflow = createAssistantWorkflowActor();
  readonly #collaborationWorkflow = createCollaborationWorkflowActor();
  readonly #offlineSaves = new DebouncedAsyncQueue(
    async () => await this.#persistOfflineWorkspace(),
    (version) => {
      document.body.dataset.offlineCached = "true";
      document.body.dataset.offlineSavedAt = String(version);
      if (!collaborationSynced(this.#collaborationWorkflow.getSnapshot())) this.#elements.editorStatus.setSave("Saved offline");
    },
    (error) => {
      if (!collaborationSynced(this.#collaborationWorkflow.getSnapshot())) this.#elements.editorStatus.setSave("Offline save failed");
      this.#showToast(error instanceof Error ? error.message : "Could not save the manuscript offline");
    },
  );
  #snapshot: WorkspaceSnapshot | null = null;
  #revision = 0;
  #socket: WebSocket | null = null;
  #serverDocument: Y.Doc | null = null;
  #serverStateVector = Y.encodeStateVector(this.#document);
  #reconnectTimer: number | undefined;
  #selectionBroadcastTimer: number | undefined;
  readonly #remoteSelections = new Map<string, RemoteCollaboratorSelection>();
  #renderSourceEditorHighlight: () => void = () => undefined;
  #hasBootstrapSnapshot = false;
  readonly #hiddenProjectFileIds = new Set<string>();
  readonly #hiddenProjectFolderIds = new Set<string>();
  readonly #hiddenProjectImageIds = new Set<string>();
  readonly #pendingDeletions = new Map<string, PendingDeletion>();
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
  #previewRenderVersion = 0;
  #workspaceRouteReady = false;
  readonly #layout: WorkspaceLayoutManager;

  constructor() {
    this.#pdfViewer = PdfEvidenceViewer.forDocument(document, {
      onSelection: (capture) => this.#capturePdfSelection(capture),
      onHighlight: (annotationId, fragmentId) => void this.#activateHighlightFragment(annotationId, fragmentId),
      onPageChange: (page) => this.#handlePdfPageChange(page),
      onPrivateHighlight: (highlightId) => this.#selectLibraryHighlight(highlightId),
    });
    this.#previewDocument = PreviewDocument.forDocument(document);
    this.#layout = WorkspaceLayoutManager.forWorkspace(this.#elements.workspaceSurfaces, {
      paneStorageKey: () => `kirjolab:authoring-pane:${workspaceId}:${this.#activeResourceTab()?.kind ?? "preview"}`,
      resizePdf: () => void this.#pdfViewer.resize(),
    });
    this.#elements.previewSyncControls.bindSource(this.#elements.source, this.#elements.sourceHighlight);
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
    void loadMarkdownRuntime().catch(() => undefined);
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
      this.#collaborationWorkflow.send({ type: "OFFLINE" });
      this.#renderCollaborationWorkflow();
    }
    await this.#restoreWorkspaceRoute();
    void this.#refreshGitHubSyncState(true);
    this.#connect();
    if (new URL(location.href).searchParams.get("create") === "1") {
      history.replaceState(history.state, "", location.pathname);
      await this.#openNewWorkspace();
    }
  }

  #bindUi(): void {
    this.#elements.applicationVersion.addEventListener(applicationVersionNoticeEvent, (event) => {
      this.#showToast((event as CustomEvent<string>).detail);
    });
    window.addEventListener("online", () => {
      this.#connect();
      if (appMode === "workspace") void this.#refreshGitHubSyncState(true);
    });
    window.addEventListener("focus", () => {
      if (appMode === "workspace") void this.#refreshGitHubSyncState();
    });
    document.addEventListener("visibilitychange", () => {
      if (appMode === "workspace" && document.visibilityState === "visible") void this.#refreshGitHubSyncState();
    });
    window.addEventListener("offline", () => {
      this.#collaborationWorkflow.send({ type: "OFFLINE" });
      this.#renderCollaborationWorkflow();
    });
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
    this.#elements.workspaceSettings.addEventListener("click", () => void this.#openWorkspaceSettings());
    this.#elements.workspaceSettingsPanel.addEventListener(
      workspaceSettingsActionEvent,
      (event) => void this.#handleWorkspaceSettingsResult((event as CustomEvent<WorkspaceSettingsAction>).detail),
    );
    this.#elements.newWorkspace.addEventListener("click", () => void this.#openNewWorkspace());
    this.#elements.newWorkspaceStartingPoints.addEventListener(startingPointActionEvent, (event) => {
      const action = (event as CustomEvent<StartingPointAction>).detail;
      if (action === "import-latex") this.#openLatexImportDialog();
      else this.#openGitHubImportDialog();
    });
    this.#elements.newWorkspaceStartingPoints.addEventListener(startingPointTemplateDeleteEvent, (event) => {
      this.#deleteProjectTemplate((event as CustomEvent<ProjectTemplateSummary>).detail);
    });
    this.#elements.workspaceSettingsPanel.configureGitHub(apiBase);
    this.#elements.workspaceSettingsPanel.addEventListener(gitHubSyncMutationEvent, (event) => {
      void this.#handleGitHubSyncMutation((event as CustomEvent<GitHubSyncMutation>).detail);
    });
    this.#elements.gitHubSyncMenu.addEventListener(gitHubSyncCheckEvent, () => void this.#refreshGitHubSyncState(true));
    this.#elements.gitHubSyncMenu.configure(apiBase);
    this.#elements.gitHubSyncMenu.addEventListener(gitHubSyncStateEvent, (event) => {
      const { connected, message } = (event as CustomEvent<GitHubSyncStateDetail>).detail;
      this.#elements.workspaceSettingsPanel.gitHubReview.setConnected(connected);
      this.#elements.workspaceSettingsPanel.setGitHubStatus(message);
    });
    this.#elements.gitHubSyncMenu.addEventListener(gitHubSyncPullEvent, () => {
      void this.#openWorkspaceSettings(false).then(() => this.#elements.workspaceSettingsPanel.gitHubReview.previewPull());
    });
    this.#elements.gitHubSyncMenu.addEventListener(gitHubSyncPushEvent, () => {
      void this.#openWorkspaceSettings(false).then(() => this.#elements.workspaceSettingsPanel.gitHubReview.previewPublish());
    });
    this.#elements.gitHubSyncMenu.addEventListener(gitHubSyncSettingsEvent, () => void this.#openWorkspaceSettings());
    const githubResult = new URL(location.href).searchParams.get("github");
    if (githubResult === "connected" || githubResult === "installed") {
      this.#openGitHubImportDialog();
      history.replaceState(history.state, "", location.pathname);
    }
    this.#elements.saveTemplateDialog.configure(apiBase);
    this.#elements.saveTemplateDialog.addEventListener(projectTemplateSavedEvent, (event) => {
      void this.#completeProjectTemplateSave((event as CustomEvent<ProjectTemplateSaved>).detail);
    });
    this.#elements.workspaceRailTabs.addEventListener(workspaceRailChangeEvent, (event) => {
      this.#showRail((event as CustomEvent<WorkspaceRail>).detail);
    });
    this.#elements.researchDiaryPanel.addEventListener(researchDiaryOpenEvent, () => void this.#openResearchDiary());
    this.#elements.manuscriptMapPanel.addEventListener(manuscriptMapSelectEvent, (event) => {
      const { from, to } = (event as CustomEvent<ManuscriptMapSelection>).detail;
      this.#focusComposedRange(from, to);
    });
    for (const panel of [this.#elements.researchQuestionPanel, this.#elements.reviewerResponsePanel]) {
      panel.addEventListener(writingWorkflowActionEvent, (event) => {
        void this.#handleWritingWorkflowAction((event as CustomEvent<WritingWorkflowActionDetail>).detail);
      });
    }
    this.#elements.workspaceSharingPanel.configure(apiBase);
    this.#elements.shareWorkspace.addEventListener("click", () => this.#elements.workspaceSharingPanel.open());
    this.#elements.workspaceSharingPanel.addEventListener(workspaceSharingNoticeEvent, (event) => {
      this.#showToast((event as CustomEvent<string>).detail);
    });
    this.#elements.libraryDiscoverySearch.addEventListener(libraryDiscoveryResultsEvent, (event) => {
      this.#elements.libraryDiscoveryResults.setResults((event as CustomEvent<readonly ReferenceDiscoveryResult[]>).detail);
    });
    this.#elements.libraryDiscoveryResults.addEventListener(libraryDiscoveryRefreshEvent, (event) => {
      const detail = (event as CustomEvent<LibraryDiscoveryRefresh>).detail;
      void this.#completeLibraryRefresh(detail.message, "The reference was saved, but the refreshed Library could not be loaded.", {
        complete: () => this.#elements.libraryDiscoveryResults.complete(detail.index, detail.requestId),
      });
    });
    this.#elements.libraryReferenceImport.addEventListener(libraryReferenceImportRefreshEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferenceImportRefresh>).detail;
      void this.#completeLibraryRefresh(detail.message, "References were imported, but the refreshed Library could not be loaded.", {
        complete: () => this.#elements.libraryReferenceImport.complete(detail.requestId),
      });
    });
    this.#elements.libraryPdfUploadControl.bindStatus(this.#elements.libraryPdfUploadStatus);
    this.#elements.libraryPdfUploadControl.addEventListener(libraryPdfUploadOutcomeEvent, (event) => {
      const outcome = (event as CustomEvent<LibraryPdfUploadOutcome>).detail;
      if (outcome.action === "notice") this.#showToast(outcome.message);
      else
        void this.#completeLibraryRefresh(outcome.message, "PDF intake completed, but the refreshed Library could not be loaded.", {
          complete: () => this.#elements.libraryPdfUploadControl.complete(outcome.requestId),
        });
    });
    this.#elements.libraryPdfUploadStatus.addEventListener(libraryPdfUploadRevealEvent, (event) => {
      void this.#revealExistingPdfReference((event as CustomEvent<ExistingPdfUpload>).detail);
    });
    this.#elements.webSourceCapture.addEventListener(webSourceCapturedEvent, (event) => {
      void this.#completeLibraryRefresh(
        (event as CustomEvent<string>).detail,
        "The web source was captured, but the refreshed Library could not be loaded.",
      );
    });
    this.#elements.libraryToolsMenu.addEventListener(libraryToolsActionEvent, (event) => {
      const action = (event as CustomEvent<LibraryToolsAction>).detail;
      if (action === "open-citation-network") void this.#elements.citationNetwork.open();
      else void this.#refreshReferenceLibrary();
    });
    this.#elements.libraryToolsMenu.addEventListener(libraryToolsArchiveRefreshEvent, (event) => {
      const detail = (event as CustomEvent<LibraryToolsArchiveRefresh>).detail;
      void this.#completeLibraryRefresh(detail.message, "The archive was restored, but the refreshed Library could not be loaded.", {
        complete: () => this.#elements.libraryToolsMenu.completeArchiveRestore(detail.requestId),
      });
    });
    this.#elements.citationNetwork.configure(workspaceId);
    this.#elements.citationNetwork.addEventListener(citationNetworkOutcomeEvent, (event) => {
      const outcome = (event as CustomEvent<CitationNetworkOutcome>).detail;
      if (outcome.action === "notice") this.#showToast(outcome.message);
      else
        void this.#completeLibraryRefresh(
          outcome.message,
          "The citation candidate was saved, but the refreshed Library could not be loaded.",
        );
    });
    this.#elements.referenceLibraryFilters.addEventListener(referenceLibraryFilterChangeEvent, () => this.#renderReferenceLibrary());
    this.#elements.referenceLibraryList.addEventListener(libraryReferenceSummaryActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferenceSummaryAction>).detail;
      void this.#openLibraryPdf(detail.artifact);
    });
    this.#elements.referenceLibraryList.addEventListener(libraryReferencePersonalRefreshEvent, (event) => {
      void this.#completeLibraryRefresh(
        (event as CustomEvent<string>).detail,
        "The private reference was updated, but the refreshed Library could not be loaded.",
      );
    });
    this.#elements.referenceLibraryList.addEventListener(libraryReferenceMetadataNoticeEvent, (event) => {
      this.#showToast((event as CustomEvent<string>).detail);
    });
    this.#elements.referenceLibraryList.addEventListener(libraryReferenceMetadataRefreshEvent, (event) => {
      void this.#completeLibraryRefresh(
        (event as CustomEvent<string>).detail,
        "Metadata was applied, but the refreshed Library could not be loaded.",
        {
          refresh: async () => {
            await this.#refreshReferenceLibrary();
            await this.#refreshSnapshot();
          },
        },
      );
    });
    this.#elements.referenceLibraryList.addEventListener(libraryReferencePdfActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferencePdfAction>).detail;
      if (detail.action === "open") void this.#openLibraryPdf(detail.artifact);
      else {
        const editor = (event.target as Element)
          .closest(".library-reference-row")
          ?.querySelector<LibraryReferenceMetadataEditor>("library-reference-metadata-editor");
        if (editor) void editor.refineMetadata(detail.reference, detail.artifact);
      }
    });
    this.#elements.referenceLibraryList.addEventListener(libraryReferencePdfRefreshEvent, () => {
      void this.#refreshReferenceLibrary();
    });
    this.#elements.referenceLibraryList.addEventListener(libraryReferenceResearchActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferenceResearchAction>).detail;
      if (detail.action === "capture") void this.#elements.webSourceCapture.captureUrl(detail.canonicalUrl);
      else if (detail.action === "compare") void this.#elements.webSnapshotComparison.compare(detail.priorId, detail.currentId);
    });
    this.#elements.unidentifiedPdfList.addEventListener(unidentifiedPdfRefreshEvent, (event) => {
      const detail = (event as CustomEvent<UnidentifiedPdfRefresh>).detail;
      void this.#completeLibraryRefresh(detail.message, "The PDF was identified, but the refreshed Library could not be loaded.", {
        complete: () => this.#elements.unidentifiedPdfList.complete(detail.requestId),
      });
    });
    this.#bindSourceEditor(this.#source);
    this.#rememberAuthoringSelection();
    this.#elements.vimModeControl.bindEditor(this.#elements.source, this.#elements.sourceEditorShell);
    this.#elements.sourceCompletion.bindEditor(this.#elements.source, this.#elements.citationCompletionScope);
    bindYText(this.#elements.bibliography, this.#bibliography, this.#document);
    for (const actions of [this.#elements.projectFileRailActions, this.#elements.projectFileMenuActions]) {
      actions.addEventListener(projectFileActionEvent, (event) => {
        const action = (event as CustomEvent<ProjectFileAction>).detail;
        if (action === "upload-images") this.#elements.projectImageUpload.choose();
        else if (action === "delete") this.#deleteProjectFile();
        else this.#openProjectFileDialog(action);
      });
    }
    this.#elements.projectTreePanel.addEventListener(projectTreeActionEvent, (event) => {
      const detail = (event as CustomEvent<ProjectTreeAction>).detail;
      if (detail.action === "select-file") {
        this.#selectProjectFile(detail.fileId);
        if (detail.focusEditor) this.#elements.source.focus();
      } else if (detail.action === "quick-open") {
        this.#layout.setRailCollapsed(false);
        this.#showRail("files");
        this.#elements.projectTreePanel.focusFilter();
      } else if (detail.action === "rename-folder") this.#openProjectFileDialog("rename-folder", detail.folderId);
      else if (detail.action === "delete-folder") this.#deleteProjectFolder(detail.folderId);
      else if (detail.action === "insert-asset") this.#insertProjectImage(detail.asset);
      else void this.#deleteProjectImage(detail.asset);
    });
    this.#elements.projectTreePanel.configure(apiBase);
    this.#elements.projectImageUpload.configure(apiBase);
    this.#elements.projectImageUpload.addEventListener(projectImagesUploadedEvent, (event) => {
      this.#completeProjectImageUpload((event as CustomEvent<ProjectImagesUploaded>).detail);
    });
    this.#elements.projectFileDialog.configureApi(apiBase);
    this.#elements.projectFileDialog.addEventListener(projectFileSavedEvent, (event) => {
      this.#completeProjectFileSave((event as CustomEvent<ProjectFileSaved>).detail);
    });
    this.#elements.editorInsertMenu.addEventListener(editorInsertActionEvent, (event) => {
      const detail = (event as CustomEvent<EditorInsertAction>).detail;
      if (detail.action === "syntax") this.#insertSourceSyntax(detail.kind);
      else this.#insertProjectIncludeFromMenu(detail.relativePath, detail.path);
    });
    this.#elements.sourceCompletion.addEventListener(sourceCompletionActionEvent, (event) => {
      const intent = (event as CustomEvent<SourceCompletionIntent>).detail;
      if (intent.kind === "citation") void this.#acceptCitationCompletion(intent);
      else this.#acceptIncludeCompletion(intent);
    });
    this.#elements.authoringModeTabs.addEventListener(authoringModeChangeEvent, (event) => {
      this.#setAuthoringMode((event as CustomEvent<AuthoringMode>).detail);
    });
    this.#elements.projectHistoryDialog.configure(apiBase);
    this.#elements.projectHistoryTrigger.addEventListener(projectHistoryOpenEvent, () => void this.#elements.projectHistoryDialog.open());
    this.#elements.projectHistoryDialog.addEventListener(projectHistoryOutcomeEvent, (event) => {
      const outcome = (event as CustomEvent<ProjectHistoryOutcome>).detail;
      if (outcome.action === "notice") this.#showToast(outcome.message);
      else if (outcome.action === "navigate") window.location.assign(outcome.href);
      else {
        this.#showToast(outcome.message);
        window.location.reload();
      }
    });
    this.#elements.manuscriptCommentListPanel.configure(apiBase);
    this.#elements.manuscriptCommentListPanel.addEventListener(manuscriptCommentCreateEvent, (event) => {
      void this.#createManuscriptComment((event as CustomEvent<string>).detail);
    });
    this.#elements.manuscriptCommentListPanel.addEventListener(manuscriptCommentActionEvent, (event) => {
      const detail = (event as CustomEvent<ManuscriptCommentAction>).detail;
      if (detail.action === "open") this.#showPassage(detail.anchor);
      else if (detail.action === "reanchor") void this.#reanchorManuscriptComment(detail.commentId);
      else this.#refreshResourcesWithNotice(detail.message, "The comment was resolved, but project resources could not be refreshed.");
    });
    for (const eventName of ["focus", "input", "keyup", "select", "click"] as const) {
      this.#elements.source.addEventListener(eventName, () => {
        if (document.activeElement === this.#elements.source) this.#rememberAuthoringSelection();
        this.#renderSourceCompletion();
        this.#scheduleSelectionBroadcast();
        this.#updateModelAvailability();
      });
    }
    this.#elements.source.addEventListener("click", () => this.#syncPreviewFromSource(false));
    this.#elements.source.addEventListener("select", () => this.#syncPreviewFromSource(false));
    this.#elements.source.addEventListener("keyup", (event) => {
      if (["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"].includes(event.key)) {
        this.#syncPreviewFromSource(false);
      }
    });
    this.#source.observe(() => void this.#renderPreview());
    this.#bibliography.observe(() => void this.#renderPreview());
    this.#document.on("update", (update: Uint8Array, origin: unknown) => {
      this.#scheduleOfflineSave();
      if (origin === remoteOrigin || origin === offlineOrigin) return;
      this.#pendingUpdates.enqueue(update);
      this.#syncCollaborationQueue();
      this.#elements.editorStatus.setSave(collaborationSynced(this.#collaborationWorkflow.getSnapshot()) ? "Saving…" : "Saving offline…");
      this.#updateModelAvailability();
      void this.#renderPreview();
      this.#flushPendingUpdates();
    });
    this.#elements.projectEvidencePanel.configure(apiBase);
    this.#elements.projectEvidencePanel.addEventListener(projectEvidenceActionEvent, (event) => {
      const detail = (event as CustomEvent<ProjectEvidenceAction>).detail;
      if (detail.action === "open-pdf") {
        this.#elements.projectAnnotationForm.selectPdf(detail.pdf.id);
        void this.#showPaper(detail.pdf, detail.page, detail.annotationId);
      } else if (detail.action === "notice") this.#showToast(detail.message);
      else if (
        detail.action === "annotation-linked" ||
        detail.action === "fragment-updated" ||
        detail.action === "pdf-imported" ||
        detail.action === "pdf-removed"
      )
        this.#refreshResourcesWithNotice(detail.message, "The project changed, but project resources could not be refreshed.");
      else if (detail.action === "evidence") this.#setModelEvidenceSelected(detail.key, detail.selected);
      else if (detail.action === "link-annotation") void this.#linkAnnotation(detail.annotationId);
      else if (detail.action === "edit-annotation") this.#editAnnotation(detail.annotation);
      else if (detail.action === "annotation-removed") {
        this.#elements.projectAnnotationForm.clearAnnotation(detail.annotationId);
        this.#refreshResourcesWithNotice(detail.message, "The highlight was deleted, but project resources could not be refreshed.");
      } else if (detail.action === "open-passage") this.#showPassage(detail.anchor);
      else void this.#removeHighlightFragment(detail.annotationId, detail.fragmentId, true);
    });
    this.#elements.projectMap.configure(apiBase);
    this.#elements.projectMap.addEventListener(projectMapResourceSelectEvent, (event) => {
      this.#focusKnowledgeResource((event as CustomEvent<string>).detail);
    });
    this.#elements.publicationListPanel.configure(apiBase);
    this.#elements.publicationListPanel.addEventListener(publicationListActionEvent, (event) => {
      const detail = (event as CustomEvent<PublicationListAction>).detail;
      if (detail.action === "open") this.#openPublicationContext(detail.publication);
      else if (detail.action === "manage") void this.#openReferenceLibraryEntry(detail.publicationId);
      else this.#refreshResourcesWithNotice(detail.message, "The reference was enriched, but project resources could not be refreshed.");
    });
    this.#elements.projectAnnotationForm.configure(apiBase);
    this.#elements.projectAnnotationForm.addEventListener(projectAnnotationSavedEvent, (event) => {
      void this.#completeAnnotationSave((event as CustomEvent<ProjectAnnotationSaved>).detail);
    });
    this.#elements.projectAnnotationForm.addEventListener(projectAnnotationActionEvent, (event) => {
      const action = (event as CustomEvent<ProjectAnnotationAction>).detail;
      if (action.action === "choose-tool") this.#setHighlightTool(action.tool);
      else if (action.action === "undo-highlight") void this.#undoLastHighlightStroke(action.annotationId, action.fragmentId);
      else this.#citeActivePdf();
    });
    this.#elements.libraryPdfAnnotationForms.addEventListener(libraryPdfAnnotationActionEvent, (event) => {
      const action = (event as CustomEvent<LibraryPdfAnnotationAction>).detail;
      if (action.action === "highlight-saved") void this.#completeLibraryHighlightSave(action.kind);
      else if (action.action === "cancel-highlight") this.#clearLibraryHighlightDraft();
      else if (action.action === "note-saved") void this.#completeLibraryPdfNoteSave(action.kind);
      else if (action.action === "cancel-note") this.#clearLibraryPdfNoteDraft();
      else if (action.action === "markup-saved") void this.#completeSelectedLibraryPdfMarkupMutation(action.kind);
      else if (action.action === "edit-note") this.#editSelectedLibraryPdfNote();
      else this.#clearLibraryPdfMarkupSelection();
    });
    this.#elements.libraryHighlightList.addEventListener(libraryPdfAnnotationListActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryPdfAnnotationListAction>).detail;
      if (detail.action === "open-highlight") void this.#openLibraryHighlight(detail.highlight);
      else if (detail.action === "edit-highlight") this.#editLibraryHighlight(detail.highlight);
      else if (detail.action === "cite-highlight") void this.#citeLibraryHighlight(detail.highlight);
      else if (detail.action === "open-markup") void this.#openLibraryPdf(detail.artifact, detail.page);
      else if (detail.action === "edit-note") this.#editLibraryPdfNote(detail.note);
      else this.#completeLibraryPdfMarkup("Private annotation deleted.");
    });
    for (const target of [this.#elements.referenceLibraryList, this.#elements.libraryProjectUse]) {
      target.addEventListener(projectReferenceChangedEvent, (event) => {
        const { message, snapshot } = (event as CustomEvent<ProjectReferenceChanged>).detail;
        void this.#acceptWorkspaceMutation(snapshot).then(() => {
          this.#renderReferenceLibrary();
          this.#showToast(message);
        });
      });
    }
    for (const target of [this.#elements.referenceLibraryList, this.#elements.libraryHighlightList]) {
      target.addEventListener(projectResearchChangedEvent, (event) => {
        const { message, snapshot } = (event as CustomEvent<ProjectResearchChanged>).detail;
        void this.#acceptWorkspaceMutation(snapshot).then(() => {
          this.#renderReferenceLibrary();
          this.#showToast(message);
        });
      });
    }
    this.#elements.libraryPdfAnnotationToolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => {
      const action = (event as CustomEvent<LibraryPdfToolbarAction>).detail;
      if (action.action === "choose-tool") this.#setLibraryPdfTool(action.tool);
      else if (action.action === "drawing-undone") this.#completeLibraryPdfMarkup("Private annotation deleted.");
      else if (action.action === "export-status") this.#showToast(action.message);
      else this.#setLibraryPdfInspector(true, true);
    });
    this.#elements.libraryPdfInspector.addEventListener(libraryPdfInspectorCloseEvent, () => this.#closeLibraryPdfInspector());
    this.#elements.pdfHighlightImportPanel.addEventListener(pdfHighlightImportOutcomeEvent, (event) => {
      const { count } = (event as CustomEvent<PdfHighlightImportOutcome>).detail;
      void this.#completePdfHighlightImport(count);
    });
    this.#elements.paperMarkups.addEventListener(libraryPdfShapeRecognizedEvent, (event) => {
      const { kind } = (event as CustomEvent<LibraryPdfShapeRecognition>).detail;
      const label = { line: "Line", ellipse: "Circle", rectangle: "Rectangle", triangle: "Triangle" }[kind];
      this.#elements.libraryPdfInspector.setStatus(`${label} snapped into place. Keep dragging to adjust it, or lift to save.`);
    });
    this.#elements.paperMarkups.addEventListener(libraryPdfMarkupActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryPdfMarkupAction>).detail;
      if (detail.action === "drawing-saved" || detail.action === "note-moved") {
        this.#completeLibraryPdfMarkup(detail.action === "drawing-saved" ? "Drawing saved privately." : "Note moved.");
      } else if (detail.action === "select-markup") this.#selectLibraryPdfMarkup(detail.id);
      else if (detail.action === "touch-drawing") {
        this.#elements.libraryPdfInspector.setStatus("Use Apple Pencil or a mouse to draw; touch gestures pan and zoom the page.");
      } else {
        this.#elements.libraryPdfAnnotationForms.showNote("", detail.draft);
        this.#setLibraryPdfInspector(true);
        this.#elements.libraryPdfAnnotationForms.focusNote();
      }
    });
    this.#elements.claimListPanel.configure(apiBase);
    this.#elements.claimListPanel.addEventListener(claimListActionEvent, (event) => {
      const detail = (event as CustomEvent<ClaimListAction>).detail;
      if (detail.action === "create") this.#openClaimDialog();
      else if (detail.action === "evidence") this.#setModelEvidenceSelected(detail.key, detail.selected);
      else if (detail.action === "edit") this.#openClaimDialog(detail.claim);
      else if (detail.action === "mutated")
        this.#refreshResourcesWithNotice(detail.message, "The claim was deleted, but project resources could not be refreshed.");
      else if (detail.action === "link-passage") void this.#linkClaim(detail.claimId);
      else if (detail.action === "open-annotation") this.#focusAnnotationCard(detail.annotationId);
      else this.#showPassage(detail.anchor);
    });
    this.#elements.candidateListPanel.configure(apiBase);
    this.#elements.candidateListPanel.addEventListener(candidateListOpenEvent, (event) => {
      this.#openCandidateContext((event as CustomEvent<ModelCandidate>).detail);
    });
    this.#elements.claimDialog.configure(apiBase);
    this.#elements.claimDialog.addEventListener(claimDialogSavedEvent, (event) => {
      this.#refreshResourcesWithNotice(
        (event as CustomEvent<string>).detail,
        "The claim was saved, but project resources could not be refreshed.",
      );
    });
    this.#elements.workspaceSurfaceSwitcher.addEventListener(workspaceSurfaceChangeEvent, (event) => {
      this.#showWorkspaceSurface((event as CustomEvent<WorkspaceSurface>).detail);
    });
    this.#layout.bind();
    this.#elements.contextTabStrip.addEventListener(contextPrimaryTabActionEvent, (event) => {
      const action = (event as CustomEvent<ContextPrimaryTabAction>).detail;
      if (action === RESEARCH_LIBRARY_KEY) void this.#openReferenceLibrary();
      else this.#activateContext(action);
    });
    this.#elements.contextTabStrip.addEventListener(contextResourceTabActionEvent, (event) => {
      const detail = (event as CustomEvent<ContextResourceTabAction>).detail;
      if (detail.action === "activate") this.#activateContext(detail.key);
      else this.#closeContextTab(detail.key);
    });
    this.#elements.contextTabStrip.addEventListener(contextTabOverviewActionEvent, (event) => {
      const detail = (event as CustomEvent<ContextTabOverviewAction>).detail;
      if (detail.action === "activate") this.#activateContext(detail.key);
      else this.#closeContextTab(detail.key);
    });
    this.#previewDocument.onClick((event) => this.#handlePreviewClick(event));
    this.#elements.diagnostics.addEventListener(previewDiagnosticSelectEvent, (event) => {
      const { fileId, from, to } = (event as CustomEvent<PreviewDiagnosticSelection>).detail;
      this.#focusProjectRange(fileId || this.#snapshot?.entryFileId || "", from, to);
    });
    this.#elements.previewSyncControls.addEventListener(previewSyncActionEvent, (event) => {
      const action = (event as CustomEvent<PreviewSyncAction>).detail;
      if (action === "source-to-preview") this.#syncPreviewFromSource();
      else this.#syncSourceFromPreviewCenter();
    });
    this.#elements.sourceCitationControl.addEventListener(sourceCitationOpenEvent, (event) => {
      this.#openCitation((event as CustomEvent<CitationContext>).detail);
    });
    this.#elements.publicationContextPanel.configure(apiBase);
    this.#elements.publicationContextPanel.addEventListener(publicationContextActionEvent, (event) => {
      const detail = (event as CustomEvent<PublicationContextAction>).detail;
      if (detail.action === "insert-citation") this.#insertActivePublicationCitation();
      else if (detail.action === "open-paper") void this.#openPublicationPaper(detail.paper);
      else this.#refreshResourcesWithNotice(detail.message, "The paper links changed, but project resources could not be refreshed.");
    });
    this.#elements.publicationIntakePanel.configure(apiBase);
    this.#elements.publicationIntakePanel.addEventListener(publicationIntakeActionEvent, (event) => {
      const detail = (event as CustomEvent<PublicationIntakeAction>).detail;
      if (detail.action === "open-reference") {
        const publication = this.#snapshot?.publications.find(({ id }) => id === detail.publicationId);
        if (publication) this.#openPublicationContext(publication);
      } else void this.#completePublicationIntake(detail.doi, detail.requestId);
    });
    this.#elements.candidateReviewPanel.configure(apiBase);
    this.#elements.candidateReviewPanel.addEventListener(candidateDecisionEvent, (event) => {
      const detail = (event as CustomEvent<CandidateDecisionRequest>).detail;
      this.#assistantWorkflow.send({ type: "DECIDE", id: detail.candidateId, action: detail.action });
      this.#renderResearchContext(false);
      this.#updateModelAvailability();
    });
    this.#elements.candidateReviewPanel.addEventListener(candidateDecisionOutcomeEvent, (event) => {
      void this.#completeCandidateRequest((event as CustomEvent<CandidateDecisionOutcome>).detail);
    });
    this.#elements.candidateReviewPanel.addEventListener(candidateEvidenceEvent, (event) => {
      const evidence = (event as CustomEvent<ModelEvidence>).detail;
      if (evidence.kind === "annotation") {
        const pdf = this.#snapshot?.pdfs.find((item) => item.id === evidence.pdfId);
        const annotation = this.#snapshot?.annotations.find((item) => item.id === evidence.id);
        if (pdf && annotation) void this.#showPaper(pdf, evidence.page, evidence.id);
      } else if (this.#snapshot?.claims.some((claim) => claim.id === evidence.id)) {
        this.#focusClaimCard(evidence.id);
      }
    });
    this.#elements.modelProviderSettings.addEventListener(modelProviderChangeEvent, (event) => {
      const status = (event as CustomEvent<string | null>).detail;
      if (status) this.#elements.assistantWorkflowStatus.status = status;
      this.#updateModelAvailability();
    });
    this.#elements.assistantWorkflowStatus.addEventListener(assistantWorkflowActionEvent, (event) => {
      const action = (event as CustomEvent<AssistantWorkflowAction>).detail;
      if (action === "choose-evidence") this.#chooseModelEvidence();
      else this.#elements.modelProviderSettings.open();
    });
    this.#elements.assistantInteractiveResult.addEventListener(assistantResultActionEvent, (event) => {
      void this.#handleAssistantResultAction((event as CustomEvent<AssistantResultActionDetail>).detail);
    });
    this.#elements.assistantInteractiveResult.addEventListener(assistantReferenceRefreshEvent, (event) => {
      const detail = (event as CustomEvent<AssistantReferenceRefresh>).detail;
      void this.#completeLibraryRefresh(detail.message, "The reference was saved, but the refreshed Library could not be loaded.", {
        complete: () => this.#elements.assistantInteractiveResult.completeReferenceSave(detail.index, detail.requestId),
        failure: (message) => (this.#elements.assistantWorkflowStatus.status = message),
        success: (message) => (this.#elements.assistantWorkflowStatus.status = message),
      });
    });
    this.#elements.assistantTaskPanel.addEventListener(assistantTaskChangeEvent, (event) => {
      const change = (event as CustomEvent<AssistantTaskChange>).detail;
      if (change === "operation") this.#updateModelTask(true);
      else {
        if (change === "target") this.#renderAssistantTargetPreview();
        this.#updateModelAvailability();
      }
    });
    this.#elements.assistantTaskPanel.addEventListener(assistantTaskGenerateEvent, () => void this.#generateCandidate());
    this.#updateModelTask();
  }

  async #refreshSnapshot(): Promise<void> {
    const response = await fetch(apiBase);
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      throw new WorkspaceAccessError("Project access is no longer available");
    }
    if (!response.ok) throw new Error("Could not load the project");
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error("Project returned an invalid snapshot");
    const snapshot = collaborationSynced(this.#collaborationWorkflow.getSnapshot())
      ? resolveWorkspaceSnapshotAnchors(this.#document, value)
      : value;
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

  async #openWorkspaceSettings(checkGitHub = true): Promise<void> {
    const current = this.#workspaceCatalog.find((item) => item.id === workspaceId);
    const profile = this.#snapshot?.publicationProfile ?? defaultProjectPublicationProfile;
    await this.#elements.workspaceSettingsPanel.show({
      archived: Boolean(current?.archivedAt),
      entryFileId: this.#snapshot?.entryFileId ?? "",
      files: (this.#snapshot?.files ?? []).filter((file) => !this.#hiddenProjectFileIds.has(file.id)).map(({ id, path }) => ({ id, path })),
      publicationProfile: profile,
      templateAllowed: workspaceId !== "demo",
      title: current?.title ?? "",
    });
    if (checkGitHub) void this.#refreshGitHubSyncState(true);
  }

  async #handleWorkspaceSettingsResult(detail: WorkspaceSettingsAction): Promise<void> {
    if (detail.action === "save-template") await this.#openSaveTemplate();
    else await this.#refreshCatalog();
  }

  async #refreshGitHubSyncState(force = false, resetReview = true): Promise<void> {
    if (!navigator.onLine) return;
    if (!force && (this.#elements.workspaceSettingsPanel.gitHubReview.hasActivePreview || this.#elements.workspaceSettingsPanel.open))
      return;
    if (!this.#elements.gitHubSyncMenu.refreshDue(force)) return;
    if (resetReview) this.#resetGitHubSyncReview();
    await this.#elements.gitHubSyncMenu.refresh();
  }

  #resetGitHubSyncReview(): void {
    this.#elements.workspaceSettingsPanel.gitHubReview.reset();
  }

  async #handleGitHubSyncMutation(mutation: GitHubSyncMutation): Promise<void> {
    if (mutation === "pull") await this.#resourceRefresh.request();
    await this.#refreshGitHubSyncState(true, false);
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

  #deleteProjectTemplate(template: ProjectTemplateSummary): void {
    this.#deferDeletion({
      key: `project-template:${template.id}`,
      deletedMessage: `Deleted template “${template.name}”.`,
      restoredMessage: `Restored template “${template.name}”.`,
      failedMessage: `Could not delete template “${template.name}”.`,
      hide: () => this.#setProjectTemplateHidden(template.id, true),
      restore: () => this.#setProjectTemplateHidden(template.id, false),
      commit: async () => {
        await this.#elements.newWorkspaceStartingPoints.deleteTemplate(template.id);
        this.#syncTemplateReplacementOptions();
      },
    });
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

  #setProjectTemplateHidden(id: string, hidden: boolean): void {
    this.#elements.newWorkspaceStartingPoints.setTemplateHidden(id, hidden);
    this.#syncTemplateReplacementOptions();
  }

  #syncTemplateReplacementOptions(): void {
    this.#elements.saveTemplateDialog.setTemplates(this.#elements.newWorkspaceStartingPoints.availableTemplates);
  }

  async #completeProjectTemplateSave({ replaced, template }: ProjectTemplateSaved): Promise<void> {
    await this.#refreshProjectTemplates();
    this.#showToast(replaced ? `Replaced template “${template.name}”.` : `Saved “${template.name}” as a personal template.`);
  }

  #syncCollaborationQueue(): void {
    this.#collaborationWorkflow.send({ type: "QUEUE_CHANGED", pendingUpdates: this.#pendingUpdates.size });
  }

  #renderCollaborationWorkflow(): void {
    const snapshot = this.#collaborationWorkflow.getSnapshot();
    const status = collaborationStatus(snapshot);
    this.#setConnection(status.label, status.connected);
    this.#setEditorsEnabled(collaborationCanEdit(snapshot));
    this.#updateModelAvailability();
  }

  #connect(): void {
    if (this.#socket && this.#socket.readyState < WebSocket.CLOSING) return;
    if (!navigator.onLine) {
      this.#collaborationWorkflow.send({ type: "CONNECT", online: false });
      this.#renderCollaborationWorkflow();
      return;
    }
    window.clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
    this.#collaborationWorkflow.send({ type: "CONNECT", online: true });
    this.#renderCollaborationWorkflow();
    this.#serverDocument?.destroy();
    this.#serverDocument = new Y.Doc();
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}${apiBase}/socket`);
    socket.binaryType = "arraybuffer";
    this.#socket = socket;
    this.#pendingUpdates.resetForReconnect();
    this.#syncCollaborationQueue();
    socket.addEventListener("open", () => {
      if (this.#socket !== socket) return;
      this.#collaborationWorkflow.send({ type: "SOCKET_OPEN" });
      this.#renderCollaborationWorkflow();
    });
    socket.addEventListener("message", (event: MessageEvent<string | ArrayBuffer>) => {
      if (this.#socket === socket) this.#handleSocketMessage(socket, event.data);
    });
    socket.addEventListener("close", () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#pendingUpdates.resetForReconnect();
      this.#syncCollaborationQueue();
      this.#remoteSelections.clear();
      this.#renderRemoteSelections();
      this.#collaborationWorkflow.send({ type: "SOCKET_CLOSED", online: navigator.onLine });
      this.#renderCollaborationWorkflow();
      if (navigator.onLine) {
        this.#reconnectTimer ??= window.setTimeout(() => {
          this.#reconnectTimer = undefined;
          this.#collaborationWorkflow.send({ type: "RECONNECT" });
          this.#connect();
        }, 1200);
      }
    });
    socket.addEventListener("error", () => socket.close());
  }

  #handleSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string") {
      this.#handleCollaborationUpdate(socket, message);
      return;
    }
    const value = parseServerCollaborationMessage(message);
    if (!value) {
      socket.close(1002, "Invalid collaboration control");
      return;
    }
    if (this.#handleCollaborationControl(socket, value)) this.#renderCollaborationWorkflow();
  }

  #handleCollaborationUpdate(socket: WebSocket, message: ArrayBuffer): void {
    const selections = this.#captureEditorSelections();
    if (collaborationSynced(this.#collaborationWorkflow.getSnapshot())) this.#collaborationWorkflow.send({ type: "REMOTE_UPDATE" });
    try {
      const update = new Uint8Array(message);
      if (this.#serverDocument) {
        Y.applyUpdate(this.#serverDocument, update, remoteOrigin);
        this.#serverStateVector = Y.encodeStateVector(this.#serverDocument);
      }
      Y.applyUpdate(this.#document, update, remoteOrigin);
    } catch {
      socket.close(1007, "Invalid collaboration update");
      return;
    }
    this.#restoreEditorSelections(selections);
    this.#updateModelAvailability();
  }

  #handleCollaborationControl(socket: WebSocket, value: ServerCollaborationMessage): boolean {
    switch (value.type) {
      case "sync":
        this.#handleCollaborationSync(socket, value.revision);
        break;
      case "ack":
        this.#handleCollaborationAcknowledgement(socket, value.revision);
        break;
      case "revision":
        this.#collaborationWorkflow.send({ type: "REVISION" });
        this.#setRevision(value.revision);
        break;
      case "reset":
        this.#handleCollaborationReset(socket);
        return false;
      case "presence":
        this.#collaborationWorkflow.send({ type: "PRESENCE", collaborators: value.collaborators });
        break;
      case "selection":
        this.#handleRemoteSelection(value);
        break;
      case "selection-clear":
        this.#remoteSelections.delete(value.collaboratorId);
        this.#renderRemoteSelections();
        break;
      case "resources":
        void this.#resourceRefresh.request().catch((error: unknown) => {
          this.#showToast(error instanceof Error ? error.message : "Could not refresh project resources");
        });
        break;
    }
    return true;
  }

  #handleCollaborationSync(socket: WebSocket, revision: number): void {
    if (collaborationSynced(this.#collaborationWorkflow.getSnapshot())) {
      socket.close(1002, "Duplicate collaboration sync");
      return;
    }
    this.#collaborationWorkflow.send({ type: "SYNC" });
    if (this.#serverDocument) this.#serverStateVector = Y.encodeStateVector(this.#serverDocument);
    this.#completeCollaborationRevision(revision);
  }

  #handleCollaborationAcknowledgement(socket: WebSocket, revision: number): void {
    try {
      const acknowledged = this.#pendingUpdates.acknowledge();
      if (this.#serverDocument) {
        Y.applyUpdate(this.#serverDocument, new Uint8Array(acknowledged.payload), remoteOrigin);
        this.#serverStateVector = Y.encodeStateVector(this.#serverDocument);
      }
    } catch {
      socket.close(1002, "Unexpected collaboration acknowledgement");
      return;
    }
    this.#syncCollaborationQueue();
    this.#completeCollaborationRevision(revision);
  }

  #completeCollaborationRevision(revision: number): void {
    this.#setRevision(revision);
    this.#elements.editorStatus.setSave(this.#pendingUpdates.size === 0 ? "Saved" : "Saving…");
    this.#scheduleOfflineSave();
    this.#flushPendingUpdates();
  }

  #handleCollaborationReset(socket: WebSocket): void {
    this.#collaborationWorkflow.send({ type: "RESET" });
    void Promise.resolve(this.#offlineStore?.clear()).finally(() => {
      if (socket.readyState >= WebSocket.CLOSING) {
        window.location.reload();
        return;
      }
      socket.addEventListener("close", () => window.location.reload(), { once: true });
      socket.close(1000, "Workspace reset");
    });
  }

  #handleRemoteSelection(value: Extract<ServerCollaborationMessage, { readonly type: "selection" }>): void {
    if (value.revision === this.#revision) this.#remoteSelections.set(value.collaboratorId, value);
    this.#renderRemoteSelections();
  }

  #flushPendingUpdates(): void {
    const socket = this.#socket;
    if (!collaborationSynced(this.#collaborationWorkflow.getSnapshot()) || !socket || socket.readyState !== WebSocket.OPEN) return;
    for (let update = this.#pendingUpdates.nextUnsent(); update; update = this.#pendingUpdates.nextUnsent()) {
      socket.send(update.payload);
      this.#pendingUpdates.markSent(update.sequence);
    }
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
    for (const [collaboratorId, selection] of this.#remoteSelections) {
      if (selection.revision !== this.#revision) this.#remoteSelections.delete(collaboratorId);
    }
    this.#renderRemoteSelections();
    this.#updateRevision();
    this.#scheduleOfflineSave();
    const active = this.#activeResourceTab();
    if (active?.kind === "candidate") this.#renderCandidateContext(active);
  }

  #scheduleSelectionBroadcast(): void {
    window.clearTimeout(this.#selectionBroadcastTimer);
    this.#selectionBroadcastTimer = window.setTimeout(() => {
      this.#selectionBroadcastTimer = undefined;
      const socket = this.#socket;
      if (
        !collaborationSynced(this.#collaborationWorkflow.getSnapshot()) ||
        !socket ||
        socket.readyState !== WebSocket.OPEN ||
        !this.#activeFileId
      )
        return;
      socket.send(
        encodeClientSelectionMessage({
          type: "selection",
          protocol: collaborationProtocolVersion,
          fileId: this.#activeFileId,
          start: this.#elements.source.selectionStart,
          end: this.#elements.source.selectionEnd,
          revision: this.#revision,
        }),
      );
    }, 80);
  }

  #renderRemoteSelections(): void {
    this.#elements.collaboratorSelections.setData({
      files: this.#liveProjectFiles(),
      revision: this.#revision,
      selections: [...this.#remoteSelections.values()],
    });
    this.#renderSourceEditorHighlight();
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
    const markAssistantResultStale = (): void => this.#assistantWorkflow.send({ type: "SOURCE_CHANGED" });
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
    return collaborationStable(this.#collaborationWorkflow.getSnapshot());
  }

  #updateModelAvailability(): void {
    const stable = this.#hasStableDocumentBase();
    const assistant = this.#assistantWorkflow.getSnapshot();
    const assistantBusy = assistantWorkflowBusy(assistant);
    this.#elements.modelProviderSettings.setDiscoveryAvailable(!assistantBusy);
    const evidence = this.#elements.assistantWorkflowStatus.modelEvidence();
    this.#elements.assistantTaskPanel.setGenerationAvailability({
      annotationEvidenceCount: evidence.annotationItems.length,
      discoveryBusy: this.#elements.modelProviderSettings.discoveryBusy,
      evidenceCount: evidence.items.length,
      hasInsertionTarget: this.#assistantInsertionTarget() !== null,
      hasPassage: this.#assistantAuthoringPassage() !== null,
      modelAvailable: Boolean(this.#elements.modelProviderSettings.value.model.trim()),
      selectedEvidenceCount: this.#elements.assistantWorkflowStatus.selectedEvidenceKeys.size,
      stableDocument: stable,
      workflowBusy: assistantBusy,
    });
    this.#elements.candidateReviewPanel.setAvailability(stable, assistant.context.candidateDecision !== null);
  }

  #updateModelTask(resetInstruction = false): void {
    const operation = this.#elements.assistantTaskPanel.value.operation;
    this.#elements.assistantWorkflowStatus.setOperation(operation.id);
    if (resetInstruction) {
      this.#elements.assistantInteractiveResult.clear();
    }
    this.#renderAssistantTargetPreview();
    this.#updateModelAvailability();
  }

  #renderAssistantTargetPreview(): void {
    const target = this.#assistantInsertionTarget();
    const passage = this.#assistantAuthoringPassage();
    this.#elements.assistantTaskPanel.showTarget({
      passage: passage?.excerpt ?? null,
      scope: target && target.start !== target.end ? "selection" : this.#assistantTargetScope(),
      target,
    });
  }

  #modelProvider(): OpenAICompatibleBrowserProvider {
    const preferences = this.#elements.modelProviderSettings.value;
    return new OpenAICompatibleBrowserProvider({
      endpoint: preferences.endpoint,
      providerLabel: preferences.connection === "companion" ? "Local companion · OpenAI-compatible" : "Browser-local OpenAI-compatible",
      model: preferences.model,
      reasoningEffort: preferences.reasoningEffort,
    });
  }

  async #renderPreview(bibliography = this.#bibliography.toString()): Promise<void> {
    const renderVersion = ++this.#previewRenderVersion;
    const inputs = this.#previewInputs();
    this.#preparePreviewContext(inputs);
    const runtime = await this.#loadPreviewRuntime(renderVersion, inputs.renderedSource);
    if (!runtime || renderVersion !== this.#previewRenderVersion) return;
    const rendered = runtime.renderWorkspaceMarkdown(
      inputs.renderedSource,
      bibliography,
      this.#snapshot?.publicationProfile.citationStyle,
      { headingNumbers: this.#previewHeadingNumbers(runtime, inputs) },
    );
    this.#renderMarkdownPreview(rendered, inputs);
    this.#renderPreviewDiagnostics(rendered.diagnostics, inputs.filePreview);
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

  async #loadPreviewRuntime(renderVersion: number, renderedSource: string): Promise<MarkdownRuntime | null> {
    try {
      return await loadMarkdownRuntime();
    } catch (error) {
      if (renderVersion === this.#previewRenderVersion) this.#renderPreviewUnavailable(renderedSource, error);
      return null;
    }
  }

  #renderPreviewUnavailable(renderedSource: string, error: unknown): void {
    this.#previewDocument.showSource(renderedSource);
    this.#elements.previewContextControls.showUnavailable();
    this.#elements.diagnostics.showUnavailable(error instanceof Error ? error.message : "The Markdown renderer could not be loaded");
  }

  #previewHeadingNumbers(runtime: MarkdownRuntime, inputs: PreviewInputs): Record<number, string> {
    const headingNumbers: Record<number, string> = {};
    const { filePreview, publicationComposition } = inputs;
    if (filePreview?.mode === "isolated" && publicationComposition) {
      for (const [outputOffset, number] of Object.entries(runtime.headingNumbersByOffset(publicationComposition.content))) {
        const span = sourceSpanAt(publicationComposition.sourceMap, Number(outputOffset));
        if (!span || span.fileId !== filePreview.fileId) continue;
        const sourceOffset = span.sourceStart + Number(outputOffset) - span.outputStart;
        headingNumbers[sourceOffset] ??= number;
      }
    }
    return headingNumbers;
  }

  #renderMarkdownPreview(rendered: RenderedDocument, inputs: PreviewInputs): void {
    this.#previewDocument.showHtml(rendered.html);
    this.#elements.previewSyncControls.setSourceMap(inputs.filePreview?.sourceMap ?? []);
    if (this.#snapshot) {
      this.#previewDocument.resolveProjectImages({
        apiBase,
        hiddenAssetIds: this.#hiddenProjectImageIds,
        snapshot: this.#snapshot,
        source: inputs.renderedSource,
        sourceMap: inputs.filePreview?.sourceMap ?? [],
      });
    }
  }

  #renderPreviewDiagnostics(diagnostics: readonly Diagnostic[], filePreview: ProjectFilePreview | null): void {
    this.#elements.previewContextControls.setDiagnostics(diagnostics, filePreview);
    this.#elements.diagnostics.setDiagnostics(diagnostics, filePreview);
  }

  #renderPreviewWorkspaceContext(publicationComposition: ProjectComposition | null, bibliography: string): void {
    const snapshot = this.#snapshot;
    if (snapshot) {
      const resolved = resolveWorkspaceSnapshotAnchors(this.#document, snapshot);
      this.#elements.projectEvidencePanel.setPassageLinks(resolved.links);
      this.#elements.claimListPanel.setPassageLinks(resolved.claimLinks);
      this.#renderManuscriptComments(resolved.comments);
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

  async #openResearchDiary(): Promise<void> {
    const existing = this.#snapshot?.files.find((file) => file.path === researchDiaryPath);
    if (existing) {
      this.#selectProjectFile(existing.id);
      this.#elements.source.focus();
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    await this.#createWorkflowFile(researchDiaryPath, researchDiaryTemplate(date));
  }

  async #openResearchQuestions(): Promise<void> {
    const existing = this.#snapshot?.files.find((file) => file.path === researchQuestionsPath);
    if (existing) {
      this.#selectProjectFile(existing.id);
      this.#elements.source.focus();
      return;
    }
    await this.#createWorkflowFile(researchQuestionsPath, researchQuestionsTemplate());
  }

  async #openReviewerResponse(): Promise<void> {
    const existing = this.#snapshot?.files.find((file) => file.path === reviewerResponsePath);
    if (existing) {
      this.#selectProjectFile(existing.id);
      this.#elements.source.focus();
      return;
    }
    await this.#createWorkflowFile(reviewerResponsePath, reviewerResponseTemplate());
  }

  async #handleWritingWorkflowAction(detail: WritingWorkflowActionDetail): Promise<void> {
    if (detail.action === "select") {
      this.#focusProjectRange(detail.fileId, detail.from, detail.to);
      return;
    }
    if (detail.action === "notice") {
      this.#showToast(detail.message);
      return;
    }
    if (detail.kind === "research-questions") await this.#openResearchQuestions();
    else await this.#openReviewerResponse();
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

  #handlePreviewClick(event: MouseEvent): void {
    if (this.#openPreviewCitation(event) || !(event.target instanceof Element)) return;
    if (event.target.closest("a, button, input, select, textarea")) return;
    const target = event.target.closest<HTMLElement>("[data-source-from][data-source-to]");
    if (target) this.#syncSourceFromPreviewElement(target);
  }

  #syncSourceFromPreviewCenter(): void {
    const target = this.#previewDocument.centeredSourceElement();
    if (target) this.#syncSourceFromPreviewElement(target, true);
  }

  #syncSourceFromPreviewElement(target: HTMLElement, centerEditor = false): void {
    const previewOffset = Number.parseInt(target.dataset.sourceFrom ?? "", 10);
    if (!Number.isSafeInteger(previewOffset)) return;
    const location = this.#elements.previewSyncControls.sourceLocation(previewOffset);
    if (!location) return;
    this.#showWorkspaceSurface("authoring");
    this.#focusProjectRange(location.fileId, location.offset, location.offset);
    if (centerEditor) this.#elements.previewSyncControls.centerSourceOffset(location.offset);
    this.#previewDocument.markSyncTarget(target);
  }

  #syncPreviewFromSource(explicit = true): void {
    if (!this.#previewSyncAvailable(explicit)) return;
    const fileId = this.#activeFileId ?? this.#snapshot?.entryFileId ?? "";
    const sourceOffset = explicit ? this.#elements.previewSyncControls.sourceOffsetAtCenter() : this.#elements.source.selectionEnd;
    const offsets = this.#elements.previewSyncControls.previewOffsets(fileId, sourceOffset);
    if (offsets.length === 0) return;
    const target = this.#previewDocument.nearestSourceElement(offsets);
    if (!target) return;
    this.#previewDocument.center(target);
    this.#previewDocument.markSyncTarget(target);
  }

  #previewSyncAvailable(explicit: boolean): boolean {
    const automaticSyncAvailable = explicit || this.#automaticPreviewSyncAvailable();
    return automaticSyncAvailable && this.#contextState.activeKey === RESEARCH_PREVIEW_KEY;
  }

  #automaticPreviewSyncAvailable(): boolean {
    return (
      window.matchMedia("(min-width: 72rem)").matches &&
      this.#elements.workspaceSurfaces.dataset.layout === "split" &&
      this.#contextState.activeKey === RESEARCH_PREVIEW_KEY
    );
  }

  #liveProjectFiles(): ProjectFile[] {
    if (!this.#snapshot) return [];
    return this.#snapshot.files
      .filter((file) => !this.#hiddenProjectFileIds.has(file.id))
      .map((file) => ({
        ...file,
        content: this.#document.getText(projectFileCollaborationTextName(file, this.#snapshot?.entryFileId ?? "")).toString(),
      }));
  }

  #previewProjectFiles(): ProjectFile[] {
    if (!this.#snapshot) return [];
    const collaboration = this.#collaborationWorkflow.getSnapshot();
    return collaborationSynced(collaboration) || collaboration.context.offlineAvailable
      ? this.#liveProjectFiles()
      : this.#snapshot.files.filter((file) => !this.#hiddenProjectFileIds.has(file.id));
  }

  #renderProjectFiles(): void {
    const snapshot = this.#snapshot;
    if (!snapshot) return;
    this.#ensureActiveProjectFile(snapshot);
    const files = snapshot.files.filter((file) => !this.#hiddenProjectFileIds.has(file.id));
    this.#elements.projectTreePanel.setTree({
      activeFileId: this.#activeFileId,
      assetBase: `${apiBase}/assets`,
      assets: snapshot.assets.filter((asset) => !this.#hiddenProjectImageIds.has(asset.id)),
      entryFileId: snapshot.entryFileId,
      files,
      folders: snapshot.folders.filter((folder) => !this.#hiddenProjectFolderIds.has(folder.id)),
    });
    this.#elements.editorInsertMenu.setFiles(files.find((file) => file.id === this.#activeFileId) ?? null, files);
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
    if (!snapshot || !file || this.#hiddenProjectFileIds.has(fileId) || fileId === this.#activeFileId) return;
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
    this.#previewDocument.resetScroll();
    void this.#renderPreview();
    this.#syncWorkspaceRoute("replace");
  }

  #openProjectFileDialog(mode: ProjectFileDialogMode, folderId?: string): void {
    const file = this.#snapshot?.files.find((item) => item.id === this.#activeFileId);
    const folder = this.#snapshot?.folders.find((item) => item.id === folderId);
    if (!this.#projectFileDialogResourcesAvailable(mode, file, folder)) return;
    this.#rememberProjectFileIncludeTarget(mode, file);
    const targetId = projectFileDialogIsCreating(mode) ? null : (folder?.id ?? file?.id ?? null);
    void this.#elements.projectFileDialog.show(mode, this.#projectFileDialogPath(mode, file, folder), targetId);
  }

  #projectFileDialogResourcesAvailable(
    mode: ProjectFileDialogMode,
    file: ProjectFile | undefined,
    folder: WorkspaceSnapshot["folders"][number] | undefined,
  ): boolean {
    if (mode === "rename") return file !== undefined;
    if (mode === "rename-folder") return folder !== undefined;
    return true;
  }

  #rememberProjectFileIncludeTarget(mode: ProjectFileDialogMode, file: ProjectFile | undefined): void {
    this.#projectFileIncludeTarget =
      mode === "create-and-include" ? captureRelativeSelection(this.#elements.source, this.#activeFileText) : null;
    this.#projectFileIncludeFromPath = mode === "create-and-include" ? (file?.path ?? null) : null;
  }

  #projectFileDialogPath(
    mode: ProjectFileDialogMode,
    file: ProjectFile | undefined,
    folder: WorkspaceSnapshot["folders"][number] | undefined,
  ): string {
    if (mode === "rename") return file?.path ?? "";
    if (mode === "rename-folder") return folder?.path ?? "";
    return "";
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
    this.#deferDeletion({
      key: `project-file:${file.id}`,
      deletedMessage: `Deleted ${file.path}.`,
      restoredMessage: `Restored ${file.path}.`,
      failedMessage: `Could not delete ${file.path}.`,
      hide: () => {
        this.#hiddenProjectFileIds.add(file.id);
        this.#activeFileId = null;
        this.#selectProjectFile(snapshot.entryFileId);
      },
      restore: () => {
        this.#hiddenProjectFileIds.delete(file.id);
        this.#selectProjectFile(file.id);
      },
      commit: async () => {
        this.#snapshot = await this.#elements.projectFileDialog.deleteFile(file.id);
        this.#renderProjectFiles();
        void this.#renderPreview();
      },
    });
  }

  #deleteProjectFolder(folderId: string): void {
    const folder = this.#snapshot?.folders.find((item) => item.id === folderId);
    if (!folder) return;
    this.#deferDeletion({
      key: `project-folder:${folder.id}`,
      deletedMessage: `Deleted ${folder.path}.`,
      restoredMessage: `Restored ${folder.path}.`,
      failedMessage: `Could not delete ${folder.path}.`,
      hide: () => {
        this.#hiddenProjectFolderIds.add(folder.id);
        this.#renderProjectFiles();
      },
      restore: () => {
        this.#hiddenProjectFolderIds.delete(folder.id);
        this.#renderProjectFiles();
      },
      commit: async () => {
        this.#snapshot = await this.#elements.projectTreePanel.deleteFolder(folder.id);
        this.#renderProjectFiles();
      },
    });
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

  #deleteProjectImage(asset: ProjectAsset): void {
    this.#deferDeletion({
      key: `project-image:${asset.id}`,
      deletedMessage: `Deleted ${asset.path}.`,
      restoredMessage: `Restored ${asset.path}.`,
      failedMessage: `Could not delete ${asset.path}.`,
      hide: () => {
        this.#hiddenProjectImageIds.add(asset.id);
        this.#renderProjectFiles();
        void this.#renderPreview();
      },
      restore: () => {
        this.#hiddenProjectImageIds.delete(asset.id);
        this.#renderProjectFiles();
        void this.#renderPreview();
      },
      commit: async () => {
        this.#snapshot = await this.#elements.projectTreePanel.deleteAsset(asset.id);
        this.#renderProjectFiles();
        void this.#renderPreview();
      },
    });
  }

  #deferDeletion(deletion: DeferredDeletion): void {
    if (this.#pendingDeletions.has(deletion.key)) return;
    deletion.hide();
    const timer = window.setTimeout(() => void this.#commitDeferredDeletion(deletion.key), deferredDeleteGraceMs);
    this.#pendingDeletions.set(deletion.key, { deletion, timer });
    this.#showToast(deletion.deletedMessage, {
      action: () => this.#undoDeferredDeletion(deletion.key),
      actionLabel: "Undo",
      durationMs: deferredDeleteGraceMs,
    });
  }

  #undoDeferredDeletion(key: string): void {
    const pending = this.#pendingDeletions.get(key);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    this.#pendingDeletions.delete(key);
    pending.deletion.restore();
    this.#showToast(pending.deletion.restoredMessage);
  }

  async #commitDeferredDeletion(key: string): Promise<void> {
    const pending = this.#pendingDeletions.get(key);
    if (!pending) return;
    this.#pendingDeletions.delete(key);
    try {
      await pending.deletion.commit();
    } catch {
      pending.deletion.restore();
      this.#showToast(pending.deletion.failedMessage);
    }
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
      history.pushState({ view: "library-reference", referenceId }, "", this.#libraryReferenceRoute(referenceId));
    }
  }

  async #focusReferenceLibraryEntry(referenceId: string): Promise<boolean> {
    if (
      !this.#librarySnapshot?.references.some((reference) => reference.id === referenceId) &&
      this.#elements.libraryToolsMenu.setShowArchived(true)
    ) {
      await this.#refreshReferenceLibrary();
    }
    this.#elements.referenceLibraryFilters.reset();
    this.#renderReferenceLibrary();
    if (!(await this.#elements.referenceLibraryList.focusReference(referenceId, { block: "center", expand: true }))) {
      this.#showToast("That reference is no longer available in the Library.");
      return false;
    }
    return true;
  }

  async #refreshReferenceLibrary(): Promise<void> {
    const response = await fetch(`/api/library${this.#elements.libraryToolsMenu.includesArchivedReferences ? "?archived=include" : ""}`, {
      credentials: "same-origin",
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isReferenceLibrarySnapshot(value)) throw new Error("Reference library returned an invalid snapshot");
    this.#captureActiveContextState();
    this.#librarySnapshot = value;
    await this.#refreshProjectReferencePdfs(false);
    this.#contextState = reconcileResearchContext(this.#contextState, this.#researchContextAuthorization());
    this.#renderReferenceLibrary();
    await this.#elements.referenceLibraryList.settled();
    this.#renderResearchContext();
    this.#syncWorkspaceRoute("replace");
  }

  #renderReferenceLibrary(): void {
    const library = this.#librarySnapshot;
    if (!library) return;
    this.#elements.citationNetwork.setReferences(library.references.map(({ id, title }) => ({ id, title: bibTeXDisplayText(title) })));
    const linked = new Set(this.#snapshot?.projectReferences.map((reference) => reference.referenceId) ?? []);
    const references = this.#elements.referenceLibraryFilters.filterLibrary(library, linked);
    this.#elements.referenceLibraryList.setData({
      library,
      projectApiBase: appMode === "workspace" ? apiBase : null,
      projectReferences: this.#snapshot?.projectReferences ?? [],
      references,
      researchShares: this.#snapshot?.researchShares ?? [],
    });

    const unidentified = library.artifacts.filter((artifact) => artifact.referenceId === null);
    this.#elements.unidentifiedPdfList.setData(unidentified, library.references);
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
    if (existing.archived && this.#elements.libraryToolsMenu.setShowArchived(true)) await this.#refreshReferenceLibrary();
    this.#elements.referenceLibraryFilters.reset(existing.referenceKey);
    this.#renderReferenceLibrary();
    if (!(await this.#elements.referenceLibraryList.focusReference(existing.referenceId, { block: "nearest" }))) {
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
    this.#elements.assistantWorkflowStatus.reconcileEvidence(this.#snapshot.annotations, this.#snapshot.claims);
    this.#elements.projectEvidencePanel.setEvidence(this.#snapshot, this.#elements.assistantWorkflowStatus.selectedEvidenceKeys);
    this.#elements.projectAnnotationForm.setPdfs(this.#snapshot.pdfs, this.#renderedPdfId ?? "");
    this.#elements.publicationListPanel.setPublications({
      projectReferences: this.#snapshot.projectReferences,
      publications: this.#snapshot.publications,
    });
    this.#elements.claimListPanel.setWorkspace(this.#snapshot, this.#elements.assistantWorkflowStatus.selectedEvidenceKeys);
    this.#renderManuscriptComments(this.#snapshot.comments);
    this.#elements.candidateListPanel.setCandidates(this.#snapshot.candidates);
    this.#pdfViewer.updateAnnotations(
      this.#renderedPdfId ? this.#snapshot.annotations.filter((annotation) => annotation.pdfId === this.#renderedPdfId) : [],
    );
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

  #renderManuscriptComments(comments: ManuscriptComment[]): void {
    this.#elements.workspaceRailTabs.setCommentCount(comments.filter((comment) => comment.status === "open").length);
    this.#elements.manuscriptCommentListPanel.setComments(comments);
  }

  async #createManuscriptComment(body: string): Promise<void> {
    if (!this.#hasStableDocumentBase()) {
      this.#showToast("Wait for the manuscript to finish synchronizing before commenting.");
      return;
    }
    const passage = this.#selectedAuthoringPassage();
    if (!passage) {
      this.#showToast("Select manuscript text before adding a comment.");
      return;
    }
    await this.#elements.manuscriptCommentListPanel.createAt({
      ...passage,
      sourceRevision: this.#revision,
      body,
    });
  }

  async #reanchorManuscriptComment(commentId: string): Promise<void> {
    if (!this.#hasStableDocumentBase()) {
      this.#showToast("Wait for the manuscript to finish synchronizing before re-anchoring.");
      return;
    }
    const passage = this.#selectedAuthoringPassage();
    if (!passage) {
      this.#showToast("Select the revised manuscript passage before re-anchoring the comment.");
      return;
    }
    await this.#elements.manuscriptCommentListPanel.reanchorAt(commentId, {
      ...passage,
      sourceRevision: this.#revision,
    });
  }

  #openClaimDialog(claim?: ClaimResource): void {
    const snapshot = this.#snapshot;
    if (!snapshot || snapshot.annotations.length === 0) {
      this.#showToast("Create an evidence annotation before adding a claim.");
      return;
    }
    const evidence = claim ? snapshot.claimEvidenceLinks.filter((link) => link.claimId === claim.id) : [];
    this.#elements.claimDialog.open(claim, snapshot.annotations, evidence);
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
        this.#previewDocument.scrollToAnchor(id);
      },
      annotation: (id) => {
        const annotation = this.#snapshot?.annotations.find((item) => item.id === id);
        const pdf = annotation ? this.#snapshot?.pdfs.find((item) => item.id === annotation.pdfId) : undefined;
        if (annotation && pdf) void this.#showPaper(pdf, annotation.page, annotation.id);
      },
      claim: (id) =>
        document
          .querySelector<HTMLElement>(`[data-claim-resource-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
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
    this.#contextState = setResearchTabScroll(this.#contextState, key, this.#resourceContextScrollTop(tab));
    if ((tab.kind === "pdf" || tab.kind === "library-pdf") && tab.key === this.#renderedPdfContextKey) {
      this.#contextState = setPdfResearchLocation(this.#contextState, key, {
        page: this.#pdfViewer.currentPage,
        ...(tab.kind === "pdf" ? { focusedAnnotationId: this.#pdfViewer.focusedAnnotationId } : {}),
      });
    }
  }

  #resourceContextScrollTop(tab: ResearchContextTab): number {
    if (tab.kind === "publication") return this.#elements.publicationContextPanel.scrollPosition;
    if (tab.kind === "candidate") return this.#elements.candidateReviewPanel.scrollPosition;
    return this.#elements.paperReader.scrollTop;
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
    const activeKey = this.#contextState.activeKey;
    this.#elements.contextTabStrip.setTabs({
      activeKey,
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
    this.#renderContextPanelVisibility(activeKey, activeTab);
    this.#renderActiveResearchContext(activeKey, activeTab, loadPdf);
  }

  #renderContextPanelVisibility(activeKey: ResearchContextKey, activeTab: ResearchResourceTab | undefined): void {
    this.#elements.previewContextControls.hidden = activeKey !== RESEARCH_PREVIEW_KEY;
    this.#elements.previewSyncControls.setVisible(activeKey === RESEARCH_PREVIEW_KEY);
    this.#elements.previewNavigationControl.setPreviewActive(activeKey === RESEARCH_PREVIEW_KEY);
    this.#renderContextPdfVisibility(activeTab);
    this.#elements.projectAnnotationForm.setCitationContext(
      activeTab?.kind === "pdf" ? activeTab.id : null,
      this.#snapshot?.publicationPdfLinks ?? [],
    );
  }

  #renderContextPdfVisibility(activeTab: ResearchResourceTab | undefined): void {
    const activeLibraryArtifact = this.#activeLibraryPdfArtifact(activeTab);
    const activeLibraryPdf = Boolean(activeLibraryArtifact);
    const activeProjectReferencePdf = this.#activeProjectReferencePdf(activeTab, activeLibraryArtifact);
    this.#elements.contextTabStrip.setPdfMode(activeTab?.kind === "library-pdf", activeProjectReferencePdf);
    this.#elements.projectAnnotationForm.setVisible(!activeLibraryPdf && !activeProjectReferencePdf);
    this.#elements.libraryPdfInspector.setVisible(activeLibraryPdf);
    if (!activeLibraryPdf) this.#setLibraryPdfInspector(false);
    this.#renderLibraryHighlightComposer(activeLibraryArtifact);
  }

  #activeLibraryPdfArtifact(activeTab: ResearchResourceTab | undefined): LibraryPdfArtifact | undefined {
    if (activeTab?.kind !== "library-pdf") return undefined;
    return this.#librarySnapshot?.artifacts.find((artifact) => artifact.id === activeTab.id);
  }

  #activeProjectReferencePdf(activeTab: ResearchResourceTab | undefined, artifact: LibraryPdfArtifact | undefined): boolean {
    return activeTab?.kind === "library-pdf" && !artifact && Boolean(this.#projectReferencePdf(activeTab.id));
  }

  #renderActiveResearchContext(activeKey: ResearchContextKey, activeTab: ResearchResourceTab | undefined, loadPdf: boolean): void {
    if (this.#restoreFixedResearchContext(activeKey)) return;
    if (!activeTab) return;
    this.#renderActiveResourceContext(activeTab, loadPdf);
  }

  #restoreFixedResearchContext(activeKey: ResearchContextKey): boolean {
    const scrollTop = this.#contextState.tabs.find((item) => item.key === activeKey)?.scrollTop ?? 0;
    return this.#elements.contextTabStrip.restoreFixedScroll(activeKey, scrollTop);
  }

  #renderActiveResourceContext(activeTab: ResearchResourceTab, loadPdf: boolean): void {
    if (activeTab.kind === "publication") {
      this.#renderPublicationContext(activeTab);
      this.#elements.publicationContextPanel.scrollPosition = activeTab.scrollTop;
      return;
    }
    if (activeTab.kind === "candidate") {
      this.#renderCandidateContext(activeTab);
      this.#elements.candidateReviewPanel.scrollPosition = activeTab.scrollTop;
      return;
    }
    if (activeTab.kind === "pdf") {
      this.#elements.publicationIntakePanel.setPdf(
        activeTab.id,
        this.#snapshot?.publications ?? [],
        this.#snapshot?.publicationPdfLinks ?? [],
      );
    }
    if (loadPdf) void this.#loadActivePdf(false);
  }

  async #completePublicationIntake(doi: string, requestId: number): Promise<void> {
    try {
      await this.#resourceRefresh.request();
      const publication = this.#snapshot?.publications.find((item) => item.doi === doi);
      if (!publication) throw new Error("The connected publication could not be found");
      if (!this.#elements.publicationIntakePanel.completeAcceptance(requestId)) return;
      this.#openPublicationContext(publication);
      this.#showToast("Reference added and connected; the manuscript is unchanged.");
    } catch (error) {
      this.#elements.publicationIntakePanel.failAcceptance(requestId, error);
    }
  }

  #renderCandidateContext(tab: ResearchResourceTab): void {
    if (tab.kind !== "candidate" || !this.#snapshot) return;
    const candidate = this.#snapshot.candidates.find((item) => item.id === tab.id);
    if (!candidate) return;
    const candidateDecision = this.#assistantWorkflow.getSnapshot().context.candidateDecision;
    const currentDecision = candidateDecision?.id === candidate.id ? candidateDecision : null;
    this.#elements.candidateReviewPanel.setCandidate({
      annotations: this.#snapshot.annotations,
      candidate,
      claims: this.#snapshot.claims,
      ...(currentDecision ? { currentAction: currentDecision.action } : {}),
      decisionBusy: candidateDecision !== null,
      sourceRevision: this.#revision,
      stableDocument: this.#hasStableDocumentBase(),
    });
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

  #renderPublicationContext(tab: ResearchResourceTab): void {
    if (tab.kind !== "publication" || !this.#snapshot) return;
    const publication = this.#snapshot.publications.find((item) => item.id === tab.id);
    if (!publication) return;

    this.#elements.publicationContextPanel.setPublication({
      libraryArtifacts: this.#librarySnapshot?.artifacts ?? [],
      pdfs: this.#snapshot.pdfs,
      publication,
      publicationPdfLinks: this.#snapshot.publicationPdfLinks,
      referencePdfs: this.#projectReferencePdfs,
    });
    this.#updateCitationInsertionAvailability();
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

  #openPreviewCitation(event: MouseEvent): boolean {
    if (!(event.target instanceof Element)) return false;
    const citation = event.target.closest<HTMLButtonElement>("button.semantic-citation[data-citation]");
    if (!citation) return false;
    const key = parseCitationKeys(citation.dataset.citation ?? "")[0];
    const publication = key ? this.#publicationByCitationKey(key) : undefined;
    if (publication) this.#navigateToCitation(publication, citation.dataset.locator);
    else this.#showToast(`No publication resource is available for ${key ?? "this citation"}.`);
    return true;
  }

  #openCitation(citation: CitationContext): void {
    if (citation.keys.length > 1) {
      this.#showToast("Open this grouped citation from Preview to choose a reference.");
      return;
    }
    const publication = this.#publicationByCitationKey(citation.keys[0] ?? "");
    if (publication) this.#navigateToCitation(publication, citation.locator);
    else this.#showToast(`No publication resource is available for ${citation.keys[0]}.`);
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

  #renderSourceCompletion(): void {
    const snapshot = this.#snapshot;
    this.#elements.sourceCompletion.refresh({
      activeFileId: this.#activeFileId,
      files: snapshot?.files ?? [],
      projectReferences: snapshot?.projectReferences ?? [],
      workspace: appMode === "workspace",
    });
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
    const context = this.#activePdfLoadContext();
    if (!context) return;
    this.#pdfViewer.updateAnnotations(context.annotations);
    this.#pdfViewer.updatePrivateHighlights(context.privateHighlights);
    if (!force && this.#renderedPdfContextKey === context.tab.key) {
      this.#elements.paperReader.scrollTop = context.tab.scrollTop;
      return;
    }
    await this.#openActivePdf(context);
  }

  #activePdfLoadContext(): ActivePdfLoadContext | null {
    const tab = this.#activePdfTab();
    if (!tab) return null;
    const { workspacePdf, libraryPdf, projectReferencePdf } = this.#activePdfResources(tab);
    if (!this.#pdfResourceAvailable(workspacePdf, libraryPdf, projectReferencePdf)) return null;
    if (workspacePdf) this.#elements.projectAnnotationForm.selectPdf(workspacePdf.id);
    const annotations = this.#activePdfAnnotations(workspacePdf);
    const privateHighlights = this.#activePdfHighlights(libraryPdf);
    const url = this.#activePdfUrl(workspacePdf, libraryPdf, projectReferencePdf);
    if (!url) return null;
    return { tab, workspacePdf, libraryPdf, annotations, privateHighlights, url };
  }

  #activePdfTab(): ActivePdfLoadContext["tab"] | null {
    const tab = this.#activeResourceTab();
    if (tab?.kind === "pdf" || tab?.kind === "library-pdf") return tab;
    return null;
  }

  #pdfResourceAvailable(
    workspacePdf: PdfResource | undefined,
    libraryPdf: LibraryPdfArtifact | undefined,
    projectReferencePdf: ProjectReferencePdf | undefined,
  ): boolean {
    return Boolean(workspacePdf ?? libraryPdf ?? projectReferencePdf);
  }

  #activePdfResources(tab: ActivePdfLoadContext["tab"]): ActivePdfResources {
    if (tab.kind === "pdf") {
      return {
        workspacePdf: this.#snapshot?.pdfs.find((item) => item.id === tab.id),
        libraryPdf: undefined,
        projectReferencePdf: undefined,
      };
    }
    const libraryPdf = this.#librarySnapshot?.artifacts.find((item) => item.id === tab.id);
    return {
      workspacePdf: undefined,
      libraryPdf,
      projectReferencePdf: libraryPdf ? undefined : this.#projectReferencePdf(tab.id),
    };
  }

  #activePdfAnnotations(workspacePdf: PdfResource | undefined): AnnotationResource[] {
    if (!workspacePdf) return [];
    return this.#snapshot?.annotations.filter((annotation) => annotation.pdfId === workspacePdf.id) ?? [];
  }

  #activePdfHighlights(libraryPdf: LibraryPdfArtifact | undefined): LibraryHighlight[] {
    if (!libraryPdf) return [];
    return this.#librarySnapshot?.highlights.filter((highlight) => highlight.artifactId === libraryPdf.id) ?? [];
  }

  #activePdfUrl(
    workspacePdf: PdfResource | undefined,
    libraryPdf: LibraryPdfArtifact | undefined,
    projectReferencePdf: ProjectReferencePdf | undefined,
  ): string | null {
    if (workspacePdf) return `${apiBase}/pdfs/${encodeURIComponent(workspacePdf.id)}`;
    if (libraryPdf) return `/api/library/pdfs/${encodeURIComponent(libraryPdf.id)}`;
    if (projectReferencePdf) return `${apiBase}/reference-pdfs/${encodeURIComponent(projectReferencePdf.id)}`;
    return null;
  }

  async #openActivePdf(context: ActivePdfLoadContext): Promise<void> {
    try {
      const opened = await this.#pdfViewer.open({
        url: context.url,
        annotations: context.annotations,
        page: context.tab.page,
        ...this.#activePdfFocus(context.tab.focusedAnnotationId),
        mode: this.#activePdfMode(context),
        privateHighlights: context.privateHighlights,
      });
      const active = this.#activeResourceTab();
      if (!opened || active?.key !== context.tab.key) return;
      this.#renderedPdfContextKey = context.tab.key;
      this.#renderedPdfId = context.workspacePdf?.id;
      this.#elements.paperReader.scrollTop = context.tab.scrollTop;
    } catch (error) {
      this.#reportActivePdfError(context.tab.key, error);
    }
  }

  #activePdfFocus(focusedAnnotationId: string | null | undefined): { focusAnnotationId?: string } {
    return focusedAnnotationId ? { focusAnnotationId: focusedAnnotationId } : {};
  }

  #activePdfMode(context: ActivePdfLoadContext): "evidence" | "private-highlight" | "read-only" {
    if (context.workspacePdf) return "evidence";
    if (context.libraryPdf) return "private-highlight";
    return "read-only";
  }

  #reportActivePdfError(tabKey: string, error: unknown): void {
    if (this.#activeResourceTab()?.key !== tabKey) return;
    this.#pdfViewer.showError(error);
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

  #assistantTargetScope(): AssistantTargetScope {
    const { operation, targetScope: scope } = this.#elements.assistantTaskPanel.value;
    return operation.scopes.includes(scope) ? scope : (operation.defaultScope ?? "selection");
  }

  #assistantAuthoringPassage(): AuthoringPassage | null {
    if (!this.#activeFileId) return null;
    const target = this.#resolvedAuthoringTarget();
    if (!target) return null;
    const source = this.#activeFileText.toString();
    const resolved = resolveAssistantTarget(source, target.start, target.end, this.#assistantTargetScope());
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

  #insertSourceSyntax(kind: EditorSyntaxKind): void {
    const passage = this.#selectedAuthoringPassage();
    const caret = this.#resolvedAuthoringCaret() ?? this.#elements.source.selectionEnd;
    const template = this.#sourceSyntaxTemplate(kind, passage);
    if (!template) return;
    this.#applySourceSyntax(template, passage, caret);
    this.#showToast("Inserted scholarly syntax.");
  }

  #insertProjectIncludeFromMenu(relativePath: string, path: string): void {
    const caret = this.#resolvedAuthoringCaret() ?? this.#elements.source.selectionEnd;
    this.#insertProjectInclude(this.#activeFileText, caret, relativePath);
    this.#showToast(`Included ${path}.`);
  }

  #sourceSyntaxTemplate(kind: string, passage: AuthoringPassage | null): SourceSyntaxTemplate | undefined {
    const templates: Readonly<Record<string, SourceSyntaxTemplate>> = {
      citation: { text: ":cite[key]", select: "key" },
      reference: { text: ":ref[target]", select: "target" },
      anchor: { text: "{#label}", select: "label" },
      footnote: { text: "[^note]", select: "note" },
      link: { text: passage ? `[${passage.excerpt}](url)` : "[text](url)", select: passage ? "url" : "text" },
      bibliography: { text: "::bibliography[]" },
    };
    return templates[kind];
  }

  #applySourceSyntax(template: SourceSyntaxTemplate, passage: AuthoringPassage | null, caret: number): void {
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

  #setModelEvidenceSelected(key: string, selected: boolean): void {
    this.#elements.assistantWorkflowStatus.setEvidenceSelected(key, selected);
    this.#updateModelAvailability();
  }

  #chooseModelEvidence(): void {
    this.#showRail("research");
    if (!this.#elements.projectEvidencePanel.focusEvidence() && !this.#elements.claimListPanel.focusEvidence()) {
      this.#elements.assistantWorkflowStatus.status = "Add a PDF highlight or researcher-authored claim before choosing model evidence.";
      this.#showToast("No project evidence is available yet.");
      return;
    }
    this.#elements.assistantWorkflowStatus.status =
      "Choose one or more evidence resources in the Research rail, then return to the assistant.";
  }

  async #generateCandidate(): Promise<void> {
    if (assistantWorkflowBusy(this.#assistantWorkflow.getSnapshot())) return;
    const input = this.#assistantGenerationContext();
    if (!input) return;
    this.#assistantWorkflow.send({ type: "START", operation: input.operation.id, sourceRevision: input.sourceRevision });
    this.#updateModelAvailability();
    this.#elements.assistantWorkflowStatus.generationStarted(input.operation.id);
    try {
      await this.#runAssistantGeneration(input);
    } catch (error) {
      this.#failAssistantGeneration(error);
    } finally {
      this.#updateModelAvailability();
    }
  }

  #failAssistantGeneration(error: unknown): void {
    const message = error instanceof Error ? error.message : "Local model request failed";
    this.#assistantWorkflow.send({ type: "FAIL", message });
    this.#elements.assistantWorkflowStatus.status = message;
  }

  #assistantGenerationContext(): AssistantGenerationContext | null {
    const { instruction, operation } = this.#elements.assistantTaskPanel.value;
    const passage = this.#assistantAuthoringPassage();
    const evidence = this.#elements.assistantWorkflowStatus.modelEvidence();
    const insertionTarget = operation.id === "build-table" ? this.#assistantInsertionTarget() : null;
    if (
      !this.#elements.assistantWorkflowStatus.validateGeneration({
        evidence,
        hasInsertionTarget: insertionTarget !== null,
        hasPassage: passage !== null,
        operation,
        snapshotAvailable: this.#snapshot !== null,
        stableDocument: this.#hasStableDocumentBase(),
      })
    ) {
      return null;
    }
    const provider = this.#modelProviderOrReport();
    if (!provider) return null;
    return {
      provider,
      operation,
      passage,
      evidence,
      insertionTarget,
      instruction,
      sourceRevision: this.#revision,
    };
  }

  #modelProviderOrReport(): OpenAICompatibleBrowserProvider | null {
    try {
      return this.#modelProvider();
    } catch (error) {
      this.#elements.assistantWorkflowStatus.status = error instanceof Error ? error.message : "Enter a valid local model endpoint.";
      return null;
    }
  }

  async #runAssistantGeneration(input: AssistantGenerationContext): Promise<void> {
    if (input.operation.id === "draft-claim") return await this.#generateClaimCandidate(input);
    if (input.operation.id === "build-table") return await this.#generateTableCandidate(input);
    if (!input.passage) throw new Error("Select manuscript text first");
    if (input.operation.id === "phrase-passage") return await this.#generatePhrasingCandidate(input, input.passage);
    if (input.operation.id === "find-references") return await this.#generateReferenceDiscovery(input, input.passage);
    if (input.operation.id === "ideate") return await this.#generateIdeas(input, input.passage);
    if (input.operation.id === "clarity-drill") return await this.#generateClarityQuestion(input, input.passage);
    await this.#generateRevisionCandidate(input, input.passage);
  }

  async #generateClaimCandidate(input: AssistantGenerationContext): Promise<void> {
    const relation = this.#elements.assistantTaskPanel.claimEvidenceRelation;
    const value = await this.#elements.candidateListPanel.generateClaim(input.provider, {
      evidence: input.evidence.annotationReferences,
      instruction: input.instruction,
      promptEvidence: input.evidence.annotationItems,
      relation,
    });
    await this.#openCreatedCandidate(value);
    this.#elements.assistantWorkflowStatus.status = "Claim draft ready. Review its proposition, note, and annotation snapshots in Context.";
    this.#assistantWorkflow.send({ type: "COMPLETE" });
  }

  async #generateTableCandidate(input: AssistantGenerationContext): Promise<void> {
    if (!input.insertionTarget) throw new Error("Place the manuscript caret first");
    const requirements = this.#elements.assistantTaskPanel.tableRequirements;
    const source = this.#activeFileText.toString();
    const manuscriptContext = resolveAssistantTarget(source, input.insertionTarget.end, input.insertionTarget.end, "paragraph").text;
    await this.#elements.assistantInteractiveResult.generateTable(
      input.provider,
      { instruction: input.instruction, ...requirements, manuscriptContext },
      { sourceRevision: input.sourceRevision, target: input.insertionTarget },
    );
    this.#elements.assistantWorkflowStatus.status = "Table syntax ready. Review it before inserting at the visible target.";
    this.#assistantWorkflow.send({ type: "REVIEW" });
  }

  async #generatePhrasingCandidate(input: AssistantGenerationContext, passage: AuthoringPassage): Promise<void> {
    const purpose = this.#elements.assistantTaskPanel.phrasingPurpose;
    await this.#elements.assistantInteractiveResult.generatePhrasing(
      input.provider,
      { passage, evidence: input.evidence, instruction: input.instruction, sourceRevision: input.sourceRevision },
      purpose,
    );
    this.#elements.assistantWorkflowStatus.status = "Choose one alternative to open exact before-and-after review.";
    this.#assistantWorkflow.send({ type: "REVIEW" });
  }

  async #generateReferenceDiscovery(input: AssistantGenerationContext, passage: AuthoringPassage): Promise<void> {
    const count = await this.#elements.assistantInteractiveResult.discoverReferences(input.provider, {
      selectedPassage: passage.excerpt,
      instruction: input.instruction,
      evidence: input.evidence.items,
    });
    this.#elements.assistantWorkflowStatus.status = count
      ? `Found ${count} verifiable registry record${count === 1 ? "" : "s"}. Review before saving.`
      : "No verifiable registry records matched this query. Refine the search focus and try again.";
    this.#assistantWorkflow.send({ type: "REVIEW" });
  }

  async #generateIdeas(input: AssistantGenerationContext, passage: AuthoringPassage): Promise<void> {
    await this.#elements.assistantInteractiveResult.generateIdeas(input.provider, {
      passage,
      evidence: input.evidence,
      instruction: input.instruction,
      sourceRevision: input.sourceRevision,
    });
    this.#elements.assistantWorkflowStatus.status = "Choose a direction to open its complete draft for exact review.";
    this.#assistantWorkflow.send({ type: "REVIEW" });
  }

  async #generateClarityQuestion(input: AssistantGenerationContext, passage: AuthoringPassage): Promise<void> {
    await this.#elements.assistantInteractiveResult.startClarityDrill(input.provider, {
      passage,
      evidence: input.evidence,
      instruction: input.instruction,
      sourceRevision: input.sourceRevision,
    });
    this.#elements.assistantWorkflowStatus.status = "Answer one focused question to make the intended meaning explicit.";
    this.#assistantWorkflow.send({ type: "AWAIT_INPUT" });
  }

  async #generateRevisionCandidate(input: AssistantGenerationContext, passage: AuthoringPassage): Promise<void> {
    const value = await this.#elements.candidateListPanel.generateRevision(input.provider, {
      evidence: input.evidence.references,
      instruction: input.instruction,
      promptEvidence: input.evidence.items,
      target: { ...passage, sourceRevision: input.sourceRevision },
    });
    await this.#openCreatedCandidate(value);
    this.#elements.assistantWorkflowStatus.status = "Candidate ready. Review its exact replacement and evidence in Context.";
    this.#assistantWorkflow.send({ type: "COMPLETE" });
  }

  async #handleAssistantResultAction(detail: AssistantResultActionDetail): Promise<void> {
    if (detail.action === "insert-table") {
      this.#insertGeneratedTable(detail.context.target, detail.context.sourceRevision, detail.markdown);
      return;
    }
    if (detail.action === "continue-clarity") {
      await this.#continueClarityDrill(detail.context, detail.answer);
      return;
    }
    await this.#chooseAssistantRevision(detail.context, detail.choice);
  }

  #insertGeneratedTable(target: AuthoringPassage, sourceRevision: number, markdown: string): void {
    const source = this.#activeFileText.toString();
    if (
      !this.#assistantWorkflow.getSnapshot().matches("reviewing") ||
      !this.#hasStableDocumentBase() ||
      this.#revision !== sourceRevision ||
      source.slice(target.start, target.end) !== target.excerpt
    ) {
      this.#elements.assistantWorkflowStatus.status = "The manuscript changed. Generate the table again for the current target.";
      return;
    }
    const prefix = target.start > 0 && source[target.start - 1] !== "\n" ? "\n\n" : "";
    const suffix = target.end < source.length && source[target.end] !== "\n" ? "\n\n" : "\n";
    const insertion = `${prefix}${markdown}${suffix}`;
    this.#assistantWorkflow.send({ type: "COMPLETE" });
    this.#document.transact(() => {
      if (target.end > target.start) this.#activeFileText.delete(target.start, target.end - target.start);
      this.#activeFileText.insert(target.start, insertion);
    }, this);
    const caret = target.start + insertion.length;
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(caret, caret);
    this.#rememberAuthoringSelection();
    this.#elements.assistantWorkflowStatus.status = "Table inserted into the manuscript.";
  }

  async #continueClarityDrill(input: ClarityDrillContext, rawAnswer: string): Promise<void> {
    const answer = rawAnswer.trim();
    const workflow = this.#assistantWorkflow.getSnapshot();
    if (!answer || !workflow.matches("awaitingInput")) {
      this.#elements.assistantWorkflowStatus.status = !answer
        ? "Answer the clarity question first."
        : workflow.matches("stale")
          ? "The manuscript changed. Start the clarity drill again for the current target."
          : "The local model is already working.";
      return;
    }
    this.#assistantWorkflow.send({ type: "CONTINUE" });
    this.#updateModelAvailability();
    this.#elements.assistantWorkflowStatus.status = "Turning that meaning into a few precise alternatives…";
    try {
      await this.#elements.assistantInteractiveResult.completeClarityDrill(input, answer);
      this.#elements.assistantWorkflowStatus.status = "Choose the wording that best matches your meaning; it will still open for review.";
      this.#assistantWorkflow.send({ type: "REVIEW" });
    } catch (error) {
      this.#failAssistantGeneration(error);
    } finally {
      this.#updateModelAvailability();
    }
  }

  async #chooseAssistantRevision(
    input: Pick<AssistantDraftContext, "passage" | "evidence" | "sourceRevision">,
    choice: {
      readonly instruction: string;
      readonly replacement: string;
      readonly providerLabel: string;
      readonly model: string;
      readonly successMessage: string;
      readonly failureMessage: string;
    },
  ): Promise<void> {
    if (!this.#assistantWorkflow.getSnapshot().matches("reviewing")) return;
    this.#assistantWorkflow.send({ type: "CONTINUE" });
    this.#updateModelAvailability();
    try {
      await this.#persistRevisionCandidate({
        passage: input.passage,
        evidence: input.evidence.references,
        instruction: choice.instruction,
        sourceRevision: input.sourceRevision,
        replacement: choice.replacement,
        providerLabel: choice.providerLabel,
        model: choice.model,
      });
      this.#elements.assistantWorkflowStatus.status = choice.successMessage;
      this.#assistantWorkflow.send({ type: "COMPLETE" });
    } catch (error) {
      const message = error instanceof Error ? error.message : choice.failureMessage;
      this.#assistantWorkflow.send({ type: "FAIL", message });
      this.#elements.assistantWorkflowStatus.status = message;
    } finally {
      this.#updateModelAvailability();
    }
  }

  async #persistRevisionCandidate(input: {
    readonly passage: AuthoringPassage;
    readonly evidence: readonly ModelEvidenceReference[];
    readonly instruction: string;
    readonly sourceRevision: number;
    readonly replacement: string;
    readonly providerLabel: string;
    readonly model: string;
  }): Promise<void> {
    const value = await this.#elements.candidateListPanel.createRevision({
      providerLabel: input.providerLabel,
      model: input.model,
      instruction: input.instruction,
      target: { ...input.passage, sourceRevision: input.sourceRevision },
      evidence: [...input.evidence],
      proposedReplacement: input.replacement,
    });
    await this.#openCreatedCandidate(value);
  }

  async #openCreatedCandidate(value: ModelCandidate): Promise<void> {
    await this.#resourceRefresh.request();
    this.#openCandidateContext(this.#snapshot?.candidates.find((item) => item.id === value.id) ?? value);
  }

  async #completeCandidateRequest(detail: CandidateDecisionOutcome): Promise<void> {
    const candidate = this.#snapshot?.candidates.find((item) => item.id === detail.candidateId);
    let failure = detail.failure;
    if (failure) {
      await this.#resourceRefresh.request().catch(() => undefined);
      this.#showToast(failure);
    } else {
      try {
        await this.#resourceRefresh.request();
        if (detail.action === "reject") this.#contextState = activateResearchTab(this.#contextState, RESEARCH_ASSISTANT_KEY);
        this.#showToast(this.#candidateDecisionMessage(detail.action, candidate?.operation === "draft-claim"));
      } catch (error) {
        failure = error instanceof Error ? error.message : "Candidate decision failed";
        await this.#resourceRefresh.request().catch(() => undefined);
        this.#showToast(failure);
      }
    }
    this.#completeCandidateDecision(detail.action, failure);
  }

  #candidateDecisionMessage(action: "apply" | "reject", draftsClaim: boolean): string {
    if (action === "apply") return draftsClaim ? "Evidence-backed claim created." : "Candidate applied to canonical Markdown.";
    return draftsClaim ? "Claim draft rejected; no claim created." : "Candidate rejected; manuscript unchanged.";
  }

  #completeCandidateDecision(action: "apply" | "reject", failure: string | null): void {
    this.#assistantWorkflow.send(failure ? { type: "DECISION_FAILED", message: failure } : { type: "DECISION_DONE" });
    this.#renderResearchContext(false);
    this.#updateModelAvailability();
    if (!failure && action === "reject") this.#focusContextTab(RESEARCH_ASSISTANT_KEY);
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
      const route = this.#libraryPdfRoute(artifact.id, page ?? (active?.kind === "library-pdf" ? active.page : 1));
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
    const match = /^\/library\/pdfs\/([^/]+)$/u.exec(location.pathname);
    if (!match?.[1]) {
      if (this.#contextState.activeKey !== RESEARCH_LIBRARY_KEY) this.#activateContext(RESEARCH_LIBRARY_KEY);
      const referenceId = new URL(location.href).searchParams.get("reference");
      if (!referenceId) return;
      if (!(await this.#focusReferenceLibraryEntry(referenceId))) {
        history.replaceState({ view: "library" }, "", "/library");
      }
      return;
    }
    let artifactId: string;
    try {
      artifactId = decodeURIComponent(match[1]);
    } catch {
      artifactId = "";
    }
    const artifact = this.#librarySnapshot?.artifacts.find((item) => item.id === artifactId);
    if (!artifact) {
      history.replaceState({ view: "library" }, "", "/library");
      this.#showToast("That PDF is no longer in the library.");
      return;
    }
    const requestedPage = Number.parseInt(new URLSearchParams(location.search).get("page") ?? "1", 10);
    await this.#openLibraryPdf(artifact, Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1, false);
  }

  #libraryPdfRoute(artifactId: string, page: number): string {
    return `/library/pdfs/${encodeURIComponent(artifactId)}${page > 1 ? `?page=${page}` : ""}`;
  }

  #libraryReferenceRoute(referenceId: string): string {
    return `/library?reference=${encodeURIComponent(referenceId)}`;
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
      history.replaceState(history.state, "", this.#libraryPdfRoute(artifact.id, page));
    }
  }

  #capturePdfSelection(capture: PdfSelectionCapture): void {
    const activeTab = this.#activeResourceTab();
    if (activeTab?.kind === "library-pdf") {
      const artifact = this.#librarySnapshot?.artifacts.find((item) => item.id === activeTab.id);
      if (!artifact) return;
      this.#elements.libraryPdfInspector.setArtifact(artifact.id);
      this.#elements.libraryPdfAnnotationForms.showHighlight({
        highlightId: null,
        page: capture.page,
        quote: capture.quote,
        comment: "",
        rects: capture.rects,
      });
      this.#elements.libraryPdfInspector.setStatus(`Page ${capture.page} selection ready.`);
      this.#setLibraryPdfInspector(true);
      return;
    }
    if (activeTab?.kind !== "pdf") return;
    if (this.#renderedPdfId) this.#elements.projectAnnotationForm.selectPdf(this.#renderedPdfId);
    this.#elements.projectAnnotationForm.showCapture(capture);
    void this.#persistPdfSelection(capture);
  }

  #renderLibraryHighlightComposer(artifact: LibraryPdfArtifact | undefined): void {
    if (!artifact || !this.#librarySnapshot) return;
    if (!this.#elements.libraryPdfInspector.showsArtifact(artifact.id)) this.#resetLibraryHighlightComposer(artifact.id);
    this.#elements.libraryProjectUse.setContext({
      artifact,
      projectApiBase: appMode === "workspace" ? apiBase : null,
      projectReferences: this.#snapshot?.projectReferences ?? [],
      references: this.#librarySnapshot.references,
    });
    const highlights = this.#librarySnapshot.highlights.filter((highlight) => highlight.artifactId === artifact.id);
    this.#elements.pdfHighlightImportPanel.setContext(
      artifact.referenceId ? { artifactId: artifact.id, highlights, referenceId: artifact.referenceId } : null,
    );
    if (artifact.referenceId) {
      this.#elements.libraryPdfAnnotationForms.setHighlightContext({
        artifactId: artifact.id,
        highlights,
        referenceId: artifact.referenceId,
      });
    }
    this.#pdfViewer.updatePrivateHighlights(highlights);
    const markups = (this.#librarySnapshot.pdfMarkups ?? []).filter((markup) => markup.artifactId === artifact.id);
    this.#elements.libraryPdfAnnotationToolbar.setAnnotationAvailability(highlights.length + markups.length);
    this.#elements.libraryPdfAnnotationToolbar.setExportArtifact(artifact);
    this.#elements.libraryHighlightList.setData({
      artifact,
      highlights,
      linkedReferenceIds: new Set(this.#snapshot?.projectReferences.map((item) => item.referenceId) ?? []),
      markups,
      projectApiBase: appMode === "workspace" ? apiBase : null,
      researchShares: this.#snapshot?.researchShares ?? [],
    });
    this.#renderPdfMarkups();
  }

  #resetLibraryHighlightComposer(artifactId: string): void {
    this.#elements.pdfHighlightImportPanel.reset();
    this.#elements.paperMarkups.cancelShapeRecognition();
    this.#elements.libraryPdfInspector.setArtifact(artifactId);
    this.#elements.paperMarkups.resetState();
    this.#elements.libraryPdfAnnotationForms.clearHighlight(1);
    this.#elements.libraryPdfAnnotationForms.clearNote();
    this.#elements.libraryPdfAnnotationForms.clearMarkup();
    this.#elements.libraryPdfInspector.setStatus("Select text to highlight.");
    this.#setLibraryPdfInspector(false);
  }

  async #completePdfHighlightImport(count: number): Promise<void> {
    await this.#refreshReferenceLibrary();
    this.#showToast(`${count} PDF ${count === 1 ? "highlight" : "highlights"} imported to your library.`);
  }

  async #completeLibraryHighlightSave(kind: "created" | "extended" | "updated"): Promise<void> {
    this.#pdfViewer.clearDraftSelection();
    await this.#refreshReferenceLibrary();
    if (kind === "updated") {
      this.#elements.libraryPdfInspector.setStatus("Private highlight note updated.");
      this.#showToast("Private highlight note updated.");
      return;
    }
    const extended = kind === "extended";
    this.#elements.libraryPdfInspector.setStatus(
      extended
        ? "Existing private highlight extended. Select another passage to continue."
        : "Private highlight saved. Select another passage to continue.",
    );
    this.#showToast(extended ? "Existing private highlight extended." : "Private highlight saved to your library.");
  }

  #clearLibraryHighlightDraft(message = "Selection cancelled. Nothing was saved."): void {
    this.#elements.libraryPdfAnnotationForms.clearHighlight(this.#pdfViewer.currentPage);
    this.#elements.libraryPdfInspector.setStatus(message);
    this.#pdfViewer.clearDraftSelection();
  }

  #editLibraryHighlight(highlight: LibraryHighlight): void {
    if (this.#elements.paperMarkups.selectedMarkupId) this.#clearLibraryPdfMarkupSelection();
    if (this.#elements.paperMarkups.tool !== "select") this.#setLibraryPdfTool("select");
    this.#elements.paperMarkups.selectHighlight(highlight.id);
    this.#pdfViewer.setPrivateHighlightSelection(true, highlight.id);
    this.#elements.libraryPdfAnnotationForms.showHighlight({
      highlightId: highlight.id,
      page: highlight.page,
      quote: highlight.quote,
      comment: highlight.comment,
      rects: highlight.rects,
    });
    this.#elements.libraryPdfInspector.setStatus(`Editing the note for page ${highlight.page}.`);
    this.#setLibraryPdfInspector(true);
    this.#elements.libraryPdfAnnotationForms.focusHighlightComment();
  }

  #setLibraryPdfInspector(open: boolean, showAnnotations = false): void {
    this.#elements.libraryPdfInspector.setInspectorOpen(open, showAnnotations);
    this.#elements.libraryPdfAnnotationToolbar.setInspectorOpen(open);
  }

  #closeLibraryPdfInspector(): void {
    if (this.#elements.libraryPdfAnnotationForms.highlightOpen) this.#clearLibraryHighlightDraft();
    if (this.#elements.libraryPdfAnnotationForms.noteOpen) this.#clearLibraryPdfNoteDraft();
    if (this.#elements.libraryPdfAnnotationForms.markupOpen) this.#clearLibraryPdfMarkupSelection();
    this.#setLibraryPdfInspector(false);
    this.#elements.libraryPdfAnnotationToolbar.focusInspectorButton();
  }

  #setLibraryPdfTool(tool: "select" | "text" | "note" | "draw"): void {
    this.#elements.paperMarkups.chooseTool(tool);
    this.#pdfViewer.setTextSelectionEnabled(tool === "text");
    const status = this.#elements.libraryPdfAnnotationToolbar.setTool(tool);
    this.#pdfViewer.setPrivateHighlightSelection(tool === "select", this.#elements.paperMarkups.selectedHighlightId);
    this.#elements.libraryPdfInspector.setStatus(status);
    if (tool !== "note") this.#clearLibraryPdfNoteDraft();
    if (tool !== "select") this.#clearLibraryPdfMarkupSelection();
    if (this.#elements.libraryPdfAnnotationForms.empty) this.#setLibraryPdfInspector(false);
  }

  async #completeLibraryPdfNoteSave(kind: "created" | "updated"): Promise<void> {
    this.#elements.paperMarkups.clearNote();
    await this.#refreshReferenceLibrary();
    this.#setLibraryPdfInspector(false);
    this.#showToast(kind === "updated" ? "Private note updated." : "Note attached privately.");
  }

  #clearLibraryPdfNoteDraft(): void {
    this.#elements.paperMarkups.clearNote();
    this.#elements.libraryPdfAnnotationForms.clearNote();
  }

  #editLibraryPdfNote(note: LibraryPdfNote): void {
    if (this.#elements.paperMarkups.tool !== "select") this.#setLibraryPdfTool("select");
    this.#elements.paperMarkups.editNote(note);
    this.#elements.libraryPdfAnnotationForms.showNote(note.body, {
      artifactId: note.artifactId,
      editingId: note.id,
      page: note.page,
      referenceId: note.referenceId,
      x: note.x,
      y: note.y,
    });
    this.#elements.libraryPdfInspector.setStatus(`Editing the note on page ${note.page}.`);
    this.#setLibraryPdfInspector(true);
    this.#elements.libraryPdfAnnotationForms.focusNote();
  }

  #selectLibraryHighlight(highlightId: string): void {
    const highlight = this.#librarySnapshot?.highlights.find((item) => item.id === highlightId);
    if (!highlight) return;
    this.#clearLibraryPdfMarkupSelection();
    this.#editLibraryHighlight(highlight);
  }

  #selectLibraryPdfMarkup(markupId: string): void {
    const markup = (this.#librarySnapshot?.pdfMarkups ?? []).find((item) => item.id === markupId);
    if (!markup) return;
    if (this.#elements.libraryPdfAnnotationForms.highlightOpen) this.#clearLibraryHighlightDraft();
    this.#elements.paperMarkups.selectMarkup(markup.id);
    this.#pdfViewer.setPrivateHighlightSelection(true);
    this.#elements.libraryPdfAnnotationForms.showMarkup({
      id: markup.id,
      label: markup.kind === "note" ? `Note on page ${markup.page} · drag its pin to move` : `Line on page ${markup.page}`,
      kind: markup.kind,
      referenceId: markup.referenceId,
      ...(markup.kind === "drawing" ? { color: markup.color, width: markup.width } : {}),
    });
    this.#elements.libraryPdfInspector.setStatus(
      markup.kind === "note"
        ? "Note selected. Drag the pin to move it, or edit its text below."
        : "Line selected. Adjust its style or delete it.",
    );
    this.#setLibraryPdfInspector(true);
  }

  #clearLibraryPdfMarkupSelection(): void {
    this.#elements.paperMarkups.clearSelection();
    this.#elements.libraryPdfAnnotationForms.clearMarkup();
    this.#pdfViewer.setPrivateHighlightSelection(this.#elements.paperMarkups.tool === "select");
  }

  #editSelectedLibraryPdfNote(): void {
    const note = (this.#librarySnapshot?.pdfMarkups ?? []).find(
      (item): item is LibraryPdfNote => item.kind === "note" && item.id === this.#elements.paperMarkups.selectedMarkupId,
    );
    if (note) this.#editLibraryPdfNote(note);
  }

  async #completeSelectedLibraryPdfMarkupMutation(kind: "deleted" | "updated"): Promise<void> {
    if (kind === "deleted") this.#clearLibraryPdfMarkupSelection();
    await this.#refreshReferenceLibrary();
    this.#showToast(kind === "deleted" ? "Private annotation deleted." : "Line style updated.");
  }

  #activeLibraryPdf(): LibraryPdfArtifact | undefined {
    const tab = this.#activeResourceTab();
    return tab?.kind === "library-pdf" ? this.#librarySnapshot?.artifacts.find((item) => item.id === tab.id) : undefined;
  }

  #renderPdfMarkups(): void {
    const artifact = this.#activeLibraryPdf();
    const page = this.#pdfViewer.currentPage;
    const markups = this.#visibleLibraryPdfMarkups(artifact, page);
    const drawings = markups.filter((item): item is LibraryPdfDrawing => item.kind === "drawing");
    this.#elements.paperMarkups.setData({
      drawingStyle: this.#elements.libraryPdfAnnotationToolbar.drawingStyle,
      drawingTarget: artifact?.referenceId ? { artifactId: artifact.id, referenceId: artifact.referenceId } : null,
      drawings,
      notes: markups.filter((item): item is LibraryPdfNote => item.kind === "note"),
      page,
    });
    this.#elements.libraryPdfAnnotationToolbar.setUndoDrawings(drawings);
  }

  #visibleLibraryPdfMarkups(artifact: LibraryPdfArtifact | undefined, page: number): LibraryPdfMarkup[] {
    if (!artifact) return [];
    return (this.#librarySnapshot?.pdfMarkups ?? []).filter((item) => item.artifactId === artifact.id && item.page === page);
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
    this.#elements.projectAnnotationForm.setStatus(
      tool === "paint"
        ? "Paint PDF text to save or extend a highlight."
        : "Select across a saved highlight stroke or tap it to erase that content.",
    );
  }

  async #activateHighlightFragment(annotationId: string, fragmentId: string): Promise<void> {
    if (this.#elements.projectAnnotationForm.selectedTool === "erase") {
      await this.#removeHighlightFragment(annotationId, fragmentId, true);
      return;
    }
    const annotation = this.#snapshot?.annotations.find((item) => item.id === annotationId);
    if (!annotation) return;
    this.#elements.projectAnnotationForm.showAnnotation(annotation);
    this.#focusAnnotationCard(annotationId);
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

  #focusAnnotationCard(annotationId: string): void {
    const card = document.querySelector<HTMLElement>(`[data-annotation-resource-id="${CSS.escape(annotationId)}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  #focusClaimCard(claimId: string): void {
    const card = document.querySelector<HTMLElement>(`[data-claim-resource-id="${CSS.escape(claimId)}"]`);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    this.#serverStateVector = new Uint8Array(record.serverStateVector);
    const pending = offlineDocumentDelta(this.#document, this.#serverStateVector);
    if (pending) this.#pendingUpdates.enqueue(pending);
    this.#syncCollaborationQueue();
    this.#snapshot = resolveWorkspaceSnapshotAnchors(this.#document, record.snapshot);
    this.#hasBootstrapSnapshot = true;
    this.#collaborationWorkflow.send({ type: "OFFLINE_AVAILABLE", available: true });
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
    if (!this.#offlineStore || !this.#snapshot || !this.#collaborationWorkflow.getSnapshot().context.offlineAvailable) return;
    this.#offlineSaves.schedule(delay);
  }

  async #persistOfflineWorkspace(): Promise<void> {
    if (!this.#offlineStore || !this.#snapshot || !this.#collaborationWorkflow.getSnapshot().context.offlineAvailable) return;
    await this.#offlineStore.save(this.#snapshot, Y.encodeStateAsUpdate(this.#document), this.#serverStateVector);
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
