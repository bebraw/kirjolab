import { html, LitElement, type TemplateResult } from "lit";
import type * as Y from "yjs";
import { activePdfLoadContext } from "./active-pdf-context";
import { resolveManuscriptAnchor } from "../domain/manuscript-anchor";
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
import type { AnnotationResource, ManuscriptAnchorSelector, WorkspaceSnapshot } from "../domain/workspace";
import { AssistantWorkflowStatus } from "./assistant-workflow-status";
import type { AssistantResourceRoutes } from "./assistant-generation-presenter";
import { CandidateListPanel } from "./candidate-list-panel";
import { CandidateReviewPanel } from "./candidate-review-panel";
import { citationPageFromLocator, type CitationContext } from "./citations";
import { ClaimListPanel } from "./claim-list-panel";
import { ContextTabStrip } from "./context-tab-strip";
import { expectOk } from "./http";
import { LibraryPdfAnnotationToolbar } from "./library-pdf-annotation-toolbar";
import { LibraryPdfInspector } from "./library-pdf-inspector";
import { LibraryPdfMarkupLayer, type LibraryPdfNoteDraft, type PdfAnnotationTool } from "./library-pdf-markup-layer";
import { ManuscriptCommentList, type ManuscriptCommentAuthoring } from "./manuscript-comment-list";
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
import { ProjectMapWorkspace } from "./project-map-workspace";
import { mutateProjectReference } from "./project-reference-mutation";
import { PublicationContextPanel, type PublicationPaperOption } from "./publication-context-panel";
import { PublicationListPanel } from "./publication-list-panel";
import {
  activateResearchTab,
  closeResearchTab,
  createResearchContext,
  openResearchResource,
  reconcileResearchContext,
  researchResourceKey,
  setPdfResearchLocation,
  RESEARCH_ASSISTANT_KEY,
  RESEARCH_LIBRARY_KEY,
  RESEARCH_PREVIEW_KEY,
  setResearchTabScroll,
  type PdfResearchLocation,
  type ResearchContextAuthorization,
  type ResearchContextKey,
  type ResearchContextState,
  type ResearchContextTab,
  type ResearchResourceKey,
  type ResearchResourceTab,
  type ResearchResourceTarget,
} from "./research-context";
import { WorkspaceRailTabs } from "./workspace-rail-tabs";
import { researchTargetFromContextKey } from "./workspace-ui-route";

export interface ContextResourceSources {
  readonly activeTab: ResearchResourceTab | undefined;
  readonly library: ReferenceLibrarySnapshot | null;
  readonly projectApiBase: string | null;
  readonly referencePdfs: readonly ProjectReferencePdf[];
  readonly snapshot: WorkspaceSnapshot | null;
}

export interface ContextResourcePresentation {
  readonly publicationPresented: boolean;
}

export interface ResearchContextPresentation extends ContextResourcePresentation {
  readonly activeTab: ResearchResourceTab | undefined;
}

export type ResearchContextSources = Omit<ContextResourceSources, "activeTab" | "referencePdfs"> & { readonly standaloneLibrary: boolean };

export interface AssistantCandidatePresenter {
  presentCandidate(candidateId: string, snapshot: WorkspaceSnapshot, scrollPosition: number): void;
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

export interface LibraryPdfOwners {
  readonly editorStatus: { readonly caret: number | null };
  readonly referenceLibraryWorkspace: {
    applyProjectMutation(snapshot: WorkspaceSnapshot): Promise<void>;
    completeRefresh(message: string, failureMessage: string): Promise<void>;
  };
}

export interface ContextRouteOwners {
  readonly editorStatus: { selectedPassage(): ManuscriptCommentAuthoring["passage"] };
  readonly projectFileDialog: { revealRange(fileId: string, start: number, end: number): void };
  readonly projectHistoryTrigger: { readonly value: number };
  readonly referenceLibraryWorkspace: { refreshBoundProject(): Promise<void> };
  readonly sourceCitationControl: { insertCitation(citationAlias: string, locator?: string): void };
  readonly toast: { show(message: string): void };
}

interface ContextRouteBinding {
  readonly collaboration: { readonly stable: boolean };
  readonly document: Y.Doc;
  readonly owners: ContextRouteOwners;
  readonly resources: { request(): Promise<void> };
}

export interface ContextPresentationOwners {
  readonly assistantGenerationPresenter: AssistantCandidatePresenter & { readonly refreshAvailability: () => void };
  readonly editorStatus: { readonly caret: number | null };
  readonly referenceLibraryWorkspace: {
    readonly snapshot: ReferenceLibrarySnapshot | null;
    readonly open: (updateHistory?: boolean) => Promise<void>;
    readonly pushPdfRoute: (artifactId: string, page: number) => void;
    readonly replacePdfRoute: (artifactId: string | undefined, page: number) => void;
    readonly replaceLibraryRoute: () => void;
  };
  readonly projectFileDialog: { readonly project: WorkspaceSnapshot | null };
  readonly workspaceSurfaceSwitcher: {
    readonly navigate: (surface: "context", notify: false) => void;
    readonly syncRoute: (mode: "push" | "replace") => void;
  };
}

interface ContextPresentationBinding {
  readonly layout: { readonly restorePaneWidth: () => void };
  readonly owners: ContextPresentationOwners;
  readonly projectApiBase: string | null;
}

export interface ContextViewerState {
  readonly focusedAnnotationId: string | null;
  readonly page: number;
  readonly renderedContextKey: ResearchContextTab["key"] | undefined;
}

type ContextPdfViewer = Pick<
  PdfEvidenceViewer,
  "clearDraftSelection" | "setPrivateHighlightSelection" | "setTextSelectionEnabled" | "setTool"
> &
  Pick<PdfEvidenceViewer, "currentPage" | "focusedAnnotationId" | "open" | "showError" | "updateAnnotations" | "updatePrivateHighlights">;

export interface ProjectMapOwners {
  readonly projectFileDialog: { revealAuthoring(): void };
  readonly workspaceSharingPanel: { open(): void };
  readonly workspacePreview: { scrollToAnchor(id: string): void };
  readonly workspaceSwitcher: { focusSelect(): void };
}
export interface PublicationLibrary {
  openAvailableReference(referenceId: string): Promise<void>;
}

export class ContextResourcePresenter extends LitElement {
  private contextState = createResearchContext();
  private contextPresentation: ContextPresentationBinding | null = null;
  private candidatePresenter: AssistantCandidatePresenter | null = null;
  private currentActiveTab: ResearchResourceTab | undefined;
  private currentLibraryPdf: LibraryPdfArtifact | undefined;
  private currentLibrary: ReferenceLibrarySnapshot | null = null;
  private currentSnapshot: WorkspaceSnapshot | null = null;
  private libraryPdfProject: { readonly apiBase: string; readonly owners: LibraryPdfOwners } | null = null;
  private pdfApiBase = "";
  private pdfViewer: ContextPdfViewer | null = null;
  private renderedPdfContextKey: ResearchContextTab["key"] | undefined;
  private currentRenderedPdfId: string | undefined;
  private routeBinding: ContextRouteBinding | null = null;
  private loadedReferencePdfs: readonly ProjectReferencePdf[] = [];

  get referencePdfs(): readonly ProjectReferencePdf[] {
    return this.loadedReferencePdfs;
  }

  get activeTab(): ResearchResourceTab | undefined {
    return this.currentActiveTab;
  }

  get activeContextTab(): ResearchContextTab | undefined {
    return this.contextState.tabs.find(({ key }) => key === this.contextState.activeKey);
  }

  get activeKey(): ResearchContextKey {
    return this.contextState.activeKey;
  }

  bindContext(projectApiBase: string | null, layout: ContextPresentationBinding["layout"], owners: ContextPresentationOwners): void {
    this.contextPresentation = { layout, owners, projectApiBase };
    this.candidatePresenter = owners.assistantGenerationPresenter;
    this.element("context-tab-strip", ContextTabStrip)?.bindNavigation({
      activate: (key) => this.navigateContext(key),
      close: (key) => this.closeBoundContext(key),
      openLibrary: () => void owners.referenceLibraryWorkspace.open(),
    });
  }

  navigateContext(key: ResearchContextKey): void {
    this.activateContext(key);
    this.presentTransition(key);
  }

  navigateResource(target: ResearchResourceTarget): void {
    this.presentTransition(this.openResourceContext(target));
  }

  presentBoundContext(loadPdf = true): void {
    const binding = this.contextPresentation;
    if (!binding) return;
    const presentation = this.presentContext(this.boundSources(binding));
    binding.layout.restorePaneWidth();
    if (presentation.publicationPresented) this.setCitationAvailable(binding.owners.editorStatus.caret !== null);
    if (loadPdf && (presentation.activeTab?.kind === "pdf" || presentation.activeTab?.kind === "library-pdf")) {
      void this.loadActivePdf(false);
    }
  }

  activateContext(key: ResearchContextKey): void {
    this.captureBoundContext();
    this.contextState = activateResearchTab(this.contextState, key);
  }

  closeContext(key: ResearchContextKey): void {
    this.captureBoundContext();
    this.contextState = closeResearchTab(this.contextState, key);
  }

  openResourceContext(target: ResearchResourceTarget): ResearchResourceKey {
    this.captureBoundContext();
    this.contextState = openResearchResource(this.contextState, target);
    return researchResourceKey(target);
  }

  preparePdfContext(
    target: { readonly kind: "pdf" | "library-pdf"; readonly id: string },
    location: PdfResearchLocation,
  ): ResearchResourceKey {
    this.captureBoundContext();
    const key = researchResourceKey(target);
    this.contextState = setPdfResearchLocation(openResearchResource(this.contextState, target), key, location);
    this.presentTransition(key, false, false);
    return key;
  }

  reconcileContext(authorization: ResearchContextAuthorization): void {
    this.captureBoundContext();
    this.contextState = reconcileResearchContext(this.contextState, authorization);
  }

  private closeBoundContext(key: ResearchContextKey): void {
    const binding = this.contextPresentation;
    if (!binding) return;
    const returnToStandaloneLibrary = binding.projectApiBase === null && this.activeKey === key;
    this.closeContext(key);
    if (returnToStandaloneLibrary) {
      this.contextState = activateResearchTab(this.contextState, RESEARCH_LIBRARY_KEY);
      binding.owners.referenceLibraryWorkspace.replaceLibraryRoute();
    }
    this.presentBoundContext();
    this.element("context-tab-strip", ContextTabStrip)?.focusTab(this.activeKey);
    binding.owners.workspaceSurfaceSwitcher.syncRoute("replace");
  }

  private presentTransition(key: ResearchContextKey, loadPdf = true, syncRoute = true): void {
    const binding = this.contextPresentation;
    if (!binding) return;
    this.presentBoundContext(loadPdf);
    binding.owners.workspaceSurfaceSwitcher.navigate("context", false);
    this.element("context-tab-strip", ContextTabStrip)?.focusTab(key);
    if (syncRoute) binding.owners.workspaceSurfaceSwitcher.syncRoute("push");
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

  async refreshBoundReferencePdfs(render = true): Promise<void> {
    const binding = this.contextPresentation;
    if (!binding) return;
    await this.refreshReferencePdfs(binding.projectApiBase);
    if (render) this.presentBoundWorkspace();
  }

  async refreshLibraryContext(snapshot: WorkspaceSnapshot | null, library: ReferenceLibrarySnapshot): Promise<void> {
    await this.refreshBoundReferencePdfs(false);
    this.reconcileContext(this.resourceAuthorization(snapshot, library));
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

  bindRoutes(
    document: Y.Doc,
    collaboration: ContextRouteBinding["collaboration"],
    resources: ContextRouteBinding["resources"],
    owners: ContextRouteOwners,
  ): void {
    this.routeBinding = { collaboration, document, owners, resources };
  }

  private authoring(): ManuscriptCommentAuthoring {
    const binding = this.routeBinding;
    return {
      passage: binding?.owners.editorStatus.selectedPassage() ?? null,
      sourceRevision: binding?.owners.projectHistoryTrigger.value ?? 0,
      stable: binding?.collaboration.stable ?? false,
    };
  }

  private presentNotice(message: string): void {
    this.routeBinding?.owners.toast.show(message);
  }

  private refreshLibrary(): Promise<void> {
    return this.routeBinding?.owners.referenceLibraryWorkspace.refreshBoundProject() ?? Promise.resolve();
  }

  private refreshResources(): Promise<void> {
    return this.routeBinding?.resources.request() ?? Promise.resolve();
  }

  private boundSources(binding: ContextPresentationBinding): ResearchContextSources {
    return {
      library: binding.owners.referenceLibraryWorkspace.snapshot,
      projectApiBase: binding.projectApiBase,
      snapshot: binding.owners.projectFileDialog.project,
      standaloneLibrary: binding.projectApiBase === null,
    };
  }

  private boundProject(): WorkspaceSnapshot | null {
    return this.contextPresentation ? this.contextPresentation.owners.projectFileDialog.project : this.currentSnapshot;
  }

  private boundLibrary(): ReferenceLibrarySnapshot | null {
    return this.contextPresentation ? this.contextPresentation.owners.referenceLibraryWorkspace.snapshot : this.currentLibrary;
  }

  openPassage(anchor: ManuscriptAnchorSelector): void {
    const binding = this.routeBinding;
    if (!binding) return;
    const resolution = resolveManuscriptAnchor(binding.document, anchor);
    if (resolution.status !== "resolved") {
      this.presentNotice("This manuscript anchor is stale and needs to be linked again.");
      return;
    }
    binding.owners.projectFileDialog.revealRange(anchor.fileId, resolution.start, resolution.end);
    this.presentNotice(
      resolution.exactMatch ? "Linked manuscript passage selected." : "Changed linked passage selected; review its current text.",
    );
  }

  async completeProjectMutation(message?: string, failureMessage?: string): Promise<void> {
    if (!this.routeBinding) return;
    try {
      await this.refreshResources();
      if (message) this.presentNotice(message);
    } catch (error) {
      if (!failureMessage) throw error;
      this.presentNotice(failureMessage);
    }
  }

  assistantResources(): AssistantResourceRoutes {
    return {
      focusAssistant: () => this.element("context-tab-strip", ContextTabStrip)?.focusTab(RESEARCH_ASSISTANT_KEY),
      openCandidate: (candidate) => this.navigateResource({ kind: "candidate", id: candidate.id }),
      openPaper: (pdf, evidence) => void this.openProjectPdf(pdf, evidence.page, evidence.id),
      project: () => this.boundProject(),
      refreshLibrary: async () => await this.refreshLibrary(),
      reportNoEvidence: () => this.presentNotice("No project evidence is available yet."),
    };
  }

  async restoreTarget(target: ResearchResourceTarget, page?: number, annotationId?: string): Promise<void> {
    if (!this.routeBinding) return;
    const project = this.boundProject();
    if (target.kind === "publication") {
      const publication = project?.publications.find(({ id }) => id === target.id);
      if (publication) this.navigateResource(target);
      return;
    }
    if (target.kind === "pdf") {
      const pdf = project?.pdfs.find(({ id }) => id === target.id);
      if (pdf) await this.openProjectPdf(pdf, page, annotationId);
      return;
    }
    if (target.kind === "candidate") {
      const candidate = project?.candidates.find(({ id }) => id === target.id);
      if (candidate) this.navigateResource(target);
      return;
    }
    if (!this.boundLibrary()) await this.refreshLibrary();
    const artifact = this.boundLibrary()?.artifacts.find(({ id }) => id === target.id);
    if (artifact) return await this.openLibraryPdf(artifact, page, false);
    const referencePdf = this.referencePdfs.find(({ id }) => id === target.id);
    if (referencePdf) await this.openReferencePdf(referencePdf, page, false);
  }

  async restoreContext(key: ResearchContextKey, page?: number, annotationId?: string): Promise<void> {
    this.activateContext(RESEARCH_PREVIEW_KEY);
    try {
      const target = researchTargetFromContextKey(key);
      if (target) return await this.restoreTarget(target, page, annotationId);
      if (key === RESEARCH_LIBRARY_KEY) return await this.contextPresentation?.owners.referenceLibraryWorkspace.open(false);
      this.navigateContext(key);
    } catch (error) {
      this.activateContext(RESEARCH_PREVIEW_KEY);
      this.presentBoundContext();
      this.presentNotice(error instanceof Error ? error.message : "Could not restore that context");
    }
  }

  async ensurePdfResource(): Promise<void> {
    const active = this.activeContextTab;
    if (active?.kind === "pdf" || active?.kind === "library-pdf") return;
    const sources = this.contextPresentation ? this.boundSources(this.contextPresentation) : null;
    if (!sources || !this.routeBinding) return;
    const pdf = sources.snapshot?.pdfs[0];
    if (pdf) return await this.openProjectPdf(pdf);
    const artifact = sources.library?.artifacts[0];
    if (artifact) return await this.openLibraryPdf(artifact);
    this.presentNotice("Add or open a PDF before using PDF-only view.");
  }

  async openProjectPdf(pdf: WorkspaceSnapshot["pdfs"][number], page?: number, annotationId?: string): Promise<void> {
    this.preparePdfContext(
      { kind: "pdf", id: pdf.id },
      {
        ...(page !== undefined ? { page } : {}),
        ...(annotationId !== undefined ? { focusedAnnotationId: annotationId } : {}),
      },
    );
    this.contextPresentation?.owners.workspaceSurfaceSwitcher.syncRoute("push");
    await this.loadActivePdf(page !== undefined || annotationId !== undefined);
  }

  async openLibraryPdf(artifact: LibraryPdfArtifact, page?: number, updateHistory = true): Promise<void> {
    this.preparePdfContext({ kind: "library-pdf", id: artifact.id }, page === undefined ? {} : { page });
    const binding = this.contextPresentation;
    if (binding?.projectApiBase === null) {
      if (updateHistory) {
        const active = this.activeContextTab;
        binding.owners.referenceLibraryWorkspace.pushPdfRoute(artifact.id, page ?? (active?.kind === "library-pdf" ? active.page : 1));
      }
    } else binding?.owners.workspaceSurfaceSwitcher.syncRoute("push");
    await this.loadActivePdf(page !== undefined);
  }

  async openReferencePdf(pdf: ProjectReferencePdf, page?: number, updateHistory = true): Promise<void> {
    this.preparePdfContext({ kind: "library-pdf", id: pdf.id }, page === undefined ? {} : { page });
    const binding = this.contextPresentation;
    if (binding?.projectApiBase !== null && updateHistory) binding?.owners.workspaceSurfaceSwitcher.syncRoute("push");
    await this.loadActivePdf(page !== undefined);
  }

  openProjectAnnotation(annotationId: string, edit = false): void {
    const project = this.boundProject();
    const annotation = project?.annotations.find(({ id }) => id === annotationId);
    const pdf = annotation ? project?.pdfs.find(({ id }) => id === annotation.pdfId) : undefined;
    if (!this.routeBinding || !annotation || !pdf) return;
    if (edit) this.element("project-annotation-form", ProjectAnnotationForm)?.showAnnotation(annotation);
    void this.openProjectPdf(pdf, annotation.page, annotation.id);
  }

  async openPublicationPaper(paper: PublicationPaperOption): Promise<void> {
    if (!this.routeBinding) return;
    if (paper.kind === "project") return await this.openProjectPdf(paper.pdf);
    if (paper.kind === "library") return await this.openLibraryPdf(paper.artifact);
    await this.openReferencePdf(paper.pdf);
  }

  openProjectNote(id: string): void {
    const share = this.boundProject()?.researchShares.find(
      (item) => item.resourceId === id && item.revokedAt === null && item.content.kind === "note",
    );
    if (this.routeBinding && share?.content.kind === "note") this.presentNotice(noticeExcerpt(share.content.body));
  }

  insertActiveCitation(includePdfPage = false): void {
    const binding = this.routeBinding;
    const project = this.boundProject();
    const tab = this.currentActiveTab;
    if (!binding || !project || !tab) return;
    if (tab.kind === "publication") {
      const publication = project.publications.find(({ id }) => id === tab.id);
      if (publication) binding.owners.sourceCitationControl.insertCitation(publication.citationKey);
      return;
    }
    if (!includePdfPage || tab.kind !== "pdf") return;
    const links = project.publicationPdfLinks.filter(({ pdfId }) => pdfId === tab.id);
    const publication = links.length === 1 ? project.publications.find(({ id }) => id === links[0]?.publicationId) : undefined;
    if (publication) binding.owners.sourceCitationControl.insertCitation(publication.citationKey, `p. ${tab.page}`);
  }

  setCitationAvailable(available: boolean): void {
    this.element("publication-context-panel", PublicationContextPanel)?.setCitationAvailable(
      this.currentActiveTab?.kind === "publication" && available,
    );
  }

  openCitation(citation: CitationContext): void {
    if (citation.keys.length > 1) {
      this.presentNotice("Open this grouped citation from Preview to choose a reference.");
      return;
    }
    const citationKey = citation.keys[0] ?? "";
    const project = this.boundProject();
    const publication = project?.publications.find((item) => item.citationKey.toLocaleLowerCase() === citationKey.toLocaleLowerCase());
    if (!project || !publication) {
      this.presentNotice(`No publication resource is available for ${citationKey || "this citation"}.`);
      return;
    }
    const links = project.publicationPdfLinks.filter(({ publicationId }) => publicationId === publication.id);
    const pdf = links.length === 1 ? project.pdfs.find(({ id }) => id === links[0]?.pdfId) : undefined;
    const page = citationPageFromLocator(citation.locator);
    if (page && pdf) void this.openProjectPdf(pdf, page);
    else this.navigateResource({ kind: "publication", id: publication.id });
  }

  bindLibraryPdf(apiBase: string, owners: LibraryPdfOwners): void {
    this.libraryPdfProject = { apiBase, owners };
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
    this.element("project-annotation-form", ProjectAnnotationForm)?.configure(apiBase);
  }

  bindProjectAnnotations(): void {
    this.element("project-annotation-form", ProjectAnnotationForm)?.bindIntake({
      openPublication: (publication) => this.navigateResource({ kind: "publication", id: publication.id }),
      presentNotice: (message) => this.presentNotice(message),
      publications: () => this.boundProject()?.publications ?? [],
      refresh: () => this.refreshResources(),
    });
    this.element("project-annotation-form", ProjectAnnotationForm)?.bindWorkflow({
      chooseTool: (tool) => this.pdfViewer?.setTool(tool),
      completeWorkflow: async ({ clearDraftSelection, ...completion }) => {
        if (clearDraftSelection) this.pdfViewer?.clearDraftSelection();
        if (completion.refreshResources) await this.refreshResources();
        if (completion.linkAnnotationId) await this.linkSelectedPassage("annotation", completion.linkAnnotationId);
        if (completion.notice) this.presentNotice(completion.notice);
      },
      citePage: () => this.insertActiveCitation(true),
      removeHighlight: async (annotationId, fragmentId) =>
        (await this.element("project-evidence-panel", ProjectEvidencePanel)?.removeFragment(annotationId, fragmentId)) ?? false,
      revealHighlight: (annotationId) => this.element("project-evidence-panel", ProjectEvidencePanel)?.revealAnnotation(annotationId),
    });
  }

  bindProjectKnowledge(apiBase: string): void {
    const claims = this.element("claim-list-panel", ClaimListPanel);
    claims?.configure(apiBase);
    claims?.bind({
      completeMutation: (message) =>
        void this.completeProjectMutation(message, "The claim changed, but project resources could not be refreshed."),
      linkPassage: (claimId) => void this.linkSelectedPassage("claim", claimId),
      openAnnotation: (annotationId) => this.element("project-evidence-panel", ProjectEvidencePanel)?.revealAnnotation(annotationId),
      openPassage: (anchor) => this.openPassage(anchor),
    });
    const comments = this.element("manuscript-comment-list-panel", ManuscriptCommentList);
    comments?.configure(apiBase);
    comments?.bind({
      authoring: () => this.authoring(),
      completeMutation: (message) =>
        void this.completeProjectMutation(message, "The comment changed, but project resources could not be refreshed."),
      notice: (message) => this.presentNotice(message),
      openPassage: (anchor) => this.openPassage(anchor),
    });
    const evidence = this.element("project-evidence-panel", ProjectEvidencePanel);
    evidence?.configure(apiBase);
    evidence?.bind({
      annotationRemoved: (annotationId, message) => {
        this.element("project-annotation-form", ProjectAnnotationForm)?.clearAnnotation(annotationId);
        void this.completeProjectMutation(message, "The highlight was deleted, but project resources could not be refreshed.");
      },
      completeMutation: (message) =>
        void this.completeProjectMutation(message, "The project changed, but project resources could not be refreshed."),
      editAnnotation: (annotation) => this.openProjectAnnotation(annotation.id, true),
      fragmentRemoved: async ({ annotationDeleted, annotationId, announce }) => {
        if (annotationDeleted) this.element("project-annotation-form", ProjectAnnotationForm)?.clearAnnotation(annotationId);
        await this.completeProjectMutation();
        if (announce) this.presentNotice("Highlight stroke erased.");
      },
      linkAnnotation: (annotationId) => void this.linkSelectedPassage("annotation", annotationId),
      notice: (message) => this.presentNotice(message),
      openPassage: (anchor) => this.openPassage(anchor),
      openPdf: (pdf, page, annotationId) => {
        this.element("project-annotation-form", ProjectAnnotationForm)?.selectPdf(pdf.id);
        void this.openProjectPdf(pdf, page, annotationId);
      },
    });
  }

  private async linkSelectedPassage(kind: "annotation" | "claim", id: string): Promise<void> {
    const authoring = this.authoring();
    const label = kind === "claim" ? "a claim" : "an annotation";
    if (!authoring.stable) {
      this.presentNotice(`Wait for the manuscript to finish synchronizing before linking ${label}.`);
      return;
    }
    if (!authoring.passage) {
      this.presentNotice(`Select manuscript text before linking ${label}.`);
      return;
    }
    const link = { ...authoring.passage, sourceRevision: authoring.sourceRevision };
    if (kind === "claim") await this.element("claim-list-panel", ClaimListPanel)?.linkPassage({ claimId: id, ...link });
    else await this.element("project-evidence-panel", ProjectEvidencePanel)?.linkPassage({ annotationId: id, ...link });
  }

  bindProjectMap(apiBase: string, owners: ProjectMapOwners): void {
    const map = this.element("project-map", ProjectMapWorkspace);
    map?.configure(apiBase);
    map?.bindNavigation({
      annotation: (id) => this.openProjectAnnotation(id),
      claim: (id) => this.element("claim-list-panel", ClaimListPanel)?.revealClaim(id),
      document: () => owners.projectFileDialog.revealAuthoring(),
      "model-candidate": (id) => void this.restoreTarget({ kind: "candidate", id }),
      note: (id) => this.openProjectNote(id),
      pdf: (id) => void this.restoreTarget({ kind: "pdf", id }),
      person: () => owners.workspaceSharingPanel.open(),
      publication: (id) => void this.restoreTarget({ kind: "publication", id }),
      project: () => owners.workspaceSwitcher.focusSelect(),
      section: (id) => {
        this.navigateContext(RESEARCH_PREVIEW_KEY);
        owners.workspacePreview.scrollToAnchor(id);
      },
    });
  }

  bindPublications(apiBase: string, library: PublicationLibrary): void {
    const publication = this.element("publication-context-panel", PublicationContextPanel);
    publication?.configure(apiBase);
    publication?.bind({
      insertCitation: () => this.insertActiveCitation(),
      openPaper: (paper) => void this.openPublicationPaper(paper),
      papersChanged: (message) =>
        void this.completeProjectMutation(message, "The paper links changed, but project resources could not be refreshed."),
    });
    const publications = this.element("publication-list-panel", PublicationListPanel);
    publications?.configure(apiBase);
    publications?.bind({
      enriched: (message) =>
        void this.completeProjectMutation(message, "The reference was enriched, but project resources could not be refreshed."),
      manage: (publicationId) => void library.openAvailableReference(publicationId),
      open: (publication) => this.navigateResource({ kind: "publication", id: publication.id }),
    });
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
    const { standaloneLibrary, ...contextSources } = sources;
    const resourceSources: ContextResourceSources = {
      ...contextSources,
      activeTab: undefined,
      referencePdfs: this.referencePdfs,
    };
    const context = this.contextState;
    this.element("context-tab-strip", ContextTabStrip)?.setTabs({
      activeKey: context.activeKey,
      candidates: sources.snapshot?.candidates ?? [],
      libraryArtifacts: sources.library?.artifacts ?? [],
      pdfs: sources.snapshot?.pdfs ?? [],
      publications: sources.snapshot?.publications ?? [],
      referencePdfs: this.referencePdfs,
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

  captureBoundContext(): void {
    const viewer = this.pdfViewer;
    if (!viewer) return;
    this.contextState = this.captureContext(this.contextState, {
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
    const highlight = this.boundLibrary()?.highlights.find((item) => item.id === highlightId);
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
    this.presentComments(snapshot.comments);
    this.element("candidate-list-panel", CandidateListPanel)?.setCandidates(snapshot.candidates);
    const annotations = renderedPdfId ? snapshot.annotations.filter(({ pdfId }) => pdfId === renderedPdfId) : [];
    this.pdfViewer?.updateAnnotations(annotations);
    return annotations;
  }

  presentBoundWorkspace(): void {
    const binding = this.contextPresentation;
    const sources = binding ? this.boundSources(binding) : null;
    if (!binding || !sources?.snapshot) return;
    this.reconcileContext(this.resourceAuthorization(sources.snapshot, sources.library));
    this.presentWorkspace(sources.snapshot);
    this.presentBoundContext();
    binding.owners.assistantGenerationPresenter.refreshAvailability();
    binding.owners.workspaceSurfaceSwitcher.syncRoute("replace");
  }

  presentResolvedWorkspace(snapshot: WorkspaceSnapshot, bibliography: string, source?: string): void {
    this.element("project-evidence-panel", ProjectEvidencePanel)?.setPassageLinks(snapshot.links);
    this.element("claim-list-panel", ClaimListPanel)?.setPassageLinks(snapshot.claimLinks);
    this.presentComments(snapshot.comments);
    this.element("project-map", ProjectMapWorkspace)?.presentWorkspace(snapshot, bibliography, source);
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

  private presentComments(comments: WorkspaceSnapshot["comments"]): void {
    const list = this.element("manuscript-comment-list-panel", ManuscriptCommentList);
    if (list) this.element("workspace-rail-tabs", WorkspaceRailTabs)?.setCommentCount(list.setComments(comments));
  }

  presentPdfPage(page: number): void {
    this.presentLibraryPdfPage(this.currentLibrary, page);
    const activeTab = this.currentActiveTab;
    const activePdf = activeTab?.kind === "pdf" || activeTab?.kind === "library-pdf";
    if (activePdf) {
      this.contextState = setPdfResearchLocation(this.contextState, activeTab.key, { page });
      this.contextPresentation?.owners.workspaceSurfaceSwitcher.syncRoute("replace");
    }
    this.contextPresentation?.owners.referenceLibraryWorkspace.replacePdfRoute(this.currentLibraryPdf?.id, page);
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
    const projectBinding = this.libraryPdfProject;
    const binding = this.routeBinding;
    if (!projectBinding || !binding) return;
    if (projectBinding.owners.editorStatus.caret === null) {
      this.presentNotice("Place the manuscript caret before citing a highlight.");
      return;
    }
    const reference = this.boundLibrary()?.references.find((item) => item.id === highlight.referenceId);
    if (!reference) {
      this.presentNotice("The highlighted source is no longer available in the library.");
      return;
    }
    const project = this.boundProject();
    let projectReference = project?.projectReferences.find((item) => item.referenceId === reference.id);
    if (!projectReference) {
      const reservedAliases = project?.projectReferences.map((item) => item.citationAlias) ?? [];
      const preferredAlias = reservedAliases.some((alias) => alias.toLocaleLowerCase() === reference.referenceKey.toLocaleLowerCase())
        ? suggestCitationKey({ authors: [...reference.authors], year: reference.year }, reservedAliases)
        : reference.referenceKey;
      const snapshot = await mutateProjectReference(projectBinding.apiBase, {
        action: "link",
        citationAlias: preferredAlias,
        referenceId: reference.id,
      });
      projectReference = snapshot.projectReferences.find((item) => item.referenceId === reference.id);
      await projectBinding.owners.referenceLibraryWorkspace.applyProjectMutation(snapshot);
    }
    if (!projectReference) throw new Error("Project reference was not created");
    binding.owners.sourceCitationControl.insertCitation(projectReference.citationAlias, `p. ${highlight.page}`);
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
    const projectBinding = this.libraryPdfProject;
    if (!projectBinding) return;
    if (action.action === "open-highlight") void this.openBoundLibraryHighlight(action.highlight);
    else if (action.action === "edit-highlight") this.applyViewerPresentation(this.editLibraryHighlight(action.highlight));
    else if (action.action === "cite-highlight") void this.citeLibraryHighlight(action.highlight);
    else if (action.action === "open-markup") void this.openLibraryPdf(action.artifact, action.page);
    else if (action.action === "edit-note") this.applyViewerPresentation(this.editLibraryPdfNote(action.note));
    else this.completeLibraryMarkup("Private annotation deleted.");
  }

  private async openBoundLibraryHighlight(highlight: LibraryHighlight): Promise<void> {
    const artifact = this.boundLibrary()?.artifacts.find(({ id }) => id === highlight.artifactId);
    if (!this.libraryPdfProject || !artifact) return;
    await this.openLibraryPdf(artifact, highlight.page);
    this.element("library-pdf-inspector", LibraryPdfInspector)?.setStatus(`Showing saved private highlight on page ${highlight.page}.`);
  }

  private handleLibraryPdfToolbarAction(action: LibraryPdfToolbarAction): void {
    if (!this.libraryPdfProject) return;
    if (action.action === "choose-tool") this.applyViewerPresentation(this.chooseLibraryPdfTool(action.tool));
    else if (action.action === "drawing-undone") this.completeLibraryMarkup("Private annotation deleted.");
    else if (action.action === "export-status") this.presentNotice(action.message);
    else this.setLibraryPdfInspector(true, true);
  }

  private handleLibraryPdfMarkupAction(action: LibraryPdfMarkupAction): void {
    if (!this.libraryPdfProject) return;
    if (action.action === "drawing-saved" || action.action === "note-moved") {
      this.completeLibraryMarkup(action.action === "drawing-saved" ? "Drawing saved privately." : "Note moved.");
    } else if (action.action === "select-markup") this.selectBoundLibraryPdfMarkup(action.id);
    else if (action.action === "status") this.element("library-pdf-inspector", LibraryPdfInspector)?.setStatus(action.message);
    else this.beginLibraryPdfNote(action.draft);
  }

  private completeLibraryMarkup(message: string): void {
    const library = this.libraryPdfProject?.owners.referenceLibraryWorkspace;
    if (library) void library.completeRefresh(message, "The annotation changed, but the refreshed Library could not be loaded.");
  }

  private async completePdfHighlightImport(count: number): Promise<void> {
    if (!this.routeBinding) return;
    await this.refreshLibrary();
    this.presentNotice(`${count} PDF ${count === 1 ? "highlight" : "highlights"} imported to your library.`);
  }

  private async completeLibraryHighlightSave(kind: "created" | "extended" | "updated"): Promise<void> {
    if (!this.routeBinding) return;
    this.pdfViewer?.clearDraftSelection();
    await this.refreshLibrary();
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    if (kind === "updated") {
      inspector?.setStatus("Private highlight note updated.");
      this.presentNotice("Private highlight note updated.");
      return;
    }
    const extended = kind === "extended";
    inspector?.setStatus(
      extended
        ? "Existing private highlight extended. Select another passage to continue."
        : "Private highlight saved. Select another passage to continue.",
    );
    this.presentNotice(extended ? "Existing private highlight extended." : "Private highlight saved to your library.");
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
    if (!this.routeBinding) return;
    this.element("paper-markups", LibraryPdfMarkupLayer)?.clearNote();
    await this.refreshLibrary();
    this.setLibraryPdfInspector(false);
    this.presentNotice(kind === "updated" ? "Private note updated." : "Note attached privately.");
  }

  private selectBoundLibraryPdfMarkup(markupId: string): void {
    const viewer = this.pdfViewer;
    const markup = this.boundLibrary()?.pdfMarkups?.find((item) => item.id === markupId);
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
    const note = this.boundLibrary()?.pdfMarkups?.find((item): item is LibraryPdfNote => item.kind === "note" && item.id === selectedId);
    if (note) this.applyViewerPresentation(this.editLibraryPdfNote(note));
  }

  private async completeSelectedLibraryPdfMarkupMutation(kind: "deleted" | "updated"): Promise<void> {
    if (!this.routeBinding) return;
    if (kind === "deleted") this.clearBoundLibraryPdfMarkupSelection();
    await this.refreshLibrary();
    this.presentNotice(kind === "deleted" ? "Private annotation deleted." : "Line style updated.");
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
    if (tab?.kind === "candidate" && sources.snapshot) this.candidatePresenter?.presentCandidate(tab.id, sources.snapshot, tab.scrollTop);
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
