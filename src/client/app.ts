import * as Y from "yjs";
import {
  buildWorkspaceKnowledgeGraph,
  isKnowledgeSearchResults,
  type KnowledgeGraphNode,
  type KnowledgeSearchResult,
  type WorkspaceKnowledgeGraph,
} from "../domain/knowledge";
import { isCitationNetwork, type CitationAssertionView, type CitationNetwork } from "../domain/citation-assertions";
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
  type ProjectRevisionSummary,
} from "../domain/project-history";
import { composeProject, relativeProjectPath, type CompositionSourceSpan, type ProjectFile } from "../domain/project-files";
import { publicationWordStatistics, type PublicationWordStatistics } from "../domain/publication-statistics";
import {
  crossrefMetadataFields,
  isMetadataRefinementPreview,
  isPdfDraftResult,
  isReferenceLibrarySnapshot,
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
  type PublicationIntakePreview,
  type PublicationResource,
  type WorkspaceSnapshot,
  type WorkspaceMember,
  type WorkspaceSummary,
} from "../domain/workspace";
import { CoalescedRefresh, PendingUpdateQueue } from "./collaboration";
import { citationKeysAtPosition, createCitationInsertion, parseCitationKeys } from "./citations";
import { loadMarkdownRuntime } from "./markdown-runtime";
import { groupMetadataCandidates, metadataFieldValue } from "./metadata-refinement";
import { PdfEvidenceViewer, type PdfSelectionCapture } from "./pdf-viewer";
import { extractPdfMetadata, type PdfMetadataCandidates } from "./pdf-metadata";
import { adjustSelectionRects } from "./pdf-selection";
import { uploadPdfBatch, type ExistingPdfUpload, type PdfUploadQueueSnapshot } from "./pdf-upload-queue";
import { bindThemePreference } from "./theme";
import { maximumModelEvidenceItems, OpenAICompatibleBrowserProvider, type ModelEvidenceItem } from "./model-provider";
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
  setResearchTabPinned,
  setResearchTabScroll,
  type ResearchContextKey,
  type ResearchContextState,
  type ResearchResourceTab,
} from "./research-context";
import { editorPresenceSegments, type EditorPresenceRange } from "./editor-presence";

const workspaceId = readWorkspaceId();
const catalogBase = "/api/workspaces";
const apiBase = `${catalogBase}/${workspaceId}`;
const remoteOrigin = Symbol("remote");

interface Elements {
  collaboratorSelections: HTMLElement;
  workspaceSwitcher: HTMLSelectElement;
  workspaceLayout: HTMLSelectElement;
  manageWorkspaces: HTMLButtonElement;
  workspaceSettings: HTMLButtonElement;
  workspaceSettingsDialog: HTMLDialogElement;
  workspaceSettingsForm: HTMLFormElement;
  workspaceSettingsTitle: HTMLInputElement;
  workspaceCitationStyle: HTMLSelectElement;
  workspaceCitationLocale: HTMLSelectElement;
  workspaceSubmissionTemplate: HTMLSelectElement;
  workspacePaperSize: HTMLSelectElement;
  closeWorkspaceSettings: HTMLButtonElement;
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
  cancelNewWorkspace: HTMLButtonElement;
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
  filesRailPanel: HTMLElement;
  researchRailPanel: HTMLElement;
  commentsRailPanel: HTMLElement;
  newProjectFileRail: HTMLButtonElement;
  newProjectFolderRail: HTMLButtonElement;
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
  showAuthoringSurface: HTMLButtonElement;
  showContextSurface: HTMLButtonElement;
  openSourceCitation: HTMLButtonElement;
  contextTabList: HTMLElement;
  contextPreviewTab: HTMLButtonElement;
  contextLibraryTab: HTMLButtonElement;
  contextAssistantTab: HTMLButtonElement;
  contextResourceTabs: HTMLElement;
  pinActiveContext: HTMLButtonElement;
  closeActiveContext: HTMLButtonElement;
  previewContextControls: HTMLElement;
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
  contextCandidateMeta: HTMLElement;
  contextCandidateStatus: HTMLElement;
  contextCandidateBefore: HTMLElement;
  contextCandidateAfter: HTMLElement;
  contextCandidateEvidence: HTMLElement;
  contextCandidateApply: HTMLButtonElement;
  contextCandidateReject: HTMLButtonElement;
  closeCandidateContext: HTMLButtonElement;
  contextPublicationTitle: HTMLElement;
  contextPublicationMeta: HTMLElement;
  contextPublicationDetails: HTMLElement;
  contextPublicationPdfs: HTMLElement;
  closePublicationContext: HTMLButtonElement;
  insertContextCitation: HTMLButtonElement;
  publicationPdfLinkForm: HTMLFormElement;
  publicationPdfLink: HTMLSelectElement;
  preview: HTMLElement;
  diagnostics: HTMLElement;
  diagnosticSummary: HTMLElement;
  connectionDot: HTMLElement;
  connectionStatus: HTMLElement;
  saveStatus: HTMLElement;
  revisionBadge: HTMLElement;
  pdfUpload: HTMLInputElement;
  pdfCount: HTMLElement;
  pdfList: HTMLElement;
  bibliographyUpload: HTMLInputElement;
  knowledgeSearchForm: HTMLFormElement;
  knowledgeSearchInput: HTMLInputElement;
  knowledgeSearchResults: HTMLElement;
  researchInventory: HTMLElement;
  exploreResearchGraph: HTMLButtonElement;
  publicationCount: HTMLElement;
  publicationList: HTMLElement;
  annotationCount: HTMLElement;
  annotationList: HTMLElement;
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
  libraryTextTool: HTMLButtonElement;
  libraryNoteTool: HTMLButtonElement;
  libraryDrawTool: HTMLButtonElement;
  libraryInkOptions: HTMLElement;
  libraryDrawColor: HTMLInputElement;
  libraryDrawWidth: HTMLInputElement;
  libraryDrawWidthValue: HTMLOutputElement;
  undoLibraryDrawing: HTMLButtonElement;
  exportLibraryAnnotatedPdf: HTMLButtonElement;
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
  llmModel: HTMLInputElement;
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

class WorkspaceApp {
  readonly #elements = collectElements();
  readonly #pdfViewer: PdfEvidenceViewer;
  readonly #document = new Y.Doc();
  readonly #source = this.#document.getText("source");
  readonly #bibliography = this.#document.getText("bibliography");
  readonly #pendingUpdates = new PendingUpdateQueue();
  readonly #resourceRefresh = new CoalescedRefresh(async () => this.#refreshSnapshot());
  #snapshot: WorkspaceSnapshot | null = null;
  #revision = 0;
  #socket: WebSocket | null = null;
  #socketSynced = false;
  #awaitingRemoteRevision = false;
  #reconnectTimer: number | undefined;
  #selectionBroadcastTimer: number | undefined;
  readonly #remoteSelections = new Map<string, RemoteCollaboratorSelection>();
  #renderSourceEditorHighlight: () => void = () => undefined;
  #modelBusy = false;
  #hasBootstrapSnapshot = false;
  #toastTimer: number | undefined;
  #editingAnnotationId: string | null = null;
  #highlightTool: "paint" | "erase" = "paint";
  #lastHighlightStroke: { annotationId: string; fragmentId: string } | null = null;
  #renderedPdfId: string | undefined;
  #renderedPdfContextKey: ResearchContextKey | undefined;
  #editingClaimId: string | undefined;
  #contextState: ResearchContextState = createResearchContext();
  #authoringSelection: RelativeEditorSelection | null = null;
  #publicationIntakePreview: PublicationIntakePreview | null = null;
  #publicationIntakeContextPdfId: string | null = null;
  #publicationIntakeRequest = 0;
  #publicationIntakeBusy = false;
  #modelEvidenceSelection = new Set<string>();
  #candidateDecision: { id: string; action: "apply" | "reject" } | null = null;
  #activeFileId: string | null = null;
  #activeFileText = this.#source;
  #unbindSourceEditor: () => void = () => undefined;
  #projectFileDialogMode: "create" | "create-and-include" | "rename" | "create-folder" | "rename-folder" = "create";
  #projectFolderId: string | null = null;
  #projectFileIncludeTarget: RelativeEditorSelection | null = null;
  #projectFileIncludeFromPath: string | null = null;
  #librarySnapshot: ReferenceLibrarySnapshot | null = null;
  readonly #expandedLibraryReferences = new Set<string>();
  #libraryPdfUploadBusy = false;
  #libraryPdfTool: "text" | "note" | "draw" = "text";
  #pendingPdfNote: { page: number; x: number; y: number } | null = null;
  #pdfDrawingDraft: LibraryPdfPoint[] | null = null;
  #pdfDrawingPointer: number | null = null;
  #openPdfNoteId: string | null = null;
  #failedLibraryPdfUploads: readonly File[] = [];
  #showArchivedReferences = false;
  #citationNetwork: CitationNetwork | null = null;
  #filterProjectCitations = false;
  #projectHistory: ProjectRevisionSummary[] = [];
  #wordStatistics: PublicationWordStatistics | null = null;
  #workspaceCatalog: WorkspaceSummary[] = [];
  #previewRenderVersion = 0;

  constructor() {
    this.#pdfViewer = new PdfEvidenceViewer(
      {
        canvas: this.#elements.paperCanvas,
        page: this.#elements.paperPage,
        textLayer: this.#elements.paperTextLayer,
        highlights: this.#elements.paperHighlights,
        pageIndicator: this.#elements.paperPageIndicator,
        previousPage: this.#elements.previousPaperPage,
        nextPage: this.#elements.nextPaperPage,
        status: this.#elements.paperStatus,
      },
      (capture) => this.#capturePdfSelection(capture),
      (annotationId, fragmentId) => void this.#activateHighlightFragment(annotationId, fragmentId),
      () => this.#renderPdfMarkups(),
    );
  }

  async start(): Promise<void> {
    this.#bindUi();
    this.#elements.workspaceSurfaces.dataset.ready = "true";
    this.#restoreWorkspaceLayout();
    this.#setEditorsEnabled(false);
    void loadMarkdownRuntime().catch(() => undefined);
    await this.#refreshCatalog();
    await this.#resourceRefresh.request();
    this.#connect();
  }

  #bindUi(): void {
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      for (const menu of document.querySelectorAll<HTMLDetailsElement>("details[data-action-menu][open]")) {
        if (!menu.contains(event.target) || event.target.closest("button, a")) menu.open = false;
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const openMenus = Array.from(document.querySelectorAll<HTMLDetailsElement>("details[data-action-menu][open]"));
      const menu = openMenus.at(-1);
      if (!menu) return;
      menu.open = false;
      menu.querySelector<HTMLElement>("summary")?.focus();
      event.preventDefault();
    });
    this.#elements.workspaceSwitcher.addEventListener("change", () => {
      const selected = this.#elements.workspaceSwitcher.value;
      if (selected && selected !== workspaceId) location.assign(`/workspaces/${encodeURIComponent(selected)}`);
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
      this.#elements.workspaceCitationStyle.value = this.#snapshot?.publicationProfile.citationStyle ?? "apa";
      this.#elements.workspaceCitationLocale.value = this.#snapshot?.publicationProfile.locale ?? "en-US";
      this.#elements.workspaceSubmissionTemplate.value = this.#snapshot?.publicationProfile.submissionTemplate ?? "article";
      this.#elements.workspacePaperSize.value = this.#snapshot?.publicationProfile.paperSize ?? "a4";
      this.#elements.archiveWorkspace.textContent = current?.archivedAt ? "Restore" : "Archive";
      this.#elements.workspaceSettingsDialog.showModal();
    });
    this.#elements.closeWorkspaceSettings.addEventListener("click", () => this.#elements.workspaceSettingsDialog.close());
    this.#elements.workspaceSettingsForm.addEventListener("submit", (event) => void this.#saveWorkspaceSettings(event));
    this.#elements.archiveWorkspace.addEventListener("click", () => void this.#toggleWorkspaceArchive());
    this.#elements.duplicateWorkspace.addEventListener("click", () => void this.#duplicateWorkspace());
    this.#elements.deleteWorkspace.addEventListener("click", () => void this.#deleteWorkspace());
    this.#elements.closeWorkspaceCatalog.addEventListener("click", () => this.#elements.workspaceCatalogDialog.close());
    this.#elements.workspaceCatalogFilter.addEventListener("input", () => this.#renderWorkspaceCatalogList());
    this.#elements.newWorkspace.addEventListener("click", () => this.#elements.newWorkspaceDialog.showModal());
    this.#elements.cancelNewWorkspace.addEventListener("click", () => this.#elements.newWorkspaceDialog.close());
    this.#elements.newWorkspaceForm.addEventListener("submit", (event) => void this.#createWorkspace(event));
    this.#elements.showFilesRail.addEventListener("click", () => this.#showRail("files"));
    this.#elements.showResearchRail.addEventListener("click", () => this.#showRail("research"));
    this.#elements.showCommentsRail.addEventListener("click", () => this.#showRail("comments"));
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
    this.#elements.exploreResearchGraph.addEventListener(
      "click",
      () => void this.#openReferenceLibrary().then(() => this.#openCitationNetwork()),
    );
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
    bindVimTextarea(this.#elements.source, this.#elements.sourceEditorShell, this.#elements.vimToggle, this.#elements.vimModeStatus);
    bindYText(this.#elements.bibliography, this.#bibliography, this.#document);
    this.#elements.newProjectFile.addEventListener("click", () => this.#openProjectFileDialog("create"));
    this.#elements.newProjectFileRail.addEventListener("click", () => this.#openProjectFileDialog("create"));
    this.#elements.newProjectFolderRail.addEventListener("click", () => this.#openProjectFileDialog("create-folder"));
    this.#elements.createAndIncludeProjectFile.addEventListener("click", () => this.#openProjectFileDialog("create-and-include"));
    this.#elements.renameProjectFile.addEventListener("click", () => this.#openProjectFileDialog("rename"));
    this.#elements.deleteProjectFile.addEventListener("click", () => void this.#deleteProjectFile());
    this.#elements.cancelProjectFile.addEventListener("click", () => this.#elements.projectFileDialog.close());
    this.#elements.projectFileForm.addEventListener("submit", (event) => void this.#saveProjectFile(event));
    this.#elements.editorInsertMenu.addEventListener("click", (event) => this.#insertSourceSyntax(event));
    this.#elements.openProjectHistory.addEventListener("click", () => void this.#openProjectHistory());
    for (const button of [this.#elements.openExport, this.#elements.wordCountBadge]) {
      button.addEventListener("click", () => this.#openExport());
    }
    this.#elements.closeExport.addEventListener("click", () => this.#elements.exportDialog.close());
    this.#elements.closeProjectHistory.addEventListener("click", () => this.#elements.projectHistoryDialog.close());
    this.#elements.projectHistoryCompareForm.addEventListener("submit", (event) => void this.#compareProjectHistory(event));
    this.#elements.manuscriptCommentForm.addEventListener("submit", (event) => void this.#createManuscriptComment(event));
    for (const eventName of ["focus", "input", "keyup", "select"] as const) {
      this.#elements.source.addEventListener(eventName, () => {
        if (document.activeElement === this.#elements.source) this.#rememberAuthoringSelection();
        this.#scheduleSelectionBroadcast();
        this.#updateModelAvailability();
      });
    }
    this.#source.observe(() => void this.#renderPreview());
    this.#bibliography.observe(() => void this.#renderPreview());
    this.#document.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === remoteOrigin) return;
      this.#pendingUpdates.enqueue(update);
      this.#elements.saveStatus.textContent = "Saving…";
      this.#updateModelAvailability();
      void this.#renderPreview();
      this.#flushPendingUpdates();
    });
    this.#elements.pdfUpload.addEventListener("change", () => void this.#uploadPdf());
    this.#elements.bibliographyUpload.addEventListener("change", () => void this.#importBibliography());
    this.#elements.knowledgeSearchForm.addEventListener("submit", (event) => void this.#searchKnowledge(event));
    this.#elements.annotationForm.addEventListener("submit", (event) => void this.#createAnnotation(event));
    this.#elements.libraryHighlightForm.addEventListener("submit", (event) => void this.#saveLibraryHighlight(event));
    this.#elements.cancelLibraryHighlight.addEventListener("click", () => this.#clearLibraryHighlightDraft());
    this.#elements.libraryTextTool.addEventListener("click", () => this.#setLibraryPdfTool("text"));
    this.#elements.libraryNoteTool.addEventListener("click", () => this.#setLibraryPdfTool("note"));
    this.#elements.libraryDrawTool.addEventListener("click", () => this.#setLibraryPdfTool("draw"));
    this.#elements.libraryDrawWidth.addEventListener("input", () => {
      this.#elements.libraryDrawWidthValue.value = this.#elements.libraryDrawWidth.value;
    });
    this.#elements.libraryNoteForm.addEventListener("submit", (event) => void this.#saveLibraryPdfNote(event));
    this.#elements.cancelLibraryNote.addEventListener("click", () => this.#clearLibraryPdfNoteDraft());
    this.#elements.undoLibraryDrawing.addEventListener("click", () => void this.#undoLibraryDrawing());
    this.#elements.exportLibraryAnnotatedPdf.addEventListener("click", () => this.#downloadAnnotatedPdf());
    this.#elements.paperMarkups.addEventListener("pointerdown", (event) => this.#startLibraryPdfMarkup(event));
    this.#elements.paperMarkups.addEventListener("pointermove", (event) => this.#continueLibraryPdfDrawing(event));
    this.#elements.paperMarkups.addEventListener("pointerup", (event) => void this.#finishLibraryPdfDrawing(event));
    this.#elements.paperMarkups.addEventListener("pointercancel", () => this.#cancelLibraryPdfDrawing());
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
    this.#elements.preview.addEventListener("click", (event) => this.#openPreviewCitation(event));
    this.#elements.openSourceCitation.addEventListener("click", () => this.#openCitationAtCaret());
    this.#elements.insertContextCitation.addEventListener("click", () => this.#insertActivePublicationCitation());
    this.#elements.publicationPdfLinkForm.addEventListener("submit", (event) => void this.#linkActivePublicationPdf(event));
    this.#elements.openPaper.addEventListener("click", () => void this.#openOnlyLinkedPaper());
    this.#elements.pinActiveContext.addEventListener("click", () => this.#toggleActiveContextPin());
    this.#elements.closeActiveContext.addEventListener("click", () => this.#closeActiveContext());
    this.#elements.closePublicationContext.addEventListener("click", () => this.#closeActiveContext());
    this.#elements.publicationIntakeForm.addEventListener("submit", (event) => void this.#previewPublicationIntake(event));
    this.#elements.publicationIntakeAccept.addEventListener("click", () => void this.#acceptPublicationIntake());
    this.#elements.publicationIntakeCancel.addEventListener("click", () => this.#cancelPublicationIntake());
    this.#elements.contextCandidateApply.addEventListener("click", () => void this.#updateActiveCandidate("apply"));
    this.#elements.contextCandidateReject.addEventListener("click", () => void this.#updateActiveCandidate("reject"));
    this.#elements.closeCandidateContext.addEventListener("click", () => this.#closeActiveContext());
    for (const input of [
      this.#elements.llmConnection,
      this.#elements.llmEndpoint,
      this.#elements.llmModel,
      this.#elements.modelInstruction,
    ]) {
      input.addEventListener("input", () => this.#updateModelAvailability());
    }
    this.#elements.llmConnection.addEventListener("change", () => {
      this.#elements.llmEndpoint.value =
        this.#elements.llmConnection.value === "companion"
          ? "http://127.0.0.1:8790/v1/chat/completions"
          : "http://127.0.0.1:1234/v1/chat/completions";
      this.#elements.modelStatus.textContent =
        this.#elements.llmConnection.value === "companion"
          ? "Start npm run model:companion, then select manuscript text and grounding evidence."
          : "The browser will contact the configured loopback provider directly.";
    });
    this.#elements.generateCandidate.addEventListener("click", () => void this.#generateCandidate());
  }

  async #refreshSnapshot(): Promise<void> {
    const response = await fetch(apiBase);
    if (!response.ok) throw new Error("Could not load the project");
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error("Project returned an invalid snapshot");
    const snapshot = this.#socketSynced ? this.#resolveSnapshotAnchors(value) : value;
    this.#snapshot = snapshot;
    if (!this.#hasBootstrapSnapshot) {
      this.#hasBootstrapSnapshot = true;
      this.#revision = snapshot.revision;
      this.#elements.source.value = snapshot.source;
      this.#elements.bibliography.value = snapshot.bibliography;
      void this.#renderPreview(snapshot.source, snapshot.bibliography);
      this.#updateRevision();
    } else {
      void this.#renderPreview();
    }
    this.#renderProjectFiles();
    this.#renderResources();
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
      candidates: snapshot.candidates.map((candidate) => ({
        ...candidate,
        target: {
          ...candidate.target,
          resolution: resolveManuscriptAnchor(this.#document, candidate.target.anchor),
        },
      })),
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

  #showRail(mode: "files" | "research" | "comments"): void {
    const files = mode === "files";
    const research = mode === "research";
    const comments = mode === "comments";
    this.#elements.filesRailPanel.hidden = !files;
    this.#elements.researchRailPanel.hidden = !research;
    this.#elements.commentsRailPanel.hidden = !comments;
    this.#elements.showFilesRail.setAttribute("aria-selected", String(files));
    this.#elements.showResearchRail.setAttribute("aria-selected", String(research));
    this.#elements.showCommentsRail.setAttribute("aria-selected", String(comments));
  }

  #restoreWorkspaceLayout(): void {
    const stored = localStorage.getItem(`kirjolab:layout:${workspaceId}`) ?? "split";
    void this.#setWorkspaceLayout(stored, false);
  }

  async #setWorkspaceLayout(value: string, persist = true): Promise<void> {
    const layout = value === "editor" || value === "context" || value === "pdf" ? value : "split";
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
  }

  async #createWorkspace(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const response = await jsonFetch(catalogBase, { title: this.#elements.newWorkspaceTitle.value });
    await expectOk(response);
    const workspace: unknown = await response.json();
    const created: unknown = [workspace];
    if (!isWorkspaceSummaries(created) || !created[0]) throw new Error("Project catalog returned invalid data");
    location.assign(created[0].href);
  }

  async #saveWorkspaceSettings(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await expectOk(
      await jsonFetch(
        `${apiBase}/settings`,
        {
          title: this.#elements.workspaceSettingsTitle.value,
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
    location.reload();
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

  #connect(): void {
    if (this.#socket && this.#socket.readyState < WebSocket.CLOSING) return;
    window.clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}${apiBase}/socket`);
    socket.binaryType = "arraybuffer";
    this.#socket = socket;
    this.#socketSynced = false;
    this.#pendingUpdates.resetForReconnect();
    this.#updateModelAvailability();
    socket.addEventListener("open", () => {
      if (this.#socket !== socket) return;
      this.#setConnection("Synchronizing", false);
    });
    socket.addEventListener("message", (event: MessageEvent<string | ArrayBuffer>) => {
      if (this.#socket === socket) this.#handleSocketMessage(socket, event.data);
    });
    socket.addEventListener("close", () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#socketSynced = false;
      this.#pendingUpdates.resetForReconnect();
      this.#remoteSelections.clear();
      this.#renderRemoteSelections();
      this.#setConnection("Reconnecting", false);
      this.#setEditorsEnabled(false);
      this.#updateModelAvailability();
      this.#reconnectTimer ??= window.setTimeout(() => {
        this.#reconnectTimer = undefined;
        this.#connect();
      }, 1200);
    });
    socket.addEventListener("error", () => socket.close());
  }

  #handleSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string") {
      const selections = this.#captureEditorSelections();
      if (this.#socketSynced) this.#awaitingRemoteRevision = true;
      try {
        Y.applyUpdate(this.#document, new Uint8Array(message), remoteOrigin);
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
        if (this.#socketSynced) {
          socket.close(1002, "Duplicate collaboration sync");
          return;
        }
        this.#socketSynced = true;
        this.#awaitingRemoteRevision = false;
        this.#setConnection("Live", true);
        this.#setEditorsEnabled(true);
        this.#setRevision(value.revision);
        this.#elements.saveStatus.textContent = this.#pendingUpdates.size === 0 ? "Saved" : "Saving…";
        this.#flushPendingUpdates();
        break;
      case "ack":
        try {
          this.#pendingUpdates.acknowledge();
        } catch {
          socket.close(1002, "Unexpected collaboration acknowledgement");
          return;
        }
        this.#setRevision(value.revision);
        this.#elements.saveStatus.textContent = this.#pendingUpdates.size === 0 ? "Saved" : "Saving…";
        this.#flushPendingUpdates();
        break;
      case "revision":
        this.#awaitingRemoteRevision = false;
        this.#setRevision(value.revision);
        break;
      case "reset":
        this.#socketSynced = false;
        window.location.reload();
        return;
      case "presence":
        this.#elements.connectionStatus.textContent = `Live · ${value.collaborators} ${value.collaborators === 1 ? "writer" : "writers"}`;
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
    this.#updateModelAvailability();
  }

  #flushPendingUpdates(): void {
    const socket = this.#socket;
    if (!this.#socketSynced || !socket || socket.readyState !== WebSocket.OPEN) return;
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
  }

  #setRevision(revision: number): void {
    this.#revision = Math.max(this.#revision, revision);
    for (const [collaboratorId, selection] of this.#remoteSelections) {
      if (selection.revision !== this.#revision) this.#remoteSelections.delete(collaboratorId);
    }
    this.#renderRemoteSelections();
    this.#updateRevision();
    const active = this.#activeResourceTab();
    if (active?.kind === "candidate") this.#renderCandidateContext(active);
  }

  #scheduleSelectionBroadcast(): void {
    window.clearTimeout(this.#selectionBroadcastTimer);
    this.#selectionBroadcastTimer = window.setTimeout(() => {
      this.#selectionBroadcastTimer = undefined;
      const socket = this.#socket;
      if (!this.#socketSynced || !socket || socket.readyState !== WebSocket.OPEN || !this.#activeFileId) return;
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
    return [...this.#remoteSelections.values()].filter(
      (selection) => selection.revision === this.#revision && selection.fileId === this.#activeFileId,
    );
  }

  #bindSourceEditor(text: Y.Text): void {
    const binding = bindYText(this.#elements.source, text, this.#document, this.#elements.sourceHighlight, () =>
      this.#activeEditorPresence(),
    );
    this.#unbindSourceEditor = binding.destroy;
    this.#renderSourceEditorHighlight = binding.renderHighlight;
  }

  #hasStableDocumentBase(): boolean {
    return this.#socketSynced && this.#pendingUpdates.size === 0 && !this.#awaitingRemoteRevision;
  }

  #updateModelAvailability(): void {
    const stable = this.#hasStableDocumentBase();
    this.#elements.generateCandidate.disabled = this.#modelBusy || !stable || !this.#canGenerateCandidate();
    for (const apply of document.querySelectorAll<HTMLButtonElement>('[data-candidate-action="apply"]')) {
      const candidate = this.#snapshot?.candidates.find((item) => item.id === apply.dataset.candidateId);
      const applicable = candidate ? this.#candidateApplicable(candidate) : false;
      apply.dataset.candidateApplicable = String(applicable);
      apply.disabled = this.#candidateDecision !== null || !stable || !applicable;
    }
  }

  #canGenerateCandidate(): boolean {
    return (
      this.#modelEvidenceSelection.size > 0 &&
      this.#modelEvidenceSelection.size <= maximumModelEvidenceItems &&
      this.#selectedAuthoringPassage() !== null &&
      Boolean(this.#elements.modelInstruction.value.trim())
    );
  }

  #modelProvider(): OpenAICompatibleBrowserProvider {
    return new OpenAICompatibleBrowserProvider({
      endpoint: this.#elements.llmEndpoint.value,
      providerLabel:
        this.#elements.llmConnection.value === "companion" ? "Local companion · OpenAI-compatible" : "Browser-local OpenAI-compatible",
      model: this.#elements.llmModel.value,
    });
  }

  async #renderPreview(source?: string, bibliography = this.#bibliography.toString()): Promise<void> {
    const renderVersion = ++this.#previewRenderVersion;
    const composition =
      source === undefined && this.#snapshot ? composeProject(this.#liveProjectFiles(), this.#snapshot.entryFileId) : null;
    const renderedSource = source ?? composition?.content ?? this.#source.toString();
    const statisticsComposition =
      composition ??
      (source !== undefined
        ? (this.#snapshot?.composition ?? null)
        : this.#snapshot
          ? composeProject(this.#liveProjectFiles(), this.#snapshot.entryFileId)
          : null);
    if (statisticsComposition && this.#snapshot) {
      this.#wordStatistics = publicationWordStatistics(
        statisticsComposition,
        source !== undefined ? this.#snapshot.files : this.#liveProjectFiles(),
      );
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
    const rendered = runtime.renderWorkspaceMarkdown(renderedSource, bibliography, this.#snapshot?.publicationProfile.citationStyle);
    this.#elements.preview.innerHTML = rendered.html;
    this.#elements.diagnostics.replaceChildren();
    const diagnosticCount = rendered.diagnostics.length + (composition?.diagnostics.length ?? 0);
    this.#elements.diagnosticSummary.textContent =
      diagnosticCount === 0 ? "No syntax errors" : `${diagnosticCount} ${diagnosticCount === 1 ? "issue" : "issues"}`;
    for (const diagnostic of composition?.diagnostics ?? []) {
      this.#appendProjectDiagnostic(diagnostic.message, diagnostic.fileId, diagnostic.from, diagnostic.to);
    }
    for (const diagnostic of rendered.diagnostics) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "resource-card mb-2 block w-full text-left font-sans text-xs";
      item.textContent = diagnostic.message;
      item.addEventListener("click", () => {
        const span = composition ? sourceSpanAt(composition.sourceMap, diagnostic.from) : undefined;
        if (span)
          this.#focusProjectRange(
            span.fileId,
            span.sourceStart,
            Math.min(span.sourceEnd, span.sourceStart + diagnostic.to - diagnostic.from),
          );
        else this.#focusProjectRange(this.#snapshot?.entryFileId ?? "", diagnostic.from, diagnostic.to);
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
        buildWorkspaceKnowledgeGraph({ ...this.#snapshot, source: renderedSource, bibliography, links, claimLinks }),
      );
    }
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
    return this.#snapshot.files.map((file) => ({
      ...file,
      content: this.#document.getText(file.id === this.#snapshot?.entryFileId ? "source" : `file:${file.id}`).toString(),
    }));
  }

  #renderProjectFiles(): void {
    const snapshot = this.#snapshot;
    if (!snapshot) return;
    if (!this.#activeFileId || !snapshot.files.some((file) => file.id === this.#activeFileId)) {
      this.#activeFileId = snapshot.entryFileId;
      this.#activeFileText = this.#source;
    }
    this.#elements.projectFileList.replaceChildren();
    this.#elements.includeProjectFileList.replaceChildren();
    const items = [
      ...snapshot.folders.map((folder) => ({ kind: "folder" as const, path: folder.path, folder })),
      ...snapshot.files.map((file) => ({ kind: "file" as const, path: file.path, file })),
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
        remove.addEventListener("click", () => void this.#deleteProjectFolder(item.folder.id));
        menu.append(rename, remove);
        actions.append(summary, menu);
        row.append(label, actions);
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
    this.#elements.renameProjectFile.disabled = entryActive;
    this.#elements.deleteProjectFile.disabled = entryActive;
  }

  #selectProjectFile(fileId: string): void {
    const snapshot = this.#snapshot;
    const file = snapshot?.files.find((item) => item.id === fileId);
    if (!snapshot || !file || fileId === this.#activeFileId) return;
    this.#unbindSourceEditor();
    this.#activeFileId = fileId;
    this.#activeFileText = this.#document.getText(fileId === snapshot.entryFileId ? "source" : `file:${fileId}`);
    this.#elements.source.value = this.#activeFileText.toString();
    this.#bindSourceEditor(this.#activeFileText);
    this.#authoringSelection = null;
    this.#renderProjectFiles();
    this.#updateModelAvailability();
  }

  #openProjectFileDialog(mode: "create" | "create-and-include" | "rename" | "create-folder" | "rename-folder", folderId?: string): void {
    const file = this.#snapshot?.files.find((item) => item.id === this.#activeFileId);
    const folder = this.#snapshot?.folders.find((item) => item.id === folderId);
    if (mode === "rename" && (!file || file.id === this.#snapshot?.entryFileId)) return;
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
        : "Compose this file from main.md with ::include[path].";
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

  async #deleteProjectFile(): Promise<void> {
    const snapshot = this.#snapshot;
    const file = snapshot?.files.find((item) => item.id === this.#activeFileId);
    if (!snapshot || !file || file.id === snapshot.entryFileId) return;
    const response = await fetch(`${apiBase}/files/${encodeURIComponent(file.id)}`, { method: "DELETE", credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error("Project file operation returned an invalid workspace");
    this.#snapshot = value;
    this.#activeFileId = null;
    this.#selectProjectFile(value.entryFileId);
    this.#renderProjectFiles();
    void this.#renderPreview();
    this.#showToast(`Deleted ${file.path}.`);
  }

  async #deleteProjectFolder(folderId: string): Promise<void> {
    const folder = this.#snapshot?.folders.find((item) => item.id === folderId);
    if (!folder) return;
    const response = await fetch(`${apiBase}/folders/${encodeURIComponent(folder.id)}`, { method: "DELETE", credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error("Project folder operation returned an invalid workspace");
    this.#snapshot = value;
    this.#renderProjectFiles();
    this.#showToast(`Deleted ${folder.path}.`);
  }

  async #openProjectHistory(): Promise<void> {
    const response = await fetch(`${apiBase}/history`, { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isProjectRevisionSummaries(value)) throw new Error("Project history returned an invalid timeline");
    this.#projectHistory = value;
    this.#renderProjectHistory();
    if (!this.#elements.projectHistoryDialog.open) this.#elements.projectHistoryDialog.showModal();
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
  }

  async #inspectProjectRevision(revision: number): Promise<void> {
    const response = await fetch(`${apiBase}/history/${revision}`, { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isProjectRevisionContent(value)) throw new Error("Project revision returned an invalid snapshot");
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
    const response = await fetch(`${apiBase}/history/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      credentials: "same-origin",
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isProjectRevisionDiff(value)) throw new Error("Project history returned an invalid comparison");
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
    const response = await jsonFetch(`${apiBase}/history/${revision}/milestones`, { name, description });
    await expectOk(response);
    await this.#openProjectHistory();
    this.#showToast(`Milestone “${name}” now identifies v${revision}.`);
  }

  async #restoreProjectRevision(revision: number): Promise<void> {
    if (!window.confirm(`Restore v${revision} as a new head revision? Current history will be preserved.`)) return;
    const response = await jsonFetch(`${apiBase}/history/${revision}/restore`, {});
    await expectOk(response);
    this.#showToast(`Restored v${revision} as a new head.`);
    window.location.reload();
  }

  async #seedProjectRevision(revision: number): Promise<void> {
    const title = window.prompt(`Name the new project seeded from v${revision}`)?.trim();
    if (!title) return;
    const response = await jsonFetch(`${apiBase}/history/${revision}/seed`, { title });
    await expectOk(response);
    const value: unknown = await response.json();
    const summaries: unknown = [value];
    if (!isWorkspaceSummaries(summaries) || !summaries[0]) throw new Error("Project branch returned an invalid workspace");
    window.location.assign(summaries[0].href);
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
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(from, Math.max(from, to));
    this.#rememberAuthoringSelection();
  }

  async #openReferenceLibrary(): Promise<void> {
    this.#activateContext(RESEARCH_LIBRARY_KEY);
    await this.#refreshReferenceLibrary();
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
    this.#contextState = reconcileResearchContext(this.#contextState, this.#researchContextAuthorization());
    this.#renderReferenceLibrary();
    this.#renderResearchContext();
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
      select.replaceChildren(new Option("Choose source…", ""), ...references.map((reference) => new Option(reference.title, reference.id)));
      if (references.some((reference) => reference.id === current)) select.value = current;
    }
  }

  #renderCitationNetwork(): void {
    const network = this.#citationNetwork;
    if (!network) return;
    this.#renderCitationGraph(network);
    this.#elements.citationNetworkList.replaceChildren();
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
    const unmatched = isUnknownRecord(value) && Array.isArray(value.unmatched) ? value.unmatched.length : 0;
    await this.#refreshCitationNetwork();
    this.#showToast(
      unmatched > 0
        ? `Known Crossref relationships added; ${unmatched} external reference${unmatched === 1 ? "" : "s"} await library matching.`
        : "Known Crossref relationships added to the shared citation network.",
    );
  }

  #referenceLibraryCard(reference: BibliographicRecord): HTMLElement {
    const card = document.createElement("article");
    card.className = "library-reference-row";
    card.dataset.referenceId = reference.id;
    const keyState = this.#librarySnapshot?.referenceKeyStates[reference.id] ?? "final";
    const linked = this.#snapshot?.projectReferences.find((item) => item.referenceId === reference.id);
    const artifacts = this.#librarySnapshot?.artifacts.filter((artifact) => artifact.referenceId === reference.id) ?? [];
    const main = document.createElement("div");
    main.className = "library-reference-main";
    const title = document.createElement("h3");
    title.className = "library-reference-title";
    title.textContent = reference.title || "Untitled reference";
    title.title = reference.title || "Untitled reference";
    const details = document.createElement("p");
    details.className = "library-reference-meta";
    details.textContent = [
      reference.authors.join("; "),
      reference.year,
      reference.venue,
      reference.referenceKey,
      keyState === "provisional" ? "provisional" : "",
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
    if (linked) {
      const remove = actionButton("Linked", "button-secondary", () => void this.#unlinkProjectReference(reference.id));
      remove.title = `Remove :cite[${linked.citationAlias}] from this project`;
      actions.append(remove);
    } else {
      const add = actionButton("Add", "button-primary", () => void this.#linkLibraryReference(reference.id, reference.referenceKey));
      add.title = `Add :cite[${reference.referenceKey}] to this project`;
      actions.append(add);
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
    const metadataFields = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
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
      input.value = value;
      input.placeholder = name;
      input.setAttribute("aria-label", `${name} for ${reference.title}`);
      metadataFields.set(name, input);
      metadataBody.append(input);
    }
    const abstract = document.createElement("textarea");
    abstract.className = "field mt-2 min-h-20";
    abstract.value = reference.abstract;
    abstract.placeholder = "abstract";
    metadataFields.set("abstract", abstract);
    metadataBody.append(
      abstract,
      actionButton("Save details", "button-primary mt-2", () => void this.#saveReferenceMetadata(reference.id, metadataFields)),
    );
    const tags = document.createElement("input");
    tags.className = "field mt-3";
    tags.value = (this.#librarySnapshot?.tags[reference.id] ?? []).join(", ");
    tags.placeholder = "Private tags, comma separated";
    tags.setAttribute("aria-label", `Private tags for ${reference.title}`);
    metadataBody.append(tags);
    const collections = document.createElement("input");
    collections.className = "field mt-2";
    collections.value = (this.#librarySnapshot?.collections[reference.id] ?? []).join(", ");
    collections.placeholder = "Collections, comma separated";
    metadataBody.append(collections);
    const privateActions = document.createElement("div");
    privateActions.className = "mt-2 flex flex-wrap gap-2";
    privateActions.append(
      actionButton("Save tags", "button-secondary", () => void this.#saveReferenceTags(reference.id, tags.value)),
      actionButton("Save collections", "button-secondary", () => void this.#saveReferenceCollections(reference.id, collections.value)),
      actionButton(
        reference.archivedAt ? "Restore" : "Archive",
        "button-secondary",
        () => void this.#setReferenceArchived(reference.id, reference.archivedAt === null),
      ),
    );
    metadataBody.append(privateActions);
    const reading = this.#librarySnapshot?.reading.find((item) => item.referenceId === reference.id);
    const readingStatus = document.createElement("select");
    readingStatus.className = "field mt-3";
    for (const value of ["unread", "reading", "read"] as const) readingStatus.append(new Option(value, value));
    readingStatus.value = reading?.status ?? "unread";
    const priority = document.createElement("select");
    priority.className = "field mt-2";
    for (const value of ["low", "normal", "high"] as const) priority.append(new Option(`Priority: ${value}`, value));
    priority.value = reading?.priority ?? "normal";
    const rating = document.createElement("select");
    rating.className = "field mt-2";
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
    noteInput.placeholder = "Add a private note";
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
      const row = this.#privateResearchRow(reference.id, "artifact", artifact.id, `PDF · ${artifact.name}`, linked !== undefined);
      const rights = document.createElement("select");
      rights.className = "field mt-2";
      for (const value of ["private", "unknown", "shareable"] as const) rights.append(new Option(`Rights: ${value}`, value));
      rights.value = artifact.rights;
      rights.addEventListener("change", () => void this.#setArtifactRights(artifact.id, rights.value));
      const review = document.createElement("section");
      review.className = "hidden mt-3 border-t border-app-line pt-3";
      row.append(
        actionButton("Open PDF", "button-secondary mt-2", () => void this.#openLibraryPdf(artifact)),
        rights,
        actionButton("Refine metadata", "button-secondary mt-2", () => void this.#refinePdfMetadata(reference, artifact, review)),
        review,
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
    kind: "artifact" | "note" | "highlight" | "web-snapshot",
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
    for (const reference of references) select.append(new Option(reference.title, reference.id));
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

  async #refinePdfMetadata(reference: BibliographicRecord, artifact: LibraryPdfArtifact, container: HTMLElement): Promise<void> {
    container.classList.remove("hidden");
    container.replaceChildren(resourceLabel("Refine metadata"), statusText("Step 1 of 2 · Reading embedded metadata and opening pages…"));
    try {
      const candidates = await extractPdfMetadata(`/api/library/pdfs/${encodeURIComponent(artifact.id)}`);
      container.replaceChildren(resourceLabel("Refine metadata"), statusText("Step 2 of 2 · Searching scholarly metadata…"));
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
        this.#renderMetadataRefinement(reference, artifact, candidates, preview, container);
      } catch (error) {
        this.#renderMetadataRefinement(
          reference,
          artifact,
          candidates,
          { referenceId: reference.id, artifactId: artifact.id, candidates: [] },
          container,
          error instanceof Error ? error.message : "Provider lookup failed.",
        );
      }
    } catch (error) {
      container.replaceChildren(
        resourceLabel("Refine metadata"),
        statusText(error instanceof Error ? `Metadata could not be refined: ${error.message}` : "Metadata could not be refined."),
      );
    }
  }

  #renderMetadataRefinement(
    reference: BibliographicRecord,
    artifact: LibraryPdfArtifact,
    local: PdfMetadataCandidates,
    preview: MetadataRefinementPreview,
    container: HTMLElement,
    providerError = "",
  ): void {
    container.replaceChildren(
      resourceLabel(`Refine metadata · ${local.pagesScanned} PDF page${local.pagesScanned === 1 ? "" : "s"} scanned`),
    );
    const localSection = document.createElement("section");
    localSection.className = "mt-3 border-t border-app-line pt-3";
    this.#renderPdfMetadataReview(reference, artifact, local, localSection);
    container.append(localSection);
    const providerSection = document.createElement("section");
    providerSection.className = "mt-3 border-t border-app-line pt-3";
    providerSection.append(resourceLabel("Scholarly metadata matches"));
    if (preview.candidates.length === 0) {
      providerSection.append(
        statusText(
          providerError
            ? `Provider lookup failed: ${providerError} You can still apply the PDF suggestions or edit details manually.`
            : "No provider matches were found. You can still apply the PDF suggestions or edit details manually.",
        ),
      );
      container.append(providerSection);
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
      const group = groups[Number(workSelect.value)];
      if (group) this.#renderProviderMetadataReview(reference, group.candidates, comparison);
    };
    workSelect.addEventListener("change", renderSelected);
    if (groups.length > 1) providerSection.append(workSelect);
    providerSection.append(comparison);
    container.append(providerSection);
    renderSelected();
  }

  #renderProviderMetadataReview(
    reference: BibliographicRecord,
    candidates: readonly MetadataRefinementCandidate[],
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
      row.className = "mt-2 grid gap-1 border-t border-app-line pt-2 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]";
      const name = document.createElement("span");
      name.className = "font-medium capitalize";
      name.textContent = field;
      const choice = document.createElement("span");
      const source = document.createElement("select");
      source.className = "field py-1.5";
      source.setAttribute("aria-label", `Source for ${field}`);
      source.append(new Option("Keep current", ""));
      for (const option of options) source.append(new Option(scholarlyProviderLabel(option.candidate.provider), String(option.index)));
      source.value = String(options[0]!.index);
      const value = document.createElement("span");
      value.className = "mt-1 block break-words text-app-text";
      const existing = document.createElement("span");
      existing.className = "mt-1 block break-words text-app-text-soft";
      existing.textContent = `Current: ${current || "—"}`;
      const renderValue = (): void => {
        const candidate = source.value ? candidates[Number(source.value)] : undefined;
        value.textContent = candidate ? metadataFieldValue(candidate.metadata, field) : current || "—";
      };
      source.addEventListener("change", renderValue);
      renderValue();
      choice.append(source, value, existing);
      row.append(name, choice);
      container.append(row);
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
    await this.#refreshBibliographicMetadata();
    this.#showToast("Scholarly metadata applied with field-level provenance.");
  }

  #renderPdfMetadataReview(
    reference: BibliographicRecord,
    artifact: LibraryPdfArtifact,
    candidates: PdfMetadataCandidates,
    container: HTMLElement,
  ): void {
    container.replaceChildren(
      resourceLabel(`PDF metadata · ${candidates.pagesScanned} page${candidates.pagesScanned === 1 ? "" : "s"} scanned`),
    );
    const rows = [
      ["title", candidates.title, reference.title],
      ["authors", candidates.authors.join("; "), reference.authors.join("; ")],
      ["year", candidates.year, reference.year],
      ["doi", candidates.doi, reference.doi],
    ] as const;
    const selections = new Map<(typeof rows)[number][0], { checkbox: HTMLInputElement; input: HTMLInputElement }>();
    for (const [field, suggested, current] of rows) {
      if (!suggested || suggested === current) continue;
      const label = document.createElement("label");
      label.className = "mt-2 grid grid-cols-[auto_1fr] items-start gap-2 text-xs";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.className = "mt-3";
      const content = document.createElement("span");
      const caption = document.createElement("span");
      caption.className = "block text-app-text-soft";
      caption.textContent = `${field}${current ? ` · current: ${current}` : ""}`;
      const input = document.createElement("input");
      input.className = "field mt-1";
      input.value = suggested;
      input.maxLength = field === "title" ? 2_000 : field === "authors" ? 19_200 : 500;
      content.append(caption, input);
      label.append(checkbox, content);
      container.append(label);
      selections.set(field, { checkbox, input });
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
    selections: ReadonlyMap<string, { checkbox: HTMLInputElement; input: HTMLInputElement }>,
  ): Promise<void> {
    const fields: Record<string, string | string[]> = {};
    for (const [field, selection] of selections) {
      if (!selection.checkbox.checked) continue;
      fields[field] =
        field === "authors"
          ? selection.input.value
              .split(";")
              .map((value) => value.trim())
              .filter(Boolean)
          : selection.input.value.trim();
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

  async #sharePrivateResearch(
    referenceId: string,
    kind: "artifact" | "note" | "highlight" | "web-snapshot",
    resourceId: string,
  ): Promise<void> {
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

  async #setReferenceArchived(referenceId: string, archived: boolean): Promise<void> {
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
    this.#renderResources();
    this.#renderProjectFiles();
    void this.#renderPreview();
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
      libraryPdfIds: new Set(this.#librarySnapshot?.artifacts.map((artifact) => artifact.id) ?? []),
      candidateIds: new Set(this.#snapshot?.candidates.map((candidate) => candidate.id) ?? []),
    };
  }

  #renderPdfs(pdfs: PdfResource[]): void {
    this.#elements.pdfCount.textContent = String(pdfs.length);
    this.#elements.pdfList.replaceChildren();
    this.#elements.annotationPdf.replaceChildren();
    this.#elements.annotationPdf.disabled = true;
    if (pdfs.length === 0) {
      this.#elements.pdfList.append(emptyState("No paper imported yet."));
      this.#elements.annotationPdf.append(new Option("Import a PDF first", ""));
      return;
    }
    for (const pdf of pdfs) {
      const card = document.createElement("article");
      card.className = "resource-card";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "block w-full text-left";
      button.dataset.pdfId = pdf.id;
      button.append(resourceLabel("PDF · " + formatBytes(pdf.size)), resourceTitle(pdf.name));
      button.addEventListener("click", () => {
        this.#elements.annotationPdf.value = pdf.id;
        void this.#showPaper(pdf);
      });
      const remove = actionButton("Remove from project", "button-secondary mt-3 w-full justify-center", () => void this.#removePdf(pdf));
      card.append(button, remove);
      this.#elements.pdfList.append(card);
      this.#elements.annotationPdf.append(new Option(pdf.name, pdf.id));
    }
    if (this.#renderedPdfId) this.#elements.annotationPdf.value = this.#renderedPdfId;
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
      card.append(resourceLabel(`${publication.type} · ${publication.metadataSource}`), resourceTitle(publication.title));
      const details = document.createElement("p");
      details.className = "mt-2 font-sans text-xs leading-5 text-app-text-soft";
      details.textContent = [publication.authors.join("; "), publication.year, publication.venue].filter(Boolean).join(" · ");
      card.append(details);
      const actions = document.createElement("div");
      actions.className = "mt-3 flex flex-wrap items-center gap-2";
      actions.append(actionButton("Open in context", "button-secondary", () => this.#openPublicationContext(publication)));
      const projectReference = this.#snapshot?.projectReferences.find((link) => link.referenceId === publication.id);
      if (projectReference) {
        actions.append(resourceLabel(`alias:${projectReference.citationAlias}`));
        actions.append(actionButton("Manage in library", "button-secondary", () => void this.#openReferenceLibrary()));
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
    this.#elements.annotationCount.textContent = String(annotations.length);
    this.#elements.annotationList.replaceChildren();
    if (annotations.length === 0) {
      this.#elements.annotationList.append(emptyState("Annotations appear here with their source context."));
      return;
    }
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
      this.#elements.annotationList.append(card);
    }
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
      stamp.textContent = `r${candidate.sourceRevision}`;
      top.append(stamp);
      const excerpt = document.createElement("p");
      excerpt.className = "mt-2 line-clamp-2 font-mono text-xs leading-5 text-app-text-soft";
      excerpt.textContent = candidate.target.anchor.exact;
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
      this.#elements.researchInventory.classList.remove("hidden");
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
      this.#elements.researchInventory.classList.add("hidden");
      this.#elements.knowledgeSearchResults.replaceChildren(emptyState(error instanceof Error ? error.message : "Project search failed"));
    }
  }

  #renderKnowledgeSearchResults(results: KnowledgeSearchResult[]): void {
    this.#elements.knowledgeSearchResults.replaceChildren();
    this.#elements.knowledgeSearchResults.classList.remove("hidden");
    this.#elements.researchInventory.classList.add("hidden");
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

  #showWorkspaceSurface(surface: "authoring" | "context"): void {
    this.#elements.workspaceSurfaces.dataset.activeSurface = surface;
    this.#elements.showAuthoringSurface.setAttribute("aria-pressed", String(surface === "authoring"));
    this.#elements.showContextSurface.setAttribute("aria-pressed", String(surface === "context"));
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
    this.#showWorkspaceSurface("context");
    this.#focusContextTab(key);
  }

  #openPublicationContext(publication: PublicationResource): void {
    this.#captureActiveContextState();
    this.#contextState = openResearchResource(this.#contextState, { kind: "publication", id: publication.id });
    this.#renderResearchContext();
    this.#showWorkspaceSurface("context");
    this.#focusContextTab(researchResourceKey({ kind: "publication", id: publication.id }));
  }

  #openCandidateContext(candidate: ModelCandidate): void {
    this.#captureActiveContextState();
    this.#contextState = openResearchResource(this.#contextState, { kind: "candidate", id: candidate.id });
    this.#renderResearchContext();
    this.#showWorkspaceSurface("context");
    this.#focusContextTab(researchResourceKey({ kind: "candidate", id: candidate.id }));
  }

  #closeActiveContext(): void {
    this.#closeContextTab(this.#contextState.activeKey);
  }

  #setContextPinned(key: ResearchContextKey, pinned: boolean): void {
    this.#captureActiveContextState();
    this.#contextState = setResearchTabPinned(this.#contextState, key, pinned);
    this.#renderResearchContext();
    this.#focusContextTab(key);
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
    const activeLibraryPdf = activeTab?.kind === "library-pdf";
    this.#elements.contextPdfPanel.hidden = !activePdf;
    this.#elements.contextPdfPanel.dataset.libraryPdf = String(activeLibraryPdf);
    this.#elements.annotationComposer.hidden = activeLibraryPdf;
    this.#elements.libraryHighlightComposer.hidden = !activeLibraryPdf;
    this.#renderLibraryHighlightComposer(
      activeTab?.kind === "library-pdf" ? this.#librarySnapshot?.artifacts.find((artifact) => artifact.id === activeTab.id) : undefined,
    );
    this.#elements.contextCandidatePanel.hidden = activeTab?.kind !== "candidate";
    this.#elements.previewContextControls.hidden = activeKey !== RESEARCH_PREVIEW_KEY;
    this.#elements.pdfContextControls.hidden = !activePdf;
    const activePdfPublications =
      activeTab?.kind === "pdf" ? (this.#snapshot?.publicationPdfLinks.filter((link) => link.pdfId === activeTab.id) ?? []) : [];
    this.#elements.citeActivePdf.disabled = activePdfPublications.length !== 1;
    this.#elements.citeActivePdf.textContent =
      activePdfPublications.length > 1
        ? "Choose reference to cite"
        : activePdfPublications.length === 1
          ? "Cite linked reference"
          : "Identify before citing";
    this.#elements.pinActiveContext.disabled = !activeTab;
    this.#elements.closeActiveContext.disabled = !activeTab;
    this.#elements.pinActiveContext.hidden = !activeTab;
    this.#elements.closeActiveContext.hidden = !activeTab;
    this.#elements.pinActiveContext.textContent = activeTab?.pinned ? "Unpin" : "Pin";
    this.#elements.pinActiveContext.setAttribute(
      "aria-label",
      activeTab ? `${activeTab.pinned ? "Unpin" : "Pin"} ${this.#contextTabTitle(activeTab)}` : "Pin active context",
    );
    this.#elements.closeActiveContext.setAttribute(
      "aria-label",
      activeTab ? `Close ${this.#contextTabTitle(activeTab)}` : "Close active context",
    );
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
    if (this.#publicationIntakeContextPdfId !== pdfId) {
      this.#publicationIntakeContextPdfId = pdfId;
      this.#publicationIntakeRequest += 1;
      this.#publicationIntakeBusy = false;
      this.#publicationIntakePreview = null;
    }

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
      copy.append(resourceLabel(`Reference · ${publication.citationKey}`), resourceTitle(publication.title));
      row.append(
        copy,
        actionButton("Open reference", "button-secondary shrink-0", () => this.#openPublicationContext(publication)),
      );
      this.#elements.publicationIntakeLinkedList.append(row);
    }

    const preview = this.#publicationIntakePreview?.pdfId === pdfId ? this.#publicationIntakePreview : null;
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
    const request = ++this.#publicationIntakeRequest;
    this.#publicationIntakeBusy = true;
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
      if (request !== this.#publicationIntakeRequest || active?.kind !== "pdf" || active.id !== pdfId || value.pdfId !== pdfId) return;
      this.#publicationIntakePreview = value;
      this.#elements.publicationIntakeStatus.textContent = value.existingPublicationId
        ? "This DOI is already in the library. Review the existing key, then connect this PDF."
        : "Review the metadata and citation key before adding it.";
      this.#renderPublicationIntake(pdfId);
      this.#elements.publicationIntakeKey.focus();
    } catch (error) {
      if (request !== this.#publicationIntakeRequest) return;
      this.#publicationIntakePreview = null;
      this.#elements.publicationIntakeReview.hidden = true;
      this.#elements.publicationIntakeStatus.textContent = error instanceof Error ? error.message : "DOI lookup failed";
    } finally {
      if (request === this.#publicationIntakeRequest) {
        this.#publicationIntakeBusy = false;
        this.#updatePublicationIntakeAvailability();
      }
    }
  }

  async #acceptPublicationIntake(): Promise<void> {
    const preview = this.#publicationIntakePreview;
    const active = this.#activeResourceTab();
    if (!preview || active?.kind !== "pdf" || active.id !== preview.pdfId) return;
    const request = ++this.#publicationIntakeRequest;
    this.#publicationIntakeBusy = true;
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
      this.#publicationIntakePreview = null;
      this.#elements.publicationIntakeStatus.textContent = "Reference added and PDF connected. Citation remains a separate action.";
      this.#openPublicationContext(publication);
      this.#showToast("Reference added and connected; the manuscript is unchanged.");
    } catch (error) {
      if (request !== this.#publicationIntakeRequest) return;
      this.#elements.publicationIntakeStatus.textContent = error instanceof Error ? error.message : "Publication intake failed";
      this.#elements.publicationIntakeKey.focus();
    } finally {
      if (request === this.#publicationIntakeRequest) {
        this.#publicationIntakeBusy = false;
        this.#updatePublicationIntakeAvailability();
      }
    }
  }

  #cancelPublicationIntake(): void {
    this.#publicationIntakeRequest += 1;
    this.#publicationIntakeBusy = false;
    this.#publicationIntakePreview = null;
    this.#elements.publicationIntakeReview.hidden = true;
    this.#elements.publicationIntakeStatus.textContent = "Lookup cancelled. The library and PDF are unchanged.";
    this.#updatePublicationIntakeAvailability();
    this.#elements.publicationIntakeDoi.focus();
  }

  #updatePublicationIntakeAvailability(): void {
    const submit = this.#elements.publicationIntakeForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!submit) throw new Error("Missing DOI lookup action");
    submit.disabled = this.#publicationIntakeBusy;
    this.#elements.publicationIntakeDoi.disabled = this.#publicationIntakeBusy;
    this.#elements.publicationIntakeKey.disabled = this.#publicationIntakeBusy;
    this.#elements.publicationIntakeAccept.disabled = this.#publicationIntakeBusy;
    this.#elements.publicationIntakeCancel.disabled = this.#publicationIntakeBusy;
  }

  #renderContextResourceTab(tab: ResearchResourceTab): HTMLButtonElement {
    const title = this.#contextTabTitle(tab);
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
    return button;
  }

  #renderCandidateContext(tab: ResearchResourceTab): void {
    if (tab.kind !== "candidate" || !this.#snapshot) return;
    const candidate = this.#snapshot.candidates.find((item) => item.id === tab.id);
    if (!candidate) return;

    this.#elements.contextCandidateTitle.textContent = "Revise selected passage";
    this.#elements.contextCandidateMeta.textContent = [
      candidate.model,
      candidate.providerLabel,
      candidate.promptVersion,
      `source r${candidate.sourceRevision}`,
    ].join(" · ");
    this.#elements.contextCandidateBefore.textContent = candidate.target.anchor.exact;
    this.#elements.contextCandidateAfter.textContent = candidate.proposedReplacement;
    const applicable = this.#candidateApplicable(candidate);
    this.#elements.contextCandidateStatus.textContent =
      candidate.status === "pending"
        ? applicable
          ? "Pending review. Applying changes only this exact selected passage."
          : "Pending but stale. Reject it or generate a new revision from current prose and evidence."
        : candidate.status === "accepted"
          ? "Accepted. The replacement was applied to canonical Markdown."
          : "Rejected. Canonical Markdown was not changed by this candidate.";

    this.#elements.contextCandidateEvidence.replaceChildren();
    for (const evidence of candidate.evidence) this.#elements.contextCandidateEvidence.append(this.#renderCandidateEvidence(evidence));

    const pending = candidate.status === "pending";
    const currentDecision = this.#candidateDecision?.id === candidate.id ? this.#candidateDecision : null;
    const decisionBusy = this.#candidateDecision !== null;
    this.#elements.contextCandidateApply.dataset.candidateId = candidate.id;
    this.#elements.contextCandidateApply.dataset.candidateAction = "apply";
    this.#elements.contextCandidateApply.dataset.candidateApplicable = String(applicable);
    this.#elements.contextCandidateApply.textContent = currentDecision?.action === "apply" ? "Applying…" : "Apply replacement";
    this.#elements.contextCandidateApply.disabled = decisionBusy || !pending || !applicable || !this.#hasStableDocumentBase();
    this.#elements.contextCandidateReject.dataset.candidateId = candidate.id;
    this.#elements.contextCandidateReject.textContent = currentDecision?.action === "reject" ? "Rejecting…" : "Reject revision";
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
    return (
      candidate.status === "pending" &&
      candidate.sourceRevision === this.#revision &&
      candidate.target.resolution.status === "resolved" &&
      candidate.target.resolution.exactMatch
    );
  }

  #toggleActiveContextPin(): void {
    const tab = this.#activeResourceTab();
    if (tab) this.#setContextPinned(tab.key, !tab.pinned);
  }

  #closeContextTab(key: ResearchContextKey): void {
    this.#captureActiveContextState();
    this.#contextState = closeResearchTab(this.#contextState, key);
    this.#renderResearchContext();
    this.#focusContextTab(this.#contextState.activeKey);
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
      return this.#librarySnapshot?.artifacts.find((artifact) => artifact.id === tab.id)?.name ?? "Private PDF";
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

    this.#elements.contextPublicationTitle.textContent = publication.title;
    this.#elements.contextPublicationMeta.textContent = [
      publication.authors.join("; "),
      publication.year,
      publication.venue,
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
    const linkedPdfs = links
      .map((link) => ({ link, pdf: this.#snapshot?.pdfs.find((pdf) => pdf.id === link.pdfId) }))
      .filter((item): item is { link: (typeof links)[number]; pdf: PdfResource } => Boolean(item.pdf));
    this.#elements.openPaper.disabled = linkedPdfs.length !== 1;
    this.#elements.openPaper.textContent = linkedPdfs.length > 1 ? "Choose a paper below" : "Open linked paper";

    this.#elements.contextPublicationPdfs.replaceChildren();
    if (linkedPdfs.length === 0) {
      this.#elements.contextPublicationPdfs.append(emptyState("No paper connected to this reference yet."));
    } else {
      for (const { link, pdf } of linkedPdfs) {
        const row = document.createElement("div");
        row.className = "resource-card mt-2 flex items-center justify-between gap-3";
        const copy = document.createElement("div");
        copy.className = "min-w-0";
        copy.append(resourceLabel(`PDF · ${formatBytes(pdf.size)}`), resourceTitle(pdf.name));
        const actions = document.createElement("div");
        actions.className = "flex shrink-0 gap-2";
        actions.append(
          actionButton("Open", "button-secondary", () => void this.#showPaper(pdf)),
          actionButton("Disconnect", "button-secondary", () => void this.#unlinkPublicationPdf(link.id)),
        );
        row.append(copy, actions);
        this.#elements.contextPublicationPdfs.append(row);
      }
    }

    const linkedIds = new Set(links.map((link) => link.pdfId));
    const available = this.#snapshot.pdfs.filter((pdf) => !linkedIds.has(pdf.id));
    this.#elements.publicationPdfLink.replaceChildren();
    this.#elements.publicationPdfLink.append(new Option(available.length === 0 ? "No unlinked PDFs available" : "Choose a PDF", ""));
    for (const pdf of available) this.#elements.publicationPdfLink.append(new Option(pdf.name, pdf.id));
    this.#elements.publicationPdfLink.disabled = available.length === 0;
    const submit = this.#elements.publicationPdfLinkForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = available.length === 0;
  }

  #openPreviewCitation(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const citation = event.target.closest<HTMLButtonElement>("button.semantic-citation[data-citation]");
    if (!citation) return;
    const key = parseCitationKeys(citation.dataset.citation ?? "")[0];
    const publication = key ? this.#publicationByCitationKey(key) : undefined;
    if (publication) this.#openPublicationContext(publication);
    else this.#showToast(`No publication resource is available for ${key ?? "this citation"}.`);
  }

  #openCitationAtCaret(): void {
    const keys = citationKeysAtPosition(this.#activeFileText.toString(), this.#elements.source.selectionEnd);
    if (keys.length === 0) {
      this.#showToast("Place the cursor inside a citation directive first.");
      return;
    }
    if (keys.length > 1) {
      this.#showToast("Open this grouped citation from Preview to choose a reference.");
      return;
    }
    const publication = this.#publicationByCitationKey(keys[0] ?? "");
    if (publication) this.#openPublicationContext(publication);
    else this.#showToast(`No publication resource is available for ${keys[0]}.`);
  }

  #publicationByCitationKey(citationKey: string): PublicationResource | undefined {
    const normalized = citationKey.toLocaleLowerCase();
    return this.#snapshot?.publications.find((publication) => publication.citationKey.toLocaleLowerCase() === normalized);
  }

  #rememberAuthoringSelection(): void {
    this.#authoringSelection = captureRelativeSelection(this.#elements.source, this.#activeFileText);
    const citationAtCaret = citationKeysAtPosition(this.#activeFileText.toString(), this.#elements.source.selectionEnd).length > 0;
    this.#elements.openSourceCitation.disabled = !citationAtCaret;
    this.#elements.openSourceCitation.classList.toggle("hidden", !citationAtCaret);
    this.#updateCitationInsertionAvailability();
  }

  #resolvedAuthoringCaret(): number | null {
    if (!this.#authoringSelection) return null;
    const end = Y.createAbsolutePositionFromRelativePosition(this.#authoringSelection.end, this.#document);
    return end?.type === this.#activeFileText ? end.index : null;
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
    if (publication) this.#insertPublicationCitation(publication);
  }

  #insertPublicationCitation(publication: PublicationResource): void {
    const index = this.#resolvedAuthoringCaret();
    if (index === null) {
      this.#showToast("Place the manuscript caret before inserting a citation.");
      return;
    }
    const insertion = createCitationInsertion(this.#activeFileText.toString(), index, publication.citationKey);
    if (!insertion) {
      this.#showToast("This reference key cannot be represented by citation syntax.");
      return;
    }
    this.#document.transact(() => this.#activeFileText.insert(insertion.index, insertion.text), this);
    this.#showWorkspaceSurface("authoring");
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(insertion.caret, insertion.caret);
    this.#rememberAuthoringSelection();
    this.#showToast(`Inserted :cite[${publication.citationKey}] into canonical Markdown.`);
  }

  async #linkActivePublicationPdf(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const tab = this.#activeResourceTab();
    const pdfId = this.#elements.publicationPdfLink.value;
    if (tab?.kind !== "publication" || !pdfId) return;
    const response = await jsonFetch(`${apiBase}/publication-pdf-links`, { publicationId: tab.id, pdfId });
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast("Paper connected to this publication.");
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
    const links = this.#snapshot.publicationPdfLinks.filter((item) => item.publicationId === tab.id);
    const pdf = links.length === 1 ? this.#snapshot.pdfs.find((item) => item.id === links[0]?.pdfId) : undefined;
    if (pdf) await this.#showPaper(pdf);
  }

  async #loadActivePdf(force: boolean): Promise<void> {
    const tab = this.#activeResourceTab();
    if (tab?.kind !== "pdf" && tab?.kind !== "library-pdf") return;
    const workspacePdf = tab.kind === "pdf" ? this.#snapshot?.pdfs.find((item) => item.id === tab.id) : undefined;
    const libraryPdf = tab.kind === "library-pdf" ? this.#librarySnapshot?.artifacts.find((item) => item.id === tab.id) : undefined;
    if (!workspacePdf && !libraryPdf) return;
    if (workspacePdf) this.#elements.annotationPdf.value = workspacePdf.id;
    const annotations = workspacePdf
      ? (this.#snapshot?.annotations.filter((annotation) => annotation.pdfId === workspacePdf.id) ?? [])
      : [];
    const pdfUrl = workspacePdf
      ? `${apiBase}/pdfs/${encodeURIComponent(workspacePdf.id)}`
      : libraryPdf
        ? `/api/library/pdfs/${encodeURIComponent(libraryPdf.id)}`
        : null;
    if (!pdfUrl) return;
    this.#pdfViewer.updateAnnotations(annotations);
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
        mode: workspacePdf ? "evidence" : "private-highlight",
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

  async #importBibliography(): Promise<void> {
    const file = this.#elements.bibliographyUpload.files?.[0];
    if (!file) return;
    this.#showToast(`Importing ${file.name}…`);
    const response = await jsonFetch(`${apiBase}/bibliography/import`, { bibtex: await file.text() });
    await expectOk(response);
    this.#elements.bibliographyUpload.value = "";
    await this.#resourceRefresh.request();
    this.#showToast("References merged by citation key.");
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
    if (!this.#snapshot || !this.#hasStableDocumentBase()) {
      this.#elements.modelStatus.textContent = "Wait for the manuscript to finish synchronizing before using the model.";
      return;
    }

    const passage = this.#selectedAuthoringPassage();
    const evidence = this.#modelEvidence();
    if (!passage || evidence.items.length === 0) {
      this.#elements.modelStatus.textContent = "Select manuscript text and at least one annotation or claim first.";
      return;
    }
    let provider: OpenAICompatibleBrowserProvider;
    try {
      provider = this.#modelProvider();
    } catch (error) {
      this.#elements.modelStatus.textContent = error instanceof Error ? error.message : "Enter a valid local model endpoint.";
      return;
    }
    const sourceRevision = this.#revision;
    const instruction = this.#elements.modelInstruction.value;
    this.#modelBusy = true;
    this.#updateModelAvailability();
    this.#elements.modelStatus.textContent = "Asking the local model for a grounded candidate…";
    try {
      const revision = await provider.reviseSelection({ selectedPassage: passage.excerpt, instruction, evidence: evidence.items });
      const response = await jsonFetch(`${apiBase}/candidates`, {
        providerAdapter: "openai-compatible",
        providerLabel: revision.providerLabel,
        model: revision.model,
        promptVersion: "revise-selection-v1",
        instruction,
        target: { ...passage, sourceRevision },
        evidence: evidence.references,
        proposedReplacement: revision.replacement,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isModelCandidate(value)) throw new Error("Candidate endpoint returned an invalid targeted revision");
      await this.#resourceRefresh.request();
      const candidate = this.#snapshot?.candidates.find((item) => item.id === value.id) ?? value;
      this.#openCandidateContext(candidate);
      this.#elements.modelStatus.textContent = "Candidate ready. Review its exact replacement and evidence in Context.";
    } catch (error) {
      this.#elements.modelStatus.textContent = error instanceof Error ? error.message : "Local model request failed";
    } finally {
      this.#modelBusy = false;
      this.#updateModelAvailability();
    }
  }

  async #updateCandidate(candidateId: string, action: "apply" | "reject"): Promise<void> {
    if (this.#candidateDecision) return;
    if (action === "apply" && !this.#hasStableDocumentBase()) {
      this.#showToast("Wait for the manuscript to finish synchronizing before applying a candidate.");
      return;
    }
    this.#candidateDecision = { id: candidateId, action };
    this.#renderResearchContext(false);
    this.#updateModelAvailability();
    let failure: string | null = null;
    try {
      const response = await fetch(`${apiBase}/candidates/${candidateId}/${action}`, { method: "POST" });
      await expectOk(response);
      await this.#resourceRefresh.request();
      if (action === "reject") this.#contextState = activateResearchTab(this.#contextState, RESEARCH_ASSISTANT_KEY);
      this.#showToast(action === "apply" ? "Candidate applied to canonical Markdown." : "Candidate rejected; manuscript unchanged.");
    } catch (error) {
      failure = error instanceof Error ? error.message : "Candidate decision failed";
      await this.#resourceRefresh.request().catch(() => undefined);
      this.#showToast(failure);
    } finally {
      this.#candidateDecision = null;
      this.#renderResearchContext(false);
      this.#updateModelAvailability();
      if (!failure && action === "reject") this.#focusContextTab(RESEARCH_ASSISTANT_KEY);
      const current = this.#snapshot?.candidates.find((candidate) => candidate.id === candidateId);
      if (failure && current?.status === "pending" && this.#activeResourceTab()?.id === candidateId) {
        this.#elements.contextCandidateStatus.textContent = `Could not ${action === "apply" ? "apply" : "reject"} revision: ${failure}`;
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
    this.#showWorkspaceSurface("context");
    this.#focusContextTab(key);
    await this.#loadActivePdf(page !== undefined || focusAnnotationId !== undefined);
  }

  async #openLibraryPdf(artifact: LibraryPdfArtifact, page?: number): Promise<void> {
    this.#captureActiveContextState();
    this.#contextState = openResearchResource(this.#contextState, { kind: "library-pdf", id: artifact.id });
    const key = researchResourceKey({ kind: "library-pdf", id: artifact.id });
    if (page !== undefined) this.#contextState = setPdfResearchLocation(this.#contextState, key, { page });
    this.#renderResearchContext(false);
    this.#showWorkspaceSurface("context");
    this.#focusContextTab(key);
    await this.#loadActivePdf(page !== undefined);
  }

  #capturePdfSelection(capture: PdfSelectionCapture): void {
    const activeTab = this.#activeResourceTab();
    if (activeTab?.kind === "library-pdf") {
      const artifact = this.#librarySnapshot?.artifacts.find((item) => item.id === activeTab.id);
      if (!artifact) return;
      this.#elements.libraryHighlightComposer.dataset.artifactId = artifact.id;
      this.#elements.libraryHighlightPage.value = String(capture.page);
      this.#elements.libraryHighlightQuote.value = capture.quote;
      this.#elements.libraryHighlightExcerpt.textContent = `“${capture.quote}”`;
      this.#elements.libraryHighlightForm.hidden = false;
      this.#elements.saveLibraryHighlight.disabled = false;
      this.#elements.cancelLibraryHighlight.disabled = false;
      this.#elements.libraryHighlightStatus.textContent = `Page ${capture.page} selection ready.`;
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
        : `Captured ${capture.rects.length} ${capture.rects.length === 1 ? "fragment" : "fragments"} from page ${capture.page}. Saving automatically…`;
    void this.#persistPdfSelection(capture);
  }

  #renderLibraryHighlightComposer(artifact: LibraryPdfArtifact | undefined): void {
    if (!artifact || !this.#librarySnapshot) return;
    if (this.#elements.libraryHighlightComposer.dataset.artifactId !== artifact.id) {
      this.#elements.libraryHighlightComposer.dataset.artifactId = artifact.id;
      this.#elements.libraryHighlightPage.value = "1";
      this.#elements.libraryHighlightQuote.value = "";
      this.#elements.libraryHighlightComment.value = "";
      this.#elements.libraryHighlightExcerpt.textContent = "";
      this.#elements.libraryHighlightForm.hidden = true;
      this.#elements.saveLibraryHighlight.disabled = true;
      this.#elements.cancelLibraryHighlight.disabled = true;
      this.#elements.libraryHighlightStatus.textContent = "Select text to highlight.";
    }
    this.#renderLibraryProjectUse(artifact);
    const highlights = this.#librarySnapshot.highlights.filter((highlight) => highlight.artifactId === artifact.id);
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
      actions.append(actionButton(`Open page ${highlight.page}`, "button-secondary", () => void this.#openLibraryHighlight(highlight)));
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
      actions.append(shareAction);
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
        actionButton("Delete", "button-secondary", () => void this.#deleteLibraryPdfMarkup(markup)),
      );
      card.append(actions);
      this.#elements.libraryHighlightList.append(card);
    }
    this.#renderPdfMarkups();
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
        resourceLabel("Step 1 of 3 · Reference"),
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
    if (artifact.rights !== "shareable") {
      const rights = document.createElement("select");
      rights.className = "field mt-3";
      rights.setAttribute("aria-label", "PDF sharing rights");
      rights.append(
        new Option("Private — do not share", "private"),
        new Option("Unknown — not reviewed", "unknown"),
        new Option("Shareable — permission confirmed", "shareable"),
      );
      rights.value = artifact.rights;
      this.#elements.libraryProjectUse.append(
        resourceLabel("Step 2 of 3 · Rights"),
        projectUseDescription(
          "Confirm whether this PDF may be shared with project collaborators. Upload or ownership alone is not permission.",
        ),
        citation,
        rights,
        actionButton("Save rights decision", "button-primary mt-2", () => void this.#saveProjectUseRights(artifact.id, rights.value)),
      );
      return;
    }
    const share = this.#snapshot?.researchShares.find((item) => item.kind === "artifact" && item.resourceId === artifact.id);
    this.#elements.libraryProjectUse.append(citation);
    if (share) {
      this.#elements.libraryProjectUse.prepend(
        resourceLabel("Shared with current project"),
        projectUseDescription("Authorized project members can open this immutable PDF snapshot. Private highlights remain separate."),
      );
      this.#elements.libraryProjectUse.append(
        actionButton("Revoke PDF share", "button-secondary mt-3", () => void this.#revokePrivateResearch(share.id)),
      );
      return;
    }
    this.#elements.libraryProjectUse.prepend(
      resourceLabel("Step 3 of 3 · PDF snapshot"),
      projectUseDescription("Share this immutable PDF snapshot with the current project. Saved private highlights are not included."),
    );
    this.#elements.libraryProjectUse.append(
      actionButton(
        "Share PDF with project",
        "button-primary mt-3",
        () => void this.#sharePrivateResearch(reference.id, "artifact", artifact.id),
      ),
    );
  }

  async #saveProjectUseRights(artifactId: string, rights: string): Promise<void> {
    await this.#setArtifactRights(artifactId, rights);
    this.#showToast("PDF rights decision saved.");
  }

  async #saveLibraryHighlight(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const tab = this.#activeResourceTab();
    if (tab?.kind !== "library-pdf") return;
    const artifact = this.#librarySnapshot?.artifacts.find((item) => item.id === tab.id);
    const quote = this.#elements.libraryHighlightQuote.value.trim();
    if (!artifact?.referenceId || !quote) return;
    const response = await jsonFetch(`/api/library/references/${encodeURIComponent(artifact.referenceId)}/highlights`, {
      artifactId: artifact.id,
      page: Number(this.#elements.libraryHighlightPage.value),
      quote,
      comment: this.#elements.libraryHighlightComment.value,
    });
    await expectOk(response);
    this.#clearLibraryHighlightDraft("Private highlight saved. It remains outside the project until explicitly shared.");
    await this.#refreshReferenceLibrary();
    this.#elements.libraryHighlightStatus.textContent = "Private highlight saved. Select another passage to continue.";
    this.#showToast("Private highlight saved to your library.");
  }

  #clearLibraryHighlightDraft(message = "Selection cancelled. Nothing was saved."): void {
    this.#elements.libraryHighlightPage.value = String(this.#pdfViewer.currentPage);
    this.#elements.libraryHighlightQuote.value = "";
    this.#elements.libraryHighlightComment.value = "";
    this.#elements.libraryHighlightExcerpt.textContent = "";
    this.#elements.libraryHighlightForm.hidden = true;
    this.#elements.saveLibraryHighlight.disabled = true;
    this.#elements.cancelLibraryHighlight.disabled = true;
    this.#elements.libraryHighlightStatus.textContent = message;
    this.#pdfViewer.clearDraftSelection();
  }

  #setLibraryPdfTool(tool: "text" | "note" | "draw"): void {
    this.#libraryPdfTool = tool;
    this.#elements.paperMarkups.dataset.tool = tool;
    this.#elements.paperTextLayer.style.pointerEvents = tool === "text" ? "auto" : "none";
    for (const [button, value] of [
      [this.#elements.libraryTextTool, "text"],
      [this.#elements.libraryNoteTool, "note"],
      [this.#elements.libraryDrawTool, "draw"],
    ] as const)
      button.setAttribute("aria-pressed", String(tool === value));
    this.#elements.libraryInkOptions.hidden = tool !== "draw";
    this.#elements.libraryHighlightStatus.textContent =
      tool === "text"
        ? "Select text to highlight."
        : tool === "note"
          ? "Tap the page to place a note."
          : "Draw on the page with touch, pen, or mouse.";
    if (tool !== "note") this.#clearLibraryPdfNoteDraft(false);
  }

  #startLibraryPdfMarkup(event: PointerEvent): void {
    const note = (event.target as Element).closest<HTMLButtonElement>(".pdf-note-pin");
    if (note) {
      this.#openPdfNoteId = this.#openPdfNoteId === note.dataset.markupId ? null : (note.dataset.markupId ?? null);
      this.#renderPdfMarkups();
      return;
    }
    const point = this.#normalizedPdfPoint(event);
    if (!point) return;
    if (this.#libraryPdfTool === "note") {
      this.#pendingPdfNote = { page: this.#pdfViewer.currentPage, ...point };
      this.#elements.libraryNoteForm.hidden = false;
      this.#elements.libraryNoteBody.focus();
      return;
    }
    if (this.#libraryPdfTool !== "draw") return;
    event.preventDefault();
    this.#pdfDrawingPointer = event.pointerId;
    this.#pdfDrawingDraft = [point];
    this.#elements.paperMarkups.setPointerCapture(event.pointerId);
    this.#renderPdfMarkups();
  }

  #continueLibraryPdfDrawing(event: PointerEvent): void {
    if (this.#pdfDrawingPointer !== event.pointerId || !this.#pdfDrawingDraft) return;
    const point = this.#normalizedPdfPoint(event);
    const previous = this.#pdfDrawingDraft.at(-1);
    if (!point || (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.002)) return;
    this.#pdfDrawingDraft.push(point);
    this.#renderPdfMarkups();
  }

  async #finishLibraryPdfDrawing(event: PointerEvent): Promise<void> {
    if (this.#pdfDrawingPointer !== event.pointerId || !this.#pdfDrawingDraft) return;
    const points = this.#pdfDrawingDraft;
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
    this.#pdfDrawingPointer = null;
    this.#pdfDrawingDraft = null;
  }

  async #saveLibraryPdfNote(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const artifact = this.#activeLibraryPdf();
    const anchor = this.#pendingPdfNote;
    const body = this.#elements.libraryNoteBody.value.trim();
    if (!artifact?.referenceId || !anchor || !body) return;
    const response = await jsonFetch(`/api/library/references/${encodeURIComponent(artifact.referenceId)}/pdf-markups`, {
      kind: "note",
      artifactId: artifact.id,
      ...anchor,
      body,
    });
    await expectOk(response);
    this.#clearLibraryPdfNoteDraft();
    await this.#refreshReferenceLibrary();
    this.#showToast("Note attached privately.");
  }

  #clearLibraryPdfNoteDraft(render = true): void {
    this.#pendingPdfNote = null;
    this.#elements.libraryNoteBody.value = "";
    this.#elements.libraryNoteForm.hidden = true;
    if (render) this.#renderPdfMarkups();
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
    const markups = artifact
      ? (this.#librarySnapshot?.pdfMarkups ?? []).filter((item) => item.artifactId === artifact.id && item.page === page)
      : [];
    this.#elements.paperMarkups.replaceChildren();
    const drawings = markups.filter((item): item is LibraryPdfDrawing => item.kind === "drawing");
    if (this.#pdfDrawingDraft)
      drawings.push({
        id: "draft",
        kind: "drawing",
        referenceId: artifact?.referenceId ?? "",
        artifactId: artifact?.id ?? "",
        page,
        color: this.#elements.libraryDrawColor.value,
        width: Number(this.#elements.libraryDrawWidth.value),
        points: this.#pdfDrawingDraft,
        createdAt: "",
        updatedAt: "",
      });
    if (drawings.length) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("pdf-ink-layer");
      svg.setAttribute("viewBox", "0 0 1000 1000");
      svg.setAttribute("preserveAspectRatio", "none");
      for (const drawing of drawings) {
        const line = document.createElementNS(svg.namespaceURI, "polyline");
        line.setAttribute("points", drawing.points.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" "));
        line.setAttribute("fill", "none");
        line.setAttribute("stroke", drawing.color);
        line.setAttribute("stroke-width", String(drawing.width));
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("stroke-linejoin", "round");
        line.setAttribute("vector-effect", "non-scaling-stroke");
        svg.append(line);
      }
      this.#elements.paperMarkups.append(svg);
    }
    for (const note of markups.filter((item): item is LibraryPdfNote => item.kind === "note")) {
      const pin = document.createElement("button");
      pin.className = "pdf-note-pin";
      pin.type = "button";
      pin.dataset.markupId = note.id;
      pin.style.left = `${note.x * 100}%`;
      pin.style.top = `${note.y * 100}%`;
      pin.setAttribute("aria-label", `Open note on page ${note.page}`);
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
      .at(-1);
    if (drawing) await this.#deleteLibraryPdfMarkup(drawing);
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
    this.#selectProjectFile(anchor.fileId);
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(resolution.start, resolution.end);
    this.#rememberAuthoringSelection();
    this.#elements.source.scrollIntoView({ behavior: "smooth", block: "center" });
    this.#showToast(
      resolution.exactMatch ? "Linked manuscript passage selected." : "Changed linked passage selected; review its current text.",
    );
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

  #showToast(message: string): void {
    window.clearTimeout(this.#toastTimer);
    this.#elements.toast.textContent = message;
    this.#elements.toast.dataset.visible = "true";
    this.#toastTimer = window.setTimeout(() => delete this.#elements.toast.dataset.visible, 3200);
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
        caret.className = "collaborator-caret";
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
          token.classList.toggle("collaborator-selection", segment.selectionColor !== null);
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
  textarea.addEventListener("input", handleInput);
  textarea.addEventListener("scroll", syncHighlightScroll, { passive: true });
  text.observe(handleText);
  renderHighlight();
  syncHighlightScroll();
  return {
    destroy: () => {
      textarea.removeEventListener("input", handleInput);
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
    collaboratorSelections: requiredElement("collaborator-selections", HTMLElement),
    workspaceSwitcher: requiredElement("workspace-switcher", HTMLSelectElement),
    workspaceLayout: requiredElement("workspace-layout", HTMLSelectElement),
    manageWorkspaces: requiredElement("manage-workspaces", HTMLButtonElement),
    workspaceSettings: requiredElement("workspace-settings", HTMLButtonElement),
    workspaceSettingsDialog: requiredElement("workspace-settings-dialog", HTMLDialogElement),
    workspaceSettingsForm: requiredElement("workspace-settings-form", HTMLFormElement),
    workspaceSettingsTitle: requiredElement("workspace-settings-title", HTMLInputElement),
    workspaceCitationStyle: requiredElement("workspace-citation-style", HTMLSelectElement),
    workspaceCitationLocale: requiredElement("workspace-citation-locale", HTMLSelectElement),
    workspaceSubmissionTemplate: requiredElement("workspace-submission-template", HTMLSelectElement),
    workspacePaperSize: requiredElement("workspace-paper-size", HTMLSelectElement),
    closeWorkspaceSettings: requiredElement("close-workspace-settings", HTMLButtonElement),
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
    cancelNewWorkspace: requiredElement("cancel-new-workspace", HTMLButtonElement),
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
    filesRailPanel: requiredElement("files-rail-panel", HTMLElement),
    researchRailPanel: requiredElement("research-rail-panel", HTMLElement),
    commentsRailPanel: requiredElement("comments-rail-panel", HTMLElement),
    newProjectFileRail: requiredElement("new-project-file-rail", HTMLButtonElement),
    newProjectFolderRail: requiredElement("new-project-folder-rail", HTMLButtonElement),
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
    showAuthoringSurface: requiredElement("show-authoring-surface", HTMLButtonElement),
    showContextSurface: requiredElement("show-context-surface", HTMLButtonElement),
    openSourceCitation: requiredElement("open-source-citation", HTMLButtonElement),
    contextTabList: requiredElement("context-tab-list", HTMLElement),
    contextPreviewTab: requiredElement("context-preview-tab", HTMLButtonElement),
    contextLibraryTab: requiredElement("context-library-tab", HTMLButtonElement),
    contextAssistantTab: requiredElement("context-assistant-tab", HTMLButtonElement),
    contextResourceTabs: requiredElement("context-resource-tabs", HTMLElement),
    pinActiveContext: requiredElement("pin-active-context", HTMLButtonElement),
    closeActiveContext: requiredElement("close-active-context", HTMLButtonElement),
    previewContextControls: requiredElement("preview-context-controls", HTMLElement),
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
    contextCandidateTitle: requiredElement("context-candidate-title", HTMLElement),
    contextCandidateMeta: requiredElement("context-candidate-meta", HTMLElement),
    contextCandidateStatus: requiredElement("context-candidate-status", HTMLElement),
    contextCandidateBefore: requiredElement("context-candidate-before", HTMLElement),
    contextCandidateAfter: requiredElement("context-candidate-after", HTMLElement),
    contextCandidateEvidence: requiredElement("context-candidate-evidence", HTMLElement),
    contextCandidateApply: requiredElement("context-candidate-apply", HTMLButtonElement),
    contextCandidateReject: requiredElement("context-candidate-reject", HTMLButtonElement),
    closeCandidateContext: requiredElement("close-candidate-context", HTMLButtonElement),
    contextPublicationTitle: requiredElement("context-publication-title", HTMLElement),
    contextPublicationMeta: requiredElement("context-publication-meta", HTMLElement),
    contextPublicationDetails: requiredElement("context-publication-details", HTMLElement),
    contextPublicationPdfs: requiredElement("context-publication-pdfs", HTMLElement),
    closePublicationContext: requiredElement("close-publication-context", HTMLButtonElement),
    insertContextCitation: requiredElement("insert-context-citation", HTMLButtonElement),
    publicationPdfLinkForm: requiredElement("publication-pdf-link-form", HTMLFormElement),
    publicationPdfLink: requiredElement("publication-pdf-link", HTMLSelectElement),
    preview: requiredElement("preview", HTMLElement),
    diagnostics: requiredElement("diagnostics", HTMLElement),
    diagnosticSummary: requiredElement("diagnostic-summary", HTMLElement),
    connectionDot: requiredElement("connection-dot", HTMLElement),
    connectionStatus: requiredElement("connection-status", HTMLElement),
    saveStatus: requiredElement("save-status", HTMLElement),
    revisionBadge: requiredElement("revision-badge", HTMLElement),
    pdfUpload: requiredElement("pdf-upload", HTMLInputElement),
    pdfCount: requiredElement("pdf-count", HTMLElement),
    pdfList: requiredElement("pdf-list", HTMLElement),
    bibliographyUpload: requiredElement("bibliography-upload", HTMLInputElement),
    knowledgeSearchForm: requiredElement("knowledge-search-form", HTMLFormElement),
    knowledgeSearchInput: requiredElement("knowledge-search-input", HTMLInputElement),
    knowledgeSearchResults: requiredElement("knowledge-search-results", HTMLElement),
    researchInventory: requiredElement("research-inventory", HTMLElement),
    exploreResearchGraph: requiredElement("explore-research-graph", HTMLButtonElement),
    publicationCount: requiredElement("publication-count", HTMLElement),
    publicationList: requiredElement("publication-list", HTMLElement),
    annotationCount: requiredElement("annotation-count", HTMLElement),
    annotationList: requiredElement("annotation-list", HTMLElement),
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
    libraryTextTool: requiredElement("library-text-tool", HTMLButtonElement),
    libraryNoteTool: requiredElement("library-note-tool", HTMLButtonElement),
    libraryDrawTool: requiredElement("library-draw-tool", HTMLButtonElement),
    libraryInkOptions: requiredElement("library-ink-options", HTMLElement),
    libraryDrawColor: requiredElement("library-draw-color", HTMLInputElement),
    libraryDrawWidth: requiredElement("library-draw-width", HTMLInputElement),
    libraryDrawWidthValue: requiredElement("library-draw-width-value", HTMLOutputElement),
    undoLibraryDrawing: requiredElement("undo-library-drawing", HTMLButtonElement),
    exportLibraryAnnotatedPdf: requiredElement("export-library-annotated-pdf", HTMLButtonElement),
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
    llmModel: requiredElement("llm-model", HTMLInputElement),
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

function statusText(value: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = "mt-2 text-xs leading-5 text-app-text-soft";
  paragraph.textContent = value;
  return paragraph;
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

if (typeof document !== "undefined") {
  bindThemePreference(document.documentElement, requiredElement("theme-preference", HTMLSelectElement), localStorage);
  const app = new WorkspaceApp();
  void app.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Kirjolab failed to start";
    document.body.textContent = message;
  });
}
