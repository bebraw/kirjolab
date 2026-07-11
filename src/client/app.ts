import * as Y from "yjs";
import {
  buildWorkspaceKnowledgeGraph,
  isKnowledgeSearchResults,
  type KnowledgeGraphNode,
  type KnowledgeSearchResult,
  type WorkspaceKnowledgeGraph,
} from "../domain/knowledge";
import { parseServerCollaborationMessage } from "../domain/collaboration";
import { resolveManuscriptAnchor } from "../domain/manuscript-anchor";
import { renderWorkspaceMarkdown } from "../domain/markdown";
import {
  isWorkspaceSnapshot,
  isWorkspaceMembers,
  isWorkspaceSummaries,
  type AnnotationResource,
  type AnnotationLinkResult,
  type ClaimEvidenceRelation,
  type ClaimPassageLink,
  type ClaimResource,
  type ManuscriptAnchorResolution,
  type ModelCandidate,
  type PassageLink,
  type PdfResource,
  type PdfSelectionRect,
  type PublicationResource,
  type WorkspaceSnapshot,
  type WorkspaceMember,
  type WorkspaceSummary,
} from "../domain/workspace";
import { buildGroundedPrompt, calculateTextSplice, extractCompletion } from "./operations";
import { CoalescedRefresh, PendingUpdateQueue } from "./collaboration";
import { citationKeysAtPosition, createCitationInsertion, parseCitationKeys } from "./citations";
import { PdfEvidenceViewer, type PdfSelectionCapture } from "./pdf-viewer";
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
  source: HTMLTextAreaElement;
  bibliography: HTMLTextAreaElement;
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
  llmEndpoint: HTMLInputElement;
  llmModel: HTMLInputElement;
  generateCandidate: HTMLButtonElement;
  modelStatus: HTMLElement;
  candidateList: HTMLElement;
  toast: HTMLElement;
}

interface RelativeEditorSelection {
  readonly text: Y.Text;
  readonly textarea: HTMLTextAreaElement;
  readonly start: Y.RelativePosition;
  readonly end: Y.RelativePosition;
  readonly direction: "forward" | "backward" | "none" | null;
}

interface AuthoringPassage {
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
  #modelBusy = false;
  #hasBootstrapSnapshot = false;
  #toastTimer: number | undefined;
  #pendingRects: PdfSelectionRect[] = [];
  #renderedPdfId: string | undefined;
  #editingClaimId: string | undefined;
  #contextState: ResearchContextState = createResearchContext();
  #authoringSelection: RelativeEditorSelection | null = null;

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
    bindYText(this.#elements.source, this.#source, this.#document);
    bindYText(this.#elements.bibliography, this.#bibliography, this.#document);
    for (const eventName of ["focus", "input", "keyup", "select"] as const) {
      this.#elements.source.addEventListener(eventName, () => {
        if (document.activeElement === this.#elements.source) this.#rememberAuthoringSelection();
      });
    }
    this.#source.observe(() => this.#renderPreview());
    this.#bibliography.observe(() => this.#renderPreview());
    this.#document.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === remoteOrigin) return;
      this.#pendingUpdates.enqueue(update);
      this.#elements.saveStatus.textContent = "Saving…";
      this.#updateModelAvailability();
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
      case "presence":
        this.#elements.connectionStatus.textContent = `Live · ${value.collaborators} ${value.collaborators === 1 ? "writer" : "writers"}`;
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
      captureRelativeSelection(this.#elements.source, this.#source),
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
    this.#updateRevision();
  }

  #hasStableDocumentBase(): boolean {
    return this.#socketSynced && this.#pendingUpdates.size === 0 && !this.#awaitingRemoteRevision;
  }

  #updateModelAvailability(): void {
    const stable = this.#hasStableDocumentBase();
    this.#elements.generateCandidate.disabled = this.#modelBusy || !stable;
    for (const apply of document.querySelectorAll<HTMLButtonElement>('[data-candidate-action="apply"]')) {
      apply.disabled = !stable;
    }
  }

  #renderPreview(source = this.#source.toString(), bibliography = this.#bibliography.toString()): void {
    const rendered = renderWorkspaceMarkdown(source, bibliography);
    this.#elements.preview.innerHTML = rendered.html;
    this.#elements.diagnostics.replaceChildren();
    this.#elements.diagnosticSummary.textContent =
      rendered.diagnostics.length === 0
        ? "No syntax errors"
        : `${rendered.diagnostics.length} ${rendered.diagnostics.length === 1 ? "issue" : "issues"}`;
    for (const diagnostic of rendered.diagnostics) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "resource-card mb-2 block w-full text-left font-sans text-xs";
      item.textContent = diagnostic.message;
      item.addEventListener("click", () => {
        this.#elements.source.focus();
        this.#elements.source.setSelectionRange(diagnostic.from, diagnostic.to);
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
      this.#renderKnowledgeGraph(buildWorkspaceKnowledgeGraph({ ...this.#snapshot, source, bibliography, links, claimLinks }));
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

  #renderResources(): void {
    if (!this.#snapshot) return;
    this.#captureActiveContextState();
    this.#contextState = reconcileResearchContext(this.#contextState, {
      publicationIds: new Set(this.#snapshot.publications.map((publication) => publication.id)),
      pdfIds: new Set(this.#snapshot.pdfs.map((pdf) => pdf.id)),
    });
    this.#renderPdfs(this.#snapshot.pdfs);
    this.#renderPublications(this.#snapshot.publications);
    this.#renderAnnotations(this.#snapshot.annotations, this.#snapshot.links);
    this.#renderClaims(this.#snapshot.claims, this.#snapshot.claimLinks);
    this.#renderCandidates(this.#snapshot.candidates);
    this.#pdfViewer.updateAnnotations(
      this.#renderedPdfId ? this.#snapshot.annotations.filter((annotation) => annotation.pdfId === this.#renderedPdfId) : [],
    );
    this.#renderResearchContext();
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
      if (publication.doi) {
        actions.append(
          resourceLabel(`doi:${publication.doi}`),
          actionButton("Enrich", "button-secondary", () => void this.#enrichPublication(publication.id)),
        );
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
      checkbox.className = "mt-1 accent-app-accent";
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
      const evidence = this.#snapshot.claimEvidenceLinks.filter((link) => link.claimId === claim.id);
      card.append(resourceLabel(`Claim · ${evidence.length} ${evidence.length === 1 ? "source" : "sources"}`), resourceTitle(claim.text));
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
    const start = this.#elements.source.selectionStart;
    const end = this.#elements.source.selectionEnd;
    const excerpt = this.#elements.source.value.slice(start, end);
    if (!excerpt.trim()) {
      this.#showToast("Select manuscript text before linking a claim.");
      return;
    }
    const response = await jsonFetch(`${apiBase}/claim-links`, {
      claimId,
      start,
      end,
      excerpt,
      sourceRevision: this.#revision,
    });
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast("Claim linked to the selected manuscript passage.");
  }

  #renderCandidates(candidates: ModelCandidate[]): void {
    this.#elements.candidateList.replaceChildren();
    if (candidates.length === 0) {
      this.#elements.candidateList.append(emptyState("Model candidates remain separate from the manuscript until you apply one."));
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
      const details = document.createElement("details");
      details.className = "mt-3";
      const summary = document.createElement("summary");
      summary.className = "cursor-pointer font-sans text-xs font-bold text-app-accent-strong";
      summary.textContent = "Inspect proposed Markdown";
      const proposal = document.createElement("pre");
      proposal.className = "mt-3 max-h-64 overflow-auto whitespace-pre-wrap bg-app-surface p-3 font-mono text-xs leading-5";
      proposal.textContent = candidate.proposedSource;
      details.append(summary, proposal);
      card.append(top, details);
      if (candidate.status === "pending") {
        const actions = document.createElement("div");
        actions.className = "mt-3 flex gap-2";
        const apply = actionButton("Apply candidate", "button-primary", () => void this.#updateCandidate(candidate.id, "apply"));
        apply.dataset.candidateAction = "apply";
        apply.disabled = !this.#hasStableDocumentBase();
        actions.append(
          apply,
          actionButton("Reject", "button-secondary", () => void this.#updateCandidate(candidate.id, "reject")),
        );
        card.append(actions);
      }
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
    const scrollTop = tab.kind === "publication" ? this.#elements.contextPublicationBody.scrollTop : this.#elements.paperReader.scrollTop;
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
      const panel = activeTab.kind === "publication" ? this.#elements.contextPublicationPanel : this.#elements.contextPdfPanel;
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
    if (loadPdf) void this.#loadActivePdf(false);
  }

  #renderContextResourceTab(tab: ResearchResourceTab): HTMLButtonElement {
    const title = this.#contextTabTitle(tab);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "context-tab";
    button.id = this.#contextTabId(tab);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", tab.kind === "publication" ? "context-publication-panel" : "context-pdf-panel");
    button.setAttribute("aria-selected", String(this.#contextState.activeKey === tab.key));
    button.tabIndex = this.#contextState.activeKey === tab.key ? 0 : -1;
    button.title = title;
    button.textContent = title;
    button.addEventListener("click", () => this.#activateContext(tab.key));
    return button;
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
    return this.#snapshot?.pdfs.find((pdf) => pdf.id === tab.id)?.name ?? "Paper";
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
    const keys = citationKeysAtPosition(this.#source.toString(), this.#elements.source.selectionEnd);
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
    this.#authoringSelection = captureRelativeSelection(this.#elements.source, this.#source);
    this.#elements.openSourceCitation.disabled =
      citationKeysAtPosition(this.#source.toString(), this.#elements.source.selectionEnd).length === 0;
    this.#updateCitationInsertionAvailability();
  }

  #resolvedAuthoringCaret(): number | null {
    if (!this.#authoringSelection) return null;
    const end = Y.createAbsolutePositionFromRelativePosition(this.#authoringSelection.end, this.#document);
    return end?.type === this.#source ? end.index : null;
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
    const insertion = createCitationInsertion(this.#source.toString(), index, publication.citationKey);
    if (!insertion) {
      this.#showToast("This reference key cannot be represented by citation syntax.");
      return;
    }
    this.#document.transact(() => this.#source.insert(insertion.index, insertion.text), this);
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
    const selection = live ? captureRelativeSelection(this.#elements.source, this.#source) : this.#authoringSelection;
    if (!selection) return null;
    const start = Y.createAbsolutePositionFromRelativePosition(selection.start, this.#document);
    const end = Y.createAbsolutePositionFromRelativePosition(selection.end, this.#document);
    if (!start || !end || start.type !== this.#source || end.type !== this.#source || start.index >= end.index) return null;
    const excerpt = this.#source.toString().slice(start.index, end.index);
    return excerpt.trim() ? { start: start.index, end: end.index, excerpt } : null;
  }

  async #generateCandidate(): Promise<void> {
    if (!this.#snapshot || !this.#hasStableDocumentBase()) {
      this.#elements.modelStatus.textContent = "Wait for the manuscript to finish synchronizing before using the model.";
      return;
    }

    const source = this.#source.toString();
    const selectionStart = this.#elements.source.selectionStart;
    const selectionEnd = this.#elements.source.selectionEnd;
    const selected = source.slice(selectionStart, selectionEnd);
    const annotationIds = Array.from(document.querySelectorAll<HTMLInputElement>("[data-annotation-id]:checked")).map(
      (input) => input.dataset.annotationId ?? "",
    );
    const annotations = this.#snapshot.annotations.filter((annotation) => annotationIds.includes(annotation.id));
    if (!selected.trim() || annotations.length === 0) {
      this.#elements.modelStatus.textContent = "Select manuscript text and at least one annotation first.";
      return;
    }

    const endpoint = this.#elements.llmEndpoint.value;
    let provider: string;
    try {
      provider = new URL(endpoint).origin;
    } catch {
      this.#elements.modelStatus.textContent = "Enter a valid local model endpoint.";
      return;
    }
    const model = this.#elements.llmModel.value;
    const sourceRevision = this.#revision;
    const prompt = buildGroundedPrompt(source, selected, annotations);
    this.#modelBusy = true;
    this.#updateModelAvailability();
    this.#elements.modelStatus.textContent = "Asking the local model for a grounded candidate…";
    try {
      const llmResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: "system", content: "You are a careful scientific editor. Use only supplied evidence and preserve source syntax." },
            { role: "user", content: prompt },
          ],
        }),
      });
      await expectOk(llmResponse);
      const result: unknown = await llmResponse.json();
      const proposedSource = extractCompletion(result);
      if (!proposedSource) throw new Error("The local model returned no text candidate");
      const response = await jsonFetch(`${apiBase}/candidates`, {
        provider,
        model,
        sourceRevision,
        sourceIds: annotationIds,
        proposedSource,
      });
      await expectOk(response);
      await this.#resourceRefresh.request();
      this.#elements.modelStatus.textContent = "Candidate ready. Inspect it before applying.";
    } catch (error) {
      this.#elements.modelStatus.textContent = error instanceof Error ? error.message : "Local model request failed";
    } finally {
      this.#modelBusy = false;
      this.#updateModelAvailability();
    }
  }

  async #updateCandidate(candidateId: string, action: "apply" | "reject"): Promise<void> {
    if (action === "apply" && !this.#hasStableDocumentBase()) {
      this.#showToast("Wait for the manuscript to finish synchronizing before applying a candidate.");
      return;
    }
    const response = await fetch(`${apiBase}/candidates/${candidateId}/${action}`, { method: "POST" });
    await expectOk(response);
    await this.#resourceRefresh.request();
    this.#showToast(action === "apply" ? "Candidate applied to canonical Markdown." : "Candidate rejected; manuscript unchanged.");
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

  #showPassage(anchor: PassageLink["anchor"]): void {
    const resolution = resolveManuscriptAnchor(this.#document, anchor);
    if (resolution.status !== "resolved") {
      this.#showToast("This manuscript anchor is stale and needs to be linked again.");
      return;
    }
    this.#showWorkspaceSurface("authoring");
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

function bindYText(textarea: HTMLTextAreaElement, text: Y.Text, documentModel: Y.Doc): void {
  textarea.addEventListener("input", () => {
    const splice = calculateTextSplice(text.toString(), textarea.value);
    if (!splice) return;
    documentModel.transact(() => {
      if (splice.deleteCount > 0) text.delete(splice.start, splice.deleteCount);
      if (splice.insert) text.insert(splice.start, splice.insert);
    }, textarea);
  });
  text.observe((event) => {
    if (event.transaction.origin === textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = text.toString();
    textarea.setSelectionRange(Math.min(start, textarea.value.length), Math.min(end, textarea.value.length));
  });
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
    source: requiredElement("source-editor", HTMLTextAreaElement),
    bibliography: requiredElement("bibliography-editor", HTMLTextAreaElement),
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
    llmEndpoint: requiredElement("llm-endpoint", HTMLInputElement),
    llmModel: requiredElement("llm-model", HTMLInputElement),
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

async function jsonFetch(url: string, body: object): Promise<Response> {
  return await fetch(url, {
    method: "POST",
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

function formatBytes(value: number): string {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function readClaimEvidenceRelation(value: string): ClaimEvidenceRelation {
  if (value === "contradicts" || value === "extends") return value;
  return "supports";
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
