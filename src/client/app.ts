import * as Y from "yjs";
import { bibTeXDisplayText } from "../domain/bibliography";
import {
  buildWorkspaceKnowledgeGraph,
  isKnowledgeSearchResults,
  type KnowledgeGraphNode,
  type KnowledgeSearchResult,
  type WorkspaceKnowledgeGraph,
} from "../domain/knowledge";
import { isCitationNetwork, type CitationAssertionView, type CitationNetwork } from "../domain/citation-assertions";
import {
  isCitationCandidateAcceptance,
  isCitationExpansionResult,
  type CitationExpansionCandidate,
  type CitationExpansionResult,
} from "../domain/citation-expansion";
import { runEditingPass, type EditingPass } from "../domain/editing-passes";
import { isReferenceDiscoveryResults, type ReferenceDiscoveryResult } from "../domain/reference-discovery";
import {
  parseReviewerResponses,
  reviewerResponseLetter,
  reviewerResponsePath,
  reviewerResponseTemplate,
} from "../domain/reviewer-response";
import {
  collaborationProtocolVersion,
  encodeClientSelectionMessage,
  parseServerCollaborationMessage,
  type ServerCollaborationMessage,
} from "../domain/collaboration";
import { resolveManuscriptAnchor } from "../domain/manuscript-anchor";
import { buildManuscriptMap } from "../domain/manuscript-map";
import {
  isProjectRevisionContent,
  isProjectRevisionDiff,
  isProjectRevisionSummaries,
  type ProjectRevisionContent,
  type ProjectRevisionDiff,
  type ProjectRevisionSummary,
} from "../domain/project-history";
import {
  composeProject,
  projectFileCollaborationTextName,
  previewProjectFile,
  relativeProjectPath,
  resolveProjectPath,
  type CompositionSourceSpan,
  type ProjectAsset,
  type ProjectFile,
} from "../domain/project-files";
import { publicationWordStatistics, type PublicationWordStatistics } from "../domain/publication-statistics";
import { suggestCitationKey } from "../domain/publication-intake";
import { isPhrasingPurposeId, phrasingPatternsForPurpose, phrasingPurposes, type PhrasingPurpose } from "../domain/phrasing-guidance";
import { parseResearchQuestions, researchQuestionsPath, researchQuestionsTemplate } from "../domain/research-questions";
import { researchDiaryPath, researchDiaryTemplate, summarizeResearchDiary } from "../domain/writing-workflows";
import { isProjectTemplateSummaries, type ProjectTemplateSummary } from "../domain/project-templates";
import {
  crossrefMetadataFields,
  isMetadataRefinementPreview,
  isPdfDraftResult,
  isProjectReferencePdfs,
  isReferenceLibrarySnapshot,
  libraryPdfRectsOverlap,
  type BibliographicRecord,
  type CrossrefMetadataField,
  type LibraryHighlight,
  type LibraryPdfDrawing,
  type LibraryPdfMarkup,
  type LibraryPdfNote,
  type LibraryPdfPoint,
  type LibraryPdfArtifact,
  type MetadataRefinementCandidate,
  type MetadataRefinementPreview,
  type ProjectReferencePdf,
  type ReferenceLibrarySnapshot,
  type WebSnapshot,
  type WebSnapshotComparison,
} from "../domain/reference-library";
import { calculateTextSplice } from "../domain/text";
import { filterReferenceLibrary, type ReferenceLibraryFilters } from "../domain/reference-filters";
import { createVimSession, handleVimKey, visualVimSession, type VimSession } from "./vim-keybindings";
import {
  isModelCandidate,
  isWorkspaceSnapshot,
  isWorkspaceMembers,
  isWorkspaceSummaries,
  isPublicationIntakePreview,
  type AnnotationResource,
  type ClaimEvidenceRelation,
  type ClaimPassageLink,
  type ClaimResource,
  type ManuscriptAnchorResolution,
  type ManuscriptComment,
  type ModelCandidate,
  type ModelEvidence,
  type ModelEvidenceReference,
  type PassageLink,
  type PdfResource,
  type PdfSelectionRect,
  type PublicationResource,
  type WorkspaceSnapshot,
  type WorkspaceMember,
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
  assistantOperationDefinitions,
  assistantTargetScopeLabel,
  resolveAssistantTarget,
  type AssistantTargetScope,
} from "./assistant-operations";
import { assistantWorkflowBusy, createAssistantWorkflowActor } from "./assistant-workflow-machine";
import {
  citationContextAtPosition,
  citationKeysAtPosition,
  citationPageFromLocator,
  createCitationInsertion,
  parseCitationKeys,
} from "./citations";
import { editorHistoryActionForInput, editorHistoryActionForKey, type EditorHistoryAction } from "./editor-history";
import { loadMarkdownRuntime } from "./markdown-runtime";
import { groupMetadataCandidates, metadataFieldValue } from "./metadata-refinement";
import { createMetadataRefinementActor } from "./metadata-refinement-machine";
import { groupProjectMapNodes, projectMapLaneDefinitions, projectMapNodeGroup } from "./project-map-layout";
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
import { detectImportedPdfHighlights, type PdfHighlightImportCandidate, type PdfHighlightDetection } from "./pdf-highlight-import";
import { adjustSelectionRects } from "./pdf-selection";
import { uploadPdfBatch, type ExistingPdfUpload, type PdfUploadQueueSnapshot } from "./pdf-upload-queue";
import { bindThemePreference } from "./theme";
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
  type ModelReasoningEffort,
} from "./model-provider";
import { parseTableRequirements, tableMarkdown, type TableRequirements } from "./structured-syntax";
import { createProjectHistoryActor, projectHistoryBusy, type ProjectHistoryOperation } from "./project-history-machine";
import { previewOffsetsForSourceLocation, sourceLocationForPreviewOffset } from "./source-preview-sync";
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

interface MetadataRefinementTargets {
  readonly suggestions: ReadonlyMap<CrossrefMetadataField, HTMLElement>;
  readonly panel: HTMLElement;
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

interface GitHubInstallationOption {
  readonly id: number;
  readonly accountId: string;
  readonly accountLogin: string;
  readonly accountType: "Organization" | "User";
}

interface GitHubRepositoryOption {
  readonly id: number;
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly private: boolean;
  readonly defaultBranch: string;
}

interface LatexImportPreview {
  readonly digest: string;
  readonly archive: {
    readonly files: readonly { readonly path: string; readonly kind: string; readonly bytes: number }[];
    readonly rootCandidates: readonly string[];
  };
  readonly conversion: {
    readonly seed: { readonly files: readonly { readonly path: string; readonly content: string }[]; readonly bibliography: string };
    readonly assets: readonly { readonly path: string; readonly mediaType: string; readonly bytes: number }[];
    readonly report: {
      readonly rootPath: string;
      readonly bibliographyPath: string | null;
      readonly diagnostics: readonly { readonly severity: "error" | "warning" | "info"; readonly message: string }[];
    };
  } | null;
}

type PublicationPaperOption =
  | { readonly kind: "project"; readonly pdf: PdfResource; readonly linkId: string }
  | { readonly kind: "library"; readonly artifact: LibraryPdfArtifact }
  | { readonly kind: "reference"; readonly pdf: ProjectReferencePdf };

interface Elements {
  preferencesMenu: HTMLDetailsElement;
  preferencesModelStatus: HTMLElement;
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
  workspaceSettingsDialog: HTMLDialogElement;
  workspaceSettingsForm: HTMLFormElement;
  workspaceSettingsTitle: HTMLInputElement;
  workspaceEntryFile: HTMLSelectElement;
  workspaceCitationStyle: HTMLSelectElement;
  workspaceCitationLocale: HTMLSelectElement;
  workspaceSubmissionTemplate: HTMLSelectElement;
  workspacePaperSize: HTMLSelectElement;
  closeWorkspaceSettings: HTMLButtonElement;
  saveWorkspaceTemplate: HTMLButtonElement;
  duplicateWorkspace: HTMLButtonElement;
  archiveWorkspace: HTMLButtonElement;
  deleteWorkspace: HTMLButtonElement;
  workspaceCatalogDialog: HTMLDialogElement;
  closeWorkspaceCatalog: HTMLButtonElement;
  workspaceCatalogFilter: HTMLInputElement;
  workspaceCatalogList: HTMLElement;
  newWorkspace: HTMLButtonElement;
  newWorkspaceDialog: HTMLDialogElement;
  newWorkspaceForm: HTMLFormElement;
  newWorkspaceTitle: HTMLInputElement;
  newWorkspaceTemplateList: HTMLElement;
  newWorkspaceTemplatePreview: HTMLElement;
  newWorkspaceTemplateId: HTMLInputElement;
  newWorkspaceTemplateStatus: HTMLElement;
  newWorkspaceSubmit: HTMLButtonElement;
  cancelNewWorkspace: HTMLButtonElement;
  openLatexImport: HTMLButtonElement;
  latexImportDialog: HTMLDialogElement;
  latexImportForm: HTMLFormElement;
  latexImportTitle: HTMLInputElement;
  latexImportArchive: HTMLInputElement;
  latexRootField: HTMLElement;
  latexImportRoot: HTMLSelectElement;
  latexImportPreview: HTMLElement;
  latexImportStatus: HTMLElement;
  confirmLatexImport: HTMLButtonElement;
  previewLatexImport: HTMLButtonElement;
  cancelLatexImport: HTMLButtonElement;
  openGitHubImport: HTMLButtonElement;
  gitHubImportDialog: HTMLDialogElement;
  gitHubImportForm: HTMLFormElement;
  gitHubConnectionStatus: HTMLElement;
  connectGitHubAccount: HTMLAnchorElement;
  installGitHubApp: HTMLAnchorElement;
  disconnectGitHubAccount: HTMLButtonElement;
  gitHubImportTitle: HTMLInputElement;
  gitHubInstallationId: HTMLSelectElement;
  gitHubRepository: HTMLSelectElement;
  gitHubBranch: HTMLSelectElement;
  gitHubRootPath: HTMLInputElement;
  gitHubEntryPath: HTMLInputElement;
  gitHubImportPreview: HTMLElement;
  gitHubImportStatus: HTMLElement;
  confirmGitHubImport: HTMLButtonElement;
  previewGitHubImport: HTMLButtonElement;
  cancelGitHubImport: HTMLButtonElement;
  gitHubSyncStatus: HTMLElement;
  gitHubPullReview: HTMLElement;
  previewGitHubPull: HTMLButtonElement;
  confirmGitHubPull: HTMLButtonElement;
  gitHubPublishMessage: HTMLInputElement;
  gitHubPublishReview: HTMLElement;
  previewGitHubPublish: HTMLButtonElement;
  confirmGitHubPublish: HTMLButtonElement;
  disconnectGitHub: HTMLButtonElement;
  saveTemplateDialog: HTMLDialogElement;
  saveTemplateForm: HTMLFormElement;
  saveTemplateTarget: HTMLSelectElement;
  saveTemplateName: HTMLInputElement;
  saveTemplateDescription: HTMLTextAreaElement;
  saveTemplateStatus: HTMLElement;
  cancelSaveTemplate: HTMLButtonElement;
  shareWorkspace: HTMLButtonElement;
  shareWorkspaceDialog: HTMLDialogElement;
  closeShareWorkspace: HTMLButtonElement;
  workspaceMemberList: HTMLElement;
  inviteMemberForm: HTMLFormElement;
  inviteMemberEmail: HTMLInputElement;
  readOnlyShareStatus: HTMLElement;
  createReadOnlyShare: HTMLButtonElement;
  readOnlyShareLinkRow: HTMLElement;
  readOnlyShareLink: HTMLInputElement;
  copyReadOnlyShare: HTMLButtonElement;
  revokeReadOnlyShare: HTMLButtonElement;
  editShareStatus: HTMLElement;
  createEditShare: HTMLButtonElement;
  editShareLinkRow: HTMLElement;
  editShareLink: HTMLInputElement;
  copyEditShare: HTMLButtonElement;
  revokeEditShare: HTMLButtonElement;
  referenceLibraryList: HTMLElement;
  libraryDiscoveryForm: HTMLFormElement;
  libraryDiscoveryQuery: HTMLInputElement;
  libraryDiscoveryAuthor: HTMLInputElement;
  libraryDiscoveryYear: HTMLInputElement;
  libraryDiscoveryType: HTMLSelectElement;
  libraryDiscoveryStatus: HTMLElement;
  libraryDiscoveryResults: HTMLElement;
  libraryBibliographyUpload: HTMLInputElement;
  libraryCslUpload: HTMLInputElement;
  libraryArchiveUpload: HTMLInputElement;
  libraryPdfUpload: HTMLInputElement;
  libraryPdfDropzone: HTMLElement;
  libraryPdfUploadStatus: HTMLElement;
  showArchivedReferences: HTMLButtonElement;
  referenceFilterQuery: HTMLInputElement;
  referenceFilterType: HTMLSelectElement;
  referenceFilterReading: HTMLSelectElement;
  referenceFilterOrganization: HTMLInputElement;
  referenceFilterLinkage: HTMLSelectElement;
  referenceFilterCompleteness: HTMLSelectElement;
  referenceFilterSort: HTMLSelectElement;
  referenceFilterCount: HTMLElement;
  openCitationNetwork: HTMLButtonElement;
  citationNetwork: HTMLElement;
  closeCitationNetwork: HTMLButtonElement;
  filterProjectCitations: HTMLButtonElement;
  citationAssertionForm: HTMLFormElement;
  citationAssertionCiting: HTMLSelectElement;
  citationAssertionCited: HTMLSelectElement;
  citationAssertionPolarity: HTMLSelectElement;
  citationNetworkGraph: SVGSVGElement;
  citationNetworkList: HTMLElement;
  webSourceForm: HTMLFormElement;
  webSourceUrl: HTMLInputElement;
  webSnapshotComparison: HTMLElement;
  unidentifiedPdfCount: HTMLElement;
  unidentifiedPdfList: HTMLElement;
  showFilesRail: HTMLButtonElement;
  showResearchRail: HTMLButtonElement;
  showCommentsRail: HTMLButtonElement;
  showGuideRail: HTMLButtonElement;
  filesRailPanel: HTMLElement;
  researchRailPanel: HTMLElement;
  commentsRailPanel: HTMLElement;
  guideRailPanel: HTMLElement;
  manuscriptMapSummary: HTMLElement;
  manuscriptMapOutline: HTMLElement;
  manuscriptMapCueCount: HTMLElement;
  manuscriptMapCues: HTMLElement;
  researchDiaryEntryCount: HTMLElement;
  researchDiarySummary: HTMLElement;
  openResearchDiary: HTMLButtonElement;
  researchQuestionCount: HTMLElement;
  researchQuestionList: HTMLElement;
  openResearchQuestions: HTMLButtonElement;
  editingPass: HTMLSelectElement;
  editingPassCueCount: HTMLElement;
  editingPassCues: HTMLElement;
  reviewerResponseCount: HTMLElement;
  reviewerResponseList: HTMLElement;
  openReviewerResponse: HTMLButtonElement;
  downloadReviewerResponse: HTMLButtonElement;
  newProjectFileRail: HTMLButtonElement;
  newProjectFolderRail: HTMLButtonElement;
  uploadProjectImages: HTMLButtonElement;
  projectImageUpload: HTMLInputElement;
  projectFileList: HTMLElement;
  newProjectFile: HTMLButtonElement;
  createAndIncludeProjectFile: HTMLButtonElement;
  renameProjectFile: HTMLButtonElement;
  deleteProjectFile: HTMLButtonElement;
  projectFileDialog: HTMLDialogElement;
  projectFileForm: HTMLFormElement;
  projectFileDialogTitle: HTMLElement;
  projectFileDialogHelp: HTMLElement;
  projectFilePath: HTMLInputElement;
  saveProjectFile: HTMLButtonElement;
  cancelProjectFile: HTMLButtonElement;
  openProjectHistory: HTMLButtonElement;
  openExport: HTMLButtonElement;
  exportDialog: HTMLDialogElement;
  closeExport: HTMLButtonElement;
  exportStatistics: HTMLElement;
  wordCountBadge: HTMLButtonElement;
  projectHistoryDialog: HTMLDialogElement;
  closeProjectHistory: HTMLButtonElement;
  projectHistoryCompareForm: HTMLFormElement;
  projectHistoryFrom: HTMLSelectElement;
  projectHistoryTo: HTMLSelectElement;
  projectHistoryInspector: HTMLElement;
  projectHistoryList: HTMLElement;
  source: HTMLTextAreaElement;
  sourceHighlight: HTMLElement;
  sourceEditorShell: HTMLElement;
  sourceCompletion: HTMLElement;
  showWriteMode: HTMLButtonElement;
  showMapMode: HTMLButtonElement;
  editorWriteActions: HTMLElement;
  projectMap: HTMLElement;
  projectMapTotal: HTMLElement;
  projectMapCanvas: HTMLElement;
  projectMapGraph: SVGSVGElement;
  projectMapNodes: HTMLElement;
  projectMapOverview: HTMLElement;
  vimModeStatus: HTMLElement;
  vimToggle: HTMLButtonElement;
  editorInsertMenu: HTMLDetailsElement;
  includeProjectFileList: HTMLElement;
  bibliography: HTMLTextAreaElement;
  manuscriptCommentForm: HTMLFormElement;
  manuscriptCommentBody: HTMLTextAreaElement;
  manuscriptCommentStatus: HTMLElement;
  manuscriptCommentCount: HTMLElement;
  manuscriptCommentList: HTMLElement;
  workspaceSurfaces: HTMLElement;
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
  contextResourceTabs: HTMLElement;
  previewContextControls: HTMLElement;
  previewFileContext: HTMLElement;
  pdfContextControls: HTMLElement;
  contextPreviewPanel: HTMLElement;
  previewScroll: HTMLElement;
  contextLibraryPanel: HTMLElement;
  contextLibraryScroll: HTMLElement;
  contextAssistantPanel: HTMLElement;
  contextAssistantScroll: HTMLElement;
  contextPublicationPanel: HTMLElement;
  contextPublicationBody: HTMLElement;
  contextPdfPanel: HTMLElement;
  contextCandidatePanel: HTMLElement;
  contextCandidateScroll: HTMLElement;
  contextCandidateTitle: HTMLElement;
  contextCandidateEyebrow: HTMLElement;
  contextCandidateMeta: HTMLElement;
  contextCandidateStatus: HTMLElement;
  contextCandidateBefore: HTMLElement;
  contextCandidateBeforeLabel: HTMLElement;
  contextCandidateAfter: HTMLElement;
  contextCandidateAfterLabel: HTMLElement;
  contextCandidateEvidenceHeading: HTMLElement;
  contextCandidateEvidence: HTMLElement;
  contextCandidateApply: HTMLButtonElement;
  contextCandidateReject: HTMLButtonElement;
  contextPublicationTitle: HTMLElement;
  contextPublicationMeta: HTMLElement;
  contextPublicationDetails: HTMLElement;
  contextPublicationPdfs: HTMLElement;
  insertContextCitation: HTMLButtonElement;
  publicationPdfLinkForm: HTMLFormElement;
  publicationPdfLink: HTMLSelectElement;
  preview: HTMLElement;
  diagnostics: HTMLElement;
  diagnosticSummary: HTMLElement;
  connectionDot: HTMLElement;
  connectionStatus: HTMLElement;
  editorTargetStatus: HTMLElement;
  saveStatus: HTMLElement;
  revisionBadge: HTMLElement;
  pdfUpload: HTMLInputElement;
  projectEvidence: HTMLDetailsElement;
  projectEvidenceCount: HTMLElement;
  pdfList: HTMLElement;
  knowledgeSearchForm: HTMLFormElement;
  knowledgeSearchInput: HTMLInputElement;
  knowledgeSearchResults: HTMLElement;
  publicationCount: HTMLElement;
  publicationList: HTMLElement;
  annotationList: HTMLElement;
  unassignedAnnotationList: HTMLElement;
  claimCount: HTMLElement;
  claimList: HTMLElement;
  newClaim: HTMLButtonElement;
  claimDialog: HTMLDialogElement;
  claimForm: HTMLFormElement;
  claimDialogTitle: HTMLElement;
  claimText: HTMLTextAreaElement;
  claimNote: HTMLTextAreaElement;
  claimRelation: HTMLSelectElement;
  claimEvidenceOptions: HTMLElement;
  cancelClaim: HTMLButtonElement;
  connectionCount: HTMLElement;
  knowledgeConnectionList: HTMLElement;
  annotationForm: HTMLFormElement;
  annotationComposer: HTMLElement;
  libraryHighlightComposer: HTMLElement;
  openLibraryPdfInspector: HTMLButtonElement;
  closeLibraryPdfInspector: HTMLButtonElement;
  libraryAnnotationDetails: HTMLDetailsElement;
  detectLibraryPdfHighlights: HTMLButtonElement;
  libraryHighlightImportForm: HTMLFormElement;
  libraryHighlightImportList: HTMLElement;
  libraryHighlightImportStatus: HTMLElement;
  cancelLibraryHighlightImport: HTMLButtonElement;
  libraryHighlightForm: HTMLFormElement;
  libraryHighlightStatus: HTMLElement;
  libraryHighlightPage: HTMLInputElement;
  libraryHighlightQuote: HTMLTextAreaElement;
  libraryHighlightComment: HTMLInputElement;
  libraryHighlightExcerpt: HTMLElement;
  saveLibraryHighlight: HTMLButtonElement;
  cancelLibraryHighlight: HTMLButtonElement;
  libraryProjectUse: HTMLElement;
  libraryHighlightCount: HTMLElement;
  libraryHighlightList: HTMLElement;
  libraryNoteForm: HTMLFormElement;
  libraryNoteBody: HTMLTextAreaElement;
  cancelLibraryNote: HTMLButtonElement;
  librarySelectTool: HTMLButtonElement;
  libraryTextTool: HTMLButtonElement;
  libraryNoteTool: HTMLButtonElement;
  libraryDrawTool: HTMLButtonElement;
  libraryInkOptions: HTMLElement;
  libraryDrawColor: HTMLInputElement;
  libraryDrawWidth: HTMLInputElement;
  libraryDrawWidthValue: HTMLOutputElement;
  undoLibraryDrawing: HTMLButtonElement;
  exportLibraryAnnotatedPdf: HTMLButtonElement;
  libraryMarkupSelection: HTMLFormElement;
  libraryMarkupSelectionLabel: HTMLElement;
  librarySelectedDrawingOptions: HTMLElement;
  librarySelectedDrawColor: HTMLInputElement;
  librarySelectedDrawWidth: HTMLInputElement;
  librarySelectedDrawWidthValue: HTMLOutputElement;
  editSelectedLibraryNote: HTMLButtonElement;
  deleteSelectedLibraryMarkup: HTMLButtonElement;
  cancelLibraryMarkupSelection: HTMLButtonElement;
  annotationPdf: HTMLSelectElement;
  annotationPage: HTMLInputElement;
  annotationQuote: HTMLTextAreaElement;
  annotationPrefix: HTMLInputElement;
  annotationSuffix: HTMLInputElement;
  annotationComment: HTMLInputElement;
  annotationSelectionStatus: HTMLElement;
  saveAndLinkAnnotation: HTMLButtonElement;
  highlightPaintTool: HTMLButtonElement;
  highlightEraserTool: HTMLButtonElement;
  undoHighlight: HTMLButtonElement;
  citeActivePdf: HTMLButtonElement;
  openPaper: HTMLButtonElement;
  paperStatus: HTMLElement;
  paperCanvas: HTMLCanvasElement;
  paperPage: HTMLElement;
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
  publicationIntakeForm: HTMLFormElement;
  publicationIntakeDoi: HTMLInputElement;
  publicationIntakeStatus: HTMLElement;
  publicationIntakeReview: HTMLElement;
  publicationIntakeTitle: HTMLElement;
  publicationIntakeMeta: HTMLElement;
  publicationIntakeKey: HTMLInputElement;
  publicationIntakeAccept: HTMLButtonElement;
  publicationIntakeCancel: HTMLButtonElement;
  publicationIntakeLinked: HTMLElement;
  publicationIntakeLinkedList: HTMLElement;
  llmEndpoint: HTMLInputElement;
  llmConnection: HTMLSelectElement;
  llmModel: HTMLSelectElement;
  llmReasoningEffort: HTMLSelectElement;
  discoverLlmModels: HTMLButtonElement;
  modelOperation: HTMLSelectElement;
  assistantTargetScope: HTMLSelectElement;
  assistantTargetScopeField: HTMLElement;
  assistantTargetPreview: HTMLElement;
  assistantInteractiveResult: HTMLElement;
  assistantTableFields: HTMLFieldSetElement;
  assistantTableCaption: HTMLInputElement;
  assistantTableColumns: HTMLTextAreaElement;
  assistantTableRows: HTMLTextAreaElement;
  assistantPhrasingPurpose: HTMLSelectElement;
  assistantPhrasingPurposeField: HTMLElement;
  assistantPhrasingAttribution: HTMLDetailsElement;
  modelClaimRelation: HTMLSelectElement;
  modelClaimRelationField: HTMLElement;
  assistantOperationEyebrow: HTMLElement;
  assistantOperationTitle: HTMLElement;
  assistantOperationDescription: HTMLElement;
  modelInstructionLabel: HTMLElement;
  modelInstruction: HTMLTextAreaElement;
  generateCandidate: HTMLButtonElement;
  modelStatus: HTMLElement;
  candidateList: HTMLElement;
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

interface ClarityDrillContext extends AssistantDraftContext {
  readonly provider: OpenAICompatibleBrowserProvider;
  readonly question: ModelClarityQuestion;
}

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
  readonly #publicationIntake = createPublicationIntakeActor();
  readonly #collaborationWorkflow = createCollaborationWorkflowActor();
  readonly #metadataRefinement = createMetadataRefinementActor();
  readonly #projectHistoryWorkflow = createProjectHistoryActor();
  #snapshot: WorkspaceSnapshot | null = null;
  #renderedProjectMapGraph: WorkspaceKnowledgeGraph | null = null;
  #projectMapResizeObserver: ResizeObserver | null = null;
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
  readonly #hiddenProjectFileIds = new Set<string>();
  readonly #hiddenProjectFolderIds = new Set<string>();
  readonly #hiddenProjectImageIds = new Set<string>();
  readonly #pendingDeletions = new Map<string, PendingDeletion>();
  #editingAnnotationId: string | null = null;
  #highlightTool: "paint" | "erase" = "paint";
  #lastHighlightStroke: { annotationId: string; fragmentId: string } | null = null;
  #renderedPdfId: string | undefined;
  #renderedPdfContextKey: ResearchContextKey | undefined;
  #editingClaimId: string | undefined;
  #contextState: ResearchContextState = createResearchContext();
  #authoringSelection: RelativeEditorSelection | null = null;
  #modelEvidenceSelection = new Set<string>();
  #activeFileId: string | null = null;
  #activeFileText = this.#source;
  readonly #editorUndoManagers = new Map<Y.Text, Y.UndoManager>();
  #unbindSourceEditor: () => void = () => undefined;
  #unbindAssistantSourceStale: () => void = () => undefined;
  #projectFileDialogMode: "create" | "create-and-include" | "rename" | "create-folder" | "rename-folder" = "create";
  #projectFolderId: string | null = null;
  #projectFileIncludeTarget: RelativeEditorSelection | null = null;
  #projectFileIncludeFromPath: string | null = null;
  #librarySnapshot: ReferenceLibrarySnapshot | null = null;
  #projectReferencePdfs: readonly ProjectReferencePdf[] = [];
  readonly #expandedLibraryReferences = new Set<string>();
  #libraryPdfUploadBusy = false;
  #pdfDrawingDraftLine: SVGElement | null = null;
  #libraryHighlightRects: PdfSelectionCapture["rects"] = [];
  #editingLibraryHighlightId: string | null = null;
  #pdfHighlightDetection: { readonly artifactId: string; readonly result: PdfHighlightDetection } | null = null;
  #openPdfNoteId: string | null = null;
  #failedLibraryPdfUploads: readonly File[] = [];
  #showArchivedReferences = false;
  #citationNetwork: CitationNetwork | null = null;
  #citationExpansion: CitationExpansionResult | null = null;
  #filterProjectCitations = false;
  #projectHistory: ProjectRevisionSummary[] = [];
  #wordStatistics: PublicationWordStatistics | null = null;
  #workspaceCatalog: WorkspaceSummary[] = [];
  #latexImportDigest: string | null = null;
  #latexImportBibliographyPath: string | null = null;
  #gitHubImportPreviewId: string | null = null;
  #gitHubPullPreviewId: string | null = null;
  #gitHubPublishPreviewId: string | null = null;
  #gitHubRepositories: readonly GitHubRepositoryOption[] = [];
  #gitHubPickerRequest = 0;
  #projectTemplates: ProjectTemplateSummary[] = [];
  readonly #hiddenProjectTemplateIds = new Set<string>();
  #previewedProjectTemplateId = "";
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

  constructor() {
    this.#pdfViewer = new PdfEvidenceViewer(
      {
        reader: this.#elements.paperReader,
        canvas: this.#elements.paperCanvas,
        page: this.#elements.paperPage,
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
    void this.#prepareOfflineShell();
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
    this.#connect();
    if (new URL(location.href).searchParams.get("create") === "1") {
      history.replaceState(history.state, "", location.pathname);
      await this.#openNewWorkspace();
    }
  }

  #bindUi(): void {
    this.#restoreModelPreferences();
    this.#restoreCitationCompletionScope();
    this.#elements.copyApplicationVersion.addEventListener("click", () => {
      void copyText(applicationVersion)
        .then(() => this.#showToast(`Copied application version ${applicationVersion}.`))
        .catch(() => this.#showToast("Could not copy the application version"));
    });
    window.addEventListener("online", () => this.#connect());
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
    this.#elements.workspaceSwitcher.addEventListener("change", () => {
      const selected = this.#elements.workspaceSwitcher.value;
      if (selected && selected !== workspaceId) location.assign(`/editor/${encodeURIComponent(selected)}`);
    });
    this.#elements.workspaceLayout.addEventListener("change", () => void this.#setWorkspaceLayout(this.#elements.workspaceLayout.value));
    this.#elements.manageWorkspaces.addEventListener("click", () => {
      this.#elements.workspaceCatalogDialog.showModal();
      this.#elements.workspaceCatalogFilter.value = "";
      this.#renderWorkspaceCatalogList();
      this.#elements.workspaceCatalogFilter.focus();
    });
    this.#elements.workspaceSettings.addEventListener("click", () => {
      const current = this.#workspaceCatalog.find((item) => item.id === workspaceId);
      this.#elements.workspaceSettingsTitle.value = current?.title ?? "";
      this.#elements.workspaceEntryFile.replaceChildren(
        ...(this.#snapshot?.files ?? [])
          .filter((file) => !this.#hiddenProjectFileIds.has(file.id))
          .map((file) => {
            const option = document.createElement("option");
            option.value = file.id;
            option.textContent = file.path;
            option.selected = file.id === this.#snapshot?.entryFileId;
            return option;
          }),
      );
      this.#elements.workspaceCitationStyle.value = this.#snapshot?.publicationProfile.citationStyle ?? "apa";
      this.#elements.workspaceCitationLocale.value = this.#snapshot?.publicationProfile.locale ?? "en-US";
      this.#elements.workspaceSubmissionTemplate.value = this.#snapshot?.publicationProfile.submissionTemplate ?? "article";
      this.#elements.workspacePaperSize.value = this.#snapshot?.publicationProfile.paperSize ?? "a4";
      this.#elements.archiveWorkspace.textContent = current?.archivedAt ? "Restore" : "Archive";
      this.#elements.saveWorkspaceTemplate.hidden = workspaceId === "demo";
      this.#elements.workspaceSettingsDialog.showModal();
      void this.#refreshGitHubSyncState();
    });
    this.#elements.closeWorkspaceSettings.addEventListener("click", () => this.#elements.workspaceSettingsDialog.close());
    this.#elements.workspaceSettingsForm.addEventListener("submit", (event) => void this.#saveWorkspaceSettings(event));
    this.#elements.archiveWorkspace.addEventListener("click", () => void this.#toggleWorkspaceArchive());
    this.#elements.saveWorkspaceTemplate.addEventListener("click", () => void this.#openSaveTemplate());
    this.#elements.duplicateWorkspace.addEventListener("click", () => void this.#duplicateWorkspace());
    this.#elements.deleteWorkspace.addEventListener("click", () => void this.#deleteWorkspace());
    this.#elements.closeWorkspaceCatalog.addEventListener("click", () => this.#elements.workspaceCatalogDialog.close());
    this.#elements.workspaceCatalogFilter.addEventListener("input", () => this.#renderWorkspaceCatalogList());
    this.#elements.newWorkspace.addEventListener("click", () => void this.#openNewWorkspace());
    this.#elements.cancelNewWorkspace.addEventListener("click", () => this.#elements.newWorkspaceDialog.close());
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
    this.#elements.newWorkspaceForm.addEventListener("submit", (event) => void this.#createWorkspace(event));
    this.#elements.openLatexImport.addEventListener("click", () => {
      this.#elements.newWorkspaceDialog.close();
      this.#resetLatexImport();
      this.#elements.latexImportDialog.showModal();
      this.#elements.latexImportTitle.focus();
    });
    this.#elements.cancelLatexImport.addEventListener("click", () => this.#elements.latexImportDialog.close());
    this.#elements.latexImportForm.addEventListener("submit", (event) => void this.#previewLatexImport(event));
    this.#elements.latexImportArchive.addEventListener("change", () => {
      this.#resetLatexImportPreview();
      this.#elements.latexRootField.hidden = true;
      this.#elements.latexImportRoot.replaceChildren();
      const archive = this.#elements.latexImportArchive.files?.[0];
      if (archive && !this.#elements.latexImportTitle.value.trim()) {
        this.#elements.latexImportTitle.value = archive.name.replace(/\.zip$/iu, "").replaceAll(/[_-]+/gu, " ");
      }
    });
    this.#elements.latexImportRoot.addEventListener("change", () => {
      this.#resetLatexImportPreview();
      this.#elements.latexImportStatus.textContent = "Preview the selected root before creating the project.";
    });
    this.#elements.confirmLatexImport.addEventListener("click", () => void this.#confirmLatexImport());
    this.#elements.openGitHubImport.addEventListener("click", () => {
      this.#elements.newWorkspaceDialog.close();
      this.#gitHubImportPreviewId = null;
      this.#elements.confirmGitHubImport.disabled = true;
      this.#elements.gitHubImportPreview.replaceChildren(statusText("Preview to inspect the selected files and resolved entry."));
      this.#elements.gitHubImportStatus.textContent = "";
      this.#elements.gitHubImportDialog.showModal();
      this.#elements.gitHubImportTitle.focus();
      void this.#refreshGitHubConnection();
    });
    this.#elements.cancelGitHubImport.addEventListener("click", () => this.#elements.gitHubImportDialog.close());
    this.#elements.gitHubImportForm.addEventListener("submit", (event) => void this.#previewGitHubImport(event));
    this.#elements.gitHubInstallationId.addEventListener("change", () => void this.#loadGitHubRepositories());
    this.#elements.gitHubRepository.addEventListener("change", () => void this.#loadGitHubBranches());
    this.#elements.gitHubBranch.addEventListener("change", () => this.#updateGitHubImportReadiness());
    this.#elements.confirmGitHubImport.addEventListener("click", () => void this.#confirmGitHubImport());
    this.#elements.disconnectGitHubAccount.addEventListener("click", () => void this.#disconnectGitHubAccount());
    this.#elements.previewGitHubPull.addEventListener("click", () => void this.#previewGitHubPull());
    this.#elements.confirmGitHubPull.addEventListener("click", () => void this.#confirmGitHubPull());
    this.#elements.previewGitHubPublish.addEventListener("click", () => void this.#previewGitHubPublish());
    this.#elements.confirmGitHubPublish.addEventListener("click", () => void this.#confirmGitHubPublish());
    this.#elements.disconnectGitHub.addEventListener("click", () => void this.#disconnectGitHub());
    const githubResult = new URL(location.href).searchParams.get("github");
    if (githubResult === "connected" || githubResult === "installed") {
      this.#elements.openGitHubImport.click();
      history.replaceState(history.state, "", location.pathname);
    }
    this.#elements.cancelSaveTemplate.addEventListener("click", () => this.#elements.saveTemplateDialog.close());
    this.#elements.saveTemplateForm.addEventListener("submit", (event) => void this.#saveProjectTemplate(event));
    this.#elements.saveTemplateTarget.addEventListener("change", () => this.#selectTemplateReplacement());
    this.#elements.showFilesRail.addEventListener("click", () => this.#showRail("files"));
    this.#elements.showResearchRail.addEventListener("click", () => this.#showRail("research"));
    this.#elements.showCommentsRail.addEventListener("click", () => this.#showRail("comments"));
    this.#elements.showGuideRail.addEventListener("click", () => this.#showRail("guide"));
    this.#elements.openResearchDiary.addEventListener("click", () => void this.#openResearchDiary());
    this.#elements.openResearchQuestions.addEventListener("click", () => void this.#openResearchQuestions());
    this.#elements.editingPass.addEventListener("change", () => this.#renderEditingPass(this.#currentComposedSource()));
    this.#elements.openReviewerResponse.addEventListener("click", () => void this.#openReviewerResponse());
    this.#elements.downloadReviewerResponse.addEventListener("click", () => this.#downloadReviewerResponse());
    this.#elements.shareWorkspace.addEventListener("click", () => void this.#openSharing());
    this.#elements.closeShareWorkspace.addEventListener("click", () => this.#elements.shareWorkspaceDialog.close());
    this.#elements.inviteMemberForm.addEventListener("submit", (event) => void this.#inviteMember(event));
    this.#elements.createReadOnlyShare.addEventListener("click", () => void this.#createReadOnlyShare());
    this.#elements.copyReadOnlyShare.addEventListener("click", () => void this.#copyReadOnlyShare());
    this.#elements.revokeReadOnlyShare.addEventListener("click", () => void this.#revokeReadOnlyShare());
    this.#elements.createEditShare.addEventListener("click", () => void this.#createEditShare());
    this.#elements.copyEditShare.addEventListener("click", () => void this.#copyEditShare());
    this.#elements.revokeEditShare.addEventListener("click", () => void this.#revokeEditShare());
    this.#elements.contextLibraryTab.addEventListener("click", () => void this.#openReferenceLibrary());
    this.#elements.libraryDiscoveryForm.addEventListener("submit", (event) => void this.#discoverLibraryReferences(event));
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
    this.#elements.webSourceForm.addEventListener("submit", (event) => void this.#captureWebSource(event));
    this.#elements.openCitationNetwork.addEventListener("click", () => void this.#openCitationNetwork());
    this.#elements.closeCitationNetwork.addEventListener("click", () => {
      this.#elements.citationNetwork.classList.add("hidden");
    });
    this.#elements.filterProjectCitations.addEventListener("click", () => {
      this.#filterProjectCitations = !this.#filterProjectCitations;
      this.#elements.filterProjectCitations.setAttribute("aria-pressed", String(this.#filterProjectCitations));
      void this.#refreshCitationNetwork();
    });
    this.#elements.citationAssertionForm.addEventListener("submit", (event) => void this.#recordCitationAssertion(event));
    this.#elements.showArchivedReferences.addEventListener("click", () => {
      this.#showArchivedReferences = !this.#showArchivedReferences;
      this.#elements.showArchivedReferences.setAttribute("aria-pressed", String(this.#showArchivedReferences));
      void this.#refreshReferenceLibrary();
    });
    for (const control of [
      this.#elements.referenceFilterQuery,
      this.#elements.referenceFilterType,
      this.#elements.referenceFilterReading,
      this.#elements.referenceFilterOrganization,
      this.#elements.referenceFilterLinkage,
      this.#elements.referenceFilterCompleteness,
      this.#elements.referenceFilterSort,
    ]) {
      control.addEventListener("input", () => this.#renderReferenceLibrary());
    }
    this.#bindSourceEditor(this.#source);
    this.#rememberAuthoringSelection();
    bindVimTextarea(this.#elements.source, this.#elements.sourceEditorShell, this.#elements.vimToggle, this.#elements.vimModeStatus);
    bindYText(this.#elements.bibliography, this.#bibliography, this.#document);
    this.#elements.newProjectFile.addEventListener("click", () => this.#openProjectFileDialog("create"));
    this.#elements.newProjectFileRail.addEventListener("click", () => this.#openProjectFileDialog("create"));
    this.#elements.newProjectFolderRail.addEventListener("click", () => this.#openProjectFileDialog("create-folder"));
    this.#elements.uploadProjectImages.addEventListener("click", () => this.#elements.projectImageUpload.click());
    this.#elements.projectImageUpload.addEventListener("change", () => void this.#uploadProjectImages());
    this.#elements.createAndIncludeProjectFile.addEventListener("click", () => this.#openProjectFileDialog("create-and-include"));
    this.#elements.renameProjectFile.addEventListener("click", () => this.#openProjectFileDialog("rename"));
    this.#elements.deleteProjectFile.addEventListener("click", () => this.#deleteProjectFile());
    this.#elements.cancelProjectFile.addEventListener("click", () => this.#elements.projectFileDialog.close());
    this.#elements.projectFileForm.addEventListener("submit", (event) => void this.#saveProjectFile(event));
    this.#elements.editorInsertMenu.addEventListener("click", (event) => this.#insertSourceSyntax(event));
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
    this.#elements.closeProjectHistory.addEventListener("click", () => this.#elements.projectHistoryDialog.close());
    this.#elements.projectHistoryDialog.addEventListener("close", () => this.#projectHistoryWorkflow.send({ type: "CLOSE" }));
    this.#elements.projectHistoryCompareForm.addEventListener("submit", (event) => void this.#compareProjectHistory(event));
    this.#elements.manuscriptCommentForm.addEventListener("submit", (event) => void this.#createManuscriptComment(event));
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
    this.#elements.knowledgeSearchForm.addEventListener("submit", (event) => void this.#searchKnowledge(event));
    this.#elements.annotationForm.addEventListener("submit", (event) => void this.#createAnnotation(event));
    this.#elements.libraryHighlightForm.addEventListener("submit", (event) => void this.#saveLibraryHighlight(event));
    this.#elements.cancelLibraryHighlight.addEventListener("click", () => this.#clearLibraryHighlightDraft());
    this.#elements.librarySelectTool.addEventListener("click", () => this.#setLibraryPdfTool("select"));
    this.#elements.libraryTextTool.addEventListener("click", () => this.#setLibraryPdfTool("text"));
    this.#elements.libraryNoteTool.addEventListener("click", () => this.#setLibraryPdfTool("note"));
    this.#elements.libraryDrawTool.addEventListener("click", () => this.#setLibraryPdfTool("draw"));
    this.#elements.openLibraryPdfInspector.addEventListener("click", () => this.#setLibraryPdfInspector(true, true));
    this.#elements.closeLibraryPdfInspector.addEventListener("click", () => this.#closeLibraryPdfInspector());
    this.#elements.detectLibraryPdfHighlights.addEventListener("click", () => void this.#detectLibraryPdfHighlights());
    this.#elements.libraryHighlightImportForm.addEventListener("submit", (event) => void this.#importDetectedPdfHighlights(event));
    this.#elements.cancelLibraryHighlightImport.addEventListener("click", () => this.#resetPdfHighlightImport());
    this.#elements.libraryDrawWidth.addEventListener("input", () => {
      this.#elements.libraryDrawWidthValue.value = this.#elements.libraryDrawWidth.value;
    });
    this.#elements.librarySelectedDrawWidth.addEventListener("input", () => {
      this.#elements.librarySelectedDrawWidthValue.value = this.#elements.librarySelectedDrawWidth.value;
    });
    this.#elements.libraryMarkupSelection.addEventListener("submit", (event) => void this.#updateSelectedLibraryDrawing(event));
    this.#elements.editSelectedLibraryNote.addEventListener("click", () => this.#editSelectedLibraryPdfNote());
    this.#elements.deleteSelectedLibraryMarkup.addEventListener("click", () => void this.#deleteSelectedLibraryPdfMarkup());
    this.#elements.cancelLibraryMarkupSelection.addEventListener("click", () => this.#clearLibraryPdfMarkupSelection());
    this.#elements.libraryNoteForm.addEventListener("submit", (event) => void this.#saveLibraryPdfNote(event));
    this.#elements.cancelLibraryNote.addEventListener("click", () => this.#clearLibraryPdfNoteDraft());
    this.#elements.undoLibraryDrawing.addEventListener("click", () => void this.#undoLibraryDrawing());
    this.#elements.exportLibraryAnnotatedPdf.addEventListener("click", () => this.#downloadAnnotatedPdf());
    this.#elements.paperMarkups.addEventListener("pointerdown", (event) => this.#startLibraryPdfMarkup(event));
    this.#elements.paperMarkups.addEventListener("pointermove", (event) => this.#continueLibraryPdfDrawing(event));
    this.#elements.paperMarkups.addEventListener("pointerup", (event) => void this.#finishLibraryPdfDrawing(event));
    this.#elements.paperMarkups.addEventListener("pointercancel", () => {
      const movedNote = this.#pdfNoteDrag()?.moved;
      this.#cancelLibraryPdfDrawing();
      if (movedNote) this.#renderPdfMarkups();
    });
    this.#elements.highlightPaintTool.addEventListener("click", () => this.#setHighlightTool("paint"));
    this.#elements.highlightEraserTool.addEventListener("click", () => this.#setHighlightTool("erase"));
    this.#elements.undoHighlight.addEventListener("click", () => void this.#undoLastHighlightStroke());
    this.#elements.citeActivePdf.addEventListener("click", () => this.#citeActivePdf());
    this.#elements.newClaim.addEventListener("click", () => this.#openClaimDialog());
    this.#elements.cancelClaim.addEventListener("click", () => this.#elements.claimDialog.close());
    this.#elements.claimForm.addEventListener("submit", (event) => void this.#saveClaim(event));
    this.#elements.showAuthoringSurface.addEventListener("click", () => this.#showWorkspaceSurface("authoring"));
    this.#elements.showContextSurface.addEventListener("click", () => this.#showWorkspaceSurface("context"));
    this.#bindPaneResizer();
    this.#elements.contextPreviewTab.addEventListener("click", () => this.#activateContext(RESEARCH_PREVIEW_KEY));
    this.#elements.contextAssistantTab.addEventListener("click", () => this.#activateContext(RESEARCH_ASSISTANT_KEY));
    this.#elements.contextTabList.addEventListener("keydown", (event) => this.#moveContextTabFocus(event));
    this.#elements.preview.addEventListener("click", (event) => this.#handlePreviewClick(event));
    this.#elements.syncPreviewFromSource.addEventListener("click", () => this.#syncPreviewFromSource());
    this.#elements.syncSourceFromPreview.addEventListener("click", () => this.#syncSourceFromPreviewCenter());
    this.#elements.openSourceCitation.addEventListener("click", () => this.#openCitationAtCaret());
    this.#elements.insertContextCitation.addEventListener("click", () => this.#insertActivePublicationCitation());
    this.#elements.publicationPdfLinkForm.addEventListener("submit", (event) => void this.#linkActivePublicationPdf(event));
    this.#elements.openPaper.addEventListener("click", () => void this.#openOnlyLinkedPaper());
    this.#elements.publicationIntakeForm.addEventListener("submit", (event) => void this.#previewPublicationIntake(event));
    this.#elements.publicationIntakeAccept.addEventListener("click", () => void this.#acceptPublicationIntake());
    this.#elements.publicationIntakeCancel.addEventListener("click", () => this.#cancelPublicationIntake());
    this.#elements.contextCandidateApply.addEventListener("click", () => void this.#updateActiveCandidate("apply"));
    this.#elements.contextCandidateReject.addEventListener("click", () => void this.#updateActiveCandidate("reject"));
    for (const input of [
      this.#elements.llmConnection,
      this.#elements.llmEndpoint,
      this.#elements.llmModel,
      this.#elements.llmReasoningEffort,
      this.#elements.modelInstruction,
      this.#elements.modelClaimRelation,
      this.#elements.assistantTableCaption,
      this.#elements.assistantTableColumns,
      this.#elements.assistantTableRows,
      this.#elements.assistantPhrasingPurpose,
    ]) {
      input.addEventListener("input", () => this.#updateModelAvailability());
    }
    for (const input of [
      this.#elements.llmConnection,
      this.#elements.llmEndpoint,
      this.#elements.llmModel,
      this.#elements.llmReasoningEffort,
    ]) {
      input.addEventListener("input", () => this.#saveModelPreferences());
    }
    this.#elements.llmConnection.addEventListener("change", () => {
      this.#elements.llmEndpoint.value =
        this.#elements.llmConnection.value === "companion"
          ? "http://127.0.0.1:8790/v1/chat/completions"
          : "http://127.0.0.1:1234/v1/chat/completions";
      this.#elements.modelStatus.textContent =
        this.#elements.llmConnection.value === "companion"
          ? "The local companion starts with npm run dev; select manuscript text and grounding evidence."
          : "The browser will contact the configured loopback provider directly.";
      this.#elements.preferencesModelStatus.textContent = this.#elements.modelStatus.textContent;
      this.#saveModelPreferences();
    });
    this.#elements.llmModel.addEventListener("change", () => {
      const model = this.#elements.llmModel.value;
      const status = model ? `Using ${model} for new writing assistant requests.` : "Find a loaded model before using Writing assistant.";
      this.#elements.modelStatus.textContent = status;
      this.#elements.preferencesModelStatus.textContent = status;
    });
    this.#elements.discoverLlmModels.addEventListener("click", () => void this.#discoverLlmModels());
    this.#elements.openPreferencesFromAssistant.addEventListener("click", (event) => {
      event.stopPropagation();
      this.#elements.preferencesMenu.open = true;
      this.#elements.llmConnection.focus();
    });
    this.#elements.chooseModelEvidence.addEventListener("click", () => this.#chooseModelEvidence());
    this.#renderModelOperationOptions();
    this.#renderPhrasingPurposeOptions();
    this.#elements.modelOperation.addEventListener("change", () => this.#updateModelTask(true));
    this.#elements.assistantTargetScope.addEventListener("change", () => {
      this.#renderAssistantTargetPreview();
      this.#updateModelAvailability();
    });
    this.#elements.generateCandidate.addEventListener("click", () => void this.#generateCandidate());
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
    this.#renderWorkspaceCatalogList();
  }

  #renderWorkspaceCatalogList(): void {
    const query = this.#elements.workspaceCatalogFilter.value.trim().toLocaleLowerCase();
    const workspaces = this.#workspaceCatalog.filter((workspace) => workspace.title.toLocaleLowerCase().includes(query));
    this.#elements.workspaceCatalogList.replaceChildren();
    if (workspaces.length === 0) {
      this.#elements.workspaceCatalogList.append(emptyState(query ? "No projects match this title." : "No projects available."));
      return;
    }
    for (const workspace of workspaces) {
      const link = document.createElement("a");
      link.className = "project-catalog-row";
      link.href = workspace.href;
      if (workspace.id === workspaceId) link.setAttribute("aria-current", "page");
      const title = document.createElement("strong");
      title.textContent = workspace.title;
      const meta = document.createElement("span");
      meta.textContent =
        workspace.id === workspaceId
          ? workspace.archivedAt
            ? "Current project · archived"
            : "Current project"
          : `${workspace.archivedAt ? "Archived" : "Updated"} ${formatCalendarDate(workspace.archivedAt ?? workspace.updatedAt)}`;
      link.append(title, meta);
      this.#elements.workspaceCatalogList.append(link);
    }
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
    const layout: WorkspaceLayout = value === "editor" || value === "context" || value === "pdf" ? value : "split";
    this.#elements.workspaceLayout.value = layout;
    this.#elements.workspaceSurfaces.dataset.layout = layout;
    if (persist) localStorage.setItem(`kirjolab:layout:${workspaceId}`, layout);
    if (layout === "pdf") {
      const active = this.#contextState.tabs.find((tab) => tab.key === this.#contextState.activeKey);
      if (active?.kind !== "pdf" && active?.kind !== "library-pdf") {
        const pdf = this.#snapshot?.pdfs[0];
        if (pdf) await this.#showPaper(pdf);
        else {
          const artifact = this.#librarySnapshot?.artifacts[0];
          if (artifact) await this.#openLibraryPdf(artifact);
          else this.#showToast("Add or open a PDF before using PDF-only view.");
        }
      }
    }
    window.dispatchEvent(new Event("resize"));
    this.#syncWorkspaceRoute("replace");
  }

  async #restoreWorkspaceRoute(): Promise<void> {
    const url = new URL(location.href);
    const route = readWorkspaceUiRoute(url);
    if (url.searchParams.has("rail")) this.#showRail(route.rail);
    if (url.searchParams.has("mode")) this.#setAuthoringMode(route.mode);
    if (route.fileId && this.#snapshot?.files.some((file) => file.id === route.fileId)) this.#selectProjectFile(route.fileId);

    if (url.searchParams.has("context")) {
      this.#contextState = activateResearchTab(this.#contextState, RESEARCH_PREVIEW_KEY);
      try {
        const target = researchTargetFromContextKey(route.contextKey);
        if (!target) {
          if (route.contextKey === RESEARCH_LIBRARY_KEY) await this.#openReferenceLibrary(false);
          else this.#activateContext(route.contextKey);
        } else if (target.kind === "publication") {
          const publication = this.#snapshot?.publications.find((item) => item.id === target.id);
          if (publication) this.#openPublicationContext(publication);
        } else if (target.kind === "pdf") {
          const pdf = this.#snapshot?.pdfs.find((item) => item.id === target.id);
          if (pdf) await this.#showPaper(pdf, route.page, route.annotationId);
        } else if (target.kind === "candidate") {
          const candidate = this.#snapshot?.candidates.find((item) => item.id === target.id);
          if (candidate) this.#openCandidateContext(candidate);
        } else {
          if (!this.#librarySnapshot) await this.#refreshReferenceLibrary();
          const artifact = this.#librarySnapshot?.artifacts.find((item) => item.id === target.id);
          if (artifact) await this.#openLibraryPdf(artifact, route.page, false);
          else {
            const pdf = this.#projectReferencePdf(target.id);
            if (pdf) await this.#openProjectReferencePdf(pdf, route.page, false);
          }
        }
      } catch (error) {
        this.#contextState = activateResearchTab(this.#contextState, RESEARCH_PREVIEW_KEY);
        this.#renderResearchContext();
        this.#showToast(error instanceof Error ? error.message : "Could not restore that context");
      }
    }

    if (route.layout) await this.#setWorkspaceLayout(route.layout, false);
    if (url.searchParams.has("surface")) this.#showWorkspaceSurface(route.surface);
    this.#workspaceRouteReady = true;
    this.#syncWorkspaceRoute("replace");
  }

  #syncWorkspaceRoute(mode: "push" | "replace"): void {
    if (appMode !== "workspace" || !this.#workspaceRouteReady) return;
    const activeTab = this.#contextState.tabs.find((tab) => tab.key === this.#contextState.activeKey);
    const rail: WorkspaceRail =
      this.#elements.showResearchRail.getAttribute("aria-selected") === "true"
        ? "research"
        : this.#elements.showCommentsRail.getAttribute("aria-selected") === "true"
          ? "comments"
          : this.#elements.showGuideRail.getAttribute("aria-selected") === "true"
            ? "guide"
            : "files";
    const current = new URL(location.href);
    const next = workspaceUiRouteUrl(current, {
      ...(this.#activeFileId && this.#activeFileId !== this.#snapshot?.entryFileId ? { fileId: this.#activeFileId } : {}),
      rail,
      mode: this.#elements.showMapMode.getAttribute("aria-pressed") === "true" ? "map" : "write",
      surface: this.#elements.workspaceSurfaces.dataset.activeSurface === "context" ? "context" : "authoring",
      layout: this.#elements.workspaceLayout.value as WorkspaceLayout,
      contextKey: this.#contextState.activeKey,
      ...(activeTab?.kind === "pdf" || activeTab?.kind === "library-pdf" ? { page: activeTab.page } : {}),
      ...(activeTab?.kind === "pdf" && activeTab.focusedAnnotationId ? { annotationId: activeTab.focusedAnnotationId } : {}),
    });
    const currentRelative = `${current.pathname}${current.search}${current.hash}`;
    if (next === currentRelative) return;
    if (mode === "push") history.pushState({ view: "workspace" }, "", next);
    else history.replaceState(history.state, "", next);
  }

  async #createWorkspace(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const templateId = this.#elements.newWorkspaceTemplateId.value;
    if (!templateId) {
      this.#elements.newWorkspaceTemplateStatus.textContent = "Choose a starting template.";
      return;
    }
    this.#elements.newWorkspaceSubmit.disabled = true;
    const response = await jsonFetch(catalogBase, { title: this.#elements.newWorkspaceTitle.value, templateId });
    await expectOk(response);
    const workspace: unknown = await response.json();
    const created: unknown = [workspace];
    if (!isWorkspaceSummaries(created) || !created[0]) throw new Error("Project catalog returned invalid data");
    location.assign(created[0].href);
  }

  #resetLatexImport(): void {
    this.#elements.latexImportForm.reset();
    this.#elements.latexRootField.hidden = true;
    this.#elements.latexImportRoot.replaceChildren();
    this.#elements.latexImportStatus.textContent = "";
    this.#resetLatexImportPreview();
  }

  #resetLatexImportPreview(): void {
    this.#latexImportDigest = null;
    this.#latexImportBibliographyPath = null;
    this.#elements.confirmLatexImport.disabled = true;
    this.#elements.latexImportPreview.replaceChildren(statusText("Preview to inspect the converted Markdown and diagnostics."));
  }

  async #previewLatexImport(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const archive = this.#elements.latexImportArchive.files?.[0];
    if (!archive) return;
    if (archive.size > 20 * 1024 * 1024) {
      this.#elements.latexImportStatus.textContent = "LaTeX archive exceeds 20 MiB.";
      return;
    }
    this.#resetLatexImportPreview();
    this.#elements.previewLatexImport.disabled = true;
    this.#elements.latexImportStatus.textContent = "Inspecting and converting the archive on the server…";
    try {
      const query = new URLSearchParams();
      if (this.#elements.latexImportRoot.value) query.set("root", this.#elements.latexImportRoot.value);
      const response = await fetch(`/api/latex-import-previews${query.size ? `?${query.toString()}` : ""}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/zip" },
        body: archive,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isLatexImportPreview(value)) throw new Error("LaTeX import returned an invalid preview");
      this.#renderLatexImportRoots(value);
      if (!value.conversion) {
        this.#elements.latexImportStatus.textContent = "Choose a root document, then preview again.";
        return;
      }
      this.#latexImportDigest = value.digest;
      this.#latexImportBibliographyPath = value.conversion.report.bibliographyPath;
      const heading = document.createElement("p");
      heading.className = "text-sm font-semibold text-app-text";
      const imageCount = value.conversion.assets.length;
      heading.textContent = `${value.conversion.seed.files.length} Markdown files · ${imageCount} figure inputs detected · ${value.conversion.seed.bibliography ? "bibliography selected" : "no bibliography"}`;
      const files = document.createElement("div");
      files.className = "mt-3 space-y-2";
      for (const file of value.conversion.seed.files.slice(0, 12)) {
        const details = document.createElement("details");
        details.className = "rounded-app border border-app-line px-3 py-2";
        const summary = document.createElement("summary");
        summary.className = "cursor-pointer font-sans text-xs font-semibold text-app-text";
        summary.textContent = `${file.path} · ${formatBytes(new TextEncoder().encode(file.content).byteLength)}`;
        const source = document.createElement("pre");
        source.className = "mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-app-text-soft";
        source.textContent = file.content.length > 1_200 ? `${file.content.slice(0, 1_200)}\n…` : file.content;
        details.append(summary, source);
        files.append(details);
      }
      const diagnostics = document.createElement("ul");
      diagnostics.className = "mt-3 space-y-1 font-sans text-xs text-app-text-soft";
      for (const diagnostic of value.conversion.report.diagnostics.slice(0, 20)) {
        const item = document.createElement("li");
        item.textContent = `${diagnostic.severity === "error" ? "Blocked" : diagnostic.severity === "warning" ? "Review" : "Note"}: ${diagnostic.message}`;
        diagnostics.append(item);
      }
      this.#elements.latexImportPreview.replaceChildren(heading, files, diagnostics);
      const blocking = value.conversion.report.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
      this.#elements.confirmLatexImport.disabled = blocking > 0;
      this.#elements.latexImportStatus.textContent = blocking
        ? `${blocking} blocking diagnostic${blocking === 1 ? " requires" : "s require"} review.`
        : "Preview ready. Confirmation repeats conversion before creating the project.";
    } catch (error) {
      this.#elements.latexImportStatus.textContent = error instanceof Error ? error.message : "Could not preview the LaTeX archive.";
    } finally {
      this.#elements.previewLatexImport.disabled = false;
    }
  }

  #renderLatexImportRoots(value: LatexImportPreview): void {
    const selected = value.conversion?.report.rootPath ?? this.#elements.latexImportRoot.value;
    const options = value.archive.rootCandidates.map((path) => new Option(path, path, path === selected, path === selected));
    if (value.archive.rootCandidates.length > 1 && !selected) options.unshift(new Option("Choose a root document", "", true, true));
    this.#elements.latexImportRoot.replaceChildren(...options);
    this.#elements.latexRootField.hidden = value.archive.rootCandidates.length <= 1;
    if (selected) this.#elements.latexImportRoot.value = selected;
  }

  async #confirmLatexImport(): Promise<void> {
    const archive = this.#elements.latexImportArchive.files?.[0];
    if (!archive || !this.#latexImportDigest) return;
    this.#elements.confirmLatexImport.disabled = true;
    this.#elements.latexImportStatus.textContent = "Repeating conversion and creating the project…";
    try {
      const query = new URLSearchParams({
        title: this.#elements.latexImportTitle.value,
        previewDigest: this.#latexImportDigest,
        root: this.#elements.latexImportRoot.value,
      });
      if (this.#latexImportBibliographyPath) query.set("bibliography", this.#latexImportBibliographyPath);
      const response = await fetch(`/api/latex-imports?${query.toString()}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/zip" },
        body: archive,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isRecord(value) || !isRecord(value.workspace) || typeof value.workspace.href !== "string") {
        throw new Error("LaTeX import returned invalid project data");
      }
      location.assign(value.workspace.href);
    } catch (error) {
      this.#elements.latexImportStatus.textContent = error instanceof Error ? error.message : "Could not import the LaTeX project.";
      this.#elements.confirmLatexImport.disabled = false;
    }
  }

  async #previewGitHubImport(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.#gitHubImportPreviewId = null;
    this.#elements.confirmGitHubImport.disabled = true;
    this.#elements.gitHubImportStatus.textContent = "Reading the selected commit…";
    try {
      const installationId = Number(this.#elements.gitHubInstallationId.value);
      const repository = this.#gitHubRepositories.find((candidate) => candidate.id === Number(this.#elements.gitHubRepository.value));
      if (!repository) throw new Error("Choose a GitHub repository");
      const response = await jsonFetch("/api/github/import-previews", {
        installationId,
        owner: repository.owner,
        repository: repository.name,
        branch: this.#elements.gitHubBranch.value,
        rootPath: this.#elements.gitHubRootPath.value,
        ...(this.#elements.gitHubEntryPath.value.trim() ? { entryPath: this.#elements.gitHubEntryPath.value.trim() } : {}),
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isGitHubImportPreview(value)) throw new Error("GitHub returned an invalid import preview");
      this.#gitHubImportPreviewId = value.id;
      const heading = document.createElement("p");
      heading.className = "text-sm font-semibold text-app-text";
      heading.textContent = `${value.files.length} Markdown files · entry ${value.entryPath}`;
      const list = document.createElement("ul");
      list.className = "mt-3 space-y-1 font-sans text-xs text-app-text-soft";
      for (const file of value.files.slice(0, 12)) {
        const item = document.createElement("li");
        item.textContent = `${file.path} · ${formatBytes(file.bytes)}`;
        list.append(item);
      }
      if (value.files.length > 12) {
        const item = document.createElement("li");
        item.textContent = `…and ${value.files.length - 12} more`;
        list.append(item);
      }
      this.#elements.gitHubImportPreview.replaceChildren(heading, list);
      this.#elements.gitHubImportStatus.textContent = `${value.commitSha.slice(0, 10)} previewed. Confirm to create the project.`;
      this.#elements.confirmGitHubImport.disabled = false;
    } catch (error) {
      this.#elements.gitHubImportStatus.textContent = error instanceof Error ? error.message : "Could not preview GitHub import.";
    }
  }

  async #refreshGitHubConnection(): Promise<void> {
    this.#elements.previewGitHubImport.disabled = true;
    try {
      const response = await fetch("/api/github/connection", { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isGitHubConnectionState(value)) throw new Error("GitHub returned an invalid connection state");
      this.#elements.gitHubConnectionStatus.textContent = value.connected
        ? `Connected as @${value.user.login}. Repository access remains controlled on GitHub.`
        : "Connect GitHub to choose repositories available to your account.";
      this.#elements.connectGitHubAccount.hidden = value.connected;
      this.#elements.installGitHubApp.hidden = !value.connected;
      this.#elements.disconnectGitHubAccount.hidden = !value.connected;
      if (value.connected) await this.#loadGitHubInstallations();
      else this.#resetGitHubPickers();
    } catch (error) {
      this.#elements.gitHubConnectionStatus.textContent = error instanceof Error ? error.message : "Could not load the GitHub connection.";
    }
  }

  async #loadGitHubInstallations(): Promise<void> {
    const requestId = ++this.#gitHubPickerRequest;
    this.#elements.previewGitHubImport.disabled = true;
    this.#elements.gitHubInstallationId.disabled = true;
    this.#replaceSelectOptions(this.#elements.gitHubInstallationId, "Loading accounts…");
    const response = await fetch("/api/github/installations", { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isGitHubInstallationList(value)) throw new Error("GitHub returned an invalid installation list");
    if (requestId !== this.#gitHubPickerRequest) return;
    this.#elements.gitHubInstallationId.replaceChildren(
      ...value.installations.map((installation) => {
        const option = document.createElement("option");
        option.value = String(installation.id);
        option.textContent = `${installation.accountLogin} · ${installation.accountType === "Organization" ? "organization" : "personal"}`;
        return option;
      }),
    );
    this.#elements.gitHubInstallationId.disabled = value.installations.length === 0;
    if (value.installations.length === 0) {
      this.#replaceSelectOptions(this.#elements.gitHubInstallationId, "No installations available");
      this.#elements.gitHubConnectionStatus.textContent = "Connected. Install the Kirjolab GitHub App or grant it repository access.";
      this.#resetGitHubRepositoryPickers();
      return;
    }
    await this.#loadGitHubRepositories(requestId);
  }

  async #loadGitHubRepositories(parentRequestId?: number): Promise<void> {
    const requestId = parentRequestId ?? ++this.#gitHubPickerRequest;
    if (parentRequestId !== undefined && requestId !== this.#gitHubPickerRequest) return;
    const installationId = Number(this.#elements.gitHubInstallationId.value);
    this.#elements.previewGitHubImport.disabled = true;
    this.#elements.gitHubRepository.disabled = true;
    this.#replaceSelectOptions(this.#elements.gitHubRepository, "Loading repositories…");
    this.#replaceSelectOptions(this.#elements.gitHubBranch, "Choose a repository");
    this.#elements.gitHubBranch.disabled = true;
    const response = await fetch(`/api/github/installations/${installationId}/repositories`, { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isGitHubRepositoryList(value)) throw new Error("GitHub returned an invalid repository list");
    if (requestId !== this.#gitHubPickerRequest) return;
    this.#gitHubRepositories = [...value.repositories].sort((left, right) => left.fullName.localeCompare(right.fullName));
    this.#elements.gitHubRepository.replaceChildren(
      ...this.#gitHubRepositories.map((repository) => {
        const option = document.createElement("option");
        option.value = String(repository.id);
        option.textContent = `${repository.fullName}${repository.private ? " · private" : ""}`;
        return option;
      }),
    );
    this.#elements.gitHubRepository.disabled = this.#gitHubRepositories.length === 0;
    if (this.#gitHubRepositories.length === 0) {
      this.#replaceSelectOptions(this.#elements.gitHubRepository, "No repositories available");
      return;
    }
    if (!this.#elements.gitHubImportTitle.value.trim()) this.#elements.gitHubImportTitle.value = this.#gitHubRepositories[0]!.name;
    await this.#loadGitHubBranches(requestId);
  }

  async #loadGitHubBranches(parentRequestId?: number): Promise<void> {
    const requestId = parentRequestId ?? ++this.#gitHubPickerRequest;
    if (parentRequestId !== undefined && requestId !== this.#gitHubPickerRequest) return;
    const installationId = Number(this.#elements.gitHubInstallationId.value);
    const repositoryId = Number(this.#elements.gitHubRepository.value);
    this.#elements.previewGitHubImport.disabled = true;
    this.#elements.gitHubBranch.disabled = true;
    this.#replaceSelectOptions(this.#elements.gitHubBranch, "Loading branches…");
    const response = await fetch(`/api/github/installations/${installationId}/repositories/${repositoryId}/branches`, {
      credentials: "same-origin",
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isGitHubBranchList(value)) throw new Error("GitHub returned an invalid branch list");
    if (requestId !== this.#gitHubPickerRequest) return;
    this.#elements.gitHubBranch.replaceChildren(
      ...value.branches.map((branch) => {
        const option = document.createElement("option");
        option.value = branch.name;
        option.textContent = `${branch.name}${branch.protected ? " · protected" : ""}`;
        option.selected = branch.name === value.repository.defaultBranch;
        return option;
      }),
    );
    this.#elements.gitHubBranch.disabled = value.branches.length === 0;
    if (value.branches.length === 0) this.#replaceSelectOptions(this.#elements.gitHubBranch, "No branches available");
    this.#updateGitHubImportReadiness();
  }

  #updateGitHubImportReadiness(): void {
    this.#elements.previewGitHubImport.disabled =
      !this.#elements.gitHubInstallationId.value || !this.#elements.gitHubRepository.value || !this.#elements.gitHubBranch.value;
  }

  #resetGitHubPickers(): void {
    this.#gitHubPickerRequest += 1;
    this.#elements.gitHubInstallationId.disabled = true;
    this.#replaceSelectOptions(this.#elements.gitHubInstallationId, "Connect GitHub first");
    this.#resetGitHubRepositoryPickers();
  }

  #resetGitHubRepositoryPickers(): void {
    this.#gitHubRepositories = [];
    this.#elements.gitHubRepository.disabled = true;
    this.#replaceSelectOptions(this.#elements.gitHubRepository, "Choose an account");
    this.#elements.gitHubBranch.disabled = true;
    this.#replaceSelectOptions(this.#elements.gitHubBranch, "Choose a repository");
    this.#elements.previewGitHubImport.disabled = true;
  }

  #replaceSelectOptions(select: HTMLSelectElement, label: string): void {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = label;
    select.replaceChildren(option);
  }

  async #disconnectGitHubAccount(): Promise<void> {
    if (!confirm("Disconnect your GitHub account from Kirjolab? Existing project files and repositories will not be deleted.")) return;
    const response = await fetch("/api/github/connection", { method: "DELETE", credentials: "same-origin" });
    await expectOk(response);
    await this.#refreshGitHubConnection();
  }

  async #confirmGitHubImport(): Promise<void> {
    if (!this.#gitHubImportPreviewId) return;
    this.#elements.confirmGitHubImport.disabled = true;
    this.#elements.gitHubImportStatus.textContent = "Creating the project…";
    try {
      const response = await jsonFetch("/api/github/imports", {
        previewId: this.#gitHubImportPreviewId,
        title: this.#elements.gitHubImportTitle.value,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isUnknownRecord(value) || !isUnknownRecord(value.workspace) || typeof value.workspace.href !== "string") {
        throw new Error("GitHub import returned invalid project data");
      }
      location.assign(value.workspace.href);
    } catch (error) {
      this.#elements.gitHubImportStatus.textContent = error instanceof Error ? error.message : "Could not import the project.";
      this.#elements.confirmGitHubImport.disabled = false;
    }
  }

  async #refreshGitHubSyncState(): Promise<void> {
    this.#gitHubPullPreviewId = null;
    this.#gitHubPublishPreviewId = null;
    this.#elements.confirmGitHubPull.disabled = true;
    this.#elements.confirmGitHubPublish.disabled = true;
    this.#elements.gitHubPullReview.replaceChildren();
    this.#elements.gitHubPublishReview.replaceChildren();
    try {
      const response = await fetch(`${apiBase}/github-sync`, { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      const connected = isGitHubSyncState(value);
      this.#elements.previewGitHubPull.disabled = !connected;
      this.#elements.previewGitHubPublish.disabled = !connected;
      this.#elements.disconnectGitHub.disabled = !connected;
      this.#elements.gitHubPublishMessage.disabled = !connected;
      this.#elements.gitHubSyncStatus.textContent = connected
        ? `${value.owner}/${value.repository} · ${value.branch}${value.rootPath ? ` · ${value.rootPath}/` : ""} · synced ${value.commitSha.slice(0, 10)}`
        : "This project is not connected to GitHub.";
    } catch (error) {
      this.#elements.gitHubSyncStatus.textContent = error instanceof Error ? error.message : "Could not load GitHub sync state.";
    }
  }

  async #previewGitHubPull(): Promise<void> {
    this.#gitHubPullPreviewId = null;
    this.#elements.confirmGitHubPull.disabled = true;
    this.#elements.gitHubPullReview.replaceChildren(statusText("Checking GitHub for changes…"));
    try {
      const response = await jsonFetch(`${apiBase}/github-sync/pull-previews`, {});
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isGitHubPullPreview(value)) throw new Error("GitHub returned an invalid pull preview");
      this.#gitHubPullPreviewId = value.id;
      const summary = document.createElement("p");
      summary.className = "text-sm leading-6 text-app-text-soft";
      summary.textContent = value.plan.blocking.length
        ? `${value.plan.blocking.length} conflict${value.plan.blocking.length === 1 ? "" : "s"} need review before pulling.`
        : value.plan.changes.length
          ? `${value.plan.changes.length} incoming change${value.plan.changes.length === 1 ? "" : "s"} ready to pull.`
          : "Kirjolab is up to date with GitHub.";
      const list = document.createElement("ul");
      list.className = "mt-2 space-y-1 font-sans text-xs text-app-text-soft";
      for (const change of value.plan.changes) {
        const item = document.createElement("li");
        item.textContent = `${change.remote ? (change.base ? "Update" : "Add") : "Delete"} · ${change.remote?.path ?? change.base?.path ?? "Unknown path"}`;
        list.append(item);
      }
      const conflicts = document.createElement("div");
      conflicts.className = "mt-4 space-y-4";
      value.plan.blocking.forEach((change, conflict) => {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "rounded-app border border-app-line p-3";
        const legend = document.createElement("legend");
        legend.className = "px-1 font-sans text-xs font-semibold text-app-text";
        legend.textContent = `Conflict · ${change.local?.path ?? change.remote?.path ?? change.base?.path ?? "Unknown path"}`;
        const versions = document.createElement("div");
        versions.className = "mt-2 grid gap-3 md:grid-cols-2";
        versions.append(
          gitHubConflictVersion("Kirjolab", change.local?.content ?? "File deleted in Kirjolab"),
          gitHubConflictVersion("GitHub", change.remote?.content ?? "File deleted on GitHub"),
        );
        const label = document.createElement("label");
        label.className = "field-label mt-3";
        label.textContent = "Resolution";
        const select = document.createElement("select");
        select.className = "field";
        select.dataset.githubConflict = String(conflict);
        select.append(new Option("Choose a version…", ""), new Option("Keep Kirjolab", "local"), new Option("Use GitHub", "remote"));
        select.addEventListener("change", () => {
          this.#elements.confirmGitHubPull.disabled = ![
            ...this.#elements.gitHubPullReview.querySelectorAll<HTMLSelectElement>("[data-github-conflict]"),
          ].every((candidate) => candidate.value === "local" || candidate.value === "remote");
        });
        label.append(select);
        fieldset.append(legend, versions, label);
        conflicts.append(fieldset);
      });
      this.#elements.gitHubPullReview.replaceChildren(summary, list, conflicts);
      this.#elements.confirmGitHubPull.disabled =
        value.plan.changes.length === 0 && value.plan.blocking.length === 0 ? true : value.plan.blocking.length > 0;
    } catch (error) {
      this.#elements.gitHubPullReview.replaceChildren(statusText(error instanceof Error ? error.message : "Could not check GitHub."));
    }
  }

  async #confirmGitHubPull(): Promise<void> {
    if (!this.#gitHubPullPreviewId) return;
    this.#elements.confirmGitHubPull.disabled = true;
    try {
      const resolutions = [...this.#elements.gitHubPullReview.querySelectorAll<HTMLSelectElement>("[data-github-conflict]")].map(
        (select) => ({
          conflict: Number(select.dataset.githubConflict),
          choice: select.value,
        }),
      );
      const response = await jsonFetch(`${apiBase}/github-sync/pulls`, { previewId: this.#gitHubPullPreviewId, resolutions });
      await expectOk(response);
      await this.#resourceRefresh.request();
      await this.#refreshGitHubSyncState();
      this.#elements.gitHubPullReview.replaceChildren(statusText("Pulled the reviewed changes from GitHub."));
    } catch (error) {
      this.#elements.gitHubPullReview.replaceChildren(statusText(error instanceof Error ? error.message : "Could not pull from GitHub."));
    }
  }

  async #previewGitHubPublish(): Promise<void> {
    this.#gitHubPublishPreviewId = null;
    this.#elements.confirmGitHubPublish.disabled = true;
    this.#elements.gitHubPublishReview.replaceChildren(statusText("Comparing Kirjolab with GitHub…"));
    try {
      const response = await jsonFetch(`${apiBase}/github-sync/publish-previews`, {
        commitMessage: this.#elements.gitHubPublishMessage.value,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isGitHubPublishPreview(value)) throw new Error("GitHub returned an invalid publish preview");
      this.#gitHubPublishPreviewId = value.id;
      const summary = document.createElement("p");
      summary.className = "text-sm leading-6 text-app-text-soft";
      summary.textContent = value.plan.blocking.length
        ? `${value.plan.blocking.length} remote change or conflict must be pulled or resolved first.`
        : value.plan.changes.length
          ? `${value.plan.changes.length} tracked path changes will be committed to ${value.expectedRemoteHead.slice(0, 10)}.`
          : "No tracked changes to publish.";
      const list = document.createElement("ul");
      list.className = "mt-2 space-y-1 font-sans text-xs text-app-text-soft";
      for (const change of value.plan.changes) {
        const item = document.createElement("li");
        item.textContent = `${change.content === null ? "Delete" : "Update"} · ${change.path}`;
        list.append(item);
      }
      if (value.plan.skippedLocalPaths.length > 0) {
        const item = document.createElement("li");
        item.textContent = `Not tracked · ${value.plan.skippedLocalPaths.join(", ")}`;
        list.append(item);
      }
      this.#elements.gitHubPublishReview.replaceChildren(summary, list);
      this.#elements.confirmGitHubPublish.disabled = value.plan.blocking.length > 0 || value.plan.changes.length === 0;
    } catch (error) {
      this.#elements.gitHubPublishReview.replaceChildren(
        statusText(error instanceof Error ? error.message : "Could not preview GitHub publish."),
      );
    }
  }

  async #confirmGitHubPublish(): Promise<void> {
    if (!this.#gitHubPublishPreviewId) return;
    this.#elements.confirmGitHubPublish.disabled = true;
    try {
      const response = await jsonFetch(`${apiBase}/github-sync/publishes`, { previewId: this.#gitHubPublishPreviewId });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isUnknownRecord(value) || typeof value.commitSha !== "string") throw new Error("GitHub returned an invalid publish result");
      await this.#refreshGitHubSyncState();
      this.#elements.gitHubPublishReview.replaceChildren(statusText(`Published commit ${value.commitSha.slice(0, 10)}.`));
    } catch (error) {
      this.#elements.gitHubPublishReview.replaceChildren(
        statusText(error instanceof Error ? error.message : "Could not publish to GitHub."),
      );
    }
  }

  async #disconnectGitHub(): Promise<void> {
    if (!confirm("Disconnect this project from GitHub? Project files and the repository will not be deleted.")) return;
    const response = await fetch(`${apiBase}/github-sync`, { method: "DELETE", credentials: "same-origin" });
    await expectOk(response);
    await this.#refreshGitHubSyncState();
  }

  async #openNewWorkspace(): Promise<void> {
    this.#elements.newWorkspaceDialog.showModal();
    this.#elements.newWorkspaceTemplateId.value = "";
    this.#previewedProjectTemplateId = "builtin-guided";
    this.#elements.newWorkspaceSubmit.disabled = true;
    this.#elements.newWorkspaceTemplateStatus.textContent = "Loading starting points…";
    try {
      await this.#refreshProjectTemplates();
      this.#elements.newWorkspaceTemplateList.querySelector<HTMLButtonElement>("[data-template-id]")?.focus();
    } catch (error) {
      this.#elements.newWorkspaceTemplateStatus.textContent = error instanceof Error ? error.message : "Could not load project templates.";
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
    const visibleTemplates = this.#projectTemplates.filter((template) => !this.#hiddenProjectTemplateIds.has(template.id));
    const selected = this.#elements.newWorkspaceTemplateId.value;
    if (!visibleTemplates.some((template) => template.id === selected)) {
      this.#elements.newWorkspaceTemplateId.value = "";
      this.#elements.newWorkspaceSubmit.disabled = true;
    }
    if (!visibleTemplates.some((template) => template.id === this.#previewedProjectTemplateId)) {
      this.#previewedProjectTemplateId = visibleTemplates[0]?.id ?? "";
    }
    this.#elements.newWorkspaceTemplateList.replaceChildren();
    for (const source of ["built-in", "personal"] as const) {
      const templates = visibleTemplates.filter((template) => template.source === source);
      if (source === "personal" && templates.length === 0) continue;
      const group = document.createElement("section");
      group.className = "template-choice-group";
      const heading = document.createElement("h3");
      heading.className = "template-choice-group-title";
      heading.textContent = source === "built-in" ? "Built in" : "Your templates";
      group.append(heading);
      for (const template of templates) group.append(this.#templateChoice(template));
      this.#elements.newWorkspaceTemplateList.append(group);
    }
    this.#renderProjectTemplatePreview();
  }

  #templateChoice(template: ProjectTemplateSummary): HTMLElement {
    const row = document.createElement("div");
    row.className = "template-choice";
    row.dataset.selected = String(this.#elements.newWorkspaceTemplateId.value === template.id);
    const label = document.createElement("button");
    label.className = "template-choice-label";
    label.type = "button";
    label.dataset.templateId = template.id;
    label.setAttribute("aria-pressed", String(this.#elements.newWorkspaceTemplateId.value === template.id));
    label.addEventListener("click", () => this.#chooseProjectTemplate(template));
    const name = document.createElement("span");
    name.className = "template-choice-name";
    name.textContent = template.name;
    const description = document.createElement("span");
    description.className = "template-choice-description";
    description.textContent = template.description;
    label.append(name, description);
    row.append(label);
    if (template.source === "personal") {
      const remove = document.createElement("button");
      remove.className = "template-choice-remove";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.title = `Delete template ${template.name}`;
      remove.addEventListener("click", () => this.#deleteProjectTemplate(template));
      row.append(remove);
    }
    return row;
  }

  #renderProjectTemplatePreview(): void {
    const template = this.#projectTemplates.find((candidate) => candidate.id === this.#previewedProjectTemplateId);
    if (!template) {
      this.#elements.newWorkspaceTemplatePreview.innerHTML = '<div class="empty-state">No templates are available.</div>';
      return;
    }
    const preview = template.preview;
    const article = document.createElement("article");
    article.className = "template-preview-content";
    const header = document.createElement("header");
    header.innerHTML = `<p class="eyebrow">${template.source === "built-in" ? "Built-in template" : "Personal template"}</p><h3 class="template-preview-title"></h3><p class="template-preview-description"></p>`;
    header.querySelector<HTMLElement>(".template-preview-title")!.textContent = template.name;
    header.querySelector<HTMLElement>(".template-preview-description")!.textContent = template.description;
    const facts = document.createElement("div");
    facts.className = "template-preview-facts";
    facts.append(
      templateFact(`${preview.fileCount}`, preview.fileCount === 1 ? "Markdown file" : "Markdown files"),
      templateFact(`${preview.folderCount}`, preview.folderCount === 1 ? "folder" : "folders"),
      templateFact(preview.hasBibliography ? "Included" : "Empty", "bibliography"),
    );
    const structure = document.createElement("section");
    structure.className = "template-preview-section";
    const structureHeading = document.createElement("h4");
    structureHeading.textContent = "Starting structure";
    const paths = document.createElement("ul");
    paths.className = "template-preview-tree";
    for (const folder of preview.folders) paths.append(templatePath(folder, "folder"));
    for (const file of preview.files) paths.append(templatePath(file, "file"));
    const hiddenPaths = preview.fileCount + preview.folderCount - preview.files.length - preview.folders.length;
    if (hiddenPaths > 0) paths.append(templatePath(`+ ${hiddenPaths} more`, "more"));
    structure.append(structureHeading, paths);
    const publication = document.createElement("section");
    publication.className = "template-preview-section";
    publication.innerHTML = `<h4>Publication setup</h4><dl class="template-preview-settings"><div><dt>Format</dt><dd></dd></div><div><dt>Citations</dt><dd></dd></div><div><dt>Page</dt><dd></dd></div></dl>`;
    const values = publication.querySelectorAll<HTMLElement>("dd");
    values[0]!.textContent = humanizeTemplateValue(preview.submissionTemplate);
    values[1]!.textContent = `${preview.citationStyle.toUpperCase()} · ${preview.locale}`;
    values[2]!.textContent = preview.paperSize === "a4" ? "A4" : "US Letter";
    const selected = this.#elements.newWorkspaceTemplateId.value === template.id;
    const selection = document.createElement("p");
    selection.className = "template-preview-choose text-xs text-app-text-soft";
    selection.textContent = selected ? "Selected starting point" : "Choose a starting point from the template list.";
    article.append(header, facts, structure, publication, selection);
    this.#elements.newWorkspaceTemplatePreview.replaceChildren(article);
  }

  #chooseProjectTemplate(template: ProjectTemplateSummary): void {
    this.#previewedProjectTemplateId = template.id;
    this.#elements.newWorkspaceTemplateId.value = template.id;
    this.#elements.newWorkspaceSubmit.disabled = false;
    this.#elements.newWorkspaceTemplateStatus.textContent = `Using “${template.name}”. The new project will be an independent copy.`;
    for (const row of this.#elements.newWorkspaceTemplateList.querySelectorAll<HTMLElement>(".template-choice")) {
      row.dataset.selected = String(row.querySelector<HTMLElement>("[data-template-id]")?.dataset.templateId === template.id);
    }
    for (const button of this.#elements.newWorkspaceTemplateList.querySelectorAll<HTMLButtonElement>("[data-template-id]")) {
      button.setAttribute("aria-pressed", String(button.dataset.templateId === template.id));
    }
    this.#renderProjectTemplatePreview();
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
    this.#elements.workspaceSettingsDialog.close();
    this.#elements.saveTemplateDialog.showModal();
    this.#elements.saveTemplateStatus.textContent = "Loading personal templates…";
    try {
      await this.#refreshProjectTemplates();
      this.#elements.saveTemplateTarget.value = "";
      this.#elements.saveTemplateName.value = this.#elements.workspaceSettingsTitle.value;
      this.#elements.saveTemplateDescription.value = "";
      this.#elements.saveTemplateStatus.textContent = "Create a new template or explicitly replace one you already own.";
      this.#elements.saveTemplateName.focus();
    } catch (error) {
      this.#elements.saveTemplateStatus.textContent = error instanceof Error ? error.message : "Could not load personal templates.";
    }
  }

  #renderTemplateReplacementOptions(): void {
    const selected = this.#elements.saveTemplateTarget.value;
    this.#elements.saveTemplateTarget.replaceChildren(new Option("Create a new template", ""));
    const personalTemplates = this.#projectTemplates.filter(
      (candidate) => candidate.source === "personal" && !this.#hiddenProjectTemplateIds.has(candidate.id),
    );
    for (const template of personalTemplates) {
      this.#elements.saveTemplateTarget.append(new Option(`Replace ${template.name}`, template.id));
    }
    if (personalTemplates.some((template) => template.id === selected)) {
      this.#elements.saveTemplateTarget.value = selected;
    }
  }

  #selectTemplateReplacement(): void {
    const template = this.#projectTemplates.find((candidate) => candidate.id === this.#elements.saveTemplateTarget.value);
    if (!template || template.source !== "personal") return;
    this.#elements.saveTemplateName.value = template.name;
    this.#elements.saveTemplateDescription.value = template.description;
    this.#elements.saveTemplateStatus.textContent = `Replacing “${template.name}” affects only projects created from it in the future.`;
  }

  async #saveProjectTemplate(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const templateId = this.#elements.saveTemplateTarget.value;
    const response = await jsonFetch(`${apiBase}/template`, {
      name: this.#elements.saveTemplateName.value,
      description: this.#elements.saveTemplateDescription.value,
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

  async #saveWorkspaceSettings(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await expectOk(
      await jsonFetch(
        `${apiBase}/settings`,
        {
          title: this.#elements.workspaceSettingsTitle.value,
          entryFileId: this.#elements.workspaceEntryFile.value,
          publicationProfile: {
            citationStyle: this.#elements.workspaceCitationStyle.value,
            locale: this.#elements.workspaceCitationLocale.value,
            submissionTemplate: this.#elements.workspaceSubmissionTemplate.value,
            paperSize: this.#elements.workspacePaperSize.value,
          },
        },
        "PATCH",
      ),
    );
    const next = new URL(location.href);
    next.searchParams.set("file", this.#elements.workspaceEntryFile.value);
    location.assign(`${next.pathname}${next.search}${next.hash}`);
  }

  async #toggleWorkspaceArchive(): Promise<void> {
    const current = this.#workspaceCatalog.find((item) => item.id === workspaceId);
    await expectOk(await jsonFetch(`${apiBase}/settings`, { archived: !current?.archivedAt }, "PATCH"));
    this.#elements.workspaceSettingsDialog.close();
    await this.#refreshCatalog();
  }

  async #duplicateWorkspace(): Promise<void> {
    const title = prompt("Title for the duplicate", `${this.#elements.workspaceSettingsTitle.value} copy`)?.trim();
    if (!title) return;
    const response = await jsonFetch(`${apiBase}/duplicate`, { title });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isWorkspaceSummaries([value])) throw new Error("Project duplicate returned invalid data");
    location.assign((value as WorkspaceSummary).href);
  }

  async #deleteWorkspace(): Promise<void> {
    const confirmation = prompt(`Type DELETE to permanently remove “${this.#elements.workspaceSettingsTitle.value}” and its project PDFs.`);
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
      this.#elements.readOnlyShareStatus.textContent = "Only the project owner can manage read-only links.";
      this.#elements.createReadOnlyShare.hidden = true;
      return;
    }
    await expectOk(response);
    const status: unknown = await response.json();
    if (
      !isRecord(status) ||
      typeof status.active !== "boolean" ||
      (status.createdAt !== null && typeof status.createdAt !== "string") ||
      (status.href !== null && typeof status.href !== "string")
    ) {
      throw new Error("Read-only link status returned invalid data");
    }
    this.#setShareLink(this.#elements.readOnlyShareLink, this.#elements.readOnlyShareLinkRow, status.href);
    this.#elements.createReadOnlyShare.hidden = false;
    this.#elements.createReadOnlyShare.textContent = status.active ? "Replace link" : "Create link";
    this.#elements.revokeReadOnlyShare.classList.toggle("hidden", !status.active);
    this.#elements.readOnlyShareStatus.textContent = status.href
      ? "Anyone with this link can inspect the live manuscript and project source. You can copy it again at any time."
      : status.active
        ? "This older link remains active, but its secret cannot be recovered. Replace it once to make the new link available here."
        : "Create a bearer link for people who should inspect, but not edit, this project.";
  }

  async #createReadOnlyShare(): Promise<void> {
    const response = await fetch(`${apiBase}/share-link`, { method: "POST", credentials: "same-origin" });
    await expectOk(response);
    const share: unknown = await response.json();
    if (!isRecord(share) || typeof share.href !== "string") throw new Error("Read-only link returned invalid data");
    this.#elements.readOnlyShareLink.value = new URL(share.href, location.origin).href;
    this.#elements.readOnlyShareLinkRow.classList.remove("hidden");
    this.#elements.readOnlyShareLinkRow.classList.add("grid");
    await this.#refreshReadOnlyShare();
    this.#showToast("Read-only link created. You can return here to copy it again.");
  }

  async #copyReadOnlyShare(): Promise<void> {
    await navigator.clipboard.writeText(this.#elements.readOnlyShareLink.value);
    this.#showToast("Read-only link copied.");
  }

  async #revokeReadOnlyShare(): Promise<void> {
    await expectOk(await fetch(`${apiBase}/share-link`, { method: "DELETE", credentials: "same-origin" }));
    this.#setShareLink(this.#elements.readOnlyShareLink, this.#elements.readOnlyShareLinkRow, null);
    await this.#refreshReadOnlyShare();
    this.#showToast("Read-only link revoked.");
  }

  async #refreshEditShare(): Promise<void> {
    const response = await fetch(`${apiBase}/edit-link`, { credentials: "same-origin" });
    if (response.status === 403) {
      this.#elements.editShareStatus.textContent = "Only the project owner can manage edit links.";
      this.#elements.createEditShare.hidden = true;
      return;
    }
    await expectOk(response);
    const status: unknown = await response.json();
    if (
      !isRecord(status) ||
      typeof status.active !== "boolean" ||
      (status.createdAt !== null && typeof status.createdAt !== "string") ||
      (status.href !== null && typeof status.href !== "string")
    ) {
      throw new Error("Edit link status returned invalid data");
    }
    this.#setShareLink(this.#elements.editShareLink, this.#elements.editShareLinkRow, status.href);
    this.#elements.createEditShare.hidden = false;
    this.#elements.createEditShare.textContent = status.active ? "Replace link" : "Create link";
    this.#elements.revokeEditShare.classList.toggle("hidden", !status.active);
    this.#elements.editShareStatus.textContent = status.href
      ? "Anyone with this link can change authored project files. You can copy it again at any time."
      : status.active
        ? "This older link remains active, but its secret cannot be recovered. Replace it once to make the new link available here."
        : "Create a separate bearer link for someone who may edit authored Markdown without private project access.";
  }

  async #createEditShare(): Promise<void> {
    const response = await fetch(`${apiBase}/edit-link`, { method: "POST", credentials: "same-origin" });
    await expectOk(response);
    const share: unknown = await response.json();
    if (!isRecord(share) || typeof share.href !== "string") throw new Error("Edit link returned invalid data");
    this.#elements.editShareLink.value = new URL(share.href, location.origin).href;
    this.#elements.editShareLinkRow.classList.remove("hidden");
    this.#elements.editShareLinkRow.classList.add("grid");
    await this.#refreshEditShare();
    this.#showToast("Edit link created. You can return here to copy it again.");
  }

  async #copyEditShare(): Promise<void> {
    await navigator.clipboard.writeText(this.#elements.editShareLink.value);
    this.#showToast("Edit link copied.");
  }

  async #revokeEditShare(): Promise<void> {
    await expectOk(await fetch(`${apiBase}/edit-link`, { method: "DELETE", credentials: "same-origin" }));
    this.#setShareLink(this.#elements.editShareLink, this.#elements.editShareLinkRow, null);
    await this.#refreshEditShare();
    this.#showToast("Edit link revoked.");
  }

  #setShareLink(input: HTMLInputElement, row: HTMLElement, href: string | null): void {
    input.value = href ? new URL(href, location.origin).href : "";
    row.classList.toggle("hidden", !href);
    row.classList.toggle("grid", Boolean(href));
  }

  async #refreshMembers(): Promise<void> {
    const response = await fetch(`${apiBase}/members`, { credentials: "same-origin" });
    await expectOk(response);
    const members: unknown = await response.json();
    if (!isWorkspaceMembers(members)) throw new Error("Project members returned invalid data");
    this.#renderMembers(members);
  }

  #renderMembers(members: WorkspaceMember[]): void {
    this.#elements.workspaceMemberList.replaceChildren();
    for (const member of members) {
      const row = document.createElement("div");
      row.className = "resource-card flex items-center justify-between gap-3 font-sans text-xs";
      const email = document.createElement("span");
      email.className = "truncate";
      email.textContent = member.email;
      row.append(email, resourceLabel(member.role));
      this.#elements.workspaceMemberList.append(row);
    }
  }

  async #inviteMember(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const response = await jsonFetch(`${apiBase}/members`, { email: this.#elements.inviteMemberEmail.value });
    await expectOk(response);
    this.#elements.inviteMemberEmail.value = "";
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
      const selections = this.#captureEditorSelections();
      if (collaborationSynced(this.#collaborationWorkflow.getSnapshot())) {
        this.#collaborationWorkflow.send({ type: "REMOTE_UPDATE" });
      }
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
      return;
    }

    const value = parseServerCollaborationMessage(message);
    if (!value) {
      socket.close(1002, "Invalid collaboration control");
      return;
    }
    switch (value.type) {
      case "sync":
        if (collaborationSynced(this.#collaborationWorkflow.getSnapshot())) {
          socket.close(1002, "Duplicate collaboration sync");
          return;
        }
        this.#collaborationWorkflow.send({ type: "SYNC" });
        if (this.#serverDocument) this.#serverStateVector = Y.encodeStateVector(this.#serverDocument);
        this.#setRevision(value.revision);
        this.#elements.saveStatus.textContent = this.#pendingUpdates.size === 0 ? "Saved" : "Saving…";
        this.#scheduleOfflineSave();
        this.#flushPendingUpdates();
        break;
      case "ack":
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
        this.#setRevision(value.revision);
        this.#elements.saveStatus.textContent = this.#pendingUpdates.size === 0 ? "Saved" : "Saving…";
        this.#scheduleOfflineSave();
        this.#flushPendingUpdates();
        break;
      case "revision":
        this.#collaborationWorkflow.send({ type: "REVISION" });
        this.#setRevision(value.revision);
        break;
      case "reset":
        this.#collaborationWorkflow.send({ type: "RESET" });
        void Promise.resolve(this.#offlineStore?.clear()).finally(() => window.location.reload());
        return;
      case "presence":
        this.#collaborationWorkflow.send({ type: "PRESENCE", collaborators: value.collaborators });
        break;
      case "selection":
        if (value.revision === this.#revision) this.#remoteSelections.set(value.collaboratorId, value);
        this.#renderRemoteSelections();
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
    this.#renderCollaborationWorkflow();
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
    this.#elements.generateCandidate.disabled =
      this.#modelDiscoveryBusy || assistantWorkflowBusy(assistant) || (!this.#draftsClaim() && !stable) || !this.#canGenerateCandidate();
    for (const apply of document.querySelectorAll<HTMLButtonElement>('[data-candidate-action="apply"]')) {
      const candidate = this.#snapshot?.candidates.find((item) => item.id === apply.dataset.candidateId);
      const applicable = candidate ? this.#candidateApplicable(candidate) : false;
      apply.dataset.candidateApplicable = String(applicable);
      apply.disabled = assistant.context.candidateDecision !== null || (candidate?.operation !== "draft-claim" && !stable) || !applicable;
    }
  }

  #canGenerateCandidate(): boolean {
    const operation = assistantOperationDefinition(this.#elements.modelOperation.value);
    if (!operation.enabled) return false;
    const selectedEvidence = this.#modelEvidence();
    const evidenceValid =
      operation.evidence === "none" ||
      operation.evidence === "optional" ||
      (operation.evidence === "annotations"
        ? selectedEvidence.items.some((item) => item.kind === "annotation")
        : selectedEvidence.items.length > 0);
    const targetValid = operation.id !== "build-table" || (this.#assistantInsertionTarget() !== null && this.#validTableRequirements());
    return (
      evidenceValid &&
      this.#modelEvidenceSelection.size <= maximumModelEvidenceItems &&
      Boolean(this.#elements.llmModel.value.trim()) &&
      (operation.id === "build-table"
        ? targetValid
        : this.#draftsClaim()
          ? selectedEvidence.items.some((item) => item.kind === "annotation")
          : this.#assistantAuthoringPassage() !== null) &&
      Boolean(this.#elements.modelInstruction.value.trim())
    );
  }

  #draftsClaim(): boolean {
    return this.#elements.modelOperation.value === "draft-claim";
  }

  #renderModelOperationOptions(): void {
    const current = this.#elements.modelOperation.value;
    this.#elements.modelOperation.replaceChildren(
      ...assistantOperationDefinitions().map((definition) => {
        const option = document.createElement("option");
        option.value = definition.id;
        option.textContent = definition.enabled ? definition.label : `${definition.label} · coming next`;
        option.disabled = !definition.enabled;
        return option;
      }),
    );
    this.#elements.modelOperation.value = assistantOperationDefinition(current).id;
  }

  #renderPhrasingPurposeOptions(): void {
    this.#elements.assistantPhrasingPurpose.replaceChildren(
      ...phrasingPurposes().map((purpose) => {
        const option = document.createElement("option");
        option.value = purpose.id;
        option.textContent = purpose.label;
        return option;
      }),
    );
  }

  #updateModelTask(resetInstruction = false): void {
    const operation = assistantOperationDefinition(this.#elements.modelOperation.value);
    const draftsClaim = operation.id === "draft-claim";
    const phrasesPassage = operation.id === "phrase-passage";
    this.#elements.modelClaimRelationField.hidden = !draftsClaim;
    this.#elements.assistantPhrasingPurposeField.hidden = !phrasesPassage;
    this.#elements.assistantPhrasingAttribution.hidden = !phrasesPassage;
    this.#elements.assistantTableFields.hidden = operation.id !== "build-table";
    this.#elements.assistantTargetScopeField.hidden = operation.scopes.length === 0;
    const currentScope = this.#elements.assistantTargetScope.value;
    this.#elements.assistantTargetScope.replaceChildren(
      ...operation.scopes.map((scope) => {
        const option = document.createElement("option");
        option.value = scope;
        option.textContent = assistantTargetScopeLabel(scope);
        return option;
      }),
    );
    const scope = operation.scopes.includes(currentScope as AssistantTargetScope) ? currentScope : operation.defaultScope;
    if (scope) this.#elements.assistantTargetScope.value = scope;
    this.#elements.assistantOperationEyebrow.textContent = operation.eyebrow;
    this.#elements.assistantOperationTitle.textContent = operation.title;
    this.#elements.assistantOperationDescription.textContent = operation.description;
    this.#elements.modelInstructionLabel.textContent = operation.instructionLabel;
    this.#elements.generateCandidate.textContent = operation.actionLabel;
    if (resetInstruction) this.#elements.modelInstruction.value = operation.defaultInstruction;
    if (resetInstruction) this.#elements.assistantInteractiveResult.replaceChildren();
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
      this.#elements.assistantTargetPreview.textContent =
        "This operation uses selected annotation snapshots rather than a manuscript target.";
      return;
    }
    if (assistantOperationDefinition(this.#elements.modelOperation.value).id === "build-table") {
      const target = this.#assistantInsertionTarget();
      this.#elements.assistantTargetPreview.textContent = target
        ? target.start === target.end
          ? "The reviewed table syntax will be inserted at the visible caret."
          : `The reviewed table syntax will replace ${target.end - target.start} selected characters.`
        : "Place the caret where the table should be inserted, or select text to replace.";
      return;
    }
    const passage = this.#assistantAuthoringPassage();
    if (!passage) {
      this.#elements.assistantTargetPreview.textContent = "Place the caret in manuscript text or select the exact passage to target.";
      return;
    }
    const target = this.#resolvedAuthoringTarget();
    const scope = target && target.start !== target.end ? "selection" : this.#assistantTargetScope();
    const excerpt = passage.excerpt.replace(/\s+/gu, " ").trim();
    this.#elements.assistantTargetPreview.textContent = `${assistantTargetScopeLabel(scope)} · “${excerpt.slice(0, 180)}${excerpt.length > 180 ? "…" : ""}”`;
  }

  #restoreModelPreferences(): void {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(modelPreferencesStorageKey) ?? "null");
      if (!isRecord(stored)) return;
      if (stored.connection === "direct" || stored.connection === "companion") this.#elements.llmConnection.value = stored.connection;
      if (typeof stored.endpoint === "string" && stored.endpoint.length <= 2_048) this.#elements.llmEndpoint.value = stored.endpoint;
      if (typeof stored.model === "string" && stored.model.length <= 256) this.#setLlmModelOptions([], stored.model);
      if (typeof stored.reasoningEffort === "string") {
        this.#elements.llmReasoningEffort.value = readModelReasoningEffort(stored.reasoningEffort);
      }
    } catch {
      localStorage.removeItem(modelPreferencesStorageKey);
    }
  }

  #saveModelPreferences(): void {
    localStorage.setItem(
      modelPreferencesStorageKey,
      JSON.stringify({
        connection: this.#elements.llmConnection.value,
        endpoint: this.#elements.llmEndpoint.value,
        model: this.#elements.llmModel.value,
        reasoningEffort: readModelReasoningEffort(this.#elements.llmReasoningEffort.value),
      }),
    );
  }

  #modelProvider(): OpenAICompatibleBrowserProvider {
    return new OpenAICompatibleBrowserProvider({
      endpoint: this.#elements.llmEndpoint.value,
      providerLabel:
        this.#elements.llmConnection.value === "companion" ? "Local companion · OpenAI-compatible" : "Browser-local OpenAI-compatible",
      model: this.#elements.llmModel.value,
      reasoningEffort: readModelReasoningEffort(this.#elements.llmReasoningEffort.value),
    });
  }

  #setLlmModelOptions(models: readonly string[], selectedModel: string): void {
    const selected = selectedModel.trim();
    const available = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
    const optionModels = available.length === 0 && selected ? [selected] : available;
    if (optionModels.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Find loaded models";
      this.#elements.llmModel.replaceChildren(option);
      return;
    }
    this.#elements.llmModel.replaceChildren(
      ...optionModels.map((model) => {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = available.length === 0 ? `${model} · saved` : model;
        return option;
      }),
    );
    this.#elements.llmModel.value = optionModels.includes(selected) ? selected : (optionModels[0] ?? "");
  }

  async #discoverLlmModels(): Promise<void> {
    if (this.#modelDiscoveryBusy || assistantWorkflowBusy(this.#assistantWorkflow.getSnapshot())) return;
    this.#modelDiscoveryBusy = true;
    this.#elements.discoverLlmModels.disabled = true;
    this.#updateModelAvailability();
    this.#elements.modelStatus.textContent = "Checking the local provider for loaded models…";
    this.#elements.preferencesModelStatus.textContent = this.#elements.modelStatus.textContent;
    try {
      const models = await discoverOpenAICompatibleModels(this.#elements.llmEndpoint.value);
      const selectedModel = this.#elements.llmModel.value.trim();
      this.#setLlmModelOptions(models, models.includes(selectedModel) ? selectedModel : (models[0] ?? selectedModel));
      this.#elements.modelStatus.textContent = models.length
        ? `Found ${models.length} loaded model${models.length === 1 ? "" : "s"}. Using ${this.#elements.llmModel.value}.`
        : "The local provider is reachable but reports no loaded models.";
      this.#elements.preferencesModelStatus.textContent = this.#elements.modelStatus.textContent;
      this.#saveModelPreferences();
    } catch (error) {
      this.#elements.modelStatus.textContent =
        error instanceof Error ? error.message : "Could not discover models from the local provider.";
      this.#elements.preferencesModelStatus.textContent = this.#elements.modelStatus.textContent;
    } finally {
      this.#modelDiscoveryBusy = false;
      this.#elements.discoverLlmModels.disabled = false;
      this.#updateModelAvailability();
    }
  }

  async #renderPreview(bibliography = this.#bibliography.toString()): Promise<void> {
    const renderVersion = ++this.#previewRenderVersion;
    const files = this.#previewProjectFiles();
    const publicationComposition = this.#snapshot
      ? composeProject(files, this.#snapshot.entryFileId, {}, this.#snapshot.reviewArtifactPins)
      : null;
    const filePreview = this.#snapshot
      ? previewProjectFile(files, this.#snapshot.entryFileId, this.#activeFileId, this.#snapshot.reviewArtifactPins)
      : null;
    const renderedSource = filePreview?.content ?? this.#source.toString();
    this.#renderManuscriptMap(publicationComposition?.content ?? renderedSource);
    this.#elements.previewFileContext.textContent = filePreview
      ? `${filePreview.path} · ${filePreview.mode === "composed" ? "composed paper" : "isolated file"}`
      : "Preview";
    this.#elements.previewFileContext.title = this.#elements.previewFileContext.textContent;
    if (publicationComposition && this.#snapshot) {
      this.#wordStatistics = publicationWordStatistics(publicationComposition, files);
      this.#renderExportStatistics();
    }
    let runtime;
    try {
      runtime = await loadMarkdownRuntime();
    } catch (error) {
      if (renderVersion !== this.#previewRenderVersion) return;
      this.#elements.preview.textContent = renderedSource;
      this.#elements.diagnostics.replaceChildren();
      this.#elements.diagnosticSummary.textContent = "Preview unavailable";
      const item = document.createElement("p");
      item.className = "resource-card mb-2 font-sans text-xs";
      item.textContent = error instanceof Error ? error.message : "The Markdown renderer could not be loaded";
      this.#elements.diagnostics.append(item);
      return;
    }
    if (renderVersion !== this.#previewRenderVersion) return;
    const headingNumbers: Record<number, string> = {};
    if (filePreview?.mode === "isolated" && publicationComposition) {
      for (const [outputOffset, number] of Object.entries(runtime.headingNumbersByOffset(publicationComposition.content))) {
        const span = sourceSpanAt(publicationComposition.sourceMap, Number(outputOffset));
        if (!span || span.fileId !== filePreview.fileId) continue;
        const sourceOffset = span.sourceStart + Number(outputOffset) - span.outputStart;
        headingNumbers[sourceOffset] ??= number;
      }
    }
    const rendered = runtime.renderWorkspaceMarkdown(renderedSource, bibliography, this.#snapshot?.publicationProfile.citationStyle, {
      headingNumbers,
    });
    this.#elements.preview.innerHTML = rendered.html;
    this.#previewSourceMap = filePreview?.sourceMap ?? [];
    this.#resolveProjectPreviewImages(renderedSource, filePreview?.sourceMap ?? []);
    this.#elements.diagnostics.replaceChildren();
    const diagnosticCount = rendered.diagnostics.length + (filePreview?.diagnostics.length ?? 0);
    this.#elements.diagnosticSummary.textContent =
      diagnosticCount === 0 ? "No syntax errors" : `${diagnosticCount} ${diagnosticCount === 1 ? "issue" : "issues"}`;
    for (const diagnostic of filePreview?.diagnostics ?? []) {
      this.#appendProjectDiagnostic(diagnostic.message, diagnostic.fileId, diagnostic.from, diagnostic.to);
    }
    for (const diagnostic of rendered.diagnostics) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "resource-card mb-2 block w-full text-left font-sans text-xs";
      item.textContent = diagnostic.message;
      item.addEventListener("click", () => {
        const span = filePreview ? sourceSpanAt(filePreview.sourceMap, diagnostic.from) : undefined;
        if (span)
          this.#focusProjectRange(
            span.fileId,
            span.sourceStart,
            Math.min(span.sourceEnd, span.sourceStart + diagnostic.to - diagnostic.from),
          );
        else this.#focusProjectRange(filePreview?.fileId ?? this.#snapshot?.entryFileId ?? "", diagnostic.from, diagnostic.to);
      });
      this.#elements.diagnostics.append(item);
    }
    if (this.#snapshot) {
      const links = this.#snapshot.links.map((link) => ({
        ...link,
        resolution: resolveManuscriptAnchor(this.#document, link.anchor),
      }));
      const claimLinks = this.#snapshot.claimLinks.map((link) => ({
        ...link,
        resolution: resolveManuscriptAnchor(this.#document, link.anchor),
      }));
      this.#updateAnchorActions([...links, ...claimLinks]);
      this.#renderManuscriptComments(
        this.#snapshot.comments.map((comment) => ({
          ...comment,
          resolution: resolveManuscriptAnchor(this.#document, comment.anchor),
        })),
      );
      this.#renderKnowledgeGraph(
        buildWorkspaceKnowledgeGraph({
          ...this.#snapshot,
          source: publicationComposition?.content ?? this.#snapshot.composition.content,
          bibliography,
          links,
          claimLinks,
        }),
      );
    }
  }

  #renderManuscriptMap(source = this.#currentComposedSource()): void {
    const map = buildManuscriptMap(source);
    this.#elements.manuscriptMapSummary.replaceChildren(
      manuscriptMapMetric(map.words, "words"),
      manuscriptMapMetric(map.sections.length, "sections"),
      manuscriptMapMetric(map.citations, "citations"),
    );
    this.#elements.manuscriptMapOutline.replaceChildren();
    if (map.sections.length === 0) this.#elements.manuscriptMapOutline.append(emptyState("Add headings to build the manuscript map."));
    for (const section of map.sections) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "manuscript-map-item";
      button.style.paddingInlineStart = `${0.6 + Math.max(0, section.level - 1) * 0.55}rem`;
      const title = document.createElement("span");
      title.textContent = section.title;
      const meta = document.createElement("small");
      meta.textContent = `${section.words}w · ${section.citations}c`;
      button.append(title, meta);
      button.addEventListener("click", () => this.#focusComposedRange(section.from, section.to));
      this.#elements.manuscriptMapOutline.append(button);
    }
    this.#elements.manuscriptMapCueCount.textContent = String(map.cues.length);
    this.#elements.manuscriptMapCues.replaceChildren();
    if (map.cues.length === 0) this.#elements.manuscriptMapCues.append(emptyState("No structural review cues."));
    for (const cue of map.cues) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "manuscript-map-item";
      const message = document.createElement("span");
      message.textContent = cue.message;
      const kind = document.createElement("small");
      kind.textContent = cue.kind.replaceAll("-", " ");
      button.append(message, kind);
      button.addEventListener("click", () => this.#focusComposedRange(cue.from, cue.to));
      this.#elements.manuscriptMapCues.append(button);
    }
    this.#renderResearchDiarySummary();
    this.#renderResearchQuestions();
    this.#renderEditingPass(source);
    this.#renderReviewerResponses();
  }

  #renderReviewerResponses(): void {
    const file = this.#previewProjectFiles().find((candidate) => candidate.path === reviewerResponsePath);
    const responses = file ? parseReviewerResponses(file.content) : [];
    this.#elements.openReviewerResponse.textContent = file ? "Open matrix" : "Start matrix";
    this.#elements.downloadReviewerResponse.disabled = !file || responses.length === 0;
    this.#elements.reviewerResponseCount.textContent = String(responses.length);
    this.#elements.reviewerResponseList.replaceChildren();
    if (!file) {
      this.#elements.reviewerResponseList.append(emptyState("Track external review feedback separately from collaborator comments."));
      return;
    }
    if (responses.length === 0) this.#elements.reviewerResponseList.append(emptyState("Add an ## R1.1: … heading to the matrix."));
    for (const response of responses) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "manuscript-map-item";
      const label = document.createElement("span");
      const id = document.createElement("strong");
      id.textContent = `${response.id} · `;
      label.append(id, response.summary);
      const meta = document.createElement("small");
      meta.textContent = `${response.status} · ${response.manuscriptLinks.length} links`;
      button.append(label, meta);
      button.addEventListener("click", () => this.#focusProjectRange(file.id, response.from, response.to));
      this.#elements.reviewerResponseList.append(button);
    }
  }

  #renderEditingPass(source: string): void {
    const pass = readEditingPass(this.#elements.editingPass.value);
    const cues = runEditingPass(source, pass);
    this.#elements.editingPassCueCount.textContent = String(cues.length);
    this.#elements.editingPassCues.replaceChildren();
    if (cues.length === 0) this.#elements.editingPassCues.append(emptyState(`No ${pass} cues.`));
    for (const cue of cues) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "manuscript-map-item";
      const message = document.createElement("span");
      message.textContent = cue.message;
      const detail = document.createElement("small");
      detail.textContent = cue.detail;
      button.append(message, detail);
      button.addEventListener("click", () => this.#focusComposedRange(cue.from, cue.to));
      this.#elements.editingPassCues.append(button);
    }
  }

  #currentComposedSource(): string {
    return this.#snapshot
      ? composeProject(this.#previewProjectFiles(), this.#snapshot.entryFileId, {}, this.#snapshot.reviewArtifactPins).content
      : this.#source.toString();
  }

  #renderResearchQuestions(): void {
    const file = this.#previewProjectFiles().find((candidate) => candidate.path === researchQuestionsPath);
    this.#elements.openResearchQuestions.textContent = file ? "Open question ledger" : "Start question ledger";
    const questions = file ? parseResearchQuestions(file.content) : [];
    this.#elements.researchQuestionCount.textContent = String(questions.length);
    this.#elements.researchQuestionList.replaceChildren();
    if (!file) {
      this.#elements.researchQuestionList.append(emptyState("Record the study's questions, methods, and manuscript coverage."));
      return;
    }
    if (questions.length === 0) this.#elements.researchQuestionList.append(emptyState("Add an ## RQ1: … heading to the ledger."));
    for (const question of questions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "manuscript-map-item";
      const label = document.createElement("span");
      const id = document.createElement("strong");
      id.textContent = `${question.id} · `;
      label.append(id, question.question);
      const meta = document.createElement("small");
      meta.textContent = `${question.status} · ${question.sections.length}s · ${question.claims.length}c`;
      button.append(label, meta);
      button.addEventListener("click", () => this.#focusProjectRange(file.id, question.from, question.to));
      this.#elements.researchQuestionList.append(button);
    }
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
    if (!explicit && !this.#automaticPreviewSyncAvailable()) return;
    if (this.#contextState.activeKey !== RESEARCH_PREVIEW_KEY) return;
    const fileId = this.#activeFileId ?? this.#snapshot?.entryFileId ?? "";
    const sourceOffset = explicit ? this.#sourceOffsetAtEditorCenter() : this.#elements.source.selectionEnd;
    const offsets = previewOffsetsForSourceLocation(this.#previewSourceMap, fileId, sourceOffset);
    if (offsets.length === 0) return;
    const target = this.#nearestPreviewSourceElement(offsets);
    if (!target) return;
    const previewBounds = this.#elements.previewScroll.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    this.#elements.previewScroll.scrollTop += targetBounds.top + targetBounds.height / 2 - (previewBounds.top + previewBounds.height / 2);
    this.#markPreviewSyncTarget(target);
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
    if (!this.#activeFileId || !snapshot.files.some((file) => file.id === this.#activeFileId)) {
      this.#activeFileId = snapshot.entryFileId;
      const entry = snapshot.files.find((file) => file.id === snapshot.entryFileId);
      this.#activeFileText = entry ? this.#document.getText(projectFileCollaborationTextName(entry, snapshot.entryFileId)) : this.#source;
    }
    this.#elements.projectFileList.replaceChildren();
    this.#elements.includeProjectFileList.replaceChildren();
    const items = [
      ...snapshot.folders
        .filter((folder) => !this.#hiddenProjectFolderIds.has(folder.id))
        .map((folder) => ({ kind: "folder" as const, path: folder.path, folder })),
      ...snapshot.files
        .filter((file) => !this.#hiddenProjectFileIds.has(file.id))
        .map((file) => ({ kind: "file" as const, path: file.path, file })),
      ...snapshot.assets
        .filter((asset) => !this.#hiddenProjectImageIds.has(asset.id))
        .map((asset) => ({ kind: "asset" as const, path: asset.path, asset })),
    ].sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind));
    for (const item of items) {
      const depth = item.path.split("/").length - 1;
      if (item.kind === "folder") {
        const row = document.createElement("div");
        row.className = "project-folder-row";
        row.style.paddingInlineStart = `${0.55 + depth * 0.75}rem`;
        const label = document.createElement("span");
        label.className = "min-w-0 truncate";
        label.textContent = `${item.path.split("/").at(-1)}/`;
        const actions = document.createElement("details");
        actions.className = "action-menu project-tree-actions";
        const summary = document.createElement("summary");
        summary.setAttribute("aria-label", `Actions for ${item.path}`);
        summary.textContent = "•••";
        const menu = document.createElement("div");
        menu.className = "editor-command-menu";
        const rename = document.createElement("button");
        rename.type = "button";
        rename.textContent = "Move or rename";
        rename.addEventListener("click", () => this.#openProjectFileDialog("rename-folder", item.folder.id));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Delete empty folder";
        remove.addEventListener("click", () => this.#deleteProjectFolder(item.folder.id));
        menu.append(rename, remove);
        actions.append(summary, menu);
        row.append(label, actions);
        this.#elements.projectFileList.append(row);
        continue;
      }
      if (item.kind === "asset") {
        const asset = item.asset;
        const row = document.createElement("div");
        row.className = "project-file-row project-asset-row";
        row.style.paddingInlineStart = `${0.55 + depth * 0.75}rem`;
        const preview = document.createElement("img");
        preview.className = "project-asset-thumbnail";
        preview.src = `${apiBase}/assets/${encodeURIComponent(asset.id)}`;
        preview.alt = "";
        const label = document.createElement("span");
        label.className = "min-w-0 flex-1 truncate";
        label.textContent = asset.path.split("/").at(-1) ?? asset.path;
        const actions = document.createElement("details");
        actions.className = "action-menu project-tree-actions";
        const summary = document.createElement("summary");
        summary.setAttribute("aria-label", `Actions for ${asset.path}`);
        summary.textContent = "•••";
        const menu = document.createElement("div");
        menu.className = "editor-command-menu";
        const insert = document.createElement("button");
        insert.type = "button";
        insert.textContent = "Insert image";
        insert.addEventListener("click", () => this.#insertProjectImage(asset));
        const open = document.createElement("a");
        open.href = `${apiBase}/assets/${encodeURIComponent(asset.id)}`;
        open.target = "_blank";
        open.rel = "noopener";
        open.textContent = "Open image";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Delete image";
        remove.addEventListener("click", () => this.#deleteProjectImage(asset));
        menu.append(insert, open, remove);
        actions.append(summary, menu);
        row.append(preview, label, actions);
        this.#elements.projectFileList.append(row);
        continue;
      }
      const file = item.file;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "project-file-row";
      button.style.paddingInlineStart = `${0.55 + depth * 0.75}rem`;
      button.dataset.active = String(file.id === this.#activeFileId);
      button.setAttribute("aria-current", file.id === this.#activeFileId ? "page" : "false");
      const path = document.createElement("span");
      path.className = "truncate";
      path.textContent = file.path.split("/").at(-1) ?? file.path;
      button.append(path);
      if (file.id === snapshot.entryFileId) {
        const kind = document.createElement("span");
        kind.className = "project-file-kind";
        kind.textContent = "entry";
        button.append(kind);
      }
      button.addEventListener("click", () => this.#selectProjectFile(file.id));
      this.#elements.projectFileList.append(button);
      if (file.id !== this.#activeFileId) {
        const include = document.createElement("button");
        include.type = "button";
        include.dataset.includeFileId = file.id;
        const label = document.createElement("strong");
        label.textContent = file.path;
        label.title = file.path;
        const syntax = document.createElement("code");
        const activeFile = snapshot.files.find((item) => item.id === this.#activeFileId);
        const relativePath = activeFile ? relativeProjectPath(activeFile.path, file.path) : file.path;
        syntax.textContent = "::include[…]";
        include.title = `Insert ::include[${relativePath}]`;
        include.append(label, syntax);
        this.#elements.includeProjectFileList.append(include);
      }
    }
    if (!this.#elements.includeProjectFileList.hasChildNodes()) {
      const empty = document.createElement("span");
      empty.className = "block px-3 py-2 text-xs text-app-text-soft";
      empty.textContent = "Add another file to include it here.";
      this.#elements.includeProjectFileList.append(empty);
    }
    const entryActive = this.#activeFileId === snapshot.entryFileId;
    this.#elements.renameProjectFile.disabled = false;
    this.#elements.deleteProjectFile.disabled = entryActive;
    this.#renderAuthoringTarget();
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

  #openProjectFileDialog(mode: "create" | "create-and-include" | "rename" | "create-folder" | "rename-folder", folderId?: string): void {
    const file = this.#snapshot?.files.find((item) => item.id === this.#activeFileId);
    const folder = this.#snapshot?.folders.find((item) => item.id === folderId);
    if (mode === "rename" && !file) return;
    if (mode === "rename-folder" && !folder) return;
    this.#projectFileDialogMode = mode;
    this.#projectFolderId = folder?.id ?? null;
    this.#projectFileIncludeTarget =
      mode === "create-and-include" ? captureRelativeSelection(this.#elements.source, this.#activeFileText) : null;
    this.#projectFileIncludeFromPath = mode === "create-and-include" ? (file?.path ?? null) : null;
    const folderMode = mode === "create-folder" || mode === "rename-folder";
    this.#elements.projectFileDialogTitle.textContent =
      mode === "create"
        ? "Add Markdown file"
        : mode === "create-and-include"
          ? "Create and include file"
          : mode === "rename"
            ? "Move or rename file"
            : mode === "create-folder"
              ? "Add folder"
              : "Move or rename folder";
    this.#elements.projectFileDialogHelp.textContent = folderMode
      ? "Use a relative path. Moving a folder also moves its files and keeps includes valid."
      : mode === "rename"
        ? "Change the folder or filename by editing this relative path. Inbound includes stay valid."
        : "Compose this file from the project entry with ::include[path].";
    this.#elements.saveProjectFile.textContent = folderMode ? "Save folder" : "Save file";
    this.#elements.projectFilePath.placeholder = folderMode ? "chapters" : "chapters/01_introduction.md";
    this.#elements.projectFilePath.value = mode === "rename" ? (file?.path ?? "") : mode === "rename-folder" ? (folder?.path ?? "") : "";
    this.#elements.projectFileDialog.showModal();
    this.#elements.projectFilePath.focus();
  }

  async #saveProjectFile(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const path = this.#elements.projectFilePath.value.trim();
    const activeId = this.#activeFileId;
    const folderMode = this.#projectFileDialogMode === "create-folder" || this.#projectFileDialogMode === "rename-folder";
    const creating =
      this.#projectFileDialogMode === "create" ||
      this.#projectFileDialogMode === "create-and-include" ||
      this.#projectFileDialogMode === "create-folder";
    const targetId = folderMode ? this.#projectFolderId : activeId;
    if (!creating && !targetId) return;
    const resource = folderMode ? "folders" : "files";
    const response = await jsonFetch(
      creating ? `${apiBase}/${resource}` : `${apiBase}/${resource}/${encodeURIComponent(targetId ?? "")}`,
      { path },
      creating ? "POST" : "PATCH",
    );
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error("Project file operation returned an invalid workspace");
    this.#snapshot = value;
    this.#elements.projectFileDialog.close();
    this.#renderProjectFiles();
    const selected = value.files.find((file) => file.path === path);
    if (this.#projectFileDialogMode === "create-and-include" && this.#projectFileIncludeTarget && this.#projectFileIncludeFromPath) {
      const position = Y.createAbsolutePositionFromRelativePosition(this.#projectFileIncludeTarget.end, this.#document);
      if (position?.type === this.#projectFileIncludeTarget.text) {
        this.#insertProjectInclude(
          this.#projectFileIncludeTarget.text,
          position.index,
          relativeProjectPath(this.#projectFileIncludeFromPath, path),
        );
      }
    } else if (selected) {
      this.#selectProjectFile(selected.id);
    }
    void this.#renderPreview();
    this.#showToast(
      folderMode
        ? creating
          ? `Added ${path}.`
          : `Moved folder to ${path}; project paths and includes were updated.`
        : this.#projectFileDialogMode === "create-and-include"
          ? `Created ${path} and included it at the remembered caret.`
          : creating
            ? `Added ${path}.`
            : `Renamed file to ${path}; inbound includes were updated.`,
    );
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
    images.forEach((image, index) => {
      const match = matches[index];
      const requested = match?.groups?.path?.replace(/^<|>$/gu, "");
      if (!requested || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/iu.test(requested)) return;
      const span = sourceMap.length > 0 && match?.index !== undefined ? sourceSpanAt(sourceMap, match.index) : undefined;
      const fromPath = span?.path ?? snapshot.files.find((file) => file.id === snapshot.entryFileId)?.path ?? "";
      const path = resolveProjectPath(fromPath, requested);
      const asset = snapshot.assets.find((candidate) => candidate.path === path && !this.#hiddenProjectImageIds.has(candidate.id));
      if (asset) image.src = `${apiBase}/assets/${encodeURIComponent(asset.id)}`;
    });
  }

  async #openProjectHistory(): Promise<void> {
    this.#projectHistoryWorkflow.send({ type: "OPEN" });
    const requestId = this.#projectHistoryWorkflow.getSnapshot().context.requestId;
    if (!this.#elements.projectHistoryDialog.open) this.#elements.projectHistoryDialog.showModal();
    this.#elements.projectHistoryList.replaceChildren(statusText("Loading revision history…"));
    this.#updateProjectHistoryAvailability();
    try {
      const response = await fetch(`${apiBase}/history`, { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isProjectRevisionSummaries(value)) throw new Error("Project history returned an invalid timeline");
      this.#projectHistoryWorkflow.send({ type: "TIMELINE_READY", requestId });
      const history = this.#projectHistoryWorkflow.getSnapshot();
      if (!history.matches("ready") || history.context.requestId !== requestId) return;
      this.#projectHistory = value;
      this.#renderProjectHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load project history";
      this.#projectHistoryWorkflow.send({ type: "TIMELINE_FAILED", requestId, message });
      if (this.#projectHistoryWorkflow.getSnapshot().matches("failed")) {
        this.#elements.projectHistoryList.replaceChildren(statusText(message));
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
    this.#elements.projectHistoryFrom.disabled = busy;
    this.#elements.projectHistoryTo.disabled = busy;
    for (const button of this.#elements.projectHistoryDialog.querySelectorAll<HTMLButtonElement>("button")) {
      if (button !== this.#elements.closeProjectHistory) button.disabled = busy;
    }
  }

  #openExport(): void {
    this.#renderExportStatistics();
    if (!this.#elements.exportDialog.open) this.#elements.exportDialog.showModal();
  }

  #renderExportStatistics(): void {
    const statistics = this.#wordStatistics;
    this.#elements.wordCountBadge.textContent = statistics ? `${statistics.totalWords.toLocaleString()} words` : "… words";
    if (!statistics) return;
    const total = document.createElement("p");
    total.className = "font-sans text-3xl font-semibold tracking-[-0.04em]";
    total.textContent = `${statistics.totalWords.toLocaleString()} words`;
    const rule = document.createElement("p");
    rule.className = "mt-1 text-xs leading-5 text-app-text-soft";
    rule.textContent = "Composed prose from main.md; code, equations, citation keys, and link destinations are excluded.";
    const columns = document.createElement("div");
    columns.className = "mt-4 grid gap-4 md:grid-cols-2";
    columns.append(
      statisticsGroup(
        "Files",
        statistics.files.map((file) => ({ label: file.path, words: file.words })),
      ),
      statisticsGroup(
        "Headings",
        statistics.headings.map((heading) => ({ label: heading.heading, words: heading.words })),
      ),
    );
    this.#elements.exportStatistics.replaceChildren(total, rule, columns);
  }

  #renderProjectHistory(): void {
    const options = this.#projectHistory.map((revision) => {
      const option = document.createElement("option");
      option.value = String(revision.revision);
      option.textContent = `v${revision.revision} · ${revision.reason}`;
      return option;
    });
    this.#elements.projectHistoryFrom.replaceChildren(...options.map((option) => option.cloneNode(true)));
    this.#elements.projectHistoryTo.replaceChildren(...options.map((option) => option.cloneNode(true)));
    if (this.#projectHistory[1]) this.#elements.projectHistoryFrom.value = String(this.#projectHistory[1].revision);
    if (this.#projectHistory[0]) this.#elements.projectHistoryTo.value = String(this.#projectHistory[0].revision);

    const head = this.#projectHistory[0]?.revision;
    this.#elements.projectHistoryList.replaceChildren(
      ...this.#projectHistory.map((revision) => {
        const card = document.createElement("article");
        card.className = "rounded-sm border border-app-line bg-app-paper p-4";
        const heading = document.createElement("div");
        heading.className = "flex flex-wrap items-start justify-between gap-3";
        const copy = document.createElement("div");
        const title = document.createElement("h3");
        title.className = "font-sans text-sm font-bold";
        title.textContent = `v${revision.revision} · ${revision.reason}`;
        const meta = document.createElement("p");
        meta.className = "mt-1 text-xs text-app-text-soft";
        meta.textContent = `${formatTimestamp(revision.createdAt)} · ${revision.fileCount} file${revision.fileCount === 1 ? "" : "s"}`;
        copy.append(title, meta);
        const actions = document.createElement("div");
        actions.className = "flex flex-wrap gap-2";
        actions.append(
          actionButton("Inspect", "button-secondary", () => void this.#inspectProjectRevision(revision.revision)),
          actionButton("Name milestone", "button-secondary", () => void this.#nameProjectMilestone(revision.revision)),
          actionButton("Branch", "button-secondary", () => void this.#seedProjectRevision(revision.revision)),
        );
        if (revision.revision !== head) {
          actions.append(
            actionButton("Restore as new head", "button-secondary", () => void this.#restoreProjectRevision(revision.revision)),
          );
        }
        heading.append(copy, actions);
        card.append(heading);
        if (revision.milestones.length > 0) {
          const milestones = document.createElement("div");
          milestones.className = "mt-3 flex flex-wrap gap-2";
          for (const milestone of revision.milestones) {
            const label = resourceLabel(milestone.name);
            label.title = milestone.description || `Immutable milestone for v${revision.revision}`;
            milestones.append(label);
          }
          card.append(milestones);
        }
        return card;
      }),
    );
    this.#updateProjectHistoryAvailability();
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
    const inspector = this.#elements.projectHistoryInspector;
    inspector.classList.remove("hidden");
    const heading = document.createElement("h3");
    heading.className = "font-sans text-sm font-bold";
    heading.textContent = `Read-only v${value.revision} · ${value.title}`;
    const meta = document.createElement("p");
    meta.className = "mt-2 text-xs leading-5 text-app-text-soft";
    meta.textContent = `${value.files.length} files · ${value.projectReferences.length} references · ${value.pdfs.length} PDFs · ${value.claims.length} claims`;
    const source = document.createElement("pre");
    source.className = "mt-4 max-h-80 overflow-auto whitespace-pre-wrap border-t border-app-line pt-4 text-xs leading-5";
    source.textContent = value.source;
    inspector.replaceChildren(heading, meta, source);
  }

  async #compareProjectHistory(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const from = this.#elements.projectHistoryFrom.value;
    const to = this.#elements.projectHistoryTo.value;
    const requestId = this.#startProjectHistoryOperation({ kind: "compare", from: Number(from), to: Number(to) });
    if (requestId === null) return;
    let value: ProjectRevisionDiff;
    try {
      const response = await fetch(`${apiBase}/history/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
        credentials: "same-origin",
      });
      await expectOk(response);
      const result: unknown = await response.json();
      if (!isProjectRevisionDiff(result)) throw new Error("Project history returned an invalid comparison");
      value = result;
      this.#finishProjectHistoryOperation(requestId);
      const history = this.#projectHistoryWorkflow.getSnapshot();
      if (!history.matches("ready") || history.context.requestId !== requestId) return;
    } catch (error) {
      this.#failProjectHistoryOperation(requestId, error, "Could not compare project revisions");
      return;
    }
    const inspector = this.#elements.projectHistoryInspector;
    inspector.classList.remove("hidden");
    const heading = document.createElement("h3");
    heading.className = "font-sans text-sm font-bold";
    heading.textContent = `v${value.fromRevision} → v${value.toRevision}`;
    const composed = document.createElement("p");
    composed.className = "mt-2 text-sm text-app-text-soft";
    const wordDelta = value.composed.wordDelta >= 0 ? `+${value.composed.wordDelta}` : String(value.composed.wordDelta);
    composed.textContent = `Composed manuscript: +${value.composed.addedLines} / −${value.composed.removedLines} lines · ${value.composed.beforeWords.toLocaleString()} → ${value.composed.afterWords.toLocaleString()} words (${wordDelta})`;
    const list = document.createElement("ul");
    list.className = "mt-3 space-y-1 font-sans text-xs";
    for (const file of value.files.filter((item) => item.status !== "unchanged")) {
      const item = document.createElement("li");
      item.textContent = `${file.status}: ${file.beforePath ?? "∅"} → ${file.afterPath ?? "∅"} (+${file.addedLines}/−${file.removedLines})`;
      list.append(item);
    }
    const binaries = document.createElement("p");
    binaries.className = "mt-3 text-xs text-app-text-soft";
    binaries.textContent = `${value.binaries.filter((item) => item.status !== "unchanged").length} binary identity change(s)`;
    inspector.replaceChildren(heading, composed, list, binaries);
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

  #appendProjectDiagnostic(message: string, fileId: string, from: number, to: number): void {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "resource-card mb-2 block w-full text-left font-sans text-xs";
    item.textContent = message;
    item.addEventListener("click", () => this.#focusProjectRange(fileId, from, to));
    this.#elements.diagnostics.append(item);
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

  async #openReferenceLibraryEntry(referenceId: string): Promise<void> {
    await this.#openReferenceLibrary();
    if (!this.#librarySnapshot?.references.some((reference) => reference.id === referenceId) && !this.#showArchivedReferences) {
      this.#showArchivedReferences = true;
      this.#elements.showArchivedReferences.setAttribute("aria-pressed", "true");
      await this.#refreshReferenceLibrary();
    }
    this.#elements.referenceFilterQuery.value = "";
    this.#elements.referenceFilterType.value = "";
    this.#elements.referenceFilterReading.value = "all";
    this.#elements.referenceFilterOrganization.value = "";
    this.#elements.referenceFilterLinkage.value = "all";
    this.#elements.referenceFilterCompleteness.value = "all";
    this.#expandedLibraryReferences.add(referenceId);
    this.#renderReferenceLibrary();
    const card = this.#elements.referenceLibraryList.querySelector<HTMLElement>(`[data-reference-id="${CSS.escape(referenceId)}"]`);
    if (!card) {
      this.#showToast("That reference is no longer available in the Library.");
      return;
    }
    card.tabIndex = -1;
    card.scrollIntoView({ block: "center" });
    card.focus({ preventScroll: true });
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
    this.#renderResearchContext();
    this.#syncWorkspaceRoute("replace");
  }

  async #discoverLibraryReferences(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const submit = this.#elements.libraryDiscoveryForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    this.#elements.libraryDiscoveryStatus.textContent = "Searching scholarly indexes…";
    this.#elements.libraryDiscoveryResults.replaceChildren();
    try {
      const response = await jsonFetch("/api/library/discovery", {
        query: this.#elements.libraryDiscoveryQuery.value,
        author: this.#elements.libraryDiscoveryAuthor.value,
        year: this.#elements.libraryDiscoveryYear.value,
        type: this.#elements.libraryDiscoveryType.value,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isReferenceDiscoveryResults(value)) throw new Error("Reference provider returned invalid discovery results");
      this.#renderLibraryDiscoveryResults(value);
      this.#elements.libraryDiscoveryStatus.textContent = value.length
        ? `${value.length} result${value.length === 1 ? "" : "s"}. Review metadata before saving.`
        : "No matching scholarly records. Try broader keywords or remove a filter.";
    } catch (error) {
      this.#elements.libraryDiscoveryStatus.textContent = error instanceof Error ? error.message : "Reference search failed";
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  #renderLibraryDiscoveryResults(results: readonly ReferenceDiscoveryResult[]): void {
    this.#elements.libraryDiscoveryResults.replaceChildren();
    for (const result of results) this.#elements.libraryDiscoveryResults.append(this.#referenceDiscoveryCard(result));
  }

  #renderReferenceLibrary(): void {
    const library = this.#librarySnapshot;
    if (!library) return;
    this.#renderCitationAssertionOptions();
    const types = [...new Set(library.references.map((reference) => reference.type))].sort();
    const selectedType = this.#elements.referenceFilterType.value;
    this.#elements.referenceFilterType.replaceChildren(new Option("All types", ""), ...types.map((type) => new Option(type, type)));
    if (types.includes(selectedType)) this.#elements.referenceFilterType.value = selectedType;
    const filters = this.#referenceLibraryFilters();
    const linked = new Set(this.#snapshot?.projectReferences.map((reference) => reference.referenceId) ?? []);
    const references = filterReferenceLibrary(library, linked, filters);
    this.#elements.referenceFilterCount.textContent = `${references.length} / ${library.references.length}`;
    this.#elements.referenceFilterCount.title = `${references.length} of ${library.references.length} references shown`;
    this.#elements.referenceLibraryList.replaceChildren();
    if (references.length === 0) {
      this.#elements.referenceLibraryList.append(
        emptyState(library.references.length === 0 ? "No references. Use Add reference to begin." : "No matching references."),
      );
    }
    for (const reference of references) this.#elements.referenceLibraryList.append(this.#referenceLibraryCard(reference));

    const unidentified = library.artifacts.filter((artifact) => artifact.referenceId === null);
    this.#elements.unidentifiedPdfCount.textContent = String(unidentified.length);
    this.#elements.unidentifiedPdfList.closest("section")?.classList.toggle("hidden", unidentified.length === 0);
    this.#elements.unidentifiedPdfList.replaceChildren();
    if (unidentified.length === 0) this.#elements.unidentifiedPdfList.append(emptyState("No unidentified PDFs."));
    for (const artifact of unidentified) this.#elements.unidentifiedPdfList.append(this.#unidentifiedPdfCard(artifact, library.references));
  }

  #referenceLibraryFilters(): ReferenceLibraryFilters {
    const reading = this.#elements.referenceFilterReading.value;
    const linkage = this.#elements.referenceFilterLinkage.value;
    const completeness = this.#elements.referenceFilterCompleteness.value;
    const sort = this.#elements.referenceFilterSort.value;
    return {
      query: this.#elements.referenceFilterQuery.value,
      type: this.#elements.referenceFilterType.value,
      readingStatus: reading === "unread" || reading === "reading" || reading === "read" ? reading : "all",
      organization: this.#elements.referenceFilterOrganization.value,
      linkage: linkage === "linked" || linkage === "unlinked" ? linkage : "all",
      completeness: completeness === "complete" || completeness === "incomplete" ? completeness : "all",
      sort: sort === "title" || sort === "year" || sort === "priority" ? sort : "updated",
    };
  }

  async #openCitationNetwork(): Promise<void> {
    this.#elements.citationNetwork.classList.remove("hidden");
    this.#renderCitationAssertionOptions();
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

  #renderCitationAssertionOptions(): void {
    const references = this.#librarySnapshot?.references ?? [];
    for (const select of [this.#elements.citationAssertionCiting, this.#elements.citationAssertionCited]) {
      const current = select.value;
      select.replaceChildren(
        new Option("Choose source…", ""),
        ...references.map((reference) => new Option(bibTeXDisplayText(reference.title), reference.id)),
      );
      if (references.some((reference) => reference.id === current)) select.value = current;
    }
  }

  #renderCitationNetwork(): void {
    const network = this.#citationNetwork;
    if (!network) return;
    this.#renderCitationGraph(network);
    this.#elements.citationNetworkList.replaceChildren();
    if (this.#citationExpansion) this.#elements.citationNetworkList.append(this.#citationExpansionRound(this.#citationExpansion));
    if (network.nodes.length === 0) {
      this.#elements.citationNetworkList.append(
        emptyState(
          this.#filterProjectCitations
            ? "No citation assertions touch references in this project yet."
            : "No source-to-source citation assertions yet. Record one or expand a DOI-backed source.",
        ),
      );
      return;
    }
    const nodes = document.createElement("section");
    nodes.className = "grid gap-3";
    for (const node of network.nodes) {
      const card = document.createElement("article");
      card.className = "resource-card";
      card.append(resourceLabel(node.inProject ? "Current project" : "Shared library"), resourceTitle(node.label));
      const detail = document.createElement("p");
      detail.className = "mt-2 text-xs text-app-text-soft";
      detail.textContent = [node.authors.join("; "), node.year, node.doi].filter(Boolean).join(" · ");
      card.append(detail);
      if (node.doi) {
        card.append(actionButton("Expand references", "button-secondary mt-3", () => void this.#expandCitationReference(node.referenceId)));
      }
      nodes.append(card);
    }
    this.#elements.citationNetworkList.append(nodes);

    if (network.edges.length === 0) return;
    const heading = document.createElement("h4");
    heading.className = "eyebrow mt-3";
    heading.textContent = `Assertions${network.truncated ? " · first 512" : ""}`;
    this.#elements.citationNetworkList.append(heading);
    const labels = new Map(network.nodes.map((node) => [node.id, node.label]));
    for (const edge of network.edges) {
      const card = document.createElement("article");
      card.className = "resource-card";
      card.append(resourceLabel(edge.state), resourceTitle(`${labels.get(edge.from) ?? edge.from} → ${labels.get(edge.to) ?? edge.to}`));
      for (const assertion of edge.assertions) card.append(this.#citationAssertionRow(assertion));
      this.#elements.citationNetworkList.append(card);
    }
  }

  #citationExpansionRound(expansion: CitationExpansionResult): HTMLElement {
    const section = document.createElement("section");
    section.className = "resource-card border-app-accent";
    const seed = this.#librarySnapshot?.references.find((reference) => reference.id === expansion.seedReferenceId);
    section.append(resourceLabel("Backward snowball · Crossref"), resourceTitle(`References from ${seed?.title ?? "selected source"}`));
    const summary = document.createElement("p");
    summary.className = "mt-2 text-xs leading-5 text-app-text-soft";
    summary.textContent = expansion.unmatched.length
      ? `${expansion.unmatched.length} new DOI candidate${expansion.unmatched.length === 1 ? "" : "s"} to review${
          expansion.truncated ? " · provider list truncated" : ""
        }.`
      : "No unseen DOI candidates in this round. This seed may be saturated for backward snowballing.";
    section.append(summary);
    for (const candidate of expansion.unmatched) section.append(this.#citationCandidateCard(expansion, candidate));
    return section;
  }

  #citationCandidateCard(expansion: CitationExpansionResult, candidate: CitationExpansionCandidate): HTMLElement {
    const card = document.createElement("article");
    card.className = "mt-3 border-t border-app-line pt-3";
    const title = document.createElement("h5");
    title.className = "text-sm font-semibold";
    title.textContent = candidate.title || candidate.unstructured || candidate.doi;
    const metadata = document.createElement("p");
    metadata.className = "mt-1 text-xs leading-5 text-app-text-soft";
    metadata.textContent = [candidate.authors, candidate.year, candidate.doi].filter(Boolean).join(" · ");
    const actions = document.createElement("div");
    actions.className = "mt-2 flex flex-wrap gap-2";
    const verify = document.createElement("a");
    verify.className = "button-secondary";
    verify.href = `https://doi.org/${candidate.doi}`;
    verify.target = "_blank";
    verify.rel = "noopener noreferrer";
    verify.textContent = "Verify DOI";
    const save = document.createElement("button");
    save.className = "button-primary";
    save.type = "button";
    save.textContent = "Save candidate";
    save.addEventListener("click", () => void this.#acceptCitationCandidate(expansion, candidate, save));
    actions.append(verify, save);
    card.append(title, metadata, actions);
    return card;
  }

  #renderCitationGraph(network: CitationNetwork): void {
    const svg = this.#elements.citationNetworkGraph;
    svg.replaceChildren();
    const namespace = "http://www.w3.org/2000/svg";
    if (network.nodes.length === 0) {
      const text = document.createElementNS(namespace, "text");
      text.setAttribute("x", "400");
      text.setAttribute("y", "180");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "currentColor");
      text.textContent = "No citation assertions to draw";
      svg.append(text);
      return;
    }
    const definitions = document.createElementNS(namespace, "defs");
    const marker = document.createElementNS(namespace, "marker");
    marker.setAttribute("id", "citation-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    const arrow = document.createElementNS(namespace, "path");
    arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrow.setAttribute("fill", "context-stroke");
    marker.append(arrow);
    definitions.append(marker);
    svg.append(definitions);
    const positions = new Map(
      network.nodes.map((node, index) => {
        const angle = (index / network.nodes.length) * Math.PI * 2 - Math.PI / 2;
        return [node.id, { x: 400 + Math.cos(angle) * 270, y: 180 + Math.sin(angle) * 125 }] as const;
      }),
    );
    for (const edge of network.edges) {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) continue;
      const line = document.createElementNS(namespace, "line");
      line.setAttribute("x1", String(from.x));
      line.setAttribute("y1", String(from.y));
      line.setAttribute("x2", String(to.x));
      line.setAttribute("y2", String(to.y));
      line.setAttribute("stroke", citationStateColor(edge.state));
      line.setAttribute("stroke-width", edge.state === "confirmed" ? "3" : "2");
      line.setAttribute("marker-end", "url(#citation-arrow)");
      if (edge.state === "inferred") line.setAttribute("stroke-dasharray", "6 5");
      svg.append(line);
    }
    for (const node of network.nodes) {
      const position = positions.get(node.id)!;
      const group = document.createElementNS(namespace, "g");
      const circle = document.createElementNS(namespace, "circle");
      circle.setAttribute("cx", String(position.x));
      circle.setAttribute("cy", String(position.y));
      circle.setAttribute("r", node.inProject ? "19" : "15");
      circle.setAttribute("fill", node.inProject ? "var(--color-app-accent)" : "var(--color-app-paper)");
      circle.setAttribute("stroke", "var(--color-app-ink)");
      const text = document.createElementNS(namespace, "text");
      text.setAttribute("x", String(position.x));
      text.setAttribute("y", String(position.y + 34));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "11");
      text.setAttribute("fill", "currentColor");
      text.textContent = node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label;
      const title = document.createElementNS(namespace, "title");
      title.textContent = node.label;
      group.append(circle, text, title);
      svg.append(group);
    }
  }

  #citationAssertionRow(assertion: CitationAssertionView): HTMLElement {
    const row = document.createElement("div");
    row.className = "mt-3 border-t border-app-line pt-3";
    const summary = document.createElement("p");
    summary.className = "font-sans text-xs leading-5";
    summary.textContent = `${assertion.polarity} · ${assertion.state} · ${assertion.method}`;
    const provenance = document.createElement("p");
    provenance.className = "mt-1 text-xs leading-5 text-app-text-soft";
    provenance.textContent = [
      assertion.assertedBy,
      formatTimestamp(assertion.observedAt),
      assertion.sourceKind,
      assertion.sourceId,
      assertion.sourceLocator,
      assertion.confidence === null ? "" : `confidence ${assertion.confidence.toFixed(2)}`,
      assertion.review ? `${assertion.review.decision} by ${assertion.review.reviewer}` : "unreviewed",
    ]
      .filter(Boolean)
      .join(" · ");
    row.append(summary, provenance);
    if (!assertion.review) {
      const actions = document.createElement("div");
      actions.className = "mt-2 flex gap-2";
      actions.append(
        actionButton("Confirm", "button-secondary", () => void this.#reviewCitationAssertion(assertion.id, "confirmed")),
        actionButton("Reject", "button-secondary", () => void this.#reviewCitationAssertion(assertion.id, "rejected")),
      );
      row.append(actions);
    }
    return row;
  }

  async #recordCitationAssertion(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const citingReferenceId = this.#elements.citationAssertionCiting.value;
    const citedReferenceId = this.#elements.citationAssertionCited.value;
    if (!citingReferenceId || !citedReferenceId || citingReferenceId === citedReferenceId) {
      this.#showToast("Choose two different sources for the citation assertion.");
      return;
    }
    const polarity = this.#elements.citationAssertionPolarity.value === "does-not-cite" ? "does-not-cite" : "cites";
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

  async #acceptCitationCandidate(
    expansion: CitationExpansionResult,
    candidate: CitationExpansionCandidate,
    button: HTMLButtonElement,
  ): Promise<void> {
    button.disabled = true;
    button.textContent = "Saving…";
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
      button.disabled = false;
      button.textContent = "Save candidate";
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
    const main = document.createElement("div");
    main.className = "library-reference-main";
    const title = document.createElement("h3");
    title.className = "library-reference-title";
    title.textContent = displayTitle;
    title.title = displayTitle;
    const details = document.createElement("p");
    details.className = "library-reference-meta";
    details.textContent = [
      bibTeXDisplayText(reference.authors.join("; ")),
      reference.year,
      bibTeXDisplayText(reference.venue),
      reference.referenceKey,
      keyState === "provisional" ? "refinable key" : "",
      reference.type,
      reference.archivedAt ? "archived" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    details.title = details.textContent;
    main.append(title, details);
    const actions = document.createElement("div");
    actions.className = "library-reference-actions";
    const primaryArtifact = artifacts[0];
    if (primaryArtifact) {
      const openPdf = actionButton("PDF", "button-secondary", () => void this.#openLibraryPdf(primaryArtifact));
      openPdf.title = `Open ${primaryArtifact.name}`;
      actions.append(openPdf);
    }
    if (appMode === "workspace") {
      if (linked) {
        const remove = actionButton("Linked", "button-secondary", () => void this.#unlinkProjectReference(reference.id));
        remove.title = `Remove :cite[${linked.citationAlias}] from this project`;
        actions.append(remove);
      } else {
        const add = actionButton("Add", "button-primary", () => void this.#linkLibraryReference(reference.id, reference.referenceKey));
        add.title = `Add :cite[${reference.referenceKey}] to this project`;
        actions.append(add);
      }
    }
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
    const fieldPrefix = `library-reference-${reference.id}`;
    const metadataFields = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
    const metadataSuggestions = new Map<CrossrefMetadataField, HTMLElement>();
    for (const [name, value] of [
      ["type", reference.type],
      ["title", reference.title],
      ["authors", reference.authors.join("; ")],
      ["year", reference.year],
      ["venue", reference.venue],
      ["doi", reference.doi],
      ["url", reference.url],
    ] as const) {
      const input = document.createElement("input");
      input.className = "field mt-2";
      input.id = `${fieldPrefix}-${name}`;
      input.name = name;
      input.value = value;
      input.placeholder = name;
      input.setAttribute("aria-label", `${name} for ${displayTitle}`);
      metadataFields.set(name, input);
      const field = document.createElement("div");
      field.className = "library-metadata-field mt-2";
      const suggestions = document.createElement("div");
      suggestions.className = "library-metadata-suggestions";
      suggestions.setAttribute("aria-live", "polite");
      metadataSuggestions.set(name, suggestions);
      field.append(input, suggestions);
      metadataBody.append(field);
    }
    const abstract = document.createElement("textarea");
    abstract.className = "field min-h-20";
    abstract.id = `${fieldPrefix}-abstract`;
    abstract.name = "abstract";
    abstract.value = reference.abstract;
    abstract.placeholder = "abstract";
    abstract.setAttribute("aria-label", `Abstract for ${displayTitle}`);
    metadataFields.set("abstract", abstract);
    const abstractField = document.createElement("div");
    abstractField.className = "library-metadata-field mt-2";
    const abstractSuggestions = document.createElement("div");
    abstractSuggestions.className = "library-metadata-suggestions";
    abstractSuggestions.setAttribute("aria-live", "polite");
    metadataSuggestions.set("abstract", abstractSuggestions);
    abstractField.append(abstract, abstractSuggestions);
    const metadataRefinementPanel = document.createElement("section");
    metadataRefinementPanel.className = "library-metadata-refinement hidden";
    metadataRefinementPanel.setAttribute("aria-live", "polite");
    const refinementTargets: MetadataRefinementTargets = {
      suggestions: metadataSuggestions,
      panel: metadataRefinementPanel,
    };
    const metadataActions = document.createElement("div");
    metadataActions.className = "mt-2 flex flex-wrap gap-2";
    metadataActions.append(
      actionButton("Save details", "button-primary", () => void this.#saveReferenceMetadata(reference.id, metadataFields)),
    );
    if (primaryArtifact) {
      metadataActions.append(
        actionButton(
          "Refine metadata",
          "button-secondary",
          () => void this.#refinePdfMetadata(reference, primaryArtifact, refinementTargets),
        ),
      );
    }
    metadataBody.append(abstractField, metadataRefinementPanel, metadataActions);
    const tags = document.createElement("input");
    tags.className = "field mt-3";
    tags.id = `${fieldPrefix}-tags`;
    tags.name = "tags";
    tags.value = (this.#librarySnapshot?.tags[reference.id] ?? []).join(", ");
    tags.placeholder = "Private tags, comma separated";
    tags.setAttribute("aria-label", `Private tags for ${displayTitle}`);
    metadataBody.append(tags);
    const collections = document.createElement("input");
    collections.className = "field mt-2";
    collections.id = `${fieldPrefix}-collections`;
    collections.name = "collections";
    collections.value = (this.#librarySnapshot?.collections[reference.id] ?? []).join(", ");
    collections.placeholder = "Collections, comma separated";
    collections.setAttribute("aria-label", `Collections for ${displayTitle}`);
    metadataBody.append(collections);
    const privateActions = document.createElement("div");
    privateActions.className = "mt-2 flex flex-wrap gap-2";
    privateActions.append(
      actionButton("Save tags", "button-secondary", () => void this.#saveReferenceTags(reference.id, tags.value)),
      actionButton("Save collections", "button-secondary", () => void this.#saveReferenceCollections(reference.id, collections.value)),
      actionButton(
        reference.archivedAt ? "Restore" : "Archive",
        "button-secondary",
        () => void this.#setReferenceArchived(reference.id, reference.archivedAt === null, displayTitle),
      ),
    );
    metadataBody.append(privateActions);
    const reading = this.#librarySnapshot?.reading.find((item) => item.referenceId === reference.id);
    const readingStatus = document.createElement("select");
    readingStatus.className = "field mt-3";
    readingStatus.id = `${fieldPrefix}-reading-status`;
    readingStatus.name = "readingStatus";
    readingStatus.setAttribute("aria-label", `Reading status for ${displayTitle}`);
    for (const value of ["unread", "reading", "read"] as const) readingStatus.append(new Option(value, value));
    readingStatus.value = reading?.status ?? "unread";
    const priority = document.createElement("select");
    priority.className = "field mt-2";
    priority.id = `${fieldPrefix}-priority`;
    priority.name = "priority";
    priority.setAttribute("aria-label", `Reading priority for ${displayTitle}`);
    for (const value of ["low", "normal", "high"] as const) priority.append(new Option(`Priority: ${value}`, value));
    priority.value = reading?.priority ?? "normal";
    const rating = document.createElement("select");
    rating.className = "field mt-2";
    rating.id = `${fieldPrefix}-rating`;
    rating.name = "rating";
    rating.setAttribute("aria-label", `Rating for ${displayTitle}`);
    rating.append(new Option("No rating", ""));
    for (let value = 1; value <= 5; value += 1) rating.append(new Option(`${value} star${value === 1 ? "" : "s"}`, String(value)));
    rating.value = reading?.rating === null || reading?.rating === undefined ? "" : String(reading.rating);
    metadataBody.append(
      readingStatus,
      priority,
      rating,
      actionButton(
        "Save reading state",
        "button-secondary mt-2",
        () => void this.#saveReadingState(reference.id, readingStatus.value, rating.value, priority.value),
      ),
    );

    const noteInput = document.createElement("textarea");
    noteInput.className = "field mt-3 min-h-16";
    noteInput.id = `${fieldPrefix}-private-note`;
    noteInput.name = "privateNote";
    noteInput.placeholder = "Add a private note";
    noteInput.setAttribute("aria-label", `Private note for ${displayTitle}`);
    noteInput.maxLength = 20_000;
    const addNote = actionButton(
      "Save private note",
      "button-secondary mt-2",
      () => void this.#createReferenceNote(reference.id, noteInput.value),
    );
    metadataBody.append(noteInput, addNote);

    const resources = document.createElement("div");
    resources.className = "mt-3 space-y-2 border-t border-app-line pt-3";
    const notes = this.#librarySnapshot?.notes.filter((note) => note.referenceId === reference.id) ?? [];
    const highlights = this.#librarySnapshot?.highlights.filter((highlight) => highlight.referenceId === reference.id) ?? [];
    const webSource = this.#librarySnapshot?.webSources.find((source) => source.referenceId === reference.id);
    const webSnapshots = [...(this.#librarySnapshot?.webSnapshots.filter((snapshot) => snapshot.referenceId === reference.id) ?? [])].sort(
      (left, right) => right.accessedAt.localeCompare(left.accessedAt),
    );
    for (const note of notes) {
      resources.append(this.#privateResearchRow(reference.id, "note", note.id, `Note · ${note.body.slice(0, 100)}`, linked !== undefined));
    }
    for (const artifact of artifacts) {
      const row = document.createElement("div");
      row.className = "rounded-sm border border-app-line p-2";
      const text = document.createElement("p");
      text.className = "font-sans text-xs leading-5 text-app-text-soft";
      text.textContent = `PDF · ${artifact.name}`;
      row.append(text);
      if (linked) {
        const access = document.createElement("p");
        access.className = "mt-1 font-sans text-xs leading-5 text-app-text-soft";
        access.textContent = "Available to signed-in project members; excluded from public links.";
        row.append(access);
      }
      const rights = document.createElement("select");
      rights.className = "field mt-2";
      for (const value of ["private", "unknown", "shareable"] as const) rights.append(new Option(`Rights: ${value}`, value));
      rights.value = artifact.rights;
      rights.addEventListener("change", () => void this.#setArtifactRights(artifact.id, rights.value));
      row.append(
        actionButton("Open PDF", "button-secondary mt-2", () => void this.#openLibraryPdf(artifact)),
        rights,
        ...(artifact.id === primaryArtifact?.id
          ? []
          : [
              actionButton(
                "Refine from this PDF",
                "button-secondary mt-2",
                () => void this.#refinePdfMetadata(reference, artifact, refinementTargets),
              ),
            ]),
      );
      resources.append(row);
    }
    for (const highlight of highlights) {
      resources.append(
        this.#privateResearchRow(
          reference.id,
          "highlight",
          highlight.id,
          `Highlight p. ${highlight.page} · ${highlight.quote.slice(0, 100)}`,
          linked !== undefined,
        ),
      );
    }
    if (webSource) {
      const recapture = actionButton(
        "Capture current version",
        "button-secondary mt-3",
        () => void this.#captureWebSourceInput(webSource.canonicalUrl),
      );
      metadataBody.append(recapture);
      for (const [index, snapshot] of webSnapshots.entries()) {
        const status = snapshot.complete ? "complete" : "incomplete";
        const row = this.#privateResearchRow(
          reference.id,
          "web-snapshot",
          snapshot.id,
          `Web capture · ${formatTimestamp(snapshot.accessedAt)} · ${status}`,
          linked !== undefined,
        );
        const links = document.createElement("div");
        links.className = "mt-2 flex flex-wrap gap-2";
        if (snapshot.readableObjectKey) links.append(downloadLink(`/api/library/web-snapshots/${snapshot.id}/readable`, "Readable text"));
        if (snapshot.rawObjectKey) links.append(downloadLink(`/api/library/web-snapshots/${snapshot.id}/raw`, "Raw capture"));
        const prior = webSnapshots[index + 1];
        if (prior) {
          links.append(actionButton("Compare with prior", "button-secondary", () => void this.#compareWebSnapshots(prior.id, snapshot.id)));
        }
        if (linked) {
          const pin = actionButton(
            "Use for project",
            "button-secondary",
            () => void this.#pinProjectWebSnapshot(reference.id, snapshot.id),
          );
          pin.disabled = linked.snapshot.webSnapshot?.id === snapshot.id;
          pin.title = pin.disabled ? "This version is pinned to the project" : "Pin this exact capture to future citations and milestones";
          links.append(pin);
        }
        if (snapshot.diagnostics.length > 0) {
          const diagnostic = document.createElement("p");
          diagnostic.className = "mt-2 font-sans text-xs leading-5 text-app-text-soft";
          diagnostic.textContent = snapshot.diagnostics.join(" ");
          row.append(diagnostic);
        }
        row.append(links);
        resources.append(row);
      }
    }
    if (notes.length + artifacts.length + highlights.length + webSnapshots.length > 0) metadataBody.append(resources);
    card.append(main, actions, metadataEditor);
    return card;
  }

  #privateResearchRow(
    referenceId: string,
    kind: "note" | "highlight" | "web-snapshot",
    resourceId: string,
    label: string,
    referenceLinked: boolean,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "rounded-sm border border-app-line p-2";
    const text = document.createElement("p");
    text.className = "font-sans text-xs leading-5 text-app-text-soft";
    text.textContent = label;
    row.append(text);
    const share = this.#snapshot?.researchShares.find((item) => item.kind === kind && item.resourceId === resourceId);
    const action = share
      ? actionButton("Revoke project share", "button-secondary mt-2", () => void this.#revokePrivateResearch(share.id))
      : actionButton(
          "Share snapshot with project",
          "button-secondary mt-2",
          () => void this.#sharePrivateResearch(referenceId, kind, resourceId),
        );
    action.disabled = !share && !referenceLinked;
    action.title = referenceLinked ? "" : "Add the bibliographic reference to this project first";
    row.append(action);
    return row;
  }

  #unidentifiedPdfCard(artifact: LibraryPdfArtifact, references: readonly BibliographicRecord[]): HTMLElement {
    const card = document.createElement("article");
    card.className = "resource-card";
    card.append(resourceLabel(`Private PDF · ${formatBytes(artifact.size)}`), resourceTitle(artifact.name));
    const select = document.createElement("select");
    select.className = "field mt-3";
    select.setAttribute("aria-label", `Identify ${artifact.name} as a reference`);
    select.append(new Option("Choose identified source…", ""));
    for (const reference of references) select.append(new Option(bibTeXDisplayText(reference.title), reference.id));
    const identify = actionButton(
      "Identify PDF",
      "button-primary mt-2 w-full justify-center",
      () => void this.#identifyLibraryPdf(artifact.id, select.value),
    );
    identify.disabled = references.length === 0;
    card.append(select, identify);
    return card;
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
    this.#elements.libraryPdfUpload.value = "";
    this.#elements.libraryPdfUpload.disabled = true;
    this.#elements.libraryPdfUploadStatus.setAttribute("aria-busy", "true");
    this.#elements.libraryPdfDropzone.dataset.busy = "true";
    this.#libraryPdfUploadBusy = true;
    this.#failedLibraryPdfUploads = [];
    try {
      const result = await uploadPdfBatch(
        files,
        async (file) => {
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
          return value.created
            ? { disposition: "created" }
            : {
                disposition: "existing",
                referenceId: value.reference.id,
                referenceKey: value.reference.referenceKey,
                archived: value.reference.archivedAt !== null,
              };
        },
        (snapshot) => this.#renderLibraryPdfUpload(snapshot, false),
      );
      this.#failedLibraryPdfUploads = result.failed;
      if (result.added.length > 0 || result.existing.length > 0) await this.#refreshReferenceLibrary();
      this.#renderLibraryPdfUpload(
        { items: result.items, completed: result.items.length, total: result.items.length },
        result.failed.length > 0,
      );
      const addedLabel = `${result.added.length} PDF${result.added.length === 1 ? "" : "s"} added`;
      const existingLabel = `${result.existing.length} already in library`;
      this.#showToast(
        result.failed.length === 0
          ? result.existing.length > 0
            ? `${addedLabel}; ${existingLabel}.`
            : `${addedLabel}. Add metadata when ready.`
          : `${addedLabel}; ${existingLabel}; ${result.failed.length} failed.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF intake failed";
      this.#elements.libraryPdfUploadStatus.classList.remove("hidden");
      this.#elements.libraryPdfUploadStatus.replaceChildren(resourceLabel("PDF intake"), statusText(message));
      this.#showToast(message);
    } finally {
      this.#libraryPdfUploadBusy = false;
      this.#elements.libraryPdfUpload.disabled = false;
      this.#elements.libraryPdfUploadStatus.removeAttribute("aria-busy");
      delete this.#elements.libraryPdfDropzone.dataset.busy;
    }
  }

  #renderLibraryPdfUpload(snapshot: PdfUploadQueueSnapshot, retryFailed: boolean): void {
    const container = this.#elements.libraryPdfUploadStatus;
    container.classList.remove("hidden");
    const summary = statusText(`${snapshot.completed} of ${snapshot.total} processed`);
    const list = document.createElement("ol");
    list.className = "mt-2 grid gap-1 font-sans text-xs";
    for (const item of snapshot.items) {
      const row = document.createElement("li");
      row.className = "flex items-start justify-between gap-3";
      row.dataset.uploadState = item.state;
      const name = document.createElement("span");
      name.className = "min-w-0 truncate text-app-text";
      name.textContent = item.file.name;
      name.title = item.file.name;
      const state = document.createElement("span");
      state.className = `shrink-0 ${item.state === "failed" ? "text-app-error" : "text-app-text-soft"}`;
      state.textContent =
        item.state === "failed"
          ? `Failed · ${item.error ?? "Upload failed"}`
          : item.state === "existing" && item.existing
            ? `Already in library · ${item.existing.referenceKey}`
            : uploadStateLabel(item.state);
      const outcome = document.createElement("span");
      outcome.className = "flex shrink-0 items-center gap-2";
      outcome.append(state);
      if (item.state === "existing" && item.existing) {
        const existing = item.existing;
        const reveal = actionButton("Show", "button-secondary", () => void this.#revealExistingPdfReference(existing));
        reveal.setAttribute("aria-label", `Show ${existing.referenceKey} in Library`);
        outcome.append(reveal);
      }
      row.append(name, outcome);
      list.append(row);
    }
    const content: Node[] = [resourceLabel("PDF intake"), summary, list];
    if (retryFailed) {
      const retry = actionButton("Retry failed", "button-secondary mt-3", () => {
        void this.#uploadLibraryPdfs(this.#failedLibraryPdfUploads);
      });
      content.push(retry);
    }
    container.replaceChildren(...content);
  }

  async #revealExistingPdfReference(existing: ExistingPdfUpload): Promise<void> {
    if (existing.archived && !this.#showArchivedReferences) {
      this.#showArchivedReferences = true;
      this.#elements.showArchivedReferences.setAttribute("aria-pressed", "true");
      await this.#refreshReferenceLibrary();
    }
    this.#elements.referenceFilterQuery.value = existing.referenceKey;
    this.#elements.referenceFilterType.value = "";
    this.#elements.referenceFilterReading.value = "all";
    this.#elements.referenceFilterOrganization.value = "";
    this.#elements.referenceFilterLinkage.value = "all";
    this.#elements.referenceFilterCompleteness.value = "all";
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
    targets: MetadataRefinementTargets,
  ): Promise<void> {
    this.#metadataRefinement.send({ type: "START", referenceId: reference.id, artifactId: artifact.id });
    const requestId = this.#metadataRefinement.getSnapshot().context.requestId;
    for (const suggestions of targets.suggestions.values()) suggestions.replaceChildren();
    targets.panel.classList.remove("hidden");
    targets.panel.replaceChildren(
      resourceLabel("Refine metadata"),
      statusText("Step 1 of 2 · Reading embedded metadata and opening pages…"),
    );
    try {
      const candidates = await extractPdfMetadata(`/api/library/pdfs/${encodeURIComponent(artifact.id)}`);
      this.#metadataRefinement.send({ type: "LOCAL_READY", requestId, local: candidates });
      if (!this.#metadataRefinement.getSnapshot().matches("discovering")) return;
      targets.panel.replaceChildren(resourceLabel("Refine metadata"), statusText("Step 2 of 2 · Searching scholarly metadata…"));
      try {
        const response = await jsonFetch(`/api/library/references/${encodeURIComponent(reference.id)}/metadata-refinement/preview`, {
          artifactId: artifact.id,
          candidates: {
            ...(candidates.title ? { title: candidates.title } : {}),
            ...(candidates.authors.length > 0 ? { authors: candidates.authors } : {}),
            ...(candidates.year ? { year: candidates.year } : {}),
            ...(candidates.doi ? { doi: candidates.doi } : {}),
          },
        });
        await expectOk(response);
        const preview: unknown = await response.json();
        if (!isMetadataRefinementPreview(preview)) throw new Error("Metadata providers returned an invalid preview");
        this.#metadataRefinement.send({ type: "DISCOVERY_READY", requestId, preview });
        if (!this.#metadataRefinement.getSnapshot().matches("reviewing")) return;
        this.#renderMetadataRefinement(reference, artifact, candidates, preview, targets);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Provider lookup failed.";
        this.#metadataRefinement.send({ type: "DISCOVERY_FAILED", requestId, message });
        if (!this.#metadataRefinement.getSnapshot().matches("reviewing")) return;
        this.#renderMetadataRefinement(
          reference,
          artifact,
          candidates,
          { referenceId: reference.id, artifactId: artifact.id, candidates: [] },
          targets,
          message,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? `Metadata could not be refined: ${error.message}` : "Metadata could not be refined.";
      this.#metadataRefinement.send({ type: "FAIL", requestId, message });
      if (!this.#metadataRefinement.getSnapshot().matches("failed")) return;
      targets.panel.replaceChildren(resourceLabel("Refine metadata"), statusText(message));
    }
  }

  #renderMetadataRefinement(
    reference: BibliographicRecord,
    artifact: LibraryPdfArtifact,
    local: PdfMetadataCandidates,
    preview: MetadataRefinementPreview,
    targets: MetadataRefinementTargets,
    providerError = "",
  ): void {
    for (const suggestions of targets.suggestions.values()) suggestions.replaceChildren();
    targets.panel.replaceChildren(
      resourceLabel(`Refine metadata · ${local.pagesScanned} PDF page${local.pagesScanned === 1 ? "" : "s"} scanned`),
    );
    const localSection = document.createElement("section");
    localSection.className = "library-metadata-refinement-actions";
    this.#renderPdfMetadataReview(reference, artifact, local, targets.suggestions, localSection);
    targets.panel.append(localSection);
    const providerSection = document.createElement("section");
    providerSection.className = "library-metadata-refinement-actions";
    providerSection.append(resourceLabel("Scholarly metadata matches"));
    if (preview.candidates.length === 0) {
      providerSection.append(
        statusText(
          providerError
            ? `Provider lookup failed: ${providerError} You can still apply the PDF suggestions or edit details manually.`
            : "No provider matches were found. You can still apply the PDF suggestions or edit details manually.",
        ),
      );
      targets.panel.append(providerSection);
      return;
    }
    const groups = groupMetadataCandidates(preview.candidates);
    const workSelect = document.createElement("select");
    workSelect.className = "field mt-2";
    workSelect.setAttribute("aria-label", `Scholarly work for ${reference.title}`);
    for (const [index, group] of groups.entries()) {
      const first = group.candidates[0]!;
      const sourceCount = group.candidates.length;
      const label = `${first.metadata.title}${first.metadata.year ? ` · ${first.metadata.year}` : ""} · ${group.doi} · ${sourceCount} source${sourceCount === 1 ? "" : "s"}`;
      workSelect.append(new Option(label, String(index)));
    }
    const comparison = document.createElement("div");
    const renderSelected = (): void => {
      for (const suggestions of targets.suggestions.values()) {
        for (const item of suggestions.querySelectorAll('[data-metadata-suggestion="provider"]')) item.remove();
      }
      const group = groups[Number(workSelect.value)];
      if (group) this.#renderProviderMetadataReview(reference, group.candidates, targets.suggestions, comparison);
    };
    workSelect.addEventListener("change", renderSelected);
    if (groups.length > 1) providerSection.append(workSelect);
    providerSection.append(comparison);
    targets.panel.append(providerSection);
    renderSelected();
  }

  #renderProviderMetadataReview(
    reference: BibliographicRecord,
    candidates: readonly MetadataRefinementCandidate[],
    suggestions: ReadonlyMap<CrossrefMetadataField, HTMLElement>,
    container: HTMLElement,
  ): void {
    const doi = candidates[0]?.metadata.doi ?? "";
    const sourceNames = candidates.map(({ provider }) => scholarlyProviderLabel(provider));
    container.replaceChildren(statusText(`${doi} · compare ${sourceNames.join(", ")}`));
    const selected = new Map<CrossrefMetadataField, HTMLSelectElement>();
    for (const field of crossrefMetadataFields) {
      const current = metadataFieldValue(reference, field);
      const options = candidates.flatMap((candidate, index) => {
        const proposed = metadataFieldValue(candidate.metadata, field);
        return proposed && proposed !== current ? [{ candidate, index, proposed }] : [];
      });
      if (options.length === 0) continue;
      const row = document.createElement("div");
      row.className = "library-metadata-suggestion";
      row.dataset.metadataSuggestion = "provider";
      const choice = document.createElement("div");
      choice.className = "min-w-0 flex-1";
      const source = document.createElement("select");
      source.className = "library-metadata-suggestion-source";
      source.setAttribute("aria-label", `Suggested source for ${field}`);
      source.append(new Option("Keep current", ""));
      for (const option of options) source.append(new Option(scholarlyProviderLabel(option.candidate.provider), String(option.index)));
      source.value = String(options[0]!.index);
      const value = document.createElement("span");
      value.className = "library-metadata-suggestion-value";
      const renderValue = (): void => {
        const candidate = source.value ? candidates[Number(source.value)] : undefined;
        value.textContent = candidate ? metadataFieldValue(candidate.metadata, field) : current || "—";
      };
      source.addEventListener("change", renderValue);
      renderValue();
      choice.append(source, value);
      row.append(choice);
      suggestions.get(field)?.append(row);
      selected.set(field, source);
    }
    if (selected.size === 0) {
      container.append(statusText("These provider records match the current library metadata."));
      return;
    }
    const apply = actionButton(
      "Apply scholarly metadata",
      "button-primary mt-3",
      () => void this.#applyProviderMetadata(reference.id, candidates, selected),
    );
    const updateSourceCount = (): void => {
      const count = new Set([...selected.values()].map(({ value }) => value).filter(Boolean)).size;
      apply.disabled = count === 0;
      apply.textContent = count === 0 ? "Keep current metadata" : `Apply from ${count} source${count === 1 ? "" : "s"}`;
    };
    for (const source of selected.values()) source.addEventListener("change", updateSourceCount);
    updateSourceCount();
    container.append(apply);
  }

  async #applyProviderMetadata(
    referenceId: string,
    candidates: readonly MetadataRefinementCandidate[],
    selected: ReadonlyMap<CrossrefMetadataField, HTMLSelectElement>,
  ): Promise<void> {
    const fieldsByCandidate = new Map<number, CrossrefMetadataField[]>();
    for (const [field, source] of selected) {
      if (!source.value) continue;
      const index = Number(source.value);
      const fields = fieldsByCandidate.get(index);
      if (fields) fields.push(field);
      else fieldsByCandidate.set(index, [field]);
    }
    if (fieldsByCandidate.size === 0) {
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
        selections: [...fieldsByCandidate].map(([index, fields]) => {
          const candidate = candidates[index]!;
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

  #renderPdfMetadataReview(
    reference: BibliographicRecord,
    artifact: LibraryPdfArtifact,
    candidates: PdfMetadataCandidates,
    suggestions: ReadonlyMap<CrossrefMetadataField, HTMLElement>,
    container: HTMLElement,
  ): void {
    container.replaceChildren(resourceLabel("PDF suggestions"));
    const rows = [
      ["title", candidates.title, reference.title],
      ["authors", candidates.authors.join("; "), reference.authors.join("; ")],
      ["year", candidates.year, reference.year],
      ["doi", candidates.doi, reference.doi],
    ] as const;
    const selections = new Map<(typeof rows)[number][0], { checkbox: HTMLInputElement; value: string }>();
    for (const [field, suggested, current] of rows) {
      if (!suggested || suggested === current) continue;
      const label = document.createElement("label");
      label.className = "library-metadata-suggestion";
      label.dataset.metadataSuggestion = "pdf";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.setAttribute("aria-label", `Use PDF suggestion for ${field}`);
      const source = document.createElement("span");
      source.className = "library-metadata-suggestion-label";
      source.textContent = "PDF";
      const value = document.createElement("span");
      value.className = "library-metadata-suggestion-value";
      value.textContent = suggested;
      label.append(checkbox, source, value);
      suggestions.get(field)?.append(label);
      selections.set(field, { checkbox, value: suggested });
    }
    for (const diagnostic of candidates.diagnostics) container.append(statusText(diagnostic));
    if (selections.size === 0) {
      container.append(statusText("No new metadata suggestions are available."));
      return;
    }
    container.append(
      actionButton(
        "Apply selected metadata",
        "button-primary mt-3",
        () => void this.#applyPdfMetadata(reference.id, artifact.id, selections),
      ),
    );
  }

  async #applyPdfMetadata(
    referenceId: string,
    artifactId: string,
    selections: ReadonlyMap<string, { checkbox: HTMLInputElement; value: string }>,
  ): Promise<void> {
    const fields: Record<string, string | string[]> = {};
    for (const [field, selection] of selections) {
      if (!selection.checkbox.checked) continue;
      fields[field] =
        field === "authors"
          ? selection.value
              .split(";")
              .map((value) => value.trim())
              .filter(Boolean)
          : selection.value.trim();
    }
    if (Object.keys(fields).length === 0) {
      this.#showToast("Select at least one PDF metadata field to apply.");
      return;
    }
    const response = await jsonFetch(`/api/library/references/${encodeURIComponent(referenceId)}/pdf-metadata`, { artifactId, fields });
    await expectOk(response);
    await this.#refreshBibliographicMetadata();
    this.#showToast("Selected PDF metadata applied with provenance.");
  }

  async #captureWebSource(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await this.#captureWebSourceInput(this.#elements.webSourceUrl.value);
    this.#elements.webSourceForm.reset();
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
    const section = this.#elements.webSnapshotComparison;
    section.classList.remove("hidden");
    section.replaceChildren();
    const heading = document.createElement("h3");
    heading.className = "text-lg font-semibold tracking-[-0.025em]";
    heading.textContent = value.comparison.identical
      ? "No readable-text changes"
      : `${value.comparison.addedLines} added · ${value.comparison.removedLines} removed`;
    section.append(resourceLabel("Neutral snapshot comparison"), heading);
    for (const hunk of value.comparison.hunks) {
      const block = document.createElement("pre");
      block.className = "mt-3 overflow-auto rounded-sm border border-app-line bg-app-surface p-3 font-mono text-xs leading-5";
      block.textContent = [
        `@@ before ${hunk.beforeLine} · after ${hunk.afterLine} @@`,
        ...hunk.removed.map((line) => `- ${line}`),
        ...hunk.added.map((line) => `+ ${line}`),
        ...(hunk.truncated ? ["… excerpt truncated"] : []),
      ].join("\n");
      section.append(block);
    }
    section.scrollIntoView({ block: "nearest" });
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

  async #saveReferenceMetadata(referenceId: string, fields: ReadonlyMap<string, HTMLInputElement | HTMLTextAreaElement>): Promise<void> {
    const value = (name: string): string => fields.get(name)?.value.trim() ?? "";
    const response = await jsonFetch(
      `/api/library/references/${encodeURIComponent(referenceId)}`,
      {
        type: value("type"),
        title: value("title"),
        authors: value("authors")
          .split(";")
          .map((item) => item.trim())
          .filter(Boolean),
        year: value("year"),
        venue: value("venue"),
        doi: value("doi"),
        url: value("url"),
        abstract: value("abstract"),
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

  async #saveReadingState(referenceId: string, status: string, rating: string, priority: string): Promise<void> {
    if (
      !(["unread", "reading", "read"] as const).includes(status as "unread") ||
      !(["low", "normal", "high"] as const).includes(priority as "normal")
    )
      return;
    await expectOk(
      await jsonFetch(
        `/api/library/references/${encodeURIComponent(referenceId)}/reading`,
        {
          status,
          rating: rating ? Number(rating) : null,
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
    this.#renderPdfs(this.#snapshot.pdfs);
    this.#renderPublications(this.#snapshot.publications);
    this.#renderAnnotations(this.#snapshot.annotations, this.#snapshot.links);
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

  #renderPdfs(pdfs: PdfResource[]): void {
    const expandedHighlights = new Set(
      [...this.#elements.pdfList.querySelectorAll<HTMLDetailsElement>("[data-pdf-annotation-group]")]
        .filter((group) => group.open)
        .flatMap((group) => (group.dataset.pdfAnnotationGroup ? [group.dataset.pdfAnnotationGroup] : [])),
    );
    this.#elements.pdfList.replaceChildren();
    this.#elements.annotationPdf.replaceChildren();
    this.#elements.annotationPdf.disabled = true;
    if (pdfs.length === 0) {
      this.#elements.annotationPdf.append(new Option("Import a PDF first", ""));
      this.#updateProjectEvidenceVisibility(0, this.#snapshot?.annotations.length ?? 0);
      return;
    }
    for (const pdf of pdfs) {
      const card = document.createElement("article");
      card.className = "project-evidence-paper";
      card.dataset.pdfResourceId = pdf.id;
      const row = document.createElement("div");
      row.className = "project-evidence-paper-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "project-evidence-paper-open";
      button.dataset.pdfId = pdf.id;
      button.append(resourceLabel("PDF · " + formatBytes(pdf.size)), resourceTitle(pdf.name));
      button.addEventListener("click", () => {
        this.#elements.annotationPdf.value = pdf.id;
        void this.#showPaper(pdf);
      });
      const remove = actionButton("Remove", "project-evidence-remove", () => void this.#removePdf(pdf));
      remove.setAttribute("aria-label", "Remove from project");
      remove.title = "Remove this legacy project PDF";
      row.append(button, remove);
      const highlights = document.createElement("details");
      highlights.className = "project-evidence-highlights";
      highlights.dataset.pdfAnnotationGroup = pdf.id;
      highlights.hidden = true;
      highlights.open = expandedHighlights.has(pdf.id);
      const highlightsSummary = document.createElement("summary");
      const highlightsLabel = document.createElement("span");
      highlightsLabel.textContent = "Highlights";
      const highlightsCount = document.createElement("span");
      highlightsCount.className = "count-badge";
      highlightsCount.dataset.pdfAnnotationCount = pdf.id;
      highlightsCount.textContent = "0";
      highlightsSummary.append(highlightsLabel, highlightsCount);
      const annotationList = document.createElement("div");
      annotationList.className = "project-evidence-highlight-list";
      annotationList.dataset.pdfAnnotations = pdf.id;
      highlights.append(highlightsSummary, annotationList);
      card.append(row, highlights);
      this.#elements.pdfList.append(card);
      this.#elements.annotationPdf.append(new Option(pdf.name, pdf.id));
    }
    if (this.#renderedPdfId) this.#elements.annotationPdf.value = this.#renderedPdfId;
    this.#updateProjectEvidenceVisibility(pdfs.length, this.#snapshot?.annotations.length ?? 0);
  }

  #updateProjectEvidenceVisibility(pdfCount: number, annotationCount: number): void {
    const total = pdfCount + annotationCount;
    const reveal = this.#elements.projectEvidence.hidden && total > 0;
    this.#elements.projectEvidence.hidden = total === 0;
    if (reveal) this.#elements.projectEvidence.open = true;
    this.#elements.projectEvidenceCount.textContent = String(total);
    this.#elements.projectEvidenceCount.title = `${pdfCount} ${pdfCount === 1 ? "paper" : "papers"}, ${annotationCount} ${
      annotationCount === 1 ? "highlight" : "highlights"
    }`;
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
    this.#elements.publicationList.replaceChildren();
    if (publications.length === 0) {
      this.#elements.publicationList.append(emptyState("Imported references appear here as stable publication resources."));
      return;
    }
    for (const publication of publications) {
      const card = document.createElement("article");
      card.className = "resource-card";
      card.dataset.publicationResourceId = publication.id;
      card.append(
        resourceLabel(`${publication.type} · ${publication.metadataSource}`),
        resourceTitle(bibTeXDisplayText(publication.title)),
      );
      const details = document.createElement("p");
      details.className = "mt-2 font-sans text-xs leading-5 text-app-text-soft";
      details.textContent = [bibTeXDisplayText(publication.authors.join("; ")), publication.year, bibTeXDisplayText(publication.venue)]
        .filter(Boolean)
        .join(" · ");
      card.append(details);
      const actions = document.createElement("div");
      actions.className = "mt-3 flex flex-wrap items-center gap-2";
      actions.append(actionButton("Open in context", "button-secondary", () => this.#openPublicationContext(publication)));
      const projectReference = this.#snapshot?.projectReferences.find((link) => link.referenceId === publication.id);
      if (projectReference) {
        actions.append(resourceLabel(`alias:${projectReference.citationAlias}`));
        actions.append(actionButton("Manage in library", "button-secondary", () => void this.#openReferenceLibraryEntry(publication.id)));
      }
      if (publication.doi) {
        actions.append(resourceLabel(`doi:${publication.doi}`));
        if (!projectReference) {
          actions.append(actionButton("Enrich", "button-secondary", () => void this.#enrichPublication(publication.id)));
        }
      }
      card.append(actions);
      this.#elements.publicationList.append(card);
    }
  }

  #renderAnnotations(annotations: AnnotationResource[], links: PassageLink[]): void {
    const targets = new Map<string, HTMLElement>();
    for (const target of this.#elements.pdfList.querySelectorAll<HTMLElement>("[data-pdf-annotations]")) {
      target.replaceChildren();
      const pdfId = target.dataset.pdfAnnotations;
      if (pdfId) targets.set(pdfId, target);
    }
    for (const group of this.#elements.pdfList.querySelectorAll<HTMLDetailsElement>("[data-pdf-annotation-group]")) {
      group.hidden = true;
    }
    for (const count of this.#elements.pdfList.querySelectorAll<HTMLElement>("[data-pdf-annotation-count]")) {
      count.textContent = "0";
    }
    this.#elements.unassignedAnnotationList.replaceChildren();
    this.#elements.unassignedAnnotationList.hidden = true;
    if (annotations.length === 0) {
      this.#updateProjectEvidenceVisibility(this.#snapshot?.pdfs.length ?? 0, 0);
      return;
    }
    const annotationCounts = new Map<string, number>();
    for (const annotation of annotations) {
      const card = document.createElement("article");
      card.className = "resource-card";
      card.dataset.annotationResourceId = annotation.id;
      const label = document.createElement("label");
      label.className = "flex items-start gap-2";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.annotationId = annotation.id;
      checkbox.dataset.modelEvidenceKey = modelEvidenceKey("annotation", annotation.id);
      checkbox.className = "mt-1 accent-app-accent";
      checkbox.checked = this.#modelEvidenceSelection.has(checkbox.dataset.modelEvidenceKey);
      checkbox.setAttribute(
        "aria-label",
        `Use annotation “${accessibleEvidenceExcerpt(annotation.quote)}” on page ${annotation.page} as model evidence`,
      );
      checkbox.addEventListener("change", () => this.#setModelEvidenceSelected(checkbox.dataset.modelEvidenceKey ?? "", checkbox.checked));
      const content = document.createElement("span");
      content.className = "min-w-0";
      content.append(resourceLabel(`Page ${annotation.page}`), resourceTitle(`“${annotation.quote}”`));
      if (annotation.comment) {
        const note = document.createElement("span");
        note.className = "mt-2 block font-sans text-xs text-app-text-soft";
        note.textContent = annotation.comment;
        content.append(note);
      }
      label.append(checkbox, content);
      const linkButton = document.createElement("button");
      linkButton.type = "button";
      linkButton.className = "button-secondary mt-3 w-full justify-center";
      linkButton.textContent = "Link selected manuscript text";
      linkButton.addEventListener("click", () => void this.#linkAnnotation(annotation.id));
      const actions = document.createElement("div");
      actions.className = "mt-3 grid gap-2";
      const openEvidence = actionButton("Open evidence", "button-secondary w-full justify-center", () => {
        const pdf = this.#snapshot?.pdfs.find((item) => item.id === annotation.pdfId);
        if (pdf) void this.#showPaper(pdf, annotation.page, annotation.id);
      });
      const edit = actionButton("Edit note", "button-secondary w-full justify-center", () => {
        this.#editingAnnotationId = annotation.id;
        this.#elements.annotationComment.value = annotation.comment;
        this.#elements.annotationQuote.value = annotation.quote;
        this.#elements.annotationPrefix.value = annotation.prefix;
        this.#elements.annotationSuffix.value = annotation.suffix;
        const pdf = this.#snapshot?.pdfs.find((item) => item.id === annotation.pdfId);
        if (pdf) void this.#showPaper(pdf, annotation.page, annotation.id);
      });
      const remove = actionButton(
        "Delete highlight",
        "button-secondary w-full justify-center",
        () => void this.#deleteAnnotation(annotation),
      );
      actions.append(openEvidence, edit, linkButton, remove);
      const strokeEditor = document.createElement("details");
      strokeEditor.className = "mt-3 border-t border-app-line pt-3";
      const strokeSummary = document.createElement("summary");
      strokeSummary.className = "cursor-pointer font-sans text-xs font-semibold";
      strokeSummary.textContent = `Adjust ${annotation.fragments.length} stroke${annotation.fragments.length === 1 ? "" : "s"}`;
      strokeEditor.append(strokeSummary);
      for (const [index, fragment] of annotation.fragments.entries()) {
        const row = document.createElement("section");
        row.className = "mt-3 border border-app-line bg-app-paper p-3";
        const quote = document.createElement("textarea");
        quote.className = "field min-h-16";
        quote.value = fragment.quote;
        quote.maxLength = 20_000;
        quote.setAttribute("aria-label", `Text for highlight stroke ${index + 1}`);
        const controls = document.createElement("div");
        controls.className = "touch-adjustments mt-2 flex flex-wrap gap-2";
        for (const [labelText, adjustment] of [
          ["←", "left"],
          ["↑", "up"],
          ["↓", "down"],
          ["→", "right"],
          ["Wider", "wider"],
          ["Narrower", "narrower"],
          ["Taller", "taller"],
          ["Shorter", "shorter"],
        ] as const) {
          const button = actionButton(
            labelText,
            "button-secondary",
            () =>
              void this.#updateHighlightFragment(
                annotation.id,
                fragment.id,
                quote.value,
                fragment.prefix,
                fragment.suffix,
                adjustSelectionRects(fragment.rects, adjustment),
              ),
          );
          button.setAttribute("aria-label", `${labelText} highlight stroke ${index + 1}`);
          controls.append(button);
        }
        controls.append(
          actionButton(
            "Save text",
            "button-primary",
            () =>
              void this.#updateHighlightFragment(annotation.id, fragment.id, quote.value, fragment.prefix, fragment.suffix, fragment.rects),
          ),
          actionButton("Erase stroke", "button-secondary", () => void this.#removeHighlightFragment(annotation.id, fragment.id, true)),
        );
        row.append(quote, controls);
        strokeEditor.append(row);
      }
      const passage = links.find((link) => link.annotationId === annotation.id);
      if (passage) {
        const openPassage = actionButton(anchorActionLabel(passage.resolution), "button-secondary w-full justify-center", () =>
          this.#showPassage(passage.anchor),
        );
        openPassage.dataset.anchorLinkId = passage.id;
        openPassage.disabled = passage.resolution.status !== "resolved";
        openPassage.dataset.anchorStatus = passage.resolution.status;
        openPassage.dataset.anchorMatch = anchorMatchState(passage.resolution);
        actions.append(openPassage);
      }
      card.append(label, actions, strokeEditor);
      const target = targets.get(annotation.pdfId);
      if (target) {
        target.append(card);
        const count = (annotationCounts.get(annotation.pdfId) ?? 0) + 1;
        annotationCounts.set(annotation.pdfId, count);
        const group = target.closest<HTMLDetailsElement>("[data-pdf-annotation-group]");
        if (group) group.hidden = false;
        const badge = group?.querySelector<HTMLElement>("[data-pdf-annotation-count]");
        if (badge) badge.textContent = String(count);
      } else {
        this.#elements.unassignedAnnotationList.hidden = false;
        this.#elements.unassignedAnnotationList.append(card);
      }
    }
    this.#updateProjectEvidenceVisibility(this.#snapshot?.pdfs.length ?? 0, annotations.length);
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
    this.#elements.claimList.replaceChildren();
    this.#elements.newClaim.disabled = this.#snapshot.annotations.length === 0;
    if (claims.length === 0) {
      this.#elements.claimList.append(emptyState("Evidence-backed claims appear here."));
      return;
    }
    const annotations = new Map(this.#snapshot.annotations.map((annotation) => [annotation.id, annotation]));
    for (const claim of claims) {
      const card = document.createElement("article");
      card.className = "resource-card";
      card.dataset.claimResourceId = claim.id;
      card.tabIndex = -1;
      const evidence = this.#snapshot.claimEvidenceLinks.filter((link) => link.claimId === claim.id);
      const grounding = document.createElement("label");
      grounding.className = "flex items-start gap-2";
      const groundingCheckbox = document.createElement("input");
      groundingCheckbox.type = "checkbox";
      groundingCheckbox.className = "mt-1 accent-app-accent";
      groundingCheckbox.dataset.modelEvidenceKey = modelEvidenceKey("claim", claim.id);
      groundingCheckbox.checked = this.#modelEvidenceSelection.has(groundingCheckbox.dataset.modelEvidenceKey);
      groundingCheckbox.setAttribute("aria-label", `Use claim “${accessibleEvidenceExcerpt(claim.text)}” as model evidence`);
      groundingCheckbox.addEventListener("change", () =>
        this.#setModelEvidenceSelected(groundingCheckbox.dataset.modelEvidenceKey ?? "", groundingCheckbox.checked),
      );
      const groundingCopy = document.createElement("span");
      groundingCopy.className = "min-w-0";
      groundingCopy.append(
        resourceLabel(`Claim · ${evidence.length} ${evidence.length === 1 ? "source" : "sources"}`),
        resourceTitle(claim.text),
      );
      grounding.append(groundingCheckbox, groundingCopy);
      card.append(grounding);
      if (claim.note) {
        const note = document.createElement("p");
        note.className = "mt-2 font-sans text-xs leading-5 text-app-text-soft";
        note.textContent = claim.note;
        card.append(note);
      }
      if (evidence.length > 0) {
        const evidenceList = document.createElement("div");
        evidenceList.className = "mt-3 space-y-1";
        for (const link of evidence) {
          const annotation = annotations.get(link.annotationId);
          if (!annotation) continue;
          evidenceList.append(
            actionButton(
              `${link.relation} · ${annotation.comment || `page ${annotation.page}`}`,
              "block w-full text-left font-sans text-xs font-bold text-app-accent-strong underline decoration-app-border underline-offset-4",
              () => this.#focusAnnotationCard(annotation.id),
            ),
          );
        }
        card.append(evidenceList);
      }
      const actions = document.createElement("div");
      actions.className = "mt-3 grid grid-cols-2 gap-2";
      actions.append(
        actionButton("Edit", "button-secondary justify-center", () => this.#openClaimDialog(claim)),
        actionButton("Delete", "button-secondary justify-center", () => void this.#deleteClaim(claim)),
        actionButton("Link selected prose", "button-secondary col-span-2 justify-center", () => void this.#linkClaim(claim.id)),
      );
      const passage = links.find((link) => link.claimId === claim.id);
      if (passage) {
        const openPassage = actionButton(anchorActionLabel(passage.resolution), "button-secondary col-span-2 justify-center", () =>
          this.#showPassage(passage.anchor),
        );
        openPassage.dataset.anchorLinkId = passage.id;
        openPassage.disabled = passage.resolution.status !== "resolved";
        openPassage.dataset.anchorStatus = passage.resolution.status;
        openPassage.dataset.anchorMatch = anchorMatchState(passage.resolution);
        actions.append(openPassage);
      }
      card.append(actions);
      this.#elements.claimList.append(card);
    }
  }

  #renderManuscriptComments(comments: ManuscriptComment[]): void {
    this.#elements.manuscriptCommentCount.textContent = String(comments.filter((comment) => comment.status === "open").length);
    this.#elements.manuscriptCommentList.replaceChildren();
    if (comments.length === 0) {
      this.#elements.manuscriptCommentList.append(emptyState("No manuscript comments yet."));
      return;
    }
    for (const comment of comments) {
      const card = document.createElement("article");
      card.className = "resource-card";
      card.dataset.commentResourceId = comment.id;
      const meta = resourceLabel(`${comment.status} · ${comment.authorLabel}`);
      const body = document.createElement("p");
      body.className = "mt-2 text-sm leading-6";
      body.textContent = comment.body;
      const excerpt = document.createElement("blockquote");
      excerpt.className = "mt-2 border-l-2 border-app-line pl-3 font-sans text-xs leading-5 text-app-text-soft";
      excerpt.textContent = comment.anchor.exact;
      const actions = document.createElement("div");
      actions.className = "mt-3 flex flex-wrap gap-2";
      const open = actionButton(anchorActionLabel(comment.resolution), "button-secondary", () => this.#showPassage(comment.anchor));
      open.disabled = comment.resolution.status !== "resolved";
      actions.append(open);
      if (comment.status === "open") {
        if (comment.resolution.status === "stale") {
          actions.append(
            actionButton("Re-anchor to selection", "button-secondary", () => void this.#reanchorManuscriptComment(comment.id)),
          );
        }
        actions.append(actionButton("Resolve", "button-secondary", () => void this.#resolveManuscriptComment(comment.id)));
      }
      card.append(meta, body, excerpt, actions);
      this.#elements.manuscriptCommentList.append(card);
    }
  }

  async #createManuscriptComment(event: SubmitEvent): Promise<void> {
    event.preventDefault();
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
      body: this.#elements.manuscriptCommentBody.value,
    });
    await expectOk(response);
    this.#elements.manuscriptCommentBody.value = "";
    this.#elements.manuscriptCommentStatus.textContent = "Comment saved without changing the Markdown source.";
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
    if (!this.#snapshot || this.#snapshot.annotations.length === 0) {
      this.#showToast("Create an evidence annotation before adding a claim.");
      return;
    }
    this.#editingClaimId = claim?.id;
    this.#elements.claimDialogTitle.textContent = claim ? "Edit claim" : "Create claim";
    this.#elements.claimText.value = claim?.text ?? "";
    this.#elements.claimNote.value = claim?.note ?? "";
    const evidence = claim ? this.#snapshot.claimEvidenceLinks.filter((link) => link.claimId === claim.id) : [];
    this.#elements.claimRelation.value = evidence[0]?.relation ?? "supports";
    const selected = new Set(evidence.map((link) => link.annotationId));
    this.#elements.claimEvidenceOptions.replaceChildren();
    for (const annotation of this.#snapshot.annotations) {
      const label = document.createElement("label");
      label.className = "resource-card flex cursor-pointer items-start gap-2 font-sans text-xs";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = annotation.id;
      checkbox.checked = selected.has(annotation.id);
      checkbox.className = "mt-0.5 accent-app-accent";
      const text = document.createElement("span");
      text.textContent = annotation.comment || `Page ${annotation.page}: ${annotation.quote}`;
      label.append(checkbox, text);
      this.#elements.claimEvidenceOptions.append(label);
    }
    this.#elements.claimDialog.showModal();
    this.#elements.claimText.focus();
  }

  async #saveClaim(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const annotationIds = Array.from(
      this.#elements.claimEvidenceOptions.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'),
    ).map((checkbox) => checkbox.value);
    if (annotationIds.length === 0) {
      this.#showToast("Select at least one source annotation.");
      return;
    }
    const evidence = annotationIds.map((annotationId) => ({
      annotationId,
      relation: readClaimEvidenceRelation(this.#elements.claimRelation.value),
    }));
    const response = await fetch(this.#editingClaimId ? `${apiBase}/claims/${this.#editingClaimId}` : `${apiBase}/claims`, {
      method: this.#editingClaimId ? "PUT" : "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: this.#elements.claimText.value, note: this.#elements.claimNote.value, evidence }),
    });
    await expectOk(response);
    this.#elements.claimDialog.close();
    this.#editingClaimId = undefined;
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
    this.#elements.candidateList.replaceChildren();
    if (candidates.length === 0) {
      this.#elements.candidateList.append(emptyState("Drafts open in Context and do not change the manuscript until applied."));
      return;
    }
    for (const candidate of candidates) {
      const card = document.createElement("article");
      card.className = "resource-card mb-3";
      const top = document.createElement("div");
      top.className = "flex items-center justify-between gap-3";
      top.append(resourceLabel(`${candidate.model} · ${candidate.status}`));
      const stamp = document.createElement("span");
      stamp.className = "font-sans text-[0.65rem] text-app-text-soft";
      stamp.textContent = candidate.operation === "draft-claim" ? candidate.relation : `r${candidate.sourceRevision}`;
      top.append(stamp);
      const excerpt = document.createElement("p");
      excerpt.className = "mt-2 line-clamp-2 font-mono text-xs leading-5 text-app-text-soft";
      excerpt.textContent = candidate.operation === "draft-claim" ? candidate.proposedText : candidate.target.anchor.exact;
      const open = actionButton("Open review", "button-secondary mt-3 w-full justify-center", () => this.#openCandidateContext(candidate));
      card.append(top, excerpt, open);
      this.#elements.candidateList.append(card);
    }
  }

  async #searchKnowledge(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const query = this.#elements.knowledgeSearchInput.value.trim();
    if (!query) {
      this.#elements.knowledgeSearchResults.replaceChildren();
      this.#elements.knowledgeSearchResults.classList.add("hidden");
      this.#elements.projectMapOverview.classList.remove("hidden");
      return;
    }
    try {
      const response = await fetch(`${apiBase}/search?q=${encodeURIComponent(query)}`, { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isKnowledgeSearchResults(value)) throw new Error("Project search returned invalid data");
      this.#renderKnowledgeSearchResults(value);
    } catch (error) {
      this.#elements.knowledgeSearchResults.classList.remove("hidden");
      this.#elements.projectMapOverview.classList.add("hidden");
      this.#elements.knowledgeSearchResults.replaceChildren(emptyState(error instanceof Error ? error.message : "Project search failed"));
    }
  }

  #renderKnowledgeSearchResults(results: KnowledgeSearchResult[]): void {
    this.#elements.knowledgeSearchResults.replaceChildren();
    this.#elements.knowledgeSearchResults.classList.remove("hidden");
    this.#elements.projectMapOverview.classList.add("hidden");
    if (results.length === 0) {
      this.#elements.knowledgeSearchResults.append(emptyState("No matching project resources."));
      return;
    }
    for (const result of results) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "resource-card block w-full text-left";
      button.append(resourceLabel(result.kind), resourceTitle(result.title));
      if (result.excerpt) {
        const excerpt = document.createElement("span");
        excerpt.className = "mt-2 block font-sans text-xs leading-5 text-app-text-soft";
        excerpt.textContent = result.excerpt;
        button.append(excerpt);
      }
      button.addEventListener("click", () => this.#focusKnowledgeResource(result.resourceId));
      this.#elements.knowledgeSearchResults.append(button);
    }
  }

  #renderKnowledgeGraph(graph: WorkspaceKnowledgeGraph): void {
    this.#elements.connectionCount.textContent = String(graph.edges.length);
    this.#elements.projectMapTotal.textContent = `${graph.nodes.length} ${graph.nodes.length === 1 ? "resource" : "resources"} · ${graph.edges.length} ${graph.edges.length === 1 ? "link" : "links"}`;
    this.#renderProjectMap(graph);
    this.#elements.knowledgeConnectionList.replaceChildren();
    if (graph.edges.length === 0) {
      this.#elements.knowledgeConnectionList.append(emptyState("Citations and evidence links appear here as typed connections."));
      return;
    }
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const edge of graph.edges) {
      const from = nodes.get(edge.from);
      const to = nodes.get(edge.to);
      if (!from || !to) continue;
      const card = document.createElement("article");
      card.className = "resource-card";
      card.append(resourceLabel(edge.relation));
      const path = document.createElement("div");
      path.className = "mt-2 flex flex-wrap items-center gap-2 font-sans text-xs";
      path.append(this.#knowledgeLink(from), document.createTextNode("→"), this.#knowledgeLink(to));
      card.append(path);
      if (edge.label) {
        const label = document.createElement("p");
        label.className = "mt-2 font-sans text-xs text-app-text-soft";
        label.textContent = edge.label;
        card.append(label);
      }
      this.#elements.knowledgeConnectionList.append(card);
    }
  }

  #renderProjectMap(graph: WorkspaceKnowledgeGraph): void {
    this.#renderedProjectMapGraph = graph;
    this.#projectMapResizeObserver?.disconnect();
    this.#projectMapResizeObserver = null;
    this.#elements.projectMapGraph.replaceChildren();
    this.#elements.projectMapNodes.replaceChildren();
    if (graph.nodes.length === 0) return;

    const createNode = (node: KnowledgeGraphNode): HTMLButtonElement => {
      const button = actionButton(node.label, "project-map-node", () => this.#focusKnowledgeResource(node.id));
      button.dataset.kind = node.kind;
      button.dataset.lane = projectMapNodeGroup(node.kind);
      button.dataset.resourceId = node.id;
      const kindLabel = node.kind.replaceAll("-", " ");
      button.title = `${kindLabel}: ${node.label}`;
      const kind = document.createElement("span");
      kind.textContent = kindLabel;
      const label = document.createElement("strong");
      label.textContent = node.label;
      button.replaceChildren(kind, label);
      button.addEventListener("pointerenter", () => this.#updateProjectMapEmphasis(node.id));
      button.addEventListener("pointerleave", () => {
        const focused = this.#elements.projectMapNodes.querySelector<HTMLButtonElement>(".project-map-node:focus-visible");
        this.#updateProjectMapEmphasis(focused?.dataset.resourceId ?? null);
      });
      button.addEventListener("focus", () => {
        requestAnimationFrame(() => {
          if (button.matches(":focus-visible")) this.#updateProjectMapEmphasis(node.id);
        });
      });
      button.addEventListener("blur", () => {
        requestAnimationFrame(() => {
          const focused = this.#elements.projectMapNodes.querySelector<HTMLButtonElement>(".project-map-node:focus-visible");
          this.#updateProjectMapEmphasis(focused?.dataset.resourceId ?? null);
        });
      });
      return button;
    };

    const grouped = groupProjectMapNodes(graph.nodes);
    const contextNodes = document.createElement("div");
    contextNodes.className = "project-map-context-nodes";
    contextNodes.setAttribute("role", "group");
    contextNodes.setAttribute("aria-label", "Project context");
    contextNodes.append(...grouped.context.map(createNode));

    const lanes = document.createElement("div");
    lanes.className = "project-map-lanes";
    for (const definition of projectMapLaneDefinitions) {
      const section = document.createElement("section");
      section.className = "project-map-lane";
      section.dataset.lane = definition.id;
      const heading = document.createElement("h3");
      heading.className = "project-map-lane-heading";
      heading.id = `project-map-${definition.id}-heading`;
      heading.textContent = definition.label;
      section.setAttribute("aria-labelledby", heading.id);
      const laneNodes = document.createElement("div");
      laneNodes.className = "project-map-lane-nodes";
      const resources = grouped.lanes[definition.id];
      if (resources.length === 0) laneNodes.append(emptyState("No resources yet."));
      else laneNodes.append(...resources.map(createNode));
      section.append(heading, laneNodes);
      lanes.append(section);
    }

    this.#elements.projectMapNodes.append(contextNodes, lanes);
    this.#projectMapResizeObserver = new ResizeObserver(() => this.#drawProjectMapEdges());
    this.#projectMapResizeObserver.observe(this.#elements.projectMapCanvas);
    requestAnimationFrame(() => this.#drawProjectMapEdges());
  }

  #drawProjectMapEdges(): void {
    const graph = this.#renderedProjectMapGraph;
    const canvas = this.#elements.projectMapCanvas;
    const svg = this.#elements.projectMapGraph;
    const canvasBounds = canvas.getBoundingClientRect();
    if (!graph || canvasBounds.width === 0 || canvasBounds.height === 0) return;

    const svgNamespace = "http://www.w3.org/2000/svg";
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${canvasBounds.width} ${canvasBounds.height}`);

    const definitions = document.createElementNS(svgNamespace, "defs");
    const marker = document.createElementNS(svgNamespace, "marker");
    marker.id = "project-map-arrow";
    marker.setAttribute("viewBox", "0 0 5 5");
    marker.setAttribute("refX", "4.5");
    marker.setAttribute("refY", "2.5");
    marker.setAttribute("markerWidth", "5");
    marker.setAttribute("markerHeight", "5");
    marker.setAttribute("orient", "auto-start-reverse");
    const arrow = document.createElementNS(svgNamespace, "path");
    arrow.setAttribute("d", "M 0 0 L 5 2.5 L 0 5 z");
    arrow.setAttribute("fill", "context-stroke");
    marker.append(arrow);
    definitions.append(marker);
    svg.append(definitions);

    const nodeElements = new Map(
      [...this.#elements.projectMapNodes.querySelectorAll<HTMLButtonElement>(".project-map-node")].flatMap((node) =>
        node.dataset.resourceId ? [[node.dataset.resourceId, node] as const] : [],
      ),
    );
    const labels: SVGTextElement[] = [];
    for (const edge of graph.edges) {
      const fromElement = nodeElements.get(edge.from);
      const toElement = nodeElements.get(edge.to);
      if (!fromElement || !toElement) continue;
      const fromBounds = fromElement.getBoundingClientRect();
      const toBounds = toElement.getBoundingClientRect();
      const fromCenter = {
        x: fromBounds.left - canvasBounds.left + fromBounds.width / 2,
        y: fromBounds.top - canvasBounds.top + fromBounds.height / 2,
      };
      const toCenter = {
        x: toBounds.left - canvasBounds.left + toBounds.width / 2,
        y: toBounds.top - canvasBounds.top + toBounds.height / 2,
      };
      const boundaryPoint = (bounds: DOMRect, center: { x: number; y: number }, toward: { x: number; y: number }) => {
        const deltaX = toward.x - center.x;
        const deltaY = toward.y - center.y;
        const horizontalScale = deltaX === 0 ? Number.POSITIVE_INFINITY : (bounds.width / 2 + 3) / Math.abs(deltaX);
        const verticalScale = deltaY === 0 ? Number.POSITIVE_INFINITY : (bounds.height / 2 + 3) / Math.abs(deltaY);
        const scale = Math.min(horizontalScale, verticalScale);
        return { x: center.x + deltaX * scale, y: center.y + deltaY * scale };
      };
      const start = boundaryPoint(fromBounds, fromCenter, toCenter);
      const end = boundaryPoint(toBounds, toCenter, fromCenter);
      const path = document.createElementNS(svgNamespace, "path");
      path.setAttribute("class", "project-map-edge");
      path.setAttribute("data-project-map-connector", "");
      path.setAttribute("data-from", edge.from);
      path.setAttribute("data-to", edge.to);
      path.setAttribute("data-relation", edge.relation);
      path.setAttribute("marker-end", "url(#project-map-arrow)");
      if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
        const middleX = (start.x + end.x) / 2;
        path.setAttribute("d", `M ${start.x} ${start.y} C ${middleX} ${start.y}, ${middleX} ${end.y}, ${end.x} ${end.y}`);
      } else {
        const middleY = (start.y + end.y) / 2;
        path.setAttribute("d", `M ${start.x} ${start.y} C ${start.x} ${middleY}, ${end.x} ${middleY}, ${end.x} ${end.y}`);
      }
      const title = document.createElementNS(svgNamespace, "title");
      title.textContent = `${edge.relation}: ${fromElement.title} → ${toElement.title}`;
      path.append(title);
      svg.append(path);

      const relationLabel = document.createElementNS(svgNamespace, "text");
      relationLabel.setAttribute("class", "project-map-edge-label");
      relationLabel.setAttribute("data-project-map-connector", "");
      relationLabel.setAttribute("data-from", edge.from);
      relationLabel.setAttribute("data-to", edge.to);
      relationLabel.setAttribute("x", String((start.x + end.x) / 2));
      relationLabel.setAttribute("y", String((start.y + end.y) / 2 - 6));
      relationLabel.textContent = edge.relation.replaceAll("-", " ");
      labels.push(relationLabel);
    }
    svg.append(...labels);
    const focused = this.#elements.projectMapNodes.querySelector<HTMLButtonElement>(".project-map-node:focus-visible");
    this.#updateProjectMapEmphasis(focused?.dataset.resourceId ?? null);
  }

  #updateProjectMapEmphasis(resourceId: string | null): void {
    const graph = this.#renderedProjectMapGraph;
    if (!graph || !resourceId) {
      for (const node of this.#elements.projectMapNodes.querySelectorAll<HTMLElement>(".project-map-node")) {
        delete node.dataset.emphasis;
      }
      for (const connector of this.#elements.projectMapGraph.querySelectorAll<SVGElement>("[data-project-map-connector]")) {
        delete connector.dataset.emphasis;
      }
      return;
    }

    const incidentEdges = graph.edges.filter((edge) => edge.from === resourceId || edge.to === resourceId);
    const connectedResources = new Set(
      incidentEdges.flatMap((edge) => [edge.from, edge.to]).filter((candidate) => candidate !== resourceId),
    );
    for (const node of this.#elements.projectMapNodes.querySelectorAll<HTMLElement>(".project-map-node")) {
      const nodeId = node.dataset.resourceId;
      node.dataset.emphasis = nodeId === resourceId ? "active" : nodeId && connectedResources.has(nodeId) ? "connected" : "muted";
    }
    for (const connector of this.#elements.projectMapGraph.querySelectorAll<SVGElement>("[data-project-map-connector]")) {
      connector.dataset.emphasis = connector.dataset.from === resourceId || connector.dataset.to === resourceId ? "active" : "muted";
    }
  }

  #knowledgeLink(node: KnowledgeGraphNode): HTMLButtonElement {
    return actionButton(node.label, "font-bold text-app-accent-strong underline decoration-app-border underline-offset-4", () =>
      this.#focusKnowledgeResource(node.id),
    );
  }

  #focusKnowledgeResource(resourceId: string): void {
    const separator = resourceId.indexOf(":");
    if (separator < 0) return;
    const kind = resourceId.slice(0, separator);
    const id = resourceId.slice(separator + 1);
    if (kind === "document") {
      this.#showWorkspaceSurface("authoring");
      this.#setAuthoringMode("write");
      this.#elements.source.focus();
      this.#elements.source.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (kind === "project") {
      this.#elements.workspaceSwitcher.focus();
      return;
    }
    if (kind === "person") {
      void this.#openSharing();
      return;
    }
    if (kind === "model-candidate") {
      const candidate = this.#snapshot?.candidates.find((item) => item.id === id);
      if (candidate) this.#openCandidateContext(candidate);
      return;
    }
    if (kind === "note") {
      const share = this.#snapshot?.researchShares.find(
        (item) => item.resourceId === id && item.revokedAt === null && item.content.kind === "note",
      );
      if (share?.content.kind === "note") this.#showToast(excerptForToast(share.content.body));
      return;
    }
    if (kind === "section") {
      this.#activateContext(RESEARCH_PREVIEW_KEY);
      const section = this.#elements.preview.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      section?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (kind === "annotation") {
      const annotation = this.#snapshot?.annotations.find((item) => item.id === id);
      const pdf = annotation ? this.#snapshot?.pdfs.find((item) => item.id === annotation.pdfId) : undefined;
      if (annotation && pdf) void this.#showPaper(pdf, annotation.page, annotation.id);
      return;
    }
    if (kind === "claim") {
      const card = document.querySelector<HTMLElement>(`[data-claim-resource-id="${CSS.escape(id)}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (kind === "pdf") {
      const pdf = this.#snapshot?.pdfs.find((item) => item.id === id);
      if (pdf) void this.#showPaper(pdf);
      return;
    }
    if (kind === "publication") {
      const publication = this.#snapshot?.publications.find((item) => item.id === id);
      if (publication) this.#openPublicationContext(publication);
    }
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
      requestAnimationFrame(() => this.#drawProjectMapEdges());
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

  #bindPaneResizer(): void {
    const resizer = this.#elements.authoringContextResizer;
    const resize = (clientX: number, persist: boolean): void => {
      const authoring = resizer.previousElementSibling;
      const context = resizer.nextElementSibling;
      if (!(authoring instanceof HTMLElement) || !(context instanceof HTMLElement)) return;
      const authoringLeft = authoring.getBoundingClientRect().left;
      const contextRight = context.getBoundingClientRect().right;
      const available = contextRight - authoringLeft - resizer.getBoundingClientRect().width;
      const maximum = Math.max(416, available - 448);
      const width = Math.min(maximum, Math.max(416, clientX - authoringLeft));
      this.#setAuthoringPaneWidth(width);
      if (persist) this.#storeAuthoringPaneWidth(width);
    };
    resizer.addEventListener("pointerdown", (event) => {
      resizer.dataset.dragging = "true";
      resizer.setPointerCapture(event.pointerId);
      resize(event.clientX, false);
    });
    resizer.addEventListener("pointermove", (event) => {
      if (resizer.dataset.dragging === "true") resize(event.clientX, false);
    });
    const finish = (event: PointerEvent, persist: boolean): void => {
      if (resizer.dataset.dragging !== "true") return;
      delete resizer.dataset.dragging;
      if (persist) resize(event.clientX, true);
      if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
      void this.#pdfViewer.resize();
    };
    resizer.addEventListener("pointerup", (event) => finish(event, true));
    resizer.addEventListener("pointercancel", (event) => finish(event, false));
    resizer.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") {
        this.#elements.workspaceSurfaces.style.removeProperty("--authoring-pane-width");
        this.#removeStoredAuthoringPaneWidth();
        resizer.setAttribute("aria-valuenow", "48");
      } else {
        const authoring = resizer.previousElementSibling;
        if (!(authoring instanceof HTMLElement)) return;
        const direction = event.key === "ArrowLeft" ? -24 : 24;
        resize(authoring.getBoundingClientRect().right + direction, true);
      }
      void this.#pdfViewer.resize();
    });
  }

  #setAuthoringPaneWidth(width: number): void {
    this.#elements.workspaceSurfaces.style.setProperty("--authoring-pane-width", `${Math.round(width)}px`);
    const resizer = this.#elements.authoringContextResizer;
    const authoring = resizer.previousElementSibling;
    const context = resizer.nextElementSibling;
    if (!(authoring instanceof HTMLElement) || !(context instanceof HTMLElement)) return;
    const total = authoring.getBoundingClientRect().width + context.getBoundingClientRect().width;
    const percentage = total > 0 ? Math.round((width / total) * 100) : 48;
    resizer.setAttribute("aria-valuenow", String(percentage));
  }

  #paneWidthStorageKey(): string {
    const kind = this.#activeResourceTab()?.kind ?? "preview";
    return `kirjolab:authoring-pane:${workspaceId}:${kind}`;
  }

  #storeAuthoringPaneWidth(width: number): void {
    try {
      localStorage.setItem(this.#paneWidthStorageKey(), String(Math.round(width)));
    } catch {
      // Pane resizing remains usable when browser storage is unavailable.
    }
  }

  #removeStoredAuthoringPaneWidth(): void {
    try {
      localStorage.removeItem(this.#paneWidthStorageKey());
    } catch {
      // Pane resizing remains usable when browser storage is unavailable.
    }
  }

  #restoreAuthoringPaneWidth(): void {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(this.#paneWidthStorageKey());
    } catch {
      // Use the stylesheet default when browser storage is unavailable.
    }
    const width = stored ? Number.parseInt(stored, 10) : Number.NaN;
    if (Number.isFinite(width)) this.#setAuthoringPaneWidth(width);
    else {
      this.#elements.workspaceSurfaces.style.removeProperty("--authoring-pane-width");
      this.#elements.authoringContextResizer.setAttribute("aria-valuenow", "48");
    }
  }

  #captureActiveContextState(): void {
    const key = this.#contextState.activeKey;
    if (key === RESEARCH_PREVIEW_KEY) {
      this.#contextState = setResearchTabScroll(this.#contextState, key, this.#elements.previewScroll.scrollTop);
      return;
    }
    if (key === RESEARCH_LIBRARY_KEY) {
      this.#contextState = setResearchTabScroll(this.#contextState, key, this.#elements.contextLibraryScroll.scrollTop);
      return;
    }
    if (key === RESEARCH_ASSISTANT_KEY) {
      this.#contextState = setResearchTabScroll(this.#contextState, key, this.#elements.contextAssistantScroll.scrollTop);
      return;
    }
    const tab = this.#contextState.tabs.find((item) => item.key === key);
    if (!tab) return;
    const scrollTop =
      tab.kind === "publication"
        ? this.#elements.contextPublicationBody.scrollTop
        : tab.kind === "candidate"
          ? this.#elements.contextCandidateScroll.scrollTop
          : this.#elements.paperReader.scrollTop;
    this.#contextState = setResearchTabScroll(this.#contextState, key, scrollTop);
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
    const activeKey = this.#contextState.activeKey;
    this.#elements.contextPreviewTab.setAttribute("aria-selected", String(activeKey === RESEARCH_PREVIEW_KEY));
    this.#elements.contextPreviewTab.tabIndex = activeKey === RESEARCH_PREVIEW_KEY ? 0 : -1;
    this.#elements.contextLibraryTab.setAttribute("aria-selected", String(activeKey === RESEARCH_LIBRARY_KEY));
    this.#elements.contextLibraryTab.tabIndex = activeKey === RESEARCH_LIBRARY_KEY ? 0 : -1;
    this.#elements.contextAssistantTab.setAttribute("aria-selected", String(activeKey === RESEARCH_ASSISTANT_KEY));
    this.#elements.contextAssistantTab.tabIndex = activeKey === RESEARCH_ASSISTANT_KEY ? 0 : -1;
    this.#elements.contextResourceTabs.replaceChildren();

    for (const tab of this.#contextState.tabs) {
      if (tab.kind === "preview" || tab.kind === "library" || tab.kind === "assistant") continue;
      this.#elements.contextResourceTabs.append(this.#renderContextResourceTab(tab));
    }

    const activeTab = this.#activeResourceTab();
    this.#restoreAuthoringPaneWidth();
    this.#elements.contextPreviewPanel.hidden = activeKey !== RESEARCH_PREVIEW_KEY;
    this.#elements.contextLibraryPanel.hidden = activeKey !== RESEARCH_LIBRARY_KEY;
    this.#elements.contextAssistantPanel.hidden = activeKey !== RESEARCH_ASSISTANT_KEY;
    this.#elements.contextPublicationPanel.hidden = activeTab?.kind !== "publication";
    const activePdf = activeTab?.kind === "pdf" || activeTab?.kind === "library-pdf";
    const activeLibraryArtifact =
      activeTab?.kind === "library-pdf" ? this.#librarySnapshot?.artifacts.find((artifact) => artifact.id === activeTab.id) : undefined;
    const activeLibraryPdf = Boolean(activeLibraryArtifact);
    const activeProjectReferencePdf =
      activeTab?.kind === "library-pdf" && !activeLibraryArtifact && Boolean(this.#projectReferencePdf(activeTab.id));
    this.#elements.contextPdfPanel.hidden = !activePdf;
    this.#elements.contextPdfPanel.dataset.libraryPdf = String(activeTab?.kind === "library-pdf");
    this.#elements.contextPdfPanel.dataset.readonlyPdf = String(activeProjectReferencePdf);
    this.#elements.annotationComposer.hidden = activeLibraryPdf || activeProjectReferencePdf;
    this.#elements.libraryHighlightComposer.hidden = !activeLibraryPdf;
    if (!activeLibraryPdf) this.#setLibraryPdfInspector(false);
    this.#renderLibraryHighlightComposer(activeLibraryArtifact);
    this.#elements.contextCandidatePanel.hidden = activeTab?.kind !== "candidate";
    this.#elements.previewContextControls.hidden = activeKey !== RESEARCH_PREVIEW_KEY;
    this.#elements.previewSyncControls.hidden = activeKey !== RESEARCH_PREVIEW_KEY;
    this.#elements.pdfContextControls.hidden = !activePdf;
    const activePdfPublications =
      activeTab?.kind === "pdf" ? (this.#snapshot?.publicationPdfLinks.filter((link) => link.pdfId === activeTab.id) ?? []) : [];
    this.#elements.citeActivePdf.disabled = activePdfPublications.length !== 1;
    this.#elements.citeActivePdf.textContent =
      activePdfPublications.length > 1
        ? "Choose reference to cite"
        : activePdfPublications.length === 1
          ? "Cite current page"
          : "Identify before citing";
    if (activeTab) {
      const panel =
        activeTab.kind === "publication"
          ? this.#elements.contextPublicationPanel
          : activeTab.kind === "candidate"
            ? this.#elements.contextCandidatePanel
            : this.#elements.contextPdfPanel;
      panel.setAttribute("aria-labelledby", this.#contextTabId(activeTab));
      panel.removeAttribute("aria-label");
    }

    if (activeKey === RESEARCH_PREVIEW_KEY) {
      this.#elements.previewScroll.scrollTop = this.#contextState.tabs[0]?.scrollTop ?? 0;
      return;
    }

    if (activeKey === RESEARCH_LIBRARY_KEY) {
      const libraryTab = this.#contextState.tabs.find((tab) => tab.key === RESEARCH_LIBRARY_KEY);
      this.#elements.contextLibraryScroll.scrollTop = libraryTab?.scrollTop ?? 0;
      return;
    }

    if (activeKey === RESEARCH_ASSISTANT_KEY) {
      const assistantTab = this.#contextState.tabs.find((tab) => tab.key === RESEARCH_ASSISTANT_KEY);
      this.#elements.contextAssistantScroll.scrollTop = assistantTab?.scrollTop ?? 0;
      return;
    }

    if (!activeTab) return;
    if (activeTab.kind === "publication") {
      this.#renderPublicationContext(activeTab);
      this.#elements.contextPublicationBody.scrollTop = activeTab.scrollTop;
      return;
    }
    if (activeTab.kind === "candidate") {
      this.#renderCandidateContext(activeTab);
      this.#elements.contextCandidateScroll.scrollTop = activeTab.scrollTop;
      return;
    }
    if (activeTab.kind === "pdf") this.#renderPublicationIntake(activeTab.id);
    if (loadPdf) void this.#loadActivePdf(false);
  }

  #renderPublicationIntake(pdfId: string): void {
    if (!this.#snapshot) return;
    if (this.#publicationIntake.getSnapshot().context.pdfId !== pdfId) this.#publicationIntake.send({ type: "OPEN", pdfId });

    const publications = this.#snapshot.publicationPdfLinks
      .filter((link) => link.pdfId === pdfId)
      .map((link) => this.#snapshot?.publications.find((publication) => publication.id === link.publicationId))
      .filter((publication): publication is PublicationResource => Boolean(publication));
    const linked = publications.length > 0;
    this.#elements.publicationIntakeForm.hidden = linked;
    this.#elements.publicationIntakeLinked.hidden = !linked;
    this.#elements.publicationIntakeLinkedList.replaceChildren();
    for (const publication of publications) {
      const row = document.createElement("div");
      row.className = "resource-card mt-2 flex items-center justify-between gap-3";
      const copy = document.createElement("div");
      copy.className = "min-w-0";
      copy.append(resourceLabel(`Reference · ${publication.citationKey}`), resourceTitle(bibTeXDisplayText(publication.title)));
      row.append(
        copy,
        actionButton("Open reference", "button-secondary shrink-0", () => this.#openPublicationContext(publication)),
      );
      this.#elements.publicationIntakeLinkedList.append(row);
    }

    const intake = this.#publicationIntake.getSnapshot();
    const preview = intake.context.preview?.pdfId === pdfId ? intake.context.preview : null;
    this.#elements.publicationIntakeReview.hidden = linked || !preview;
    if (linked) {
      this.#elements.publicationIntakeStatus.textContent = `${publications.length} ${publications.length === 1 ? "reference is" : "references are"} connected to this PDF.`;
      return;
    }
    if (!preview) return;
    this.#elements.publicationIntakeTitle.textContent = preview.metadata.title;
    this.#elements.publicationIntakeMeta.textContent = [
      preview.metadata.type,
      preview.metadata.authors.join("; "),
      preview.metadata.year,
      preview.metadata.venue,
      `doi:${preview.doi}`,
    ]
      .filter(Boolean)
      .join(" · ");
    this.#elements.publicationIntakeKey.value = preview.citationKey;
  }

  async #previewPublicationIntake(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const tab = this.#activeResourceTab();
    if (!tab || tab.kind !== "pdf") return;
    const pdfId = tab.id;
    if (this.#publicationIntake.getSnapshot().context.pdfId !== pdfId) this.#publicationIntake.send({ type: "OPEN", pdfId });
    this.#publicationIntake.send({ type: "START_PREVIEW" });
    const request = this.#publicationIntake.getSnapshot().context.requestId;
    this.#updatePublicationIntakeAvailability();
    this.#elements.publicationIntakeStatus.textContent = "Looking up DOI metadata…";
    try {
      const response = await jsonFetch(`${apiBase}/publication-intake/preview`, {
        pdfId,
        doi: this.#elements.publicationIntakeDoi.value,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isPublicationIntakePreview(value)) throw new Error("Publication intake returned an invalid preview");
      const active = this.#activeResourceTab();
      this.#publicationIntake.send({ type: "PREVIEW_READY", requestId: request, preview: value });
      const intake = this.#publicationIntake.getSnapshot();
      if (!intake.matches("reviewing") || intake.context.preview !== value || active?.kind !== "pdf" || active.id !== pdfId) return;
      this.#elements.publicationIntakeStatus.textContent = value.existingPublicationId
        ? "This DOI is already in the library. Review the existing key, then connect this PDF."
        : "Review the metadata and citation key before adding it.";
      this.#renderPublicationIntake(pdfId);
      this.#elements.publicationIntakeKey.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "DOI lookup failed";
      this.#publicationIntake.send({ type: "PREVIEW_FAILED", requestId: request, message });
      if (!this.#publicationIntake.getSnapshot().matches("failed")) return;
      this.#elements.publicationIntakeReview.hidden = true;
      this.#elements.publicationIntakeStatus.textContent = message;
    } finally {
      this.#updatePublicationIntakeAvailability();
    }
  }

  async #acceptPublicationIntake(): Promise<void> {
    const preview = this.#publicationIntake.getSnapshot().context.preview;
    const active = this.#activeResourceTab();
    if (!preview || active?.kind !== "pdf" || active.id !== preview.pdfId) return;
    this.#publicationIntake.send({ type: "ACCEPT" });
    const request = this.#publicationIntake.getSnapshot().context.requestId;
    this.#updatePublicationIntakeAvailability();
    this.#elements.publicationIntakeStatus.textContent = "Adding the reference and connecting this PDF…";
    try {
      const response = await jsonFetch(`${apiBase}/publication-intake/accept`, {
        pdfId: preview.pdfId,
        doi: preview.doi,
        citationKey: this.#elements.publicationIntakeKey.value,
        metadataFingerprint: preview.metadataFingerprint,
      });
      await expectOk(response);
      await this.#resourceRefresh.request();
      const publication = this.#snapshot?.publications.find((item) => item.doi === preview.doi);
      if (!publication) throw new Error("The connected publication could not be found");
      this.#publicationIntake.send({ type: "ACCEPTED", requestId: request });
      this.#elements.publicationIntakeStatus.textContent = "Reference added and PDF connected. Citation remains a separate action.";
      this.#openPublicationContext(publication);
      this.#showToast("Reference added and connected; the manuscript is unchanged.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publication intake failed";
      this.#publicationIntake.send({ type: "ACCEPT_FAILED", requestId: request, message });
      if (!this.#publicationIntake.getSnapshot().matches("reviewing")) return;
      this.#elements.publicationIntakeStatus.textContent = message;
      this.#elements.publicationIntakeKey.focus();
    } finally {
      this.#updatePublicationIntakeAvailability();
    }
  }

  #cancelPublicationIntake(): void {
    this.#publicationIntake.send({ type: "CANCEL" });
    this.#elements.publicationIntakeReview.hidden = true;
    this.#elements.publicationIntakeStatus.textContent = "Lookup cancelled. The library and PDF are unchanged.";
    this.#updatePublicationIntakeAvailability();
    this.#elements.publicationIntakeDoi.focus();
  }

  #updatePublicationIntakeAvailability(): void {
    const submit = this.#elements.publicationIntakeForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!submit) throw new Error("Missing DOI lookup action");
    const busy = publicationIntakeBusy(this.#publicationIntake.getSnapshot());
    submit.disabled = busy;
    this.#elements.publicationIntakeDoi.disabled = busy;
    this.#elements.publicationIntakeKey.disabled = busy;
    this.#elements.publicationIntakeAccept.disabled = busy;
    this.#elements.publicationIntakeCancel.disabled = busy;
  }

  #renderContextResourceTab(tab: ResearchResourceTab): HTMLElement {
    const title = this.#contextTabTitle(tab);
    const item = document.createElement("div");
    item.className = "context-resource-tab";
    item.setAttribute("role", "presentation");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "context-tab";
    button.id = this.#contextTabId(tab);
    button.setAttribute("role", "tab");
    button.setAttribute(
      "aria-controls",
      tab.kind === "publication" ? "context-publication-panel" : tab.kind === "candidate" ? "context-candidate-panel" : "context-pdf-panel",
    );
    button.setAttribute("aria-selected", String(this.#contextState.activeKey === tab.key));
    button.tabIndex = this.#contextState.activeKey === tab.key ? 0 : -1;
    button.title = title;
    button.textContent = title;
    button.addEventListener("click", () => this.#activateContext(tab.key));
    const close = document.createElement("button");
    close.type = "button";
    close.className = "context-tab-close";
    close.setAttribute("aria-label", `Close ${title}`);
    close.title = `Close ${title}`;
    close.innerHTML = '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 4 8 8m0-8-8 8"/></svg>';
    close.addEventListener("click", () => this.#closeContextTab(tab.key));
    item.append(button, close);
    return item;
  }

  #renderCandidateContext(tab: ResearchResourceTab): void {
    if (tab.kind !== "candidate" || !this.#snapshot) return;
    const candidate = this.#snapshot.candidates.find((item) => item.id === tab.id);
    if (!candidate) return;

    const draftsClaim = candidate.operation === "draft-claim";
    this.#elements.contextCandidateEyebrow.textContent = draftsClaim ? "Grounded claim draft" : "Grounded revision";
    this.#elements.contextCandidateTitle.textContent = draftsClaim ? "Draft evidence-backed claim" : "Revise selected passage";
    this.#elements.contextCandidateMeta.textContent = [
      candidate.model,
      candidate.providerLabel,
      candidate.promptVersion,
      draftsClaim ? candidate.relation : `source r${candidate.sourceRevision}`,
    ].join(" · ");
    this.#elements.contextCandidateBefore.textContent = draftsClaim ? candidate.instruction : candidate.target.anchor.exact;
    this.#elements.contextCandidateAfter.textContent = draftsClaim
      ? [candidate.proposedText, candidate.proposedNote].filter(Boolean).join("\n\n")
      : candidate.proposedReplacement;
    this.#elements.contextCandidateBeforeLabel.textContent = draftsClaim ? "Research instruction" : "Original passage";
    this.#elements.contextCandidateAfterLabel.textContent = draftsClaim ? "Proposed claim and note" : "Proposed replacement";
    this.#elements.contextCandidateEvidenceHeading.textContent = draftsClaim
      ? "Annotations used for this claim"
      : "Evidence used for this revision";
    const applicable = this.#candidateApplicable(candidate);
    this.#elements.contextCandidateStatus.textContent =
      candidate.status === "pending"
        ? applicable
          ? draftsClaim
            ? "Pending review. Applying creates a claim linked to these annotation snapshots."
            : "Pending review. Applying changes only this exact selected passage."
          : draftsClaim
            ? "Pending but stale. Reject it or draft again from current annotations."
            : "Pending but stale. Reject it or generate a new revision from current prose and evidence."
        : candidate.status === "accepted"
          ? draftsClaim
            ? "Accepted. The proposal became an evidence-backed claim."
            : "Accepted. The replacement was applied to canonical Markdown."
          : draftsClaim
            ? "Rejected. No claim was created."
            : "Rejected. Canonical Markdown was not changed by this candidate.";

    this.#elements.contextCandidateEvidence.replaceChildren();
    for (const evidence of candidate.evidence) this.#elements.contextCandidateEvidence.append(this.#renderCandidateEvidence(evidence));

    const pending = candidate.status === "pending";
    const candidateDecision = this.#assistantWorkflow.getSnapshot().context.candidateDecision;
    const currentDecision = candidateDecision?.id === candidate.id ? candidateDecision : null;
    const decisionBusy = candidateDecision !== null;
    this.#elements.contextCandidateApply.dataset.candidateId = candidate.id;
    this.#elements.contextCandidateApply.dataset.candidateAction = "apply";
    this.#elements.contextCandidateApply.dataset.candidateApplicable = String(applicable);
    this.#elements.contextCandidateApply.textContent =
      currentDecision?.action === "apply" ? "Applying…" : draftsClaim ? "Create claim" : "Apply replacement";
    this.#elements.contextCandidateApply.disabled =
      decisionBusy || !pending || !applicable || (!draftsClaim && !this.#hasStableDocumentBase());
    this.#elements.contextCandidateReject.dataset.candidateId = candidate.id;
    this.#elements.contextCandidateReject.textContent =
      currentDecision?.action === "reject" ? "Rejecting…" : draftsClaim ? "Reject claim draft" : "Reject revision";
    this.#elements.contextCandidateReject.disabled = decisionBusy || !pending;
  }

  #renderCandidateEvidence(evidence: ModelEvidence): HTMLElement {
    const card = document.createElement("article");
    card.className = "resource-card";
    const title = evidence.kind === "annotation" ? `Annotation · page ${evidence.page}` : "Claim";
    const content = evidence.kind === "annotation" ? evidence.quote : evidence.text;
    card.append(resourceLabel(title), resourceTitle(content));
    const note = document.createElement("p");
    note.className = "mt-2 font-sans text-xs leading-5 text-app-text-soft";
    note.textContent = evidence.kind === "annotation" ? evidence.comment || "No researcher note." : evidence.note || "No working note.";
    card.append(note);

    if (evidence.kind === "annotation") {
      const pdf = this.#snapshot?.pdfs.find((item) => item.id === evidence.pdfId);
      const annotation = this.#snapshot?.annotations.find((item) => item.id === evidence.id);
      if (pdf && annotation) {
        card.append(actionButton("Open evidence", "button-secondary mt-3", () => void this.#showPaper(pdf, evidence.page, evidence.id)));
      }
    } else if (this.#snapshot?.claims.some((claim) => claim.id === evidence.id)) {
      card.append(actionButton("Open claim", "button-secondary mt-3", () => this.#focusClaimCard(evidence.id)));
    }
    return card;
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

  #contextTabId(tab: ResearchResourceTab): string {
    return `context-tab-${tab.kind}-${tab.id}`;
  }

  #contextTabTitle(tab: ResearchResourceTab): string {
    if (tab.kind === "publication") {
      return this.#snapshot?.publications.find((publication) => publication.id === tab.id)?.title ?? "Reference";
    }
    if (tab.kind === "pdf") return this.#snapshot?.pdfs.find((pdf) => pdf.id === tab.id)?.name ?? "Paper";
    if (tab.kind === "library-pdf") {
      return (
        this.#librarySnapshot?.artifacts.find((artifact) => artifact.id === tab.id)?.name ??
        this.#projectReferencePdf(tab.id)?.name ??
        "Reference PDF"
      );
    }
    const candidate = this.#snapshot?.candidates.find((item) => item.id === tab.id);
    return candidate ? `Revision · ${candidate.model} · ${candidate.id.slice(0, 4)}` : "Revision";
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
    let nextIndex: number;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    for (const tab of tabs) tab.tabIndex = tab === tabs[nextIndex] ? 0 : -1;
    tabs[nextIndex]?.focus();
  }

  #renderPublicationContext(tab: ResearchResourceTab): void {
    if (tab.kind !== "publication" || !this.#snapshot) return;
    const publication = this.#snapshot.publications.find((item) => item.id === tab.id);
    if (!publication) return;

    this.#elements.contextPublicationTitle.textContent = bibTeXDisplayText(publication.title);
    this.#elements.contextPublicationMeta.textContent = [
      bibTeXDisplayText(publication.authors.join("; ")),
      publication.year,
      bibTeXDisplayText(publication.venue),
      publication.doi ? `doi:${publication.doi}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    this.#elements.contextPublicationDetails.replaceChildren();
    const source = document.createElement("p");
    source.className = "eyebrow";
    source.textContent = `${publication.type} · ${publication.metadataSource}`;
    const description = document.createElement("p");
    description.className = "mt-3";
    description.textContent = publication.abstract || "No abstract is stored for this publication yet.";
    this.#elements.contextPublicationDetails.append(source, description);

    this.#updateCitationInsertionAvailability();
    const links = this.#snapshot.publicationPdfLinks.filter((link) => link.publicationId === publication.id);
    const papers = this.#publicationPaperOptions(publication.id);
    this.#elements.openPaper.disabled = papers.length !== 1;
    this.#elements.openPaper.textContent = papers.length > 1 ? "Choose a paper below" : "Open linked paper";

    this.#elements.contextPublicationPdfs.replaceChildren();
    if (papers.length === 0) {
      this.#elements.contextPublicationPdfs.append(emptyState("No paper connected to this reference yet."));
    } else {
      for (const paper of papers) {
        const row = document.createElement("div");
        row.className = "resource-card mt-2 flex items-center justify-between gap-3";
        const copy = document.createElement("div");
        copy.className = "min-w-0";
        const name = paper.kind === "library" ? paper.artifact.name : paper.pdf.name;
        const size = paper.kind === "library" ? paper.artifact.size : paper.pdf.size;
        const sourceLabel =
          paper.kind === "project"
            ? "Project PDF"
            : paper.kind === "library"
              ? "Your library PDF"
              : "Linked reference PDF · project members";
        copy.append(resourceLabel(`${sourceLabel} · ${formatBytes(size)}`), resourceTitle(name));
        const actions = document.createElement("div");
        actions.className = "flex shrink-0 gap-2";
        actions.append(actionButton("Open", "button-secondary", () => void this.#openPublicationPaper(paper)));
        if (paper.kind === "project") {
          actions.append(actionButton("Disconnect", "button-secondary", () => void this.#unlinkPublicationPdf(paper.linkId)));
        }
        row.append(copy, actions);
        this.#elements.contextPublicationPdfs.append(row);
      }
    }

    const linkedIds = new Set(links.map((link) => link.pdfId));
    const available = this.#snapshot.pdfs.filter((pdf) => !linkedIds.has(pdf.id));
    this.#elements.publicationPdfLinkForm.hidden = available.length === 0;
    const linkLabel = this.#elements.publicationPdfLinkForm.querySelector<HTMLElement>("[data-publication-pdf-link-label]");
    if (linkLabel) linkLabel.textContent = papers.length > 0 ? "Add another paper from this project" : "Add a paper from this project";
    this.#elements.publicationPdfLink.replaceChildren();
    this.#elements.publicationPdfLink.append(new Option("Choose a project PDF", ""));
    for (const pdf of available) this.#elements.publicationPdfLink.append(new Option(pdf.name, pdf.id));
    this.#elements.publicationPdfLink.disabled = available.length === 0;
    const submit = this.#elements.publicationPdfLinkForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = available.length === 0;
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
    const option = document.createElement("button");
    option.type = "button";
    option.id = `source-completion-option-${index}`;
    option.className = "source-completion-option";
    option.setAttribute("role", "option");
    option.dataset.index = String(index);
    const heading = document.createElement("span");
    heading.className = "source-completion-heading";
    const reference = document.createElement("code");
    reference.textContent = candidate.reference;
    heading.append(reference);
    const metadata = document.createElement("span");
    metadata.className = "source-completion-meta";
    metadata.textContent = `Project file · ${candidate.path}`;
    option.append(heading, metadata);
    option.addEventListener("pointerdown", (event) => event.preventDefault());
    option.addEventListener("click", () => this.#acceptIncludeCompletion(index));
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
    const option = document.createElement("button");
    option.type = "button";
    option.id = `source-completion-option-${index}`;
    option.className = "source-completion-option";
    option.setAttribute("role", "option");
    option.dataset.index = String(index);
    const heading = document.createElement("span");
    heading.className = "source-completion-heading";
    const key = document.createElement("code");
    key.textContent = candidate.key;
    heading.append(key);
    if (candidate.scope === "library") {
      const action = document.createElement("span");
      action.className = "source-completion-action";
      action.textContent = "Add and cite";
      heading.append(action);
    }
    const metadata = document.createElement("span");
    metadata.className = "source-completion-meta";
    metadata.textContent = [candidate.authors.join("; "), candidate.title, candidate.year].filter(Boolean).join(" · ");
    option.append(heading, metadata);
    option.addEventListener("pointerdown", (event) => event.preventDefault());
    option.addEventListener("click", () => void this.#acceptCitationCompletion(index));
    option.addEventListener("mousemove", () => {
      this.#sourceCompletionIndex = index;
      this.#renderSourceCompletionSelection();
    });
    return option;
  }

  #handleSourceCompletionKey(event: KeyboardEvent): void {
    const count =
      this.#sourceCompletionKind === "citation"
        ? this.#citationCompletionCandidates.length
        : this.#sourceCompletionKind === "include"
          ? this.#includeCompletionCandidates.length
          : 0;
    if (this.#elements.sourceCompletion.hidden || count === 0 || event.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      this.#sourceCompletionIndex = (this.#sourceCompletionIndex + direction + count) % count;
      this.#renderSourceCompletionSelection();
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      if (this.#sourceCompletionKind === "citation") void this.#acceptCitationCompletion(this.#sourceCompletionIndex);
      else this.#acceptIncludeCompletion(this.#sourceCompletionIndex);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.#hideSourceCompletion();
    }
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
    this.#elements.insertContextCitation.disabled = !available;
    this.#elements.insertContextCitation.title = available
      ? "Insert this reference at the remembered manuscript caret"
      : "Place the manuscript caret before inserting a citation";
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

  async #linkActivePublicationPdf(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const tab = this.#activeResourceTab();
    const pdfId = this.#elements.publicationPdfLink.value;
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

  async #openOnlyLinkedPaper(): Promise<void> {
    const tab = this.#activeResourceTab();
    if (tab?.kind !== "publication" || !this.#snapshot) return;
    const papers = this.#publicationPaperOptions(tab.id);
    if (papers.length === 1) await this.#openPublicationPaper(papers[0]!);
  }

  async #loadActivePdf(force: boolean): Promise<void> {
    const tab = this.#activeResourceTab();
    if (tab?.kind !== "pdf" && tab?.kind !== "library-pdf") return;
    const workspacePdf = tab.kind === "pdf" ? this.#snapshot?.pdfs.find((item) => item.id === tab.id) : undefined;
    const libraryPdf = tab.kind === "library-pdf" ? this.#librarySnapshot?.artifacts.find((item) => item.id === tab.id) : undefined;
    const projectReferencePdf = tab.kind === "library-pdf" && !libraryPdf ? this.#projectReferencePdf(tab.id) : undefined;
    if (!workspacePdf && !libraryPdf && !projectReferencePdf) return;
    if (workspacePdf) this.#elements.annotationPdf.value = workspacePdf.id;
    const annotations = workspacePdf
      ? (this.#snapshot?.annotations.filter((annotation) => annotation.pdfId === workspacePdf.id) ?? [])
      : [];
    const privateHighlights = libraryPdf
      ? (this.#librarySnapshot?.highlights.filter((highlight) => highlight.artifactId === libraryPdf.id) ?? [])
      : [];
    const pdfUrl = workspacePdf
      ? `${apiBase}/pdfs/${encodeURIComponent(workspacePdf.id)}`
      : libraryPdf
        ? `/api/library/pdfs/${encodeURIComponent(libraryPdf.id)}`
        : projectReferencePdf
          ? `${apiBase}/reference-pdfs/${encodeURIComponent(projectReferencePdf.id)}`
          : null;
    if (!pdfUrl) return;
    this.#pdfViewer.updateAnnotations(annotations);
    this.#pdfViewer.updatePrivateHighlights(privateHighlights);
    if (!force && this.#renderedPdfContextKey === tab.key) {
      this.#elements.paperReader.scrollTop = tab.scrollTop;
      return;
    }
    try {
      const opened = await this.#pdfViewer.open({
        url: pdfUrl,
        annotations,
        page: tab.page,
        ...(tab.focusedAnnotationId ? { focusAnnotationId: tab.focusedAnnotationId } : {}),
        mode: workspacePdf ? "evidence" : libraryPdf ? "private-highlight" : "read-only",
        privateHighlights,
      });
      const active = this.#activeResourceTab();
      if (!opened || active?.key !== tab.key) return;
      this.#renderedPdfContextKey = tab.key;
      this.#renderedPdfId = workspacePdf?.id;
      this.#elements.paperReader.scrollTop = tab.scrollTop;
    } catch (error) {
      const active = this.#activeResourceTab();
      if (active?.key === tab.key) {
        this.#elements.paperStatus.textContent = error instanceof Error ? error.message : "Could not render this PDF";
      }
    }
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

  async #createAnnotation(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const shouldLink = event.submitter === this.#elements.saveAndLinkAnnotation;
    const annotationId = this.#editingAnnotationId;
    if (!annotationId) {
      this.#showToast("Paint a highlight in the PDF before adding a note or manuscript link.");
      return;
    }
    const response = await fetch(`${apiBase}/annotations/${encodeURIComponent(annotationId)}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: this.#elements.annotationComment.value }),
    });
    await expectOk(response);
    await this.#resourceRefresh.request();
    if (shouldLink) await this.#linkAnnotation(annotationId);
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
    if (!start || !end || start.type !== this.#activeFileText || end.type !== this.#activeFileText || start.index >= end.index) return null;
    const excerpt = this.#activeFileText.toString().slice(start.index, end.index);
    return excerpt.trim() && this.#activeFileId ? { fileId: this.#activeFileId, start: start.index, end: end.index, excerpt } : null;
  }

  #assistantTargetScope(): AssistantTargetScope {
    const operation = assistantOperationDefinition(this.#elements.modelOperation.value);
    const scope = this.#elements.assistantTargetScope.value as AssistantTargetScope;
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
    return parseTableRequirements(
      this.#elements.assistantTableCaption.value,
      this.#elements.assistantTableColumns.value,
      this.#elements.assistantTableRows.value,
    );
  }

  #phrasingPurpose(): PhrasingPurpose {
    const value = this.#elements.assistantPhrasingPurpose.value;
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

  #insertSourceSyntax(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-insert-syntax]") : null;
    const includeTarget = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-include-file-id]") : null;
    const includeFile = this.#snapshot?.files.find((file) => file.id === includeTarget?.dataset.includeFileId);
    const activeFile = this.#snapshot?.files.find((file) => file.id === this.#activeFileId);
    if (includeTarget && includeFile && activeFile) {
      event.preventDefault();
      const caret = this.#resolvedAuthoringCaret() ?? this.#elements.source.selectionEnd;
      this.#insertProjectInclude(this.#activeFileText, caret, relativeProjectPath(activeFile.path, includeFile.path));
      this.#elements.editorInsertMenu.open = false;
      this.#showToast(`Included ${includeFile.path}.`);
      return;
    }
    const kind = target?.dataset.insertSyntax;
    if (!kind) return;
    event.preventDefault();
    const passage = this.#selectedAuthoringPassage();
    const caret = this.#resolvedAuthoringCaret() ?? this.#elements.source.selectionEnd;
    const templates: Record<string, { text: string; select?: string }> = {
      citation: { text: ":cite[key]", select: "key" },
      reference: { text: ":ref[target]", select: "target" },
      anchor: { text: "{#label}", select: "label" },
      footnote: { text: "[^note]", select: "note" },
      link: { text: passage ? `[${passage.excerpt}](url)` : "[text](url)", select: passage ? "url" : "text" },
      bibliography: { text: "::bibliography[]" },
    };
    const template = templates[kind];
    if (!template) return;
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
    this.#elements.editorInsertMenu.open = false;
    this.#showToast(`Inserted ${target.textContent?.trim() ?? "scholarly syntax"}.`);
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
        const annotation = this.#snapshot.annotations.find((item) => item.id === id);
        if (!annotation) continue;
        references.push({ kind, id, version: annotation.updatedAt });
        items.push({
          kind,
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
        continue;
      }
      const claim = this.#snapshot.claims.find((item) => item.id === id);
      if (!claim) continue;
      references.push({ kind, id, version: claim.updatedAt });
      items.push({
        kind,
        id,
        label: "Researcher-authored claim",
        content: [`Claim: ${claim.text}`, claim.note ? `Working note: ${claim.note}` : ""].filter(Boolean).join("\n"),
      });
    }
    return { items, references };
  }

  async #generateCandidate(): Promise<void> {
    if (assistantWorkflowBusy(this.#assistantWorkflow.getSnapshot())) return;
    const operation = assistantOperationDefinition(this.#elements.modelOperation.value);
    const draftsClaim = operation.id === "draft-claim";
    if (!this.#snapshot || (!draftsClaim && !this.#hasStableDocumentBase())) {
      this.#elements.modelStatus.textContent = "Wait for the manuscript to finish synchronizing before using the model.";
      return;
    }

    const passage = this.#assistantAuthoringPassage();
    const evidence = this.#modelEvidence();
    const annotationItems = evidence.items.filter((item) => item.kind === "annotation");
    const annotationReferences = evidence.references.filter((item) => item.kind === "annotation");
    const evidenceMissing =
      operation.evidence === "required"
        ? evidence.items.length === 0
        : operation.evidence === "annotations"
          ? annotationItems.length === 0
          : false;
    const insertionTarget = operation.id === "build-table" ? this.#assistantInsertionTarget() : null;
    if (
      (!draftsClaim && operation.id !== "build-table" && !passage) ||
      (operation.id === "build-table" && !insertionTarget) ||
      evidenceMissing
    ) {
      this.#elements.modelStatus.textContent = draftsClaim
        ? "Choose at least one annotation as evidence. Claims cannot ground a new claim draft."
        : "Choose a valid manuscript target, then use Choose evidence for any required grounding.";
      return;
    }
    let provider: OpenAICompatibleBrowserProvider;
    try {
      provider = this.#modelProvider();
    } catch (error) {
      this.#elements.modelStatus.textContent = error instanceof Error ? error.message : "Enter a valid local model endpoint.";
      return;
    }
    const instruction = this.#elements.modelInstruction.value;
    this.#assistantWorkflow.send({ type: "START", operation: operation.id, sourceRevision: this.#revision });
    this.#updateModelAvailability();
    this.#elements.modelStatus.textContent = draftsClaim
      ? "Asking the local model for one grounded claim draft…"
      : operation.id === "clarity-drill"
        ? "Finding the single ambiguity that matters most…"
        : "Asking the local model for a grounded candidate…";
    try {
      if (draftsClaim) {
        const relation = readClaimEvidenceRelation(this.#elements.modelClaimRelation.value);
        const draft = await provider.draftClaim({ instruction, relation, evidence: annotationItems });
        const response = await jsonFetch(`${apiBase}/claim-candidates`, {
          providerAdapter: "openai-compatible",
          providerLabel: draft.providerLabel,
          model: draft.model,
          promptVersion: "draft-claim-v1",
          instruction,
          relation,
          evidence: annotationReferences,
          proposedText: draft.text,
          proposedNote: draft.note,
        });
        await expectOk(response);
        const value: unknown = await response.json();
        if (!isModelCandidate(value) || value.operation !== "draft-claim") {
          throw new Error("Candidate endpoint returned an invalid claim draft");
        }
        await this.#resourceRefresh.request();
        this.#openCandidateContext(this.#snapshot?.candidates.find((item) => item.id === value.id) ?? value);
        this.#elements.modelStatus.textContent = "Claim draft ready. Review its proposition, note, and annotation snapshots in Context.";
        this.#assistantWorkflow.send({ type: "COMPLETE" });
        return;
      }
      if (operation.id === "build-table") {
        if (!insertionTarget) throw new Error("Place the manuscript caret first");
        const sourceRevision = this.#revision;
        const requirements = this.#tableRequirements();
        const source = this.#activeFileText.toString();
        const context = resolveAssistantTarget(source, insertionTarget.end, insertionTarget.end, "paragraph").text;
        const table = await provider.buildTable({
          instruction,
          ...requirements,
          manuscriptContext: context,
        });
        if (table.columns.length !== requirements.columns.length || table.rows.length !== requirements.rows.length) {
          throw new Error("Local model changed the requested table shape");
        }
        this.#renderGeneratedTable(insertionTarget, sourceRevision, table);
        this.#elements.modelStatus.textContent = "Table syntax ready. Review it before inserting at the visible target.";
        this.#assistantWorkflow.send({ type: "REVIEW" });
        return;
      }
      if (!passage) throw new Error("Select manuscript text first");
      const sourceRevision = this.#revision;
      if (operation.id === "phrase-passage") {
        const purpose = this.#phrasingPurpose();
        const patterns = phrasingPatternsForPurpose(purpose.id);
        const result = await provider.phrasePassage({
          selectedPassage: passage.excerpt,
          instruction,
          evidence: evidence.items,
          purpose,
          patterns,
        });
        this.#renderPhrasingAlternatives({ passage, evidence, instruction, sourceRevision }, purpose, result);
        this.#elements.modelStatus.textContent = "Choose one alternative to open exact before-and-after review.";
        this.#assistantWorkflow.send({ type: "REVIEW" });
        return;
      }
      if (operation.id === "find-references") {
        const formulated = await provider.formulateReferenceQuery({
          selectedPassage: passage.excerpt,
          instruction,
          evidence: evidence.items,
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
        return;
      }
      if (operation.id === "ideate") {
        const result = await provider.ideate({ selectedPassage: passage.excerpt, instruction, evidence: evidence.items });
        this.#renderIdeas({ passage, evidence, instruction, sourceRevision }, result);
        this.#elements.modelStatus.textContent = "Choose a direction to open its complete draft for exact review.";
        this.#assistantWorkflow.send({ type: "REVIEW" });
        return;
      }
      if (operation.id === "clarity-drill") {
        const question = await provider.startClarityDrill({
          selectedPassage: passage.excerpt,
          instruction,
          evidence: evidence.items,
        });
        this.#renderClarityQuestion({ provider, passage, evidence, instruction, sourceRevision, question });
        this.#elements.modelStatus.textContent = "Answer one focused question to make the intended meaning explicit.";
        this.#assistantWorkflow.send({ type: "AWAIT_INPUT" });
        return;
      }
      const revision = await provider.reviseSelection({ selectedPassage: passage.excerpt, instruction, evidence: evidence.items });
      await this.#persistRevisionCandidate({
        passage,
        evidence: evidence.references,
        instruction,
        sourceRevision,
        replacement: revision.replacement,
        providerLabel: revision.providerLabel,
        model: revision.model,
      });
      this.#elements.modelStatus.textContent = "Candidate ready. Review its exact replacement and evidence in Context.";
      this.#assistantWorkflow.send({ type: "COMPLETE" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local model request failed";
      this.#assistantWorkflow.send({ type: "FAIL", message });
      this.#elements.modelStatus.textContent = message;
    } finally {
      this.#updateModelAvailability();
    }
  }

  #renderGeneratedTable(target: AuthoringPassage, sourceRevision: number, table: ModelTable): void {
    const markdown = tableMarkdown(table);
    const card = document.createElement("section");
    card.className = "resource-card";
    const label = document.createElement("p");
    label.className = "eyebrow";
    label.textContent = "Validated GFM table";
    const preview = document.createElement("pre");
    preview.className = "mt-3 overflow-x-auto whitespace-pre text-xs";
    preview.textContent = markdown;
    const insert = document.createElement("button");
    insert.className = "button-primary mt-3";
    insert.type = "button";
    insert.textContent = target.start === target.end ? "Insert table" : "Replace selection with table";
    insert.addEventListener("click", () => this.#insertGeneratedTable(target, sourceRevision, markdown));
    card.append(label, preview, insert);
    this.#elements.assistantInteractiveResult.replaceChildren(card);
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
    const card = document.createElement("section");
    card.className = "resource-card";
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "One ambiguity";
    const issue = document.createElement("p");
    issue.className = "mt-2 text-sm text-app-text-soft";
    issue.textContent = input.question.issue;
    const question = document.createElement("h3");
    question.className = "mt-3 text-base font-semibold";
    question.textContent = input.question.question;
    const answer = document.createElement("textarea");
    answer.className = "field mt-3 w-full";
    answer.rows = 3;
    answer.maxLength = 4_000;
    answer.placeholder = "State the concrete meaning you intend…";
    const continueButton = document.createElement("button");
    continueButton.className = "button-primary mt-3";
    continueButton.type = "button";
    continueButton.textContent = "Show precise rewrites";
    continueButton.addEventListener("click", () => void this.#continueClarityDrill(input, answer.value));
    card.append(eyebrow, issue, question, answer, continueButton);
    this.#elements.assistantInteractiveResult.replaceChildren(card);
    answer.focus();
  }

  #renderIdeas(input: AssistantDraftContext, result: ModelIdeas): void {
    const list = document.createElement("div");
    list.className = "grid gap-3";
    for (const idea of result.ideas) {
      const card = document.createElement("section");
      card.className = "resource-card";
      const title = document.createElement("h3");
      title.className = "text-base font-semibold";
      title.textContent = idea.title;
      const direction = document.createElement("p");
      direction.className = "mt-2 text-sm text-app-text-soft";
      direction.textContent = idea.direction;
      const draft = document.createElement("details");
      draft.className = "mt-3";
      const summary = document.createElement("summary");
      summary.className = "cursor-pointer text-xs font-semibold";
      summary.textContent = "Preview complete draft";
      const draftText = document.createElement("p");
      draftText.className = "mt-2 whitespace-pre-wrap text-sm";
      draftText.textContent = idea.draft;
      draft.append(summary, draftText);
      const choose = document.createElement("button");
      choose.className = "button-secondary mt-3";
      choose.type = "button";
      choose.textContent = "Review this direction";
      choose.addEventListener(
        "click",
        () => void this.#chooseIdea(input, idea.title, idea.direction, idea.draft, result.providerLabel, result.model),
      );
      card.append(title, direction, draft, choose);
      list.append(card);
    }
    this.#elements.assistantInteractiveResult.replaceChildren(list);
  }

  #renderPhrasingAlternatives(input: AssistantDraftContext, purpose: PhrasingPurpose, result: ModelPhrasingAlternatives): void {
    const list = document.createElement("div");
    list.className = "grid gap-3";
    for (const [index, alternative] of result.alternatives.entries()) {
      const card = document.createElement("section");
      card.className = "resource-card";
      const label = document.createElement("p");
      label.className = "eyebrow";
      label.textContent = `${purpose.label} · option ${index + 1}`;
      const text = document.createElement("p");
      text.className = "mt-2 whitespace-pre-wrap text-sm";
      text.textContent = alternative.text;
      const rationale = document.createElement("p");
      rationale.className = "mt-2 text-xs text-app-text-soft";
      rationale.textContent = alternative.rationale;
      const choose = document.createElement("button");
      choose.className = "button-secondary mt-3";
      choose.type = "button";
      choose.textContent = "Review this alternative";
      choose.addEventListener(
        "click",
        () => void this.#choosePhrasingAlternative(input, purpose, alternative.text, result.providerLabel, result.model),
      );
      card.append(label, text, rationale, choose);
      list.append(card);
    }
    this.#elements.assistantInteractiveResult.replaceChildren(list);
  }

  async #choosePhrasingAlternative(
    input: AssistantDraftContext,
    purpose: PhrasingPurpose,
    replacement: string,
    providerLabel: string,
    model: string,
  ): Promise<void> {
    if (!this.#assistantWorkflow.getSnapshot().matches("reviewing")) return;
    this.#assistantWorkflow.send({ type: "CONTINUE" });
    this.#updateModelAvailability();
    try {
      await this.#persistRevisionCandidate({
        passage: input.passage,
        evidence: input.evidence.references,
        instruction: `${input.instruction}\nRhetorical purpose: ${purpose.label}`.slice(0, 4_000),
        sourceRevision: input.sourceRevision,
        replacement,
        providerLabel,
        model,
      });
      this.#elements.modelStatus.textContent = "Phrasing alternative ready for exact before-and-after review.";
      this.#assistantWorkflow.send({ type: "COMPLETE" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the phrasing alternative";
      this.#assistantWorkflow.send({ type: "FAIL", message });
      this.#elements.modelStatus.textContent = message;
    } finally {
      this.#updateModelAvailability();
    }
  }

  #renderReferenceDiscovery(query: string, rationale: string, results: readonly ReferenceDiscoveryResult[]): void {
    const container = document.createElement("div");
    container.className = "grid gap-3";
    const summary = document.createElement("section");
    summary.className = "resource-card";
    const label = document.createElement("p");
    label.className = "eyebrow";
    label.textContent = "Registry query";
    const queryText = document.createElement("p");
    queryText.className = "mt-2 text-sm font-semibold";
    queryText.textContent = query;
    const reason = document.createElement("p");
    reason.className = "mt-2 text-xs text-app-text-soft";
    reason.textContent = rationale;
    summary.append(label, queryText, reason);
    container.append(summary);
    for (const result of results) container.append(this.#referenceDiscoveryCard(result));
    this.#elements.assistantInteractiveResult.replaceChildren(container);
  }

  #referenceDiscoveryCard(result: ReferenceDiscoveryResult): HTMLElement {
    const card = document.createElement("article");
    card.className = "resource-card";
    const provider = document.createElement("p");
    provider.className = "eyebrow";
    provider.textContent = result.providers
      .map(({ provider: name }) => (name === "semantic-scholar" ? "Semantic Scholar" : name === "openalex" ? "OpenAlex" : "Crossref"))
      .join(" + ");
    const title = document.createElement("h3");
    title.className = "mt-2 text-base font-semibold";
    title.textContent = result.metadata.title;
    const meta = document.createElement("p");
    meta.className = "mt-2 text-xs text-app-text-soft";
    meta.textContent = [result.metadata.authors.join("; "), result.metadata.year, result.metadata.venue].filter(Boolean).join(" · ");
    const actions = document.createElement("div");
    actions.className = "mt-3 flex flex-wrap gap-2";
    const identifier = result.identifiers[0]!;
    const verify = document.createElement("a");
    verify.className = "button-secondary";
    verify.href = this.#referenceDiscoveryIdentifierUrl(identifier);
    verify.target = "_blank";
    verify.rel = "noopener noreferrer";
    verify.textContent = `Verify ${identifier.scheme === "semantic-scholar" ? "Semantic Scholar" : identifier.scheme.toUpperCase()}`;
    const save = document.createElement("button");
    save.className = "button-primary";
    save.type = "button";
    save.textContent = "Save to library";
    save.addEventListener("click", () => void this.#saveDiscoveredReference(result, save));
    actions.append(verify, save);
    card.append(provider, title, meta, actions);
    return card;
  }

  #referenceDiscoveryIdentifierUrl(identifier: ReferenceDiscoveryResult["identifiers"][number]): string {
    if (identifier.scheme === "doi") return `https://doi.org/${identifier.value}`;
    if (identifier.scheme === "openalex") return `https://openalex.org/${identifier.value}`;
    if (identifier.scheme === "semantic-scholar") return `https://www.semanticscholar.org/paper/${encodeURIComponent(identifier.value)}`;
    if (identifier.scheme === "arxiv") return `https://arxiv.org/abs/${encodeURIComponent(identifier.value)}`;
    return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(identifier.value)}/`;
  }

  async #saveDiscoveredReference(result: ReferenceDiscoveryResult, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const metadata = result.metadata;
      const primaryIdentifier = result.identifiers[0]!;
      const response = await fetch("/api/library/import/csl-json", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          {
            id: metadata.doi || `${primaryIdentifier.scheme}:${primaryIdentifier.value}`,
            type: metadata.type === "article" ? "article-journal" : metadata.type,
            title: metadata.title,
            author: metadata.authors.map((literal) => ({ literal })),
            ...(metadata.year ? { issued: { "date-parts": [[metadata.year]] } } : {}),
            ...(metadata.venue ? { "container-title": metadata.venue } : {}),
            ...(metadata.doi ? { DOI: metadata.doi } : {}),
            URL: metadata.url || this.#referenceDiscoveryIdentifierUrl(primaryIdentifier),
            ...(metadata.abstract ? { abstract: metadata.abstract } : {}),
          },
        ]),
      });
      await expectOk(response);
      await this.#refreshReferenceLibrary();
      button.textContent = "Saved to library";
      this.#elements.modelStatus.textContent = "Reference saved. Use its Library card to add it to this project before citing.";
    } catch (error) {
      button.disabled = false;
      this.#elements.modelStatus.textContent = error instanceof Error ? error.message : "Could not save the reference";
    }
  }

  async #chooseIdea(
    input: AssistantDraftContext,
    title: string,
    direction: string,
    replacement: string,
    providerLabel: string,
    model: string,
  ): Promise<void> {
    if (!this.#assistantWorkflow.getSnapshot().matches("reviewing")) return;
    this.#assistantWorkflow.send({ type: "CONTINUE" });
    this.#updateModelAvailability();
    try {
      const instruction = `${input.instruction}\nChosen direction: ${title}. ${direction}`.slice(0, 4_000);
      await this.#persistRevisionCandidate({
        passage: input.passage,
        evidence: input.evidence.references,
        instruction,
        sourceRevision: input.sourceRevision,
        replacement,
        providerLabel,
        model,
      });
      this.#elements.modelStatus.textContent = "Idea draft ready for exact before-and-after review.";
      this.#assistantWorkflow.send({ type: "COMPLETE" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the idea draft";
      this.#assistantWorkflow.send({ type: "FAIL", message });
      this.#elements.modelStatus.textContent = message;
    } finally {
      this.#updateModelAvailability();
    }
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
      const message = error instanceof Error ? error.message : "Local model request failed";
      this.#assistantWorkflow.send({ type: "FAIL", message });
      this.#elements.modelStatus.textContent = message;
    } finally {
      this.#updateModelAvailability();
    }
  }

  #renderClarityRewrites(input: ClarityDrillContext, answer: string, result: ModelClarityRewrites): void {
    const list = document.createElement("div");
    list.className = "grid gap-3";
    for (const [index, rewrite] of result.rewrites.entries()) {
      const card = document.createElement("section");
      card.className = "resource-card";
      const label = document.createElement("p");
      label.className = "eyebrow";
      label.textContent = `Option ${index + 1}`;
      const text = document.createElement("p");
      text.className = "mt-2 whitespace-pre-wrap text-sm";
      text.textContent = rewrite.text;
      const rationale = document.createElement("p");
      rationale.className = "mt-2 text-xs text-app-text-soft";
      rationale.textContent = rewrite.rationale;
      const choose = document.createElement("button");
      choose.className = "button-secondary mt-3";
      choose.type = "button";
      choose.textContent = "Review this revision";
      choose.addEventListener(
        "click",
        () => void this.#chooseClarityRewrite(input, answer, rewrite.text, result.providerLabel, result.model),
      );
      card.append(label, text, rationale, choose);
      list.append(card);
    }
    this.#elements.assistantInteractiveResult.replaceChildren(list);
  }

  async #chooseClarityRewrite(
    input: ClarityDrillContext,
    answer: string,
    replacement: string,
    providerLabel: string,
    model: string,
  ): Promise<void> {
    if (!this.#assistantWorkflow.getSnapshot().matches("reviewing")) return;
    this.#assistantWorkflow.send({ type: "CONTINUE" });
    this.#updateModelAvailability();
    try {
      const instruction = `${input.instruction}\nClarification: ${answer}`.slice(0, 4_000);
      await this.#persistRevisionCandidate({
        passage: input.passage,
        evidence: input.evidence.references,
        instruction,
        sourceRevision: input.sourceRevision,
        replacement,
        providerLabel,
        model,
      });
      this.#elements.modelStatus.textContent = "Clarity revision ready for exact before-and-after review.";
      this.#assistantWorkflow.send({ type: "COMPLETE" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the clarity revision";
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
    if (action === "apply" && candidate?.operation !== "draft-claim" && !this.#hasStableDocumentBase()) {
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
      this.#showToast(
        action === "apply"
          ? candidate?.operation === "draft-claim"
            ? "Evidence-backed claim created."
            : "Candidate applied to canonical Markdown."
          : candidate?.operation === "draft-claim"
            ? "Claim draft rejected; no claim created."
            : "Candidate rejected; manuscript unchanged.",
      );
    } catch (error) {
      failure = error instanceof Error ? error.message : "Candidate decision failed";
      await this.#resourceRefresh.request().catch(() => undefined);
      this.#showToast(failure);
    } finally {
      this.#assistantWorkflow.send(failure ? { type: "DECISION_FAILED", message: failure } : { type: "DECISION_DONE" });
      this.#renderResearchContext(false);
      this.#updateModelAvailability();
      if (!failure && action === "reject") this.#focusContextTab(RESEARCH_ASSISTANT_KEY);
      const current = this.#snapshot?.candidates.find((candidate) => candidate.id === candidateId);
      if (failure && current?.status === "pending" && this.#activeResourceTab()?.id === candidateId) {
        this.#elements.contextCandidateStatus.textContent = `Could not ${action === "apply" ? "apply" : "reject"} ${current.operation === "draft-claim" ? "claim draft" : "revision"}: ${failure}`;
      }
    }
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
      this.#elements.libraryHighlightPage.value = String(capture.page);
      this.#elements.libraryHighlightQuote.value = capture.quote;
      this.#libraryHighlightRects = capture.rects;
      this.#editingLibraryHighlightId = null;
      this.#elements.libraryHighlightExcerpt.textContent = `“${capture.quote}”`;
      this.#elements.saveLibraryHighlight.textContent = "Save";
      this.#elements.libraryHighlightForm.hidden = false;
      this.#elements.saveLibraryHighlight.disabled = false;
      this.#elements.cancelLibraryHighlight.disabled = false;
      this.#elements.libraryHighlightStatus.textContent = `Page ${capture.page} selection ready.`;
      this.#setLibraryPdfInspector(true);
      return;
    }
    if (activeTab?.kind !== "pdf") return;
    if (this.#renderedPdfId) this.#elements.annotationPdf.value = this.#renderedPdfId;
    this.#elements.annotationPage.value = String(capture.page);
    this.#elements.annotationQuote.value = capture.quote;
    this.#elements.annotationPrefix.value = capture.prefix;
    this.#elements.annotationSuffix.value = capture.suffix;
    this.#elements.annotationSelectionStatus.textContent =
      this.#highlightTool === "erase"
        ? "Erasing overlapping highlight strokes…"
        : `Captured ${capture.rects.length} ${capture.rects.length === 1 ? "line" : "lines"} from page ${capture.page}. Saving automatically…`;
    void this.#persistPdfSelection(capture);
  }

  #renderLibraryHighlightComposer(artifact: LibraryPdfArtifact | undefined): void {
    if (!artifact || !this.#librarySnapshot) return;
    if (this.#elements.libraryHighlightComposer.dataset.artifactId !== artifact.id) {
      this.#resetPdfHighlightImport();
      this.#elements.libraryHighlightComposer.dataset.artifactId = artifact.id;
      this.#elements.libraryHighlightPage.value = "1";
      this.#elements.libraryHighlightQuote.value = "";
      this.#elements.libraryHighlightComment.value = "";
      this.#editingLibraryHighlightId = null;
      this.#pdfAnnotation.send({ type: "CHOOSE_TOOL", tool: this.#libraryPdfTool() });
      this.#elements.saveLibraryHighlight.textContent = "Save";
      this.#elements.libraryHighlightExcerpt.textContent = "";
      this.#elements.libraryHighlightForm.hidden = true;
      this.#elements.saveLibraryHighlight.disabled = true;
      this.#elements.cancelLibraryHighlight.disabled = true;
      this.#elements.libraryHighlightStatus.textContent = "Select text to highlight.";
      this.#setLibraryPdfInspector(false);
    }
    this.#renderLibraryProjectUse(artifact);
    const highlights = this.#librarySnapshot.highlights.filter((highlight) => highlight.artifactId === artifact.id);
    this.#pdfViewer.updatePrivateHighlights(highlights);
    const markups = (this.#librarySnapshot.pdfMarkups ?? []).filter((markup) => markup.artifactId === artifact.id);
    this.#elements.exportLibraryAnnotatedPdf.disabled = highlights.length + markups.length === 0;
    this.#elements.libraryHighlightCount.textContent = String(highlights.length + markups.length);
    this.#elements.libraryHighlightList.replaceChildren();
    if (highlights.length === 0 && markups.length === 0) {
      this.#elements.libraryHighlightList.append(emptyState("No private annotations yet."));
      this.#renderPdfMarkups();
      return;
    }
    for (const highlight of highlights) {
      const card = document.createElement("article");
      card.className = "resource-card";
      card.append(resourceLabel(`Page ${highlight.page}`), resourceTitle(highlight.quote));
      if (highlight.comment) {
        const comment = document.createElement("span");
        comment.className = "mt-2 block font-sans text-xs leading-5 text-app-text-soft";
        comment.textContent = highlight.comment;
        card.append(comment);
      }
      const actions = document.createElement("div");
      actions.className = "mt-3 flex flex-wrap gap-2";
      actions.append(
        actionButton(`Open page ${highlight.page}`, "button-secondary", () => void this.#openLibraryHighlight(highlight)),
        actionButton("Edit note", "button-secondary", () => this.#editLibraryHighlight(highlight)),
      );
      const linked = this.#snapshot?.projectReferences.some((item) => item.referenceId === highlight.referenceId) ?? false;
      const share = this.#snapshot?.researchShares.find((item) => item.kind === "highlight" && item.resourceId === highlight.id);
      const shareAction = share
        ? actionButton("Revoke highlight share", "button-secondary", () => void this.#revokePrivateResearch(share.id))
        : actionButton(
            "Share highlight with project",
            "button-secondary",
            () => void this.#sharePrivateResearch(highlight.referenceId, "highlight", highlight.id),
          );
      shareAction.disabled = !share && !linked;
      shareAction.title = linked ? "" : "Add the bibliographic reference to this project first";
      if (appMode === "workspace") {
        const citeAction = actionButton("Cite in manuscript", "button-primary", () => void this.#citeLibraryHighlight(highlight));
        citeAction.title = "Add this source to the project if needed, then cite this page at the remembered manuscript caret";
        actions.append(citeAction, shareAction);
      }
      card.append(actions);
      this.#elements.libraryHighlightList.append(card);
    }
    for (const markup of markups) {
      const card = document.createElement("article");
      card.className = "resource-card";
      card.append(
        resourceLabel(`Page ${markup.page} · ${markup.kind}`),
        resourceTitle(markup.kind === "note" ? markup.body : "Freehand drawing"),
      );
      const actions = document.createElement("div");
      actions.className = "mt-3 flex flex-wrap gap-2";
      actions.append(
        actionButton(`Open page ${markup.page}`, "button-secondary", () => void this.#openLibraryPdf(artifact, markup.page)),
        ...(markup.kind === "note" ? [actionButton("Edit note", "button-secondary", () => this.#editLibraryPdfNote(markup))] : []),
        actionButton("Delete", "button-secondary", () => void this.#deleteLibraryPdfMarkup(markup)),
      );
      card.append(actions);
      this.#elements.libraryHighlightList.append(card);
    }
    this.#renderPdfMarkups();
  }

  async #detectLibraryPdfHighlights(): Promise<void> {
    const artifact = this.#activeLibraryPdf();
    if (!artifact?.referenceId) return;
    this.#elements.detectLibraryPdfHighlights.disabled = true;
    this.#elements.libraryHighlightImportStatus.textContent = "Scanning PDF annotations and page highlights…";
    this.#elements.libraryHighlightImportForm.hidden = true;
    this.#elements.libraryHighlightImportList.replaceChildren();
    try {
      const result = await detectImportedPdfHighlights(`/api/library/pdfs/${encodeURIComponent(artifact.id)}`);
      if (this.#activeLibraryPdf()?.id !== artifact.id) return;
      const saved = this.#librarySnapshot?.highlights.filter((highlight) => highlight.artifactId === artifact.id) ?? [];
      const candidates = result.candidates.filter(
        (candidate) =>
          !saved.some((highlight) => highlight.page === candidate.page && libraryPdfRectsOverlap(highlight.rects, candidate.rects)),
      );
      const reviewed = { ...result, candidates };
      this.#pdfHighlightDetection = { artifactId: artifact.id, result: reviewed };
      this.#renderPdfHighlightImportReview(reviewed);
    } catch (error) {
      this.#pdfHighlightDetection = null;
      this.#elements.libraryHighlightImportStatus.textContent =
        error instanceof Error ? `Could not inspect this PDF: ${error.message}` : "Could not inspect this PDF.";
    } finally {
      this.#elements.detectLibraryPdfHighlights.disabled = false;
    }
  }

  #renderPdfHighlightImportReview(result: PdfHighlightDetection): void {
    this.#elements.libraryHighlightImportList.replaceChildren();
    if (result.candidates.length === 0) {
      this.#elements.libraryHighlightImportForm.hidden = true;
      this.#elements.libraryHighlightImportStatus.textContent = `No new highlights found across ${result.pagesScanned} scanned page${result.pagesScanned === 1 ? "" : "s"}.`;
      return;
    }
    const nativeCount = result.candidates.filter((candidate) => candidate.source === "annotation").length;
    const flattenedCount = result.candidates.length - nativeCount;
    this.#elements.libraryHighlightImportStatus.textContent = [
      `${result.candidates.length} candidate${result.candidates.length === 1 ? "" : "s"} found`,
      nativeCount ? `${nativeCount} native` : "",
      flattenedCount ? `${flattenedCount} flattened` : "",
      result.truncated ? "scan limit reached" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    for (const candidate of result.candidates) {
      const row = document.createElement("article");
      row.className = "resource-card";
      row.dataset.highlightImportId = candidate.id;
      const selection = document.createElement("label");
      selection.className = "flex items-start gap-2";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.dataset.highlightImportSelection = "true";
      const content = document.createElement("span");
      content.className = "min-w-0";
      content.append(
        resourceLabel(`Page ${candidate.page} · ${candidate.source === "annotation" ? "PDF annotation" : "Detected yellow highlight"}`),
        resourceTitle(candidate.quote),
      );
      selection.append(checkbox, content);
      const comment = document.createElement("input");
      comment.className = "field mt-2";
      comment.maxLength = 8_000;
      comment.placeholder = "Add a private note (optional)";
      comment.setAttribute("aria-label", `Private note for detected highlight on page ${candidate.page}`);
      comment.value = candidate.comment;
      comment.dataset.highlightImportComment = "true";
      row.append(selection, comment);
      this.#elements.libraryHighlightImportList.append(row);
    }
    this.#elements.libraryHighlightImportForm.hidden = false;
  }

  async #importDetectedPdfHighlights(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const detection = this.#pdfHighlightDetection;
    const artifact = this.#activeLibraryPdf();
    if (!detection || !artifact?.referenceId || detection.artifactId !== artifact.id) return;
    const candidatesById = new Map(detection.result.candidates.map((candidate) => [candidate.id, candidate]));
    const selected: Array<PdfHighlightImportCandidate & { comment: string }> = [];
    for (const row of this.#elements.libraryHighlightImportList.querySelectorAll<HTMLElement>("[data-highlight-import-id]")) {
      const checkbox = row.querySelector<HTMLInputElement>("[data-highlight-import-selection]");
      const candidate = candidatesById.get(row.dataset.highlightImportId ?? "");
      if (!checkbox?.checked || !candidate) continue;
      selected.push({
        ...candidate,
        comment: row.querySelector<HTMLInputElement>("[data-highlight-import-comment]")?.value.trim() ?? "",
      });
    }
    if (selected.length === 0) {
      this.#showToast("Select at least one detected highlight to import.");
      return;
    }
    const submit = this.#elements.libraryHighlightImportForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const response = await jsonFetch(`/api/library/references/${encodeURIComponent(artifact.referenceId)}/highlight-imports`, {
        artifactId: artifact.id,
        candidates: selected.map(({ page, quote, comment, rects }) => ({ page, quote, comment, rects })),
      });
      await expectOk(response);
      this.#resetPdfHighlightImport(`${selected.length} highlight${selected.length === 1 ? "" : "s"} imported privately.`);
      await this.#refreshReferenceLibrary();
      this.#showToast(`${selected.length} PDF highlight${selected.length === 1 ? "" : "s"} imported to your library.`);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  #resetPdfHighlightImport(message = "Detect native annotations and flattened yellow highlights for review."): void {
    this.#pdfHighlightDetection = null;
    this.#elements.libraryHighlightImportForm.hidden = true;
    this.#elements.libraryHighlightImportList.replaceChildren();
    this.#elements.libraryHighlightImportStatus.textContent = message;
    this.#elements.detectLibraryPdfHighlights.disabled = false;
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

  async #saveLibraryHighlight(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const tab = this.#activeResourceTab();
    if (tab?.kind !== "library-pdf") return;
    const artifact = this.#librarySnapshot?.artifacts.find((item) => item.id === tab.id);
    const quote = this.#elements.libraryHighlightQuote.value.trim();
    if (!artifact?.referenceId || !quote) return;
    if (this.#editingLibraryHighlightId) {
      const response = await fetch(
        `/api/library/references/${encodeURIComponent(artifact.referenceId)}/highlights/${encodeURIComponent(this.#editingLibraryHighlightId)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ comment: this.#elements.libraryHighlightComment.value }),
        },
      );
      await expectOk(response);
      this.#clearLibraryHighlightDraft("Private highlight note updated.");
      await this.#refreshReferenceLibrary();
      this.#showToast("Private highlight note updated.");
      return;
    }
    const extendsExisting =
      this.#librarySnapshot?.highlights.some(
        (highlight) =>
          highlight.artifactId === artifact.id &&
          highlight.page === Number(this.#elements.libraryHighlightPage.value) &&
          libraryPdfRectsOverlap(highlight.rects, this.#libraryHighlightRects),
      ) ?? false;
    const response = await jsonFetch(`/api/library/references/${encodeURIComponent(artifact.referenceId)}/highlights`, {
      artifactId: artifact.id,
      page: Number(this.#elements.libraryHighlightPage.value),
      quote,
      comment: this.#elements.libraryHighlightComment.value,
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

  #clearLibraryHighlightDraft(message = "Selection cancelled. Nothing was saved."): void {
    this.#elements.libraryHighlightPage.value = String(this.#pdfViewer.currentPage);
    this.#elements.libraryHighlightQuote.value = "";
    this.#libraryHighlightRects = [];
    this.#editingLibraryHighlightId = null;
    this.#elements.libraryHighlightComment.value = "";
    this.#elements.libraryHighlightExcerpt.textContent = "";
    this.#elements.libraryHighlightForm.hidden = true;
    this.#elements.saveLibraryHighlight.disabled = true;
    this.#elements.saveLibraryHighlight.textContent = "Save";
    this.#elements.cancelLibraryHighlight.disabled = true;
    this.#elements.libraryHighlightStatus.textContent = message;
    this.#pdfViewer.clearDraftSelection();
  }

  #editLibraryHighlight(highlight: LibraryHighlight): void {
    if (this.#selectedLibraryPdfMarkupId()) this.#clearLibraryPdfMarkupSelection(false);
    if (this.#libraryPdfTool() !== "select") this.#setLibraryPdfTool("select");
    this.#pdfAnnotation.send({ type: "SELECT_HIGHLIGHT", id: highlight.id });
    this.#pdfViewer.setPrivateHighlightSelection(true, highlight.id);
    this.#editingLibraryHighlightId = highlight.id;
    this.#elements.libraryHighlightPage.value = String(highlight.page);
    this.#elements.libraryHighlightQuote.value = highlight.quote;
    this.#libraryHighlightRects = [...highlight.rects];
    this.#elements.libraryHighlightExcerpt.textContent = `“${highlight.quote}”`;
    this.#elements.libraryHighlightComment.value = highlight.comment;
    this.#elements.libraryHighlightForm.hidden = false;
    this.#elements.saveLibraryHighlight.disabled = false;
    this.#elements.saveLibraryHighlight.textContent = "Save note";
    this.#elements.cancelLibraryHighlight.disabled = false;
    this.#elements.libraryHighlightStatus.textContent = `Editing the note for page ${highlight.page}.`;
    this.#setLibraryPdfInspector(true);
    this.#elements.libraryHighlightComment.focus();
  }

  #setLibraryPdfInspector(open: boolean, showAnnotations = false): void {
    this.#elements.libraryHighlightComposer.dataset.inspectorOpen = String(open);
    this.#elements.openLibraryPdfInspector.setAttribute("aria-expanded", String(open));
    if (showAnnotations) this.#elements.libraryAnnotationDetails.open = true;
  }

  #closeLibraryPdfInspector(): void {
    if (!this.#elements.libraryHighlightForm.hidden) this.#clearLibraryHighlightDraft();
    if (!this.#elements.libraryNoteForm.hidden) this.#clearLibraryPdfNoteDraft();
    if (!this.#elements.libraryMarkupSelection.hidden) this.#clearLibraryPdfMarkupSelection();
    this.#setLibraryPdfInspector(false);
    this.#elements.openLibraryPdfInspector.focus();
  }

  #setLibraryPdfTool(tool: "select" | "text" | "note" | "draw"): void {
    this.#pdfAnnotation.send({ type: "CHOOSE_TOOL", tool });
    if (tool !== "draw") delete this.#elements.paperMarkups.dataset.drawingActive;
    this.#elements.paperMarkups.dataset.tool = tool;
    this.#elements.paperTextLayer.style.pointerEvents = tool === "text" ? "auto" : "none";
    for (const [button, value] of [
      [this.#elements.librarySelectTool, "select"],
      [this.#elements.libraryTextTool, "text"],
      [this.#elements.libraryNoteTool, "note"],
      [this.#elements.libraryDrawTool, "draw"],
    ] as const)
      button.setAttribute("aria-pressed", String(tool === value));
    this.#elements.libraryInkOptions.hidden = tool !== "draw";
    this.#pdfViewer.setPrivateHighlightSelection(tool === "select", this.#selectedLibraryHighlightId());
    this.#elements.libraryHighlightStatus.textContent =
      tool === "select"
        ? "Tap an existing highlight, line, or note to edit it. Drag a selected note to move it."
        : tool === "text"
          ? "Select text to highlight."
          : tool === "note"
            ? "Tap the page to place a note."
            : "Draw with Apple Pencil or a mouse. Touch gestures pan and zoom.";
    if (tool !== "note") this.#clearLibraryPdfNoteDraft(false);
    if (tool !== "select") this.#clearLibraryPdfMarkupSelection(false);
    if (this.#elements.libraryHighlightForm.hidden && this.#elements.libraryNoteForm.hidden && this.#elements.libraryMarkupSelection.hidden)
      this.#setLibraryPdfInspector(false);
  }

  #startLibraryPdfMarkup(event: PointerEvent): void {
    const note = (event.target as Element).closest<HTMLButtonElement>(".pdf-note-pin");
    if (note) {
      const id = note.dataset.markupId;
      if (!id || this.#libraryPdfTool() !== "select") return;
      this.#selectLibraryPdfMarkup(id);
      this.#pdfAnnotation.send({
        type: "START_NOTE_DRAG",
        id,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      });
      this.#elements.paperMarkups.setPointerCapture(event.pointerId);
      return;
    }
    const drawing = (event.target as Element).closest<SVGElement>(".pdf-ink-stroke");
    if (drawing?.dataset.markupId && this.#libraryPdfTool() === "select") {
      event.preventDefault();
      this.#selectLibraryPdfMarkup(drawing.dataset.markupId);
      return;
    }
    const point = this.#normalizedPdfPoint(event);
    if (!point) return;
    if (this.#libraryPdfTool() === "note") {
      this.#pdfAnnotation.send({ type: "PLACE_NOTE", page: this.#pdfViewer.currentPage, point });
      this.#elements.libraryNoteForm.hidden = false;
      this.#setLibraryPdfInspector(true);
      this.#renderPdfMarkups();
      this.#elements.libraryNoteBody.focus();
      return;
    }
    if (this.#libraryPdfTool() !== "draw") return;
    if (event.pointerType === "touch") {
      this.#elements.libraryHighlightStatus.textContent = "Use Apple Pencil or a mouse to draw; touch gestures pan and zoom the page.";
      return;
    }
    event.preventDefault();
    this.#pdfAnnotation.send({ type: "START_DRAWING", pointerId: event.pointerId, point });
    this.#elements.paperMarkups.setPointerCapture(event.pointerId);
    this.#elements.paperMarkups.dataset.drawingActive = "true";
    this.#renderPdfMarkups();
  }

  #continueLibraryPdfDrawing(event: PointerEvent): void {
    const drag = this.#pdfNoteDrag();
    if (drag?.pointerId === event.pointerId) {
      const point = this.#normalizedPdfPoint(event);
      const pin = this.#elements.paperMarkups.querySelector<HTMLElement>(`.pdf-note-pin[data-markup-id="${CSS.escape(drag.id)}"]`);
      if (!point || !pin) return;
      this.#pdfAnnotation.send({ type: "MOVE_NOTE_DRAG", pointerId: event.pointerId, x: event.clientX, y: event.clientY });
      if (this.#pdfNoteDrag()?.moved) {
        event.preventDefault();
        pin.style.left = `${point.x * 100}%`;
        pin.style.top = `${point.y * 100}%`;
      }
      return;
    }
    const draft = this.#pdfDrawingDraft();
    if (this.#pdfDrawingPointer() !== event.pointerId || !draft) return;
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
  }

  async #finishLibraryPdfDrawing(event: PointerEvent): Promise<void> {
    if (this.#pdfNoteDrag()?.pointerId === event.pointerId) {
      await this.#finishLibraryPdfNoteDrag(event);
      return;
    }
    const draft = this.#pdfDrawingDraft();
    if (this.#pdfDrawingPointer() !== event.pointerId || !draft) return;
    const points = [...draft];
    this.#pdfAnnotation.send({ type: "FINISH_DRAWING", pointerId: event.pointerId });
    this.#cancelLibraryPdfDrawing();
    const artifact = this.#activeLibraryPdf();
    if (!artifact?.referenceId || points.length < 2) return this.#renderPdfMarkups();
    const response = await jsonFetch(`/api/library/references/${encodeURIComponent(artifact.referenceId)}/pdf-markups`, {
      kind: "drawing",
      artifactId: artifact.id,
      page: this.#pdfViewer.currentPage,
      color: this.#elements.libraryDrawColor.value,
      width: Number(this.#elements.libraryDrawWidth.value),
      points,
    });
    await expectOk(response);
    await this.#refreshReferenceLibrary();
    this.#showToast("Drawing saved privately.");
  }

  #cancelLibraryPdfDrawing(): void {
    this.#pdfAnnotation.send({ type: "CANCEL_POINTER" });
    delete this.#elements.paperMarkups.dataset.drawingActive;
    this.#pdfDrawingDraftLine = null;
  }

  async #saveLibraryPdfNote(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const artifact = this.#activeLibraryPdf();
    const noteDraft = this.#pendingPdfNote();
    const body = this.#elements.libraryNoteBody.value.trim();
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
    this.#elements.libraryNoteBody.value = "";
    this.#elements.libraryNoteForm.hidden = true;
    if (render) this.#renderPdfMarkups();
  }

  #editLibraryPdfNote(note: LibraryPdfNote): void {
    if (this.#libraryPdfTool() !== "select") this.#setLibraryPdfTool("select");
    this.#pdfAnnotation.send({ type: "EDIT_NOTE", id: note.id, page: note.page, point: { x: note.x, y: note.y } });
    this.#elements.libraryNoteBody.value = note.body;
    this.#elements.libraryNoteForm.hidden = false;
    this.#elements.libraryHighlightStatus.textContent = `Editing the note on page ${note.page}.`;
    this.#setLibraryPdfInspector(true);
    this.#elements.libraryNoteBody.focus();
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
    if (!this.#elements.libraryHighlightForm.hidden) this.#clearLibraryHighlightDraft();
    this.#pdfAnnotation.send({ type: "SELECT_MARKUP", id: markup.id });
    this.#pdfViewer.setPrivateHighlightSelection(true);
    this.#elements.libraryMarkupSelection.hidden = false;
    this.#elements.libraryMarkupSelectionLabel.textContent =
      markup.kind === "note" ? `Note on page ${markup.page} · drag its pin to move` : `Line on page ${markup.page}`;
    this.#elements.librarySelectedDrawingOptions.hidden = markup.kind !== "drawing";
    this.#elements.editSelectedLibraryNote.hidden = markup.kind !== "note";
    if (markup.kind === "drawing") {
      this.#elements.librarySelectedDrawColor.value = markup.color;
      this.#elements.librarySelectedDrawWidth.value = String(markup.width);
      this.#elements.librarySelectedDrawWidthValue.value = String(markup.width);
    }
    this.#elements.libraryHighlightStatus.textContent =
      markup.kind === "note"
        ? "Note selected. Drag the pin to move it, or edit its text below."
        : "Line selected. Adjust its style or delete it.";
    this.#setLibraryPdfInspector(true);
    this.#renderPdfMarkups();
  }

  #clearLibraryPdfMarkupSelection(render = true): void {
    this.#pdfAnnotation.send({ type: "CLEAR_SELECTION" });
    this.#elements.libraryMarkupSelection.hidden = true;
    this.#pdfViewer.setPrivateHighlightSelection(this.#libraryPdfTool() === "select");
    if (render) this.#renderPdfMarkups();
  }

  #editSelectedLibraryPdfNote(): void {
    const note = (this.#librarySnapshot?.pdfMarkups ?? []).find(
      (item): item is LibraryPdfNote => item.kind === "note" && item.id === this.#selectedLibraryPdfMarkupId(),
    );
    if (note) this.#editLibraryPdfNote(note);
  }

  async #updateSelectedLibraryDrawing(event: SubmitEvent): Promise<void> {
    event.preventDefault();
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
          color: this.#elements.librarySelectedDrawColor.value,
          width: Number(this.#elements.librarySelectedDrawWidth.value),
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
    const markups = artifact
      ? (this.#librarySnapshot?.pdfMarkups ?? []).filter((item) => item.artifactId === artifact.id && item.page === page)
      : [];
    this.#elements.paperMarkups.replaceChildren();
    const drawings = markups.filter((item): item is LibraryPdfDrawing => item.kind === "drawing");
    if (drawingDraft)
      drawings.push({
        id: "draft",
        kind: "drawing",
        referenceId: artifact?.referenceId ?? "",
        artifactId: artifact?.id ?? "",
        page,
        color: this.#elements.libraryDrawColor.value,
        width: Number(this.#elements.libraryDrawWidth.value),
        points: drawingDraft,
        createdAt: "",
        updatedAt: "",
      });
    if (drawings.length) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("pdf-ink-layer");
      svg.setAttribute("viewBox", "0 0 1000 1000");
      svg.setAttribute("preserveAspectRatio", "none");
      for (const drawing of drawings) {
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
        svg.append(line);
        if (drawing.id === "draft") this.#pdfDrawingDraftLine = line;
      }
      this.#elements.paperMarkups.append(svg);
    }
    if (noteDraft?.page === page && !noteDraft.editingId) {
      const draftPin = document.createElement("span");
      draftPin.className = "pdf-note-pin";
      draftPin.dataset.draft = "true";
      draftPin.style.left = `${noteDraft.x * 100}%`;
      draftPin.style.top = `${noteDraft.y * 100}%`;
      draftPin.setAttribute("aria-label", `New note location on page ${page}`);
      draftPin.title = "New note location";
      this.#elements.paperMarkups.append(draftPin);
    }
    for (const note of markups.filter((item): item is LibraryPdfNote => item.kind === "note")) {
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
      if (this.#openPdfNoteId === note.id) {
        const card = document.createElement("aside");
        card.className = "pdf-note-card";
        card.style.left = `${Math.min(note.x * 100, 70)}%`;
        card.style.top = `${Math.min(note.y * 100, 82)}%`;
        card.textContent = note.body;
        this.#elements.paperMarkups.append(card);
      }
    }
    this.#elements.undoLibraryDrawing.disabled = !markups.some((item) => item.kind === "drawing");
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
      this.#openPdfNoteId = this.#openPdfNoteId === drag.id ? null : drag.id;
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

  #downloadAnnotatedPdf(): void {
    const artifact = this.#activeLibraryPdf();
    if (!artifact) return;
    const link = document.createElement("a");
    link.href = `/api/library/pdfs/${encodeURIComponent(artifact.id)}/annotated`;
    link.download = artifact.name.replace(/\.pdf$/iu, "") + "-annotated.pdf";
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
    const overlaps = this.#snapshot.annotations
      .filter((annotation) => annotation.pdfId === pdfId && annotation.page === capture.page)
      .flatMap((annotation) =>
        annotation.fragments
          .filter((fragment) => fragment.rects.some((rect) => capture.rects.some((candidate) => selectionRectsOverlap(rect, candidate))))
          .map((fragment) => ({ annotation, fragment })),
      );
    if (this.#highlightTool === "erase") {
      if (overlaps.length === 0) {
        this.#pdfViewer.clearDraftSelection();
        this.#elements.annotationSelectionStatus.textContent = "The eraser did not cross a saved highlight stroke.";
        return;
      }
      for (const overlap of overlaps) await this.#removeHighlightFragment(overlap.annotation.id, overlap.fragment.id, false);
      this.#pdfViewer.clearDraftSelection();
      this.#elements.annotationSelectionStatus.textContent = `Removed ${overlaps.length} overlapping highlight ${overlaps.length === 1 ? "stroke" : "strokes"}.`;
      this.#showToast("Highlight content erased.");
      return;
    }

    const target = overlaps[0]?.annotation;
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
    this.#elements.annotationComment.value = annotationValue.comment;
    this.#elements.annotationQuote.value = annotationValue.quote;
    this.#elements.annotationPrefix.value = annotationValue.prefix;
    this.#elements.annotationSuffix.value = annotationValue.suffix;
    this.#pdfViewer.clearDraftSelection();
    await this.#resourceRefresh.request();
    this.#elements.annotationSelectionStatus.textContent = target
      ? `Added a stroke to the existing highlight. ${annotationValue.fragments.length} strokes saved automatically.`
      : "Highlight saved automatically. Add an optional note or link it to selected manuscript prose.";
  }

  #setHighlightTool(tool: "paint" | "erase"): void {
    this.#highlightTool = tool;
    this.#elements.highlightPaintTool.setAttribute("aria-pressed", String(tool === "paint"));
    this.#elements.highlightEraserTool.setAttribute("aria-pressed", String(tool === "erase"));
    this.#pdfViewer.setTool(tool);
    this.#elements.annotationSelectionStatus.textContent =
      tool === "paint"
        ? "Paint PDF text to save or extend a highlight."
        : "Select across a saved highlight stroke or tap it to erase that content.";
  }

  async #activateHighlightFragment(annotationId: string, fragmentId: string): Promise<void> {
    if (this.#highlightTool === "erase") {
      await this.#removeHighlightFragment(annotationId, fragmentId, true);
      return;
    }
    const annotation = this.#snapshot?.annotations.find((item) => item.id === annotationId);
    if (!annotation) return;
    this.#editingAnnotationId = annotation.id;
    this.#elements.annotationComment.value = annotation.comment;
    this.#elements.annotationQuote.value = annotation.quote;
    this.#elements.annotationPrefix.value = annotation.prefix;
    this.#elements.annotationSuffix.value = annotation.suffix;
    this.#elements.annotationPage.value = String(annotation.page);
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
        void this.#persistOfflineWorkspace().finally(() => location.reload());
      });
      if (!registered || typeof caches === "undefined") return;
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
    this.#toastTimer = window.setTimeout(() => {
      delete this.#elements.toast.dataset.visible;
      if (this.#elements.toast.matches(":popover-open")) this.#elements.toast.hidePopover();
    }, action?.durationMs ?? 3_200);
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
    const fragment = document.createDocumentFragment();
    let lineNumber = 1;
    let line = sourceEditorLine(lineNumber);
    fragment.append(line);
    for (const segment of editorPresenceSegments(textarea.value, presence())) {
      for (const color of segment.caretColors) {
        const caret = document.createElement("span");
        caret.className = color === "local" ? "local-author-caret" : "collaborator-caret";
        caret.dataset.collaboratorColor = String(color);
        line.append(caret);
      }
      if (!segment.text) continue;
      for (const part of segment.text.split(/(\r\n|\r|\n)/u)) {
        if (!part) continue;
        if (/^(?:\r\n|\r|\n)$/u.test(part)) {
          const newline = document.createElement("span");
          newline.className = "source-editor-newline";
          newline.textContent = part;
          line.append(newline);
          lineNumber += 1;
          line = sourceEditorLine(lineNumber);
          fragment.append(line);
          continue;
        }
        if (segment.kind === null && segment.selectionColor === null) {
          line.append(document.createTextNode(part));
        } else {
          const token = document.createElement("span");
          token.classList.toggle(`markdown-token-${segment.kind}`, segment.kind !== null);
          token.classList.toggle("collaborator-selection", segment.selectionColor !== null && segment.selectionColor !== "local");
          token.classList.toggle("local-author-selection", segment.selectionColor === "local");
          if (segment.selectionColor !== null) token.dataset.collaboratorColor = String(segment.selectionColor);
          token.textContent = part;
          line.append(token);
        }
      }
    }
    highlight.replaceChildren(fragment);
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
    if (!enabled || event.isComposing) return;
    const controlBracket = event.ctrlKey && !event.altKey && !event.metaKey && event.key === "[";
    if ((event.altKey || event.ctrlKey || event.metaKey) && !controlBracket) return;
    const command = handleVimKey(session, snapshot(), controlBracket ? "Ctrl-[" : event.key);
    if (!command.handled) return;
    event.preventDefault();
    event.stopPropagation();
    session = command.session;
    if (command.changed) textarea.value = command.value;
    textarea.setSelectionRange(command.selectionStart, command.selectionEnd, command.selectionDirection);
    if (command.changed) textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
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

function statisticsGroup(title: string, items: readonly { label: string; words: number }[]): HTMLElement {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.className = "font-sans text-sm font-semibold";
  heading.textContent = title;
  const list = document.createElement("dl");
  list.className = "mt-2 divide-y divide-app-line border-y border-app-line";
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "py-3 text-xs text-app-text-soft";
    empty.textContent = `No ${title.toLocaleLowerCase()} in the composed document.`;
    section.append(heading, empty);
    return section;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-3 py-2 text-xs";
    const term = document.createElement("dt");
    term.className = "min-w-0 truncate";
    term.textContent = item.label;
    const detail = document.createElement("dd");
    detail.className = "shrink-0 font-sans font-semibold";
    detail.textContent = item.words.toLocaleString();
    row.append(term, detail);
    list.append(row);
  }
  section.append(heading, list);
  return section;
}

function scholarlyProviderLabel(provider: MetadataRefinementCandidate["provider"]): string {
  if (provider === "openalex") return "OpenAlex";
  if (provider === "crossref") return "Crossref";
  if (provider === "datacite") return "DataCite";
  return "Semantic Scholar";
}

function collectElements(): Elements {
  return {
    preferencesMenu: requiredElement("preferences-menu", HTMLDetailsElement),
    preferencesModelStatus: requiredElement("preferences-model-status", HTMLElement),
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
    workspaceSettingsDialog: requiredElement("workspace-settings-dialog", HTMLDialogElement),
    workspaceSettingsForm: requiredElement("workspace-settings-form", HTMLFormElement),
    workspaceSettingsTitle: requiredElement("workspace-settings-title", HTMLInputElement),
    workspaceEntryFile: requiredElement("workspace-entry-file", HTMLSelectElement),
    workspaceCitationStyle: requiredElement("workspace-citation-style", HTMLSelectElement),
    workspaceCitationLocale: requiredElement("workspace-citation-locale", HTMLSelectElement),
    workspaceSubmissionTemplate: requiredElement("workspace-submission-template", HTMLSelectElement),
    workspacePaperSize: requiredElement("workspace-paper-size", HTMLSelectElement),
    closeWorkspaceSettings: requiredElement("close-workspace-settings", HTMLButtonElement),
    saveWorkspaceTemplate: requiredElement("save-workspace-template", HTMLButtonElement),
    duplicateWorkspace: requiredElement("duplicate-workspace", HTMLButtonElement),
    archiveWorkspace: requiredElement("archive-workspace", HTMLButtonElement),
    deleteWorkspace: requiredElement("delete-workspace", HTMLButtonElement),
    workspaceCatalogDialog: requiredElement("workspace-catalog-dialog", HTMLDialogElement),
    closeWorkspaceCatalog: requiredElement("close-workspace-catalog", HTMLButtonElement),
    workspaceCatalogFilter: requiredElement("workspace-catalog-filter", HTMLInputElement),
    workspaceCatalogList: requiredElement("workspace-catalog-list", HTMLElement),
    newWorkspace: requiredElement("new-workspace", HTMLButtonElement),
    newWorkspaceDialog: requiredElement("new-workspace-dialog", HTMLDialogElement),
    newWorkspaceForm: requiredElement("new-workspace-form", HTMLFormElement),
    newWorkspaceTitle: requiredElement("new-workspace-title", HTMLInputElement),
    newWorkspaceTemplateList: requiredElement("new-workspace-template-list", HTMLElement),
    newWorkspaceTemplatePreview: requiredElement("new-workspace-template-preview", HTMLElement),
    newWorkspaceTemplateId: requiredElement("new-workspace-template-id", HTMLInputElement),
    newWorkspaceTemplateStatus: requiredElement("new-workspace-template-status", HTMLElement),
    newWorkspaceSubmit: requiredElement("create-workspace", HTMLButtonElement),
    cancelNewWorkspace: requiredElement("cancel-new-workspace", HTMLButtonElement),
    openLatexImport: requiredElement("open-latex-import", HTMLButtonElement),
    latexImportDialog: requiredElement("latex-import-dialog", HTMLDialogElement),
    latexImportForm: requiredElement("latex-import-form", HTMLFormElement),
    latexImportTitle: requiredElement("latex-import-title", HTMLInputElement),
    latexImportArchive: requiredElement("latex-import-archive", HTMLInputElement),
    latexRootField: requiredElement("latex-root-field", HTMLElement),
    latexImportRoot: requiredElement("latex-import-root", HTMLSelectElement),
    latexImportPreview: requiredElement("latex-import-preview", HTMLElement),
    latexImportStatus: requiredElement("latex-import-status", HTMLElement),
    confirmLatexImport: requiredElement("confirm-latex-import", HTMLButtonElement),
    previewLatexImport: requiredElement("preview-latex-import", HTMLButtonElement),
    cancelLatexImport: requiredElement("cancel-latex-import", HTMLButtonElement),
    openGitHubImport: requiredElement("open-github-import", HTMLButtonElement),
    gitHubImportDialog: requiredElement("github-import-dialog", HTMLDialogElement),
    gitHubImportForm: requiredElement("github-import-form", HTMLFormElement),
    gitHubConnectionStatus: requiredElement("github-connection-status", HTMLElement),
    connectGitHubAccount: requiredElement("connect-github-account", HTMLAnchorElement),
    installGitHubApp: requiredElement("install-github-app", HTMLAnchorElement),
    disconnectGitHubAccount: requiredElement("disconnect-github-account", HTMLButtonElement),
    gitHubImportTitle: requiredElement("github-import-title", HTMLInputElement),
    gitHubInstallationId: requiredElement("github-installation-id", HTMLSelectElement),
    gitHubRepository: requiredElement("github-repository", HTMLSelectElement),
    gitHubBranch: requiredElement("github-branch", HTMLSelectElement),
    gitHubRootPath: requiredElement("github-root-path", HTMLInputElement),
    gitHubEntryPath: requiredElement("github-entry-path", HTMLInputElement),
    gitHubImportPreview: requiredElement("github-import-preview", HTMLElement),
    gitHubImportStatus: requiredElement("github-import-status", HTMLElement),
    confirmGitHubImport: requiredElement("confirm-github-import", HTMLButtonElement),
    previewGitHubImport: requiredElement("preview-github-import", HTMLButtonElement),
    cancelGitHubImport: requiredElement("cancel-github-import", HTMLButtonElement),
    gitHubSyncStatus: requiredElement("github-sync-status", HTMLElement),
    gitHubPullReview: requiredElement("github-pull-review", HTMLElement),
    previewGitHubPull: requiredElement("preview-github-pull", HTMLButtonElement),
    confirmGitHubPull: requiredElement("confirm-github-pull", HTMLButtonElement),
    gitHubPublishMessage: requiredElement("github-publish-message", HTMLInputElement),
    gitHubPublishReview: requiredElement("github-publish-review", HTMLElement),
    previewGitHubPublish: requiredElement("preview-github-publish", HTMLButtonElement),
    confirmGitHubPublish: requiredElement("confirm-github-publish", HTMLButtonElement),
    disconnectGitHub: requiredElement("disconnect-github", HTMLButtonElement),
    saveTemplateDialog: requiredElement("save-template-dialog", HTMLDialogElement),
    saveTemplateForm: requiredElement("save-template-form", HTMLFormElement),
    saveTemplateTarget: requiredElement("save-template-target", HTMLSelectElement),
    saveTemplateName: requiredElement("save-template-name", HTMLInputElement),
    saveTemplateDescription: requiredElement("save-template-description", HTMLTextAreaElement),
    saveTemplateStatus: requiredElement("save-template-status", HTMLElement),
    cancelSaveTemplate: requiredElement("cancel-save-template", HTMLButtonElement),
    shareWorkspace: requiredElement("share-workspace", HTMLButtonElement),
    shareWorkspaceDialog: requiredElement("share-workspace-dialog", HTMLDialogElement),
    closeShareWorkspace: requiredElement("close-share-workspace", HTMLButtonElement),
    workspaceMemberList: requiredElement("workspace-member-list", HTMLElement),
    inviteMemberForm: requiredElement("invite-member-form", HTMLFormElement),
    inviteMemberEmail: requiredElement("invite-member-email", HTMLInputElement),
    readOnlyShareStatus: requiredElement("read-only-share-status", HTMLElement),
    createReadOnlyShare: requiredElement("create-read-only-share", HTMLButtonElement),
    readOnlyShareLinkRow: requiredElement("read-only-share-link-row", HTMLElement),
    readOnlyShareLink: requiredElement("read-only-share-link", HTMLInputElement),
    copyReadOnlyShare: requiredElement("copy-read-only-share", HTMLButtonElement),
    revokeReadOnlyShare: requiredElement("revoke-read-only-share", HTMLButtonElement),
    editShareStatus: requiredElement("edit-share-status", HTMLElement),
    createEditShare: requiredElement("create-edit-share", HTMLButtonElement),
    editShareLinkRow: requiredElement("edit-share-link-row", HTMLElement),
    editShareLink: requiredElement("edit-share-link", HTMLInputElement),
    copyEditShare: requiredElement("copy-edit-share", HTMLButtonElement),
    revokeEditShare: requiredElement("revoke-edit-share", HTMLButtonElement),
    referenceLibraryList: requiredElement("reference-library-list", HTMLElement),
    libraryDiscoveryForm: requiredElement("library-discovery-form", HTMLFormElement),
    libraryDiscoveryQuery: requiredElement("library-discovery-query", HTMLInputElement),
    libraryDiscoveryAuthor: requiredElement("library-discovery-author", HTMLInputElement),
    libraryDiscoveryYear: requiredElement("library-discovery-year", HTMLInputElement),
    libraryDiscoveryType: requiredElement("library-discovery-type", HTMLSelectElement),
    libraryDiscoveryStatus: requiredElement("library-discovery-status", HTMLElement),
    libraryDiscoveryResults: requiredElement("library-discovery-results", HTMLElement),
    libraryBibliographyUpload: requiredElement("library-bibliography-upload", HTMLInputElement),
    libraryCslUpload: requiredElement("library-csl-upload", HTMLInputElement),
    libraryArchiveUpload: requiredElement("library-archive-upload", HTMLInputElement),
    libraryPdfUpload: requiredElement("library-pdf-upload", HTMLInputElement),
    libraryPdfDropzone: requiredElement("library-pdf-dropzone", HTMLElement),
    libraryPdfUploadStatus: requiredElement("library-pdf-upload-status", HTMLElement),
    showArchivedReferences: requiredElement("show-archived-references", HTMLButtonElement),
    referenceFilterQuery: requiredElement("reference-filter-query", HTMLInputElement),
    referenceFilterType: requiredElement("reference-filter-type", HTMLSelectElement),
    referenceFilterReading: requiredElement("reference-filter-reading", HTMLSelectElement),
    referenceFilterOrganization: requiredElement("reference-filter-organization", HTMLInputElement),
    referenceFilterLinkage: requiredElement("reference-filter-linkage", HTMLSelectElement),
    referenceFilterCompleteness: requiredElement("reference-filter-completeness", HTMLSelectElement),
    referenceFilterSort: requiredElement("reference-filter-sort", HTMLSelectElement),
    referenceFilterCount: requiredElement("reference-filter-count", HTMLElement),
    openCitationNetwork: requiredElement("open-citation-network", HTMLButtonElement),
    citationNetwork: requiredElement("citation-network", HTMLElement),
    closeCitationNetwork: requiredElement("close-citation-network", HTMLButtonElement),
    filterProjectCitations: requiredElement("filter-project-citations", HTMLButtonElement),
    citationAssertionForm: requiredElement("citation-assertion-form", HTMLFormElement),
    citationAssertionCiting: requiredElement("citation-assertion-citing", HTMLSelectElement),
    citationAssertionCited: requiredElement("citation-assertion-cited", HTMLSelectElement),
    citationAssertionPolarity: requiredElement("citation-assertion-polarity", HTMLSelectElement),
    citationNetworkGraph: requiredElement("citation-network-graph", SVGSVGElement),
    citationNetworkList: requiredElement("citation-network-list", HTMLElement),
    webSourceForm: requiredElement("web-source-form", HTMLFormElement),
    webSourceUrl: requiredElement("web-source-url", HTMLInputElement),
    webSnapshotComparison: requiredElement("web-snapshot-comparison", HTMLElement),
    unidentifiedPdfCount: requiredElement("unidentified-pdf-count", HTMLElement),
    unidentifiedPdfList: requiredElement("unidentified-pdf-list", HTMLElement),
    showFilesRail: requiredElement("show-files-rail", HTMLButtonElement),
    showResearchRail: requiredElement("show-research-rail", HTMLButtonElement),
    showCommentsRail: requiredElement("show-comments-rail", HTMLButtonElement),
    showGuideRail: requiredElement("show-guide-rail", HTMLButtonElement),
    filesRailPanel: requiredElement("files-rail-panel", HTMLElement),
    researchRailPanel: requiredElement("research-rail-panel", HTMLElement),
    commentsRailPanel: requiredElement("comments-rail-panel", HTMLElement),
    guideRailPanel: requiredElement("guide-rail-panel", HTMLElement),
    manuscriptMapSummary: requiredElement("manuscript-map-summary", HTMLElement),
    manuscriptMapOutline: requiredElement("manuscript-map-outline", HTMLElement),
    manuscriptMapCueCount: requiredElement("manuscript-map-cue-count", HTMLElement),
    manuscriptMapCues: requiredElement("manuscript-map-cues", HTMLElement),
    researchDiaryEntryCount: requiredElement("research-diary-entry-count", HTMLElement),
    researchDiarySummary: requiredElement("research-diary-summary", HTMLElement),
    openResearchDiary: requiredElement("open-research-diary", HTMLButtonElement),
    researchQuestionCount: requiredElement("research-question-count", HTMLElement),
    researchQuestionList: requiredElement("research-question-list", HTMLElement),
    openResearchQuestions: requiredElement("open-research-questions", HTMLButtonElement),
    editingPass: requiredElement("editing-pass", HTMLSelectElement),
    editingPassCueCount: requiredElement("editing-pass-cue-count", HTMLElement),
    editingPassCues: requiredElement("editing-pass-cues", HTMLElement),
    reviewerResponseCount: requiredElement("reviewer-response-count", HTMLElement),
    reviewerResponseList: requiredElement("reviewer-response-list", HTMLElement),
    openReviewerResponse: requiredElement("open-reviewer-response", HTMLButtonElement),
    downloadReviewerResponse: requiredElement("download-reviewer-response", HTMLButtonElement),
    newProjectFileRail: requiredElement("new-project-file-rail", HTMLButtonElement),
    newProjectFolderRail: requiredElement("new-project-folder-rail", HTMLButtonElement),
    uploadProjectImages: requiredElement("upload-project-images", HTMLButtonElement),
    projectImageUpload: requiredElement("project-image-upload", HTMLInputElement),
    projectFileList: requiredElement("project-file-list", HTMLElement),
    newProjectFile: requiredElement("new-project-file", HTMLButtonElement),
    createAndIncludeProjectFile: requiredElement("create-and-include-project-file", HTMLButtonElement),
    renameProjectFile: requiredElement("rename-project-file", HTMLButtonElement),
    deleteProjectFile: requiredElement("delete-project-file", HTMLButtonElement),
    projectFileDialog: requiredElement("project-file-dialog", HTMLDialogElement),
    projectFileForm: requiredElement("project-file-form", HTMLFormElement),
    projectFileDialogTitle: requiredElement("project-file-dialog-title", HTMLElement),
    projectFileDialogHelp: requiredElement("project-file-dialog-help", HTMLElement),
    projectFilePath: requiredElement("project-file-path", HTMLInputElement),
    saveProjectFile: requiredElement("save-project-file", HTMLButtonElement),
    cancelProjectFile: requiredElement("cancel-project-file", HTMLButtonElement),
    openProjectHistory: requiredElement("open-project-history", HTMLButtonElement),
    openExport: requiredElement("open-export", HTMLButtonElement),
    exportDialog: requiredElement("export-dialog", HTMLDialogElement),
    closeExport: requiredElement("close-export", HTMLButtonElement),
    exportStatistics: requiredElement("export-statistics", HTMLElement),
    wordCountBadge: requiredElement("word-count-badge", HTMLButtonElement),
    projectHistoryDialog: requiredElement("project-history-dialog", HTMLDialogElement),
    closeProjectHistory: requiredElement("close-project-history", HTMLButtonElement),
    projectHistoryCompareForm: requiredElement("project-history-compare-form", HTMLFormElement),
    projectHistoryFrom: requiredElement("project-history-from", HTMLSelectElement),
    projectHistoryTo: requiredElement("project-history-to", HTMLSelectElement),
    projectHistoryInspector: requiredElement("project-history-inspector", HTMLElement),
    projectHistoryList: requiredElement("project-history-list", HTMLElement),
    source: requiredElement("source-editor", HTMLTextAreaElement),
    sourceHighlight: requiredElement("source-editor-highlight", HTMLElement),
    sourceEditorShell: requiredElement("source-editor-shell", HTMLElement),
    sourceCompletion: requiredElement("source-completion", HTMLElement),
    showWriteMode: requiredElement("show-write-mode", HTMLButtonElement),
    showMapMode: requiredElement("show-map-mode", HTMLButtonElement),
    editorWriteActions: requiredElement("editor-write-actions", HTMLElement),
    projectMap: requiredElement("project-map", HTMLElement),
    projectMapTotal: requiredElement("project-map-total", HTMLElement),
    projectMapCanvas: requiredElement("project-map-canvas", HTMLElement),
    projectMapGraph: requiredElement("project-map-graph", SVGSVGElement),
    projectMapNodes: requiredElement("project-map-nodes", HTMLElement),
    projectMapOverview: requiredElement("project-map-overview", HTMLElement),
    vimModeStatus: requiredElement("vim-mode-status", HTMLElement),
    vimToggle: requiredElement("vim-toggle", HTMLButtonElement),
    editorInsertMenu: requiredElement("editor-insert-menu", HTMLDetailsElement),
    includeProjectFileList: requiredElement("include-project-file-list", HTMLElement),
    bibliography: requiredElement("bibliography-editor", HTMLTextAreaElement),
    manuscriptCommentForm: requiredElement("manuscript-comment-form", HTMLFormElement),
    manuscriptCommentBody: requiredElement("manuscript-comment-body", HTMLTextAreaElement),
    manuscriptCommentStatus: requiredElement("manuscript-comment-status", HTMLElement),
    manuscriptCommentCount: requiredElement("manuscript-comment-count", HTMLElement),
    manuscriptCommentList: requiredElement("manuscript-comment-list", HTMLElement),
    workspaceSurfaces: requiredElement("workspace-surfaces", HTMLElement),
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
    contextResourceTabs: requiredElement("context-resource-tabs", HTMLElement),
    previewContextControls: requiredElement("preview-context-controls", HTMLElement),
    previewFileContext: requiredElement("preview-file-context", HTMLElement),
    pdfContextControls: requiredElement("pdf-context-controls", HTMLElement),
    contextPreviewPanel: requiredElement("context-preview-panel", HTMLElement),
    previewScroll: requiredElement("preview-scroll", HTMLElement),
    contextLibraryPanel: requiredElement("context-library-panel", HTMLElement),
    contextLibraryScroll: requiredElement("context-library-scroll", HTMLElement),
    contextAssistantPanel: requiredElement("context-assistant-panel", HTMLElement),
    contextAssistantScroll: requiredElement("context-assistant-scroll", HTMLElement),
    contextPublicationPanel: requiredElement("context-publication-panel", HTMLElement),
    contextPublicationBody: requiredElement("context-publication-body", HTMLElement),
    contextPdfPanel: requiredElement("context-pdf-panel", HTMLElement),
    contextCandidatePanel: requiredElement("context-candidate-panel", HTMLElement),
    contextCandidateScroll: requiredElement("context-candidate-scroll", HTMLElement),
    contextCandidateEyebrow: requiredElement("context-candidate-eyebrow", HTMLElement),
    contextCandidateTitle: requiredElement("context-candidate-title", HTMLElement),
    contextCandidateMeta: requiredElement("context-candidate-meta", HTMLElement),
    contextCandidateStatus: requiredElement("context-candidate-status", HTMLElement),
    contextCandidateBefore: requiredElement("context-candidate-before", HTMLElement),
    contextCandidateBeforeLabel: requiredElement("context-candidate-before-label", HTMLElement),
    contextCandidateAfter: requiredElement("context-candidate-after", HTMLElement),
    contextCandidateAfterLabel: requiredElement("context-candidate-after-label", HTMLElement),
    contextCandidateEvidenceHeading: requiredElement("context-candidate-evidence-heading", HTMLElement),
    contextCandidateEvidence: requiredElement("context-candidate-evidence", HTMLElement),
    contextCandidateApply: requiredElement("context-candidate-apply", HTMLButtonElement),
    contextCandidateReject: requiredElement("context-candidate-reject", HTMLButtonElement),
    contextPublicationTitle: requiredElement("context-publication-title", HTMLElement),
    contextPublicationMeta: requiredElement("context-publication-meta", HTMLElement),
    contextPublicationDetails: requiredElement("context-publication-details", HTMLElement),
    contextPublicationPdfs: requiredElement("context-publication-pdfs", HTMLElement),
    insertContextCitation: requiredElement("insert-context-citation", HTMLButtonElement),
    publicationPdfLinkForm: requiredElement("publication-pdf-link-form", HTMLFormElement),
    publicationPdfLink: requiredElement("publication-pdf-link", HTMLSelectElement),
    preview: requiredElement("preview", HTMLElement),
    diagnostics: requiredElement("diagnostics", HTMLElement),
    diagnosticSummary: requiredElement("diagnostic-summary", HTMLElement),
    connectionDot: requiredElement("connection-dot", HTMLElement),
    connectionStatus: requiredElement("connection-status", HTMLElement),
    editorTargetStatus: requiredElement("editor-target-status", HTMLElement),
    saveStatus: requiredElement("save-status", HTMLElement),
    revisionBadge: requiredElement("revision-badge", HTMLElement),
    pdfUpload: requiredElement("pdf-upload", HTMLInputElement),
    projectEvidence: requiredElement("project-evidence", HTMLDetailsElement),
    projectEvidenceCount: requiredElement("project-evidence-count", HTMLElement),
    pdfList: requiredElement("pdf-list", HTMLElement),
    knowledgeSearchForm: requiredElement("knowledge-search-form", HTMLFormElement),
    knowledgeSearchInput: requiredElement("knowledge-search-input", HTMLInputElement),
    knowledgeSearchResults: requiredElement("knowledge-search-results", HTMLElement),
    publicationCount: requiredElement("publication-count", HTMLElement),
    publicationList: requiredElement("publication-list", HTMLElement),
    annotationList: requiredElement("annotation-list", HTMLElement),
    unassignedAnnotationList: requiredElement("unassigned-annotation-list", HTMLElement),
    claimCount: requiredElement("claim-count", HTMLElement),
    claimList: requiredElement("claim-list", HTMLElement),
    newClaim: requiredElement("new-claim", HTMLButtonElement),
    claimDialog: requiredElement("claim-dialog", HTMLDialogElement),
    claimForm: requiredElement("claim-form", HTMLFormElement),
    claimDialogTitle: requiredElement("claim-dialog-title", HTMLElement),
    claimText: requiredElement("claim-text", HTMLTextAreaElement),
    claimNote: requiredElement("claim-note", HTMLTextAreaElement),
    claimRelation: requiredElement("claim-relation", HTMLSelectElement),
    claimEvidenceOptions: requiredElement("claim-evidence-options", HTMLElement),
    cancelClaim: requiredElement("cancel-claim", HTMLButtonElement),
    connectionCount: requiredElement("connection-count", HTMLElement),
    knowledgeConnectionList: requiredElement("knowledge-connection-list", HTMLElement),
    annotationForm: requiredElement("annotation-form", HTMLFormElement),
    annotationComposer: requiredElement("annotation-composer", HTMLElement),
    libraryHighlightComposer: requiredElement("library-highlight-composer", HTMLElement),
    openLibraryPdfInspector: requiredElement("open-library-pdf-inspector", HTMLButtonElement),
    closeLibraryPdfInspector: requiredElement("close-library-pdf-inspector", HTMLButtonElement),
    libraryAnnotationDetails: requiredElement("library-annotation-details", HTMLDetailsElement),
    detectLibraryPdfHighlights: requiredElement("detect-library-pdf-highlights", HTMLButtonElement),
    libraryHighlightImportForm: requiredElement("library-highlight-import-form", HTMLFormElement),
    libraryHighlightImportList: requiredElement("library-highlight-import-list", HTMLElement),
    libraryHighlightImportStatus: requiredElement("library-highlight-import-status", HTMLElement),
    cancelLibraryHighlightImport: requiredElement("cancel-library-highlight-import", HTMLButtonElement),
    libraryHighlightForm: requiredElement("library-highlight-form", HTMLFormElement),
    libraryHighlightStatus: requiredElement("library-highlight-status", HTMLElement),
    libraryHighlightPage: requiredElement("library-highlight-page", HTMLInputElement),
    libraryHighlightQuote: requiredElement("library-highlight-quote", HTMLTextAreaElement),
    libraryHighlightComment: requiredElement("library-highlight-comment", HTMLInputElement),
    libraryHighlightExcerpt: requiredElement("library-highlight-excerpt", HTMLElement),
    saveLibraryHighlight: requiredElement("save-library-highlight", HTMLButtonElement),
    cancelLibraryHighlight: requiredElement("cancel-library-highlight", HTMLButtonElement),
    libraryProjectUse: requiredElement("library-project-use", HTMLElement),
    libraryHighlightCount: requiredElement("library-highlight-count", HTMLElement),
    libraryHighlightList: requiredElement("library-highlight-list", HTMLElement),
    libraryNoteForm: requiredElement("library-note-form", HTMLFormElement),
    libraryNoteBody: requiredElement("library-note-body", HTMLTextAreaElement),
    cancelLibraryNote: requiredElement("cancel-library-note", HTMLButtonElement),
    librarySelectTool: requiredElement("library-select-tool", HTMLButtonElement),
    libraryTextTool: requiredElement("library-text-tool", HTMLButtonElement),
    libraryNoteTool: requiredElement("library-note-tool", HTMLButtonElement),
    libraryDrawTool: requiredElement("library-draw-tool", HTMLButtonElement),
    libraryInkOptions: requiredElement("library-ink-options", HTMLElement),
    libraryDrawColor: requiredElement("library-draw-color", HTMLInputElement),
    libraryDrawWidth: requiredElement("library-draw-width", HTMLInputElement),
    libraryDrawWidthValue: requiredElement("library-draw-width-value", HTMLOutputElement),
    undoLibraryDrawing: requiredElement("undo-library-drawing", HTMLButtonElement),
    exportLibraryAnnotatedPdf: requiredElement("export-library-annotated-pdf", HTMLButtonElement),
    libraryMarkupSelection: requiredElement("library-markup-selection", HTMLFormElement),
    libraryMarkupSelectionLabel: requiredElement("library-markup-selection-label", HTMLElement),
    librarySelectedDrawingOptions: requiredElement("library-selected-drawing-options", HTMLElement),
    librarySelectedDrawColor: requiredElement("library-selected-draw-color", HTMLInputElement),
    librarySelectedDrawWidth: requiredElement("library-selected-draw-width", HTMLInputElement),
    librarySelectedDrawWidthValue: requiredElement("library-selected-draw-width-value", HTMLOutputElement),
    editSelectedLibraryNote: requiredElement("edit-selected-library-note", HTMLButtonElement),
    deleteSelectedLibraryMarkup: requiredElement("delete-selected-library-markup", HTMLButtonElement),
    cancelLibraryMarkupSelection: requiredElement("cancel-library-markup-selection", HTMLButtonElement),
    annotationPdf: requiredElement("annotation-pdf", HTMLSelectElement),
    annotationPage: requiredElement("annotation-page", HTMLInputElement),
    annotationQuote: requiredElement("annotation-quote", HTMLTextAreaElement),
    annotationPrefix: requiredElement("annotation-prefix", HTMLInputElement),
    annotationSuffix: requiredElement("annotation-suffix", HTMLInputElement),
    annotationComment: requiredElement("annotation-comment", HTMLInputElement),
    annotationSelectionStatus: requiredElement("annotation-selection-status", HTMLElement),
    saveAndLinkAnnotation: requiredElement("save-and-link-annotation", HTMLButtonElement),
    highlightPaintTool: requiredElement("highlight-paint-tool", HTMLButtonElement),
    highlightEraserTool: requiredElement("highlight-eraser-tool", HTMLButtonElement),
    undoHighlight: requiredElement("undo-highlight", HTMLButtonElement),
    citeActivePdf: requiredElement("cite-active-pdf", HTMLButtonElement),
    openPaper: requiredElement("open-paper", HTMLButtonElement),
    paperStatus: requiredElement("paper-status", HTMLElement),
    paperCanvas: requiredElement("paper-canvas", HTMLCanvasElement),
    paperPage: requiredElement("paper-page", HTMLElement),
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
    publicationIntakeForm: requiredElement("publication-intake-form", HTMLFormElement),
    publicationIntakeDoi: requiredElement("publication-intake-doi", HTMLInputElement),
    publicationIntakeStatus: requiredElement("publication-intake-status", HTMLElement),
    publicationIntakeReview: requiredElement("publication-intake-review", HTMLElement),
    publicationIntakeTitle: requiredElement("publication-intake-title", HTMLElement),
    publicationIntakeMeta: requiredElement("publication-intake-meta", HTMLElement),
    publicationIntakeKey: requiredElement("publication-intake-key", HTMLInputElement),
    publicationIntakeAccept: requiredElement("publication-intake-accept", HTMLButtonElement),
    publicationIntakeCancel: requiredElement("publication-intake-cancel", HTMLButtonElement),
    publicationIntakeLinked: requiredElement("publication-intake-linked", HTMLElement),
    publicationIntakeLinkedList: requiredElement("publication-intake-linked-list", HTMLElement),
    llmEndpoint: requiredElement("llm-endpoint", HTMLInputElement),
    llmConnection: requiredElement("llm-connection", HTMLSelectElement),
    llmModel: requiredElement("llm-model", HTMLSelectElement),
    llmReasoningEffort: requiredElement("llm-reasoning-effort", HTMLSelectElement),
    discoverLlmModels: requiredElement("discover-llm-models", HTMLButtonElement),
    modelOperation: requiredElement("model-operation", HTMLSelectElement),
    assistantTargetScope: requiredElement("assistant-target-scope", HTMLSelectElement),
    assistantTargetScopeField: requiredElement("assistant-target-scope-field", HTMLElement),
    assistantTargetPreview: requiredElement("assistant-target-preview", HTMLElement),
    assistantInteractiveResult: requiredElement("assistant-interactive-result", HTMLElement),
    assistantTableFields: requiredElement("assistant-table-fields", HTMLFieldSetElement),
    assistantTableCaption: requiredElement("assistant-table-caption", HTMLInputElement),
    assistantTableColumns: requiredElement("assistant-table-columns", HTMLTextAreaElement),
    assistantTableRows: requiredElement("assistant-table-rows", HTMLTextAreaElement),
    assistantPhrasingPurpose: requiredElement("assistant-phrasing-purpose", HTMLSelectElement),
    assistantPhrasingPurposeField: requiredElement("assistant-phrasing-purpose-field", HTMLElement),
    assistantPhrasingAttribution: requiredElement("assistant-phrasing-attribution", HTMLDetailsElement),
    modelClaimRelation: requiredElement("model-claim-relation", HTMLSelectElement),
    modelClaimRelationField: requiredElement("model-claim-relation-field", HTMLElement),
    assistantOperationEyebrow: requiredElement("assistant-operation-eyebrow", HTMLElement),
    assistantOperationTitle: requiredElement("assistant-operation-title", HTMLElement),
    assistantOperationDescription: requiredElement("assistant-operation-description", HTMLElement),
    modelInstructionLabel: requiredElement("model-instruction-label", HTMLElement),
    modelInstruction: requiredElement("model-instruction", HTMLTextAreaElement),
    generateCandidate: requiredElement("generate-candidate", HTMLButtonElement),
    modelStatus: requiredElement("model-status", HTMLElement),
    candidateList: requiredElement("candidate-list", HTMLElement),
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

function resourceTitle(text: string): HTMLElement {
  const title = document.createElement("span");
  title.className = "mt-1 block text-sm leading-5 text-app-text";
  title.textContent = text;
  return title;
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

function anchorActionLabel(resolution: ManuscriptAnchorResolution): string {
  if (resolution.status === "stale") return "Linked passage is stale";
  return resolution.exactMatch ? "Open linked passage" : "Open changed passage";
}

function anchorMatchState(resolution: ManuscriptAnchorResolution): "exact" | "changed" | "unavailable" {
  if (resolution.status === "stale") return "unavailable";
  return resolution.exactMatch ? "exact" : "changed";
}

function actionButton(text: string, className: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", action);
  return button;
}

function downloadLink(href: string, label: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "button-secondary";
  link.href = href;
  link.textContent = label;
  return link;
}

interface WebSnapshotComparisonResponse {
  readonly before: WebSnapshot;
  readonly after: WebSnapshot;
  readonly comparison: WebSnapshotComparison;
}

function isWebSnapshotComparisonResponse(value: unknown): value is WebSnapshotComparisonResponse {
  if (!isUnknownRecord(value) || !isUnknownRecord(value.before) || !isUnknownRecord(value.after) || !isUnknownRecord(value.comparison)) {
    return false;
  }
  return (
    typeof value.before.id === "string" &&
    typeof value.after.id === "string" &&
    typeof value.comparison.identical === "boolean" &&
    typeof value.comparison.addedLines === "number" &&
    typeof value.comparison.removedLines === "number" &&
    Array.isArray(value.comparison.hunks) &&
    value.comparison.hunks.every(
      (hunk) =>
        isUnknownRecord(hunk) &&
        typeof hunk.beforeLine === "number" &&
        typeof hunk.afterLine === "number" &&
        Array.isArray(hunk.removed) &&
        hunk.removed.every((line) => typeof line === "string") &&
        Array.isArray(hunk.added) &&
        hunk.added.every((line) => typeof line === "string") &&
        typeof hunk.truncated === "boolean",
    )
  );
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGitHubConnectionState(
  value: unknown,
): value is { connected: false } | { connected: true; user: { id: string; login: string }; connectedAt: string } {
  if (!isUnknownRecord(value) || typeof value.connected !== "boolean") return false;
  if (!value.connected) return true;
  return (
    isUnknownRecord(value.user) &&
    typeof value.user.id === "string" &&
    typeof value.user.login === "string" &&
    typeof value.connectedAt === "string"
  );
}

function isGitHubInstallationList(value: unknown): value is { installations: GitHubInstallationOption[] } {
  return (
    isUnknownRecord(value) &&
    Array.isArray(value.installations) &&
    value.installations.every(
      (installation) =>
        isUnknownRecord(installation) &&
        typeof installation.id === "number" &&
        Number.isSafeInteger(installation.id) &&
        typeof installation.accountId === "string" &&
        typeof installation.accountLogin === "string" &&
        (installation.accountType === "Organization" || installation.accountType === "User"),
    )
  );
}

function isGitHubRepositoryList(value: unknown): value is { repositories: GitHubRepositoryOption[] } {
  return (
    isUnknownRecord(value) &&
    Array.isArray(value.repositories) &&
    value.repositories.every(
      (repository) =>
        isUnknownRecord(repository) &&
        typeof repository.id === "number" &&
        Number.isSafeInteger(repository.id) &&
        typeof repository.owner === "string" &&
        typeof repository.name === "string" &&
        typeof repository.fullName === "string" &&
        typeof repository.private === "boolean" &&
        typeof repository.defaultBranch === "string",
    )
  );
}

function isGitHubBranchList(
  value: unknown,
): value is { repository: GitHubRepositoryOption; branches: { name: string; protected: boolean }[] } {
  return (
    isUnknownRecord(value) &&
    isGitHubRepositoryList({ repositories: [value.repository] }) &&
    Array.isArray(value.branches) &&
    value.branches.every((branch) => isUnknownRecord(branch) && typeof branch.name === "string" && typeof branch.protected === "boolean")
  );
}

function isGitHubImportPreview(value: unknown): value is {
  id: string;
  commitSha: string;
  entryPath: string;
  files: Array<{ path: string; bytes: number }>;
} {
  return (
    isUnknownRecord(value) &&
    typeof value.id === "string" &&
    typeof value.commitSha === "string" &&
    typeof value.entryPath === "string" &&
    Array.isArray(value.files) &&
    value.files.every((file) => isUnknownRecord(file) && typeof file.path === "string" && typeof file.bytes === "number")
  );
}

function isGitHubSyncState(value: unknown): value is {
  owner: string;
  repository: string;
  branch: string;
  rootPath: string;
  commitSha: string;
} {
  return (
    isUnknownRecord(value) &&
    typeof value.owner === "string" &&
    typeof value.repository === "string" &&
    typeof value.branch === "string" &&
    typeof value.rootPath === "string" &&
    typeof value.commitSha === "string"
  );
}

function isGitHubPullPreview(value: unknown): value is {
  id: string;
  plan: {
    changes: Array<{
      base: { path: string } | null;
      remote: { path: string } | null;
    }>;
    blocking: Array<{
      base: { path: string; content: string } | null;
      local: { path: string; content: string } | null;
      remote: { path: string; content: string } | null;
    }>;
  };
} {
  if (!isUnknownRecord(value) || typeof value.id !== "string" || !isUnknownRecord(value.plan)) return false;
  return (
    Array.isArray(value.plan.changes) &&
    value.plan.changes.every(
      (change) =>
        isUnknownRecord(change) &&
        (change.base === null || (isUnknownRecord(change.base) && typeof change.base.path === "string")) &&
        (change.remote === null || (isUnknownRecord(change.remote) && typeof change.remote.path === "string")),
    ) &&
    Array.isArray(value.plan.blocking) &&
    value.plan.blocking.every(isGitHubPullConflict)
  );
}

function isGitHubPullConflict(value: unknown): value is {
  base: { path: string; content: string } | null;
  local: { path: string; content: string } | null;
  remote: { path: string; content: string } | null;
} {
  return (
    isUnknownRecord(value) &&
    [value.base, value.local, value.remote].every(
      (file) => file === null || (isUnknownRecord(file) && typeof file.path === "string" && typeof file.content === "string"),
    )
  );
}

function gitHubConflictVersion(label: string, content: string): HTMLElement {
  const section = document.createElement("section");
  const heading = document.createElement("p");
  heading.className = "font-sans text-xs font-semibold text-app-text-soft";
  heading.textContent = label;
  const preview = document.createElement("pre");
  preview.className = "mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-app bg-app-surface p-2 font-mono text-xs text-app-text";
  preview.textContent = content.length > 1_000 ? `${content.slice(0, 1_000)}\n…` : content;
  section.append(heading, preview);
  return section;
}

function isGitHubPublishPreview(value: unknown): value is {
  id: string;
  expectedRemoteHead: string;
  plan: {
    changes: Array<{ path: string; content: string | null }>;
    skippedLocalPaths: string[];
    blocking: unknown[];
  };
} {
  if (
    !isUnknownRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.expectedRemoteHead !== "string" ||
    !isUnknownRecord(value.plan)
  ) {
    return false;
  }
  return (
    Array.isArray(value.plan.changes) &&
    value.plan.changes.every(
      (change) =>
        isUnknownRecord(change) && typeof change.path === "string" && (typeof change.content === "string" || change.content === null),
    ) &&
    Array.isArray(value.plan.skippedLocalPaths) &&
    value.plan.skippedLocalPaths.every((path) => typeof path === "string") &&
    Array.isArray(value.plan.blocking)
  );
}

function isLatexImportPreview(value: unknown): value is LatexImportPreview {
  if (!isRecord(value) || typeof value.digest !== "string" || !/^[a-f0-9]{64}$/u.test(value.digest) || !isRecord(value.archive)) {
    return false;
  }
  if (
    !Array.isArray(value.archive.files) ||
    !value.archive.files.every(
      (file) =>
        isRecord(file) &&
        typeof file.path === "string" &&
        typeof file.kind === "string" &&
        typeof file.bytes === "number" &&
        Number.isSafeInteger(file.bytes) &&
        file.bytes >= 0,
    ) ||
    !Array.isArray(value.archive.rootCandidates) ||
    !value.archive.rootCandidates.every((path) => typeof path === "string")
  ) {
    return false;
  }
  if (value.conversion === null) return true;
  if (!isRecord(value.conversion) || !isRecord(value.conversion.seed) || !isRecord(value.conversion.report)) return false;
  return (
    Array.isArray(value.conversion.seed.files) &&
    value.conversion.seed.files.every((file) => isRecord(file) && typeof file.path === "string" && typeof file.content === "string") &&
    typeof value.conversion.seed.bibliography === "string" &&
    Array.isArray(value.conversion.assets) &&
    value.conversion.assets.every(
      (asset) =>
        isRecord(asset) &&
        typeof asset.path === "string" &&
        typeof asset.mediaType === "string" &&
        typeof asset.bytes === "number" &&
        Number.isSafeInteger(asset.bytes) &&
        asset.bytes > 0,
    ) &&
    typeof value.conversion.report.rootPath === "string" &&
    (value.conversion.report.bibliographyPath === null || typeof value.conversion.report.bibliographyPath === "string") &&
    Array.isArray(value.conversion.report.diagnostics) &&
    value.conversion.report.diagnostics.every(
      (diagnostic) =>
        isRecord(diagnostic) &&
        (diagnostic.severity === "error" || diagnostic.severity === "warning" || diagnostic.severity === "info") &&
        typeof diagnostic.message === "string",
    )
  );
}

async function jsonFetch(url: string, body: object, method: "POST" | "PUT" | "PATCH" = "POST"): Promise<Response> {
  return await fetch(url, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sourceSpanAt(sourceMap: readonly CompositionSourceSpan[], offset: number): CompositionSourceSpan | undefined {
  return sourceMap.find((span) => offset >= span.outputStart && offset < span.outputEnd);
}

async function expectOk(response: Response): Promise<void> {
  if (response.ok) return;
  const value: unknown = await response.json().catch(() => null);
  throw new Error(isRecord(value) && typeof value.error === "string" ? value.error : `Request failed (${response.status})`);
}

function formatBytes(value: number): string {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function templateFact(value: string, label: string): HTMLElement {
  const fact = document.createElement("span");
  fact.innerHTML = "<strong></strong><span></span>";
  fact.querySelector<HTMLElement>("strong")!.textContent = value;
  fact.querySelector<HTMLElement>("span")!.textContent = label;
  return fact;
}

function templatePath(path: string, kind: "file" | "folder" | "more"): HTMLLIElement {
  const item = document.createElement("li");
  item.dataset.kind = kind;
  item.textContent = path;
  return item;
}

function humanizeTemplateValue(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function statusText(value: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = "mt-2 text-xs leading-5 text-app-text-soft";
  paragraph.textContent = value;
  return paragraph;
}

function manuscriptMapMetric(value: number, label: string): HTMLSpanElement {
  const metric = document.createElement("span");
  const count = document.createElement("strong");
  count.textContent = value.toLocaleString();
  const description = document.createElement("small");
  description.textContent = label;
  metric.append(count, description);
  return metric;
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

function uploadStateLabel(state: PdfUploadQueueSnapshot["items"][number]["state"]): string {
  if (state === "queued") return "Queued";
  if (state === "uploading") return "Uploading";
  if (state === "existing") return "Already in library";
  return "Added";
}

function formatCalendarDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

function selectionRectsOverlap(left: PdfSelectionRect, right: PdfSelectionRect): boolean {
  return (
    left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y
  );
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function citationStateColor(state: CitationNetwork["edges"][number]["state"]): string {
  if (state === "confirmed") return "var(--color-app-graph-confirmed)";
  if (state === "extracted") return "var(--color-app-graph-extracted)";
  if (state === "conflicting") return "var(--color-app-graph-conflicting)";
  return "var(--color-app-graph-inferred)";
}

function readClaimEvidenceRelation(value: string): ClaimEvidenceRelation {
  if (value === "contradicts" || value === "extends") return value;
  return "supports";
}

function readModelReasoningEffort(value: string): ModelReasoningEffort {
  if (value === "none" || value === "low" || value === "medium" || value === "high") return value;
  return "provider-default";
}

function readEditingPass(value: string): EditingPass {
  if (value === "order" || value === "clarity" || value === "evidence" || value === "length") return value;
  return "structure";
}

function modelEvidenceKey(kind: "annotation" | "claim", id: string): string {
  return `${kind}:${id}`;
}

function parseModelEvidenceKey(value: string): ["annotation" | "claim", string] {
  return value.startsWith("claim:") ? ["claim", value.slice("claim:".length)] : ["annotation", value.slice("annotation:".length)];
}

function accessibleEvidenceExcerpt(value: string): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}…`;
}

function excerptForToast(value: string): string {
  const compact = value.replaceAll(/\s+/gu, " ").trim();
  return compact.length <= 240 ? compact : `${compact.slice(0, 239).trimEnd()}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCreatedAnnotation(value: unknown): value is AnnotationResource {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.pdfId === "string" &&
    typeof value.page === "number" &&
    typeof value.quote === "string" &&
    typeof value.prefix === "string" &&
    typeof value.suffix === "string" &&
    typeof value.comment === "string" &&
    Array.isArray(value.rects) &&
    Array.isArray(value.fragments) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
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
  bindThemePreference(document.documentElement, requiredElement("theme-preference", HTMLSelectElement), localStorage);
  const app = new WorkspaceApp();
  void app.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Kirjolab failed to start";
    document.body.textContent = message;
  });
}
