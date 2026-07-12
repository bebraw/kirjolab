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
import { renderWorkspaceMarkdown } from "../domain/markdown";
import {
  isProjectRevisionContent,
  isProjectRevisionDiff,
  isProjectRevisionSummaries,
  type ProjectRevisionSummary,
} from "../domain/project-history";
import { composeProject, type CompositionSourceSpan, type ProjectFile } from "../domain/project-files";
import { publicationWordStatistics, type PublicationWordStatistics } from "../domain/publication-statistics";
import {
  isReferenceLibrarySnapshot,
  type BibliographicRecord,
  type LibraryPdfArtifact,
  type ReferenceLibrarySnapshot,
  type WebSnapshot,
  type WebSnapshotComparison,
} from "../domain/reference-library";
import { calculateTextSplice } from "../domain/text";
import {
  isModelCandidate,
  isWorkspaceSnapshot,
  isWorkspaceMembers,
  isWorkspaceSummaries,
  isPublicationIntakePreview,
  type AnnotationResource,
  type AnnotationLinkResult,
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
import { PdfEvidenceViewer, type PdfSelectionCapture } from "./pdf-viewer";
import { maximumModelEvidenceItems, OpenAICompatibleBrowserProvider, type ModelEvidenceItem } from "./model-provider";
import {
  activateResearchTab,
  closeResearchTab,
  createResearchContext,
  openResearchResource,
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

const workspaceId = readWorkspaceId();
const catalogBase = "/api/workspaces";
const apiBase = `${catalogBase}/${workspaceId}`;
const remoteOrigin = Symbol("remote");

interface Elements {
  collaboratorSelections: HTMLElement;
  workspaceTitle: HTMLElement;
  workspaceSwitcher: HTMLSelectElement;
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
  openReferenceLibrary: HTMLButtonElement;
  openReferenceLibraryShelf: HTMLButtonElement;
  browseReferenceLibrary: HTMLButtonElement;
  referenceLibraryDialog: HTMLDialogElement;
  closeReferenceLibrary: HTMLButtonElement;
  referenceLibraryList: HTMLElement;
  libraryBibliographyUpload: HTMLInputElement;
  libraryPdfUpload: HTMLInputElement;
  showArchivedReferences: HTMLButtonElement;
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
  webSourceTitle: HTMLInputElement;
  webSourceAuthor: HTMLInputElement;
  webSourcePublisher: HTMLInputElement;
  webSourcePublishedAt: HTMLInputElement;
  webSnapshotComparison: HTMLElement;
  unidentifiedPdfCount: HTMLElement;
  unidentifiedPdfList: HTMLElement;
  projectFileSwitcher: HTMLSelectElement;
  newProjectFile: HTMLButtonElement;
  renameProjectFile: HTMLButtonElement;
  deleteProjectFile: HTMLButtonElement;
  projectFileDialog: HTMLDialogElement;
  projectFileForm: HTMLFormElement;
  projectFileDialogTitle: HTMLElement;
  projectFilePath: HTMLInputElement;
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
  bibliography: HTMLTextAreaElement;
  manuscriptCommentForm: HTMLFormElement;
  manuscriptCommentBody: HTMLTextAreaElement;
  manuscriptCommentStatus: HTMLElement;
  manuscriptCommentCount: HTMLElement;
  manuscriptCommentList: HTMLElement;
  workspaceSurfaces: HTMLElement;
  showAuthoringSurface: HTMLButtonElement;
  showContextSurface: HTMLButtonElement;
  openSourceCitation: HTMLButtonElement;
  contextTabList: HTMLElement;
  contextPreviewTab: HTMLButtonElement;
  contextResourceTabs: HTMLElement;
  pinActiveContext: HTMLButtonElement;
  closeActiveContext: HTMLButtonElement;
  contextPreviewPanel: HTMLElement;
  previewScroll: HTMLElement;
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
  pdfList: HTMLElement;
  bibliographyUpload: HTMLInputElement;
  knowledgeSearchForm: HTMLFormElement;
  knowledgeSearchInput: HTMLInputElement;
  knowledgeSearchResults: HTMLElement;
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
  annotationPdf: HTMLSelectElement;
  annotationPage: HTMLInputElement;
  annotationQuote: HTMLTextAreaElement;
  annotationPrefix: HTMLInputElement;
  annotationSuffix: HTMLInputElement;
  annotationComment: HTMLInputElement;
  annotationSelectionStatus: HTMLElement;
  saveAndLinkAnnotation: HTMLButtonElement;
  openPaper: HTMLButtonElement;
  closePaper: HTMLButtonElement;
  paperTitle: HTMLElement;
  paperStatus: HTMLElement;
  paperCanvas: HTMLCanvasElement;
  paperPage: HTMLElement;
  paperTextLayer: HTMLElement;
  paperHighlights: HTMLElement;
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
  #modelBusy = false;
  #hasBootstrapSnapshot = false;
  #toastTimer: number | undefined;
  #pendingRects: PdfSelectionRect[] = [];
  #renderedPdfId: string | undefined;
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
  #projectFileDialogMode: "create" | "rename" = "create";
  #librarySnapshot: ReferenceLibrarySnapshot | null = null;
  #showArchivedReferences = false;
  #citationNetwork: CitationNetwork | null = null;
  #filterProjectCitations = false;
  #projectHistory: ProjectRevisionSummary[] = [];
  #wordStatistics: PublicationWordStatistics | null = null;

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
      (annotationId) => this.#focusAnnotationCard(annotationId),
    );
  }

  async start(): Promise<void> {
    this.#bindUi();
    this.#setEditorsEnabled(false);
    await this.#refreshCatalog();
    await this.#resourceRefresh.request();
    this.#connect();
  }

  #bindUi(): void {
    this.#elements.workspaceSwitcher.addEventListener("change", () => {
      const selected = this.#elements.workspaceSwitcher.value;
      if (selected && selected !== workspaceId) location.assign(`/workspaces/${encodeURIComponent(selected)}`);
    });
    this.#elements.newWorkspace.addEventListener("click", () => this.#elements.newWorkspaceDialog.showModal());
    this.#elements.cancelNewWorkspace.addEventListener("click", () => this.#elements.newWorkspaceDialog.close());
    this.#elements.newWorkspaceForm.addEventListener("submit", (event) => void this.#createWorkspace(event));
    this.#elements.shareWorkspace.addEventListener("click", () => void this.#openSharing());
    this.#elements.closeShareWorkspace.addEventListener("click", () => this.#elements.shareWorkspaceDialog.close());
    this.#elements.inviteMemberForm.addEventListener("submit", (event) => void this.#inviteMember(event));
    for (const button of [
      this.#elements.openReferenceLibrary,
      this.#elements.openReferenceLibraryShelf,
      this.#elements.browseReferenceLibrary,
    ]) {
      button.addEventListener("click", () => void this.#openReferenceLibrary());
    }
    this.#elements.closeReferenceLibrary.addEventListener("click", () => this.#elements.referenceLibraryDialog.close());
    this.#elements.libraryBibliographyUpload.addEventListener("change", () => void this.#importIntoReferenceLibrary());
    this.#elements.libraryPdfUpload.addEventListener("change", () => void this.#uploadLibraryPdf());
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
    this.#unbindSourceEditor = bindYText(this.#elements.source, this.#source, this.#document);
    bindYText(this.#elements.bibliography, this.#bibliography, this.#document);
    this.#elements.projectFileSwitcher.addEventListener("change", () => this.#selectProjectFile(this.#elements.projectFileSwitcher.value));
    this.#elements.newProjectFile.addEventListener("click", () => this.#openProjectFileDialog("create"));
    this.#elements.renameProjectFile.addEventListener("click", () => this.#openProjectFileDialog("rename"));
    this.#elements.deleteProjectFile.addEventListener("click", () => void this.#deleteProjectFile());
    this.#elements.cancelProjectFile.addEventListener("click", () => this.#elements.projectFileDialog.close());
    this.#elements.projectFileForm.addEventListener("submit", (event) => void this.#saveProjectFile(event));
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
    this.#source.observe(() => this.#renderPreview());
    this.#bibliography.observe(() => this.#renderPreview());
    this.#document.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === remoteOrigin) return;
      this.#pendingUpdates.enqueue(update);
      this.#elements.saveStatus.textContent = "Saving…";
      this.#updateModelAvailability();
      this.#renderPreview();
      this.#flushPendingUpdates();
    });
    this.#elements.pdfUpload.addEventListener("change", () => void this.#uploadPdf());
    this.#elements.bibliographyUpload.addEventListener("change", () => void this.#importBibliography());
    this.#elements.knowledgeSearchForm.addEventListener("submit", (event) => void this.#searchKnowledge(event));
    this.#elements.annotationForm.addEventListener("submit", (event) => void this.#createAnnotation(event));
    this.#elements.newClaim.addEventListener("click", () => this.#openClaimDialog());
    this.#elements.cancelClaim.addEventListener("click", () => this.#elements.claimDialog.close());
    this.#elements.claimForm.addEventListener("submit", (event) => void this.#saveClaim(event));
    this.#elements.showAuthoringSurface.addEventListener("click", () => this.#showWorkspaceSurface("authoring"));
    this.#elements.showContextSurface.addEventListener("click", () => this.#showWorkspaceSurface("context"));
    this.#elements.contextPreviewTab.addEventListener("click", () => this.#activateContext(RESEARCH_PREVIEW_KEY));
    this.#elements.contextTabList.addEventListener("keydown", (event) => this.#moveContextTabFocus(event));
    this.#elements.preview.addEventListener("click", (event) => this.#openPreviewCitation(event));
    this.#elements.openSourceCitation.addEventListener("click", () => this.#openCitationAtCaret());
    this.#elements.insertContextCitation.addEventListener("click", () => this.#insertActivePublicationCitation());
    this.#elements.publicationPdfLinkForm.addEventListener("submit", (event) => void this.#linkActivePublicationPdf(event));
    this.#elements.openPaper.addEventListener("click", () => void this.#openOnlyLinkedPaper());
    this.#elements.pinActiveContext.addEventListener("click", () => this.#toggleActiveContextPin());
    this.#elements.closeActiveContext.addEventListener("click", () => this.#closeActiveContext());
    this.#elements.closePublicationContext.addEventListener("click", () => this.#closeActiveContext());
    this.#elements.closePaper.addEventListener("click", () => this.#closeActiveContext());
    this.#elements.publicationIntakeForm.addEventListener("submit", (event) => void this.#previewPublicationIntake(event));
    this.#elements.publicationIntakeAccept.addEventListener("click", () => void this.#acceptPublicationIntake());
    this.#elements.publicationIntakeCancel.addEventListener("click", () => this.#cancelPublicationIntake());
    this.#elements.contextCandidateApply.addEventListener("click", () => void this.#updateActiveCandidate("apply"));
    this.#elements.contextCandidateReject.addEventListener("click", () => void this.#updateActiveCandidate("reject"));
    this.#elements.closeCandidateContext.addEventListener("click", () => this.#closeActiveContext());
    for (const input of [this.#elements.llmEndpoint, this.#elements.llmModel, this.#elements.modelInstruction]) {
      input.addEventListener("input", () => this.#updateModelAvailability());
    }
    this.#elements.generateCandidate.addEventListener("click", () => void this.#generateCandidate());
  }

  async #refreshSnapshot(): Promise<void> {
    const response = await fetch(apiBase);
    if (!response.ok) throw new Error("Could not load the workspace");
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error("Workspace returned an invalid snapshot");
    const snapshot = this.#socketSynced ? this.#resolveSnapshotAnchors(value) : value;
    this.#snapshot = snapshot;
    this.#elements.workspaceTitle.textContent = snapshot.title;
    if (!this.#hasBootstrapSnapshot) {
      this.#hasBootstrapSnapshot = true;
      this.#revision = snapshot.revision;
      this.#elements.source.value = snapshot.source;
      this.#elements.bibliography.value = snapshot.bibliography;
      this.#renderPreview(snapshot.source, snapshot.bibliography);
      this.#updateRevision();
    } else {
      this.#renderPreview();
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
    if (!response.ok) throw new Error("Could not load workspace navigation");
    const value: unknown = await response.json();
    if (!isWorkspaceSummaries(value)) throw new Error("Workspace catalog returned invalid data");
    this.#renderWorkspaceCatalog(value);
  }

  #renderWorkspaceCatalog(workspaces: WorkspaceSummary[]): void {
    this.#elements.workspaceSwitcher.replaceChildren();
    for (const workspace of workspaces) {
      const option = new Option(workspace.title, workspace.id, workspace.id === workspaceId, workspace.id === workspaceId);
      this.#elements.workspaceSwitcher.append(option);
    }
    if (workspaces.some((workspace) => workspace.id === workspaceId)) this.#elements.workspaceSwitcher.value = workspaceId;
  }

  async #createWorkspace(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const response = await jsonFetch(catalogBase, { title: this.#elements.newWorkspaceTitle.value });
    await expectOk(response);
    const workspace: unknown = await response.json();
    const created: unknown = [workspace];
    if (!isWorkspaceSummaries(created) || !created[0]) throw new Error("Workspace catalog returned invalid data");
    location.assign(created[0].href);
  }

  async #openSharing(): Promise<void> {
    this.#elements.shareWorkspaceDialog.showModal();
    await this.#refreshMembers();
  }

  async #refreshMembers(): Promise<void> {
    const response = await fetch(`${apiBase}/members`, { credentials: "same-origin" });
    await expectOk(response);
    const members: unknown = await response.json();
    if (!isWorkspaceMembers(members)) throw new Error("Workspace members returned invalid data");
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
    this.#showToast("Collaborator invited to this workspace.");
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
        this.#elements.saveStatus.textContent = this.#pendingUpdates.size === 0 ? "Materialized to Markdown" : "Saving…";
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
          this.#showToast(error instanceof Error ? error.message : "Could not refresh workspace resources");
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
    this.#elements.collaboratorSelections.classList.toggle("hidden", selections.length === 0);
    for (const selection of selections) {
      const file = this.#liveProjectFiles().find((candidate) => candidate.id === selection.fileId);
      const selected = file?.content.slice(selection.start, selection.end).replaceAll(/\s+/gu, " ").trim() ?? "";
      const range = selection.start === selection.end ? `caret at ${selection.start}` : `selection ${selection.start}–${selection.end}`;
      const item = document.createElement("span");
      item.className = "mr-4 inline-block";
      item.textContent = `Collaborator · ${file?.path ?? "project file"} · ${range}${selected ? ` · “${accessibleEvidenceExcerpt(selected)}”` : ""}`;
      this.#elements.collaboratorSelections.append(item);
    }
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
      providerLabel: "Browser-local OpenAI-compatible",
      model: this.#elements.llmModel.value,
    });
  }

  #renderPreview(source?: string, bibliography = this.#bibliography.toString()): void {
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
    const rendered = renderWorkspaceMarkdown(renderedSource, bibliography);
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
    this.#elements.projectFileSwitcher.replaceChildren(
      ...snapshot.files.map((file) => {
        const option = document.createElement("option");
        option.value = file.id;
        option.textContent = file.path;
        option.selected = file.id === this.#activeFileId;
        return option;
      }),
    );
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
    this.#unbindSourceEditor = bindYText(this.#elements.source, this.#activeFileText, this.#document);
    this.#authoringSelection = null;
    this.#renderProjectFiles();
    this.#updateModelAvailability();
  }

  #openProjectFileDialog(mode: "create" | "rename"): void {
    const file = this.#snapshot?.files.find((item) => item.id === this.#activeFileId);
    if (mode === "rename" && (!file || file.id === this.#snapshot?.entryFileId)) return;
    this.#projectFileDialogMode = mode;
    this.#elements.projectFileDialogTitle.textContent = mode === "create" ? "Add Markdown file" : "Rename Markdown file";
    this.#elements.projectFilePath.value = mode === "rename" ? (file?.path ?? "") : "";
    this.#elements.projectFileDialog.showModal();
    this.#elements.projectFilePath.focus();
  }

  async #saveProjectFile(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const path = this.#elements.projectFilePath.value.trim();
    const activeId = this.#activeFileId;
    const creating = this.#projectFileDialogMode === "create";
    if (!creating && !activeId) return;
    const response = await jsonFetch(
      creating ? `${apiBase}/files` : `${apiBase}/files/${encodeURIComponent(activeId ?? "")}`,
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
    if (selected) this.#selectProjectFile(selected.id);
    this.#renderPreview();
    this.#showToast(
      creating ? `Added ${path}. Include it from main.md when ready.` : `Renamed file to ${path}; inbound includes were updated.`,
    );
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
    this.#renderPreview();
    this.#showToast(`Deleted ${file.path}.`);
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
    this.#elements.referenceLibraryDialog.showModal();
    await this.#refreshReferenceLibrary();
  }

  async #refreshReferenceLibrary(): Promise<void> {
    const response = await fetch(`/api/library${this.#showArchivedReferences ? "?archived=include" : ""}`, {
      credentials: "same-origin",
    });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isReferenceLibrarySnapshot(value)) throw new Error("Reference library returned an invalid snapshot");
    this.#librarySnapshot = value;
    this.#renderReferenceLibrary();
  }

  #renderReferenceLibrary(): void {
    const library = this.#librarySnapshot;
    if (!library) return;
    this.#renderCitationAssertionOptions();
    this.#elements.referenceLibraryList.replaceChildren();
    if (library.references.length === 0) {
      this.#elements.referenceLibraryList.append(emptyState("No references yet. Import BibTeX or add a PDF to begin."));
    }
    for (const reference of library.references) this.#elements.referenceLibraryList.append(this.#referenceLibraryCard(reference));

    const unidentified = library.artifacts.filter((artifact) => artifact.referenceId === null);
    this.#elements.unidentifiedPdfCount.textContent = String(unidentified.length);
    this.#elements.unidentifiedPdfList.replaceChildren();
    if (unidentified.length === 0) this.#elements.unidentifiedPdfList.append(emptyState("No unidentified PDFs."));
    for (const artifact of unidentified) this.#elements.unidentifiedPdfList.append(this.#unidentifiedPdfCard(artifact, library.references));
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
    nodes.className = "grid gap-3 md:grid-cols-2";
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
      circle.setAttribute("fill", node.inProject ? "#0c7655" : "#e8e2d6");
      circle.setAttribute("stroke", "#26312d");
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
    card.className = "resource-card";
    const privacy = reference.archivedAt ? "Private · archived" : "Private library";
    card.append(resourceLabel(`${privacy} · ${reference.type}`), resourceTitle(reference.title));
    const details = document.createElement("p");
    details.className = "mt-2 font-sans text-xs leading-5 text-app-text-soft";
    details.textContent = [reference.authors.join("; "), reference.year, reference.venue].filter(Boolean).join(" · ");
    card.append(details);
    const linked = this.#snapshot?.projectReferences.find((item) => item.referenceId === reference.id);
    const projectRow = document.createElement("div");
    projectRow.className = "mt-3 flex items-center gap-2";
    const alias = document.createElement("input");
    alias.className = "field min-w-0";
    alias.value = linked?.citationAlias ?? suggestedReferenceAlias(reference);
    alias.setAttribute("aria-label", `Project citation alias for ${reference.title}`);
    const projectAction = actionButton(
      linked ? "Rename alias" : "Add to project",
      linked ? "button-secondary" : "button-primary",
      () => void (linked ? this.#renameProjectReference(reference.id, alias.value) : this.#linkLibraryReference(reference.id, alias.value)),
    );
    projectRow.append(alias, projectAction);
    if (linked) {
      projectRow.append(actionButton("Remove", "button-secondary", () => void this.#unlinkProjectReference(reference.id)));
    }
    card.append(projectRow);

    const tags = document.createElement("input");
    tags.className = "field mt-3";
    tags.value = (this.#librarySnapshot?.tags[reference.id] ?? []).join(", ");
    tags.placeholder = "Private tags, comma separated";
    tags.setAttribute("aria-label", `Private tags for ${reference.title}`);
    card.append(tags);
    const privateActions = document.createElement("div");
    privateActions.className = "mt-2 flex flex-wrap gap-2";
    privateActions.append(
      actionButton("Save tags", "button-secondary", () => void this.#saveReferenceTags(reference.id, tags.value)),
      actionButton(
        reference.archivedAt ? "Restore" : "Archive",
        "button-secondary",
        () => void this.#setReferenceArchived(reference.id, reference.archivedAt === null),
      ),
    );
    card.append(privateActions);

    const noteInput = document.createElement("textarea");
    noteInput.className = "field mt-3 min-h-16";
    noteInput.placeholder = "Add a private note";
    noteInput.maxLength = 20_000;
    const addNote = actionButton(
      "Save private note",
      "button-secondary mt-2",
      () => void this.#createReferenceNote(reference.id, noteInput.value),
    );
    card.append(noteInput, addNote);

    const resources = document.createElement("div");
    resources.className = "mt-3 space-y-2 border-t border-app-line pt-3";
    const notes = this.#librarySnapshot?.notes.filter((note) => note.referenceId === reference.id) ?? [];
    const artifacts = this.#librarySnapshot?.artifacts.filter((artifact) => artifact.referenceId === reference.id) ?? [];
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
      row.append(rights);
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
        () => void this.#recaptureWebSource(reference, webSource.canonicalUrl),
      );
      card.append(recapture);
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
    if (notes.length + artifacts.length + highlights.length + webSnapshots.length > 0) card.append(resources);
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

  async #uploadLibraryPdf(): Promise<void> {
    const file = this.#elements.libraryPdfUpload.files?.[0];
    if (!file) return;
    const response = await fetch("/api/library/pdfs", {
      method: "POST",
      headers: { "content-type": "application/pdf", "content-length": String(file.size), "x-file-name": encodeURIComponent(file.name) },
      body: file,
      credentials: "same-origin",
    });
    await expectOk(response);
    this.#elements.libraryPdfUpload.value = "";
    await this.#refreshReferenceLibrary();
    this.#showToast("PDF saved privately. Identify its source before using it as a library item.");
  }

  async #captureWebSource(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await this.#captureWebSourceInput({
      url: this.#elements.webSourceUrl.value,
      title: this.#elements.webSourceTitle.value,
      authors: this.#elements.webSourceAuthor.value.trim() ? [this.#elements.webSourceAuthor.value] : [],
      publisher: this.#elements.webSourcePublisher.value,
      publishedAt: this.#elements.webSourcePublishedAt.value,
    });
    this.#elements.webSourceForm.reset();
  }

  async #recaptureWebSource(reference: BibliographicRecord, url: string): Promise<void> {
    await this.#captureWebSourceInput({
      url,
      title: reference.title,
      authors: [...reference.authors],
      publisher: reference.venue,
      publishedAt: reference.year,
    });
  }

  async #captureWebSourceInput(input: {
    readonly url: string;
    readonly title: string;
    readonly authors: readonly string[];
    readonly publisher: string;
    readonly publishedAt: string;
  }): Promise<void> {
    const response = await jsonFetch("/api/library/web-sources", input);
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

  async #renameProjectReference(referenceId: string, citationAlias: string): Promise<void> {
    const response = await jsonFetch(`${apiBase}/references/${encodeURIComponent(referenceId)}`, { citationAlias }, "PATCH");
    await this.#acceptWorkspaceMutation(response);
    this.#renderReferenceLibrary();
    this.#showToast("Citation alias renamed across project files.");
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
    if (!isWorkspaceSnapshot(value)) throw new Error("Workspace mutation returned an invalid snapshot");
    this.#snapshot = value;
    this.#renderResources();
    this.#renderProjectFiles();
    this.#renderPreview();
  }

  #renderResources(): void {
    if (!this.#snapshot) return;
    this.#captureActiveContextState();
    this.#contextState = reconcileResearchContext(this.#contextState, {
      publicationIds: new Set(this.#snapshot.publications.map((publication) => publication.id)),
      pdfIds: new Set(this.#snapshot.pdfs.map((pdf) => pdf.id)),
      candidateIds: new Set(this.#snapshot.candidates.map((candidate) => candidate.id)),
    });
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

  #renderPdfs(pdfs: PdfResource[]): void {
    this.#elements.pdfList.replaceChildren();
    this.#elements.annotationPdf.replaceChildren();
    this.#elements.annotationPdf.disabled = true;
    if (pdfs.length === 0) {
      this.#elements.pdfList.append(emptyState("No paper imported yet."));
      this.#elements.annotationPdf.append(new Option("Import a PDF first", ""));
      return;
    }
    for (const pdf of pdfs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "resource-card block w-full text-left";
      button.dataset.pdfId = pdf.id;
      button.append(resourceLabel("PDF · " + formatBytes(pdf.size)), resourceTitle(pdf.name));
      button.addEventListener("click", () => {
        this.#elements.annotationPdf.value = pdf.id;
        void this.#showPaper(pdf);
      });
      this.#elements.pdfList.append(button);
      this.#elements.annotationPdf.append(new Option(pdf.name, pdf.id));
    }
    if (this.#renderedPdfId) this.#elements.annotationPdf.value = this.#renderedPdfId;
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
      actions.append(openEvidence, linkButton);
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
      card.append(label, actions);
      this.#elements.annotationList.append(card);
    }
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
      this.#elements.candidateList.append(emptyState("Grounded revisions open in Context and remain separate until you apply one."));
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
      return;
    }
    try {
      const response = await fetch(`${apiBase}/search?q=${encodeURIComponent(query)}`, { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isKnowledgeSearchResults(value)) throw new Error("Workspace search returned invalid data");
      this.#renderKnowledgeSearchResults(value);
    } catch (error) {
      this.#elements.knowledgeSearchResults.classList.remove("hidden");
      this.#elements.knowledgeSearchResults.replaceChildren(emptyState(error instanceof Error ? error.message : "Workspace search failed"));
    }
  }

  #renderKnowledgeSearchResults(results: KnowledgeSearchResult[]): void {
    this.#elements.knowledgeSearchResults.replaceChildren();
    this.#elements.knowledgeSearchResults.classList.remove("hidden");
    if (results.length === 0) {
      this.#elements.knowledgeSearchResults.append(emptyState("No matching workspace resources."));
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

  #captureActiveContextState(): void {
    const key = this.#contextState.activeKey;
    if (key === RESEARCH_PREVIEW_KEY) {
      this.#contextState = setResearchTabScroll(this.#contextState, key, this.#elements.previewScroll.scrollTop);
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
    if (tab.kind === "pdf" && tab.id === this.#renderedPdfId) {
      this.#contextState = setPdfResearchLocation(this.#contextState, key, {
        page: this.#pdfViewer.currentPage,
        focusedAnnotationId: this.#pdfViewer.focusedAnnotationId,
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
    this.#elements.contextResourceTabs.replaceChildren();

    for (const tab of this.#contextState.tabs) {
      if (tab.kind === "preview") continue;
      this.#elements.contextResourceTabs.append(this.#renderContextResourceTab(tab));
    }

    const activeTab = this.#activeResourceTab();
    this.#elements.contextPreviewPanel.hidden = activeKey !== RESEARCH_PREVIEW_KEY;
    this.#elements.contextPublicationPanel.hidden = activeTab?.kind !== "publication";
    this.#elements.contextPdfPanel.hidden = activeTab?.kind !== "pdf";
    this.#elements.contextCandidatePanel.hidden = activeTab?.kind !== "candidate";
    this.#elements.pinActiveContext.disabled = !activeTab;
    this.#elements.closeActiveContext.disabled = !activeTab;
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
    this.#renderPublicationIntake(activeTab.id);
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
    const selector = key === RESEARCH_PREVIEW_KEY ? "#context-preview-tab" : `#${CSS.escape(`context-tab-${key.replace(":", "-")}`)}`;
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
    const candidate = this.#snapshot?.candidates.find((item) => item.id === tab.id);
    return candidate ? `Revision · ${candidate.model} · ${candidate.id.slice(0, 4)}` : "Revision";
  }

  #activeResourceTab(): ResearchResourceTab | undefined {
    return this.#contextState.tabs.find(
      (tab): tab is ResearchResourceTab => tab.kind !== "preview" && tab.key === this.#contextState.activeKey,
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
    this.#elements.openSourceCitation.disabled =
      citationKeysAtPosition(this.#activeFileText.toString(), this.#elements.source.selectionEnd).length === 0;
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
    if (tab?.kind !== "pdf") return;
    const pdf = this.#snapshot?.pdfs.find((item) => item.id === tab.id);
    if (!pdf) return;
    this.#elements.annotationPdf.value = pdf.id;
    this.#elements.paperTitle.textContent = pdf.name;
    const annotations = this.#snapshot?.annotations.filter((annotation) => annotation.pdfId === pdf.id) ?? [];
    this.#pdfViewer.updateAnnotations(annotations);
    if (!force && this.#renderedPdfId === pdf.id) {
      this.#elements.paperReader.scrollTop = tab.scrollTop;
      return;
    }
    try {
      const opened = await this.#pdfViewer.open({
        url: `${apiBase}/pdfs/${pdf.id}`,
        annotations,
        page: tab.page,
        ...(tab.focusedAnnotationId ? { focusAnnotationId: tab.focusedAnnotationId } : {}),
      });
      const active = this.#activeResourceTab();
      if (!opened || active?.kind !== "pdf" || active.id !== pdf.id) return;
      this.#renderedPdfId = pdf.id;
      this.#elements.paperReader.scrollTop = tab.scrollTop;
    } catch (error) {
      const active = this.#activeResourceTab();
      if (active?.kind === "pdf" && active.id === pdf.id) {
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
    const passage = shouldLink ? this.#selectedAuthoringPassage() : null;
    if (shouldLink && !this.#hasStableDocumentBase()) {
      this.#showToast("Wait for the manuscript to finish synchronizing before saving and linking evidence.");
      return;
    }
    if (shouldLink && !passage) {
      this.#showToast("Select manuscript prose before saving and linking evidence.");
      return;
    }
    const annotation = {
      pdfId: this.#elements.annotationPdf.value,
      page: this.#elements.annotationPage.valueAsNumber,
      quote: this.#elements.annotationQuote.value,
      prefix: this.#elements.annotationPrefix.value,
      suffix: this.#elements.annotationSuffix.value,
      comment: this.#elements.annotationComment.value,
      rects: this.#pendingRects,
    };
    const response = await jsonFetch(
      passage ? `${apiBase}/annotation-links` : `${apiBase}/annotations`,
      passage
        ? {
            annotation,
            passage: { ...passage, sourceRevision: this.#revision },
          }
        : annotation,
    );
    await expectOk(response);
    const created: unknown = await response.json();
    if (passage ? !isAnnotationLinkResult(created) : !isCreatedAnnotation(created)) {
      throw new Error("Annotation endpoint returned an invalid resource");
    }
    this.#elements.annotationQuote.value = "";
    this.#elements.annotationPrefix.value = "";
    this.#elements.annotationSuffix.value = "";
    this.#elements.annotationComment.value = "";
    this.#pendingRects = [];
    this.#elements.annotationSelectionStatus.textContent = passage
      ? "Annotation saved and connected to the selected manuscript prose."
      : "Annotation saved. Select another passage in the open paper to continue.";
    await this.#resourceRefresh.request();
    this.#showToast(
      passage ? "Evidence annotated and linked to manuscript prose." : "Annotation anchored with geometry and textual context.",
    );
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
        references.push({ kind, id, version: annotation.createdAt });
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
      this.#showToast(action === "apply" ? "Candidate applied to canonical Markdown." : "Candidate rejected; manuscript unchanged.");
    } catch (error) {
      failure = error instanceof Error ? error.message : "Candidate decision failed";
      await this.#resourceRefresh.request().catch(() => undefined);
      this.#showToast(failure);
    } finally {
      this.#candidateDecision = null;
      this.#renderResearchContext(false);
      this.#updateModelAvailability();
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

  #capturePdfSelection(capture: PdfSelectionCapture): void {
    if (this.#renderedPdfId) this.#elements.annotationPdf.value = this.#renderedPdfId;
    this.#elements.annotationPage.value = String(capture.page);
    this.#elements.annotationQuote.value = capture.quote;
    this.#elements.annotationPrefix.value = capture.prefix;
    this.#elements.annotationSuffix.value = capture.suffix;
    this.#pendingRects = capture.rects;
    this.#elements.annotationSelectionStatus.textContent = `Captured ${capture.rects.length} ${capture.rects.length === 1 ? "fragment" : "fragments"} from page ${capture.page}. Add a note, then save.`;
    this.#showToast("Evidence captured. Add your note and save the annotation.");
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

function bindYText(textarea: HTMLTextAreaElement, text: Y.Text, documentModel: Y.Doc): () => void {
  const handleInput = (): void => {
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
  };
  textarea.addEventListener("input", handleInput);
  text.observe(handleText);
  return () => {
    textarea.removeEventListener("input", handleInput);
    text.unobserve(handleText);
  };
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

function collectElements(): Elements {
  return {
    collaboratorSelections: requiredElement("collaborator-selections", HTMLElement),
    workspaceTitle: requiredElement("workspace-title", HTMLElement),
    workspaceSwitcher: requiredElement("workspace-switcher", HTMLSelectElement),
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
    openReferenceLibrary: requiredElement("open-reference-library", HTMLButtonElement),
    openReferenceLibraryShelf: requiredElement("open-reference-library-shelf", HTMLButtonElement),
    browseReferenceLibrary: requiredElement("browse-reference-library", HTMLButtonElement),
    referenceLibraryDialog: requiredElement("reference-library-dialog", HTMLDialogElement),
    closeReferenceLibrary: requiredElement("close-reference-library", HTMLButtonElement),
    referenceLibraryList: requiredElement("reference-library-list", HTMLElement),
    libraryBibliographyUpload: requiredElement("library-bibliography-upload", HTMLInputElement),
    libraryPdfUpload: requiredElement("library-pdf-upload", HTMLInputElement),
    showArchivedReferences: requiredElement("show-archived-references", HTMLButtonElement),
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
    webSourceTitle: requiredElement("web-source-title", HTMLInputElement),
    webSourceAuthor: requiredElement("web-source-author", HTMLInputElement),
    webSourcePublisher: requiredElement("web-source-publisher", HTMLInputElement),
    webSourcePublishedAt: requiredElement("web-source-published-at", HTMLInputElement),
    webSnapshotComparison: requiredElement("web-snapshot-comparison", HTMLElement),
    unidentifiedPdfCount: requiredElement("unidentified-pdf-count", HTMLElement),
    unidentifiedPdfList: requiredElement("unidentified-pdf-list", HTMLElement),
    projectFileSwitcher: requiredElement("project-file-switcher", HTMLSelectElement),
    newProjectFile: requiredElement("new-project-file", HTMLButtonElement),
    renameProjectFile: requiredElement("rename-project-file", HTMLButtonElement),
    deleteProjectFile: requiredElement("delete-project-file", HTMLButtonElement),
    projectFileDialog: requiredElement("project-file-dialog", HTMLDialogElement),
    projectFileForm: requiredElement("project-file-form", HTMLFormElement),
    projectFileDialogTitle: requiredElement("project-file-dialog-title", HTMLElement),
    projectFilePath: requiredElement("project-file-path", HTMLInputElement),
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
    bibliography: requiredElement("bibliography-editor", HTMLTextAreaElement),
    manuscriptCommentForm: requiredElement("manuscript-comment-form", HTMLFormElement),
    manuscriptCommentBody: requiredElement("manuscript-comment-body", HTMLTextAreaElement),
    manuscriptCommentStatus: requiredElement("manuscript-comment-status", HTMLElement),
    manuscriptCommentCount: requiredElement("manuscript-comment-count", HTMLElement),
    manuscriptCommentList: requiredElement("manuscript-comment-list", HTMLElement),
    workspaceSurfaces: requiredElement("workspace-surfaces", HTMLElement),
    showAuthoringSurface: requiredElement("show-authoring-surface", HTMLButtonElement),
    showContextSurface: requiredElement("show-context-surface", HTMLButtonElement),
    openSourceCitation: requiredElement("open-source-citation", HTMLButtonElement),
    contextTabList: requiredElement("context-tab-list", HTMLElement),
    contextPreviewTab: requiredElement("context-preview-tab", HTMLButtonElement),
    contextResourceTabs: requiredElement("context-resource-tabs", HTMLElement),
    pinActiveContext: requiredElement("pin-active-context", HTMLButtonElement),
    closeActiveContext: requiredElement("close-active-context", HTMLButtonElement),
    contextPreviewPanel: requiredElement("context-preview-panel", HTMLElement),
    previewScroll: requiredElement("preview-scroll", HTMLElement),
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
    pdfList: requiredElement("pdf-list", HTMLElement),
    bibliographyUpload: requiredElement("bibliography-upload", HTMLInputElement),
    knowledgeSearchForm: requiredElement("knowledge-search-form", HTMLFormElement),
    knowledgeSearchInput: requiredElement("knowledge-search-input", HTMLInputElement),
    knowledgeSearchResults: requiredElement("knowledge-search-results", HTMLElement),
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
    annotationPdf: requiredElement("annotation-pdf", HTMLSelectElement),
    annotationPage: requiredElement("annotation-page", HTMLInputElement),
    annotationQuote: requiredElement("annotation-quote", HTMLTextAreaElement),
    annotationPrefix: requiredElement("annotation-prefix", HTMLInputElement),
    annotationSuffix: requiredElement("annotation-suffix", HTMLInputElement),
    annotationComment: requiredElement("annotation-comment", HTMLInputElement),
    annotationSelectionStatus: requiredElement("annotation-selection-status", HTMLElement),
    saveAndLinkAnnotation: requiredElement("save-and-link-annotation", HTMLButtonElement),
    openPaper: requiredElement("open-paper", HTMLButtonElement),
    closePaper: requiredElement("close-paper", HTMLButtonElement),
    paperTitle: requiredElement("paper-title", HTMLElement),
    paperStatus: requiredElement("paper-status", HTMLElement),
    paperCanvas: requiredElement("paper-canvas", HTMLCanvasElement),
    paperPage: requiredElement("paper-page", HTMLElement),
    paperTextLayer: requiredElement("paper-text-layer", HTMLElement),
    paperHighlights: requiredElement("paper-highlights", HTMLElement),
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

async function jsonFetch(url: string, body: object, method = "POST"): Promise<Response> {
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

function suggestedReferenceAlias(reference: BibliographicRecord): string {
  const family = reference.authors[0]?.split(",", 1)[0]?.replaceAll(/[^\p{L}\p{N}]/gu, "") || "source";
  const year = reference.year.replaceAll(/[^0-9a-z]/giu, "");
  return `${family.toLocaleLowerCase()}${year}`.slice(0, 80) || "source";
}

async function expectOk(response: Response): Promise<void> {
  if (response.ok) return;
  const value: unknown = await response.json().catch(() => null);
  throw new Error(isRecord(value) && typeof value.error === "string" ? value.error : `Request failed (${response.status})`);
}

function formatBytes(value: number): string {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function citationStateColor(state: CitationNetwork["edges"][number]["state"]): string {
  if (state === "confirmed") return "#0c7655";
  if (state === "extracted") return "#4e6b61";
  if (state === "conflicting") return "#b34835";
  return "#9b7b3d";
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
    typeof value.createdAt === "string"
  );
}

function isAnnotationLinkResult(value: unknown): value is AnnotationLinkResult {
  return (
    isRecord(value) &&
    isCreatedAnnotation(value.annotation) &&
    isRecord(value.link) &&
    typeof value.link.id === "string" &&
    value.link.annotationId === value.annotation.id &&
    isRecord(value.link.anchor) &&
    isRecord(value.link.resolution) &&
    typeof value.link.createdAt === "string"
  );
}

function readWorkspaceId(): string {
  const value = document.body.dataset.workspaceId;
  if (!value || !/^[a-z0-9-]{1,64}$/iu.test(value)) throw new Error("Invalid workspace identity");
  return value;
}

if (typeof document !== "undefined") {
  const app = new WorkspaceApp();
  void app.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Kirjolab failed to start";
    document.body.textContent = message;
  });
}
