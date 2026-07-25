import * as Y from "yjs";
import { bibTeXDisplayText } from "../domain/bibliography";
import { buildWorkspaceKnowledgeGraph, isKnowledgeSearchResults, type WorkspaceKnowledgeGraph } from "../domain/knowledge";
import { isCitationNetwork, type CitationNetwork } from "../domain/citation-assertions";
import { isCitationCandidateAcceptance } from "../domain/citation-expansion-acceptance";
import { isCitationExpansionResult } from "../domain/citation-expansion";
import type { CitationExpansionCandidate, CitationExpansionResult } from "../domain/citation-expansion-types";
import { isReferenceDiscoveryResults, type ReferenceDiscoveryQuery, type ReferenceDiscoveryResult } from "../domain/reference-discovery";
import { reviewerResponseLetter, reviewerResponsePath, reviewerResponseTemplate } from "../domain/reviewer-response";
import {
  collaborationProtocolVersion,
  encodeClientSelectionMessage,
  parseServerCollaborationMessage,
  type ServerCollaborationMessage,
} from "../domain/collaboration";
import { resolveManuscriptAnchor } from "../domain/manuscript-anchor";
import {
  isProjectRevisionContent,
  isProjectRevisionDiff,
  isProjectRevisionSummaries,
  type ProjectRevisionContent,
  type ProjectRevisionDiff,
} from "../domain/project-history";
import {
  composeProject,
  projectFileCollaborationTextName,
  previewProjectFile,
  relativeProjectPath,
  resolveProjectPath,
  type CompositionSourceSpan,
  type ProjectComposition,
  type ProjectAsset,
  type ProjectFile,
  type ProjectFilePreview,
} from "../domain/project-files";
import type { Diagnostic, RenderedDocument } from "../domain/markdown";
import { publicationWordStatistics, type PublicationWordStatistics } from "../domain/publication-statistics";
import { suggestCitationKey } from "../domain/publication-intake";
import { isPhrasingPurposeId, phrasingPatternsForPurpose, phrasingPurposes, type PhrasingPurpose } from "../domain/phrasing-guidance";
import { researchQuestionsPath, researchQuestionsTemplate } from "../domain/research-questions";
import { researchDiaryPath, researchDiaryTemplate, summarizeResearchDiary } from "../domain/writing-workflows";
import { isProjectTemplateSummaries, type ProjectTemplateSummary } from "../domain/project-templates";
import {
  isMetadataRefinementPreview,
  isPdfDraftResult,
  isProjectReferencePdfs,
  isReferenceLibrarySnapshot,
  libraryPdfRectsOverlap,
  type BibliographicRecord,
  type LibraryHighlight,
  type LibraryPdfDrawing,
  type LibraryPdfMarkup,
  type LibraryPdfNote,
  type LibraryPdfPoint,
  type LibraryPdfArtifact,
  type MetadataRefinementCandidate,
  type ProjectReferencePdf,
  type ReferenceLibrarySnapshot,
} from "../domain/reference-library";
import { calculateTextSplice } from "../domain/text";
import { filterReferenceLibrary } from "../domain/reference-filters";
import { ExportStatisticsPanel } from "./export-statistics-panel";
import { EditorInsertMenu, editorInsertActionEvent, type EditorInsertAction, type EditorSyntaxKind } from "./editor-insert-menu";
import { sourceSpanAt } from "./composition-source-map";
import { GitHubConnectionPanel, gitHubDisconnectEvent } from "./github-connection-panel";
import {
  GitHubImportPanel,
  gitHubImportCancelEvent,
  gitHubImportConfirmEvent,
  gitHubImportPreviewEvent,
  gitHubInstallationChangeEvent,
  gitHubRepositoryChangeEvent,
} from "./github-import-panel";
import {
  GitHubSyncMenu,
  gitHubSyncCheckEvent,
  gitHubSyncPullEvent,
  gitHubSyncPushEvent,
  gitHubSyncSettingsEvent,
} from "./github-sync-menu";
import {
  gitHubPublishConfirmEvent,
  gitHubPublishPreviewEvent,
  gitHubPullConfirmEvent,
  gitHubPullPreviewEvent,
  gitHubSyncDisconnectEvent,
} from "./github-sync-review";
import { LatexImportPanel, latexImportActionEvent, type LatexImportAction } from "./latex-import-panel";
import {
  LibraryPdfAnnotationForms,
  libraryPdfAnnotationActionEvent,
  type LibraryPdfAnnotationAction,
} from "./library-pdf-annotation-forms";
import {
  LibraryPdfAnnotationList,
  libraryPdfAnnotationListActionEvent,
  type LibraryPdfAnnotationListAction,
} from "./library-pdf-annotation-list";
import { LibraryPdfAnnotationToolbar, libraryPdfToolbarActionEvent, type LibraryPdfToolbarAction } from "./library-pdf-annotation-toolbar";
import {
  ProjectStartingPointBrowser,
  startingPointActionEvent,
  startingPointProjectLoadEvent,
  startingPointTemplateDeleteEvent,
  type StartingPointAction,
} from "./project-starting-point-browser";
import {
  WorkspaceSharingPanel,
  workspaceSharingActionEvent,
  workspaceSharingCloseEvent,
  workspaceSharingInviteEvent,
  workspaceSharingNoticeEvent,
  type WorkspaceSharingActionDetail,
} from "./workspace-sharing-panel";
import { WorkspaceCatalogPanel, workspaceCatalogCloseEvent } from "./workspace-catalog-panel";
import { WorkspaceLayoutManager } from "./workspace-layout-manager";
import { UnidentifiedPdfList, unidentifiedPdfIdentifyEvent, type UnidentifiedPdfSelection } from "./unidentified-pdf-list";
import {
  LibraryReferenceSummary,
  libraryReferenceSummaryActionEvent,
  type LibraryReferenceSummaryAction,
} from "./library-reference-summary";
import {
  LibraryReferencePersonalFields,
  libraryReferencePersonalActionEvent,
  type LibraryReferencePersonalAction,
} from "./library-reference-personal-fields";
import {
  LibraryReferenceMetadataEditor,
  libraryReferenceMetadataActionEvent,
  type LibraryReferenceMetadataAction,
  type LibraryReferenceMetadataValue,
  type ProviderMetadataSelection,
} from "./library-reference-metadata-editor";
import { LibraryReferencePdfRows, libraryReferencePdfActionEvent, type LibraryReferencePdfAction } from "./library-reference-pdf-rows";
import {
  LibraryReferenceResearchRows,
  libraryReferenceResearchActionEvent,
  type LibraryReferenceResearchAction,
} from "./library-reference-research-rows";
import {
  WorkspaceSettingsPanel,
  workspaceSettingsActionEvent,
  type WorkspaceSettingsAction,
  type WorkspaceSettingsValue,
} from "./workspace-settings-panel";
import {
  researchQuestionWorkflowData,
  reviewerResponseWorkflowData,
  WritingWorkflowPanel,
  writingWorkflowActionEvent,
  type WritingWorkflowActionDetail,
} from "./writing-workflow-panel";
import {
  AssistantResultPanel,
  assistantResultActionEvent,
  referenceDiscoveryIdentifierUrl,
  type AssistantResultActionDetail,
} from "./assistant-result-panel";
import { CandidateReviewPanel, candidateDecisionEvent, candidateEvidenceEvent } from "./candidate-review-panel";
import {
  PublicationContextPanel,
  publicationContextActionEvent,
  type PublicationContextAction,
  type PublicationPaperOption,
} from "./publication-context-panel";
import { isGitHubSyncStatus, type GitHubSyncStatus } from "./github-sync-status";
import { createVimSession, handleVimKey, visualVimSession, type VimSession } from "./vim-keybindings";
import {
  defaultProjectPublicationProfile,
  isModelCandidate,
  isWorkspaceSnapshot,
  isWorkspaceMembers,
  isWorkspaceSummaries,
  isPublicationIntakePreview,
  type AnnotationResource,
  type ClaimEvidenceRelation,
  type ClaimPassageLink,
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
import { CoalescedRefresh, PendingUpdateQueue } from "./collaboration";
import {
  collaborationCanEdit,
  collaborationStable,
  collaborationStatus,
  collaborationSynced,
  createCollaborationWorkflowActor,
} from "./collaboration-workflow-machine";
import {
  assistantOperationDefinition,
  assistantTargetScopeLabel,
  resolveAssistantTarget,
  type AssistantTargetScope,
} from "./assistant-operations";
import { AssistantTaskPanel, assistantTaskChangeEvent, assistantTaskGenerateEvent, type AssistantTaskChange } from "./assistant-task-panel";
import { assistantWorkflowBusy, createAssistantWorkflowActor } from "./assistant-workflow-machine";
import {
  citationContextAtPosition,
  citationKeysAtPosition,
  citationPageFromLocator,
  createCitationInsertion,
  parseCitationKeys,
} from "./citations";
import { editorHistoryActionForInput, editorHistoryActionForKey, type EditorHistoryAction } from "./editor-history";
import { manipulateRecognizedShape, recognizeDrawnShape, type RecognizedDrawnShape } from "./drawn-shape-recognition";
import { loadMarkdownRuntime, type MarkdownRuntime } from "./markdown-runtime";
import { createMetadataRefinementActor } from "./metadata-refinement-machine";
import { ProjectMapPanel, projectMapSelectEvent } from "./project-map-panel";
import { KnowledgeSearchPanel, knowledgeSearchEvent, knowledgeSearchSelectEvent } from "./knowledge-search-panel";
import { KnowledgeConnectionsPanel, knowledgeConnectionSelectEvent } from "./knowledge-connections-panel";
import { ClaimListPanel, claimListActionEvent, type ClaimListAction } from "./claim-list-panel";
import { ClaimDialog, claimDialogSaveEvent, type ClaimDialogSave } from "./claim-dialog";
import {
  ManuscriptCommentList,
  manuscriptCommentActionEvent,
  manuscriptCommentCreateEvent,
  type ManuscriptCommentAction,
} from "./manuscript-comment-list";
import { PublicationListPanel, publicationListActionEvent, type PublicationListAction } from "./publication-list-panel";
import { CandidateListPanel, candidateListOpenEvent } from "./candidate-list-panel";
import { ContextTabOverview, contextTabOverviewActionEvent, type ContextTabOverviewAction } from "./context-tab-overview";
import {
  ContextResourceTabs,
  contextResourceTabActionEvent,
  contextResourceTabId,
  type ContextResourceTabAction,
} from "./context-resource-tabs";
import { ProjectEvidencePanel, projectEvidenceActionEvent, type ProjectEvidenceAction } from "./project-evidence-panel";
import { ProjectAnnotationForm, projectAnnotationSaveEvent, type ProjectAnnotationSave } from "./project-annotation-form";
import {
  ProjectFileDialog,
  projectFileDialogIsCreating,
  projectFileDialogIsFolder,
  projectFileSaveEvent,
  type ProjectFileDialogMode,
  type ProjectFileSave,
} from "./project-file-dialog";
import { ProjectTemplateSaveDialog, projectTemplateSaveEvent, type ProjectTemplateSave } from "./project-template-save-dialog";
import { ProjectTreePanel, projectTreeActionEvent, type ProjectTreeAction } from "./project-tree-panel";
import { ManuscriptMapPanel, manuscriptMapSelectEvent, type ManuscriptMapSelection } from "./manuscript-map-panel";
import { LibraryDiscoveryResults, libraryDiscoverySaveEvent, type LibraryDiscoverySaveDetail } from "./library-discovery-results";
import { LibraryDiscoverySearch, libraryDiscoverySearchEvent } from "./library-discovery-search";
import { ReferenceLibraryFilterPanel, referenceLibraryFilterChangeEvent } from "./reference-library-filters";
import { LibraryPdfUploadStatus, libraryPdfUploadRetryEvent, libraryPdfUploadRevealEvent } from "./library-pdf-upload-status";
import { ModelProviderSettings, modelProviderChangeEvent, modelProviderDiscoveryEvent } from "./model-provider-settings";
import { WebSnapshotComparisonPanel, WebSourceCapture, webSourceCaptureEvent } from "./web-source-panels";
import { CitationNetworkPanel, citationNetworkActionEvent, type CitationNetworkAction } from "./citation-network-panel";
import {
  PreviewContextStatus,
  PreviewDiagnosticsPanel,
  previewDiagnosticSelectEvent,
  type PreviewDiagnosticSelection,
} from "./preview-presentation";
import { PublicationIntakePanel, publicationIntakeActionEvent, type PublicationIntakeAction } from "./publication-intake-panel";
import { accessibleEvidenceExcerpt, anchorActionLabel, anchorMatchState, modelEvidenceKey } from "./research-resource-presentation";
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
import { createPdfAnnotationActor, pdfAnnotationTool, type PdfAnnotationSnapshot, type PdfAnnotationTool } from "./pdf-annotation-machine";
import { createPublicationIntakeActor, publicationIntakeBusy } from "./publication-intake-machine";
import { extractPdfMetadata, type PdfMetadataCandidates } from "./pdf-metadata";
import { detectImportedPdfHighlights } from "./pdf-highlight-import";
import {
  PdfHighlightImportPanel,
  pdfHighlightImportActionEvent,
  type PdfHighlightImportAction,
  type ReviewedPdfHighlightImport,
} from "./pdf-highlight-import-panel";
import { uploadPdfBatch, type ExistingPdfUpload } from "./pdf-upload-queue";
import { bindThemePreference } from "./theme";
import {
  isCreatedAnnotation,
  isGitHubBranchList,
  isGitHubConnectionState,
  isGitHubImportPreview,
  isGitHubInstallationList,
  isGitHubPublishPreview,
  isGitHubPullPreview,
  isGitHubRepositoryList,
  isGitHubSyncState,
  isLatexImportPreview,
  isShareLinkStatus,
  isWebSnapshotComparisonResponse,
  type LatexImportPreview,
} from "./app-contracts";
import {
  discoverOpenAICompatibleModels,
  maximumModelEvidenceItems,
  OpenAICompatibleBrowserProvider,
  type ModelClarityQuestion,
  type ModelClarityRewrites,
  type ModelIdeas,
  type ModelPhrasingAlternatives,
  type ModelTable,
  type ModelEvidenceItem,
} from "./model-provider";
import { parseTableRequirements, tableMarkdown, type TableRequirements } from "./structured-syntax";
import { createProjectHistoryActor, projectHistoryBusy, type ProjectHistoryOperation } from "./project-history-machine";
import { ProjectHistoryPanel, projectHistoryActionEvent, projectHistoryCloseEvent } from "./project-history-panel";
import { previewOffsetsForSourceLocation, sourceLocationForPreviewOffset } from "./source-preview-sync";
import { previewNavigationPresentation, previewNavigationStorageKey, storedPreviewNavigationHidden } from "./preview-navigation";
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
import { editorPresenceSegments, type EditorPresenceRange } from "./editor-presence";
import {
  citationCompletionContext,
  rankCitationCompletionCandidates,
  type CitationCompletionCandidate,
  type CitationCompletionContext,
} from "./citation-completions";
import {
  includeCompletionContext,
  rankIncludeCompletionCandidates,
  type IncludeCompletionCandidate,
  type IncludeCompletionContext,
} from "./include-completions";

type GuardResult<T> = T extends (value: unknown) => value is infer Result ? Result : never;
type GitHubSyncConnection = GuardResult<typeof isGitHubSyncState>;

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

function projectFileSavedMessage(mode: ProjectFileDialogMode, path: string): string {
  if (mode === "create-folder") return `Added ${path}.`;
  if (mode === "rename-folder") return `Moved folder to ${path}; project paths and includes were updated.`;
  if (mode === "create-and-include") return `Created ${path} and included it at the remembered caret.`;
  if (mode === "create") return `Added ${path}.`;
  return `Renamed file to ${path}; inbound includes were updated.`;
}

function contextTabFocusIndex(key: string, currentIndex: number, tabCount: number): number | null {
  if (key === "ArrowRight") return (currentIndex + 1) % tabCount;
  if (key === "ArrowLeft") return (currentIndex - 1 + tabCount) % tabCount;
  if (key === "Home") return 0;
  if (key === "End") return tabCount - 1;
  return null;
}

function libraryPdfUploadMessage(added: number, existing: number, failed: number): string {
  const addedLabel = `${added} PDF${added === 1 ? "" : "s"} added`;
  const existingLabel = `${existing} already in library`;
  if (failed > 0) return `${addedLabel}; ${existingLabel}; ${failed} failed.`;
  if (existing > 0) return `${addedLabel}; ${existingLabel}.`;
  return `${addedLabel}. Add metadata when ready.`;
}

const workspaceId = readWorkspaceId();
const identityEmail = readIdentityEmail();
const appMode = readAppMode();
const catalogBase = "/api/workspaces";
const apiBase = `${catalogBase}/${workspaceId}`;
const remoteOrigin = Symbol("remote");
const offlineOrigin = Symbol("offline");
const modelPreferencesStorageKey = "kirjolab:model-preferences";
const citationCompletionScopeStorageKey = "kirjolab:citation-completion-scope";
const deferredDeleteGraceMs = 6_000;

interface ToastAction {
  readonly label: string;
  readonly run: () => void;
  readonly durationMs?: number;
  readonly persistent?: boolean;
}

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

interface Elements {
  preferencesMenu: HTMLDetailsElement;
  modelProviderSettings: ModelProviderSettings;
  applicationVersion: HTMLElement;
  copyApplicationVersion: HTMLButtonElement;
  citationCompletionScope: HTMLSelectElement;
  chooseModelEvidence: HTMLButtonElement;
  openPreferencesFromAssistant: HTMLButtonElement;
  collaboratorSelections: HTMLElement;
  workspaceSwitcher: HTMLSelectElement;
  workspaceLayout: HTMLSelectElement;
  manageWorkspaces: HTMLButtonElement;
  workspaceSettings: HTMLButtonElement;
  workspaceSettingsPanel: WorkspaceSettingsPanel;
  workspaceCatalogDialog: HTMLDialogElement;
  workspaceCatalogPanel: WorkspaceCatalogPanel;
  newWorkspace: HTMLButtonElement;
  newWorkspaceDialog: HTMLDialogElement;
  newWorkspaceStartingPoints: ProjectStartingPointBrowser;
  latexImportDialog: HTMLDialogElement;
  latexImportPanel: LatexImportPanel;
  gitHubImportDialog: HTMLDialogElement;
  gitHubConnectionPanel: GitHubConnectionPanel;
  gitHubImportPanel: GitHubImportPanel;
  gitHubSyncMenu: GitHubSyncMenu;
  saveTemplateDialog: ProjectTemplateSaveDialog;
  shareWorkspace: HTMLButtonElement;
  shareWorkspaceDialog: HTMLDialogElement;
  workspaceSharingPanel: WorkspaceSharingPanel;
  referenceLibraryList: HTMLElement;
  libraryDiscoverySearch: LibraryDiscoverySearch;
  libraryDiscoveryResults: LibraryDiscoveryResults;
  libraryBibliographyUpload: HTMLInputElement;
  libraryCslUpload: HTMLInputElement;
  libraryArchiveUpload: HTMLInputElement;
  libraryPdfUpload: HTMLInputElement;
  libraryPdfDropzone: HTMLElement;
  libraryPdfUploadStatus: LibraryPdfUploadStatus;
  showArchivedReferences: HTMLButtonElement;
  referenceLibraryFilters: ReferenceLibraryFilterPanel;
  openCitationNetwork: HTMLButtonElement;
  citationNetwork: HTMLElement;
  closeCitationNetwork: HTMLButtonElement;
  filterProjectCitations: HTMLButtonElement;
  citationNetworkPanel: CitationNetworkPanel;
  webSourceCapture: WebSourceCapture;
  webSnapshotComparison: WebSnapshotComparisonPanel;
  unidentifiedPdfList: UnidentifiedPdfList;
  showFilesRail: HTMLButtonElement;
  showResearchRail: HTMLButtonElement;
  showCommentsRail: HTMLButtonElement;
  showGuideRail: HTMLButtonElement;
  filesRailPanel: HTMLElement;
  researchRailPanel: HTMLElement;
  commentsRailPanel: HTMLElement;
  guideRailPanel: HTMLElement;
  manuscriptMapPanel: ManuscriptMapPanel;
  researchDiaryEntryCount: HTMLElement;
  researchDiarySummary: HTMLElement;
  openResearchDiary: HTMLButtonElement;
  researchQuestionPanel: WritingWorkflowPanel;
  reviewerResponsePanel: WritingWorkflowPanel;
  newProjectFileRail: HTMLButtonElement;
  newProjectFolderRail: HTMLButtonElement;
  uploadProjectImages: HTMLButtonElement;
  projectImageUpload: HTMLInputElement;
  projectTreePanel: ProjectTreePanel;
  newProjectFile: HTMLButtonElement;
  createAndIncludeProjectFile: HTMLButtonElement;
  renameProjectFile: HTMLButtonElement;
  deleteProjectFile: HTMLButtonElement;
  projectFileDialog: ProjectFileDialog;
  openProjectHistory: HTMLButtonElement;
  openExport: HTMLButtonElement;
  exportDialog: HTMLDialogElement;
  closeExport: HTMLButtonElement;
  exportStatistics: ExportStatisticsPanel;
  wordCountBadge: HTMLButtonElement;
  projectHistoryDialog: HTMLDialogElement;
  projectHistoryPanel: ProjectHistoryPanel;
  source: HTMLTextAreaElement;
  sourceHighlight: HTMLElement;
  sourceEditorShell: HTMLElement;
  sourceCompletion: HTMLElement;
  showWriteMode: HTMLButtonElement;
  showMapMode: HTMLButtonElement;
  editorWriteActions: HTMLElement;
  projectMap: HTMLElement;
  projectMapTotal: HTMLElement;
  projectMapPanel: ProjectMapPanel;
  projectMapOverview: HTMLElement;
  vimModeStatus: HTMLElement;
  vimToggle: HTMLButtonElement;
  editorInsertMenu: EditorInsertMenu;
  bibliography: HTMLTextAreaElement;
  manuscriptCommentCount: HTMLElement;
  manuscriptCommentListPanel: ManuscriptCommentList;
  workspaceSurfaces: HTMLElement;
  collapseSourceRail: HTMLButtonElement;
  expandSourceRail: HTMLButtonElement;
  sourceRailResizer: HTMLElement;
  authoringContextResizer: HTMLElement;
  previewSyncControls: HTMLElement;
  syncPreviewFromSource: HTMLButtonElement;
  syncSourceFromPreview: HTMLButtonElement;
  showAuthoringSurface: HTMLButtonElement;
  showContextSurface: HTMLButtonElement;
  openSourceCitation: HTMLButtonElement;
  contextTabList: HTMLElement;
  contextPreviewTab: HTMLButtonElement;
  contextLibraryTab: HTMLButtonElement;
  contextAssistantTab: HTMLButtonElement;
  contextResourceTabsPanel: ContextResourceTabs;
  contextTabOverviewPanel: ContextTabOverview;
  previewContextControls: PreviewContextStatus;
  togglePreviewNavigation: HTMLButtonElement;
  restorePreviewNavigation: HTMLButtonElement;
  previewNavigationToggleLabel: HTMLElement;
  pdfContextControls: HTMLElement;
  contextPreviewPanel: HTMLElement;
  previewScroll: HTMLElement;
  contextLibraryPanel: HTMLElement;
  contextLibraryScroll: HTMLElement;
  contextAssistantPanel: HTMLElement;
  contextAssistantScroll: HTMLElement;
  contextPublicationPanel: HTMLElement;
  publicationContextPanel: PublicationContextPanel;
  contextPdfPanel: HTMLElement;
  contextCandidatePanel: HTMLElement;
  candidateReviewPanel: CandidateReviewPanel;
  preview: HTMLElement;
  diagnostics: PreviewDiagnosticsPanel;
  connectionDot: HTMLElement;
  connectionStatus: HTMLElement;
  editorTargetStatus: HTMLElement;
  saveStatus: HTMLElement;
  revisionBadge: HTMLElement;
  pdfUpload: HTMLInputElement;
  projectEvidencePanel: ProjectEvidencePanel;
  knowledgeSearchPanel: KnowledgeSearchPanel;
  publicationCount: HTMLElement;
  publicationListPanel: PublicationListPanel;
  claimCount: HTMLElement;
  claimListPanel: ClaimListPanel;
  newClaim: HTMLButtonElement;
  claimDialog: ClaimDialog;
  knowledgeConnectionsPanel: KnowledgeConnectionsPanel;
  projectAnnotationForm: ProjectAnnotationForm;
  annotationComposer: HTMLElement;
  libraryHighlightComposer: HTMLElement;
  closeLibraryPdfInspector: HTMLButtonElement;
  libraryAnnotationDetails: HTMLDetailsElement;
  pdfHighlightImportPanel: PdfHighlightImportPanel;
  libraryPdfAnnotationForms: LibraryPdfAnnotationForms;
  libraryPdfAnnotationToolbar: LibraryPdfAnnotationToolbar;
  libraryHighlightStatus: HTMLElement;
  libraryProjectUse: HTMLElement;
  libraryHighlightList: LibraryPdfAnnotationList;
  highlightPaintTool: HTMLButtonElement;
  highlightEraserTool: HTMLButtonElement;
  undoHighlight: HTMLButtonElement;
  citeActivePdf: HTMLButtonElement;
  paperStatus: HTMLElement;
  paperCanvas: HTMLCanvasElement;
  paperPage: HTMLElement;
  paperLinks: HTMLElement;
  paperTextLayer: HTMLElement;
  paperHighlights: HTMLElement;
  paperMarkups: HTMLElement;
  paperPageIndicator: HTMLElement;
  paperReader: HTMLElement;
  previousPaperPage: HTMLButtonElement;
  nextPaperPage: HTMLButtonElement;
  libraryPaperPageIndicator: HTMLElement;
  previousLibraryPaperPage: HTMLButtonElement;
  nextLibraryPaperPage: HTMLButtonElement;
  publicationIntakePanel: PublicationIntakePanel;
  assistantTaskPanel: AssistantTaskPanel;
  assistantInteractiveResult: AssistantResultPanel;
  assistantPhrasingAttribution: HTMLDetailsElement;
  modelStatus: HTMLElement;
  candidateListPanel: CandidateListPanel;
  toast: HTMLElement;
}

type RemoteCollaboratorSelection = Extract<ServerCollaborationMessage, { type: "selection" }>;

interface RelativeEditorSelection {
  readonly text: Y.Text;
  readonly textarea: HTMLTextAreaElement;
  readonly start: Y.RelativePosition;
  readonly end: Y.RelativePosition;
  readonly direction: "forward" | "backward" | "none" | null;
}

interface AuthoringPassage {
  readonly fileId: string;
  readonly start: number;
  readonly end: number;
  readonly excerpt: string;
}

interface ResolvedAuthoringTarget {
  readonly start: number;
  readonly end: number;
}

interface AssistantDraftContext {
  readonly passage: AuthoringPassage;
  readonly evidence: { readonly items: ModelEvidenceItem[]; readonly references: ModelEvidenceReference[] };
  readonly instruction: string;
  readonly sourceRevision: number;
}

interface AssistantGenerationContext {
  readonly provider: OpenAICompatibleBrowserProvider;
  readonly operation: ReturnType<typeof assistantOperationDefinition>;
  readonly passage: AuthoringPassage | null;
  readonly evidence: { items: ModelEvidenceItem[]; references: ModelEvidenceReference[] };
  readonly annotationItems: ModelEvidenceItem[];
  readonly annotationReferences: ModelEvidenceReference[];
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

type PendingPdfNote = PdfAnnotationSnapshot["context"]["note"];

interface OverlappingPdfFragment {
  readonly annotation: AnnotationResource;
  readonly fragment: AnnotationResource["fragments"][number];
}

interface ClarityDrillContext extends AssistantDraftContext {
  readonly provider: OpenAICompatibleBrowserProvider;
  readonly question: ModelClarityQuestion;
}

type AssistantResultContext =
  | { readonly input: AssistantDraftContext; readonly kind: "revision" }
  | { readonly input: ClarityDrillContext; readonly kind: "clarity-question" }
  | { readonly kind: "table"; readonly sourceRevision: number; readonly target: AuthoringPassage };

class WorkspaceApp {
  readonly #elements = collectElements();
  readonly #pdfViewer: PdfEvidenceViewer;
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
  readonly #pdfAnnotation = createPdfAnnotationActor();
  readonly #assistantWorkflow = createAssistantWorkflowActor();
  #assistantResultContext: AssistantResultContext | null = null;
  readonly #publicationIntake = createPublicationIntakeActor();
  readonly #collaborationWorkflow = createCollaborationWorkflowActor();
  readonly #metadataRefinement = createMetadataRefinementActor();
  readonly #projectHistoryWorkflow = createProjectHistoryActor();
  #snapshot: WorkspaceSnapshot | null = null;
  #revision = 0;
  #socket: WebSocket | null = null;
  #serverDocument: Y.Doc | null = null;
  #serverStateVector = Y.encodeStateVector(this.#document);
  #reconnectTimer: number | undefined;
  #selectionBroadcastTimer: number | undefined;
  readonly #remoteSelections = new Map<string, RemoteCollaboratorSelection>();
  #renderSourceEditorHighlight: () => void = () => undefined;
  #modelDiscoveryBusy = false;
  #hasBootstrapSnapshot = false;
  #toastTimer: number | undefined;
  #applicationUpdateAvailable = false;
  readonly #hiddenProjectFileIds = new Set<string>();
  readonly #hiddenProjectFolderIds = new Set<string>();
  readonly #hiddenProjectImageIds = new Set<string>();
  readonly #pendingDeletions = new Map<string, PendingDeletion>();
  #editingAnnotationId: string | null = null;
  #highlightTool: "paint" | "erase" = "paint";
  #lastHighlightStroke: { annotationId: string; fragmentId: string } | null = null;
  #renderedPdfId: string | undefined;
  #renderedPdfContextKey: ResearchContextKey | undefined;
  #contextState: ResearchContextState = createResearchContext();
  #authoringSelection: RelativeEditorSelection | null = null;
  #modelEvidenceSelection = new Set<string>();
  #activeFileId: string | null = null;
  #activeFileText = this.#source;
  readonly #editorUndoManagers = new Map<Y.Text, Y.UndoManager>();
  #unbindSourceEditor: () => void = () => undefined;
  #unbindAssistantSourceStale: () => void = () => undefined;
  #projectFileDialogMode: ProjectFileDialogMode = "create";
  #projectFolderId: string | null = null;
  #projectFileIncludeTarget: RelativeEditorSelection | null = null;
  #projectFileIncludeFromPath: string | null = null;
  #librarySnapshot: ReferenceLibrarySnapshot | null = null;
  #projectReferencePdfs: readonly ProjectReferencePdf[] = [];
  readonly #expandedLibraryReferences = new Set<string>();
  #libraryPdfUploadBusy = false;
  #pdfDrawingDraftLine: SVGElement | null = null;
  #pdfDrawingShape: RecognizedDrawnShape | null = null;
  #pdfDrawingShapeTimer: number | undefined;
  #libraryHighlightRects: PdfSelectionCapture["rects"] = [];
  #editingLibraryHighlightId: string | null = null;
  #pdfHighlightDetectionArtifactId: string | null = null;
  #failedLibraryPdfUploads: readonly File[] = [];
  #showArchivedReferences = false;
  #citationNetwork: CitationNetwork | null = null;
  #citationExpansion: CitationExpansionResult | null = null;
  #filterProjectCitations = false;
  #wordStatistics: PublicationWordStatistics | null = null;
  #workspaceCatalog: WorkspaceSummary[] = [];
  #gitHubImportPreviewId: string | null = null;
  #gitHubPullPreviewId: string | null = null;
  #gitHubPublishPreviewId: string | null = null;
  #gitHubPickerRequest = 0;
  #gitHubSyncRequest = 0;
  #gitHubSyncCheckedAt = 0;
  #projectTemplates: ProjectTemplateSummary[] = [];
  readonly #hiddenProjectTemplateIds = new Set<string>();
  #previewRenderVersion = 0;
  #previewSourceMap: readonly CompositionSourceSpan[] = [];
  #previewSyncHighlightTimer: number | undefined;
  #offlineSaveTimer: number | undefined;
  #offlineSaveVersion = 0;
  #offlineSaveChain: Promise<void> = Promise.resolve();
  #workspaceRouteReady = false;
  #citationCompletionContext: CitationCompletionContext | null = null;
  #citationCompletionCandidates: readonly CitationCompletionCandidate[] = [];
  #includeCompletionContext: IncludeCompletionContext | null = null;
  #includeCompletionCandidates: readonly IncludeCompletionCandidate[] = [];
  #sourceCompletionKind: "citation" | "include" | null = null;
  #sourceCompletionIndex = 0;
  #citationLibraryRequest = 0;
  #citationLibraryLoading = false;
  readonly #layout: WorkspaceLayoutManager;

  constructor() {
    this.#pdfViewer = new PdfEvidenceViewer(
      {
        reader: this.#elements.paperReader,
        canvas: this.#elements.paperCanvas,
        page: this.#elements.paperPage,
        links: this.#elements.paperLinks,
        textLayer: this.#elements.paperTextLayer,
        highlights: this.#elements.paperHighlights,
        pageIndicators: [this.#elements.paperPageIndicator, this.#elements.libraryPaperPageIndicator],
        previousPages: [this.#elements.previousPaperPage, this.#elements.previousLibraryPaperPage],
        nextPages: [this.#elements.nextPaperPage, this.#elements.nextLibraryPaperPage],
        status: this.#elements.paperStatus,
      },
      (capture) => this.#capturePdfSelection(capture),
      (annotationId, fragmentId) => void this.#activateHighlightFragment(annotationId, fragmentId),
      (page) => this.#handlePdfPageChange(page),
      (highlightId) => this.#selectLibraryHighlight(highlightId),
    );
    this.#layout = new WorkspaceLayoutManager(
      {
        authoringContextResizer: this.#elements.authoringContextResizer,
        collapseSourceRail: this.#elements.collapseSourceRail,
        expandSourceRail: this.#elements.expandSourceRail,
        sourceRailResizer: this.#elements.sourceRailResizer,
        workspaceSurfaces: this.#elements.workspaceSurfaces,
      },
      {
        paneStorageKey: () => `kirjolab:authoring-pane:${workspaceId}:${this.#activeResourceTab()?.kind ?? "preview"}`,
        resizePdf: () => void this.#pdfViewer.resize(),
      },
    );
  }

  #pdfAnnotationSnapshot(): PdfAnnotationSnapshot {
    return this.#pdfAnnotation.getSnapshot();
  }

  #libraryPdfTool(): PdfAnnotationTool {
    return pdfAnnotationTool(this.#pdfAnnotationSnapshot());
  }

  #pendingPdfNote() {
    return this.#pdfAnnotationSnapshot().context.note;
  }

  #pdfDrawingDraft(): readonly LibraryPdfPoint[] | null {
    return this.#pdfAnnotationSnapshot().context.drawing?.points ?? null;
  }

  #pdfDrawingPointer(): number | null {
    return this.#pdfAnnotationSnapshot().context.drawing?.pointerId ?? null;
  }

  #pdfNoteDrag() {
    return this.#pdfAnnotationSnapshot().context.noteDrag;
  }

  #selectedLibraryPdfMarkupId(): string | null {
    return this.#pdfAnnotationSnapshot().context.selectedMarkupId;
  }

  #selectedLibraryHighlightId(): string | null {
    return this.#pdfAnnotationSnapshot().context.selectedHighlightId;
  }

  async start(): Promise<void> {
    this.#elements.applicationVersion.textContent = applicationVersion;
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
    this.#restorePreviewNavigation();
    this.#restoreModelPreferences();
    this.#restoreCitationCompletionScope();
    this.#elements.copyApplicationVersion.addEventListener("click", () => {
      void copyText(applicationVersion)
        .then(() => this.#showToast(`Copied application version ${applicationVersion}.`))
        .catch(() => this.#showToast("Could not copy the application version"));
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
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      for (const menu of document.querySelectorAll<HTMLDetailsElement>("details[data-action-menu][open]")) {
        if (!menu.contains(event.target) || event.target.closest("button, a")) menu.open = false;
      }
      const settings = document.querySelector<HTMLDetailsElement>("details[data-settings-menu][open]");
      if (settings && !settings.contains(event.target)) settings.open = false;
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const openMenus = Array.from(
        document.querySelectorAll<HTMLDetailsElement>("details[data-action-menu][open], details[data-settings-menu][open]"),
      );
      const menu = openMenus.at(-1);
      if (!menu) return;
      menu.open = false;
      menu.querySelector<HTMLElement>("summary")?.focus();
      event.preventDefault();
    });
    document.addEventListener("keydown", (event) => {
      if (
        appMode !== "workspace" ||
        event.defaultPrevented ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "p" ||
        document.querySelector("dialog[open]")
      ) {
        return;
      }
      event.preventDefault();
      this.#layout.setRailCollapsed(false);
      this.#showRail("files");
      this.#elements.projectTreePanel.focusFilter();
    });
    this.#elements.workspaceSwitcher.addEventListener("change", () => {
      const selected = this.#elements.workspaceSwitcher.value;
      if (selected && selected !== workspaceId) location.assign(`/editor/${encodeURIComponent(selected)}`);
    });
    this.#elements.workspaceLayout.addEventListener("change", () => void this.#setWorkspaceLayout(this.#elements.workspaceLayout.value));
    this.#elements.manageWorkspaces.addEventListener("click", () => {
      this.#elements.workspaceCatalogDialog.showModal();
      void this.#elements.workspaceCatalogPanel.resetFilter();
    });
    this.#elements.workspaceSettings.addEventListener("click", () => void this.#openWorkspaceSettings());
    this.#elements.workspaceSettingsPanel.addEventListener(
      workspaceSettingsActionEvent,
      (event) => void this.#handleWorkspaceSettingsAction((event as CustomEvent<WorkspaceSettingsAction>).detail),
    );
    this.#elements.workspaceCatalogPanel.addEventListener(workspaceCatalogCloseEvent, () => this.#elements.workspaceCatalogDialog.close());
    this.#elements.newWorkspace.addEventListener("click", () => void this.#openNewWorkspace());
    this.#elements.newWorkspaceDialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = [
        ...this.#elements.newWorkspaceDialog.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], summary",
        ),
      ].filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
      }
    });
    this.#elements.newWorkspaceDialog.addEventListener("close", () => {
      if (document.querySelector("dialog[open]")) return;
      this.#elements.newWorkspace.closest("details")?.querySelector<HTMLElement>("summary")?.focus();
    });
    this.#elements.newWorkspaceStartingPoints.addEventListener(startingPointActionEvent, (event) => {
      const action = (event as CustomEvent<StartingPointAction>).detail;
      if (action.action === "create") void this.#createWorkspace(action);
      else if (action.action === "import-latex") this.#openLatexImportDialog();
      else if (action.action === "import-github") this.#openGitHubImportDialog();
      else this.#elements.newWorkspaceDialog.close();
    });
    this.#elements.newWorkspaceStartingPoints.addEventListener(startingPointProjectLoadEvent, (event) => {
      void this.#loadProjectStartingPoint((event as CustomEvent<WorkspaceSummary>).detail);
    });
    this.#elements.newWorkspaceStartingPoints.addEventListener(startingPointTemplateDeleteEvent, (event) => {
      this.#deleteProjectTemplate((event as CustomEvent<ProjectTemplateSummary>).detail);
    });
    this.#elements.latexImportPanel.addEventListener(latexImportActionEvent, (event) => {
      const action = (event as CustomEvent<LatexImportAction>).detail;
      if (action.action === "cancel") this.#elements.latexImportDialog.close();
      else if (action.action === "preview") void this.#previewLatexImport(action.archive, action.root);
      else void this.#confirmLatexImport(action);
    });
    this.#elements.gitHubImportPanel.addEventListener(gitHubImportPreviewEvent, () => void this.#previewGitHubImport());
    this.#elements.gitHubImportPanel.addEventListener(gitHubImportCancelEvent, () => this.#elements.gitHubImportDialog.close());
    this.#elements.gitHubImportPanel.addEventListener(gitHubInstallationChangeEvent, () => void this.#loadGitHubRepositories());
    this.#elements.gitHubImportPanel.addEventListener(gitHubRepositoryChangeEvent, () => void this.#loadGitHubBranches());
    this.#elements.gitHubImportPanel.addEventListener(gitHubImportConfirmEvent, () => void this.#confirmGitHubImport());
    this.#elements.gitHubConnectionPanel.addEventListener(gitHubDisconnectEvent, () => void this.#disconnectGitHubAccount());
    this.#elements.workspaceSettingsPanel.addEventListener(gitHubPullPreviewEvent, () => void this.#previewGitHubPull());
    this.#elements.workspaceSettingsPanel.addEventListener(gitHubPullConfirmEvent, () => void this.#confirmGitHubPull());
    this.#elements.workspaceSettingsPanel.addEventListener(gitHubPublishPreviewEvent, () => void this.#previewGitHubPublish());
    this.#elements.workspaceSettingsPanel.addEventListener(gitHubPublishConfirmEvent, () => void this.#confirmGitHubPublish());
    this.#elements.workspaceSettingsPanel.addEventListener(gitHubSyncDisconnectEvent, () => void this.#disconnectGitHub());
    this.#elements.gitHubSyncMenu.addEventListener(gitHubSyncCheckEvent, () => void this.#refreshGitHubSyncState(true));
    this.#elements.gitHubSyncMenu.addEventListener(gitHubSyncPullEvent, () => {
      void this.#openWorkspaceSettings(false).then(() => this.#previewGitHubPull());
    });
    this.#elements.gitHubSyncMenu.addEventListener(gitHubSyncPushEvent, () => {
      void this.#openWorkspaceSettings(false).then(() => this.#previewGitHubPublish());
    });
    this.#elements.gitHubSyncMenu.addEventListener(gitHubSyncSettingsEvent, () => void this.#openWorkspaceSettings());
    const githubResult = new URL(location.href).searchParams.get("github");
    if (githubResult === "connected" || githubResult === "installed") {
      this.#openGitHubImportDialog();
      history.replaceState(history.state, "", location.pathname);
    }
    this.#elements.saveTemplateDialog.addEventListener(
      projectTemplateSaveEvent,
      (event) => void this.#saveProjectTemplate((event as CustomEvent<ProjectTemplateSave>).detail),
    );
    this.#elements.showFilesRail.addEventListener("click", () => this.#showRail("files"));
    this.#elements.showResearchRail.addEventListener("click", () => this.#showRail("research"));
    this.#elements.showCommentsRail.addEventListener("click", () => this.#showRail("comments"));
    this.#elements.showGuideRail.addEventListener("click", () => this.#showRail("guide"));
    this.#elements.openResearchDiary.addEventListener("click", () => void this.#openResearchDiary());
    this.#elements.manuscriptMapPanel.addEventListener(manuscriptMapSelectEvent, (event) => {
      const { from, to } = (event as CustomEvent<ManuscriptMapSelection>).detail;
      this.#focusComposedRange(from, to);
    });
    for (const panel of [this.#elements.researchQuestionPanel, this.#elements.reviewerResponsePanel]) {
      panel.addEventListener(writingWorkflowActionEvent, (event) => {
        void this.#handleWritingWorkflowAction((event as CustomEvent<WritingWorkflowActionDetail>).detail);
      });
    }
    this.#elements.shareWorkspace.addEventListener("click", () => void this.#openSharing());
    this.#elements.workspaceSharingPanel.addEventListener(workspaceSharingCloseEvent, () => this.#elements.shareWorkspaceDialog.close());
    this.#elements.workspaceSharingPanel.addEventListener(workspaceSharingInviteEvent, (event) => {
      void this.#inviteMember((event as CustomEvent<string>).detail);
    });
    this.#elements.workspaceSharingPanel.addEventListener(workspaceSharingActionEvent, (event) => {
      void this.#handleShareAction((event as CustomEvent<WorkspaceSharingActionDetail>).detail);
    });
    this.#elements.workspaceSharingPanel.addEventListener(workspaceSharingNoticeEvent, (event) => {
      this.#showToast((event as CustomEvent<string>).detail);
    });
    this.#elements.contextLibraryTab.addEventListener("click", () => void this.#openReferenceLibrary());
    this.#elements.libraryDiscoverySearch.addEventListener(
      libraryDiscoverySearchEvent,
      (event) => void this.#discoverLibraryReferences((event as CustomEvent<ReferenceDiscoveryQuery>).detail),
    );
    this.#elements.libraryDiscoveryResults.addEventListener(libraryDiscoverySaveEvent, (event) => {
      const { index, result } = (event as CustomEvent<LibraryDiscoverySaveDetail>).detail;
      void this.#saveLibraryDiscoveredReference(result, index);
    });
    this.#elements.libraryBibliographyUpload.addEventListener("change", () => void this.#importIntoReferenceLibrary());
    this.#elements.libraryCslUpload.addEventListener("change", () => void this.#importCslJson());
    this.#elements.libraryArchiveUpload.addEventListener("change", () => void this.#importLibraryArchive());
    this.#elements.libraryPdfUpload.addEventListener("change", () => {
      void this.#uploadLibraryPdfs(Array.from(this.#elements.libraryPdfUpload.files ?? []));
    });
    this.#elements.libraryPdfDropzone.addEventListener("dragover", (event) => {
      if (this.#libraryPdfUploadBusy || !event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      this.#elements.libraryPdfDropzone.dataset.dragging = "true";
    });
    this.#elements.libraryPdfDropzone.addEventListener("dragleave", () => {
      delete this.#elements.libraryPdfDropzone.dataset.dragging;
    });
    this.#elements.libraryPdfDropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      delete this.#elements.libraryPdfDropzone.dataset.dragging;
      if (this.#libraryPdfUploadBusy) {
        this.#showToast("Finish the current PDF batch before adding another.");
        return;
      }
      void this.#uploadLibraryPdfs(Array.from(event.dataTransfer?.files ?? []));
    });
    this.#elements.libraryPdfUploadStatus.addEventListener(libraryPdfUploadRetryEvent, () => {
      void this.#uploadLibraryPdfs(this.#failedLibraryPdfUploads);
    });
    this.#elements.libraryPdfUploadStatus.addEventListener(libraryPdfUploadRevealEvent, (event) => {
      void this.#revealExistingPdfReference((event as CustomEvent<ExistingPdfUpload>).detail);
    });
    this.#elements.webSourceCapture.addEventListener(webSourceCaptureEvent, (event) => {
      void this.#captureWebSource((event as CustomEvent<string>).detail);
    });
    this.#elements.openCitationNetwork.addEventListener("click", () => void this.#openCitationNetwork());
    this.#elements.closeCitationNetwork.addEventListener("click", () => {
      this.#elements.citationNetwork.classList.add("hidden");
    });
    this.#elements.filterProjectCitations.addEventListener("click", () => {
      this.#filterProjectCitations = !this.#filterProjectCitations;
      this.#elements.filterProjectCitations.setAttribute("aria-pressed", String(this.#filterProjectCitations));
      void this.#refreshCitationNetwork();
    });
    this.#elements.citationNetworkPanel.addEventListener(citationNetworkActionEvent, (event) => {
      const detail = (event as CustomEvent<CitationNetworkAction>).detail;
      if (detail.action === "expand") void this.#expandCitationReference(detail.referenceId);
      else if (detail.action === "record") void this.#recordCitationAssertion(detail);
      else if (detail.action === "review") void this.#reviewCitationAssertion(detail.assertionId, detail.decision);
      else void this.#acceptCitationCandidate(detail.expansion, detail.candidate);
    });
    this.#elements.showArchivedReferences.addEventListener("click", () => {
      this.#showArchivedReferences = !this.#showArchivedReferences;
      this.#elements.showArchivedReferences.setAttribute("aria-pressed", String(this.#showArchivedReferences));
      void this.#refreshReferenceLibrary();
    });
    this.#elements.referenceLibraryFilters.addEventListener(referenceLibraryFilterChangeEvent, () => this.#renderReferenceLibrary());
    this.#elements.referenceLibraryList.addEventListener(libraryReferenceSummaryActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferenceSummaryAction>).detail;
      if (detail.action === "open-pdf") void this.#openLibraryPdf(detail.artifact);
      else if (detail.action === "link") void this.#linkLibraryReference(detail.referenceId, detail.referenceKey);
      else void this.#unlinkProjectReference(detail.referenceId);
    });
    this.#elements.referenceLibraryList.addEventListener(libraryReferencePersonalActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferencePersonalAction>).detail;
      if (detail.action === "save-tags") void this.#saveReferenceTags(detail.referenceId, detail.value);
      else if (detail.action === "save-collections") void this.#saveReferenceCollections(detail.referenceId, detail.value);
      else if (detail.action === "set-archived") void this.#setReferenceArchived(detail.referenceId, detail.archived, detail.title);
      else if (detail.action === "save-reading")
        void this.#saveReadingState(detail.referenceId, detail.status, detail.rating, detail.priority);
      else void this.#createReferenceNote(detail.referenceId, detail.body);
    });
    this.#elements.referenceLibraryList.addEventListener(libraryReferenceMetadataActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferenceMetadataAction>).detail;
      const editor = event.target;
      if (!(editor instanceof LibraryReferenceMetadataEditor)) return;
      if (detail.action === "save") void this.#saveReferenceMetadata(detail.referenceId, detail.value);
      else if (detail.action === "refine") void this.#refinePdfMetadata(detail.reference, detail.artifact, editor);
      else if (detail.action === "apply-pdf") void this.#applyPdfMetadata(detail.referenceId, detail.artifactId, detail.fields);
      else void this.#applyProviderMetadata(detail.referenceId, detail.candidates, detail.selections);
    });
    this.#elements.referenceLibraryList.addEventListener(libraryReferencePdfActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferencePdfAction>).detail;
      if (detail.action === "open") void this.#openLibraryPdf(detail.artifact);
      else if (detail.action === "set-rights") void this.#setArtifactRights(detail.artifactId, detail.rights);
      else {
        const editor = (event.target as Element)
          .closest(".library-reference-row")
          ?.querySelector<LibraryReferenceMetadataEditor>("library-reference-metadata-editor");
        if (editor) void this.#refinePdfMetadata(detail.reference, detail.artifact, editor);
      }
    });
    this.#elements.referenceLibraryList.addEventListener(libraryReferenceResearchActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryReferenceResearchAction>).detail;
      if (detail.action === "capture") void this.#captureWebSourceInput(detail.canonicalUrl);
      else if (detail.action === "compare") void this.#compareWebSnapshots(detail.priorId, detail.currentId);
      else if (detail.action === "pin") void this.#pinProjectWebSnapshot(detail.referenceId, detail.snapshotId);
      else if (detail.action === "revoke") void this.#revokePrivateResearch(detail.shareId);
      else void this.#sharePrivateResearch(detail.referenceId, detail.kind, detail.resourceId);
    });
    this.#elements.unidentifiedPdfList.addEventListener(unidentifiedPdfIdentifyEvent, (event) => {
      const { artifactId, referenceId } = (event as CustomEvent<UnidentifiedPdfSelection>).detail;
      void this.#identifyLibraryPdf(artifactId, referenceId);
    });
    this.#bindSourceEditor(this.#source);
    this.#rememberAuthoringSelection();
    bindVimTextarea(this.#elements.source, this.#elements.sourceEditorShell, this.#elements.vimToggle, this.#elements.vimModeStatus);
    bindYText(this.#elements.bibliography, this.#bibliography, this.#document);
    this.#elements.newProjectFile.addEventListener("click", () => this.#openProjectFileDialog("create"));
    this.#elements.newProjectFileRail.addEventListener("click", () => this.#openProjectFileDialog("create"));
    this.#elements.newProjectFolderRail.addEventListener("click", () => this.#openProjectFileDialog("create-folder"));
    this.#elements.uploadProjectImages.addEventListener("click", () => this.#elements.projectImageUpload.click());
    this.#elements.projectTreePanel.addEventListener(projectTreeActionEvent, (event) => {
      const detail = (event as CustomEvent<ProjectTreeAction>).detail;
      if (detail.action === "select-file") {
        this.#selectProjectFile(detail.fileId);
        if (detail.focusEditor) this.#elements.source.focus();
      } else if (detail.action === "rename-folder") this.#openProjectFileDialog("rename-folder", detail.folderId);
      else if (detail.action === "delete-folder") this.#deleteProjectFolder(detail.folderId);
      else if (detail.action === "insert-asset") this.#insertProjectImage(detail.asset);
      else void this.#deleteProjectImage(detail.asset);
    });
    this.#elements.projectImageUpload.addEventListener("change", () => void this.#uploadProjectImages());
    this.#elements.createAndIncludeProjectFile.addEventListener("click", () => this.#openProjectFileDialog("create-and-include"));
    this.#elements.renameProjectFile.addEventListener("click", () => this.#openProjectFileDialog("rename"));
    this.#elements.deleteProjectFile.addEventListener("click", () => this.#deleteProjectFile());
    this.#elements.projectFileDialog.addEventListener(
      projectFileSaveEvent,
      (event) => void this.#saveProjectFile((event as CustomEvent<ProjectFileSave>).detail),
    );
    this.#elements.editorInsertMenu.addEventListener(editorInsertActionEvent, (event) => {
      const detail = (event as CustomEvent<EditorInsertAction>).detail;
      if (detail.action === "syntax") this.#insertSourceSyntax(detail.kind);
      else this.#insertProjectIncludeFromMenu(detail.relativePath, detail.path);
    });
    this.#elements.citationCompletionScope.addEventListener("change", () => {
      const scope = this.#elements.citationCompletionScope.value === "library" ? "library" : "project";
      localStorage.setItem(citationCompletionScopeStorageKey, scope);
      void this.#renderSourceCompletion();
    });
    this.#elements.source.addEventListener("keydown", (event) => this.#handleSourceCompletionKey(event));
    this.#elements.source.addEventListener("blur", () => window.setTimeout(() => this.#hideSourceCompletion(), 0));
    this.#elements.showWriteMode.addEventListener("click", () => this.#setAuthoringMode("write"));
    this.#elements.showMapMode.addEventListener("click", () => this.#setAuthoringMode("map"));
    this.#elements.openProjectHistory.addEventListener("click", () => void this.#openProjectHistory());
    for (const button of [this.#elements.openExport, this.#elements.wordCountBadge]) {
      button.addEventListener("click", () => this.#openExport());
    }
    this.#elements.closeExport.addEventListener("click", () => this.#elements.exportDialog.close());
    this.#elements.projectHistoryPanel.addEventListener(projectHistoryCloseEvent, () => this.#elements.projectHistoryDialog.close());
    this.#elements.projectHistoryPanel.addEventListener(projectHistoryActionEvent, (event) => {
      void this.#handleProjectHistoryAction((event as CustomEvent<ProjectHistoryOperation>).detail);
    });
    this.#elements.projectHistoryDialog.addEventListener("close", () => this.#projectHistoryWorkflow.send({ type: "CLOSE" }));
    this.#elements.manuscriptCommentListPanel.addEventListener(manuscriptCommentCreateEvent, (event) => {
      void this.#createManuscriptComment((event as CustomEvent<string>).detail);
    });
    this.#elements.manuscriptCommentListPanel.addEventListener(manuscriptCommentActionEvent, (event) => {
      const detail = (event as CustomEvent<ManuscriptCommentAction>).detail;
      if (detail.action === "open") this.#showPassage(detail.anchor);
      else if (detail.action === "reanchor") void this.#reanchorManuscriptComment(detail.commentId);
      else void this.#resolveManuscriptComment(detail.commentId);
    });
    for (const eventName of ["focus", "input", "keyup", "select", "click"] as const) {
      this.#elements.source.addEventListener(eventName, () => {
        if (document.activeElement === this.#elements.source) this.#rememberAuthoringSelection();
        void this.#renderSourceCompletion();
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
      this.#elements.saveStatus.textContent = collaborationSynced(this.#collaborationWorkflow.getSnapshot())
        ? "Saving…"
        : "Saving offline…";
      this.#updateModelAvailability();
      void this.#renderPreview();
      this.#flushPendingUpdates();
    });
    this.#elements.pdfUpload.addEventListener("change", () => void this.#uploadPdf());
    this.#elements.projectEvidencePanel.addEventListener(projectEvidenceActionEvent, (event) => {
      const detail = (event as CustomEvent<ProjectEvidenceAction>).detail;
      if (detail.action === "open-pdf") {
        this.#elements.projectAnnotationForm.selectPdf(detail.pdf.id);
        void this.#showPaper(detail.pdf, detail.page, detail.annotationId);
      } else if (detail.action === "remove-pdf") void this.#removePdf(detail.pdf);
      else if (detail.action === "evidence") this.#setModelEvidenceSelected(detail.key, detail.selected);
      else if (detail.action === "link-annotation") void this.#linkAnnotation(detail.annotationId);
      else if (detail.action === "edit-annotation") this.#editAnnotation(detail.annotation);
      else if (detail.action === "delete-annotation") void this.#deleteAnnotation(detail.annotation);
      else if (detail.action === "open-passage") this.#showPassage(detail.anchor);
      else if (detail.action === "remove-fragment") {
        void this.#removeHighlightFragment(detail.annotationId, detail.fragmentId, true);
      } else {
        void this.#updateHighlightFragment(
          detail.annotationId,
          detail.fragmentId,
          detail.quote,
          detail.prefix,
          detail.suffix,
          detail.rects,
        );
      }
    });
    this.#elements.knowledgeSearchPanel.addEventListener(knowledgeSearchEvent, (event) => {
      void this.#searchKnowledge((event as CustomEvent<string>).detail);
    });
    this.#elements.knowledgeSearchPanel.addEventListener(knowledgeSearchSelectEvent, (event) => {
      this.#focusKnowledgeResource((event as CustomEvent<string>).detail);
    });
    this.#elements.knowledgeConnectionsPanel.addEventListener(knowledgeConnectionSelectEvent, (event) => {
      this.#focusKnowledgeResource((event as CustomEvent<string>).detail);
    });
    this.#elements.projectMapPanel.addEventListener(projectMapSelectEvent, (event) => {
      this.#focusKnowledgeResource((event as CustomEvent<string>).detail);
    });
    this.#elements.publicationListPanel.addEventListener(publicationListActionEvent, (event) => {
      const detail = (event as CustomEvent<PublicationListAction>).detail;
      if (detail.action === "open") this.#openPublicationContext(detail.publication);
      else if (detail.action === "manage") void this.#openReferenceLibraryEntry(detail.publicationId);
      else void this.#enrichPublication(detail.publicationId);
    });
    this.#elements.projectAnnotationForm.addEventListener(projectAnnotationSaveEvent, (event) => {
      void this.#createAnnotation((event as CustomEvent<ProjectAnnotationSave>).detail);
    });
    this.#elements.libraryPdfAnnotationForms.addEventListener(libraryPdfAnnotationActionEvent, (event) => {
      const action = (event as CustomEvent<LibraryPdfAnnotationAction>).detail;
      if (action.action === "save-highlight") void this.#saveLibraryHighlight(action);
      else if (action.action === "cancel-highlight") this.#clearLibraryHighlightDraft();
      else if (action.action === "save-note") void this.#saveLibraryPdfNote(action.body);
      else if (action.action === "cancel-note") this.#clearLibraryPdfNoteDraft();
      else if (action.action === "apply-drawing") void this.#updateSelectedLibraryDrawing(action);
      else if (action.action === "edit-note") this.#editSelectedLibraryPdfNote();
      else if (action.action === "delete-markup") void this.#deleteSelectedLibraryPdfMarkup();
      else this.#clearLibraryPdfMarkupSelection();
    });
    this.#elements.libraryHighlightList.addEventListener(libraryPdfAnnotationListActionEvent, (event) => {
      const detail = (event as CustomEvent<LibraryPdfAnnotationListAction>).detail;
      if (detail.action === "open-highlight") void this.#openLibraryHighlight(detail.highlight);
      else if (detail.action === "edit-highlight") this.#editLibraryHighlight(detail.highlight);
      else if (detail.action === "cite-highlight") void this.#citeLibraryHighlight(detail.highlight);
      else if (detail.action === "share-highlight")
        void this.#sharePrivateResearch(detail.highlight.referenceId, "highlight", detail.highlight.id);
      else if (detail.action === "revoke-share") void this.#revokePrivateResearch(detail.shareId);
      else if (detail.action === "open-markup") void this.#openLibraryPdf(detail.artifact, detail.page);
      else if (detail.action === "edit-note") this.#editLibraryPdfNote(detail.note);
      else void this.#deleteLibraryPdfMarkup(detail.markup);
    });
    this.#elements.libraryPdfAnnotationToolbar.addEventListener(libraryPdfToolbarActionEvent, (event) => {
      const action = (event as CustomEvent<LibraryPdfToolbarAction>).detail;
      if (action.action === "choose-tool") this.#setLibraryPdfTool(action.tool);
      else if (action.action === "undo-drawing") void this.#undoLibraryDrawing();
      else if (action.action === "export-annotated") void this.#downloadAnnotatedPdf();
      else this.#setLibraryPdfInspector(true, true);
    });
    this.#elements.closeLibraryPdfInspector.addEventListener("click", () => this.#closeLibraryPdfInspector());
    this.#elements.pdfHighlightImportPanel.addEventListener(pdfHighlightImportActionEvent, (event) => {
      const action = (event as CustomEvent<PdfHighlightImportAction>).detail;
      if (action.action === "detect") void this.#detectLibraryPdfHighlights();
      else if (action.action === "import") void this.#importDetectedPdfHighlights(action.candidates);
      else this.#pdfHighlightDetectionArtifactId = null;
    });
    this.#elements.paperMarkups.addEventListener("pointerdown", (event) => this.#startLibraryPdfMarkup(event));
    this.#elements.paperMarkups.addEventListener("pointermove", (event) => this.#continueLibraryPdfDrawing(event));
    this.#elements.paperMarkups.addEventListener("pointerup", (event) => void this.#finishLibraryPdfDrawing(event));
    this.#elements.paperMarkups.addEventListener("pointercancel", () => {
      const movedNote = this.#pdfNoteDrag()?.moved;
      const hadDrawing = this.#pdfDrawingDraft() !== null;
      this.#cancelLibraryPdfDrawing();
      if (movedNote || hadDrawing) this.#renderPdfMarkups();
    });
    this.#elements.highlightPaintTool.addEventListener("click", () => this.#setHighlightTool("paint"));
    this.#elements.highlightEraserTool.addEventListener("click", () => this.#setHighlightTool("erase"));
    this.#elements.undoHighlight.addEventListener("click", () => void this.#undoLastHighlightStroke());
    this.#elements.citeActivePdf.addEventListener("click", () => this.#citeActivePdf());
    this.#elements.newClaim.addEventListener("click", () => this.#openClaimDialog());
    this.#elements.claimListPanel.addEventListener(claimListActionEvent, (event) => {
      const detail = (event as CustomEvent<ClaimListAction>).detail;
      if (detail.action === "evidence") this.#setModelEvidenceSelected(detail.key, detail.selected);
      else if (detail.action === "edit") this.#openClaimDialog(detail.claim);
      else if (detail.action === "delete") void this.#deleteClaim(detail.claim);
      else if (detail.action === "link-passage") void this.#linkClaim(detail.claimId);
      else if (detail.action === "open-annotation") this.#focusAnnotationCard(detail.annotationId);
      else this.#showPassage(detail.anchor);
    });
    this.#elements.candidateListPanel.addEventListener(candidateListOpenEvent, (event) => {
      this.#openCandidateContext((event as CustomEvent<ModelCandidate>).detail);
    });
    this.#elements.claimDialog.addEventListener(claimDialogSaveEvent, (event) => {
      void this.#saveClaim((event as CustomEvent<ClaimDialogSave>).detail);
    });
    this.#elements.showAuthoringSurface.addEventListener("click", () => this.#showWorkspaceSurface("authoring"));
    this.#elements.showContextSurface.addEventListener("click", () => this.#showWorkspaceSurface("context"));
    this.#layout.bind();
    this.#elements.contextPreviewTab.addEventListener("click", () => this.#activateContext(RESEARCH_PREVIEW_KEY));
    this.#elements.togglePreviewNavigation.addEventListener("click", () => {
      const hidden = document.body.dataset.previewNavigation !== "hidden";
      this.#setPreviewNavigationHidden(hidden);
      if (hidden && appMode === "library") this.#elements.restorePreviewNavigation.focus();
    });
    this.#elements.restorePreviewNavigation.addEventListener("click", () => {
      this.#setPreviewNavigationHidden(false);
      this.#elements.togglePreviewNavigation.focus();
    });
    this.#elements.contextAssistantTab.addEventListener("click", () => this.#activateContext(RESEARCH_ASSISTANT_KEY));
    this.#elements.contextResourceTabsPanel.addEventListener(contextResourceTabActionEvent, (event) => {
      const detail = (event as CustomEvent<ContextResourceTabAction>).detail;
      if (detail.action === "activate") this.#activateContext(detail.key);
      else this.#closeContextTab(detail.key);
    });
    this.#elements.contextTabOverviewPanel.addEventListener(contextTabOverviewActionEvent, (event) => {
      const detail = (event as CustomEvent<ContextTabOverviewAction>).detail;
      if (detail.action === "activate") this.#activateContext(detail.key);
      else this.#closeContextTab(detail.key);
    });
    this.#elements.contextTabList.addEventListener("keydown", (event) => this.#moveContextTabFocus(event));
    this.#elements.preview.addEventListener("click", (event) => this.#handlePreviewClick(event));
    this.#elements.diagnostics.addEventListener(previewDiagnosticSelectEvent, (event) => {
      const { fileId, from, to } = (event as CustomEvent<PreviewDiagnosticSelection>).detail;
      this.#focusProjectRange(fileId || this.#snapshot?.entryFileId || "", from, to);
    });
    this.#elements.syncPreviewFromSource.addEventListener("click", () => this.#syncPreviewFromSource());
    this.#elements.syncSourceFromPreview.addEventListener("click", () => this.#syncSourceFromPreviewCenter());
    this.#elements.openSourceCitation.addEventListener("click", () => this.#openCitationAtCaret());
    this.#elements.publicationContextPanel.addEventListener(publicationContextActionEvent, (event) => {
      const detail = (event as CustomEvent<PublicationContextAction>).detail;
      if (detail.action === "insert-citation") this.#insertActivePublicationCitation();
      else if (detail.action === "link-pdf") void this.#linkActivePublicationPdf(detail.pdfId);
      else if (detail.action === "open-paper") void this.#openPublicationPaper(detail.paper);
      else void this.#unlinkPublicationPdf(detail.linkId);
    });
    this.#elements.publicationIntakePanel.addEventListener(publicationIntakeActionEvent, (event) => {
      const detail = (event as CustomEvent<PublicationIntakeAction>).detail;
      if (detail.action === "preview") void this.#previewPublicationIntake(detail.doi);
      else if (detail.action === "accept") void this.#acceptPublicationIntake(detail.citationKey);
      else if (detail.action === "cancel") this.#cancelPublicationIntake();
      else {
        const publication = this.#snapshot?.publications.find(({ id }) => id === detail.publicationId);
        if (publication) this.#openPublicationContext(publication);
      }
    });
    this.#elements.candidateReviewPanel.addEventListener(candidateDecisionEvent, (event) => {
      void this.#updateActiveCandidate((event as CustomEvent<"apply" | "reject">).detail);
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
      if (status) this.#elements.modelStatus.textContent = status;
      this.#updateModelAvailability();
      this.#saveModelPreferences();
    });
    this.#elements.modelProviderSettings.addEventListener(modelProviderDiscoveryEvent, () => void this.#discoverLlmModels());
    this.#elements.openPreferencesFromAssistant.addEventListener("click", (event) => {
      event.stopPropagation();
      this.#elements.preferencesMenu.open = true;
      this.#elements.modelProviderSettings.focusConnection();
    });
    this.#elements.chooseModelEvidence.addEventListener("click", () => this.#chooseModelEvidence());
    this.#elements.assistantInteractiveResult.addEventListener(assistantResultActionEvent, (event) => {
      void this.#handleAssistantResultAction((event as CustomEvent<AssistantResultActionDetail>).detail);
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
    const snapshot = collaborationSynced(this.#collaborationWorkflow.getSnapshot()) ? this.#resolveSnapshotAnchors(value) : value;
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

  #resolveSnapshotAnchors(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
    return {
      ...snapshot,
      links: snapshot.links.map((link) => ({
        ...link,
        resolution: resolveManuscriptAnchor(this.#document, link.anchor),
      })),
      claimLinks: snapshot.claimLinks.map((link) => ({
        ...link,
        resolution: resolveManuscriptAnchor(this.#document, link.anchor),
      })),
      comments: snapshot.comments.map((comment) => ({
        ...comment,
        resolution: resolveManuscriptAnchor(this.#document, comment.anchor),
      })),
      candidates: snapshot.candidates.map((candidate) =>
        candidate.operation === "draft-claim"
          ? candidate
          : {
              ...candidate,
              target: {
                ...candidate.target,
                resolution: resolveManuscriptAnchor(this.#document, candidate.target.anchor),
              },
            },
      ),
    };
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
    this.#elements.workspaceSwitcher.replaceChildren();
    for (const workspace of workspaces) {
      if (workspace.archivedAt && workspace.id !== workspaceId) continue;
      const option = new Option(workspace.title, workspace.id, workspace.id === workspaceId, workspace.id === workspaceId);
      this.#elements.workspaceSwitcher.append(option);
    }
    if (workspaces.some((workspace) => workspace.id === workspaceId)) this.#elements.workspaceSwitcher.value = workspaceId;
    this.#elements.workspaceCatalogPanel.setData(workspaces, workspaceId);
  }

  #showRail(mode: WorkspaceRail): void {
    const files = mode === "files";
    const research = mode === "research";
    const comments = mode === "comments";
    const guide = mode === "guide";
    this.#elements.filesRailPanel.hidden = !files;
    this.#elements.researchRailPanel.hidden = !research;
    this.#elements.commentsRailPanel.hidden = !comments;
    this.#elements.guideRailPanel.hidden = !guide;
    this.#elements.showFilesRail.setAttribute("aria-selected", String(files));
    this.#elements.showResearchRail.setAttribute("aria-selected", String(research));
    this.#elements.showCommentsRail.setAttribute("aria-selected", String(comments));
    this.#elements.showGuideRail.setAttribute("aria-selected", String(guide));
    if (guide) this.#renderManuscriptMap();
    this.#syncWorkspaceRoute("replace");
  }

  #restoreWorkspaceLayout(): void {
    const stored = localStorage.getItem(`kirjolab:layout:${workspaceId}`) ?? "split";
    void this.#setWorkspaceLayout(stored, false);
  }

  async #setWorkspaceLayout(value: string, persist = true): Promise<void> {
    const layout = normalizeWorkspaceLayout(value);
    this.#elements.workspaceLayout.value = layout;
    this.#elements.workspaceSurfaces.dataset.layout = layout;
    if (persist) localStorage.setItem(`kirjolab:layout:${workspaceId}`, layout);
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
    if (route.layout) await this.#setWorkspaceLayout(route.layout, false);
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
      rail: this.#activeWorkspaceRail(),
      mode: this.#elements.showMapMode.getAttribute("aria-pressed") === "true" ? "map" : "write",
      surface: this.#elements.workspaceSurfaces.dataset.activeSurface === "context" ? "context" : "authoring",
      layout: this.#elements.workspaceLayout.value as WorkspaceLayout,
      contextKey: this.#contextState.activeKey,
      ...tabLocation,
    });
    const currentRelative = `${current.pathname}${current.search}${current.hash}`;
    if (next === currentRelative) return;
    if (mode === "push") history.pushState({ view: "workspace" }, "", next);
    else history.replaceState(history.state, "", next);
  }

  #activeWorkspaceRail(): WorkspaceRail {
    if (this.#elements.showResearchRail.getAttribute("aria-selected") === "true") return "research";
    if (this.#elements.showCommentsRail.getAttribute("aria-selected") === "true") return "comments";
    if (this.#elements.showGuideRail.getAttribute("aria-selected") === "true") return "guide";
    return "files";
  }

  async #createWorkspace({ startingPoint, title }: Extract<StartingPointAction, { readonly action: "create" }>): Promise<void> {
    const sourceWorkspaceId = startingPoint.startsWith("project:") ? startingPoint.slice("project:".length) : null;
    const response = await jsonFetch(catalogBase, {
      title,
      ...(sourceWorkspaceId ? { sourceWorkspaceId } : { templateId: startingPoint }),
    });
    await expectOk(response);
    const workspace: unknown = await response.json();
    const created: unknown = [workspace];
    if (!isWorkspaceSummaries(created) || !created[0]) throw new Error("Project catalog returned invalid data");
    location.assign(created[0].href);
  }

  #openLatexImportDialog(): void {
    this.#elements.newWorkspaceDialog.close();
    this.#elements.latexImportPanel.reset();
    this.#elements.latexImportDialog.showModal();
    this.#elements.latexImportPanel.focusTitle();
  }

  #openGitHubImportDialog(): void {
    this.#elements.newWorkspaceDialog.close();
    this.#gitHubImportPreviewId = null;
    this.#elements.gitHubImportPanel.resetPreview();
    this.#elements.gitHubImportDialog.showModal();
    this.#elements.gitHubImportPanel.focusTitle();
    void this.#refreshGitHubConnection();
  }

  async #previewLatexImport(archive: File, root: string): Promise<void> {
    try {
      this.#elements.latexImportPanel.previewSucceeded(await this.#requestLatexImportPreview(archive, root));
    } catch (error) {
      this.#elements.latexImportPanel.previewFailed(error instanceof Error ? error.message : "Could not preview the LaTeX archive.");
    }
  }

  async #requestLatexImportPreview(archive: File, root: string): Promise<LatexImportPreview> {
    const query = new URLSearchParams();
    if (root) query.set("root", root);
    const response = await fetch(`/api/latex-import-previews${query.size ? `?${query.toString()}` : ""}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/zip" },
      body: archive,
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isLatexImportPreview(value)) throw new Error("LaTeX import returned an invalid preview");
    return value;
  }

  async #confirmLatexImport(action: Extract<LatexImportAction, { action: "confirm" }>): Promise<void> {
    try {
      location.assign(await this.#createLatexWorkspace(action));
    } catch (error) {
      this.#elements.latexImportPanel.confirmFailed(error instanceof Error ? error.message : "Could not import the LaTeX project.");
    }
  }

  async #createLatexWorkspace(action: Extract<LatexImportAction, { action: "confirm" }>): Promise<string> {
    const query = new URLSearchParams({
      title: action.title,
      previewDigest: action.previewDigest,
      root: action.root,
    });
    if (action.bibliographyPath) query.set("bibliography", action.bibliographyPath);
    const response = await fetch(`/api/latex-imports?${query.toString()}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/zip" },
      body: action.archive,
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isRecord(value) || !isRecord(value.workspace) || typeof value.workspace.href !== "string") {
      throw new Error("LaTeX import returned invalid project data");
    }
    return value.workspace.href;
  }

  async #previewGitHubImport(): Promise<void> {
    this.#gitHubImportPreviewId = null;
    this.#elements.gitHubImportPanel.beginPreview();
    try {
      const selection = this.#elements.gitHubImportPanel.selection;
      const repository = selection.repository;
      const installationId = selection.installationId;
      if (installationId === null) throw new Error("Choose a GitHub account");
      if (!repository) throw new Error("Choose a GitHub repository");
      const response = await jsonFetch("/api/github/import-previews", {
        installationId,
        owner: repository.owner,
        repository: repository.name,
        branch: selection.branch,
        rootPath: selection.rootPath,
        ...(selection.entryPath ? { entryPath: selection.entryPath } : {}),
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isGitHubImportPreview(value)) throw new Error("GitHub returned an invalid import preview");
      this.#gitHubImportPreviewId = value.id;
      this.#elements.gitHubImportPanel.showPreview(value);
    } catch (error) {
      this.#elements.gitHubImportPanel.showPreviewError(error instanceof Error ? error.message : "Could not preview GitHub import.");
    }
  }

  async #refreshGitHubConnection(): Promise<void> {
    this.#gitHubPickerRequest += 1;
    this.#gitHubImportPreviewId = null;
    this.#elements.gitHubImportPanel.resetPreview();
    this.#elements.gitHubImportPanel.beginConnectionRefresh();
    try {
      const response = await fetch("/api/github/connection", { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isGitHubConnectionState(value)) throw new Error("GitHub returned an invalid connection state");
      this.#elements.gitHubConnectionPanel.setConnection({
        connected: value.connected,
        message: value.connected
          ? `Connected as @${value.user.login}. Repository access remains controlled on GitHub.`
          : "Connect GitHub to choose repositories available to your account.",
      });
      if (value.connected) await this.#loadGitHubInstallations();
      else this.#elements.gitHubImportPanel.resetDisconnected();
    } catch (error) {
      this.#elements.gitHubConnectionPanel.setMessage(error instanceof Error ? error.message : "Could not load the GitHub connection.");
    }
  }

  async #loadGitHubInstallations(): Promise<void> {
    const requestId = ++this.#gitHubPickerRequest;
    this.#elements.gitHubImportPanel.setInstallationsLoading();
    const response = await fetch("/api/github/installations", { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isGitHubInstallationList(value)) throw new Error("GitHub returned an invalid installation list");
    if (requestId !== this.#gitHubPickerRequest) return;
    this.#elements.gitHubImportPanel.setInstallations(value.installations);
    if (value.installations.length === 0) {
      this.#elements.gitHubConnectionPanel.setMessage("Connected. Install the Kirjolab GitHub App or grant it repository access.");
      this.#elements.gitHubImportPanel.resetRepositoryPickers();
      return;
    }
    await this.#loadGitHubRepositories(requestId);
  }

  async #loadGitHubRepositories(parentRequestId?: number): Promise<void> {
    const requestId = parentRequestId ?? ++this.#gitHubPickerRequest;
    if (parentRequestId !== undefined && requestId !== this.#gitHubPickerRequest) return;
    const installationId = this.#elements.gitHubImportPanel.selection.installationId;
    if (installationId === null) return;
    this.#elements.gitHubImportPanel.setRepositoriesLoading();
    const response = await fetch(`/api/github/installations/${installationId}/repositories`, { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isGitHubRepositoryList(value)) throw new Error("GitHub returned an invalid repository list");
    if (requestId !== this.#gitHubPickerRequest) return;
    const repositories = [...value.repositories].sort((left, right) => left.fullName.localeCompare(right.fullName));
    this.#elements.gitHubImportPanel.setRepositories(repositories);
    if (repositories.length === 0) return;
    await this.#loadGitHubBranches(requestId);
  }

  async #loadGitHubBranches(parentRequestId?: number): Promise<void> {
    const requestId = parentRequestId ?? ++this.#gitHubPickerRequest;
    if (parentRequestId !== undefined && requestId !== this.#gitHubPickerRequest) return;
    const selection = this.#elements.gitHubImportPanel.selection;
    const installationId = selection.installationId;
    const repositoryId = selection.repository?.id ?? null;
    if (installationId === null || repositoryId === null) return;
    this.#elements.gitHubImportPanel.setBranchesLoading();
    const response = await fetch(`/api/github/installations/${installationId}/repositories/${repositoryId}/branches`, {
      credentials: "same-origin",
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isGitHubBranchList(value)) throw new Error("GitHub returned an invalid branch list");
    if (requestId !== this.#gitHubPickerRequest) return;
    this.#elements.gitHubImportPanel.setBranches(value.branches, value.repository.defaultBranch);
  }

  async #disconnectGitHubAccount(): Promise<void> {
    if (!confirm("Disconnect your GitHub account from Kirjolab? Existing project files and repositories will not be deleted.")) return;
    const response = await fetch("/api/github/connection", { method: "DELETE", credentials: "same-origin" });
    await expectOk(response);
    await this.#refreshGitHubConnection();
  }

  async #confirmGitHubImport(): Promise<void> {
    if (!this.#gitHubImportPreviewId) return;
    this.#elements.gitHubImportPanel.beginCreation();
    try {
      const response = await jsonFetch("/api/github/imports", {
        previewId: this.#gitHubImportPreviewId,
        title: this.#elements.gitHubImportPanel.projectTitle,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isUnknownRecord(value) || !isUnknownRecord(value.workspace) || typeof value.workspace.href !== "string") {
        throw new Error("GitHub import returned invalid project data");
      }
      location.assign(value.workspace.href);
    } catch (error) {
      this.#elements.gitHubImportPanel.showCreationError(error instanceof Error ? error.message : "Could not import the project.");
    }
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

  async #handleWorkspaceSettingsAction(detail: WorkspaceSettingsAction): Promise<void> {
    if (detail.action === "save") await this.#saveWorkspaceSettings(detail.value);
    else if (detail.action === "archive") await this.#toggleWorkspaceArchive();
    else if (detail.action === "save-template") await this.#openSaveTemplate();
    else if (detail.action === "duplicate") await this.#duplicateWorkspace(detail.title);
    else await this.#deleteWorkspace(detail.title);
  }

  async #refreshGitHubSyncState(force = false): Promise<void> {
    if (!this.#shouldRefreshGitHubSync(force)) return;
    const requestId = ++this.#gitHubSyncRequest;
    this.#gitHubSyncCheckedAt = Date.now();
    this.#resetGitHubSyncReview();
    try {
      await this.#loadGitHubSyncState(requestId);
    } catch (error) {
      this.#renderGitHubSyncError(requestId, error);
    }
  }

  #shouldRefreshGitHubSync(force: boolean): boolean {
    if (!navigator.onLine) return false;
    if (force) return true;
    if (this.#gitHubPullPreviewId || this.#gitHubPublishPreviewId || this.#elements.workspaceSettingsPanel.open) return false;
    return Date.now() - this.#gitHubSyncCheckedAt >= 60_000;
  }

  #resetGitHubSyncReview(): void {
    this.#gitHubPullPreviewId = null;
    this.#gitHubPublishPreviewId = null;
    this.#elements.workspaceSettingsPanel.gitHubReview.reset();
  }

  async #loadGitHubSyncState(requestId: number): Promise<void> {
    const response = await fetch(`${apiBase}/github-sync`, { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    const connection = isGitHubSyncState(value) ? value : null;
    if (requestId !== this.#gitHubSyncRequest) return;
    this.#renderGitHubSyncConnection(connection);
    if (!connection) return;
    const statusResponse = await fetch(`${apiBase}/github-sync/status`, { credentials: "same-origin" });
    await expectOk(statusResponse);
    const statusValue: unknown = await statusResponse.json();
    if (!isGitHubSyncStatus(statusValue)) throw new Error("GitHub returned an invalid synchronization status");
    if (requestId === this.#gitHubSyncRequest) this.#renderGitHubSyncStatus(statusValue);
  }

  #renderGitHubSyncConnection(connection: GitHubSyncConnection | null): void {
    const connected = connection !== null;
    this.#elements.workspaceSettingsPanel.gitHubReview.setConnected(connected);
    this.#elements.gitHubSyncMenu.setConnection(connection);
    if (!connection) {
      this.#elements.workspaceSettingsPanel.setGitHubStatus("This project is not connected to GitHub.");
      return;
    }
  }

  #renderGitHubSyncError(requestId: number, error: unknown): void {
    if (requestId !== this.#gitHubSyncRequest) return;
    const message = error instanceof Error ? error.message : "Could not load GitHub sync state.";
    this.#elements.workspaceSettingsPanel.setGitHubStatus(message);
    this.#elements.gitHubSyncMenu.setError(message);
  }

  #renderGitHubSyncStatus(status: GitHubSyncStatus): void {
    this.#elements.workspaceSettingsPanel.setGitHubStatus(this.#elements.gitHubSyncMenu.setStatus(status));
  }

  async #previewGitHubPull(): Promise<void> {
    this.#gitHubPullPreviewId = null;
    this.#elements.workspaceSettingsPanel.gitHubReview.beginPullPreview();
    try {
      const response = await jsonFetch(`${apiBase}/github-sync/pull-previews`, {});
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isGitHubPullPreview(value)) throw new Error("GitHub returned an invalid pull preview");
      this.#gitHubPullPreviewId = value.id;
      this.#elements.workspaceSettingsPanel.gitHubReview.showPullPreview(value);
    } catch (error) {
      this.#elements.workspaceSettingsPanel.gitHubReview.showPullError(error instanceof Error ? error.message : "Could not check GitHub.");
    }
  }

  async #confirmGitHubPull(): Promise<void> {
    if (!this.#gitHubPullPreviewId) return;
    this.#elements.workspaceSettingsPanel.gitHubReview.beginPull();
    try {
      const resolutions = this.#elements.workspaceSettingsPanel.gitHubReview.resolutions;
      const response = await jsonFetch(`${apiBase}/github-sync/pulls`, { previewId: this.#gitHubPullPreviewId, resolutions });
      await expectOk(response);
      await this.#resourceRefresh.request();
      await this.#refreshGitHubSyncState(true);
      this.#elements.workspaceSettingsPanel.gitHubReview.showPullSuccess();
    } catch (error) {
      this.#elements.workspaceSettingsPanel.gitHubReview.showPullError(
        error instanceof Error ? error.message : "Could not pull from GitHub.",
      );
    }
  }

  async #previewGitHubPublish(): Promise<void> {
    this.#gitHubPublishPreviewId = null;
    this.#elements.workspaceSettingsPanel.gitHubReview.beginPublishPreview();
    try {
      const response = await jsonFetch(`${apiBase}/github-sync/publish-previews`, {
        commitMessage: this.#elements.workspaceSettingsPanel.gitHubReview.commitMessage,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isGitHubPublishPreview(value)) throw new Error("GitHub returned an invalid publish preview");
      this.#gitHubPublishPreviewId = value.id;
      this.#elements.workspaceSettingsPanel.gitHubReview.showPublishPreview(value);
    } catch (error) {
      this.#elements.workspaceSettingsPanel.gitHubReview.showPublishError(
        error instanceof Error ? error.message : "Could not preview GitHub publish.",
      );
    }
  }

  async #confirmGitHubPublish(): Promise<void> {
    if (!this.#gitHubPublishPreviewId) return;
    this.#elements.workspaceSettingsPanel.gitHubReview.beginPublish();
    try {
      const response = await jsonFetch(`${apiBase}/github-sync/publishes`, { previewId: this.#gitHubPublishPreviewId });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isUnknownRecord(value) || typeof value.commitSha !== "string") throw new Error("GitHub returned an invalid publish result");
      await this.#refreshGitHubSyncState(true);
      this.#elements.workspaceSettingsPanel.gitHubReview.showPublishSuccess(value.commitSha);
    } catch (error) {
      this.#elements.workspaceSettingsPanel.gitHubReview.showPublishError(
        error instanceof Error ? error.message : "Could not publish to GitHub.",
      );
    }
  }

  async #disconnectGitHub(): Promise<void> {
    if (!confirm("Disconnect this project from GitHub? Project files and the repository will not be deleted.")) return;
    const response = await fetch(`${apiBase}/github-sync`, { method: "DELETE", credentials: "same-origin" });
    await expectOk(response);
    await this.#refreshGitHubSyncState(true);
  }

  async #openNewWorkspace(): Promise<void> {
    this.#elements.newWorkspaceDialog.showModal();
    this.#elements.newWorkspaceStartingPoints.startLoading();
    try {
      await this.#refreshProjectTemplates();
      this.#elements.newWorkspaceStartingPoints.focusFirst();
    } catch (error) {
      this.#elements.newWorkspaceStartingPoints.showError(error instanceof Error ? error.message : "Could not load project templates.");
    }
  }

  async #refreshProjectTemplates(): Promise<void> {
    const response = await fetch("/api/project-templates", { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isProjectTemplateSummaries(value)) throw new Error("Project templates returned invalid data");
    this.#projectTemplates = value;
    this.#renderProjectTemplates();
    this.#renderTemplateReplacementOptions();
  }

  #renderProjectTemplates(): void {
    this.#elements.newWorkspaceStartingPoints.setData(this.#projectTemplates, this.#workspaceCatalog, this.#hiddenProjectTemplateIds);
  }

  async #loadProjectStartingPoint(workspace: WorkspaceSummary): Promise<void> {
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspace.id)}/template-preview`, {
        credentials: "same-origin",
      });
      await expectOk(response);
      const values: unknown[] = [await response.json()];
      if (!isProjectTemplateSummaries(values) || values[0]?.source !== "project" || values[0].id !== workspace.id) {
        throw new Error("Project starting point returned invalid data");
      }
      this.#elements.newWorkspaceStartingPoints.acceptProjectSource(workspace, values[0]);
    } catch (error) {
      this.#elements.newWorkspaceStartingPoints.rejectProjectSource(
        workspace,
        error instanceof Error ? error.message : "Could not load the project starting point.",
      );
    }
  }

  #deleteProjectTemplate(template: ProjectTemplateSummary): void {
    this.#deferDeletion({
      key: `project-template:${template.id}`,
      deletedMessage: `Deleted template “${template.name}”.`,
      restoredMessage: `Restored template “${template.name}”.`,
      failedMessage: `Could not delete template “${template.name}”.`,
      hide: () => {
        this.#hiddenProjectTemplateIds.add(template.id);
        this.#renderProjectTemplates();
        this.#renderTemplateReplacementOptions();
      },
      restore: () => {
        this.#hiddenProjectTemplateIds.delete(template.id);
        this.#renderProjectTemplates();
        this.#renderTemplateReplacementOptions();
      },
      commit: async () => {
        await expectOk(
          await fetch(`/api/project-templates/${encodeURIComponent(template.id)}`, {
            method: "DELETE",
            credentials: "same-origin",
          }),
        );
        await this.#refreshProjectTemplates();
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

  #renderTemplateReplacementOptions(): void {
    this.#elements.saveTemplateDialog.setTemplates(
      this.#projectTemplates.filter((candidate) => !this.#hiddenProjectTemplateIds.has(candidate.id)),
    );
  }

  async #saveProjectTemplate({ name, description, templateId }: ProjectTemplateSave): Promise<void> {
    const response = await jsonFetch(`${apiBase}/template`, {
      name,
      description,
      ...(templateId ? { templateId } : {}),
    });
    await expectOk(response);
    const value: unknown[] = [await response.json()];
    if (!isProjectTemplateSummaries(value) || !value[0]) throw new Error("Saved project template returned invalid data");
    const template = value[0];
    this.#elements.saveTemplateDialog.close();
    await this.#refreshProjectTemplates();
    this.#showToast(templateId ? `Replaced template “${template.name}”.` : `Saved “${template.name}” as a personal template.`);
  }

  async #saveWorkspaceSettings(value: WorkspaceSettingsValue): Promise<void> {
    await expectOk(
      await jsonFetch(
        `${apiBase}/settings`,
        {
          title: value.title,
          entryFileId: value.entryFileId,
          publicationProfile: value.publicationProfile,
        },
        "PATCH",
      ),
    );
    const next = new URL(location.href);
    next.searchParams.set("file", value.entryFileId);
    location.assign(`${next.pathname}${next.search}${next.hash}`);
  }

  async #toggleWorkspaceArchive(): Promise<void> {
    const current = this.#workspaceCatalog.find((item) => item.id === workspaceId);
    await expectOk(await jsonFetch(`${apiBase}/settings`, { archived: !current?.archivedAt }, "PATCH"));
    this.#elements.workspaceSettingsPanel.close();
    await this.#refreshCatalog();
  }

  async #duplicateWorkspace(currentTitle: string): Promise<void> {
    const title = prompt("Title for the duplicate", `${currentTitle} copy`)?.trim();
    if (!title) return;
    const response = await jsonFetch(`${apiBase}/duplicate`, { title });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isWorkspaceSummaries([value])) throw new Error("Project duplicate returned invalid data");
    location.assign((value as WorkspaceSummary).href);
  }

  async #deleteWorkspace(title: string): Promise<void> {
    const confirmation = prompt(`Type DELETE to permanently remove “${title}” and its project PDFs.`);
    if (confirmation !== "DELETE") return;
    await expectOk(await fetch(`${apiBase}/settings`, { method: "DELETE", credentials: "same-origin" }));
    location.assign("/");
  }

  async #openSharing(): Promise<void> {
    this.#elements.shareWorkspaceDialog.showModal();
    await Promise.all([this.#refreshMembers(), this.#refreshReadOnlyShare(), this.#refreshEditShare()]);
  }

  async #refreshReadOnlyShare(): Promise<void> {
    const response = await fetch(`${apiBase}/share-link`, { credentials: "same-origin" });
    if (response.status === 403) {
      this.#elements.workspaceSharingPanel.setShareForbidden("read-only");
      return;
    }
    await expectOk(response);
    const status: unknown = await response.json();
    if (!isShareLinkStatus(status)) throw new Error("Read-only link status returned invalid data");
    this.#elements.workspaceSharingPanel.setShareStatus("read-only", status);
  }

  // Read-only and editable links deliberately expose parallel, separately named owner actions.
  // fallow-ignore-next-line code-duplication
  async #createReadOnlyShare(): Promise<void> {
    const response = await fetch(`${apiBase}/share-link`, { method: "POST", credentials: "same-origin" });
    await expectOk(response);
    const share: unknown = await response.json();
    if (!isRecord(share) || typeof share.href !== "string") throw new Error("Read-only link returned invalid data");
    await this.#refreshReadOnlyShare();
    this.#showToast("Read-only link created. You can return here to copy it again.");
  }

  async #revokeReadOnlyShare(): Promise<void> {
    await expectOk(await fetch(`${apiBase}/share-link`, { method: "DELETE", credentials: "same-origin" }));
    await this.#refreshReadOnlyShare();
    this.#showToast("Read-only link revoked.");
  }

  async #refreshEditShare(): Promise<void> {
    const response = await fetch(`${apiBase}/edit-link`, { credentials: "same-origin" });
    if (response.status === 403) {
      this.#elements.workspaceSharingPanel.setShareForbidden("edit");
      return;
    }
    await expectOk(response);
    const status: unknown = await response.json();
    if (!isShareLinkStatus(status)) throw new Error("Edit link status returned invalid data");
    this.#elements.workspaceSharingPanel.setShareStatus("edit", status);
  }

  async #createEditShare(): Promise<void> {
    const response = await fetch(`${apiBase}/edit-link`, { method: "POST", credentials: "same-origin" });
    await expectOk(response);
    const share: unknown = await response.json();
    if (!isRecord(share) || typeof share.href !== "string") throw new Error("Edit link returned invalid data");
    await this.#refreshEditShare();
    this.#showToast("Edit link created. You can return here to copy it again.");
  }

  async #revokeEditShare(): Promise<void> {
    await expectOk(await fetch(`${apiBase}/edit-link`, { method: "DELETE", credentials: "same-origin" }));
    await this.#refreshEditShare();
    this.#showToast("Edit link revoked.");
  }

  async #handleShareAction(detail: WorkspaceSharingActionDetail): Promise<void> {
    if (detail.kind === "read-only") {
      if (detail.action === "create") await this.#createReadOnlyShare();
      else await this.#revokeReadOnlyShare();
      return;
    }
    if (detail.action === "create") await this.#createEditShare();
    else await this.#revokeEditShare();
  }

  async #refreshMembers(): Promise<void> {
    const response = await fetch(`${apiBase}/members`, { credentials: "same-origin" });
    await expectOk(response);
    const members: unknown = await response.json();
    if (!isWorkspaceMembers(members)) throw new Error("Project members returned invalid data");
    this.#elements.workspaceSharingPanel.setMembers(members);
  }

  async #inviteMember(email: string): Promise<void> {
    const response = await jsonFetch(`${apiBase}/members`, { email });
    await expectOk(response);
    this.#elements.workspaceSharingPanel.clearInvite();
    await this.#refreshMembers();
    this.#showToast("Collaborator invited to this project.");
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
    this.#elements.saveStatus.textContent = this.#pendingUpdates.size === 0 ? "Saved" : "Saving…";
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
    this.#elements.collaboratorSelections.replaceChildren();
    const selections = [...this.#remoteSelections.values()].filter((selection) => selection.revision === this.#revision);
    for (const selection of selections) {
      const file = this.#liveProjectFiles().find((candidate) => candidate.id === selection.fileId);
      const selected = file?.content.slice(selection.start, selection.end).replaceAll(/\s+/gu, " ").trim() ?? "";
      const range = selection.start === selection.end ? `caret at ${selection.start}` : `selection ${selection.start}–${selection.end}`;
      const item = document.createElement("span");
      item.className = "mr-4 inline-block";
      item.textContent = `Collaborator · ${file?.path ?? "project file"} · ${range}${selected ? ` · “${accessibleEvidenceExcerpt(selected)}”` : ""}`;
      this.#elements.collaboratorSelections.append(item);
    }
    this.#renderSourceEditorHighlight();
  }

  #activeEditorPresence(): readonly EditorPresenceRange[] {
    const target = this.#resolvedAuthoringTarget();
    const local: readonly EditorPresenceRange[] = target
      ? [{ collaboratorId: "local-author", start: target.start, end: target.end, local: true }]
      : [];
    return [
      ...local,
      ...[...this.#remoteSelections.values()].filter(
        (selection) => selection.revision === this.#revision && selection.fileId === this.#activeFileId,
      ),
    ];
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
    this.#elements.assistantTaskPanel.setGenerateDisabled(this.#candidateGenerationDisabled(stable, assistantWorkflowBusy(assistant)));
    this.#updateCandidateApplyButtons(stable, assistant.context.candidateDecision !== null);
  }

  #candidateGenerationDisabled(stable: boolean, assistantBusy: boolean): boolean {
    if (this.#modelDiscoveryBusy || assistantBusy) return true;
    if (!this.#draftsClaim() && !stable) return true;
    return !this.#canGenerateCandidate();
  }

  #updateCandidateApplyButtons(stable: boolean, candidateDecided: boolean): void {
    for (const apply of document.querySelectorAll<HTMLButtonElement>('[data-candidate-action="apply"]')) {
      const candidate = this.#snapshot?.candidates.find((item) => item.id === apply.dataset.candidateId);
      const applicable = candidate ? this.#candidateApplicable(candidate) : false;
      apply.dataset.candidateApplicable = String(applicable);
      apply.disabled = candidateDecided || (candidate?.operation !== "draft-claim" && !stable) || !applicable;
    }
  }

  #canGenerateCandidate(): boolean {
    const { instruction, operation } = this.#elements.assistantTaskPanel.value;
    if (!operation.enabled) return false;
    const selectedEvidence = this.#modelEvidence();
    return (
      this.#assistantEvidenceValid(operation.evidence, selectedEvidence.items) &&
      this.#modelEvidenceSelection.size <= maximumModelEvidenceItems &&
      Boolean(this.#elements.modelProviderSettings.value.model.trim()) &&
      this.#assistantTargetValid(operation.id, selectedEvidence.items) &&
      Boolean(instruction.trim())
    );
  }

  #assistantEvidenceValid(
    requirement: ReturnType<typeof assistantOperationDefinition>["evidence"],
    evidence: readonly ModelEvidenceItem[],
  ): boolean {
    if (requirement === "none" || requirement === "optional") return true;
    if (requirement === "annotations") return evidence.some((item) => item.kind === "annotation");
    return evidence.length > 0;
  }

  #assistantTargetValid(operationId: string, evidence: readonly ModelEvidenceItem[]): boolean {
    if (operationId === "build-table") return this.#assistantInsertionTarget() !== null && this.#validTableRequirements();
    if (operationId === "draft-claim") return evidence.some((item) => item.kind === "annotation");
    return this.#assistantAuthoringPassage() !== null;
  }

  #draftsClaim(): boolean {
    return this.#elements.assistantTaskPanel.value.operation.id === "draft-claim";
  }

  #updateModelTask(resetInstruction = false): void {
    const operation = this.#elements.assistantTaskPanel.value.operation;
    const draftsClaim = operation.id === "draft-claim";
    const phrasesPassage = operation.id === "phrase-passage";
    this.#elements.assistantPhrasingAttribution.hidden = !phrasesPassage;
    if (resetInstruction) {
      this.#assistantResultContext = null;
      this.#elements.assistantInteractiveResult.clear();
    }
    this.#elements.modelStatus.textContent = draftsClaim
      ? "Select at least one annotation to ground the claim draft."
      : phrasesPassage
        ? "Choose a rhetorical purpose, then compare contextual alternatives before opening exact review."
        : "Choose a target and the required evidence, then generate a reviewable draft.";
    this.#renderAssistantTargetPreview();
    this.#updateModelAvailability();
  }

  #renderAssistantTargetPreview(): void {
    if (this.#draftsClaim()) {
      this.#elements.assistantTaskPanel.setTargetPreview(
        "This operation uses selected annotation snapshots rather than a manuscript target.",
      );
      return;
    }
    if (this.#elements.assistantTaskPanel.value.operation.id === "build-table") {
      const target = this.#assistantInsertionTarget();
      this.#elements.assistantTaskPanel.setTargetPreview(
        target
          ? target.start === target.end
            ? "The reviewed table syntax will be inserted at the visible caret."
            : `The reviewed table syntax will replace ${target.end - target.start} selected characters.`
          : "Place the caret where the table should be inserted, or select text to replace.",
      );
      return;
    }
    const passage = this.#assistantAuthoringPassage();
    if (!passage) {
      this.#elements.assistantTaskPanel.setTargetPreview("Place the caret in manuscript text or select the exact passage to target.");
      return;
    }
    const target = this.#resolvedAuthoringTarget();
    const scope = target && target.start !== target.end ? "selection" : this.#assistantTargetScope();
    const excerpt = passage.excerpt.replace(/\s+/gu, " ").trim();
    this.#elements.assistantTaskPanel.setTargetPreview(
      `${assistantTargetScopeLabel(scope)} · “${excerpt.slice(0, 180)}${excerpt.length > 180 ? "…" : ""}”`,
    );
  }

  #restoreModelPreferences(): void {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(modelPreferencesStorageKey) ?? "null");
      if (!isRecord(stored)) return;
      this.#elements.modelProviderSettings.restore(stored);
    } catch {
      localStorage.removeItem(modelPreferencesStorageKey);
    }
  }

  #saveModelPreferences(): void {
    localStorage.setItem(modelPreferencesStorageKey, JSON.stringify(this.#elements.modelProviderSettings.value));
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

  async #discoverLlmModels(): Promise<void> {
    if (this.#modelDiscoveryBusy || assistantWorkflowBusy(this.#assistantWorkflow.getSnapshot())) return;
    this.#modelDiscoveryBusy = true;
    this.#elements.modelProviderSettings.setBusy(true);
    this.#updateModelAvailability();
    this.#elements.modelStatus.textContent = "Checking the local provider for loaded models…";
    this.#elements.modelProviderSettings.setStatus(this.#elements.modelStatus.textContent);
    try {
      const selectedModel = this.#elements.modelProviderSettings.value.model.trim();
      const models = await discoverOpenAICompatibleModels(this.#elements.modelProviderSettings.value.endpoint);
      this.#elements.modelProviderSettings.setModels(models, models.includes(selectedModel) ? selectedModel : (models[0] ?? selectedModel));
      this.#elements.modelStatus.textContent = models.length
        ? `Found ${models.length} loaded model${models.length === 1 ? "" : "s"}. Using ${this.#elements.modelProviderSettings.value.model}.`
        : "The local provider is reachable but reports no loaded models.";
      this.#elements.modelProviderSettings.setStatus(this.#elements.modelStatus.textContent);
      this.#saveModelPreferences();
    } catch (error) {
      this.#elements.modelStatus.textContent =
        error instanceof Error ? error.message : "Could not discover models from the local provider.";
      this.#elements.modelProviderSettings.setStatus(this.#elements.modelStatus.textContent);
    } finally {
      this.#modelDiscoveryBusy = false;
      this.#elements.modelProviderSettings.setBusy(false);
      this.#updateModelAvailability();
    }
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
    this.#elements.previewContextControls.setContext(
      filePreview ? `${filePreview.path} · ${filePreview.mode === "composed" ? "composed paper" : "isolated file"}` : "Preview",
    );
    if (publicationComposition && this.#snapshot) {
      this.#wordStatistics = publicationWordStatistics(publicationComposition, inputs.files);
      this.#renderExportStatistics();
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
    this.#elements.preview.textContent = renderedSource;
    this.#elements.previewContextControls.setSummary("Preview unavailable");
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
    this.#elements.preview.innerHTML = rendered.html;
    this.#previewSourceMap = inputs.filePreview?.sourceMap ?? [];
    this.#resolveProjectPreviewImages(inputs.renderedSource, inputs.filePreview?.sourceMap ?? []);
  }

  #renderPreviewDiagnostics(diagnostics: readonly Diagnostic[], filePreview: ProjectFilePreview | null): void {
    const diagnosticCount = diagnostics.length + (filePreview?.diagnostics.length ?? 0);
    this.#elements.previewContextControls.setSummary(
      diagnosticCount === 0 ? "No syntax errors" : `${diagnosticCount} ${diagnosticCount === 1 ? "issue" : "issues"}`,
    );
    this.#elements.diagnostics.setDiagnostics(diagnostics, filePreview);
  }

  #renderPreviewWorkspaceContext(publicationComposition: ProjectComposition | null, bibliography: string): void {
    const snapshot = this.#snapshot;
    if (snapshot) {
      const links = snapshot.links.map((link) => ({
        ...link,
        resolution: resolveManuscriptAnchor(this.#document, link.anchor),
      }));
      const claimLinks = snapshot.claimLinks.map((link) => ({
        ...link,
        resolution: resolveManuscriptAnchor(this.#document, link.anchor),
      }));
      this.#updateAnchorActions([...links, ...claimLinks]);
      this.#renderManuscriptComments(
        snapshot.comments.map((comment) => ({
          ...comment,
          resolution: resolveManuscriptAnchor(this.#document, comment.anchor),
        })),
      );
      this.#renderKnowledgeGraph(
        buildWorkspaceKnowledgeGraph({
          ...snapshot,
          source: publicationComposition?.content ?? snapshot.composition.content,
          bibliography,
          links,
          claimLinks,
        }),
      );
    }
  }

  #renderManuscriptMap(source = this.#currentComposedSource()): void {
    this.#elements.manuscriptMapPanel.setSource(source);
    this.#renderResearchDiarySummary();
    this.#renderResearchQuestions();
    this.#renderReviewerResponses();
  }

  #renderReviewerResponses(): void {
    const file = this.#previewProjectFiles().find((candidate) => candidate.path === reviewerResponsePath);
    this.#elements.reviewerResponsePanel.setData(reviewerResponseWorkflowData(file));
  }

  #currentComposedSource(): string {
    return this.#snapshot
      ? composeProject(this.#previewProjectFiles(), this.#snapshot.entryFileId, {}, this.#snapshot.reviewArtifactPins).content
      : this.#source.toString();
  }

  #renderResearchQuestions(): void {
    const file = this.#previewProjectFiles().find((candidate) => candidate.path === researchQuestionsPath);
    this.#elements.researchQuestionPanel.setData(researchQuestionWorkflowData(file));
  }

  #renderResearchDiarySummary(): void {
    const diary = this.#previewProjectFiles().find((file) => file.path === researchDiaryPath);
    this.#elements.openResearchDiary.textContent = diary ? "Open diary" : "Start diary";
    if (!diary) {
      this.#elements.researchDiaryEntryCount.textContent = "0";
      this.#elements.researchDiarySummary.textContent = "Keep progress, discoveries, questions, and the next action in portable Markdown.";
      return;
    }
    const summary = summarizeResearchDiary(diary.content);
    this.#elements.researchDiaryEntryCount.textContent = String(summary.entries);
    this.#elements.researchDiarySummary.textContent = `${summary.entries} dated ${summary.entries === 1 ? "entry" : "entries"} · ${summary.openQuestions} open ${summary.openQuestions === 1 ? "question" : "questions"} · ${summary.nextActions} next ${summary.nextActions === 1 ? "action" : "actions"}`;
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

  #downloadReviewerResponse(): void {
    const file = this.#previewProjectFiles().find((candidate) => candidate.path === reviewerResponsePath);
    if (!file) return;
    downloadTextFile("response-to-reviewers.md", reviewerResponseLetter(file.content));
    this.#showToast("Response letter exported.");
  }

  async #handleWritingWorkflowAction(detail: WritingWorkflowActionDetail): Promise<void> {
    if (detail.action === "select") {
      this.#focusProjectRange(detail.fileId, detail.from, detail.to);
      return;
    }
    if (detail.action === "download") {
      this.#downloadReviewerResponse();
      return;
    }
    if (detail.kind === "research-questions") await this.#openResearchQuestions();
    else await this.#openReviewerResponse();
  }

  async #createWorkflowFile(path: string, content: string): Promise<void> {
    const response = await jsonFetch(`${apiBase}/files`, { path, content });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error("Writing workflow returned an invalid workspace");
    const created = value.files.find((file) => file.path === path);
    if (!created) throw new Error("Writing workflow file was not created");
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
    const bounds = this.#elements.previewScroll.getBoundingClientRect();
    const centered = document
      .elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      ?.closest<HTMLElement>("[data-source-from][data-source-to]");
    const target = centered && this.#elements.preview.contains(centered) ? centered : this.#nearestPreviewSourceElement();
    if (target) this.#syncSourceFromPreviewElement(target, true);
  }

  #syncSourceFromPreviewElement(target: HTMLElement, centerEditor = false): void {
    const previewOffset = Number.parseInt(target.dataset.sourceFrom ?? "", 10);
    if (!Number.isSafeInteger(previewOffset)) return;
    const location = sourceLocationForPreviewOffset(this.#previewSourceMap, previewOffset);
    if (!location) return;
    this.#showWorkspaceSurface("authoring");
    this.#focusProjectRange(location.fileId, location.offset, location.offset);
    if (centerEditor) this.#centerSourceOffset(location.offset);
    this.#markPreviewSyncTarget(target);
  }

  #centerSourceOffset(sourceOffset: number): void {
    const beforeOffset = this.#elements.source.value.slice(0, Math.max(0, sourceOffset));
    const lineNumber = [...beforeOffset.matchAll(/\r\n|\r|\n/gu)].length + 1;
    const line = this.#elements.sourceHighlight.querySelector<HTMLElement>(`.source-editor-line[data-line-number="${lineNumber}"]`);
    if (!line) return;
    this.#elements.source.scrollTop = line.offsetTop + line.offsetHeight / 2 - this.#elements.source.clientHeight / 2;
  }

  #syncPreviewFromSource(explicit = true): void {
    if (!this.#previewSyncAvailable(explicit)) return;
    const offsets = this.#previewSyncOffsets(explicit);
    if (offsets.length === 0) return;
    const target = this.#nearestPreviewSourceElement(offsets);
    if (!target) return;
    const previewBounds = this.#elements.previewScroll.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    this.#elements.previewScroll.scrollTop += targetBounds.top + targetBounds.height / 2 - (previewBounds.top + previewBounds.height / 2);
    this.#markPreviewSyncTarget(target);
  }

  #previewSyncAvailable(explicit: boolean): boolean {
    const automaticSyncAvailable = explicit || this.#automaticPreviewSyncAvailable();
    return automaticSyncAvailable && this.#contextState.activeKey === RESEARCH_PREVIEW_KEY;
  }

  #previewSyncOffsets(explicit: boolean): readonly number[] {
    const fileId = this.#activeFileId ?? this.#snapshot?.entryFileId ?? "";
    const sourceOffset = explicit ? this.#sourceOffsetAtEditorCenter() : this.#elements.source.selectionEnd;
    return previewOffsetsForSourceLocation(this.#previewSourceMap, fileId, sourceOffset);
  }

  #sourceOffsetAtEditorCenter(): number {
    const center = this.#elements.source.scrollTop + this.#elements.source.clientHeight / 2;
    const lines = [...this.#elements.sourceHighlight.querySelectorAll<HTMLElement>(".source-editor-line")];
    let nearestLine = lines[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const line of lines) {
      const distance = Math.abs(line.offsetTop + line.offsetHeight / 2 - center);
      if (distance >= nearestDistance) continue;
      nearestLine = line;
      nearestDistance = distance;
    }
    const lineNumber = Number.parseInt(nearestLine?.dataset.lineNumber ?? "1", 10);
    if (!Number.isSafeInteger(lineNumber) || lineNumber <= 1) return 0;
    let offset = 0;
    for (let currentLine = 1; currentLine < lineNumber; currentLine += 1) {
      const newline = /\r\n|\r|\n/u.exec(this.#elements.source.value.slice(offset));
      if (!newline) return this.#elements.source.value.length;
      offset += newline.index + newline[0].length;
    }
    return offset;
  }

  #automaticPreviewSyncAvailable(): boolean {
    return (
      window.matchMedia("(min-width: 72rem)").matches &&
      this.#elements.workspaceSurfaces.dataset.layout === "split" &&
      this.#contextState.activeKey === RESEARCH_PREVIEW_KEY
    );
  }

  #nearestPreviewSourceElement(offsets: readonly number[] = []): HTMLElement | null {
    const viewportCenter = this.#elements.previewScroll.getBoundingClientRect().top + this.#elements.previewScroll.clientHeight / 2;
    const candidates = [...this.#elements.preview.querySelectorAll<HTMLElement>("[data-source-from][data-source-to]")]
      .filter((element) => offsets.length === 0 || this.#previewElementContainsOffset(element, offsets))
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          element,
          distance: Math.abs(bounds.top + bounds.height / 2 - viewportCenter),
          rangeLength: this.#previewSourceRangeLength(element),
        };
      });
    candidates.sort((left, right) => left.distance - right.distance || left.rangeLength - right.rangeLength);
    return candidates[0]?.element ?? null;
  }

  #previewElementContainsOffset(element: HTMLElement, offsets: readonly number[]): boolean {
    const from = Number.parseInt(element.dataset.sourceFrom ?? "", 10);
    const to = Number.parseInt(element.dataset.sourceTo ?? "", 10);
    return Number.isSafeInteger(from) && Number.isSafeInteger(to) && offsets.some((offset) => offset >= from && offset < to);
  }

  #previewSourceRangeLength(element: HTMLElement): number {
    const from = Number.parseInt(element.dataset.sourceFrom ?? "", 10);
    const to = Number.parseInt(element.dataset.sourceTo ?? "", 10);
    return Number.isSafeInteger(from) && Number.isSafeInteger(to) ? Math.max(0, to - from) : Number.POSITIVE_INFINITY;
  }

  #markPreviewSyncTarget(target: HTMLElement): void {
    if (this.#previewSyncHighlightTimer !== undefined) window.clearTimeout(this.#previewSyncHighlightTimer);
    this.#elements.preview.querySelector<HTMLElement>('[data-preview-sync-active="true"]')?.removeAttribute("data-preview-sync-active");
    target.dataset.previewSyncActive = "true";
    this.#previewSyncHighlightTimer = window.setTimeout(() => {
      target.removeAttribute("data-preview-sync-active");
      this.#previewSyncHighlightTimer = undefined;
    }, 900);
  }

  #updateAnchorActions(links: Array<PassageLink | ClaimPassageLink>): void {
    for (const link of links) {
      for (const action of document.querySelectorAll<HTMLButtonElement>(`[data-anchor-link-id="${CSS.escape(link.id)}"]`)) {
        action.disabled = link.resolution.status !== "resolved";
        action.dataset.anchorStatus = link.resolution.status;
        action.dataset.anchorMatch = anchorMatchState(link.resolution);
        action.textContent = anchorActionLabel(link.resolution);
      }
    }
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
    this.#elements.renameProjectFile.disabled = false;
    this.#elements.deleteProjectFile.disabled = entryActive;
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
    this.#elements.previewScroll.scrollTop = 0;
    void this.#renderPreview();
    this.#syncWorkspaceRoute("replace");
  }

  #openProjectFileDialog(mode: ProjectFileDialogMode, folderId?: string): void {
    const file = this.#snapshot?.files.find((item) => item.id === this.#activeFileId);
    const folder = this.#snapshot?.folders.find((item) => item.id === folderId);
    if (!this.#projectFileDialogResourcesAvailable(mode, file, folder)) return;
    this.#projectFileDialogMode = mode;
    this.#projectFolderId = folder?.id ?? null;
    this.#rememberProjectFileIncludeTarget(mode, file);
    void this.#elements.projectFileDialog.show(mode, this.#projectFileDialogPath(mode, file, folder));
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

  async #saveProjectFile({ path }: ProjectFileSave): Promise<void> {
    const activeId = this.#activeFileId;
    const mode = this.#projectFileDialogMode;
    const folderMode = projectFileDialogIsFolder(mode);
    const creating = projectFileDialogIsCreating(mode);
    const targetId = folderMode ? this.#projectFolderId : activeId;
    if (!creating && !targetId) return;
    const response = await this.#requestProjectFileSave(path, folderMode, creating, targetId);
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error("Project file operation returned an invalid workspace");
    this.#snapshot = value;
    this.#elements.projectFileDialog.close();
    this.#renderProjectFiles();
    const selected = value.files.find((file) => file.path === path);
    if (!this.#insertRememberedProjectInclude(mode, path) && selected) this.#selectProjectFile(selected.id);
    void this.#renderPreview();
    this.#showToast(projectFileSavedMessage(mode, path));
    this.#resetProjectFileDialogState();
  }

  async #requestProjectFileSave(path: string, folderMode: boolean, creating: boolean, targetId: string | null): Promise<Response> {
    const resource = folderMode ? "folders" : "files";
    const url = creating ? `${apiBase}/${resource}` : `${apiBase}/${resource}/${encodeURIComponent(targetId ?? "")}`;
    return await jsonFetch(url, { path }, creating ? "POST" : "PATCH");
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
    this.#projectFolderId = null;
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
        const response = await fetch(`${apiBase}/files/${encodeURIComponent(file.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        await expectOk(response);
        const value: unknown = await response.json();
        if (!isWorkspaceSnapshot(value)) throw new Error("Project file operation returned an invalid workspace");
        this.#snapshot = value;
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
        const response = await fetch(`${apiBase}/folders/${encodeURIComponent(folder.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        await expectOk(response);
        const value: unknown = await response.json();
        if (!isWorkspaceSnapshot(value)) throw new Error("Project folder operation returned an invalid workspace");
        this.#snapshot = value;
        this.#renderProjectFiles();
      },
    });
  }

  async #uploadProjectImages(): Promise<void> {
    const files = [...(this.#elements.projectImageUpload.files ?? [])];
    this.#elements.projectImageUpload.value = "";
    if (files.length === 0) return;
    let uploaded = 0;
    for (const file of files) {
      const response = await fetch(`${apiBase}/assets`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": file.type, "x-file-path": encodeURIComponent(`figures/${file.name}`) },
        body: file,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isWorkspaceSnapshot(value)) throw new Error("Image upload returned an invalid workspace");
      this.#snapshot = value;
      uploaded += 1;
    }
    this.#renderProjectFiles();
    void this.#renderPreview();
    this.#showToast(`Added ${uploaded} ${uploaded === 1 ? "image" : "images"} to figures/.`);
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
        const response = await fetch(`${apiBase}/assets/${encodeURIComponent(asset.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        await expectOk(response);
        const value: unknown = await response.json();
        if (!isWorkspaceSnapshot(value)) throw new Error("Image deletion returned an invalid workspace");
        this.#snapshot = value;
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
      label: "Undo",
      durationMs: deferredDeleteGraceMs,
      run: () => this.#undoDeferredDeletion(deletion.key),
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

  #resolveProjectPreviewImages(source: string, sourceMap: readonly CompositionSourceSpan[]): void {
    const snapshot = this.#snapshot;
    if (!snapshot || snapshot.assets.length === 0) return;
    const matches = [...source.matchAll(/!\[[^\]\r\n]*\]\((?<path><[^>\r\n]+>|[^\s)\r\n]+)(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/gu)];
    const images = this.#elements.preview.querySelectorAll<HTMLImageElement>("img");
    images.forEach((image, index) => this.#resolveProjectPreviewImage(image, matches[index], sourceMap, snapshot));
  }

  #resolveProjectPreviewImage(
    image: HTMLImageElement,
    match: RegExpMatchArray | undefined,
    sourceMap: readonly CompositionSourceSpan[],
    snapshot: WorkspaceSnapshot,
  ): void {
    const path = this.#projectPreviewImagePath(match, sourceMap, snapshot);
    if (!path) return;
    const asset = snapshot.assets.find((candidate) => candidate.path === path && !this.#hiddenProjectImageIds.has(candidate.id));
    if (asset) image.src = `${apiBase}/assets/${encodeURIComponent(asset.id)}`;
  }

  #projectPreviewImagePath(
    match: RegExpMatchArray | undefined,
    sourceMap: readonly CompositionSourceSpan[],
    snapshot: WorkspaceSnapshot,
  ): string | null {
    const requested = this.#requestedProjectPreviewImagePath(match);
    if (!match || !requested) return null;
    const span = sourceMap.length > 0 && match.index !== undefined ? sourceSpanAt(sourceMap, match.index) : undefined;
    const fromPath = span?.path ?? snapshot.files.find((file) => file.id === snapshot.entryFileId)?.path ?? "";
    return resolveProjectPath(fromPath, requested);
  }

  #requestedProjectPreviewImagePath(match: RegExpMatchArray | undefined): string | null {
    const requested = match?.groups?.path?.replace(/^<|>$/gu, "");
    if (!requested || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/iu.test(requested)) return null;
    return requested;
  }

  async #openProjectHistory(): Promise<void> {
    this.#projectHistoryWorkflow.send({ type: "OPEN" });
    const requestId = this.#projectHistoryWorkflow.getSnapshot().context.requestId;
    if (!this.#elements.projectHistoryDialog.open) this.#elements.projectHistoryDialog.showModal();
    this.#elements.projectHistoryPanel.showLoading();
    this.#updateProjectHistoryAvailability();
    try {
      const response = await fetch(`${apiBase}/history`, { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isProjectRevisionSummaries(value)) throw new Error("Project history returned an invalid timeline");
      this.#projectHistoryWorkflow.send({ type: "TIMELINE_READY", requestId });
      const history = this.#projectHistoryWorkflow.getSnapshot();
      if (!history.matches("ready") || history.context.requestId !== requestId) return;
      this.#elements.projectHistoryPanel.showTimeline(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load project history";
      this.#projectHistoryWorkflow.send({ type: "TIMELINE_FAILED", requestId, message });
      if (this.#projectHistoryWorkflow.getSnapshot().matches("failed")) {
        this.#elements.projectHistoryPanel.showError(message);
        this.#showToast(message);
      }
    } finally {
      this.#updateProjectHistoryAvailability();
    }
  }

  #startProjectHistoryOperation(operation: ProjectHistoryOperation): number | null {
    this.#projectHistoryWorkflow.send({ type: "START_OPERATION", operation });
    const history = this.#projectHistoryWorkflow.getSnapshot();
    if (history.context.operation !== operation) return null;
    this.#updateProjectHistoryAvailability();
    return history.context.requestId;
  }

  #finishProjectHistoryOperation(requestId: number): void {
    this.#projectHistoryWorkflow.send({ type: "OPERATION_DONE", requestId });
    this.#updateProjectHistoryAvailability();
  }

  #updateProjectHistoryAvailability(): void {
    const busy = projectHistoryBusy(this.#projectHistoryWorkflow.getSnapshot());
    this.#elements.projectHistoryDialog.setAttribute("aria-busy", String(busy));
    this.#elements.projectHistoryPanel.setBusy(busy);
  }

  #openExport(): void {
    this.#renderExportStatistics();
    if (!this.#elements.exportDialog.open) this.#elements.exportDialog.showModal();
  }

  #renderExportStatistics(): void {
    const statistics = this.#wordStatistics;
    this.#elements.wordCountBadge.textContent = statistics ? `${statistics.totalWords.toLocaleString()} words` : "… words";
    this.#elements.exportStatistics.setStatistics(statistics);
  }

  async #inspectProjectRevision(revision: number): Promise<void> {
    const requestId = this.#startProjectHistoryOperation({ kind: "inspect", revision });
    if (requestId === null) return;
    let value: ProjectRevisionContent;
    try {
      const response = await fetch(`${apiBase}/history/${revision}`, { credentials: "same-origin" });
      await expectOk(response);
      const result: unknown = await response.json();
      if (!isProjectRevisionContent(result)) throw new Error("Project revision returned an invalid snapshot");
      value = result;
      this.#finishProjectHistoryOperation(requestId);
      const history = this.#projectHistoryWorkflow.getSnapshot();
      if (!history.matches("ready") || history.context.requestId !== requestId) return;
    } catch (error) {
      this.#failProjectHistoryOperation(requestId, error, "Could not inspect project revision");
      return;
    }
    this.#elements.projectHistoryPanel.showRevision(value);
  }

  async #compareProjectHistory(from: number, to: number): Promise<void> {
    const requestId = this.#startProjectHistoryOperation({ kind: "compare", from, to });
    if (requestId === null) return;
    const value = await this.#projectHistoryComparison(requestId, String(from), String(to));
    if (value) this.#elements.projectHistoryPanel.showComparison(value);
  }

  async #projectHistoryComparison(requestId: number, from: string, to: string): Promise<ProjectRevisionDiff | null> {
    try {
      const response = await fetch(`${apiBase}/history/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
        credentials: "same-origin",
      });
      await expectOk(response);
      const result: unknown = await response.json();
      if (!isProjectRevisionDiff(result)) throw new Error("Project history returned an invalid comparison");
      this.#finishProjectHistoryOperation(requestId);
      const history = this.#projectHistoryWorkflow.getSnapshot();
      return history.matches("ready") && history.context.requestId === requestId ? result : null;
    } catch (error) {
      this.#failProjectHistoryOperation(requestId, error, "Could not compare project revisions");
      return null;
    }
  }

  async #handleProjectHistoryAction(operation: ProjectHistoryOperation): Promise<void> {
    if (operation.kind === "compare") {
      await this.#compareProjectHistory(operation.from, operation.to);
      return;
    }
    if (operation.kind === "inspect") await this.#inspectProjectRevision(operation.revision);
    else if (operation.kind === "milestone") await this.#nameProjectMilestone(operation.revision);
    else if (operation.kind === "branch") await this.#seedProjectRevision(operation.revision);
    else await this.#restoreProjectRevision(operation.revision);
  }

  async #nameProjectMilestone(revision: number): Promise<void> {
    const name = window.prompt(`Name immutable milestone v${revision}`)?.trim();
    if (!name) return;
    const description = window.prompt("Optional milestone description")?.trim() ?? "";
    const requestId = this.#startProjectHistoryOperation({ kind: "milestone", revision });
    if (requestId === null) return;
    try {
      const response = await jsonFetch(`${apiBase}/history/${revision}/milestones`, { name, description });
      await expectOk(response);
      this.#finishProjectHistoryOperation(requestId);
      this.#showToast(`Milestone “${name}” now identifies v${revision}.`);
      if (this.#elements.projectHistoryDialog.open) await this.#openProjectHistory();
    } catch (error) {
      this.#failProjectHistoryOperation(requestId, error, "Could not name the milestone");
    }
  }

  async #restoreProjectRevision(revision: number): Promise<void> {
    if (!window.confirm(`Restore v${revision} as a new head revision? Current history will be preserved.`)) return;
    const requestId = this.#startProjectHistoryOperation({ kind: "restore", revision });
    if (requestId === null) return;
    try {
      const response = await jsonFetch(`${apiBase}/history/${revision}/restore`, {});
      await expectOk(response);
      this.#finishProjectHistoryOperation(requestId);
      this.#showToast(`Restored v${revision} as a new head.`);
      window.location.reload();
    } catch (error) {
      this.#failProjectHistoryOperation(requestId, error, "Could not restore the revision");
    }
  }

  async #seedProjectRevision(revision: number): Promise<void> {
    const title = window.prompt(`Name the new project seeded from v${revision}`)?.trim();
    if (!title) return;
    const requestId = this.#startProjectHistoryOperation({ kind: "branch", revision });
    if (requestId === null) return;
    try {
      const response = await jsonFetch(`${apiBase}/history/${revision}/seed`, { title });
      await expectOk(response);
      const value: unknown = await response.json();
      const summaries: unknown = [value];
      if (!isWorkspaceSummaries(summaries) || !summaries[0]) throw new Error("Project branch returned an invalid workspace");
      this.#finishProjectHistoryOperation(requestId);
      window.location.assign(summaries[0].href);
    } catch (error) {
      this.#failProjectHistoryOperation(requestId, error, "Could not branch from the revision");
    }
  }

  #failProjectHistoryOperation(requestId: number, error: unknown, fallback: string): void {
    const message = error instanceof Error ? error.message : fallback;
    this.#projectHistoryWorkflow.send({ type: "OPERATION_FAILED", requestId, message });
    this.#updateProjectHistoryAvailability();
    const history = this.#projectHistoryWorkflow.getSnapshot();
    if (history.matches("ready") && history.context.requestId === requestId) this.#showToast(message);
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
    if (!this.#librarySnapshot?.references.some((reference) => reference.id === referenceId) && !this.#showArchivedReferences) {
      this.#showArchivedReferences = true;
      this.#elements.showArchivedReferences.setAttribute("aria-pressed", "true");
      await this.#refreshReferenceLibrary();
    }
    this.#elements.referenceLibraryFilters.reset();
    this.#expandedLibraryReferences.add(referenceId);
    this.#renderReferenceLibrary();
    const card = this.#elements.referenceLibraryList.querySelector<HTMLElement>(`[data-reference-id="${CSS.escape(referenceId)}"]`);
    if (!card) {
      this.#showToast("That reference is no longer available in the Library.");
      return false;
    }
    card.tabIndex = -1;
    card.scrollIntoView({ block: "center" });
    card.focus({ preventScroll: true });
    return true;
  }

  async #refreshReferenceLibrary(): Promise<void> {
    const response = await fetch(`/api/library${this.#showArchivedReferences ? "?archived=include" : ""}`, {
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
    await this.#referenceLibraryRenderComplete();
    this.#renderResearchContext();
    this.#syncWorkspaceRoute("replace");
  }

  async #discoverLibraryReferences(query: ReferenceDiscoveryQuery): Promise<void> {
    this.#elements.libraryDiscoveryResults.setResults([]);
    try {
      const response = await jsonFetch("/api/library/discovery", query);
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isReferenceDiscoveryResults(value)) throw new Error("Reference provider returned invalid discovery results");
      this.#elements.libraryDiscoveryResults.setResults(value);
      this.#elements.libraryDiscoverySearch.showResults(value.length);
    } catch (error) {
      this.#elements.libraryDiscoverySearch.showError(error instanceof Error ? error.message : "Reference search failed");
    }
  }

  #renderReferenceLibrary(): void {
    const library = this.#librarySnapshot;
    if (!library) return;
    this.#elements.citationNetworkPanel.setReferences(library.references.map(({ id, title }) => ({ id, title: bibTeXDisplayText(title) })));
    const types = [...new Set(library.references.map((reference) => reference.type))].sort();
    this.#elements.referenceLibraryFilters.setTypes(types);
    const filters = this.#elements.referenceLibraryFilters.value;
    const linked = new Set(this.#snapshot?.projectReferences.map((reference) => reference.referenceId) ?? []);
    const references = filterReferenceLibrary(library, linked, filters);
    this.#elements.referenceLibraryFilters.setCount(references.length, library.references.length);
    this.#elements.referenceLibraryList.replaceChildren();
    if (references.length === 0) {
      this.#elements.referenceLibraryList.append(
        emptyState(library.references.length === 0 ? "No references. Use Add reference to begin." : "No matching references."),
      );
    }
    for (const reference of references) this.#elements.referenceLibraryList.append(this.#referenceLibraryCard(reference));

    const unidentified = library.artifacts.filter((artifact) => artifact.referenceId === null);
    this.#elements.unidentifiedPdfList.setData(unidentified, library.references);
  }

  async #referenceLibraryRenderComplete(): Promise<void> {
    const components = [
      ...this.#elements.referenceLibraryList.querySelectorAll<LibraryReferenceSummary>("library-reference-summary"),
      ...this.#elements.referenceLibraryList.querySelectorAll<LibraryReferenceMetadataEditor>("library-reference-metadata-editor"),
      ...this.#elements.referenceLibraryList.querySelectorAll<LibraryReferencePersonalFields>("library-reference-personal-fields"),
      ...this.#elements.referenceLibraryList.querySelectorAll<LibraryReferenceResearchRows>("library-reference-research-rows"),
    ];
    await Promise.all(components.map(({ updateComplete }) => updateComplete));
    const pdfRows = this.#elements.referenceLibraryList.querySelectorAll<LibraryReferencePdfRows>("library-reference-pdf-rows");
    await Promise.all([...pdfRows].map(({ updateComplete }) => updateComplete));
  }

  async #openCitationNetwork(): Promise<void> {
    this.#elements.citationNetwork.classList.remove("hidden");
    await this.#refreshCitationNetwork();
    this.#elements.citationNetwork.scrollIntoView({ block: "start" });
  }

  async #refreshCitationNetwork(): Promise<void> {
    const filter = this.#filterProjectCitations ? `?projectId=${encodeURIComponent(workspaceId)}` : "";
    const response = await fetch(`/api/library/citation-network${filter}`, { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isCitationNetwork(value)) throw new Error("Citation network returned an invalid representation");
    this.#citationNetwork = value;
    this.#renderCitationNetwork();
  }

  #renderCitationNetwork(): void {
    this.#elements.citationNetworkPanel.setData({
      expansion: this.#citationExpansion,
      filterProject: this.#filterProjectCitations,
      network: this.#citationNetwork,
      referenceTitles: Object.fromEntries((this.#librarySnapshot?.references ?? []).map(({ id, title }) => [id, title])),
    });
  }

  async #recordCitationAssertion(detail: Extract<CitationNetworkAction, { readonly action: "record" }>): Promise<void> {
    const { citedReferenceId, citingReferenceId, polarity } = detail;
    if (!citingReferenceId || !citedReferenceId || citingReferenceId === citedReferenceId) {
      this.#showToast("Choose two different sources for the citation assertion.");
      return;
    }
    const response = await jsonFetch("/api/library/citation-assertions", {
      citingReferenceId,
      citedReferenceId,
      polarity,
      evidenceState: "confirmed",
      method: "manual",
      observedAt: new Date().toISOString(),
      sourceKind: "researcher",
      sourceId: `manual:${crypto.randomUUID()}`,
      sourceLocator: "Kirjolab researcher assertion",
      confidence: null,
    });
    await expectOk(response);
    await this.#refreshCitationNetwork();
    this.#showToast("Citation assertion recorded with researcher provenance.");
  }

  async #reviewCitationAssertion(assertionId: string, decision: "confirmed" | "rejected"): Promise<void> {
    const note = window.prompt(`${decision === "confirmed" ? "Confirmation" : "Rejection"} note (optional)`) ?? "";
    const response = await jsonFetch(`/api/library/citation-assertions/${encodeURIComponent(assertionId)}/review`, { decision, note });
    await expectOk(response);
    await this.#refreshCitationNetwork();
    this.#showToast(`Citation assertion ${decision}.`);
  }

  async #expandCitationReference(referenceId: string): Promise<void> {
    const response = await jsonFetch(`/api/library/references/${encodeURIComponent(referenceId)}/citation-expansions`, {});
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isCitationExpansionResult(value)) throw new Error("Citation expansion returned an invalid representation");
    this.#citationExpansion = value;
    await this.#refreshCitationNetwork();
    this.#showToast(
      value.unmatched.length > 0
        ? `Review ${value.unmatched.length} new reference${value.unmatched.length === 1 ? "" : "s"} from this seed.`
        : "Known Crossref relationships added to the shared citation network.",
    );
  }

  async #acceptCitationCandidate(expansion: CitationExpansionResult, candidate: CitationExpansionCandidate): Promise<void> {
    this.#elements.citationNetworkPanel.setCandidateSaving(candidate.doi, true);
    try {
      const response = await jsonFetch(`/api/library/references/${encodeURIComponent(expansion.seedReferenceId)}/citation-candidates`, {
        doi: candidate.doi,
        responseId: expansion.responseId,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isCitationCandidateAcceptance(value)) throw new Error("Citation candidate returned an invalid representation");
      this.#citationExpansion = {
        ...expansion,
        assertions: [...expansion.assertions, value.assertion],
        unmatched: expansion.unmatched.filter((item) => item.doi !== candidate.doi),
      };
      await this.#refreshReferenceLibrary();
      await this.#refreshCitationNetwork();
      this.#showToast(value.created ? "Reference saved with its discovery trail." : "Existing reference linked to its discovery trail.");
    } catch (error) {
      this.#elements.citationNetworkPanel.setCandidateSaving(candidate.doi, false);
      this.#showToast(error instanceof Error ? error.message : "Could not save citation candidate");
    }
  }

  #referenceLibraryCard(reference: BibliographicRecord): HTMLElement {
    const card = document.createElement("article");
    card.className = "library-reference-row";
    card.dataset.referenceId = reference.id;
    const keyState = this.#librarySnapshot?.referenceKeyStates[reference.id] ?? "final";
    const linked = this.#snapshot?.projectReferences.find((item) => item.referenceId === reference.id);
    const artifacts = this.#librarySnapshot?.artifacts.filter((artifact) => artifact.referenceId === reference.id) ?? [];
    const displayTitle = bibTeXDisplayText(reference.title) || "Untitled reference";
    const summary = new LibraryReferenceSummary();
    summary.className = "contents";
    summary.setData({
      keyState,
      linkedCitationAlias: linked?.citationAlias ?? null,
      primaryArtifact: artifacts[0] ?? null,
      reference,
      workspace: appMode === "workspace",
    });
    card.append(summary, this.#referenceMetadataEditor(reference, displayTitle, linked, artifacts));
    return card;
  }

  #referenceMetadataEditor(
    reference: BibliographicRecord,
    displayTitle: string,
    linked: WorkspaceSnapshot["projectReferences"][number] | undefined,
    artifacts: readonly LibraryPdfArtifact[],
  ): HTMLElement {
    const metadataEditor = document.createElement("details");
    metadataEditor.className = "library-reference-details";
    metadataEditor.open = this.#expandedLibraryReferences.has(reference.id);
    metadataEditor.addEventListener("toggle", () => {
      if (metadataEditor.open) this.#expandedLibraryReferences.add(reference.id);
      else this.#expandedLibraryReferences.delete(reference.id);
    });
    const metadataSummary = document.createElement("summary");
    metadataSummary.textContent = "Details";
    metadataSummary.title = "Edit metadata, organization, reading state, and attached research";
    metadataEditor.append(metadataSummary);
    const metadataBody = document.createElement("div");
    metadataBody.className = "library-reference-detail-body";
    metadataEditor.append(metadataBody);
    const metadataFields = new LibraryReferenceMetadataEditor();
    metadataFields.className = "contents";
    metadataFields.setData(reference, displayTitle, artifacts[0] ?? null);
    metadataBody.append(metadataFields);
    const personalFields = new LibraryReferencePersonalFields();
    personalFields.className = "contents";
    personalFields.setData({
      archived: reference.archivedAt !== null,
      collections: this.#librarySnapshot?.collections[reference.id] ?? [],
      displayTitle,
      reading: this.#librarySnapshot?.reading.find((item) => item.referenceId === reference.id) ?? null,
      referenceId: reference.id,
      tags: this.#librarySnapshot?.tags[reference.id] ?? [],
    });
    metadataBody.append(personalFields);
    this.#appendReferenceResources(metadataBody, reference, linked, artifacts);
    return metadataEditor;
  }

  #appendReferenceResources(
    metadataBody: HTMLElement,
    reference: BibliographicRecord,
    linked: WorkspaceSnapshot["projectReferences"][number] | undefined,
    artifacts: readonly LibraryPdfArtifact[],
  ): void {
    const notes = this.#librarySnapshot?.notes.filter((note) => note.referenceId === reference.id) ?? [];
    const highlights = this.#librarySnapshot?.highlights.filter((highlight) => highlight.referenceId === reference.id) ?? [];
    const webSource = this.#librarySnapshot?.webSources.find((source) => source.referenceId === reference.id);
    const webSnapshots = [...(this.#librarySnapshot?.webSnapshots.filter((snapshot) => snapshot.referenceId === reference.id) ?? [])].sort(
      (left, right) => right.accessedAt.localeCompare(left.accessedAt),
    );
    const researchRows = new LibraryReferenceResearchRows();
    researchRows.className = "contents";
    researchRows.setData({
      artifacts,
      canonicalUrl: webSource?.canonicalUrl ?? null,
      highlights,
      linkedSnapshotId: linked?.snapshot.webSnapshot?.id ?? null,
      notes,
      reference,
      referenceLinked: linked !== undefined,
      researchShares: this.#snapshot?.researchShares ?? [],
      webSnapshots,
    });
    metadataBody.append(researchRows);
  }

  async #importIntoReferenceLibrary(): Promise<void> {
    const file = this.#elements.libraryBibliographyUpload.files?.[0];
    if (!file) return;
    const response = await jsonFetch("/api/library/import", { bibtex: await file.text() });
    await expectOk(response);
    this.#elements.libraryBibliographyUpload.value = "";
    await this.#refreshReferenceLibrary();
    this.#showToast("References imported into your private library. Add only the ones this project uses.");
  }

  async #importCslJson(): Promise<void> {
    const file = this.#elements.libraryCslUpload.files?.[0];
    if (!file) return;
    const response = await fetch("/api/library/import/csl-json", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: await file.text(),
    });
    await expectOk(response);
    this.#elements.libraryCslUpload.value = "";
    await this.#refreshReferenceLibrary();
    this.#showToast("CSL JSON imported into the canonical library.");
  }

  async #importLibraryArchive(): Promise<void> {
    const file = this.#elements.libraryArchiveUpload.files?.[0];
    if (!file) return;
    const response = await fetch("/api/library/import/archive", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/zip" },
      body: file,
    });
    await expectOk(response);
    this.#elements.libraryArchiveUpload.value = "";
    await this.#refreshReferenceLibrary();
    this.#showToast("Portable library metadata restored.");
  }

  async #uploadLibraryPdfs(files: readonly File[]): Promise<void> {
    if (files.length === 0 || this.#libraryPdfUploadBusy) return;
    this.#beginLibraryPdfUpload();
    try {
      const result = await uploadPdfBatch(
        files,
        (file) => this.#uploadLibraryPdf(file),
        (snapshot) => this.#elements.libraryPdfUploadStatus.showProgress(snapshot, false),
      );
      this.#failedLibraryPdfUploads = result.failed;
      if (result.added.length > 0 || result.existing.length > 0) await this.#refreshReferenceLibrary();
      this.#elements.libraryPdfUploadStatus.showProgress(
        { items: result.items, completed: result.items.length, total: result.items.length },
        result.failed.length > 0,
      );
      this.#showToast(libraryPdfUploadMessage(result.added.length, result.existing.length, result.failed.length));
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF intake failed";
      this.#elements.libraryPdfUploadStatus.showError(message);
      this.#showToast(message);
    } finally {
      this.#finishLibraryPdfUpload();
    }
  }

  #beginLibraryPdfUpload(): void {
    this.#elements.libraryPdfUpload.value = "";
    this.#elements.libraryPdfUpload.disabled = true;
    this.#elements.libraryPdfUploadStatus.setBusy(true);
    this.#elements.libraryPdfDropzone.dataset.busy = "true";
    this.#libraryPdfUploadBusy = true;
    this.#failedLibraryPdfUploads = [];
  }

  async #uploadLibraryPdf(
    file: File,
  ): Promise<{ disposition: "created" } | { disposition: "existing"; referenceId: string; referenceKey: string; archived: boolean }> {
    const response = await fetch("/api/library/pdfs", {
      method: "POST",
      headers: {
        "content-type": "application/pdf",
        "content-length": String(file.size),
        "x-file-name": encodeURIComponent(file.name),
      },
      body: file,
      credentials: "same-origin",
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isPdfDraftResult(value)) throw new Error("PDF intake returned an invalid result");
    if (value.created) return { disposition: "created" };
    return {
      disposition: "existing",
      referenceId: value.reference.id,
      referenceKey: value.reference.referenceKey,
      archived: value.reference.archivedAt !== null,
    };
  }

  #finishLibraryPdfUpload(): void {
    this.#libraryPdfUploadBusy = false;
    this.#elements.libraryPdfUpload.disabled = false;
    this.#elements.libraryPdfUploadStatus.setBusy(false);
    delete this.#elements.libraryPdfDropzone.dataset.busy;
  }

  async #revealExistingPdfReference(existing: ExistingPdfUpload): Promise<void> {
    if (existing.archived && !this.#showArchivedReferences) {
      this.#showArchivedReferences = true;
      this.#elements.showArchivedReferences.setAttribute("aria-pressed", "true");
      await this.#refreshReferenceLibrary();
    }
    this.#elements.referenceLibraryFilters.reset(existing.referenceKey);
    this.#renderReferenceLibrary();
    const card = this.#elements.referenceLibraryList.querySelector<HTMLElement>(`[data-reference-id="${existing.referenceId}"]`);
    if (!card) {
      this.#showToast(`Library source ${existing.referenceKey} is not available.`);
      return;
    }
    card.tabIndex = -1;
    card.scrollIntoView({ block: "nearest" });
    card.focus({ preventScroll: true });
  }

  async #refinePdfMetadata(
    reference: BibliographicRecord,
    artifact: LibraryPdfArtifact,
    editor: LibraryReferenceMetadataEditor,
  ): Promise<void> {
    this.#metadataRefinement.send({ type: "START", referenceId: reference.id, artifactId: artifact.id });
    const requestId = this.#metadataRefinement.getSnapshot().context.requestId;
    editor.showStatus("Refine metadata", "Step 1 of 2 · Reading embedded metadata and opening pages…");
    try {
      const candidates = await extractPdfMetadata(`/api/library/pdfs/${encodeURIComponent(artifact.id)}`);
      this.#metadataRefinement.send({ type: "LOCAL_READY", requestId, local: candidates });
      if (!this.#metadataRefinement.getSnapshot().matches("discovering")) return;
      editor.showStatus("Refine metadata", "Step 2 of 2 · Searching scholarly metadata…");
      await this.#discoverPdfMetadata(reference, artifact, candidates, editor, requestId);
    } catch (error) {
      const message = error instanceof Error ? `Metadata could not be refined: ${error.message}` : "Metadata could not be refined.";
      this.#metadataRefinement.send({ type: "FAIL", requestId, message });
      if (!this.#metadataRefinement.getSnapshot().matches("failed")) return;
      editor.showStatus("Refine metadata", message);
    }
  }

  async #discoverPdfMetadata(
    reference: BibliographicRecord,
    artifact: LibraryPdfArtifact,
    candidates: PdfMetadataCandidates,
    editor: LibraryReferenceMetadataEditor,
    requestId: number,
  ): Promise<void> {
    try {
      const response = await jsonFetch(`/api/library/references/${encodeURIComponent(reference.id)}/metadata-refinement/preview`, {
        artifactId: artifact.id,
        candidates: this.#pdfMetadataCandidatePayload(candidates),
      });
      await expectOk(response);
      const preview: unknown = await response.json();
      if (!isMetadataRefinementPreview(preview)) throw new Error("Metadata providers returned an invalid preview");
      this.#metadataRefinement.send({ type: "DISCOVERY_READY", requestId, preview });
      if (!this.#metadataRefinement.getSnapshot().matches("reviewing")) return;
      editor.showReview(artifact, candidates, preview, "", response.headers.get("x-kirjolab-metadata-cache") === "hit");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider lookup failed.";
      this.#metadataRefinement.send({ type: "DISCOVERY_FAILED", requestId, message });
      if (!this.#metadataRefinement.getSnapshot().matches("reviewing")) return;
      editor.showReview(artifact, candidates, { referenceId: reference.id, artifactId: artifact.id, candidates: [] }, message);
    }
  }

  #pdfMetadataCandidatePayload(candidates: PdfMetadataCandidates): Partial<PdfMetadataCandidates> {
    return {
      ...(candidates.title ? { title: candidates.title } : {}),
      ...(candidates.authors.length > 0 ? { authors: candidates.authors } : {}),
      ...(candidates.year ? { year: candidates.year } : {}),
      ...(candidates.doi ? { doi: candidates.doi } : {}),
    };
  }

  async #applyProviderMetadata(
    referenceId: string,
    candidates: readonly MetadataRefinementCandidate[],
    selections: readonly ProviderMetadataSelection[],
  ): Promise<void> {
    if (selections.length === 0) {
      this.#showToast("Select at least one provider metadata field to apply.");
      return;
    }
    this.#metadataRefinement.send({ type: "APPLY", referenceId });
    if (!this.#metadataRefinement.getSnapshot().matches("applying")) {
      this.#showToast("This metadata preview is no longer active. Refine the PDF again.");
      return;
    }
    try {
      const response = await jsonFetch(`/api/library/references/${encodeURIComponent(referenceId)}/metadata-refinement/accept`, {
        selections: selections.map(({ candidateIndex, fields }) => {
          const candidate = candidates[candidateIndex]!;
          return {
            provider: candidate.provider,
            doi: candidate.metadata.doi,
            metadataFingerprint: candidate.metadataFingerprint,
            fields,
          };
        }),
      });
      await expectOk(response);
      this.#metadataRefinement.send({ type: "APPLIED" });
      await this.#refreshBibliographicMetadata();
      this.#showToast("Scholarly metadata applied with field-level provenance.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not apply scholarly metadata";
      this.#metadataRefinement.send({ type: "APPLY_FAILED", message });
      this.#showToast(message);
    }
  }

  async #applyPdfMetadata(
    referenceId: string,
    artifactId: string,
    fields: Readonly<Partial<Record<string, string | readonly string[]>>>,
  ): Promise<void> {
    if (Object.keys(fields).length === 0) {
      this.#showToast("Select at least one PDF metadata field to apply.");
      return;
    }
    const response = await jsonFetch(`/api/library/references/${encodeURIComponent(referenceId)}/pdf-metadata`, { artifactId, fields });
    await expectOk(response);
    await this.#refreshBibliographicMetadata();
    this.#showToast("Selected PDF metadata applied with provenance.");
  }

  async #captureWebSource(url: string): Promise<void> {
    await this.#captureWebSourceInput(url);
    this.#elements.webSourceCapture.clear();
  }

  async #captureWebSourceInput(url: string): Promise<void> {
    const response = await jsonFetch("/api/library/web-sources", { url });
    await expectOk(response);
    await this.#refreshReferenceLibrary();
    this.#showToast("Web source captured privately with an immutable access timestamp.");
  }

  async #pinProjectWebSnapshot(referenceId: string, snapshotId: string): Promise<void> {
    const response = await jsonFetch(`${apiBase}/references/${encodeURIComponent(referenceId)}/web-snapshot`, { snapshotId });
    await this.#acceptWorkspaceMutation(response);
    this.#renderReferenceLibrary();
    this.#showToast("This exact web capture is pinned to the project.");
  }

  async #compareWebSnapshots(beforeId: string, afterId: string): Promise<void> {
    const response = await fetch(`/api/library/web-snapshots/${encodeURIComponent(beforeId)}/compare/${encodeURIComponent(afterId)}`, {
      credentials: "same-origin",
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isWebSnapshotComparisonResponse(value)) throw new Error("Web snapshot comparison returned an invalid result");
    this.#elements.webSnapshotComparison.show(value.comparison);
  }

  async #identifyLibraryPdf(artifactId: string, referenceId: string): Promise<void> {
    if (!referenceId) return;
    const response = await jsonFetch(`/api/library/pdfs/${encodeURIComponent(artifactId)}/identify`, { referenceId });
    await expectOk(response);
    await this.#refreshReferenceLibrary();
    this.#showToast("PDF identified and attached to the private source record.");
  }

  async #linkLibraryReference(referenceId: string, citationAlias: string): Promise<void> {
    const response = await jsonFetch(`${apiBase}/references`, { referenceId, citationAlias });
    await this.#acceptWorkspaceMutation(response);
    this.#renderReferenceLibrary();
    this.#showToast(`Added :cite[${citationAlias.trim()}] to this project's reference set.`);
  }

  async #unlinkProjectReference(referenceId: string): Promise<void> {
    const response = await fetch(`${apiBase}/references/${encodeURIComponent(referenceId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    await this.#acceptWorkspaceMutation(response);
    this.#renderReferenceLibrary();
    this.#showToast("Reference removed from this project; the private library record remains.");
  }

  async #saveReferenceTags(referenceId: string, value: string): Promise<void> {
    const response = await jsonFetch(
      `/api/library/references/${encodeURIComponent(referenceId)}/tags`,
      {
        tags: value
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      },
      "PUT",
    );
    await expectOk(response);
    await this.#refreshReferenceLibrary();
    this.#showToast("Private tags saved.");
  }

  async #saveReferenceCollections(referenceId: string, value: string): Promise<void> {
    const collections = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    await expectOk(await jsonFetch(`/api/library/references/${encodeURIComponent(referenceId)}/collections`, { collections }, "PUT"));
    await this.#refreshReferenceLibrary();
    this.#showToast("Collections saved.");
  }

  async #saveReferenceMetadata(referenceId: string, value: LibraryReferenceMetadataValue): Promise<void> {
    const response = await jsonFetch(
      `/api/library/references/${encodeURIComponent(referenceId)}`,
      {
        type: value.type.trim(),
        title: value.title.trim(),
        authors: value.authors
          .split(";")
          .map((item) => item.trim())
          .filter(Boolean),
        year: value.year.trim(),
        venue: value.venue.trim(),
        doi: value.doi.trim(),
        url: value.url.trim(),
        abstract: value.abstract.trim(),
      },
      "PATCH",
    );
    await expectOk(response);
    await this.#refreshBibliographicMetadata();
    this.#showToast("Bibliographic details saved with manual provenance.");
  }

  async #refreshBibliographicMetadata(): Promise<void> {
    await this.#refreshReferenceLibrary();
    await this.#refreshSnapshot();
  }

  async #saveReadingState(
    referenceId: string,
    status: ReferenceLibrarySnapshot["reading"][number]["status"],
    rating: number | null,
    priority: ReferenceLibrarySnapshot["reading"][number]["priority"],
  ): Promise<void> {
    await expectOk(
      await jsonFetch(
        `/api/library/references/${encodeURIComponent(referenceId)}/reading`,
        {
          status,
          rating,
          priority,
        },
        "PUT",
      ),
    );
    await this.#refreshReferenceLibrary();
    this.#showToast("Reading state saved.");
  }

  async #createReferenceNote(referenceId: string, body: string): Promise<void> {
    if (!body.trim()) return;
    const response = await jsonFetch(`/api/library/references/${encodeURIComponent(referenceId)}/notes`, { body });
    await expectOk(response);
    await this.#refreshReferenceLibrary();
    this.#showToast("Private note saved. It is not visible to project collaborators.");
  }

  async #setArtifactRights(artifactId: string, rightsValue: string): Promise<void> {
    if (rightsValue !== "private" && rightsValue !== "unknown" && rightsValue !== "shareable") return;
    const response = await jsonFetch(`/api/library/pdfs/${encodeURIComponent(artifactId)}/rights`, { rights: rightsValue }, "PUT");
    await expectOk(response);
    await this.#refreshReferenceLibrary();
  }

  async #sharePrivateResearch(referenceId: string, kind: "note" | "highlight" | "web-snapshot", resourceId: string): Promise<void> {
    const response = await jsonFetch(`${apiBase}/research-shares`, { referenceId, kind, resourceId });
    await this.#acceptWorkspaceMutation(response);
    this.#renderReferenceLibrary();
    this.#showToast("Private research snapshot shared explicitly with this project.");
  }

  async #revokePrivateResearch(shareId: string): Promise<void> {
    const response = await fetch(`${apiBase}/research-shares/${encodeURIComponent(shareId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    await this.#acceptWorkspaceMutation(response);
    this.#renderReferenceLibrary();
    this.#showToast("Share revoked for future project access; prior revision history remains intact.");
  }

  async #setReferenceArchived(referenceId: string, archived: boolean, title: string): Promise<void> {
    if (archived && !window.confirm(`Archive “${title}”? It will be hidden from the active Library until you restore it.`)) return;
    const response = await jsonFetch(`/api/library/references/${encodeURIComponent(referenceId)}`, { archived }, "PATCH");
    await expectOk(response);
    await this.#refreshReferenceLibrary();
    this.#showToast(archived ? "Reference archived." : "Reference restored.");
  }

  async #acceptWorkspaceMutation(response: Response): Promise<void> {
    await expectOk(response);
    const value: unknown = await response.json();
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
    const validModelEvidence = new Set([
      ...this.#snapshot.annotations.map((annotation) => modelEvidenceKey("annotation", annotation.id)),
      ...this.#snapshot.claims.map((claim) => modelEvidenceKey("claim", claim.id)),
    ]);
    for (const key of this.#modelEvidenceSelection) {
      if (!validModelEvidence.has(key)) this.#modelEvidenceSelection.delete(key);
    }
    this.#renderProjectEvidence();
    this.#renderPublications(this.#snapshot.publications);
    this.#renderClaims(this.#snapshot.claims, this.#snapshot.claimLinks);
    this.#renderManuscriptComments(this.#snapshot.comments);
    this.#renderCandidates(this.#snapshot.candidates);
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

  #renderProjectEvidence(): void {
    if (!this.#snapshot) return;
    const { annotations, links, pdfs } = this.#snapshot;
    this.#elements.projectEvidencePanel.setEvidence({
      annotations,
      links,
      pdfs,
      selectedEvidenceKeys: this.#modelEvidenceSelection,
    });
    this.#elements.projectAnnotationForm.setPdfs(pdfs, this.#renderedPdfId ?? "");
  }

  async #removePdf(pdf: PdfResource): Promise<void> {
    if (!this.#snapshot) return;
    const annotations = this.#snapshot.annotations.filter((annotation) => annotation.pdfId === pdf.id).length;
    const references = this.#snapshot.publicationPdfLinks.filter((link) => link.pdfId === pdf.id).length;
    if (annotations + references > 0) {
      this.#showToast(`Cannot remove ${pdf.name}: remove ${annotations} highlight(s) and ${references} reference link(s) first.`);
      return;
    }
    if (!confirm(`Remove ${pdf.name} from this project? The imported PDF bytes will be deleted.`)) return;
    const response = await fetch(`${apiBase}/pdfs/${encodeURIComponent(pdf.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast(`${pdf.name} removed from the project.`);
  }

  #renderPublications(publications: PublicationResource[]): void {
    this.#elements.publicationCount.textContent = String(publications.length);
    this.#elements.publicationListPanel.setPublications({
      projectReferences: this.#snapshot?.projectReferences ?? [],
      publications,
    });
  }

  #openAnnotationEvidence(annotation: AnnotationResource): void {
    const pdf = this.#snapshot?.pdfs.find((item) => item.id === annotation.pdfId);
    if (pdf) void this.#showPaper(pdf, annotation.page, annotation.id);
  }

  #editAnnotation(annotation: AnnotationResource): void {
    this.#editingAnnotationId = annotation.id;
    this.#elements.projectAnnotationForm.showAnnotation(annotation);
    this.#openAnnotationEvidence(annotation);
  }

  async #deleteAnnotation(annotation: AnnotationResource): Promise<void> {
    const claims = this.#snapshot?.claimEvidenceLinks.filter((link) => link.annotationId === annotation.id).length ?? 0;
    if (claims > 0) {
      this.#showToast(`Remove this highlight from ${claims} claim(s) before deleting it.`);
      return;
    }
    const passages = this.#snapshot?.links.filter((link) => link.annotationId === annotation.id).length ?? 0;
    if (!confirm(`Delete this highlight and its ${passages} manuscript link(s)?`)) return;
    const response = await fetch(`${apiBase}/annotations/${encodeURIComponent(annotation.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    await expectOk(response);
    if (this.#editingAnnotationId === annotation.id) this.#editingAnnotationId = null;
    await this.#resourceRefresh.request();
    this.#showToast("Highlight deleted; the PDF remains unchanged.");
  }

  #renderClaims(claims: ClaimResource[], links: ClaimPassageLink[]): void {
    if (!this.#snapshot) return;
    this.#elements.claimCount.textContent = String(claims.length);
    this.#elements.newClaim.disabled = this.#snapshot.annotations.length === 0;
    this.#elements.claimListPanel.setClaims({
      annotations: this.#snapshot.annotations,
      claims,
      evidenceLinks: this.#snapshot.claimEvidenceLinks,
      passageLinks: links,
      selectedEvidenceKeys: this.#modelEvidenceSelection,
    });
  }

  #renderManuscriptComments(comments: ManuscriptComment[]): void {
    this.#elements.manuscriptCommentCount.textContent = String(comments.filter((comment) => comment.status === "open").length);
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
    const response = await jsonFetch(`${apiBase}/comments`, {
      ...passage,
      sourceRevision: this.#revision,
      body,
    });
    await expectOk(response);
    this.#elements.manuscriptCommentListPanel.markSaved();
    await this.#resourceRefresh.request();
    this.#showToast("Comment anchored to the selected passage.");
  }

  async #resolveManuscriptComment(commentId: string): Promise<void> {
    const response = await fetch(`${apiBase}/comments/${encodeURIComponent(commentId)}/resolve`, {
      method: "POST",
      credentials: "same-origin",
    });
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast("Comment resolved; its revision history is preserved.");
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
    const response = await jsonFetch(`${apiBase}/comments/${encodeURIComponent(commentId)}/reanchor`, {
      ...passage,
      sourceRevision: this.#revision,
    });
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast("Comment linked to the selected passage; earlier anchors remain in project history.");
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

  async #saveClaim(detail: ClaimDialogSave): Promise<void> {
    if (detail.evidence.length === 0) {
      this.#showToast("Select at least one source annotation.");
      return;
    }
    const response = await fetch(detail.claimId ? `${apiBase}/claims/${detail.claimId}` : `${apiBase}/claims`, {
      method: detail.claimId ? "PUT" : "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: detail.text, note: detail.note, evidence: detail.evidence }),
    });
    await expectOk(response);
    this.#elements.claimDialog.close();
    await this.#resourceRefresh.request();
    this.#showToast("Claim and evidence relationships saved.");
  }

  async #deleteClaim(claim: ClaimResource): Promise<void> {
    if (!window.confirm("Delete this claim and its links? Source annotations and manuscript text will remain.")) return;
    const response = await fetch(`${apiBase}/claims/${claim.id}`, { method: "DELETE", credentials: "same-origin" });
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast("Claim removed; source evidence remains intact.");
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
    const response = await jsonFetch(`${apiBase}/claim-links`, {
      claimId,
      ...passage,
      sourceRevision: this.#revision,
    });
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast("Claim linked to the selected manuscript passage.");
  }

  #renderCandidates(candidates: ModelCandidate[]): void {
    this.#elements.candidateListPanel.setCandidates(candidates);
  }

  async #searchKnowledge(query: string): Promise<void> {
    if (!query) {
      this.#elements.knowledgeSearchPanel.clear();
      this.#elements.projectMapOverview.classList.remove("hidden");
      return;
    }
    try {
      const response = await fetch(`${apiBase}/search?q=${encodeURIComponent(query)}`, { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isKnowledgeSearchResults(value)) throw new Error("Project search returned invalid data");
      this.#elements.knowledgeSearchPanel.showResults(value);
      this.#elements.projectMapOverview.classList.add("hidden");
    } catch (error) {
      this.#elements.projectMapOverview.classList.add("hidden");
      this.#elements.knowledgeSearchPanel.showError(error instanceof Error ? error.message : "Project search failed");
    }
  }

  #renderKnowledgeGraph(graph: WorkspaceKnowledgeGraph): void {
    this.#elements.projectMapTotal.textContent = `${graph.nodes.length} ${graph.nodes.length === 1 ? "resource" : "resources"} · ${graph.edges.length} ${graph.edges.length === 1 ? "link" : "links"}`;
    this.#elements.projectMapPanel.setGraph(graph);
    this.#elements.knowledgeConnectionsPanel.setGraph(graph);
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
      project: () => this.#elements.workspaceSwitcher.focus(),
      person: () => void this.#openSharing(),
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
        this.#elements.preview.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    this.#elements.sourceEditorShell.hidden = !writing;
    this.#elements.projectMap.hidden = writing;
    this.#elements.editorWriteActions.hidden = !writing;
    this.#elements.showWriteMode.setAttribute("aria-pressed", String(writing));
    this.#elements.showMapMode.setAttribute("aria-pressed", String(!writing));
    if (writing) this.#elements.source.focus();
    else {
      this.#elements.projectMapPanel.refreshLayout();
      this.#elements.projectMap.querySelector<HTMLButtonElement>(".project-map-node")?.focus();
    }
    this.#syncWorkspaceRoute("replace");
  }

  #showWorkspaceSurface(surface: WorkspaceSurface, syncRoute = true): void {
    this.#elements.workspaceSurfaces.dataset.activeSurface = surface;
    this.#elements.showAuthoringSurface.setAttribute("aria-pressed", String(surface === "authoring"));
    this.#elements.showContextSurface.setAttribute("aria-pressed", String(surface === "context"));
    if (syncRoute) this.#syncWorkspaceRoute("replace");
  }

  #captureActiveContextState(): void {
    const key = this.#contextState.activeKey;
    const fixedScrollTop = this.#fixedContextScrollTop(key);
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

  #fixedContextScrollTop(key: ResearchContextKey): number | null {
    if (key === RESEARCH_PREVIEW_KEY) return this.#elements.previewScroll.scrollTop;
    if (key === RESEARCH_LIBRARY_KEY) return this.#elements.contextLibraryScroll.scrollTop;
    if (key === RESEARCH_ASSISTANT_KEY) return this.#elements.contextAssistantScroll.scrollTop;
    return null;
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

  #restorePreviewNavigation(): void {
    let hidden = false;
    try {
      hidden = storedPreviewNavigationHidden(localStorage.getItem(previewNavigationStorageKey));
    } catch {
      // Browser storage can be unavailable in restricted browsing modes.
    }
    this.#setPreviewNavigationHidden(hidden, false);
  }

  #setPreviewNavigationHidden(hidden: boolean, persist = true): void {
    const presentation = previewNavigationPresentation(hidden);
    document.body.dataset.previewNavigation = hidden ? "hidden" : "visible";
    this.#elements.togglePreviewNavigation.setAttribute("aria-pressed", String(hidden));
    this.#elements.togglePreviewNavigation.setAttribute("aria-label", presentation.title);
    this.#elements.togglePreviewNavigation.title = presentation.title;
    this.#elements.previewNavigationToggleLabel.textContent = presentation.label;
    this.#elements.restorePreviewNavigation.hidden = appMode !== "library" || !hidden;
    if (!persist) return;
    try {
      if (hidden) localStorage.setItem(previewNavigationStorageKey, "true");
      else localStorage.removeItem(previewNavigationStorageKey);
    } catch {
      // The visible state still applies when persistence is unavailable.
    }
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
    this.#renderPrimaryContextTabs(activeKey);
    this.#elements.contextResourceTabsPanel.setTabs({
      activeKey,
      items: this.#contextState.tabs
        .filter((tab): tab is ResearchResourceTab => tab.kind !== "preview" && tab.kind !== "library" && tab.kind !== "assistant")
        .map((tab) => ({ tab, title: this.#contextTabTitle(tab) })),
    });
    this.#renderContextTabOverview();
    const activeTab = this.#activeResourceTab();
    this.#layout.restorePaneWidth();
    this.#renderContextPanelVisibility(activeKey, activeTab);
    this.#renderActiveResearchContext(activeKey, activeTab, loadPdf);
  }

  #renderPrimaryContextTabs(activeKey: ResearchContextKey): void {
    this.#elements.contextPreviewTab.setAttribute("aria-selected", String(activeKey === RESEARCH_PREVIEW_KEY));
    this.#elements.contextPreviewTab.tabIndex = activeKey === RESEARCH_PREVIEW_KEY ? 0 : -1;
    this.#elements.contextLibraryTab.setAttribute("aria-selected", String(activeKey === RESEARCH_LIBRARY_KEY));
    this.#elements.contextLibraryTab.tabIndex = activeKey === RESEARCH_LIBRARY_KEY ? 0 : -1;
    this.#elements.contextAssistantTab.setAttribute("aria-selected", String(activeKey === RESEARCH_ASSISTANT_KEY));
    this.#elements.contextAssistantTab.tabIndex = activeKey === RESEARCH_ASSISTANT_KEY ? 0 : -1;
  }

  #renderContextPanelVisibility(activeKey: ResearchContextKey, activeTab: ResearchResourceTab | undefined): void {
    this.#elements.contextPreviewPanel.hidden = activeKey !== RESEARCH_PREVIEW_KEY;
    this.#elements.contextLibraryPanel.hidden = activeKey !== RESEARCH_LIBRARY_KEY;
    this.#elements.contextAssistantPanel.hidden = activeKey !== RESEARCH_ASSISTANT_KEY;
    this.#elements.contextPublicationPanel.hidden = activeTab?.kind !== "publication";
    this.#elements.contextCandidatePanel.hidden = activeTab?.kind !== "candidate";
    this.#elements.previewContextControls.hidden = activeKey !== RESEARCH_PREVIEW_KEY;
    this.#elements.previewSyncControls.hidden = activeKey !== RESEARCH_PREVIEW_KEY;
    this.#elements.togglePreviewNavigation.hidden = appMode === "workspace" && activeKey !== RESEARCH_PREVIEW_KEY;
    this.#renderContextPdfVisibility(activeTab);
    this.#renderActivePdfCitationControl(activeTab);
    if (activeTab) this.#labelActiveContextPanel(activeTab);
  }

  #renderContextPdfVisibility(activeTab: ResearchResourceTab | undefined): void {
    const activePdf = activeTab?.kind === "pdf" || activeTab?.kind === "library-pdf";
    const activeLibraryArtifact = this.#activeLibraryPdfArtifact(activeTab);
    const activeLibraryPdf = Boolean(activeLibraryArtifact);
    const activeProjectReferencePdf = this.#activeProjectReferencePdf(activeTab, activeLibraryArtifact);
    this.#elements.contextPdfPanel.hidden = !activePdf;
    this.#elements.contextPdfPanel.dataset.libraryPdf = String(activeTab?.kind === "library-pdf");
    this.#elements.contextPdfPanel.dataset.readonlyPdf = String(activeProjectReferencePdf);
    this.#elements.annotationComposer.hidden = activeLibraryPdf || activeProjectReferencePdf;
    this.#elements.libraryHighlightComposer.hidden = !activeLibraryPdf;
    if (!activeLibraryPdf) this.#setLibraryPdfInspector(false);
    this.#renderLibraryHighlightComposer(activeLibraryArtifact);
    this.#elements.pdfContextControls.hidden = !activePdf;
  }

  #activeLibraryPdfArtifact(activeTab: ResearchResourceTab | undefined): LibraryPdfArtifact | undefined {
    if (activeTab?.kind !== "library-pdf") return undefined;
    return this.#librarySnapshot?.artifacts.find((artifact) => artifact.id === activeTab.id);
  }

  #activeProjectReferencePdf(activeTab: ResearchResourceTab | undefined, artifact: LibraryPdfArtifact | undefined): boolean {
    return activeTab?.kind === "library-pdf" && !artifact && Boolean(this.#projectReferencePdf(activeTab.id));
  }

  #renderActivePdfCitationControl(activeTab: ResearchResourceTab | undefined): void {
    const activePdfPublications =
      activeTab?.kind === "pdf" ? (this.#snapshot?.publicationPdfLinks.filter((link) => link.pdfId === activeTab.id) ?? []) : [];
    this.#elements.citeActivePdf.disabled = activePdfPublications.length !== 1;
    this.#elements.citeActivePdf.textContent =
      activePdfPublications.length > 1
        ? "Choose reference to cite"
        : activePdfPublications.length === 1
          ? "Cite current page"
          : "Identify before citing";
  }

  #labelActiveContextPanel(activeTab: ResearchResourceTab): void {
    const panel =
      activeTab.kind === "publication"
        ? this.#elements.contextPublicationPanel
        : activeTab.kind === "candidate"
          ? this.#elements.contextCandidatePanel
          : this.#elements.contextPdfPanel;
    panel.setAttribute("aria-labelledby", contextResourceTabId(activeTab));
    panel.removeAttribute("aria-label");
  }

  #renderActiveResearchContext(activeKey: ResearchContextKey, activeTab: ResearchResourceTab | undefined, loadPdf: boolean): void {
    if (this.#restoreFixedResearchContext(activeKey)) return;
    if (!activeTab) return;
    this.#renderActiveResourceContext(activeTab, loadPdf);
  }

  #restoreFixedResearchContext(activeKey: ResearchContextKey): boolean {
    const restore = this.#fixedResearchContextRestorers()[activeKey];
    if (!restore) return false;
    restore();
    return true;
  }

  #fixedResearchContextRestorers(): Readonly<Record<string, () => void>> {
    return {
      [RESEARCH_PREVIEW_KEY]: () => {
        this.#elements.previewScroll.scrollTop = this.#contextState.tabs[0]?.scrollTop ?? 0;
      },
      [RESEARCH_LIBRARY_KEY]: () => {
        const tab = this.#contextState.tabs.find((item) => item.key === RESEARCH_LIBRARY_KEY);
        this.#elements.contextLibraryScroll.scrollTop = tab?.scrollTop ?? 0;
      },
      [RESEARCH_ASSISTANT_KEY]: () => {
        const tab = this.#contextState.tabs.find((item) => item.key === RESEARCH_ASSISTANT_KEY);
        this.#elements.contextAssistantScroll.scrollTop = tab?.scrollTop ?? 0;
      },
    };
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
    if (activeTab.kind === "pdf") this.#renderPublicationIntake(activeTab.id);
    if (loadPdf) void this.#loadActivePdf(false);
  }

  #renderPublicationIntake(pdfId: string): void {
    const snapshot = this.#snapshot;
    if (!snapshot) return;
    if (this.#publicationIntake.getSnapshot().context.pdfId !== pdfId) this.#publicationIntake.send({ type: "OPEN", pdfId });

    const publications = snapshot.publicationPdfLinks
      .filter((link) => link.pdfId === pdfId)
      .map((link) => snapshot.publications.find((publication) => publication.id === link.publicationId))
      .filter((publication): publication is PublicationResource => Boolean(publication));
    const linked = publications.length > 0;
    const intake = this.#publicationIntake.getSnapshot();
    const preview = intake.context.preview?.pdfId === pdfId ? intake.context.preview : null;
    this.#elements.publicationIntakePanel.setView({
      busy: publicationIntakeBusy(intake),
      preview,
      publications,
    });
    if (linked) {
      this.#elements.publicationIntakePanel.setStatus(
        `${publications.length} ${publications.length === 1 ? "reference is" : "references are"} connected to this PDF.`,
      );
    }
  }

  async #previewPublicationIntake(doi: string): Promise<void> {
    const pdfId = this.#activePublicationIntakePdf();
    if (!pdfId) return;
    if (this.#publicationIntake.getSnapshot().context.pdfId !== pdfId) this.#publicationIntake.send({ type: "OPEN", pdfId });
    this.#publicationIntake.send({ type: "START_PREVIEW" });
    const request = this.#publicationIntake.getSnapshot().context.requestId;
    this.#updatePublicationIntakeAvailability();
    this.#elements.publicationIntakePanel.setStatus("Looking up DOI metadata…");
    try {
      const response = await jsonFetch(`${apiBase}/publication-intake/preview`, {
        pdfId,
        doi,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isPublicationIntakePreview(value)) throw new Error("Publication intake returned an invalid preview");
      this.#publicationIntake.send({ type: "PREVIEW_READY", requestId: request, preview: value });
      this.#completePublicationIntakePreview(pdfId, value);
    } catch (error) {
      this.#failPublicationIntakePreview(request, error);
    } finally {
      this.#updatePublicationIntakeAvailability();
    }
  }

  #activePublicationIntakePdf(): string | null {
    const tab = this.#activeResourceTab();
    return tab?.kind === "pdf" ? tab.id : null;
  }

  #completePublicationIntakePreview(pdfId: string, value: GuardResult<typeof isPublicationIntakePreview>): void {
    const intake = this.#publicationIntake.getSnapshot();
    if (!this.#publicationIntakePreviewActive(intake.matches("reviewing"), intake.context.preview, value, this.#activeResourceTab(), pdfId))
      return;
    this.#elements.publicationIntakePanel.setStatus(
      value.existingPublicationId
        ? "This DOI is already in the library. Review the existing key, then connect this PDF."
        : "Review the metadata and citation key before adding it.",
    );
    this.#renderPublicationIntake(pdfId);
    this.#elements.publicationIntakePanel.focusCitationKey();
  }

  #failPublicationIntakePreview(requestId: number, error: unknown): void {
    const message = error instanceof Error ? error.message : "DOI lookup failed";
    this.#publicationIntake.send({ type: "PREVIEW_FAILED", requestId, message });
    if (!this.#publicationIntake.getSnapshot().matches("failed")) return;
    this.#elements.publicationIntakePanel.setStatus(message);
    const pdfId = this.#activePublicationIntakePdf();
    if (pdfId) this.#renderPublicationIntake(pdfId);
  }

  #publicationIntakePreviewActive(
    reviewing: boolean,
    currentPreview: unknown,
    preview: GuardResult<typeof isPublicationIntakePreview>,
    active: ResearchResourceTab | undefined,
    pdfId: string,
  ): boolean {
    return reviewing && currentPreview === preview && active?.kind === "pdf" && active.id === pdfId;
  }

  async #acceptPublicationIntake(citationKey: string): Promise<void> {
    const preview = this.#publicationIntake.getSnapshot().context.preview;
    const active = this.#activeResourceTab();
    if (!preview || active?.kind !== "pdf" || active.id !== preview.pdfId) return;
    this.#publicationIntake.send({ type: "ACCEPT" });
    const request = this.#publicationIntake.getSnapshot().context.requestId;
    this.#updatePublicationIntakeAvailability();
    this.#elements.publicationIntakePanel.setStatus("Adding the reference and connecting this PDF…");
    try {
      const response = await jsonFetch(`${apiBase}/publication-intake/accept`, {
        pdfId: preview.pdfId,
        doi: preview.doi,
        citationKey,
        metadataFingerprint: preview.metadataFingerprint,
      });
      await expectOk(response);
      await this.#resourceRefresh.request();
      const publication = this.#snapshot?.publications.find((item) => item.doi === preview.doi);
      if (!publication) throw new Error("The connected publication could not be found");
      this.#publicationIntake.send({ type: "ACCEPTED", requestId: request });
      this.#elements.publicationIntakePanel.setStatus("Reference added and PDF connected. Citation remains a separate action.");
      this.#openPublicationContext(publication);
      this.#showToast("Reference added and connected; the manuscript is unchanged.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publication intake failed";
      this.#publicationIntake.send({ type: "ACCEPT_FAILED", requestId: request, message });
      if (!this.#publicationIntake.getSnapshot().matches("reviewing")) return;
      this.#elements.publicationIntakePanel.setStatus(message);
      this.#elements.publicationIntakePanel.focusCitationKey();
    } finally {
      this.#updatePublicationIntakeAvailability();
    }
  }

  #cancelPublicationIntake(): void {
    this.#publicationIntake.send({ type: "CANCEL" });
    this.#elements.publicationIntakePanel.setStatus("Lookup cancelled. The library and PDF are unchanged.");
    this.#updatePublicationIntakeAvailability();
    const pdfId = this.#activePublicationIntakePdf();
    if (pdfId) this.#renderPublicationIntake(pdfId);
    this.#elements.publicationIntakePanel.focusDoi();
  }

  #updatePublicationIntakeAvailability(): void {
    const pdfId = this.#activePublicationIntakePdf();
    if (pdfId) this.#renderPublicationIntake(pdfId);
  }

  #renderContextTabOverview(): void {
    this.#elements.contextTabOverviewPanel.setTabs({
      activeKey: this.#contextState.activeKey,
      items: this.#contextState.tabs.map((tab) => ({ tab, title: this.#contextOverviewTitle(tab) })),
      standaloneLibrary: appMode === "library",
    });
  }

  #contextOverviewTitle(tab: ResearchContextTab): string {
    if (tab.kind === "preview") return "Preview";
    if (tab.kind === "library") return "Library";
    if (tab.kind === "assistant") return "Writing assistant";
    return this.#contextTabTitle(tab);
  }

  #renderCandidateContext(tab: ResearchResourceTab): void {
    if (tab.kind !== "candidate" || !this.#snapshot) return;
    const candidate = this.#snapshot.candidates.find((item) => item.id === tab.id);
    if (!candidate) return;
    const candidateDecision = this.#assistantWorkflow.getSnapshot().context.candidateDecision;
    const currentDecision = candidateDecision?.id === candidate.id ? candidateDecision : null;
    this.#elements.candidateReviewPanel.setCandidate({
      applicable: this.#candidateApplicable(candidate),
      availableEvidenceIds: new Set([
        ...this.#snapshot.annotations.map((annotation) => annotation.id),
        ...this.#snapshot.claims.map((claim) => claim.id),
      ]),
      candidate,
      ...(currentDecision ? { currentAction: currentDecision.action } : {}),
      decisionBusy: candidateDecision !== null,
      stableDocument: this.#hasStableDocumentBase(),
    });
  }

  #candidateApplicable(candidate: ModelCandidate): boolean {
    if (candidate.operation === "draft-claim") {
      return (
        candidate.status === "pending" &&
        candidate.evidence.every((evidence) =>
          this.#snapshot?.annotations.some((annotation) => annotation.id === evidence.id && annotation.updatedAt === evidence.version),
        )
      );
    }
    return (
      candidate.status === "pending" &&
      candidate.sourceRevision === this.#revision &&
      candidate.target.resolution.status === "resolved" &&
      candidate.target.resolution.exactMatch
    );
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
    const selector =
      key === RESEARCH_PREVIEW_KEY
        ? "#context-preview-tab"
        : key === RESEARCH_LIBRARY_KEY
          ? "#context-library-tab"
          : key === RESEARCH_ASSISTANT_KEY
            ? "#context-assistant-tab"
            : `#${CSS.escape(`context-tab-${key.replace(":", "-")}`)}`;
    queueMicrotask(() => this.#elements.contextTabList.querySelector<HTMLButtonElement>(selector)?.focus());
  }

  #contextTabTitle(tab: ResearchResourceTab): string {
    if (tab.kind === "publication") return this.#publicationContextTitle(tab.id);
    if (tab.kind === "pdf") return this.#pdfContextTitle(tab.id);
    if (tab.kind === "library-pdf") return this.#libraryPdfContextTitle(tab.id);
    const candidate = this.#snapshot?.candidates.find((item) => item.id === tab.id);
    return candidate ? `Revision · ${candidate.model} · ${candidate.id.slice(0, 4)}` : "Revision";
  }

  #publicationContextTitle(publicationId: string): string {
    return this.#snapshot?.publications.find((publication) => publication.id === publicationId)?.title ?? "Reference";
  }

  #pdfContextTitle(pdfId: string): string {
    return this.#snapshot?.pdfs.find((pdf) => pdf.id === pdfId)?.name ?? "Paper";
  }

  #libraryPdfContextTitle(pdfId: string): string {
    return (
      this.#librarySnapshot?.artifacts.find((artifact) => artifact.id === pdfId)?.name ??
      this.#projectReferencePdf(pdfId)?.name ??
      "Reference PDF"
    );
  }

  #activeResourceTab(): ResearchResourceTab | undefined {
    return this.#contextState.tabs.find(
      (tab): tab is ResearchResourceTab =>
        tab.kind !== "preview" && tab.kind !== "library" && tab.kind !== "assistant" && tab.key === this.#contextState.activeKey,
    );
  }

  #moveContextTabFocus(event: KeyboardEvent): void {
    if (!(event.target instanceof HTMLButtonElement) || event.target.getAttribute("role") !== "tab") return;
    const tabs = Array.from(this.#elements.contextTabList.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    const nextIndex = contextTabFocusIndex(event.key, index, tabs.length);
    if (nextIndex === null) return;
    event.preventDefault();
    for (const tab of tabs) tab.tabIndex = tab === tabs[nextIndex] ? 0 : -1;
    tabs[nextIndex]?.focus();
  }

  #renderPublicationContext(tab: ResearchResourceTab): void {
    if (tab.kind !== "publication" || !this.#snapshot) return;
    const publication = this.#snapshot.publications.find((item) => item.id === tab.id);
    if (!publication) return;

    const papers = this.#publicationPaperOptions(publication.id);
    const linkedIds = new Set(
      this.#snapshot.publicationPdfLinks.filter((link) => link.publicationId === publication.id).map((link) => link.pdfId),
    );
    this.#elements.publicationContextPanel.setContext({
      availablePdfs: this.#snapshot.pdfs.filter((pdf) => !linkedIds.has(pdf.id)),
      papers,
      publication,
    });
    this.#updateCitationInsertionAvailability();
  }

  #publicationPaperOptions(publicationId: string): PublicationPaperOption[] {
    if (!this.#snapshot) return [];
    const projectPapers = this.#snapshot.publicationPdfLinks.flatMap((link) => {
      if (link.publicationId !== publicationId) return [];
      const pdf = this.#snapshot?.pdfs.find((item) => item.id === link.pdfId);
      return pdf ? [{ kind: "project" as const, pdf, linkId: link.id }] : [];
    });
    const libraryPapers = (this.#librarySnapshot?.artifacts ?? [])
      .filter((artifact) => artifact.referenceId === publicationId)
      .map((artifact) => ({ kind: "library" as const, artifact }));
    const localArtifactIds = new Set(libraryPapers.map((paper) => paper.artifact.id));
    const linkedReferencePapers = this.#projectReferencePdfs
      .filter((pdf) => pdf.referenceId === publicationId && !localArtifactIds.has(pdf.id))
      .map((pdf) => ({ kind: "reference" as const, pdf }));
    return [...libraryPapers, ...linkedReferencePapers, ...projectPapers];
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

  #openCitationAtCaret(): void {
    const citation = citationContextAtPosition(this.#activeFileText.toString(), this.#elements.source.selectionEnd);
    if (!citation) {
      this.#showToast("Place the cursor inside a citation directive first.");
      return;
    }
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

  #restoreCitationCompletionScope(): void {
    this.#elements.citationCompletionScope.value =
      localStorage.getItem(citationCompletionScopeStorageKey) === "library" ? "library" : "project";
  }

  async #renderSourceCompletion(): Promise<void> {
    if (appMode !== "workspace" || document.activeElement !== this.#elements.source) {
      this.#hideSourceCompletion();
      return;
    }
    const includeContext = includeCompletionContext(this.#elements.source.value, this.#elements.source.selectionEnd);
    if (includeContext) {
      this.#renderIncludeCompletion(includeContext);
      return;
    }
    await this.#renderCitationCompletion();
  }

  #renderIncludeCompletion(context: IncludeCompletionContext): void {
    const snapshot = this.#snapshot;
    const activeFile = snapshot?.files.find((file) => file.id === this.#activeFileId);
    if (!snapshot || !activeFile) {
      this.#hideSourceCompletion();
      return;
    }
    const candidates = rankIncludeCompletionCandidates(
      snapshot.files
        .filter((file) => file.id !== activeFile.id)
        .map((file) => ({ reference: relativeProjectPath(activeFile.path, file.path), path: file.path })),
      context.query,
    );
    if (candidates.length === 0) {
      this.#hideSourceCompletion();
      return;
    }
    this.#sourceCompletionKind = "include";
    this.#includeCompletionContext = context;
    this.#includeCompletionCandidates = candidates;
    this.#citationCompletionContext = null;
    this.#citationCompletionCandidates = [];
    this.#sourceCompletionIndex = Math.min(this.#sourceCompletionIndex, candidates.length - 1);
    this.#elements.sourceCompletion.replaceChildren(
      ...candidates.map((candidate, index) => this.#includeCompletionOption(candidate, index)),
    );
    this.#elements.sourceCompletion.hidden = false;
    this.#elements.source.setAttribute("aria-expanded", "true");
    this.#renderSourceCompletionSelection();
    positionSourceCompletion(this.#elements.source, this.#elements.sourceCompletion, context.start);
  }

  #includeCompletionOption(candidate: IncludeCompletionCandidate, index: number): HTMLButtonElement {
    return this.#sourceCompletionOption(index, {
      value: candidate.reference,
      metadata: `Project file · ${candidate.path}`,
      accept: () => this.#acceptIncludeCompletion(index),
    });
  }

  #sourceCompletionOption(
    index: number,
    content: { readonly value: string; readonly metadata: string; readonly action?: string; readonly accept: () => void },
  ): HTMLButtonElement {
    const option = document.createElement("button");
    option.type = "button";
    option.id = `source-completion-option-${index}`;
    option.className = "source-completion-option";
    option.setAttribute("role", "option");
    option.dataset.index = String(index);
    const heading = document.createElement("span");
    heading.className = "source-completion-heading";
    const value = document.createElement("code");
    value.textContent = content.value;
    heading.append(value);
    if (content.action) {
      const action = document.createElement("span");
      action.className = "source-completion-action";
      action.textContent = content.action;
      heading.append(action);
    }
    const metadata = document.createElement("span");
    metadata.className = "source-completion-meta";
    metadata.textContent = content.metadata;
    option.append(heading, metadata);
    option.addEventListener("pointerdown", (event) => event.preventDefault());
    option.addEventListener("click", content.accept);
    option.addEventListener("mousemove", () => {
      this.#sourceCompletionIndex = index;
      this.#renderSourceCompletionSelection();
    });
    return option;
  }

  async #renderCitationCompletion(): Promise<void> {
    if (appMode !== "workspace" || document.activeElement !== this.#elements.source) {
      this.#hideSourceCompletion();
      return;
    }
    const context = citationCompletionContext(this.#elements.source.value, this.#elements.source.selectionEnd);
    if (!context) {
      this.#hideSourceCompletion();
      return;
    }
    if (this.#elements.citationCompletionScope.value === "library" && !this.#librarySnapshot && !this.#citationLibraryLoading) {
      const request = ++this.#citationLibraryRequest;
      this.#citationLibraryLoading = true;
      void this.#loadCitationCompletionLibrary(request);
    }
    const candidates = rankCitationCompletionCandidates(this.#citationCandidates(), context.query);
    if (candidates.length === 0) {
      this.#hideSourceCompletion();
      return;
    }
    this.#citationCompletionContext = context;
    this.#citationCompletionCandidates = candidates;
    this.#sourceCompletionKind = "citation";
    this.#includeCompletionContext = null;
    this.#includeCompletionCandidates = [];
    this.#sourceCompletionIndex = Math.min(this.#sourceCompletionIndex, candidates.length - 1);
    const options = candidates.map((candidate, index) => this.#citationCompletionOption(candidate, index));
    this.#elements.sourceCompletion.replaceChildren(...options);
    this.#elements.sourceCompletion.hidden = false;
    this.#elements.source.setAttribute("aria-expanded", "true");
    this.#renderSourceCompletionSelection();
    positionSourceCompletion(this.#elements.source, this.#elements.sourceCompletion, context.start);
  }

  async #loadCitationCompletionLibrary(request: number): Promise<void> {
    try {
      const response = await fetch("/api/library", { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isReferenceLibrarySnapshot(value)) throw new Error("Reference library returned an invalid snapshot");
      if (request !== this.#citationLibraryRequest) return;
      this.#librarySnapshot = value;
      await this.#renderCitationCompletion();
    } catch {
      if (request === this.#citationLibraryRequest) this.#citationLibraryRequest += 1;
    } finally {
      this.#citationLibraryLoading = false;
    }
  }

  #citationCandidates(): CitationCompletionCandidate[] {
    const snapshot = this.#snapshot;
    if (!snapshot) return [];
    const projectCandidates = snapshot.projectReferences.map((reference) => ({
      key: reference.citationAlias,
      title: reference.snapshot.title,
      authors: reference.snapshot.authors,
      year: reference.snapshot.year,
      scope: "project" as const,
      referenceId: reference.referenceId,
    }));
    if (this.#elements.citationCompletionScope.value !== "library" || !this.#librarySnapshot) return projectCandidates;
    const linked = new Set(snapshot.projectReferences.map((reference) => reference.referenceId));
    return [
      ...projectCandidates,
      ...this.#librarySnapshot.references
        .filter((reference) => !linked.has(reference.id) && reference.archivedAt === null && reference.deletedAt === null)
        .map((reference) => ({
          key: reference.referenceKey,
          title: reference.title,
          authors: reference.authors,
          year: reference.year,
          scope: "library" as const,
          referenceId: reference.id,
        })),
    ];
  }

  #citationCompletionOption(candidate: CitationCompletionCandidate, index: number): HTMLButtonElement {
    return this.#sourceCompletionOption(index, {
      value: candidate.key,
      metadata: [candidate.authors.join("; "), candidate.title, candidate.year].filter(Boolean).join(" · "),
      ...(candidate.scope === "library" ? { action: "Add and cite" } : {}),
      accept: () => void this.#acceptCitationCompletion(index),
    });
  }

  #handleSourceCompletionKey(event: KeyboardEvent): void {
    const count = this.#sourceCompletionCount();
    if (this.#elements.sourceCompletion.hidden || count === 0 || event.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      this.#moveSourceCompletion(event, count);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      this.#acceptSourceCompletion(event);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.#hideSourceCompletion();
    }
  }

  #sourceCompletionCount(): number {
    if (this.#sourceCompletionKind === "citation") return this.#citationCompletionCandidates.length;
    if (this.#sourceCompletionKind === "include") return this.#includeCompletionCandidates.length;
    return 0;
  }

  #moveSourceCompletion(event: KeyboardEvent, count: number): void {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    this.#sourceCompletionIndex = (this.#sourceCompletionIndex + direction + count) % count;
    this.#renderSourceCompletionSelection();
  }

  #acceptSourceCompletion(event: KeyboardEvent): void {
    event.preventDefault();
    if (this.#sourceCompletionKind === "citation") void this.#acceptCitationCompletion(this.#sourceCompletionIndex);
    else this.#acceptIncludeCompletion(this.#sourceCompletionIndex);
  }

  #renderSourceCompletionSelection(): void {
    for (const option of this.#elements.sourceCompletion.querySelectorAll<HTMLElement>("[role=option]")) {
      const selected = Number(option.dataset.index) === this.#sourceCompletionIndex;
      option.setAttribute("aria-selected", String(selected));
      if (selected) {
        this.#elements.source.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
      }
    }
  }

  async #acceptCitationCompletion(index: number): Promise<void> {
    const candidate = this.#citationCompletionCandidates[index];
    const context = this.#citationCompletionContext;
    if (!candidate || !context) return;
    this.#hideSourceCompletion();
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
    this.#document.transact(() => {
      if (end > start) this.#activeFileText.delete(start, end - start);
      this.#activeFileText.insert(start, candidate.key);
    }, this);
    const caret = start + candidate.key.length;
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(caret, caret);
    this.#rememberAuthoringSelection();
    if (candidate.scope === "library") this.#showToast(`Added and cited ${candidate.key}.`);
  }

  #acceptIncludeCompletion(index: number): void {
    const candidate = this.#includeCompletionCandidates[index];
    const context = this.#includeCompletionContext;
    if (!candidate || !context) return;
    this.#hideSourceCompletion();
    this.#document.transact(() => {
      if (context.end > context.start) this.#activeFileText.delete(context.start, context.end - context.start);
      this.#activeFileText.insert(context.start, candidate.reference);
    }, this);
    const caret = context.start + candidate.reference.length;
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(caret, caret);
    this.#rememberAuthoringSelection();
  }

  #hideSourceCompletion(): void {
    this.#sourceCompletionKind = null;
    this.#citationCompletionContext = null;
    this.#citationCompletionCandidates = [];
    this.#includeCompletionContext = null;
    this.#includeCompletionCandidates = [];
    this.#sourceCompletionIndex = 0;
    this.#elements.sourceCompletion.hidden = true;
    this.#elements.sourceCompletion.replaceChildren();
    this.#elements.source.setAttribute("aria-expanded", "false");
    this.#elements.source.removeAttribute("aria-activedescendant");
  }

  #rememberAuthoringSelection(): void {
    this.#authoringSelection = captureRelativeSelection(this.#elements.source, this.#activeFileText);
    const citationAtCaret = citationKeysAtPosition(this.#activeFileText.toString(), this.#elements.source.selectionEnd).length > 0;
    this.#elements.openSourceCitation.disabled = !citationAtCaret;
    this.#elements.openSourceCitation.classList.toggle("hidden", !citationAtCaret);
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
    if (!target) {
      const status = `${file?.path ?? "Manuscript"} · no target`;
      this.#elements.editorTargetStatus.textContent = status;
      this.#elements.editorTargetStatus.title = status;
      this.#renderSourceEditorHighlight();
      this.#renderAssistantTargetPreview();
      return;
    }
    const source = this.#activeFileText.toString();
    const startLine = lineNumberAt(source, target.start);
    const endLine = lineNumberAt(source, target.end);
    const location = startLine === endLine ? `line ${startLine}` : `lines ${startLine}–${endLine}`;
    const selection = target.start === target.end ? "caret" : `${target.end - target.start} characters selected`;
    const status = `${file?.path ?? "Manuscript"} · ${location} · ${selection}`;
    this.#elements.editorTargetStatus.textContent = status;
    this.#elements.editorTargetStatus.title = status;
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

  async #linkActivePublicationPdf(pdfId: string): Promise<void> {
    const tab = this.#activeResourceTab();
    if (tab?.kind !== "publication" || !pdfId) return;
    const response = await jsonFetch(`${apiBase}/publication-pdf-links`, { publicationId: tab.id, pdfId });
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast("Project PDF added to this reference.");
  }

  async #unlinkPublicationPdf(linkId: string): Promise<void> {
    const response = await fetch(`${apiBase}/publication-pdf-links/${encodeURIComponent(linkId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast("Paper disconnected; both resources remain available.");
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
    this.#elements.paperStatus.textContent = error instanceof Error ? error.message : "Could not render this PDF";
  }

  async #uploadPdf(): Promise<void> {
    const file = this.#elements.pdfUpload.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return this.#showToast("Choose a PDF file.");
    this.#showToast(`Importing ${file.name}…`);
    const response = await fetch(`${apiBase}/pdfs`, {
      method: "POST",
      headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent(file.name) },
      body: file,
    });
    await expectOk(response);
    this.#elements.pdfUpload.value = "";
    await this.#resourceRefresh.request();
    this.#showToast("PDF imported without modifying the source file.");
  }

  async #enrichPublication(publicationId: string): Promise<void> {
    this.#showToast("Looking up DOI metadata from Crossref…");
    const response = await fetch(`${apiBase}/publications/${publicationId}/enrich`, {
      method: "POST",
      credentials: "same-origin",
    });
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast("Reference enriched from Crossref.");
  }

  async #createAnnotation(detail: ProjectAnnotationSave): Promise<void> {
    const annotationId = this.#editingAnnotationId;
    if (!annotationId) {
      this.#showToast("Paint a highlight in the PDF before adding a note or manuscript link.");
      return;
    }
    const response = await fetch(`${apiBase}/annotations/${encodeURIComponent(annotationId)}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: detail.comment }),
    });
    await expectOk(response);
    await this.#resourceRefresh.request();
    if (detail.link) await this.#linkAnnotation(annotationId);
    else this.#showToast("Highlight note saved.");
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
    const response = await jsonFetch(`${apiBase}/links`, {
      annotationId,
      fileId: passage.fileId,
      start: passage.start,
      end: passage.end,
      excerpt: passage.excerpt,
      sourceRevision: this.#revision,
    });
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast("Annotation linked to the selected passage.");
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

  #tableRequirements(): TableRequirements {
    const { tableCaption, tableColumns, tableRows } = this.#elements.assistantTaskPanel.value;
    return parseTableRequirements(tableCaption, tableColumns, tableRows);
  }

  #phrasingPurpose(): PhrasingPurpose {
    const value = this.#elements.assistantTaskPanel.value.phrasingPurposeId;
    const purposes = phrasingPurposes();
    return (isPhrasingPurposeId(value) ? purposes.find(({ id }) => id === value) : undefined) ?? purposes[0]!;
  }

  #validTableRequirements(): boolean {
    try {
      this.#tableRequirements();
      return true;
    } catch {
      return false;
    }
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
    if (!/^(?:annotation|claim):[^:]+$/u.test(key)) return;
    if (selected) this.#modelEvidenceSelection.add(key);
    else this.#modelEvidenceSelection.delete(key);
    this.#elements.modelStatus.textContent =
      this.#modelEvidenceSelection.size > maximumModelEvidenceItems
        ? `Choose no more than ${maximumModelEvidenceItems} evidence resources.`
        : `${this.#modelEvidenceSelection.size} ${this.#modelEvidenceSelection.size === 1 ? "resource" : "resources"} selected for grounding.`;
    this.#updateModelAvailability();
  }

  #chooseModelEvidence(): void {
    this.#showRail("research");
    const control = document.querySelector<HTMLInputElement>("[data-model-evidence-key]");
    if (!control) {
      this.#elements.modelStatus.textContent = "Add a PDF highlight or researcher-authored claim before choosing model evidence.";
      this.#showToast("No project evidence is available yet.");
      return;
    }
    const collection = control.closest("details");
    if (collection instanceof HTMLDetailsElement) collection.open = true;
    control.scrollIntoView({ behavior: "smooth", block: "center" });
    control.focus({ preventScroll: true });
    this.#elements.modelStatus.textContent = "Choose one or more evidence resources in the Research rail, then return to the assistant.";
  }

  #modelEvidence(): { items: ModelEvidenceItem[]; references: ModelEvidenceReference[] } {
    if (!this.#snapshot) return { items: [], references: [] };
    const items: ModelEvidenceItem[] = [];
    const references: ModelEvidenceReference[] = [];
    for (const key of this.#modelEvidenceSelection) {
      const [kind, id] = parseModelEvidenceKey(key);
      if (kind === "annotation") {
        this.#appendAnnotationModelEvidence(id, items, references);
        continue;
      }
      this.#appendClaimModelEvidence(id, items, references);
    }
    return { items, references };
  }

  #appendAnnotationModelEvidence(id: string, items: ModelEvidenceItem[], references: ModelEvidenceReference[]): void {
    const annotation = this.#snapshot?.annotations.find((item) => item.id === id);
    if (!annotation) return;
    references.push({ kind: "annotation", id, version: annotation.updatedAt });
    items.push({
      kind: "annotation",
      id,
      label: `PDF annotation on page ${annotation.page}`,
      content: [
        `Quote: ${annotation.quote}`,
        annotation.prefix ? `Context before: ${annotation.prefix}` : "",
        annotation.suffix ? `Context after: ${annotation.suffix}` : "",
        annotation.comment ? `Researcher note: ${annotation.comment}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  #appendClaimModelEvidence(id: string, items: ModelEvidenceItem[], references: ModelEvidenceReference[]): void {
    const claim = this.#snapshot?.claims.find((item) => item.id === id);
    if (!claim) return;
    references.push({ kind: "claim", id, version: claim.updatedAt });
    items.push({
      kind: "claim",
      id,
      label: "Researcher-authored claim",
      content: [`Claim: ${claim.text}`, claim.note ? `Working note: ${claim.note}` : ""].filter(Boolean).join("\n"),
    });
  }

  async #generateCandidate(): Promise<void> {
    if (assistantWorkflowBusy(this.#assistantWorkflow.getSnapshot())) return;
    const input = this.#assistantGenerationContext();
    if (!input) return;
    this.#assistantWorkflow.send({ type: "START", operation: input.operation.id, sourceRevision: input.sourceRevision });
    this.#updateModelAvailability();
    this.#elements.modelStatus.textContent = this.#assistantGenerationStartMessage(input.operation.id);
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
    this.#elements.modelStatus.textContent = message;
  }

  #assistantGenerationContext(): AssistantGenerationContext | null {
    const { instruction, operation } = this.#elements.assistantTaskPanel.value;
    const draftsClaim = operation.id === "draft-claim";
    if (!this.#snapshot || (!draftsClaim && !this.#hasStableDocumentBase())) {
      this.#elements.modelStatus.textContent = "Wait for the manuscript to finish synchronizing before using the model.";
      return null;
    }
    const passage = this.#assistantAuthoringPassage();
    const evidence = this.#modelEvidence();
    const annotationItems = evidence.items.filter((item) => item.kind === "annotation");
    const annotationReferences = evidence.references.filter((item) => item.kind === "annotation");
    const insertionTarget = operation.id === "build-table" ? this.#assistantInsertionTarget() : null;
    if (
      this.#assistantTargetMissing(operation.id, passage, insertionTarget) ||
      this.#assistantEvidenceMissing(operation.evidence, evidence, annotationItems)
    ) {
      this.#elements.modelStatus.textContent = draftsClaim
        ? "Choose at least one annotation as evidence. Claims cannot ground a new claim draft."
        : "Choose a valid manuscript target, then use Choose evidence for any required grounding.";
      return null;
    }
    const provider = this.#modelProviderOrReport();
    if (!provider) return null;
    return {
      provider,
      operation,
      passage,
      evidence,
      annotationItems,
      annotationReferences,
      insertionTarget,
      instruction,
      sourceRevision: this.#revision,
    };
  }

  #assistantTargetMissing(
    operation: AssistantGenerationContext["operation"]["id"],
    passage: AuthoringPassage | null,
    insertionTarget: AuthoringPassage | null,
  ): boolean {
    if (operation === "build-table") return !insertionTarget;
    return operation !== "draft-claim" && !passage;
  }

  #assistantEvidenceMissing(
    requirement: AssistantGenerationContext["operation"]["evidence"],
    evidence: AssistantGenerationContext["evidence"],
    annotations: readonly ModelEvidenceItem[],
  ): boolean {
    if (requirement === "required") return evidence.items.length === 0;
    if (requirement === "annotations") return annotations.length === 0;
    return false;
  }

  #modelProviderOrReport(): OpenAICompatibleBrowserProvider | null {
    try {
      return this.#modelProvider();
    } catch (error) {
      this.#elements.modelStatus.textContent = error instanceof Error ? error.message : "Enter a valid local model endpoint.";
      return null;
    }
  }

  #assistantGenerationStartMessage(operation: AssistantGenerationContext["operation"]["id"]): string {
    if (operation === "draft-claim") return "Asking the local model for one grounded claim draft…";
    if (operation === "clarity-drill") return "Finding the single ambiguity that matters most…";
    return "Asking the local model for a grounded candidate…";
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
    const relation = readClaimEvidenceRelation(this.#elements.assistantTaskPanel.value.relation);
    const draft = await input.provider.draftClaim({ instruction: input.instruction, relation, evidence: input.annotationItems });
    const response = await jsonFetch(`${apiBase}/claim-candidates`, {
      providerAdapter: "openai-compatible",
      providerLabel: draft.providerLabel,
      model: draft.model,
      promptVersion: "draft-claim-v1",
      instruction: input.instruction,
      relation,
      evidence: input.annotationReferences,
      proposedText: draft.text,
      proposedNote: draft.note,
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isModelCandidate(value) || value.operation !== "draft-claim")
      throw new Error("Candidate endpoint returned an invalid claim draft");
    await this.#resourceRefresh.request();
    this.#openCandidateContext(this.#snapshot?.candidates.find((item) => item.id === value.id) ?? value);
    this.#elements.modelStatus.textContent = "Claim draft ready. Review its proposition, note, and annotation snapshots in Context.";
    this.#assistantWorkflow.send({ type: "COMPLETE" });
  }

  async #generateTableCandidate(input: AssistantGenerationContext): Promise<void> {
    if (!input.insertionTarget) throw new Error("Place the manuscript caret first");
    const requirements = this.#tableRequirements();
    const source = this.#activeFileText.toString();
    const manuscriptContext = resolveAssistantTarget(source, input.insertionTarget.end, input.insertionTarget.end, "paragraph").text;
    const table = await input.provider.buildTable({ instruction: input.instruction, ...requirements, manuscriptContext });
    if (table.columns.length !== requirements.columns.length || table.rows.length !== requirements.rows.length)
      throw new Error("Local model changed the requested table shape");
    this.#renderGeneratedTable(input.insertionTarget, input.sourceRevision, table);
    this.#elements.modelStatus.textContent = "Table syntax ready. Review it before inserting at the visible target.";
    this.#assistantWorkflow.send({ type: "REVIEW" });
  }

  async #generatePhrasingCandidate(input: AssistantGenerationContext, passage: AuthoringPassage): Promise<void> {
    const purpose = this.#phrasingPurpose();
    const result = await input.provider.phrasePassage({
      selectedPassage: passage.excerpt,
      instruction: input.instruction,
      evidence: input.evidence.items,
      purpose,
      patterns: phrasingPatternsForPurpose(purpose.id),
    });
    this.#renderPhrasingAlternatives(
      { passage, evidence: input.evidence, instruction: input.instruction, sourceRevision: input.sourceRevision },
      purpose,
      result,
    );
    this.#elements.modelStatus.textContent = "Choose one alternative to open exact before-and-after review.";
    this.#assistantWorkflow.send({ type: "REVIEW" });
  }

  async #generateReferenceDiscovery(input: AssistantGenerationContext, passage: AuthoringPassage): Promise<void> {
    const formulated = await input.provider.formulateReferenceQuery({
      selectedPassage: passage.excerpt,
      instruction: input.instruction,
      evidence: input.evidence.items,
    });
    const response = await jsonFetch("/api/library/discovery", { query: formulated.query });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isReferenceDiscoveryResults(value)) throw new Error("Reference provider returned invalid discovery results");
    this.#renderReferenceDiscovery(formulated.query, formulated.rationale, value);
    this.#elements.modelStatus.textContent = value.length
      ? `Found ${value.length} verifiable registry record${value.length === 1 ? "" : "s"}. Review before saving.`
      : "No verifiable registry records matched this query. Refine the search focus and try again.";
    this.#assistantWorkflow.send({ type: "REVIEW" });
  }

  async #generateIdeas(input: AssistantGenerationContext, passage: AuthoringPassage): Promise<void> {
    const result = await input.provider.ideate({
      selectedPassage: passage.excerpt,
      instruction: input.instruction,
      evidence: input.evidence.items,
    });
    this.#renderIdeas({ passage, evidence: input.evidence, instruction: input.instruction, sourceRevision: input.sourceRevision }, result);
    this.#elements.modelStatus.textContent = "Choose a direction to open its complete draft for exact review.";
    this.#assistantWorkflow.send({ type: "REVIEW" });
  }

  async #generateClarityQuestion(input: AssistantGenerationContext, passage: AuthoringPassage): Promise<void> {
    const question = await input.provider.startClarityDrill({
      selectedPassage: passage.excerpt,
      instruction: input.instruction,
      evidence: input.evidence.items,
    });
    this.#renderClarityQuestion({
      provider: input.provider,
      passage,
      evidence: input.evidence,
      instruction: input.instruction,
      sourceRevision: input.sourceRevision,
      question,
    });
    this.#elements.modelStatus.textContent = "Answer one focused question to make the intended meaning explicit.";
    this.#assistantWorkflow.send({ type: "AWAIT_INPUT" });
  }

  async #generateRevisionCandidate(input: AssistantGenerationContext, passage: AuthoringPassage): Promise<void> {
    const revision = await input.provider.reviseSelection({
      selectedPassage: passage.excerpt,
      instruction: input.instruction,
      evidence: input.evidence.items,
    });
    await this.#persistRevisionCandidate({
      passage,
      evidence: input.evidence.references,
      instruction: input.instruction,
      sourceRevision: input.sourceRevision,
      replacement: revision.replacement,
      providerLabel: revision.providerLabel,
      model: revision.model,
    });
    this.#elements.modelStatus.textContent = "Candidate ready. Review its exact replacement and evidence in Context.";
    this.#assistantWorkflow.send({ type: "COMPLETE" });
  }

  #renderGeneratedTable(target: AuthoringPassage, sourceRevision: number, table: ModelTable): void {
    const markdown = tableMarkdown(table);
    this.#assistantResultContext = { kind: "table", sourceRevision, target };
    this.#elements.assistantInteractiveResult.showTable(markdown, target.start !== target.end);
  }

  async #handleAssistantResultAction(detail: AssistantResultActionDetail): Promise<void> {
    if (detail.action === "save-reference") {
      await this.#saveDiscoveredReference(detail.result, detail.index);
      return;
    }
    const context = this.#assistantResultContext;
    if (!context) return;
    if (detail.action === "insert-table" && context.kind === "table") {
      this.#insertGeneratedTable(context.target, context.sourceRevision, detail.markdown);
      return;
    }
    if (detail.action === "continue-clarity" && context.kind === "clarity-question") {
      await this.#continueClarityDrill(context.input, detail.answer);
      return;
    }
    if (detail.action === "choose-revision" && context.kind === "revision") {
      await this.#chooseAssistantRevision(context.input, detail.choice);
      return;
    }
  }

  #insertGeneratedTable(target: AuthoringPassage, sourceRevision: number, markdown: string): void {
    const source = this.#activeFileText.toString();
    if (
      !this.#assistantWorkflow.getSnapshot().matches("reviewing") ||
      !this.#hasStableDocumentBase() ||
      this.#revision !== sourceRevision ||
      source.slice(target.start, target.end) !== target.excerpt
    ) {
      this.#elements.modelStatus.textContent = "The manuscript changed. Generate the table again for the current target.";
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
    this.#elements.modelStatus.textContent = "Table inserted into the manuscript.";
  }

  #renderClarityQuestion(input: ClarityDrillContext): void {
    this.#assistantResultContext = { input, kind: "clarity-question" };
    this.#elements.assistantInteractiveResult.showClarityQuestion(input.question.issue, input.question.question);
  }

  #renderIdeas(input: AssistantDraftContext, result: ModelIdeas): void {
    this.#assistantResultContext = { input, kind: "revision" };
    this.#elements.assistantInteractiveResult.showIdeas(input.instruction, result);
  }

  #renderPhrasingAlternatives(input: AssistantDraftContext, purpose: PhrasingPurpose, result: ModelPhrasingAlternatives): void {
    this.#assistantResultContext = { input, kind: "revision" };
    this.#elements.assistantInteractiveResult.showPhrasingAlternatives(input.instruction, purpose, result);
  }

  #renderReferenceDiscovery(query: string, rationale: string, results: readonly ReferenceDiscoveryResult[]): void {
    this.#assistantResultContext = null;
    this.#elements.assistantInteractiveResult.showReferences(query, rationale, results);
  }

  async #saveDiscoveredReference(result: ReferenceDiscoveryResult, index: number): Promise<void> {
    this.#elements.assistantInteractiveResult.setReferenceSaveState(index, "saving");
    try {
      await this.#importDiscoveredReference(result);
      this.#elements.assistantInteractiveResult.setReferenceSaveState(index, "saved");
      this.#elements.modelStatus.textContent = "Reference saved. Use its Library card to add it to this project before citing.";
    } catch (error) {
      this.#elements.assistantInteractiveResult.setReferenceSaveState(index, "idle");
      this.#elements.modelStatus.textContent = error instanceof Error ? error.message : "Could not save the reference";
    }
  }

  async #saveLibraryDiscoveredReference(result: ReferenceDiscoveryResult, index: number): Promise<void> {
    this.#elements.libraryDiscoveryResults.setSaveState(index, "saving");
    try {
      await this.#importDiscoveredReference(result);
      this.#elements.libraryDiscoveryResults.setSaveState(index, "saved");
    } catch (error) {
      this.#elements.libraryDiscoveryResults.setSaveState(index, "idle");
      this.#elements.libraryDiscoverySearch.showError(error instanceof Error ? error.message : "Could not save the reference");
    }
  }

  async #importDiscoveredReference(result: ReferenceDiscoveryResult): Promise<void> {
    const response = await fetch("/api/library/import/csl-json", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([this.#referenceDiscoveryCslRecord(result)]),
    });
    await expectOk(response);
    await this.#refreshReferenceLibrary();
  }

  #referenceDiscoveryCslRecord(result: ReferenceDiscoveryResult): Record<string, unknown> {
    const metadata = result.metadata;
    const primaryIdentifier = result.identifiers[0]!;
    const record: Record<string, unknown> = {
      id: metadata.doi || `${primaryIdentifier.scheme}:${primaryIdentifier.value}`,
      type: metadata.type === "article" ? "article-journal" : metadata.type,
      title: metadata.title,
      author: metadata.authors.map((literal) => ({ literal })),
      URL: metadata.url || referenceDiscoveryIdentifierUrl(primaryIdentifier),
    };
    if (metadata.year) record.issued = { "date-parts": [[metadata.year]] };
    if (metadata.venue) record["container-title"] = metadata.venue;
    if (metadata.doi) record.DOI = metadata.doi;
    if (metadata.abstract) record.abstract = metadata.abstract;
    return record;
  }

  async #continueClarityDrill(input: ClarityDrillContext, rawAnswer: string): Promise<void> {
    const answer = rawAnswer.trim();
    const workflow = this.#assistantWorkflow.getSnapshot();
    if (!answer || !workflow.matches("awaitingInput")) {
      this.#elements.modelStatus.textContent = !answer
        ? "Answer the clarity question first."
        : workflow.matches("stale")
          ? "The manuscript changed. Start the clarity drill again for the current target."
          : "The local model is already working.";
      return;
    }
    this.#assistantWorkflow.send({ type: "CONTINUE" });
    this.#updateModelAvailability();
    this.#elements.modelStatus.textContent = "Turning that meaning into a few precise alternatives…";
    try {
      const result = await input.provider.continueClarityDrill({
        selectedPassage: input.passage.excerpt,
        instruction: input.instruction,
        evidence: input.evidence.items,
        issue: input.question.issue,
        question: input.question.question,
        answer,
      });
      this.#renderClarityRewrites(input, answer, result);
      this.#elements.modelStatus.textContent = "Choose the wording that best matches your meaning; it will still open for review.";
      this.#assistantWorkflow.send({ type: "REVIEW" });
    } catch (error) {
      this.#failAssistantGeneration(error);
    } finally {
      this.#updateModelAvailability();
    }
  }

  #renderClarityRewrites(input: ClarityDrillContext, answer: string, result: ModelClarityRewrites): void {
    this.#assistantResultContext = { input, kind: "revision" };
    this.#elements.assistantInteractiveResult.showClarityRewrites(input.instruction, answer, result);
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
      this.#elements.modelStatus.textContent = choice.successMessage;
      this.#assistantWorkflow.send({ type: "COMPLETE" });
    } catch (error) {
      const message = error instanceof Error ? error.message : choice.failureMessage;
      this.#assistantWorkflow.send({ type: "FAIL", message });
      this.#elements.modelStatus.textContent = message;
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
    const response = await jsonFetch(`${apiBase}/candidates`, {
      providerAdapter: "openai-compatible",
      providerLabel: input.providerLabel,
      model: input.model,
      promptVersion: "revise-selection-v1",
      instruction: input.instruction,
      target: { ...input.passage, sourceRevision: input.sourceRevision },
      evidence: input.evidence,
      proposedReplacement: input.replacement,
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isModelCandidate(value)) throw new Error("Candidate endpoint returned an invalid targeted revision");
    await this.#resourceRefresh.request();
    this.#openCandidateContext(this.#snapshot?.candidates.find((item) => item.id === value.id) ?? value);
  }

  async #updateCandidate(candidateId: string, action: "apply" | "reject"): Promise<void> {
    if (assistantWorkflowBusy(this.#assistantWorkflow.getSnapshot())) return;
    const candidate = this.#snapshot?.candidates.find((item) => item.id === candidateId);
    if (!this.#candidateDecisionAllowed(action, candidate)) {
      this.#showToast("Wait for the manuscript to finish synchronizing before applying a candidate.");
      return;
    }
    this.#assistantWorkflow.send({ type: "DECIDE", id: candidateId, action });
    this.#renderResearchContext(false);
    this.#updateModelAvailability();
    let failure: string | null = null;
    try {
      const response = await fetch(`${apiBase}/candidates/${candidateId}/${action}`, { method: "POST" });
      await expectOk(response);
      await this.#resourceRefresh.request();
      if (action === "reject") this.#contextState = activateResearchTab(this.#contextState, RESEARCH_ASSISTANT_KEY);
      this.#showToast(this.#candidateDecisionMessage(action, candidate?.operation === "draft-claim"));
    } catch (error) {
      failure = error instanceof Error ? error.message : "Candidate decision failed";
      await this.#resourceRefresh.request().catch(() => undefined);
      this.#showToast(failure);
    } finally {
      this.#completeCandidateDecision(candidateId, action, failure);
    }
  }

  #candidateDecisionAllowed(action: "apply" | "reject", candidate: ModelCandidate | undefined): boolean {
    if (action === "reject") return true;
    if (candidate?.operation === "draft-claim") return true;
    return this.#hasStableDocumentBase();
  }

  #candidateDecisionMessage(action: "apply" | "reject", draftsClaim: boolean): string {
    if (action === "apply") return draftsClaim ? "Evidence-backed claim created." : "Candidate applied to canonical Markdown.";
    return draftsClaim ? "Claim draft rejected; no claim created." : "Candidate rejected; manuscript unchanged.";
  }

  #completeCandidateDecision(candidateId: string, action: "apply" | "reject", failure: string | null): void {
    this.#assistantWorkflow.send(failure ? { type: "DECISION_FAILED", message: failure } : { type: "DECISION_DONE" });
    this.#renderResearchContext(false);
    this.#updateModelAvailability();
    if (!failure && action === "reject") this.#focusContextTab(RESEARCH_ASSISTANT_KEY);
    if (failure) this.#showCandidateDecisionFailure(candidateId, action, failure);
  }

  #showCandidateDecisionFailure(candidateId: string, action: "apply" | "reject", failure: string): void {
    const current = this.#snapshot?.candidates.find((candidate) => candidate.id === candidateId);
    if (current?.status !== "pending" || this.#activeResourceTab()?.id !== candidateId) return;
    const verb = action === "apply" ? "apply" : "reject";
    const subject = current.operation === "draft-claim" ? "claim draft" : "revision";
    this.#elements.candidateReviewPanel.showFailure(`Could not ${verb} ${subject}: ${failure}`);
  }

  async #updateActiveCandidate(action: "apply" | "reject"): Promise<void> {
    const tab = this.#activeResourceTab();
    if (tab?.kind !== "candidate") return;
    await this.#updateCandidate(tab.id, action);
  }

  async #showPaper(pdf: PdfResource, page?: number, focusAnnotationId?: string): Promise<void> {
    this.#captureActiveContextState();
    this.#contextState = openResearchResource(this.#contextState, { kind: "pdf", id: pdf.id });
    const key = researchResourceKey({ kind: "pdf", id: pdf.id });
    if (page !== undefined || focusAnnotationId !== undefined) {
      this.#contextState = setPdfResearchLocation(this.#contextState, key, {
        ...(page !== undefined ? { page } : {}),
        ...(focusAnnotationId !== undefined ? { focusedAnnotationId: focusAnnotationId } : {}),
      });
    }
    this.#renderResearchContext(false);
    this.#showWorkspaceSurface("context", false);
    this.#focusContextTab(key);
    this.#syncWorkspaceRoute("push");
    await this.#loadActivePdf(page !== undefined || focusAnnotationId !== undefined);
  }

  async #openLibraryPdf(artifact: LibraryPdfArtifact, page?: number, updateHistory = true): Promise<void> {
    this.#captureActiveContextState();
    this.#contextState = openResearchResource(this.#contextState, { kind: "library-pdf", id: artifact.id });
    const key = researchResourceKey({ kind: "library-pdf", id: artifact.id });
    if (page !== undefined) this.#contextState = setPdfResearchLocation(this.#contextState, key, { page });
    this.#renderResearchContext(false);
    this.#showWorkspaceSurface("context", false);
    this.#focusContextTab(key);
    if (appMode === "library" && updateHistory) {
      const active = this.#contextState.tabs.find((tab) => tab.key === key);
      const route = this.#libraryPdfRoute(artifact.id, page ?? (active?.kind === "library-pdf" ? active.page : 1));
      history.pushState({ view: "library-pdf", artifactId: artifact.id }, "", route);
    }
    if (appMode === "workspace") this.#syncWorkspaceRoute("push");
    await this.#loadActivePdf(page !== undefined);
  }

  async #openProjectReferencePdf(pdf: ProjectReferencePdf, page?: number, updateHistory = true): Promise<void> {
    this.#captureActiveContextState();
    this.#contextState = openResearchResource(this.#contextState, { kind: "library-pdf", id: pdf.id });
    const key = researchResourceKey({ kind: "library-pdf", id: pdf.id });
    if (page !== undefined) this.#contextState = setPdfResearchLocation(this.#contextState, key, { page });
    this.#renderResearchContext(false);
    this.#showWorkspaceSurface("context", false);
    this.#focusContextTab(key);
    if (appMode === "workspace" && updateHistory) this.#syncWorkspaceRoute("push");
    await this.#loadActivePdf(page !== undefined);
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
      this.#elements.libraryHighlightComposer.dataset.artifactId = artifact.id;
      this.#libraryHighlightRects = capture.rects;
      this.#editingLibraryHighlightId = null;
      this.#elements.libraryPdfAnnotationForms.showHighlight({
        page: capture.page,
        quote: capture.quote,
        comment: "",
        editing: false,
      });
      this.#elements.libraryHighlightStatus.textContent = `Page ${capture.page} selection ready.`;
      this.#setLibraryPdfInspector(true);
      return;
    }
    if (activeTab?.kind !== "pdf") return;
    if (this.#renderedPdfId) this.#elements.projectAnnotationForm.selectPdf(this.#renderedPdfId);
    this.#elements.projectAnnotationForm.showCapture(capture);
    this.#elements.projectAnnotationForm.setStatus(
      this.#highlightTool === "erase"
        ? "Erasing overlapping highlight strokes…"
        : `Captured ${capture.rects.length} ${capture.rects.length === 1 ? "line" : "lines"} from page ${capture.page}. Saving automatically…`,
    );
    void this.#persistPdfSelection(capture);
  }

  #renderLibraryHighlightComposer(artifact: LibraryPdfArtifact | undefined): void {
    if (!artifact || !this.#librarySnapshot) return;
    if (this.#elements.libraryHighlightComposer.dataset.artifactId !== artifact.id) this.#resetLibraryHighlightComposer(artifact.id);
    this.#renderLibraryProjectUse(artifact);
    const highlights = this.#librarySnapshot.highlights.filter((highlight) => highlight.artifactId === artifact.id);
    this.#pdfViewer.updatePrivateHighlights(highlights);
    const markups = (this.#librarySnapshot.pdfMarkups ?? []).filter((markup) => markup.artifactId === artifact.id);
    this.#elements.libraryPdfAnnotationToolbar.setAnnotationAvailability(
      highlights.length + markups.length,
      markups.filter((markup) => markup.kind === "drawing").length,
    );
    this.#elements.libraryHighlightList.setData({
      artifact,
      highlights,
      linkedReferenceIds: new Set(this.#snapshot?.projectReferences.map((item) => item.referenceId) ?? []),
      markups,
      researchShares: this.#snapshot?.researchShares ?? [],
      workspace: appMode === "workspace",
    });
    this.#renderPdfMarkups();
  }

  #resetLibraryHighlightComposer(artifactId: string): void {
    this.#resetPdfHighlightImport();
    this.#clearLibraryPdfShapeRecognition();
    this.#elements.libraryHighlightComposer.dataset.artifactId = artifactId;
    this.#editingLibraryHighlightId = null;
    this.#pdfAnnotation.send({ type: "CHOOSE_TOOL", tool: this.#libraryPdfTool() });
    this.#elements.libraryPdfAnnotationForms.clearHighlight(1);
    this.#elements.libraryPdfAnnotationForms.clearNote();
    this.#elements.libraryPdfAnnotationForms.clearMarkup();
    this.#elements.libraryHighlightStatus.textContent = "Select text to highlight.";
    this.#setLibraryPdfInspector(false);
  }

  async #detectLibraryPdfHighlights(): Promise<void> {
    const artifact = this.#activeLibraryPdf();
    if (!artifact?.referenceId) return;
    try {
      const result = await detectImportedPdfHighlights(`/api/library/pdfs/${encodeURIComponent(artifact.id)}`);
      if (this.#activeLibraryPdf()?.id !== artifact.id) {
        this.#resetPdfHighlightImport();
        return;
      }
      const saved = this.#librarySnapshot?.highlights.filter((highlight) => highlight.artifactId === artifact.id) ?? [];
      const candidates = result.candidates.filter(
        (candidate) =>
          !saved.some((highlight) => highlight.page === candidate.page && libraryPdfRectsOverlap(highlight.rects, candidate.rects)),
      );
      const reviewed = { ...result, candidates };
      this.#pdfHighlightDetectionArtifactId = artifact.id;
      this.#elements.pdfHighlightImportPanel.showResult(reviewed);
    } catch (error) {
      this.#pdfHighlightDetectionArtifactId = null;
      this.#elements.pdfHighlightImportPanel.showError(
        error instanceof Error ? `Could not inspect this PDF: ${error.message}` : "Could not inspect this PDF.",
      );
    }
  }

  async #importDetectedPdfHighlights(selected: readonly ReviewedPdfHighlightImport[]): Promise<void> {
    const artifact = this.#activeLibraryPdf();
    if (!artifact?.referenceId || this.#pdfHighlightDetectionArtifactId !== artifact.id) return;
    if (selected.length === 0) {
      this.#showToast("Select at least one detected highlight to import.");
      return;
    }
    this.#elements.pdfHighlightImportPanel.setImporting(true);
    try {
      const response = await jsonFetch(`/api/library/references/${encodeURIComponent(artifact.referenceId)}/highlight-imports`, {
        artifactId: artifact.id,
        candidates: selected.map(({ page, quote, comment, rects }) => ({ page, quote, comment, rects })),
      });
      await expectOk(response);
      this.#resetPdfHighlightImport(`${selected.length} ${this.#pdfHighlightImportNoun(selected.length)} imported privately.`);
      await this.#refreshReferenceLibrary();
      this.#showToast(`${selected.length} PDF ${this.#pdfHighlightImportNoun(selected.length)} imported to your library.`);
    } finally {
      this.#elements.pdfHighlightImportPanel.setImporting(false);
    }
  }

  #pdfHighlightImportNoun(count: number): string {
    return count === 1 ? "highlight" : "highlights";
  }

  #resetPdfHighlightImport(message = "Detect native annotations and flattened yellow highlights for review."): void {
    this.#pdfHighlightDetectionArtifactId = null;
    this.#elements.pdfHighlightImportPanel.reset(message);
  }

  #renderLibraryProjectUse(artifact: LibraryPdfArtifact): void {
    this.#elements.libraryProjectUse.replaceChildren();
    const reference = this.#librarySnapshot?.references.find((item) => item.id === artifact.referenceId);
    if (!reference) {
      this.#elements.libraryProjectUse.append(emptyState("Identify this PDF before using it in a project."));
      return;
    }
    const linked = this.#snapshot?.projectReferences.find((item) => item.referenceId === reference.id);
    const alias = linked?.citationAlias ?? reference.referenceKey;
    const citation = document.createElement("code");
    citation.className = "mt-2 block truncate text-xs";
    citation.textContent = `:cite[${alias}]`;
    if (!linked) {
      this.#elements.libraryProjectUse.append(
        resourceLabel("Reference not in project"),
        projectUseDescription("Add the bibliographic record to this project's reference set. This does not insert a citation."),
        citation,
        actionButton(
          "Add reference to project",
          "button-primary mt-3",
          () => void this.#linkLibraryReference(reference.id, reference.referenceKey),
        ),
      );
      return;
    }
    this.#elements.libraryProjectUse.append(
      resourceLabel("Available to project members"),
      projectUseDescription(
        "People signed in as project members can open this PDF. Public read-only and edit links never include reference PDFs; private annotations stay in your library.",
      ),
      citation,
    );
  }

  async #saveLibraryHighlight(action: Extract<LibraryPdfAnnotationAction, { action: "save-highlight" }>): Promise<void> {
    const artifact = this.#activeLibraryPdf();
    const quote = action.quote;
    if (!artifact?.referenceId || !quote) return;
    if (this.#editingLibraryHighlightId) {
      await this.#updateLibraryHighlightNote(artifact.referenceId, this.#editingLibraryHighlightId, action.comment);
      return;
    }
    await this.#createLibraryHighlight(artifact, artifact.referenceId, action);
  }

  async #updateLibraryHighlightNote(referenceId: string, highlightId: string, comment: string): Promise<void> {
    const response = await fetch(
      `/api/library/references/${encodeURIComponent(referenceId)}/highlights/${encodeURIComponent(highlightId)}`,
      {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comment }),
      },
    );
    await expectOk(response);
    this.#clearLibraryHighlightDraft("Private highlight note updated.");
    await this.#refreshReferenceLibrary();
    this.#showToast("Private highlight note updated.");
  }

  async #createLibraryHighlight(
    artifact: LibraryPdfArtifact,
    referenceId: string,
    action: Extract<LibraryPdfAnnotationAction, { action: "save-highlight" }>,
  ): Promise<void> {
    const { page, quote, comment } = action;
    const extendsExisting = this.#libraryHighlightExtendsExisting(artifact.id, page);
    const response = await jsonFetch(`/api/library/references/${encodeURIComponent(referenceId)}/highlights`, {
      artifactId: artifact.id,
      page,
      quote,
      comment,
      rects: this.#libraryHighlightRects,
    });
    await expectOk(response);
    this.#clearLibraryHighlightDraft(
      extendsExisting
        ? "Existing private highlight extended."
        : "Private highlight saved. It remains outside the project until explicitly shared.",
    );
    await this.#refreshReferenceLibrary();
    this.#elements.libraryHighlightStatus.textContent = extendsExisting
      ? "Existing private highlight extended. Select another passage to continue."
      : "Private highlight saved. Select another passage to continue.";
    this.#showToast(extendsExisting ? "Existing private highlight extended." : "Private highlight saved to your library.");
  }

  #libraryHighlightExtendsExisting(artifactId: string, page: number): boolean {
    return (
      this.#librarySnapshot?.highlights.some(
        (highlight) =>
          highlight.artifactId === artifactId &&
          highlight.page === page &&
          libraryPdfRectsOverlap(highlight.rects, this.#libraryHighlightRects),
      ) ?? false
    );
  }

  #clearLibraryHighlightDraft(message = "Selection cancelled. Nothing was saved."): void {
    this.#libraryHighlightRects = [];
    this.#editingLibraryHighlightId = null;
    this.#elements.libraryPdfAnnotationForms.clearHighlight(this.#pdfViewer.currentPage);
    this.#elements.libraryHighlightStatus.textContent = message;
    this.#pdfViewer.clearDraftSelection();
  }

  #editLibraryHighlight(highlight: LibraryHighlight): void {
    if (this.#selectedLibraryPdfMarkupId()) this.#clearLibraryPdfMarkupSelection(false);
    if (this.#libraryPdfTool() !== "select") this.#setLibraryPdfTool("select");
    this.#pdfAnnotation.send({ type: "SELECT_HIGHLIGHT", id: highlight.id });
    this.#pdfViewer.setPrivateHighlightSelection(true, highlight.id);
    this.#editingLibraryHighlightId = highlight.id;
    this.#libraryHighlightRects = [...highlight.rects];
    this.#elements.libraryPdfAnnotationForms.showHighlight({
      page: highlight.page,
      quote: highlight.quote,
      comment: highlight.comment,
      editing: true,
    });
    this.#elements.libraryHighlightStatus.textContent = `Editing the note for page ${highlight.page}.`;
    this.#setLibraryPdfInspector(true);
    this.#elements.libraryPdfAnnotationForms.focusHighlightComment();
  }

  #setLibraryPdfInspector(open: boolean, showAnnotations = false): void {
    this.#elements.libraryHighlightComposer.dataset.inspectorOpen = String(open);
    this.#elements.libraryPdfAnnotationToolbar.setInspectorOpen(open);
    if (showAnnotations) this.#elements.libraryAnnotationDetails.open = true;
  }

  #closeLibraryPdfInspector(): void {
    if (this.#elements.libraryPdfAnnotationForms.highlightOpen) this.#clearLibraryHighlightDraft();
    if (this.#elements.libraryPdfAnnotationForms.noteOpen) this.#clearLibraryPdfNoteDraft();
    if (this.#elements.libraryPdfAnnotationForms.markupOpen) this.#clearLibraryPdfMarkupSelection();
    this.#setLibraryPdfInspector(false);
    this.#elements.libraryPdfAnnotationToolbar.focusInspectorButton();
  }

  #setLibraryPdfTool(tool: "select" | "text" | "note" | "draw"): void {
    if (tool !== "draw") this.#clearLibraryPdfShapeRecognition();
    this.#pdfAnnotation.send({ type: "CHOOSE_TOOL", tool });
    if (tool !== "draw") delete this.#elements.paperMarkups.dataset.drawingActive;
    this.#elements.paperMarkups.dataset.tool = tool;
    this.#elements.paperTextLayer.style.pointerEvents = tool === "text" ? "auto" : "none";
    this.#elements.libraryPdfAnnotationToolbar.setTool(tool);
    this.#pdfViewer.setPrivateHighlightSelection(tool === "select", this.#selectedLibraryHighlightId());
    this.#elements.libraryHighlightStatus.textContent = this.#libraryPdfToolStatus(tool);
    if (tool !== "note") this.#clearLibraryPdfNoteDraft(false);
    if (tool !== "select") this.#clearLibraryPdfMarkupSelection(false);
    if (this.#libraryPdfInspectorEmpty()) this.#setLibraryPdfInspector(false);
  }

  #libraryPdfToolStatus(tool: PdfAnnotationTool): string {
    if (tool === "select") return "Tap an existing highlight, line, or note to edit it. Drag a selected note to move it.";
    if (tool === "text") return "Select text to highlight.";
    if (tool === "note") return "Tap the page to place a note.";
    return "Draw with Apple Pencil or a mouse. Touch gestures pan and zoom.";
  }

  #libraryPdfInspectorEmpty(): boolean {
    return this.#elements.libraryPdfAnnotationForms.empty;
  }

  #startLibraryPdfMarkup(event: PointerEvent): void {
    const note = (event.target as Element).closest<HTMLButtonElement>(".pdf-note-pin");
    if (note) return this.#startLibraryPdfNoteDrag(note, event);
    const drawing = (event.target as Element).closest<SVGElement>(".pdf-ink-stroke");
    if (drawing?.dataset.markupId && this.#libraryPdfTool() === "select") {
      event.preventDefault();
      this.#selectLibraryPdfMarkup(drawing.dataset.markupId);
      return;
    }
    const point = this.#normalizedPdfPoint(event);
    if (!point) return;
    if (this.#libraryPdfTool() === "note") {
      this.#startLibraryPdfNote(event, point);
      return;
    }
    if (this.#libraryPdfTool() !== "draw") return;
    if (event.pointerType === "touch") {
      this.#elements.libraryHighlightStatus.textContent = "Use Apple Pencil or a mouse to draw; touch gestures pan and zoom the page.";
      return;
    }
    this.#startLibraryPdfDrawing(event, point);
  }

  #startLibraryPdfNoteDrag(note: HTMLButtonElement, event: PointerEvent): void {
    const id = note.dataset.markupId;
    if (!id || this.#libraryPdfTool() !== "select") return;
    this.#selectLibraryPdfMarkup(id);
    this.#pdfAnnotation.send({ type: "START_NOTE_DRAG", id, pointerId: event.pointerId, x: event.clientX, y: event.clientY });
    this.#elements.paperMarkups.setPointerCapture(event.pointerId);
  }

  #startLibraryPdfNote(event: PointerEvent, point: LibraryPdfPoint): void {
    this.#pdfAnnotation.send({
      type: "START_NOTE_PRESS",
      pointerId: event.pointerId,
      page: this.#pdfViewer.currentPage,
      point,
      x: event.clientX,
      y: event.clientY,
    });
  }

  #startLibraryPdfDrawing(event: PointerEvent, point: LibraryPdfPoint): void {
    event.preventDefault();
    this.#clearLibraryPdfShapeRecognition();
    this.#pdfAnnotation.send({ type: "START_DRAWING", pointerId: event.pointerId, point });
    this.#elements.paperMarkups.setPointerCapture(event.pointerId);
    this.#elements.paperMarkups.dataset.drawingActive = "true";
    this.#renderPdfMarkups();
  }

  #continueLibraryPdfDrawing(event: PointerEvent): void {
    const notePress = this.#pdfAnnotationSnapshot().context.notePress;
    if (notePress?.pointerId === event.pointerId) {
      this.#pdfAnnotation.send({ type: "MOVE_NOTE_PRESS", pointerId: event.pointerId, x: event.clientX, y: event.clientY });
      return;
    }
    const drag = this.#pdfNoteDrag();
    if (drag?.pointerId === event.pointerId) {
      this.#continueLibraryPdfNoteDrag(event, drag.id);
      return;
    }
    const draft = this.#pdfDrawingDraft();
    if (this.#pdfDrawingPointer() !== event.pointerId || !draft) return;
    if (this.#pdfDrawingShape) {
      this.#adjustLibraryPdfDrawingShape(event);
      return;
    }
    this.#appendLibraryPdfDrawingPoints(event, draft);
  }

  #continueLibraryPdfNoteDrag(event: PointerEvent, noteId: string): void {
    const point = this.#normalizedPdfPoint(event);
    const pin = this.#elements.paperMarkups.querySelector<HTMLElement>(`.pdf-note-pin[data-markup-id="${CSS.escape(noteId)}"]`);
    if (!point || !pin) return;
    this.#pdfAnnotation.send({ type: "MOVE_NOTE_DRAG", pointerId: event.pointerId, x: event.clientX, y: event.clientY });
    if (!this.#pdfNoteDrag()?.moved) return;
    event.preventDefault();
    pin.style.left = `${point.x * 100}%`;
    pin.style.top = `${point.y * 100}%`;
  }

  #appendLibraryPdfDrawingPoints(event: PointerEvent, draft: readonly LibraryPdfPoint[]): void {
    // Safari can otherwise promote an active Apple Pencil stroke to a native
    // scroll once the zoomed page starts moving, despite cancelling pointerdown.
    event.preventDefault();
    const samples = event.getCoalescedEvents?.() ?? [event];
    const points = [...draft];
    const additions: LibraryPdfPoint[] = [];
    for (const sample of samples) {
      const point = this.#normalizedPdfPoint(sample);
      const previous = points.at(-1);
      if (!point || (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0015)) continue;
      points.push(point);
      additions.push(point);
    }
    if (additions.length === 0) return;
    this.#pdfAnnotation.send({ type: "ADD_DRAWING_POINTS", pointerId: event.pointerId, points: additions });
    if (this.#pdfDrawingDraftLine) this.#pdfDrawingDraftLine.setAttribute("points", this.#drawingPoints(points));
    this.#scheduleLibraryPdfShapeRecognition(event.pointerId);
  }

  #scheduleLibraryPdfShapeRecognition(pointerId: number): void {
    if (this.#pdfDrawingShapeTimer !== undefined) window.clearTimeout(this.#pdfDrawingShapeTimer);
    this.#pdfDrawingShapeTimer = window.setTimeout(() => {
      this.#pdfDrawingShapeTimer = undefined;
      const draft = this.#pdfDrawingDraft();
      const rect = this.#elements.paperMarkups.getBoundingClientRect();
      if (this.#pdfDrawingPointer() !== pointerId || !draft || rect.width <= 0 || rect.height <= 0) return;
      const shape = recognizeDrawnShape(draft.map((point) => ({ x: point.x * rect.width, y: point.y * rect.height })));
      if (!shape) return;
      this.#pdfDrawingShape = shape;
      const points = this.#normalizedLibraryPdfShapePoints(shape.points, rect);
      this.#pdfAnnotation.send({ type: "SNAP_DRAWING_SHAPE", pointerId, points });
      if (this.#pdfDrawingDraftLine) this.#pdfDrawingDraftLine.setAttribute("points", this.#drawingPoints(points));
      const label = { line: "Line", ellipse: "Circle", rectangle: "Rectangle", triangle: "Triangle" }[shape.kind];
      this.#elements.libraryHighlightStatus.textContent = `${label} snapped into place. Keep dragging to adjust it, or lift to save.`;
    }, 850);
  }

  #adjustLibraryPdfDrawingShape(event: PointerEvent): void {
    const point = this.#normalizedPdfPoint(event);
    const shape = this.#pdfDrawingShape;
    const rect = this.#elements.paperMarkups.getBoundingClientRect();
    if (!point || !shape || rect.width <= 0 || rect.height <= 0) return;
    event.preventDefault();
    const adjusted = manipulateRecognizedShape(shape, { x: point.x * rect.width, y: point.y * rect.height });
    const points = this.#normalizedLibraryPdfShapePoints(adjusted, rect);
    this.#pdfAnnotation.send({ type: "ADJUST_DRAWING_SHAPE", pointerId: event.pointerId, points });
    if (this.#pdfDrawingDraftLine) this.#pdfDrawingDraftLine.setAttribute("points", this.#drawingPoints(points));
  }

  #normalizedLibraryPdfShapePoints(
    points: readonly { readonly x: number; readonly y: number }[],
    rect: Pick<DOMRect, "width" | "height">,
  ): readonly LibraryPdfPoint[] {
    return points.map((point) => ({
      x: Math.max(0, Math.min(1, point.x / rect.width)),
      y: Math.max(0, Math.min(1, point.y / rect.height)),
    }));
  }

  async #finishLibraryPdfDrawing(event: PointerEvent): Promise<void> {
    if (this.#pdfAnnotationSnapshot().context.notePress?.pointerId === event.pointerId) {
      this.#finishLibraryPdfNotePress(event.pointerId);
      return;
    }
    if (this.#pdfNoteDrag()?.pointerId === event.pointerId) {
      await this.#finishLibraryPdfNoteDrag(event);
      return;
    }
    const draft = this.#pdfDrawingDraft();
    if (this.#pdfDrawingPointer() !== event.pointerId || !draft) return;
    const points = [...draft];
    this.#pdfAnnotation.send({ type: "FINISH_DRAWING", pointerId: event.pointerId });
    this.#cancelLibraryPdfDrawing();
    await this.#persistLibraryPdfDrawing(points);
  }

  #finishLibraryPdfNotePress(pointerId: number): void {
    this.#pdfAnnotation.send({ type: "FINISH_NOTE_PRESS", pointerId });
    if (this.#pdfAnnotationSnapshot().value !== "composingNote") return;
    this.#elements.libraryPdfAnnotationForms.showNote();
    this.#setLibraryPdfInspector(true);
    this.#renderPdfMarkups();
    this.#elements.libraryPdfAnnotationForms.focusNote();
  }

  async #persistLibraryPdfDrawing(points: readonly LibraryPdfPoint[]): Promise<void> {
    const artifact = this.#activeLibraryPdf();
    if (!artifact?.referenceId || points.length < 2) return this.#renderPdfMarkups();
    const { color, width } = this.#elements.libraryPdfAnnotationToolbar.drawingStyle;
    const response = await jsonFetch(`/api/library/references/${encodeURIComponent(artifact.referenceId)}/pdf-markups`, {
      kind: "drawing",
      artifactId: artifact.id,
      page: this.#pdfViewer.currentPage,
      color,
      width,
      points,
    });
    await expectOk(response);
    await this.#refreshReferenceLibrary();
    this.#showToast("Drawing saved privately.");
  }

  #cancelLibraryPdfDrawing(): void {
    this.#pdfAnnotation.send({ type: "CANCEL_POINTER" });
    this.#clearLibraryPdfShapeRecognition();
    delete this.#elements.paperMarkups.dataset.drawingActive;
    this.#pdfDrawingDraftLine = null;
  }

  #clearLibraryPdfShapeRecognition(): void {
    if (this.#pdfDrawingShapeTimer !== undefined) window.clearTimeout(this.#pdfDrawingShapeTimer);
    this.#pdfDrawingShapeTimer = undefined;
    this.#pdfDrawingShape = null;
  }

  async #saveLibraryPdfNote(body: string): Promise<void> {
    const artifact = this.#activeLibraryPdf();
    const noteDraft = this.#pendingPdfNote();
    if (!artifact?.referenceId || !noteDraft || !body) return;
    const { editingId, ...anchor } = noteDraft;
    if (editingId) {
      const response = await fetch(
        `/api/library/references/${encodeURIComponent(artifact.referenceId)}/pdf-markups/${encodeURIComponent(editingId)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...anchor, body }),
        },
      );
      await expectOk(response);
      this.#clearLibraryPdfNoteDraft(true, true);
      await this.#refreshReferenceLibrary();
      this.#setLibraryPdfInspector(false);
      this.#showToast("Private note updated.");
      return;
    }
    const response = await jsonFetch(`/api/library/references/${encodeURIComponent(artifact.referenceId)}/pdf-markups`, {
      kind: "note",
      artifactId: artifact.id,
      ...anchor,
      body,
    });
    await expectOk(response);
    this.#clearLibraryPdfNoteDraft(true, true);
    await this.#refreshReferenceLibrary();
    this.#setLibraryPdfInspector(false);
    this.#showToast("Note attached privately.");
  }

  #clearLibraryPdfNoteDraft(render = true, saved = false): void {
    this.#pdfAnnotation.send({ type: saved ? "NOTE_SAVED" : "CANCEL_NOTE" });
    this.#elements.libraryPdfAnnotationForms.clearNote();
    if (render) this.#renderPdfMarkups();
  }

  #editLibraryPdfNote(note: LibraryPdfNote): void {
    if (this.#libraryPdfTool() !== "select") this.#setLibraryPdfTool("select");
    this.#pdfAnnotation.send({ type: "EDIT_NOTE", id: note.id, page: note.page, point: { x: note.x, y: note.y } });
    this.#renderPdfMarkups();
    this.#elements.libraryPdfAnnotationForms.showNote(note.body);
    this.#elements.libraryHighlightStatus.textContent = `Editing the note on page ${note.page}.`;
    this.#setLibraryPdfInspector(true);
    this.#elements.libraryPdfAnnotationForms.focusNote();
  }

  #selectLibraryHighlight(highlightId: string): void {
    const highlight = this.#librarySnapshot?.highlights.find((item) => item.id === highlightId);
    if (!highlight) return;
    this.#clearLibraryPdfMarkupSelection(false);
    this.#editLibraryHighlight(highlight);
  }

  #selectLibraryPdfMarkup(markupId: string): void {
    const markup = (this.#librarySnapshot?.pdfMarkups ?? []).find((item) => item.id === markupId);
    if (!markup) return;
    if (this.#elements.libraryPdfAnnotationForms.highlightOpen) this.#clearLibraryHighlightDraft();
    this.#pdfAnnotation.send({ type: "SELECT_MARKUP", id: markup.id });
    this.#pdfViewer.setPrivateHighlightSelection(true);
    this.#elements.libraryPdfAnnotationForms.showMarkup({
      label: markup.kind === "note" ? `Note on page ${markup.page} · drag its pin to move` : `Line on page ${markup.page}`,
      kind: markup.kind,
      ...(markup.kind === "drawing" ? { color: markup.color, width: markup.width } : {}),
    });
    this.#elements.libraryHighlightStatus.textContent =
      markup.kind === "note"
        ? "Note selected. Drag the pin to move it, or edit its text below."
        : "Line selected. Adjust its style or delete it.";
    this.#setLibraryPdfInspector(true);
    this.#renderPdfMarkups();
  }

  #clearLibraryPdfMarkupSelection(render = true): void {
    this.#pdfAnnotation.send({ type: "CLEAR_SELECTION" });
    this.#elements.libraryPdfAnnotationForms.clearMarkup();
    this.#pdfViewer.setPrivateHighlightSelection(this.#libraryPdfTool() === "select");
    if (render) this.#renderPdfMarkups();
  }

  #editSelectedLibraryPdfNote(): void {
    const note = (this.#librarySnapshot?.pdfMarkups ?? []).find(
      (item): item is LibraryPdfNote => item.kind === "note" && item.id === this.#selectedLibraryPdfMarkupId(),
    );
    if (note) this.#editLibraryPdfNote(note);
  }

  async #updateSelectedLibraryDrawing(action: Extract<LibraryPdfAnnotationAction, { action: "apply-drawing" }>): Promise<void> {
    const drawing = (this.#librarySnapshot?.pdfMarkups ?? []).find(
      (item): item is LibraryPdfDrawing => item.kind === "drawing" && item.id === this.#selectedLibraryPdfMarkupId(),
    );
    if (!drawing) return;
    const response = await fetch(
      `/api/library/references/${encodeURIComponent(drawing.referenceId)}/pdf-markups/${encodeURIComponent(drawing.id)}`,
      {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          color: action.color,
          width: action.width,
        }),
      },
    );
    await expectOk(response);
    await this.#refreshReferenceLibrary();
    this.#showToast("Line style updated.");
  }

  async #deleteSelectedLibraryPdfMarkup(): Promise<void> {
    const markup = (this.#librarySnapshot?.pdfMarkups ?? []).find((item) => item.id === this.#selectedLibraryPdfMarkupId());
    if (!markup) return;
    this.#clearLibraryPdfMarkupSelection(false);
    await this.#deleteLibraryPdfMarkup(markup);
  }

  #activeLibraryPdf(): LibraryPdfArtifact | undefined {
    const tab = this.#activeResourceTab();
    return tab?.kind === "library-pdf" ? this.#librarySnapshot?.artifacts.find((item) => item.id === tab.id) : undefined;
  }

  #normalizedPdfPoint(event: PointerEvent): LibraryPdfPoint | null {
    const rect = this.#elements.paperMarkups.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  #renderPdfMarkups(): void {
    const artifact = this.#activeLibraryPdf();
    const page = this.#pdfViewer.currentPage;
    const drawingDraft = this.#pdfDrawingDraft();
    const noteDraft = this.#pendingPdfNote();
    const selectedMarkupId = this.#selectedLibraryPdfMarkupId();
    const markups = this.#visibleLibraryPdfMarkups(artifact, page);
    this.#elements.paperMarkups.replaceChildren();
    const drawings = markups.filter((item): item is LibraryPdfDrawing => item.kind === "drawing");
    if (drawingDraft) drawings.push(this.#draftLibraryPdfDrawing(artifact, page, drawingDraft));
    this.#renderLibraryPdfDrawings(drawings, selectedMarkupId);
    this.#renderLibraryPdfNoteDraft(noteDraft, page);
    for (const note of markups.filter((item): item is LibraryPdfNote => item.kind === "note"))
      this.#renderLibraryPdfNote(note, selectedMarkupId);
    this.#elements.libraryPdfAnnotationToolbar.setUndoAvailable(markups.some((item) => item.kind === "drawing"));
  }

  #visibleLibraryPdfMarkups(artifact: LibraryPdfArtifact | undefined, page: number): LibraryPdfMarkup[] {
    if (!artifact) return [];
    return (this.#librarySnapshot?.pdfMarkups ?? []).filter((item) => item.artifactId === artifact.id && item.page === page);
  }

  #draftLibraryPdfDrawing(artifact: LibraryPdfArtifact | undefined, page: number, points: readonly LibraryPdfPoint[]): LibraryPdfDrawing {
    const { color, width } = this.#elements.libraryPdfAnnotationToolbar.drawingStyle;
    return {
      id: "draft",
      kind: "drawing",
      referenceId: artifact?.referenceId ?? "",
      artifactId: artifact?.id ?? "",
      page,
      color,
      width,
      points: [...points],
      createdAt: "",
      updatedAt: "",
    };
  }

  #renderLibraryPdfDrawings(drawings: readonly LibraryPdfDrawing[], selectedMarkupId: string | null): void {
    if (drawings.length === 0) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("pdf-ink-layer");
    svg.setAttribute("viewBox", "0 0 1000 1000");
    svg.setAttribute("preserveAspectRatio", "none");
    for (const drawing of drawings) svg.append(this.#libraryPdfDrawingLine(drawing, selectedMarkupId));
    this.#elements.paperMarkups.append(svg);
  }

  #libraryPdfDrawingLine(drawing: LibraryPdfDrawing, selectedMarkupId: string | null): SVGPolylineElement {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", this.#drawingPoints(drawing.points));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", drawing.color);
    line.setAttribute("stroke-width", String(drawing.width));
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    line.classList.add("pdf-ink-stroke");
    line.dataset.markupId = drawing.id;
    if (drawing.id === selectedMarkupId) line.dataset.selected = "true";
    if (drawing.id === "draft") this.#pdfDrawingDraftLine = line;
    return line;
  }

  #renderLibraryPdfNoteDraft(noteDraft: PendingPdfNote, page: number): void {
    if (noteDraft?.page !== page || noteDraft.editingId) return;
    const pin = document.createElement("span");
    pin.className = "pdf-note-pin";
    pin.dataset.draft = "true";
    pin.style.left = `${noteDraft.x * 100}%`;
    pin.style.top = `${noteDraft.y * 100}%`;
    pin.setAttribute("aria-label", `New note location on page ${page}`);
    pin.title = "New note location";
    this.#elements.paperMarkups.append(pin);
  }

  #renderLibraryPdfNote(note: LibraryPdfNote, selectedMarkupId: string | null): void {
    const pin = document.createElement("button");
    pin.className = "pdf-note-pin";
    pin.type = "button";
    pin.dataset.markupId = note.id;
    if (note.id === selectedMarkupId) pin.dataset.selected = "true";
    pin.style.left = `${note.x * 100}%`;
    pin.style.top = `${note.y * 100}%`;
    pin.setAttribute("aria-label", `Open note on page ${note.page}`);
    pin.title = this.#libraryPdfTool() === "select" ? "Tap to select; drag to move" : "Choose Select to edit this note";
    this.#elements.paperMarkups.append(pin);
    if (this.#pdfAnnotationSnapshot().context.openNoteId === note.id) this.#elements.paperMarkups.append(this.#libraryPdfNoteCard(note));
  }

  #libraryPdfNoteCard(note: LibraryPdfNote): HTMLElement {
    const card = document.createElement("aside");
    card.className = "pdf-note-card";
    card.style.left = `${Math.min(note.x * 100, 70)}%`;
    card.style.top = `${Math.min(note.y * 100, 82)}%`;
    card.setAttribute("aria-label", `Note on page ${note.page}`);
    const body = document.createElement("p");
    body.textContent = note.body;
    const close = document.createElement("button");
    close.className = "pdf-note-card-close";
    close.type = "button";
    close.setAttribute("aria-label", `Close note on page ${note.page}`);
    close.title = "Close note";
    close.textContent = "×";
    close.addEventListener("click", (event) => this.#closeLibraryPdfNoteCard(event, note.id));
    card.append(body, close);
    return card;
  }

  #closeLibraryPdfNoteCard(event: MouseEvent, noteId: string): void {
    event.stopPropagation();
    this.#pdfAnnotation.send({ type: "CLOSE_NOTE_CARD" });
    this.#renderPdfMarkups();
    this.#elements.paperMarkups.querySelector<HTMLButtonElement>(`.pdf-note-pin[data-markup-id="${CSS.escape(noteId)}"]`)?.focus();
  }

  async #undoLibraryDrawing(): Promise<void> {
    const artifact = this.#activeLibraryPdf();
    const drawing = (this.#librarySnapshot?.pdfMarkups ?? [])
      .filter(
        (item): item is LibraryPdfDrawing =>
          item.kind === "drawing" && item.artifactId === artifact?.id && item.page === this.#pdfViewer.currentPage,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))[0];
    if (drawing) await this.#deleteLibraryPdfMarkup(drawing);
  }

  #drawingPoints(points: readonly LibraryPdfPoint[]): string {
    return points.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ");
  }

  async #finishLibraryPdfNoteDrag(event: PointerEvent): Promise<void> {
    const drag = this.#pdfNoteDrag();
    if (!drag) return;
    this.#pdfAnnotation.send({ type: "FINISH_NOTE_DRAG", pointerId: event.pointerId });
    if (!drag.moved) {
      this.#pdfAnnotation.send({ type: "TOGGLE_NOTE_CARD", id: drag.id });
      this.#renderPdfMarkups();
      return;
    }
    const point = this.#normalizedPdfPoint(event);
    const note = (this.#librarySnapshot?.pdfMarkups ?? []).find(
      (item): item is LibraryPdfNote => item.kind === "note" && item.id === drag.id,
    );
    if (!point || !note) return this.#renderPdfMarkups();
    const response = await fetch(
      `/api/library/references/${encodeURIComponent(note.referenceId)}/pdf-markups/${encodeURIComponent(note.id)}`,
      {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(point),
      },
    );
    await expectOk(response);
    await this.#refreshReferenceLibrary();
    this.#showToast("Note moved.");
  }

  async #deleteLibraryPdfMarkup(markup: LibraryPdfMarkup): Promise<void> {
    const response = await fetch(
      `/api/library/references/${encodeURIComponent(markup.referenceId)}/pdf-markups/${encodeURIComponent(markup.id)}`,
      { method: "DELETE", credentials: "same-origin" },
    );
    await expectOk(response);
    await this.#refreshReferenceLibrary();
    this.#showToast("Private annotation deleted.");
  }

  async #downloadAnnotatedPdf(): Promise<void> {
    const artifact = this.#activeLibraryPdf();
    if (!artifact) return;
    const url = `/api/library/pdfs/${encodeURIComponent(artifact.id)}/annotated`;
    const filename = artifact.name.replace(/\.pdf$/iu, "") + "-annotated.pdf";
    if (installedWebApp() && typeof navigator.share === "function") {
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        await expectOk(response);
        const file = new File([await response.blob()], filename, { type: "application/pdf" });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          this.#showToast("Choose Save to Files to keep the annotated PDF.");
          await navigator.share({ files: [file], title: filename });
          return;
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        this.#showToast("Could not open the file saver. Downloading instead.");
      }
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    this.#showToast("Preparing annotated PDF…");
  }

  async #openLibraryHighlight(highlight: LibraryHighlight): Promise<void> {
    const artifact = this.#librarySnapshot?.artifacts.find((item) => item.id === highlight.artifactId);
    if (!artifact) return;
    await this.#openLibraryPdf(artifact, highlight.page);
    this.#elements.libraryHighlightStatus.textContent = `Showing saved private highlight on page ${highlight.page}.`;
  }

  async #persistPdfSelection(capture: PdfSelectionCapture): Promise<void> {
    const pdfId = this.#renderedPdfId;
    if (!pdfId || !this.#snapshot) return;
    const overlaps = this.#overlappingPdfFragments(pdfId, capture);
    if (this.#highlightTool === "erase") {
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
    for (const overlap of overlaps) await this.#removeHighlightFragment(overlap.annotation.id, overlap.fragment.id, false);
    this.#pdfViewer.clearDraftSelection();
    const noun = overlaps.length === 1 ? "stroke" : "strokes";
    this.#elements.projectAnnotationForm.setStatus(`Removed ${overlaps.length} overlapping highlight ${noun}.`);
    this.#showToast("Highlight content erased.");
  }

  async #savePdfSelection(pdfId: string, capture: PdfSelectionCapture, target: AnnotationResource | undefined): Promise<void> {
    const response = target
      ? await jsonFetch(`${apiBase}/annotations/${encodeURIComponent(target.id)}/fragments`, capture)
      : await jsonFetch(`${apiBase}/annotations`, { pdfId, ...capture, comment: "" });
    await expectOk(response);
    const annotationValue: unknown = await response.json();
    if (!isCreatedAnnotation(annotationValue)) throw new Error("Highlight endpoint returned an invalid resource");
    const fragment = annotationValue.fragments.at(-1);
    if (!fragment) throw new Error("Highlight endpoint omitted the saved stroke");
    this.#editingAnnotationId = annotationValue.id;
    this.#lastHighlightStroke = { annotationId: annotationValue.id, fragmentId: fragment.id };
    this.#elements.undoHighlight.disabled = false;
    this.#elements.projectAnnotationForm.showAnnotation(annotationValue);
    this.#pdfViewer.clearDraftSelection();
    await this.#resourceRefresh.request();
    this.#elements.projectAnnotationForm.setStatus(
      target
        ? `Added a stroke to the existing highlight. ${annotationValue.fragments.length} strokes saved automatically.`
        : "Highlight saved automatically. Add an optional note or link it to selected manuscript prose.",
    );
  }

  #setHighlightTool(tool: "paint" | "erase"): void {
    this.#highlightTool = tool;
    this.#elements.highlightPaintTool.setAttribute("aria-pressed", String(tool === "paint"));
    this.#elements.highlightEraserTool.setAttribute("aria-pressed", String(tool === "erase"));
    this.#pdfViewer.setTool(tool);
    this.#elements.projectAnnotationForm.setStatus(
      tool === "paint"
        ? "Paint PDF text to save or extend a highlight."
        : "Select across a saved highlight stroke or tap it to erase that content.",
    );
  }

  async #activateHighlightFragment(annotationId: string, fragmentId: string): Promise<void> {
    if (this.#highlightTool === "erase") {
      await this.#removeHighlightFragment(annotationId, fragmentId, true);
      return;
    }
    const annotation = this.#snapshot?.annotations.find((item) => item.id === annotationId);
    if (!annotation) return;
    this.#editingAnnotationId = annotation.id;
    this.#elements.projectAnnotationForm.showAnnotation(annotation);
    this.#focusAnnotationCard(annotationId);
  }

  async #removeHighlightFragment(annotationId: string, fragmentId: string, announce: boolean): Promise<void> {
    const response = await fetch(`${apiBase}/annotations/${encodeURIComponent(annotationId)}/fragments/${encodeURIComponent(fragmentId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    await expectOk(response);
    if (this.#editingAnnotationId === annotationId && response.status === 204) this.#editingAnnotationId = null;
    await this.#resourceRefresh.request();
    if (announce) this.#showToast("Highlight stroke erased.");
  }

  async #updateHighlightFragment(
    annotationId: string,
    fragmentId: string,
    quote: string,
    prefix: string,
    suffix: string,
    rects: readonly PdfSelectionRect[],
  ): Promise<void> {
    if (!quote.trim()) {
      this.#showToast("A highlight stroke needs enough text to find the idea again.");
      return;
    }
    const response = await jsonFetch(
      `${apiBase}/annotations/${encodeURIComponent(annotationId)}/fragments/${encodeURIComponent(fragmentId)}`,
      { quote: quote.trim(), prefix, suffix, rects },
      "PUT",
    );
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast("Highlight stroke adjusted.");
  }

  async #undoLastHighlightStroke(): Promise<void> {
    const stroke = this.#lastHighlightStroke;
    if (!stroke) return;
    await this.#removeHighlightFragment(stroke.annotationId, stroke.fragmentId, false);
    this.#lastHighlightStroke = null;
    this.#elements.undoHighlight.disabled = true;
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
    this.#snapshot = this.#resolveSnapshotAnchors(record.snapshot);
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
    this.#elements.saveStatus.textContent = pending ? "Saved offline" : "Saved";
    void this.#renderPreview();
    return true;
  }

  #scheduleOfflineSave(delay = 120): void {
    if (!this.#offlineStore || !this.#snapshot || !this.#collaborationWorkflow.getSnapshot().context.offlineAvailable) return;
    const version = ++this.#offlineSaveVersion;
    window.clearTimeout(this.#offlineSaveTimer);
    this.#offlineSaveTimer = window.setTimeout(() => {
      this.#offlineSaveTimer = undefined;
      this.#offlineSaveChain = this.#offlineSaveChain
        .catch(() => undefined)
        .then(async () => await this.#persistOfflineWorkspace())
        .then(() => {
          if (version !== this.#offlineSaveVersion) return;
          document.body.dataset.offlineCached = "true";
          document.body.dataset.offlineSavedAt = String(version);
          if (!collaborationSynced(this.#collaborationWorkflow.getSnapshot())) this.#elements.saveStatus.textContent = "Saved offline";
        });
      void this.#offlineSaveChain.catch((error: unknown) => {
        if (!collaborationSynced(this.#collaborationWorkflow.getSnapshot())) this.#elements.saveStatus.textContent = "Offline save failed";
        this.#showToast(error instanceof Error ? error.message : "Could not save the manuscript offline");
      });
    }, delay);
  }

  async #persistOfflineWorkspace(): Promise<void> {
    if (!this.#offlineStore || !this.#snapshot || !this.#collaborationWorkflow.getSnapshot().context.offlineAvailable) return;
    await this.#offlineStore.save(this.#snapshot, Y.encodeStateAsUpdate(this.#document), this.#serverStateVector);
  }

  async #prepareOfflineShell(): Promise<void> {
    try {
      const registered = await registerOfflineServiceWorker(navigator.serviceWorker, () => {
        this.#applicationUpdateAvailable = true;
        this.#showApplicationUpdate();
      });
      if (!registered || appMode !== "workspace" || typeof caches === "undefined") return;
      if (await cacheOfflineNavigation(caches, fetch, location.href)) document.body.dataset.offlineReady = "true";
    } catch {
      // The online application remains fully usable when offline APIs are unavailable.
    }
  }

  async #clearOfflineBrowserData(): Promise<void> {
    window.clearTimeout(this.#offlineSaveTimer);
    await this.#offlineSaveChain.catch(() => undefined);
    await Promise.all([
      clearAllOfflineWorkspaces(typeof indexedDB === "undefined" ? undefined : indexedDB),
      clearOfflineShellCaches(typeof caches === "undefined" ? undefined : caches),
    ]);
  }

  #setConnection(label: string, connected: boolean): void {
    this.#elements.connectionStatus.textContent = label;
    this.#elements.connectionDot.className = `h-2 w-2 rounded-full ${connected ? "bg-app-accent" : "bg-app-warn"}`;
  }

  #setEditorsEnabled(enabled: boolean): void {
    this.#elements.source.disabled = !enabled;
    this.#elements.bibliography.disabled = !enabled;
  }

  #updateRevision(): void {
    this.#elements.revisionBadge.textContent = `r${this.#revision}`;
  }

  #showToast(message: string, action?: ToastAction): void {
    window.clearTimeout(this.#toastTimer);
    if (action) {
      const label = document.createElement("span");
      label.textContent = message;
      const button = document.createElement("button");
      button.className = "toast-action";
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", action.run, { once: true });
      this.#elements.toast.replaceChildren(label, button);
    } else {
      this.#elements.toast.textContent = message;
    }
    this.#elements.toast.dataset.visible = "true";
    this.#presentToast();
    if (action?.persistent) return;
    this.#toastTimer = window.setTimeout(() => {
      delete this.#elements.toast.dataset.visible;
      if (this.#elements.toast.matches(":popover-open")) this.#elements.toast.hidePopover();
      if (this.#applicationUpdateAvailable) this.#showApplicationUpdate();
    }, action?.durationMs ?? 3_200);
  }

  #showApplicationUpdate(): void {
    this.#showToast("A new version of Kirjolab is available.", {
      label: "Refresh now",
      persistent: true,
      run: () => {
        void this.#persistOfflineWorkspace().finally(() => location.reload());
      },
    });
  }

  #presentToast(): void {
    const modal = document.querySelector<HTMLDialogElement>("dialog:modal");
    if (modal) {
      if (this.#elements.toast.matches(":popover-open")) this.#elements.toast.hidePopover();
      this.#elements.toast.removeAttribute("popover");
      modal.append(this.#elements.toast);
      modal.addEventListener(
        "close",
        () => {
          if (!this.#elements.toast.dataset.visible || this.#elements.toast.closest("dialog") !== modal) return;
          document.body.append(this.#elements.toast);
          this.#elements.toast.setAttribute("popover", "manual");
          this.#elements.toast.showPopover();
        },
        { once: true },
      );
      return;
    }
    if (this.#elements.toast.parentElement !== document.body) document.body.append(this.#elements.toast);
    this.#elements.toast.setAttribute("popover", "manual");
    if (!this.#elements.toast.matches(":popover-open")) this.#elements.toast.showPopover();
  }
}

interface YTextBinding {
  readonly destroy: () => void;
  readonly renderHighlight: () => void;
}

type EditorPresenceSegment = ReturnType<typeof editorPresenceSegments>[number];
type VimCommand = ReturnType<typeof handleVimKey>;

function bindYText(
  textarea: HTMLTextAreaElement,
  text: Y.Text,
  documentModel: Y.Doc,
  highlight?: HTMLElement,
  presence: () => readonly EditorPresenceRange[] = () => [],
  undoManager?: Y.UndoManager,
): YTextBinding {
  const renderHighlight = (): void => {
    if (!highlight) return;
    renderEditorHighlight(highlight, textarea.value, presence());
  };
  const syncHighlightScroll = (): void => {
    if (!highlight) return;
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  };
  const handleInput = (): void => {
    renderHighlight();
    const splice = calculateTextSplice(text.toString(), textarea.value);
    if (!splice) return;
    documentModel.transact(() => {
      if (splice.deleteCount > 0) text.delete(splice.start, splice.deleteCount);
      if (splice.insert) text.insert(splice.start, splice.insert);
    }, textarea);
  };
  const handleText = (event: Y.YTextEvent): void => {
    if (event.transaction.origin === textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = text.toString();
    textarea.setSelectionRange(Math.min(start, textarea.value.length), Math.min(end, textarea.value.length));
    renderHighlight();
    syncHighlightScroll();
  };
  const applyHistory = (action: EditorHistoryAction): void => {
    if (!undoManager) return;
    undoManager.stopCapturing();
    if (action === "undo") undoManager.undo();
    else undoManager.redo();
    textarea.focus();
    textarea.dispatchEvent(new Event("select", { bubbles: true }));
  };
  const handleHistoryKey = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    const action = editorHistoryActionForKey(event);
    if (!action || !undoManager) return;
    event.preventDefault();
    event.stopPropagation();
    applyHistory(action);
  };
  const handleBeforeInput = (event: InputEvent): void => {
    const action = editorHistoryActionForInput(event.inputType);
    if (!action || !undoManager) return;
    event.preventDefault();
    applyHistory(action);
  };
  textarea.addEventListener("input", handleInput);
  textarea.addEventListener("keydown", handleHistoryKey);
  textarea.addEventListener("beforeinput", handleBeforeInput);
  textarea.addEventListener("scroll", syncHighlightScroll, { passive: true });
  text.observe(handleText);
  renderHighlight();
  syncHighlightScroll();
  return {
    destroy: () => {
      textarea.removeEventListener("input", handleInput);
      textarea.removeEventListener("keydown", handleHistoryKey);
      textarea.removeEventListener("beforeinput", handleBeforeInput);
      textarea.removeEventListener("scroll", syncHighlightScroll);
      text.unobserve(handleText);
    },
    renderHighlight,
  };
}

function renderEditorHighlight(highlight: HTMLElement, source: string, presence: readonly EditorPresenceRange[]): void {
  const fragment = document.createDocumentFragment();
  const state = { lineNumber: 1, line: sourceEditorLine(1) };
  fragment.append(state.line);
  for (const segment of editorPresenceSegments(source, presence)) appendEditorPresenceSegment(fragment, state, segment);
  highlight.replaceChildren(fragment);
}

function appendEditorPresenceSegment(
  fragment: DocumentFragment,
  state: { lineNumber: number; line: HTMLSpanElement },
  segment: EditorPresenceSegment,
): void {
  appendEditorCarets(state.line, segment.caretColors);
  for (const part of segment.text.split(/(\r\n|\r|\n)/u).filter(Boolean)) {
    if (/^(?:\r\n|\r|\n)$/u.test(part)) {
      state.line.append(editorNewline(part));
      state.lineNumber += 1;
      state.line = sourceEditorLine(state.lineNumber);
      fragment.append(state.line);
    } else {
      state.line.append(editorPresencePart(part, segment));
    }
  }
}

function appendEditorCarets(line: HTMLElement, colors: EditorPresenceSegment["caretColors"]): void {
  for (const color of colors) {
    const caret = document.createElement("span");
    caret.className = color === "local" ? "local-author-caret" : "collaborator-caret";
    caret.dataset.collaboratorColor = String(color);
    line.append(caret);
  }
}

function editorNewline(value: string): HTMLSpanElement {
  const newline = document.createElement("span");
  newline.className = "source-editor-newline";
  newline.textContent = value;
  return newline;
}

function editorPresencePart(value: string, segment: EditorPresenceSegment): Node {
  if (segment.kind === null && segment.selectionColor === null) return document.createTextNode(value);
  const token = document.createElement("span");
  token.classList.toggle(`markdown-token-${segment.kind}`, segment.kind !== null);
  token.classList.toggle("collaborator-selection", segment.selectionColor !== null && segment.selectionColor !== "local");
  token.classList.toggle("local-author-selection", segment.selectionColor === "local");
  if (segment.selectionColor !== null) token.dataset.collaboratorColor = String(segment.selectionColor);
  token.textContent = value;
  return token;
}

function sourceEditorLine(lineNumber: number): HTMLSpanElement {
  const line = document.createElement("span");
  line.className = "source-editor-line";
  line.dataset.lineNumber = String(lineNumber);
  return line;
}

function positionSourceCompletion(textarea: HTMLTextAreaElement, completion: HTMLElement, position: number): void {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.font = style.font;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.overflowWrap = style.overflowWrap;
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.tabSize = style.tabSize;
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);
  const lineHeight = Number.parseFloat(style.lineHeight) || 24;
  const shellWidth = textarea.parentElement?.clientWidth ?? textarea.clientWidth;
  const shellHeight = textarea.parentElement?.clientHeight ?? textarea.clientHeight;
  const left = Math.max(8, Math.min(marker.offsetLeft - textarea.scrollLeft, shellWidth - completion.offsetWidth - 8));
  const below = marker.offsetTop - textarea.scrollTop + lineHeight + 4;
  const top = Math.max(8, Math.min(below, shellHeight - completion.offsetHeight - 8));
  completion.style.left = `${left}px`;
  completion.style.top = `${top}px`;
  mirror.remove();
}

function lineNumberAt(source: string, offset: number): number {
  return source.slice(0, Math.max(0, Math.min(offset, source.length))).split(/\r\n|\r|\n/u).length;
}

function normalizeWorkspaceLayout(value: string): WorkspaceLayout {
  if (value === "editor" || value === "context" || value === "pdf") return value;
  return "split";
}

function activeWorkspaceFileRoute(activeFileId: string | null, entryFileId: string | undefined): { fileId: string } | object {
  return activeFileId && activeFileId !== entryFileId ? { fileId: activeFileId } : {};
}

function researchTabRouteLocation(tab: ResearchContextState["tabs"][number] | undefined): { page: number; annotationId?: string } | object {
  if (tab?.kind !== "pdf" && tab?.kind !== "library-pdf") return {};
  if (tab.kind === "pdf" && tab.focusedAnnotationId) return { page: tab.page, annotationId: tab.focusedAnnotationId };
  return { page: tab.page };
}

function bindVimTextarea(textarea: HTMLTextAreaElement, shell: HTMLElement, toggle: HTMLButtonElement, status: HTMLElement): void {
  const storageKey = "kirjolab:vim-keybindings";
  let enabled = localStorage.getItem(storageKey) === "true";
  let session: VimSession = createVimSession();
  const renderMode = (): void => {
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.title = enabled ? "Disable Vim keybindings" : "Enable Vim keybindings";
    status.hidden = !enabled;
    status.textContent = session.mode.toUpperCase();
    shell.dataset.vimMode = enabled ? session.mode : "off";
  };
  const snapshot = () => ({
    value: textarea.value,
    selectionStart: textarea.selectionStart,
    selectionEnd: textarea.selectionEnd,
    selectionDirection: textarea.selectionDirection,
  });

  toggle.addEventListener("click", () => {
    enabled = !enabled;
    localStorage.setItem(storageKey, String(enabled));
    session = createVimSession();
    if (enabled) {
      textarea.focus();
      textarea.setSelectionRange(textarea.selectionStart, textarea.selectionStart);
    }
    renderMode();
  });
  textarea.addEventListener("keydown", (event) => {
    const key = vimCommandKey(event, enabled);
    if (!key) return;
    const command = handleVimKey(session, snapshot(), key);
    if (!command.handled) return;
    event.preventDefault();
    event.stopPropagation();
    session = command.session;
    applyVimCommand(textarea, command);
    renderMode();
  });
  textarea.addEventListener("mouseup", () => {
    if (!enabled) return;
    session =
      textarea.selectionStart === textarea.selectionEnd
        ? { ...session, mode: "normal", pending: null, count: "" }
        : visualVimSession(session);
    renderMode();
  });
  renderMode();
}

function vimCommandKey(event: KeyboardEvent, enabled: boolean): string | null {
  if (!enabled) return null;
  if (event.isComposing) return null;
  const controlBracket = isVimControlBracket(event);
  if (hasUnsupportedVimModifier(event, controlBracket)) return null;
  return controlBracket ? "Ctrl-[" : event.key;
}

function isVimControlBracket(event: KeyboardEvent): boolean {
  return event.ctrlKey && !event.altKey && !event.metaKey && event.key === "[";
}

function hasUnsupportedVimModifier(event: KeyboardEvent, controlBracket: boolean): boolean {
  return !controlBracket && (event.altKey || event.ctrlKey || event.metaKey);
}

function applyVimCommand(textarea: HTMLTextAreaElement, command: VimCommand): void {
  if (command.changed) textarea.value = command.value;
  textarea.setSelectionRange(command.selectionStart, command.selectionEnd, command.selectionDirection);
  if (command.changed) textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
}

function captureRelativeSelection(textarea: HTMLTextAreaElement, text: Y.Text): RelativeEditorSelection {
  const collapsed = textarea.selectionStart === textarea.selectionEnd;
  return {
    text,
    textarea,
    start: Y.createRelativePositionFromTypeIndex(text, textarea.selectionStart, collapsed ? -1 : 0),
    end: Y.createRelativePositionFromTypeIndex(text, textarea.selectionEnd, -1),
    direction: textarea.selectionDirection,
  };
}

function collectElements(): Elements {
  return {
    preferencesMenu: requiredElement("preferences-menu", HTMLDetailsElement),
    modelProviderSettings: requiredElement("model-provider-settings", ModelProviderSettings),
    applicationVersion: requiredElement("application-version", HTMLElement),
    copyApplicationVersion: requiredElement("copy-application-version", HTMLButtonElement),
    citationCompletionScope: requiredElement("citation-completion-scope", HTMLSelectElement),
    chooseModelEvidence: requiredElement("choose-model-evidence", HTMLButtonElement),
    openPreferencesFromAssistant: requiredElement("open-preferences-from-assistant", HTMLButtonElement),
    collaboratorSelections: requiredElement("collaborator-selections", HTMLElement),
    workspaceSwitcher: requiredElement("workspace-switcher", HTMLSelectElement),
    workspaceLayout: requiredElement("workspace-layout", HTMLSelectElement),
    manageWorkspaces: requiredElement("manage-workspaces", HTMLButtonElement),
    workspaceSettings: requiredElement("workspace-settings", HTMLButtonElement),
    workspaceSettingsPanel: requiredElement("workspace-settings-panel", WorkspaceSettingsPanel),
    workspaceCatalogDialog: requiredElement("workspace-catalog-dialog", HTMLDialogElement),
    workspaceCatalogPanel: requiredElement("workspace-catalog-panel", WorkspaceCatalogPanel),
    newWorkspace: requiredElement("new-workspace", HTMLButtonElement),
    newWorkspaceDialog: requiredElement("new-workspace-dialog", HTMLDialogElement),
    newWorkspaceStartingPoints: requiredElement("project-starting-point-browser", ProjectStartingPointBrowser),
    latexImportDialog: requiredElement("latex-import-dialog", HTMLDialogElement),
    latexImportPanel: requiredElement("latex-import-panel", LatexImportPanel),
    gitHubImportDialog: requiredElement("github-import-dialog", HTMLDialogElement),
    gitHubConnectionPanel: requiredElement("github-connection-panel", GitHubConnectionPanel),
    gitHubImportPanel: requiredElement("github-import-panel", GitHubImportPanel),
    gitHubSyncMenu: requiredElement("github-sync-control", GitHubSyncMenu),
    saveTemplateDialog: requiredElement("project-template-save-dialog", ProjectTemplateSaveDialog),
    shareWorkspace: requiredElement("share-workspace", HTMLButtonElement),
    shareWorkspaceDialog: requiredElement("share-workspace-dialog", HTMLDialogElement),
    workspaceSharingPanel: requiredElement("workspace-sharing-panel", WorkspaceSharingPanel),
    referenceLibraryList: requiredElement("reference-library-list", HTMLElement),
    libraryDiscoverySearch: requiredElement("library-discovery-search", LibraryDiscoverySearch),
    libraryDiscoveryResults: requiredElement("library-discovery-results", LibraryDiscoveryResults),
    libraryBibliographyUpload: requiredElement("library-bibliography-upload", HTMLInputElement),
    libraryCslUpload: requiredElement("library-csl-upload", HTMLInputElement),
    libraryArchiveUpload: requiredElement("library-archive-upload", HTMLInputElement),
    libraryPdfUpload: requiredElement("library-pdf-upload", HTMLInputElement),
    libraryPdfDropzone: requiredElement("library-pdf-dropzone", HTMLElement),
    libraryPdfUploadStatus: requiredElement("library-pdf-upload-status", LibraryPdfUploadStatus),
    showArchivedReferences: requiredElement("show-archived-references", HTMLButtonElement),
    referenceLibraryFilters: requiredElement("reference-library-filters", ReferenceLibraryFilterPanel),
    openCitationNetwork: requiredElement("open-citation-network", HTMLButtonElement),
    citationNetwork: requiredElement("citation-network", HTMLElement),
    closeCitationNetwork: requiredElement("close-citation-network", HTMLButtonElement),
    filterProjectCitations: requiredElement("filter-project-citations", HTMLButtonElement),
    citationNetworkPanel: requiredElement("citation-network-panel", CitationNetworkPanel),
    webSourceCapture: requiredElement("web-source-capture", WebSourceCapture),
    webSnapshotComparison: requiredElement("web-snapshot-comparison", WebSnapshotComparisonPanel),
    unidentifiedPdfList: requiredElement("unidentified-pdf-list-panel", UnidentifiedPdfList),
    showFilesRail: requiredElement("show-files-rail", HTMLButtonElement),
    showResearchRail: requiredElement("show-research-rail", HTMLButtonElement),
    showCommentsRail: requiredElement("show-comments-rail", HTMLButtonElement),
    showGuideRail: requiredElement("show-guide-rail", HTMLButtonElement),
    filesRailPanel: requiredElement("files-rail-panel", HTMLElement),
    researchRailPanel: requiredElement("research-rail-panel", HTMLElement),
    commentsRailPanel: requiredElement("comments-rail-panel", HTMLElement),
    guideRailPanel: requiredElement("guide-rail-panel", HTMLElement),
    manuscriptMapPanel: requiredElement("manuscript-map-panel", ManuscriptMapPanel),
    researchDiaryEntryCount: requiredElement("research-diary-entry-count", HTMLElement),
    researchDiarySummary: requiredElement("research-diary-summary", HTMLElement),
    openResearchDiary: requiredElement("open-research-diary", HTMLButtonElement),
    researchQuestionPanel: requiredElement("research-question-panel", WritingWorkflowPanel),
    reviewerResponsePanel: requiredElement("reviewer-response-panel", WritingWorkflowPanel),
    newProjectFileRail: requiredElement("new-project-file-rail", HTMLButtonElement),
    newProjectFolderRail: requiredElement("new-project-folder-rail", HTMLButtonElement),
    uploadProjectImages: requiredElement("upload-project-images", HTMLButtonElement),
    projectImageUpload: requiredElement("project-image-upload", HTMLInputElement),
    projectTreePanel: requiredElement("project-tree-panel", ProjectTreePanel),
    newProjectFile: requiredElement("new-project-file", HTMLButtonElement),
    createAndIncludeProjectFile: requiredElement("create-and-include-project-file", HTMLButtonElement),
    renameProjectFile: requiredElement("rename-project-file", HTMLButtonElement),
    deleteProjectFile: requiredElement("delete-project-file", HTMLButtonElement),
    projectFileDialog: requiredElement("project-file-dialog-panel", ProjectFileDialog),
    openProjectHistory: requiredElement("open-project-history", HTMLButtonElement),
    openExport: requiredElement("open-export", HTMLButtonElement),
    exportDialog: requiredElement("export-dialog", HTMLDialogElement),
    closeExport: requiredElement("close-export", HTMLButtonElement),
    exportStatistics: requiredElement("export-statistics", ExportStatisticsPanel),
    wordCountBadge: requiredElement("word-count-badge", HTMLButtonElement),
    projectHistoryDialog: requiredElement("project-history-dialog", HTMLDialogElement),
    projectHistoryPanel: requiredElement("project-history-panel", ProjectHistoryPanel),
    source: requiredElement("source-editor", HTMLTextAreaElement),
    sourceHighlight: requiredElement("source-editor-highlight", HTMLElement),
    sourceEditorShell: requiredElement("source-editor-shell", HTMLElement),
    sourceCompletion: requiredElement("source-completion", HTMLElement),
    showWriteMode: requiredElement("show-write-mode", HTMLButtonElement),
    showMapMode: requiredElement("show-map-mode", HTMLButtonElement),
    editorWriteActions: requiredElement("editor-write-actions", HTMLElement),
    projectMap: requiredElement("project-map", HTMLElement),
    projectMapTotal: requiredElement("project-map-total", HTMLElement),
    projectMapPanel: requiredElement("project-map-canvas", ProjectMapPanel),
    projectMapOverview: requiredElement("project-map-overview", HTMLElement),
    vimModeStatus: requiredElement("vim-mode-status", HTMLElement),
    vimToggle: requiredElement("vim-toggle", HTMLButtonElement),
    editorInsertMenu: requiredElement("editor-insert-menu-component", EditorInsertMenu),
    bibliography: requiredElement("bibliography-editor", HTMLTextAreaElement),
    manuscriptCommentCount: requiredElement("manuscript-comment-count", HTMLElement),
    manuscriptCommentListPanel: requiredElement("manuscript-comment-list-panel", ManuscriptCommentList),
    workspaceSurfaces: requiredElement("workspace-surfaces", HTMLElement),
    collapseSourceRail: requiredElement("collapse-source-rail", HTMLButtonElement),
    expandSourceRail: requiredElement("expand-source-rail", HTMLButtonElement),
    sourceRailResizer: requiredElement("source-rail-resizer", HTMLElement),
    authoringContextResizer: requiredElement("authoring-context-resizer", HTMLElement),
    previewSyncControls: requiredElement("preview-sync-controls", HTMLElement),
    syncPreviewFromSource: requiredElement("sync-preview-from-source", HTMLButtonElement),
    syncSourceFromPreview: requiredElement("sync-source-from-preview", HTMLButtonElement),
    showAuthoringSurface: requiredElement("show-authoring-surface", HTMLButtonElement),
    showContextSurface: requiredElement("show-context-surface", HTMLButtonElement),
    openSourceCitation: requiredElement("open-source-citation", HTMLButtonElement),
    contextTabList: requiredElement("context-tab-list", HTMLElement),
    contextPreviewTab: requiredElement("context-preview-tab", HTMLButtonElement),
    contextLibraryTab: requiredElement("context-library-tab", HTMLButtonElement),
    contextAssistantTab: requiredElement("context-assistant-tab", HTMLButtonElement),
    contextResourceTabsPanel: requiredElement("context-resource-tabs-panel", ContextResourceTabs),
    contextTabOverviewPanel: requiredElement("context-tab-overview-panel", ContextTabOverview),
    previewContextControls: requiredElement("preview-context-controls", PreviewContextStatus),
    togglePreviewNavigation: requiredElement("toggle-preview-navigation", HTMLButtonElement),
    restorePreviewNavigation: requiredElement("restore-preview-navigation", HTMLButtonElement),
    previewNavigationToggleLabel: requiredElement("preview-navigation-toggle-label", HTMLElement),
    pdfContextControls: requiredElement("pdf-context-controls", HTMLElement),
    contextPreviewPanel: requiredElement("context-preview-panel", HTMLElement),
    previewScroll: requiredElement("preview-scroll", HTMLElement),
    contextLibraryPanel: requiredElement("context-library-panel", HTMLElement),
    contextLibraryScroll: requiredElement("context-library-scroll", HTMLElement),
    contextAssistantPanel: requiredElement("context-assistant-panel", HTMLElement),
    contextAssistantScroll: requiredElement("context-assistant-scroll", HTMLElement),
    contextPublicationPanel: requiredElement("context-publication-panel", HTMLElement),
    publicationContextPanel: requiredElement("publication-context-panel", PublicationContextPanel),
    contextPdfPanel: requiredElement("context-pdf-panel", HTMLElement),
    contextCandidatePanel: requiredElement("context-candidate-panel", HTMLElement),
    candidateReviewPanel: requiredElement("candidate-review-panel", CandidateReviewPanel),
    preview: requiredElement("preview", HTMLElement),
    diagnostics: requiredElement("diagnostics", PreviewDiagnosticsPanel),
    connectionDot: requiredElement("connection-dot", HTMLElement),
    connectionStatus: requiredElement("connection-status", HTMLElement),
    editorTargetStatus: requiredElement("editor-target-status", HTMLElement),
    saveStatus: requiredElement("save-status", HTMLElement),
    revisionBadge: requiredElement("revision-badge", HTMLElement),
    pdfUpload: requiredElement("pdf-upload", HTMLInputElement),
    projectEvidencePanel: requiredElement("project-evidence-panel", ProjectEvidencePanel),
    knowledgeSearchPanel: requiredElement("knowledge-search-panel", KnowledgeSearchPanel),
    publicationCount: requiredElement("publication-count", HTMLElement),
    publicationListPanel: requiredElement("publication-list-panel", PublicationListPanel),
    claimCount: requiredElement("claim-count", HTMLElement),
    claimListPanel: requiredElement("claim-list-panel", ClaimListPanel),
    newClaim: requiredElement("new-claim", HTMLButtonElement),
    claimDialog: requiredElement("claim-dialog-panel", ClaimDialog),
    knowledgeConnectionsPanel: requiredElement("knowledge-connections-panel", KnowledgeConnectionsPanel),
    projectAnnotationForm: requiredElement("project-annotation-form", ProjectAnnotationForm),
    annotationComposer: requiredElement("annotation-composer", HTMLElement),
    libraryHighlightComposer: requiredElement("library-highlight-composer", HTMLElement),
    closeLibraryPdfInspector: requiredElement("close-library-pdf-inspector", HTMLButtonElement),
    libraryAnnotationDetails: requiredElement("library-annotation-details", HTMLDetailsElement),
    pdfHighlightImportPanel: requiredElement("pdf-highlight-import-panel", PdfHighlightImportPanel),
    libraryPdfAnnotationForms: requiredElement("library-pdf-annotation-forms", LibraryPdfAnnotationForms),
    libraryPdfAnnotationToolbar: requiredElement("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar),
    libraryHighlightStatus: requiredElement("library-highlight-status", HTMLElement),
    libraryProjectUse: requiredElement("library-project-use", HTMLElement),
    libraryHighlightList: requiredElement("library-highlight-list", LibraryPdfAnnotationList),
    highlightPaintTool: requiredElement("highlight-paint-tool", HTMLButtonElement),
    highlightEraserTool: requiredElement("highlight-eraser-tool", HTMLButtonElement),
    undoHighlight: requiredElement("undo-highlight", HTMLButtonElement),
    citeActivePdf: requiredElement("cite-active-pdf", HTMLButtonElement),
    paperStatus: requiredElement("paper-status", HTMLElement),
    paperCanvas: requiredElement("paper-canvas", HTMLCanvasElement),
    paperPage: requiredElement("paper-page", HTMLElement),
    paperLinks: requiredElement("paper-links", HTMLElement),
    paperTextLayer: requiredElement("paper-text-layer", HTMLElement),
    paperHighlights: requiredElement("paper-highlights", HTMLElement),
    paperMarkups: requiredElement("paper-markups", HTMLElement),
    paperPageIndicator: requiredElement("paper-page-indicator", HTMLElement),
    paperReader: requiredElement("paper-reader", HTMLElement),
    previousPaperPage: requiredElement("previous-paper-page", HTMLButtonElement),
    nextPaperPage: requiredElement("next-paper-page", HTMLButtonElement),
    libraryPaperPageIndicator: requiredElement("library-paper-page-indicator", HTMLElement),
    previousLibraryPaperPage: requiredElement("previous-library-paper-page", HTMLButtonElement),
    nextLibraryPaperPage: requiredElement("next-library-paper-page", HTMLButtonElement),
    publicationIntakePanel: requiredElement("publication-intake-panel", PublicationIntakePanel),
    assistantTaskPanel: requiredElement("assistant-task-panel", AssistantTaskPanel),
    assistantInteractiveResult: requiredElement("assistant-interactive-result", AssistantResultPanel),
    assistantPhrasingAttribution: requiredElement("assistant-phrasing-attribution", HTMLDetailsElement),
    modelStatus: requiredElement("model-status", HTMLElement),
    candidateListPanel: requiredElement("candidate-list-panel", CandidateListPanel),
    toast: requiredElement("toast", HTMLElement),
  };
}

function requiredElement<T extends Element>(id: string, type: { new (): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Missing interface element: ${id}`);
  return element;
}

function resourceLabel(text: string): HTMLElement {
  const label = document.createElement("span");
  label.className = "eyebrow block";
  label.textContent = text;
  return label;
}

function projectUseDescription(text: string): HTMLParagraphElement {
  const description = document.createElement("p");
  description.className = "mt-2 font-sans text-xs leading-5 text-app-text-soft";
  description.textContent = text;
  return description;
}

function emptyState(text: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "empty-state";
  element.textContent = text;
  return element;
}

function actionButton(text: string, className: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", action);
  return button;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function jsonFetch(url: string, body: object, method: "POST" | "PUT" | "PATCH" = "POST"): Promise<Response> {
  return await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function expectOk(response: Response): Promise<void> {
  if (response.ok) return;
  const value: unknown = await response.json().catch(() => null);
  throw new Error(isRecord(value) && typeof value.error === "string" ? value.error : `Request failed (${response.status})`);
}

function downloadTextFile(name: string, content: string): void {
  const href = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  URL.revokeObjectURL(href);
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard?.writeText(value);
    if (navigator.clipboard) return;
  } catch {
    // Fall back when clipboard permission is unavailable in a browser or installed PWA.
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.readOnly = true;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}

function selectionRectsOverlap(left: PdfSelectionRect, right: PdfSelectionRect): boolean {
  return (
    left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y
  );
}

function readClaimEvidenceRelation(value: string): ClaimEvidenceRelation {
  if (value === "contradicts" || value === "extends") return value;
  return "supports";
}

function parseModelEvidenceKey(value: string): ["annotation" | "claim", string] {
  return value.startsWith("claim:") ? ["claim", value.slice("claim:".length)] : ["annotation", value.slice("annotation:".length)];
}

function excerptForToast(value: string): string {
  const compact = value.replaceAll(/\s+/gu, " ").trim();
  return compact.length <= 240 ? compact : `${compact.slice(0, 239).trimEnd()}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function installedWebApp(): boolean {
  const iosNavigator = navigator as Navigator & { readonly standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true;
}

class WorkspaceAccessError extends Error {}

if (typeof document !== "undefined") {
  bindThemePreference(document.documentElement, requiredElement("theme-preference", HTMLSelectElement), localStorage);
  const app = new WorkspaceApp();
  void app.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Kirjolab failed to start";
    document.body.textContent = message;
  });
}
