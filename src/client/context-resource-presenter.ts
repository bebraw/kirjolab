import { html, LitElement, type TemplateResult } from "lit";
import { activePdfLoadContext } from "./active-pdf-context";
import type {
  LibraryHighlight,
  LibraryPdfArtifact,
  LibraryPdfMarkup,
  LibraryPdfNote,
  ProjectReferencePdf,
  ReferenceLibrarySnapshot,
} from "../domain/reference-library";
import { isProjectReferencePdfs } from "../domain/reference-library";
import { suggestCitationKey } from "../domain/publication-intake";
import type { AnnotationResource, WorkspaceSnapshot } from "../domain/workspace";
import { AssistantWorkflowStatus } from "./assistant-workflow-status";
import { CandidateListPanel } from "./candidate-list-panel";
import { CandidateReviewPanel } from "./candidate-review-panel";
import { citationPageFromLocator, type CitationContext } from "./citations";
import { ClaimListPanel } from "./claim-list-panel";
import { ContextTabStrip } from "./context-tab-strip";
import { expectOk } from "./http";
import { LibraryPdfAnnotationToolbar } from "./library-pdf-annotation-toolbar";
import { LibraryPdfInspector } from "./library-pdf-inspector";
import { LibraryPdfMarkupLayer, type LibraryPdfNoteDraft, type PdfAnnotationTool } from "./library-pdf-markup-layer";
import { ManuscriptCommentList } from "./manuscript-comment-list";
import type { PdfSelectionCapture } from "./pdf-viewer";
import type { PdfEvidenceViewer } from "./pdf-viewer";
import { libraryPdfAnnotationActionEvent, type LibraryPdfAnnotationAction } from "./library-pdf-annotation-forms";
import { libraryPdfAnnotationListActionEvent, type LibraryPdfAnnotationListAction } from "./library-pdf-annotation-list";
import { libraryPdfInspectorCloseEvent } from "./library-pdf-inspector";
import { libraryPdfMarkupActionEvent, type LibraryPdfMarkupAction } from "./library-pdf-markup-layer";
import { libraryPdfToolbarActionEvent, type LibraryPdfToolbarAction } from "./library-pdf-annotation-toolbar";
import { pdfHighlightImportOutcomeEvent, type PdfHighlightImportOutcome } from "./pdf-highlight-import-panel";
import { ProjectAnnotationForm } from "./project-annotation-form";
import { ProjectEvidencePanel } from "./project-evidence-panel";
import { mutateProjectReference } from "./project-reference-mutation";
import { PublicationContextPanel, type PublicationPaperOption } from "./publication-context-panel";
import { PublicationListPanel } from "./publication-list-panel";
import {
  setPdfResearchLocation,
  setResearchTabScroll,
  type ResearchContextAuthorization,
  type ResearchContextState,
  type ResearchContextTab,
  type ResearchResourceTab,
  type ResearchResourceTarget,
} from "./research-context";
import { WorkspaceRailTabs } from "./workspace-rail-tabs";

export interface ContextResourceSources {
  readonly activeTab: ResearchResourceTab | undefined;
  readonly candidateDecision: { readonly action: "apply" | "reject"; readonly id: string } | null;
  readonly library: ReferenceLibrarySnapshot | null;
  readonly projectApiBase: string | null;
  readonly referencePdfs: readonly ProjectReferencePdf[];
  readonly snapshot: WorkspaceSnapshot | null;
  readonly sourceRevision: number;
  readonly stableDocument: boolean;
}

export interface ContextResourcePresentation {
  readonly publicationPresented: boolean;
}

export interface ResearchContextPresentation extends ContextResourcePresentation {
  readonly activeTab: ResearchResourceTab | undefined;
}

export interface ResearchContextSources extends Omit<ContextResourceSources, "activeTab"> {
  readonly context: ResearchContextState;
  readonly standaloneLibrary: boolean;
}

export interface LibraryPdfToolPresentation {
  readonly privateHighlightId: string | null;
  readonly privateHighlightSelection: boolean;
  readonly textSelectionEnabled: boolean;
}

export interface LibraryPdfInspectorClosePresentation {
  readonly clearDraftSelection: boolean;
  readonly privateHighlightSelection: boolean | null;
}

export interface LibraryPdfSelectionPresentation {
  readonly clearDraftSelection: boolean;
  readonly privateHighlightId?: string | null;
  readonly privateHighlightSelection?: boolean;
  readonly textSelectionEnabled?: boolean;
}

export interface PdfPagePresentation {
  readonly activePdf: boolean;
  readonly context: ResearchContextState;
  readonly libraryPdfId: string | undefined;
}

export interface LibraryPdfCoordinator {
  readonly acceptProjectMutation: (snapshot: WorkspaceSnapshot) => Promise<void>;
  readonly canInsertCitation: () => boolean;
  readonly completeMarkup: (message: string) => void;
  readonly insertCitation: (citationAlias: string, locator: string) => void;
  readonly library: () => ReferenceLibrarySnapshot | null;
  readonly openPdf: (artifact: LibraryPdfArtifact, page: number) => Promise<void>;
  readonly project: () => WorkspaceSnapshot | null;
  readonly projectApiBase: string;
  readonly refreshLibrary: () => Promise<void>;
  readonly showToast: (message: string) => void;
}

export interface ContextRouteCoordinator {
  readonly insertCitation: (citationAlias: string, locator?: string) => void;
  readonly library: () => ReferenceLibrarySnapshot | null;
  readonly openCandidate: (candidate: WorkspaceSnapshot["candidates"][number]) => void;
  readonly openLibraryPdf: (artifact: LibraryPdfArtifact, page?: number) => Promise<void>;
  readonly openProjectPdf: (pdf: WorkspaceSnapshot["pdfs"][number], page?: number, annotationId?: string) => Promise<void>;
  readonly openPublication: (publication: WorkspaceSnapshot["publications"][number]) => void;
  readonly openReferencePdf: (pdf: ProjectReferencePdf, page?: number) => Promise<void>;
  readonly presentNotice: (message: string) => void;
  readonly project: () => WorkspaceSnapshot | null;
  readonly referencePdfs: () => readonly ProjectReferencePdf[];
  readonly refreshLibrary: () => Promise<void>;
}

export interface ContextViewerState {
  readonly focusedAnnotationId: string | null;
  readonly page: number;
  readonly renderedContextKey: ResearchContextTab["key"] | undefined;
}

type ContextPdfViewer = Pick<PdfEvidenceViewer, "clearDraftSelection" | "setPrivateHighlightSelection" | "setTextSelectionEnabled"> &
  Pick<PdfEvidenceViewer, "currentPage" | "focusedAnnotationId" | "open" | "showError" | "updateAnnotations" | "updatePrivateHighlights">;

export class ContextResourcePresenter extends LitElement {
  private currentActiveTab: ResearchResourceTab | undefined;
  private currentLibraryPdf: LibraryPdfArtifact | undefined;
  private currentLibrary: ReferenceLibrarySnapshot | null = null;
  private currentSnapshot: WorkspaceSnapshot | null = null;
  private libraryPdfCoordinator: LibraryPdfCoordinator | null = null;
  private pdfApiBase = "";
  private pdfViewer: ContextPdfViewer | null = null;
  private renderedPdfContextKey: ResearchContextTab["key"] | undefined;
  private currentRenderedPdfId: string | undefined;
  private routeCoordinator: ContextRouteCoordinator | null = null;
  private loadedReferencePdfs: readonly ProjectReferencePdf[] = [];

  get referencePdfs(): readonly ProjectReferencePdf[] {
    return this.loadedReferencePdfs;
  }

  get activeTab(): ResearchResourceTab | undefined {
    return this.currentActiveTab;
  }

  async refreshReferencePdfs(projectApiBase: string | null, fetcher: typeof fetch = fetch): Promise<void> {
    if (!projectApiBase) {
      this.loadedReferencePdfs = [];
      return;
    }
    const response = await fetcher(`${projectApiBase}/reference-pdfs`, { credentials: "same-origin" });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isProjectReferencePdfs(value)) throw new Error("Project reference PDFs returned invalid metadata");
    this.loadedReferencePdfs = value;
  }

  captureContext(state: ResearchContextState, viewer: ContextViewerState): ResearchContextState {
    const key = state.activeKey;
    const fixedScrollTop = this.element("context-tab-strip", ContextTabStrip)?.fixedScrollTop(key) ?? null;
    if (fixedScrollTop !== null) return setResearchTabScroll(state, key, fixedScrollTop);
    const tab = state.tabs.find((item) => item.key === key);
    if (!tab) return state;
    const scrolled = setResearchTabScroll(state, key, this.resourceScrollTop(tab));
    if ((tab.kind !== "pdf" && tab.kind !== "library-pdf") || tab.key !== viewer.renderedContextKey) return scrolled;
    return setPdfResearchLocation(scrolled, key, {
      page: viewer.page,
      ...(tab.kind === "pdf" ? { focusedAnnotationId: viewer.focusedAnnotationId } : {}),
    });
  }

  bindRoutes(coordinator: ContextRouteCoordinator): void {
    this.routeCoordinator = coordinator;
  }

  async restoreTarget(target: ResearchResourceTarget, page?: number, annotationId?: string): Promise<void> {
    const coordinator = this.routeCoordinator;
    if (!coordinator) return;
    const project = coordinator.project();
    if (target.kind === "publication") {
      const publication = project?.publications.find(({ id }) => id === target.id);
      if (publication) coordinator.openPublication(publication);
      return;
    }
    if (target.kind === "pdf") {
      const pdf = project?.pdfs.find(({ id }) => id === target.id);
      if (pdf) await coordinator.openProjectPdf(pdf, page, annotationId);
      return;
    }
    if (target.kind === "candidate") {
      const candidate = project?.candidates.find(({ id }) => id === target.id);
      if (candidate) coordinator.openCandidate(candidate);
      return;
    }
    if (!coordinator.library()) await coordinator.refreshLibrary();
    const artifact = coordinator.library()?.artifacts.find(({ id }) => id === target.id);
    if (artifact) return await coordinator.openLibraryPdf(artifact, page);
    const referencePdf = coordinator.referencePdfs().find(({ id }) => id === target.id);
    if (referencePdf) await coordinator.openReferencePdf(referencePdf, page);
  }

  openProjectAnnotation(annotationId: string, edit = false): void {
    const coordinator = this.routeCoordinator;
    const project = coordinator?.project();
    const annotation = project?.annotations.find(({ id }) => id === annotationId);
    const pdf = annotation ? project?.pdfs.find(({ id }) => id === annotation.pdfId) : undefined;
    if (!coordinator || !annotation || !pdf) return;
    if (edit) this.element("project-annotation-form", ProjectAnnotationForm)?.showAnnotation(annotation);
    void coordinator.openProjectPdf(pdf, annotation.page, annotation.id);
  }

  async openPublicationPaper(paper: PublicationPaperOption): Promise<void> {
    const coordinator = this.routeCoordinator;
    if (!coordinator) return;
    if (paper.kind === "project") return await coordinator.openProjectPdf(paper.pdf);
    if (paper.kind === "library") return await coordinator.openLibraryPdf(paper.artifact);
    await coordinator.openReferencePdf(paper.pdf);
  }

  openProjectNote(id: string): void {
    const coordinator = this.routeCoordinator;
    const share = coordinator
      ?.project()
      ?.researchShares.find((item) => item.resourceId === id && item.revokedAt === null && item.content.kind === "note");
    if (coordinator && share?.content.kind === "note") coordinator.presentNotice(noticeExcerpt(share.content.body));
  }

  insertActiveCitation(includePdfPage = false): void {
    const coordinator = this.routeCoordinator;
    const project = coordinator?.project();
    const tab = this.currentActiveTab;
    if (!coordinator || !project || !tab) return;
    if (tab.kind === "publication") {
      const publication = project.publications.find(({ id }) => id === tab.id);
      if (publication) coordinator.insertCitation(publication.citationKey);
      return;
    }
    if (!includePdfPage || tab.kind !== "pdf") return;
    const links = project.publicationPdfLinks.filter(({ pdfId }) => pdfId === tab.id);
    const publication = links.length === 1 ? project.publications.find(({ id }) => id === links[0]?.publicationId) : undefined;
    if (publication) coordinator.insertCitation(publication.citationKey, `p. ${tab.page}`);
  }

  setCitationAvailable(available: boolean): void {
    this.element("publication-context-panel", PublicationContextPanel)?.setCitationAvailable(
      this.currentActiveTab?.kind === "publication" && available,
    );
  }

  openCitation(citation: CitationContext): string | null {
    if (citation.keys.length > 1) return "Open this grouped citation from Preview to choose a reference.";
    const citationKey = citation.keys[0] ?? "";
    const project = this.routeCoordinator?.project();
    const publication = project?.publications.find((item) => item.citationKey.toLocaleLowerCase() === citationKey.toLocaleLowerCase());
    if (!project || !publication) return `No publication resource is available for ${citationKey || "this citation"}.`;
    const links = project.publicationPdfLinks.filter(({ publicationId }) => publicationId === publication.id);
    const pdf = links.length === 1 ? project.pdfs.find(({ id }) => id === links[0]?.pdfId) : undefined;
    const page = citationPageFromLocator(citation.locator);
    if (page && pdf) void this.routeCoordinator?.openProjectPdf(pdf, page);
    else this.routeCoordinator?.openPublication(publication);
    return null;
  }

  bindLibraryPdf(coordinator: LibraryPdfCoordinator): void {
    this.libraryPdfCoordinator = coordinator;
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    inspector?.addEventListener(libraryPdfAnnotationActionEvent, (event) => {
      this.handleLibraryPdfAnnotationAction((event as CustomEvent<LibraryPdfAnnotationAction>).detail);
    });
    inspector?.addEventListener(libraryPdfAnnotationListActionEvent, (event) => {
      this.handleLibraryPdfAnnotationListAction((event as CustomEvent<LibraryPdfAnnotationListAction>).detail);
    });
    inspector?.addEventListener(libraryPdfInspectorCloseEvent, () => this.closeBoundLibraryPdfInspector());
    inspector?.addEventListener(pdfHighlightImportOutcomeEvent, (event) => {
      void this.completePdfHighlightImport((event as CustomEvent<PdfHighlightImportOutcome>).detail.count);
    });
    this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar)?.addEventListener(libraryPdfToolbarActionEvent, (event) =>
      this.handleLibraryPdfToolbarAction((event as CustomEvent<LibraryPdfToolbarAction>).detail),
    );
    this.element("paper-markups", LibraryPdfMarkupLayer)?.addEventListener(libraryPdfMarkupActionEvent, (event) => {
      this.handleLibraryPdfMarkupAction((event as CustomEvent<LibraryPdfMarkupAction>).detail);
    });
  }

  bindPdfViewer(viewer: ContextPdfViewer, apiBase: string): void {
    this.pdfViewer = viewer;
    this.pdfApiBase = apiBase;
  }

  capturePdfSelection(capture: PdfSelectionCapture): void {
    const activeTab = this.currentActiveTab;
    if (activeTab?.kind === "library-pdf") {
      if (this.currentLibraryPdf) this.beginLibraryHighlight(this.currentLibraryPdf.id, capture);
      return;
    }
    if (activeTab?.kind !== "pdf") return;
    const form = this.element("project-annotation-form", ProjectAnnotationForm);
    if (this.currentRenderedPdfId) form?.selectPdf(this.currentRenderedPdfId);
    form?.showCapture(capture);
    if (form && this.currentRenderedPdfId && this.currentSnapshot) {
      void form.persistCapture(this.currentSnapshot.annotations, this.currentRenderedPdfId, capture);
    }
  }

  activateProjectHighlight(annotationId: string, fragmentId: string): void {
    const form = this.element("project-annotation-form", ProjectAnnotationForm);
    if (form && this.currentSnapshot) void form.activateHighlight(this.currentSnapshot.annotations, annotationId, fragmentId);
  }

  presentContext(sources: ResearchContextSources): ResearchContextPresentation {
    const { context, standaloneLibrary, ...resourceSources } = sources;
    this.element("context-tab-strip", ContextTabStrip)?.setTabs({
      activeKey: context.activeKey,
      candidates: sources.snapshot?.candidates ?? [],
      libraryArtifacts: sources.library?.artifacts ?? [],
      pdfs: sources.snapshot?.pdfs ?? [],
      publications: sources.snapshot?.publications ?? [],
      referencePdfs: sources.referencePdfs,
      standaloneLibrary,
      tabs: context.tabs,
    });
    const activeTab = context.tabs.find(
      (tab): tab is ResearchResourceTab =>
        tab.kind !== "preview" && tab.kind !== "library" && tab.kind !== "assistant" && tab.key === context.activeKey,
    );
    this.currentActiveTab = activeTab;
    return { activeTab, ...this.present({ ...resourceSources, activeTab }) };
  }

  captureBoundContext(state: ResearchContextState): ResearchContextState {
    const viewer = this.pdfViewer;
    if (!viewer) return state;
    return this.captureContext(state, {
      focusedAnnotationId: viewer.focusedAnnotationId,
      page: viewer.currentPage,
      renderedContextKey: this.renderedPdfContextKey,
    });
  }

  async loadActivePdf(force: boolean): Promise<void> {
    const viewer = this.pdfViewer;
    if (!viewer) return;
    const context = activePdfLoadContext({
      activeTab: this.currentActiveTab,
      annotations: this.currentSnapshot?.annotations ?? [],
      apiBase: this.pdfApiBase,
      libraryArtifacts: this.currentLibrary?.artifacts ?? [],
      libraryHighlights: this.currentLibrary?.highlights ?? [],
      projectReferencePdfs: this.loadedReferencePdfs,
      workspacePdfs: this.currentSnapshot?.pdfs ?? [],
    });
    if (!context) return;
    if (context.workspacePdf) this.element("project-annotation-form", ProjectAnnotationForm)?.selectPdf(context.workspacePdf.id);
    viewer.updateAnnotations(context.annotations);
    viewer.updatePrivateHighlights(context.privateHighlights);
    const reader = this.element("paper-reader", HTMLElement);
    if (!force && this.renderedPdfContextKey === context.tab.key) {
      if (reader) reader.scrollTop = context.tab.scrollTop;
      return;
    }
    try {
      const opened = await viewer.open({
        url: context.url,
        annotations: context.annotations,
        page: context.tab.page,
        ...(context.tab.focusedAnnotationId ? { focusAnnotationId: context.tab.focusedAnnotationId } : {}),
        mode: context.workspacePdf ? "evidence" : context.libraryPdf ? "private-highlight" : "read-only",
        privateHighlights: context.privateHighlights,
      });
      if (!opened || this.currentActiveTab?.key !== context.tab.key) return;
      this.renderedPdfContextKey = context.tab.key;
      this.currentRenderedPdfId = context.workspacePdf?.id;
      if (reader) reader.scrollTop = context.tab.scrollTop;
    } catch (error) {
      if (this.currentActiveTab?.key === context.tab.key) viewer.showError(error);
    }
  }

  selectLibraryHighlight(highlightId: string): void {
    const highlight = this.libraryPdfCoordinator?.library()?.highlights.find((item) => item.id === highlightId);
    if (!highlight) return;
    this.clearBoundLibraryPdfMarkupSelection();
    this.applyViewerPresentation(this.editLibraryHighlight(highlight));
  }

  presentWorkspace(snapshot: WorkspaceSnapshot, renderedPdfId = this.currentRenderedPdfId): AnnotationResource[] {
    const workflow = this.element("assistant-workflow-status", AssistantWorkflowStatus);
    workflow?.reconcileEvidence(snapshot.annotations, snapshot.claims);
    const selectedEvidence = workflow?.selectedEvidenceKeys ?? new Set<string>();
    this.element("project-evidence-panel", ProjectEvidencePanel)?.setEvidence(snapshot, selectedEvidence);
    this.element("project-annotation-form", ProjectAnnotationForm)?.setPdfs(snapshot.pdfs, renderedPdfId ?? "");
    this.element("publication-list-panel", PublicationListPanel)?.setWorkspace(snapshot);
    this.element("claim-list-panel", ClaimListPanel)?.setWorkspace(snapshot, selectedEvidence);
    const comments = this.element("manuscript-comment-list-panel", ManuscriptCommentList);
    if (comments) this.element("workspace-rail-tabs", WorkspaceRailTabs)?.setCommentCount(comments.setComments(snapshot.comments));
    this.element("candidate-list-panel", CandidateListPanel)?.setCandidates(snapshot.candidates);
    const annotations = renderedPdfId ? snapshot.annotations.filter(({ pdfId }) => pdfId === renderedPdfId) : [];
    this.pdfViewer?.updateAnnotations(annotations);
    return annotations;
  }

  resourceAuthorization(
    snapshot: WorkspaceSnapshot | null,
    library: ReferenceLibrarySnapshot | null,
    referencePdfs: readonly ProjectReferencePdf[] = this.referencePdfs,
  ): ResearchContextAuthorization {
    return {
      publicationIds: new Set(snapshot?.publications.map(({ id }) => id) ?? []),
      pdfIds: new Set(snapshot?.pdfs.map(({ id }) => id) ?? []),
      libraryPdfIds: new Set([...(library?.artifacts.map(({ id }) => id) ?? []), ...referencePdfs.map(({ id }) => id)]),
      candidateIds: new Set(snapshot?.candidates.map(({ id }) => id) ?? []),
    };
  }

  private presentLibraryPdfPage(library: ReferenceLibrarySnapshot | null, page: number): void {
    const toolbar = this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar);
    if (!toolbar) return;
    const drawings =
      this.element("paper-markups", LibraryPdfMarkupLayer)?.setLibraryPage(
        this.currentLibraryPdf,
        library?.pdfMarkups ?? [],
        page,
        toolbar.drawingStyle,
      ) ?? [];
    toolbar.setUndoDrawings(drawings);
  }

  presentPdfPage(state: ResearchContextState, page: number): PdfPagePresentation {
    this.presentLibraryPdfPage(this.currentLibrary, page);
    const activeTab = this.currentActiveTab;
    const activePdf = activeTab?.kind === "pdf" || activeTab?.kind === "library-pdf";
    return {
      activePdf,
      context: activePdf ? setPdfResearchLocation(state, activeTab.key, { page }) : state,
      libraryPdfId: this.currentLibraryPdf?.id,
    };
  }

  setLibraryPdfInspector(open: boolean, showAnnotations = false): void {
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    if (showAnnotations) inspector?.setInspectorOpen(open, true);
    else inspector?.setInspectorOpen(open);
    this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar)?.setInspectorOpen(open);
  }

  beginLibraryHighlight(artifactId: string, capture: PdfSelectionCapture): void {
    this.element("library-pdf-inspector", LibraryPdfInspector)?.beginHighlight(artifactId, {
      comment: "",
      highlightId: null,
      page: capture.page,
      quote: capture.quote,
      rects: capture.rects,
    });
    this.setLibraryPdfInspector(true);
  }

  beginLibraryPdfNote(draft: LibraryPdfNoteDraft & { readonly artifactId: string; readonly referenceId: string }): void {
    this.element("library-pdf-inspector", LibraryPdfInspector)?.beginNote(draft);
    this.setLibraryPdfInspector(true);
  }

  chooseLibraryPdfTool(tool: PdfAnnotationTool): LibraryPdfToolPresentation {
    const markups = this.element("paper-markups", LibraryPdfMarkupLayer);
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    markups?.chooseTool(tool);
    const status = this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar)?.setTool(tool);
    if (status) inspector?.setStatus(status);
    if (tool !== "note") this.clearLibraryPdfNoteDraft();
    if (tool !== "select") this.clearLibraryPdfMarkupSelection();
    const drafts = inspector?.draftState;
    if (drafts && !drafts.highlight && !drafts.markup && !drafts.note) this.setLibraryPdfInspector(false);
    return {
      privateHighlightId: markups?.selectedHighlightId ?? null,
      privateHighlightSelection: tool === "select",
      textSelectionEnabled: tool === "text",
    };
  }

  clearLibraryPdfNoteDraft(): void {
    this.element("paper-markups", LibraryPdfMarkupLayer)?.clearNote();
    this.element("library-pdf-inspector", LibraryPdfInspector)?.clearNote();
  }

  clearLibraryPdfMarkupSelection(): boolean {
    const markups = this.element("paper-markups", LibraryPdfMarkupLayer);
    markups?.clearSelection();
    this.element("library-pdf-inspector", LibraryPdfInspector)?.clearMarkup();
    return markups?.tool === "select";
  }

  closeLibraryPdfInspector(page: number): LibraryPdfInspectorClosePresentation {
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    const drafts = inspector?.draftState;
    if (drafts?.highlight) inspector?.clearHighlight(page, "Selection cancelled. Nothing was saved.");
    if (drafts?.note) this.clearLibraryPdfNoteDraft();
    const privateHighlightSelection = drafts?.markup ? this.clearLibraryPdfMarkupSelection() : null;
    this.setLibraryPdfInspector(false);
    this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar)?.focusInspectorButton();
    return { clearDraftSelection: drafts?.highlight ?? false, privateHighlightSelection };
  }

  editLibraryHighlight(highlight: LibraryHighlight): LibraryPdfSelectionPresentation {
    const markups = this.element("paper-markups", LibraryPdfMarkupLayer);
    if (markups?.selectedMarkupId) this.clearLibraryPdfMarkupSelection();
    const tool = markups?.tool === "select" ? {} : this.chooseLibraryPdfTool("select");
    markups?.selectHighlight(highlight.id);
    this.element("library-pdf-inspector", LibraryPdfInspector)?.editHighlight(highlight);
    this.setLibraryPdfInspector(true);
    return { ...tool, clearDraftSelection: false, privateHighlightId: highlight.id, privateHighlightSelection: true };
  }

  async citeLibraryHighlight(highlight: LibraryHighlight): Promise<void> {
    const coordinator = this.libraryPdfCoordinator;
    if (!coordinator) return;
    if (!coordinator.canInsertCitation()) {
      coordinator.showToast("Place the manuscript caret before citing a highlight.");
      return;
    }
    const reference = coordinator.library()?.references.find((item) => item.id === highlight.referenceId);
    if (!reference) {
      coordinator.showToast("The highlighted source is no longer available in the library.");
      return;
    }
    const project = coordinator.project();
    let projectReference = project?.projectReferences.find((item) => item.referenceId === reference.id);
    if (!projectReference) {
      const reservedAliases = project?.projectReferences.map((item) => item.citationAlias) ?? [];
      const preferredAlias = reservedAliases.some((alias) => alias.toLocaleLowerCase() === reference.referenceKey.toLocaleLowerCase())
        ? suggestCitationKey({ authors: [...reference.authors], year: reference.year }, reservedAliases)
        : reference.referenceKey;
      const snapshot = await mutateProjectReference(coordinator.projectApiBase, {
        action: "link",
        citationAlias: preferredAlias,
        referenceId: reference.id,
      });
      projectReference = snapshot.projectReferences.find((item) => item.referenceId === reference.id);
      await coordinator.acceptProjectMutation(snapshot);
    }
    if (!projectReference) throw new Error("Project reference was not created");
    coordinator.insertCitation(projectReference.citationAlias, `p. ${highlight.page}`);
  }

  editLibraryPdfNote(note: LibraryPdfNote): LibraryPdfSelectionPresentation {
    const markups = this.element("paper-markups", LibraryPdfMarkupLayer);
    const tool = markups?.tool === "select" ? {} : this.chooseLibraryPdfTool("select");
    markups?.editNote(note);
    this.element("library-pdf-inspector", LibraryPdfInspector)?.editNote(note);
    this.setLibraryPdfInspector(true);
    return { ...tool, clearDraftSelection: false };
  }

  selectLibraryPdfMarkup(markup: LibraryPdfMarkup, page: number): LibraryPdfSelectionPresentation {
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    const clearDraftSelection = inspector?.draftState.highlight ?? false;
    if (clearDraftSelection) inspector?.clearHighlight(page, "Selection cancelled. Nothing was saved.");
    this.element("paper-markups", LibraryPdfMarkupLayer)?.selectMarkup(markup.id);
    inspector?.selectMarkup(markup);
    this.setLibraryPdfInspector(true);
    return { clearDraftSelection, privateHighlightSelection: true };
  }

  private handleLibraryPdfAnnotationAction(action: LibraryPdfAnnotationAction): void {
    if (action.action === "highlight-saved") void this.completeLibraryHighlightSave(action.kind);
    else if (action.action === "cancel-highlight") this.clearLibraryHighlightDraft();
    else if (action.action === "note-saved") void this.completeLibraryPdfNoteSave(action.kind);
    else if (action.action === "cancel-note") this.clearLibraryPdfNoteDraft();
    else if (action.action === "markup-saved") void this.completeSelectedLibraryPdfMarkupMutation(action.kind);
    else if (action.action === "edit-note") this.editSelectedLibraryPdfNote();
    else this.clearBoundLibraryPdfMarkupSelection();
  }

  private handleLibraryPdfAnnotationListAction(action: LibraryPdfAnnotationListAction): void {
    const coordinator = this.libraryPdfCoordinator;
    if (!coordinator) return;
    if (action.action === "open-highlight") void this.openBoundLibraryHighlight(action.highlight);
    else if (action.action === "edit-highlight") this.applyViewerPresentation(this.editLibraryHighlight(action.highlight));
    else if (action.action === "cite-highlight") void this.citeLibraryHighlight(action.highlight);
    else if (action.action === "open-markup") void coordinator.openPdf(action.artifact, action.page);
    else if (action.action === "edit-note") this.applyViewerPresentation(this.editLibraryPdfNote(action.note));
    else coordinator.completeMarkup("Private annotation deleted.");
  }

  private async openBoundLibraryHighlight(highlight: LibraryHighlight): Promise<void> {
    const coordinator = this.libraryPdfCoordinator;
    const artifact = coordinator?.library()?.artifacts.find(({ id }) => id === highlight.artifactId);
    if (!coordinator || !artifact) return;
    await coordinator.openPdf(artifact, highlight.page);
    this.element("library-pdf-inspector", LibraryPdfInspector)?.setStatus(`Showing saved private highlight on page ${highlight.page}.`);
  }

  private handleLibraryPdfToolbarAction(action: LibraryPdfToolbarAction): void {
    const coordinator = this.libraryPdfCoordinator;
    if (!coordinator) return;
    if (action.action === "choose-tool") this.applyViewerPresentation(this.chooseLibraryPdfTool(action.tool));
    else if (action.action === "drawing-undone") coordinator.completeMarkup("Private annotation deleted.");
    else if (action.action === "export-status") coordinator.showToast(action.message);
    else this.setLibraryPdfInspector(true, true);
  }

  private handleLibraryPdfMarkupAction(action: LibraryPdfMarkupAction): void {
    const coordinator = this.libraryPdfCoordinator;
    if (!coordinator) return;
    if (action.action === "drawing-saved" || action.action === "note-moved") {
      coordinator.completeMarkup(action.action === "drawing-saved" ? "Drawing saved privately." : "Note moved.");
    } else if (action.action === "select-markup") this.selectBoundLibraryPdfMarkup(action.id);
    else if (action.action === "status") this.element("library-pdf-inspector", LibraryPdfInspector)?.setStatus(action.message);
    else this.beginLibraryPdfNote(action.draft);
  }

  private async completePdfHighlightImport(count: number): Promise<void> {
    const coordinator = this.libraryPdfCoordinator;
    if (!coordinator) return;
    await coordinator.refreshLibrary();
    coordinator.showToast(`${count} PDF ${count === 1 ? "highlight" : "highlights"} imported to your library.`);
  }

  private async completeLibraryHighlightSave(kind: "created" | "extended" | "updated"): Promise<void> {
    const coordinator = this.libraryPdfCoordinator;
    if (!coordinator) return;
    this.pdfViewer?.clearDraftSelection();
    await coordinator.refreshLibrary();
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    if (kind === "updated") {
      inspector?.setStatus("Private highlight note updated.");
      coordinator.showToast("Private highlight note updated.");
      return;
    }
    const extended = kind === "extended";
    inspector?.setStatus(
      extended
        ? "Existing private highlight extended. Select another passage to continue."
        : "Private highlight saved. Select another passage to continue.",
    );
    coordinator.showToast(extended ? "Existing private highlight extended." : "Private highlight saved to your library.");
  }

  private clearLibraryHighlightDraft(message = "Selection cancelled. Nothing was saved."): void {
    const viewer = this.pdfViewer;
    if (!viewer) return;
    this.element("library-pdf-inspector", LibraryPdfInspector)?.clearHighlight(viewer.currentPage, message);
    viewer.clearDraftSelection();
  }

  private closeBoundLibraryPdfInspector(): void {
    const viewer = this.pdfViewer;
    if (!viewer) return;
    const presentation = this.closeLibraryPdfInspector(viewer.currentPage);
    if (presentation.clearDraftSelection) viewer.clearDraftSelection();
    if (presentation.privateHighlightSelection !== null)
      this.applyViewerPresentation({
        clearDraftSelection: false,
        privateHighlightSelection: presentation.privateHighlightSelection,
      });
  }

  private async completeLibraryPdfNoteSave(kind: "created" | "updated"): Promise<void> {
    const coordinator = this.libraryPdfCoordinator;
    if (!coordinator) return;
    this.element("paper-markups", LibraryPdfMarkupLayer)?.clearNote();
    await coordinator.refreshLibrary();
    this.setLibraryPdfInspector(false);
    coordinator.showToast(kind === "updated" ? "Private note updated." : "Note attached privately.");
  }

  private selectBoundLibraryPdfMarkup(markupId: string): void {
    const coordinator = this.libraryPdfCoordinator;
    const viewer = this.pdfViewer;
    const markup = coordinator?.library()?.pdfMarkups?.find((item) => item.id === markupId);
    if (markup && viewer) this.applyViewerPresentation(this.selectLibraryPdfMarkup(markup, viewer.currentPage));
  }

  private clearBoundLibraryPdfMarkupSelection(): void {
    this.applyViewerPresentation({
      clearDraftSelection: false,
      privateHighlightSelection: this.clearLibraryPdfMarkupSelection(),
    });
  }

  private editSelectedLibraryPdfNote(): void {
    const selectedId = this.element("paper-markups", LibraryPdfMarkupLayer)?.selectedMarkupId;
    const note = this.libraryPdfCoordinator
      ?.library()
      ?.pdfMarkups?.find((item): item is LibraryPdfNote => item.kind === "note" && item.id === selectedId);
    if (note) this.applyViewerPresentation(this.editLibraryPdfNote(note));
  }

  private async completeSelectedLibraryPdfMarkupMutation(kind: "deleted" | "updated"): Promise<void> {
    const coordinator = this.libraryPdfCoordinator;
    if (!coordinator) return;
    if (kind === "deleted") this.clearBoundLibraryPdfMarkupSelection();
    await coordinator.refreshLibrary();
    coordinator.showToast(kind === "deleted" ? "Private annotation deleted." : "Line style updated.");
  }

  private applyViewerPresentation(presentation: LibraryPdfSelectionPresentation | LibraryPdfToolPresentation): void {
    const viewer = this.pdfViewer;
    if (!viewer) return;
    if ("clearDraftSelection" in presentation && presentation.clearDraftSelection) viewer.clearDraftSelection();
    if (presentation.textSelectionEnabled !== undefined) viewer.setTextSelectionEnabled(presentation.textSelectionEnabled);
    if (presentation.privateHighlightSelection !== undefined)
      viewer.setPrivateHighlightSelection(presentation.privateHighlightSelection, presentation.privateHighlightId);
  }

  resourceScrollTop(tab: ResearchContextTab): number {
    if (tab.kind === "publication") return this.element("publication-context-panel", PublicationContextPanel)?.scrollPosition ?? 0;
    if (tab.kind === "candidate") return this.element("candidate-review-panel", CandidateReviewPanel)?.scrollPosition ?? 0;
    return this.element("paper-reader", HTMLElement)?.scrollTop ?? 0;
  }

  present(sources: ContextResourceSources): ContextResourcePresentation {
    this.currentActiveTab = sources.activeTab;
    this.currentLibrary = sources.library;
    this.currentSnapshot = sources.snapshot;
    const activeLibraryArtifact = this.activeLibraryArtifact(sources);
    this.currentLibraryPdf = activeLibraryArtifact;
    this.syncPdfPanels(sources, activeLibraryArtifact);
    this.presentCandidate(sources);
    this.presentProjectPdf(sources);
    const privateHighlights = this.presentLibraryPdf(sources, activeLibraryArtifact);
    if (privateHighlights && this.pdfViewer) {
      this.pdfViewer.updatePrivateHighlights(privateHighlights);
      this.presentLibraryPdfPage(sources.library, this.pdfViewer.currentPage);
    }
    return { publicationPresented: this.presentPublication(sources) };
  }

  private syncPdfPanels(sources: ContextResourceSources, activeLibraryArtifact: LibraryPdfArtifact | undefined): void {
    const annotationForm = this.element("project-annotation-form", ProjectAnnotationForm);
    annotationForm?.setCitationContext(
      sources.activeTab?.kind === "pdf" ? sources.activeTab.id : null,
      sources.snapshot?.publicationPdfLinks ?? [],
    );
    annotationForm?.setVisible(!activeLibraryArtifact && !this.activeReferencePdf(sources, activeLibraryArtifact));
    this.element("library-pdf-inspector", LibraryPdfInspector)?.setVisible(Boolean(activeLibraryArtifact));
  }

  private presentPublication(sources: ContextResourceSources): boolean {
    const tab = sources.activeTab;
    if (tab?.kind !== "publication") return false;
    const panel = this.element("publication-context-panel", PublicationContextPanel);
    const presented =
      panel?.setPublication({
        libraryArtifacts: sources.library?.artifacts ?? [],
        publicationId: tab.id,
        referencePdfs: sources.referencePdfs,
        snapshot: sources.snapshot,
      }) ?? false;
    if (panel) panel.scrollPosition = tab.scrollTop;
    return presented;
  }

  private presentCandidate(sources: ContextResourceSources): void {
    const tab = sources.activeTab;
    if (tab?.kind !== "candidate") return;
    const panel = this.element("candidate-review-panel", CandidateReviewPanel);
    panel?.setCandidate({
      candidateId: tab.id,
      decision: sources.candidateDecision,
      snapshot: sources.snapshot,
      sourceRevision: sources.sourceRevision,
      stableDocument: sources.stableDocument,
    });
    if (panel) panel.scrollPosition = tab.scrollTop;
  }

  private presentProjectPdf(sources: ContextResourceSources): void {
    const tab = sources.activeTab;
    if (tab?.kind !== "pdf") return;
    this.element("project-annotation-form", ProjectAnnotationForm)?.setIntakePdf(
      tab.id,
      sources.snapshot?.publications ?? [],
      sources.snapshot?.publicationPdfLinks ?? [],
    );
  }

  private activeLibraryArtifact(sources: ContextResourceSources): LibraryPdfArtifact | undefined {
    const tab = sources.activeTab;
    return tab?.kind === "library-pdf" ? sources.library?.artifacts.find(({ id }) => id === tab.id) : undefined;
  }

  private presentLibraryPdf(
    sources: ContextResourceSources,
    artifact: LibraryPdfArtifact | undefined,
  ): readonly LibraryHighlight[] | undefined {
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    const toolbar = this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar);
    if (!artifact) {
      this.setLibraryPdfInspector(false);
      return undefined;
    }
    if (!sources.library || !inspector) return undefined;
    const { artifactChanged, highlights, markups } = inspector.setContext({
      artifact,
      library: sources.library,
      projectApiBase: sources.projectApiBase,
      projectReferences: sources.snapshot?.projectReferences ?? [],
      researchShares: sources.snapshot?.researchShares ?? [],
    });
    if (artifactChanged) {
      const markupsLayer = this.element("paper-markups", LibraryPdfMarkupLayer);
      markupsLayer?.cancelShapeRecognition();
      markupsLayer?.resetState();
      this.setLibraryPdfInspector(false);
    }
    toolbar?.setAnnotationAvailability(highlights.length + markups.length);
    toolbar?.setExportArtifact(artifact);
    return highlights;
  }

  private activeReferencePdf(sources: ContextResourceSources, activeLibraryArtifact: LibraryPdfArtifact | undefined): boolean {
    const tab = sources.activeTab;
    return tab?.kind === "library-pdf" && !activeLibraryArtifact && sources.referencePdfs.some(({ id }) => id === tab.id);
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html``;
  }

  protected element<T extends HTMLElement>(id: string, constructor: abstract new () => T): T | null {
    const element = this.ownerDocument.getElementById(id);
    return element instanceof constructor ? element : null;
  }
}

function noticeExcerpt(value: string): string {
  const compact = value.replaceAll(/\s+/gu, " ").trim();
  return compact.length <= 240 ? compact : `${compact.slice(0, 239).trimEnd()}…`;
}

if (typeof customElements !== "undefined" && !customElements.get("context-resource-presenter")) {
  customElements.define("context-resource-presenter", ContextResourcePresenter);
}

declare global {
  interface HTMLElementTagNameMap {
    "context-resource-presenter": ContextResourcePresenter;
  }
}
