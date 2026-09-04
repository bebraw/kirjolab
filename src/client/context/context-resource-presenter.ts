import type * as Y from "yjs";
import { resolveManuscriptAnchor } from "../../domain/manuscript/manuscript-anchor";
import { projectCompanionNotesPath, type ProjectFile } from "../../domain/project/project-files";
import type {
  BibliographicRecord,
  LibraryHighlight,
  LibraryPdfArtifact,
  LibraryPdfDrawing,
  LibraryPdfMarkup,
  LibraryPdfNote,
  ProjectReferencePdf,
  ReferenceLibrarySnapshot,
} from "../../domain/reference-library";
import { isProjectReferencePdfs } from "../../domain/reference-library";
import { suggestCitationKey } from "../../domain/publication/publication-intake";
import type {
  AnnotationResource,
  ManuscriptAnchorSelector,
  PublicationResource,
  WorkspaceSnapshot,
} from "../../domain/workspace/workspace";
import { AssistantWorkflowStatus } from "../assistant/assistant-workflow-status";
import type {
  AssistantApplicationOwners,
  AssistantGenerationPresenter,
  AssistantResourceRoutes,
} from "../assistant/assistant-generation-presenter";
import { CandidateListPanel } from "../assistant/candidate-list-panel";
import { CandidateReviewPanel } from "../assistant/candidate-review-panel";
import { citationPageFromLocator, type CitationContext } from "../citation/citations";
import { ClaimListPanel } from "../assistant/claim-list-panel";
import { ContextTabStrip } from "./context-tab-strip";
import { ChapterNotesPanel, chapterNotesPanelActionEvent, type ChapterNotesPanelAction } from "./chapter-notes-panel";
import type { EditorApplicationOwners, EditorStatus } from "../editor/editor-status";
import { expectOk } from "../platform/http";
import { LibraryPdfAnnotationToolbar } from "../library/library-pdf-annotation-toolbar";
import { LibraryPdfInspector } from "../library/library-pdf-inspector";
import { LightDomController } from "../platform/light-dom-controller";
import {
  LibraryPdfMarkupLayer,
  type LibraryPdfDrawingPreview,
  type LibraryPdfNoteDraft,
  type PdfAnnotationTool,
} from "../library/library-pdf-markup-layer";
import { ManuscriptCommentList, type ManuscriptCommentAuthoring } from "../project/manuscript-comment-list";
import { PdfEvidenceViewer, type PdfSelectionCapture, type PdfTextSelectionMode } from "../pdf/pdf-viewer";
import { PdfSearchPanel } from "../pdf/pdf-search-panel";
import "../pdf/pdf-search-panel";
import { PdfNavigationPanel } from "../pdf/pdf-navigation-panel";
import "../pdf/pdf-navigation-panel";
import { PdfReferenceDetailsPanel, pdfReferenceDetailsVisibilityEvent, type PdfReferenceDetails } from "../pdf/pdf-reference-details-panel";
import { libraryPdfAnnotationActionEvent, type LibraryPdfAnnotationAction } from "../library/library-pdf-annotation-forms";
import { libraryPdfAnnotationListActionEvent, type LibraryPdfAnnotationListAction } from "../library/library-pdf-annotation-list";
import { libraryPdfInspectorCloseEvent } from "../library/library-pdf-inspector";
import { libraryPdfMarkupActionEvent, type LibraryPdfMarkupAction } from "../library/library-pdf-markup-layer";
import { libraryPdfToolbarActionEvent, type LibraryPdfToolbarAction } from "../library/library-pdf-annotation-toolbar";
import { pdfHighlightImportOutcomeEvent, type PdfHighlightImportOutcome } from "../pdf/pdf-highlight-import-panel";
import { pdfReferenceMentionOpenEvent } from "../pdf/pdf-reference-analysis-panel";
import { ProjectAnnotationForm } from "../project/project-annotation-form";
import { ProjectEvidencePanel } from "../assistant/project-evidence-panel";
import { ProjectMapWorkspace } from "../project/project-map-workspace";
import { mutateProjectReference } from "../project/project-reference-mutation";
import { PublicationContextPanel, type PublicationPaperOption } from "../publication/publication-context-panel";
import { PublicationListPanel } from "../publication/publication-list-panel";
import {
  activateResearchTab,
  closeResearchTab,
  createResearchContext,
  openResearchResource,
  reconcileResearchContext,
  researchResourceKey,
  setPdfResearchLocation,
  RESEARCH_ASSISTANT_KEY,
  RESEARCH_CHAPTER_NOTES_KEY,
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
import { WorkspaceRailTabs } from "../workspace/workspace-rail-tabs";
import { researchTargetFromContextKey } from "../workspace/workspace-ui-route";
import { PdfContextSession, type ContextPdfViewer, type ContextViewerState } from "./pdf-context-session";

export type { ContextViewerState } from "./pdf-context-session";

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
  readonly textSelectionMode: PdfTextSelectionMode;
}

export interface LibraryPdfInspectorClosePresentation {
  readonly clearDraftSelection: boolean;
  readonly privateHighlightSelection: boolean | null;
}

export interface LibraryPdfSelectionPresentation {
  readonly clearDraftSelection: boolean;
  readonly privateHighlightId?: string | null;
  readonly privateHighlightSelection?: boolean;
  readonly textSelectionMode?: PdfTextSelectionMode;
}

type LibraryPdfMarkupRefreshRetirement =
  | { readonly kind: "deleted-drawing"; readonly drawingId: string }
  | { readonly kind: "saved-drawing"; readonly drawingId: string | null; readonly provisionalId: string };

interface FailedLibraryPdfDrawingSave {
  readonly failure: string;
  readonly preview: LibraryPdfDrawingPreview;
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
  readonly projectFileDialog: {
    readonly activeFileId: string | null;
    readonly project: WorkspaceSnapshot | null;
    projectFiles(): ProjectFile[];
  };
  readonly workspaceSurfaceSwitcher: {
    readonly navigate: (surface: "context", notify: false) => void;
    readonly syncRoute: (mode: "push" | "replace") => void;
  };
  readonly workspaceLayout: ContextPresentationBinding["layout"];
}

interface ContextPresentationBinding {
  readonly layout: { readonly restorePaneWidth: () => void };
  readonly owners: ContextPresentationOwners;
  readonly projectApiBase: string | null;
}

export interface ProjectKnowledgeOwners {
  readonly editorStatus: { readonly caret: number | null };
  readonly projectFileDialog: { revealAuthoring(): void; selectFile(fileId: string): boolean };
  readonly referenceLibraryWorkspace: {
    applyProjectMutation(snapshot: WorkspaceSnapshot): Promise<void>;
    completeRefresh(message: string, failureMessage: string): Promise<boolean>;
    openAvailableReference(referenceId: string): Promise<void>;
  };
  readonly workspaceSharingPanel: { open(): void };
  readonly workspacePreview: { scrollToAnchor(id: string): void };
  readonly workspaceSwitcher: { focusSelect(): void };
  readonly workspaceSurfaceSwitcher: { navigate(surface: "authoring", notify?: boolean): void };
}

export type ContextApplicationOwners = AssistantApplicationOwners &
  ContextPresentationOwners &
  ContextRouteOwners &
  EditorApplicationOwners &
  ProjectKnowledgeOwners & {
    readonly assistantGenerationPresenter: ContextPresentationOwners["assistantGenerationPresenter"] &
      Pick<AssistantGenerationPresenter, "bindApplication">;
    readonly editorStatus: Pick<EditorStatus, "bindApplication">;
  };

export class ContextResourcePresenter extends LightDomController {
  private contextState = createResearchContext();
  private chapterNotesAvailable = false;
  private chapterNotesFileId: string | null = null;
  private contextPresentation: ContextPresentationBinding | null = null;
  private candidatePresenter: AssistantCandidatePresenter | null = null;
  private currentActiveTab: ResearchResourceTab | undefined;
  private currentLibraryPdf: LibraryPdfArtifact | undefined;
  private currentLibrary: ReferenceLibrarySnapshot | null = null;
  private currentSnapshot: WorkspaceSnapshot | null = null;
  private libraryPdfProject: { readonly apiBase: string; readonly owners: ProjectKnowledgeOwners } | null = null;
  private readonly failedLibraryPdfDrawingSaves = new Map<string, FailedLibraryPdfDrawingSave>();
  private readonly pendingDeletedLibraryPdfDrawingIds = new Set<string>();
  private readonly pendingLibraryPdfDrawingSaves = new Map<string, LibraryPdfDrawingPreview>();
  private readonly provisionalLibraryPdfDrawings = new Map<string, LibraryPdfDrawingPreview>();
  private readonly unrefreshedLibraryPdfDrawings = new Map<string, LibraryPdfDrawing>();
  private readonly handleLibraryPdfMarkupEvent = (event: Event): void => {
    this.handleLibraryPdfMarkupAction((event as CustomEvent<LibraryPdfMarkupAction>).detail);
  };
  private readonly pdfSession = new PdfContextSession({
    activeKey: () => this.currentActiveTab?.key,
    navigationDocument: (key, page) => this.element("pdf-navigation-panel", PdfNavigationPanel)?.setDocument(key, page),
    reader: () => this.element("paper-reader", HTMLElement),
    selectWorkspacePdf: (pdfId) => this.element("project-annotation-form", ProjectAnnotationForm)?.selectPdf(pdfId),
  });
  private routeBinding: ContextRouteBinding | null = null;
  private loadedReferencePdfs: readonly ProjectReferencePdf[] = [];

  // Invoked through the structurally typed project-file application owners.
  // fallow-ignore-next-line unused-class-member
  bindApplication(
    apiBase: string,
    workspace: boolean,
    session: ContextRouteBinding["collaboration"] & { readonly document: Y.Doc },
    resources: ContextRouteBinding["resources"],
    collaborationSocket: { scheduleSelection(): void },
    owners: ContextApplicationOwners,
  ): void {
    owners.assistantGenerationPresenter.bindApplication(apiBase, session, resources, owners);
    owners.editorStatus.bindApplication(apiBase, session.document, owners, collaborationSocket);
    this.bindProjectKnowledge(apiBase, owners);
    this.bindContext(workspace ? apiBase : null, owners);
    this.bindRoutes(session.document, session, resources, owners);
  }

  get referencePdfs(): readonly ProjectReferencePdf[] {
    return this.loadedReferencePdfs;
  }

  get activeTab(): ResearchResourceTab | undefined {
    return this.currentActiveTab;
  }

  // Read through WorkspaceLayoutOwners when the resizable PDF pane is bound.
  // fallow-ignore-next-line unused-class-member
  get layoutPdfViewer(): Pick<ContextPdfViewer, "resize"> | null {
    return this.pdfSession.layoutViewer;
  }

  private get pdfViewer(): ContextPdfViewer | null {
    return this.pdfSession.viewer;
  }

  get activeContextTab(): ResearchContextTab | undefined {
    return this.contextState.tabs.find(({ key }) => key === this.contextState.activeKey);
  }

  get activeKey(): ResearchContextKey {
    return this.contextState.activeKey;
  }

  bindContext(projectApiBase: string | null, owners: ContextPresentationOwners): void {
    this.contextPresentation = { layout: owners.workspaceLayout, owners, projectApiBase };
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
      if (key === RESEARCH_CHAPTER_NOTES_KEY) {
        const owners = this.contextPresentation?.owners.projectFileDialog;
        if (owners) this.syncChapterNotes(owners.activeFileId, owners.projectFiles(), false);
        if (!this.chapterNotesAvailable) {
          this.presentBoundContext(false);
          this.presentNotice("This chapter has no paired notes to restore.");
          return;
        }
      }
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

  async openPublicationPaper(paper: PublicationPaperOption, page?: number): Promise<void> {
    if (!this.routeBinding) return;
    if (paper.kind === "project")
      return page === undefined ? await this.openProjectPdf(paper.pdf) : await this.openProjectPdf(paper.pdf, page);
    if (paper.kind === "library")
      return page === undefined ? await this.openLibraryPdf(paper.artifact) : await this.openLibraryPdf(paper.artifact, page);
    if (page === undefined) await this.openReferencePdf(paper.pdf);
    else await this.openReferencePdf(paper.pdf, page);
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
    const projectPapers = links.flatMap((link) => {
      const pdf = project.pdfs.find(({ id }) => id === link.pdfId);
      return pdf ? [{ kind: "project" as const, pdf, linkId: link.id }] : [];
    });
    const libraryPapers = (this.boundLibrary()?.artifacts ?? [])
      .filter(({ referenceId }) => referenceId === publication.id)
      .map((artifact) => ({ kind: "library" as const, artifact }));
    const localArtifactIds = new Set(libraryPapers.map(({ artifact }) => artifact.id));
    const referencePapers = this.referencePdfs
      .filter(({ id, referenceId }) => referenceId === publication.id && !localArtifactIds.has(id))
      .map((pdf) => ({ kind: "reference" as const, pdf }));
    const papers: readonly PublicationPaperOption[] = [...libraryPapers, ...referencePapers, ...projectPapers];
    const page = citationPageFromLocator(citation.locator);
    if (papers.length === 1) void this.openPublicationPaper(papers[0]!, page ?? undefined);
    else this.navigateResource({ kind: "publication", id: publication.id });
  }

  bindProjectKnowledge(
    apiBase: string,
    owners: ProjectKnowledgeOwners,
    viewer: ContextPdfViewer = PdfEvidenceViewer.forDocument(document, this),
  ): void {
    this.pdfSession.bind(apiBase, viewer);
    this.element("project-annotation-form", ProjectAnnotationForm)?.configure(apiBase);
    this.libraryPdfProject = { apiBase, owners };
    this.element("chapter-notes-panel", ChapterNotesPanel)?.addEventListener(chapterNotesPanelActionEvent, (event) => {
      const detail = (event as CustomEvent<ChapterNotesPanelAction>).detail;
      if (detail.action !== "open-in-editor") return;
      const returnToNotes = this.activeKey === RESEARCH_CHAPTER_NOTES_KEY;
      if (returnToNotes) this.contextState = activateResearchTab(this.contextState, RESEARCH_PREVIEW_KEY);
      if (!owners.projectFileDialog.selectFile(detail.fileId)) {
        if (returnToNotes && this.chapterNotesAvailable) {
          this.contextState = activateResearchTab(this.contextState, RESEARCH_CHAPTER_NOTES_KEY);
        }
        return;
      }
      owners.projectFileDialog.revealAuthoring();
      owners.workspaceSurfaceSwitcher.navigate("authoring");
    });
    const searchPanel = this.element("pdf-search-panel", PdfSearchPanel);
    searchPanel?.bind({
      search: async (query) => (viewer.search ? await viewer.search(query) : []),
      openPage: async (page) => viewer.goToPage?.(page),
    });
    this.element("open-paper-search", HTMLElement)?.addEventListener("click", () => searchPanel?.show());
    this.element("open-library-pdf-search", HTMLElement)?.addEventListener("click", () => searchPanel?.show());
    const navigationPanel = this.element("pdf-navigation-panel", PdfNavigationPanel);
    navigationPanel?.bind({
      navigation: async () => (viewer.navigation ? await viewer.navigation() : { outline: [], pages: 0 }),
      openPage: async (page) => viewer.goToPage?.(page),
      thumbnail: async (page) => (viewer.thumbnail ? await viewer.thumbnail(page) : ""),
    });
    this.element("open-paper-navigation", HTMLElement)?.addEventListener("click", () => navigationPanel?.show());
    this.element("open-library-pdf-navigation", HTMLElement)?.addEventListener("click", () => navigationPanel?.show());
    const referenceDetailsPanel = this.element("pdf-reference-details-panel", PdfReferenceDetailsPanel);
    const referenceDetailsButtons = [
      this.element("open-paper-details", HTMLElement),
      this.element("open-library-pdf-details", HTMLElement),
    ].filter((button): button is HTMLElement => button !== null);
    for (const button of referenceDetailsButtons) button.addEventListener("click", () => referenceDetailsPanel?.show());
    referenceDetailsPanel?.addEventListener(pdfReferenceDetailsVisibilityEvent, (event) => {
      const open = (event as CustomEvent<{ readonly open: boolean }>).detail.open;
      for (const button of referenceDetailsButtons) button.setAttribute("aria-expanded", String(open));
    });
    if (typeof this.ownerDocument.addEventListener === "function") {
      this.ownerDocument.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "f" && this.currentActiveTab?.kind.endsWith("pdf")) {
          event.preventDefault();
          searchPanel?.show();
        }
      });
    }
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    inspector?.bindProjectMutations(owners.referenceLibraryWorkspace);
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
    inspector?.addEventListener(pdfReferenceMentionOpenEvent, (event) => {
      const detail = (event as CustomEvent<{ readonly page: number }>).detail;
      void viewer.goToPage?.(detail.page);
    });
    this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar)?.addEventListener(libraryPdfToolbarActionEvent, (event) =>
      this.handleLibraryPdfToolbarAction((event as CustomEvent<LibraryPdfToolbarAction>).detail),
    );
    this.element("paper-markups", LibraryPdfMarkupLayer)?.addEventListener(libraryPdfMarkupActionEvent, this.handleLibraryPdfMarkupEvent);
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
      manage: (publicationId) => void owners.referenceLibraryWorkspace.openAvailableReference(publicationId),
      open: (publication) => this.navigateResource({ kind: "publication", id: publication.id }),
    });
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

  capturePdfSelection(capture: PdfSelectionCapture): void {
    const activeTab = this.currentActiveTab;
    if (activeTab?.kind === "library-pdf") {
      if (this.currentLibraryPdf) this.beginLibraryHighlight(this.currentLibraryPdf.id, capture);
      return;
    }
    if (activeTab?.kind !== "pdf") return;
    const form = this.element("project-annotation-form", ProjectAnnotationForm);
    const renderedPdfId = this.pdfSession.currentWorkspacePdfId;
    if (renderedPdfId) form?.selectPdf(renderedPdfId);
    form?.showCapture(capture);
    if (form && renderedPdfId && this.currentSnapshot) {
      void form.persistCapture(this.currentSnapshot.annotations, renderedPdfId, capture);
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
      chapterNotesAvailable: this.chapterNotesAvailable,
      libraryArtifacts: sources.library?.artifacts ?? [],
      publications: sources.snapshot?.publications ?? [],
      referencePdfs: this.referencePdfs,
      standaloneLibrary,
      tabs: context.tabs,
    });
    const activeTab = context.tabs.find(
      (tab): tab is ResearchResourceTab =>
        tab.kind !== "preview" &&
        tab.kind !== "chapter-notes" &&
        tab.kind !== "library" &&
        tab.kind !== "assistant" &&
        tab.key === context.activeKey,
    );
    this.currentActiveTab = activeTab;
    return { activeTab, ...this.present({ ...resourceSources, activeTab }) };
  }

  captureBoundContext(): void {
    const viewerState = this.pdfSession.viewerState();
    if (viewerState) this.contextState = this.captureContext(this.contextState, viewerState);
  }

  async loadActivePdf(force: boolean): Promise<void> {
    await this.pdfSession.load(
      {
        activeTab: this.currentActiveTab,
        annotations: this.currentSnapshot?.annotations ?? [],
        libraryArtifacts: this.currentLibrary?.artifacts ?? [],
        libraryHighlights: this.currentLibrary?.highlights ?? [],
        projectReferencePdfs: this.loadedReferencePdfs,
        workspacePdfs: this.currentSnapshot?.pdfs ?? [],
      },
      force,
    );
  }

  // PdfEvidenceViewer invokes this through its presentation callback.
  // fallow-ignore-next-line unused-class-member
  selectLibraryHighlight(highlightId: string): void {
    const highlight = this.boundLibrary()?.highlights.find((item) => item.id === highlightId);
    if (!highlight) return;
    this.clearBoundLibraryPdfMarkupSelection();
    this.applyViewerPresentation(this.editLibraryHighlight(highlight));
  }

  presentWorkspace(snapshot: WorkspaceSnapshot, renderedPdfId = this.pdfSession.currentWorkspacePdfId): AnnotationResource[] {
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
    this.syncChapterNotes(binding.owners.projectFileDialog.activeFileId, binding.owners.projectFileDialog.projectFiles(), false);
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

  presentChapterNotes(activeFileId: string | null, files: readonly ProjectFile[]): void {
    this.syncChapterNotes(activeFileId, files, true);
  }

  private syncChapterNotes(activeFileId: string | null, files: readonly ProjectFile[], refreshContext: boolean): void {
    const { activeFile, notes } = companionNotes(activeFileId, files);
    this.syncChapterNotesFile(notes?.id ?? null);
    void this.element("chapter-notes-panel", ChapterNotesPanel)?.presentNotes({
      chapterPath: activeFile?.path ?? "",
      notes: notes ? { content: notes.content, id: notes.id, path: notes.path } : null,
    });
    this.syncChapterNotesAvailability(notes !== null, refreshContext);
  }

  private syncChapterNotesFile(notesFileId: string | null): void {
    if (notesFileId === this.chapterNotesFileId) return;
    this.chapterNotesFileId = notesFileId;
    this.contextState = setResearchTabScroll(this.contextState, RESEARCH_CHAPTER_NOTES_KEY, 0);
    const scroll = this.element("context-chapter-notes-scroll", HTMLElement);
    if (scroll) scroll.scrollTop = 0;
  }

  private syncChapterNotesAvailability(available: boolean, refreshContext: boolean): void {
    const availabilityChanged = available !== this.chapterNotesAvailable;
    this.chapterNotesAvailable = available;
    if (!available && this.activeKey === RESEARCH_CHAPTER_NOTES_KEY) {
      this.contextState = activateResearchTab(this.contextState, RESEARCH_PREVIEW_KEY);
      if (refreshContext) this.presentNotice("The selected chapter has no paired notes, so Preview is shown instead.");
    }
    if (!refreshContext || !availabilityChanged) return;
    this.presentBoundContext(false);
    this.contextPresentation?.owners.workspaceSurfaceSwitcher.syncRoute("replace");
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
    const markups = this.libraryPdfMarkups(library);
    const primary = this.element("paper-markups", LibraryPdfMarkupLayer);
    const drawings = primary?.setLibraryPage(this.currentLibraryPdf, markups, page, toolbar.drawingStyle) ?? [];
    if (primary) this.projectUnrefreshedLibraryPdfDrawings(primary);
    for (const layer of this.libraryPdfMarkupLayers()) {
      if (layer === primary || layer.page === null) continue;
      layer.setLibraryPage(this.currentLibraryPdf, markups, layer.page, toolbar.drawingStyle);
      this.projectUnrefreshedLibraryPdfDrawings(layer);
    }
    this.presentLibraryPdfUndo(drawings, page);
    this.syncLibraryPdfUndoPending();
  }

  private presentComments(comments: WorkspaceSnapshot["comments"]): void {
    const list = this.element("manuscript-comment-list-panel", ManuscriptCommentList);
    if (list) this.element("workspace-rail-tabs", WorkspaceRailTabs)?.setCommentCount(list.setComments(comments));
  }

  presentPdfPage(page: number): void {
    this.element("pdf-navigation-panel", PdfNavigationPanel)?.setCurrentPage(page);
    this.presentLibraryPdfPage(this.currentLibrary, page);
    const activeTab = this.currentActiveTab;
    const activePdf = activeTab?.kind === "pdf" || activeTab?.kind === "library-pdf";
    if (activePdf) {
      this.contextState = setPdfResearchLocation(this.contextState, activeTab.key, { page });
      this.contextPresentation?.owners.workspaceSurfaceSwitcher.syncRoute("replace");
    }
    this.contextPresentation?.owners.referenceLibraryWorkspace.replacePdfRoute(this.currentLibraryPdf?.id, page);
  }

  // PdfEvidenceViewer invokes this while constructing flowing page placeholders.
  createPdfPageOverlay(page: number): LibraryPdfMarkupLayer | null {
    const artifact = this.currentLibraryPdf;
    const toolbar = this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar);
    if (!artifact || !toolbar) return null;
    const layer = new LibraryPdfMarkupLayer();
    layer.className = "pdf-markups";
    layer.ariaLabel = `Private PDF annotations on page ${page}`;
    layer.setLibraryPage(artifact, this.libraryPdfMarkups(this.currentLibrary), page, toolbar.drawingStyle);
    this.projectUnrefreshedLibraryPdfDrawings(layer);
    const primary = this.element("paper-markups", LibraryPdfMarkupLayer);
    layer.chooseTool(primary?.tool ?? "select");
    if (primary?.selectedMarkupId) layer.selectMarkup(primary.selectedMarkupId);
    else if (primary?.selectedHighlightId) layer.selectHighlight(primary.selectedHighlightId);
    const noteDraft = primary?.noteDraft;
    if (noteDraft && !noteDraft.editingId) layer.placeNote(noteDraft.page, noteDraft);
    layer.addEventListener(libraryPdfMarkupActionEvent, this.handleLibraryPdfMarkupEvent);
    return layer;
  }

  setLibraryPdfInspector(open: boolean, panel: "annotations" | "references" = "annotations"): void {
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    const toolbar = this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar);
    if (panel === "references") {
      inspector?.setInspectorOpen(open, panel);
      toolbar?.setInspectorOpen(open, panel);
    } else {
      inspector?.setInspectorOpen(open);
      toolbar?.setInspectorOpen(open);
    }
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
    const markupLayers = this.libraryPdfMarkupLayers();
    const markups = markupLayers[0];
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    for (const layer of markupLayers) layer.chooseTool(tool);
    const status = this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar)?.setTool(tool);
    if (status) inspector?.setStatus(status);
    if (tool !== "note") this.clearLibraryPdfNoteDraft();
    if (tool !== "select") this.clearLibraryPdfMarkupSelection();
    const drafts = inspector?.draftState;
    if (drafts && !drafts.highlight && !drafts.markup && !drafts.note) this.setLibraryPdfInspector(false);
    return {
      privateHighlightId: markups?.selectedHighlightId ?? null,
      privateHighlightSelection: tool === "select",
      textSelectionMode: tool === "select" ? "highlight" : "disabled",
    };
  }

  private libraryPdfMarkupLayers(): readonly LibraryPdfMarkupLayer[] {
    const primary = this.element("paper-markups", LibraryPdfMarkupLayer);
    const continuousPages = this.element("paper-continuous-pages", HTMLElement);
    const flowing = continuousPages ? [...continuousPages.querySelectorAll<LibraryPdfMarkupLayer>("library-pdf-markup-layer")] : [];
    return primary ? [primary, ...flowing] : flowing;
  }

  private applyLibraryPdfDrawingStyle(style: Pick<LibraryPdfDrawing, "color" | "width">): void {
    const artifact = this.currentLibraryPdf;
    if (!artifact) return;
    const markups = this.libraryPdfMarkups(this.currentLibrary);
    for (const layer of this.libraryPdfMarkupLayers()) {
      if (layer.page === null) continue;
      layer.setLibraryPage(artifact, markups, layer.page, style);
      this.projectUnrefreshedLibraryPdfDrawings(layer);
    }
  }

  private projectUnrefreshedLibraryPdfDrawings(layer: LibraryPdfMarkupLayer): void {
    for (const preview of this.provisionalLibraryPdfDrawings.values()) layer.projectProvisionalDrawing(preview);
    for (const [provisionalId, preview] of this.pendingLibraryPdfDrawingSaves) {
      if (this.provisionalLibraryPdfDrawings.has(provisionalId)) layer.projectDrawingSaveState(preview, true, null);
    }
    for (const [provisionalId, failed] of this.failedLibraryPdfDrawingSaves) {
      if (this.provisionalLibraryPdfDrawings.has(provisionalId)) {
        layer.projectDrawingSaveState(failed.preview, false, failed.failure);
      }
    }
    for (const drawing of this.unrefreshedLibraryPdfDrawings.values()) layer.projectCreatedDrawing(drawing);
  }

  private reconcileUnrefreshedLibraryPdfDrawings(library: ReferenceLibrarySnapshot | null): void {
    if (!library) return;
    const canonicalIds = new Set((library.pdfMarkups ?? []).map(({ id }) => id));
    const artifactIds = new Set(library.artifacts.map(({ id }) => id));
    for (const [id, drawing] of this.unrefreshedLibraryPdfDrawings) {
      if (canonicalIds.has(id) || !artifactIds.has(drawing.artifactId)) this.unrefreshedLibraryPdfDrawings.delete(id);
    }
    this.applyLibraryPdfDrawingAdoption(library);
    for (const [id, preview] of this.provisionalLibraryPdfDrawings) {
      if (!artifactIds.has(preview.artifactId)) {
        this.provisionalLibraryPdfDrawings.delete(id);
        this.failedLibraryPdfDrawingSaves.delete(id);
      }
    }
  }

  private libraryPdfMarkups(library: ReferenceLibrarySnapshot | null): readonly LibraryPdfMarkup[] {
    return (library?.pdfMarkups ?? []).filter(({ id }) => !this.pendingDeletedLibraryPdfDrawingIds.has(id));
  }

  private presentCreatedDrawingUndo(drawing: LibraryPdfDrawing): void {
    const primary = this.element("paper-markups", LibraryPdfMarkupLayer);
    if (this.currentLibraryPdf?.id !== drawing.artifactId || primary?.page !== drawing.page) return;
    const drawings = this.libraryPdfMarkups(this.currentLibrary).filter(
      (markup): markup is LibraryPdfDrawing =>
        markup.kind === "drawing" && markup.artifactId === drawing.artifactId && markup.page === drawing.page,
    );
    this.presentLibraryPdfUndo(drawings, drawing.page);
  }

  private presentLibraryPdfUndo(drawings: readonly LibraryPdfDrawing[], page: number): void {
    const artifact = this.currentLibraryPdf;
    const toolbar = this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar);
    if (!artifact || !toolbar) return;
    const visible = new Map(drawings.map((drawing) => [drawing.id, drawing]));
    for (const drawing of this.unrefreshedLibraryPdfDrawings.values()) {
      if (drawing.artifactId === artifact.id && drawing.page === page && !this.pendingDeletedLibraryPdfDrawingIds.has(drawing.id)) {
        visible.set(drawing.id, drawing);
      }
    }
    toolbar.setUndoDrawings([...visible.values()]);
  }

  private projectLibraryPdfDrawingPreview(preview: LibraryPdfDrawingPreview): LibraryPdfDrawingPreview | null {
    const existing = this.provisionalLibraryPdfDrawings.get(preview.provisionalId);
    const projected = existing
      ? { ...preview, baselineDrawingIds: [...new Set([...existing.baselineDrawingIds, ...preview.baselineDrawingIds])] }
      : preview;
    this.provisionalLibraryPdfDrawings.set(preview.provisionalId, projected);
    const adopted = this.applyLibraryPdfDrawingAdoption(this.currentLibrary);
    for (const provisionalId of adopted) {
      for (const layer of this.libraryPdfMarkupLayers()) layer.retireProvisionalDrawing(provisionalId);
    }
    const retained = this.provisionalLibraryPdfDrawings.get(preview.provisionalId);
    if (!retained) return null;
    for (const layer of this.libraryPdfMarkupLayers()) layer.projectProvisionalDrawing(retained);
    return retained;
  }

  private projectLibraryPdfDrawingSaveState(preview: LibraryPdfDrawingPreview, pending: boolean, failure: string | null): void {
    for (const layer of this.libraryPdfMarkupLayers()) layer.projectDrawingSaveState(preview, pending, failure);
  }

  private applyLibraryPdfDrawingAdoption(library: ReferenceLibrarySnapshot | null): ReadonlySet<string> {
    const adoption = libraryPdfDrawingAdoption(library, [...this.provisionalLibraryPdfDrawings.values()]);
    for (const [provisionalId, preview] of this.provisionalLibraryPdfDrawings) {
      if (adoption.adoptedIds.has(provisionalId)) {
        this.provisionalLibraryPdfDrawings.delete(provisionalId);
        this.failedLibraryPdfDrawingSaves.delete(provisionalId);
        continue;
      }
      if (preview.drawingId) continue;
      const claimedIds = adoption.claimedDrawings.filter((drawing) => sameLibraryPdfDrawing(drawing, preview)).map(({ id }) => id);
      if (claimedIds.length === 0) continue;
      this.provisionalLibraryPdfDrawings.set(provisionalId, {
        ...preview,
        baselineDrawingIds: [...new Set([...preview.baselineDrawingIds, ...claimedIds])],
      });
    }
    return adoption.adoptedIds;
  }

  private syncLibraryPdfUndoPending(): void {
    const artifactId = this.currentLibraryPdf?.id;
    const page = this.element("paper-markups", LibraryPdfMarkupLayer)?.page;
    const pending =
      artifactId !== undefined &&
      page !== null &&
      page !== undefined &&
      ([...this.pendingLibraryPdfDrawingSaves.values()].some((preview) => preview.artifactId === artifactId && preview.page === page) ||
        [...this.provisionalLibraryPdfDrawings.values()].some(
          (preview) =>
            preview.artifactId === artifactId &&
            preview.page === page &&
            (!preview.drawingId ||
              (!this.unrefreshedLibraryPdfDrawings.has(preview.drawingId) &&
                !(this.currentLibrary?.pdfMarkups?.some(({ id }) => id === preview.drawingId) ?? false))),
        ));
    this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar)?.setDrawingPending(pending);
  }

  clearLibraryPdfNoteDraft(): void {
    for (const layer of this.libraryPdfMarkupLayers()) layer.clearNote();
    this.element("library-pdf-inspector", LibraryPdfInspector)?.clearNote();
  }

  clearLibraryPdfMarkupSelection(): boolean {
    const markupLayers = this.libraryPdfMarkupLayers();
    const markups = markupLayers[0];
    for (const layer of markupLayers) layer.clearSelection();
    this.element("library-pdf-inspector", LibraryPdfInspector)?.clearMarkup();
    return markups?.tool === "select";
  }

  closeLibraryPdfInspector(page: number): LibraryPdfInspectorClosePresentation {
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    const panel = inspector?.activePanel ?? "annotations";
    const drafts = inspector?.draftState;
    if (drafts?.highlight) inspector?.clearHighlight(page, "Selection cancelled. Nothing was saved.");
    if (drafts?.note) this.clearLibraryPdfNoteDraft();
    const privateHighlightSelection = drafts?.markup ? this.clearLibraryPdfMarkupSelection() : null;
    this.setLibraryPdfInspector(false);
    this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar)?.focusInspectorButton(panel);
    return { clearDraftSelection: drafts?.highlight ?? false, privateHighlightSelection };
  }

  editLibraryHighlight(highlight: LibraryHighlight): LibraryPdfSelectionPresentation {
    const markupLayers = this.libraryPdfMarkupLayers();
    const markups = markupLayers[0];
    if (markups?.selectedMarkupId) this.clearLibraryPdfMarkupSelection();
    const tool = markups?.tool === "select" ? {} : this.chooseLibraryPdfTool("select");
    for (const layer of markupLayers) layer.selectHighlight(highlight.id);
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
    const markupLayers = this.libraryPdfMarkupLayers();
    const markups = markupLayers[0];
    const tool = markups?.tool === "select" || markups?.tool === "note" ? {} : this.chooseLibraryPdfTool("select");
    for (const layer of markupLayers) layer.editNote(note);
    this.element("library-pdf-inspector", LibraryPdfInspector)?.editNote(note);
    this.setLibraryPdfInspector(true);
    return { ...tool, clearDraftSelection: false };
  }

  selectLibraryPdfMarkup(markup: LibraryPdfMarkup, page: number): LibraryPdfSelectionPresentation {
    const inspector = this.element("library-pdf-inspector", LibraryPdfInspector);
    const clearDraftSelection = inspector?.draftState.highlight ?? false;
    if (clearDraftSelection) inspector?.clearHighlight(page, "Selection cancelled. Nothing was saved.");
    for (const layer of this.libraryPdfMarkupLayers()) layer.selectMarkup(markup.id);
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
    switch (action.action) {
      case "choose-tool":
        this.applyViewerPresentation(this.chooseLibraryPdfTool(action.tool));
        return;
      case "drawing-style-changed":
        this.applyLibraryPdfDrawingStyle(action.style);
        return;
      case "drawing-undone":
        this.completeLibraryPdfDrawingUndo(action.drawingId);
        return;
      case "export-status":
        this.presentNotice(action.message);
        return;
      case "open-references":
        this.setLibraryPdfInspector(true, "references");
        return;
      case "open-inspector":
        this.setLibraryPdfInspector(true, "annotations");
    }
  }

  private handleLibraryPdfMarkupAction(action: LibraryPdfMarkupAction): void {
    if (!this.libraryPdfProject) return;
    switch (action.action) {
      case "drawing-save-state":
        this.handleLibraryPdfDrawingSaveState(action);
        return;
      case "drawing-discarded":
        this.discardLibraryPdfDrawing(action.provisionalId);
        return;
      case "drawing-saved":
        this.completeLibraryPdfDrawingSave(action);
        return;
      case "note-moved":
        this.syncLibraryPdfUndoPending();
        this.completeLibraryMarkup("Note moved.");
        return;
      case "select-markup":
        this.selectBoundLibraryPdfMarkup(action.id);
        return;
      case "status":
        this.element("library-pdf-inspector", LibraryPdfInspector)?.setStatus(action.message);
        return;
      case "place-note":
        for (const layer of this.libraryPdfMarkupLayers()) layer.placeNote(action.draft.page, action.draft);
        this.beginLibraryPdfNote(action.draft);
    }
  }

  private completeLibraryPdfDrawingUndo(drawingId: string): void {
    this.pendingDeletedLibraryPdfDrawingIds.add(drawingId);
    this.unrefreshedLibraryPdfDrawings.delete(drawingId);
    for (const [provisionalId, preview] of this.provisionalLibraryPdfDrawings) {
      if (preview.drawingId !== drawingId) continue;
      this.provisionalLibraryPdfDrawings.delete(provisionalId);
      this.pendingLibraryPdfDrawingSaves.delete(provisionalId);
      this.failedLibraryPdfDrawingSaves.delete(provisionalId);
      for (const layer of this.libraryPdfMarkupLayers()) layer.retireProvisionalDrawing(provisionalId);
    }
    for (const layer of this.libraryPdfMarkupLayers()) layer.retireCreatedDrawing(drawingId);
    const page = this.element("paper-markups", LibraryPdfMarkupLayer)?.page;
    if (page !== null && page !== undefined) this.presentLibraryPdfPage(this.currentLibrary, page);
    this.completeLibraryMarkup("Private annotation deleted.", { kind: "deleted-drawing", drawingId });
  }

  private handleLibraryPdfDrawingSaveState(action: Extract<LibraryPdfMarkupAction, { readonly action: "drawing-save-state" }>): void {
    if (action.pending) {
      this.failedLibraryPdfDrawingSaves.delete(action.preview.provisionalId);
      this.pendingLibraryPdfDrawingSaves.set(action.preview.provisionalId, action.preview);
      const retained = this.projectLibraryPdfDrawingPreview(action.preview);
      if (retained) {
        this.pendingLibraryPdfDrawingSaves.set(retained.provisionalId, retained);
        this.projectLibraryPdfDrawingSaveState(retained, true, null);
      }
    } else {
      this.pendingLibraryPdfDrawingSaves.delete(action.preview.provisionalId);
      const retained = this.provisionalLibraryPdfDrawings.get(action.preview.provisionalId);
      if (action.failure && retained) {
        const failed = { failure: action.failure, preview: retained } satisfies FailedLibraryPdfDrawingSave;
        this.failedLibraryPdfDrawingSaves.set(retained.provisionalId, failed);
        this.projectLibraryPdfDrawingSaveState(retained, false, failed.failure);
      } else {
        this.failedLibraryPdfDrawingSaves.delete(action.preview.provisionalId);
        this.projectLibraryPdfDrawingSaveState(retained ?? action.preview, false, null);
      }
    }
    this.syncLibraryPdfUndoPending();
  }

  private discardLibraryPdfDrawing(provisionalId: string): void {
    this.pendingLibraryPdfDrawingSaves.delete(provisionalId);
    this.failedLibraryPdfDrawingSaves.delete(provisionalId);
    this.provisionalLibraryPdfDrawings.delete(provisionalId);
    for (const layer of this.libraryPdfMarkupLayers()) layer.retireProvisionalDrawing(provisionalId);
    this.syncLibraryPdfUndoPending();
  }

  private completeLibraryPdfDrawingSave(action: Extract<LibraryPdfMarkupAction, { readonly action: "drawing-saved" }>): void {
    this.failedLibraryPdfDrawingSaves.delete(action.preview.provisionalId);
    const retained = this.projectLibraryPdfDrawingPreview(action.preview);
    if (retained) {
      this.projectLibraryPdfDrawingSaveState(retained, this.pendingLibraryPdfDrawingSaves.has(retained.provisionalId), null);
    }
    if (action.drawing) {
      const canonical = this.currentLibrary?.pdfMarkups?.some(({ id }) => id === action.drawing?.id) ?? false;
      if (!canonical) {
        this.unrefreshedLibraryPdfDrawings.set(action.drawing.id, action.drawing);
        for (const layer of this.libraryPdfMarkupLayers()) layer.projectCreatedDrawing(action.drawing);
      }
      this.presentCreatedDrawingUndo(action.drawing);
    }
    this.syncLibraryPdfUndoPending();
    this.completeLibraryMarkup("Drawing saved privately.", {
      drawingId: action.drawingId,
      kind: "saved-drawing",
      provisionalId: action.preview.provisionalId,
    });
  }

  private completeLibraryMarkup(message: string, retirement?: LibraryPdfMarkupRefreshRetirement): void {
    const library = this.libraryPdfProject?.owners.referenceLibraryWorkspace;
    if (!library) return;
    const refresh = library.completeRefresh(message, "The annotation changed, but the refreshed Library could not be loaded.");
    if (!retirement) return;
    void refresh
      .then((succeeded) => {
        if (!succeeded) return;
        if (retirement.kind === "deleted-drawing") {
          this.pendingDeletedLibraryPdfDrawingIds.delete(retirement.drawingId);
          return;
        }
        if (retirement.drawingId) {
          this.unrefreshedLibraryPdfDrawings.delete(retirement.drawingId);
          for (const layer of this.libraryPdfMarkupLayers()) layer.retireCreatedDrawing(retirement.drawingId);
        }
        this.provisionalLibraryPdfDrawings.delete(retirement.provisionalId);
        this.failedLibraryPdfDrawingSaves.delete(retirement.provisionalId);
        for (const layer of this.libraryPdfMarkupLayers()) layer.retireProvisionalDrawing(retirement.provisionalId);
        this.syncLibraryPdfUndoPending();
      })
      .catch(() => undefined);
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
    for (const layer of this.libraryPdfMarkupLayers()) layer.clearNote();
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
    if (presentation.textSelectionMode !== undefined) viewer.setTextSelectionMode(presentation.textSelectionMode);
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
    this.reconcileUnrefreshedLibraryPdfDrawings(sources.library);
    this.currentLibrary = sources.library;
    this.currentSnapshot = sources.snapshot;
    const activeLibraryArtifact = this.activeLibraryArtifact(sources);
    this.currentLibraryPdf = activeLibraryArtifact;
    this.syncPdfPanels(sources, activeLibraryArtifact);
    this.presentPdfReferenceDetails(sources, activeLibraryArtifact);
    this.presentCandidate(sources);
    this.presentProjectPdf(sources);
    const privateHighlights = this.presentLibraryPdf(sources, activeLibraryArtifact);
    const viewer = this.pdfViewer;
    if (privateHighlights && viewer) {
      viewer.updatePrivateHighlights(privateHighlights);
      this.presentLibraryPdfPage(sources.library, viewer.currentPage);
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

  private presentPdfReferenceDetails(sources: ContextResourceSources, artifact: LibraryPdfArtifact | undefined): void {
    const panel = this.element("pdf-reference-details-panel", PdfReferenceDetailsPanel);
    const tab = sources.activeTab;
    if (tab?.kind === "pdf") {
      const pdf = sources.snapshot?.pdfs.find(({ id }) => id === tab.id);
      if (!pdf) return panel?.setContext(null);
      const publicationIds = new Set(
        sources.snapshot?.publicationPdfLinks.filter(({ pdfId }) => pdfId === pdf.id).map(({ publicationId }) => publicationId) ?? [],
      );
      const references = sources.snapshot?.publications.filter(({ id }) => publicationIds.has(id)).map(projectPdfReferenceDetails) ?? [];
      panel?.setContext({ pdfId: pdf.id, pdfName: pdf.name, references });
      return;
    }
    if (tab?.kind !== "library-pdf") return panel?.setContext(null);
    const referencePdf = artifact ? undefined : sources.referencePdfs.find(({ id }) => id === tab.id);
    const pdf = artifact ?? referencePdf;
    if (!pdf) return panel?.setContext(null);
    const libraryReference = artifact?.referenceId ? sources.library?.references.find(({ id }) => id === artifact.referenceId) : undefined;
    const projectReference = !libraryReference ? sources.snapshot?.publications.find(({ id }) => id === pdf.referenceId) : undefined;
    panel?.setContext({
      pdfId: pdf.id,
      pdfName: pdf.name,
      references: libraryReference
        ? [libraryPdfReferenceDetails(libraryReference)]
        : projectReference
          ? [projectPdfReferenceDetails(projectReference)]
          : [],
    });
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
      for (const layer of this.libraryPdfMarkupLayers()) {
        layer.cancelShapeRecognition();
        layer.resetState();
      }
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
}

function projectPdfReferenceDetails(publication: PublicationResource): PdfReferenceDetails {
  return {
    abstract: publication.abstract,
    authors: publication.authors,
    citationKey: publication.citationKey,
    doi: publication.doi,
    id: publication.id,
    origin: "Project reference",
    title: publication.title,
    type: publication.type,
    venue: publication.venue,
    year: publication.year,
  };
}

function libraryPdfReferenceDetails(reference: BibliographicRecord): PdfReferenceDetails {
  return {
    abstract: reference.abstract,
    authors: reference.authors,
    citationKey: reference.referenceKey,
    doi: reference.doi,
    id: reference.id,
    origin: "Library reference",
    title: reference.title,
    type: reference.type,
    venue: reference.venue,
    year: reference.year,
  };
}

interface LibraryPdfDrawingAdoption {
  readonly adoptedIds: ReadonlySet<string>;
  readonly claimedDrawings: readonly LibraryPdfDrawing[];
}

function libraryPdfDrawingAdoption(
  library: ReferenceLibrarySnapshot | null,
  previews: readonly LibraryPdfDrawingPreview[],
): LibraryPdfDrawingAdoption {
  const drawings = (library?.pdfMarkups ?? []).filter((markup): markup is LibraryPdfDrawing => markup.kind === "drawing");
  const drawingsById = new Map(drawings.map((drawing) => [drawing.id, drawing]));
  const adoptedIds = new Set<string>();
  const claimedDrawingIds = new Set<string>();
  for (const preview of previews) {
    const expectedId = preview.drawingId ?? preview.provisionalId;
    if (preview.baselineDrawingIds.includes(expectedId) || !drawingsById.has(expectedId)) continue;
    adoptedIds.add(preview.provisionalId);
    claimedDrawingIds.add(expectedId);
  }
  return {
    adoptedIds,
    claimedDrawings: drawings.filter(({ id }) => claimedDrawingIds.has(id)),
  };
}

function sameLibraryPdfDrawing(drawing: LibraryPdfDrawing, preview: LibraryPdfDrawingPreview): boolean {
  return (
    drawing.artifactId === preview.artifactId &&
    drawing.referenceId === preview.referenceId &&
    drawing.page === preview.page &&
    drawing.color === preview.color.toLocaleLowerCase() &&
    drawing.width === preview.width &&
    drawing.points.length === preview.points.length &&
    drawing.points.every((point, index) => point.x === preview.points[index]?.x && point.y === preview.points[index]?.y)
  );
}

function noticeExcerpt(value: string): string {
  const compact = value.replaceAll(/\s+/gu, " ").trim();
  return compact.length <= 240 ? compact : `${compact.slice(0, 239).trimEnd()}…`;
}

function companionNotes(
  activeFileId: string | null,
  files: readonly ProjectFile[],
): { readonly activeFile: ProjectFile | undefined; readonly notes: ProjectFile | null } {
  const activeFile = files.find(({ id }) => id === activeFileId);
  if (!activeFile) return { activeFile, notes: null };
  const notesPath = projectCompanionNotesPath(activeFile.path);
  return { activeFile, notes: files.find(({ path }) => path === notesPath) ?? null };
}

if (typeof customElements !== "undefined" && !customElements.get("context-resource-presenter")) {
  customElements.define("context-resource-presenter", ContextResourcePresenter);
}

declare global {
  interface HTMLElementTagNameMap {
    "context-resource-presenter": ContextResourcePresenter;
  }
}
