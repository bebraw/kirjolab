import * as Y from "yjs";
import { renderWorkspaceMarkdown } from "../domain/markdown";
import {
  isWorkspaceSnapshot,
  isWorkspaceMembers,
  isWorkspaceSummaries,
  type AnnotationResource,
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
import { PdfEvidenceViewer, type PdfSelectionCapture } from "./pdf-viewer";

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
  publicationCount: HTMLElement;
  publicationList: HTMLElement;
  annotationCount: HTMLElement;
  annotationList: HTMLElement;
  annotationForm: HTMLFormElement;
  annotationPdf: HTMLSelectElement;
  annotationPage: HTMLInputElement;
  annotationQuote: HTMLTextAreaElement;
  annotationPrefix: HTMLInputElement;
  annotationSuffix: HTMLInputElement;
  annotationComment: HTMLInputElement;
  annotationSelectionStatus: HTMLElement;
  openPaper: HTMLButtonElement;
  paperDialog: HTMLDialogElement;
  closePaper: HTMLButtonElement;
  paperTitle: HTMLElement;
  paperStatus: HTMLElement;
  paperCanvas: HTMLCanvasElement;
  paperPage: HTMLElement;
  paperTextLayer: HTMLElement;
  paperHighlights: HTMLElement;
  paperPageIndicator: HTMLElement;
  previousPaperPage: HTMLButtonElement;
  nextPaperPage: HTMLButtonElement;
  llmEndpoint: HTMLInputElement;
  llmModel: HTMLInputElement;
  generateCandidate: HTMLButtonElement;
  modelStatus: HTMLElement;
  candidateList: HTMLElement;
  toast: HTMLElement;
}

class WorkspaceApp {
  readonly #elements = collectElements();
  readonly #pdfViewer: PdfEvidenceViewer;
  readonly #document = new Y.Doc();
  readonly #source = this.#document.getText("source");
  readonly #bibliography = this.#document.getText("bibliography");
  #snapshot: WorkspaceSnapshot | null = null;
  #revision = 0;
  #socket: WebSocket | null = null;
  #toastTimer: number | undefined;
  #pendingRects: PdfSelectionRect[] = [];
  #activePdfId: string | undefined;

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
    await this.#refreshSnapshot();
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
    this.#source.observe(() => this.#renderPreview());
    this.#bibliography.observe(() => this.#renderPreview());
    this.#document.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== remoteOrigin && this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(toArrayBuffer(update));
    });
    this.#elements.pdfUpload.addEventListener("change", () => void this.#uploadPdf());
    this.#elements.bibliographyUpload.addEventListener("change", () => void this.#importBibliography());
    this.#elements.annotationForm.addEventListener("submit", (event) => void this.#createAnnotation(event));
    this.#elements.openPaper.addEventListener("click", () => void this.#showPaper());
    this.#elements.closePaper.addEventListener("click", () => this.#elements.paperDialog.close());
    this.#elements.generateCandidate.addEventListener("click", () => void this.#generateCandidate());
  }

  async #refreshSnapshot(): Promise<void> {
    const response = await fetch(apiBase);
    if (!response.ok) throw new Error("Could not load the workspace");
    const value: unknown = await response.json();
    if (!isWorkspaceSnapshot(value)) throw new Error("Workspace returned an invalid snapshot");
    this.#snapshot = value;
    this.#elements.workspaceTitle.textContent = value.title;
    this.#revision = value.revision;
    this.#elements.source.value = value.source;
    this.#elements.bibliography.value = value.bibliography;
    this.#renderPreview(value.source, value.bibliography);
    this.#renderResources();
    this.#updateRevision();
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
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}${apiBase}/socket`);
    socket.binaryType = "arraybuffer";
    this.#socket = socket;
    socket.addEventListener("open", () => {
      this.#setConnection("Live", true);
      this.#setEditorsEnabled(true);
      socket.send(toArrayBuffer(Y.encodeStateAsUpdate(this.#document)));
    });
    socket.addEventListener("message", (event: MessageEvent<string | ArrayBuffer>) => this.#handleSocketMessage(event.data));
    socket.addEventListener("close", () => {
      this.#setConnection("Reconnecting", false);
      this.#setEditorsEnabled(false);
      window.setTimeout(() => this.#connect(), 1200);
    });
    socket.addEventListener("error", () => socket.close());
  }

  #handleSocketMessage(message: string | ArrayBuffer): void {
    if (typeof message !== "string") {
      Y.applyUpdate(this.#document, new Uint8Array(message), remoteOrigin);
      this.#elements.saveStatus.textContent = "Materialized to Markdown";
      return;
    }
    const value: unknown = JSON.parse(message);
    if (!isRecord(value) || typeof value.type !== "string") return;
    if (value.type === "revision" && typeof value.revision === "number") {
      this.#revision = value.revision;
      this.#updateRevision();
    }
    if (value.type === "presence" && typeof value.collaborators === "number") {
      this.#elements.connectionStatus.textContent = `Live · ${value.collaborators} ${value.collaborators === 1 ? "writer" : "writers"}`;
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
  }

  #renderResources(): void {
    if (!this.#snapshot) return;
    this.#renderPdfs(this.#snapshot.pdfs);
    this.#renderPublications(this.#snapshot.publications);
    this.#renderAnnotations(this.#snapshot.annotations, this.#snapshot.links);
    this.#renderCandidates(this.#snapshot.candidates);
    this.#pdfViewer.updateAnnotations(this.#snapshot.annotations);
  }

  #renderPdfs(pdfs: PdfResource[]): void {
    this.#elements.pdfList.replaceChildren();
    this.#elements.annotationPdf.replaceChildren();
    if (pdfs.length === 0) {
      this.#elements.pdfList.append(emptyState("No paper imported yet."));
      this.#elements.annotationPdf.append(new Option("Import a PDF first", ""));
      this.#elements.openPaper.disabled = true;
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
    this.#elements.openPaper.disabled = false;
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
      card.append(resourceLabel(`${publication.type} · ${publication.metadataSource}`), resourceTitle(publication.title));
      const details = document.createElement("p");
      details.className = "mt-2 font-sans text-xs leading-5 text-app-text-soft";
      details.textContent = [publication.authors.join("; "), publication.year, publication.venue].filter(Boolean).join(" · ");
      card.append(details);
      if (publication.doi) {
        const actions = document.createElement("div");
        actions.className = "mt-3 flex flex-wrap items-center gap-2";
        actions.append(
          resourceLabel(`doi:${publication.doi}`),
          actionButton("Enrich", "button-secondary", () => void this.#enrichPublication(publication.id)),
        );
        card.append(actions);
      }
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
        actions.append(actionButton("Open linked passage", "button-secondary w-full justify-center", () => this.#showPassage(passage)));
      }
      card.append(label, actions);
      this.#elements.annotationList.append(card);
    }
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
        actions.append(
          actionButton("Apply candidate", "button-primary", () => void this.#updateCandidate(candidate.id, "apply")),
          actionButton("Reject", "button-secondary", () => void this.#updateCandidate(candidate.id, "reject")),
        );
        card.append(actions);
      }
      this.#elements.candidateList.append(card);
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
    await this.#refreshSnapshot();
    this.#showToast("PDF imported without modifying the source file.");
  }

  async #importBibliography(): Promise<void> {
    const file = this.#elements.bibliographyUpload.files?.[0];
    if (!file) return;
    this.#showToast(`Importing ${file.name}…`);
    const response = await jsonFetch(`${apiBase}/bibliography/import`, { bibtex: await file.text() });
    await expectOk(response);
    this.#elements.bibliographyUpload.value = "";
    await this.#refreshSnapshot();
    this.#showToast("References merged by citation key.");
  }

  async #enrichPublication(publicationId: string): Promise<void> {
    this.#showToast("Looking up DOI metadata from Crossref…");
    const response = await fetch(`${apiBase}/publications/${publicationId}/enrich`, {
      method: "POST",
      credentials: "same-origin",
    });
    await expectOk(response);
    await this.#refreshSnapshot();
    this.#showToast("Reference enriched from Crossref.");
  }

  async #createAnnotation(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const response = await jsonFetch(`${apiBase}/annotations`, {
      pdfId: this.#elements.annotationPdf.value,
      page: this.#elements.annotationPage.valueAsNumber,
      quote: this.#elements.annotationQuote.value,
      prefix: this.#elements.annotationPrefix.value,
      suffix: this.#elements.annotationSuffix.value,
      comment: this.#elements.annotationComment.value,
      rects: this.#pendingRects,
    });
    await expectOk(response);
    this.#elements.annotationQuote.value = "";
    this.#elements.annotationPrefix.value = "";
    this.#elements.annotationSuffix.value = "";
    this.#elements.annotationComment.value = "";
    this.#pendingRects = [];
    this.#elements.annotationSelectionStatus.textContent = "Annotation saved. Select another passage in the open paper to continue.";
    await this.#refreshSnapshot();
    this.#showToast("Annotation anchored with geometry and textual context.");
  }

  async #linkAnnotation(annotationId: string): Promise<void> {
    const start = this.#elements.source.selectionStart;
    const end = this.#elements.source.selectionEnd;
    const excerpt = this.#elements.source.value.slice(start, end);
    if (!excerpt.trim()) return this.#showToast("Select manuscript text before linking an annotation.");
    const response = await jsonFetch(`${apiBase}/links`, { annotationId, start, end, excerpt });
    await expectOk(response);
    await this.#refreshSnapshot();
    this.#showToast("Annotation linked to the selected passage.");
  }

  async #generateCandidate(): Promise<void> {
    if (!this.#snapshot) return;
    const selected = this.#elements.source.value.slice(this.#elements.source.selectionStart, this.#elements.source.selectionEnd);
    const annotationIds = Array.from(document.querySelectorAll<HTMLInputElement>("[data-annotation-id]:checked")).map(
      (input) => input.dataset.annotationId ?? "",
    );
    const annotations = this.#snapshot.annotations.filter((annotation) => annotationIds.includes(annotation.id));
    if (!selected.trim() || annotations.length === 0) {
      this.#elements.modelStatus.textContent = "Select manuscript text and at least one annotation first.";
      return;
    }

    this.#elements.generateCandidate.disabled = true;
    this.#elements.modelStatus.textContent = "Asking the local model for a grounded candidate…";
    try {
      const endpoint = this.#elements.llmEndpoint.value;
      const model = this.#elements.llmModel.value;
      const llmResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: "system", content: "You are a careful scientific editor. Use only supplied evidence and preserve source syntax." },
            { role: "user", content: buildGroundedPrompt(this.#elements.source.value, selected, annotations) },
          ],
        }),
      });
      await expectOk(llmResponse);
      const result: unknown = await llmResponse.json();
      const proposedSource = extractCompletion(result);
      if (!proposedSource) throw new Error("The local model returned no text candidate");
      const response = await jsonFetch(`${apiBase}/candidates`, {
        provider: new URL(endpoint).origin,
        model,
        sourceRevision: this.#revision,
        sourceIds: annotationIds,
        proposedSource,
      });
      await expectOk(response);
      await this.#refreshSnapshot();
      this.#elements.modelStatus.textContent = "Candidate ready. Inspect it before applying.";
    } catch (error) {
      this.#elements.modelStatus.textContent = error instanceof Error ? error.message : "Local model request failed";
    } finally {
      this.#elements.generateCandidate.disabled = false;
    }
  }

  async #updateCandidate(candidateId: string, action: "apply" | "reject"): Promise<void> {
    const response = await fetch(`${apiBase}/candidates/${candidateId}/${action}`, { method: "POST" });
    await expectOk(response);
    await this.#refreshSnapshot();
    this.#showToast(action === "apply" ? "Candidate applied to canonical Markdown." : "Candidate rejected; manuscript unchanged.");
  }

  async #showPaper(pdf?: PdfResource, page = 1, focusAnnotationId?: string): Promise<void> {
    const selectedId = pdf?.id ?? this.#elements.annotationPdf.value;
    const selected = pdf ?? this.#snapshot?.pdfs.find((item) => item.id === selectedId);
    if (!selected) return;
    this.#activePdfId = selected.id;
    this.#elements.annotationPdf.value = selected.id;
    this.#elements.paperTitle.textContent = selected.name;
    this.#elements.paperDialog.showModal();
    try {
      await this.#pdfViewer.open({
        url: `${apiBase}/pdfs/${selected.id}`,
        annotations: this.#snapshot?.annotations.filter((annotation) => annotation.pdfId === selected.id) ?? [],
        page,
        ...(focusAnnotationId ? { focusAnnotationId } : {}),
      });
    } catch (error) {
      this.#elements.paperStatus.textContent = error instanceof Error ? error.message : "Could not render this PDF";
    }
  }

  #capturePdfSelection(capture: PdfSelectionCapture): void {
    if (this.#activePdfId) this.#elements.annotationPdf.value = this.#activePdfId;
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

  #showPassage(link: PassageLink): void {
    this.#elements.paperDialog.close();
    this.#elements.source.focus();
    this.#elements.source.setSelectionRange(link.start, link.end);
    this.#elements.source.scrollIntoView({ behavior: "smooth", block: "center" });
    this.#showToast("Linked manuscript passage selected.");
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
    publicationCount: requiredElement("publication-count", HTMLElement),
    publicationList: requiredElement("publication-list", HTMLElement),
    annotationCount: requiredElement("annotation-count", HTMLElement),
    annotationList: requiredElement("annotation-list", HTMLElement),
    annotationForm: requiredElement("annotation-form", HTMLFormElement),
    annotationPdf: requiredElement("annotation-pdf", HTMLSelectElement),
    annotationPage: requiredElement("annotation-page", HTMLInputElement),
    annotationQuote: requiredElement("annotation-quote", HTMLTextAreaElement),
    annotationPrefix: requiredElement("annotation-prefix", HTMLInputElement),
    annotationSuffix: requiredElement("annotation-suffix", HTMLInputElement),
    annotationComment: requiredElement("annotation-comment", HTMLInputElement),
    annotationSelectionStatus: requiredElement("annotation-selection-status", HTMLElement),
    openPaper: requiredElement("open-paper", HTMLButtonElement),
    paperDialog: requiredElement("paper-dialog", HTMLDialogElement),
    closePaper: requiredElement("close-paper", HTMLButtonElement),
    paperTitle: requiredElement("paper-title", HTMLElement),
    paperStatus: requiredElement("paper-status", HTMLElement),
    paperCanvas: requiredElement("paper-canvas", HTMLCanvasElement),
    paperPage: requiredElement("paper-page", HTMLElement),
    paperTextLayer: requiredElement("paper-text-layer", HTMLElement),
    paperHighlights: requiredElement("paper-highlights", HTMLElement),
    paperPageIndicator: requiredElement("paper-page-indicator", HTMLElement),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readWorkspaceId(): string {
  const value = document.body.dataset.workspaceId;
  if (!value || !/^[a-z0-9-]{1,64}$/iu.test(value)) throw new Error("Invalid workspace identity");
  return value;
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return buffer;
}

if (typeof document !== "undefined") {
  const app = new WorkspaceApp();
  void app.start().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Kirjolab failed to start";
    document.body.textContent = message;
  });
}
