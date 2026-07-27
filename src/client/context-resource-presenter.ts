import { html, LitElement, type TemplateResult } from "lit";
import type {
  LibraryHighlight,
  LibraryPdfArtifact,
  LibraryPdfMarkup,
  LibraryPdfNote,
  ProjectReferencePdf,
  ReferenceLibrarySnapshot,
} from "../domain/reference-library";
import type { AnnotationResource, WorkspaceSnapshot } from "../domain/workspace";
import { AssistantWorkflowStatus } from "./assistant-workflow-status";
import { CandidateListPanel } from "./candidate-list-panel";
import { CandidateReviewPanel } from "./candidate-review-panel";
import { ClaimListPanel } from "./claim-list-panel";
import { LibraryPdfAnnotationToolbar } from "./library-pdf-annotation-toolbar";
import { LibraryPdfInspector } from "./library-pdf-inspector";
import { LibraryPdfMarkupLayer, type LibraryPdfNoteDraft, type PdfAnnotationTool } from "./library-pdf-markup-layer";
import { ManuscriptCommentList } from "./manuscript-comment-list";
import type { PdfSelectionCapture } from "./pdf-viewer";
import { libraryPdfAnnotationActionEvent, type LibraryPdfAnnotationAction } from "./library-pdf-annotation-forms";
import { libraryPdfAnnotationListActionEvent, type LibraryPdfAnnotationListAction } from "./library-pdf-annotation-list";
import { libraryPdfInspectorCloseEvent } from "./library-pdf-inspector";
import { libraryPdfMarkupActionEvent, type LibraryPdfMarkupAction } from "./library-pdf-markup-layer";
import { libraryPdfToolbarActionEvent, type LibraryPdfToolbarAction } from "./library-pdf-annotation-toolbar";
import { pdfHighlightImportOutcomeEvent, type PdfHighlightImportOutcome } from "./pdf-highlight-import-panel";
import { ProjectAnnotationForm } from "./project-annotation-form";
import { ProjectEvidencePanel } from "./project-evidence-panel";
import { PublicationContextPanel } from "./publication-context-panel";
import { PublicationListPanel } from "./publication-list-panel";
import type { ResearchContextTab, ResearchResourceTab } from "./research-context";
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
  readonly privateHighlights: readonly LibraryHighlight[] | undefined;
  readonly publicationPresented: boolean;
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

export interface LibraryPdfCoordinator {
  readonly applyViewerPresentation: (presentation: LibraryPdfSelectionPresentation | LibraryPdfToolPresentation) => void;
  readonly citeHighlight: (highlight: LibraryHighlight) => void;
  readonly clearViewerDraftSelection: () => void;
  readonly completeMarkup: (message: string) => void;
  readonly currentPage: () => number;
  readonly library: () => ReferenceLibrarySnapshot | null;
  readonly openHighlight: (highlight: LibraryHighlight) => void;
  readonly openPdf: (artifact: LibraryPdfArtifact, page: number) => void;
  readonly refreshLibrary: () => Promise<void>;
  readonly showToast: (message: string) => void;
}

export class ContextResourcePresenter extends LitElement {
  private libraryPdfCoordinator: LibraryPdfCoordinator | null = null;

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

  selectLibraryHighlight(highlightId: string): void {
    const highlight = this.libraryPdfCoordinator?.library()?.highlights.find((item) => item.id === highlightId);
    if (!highlight) return;
    this.clearBoundLibraryPdfMarkupSelection();
    this.applyViewerPresentation(this.editLibraryHighlight(highlight));
  }

  presentWorkspace(snapshot: WorkspaceSnapshot, renderedPdfId: string | undefined): AnnotationResource[] {
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
    return renderedPdfId ? snapshot.annotations.filter(({ pdfId }) => pdfId === renderedPdfId) : [];
  }

  presentLibraryPdfPage(artifact: LibraryPdfArtifact | undefined, library: ReferenceLibrarySnapshot | null, page: number): void {
    const toolbar = this.element("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar);
    if (!toolbar) return;
    const drawings =
      this.element("paper-markups", LibraryPdfMarkupLayer)?.setLibraryPage(
        artifact,
        library?.pdfMarkups ?? [],
        page,
        toolbar.drawingStyle,
      ) ?? [];
    toolbar.setUndoDrawings(drawings);
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
    if (action.action === "open-highlight") coordinator.openHighlight(action.highlight);
    else if (action.action === "edit-highlight") this.applyViewerPresentation(this.editLibraryHighlight(action.highlight));
    else if (action.action === "cite-highlight") coordinator.citeHighlight(action.highlight);
    else if (action.action === "open-markup") coordinator.openPdf(action.artifact, action.page);
    else if (action.action === "edit-note") this.applyViewerPresentation(this.editLibraryPdfNote(action.note));
    else coordinator.completeMarkup("Private annotation deleted.");
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
    coordinator.clearViewerDraftSelection();
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
    const coordinator = this.libraryPdfCoordinator;
    if (!coordinator) return;
    this.element("library-pdf-inspector", LibraryPdfInspector)?.clearHighlight(coordinator.currentPage(), message);
    coordinator.clearViewerDraftSelection();
  }

  private closeBoundLibraryPdfInspector(): void {
    const coordinator = this.libraryPdfCoordinator;
    if (!coordinator) return;
    const presentation = this.closeLibraryPdfInspector(coordinator.currentPage());
    if (presentation.clearDraftSelection) coordinator.clearViewerDraftSelection();
    if (presentation.privateHighlightSelection !== null)
      coordinator.applyViewerPresentation({
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
    const markup = coordinator?.library()?.pdfMarkups?.find((item) => item.id === markupId);
    if (coordinator && markup) this.applyViewerPresentation(this.selectLibraryPdfMarkup(markup, coordinator.currentPage()));
  }

  private clearBoundLibraryPdfMarkupSelection(): void {
    this.libraryPdfCoordinator?.applyViewerPresentation({
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
    this.libraryPdfCoordinator?.applyViewerPresentation(presentation);
  }

  resourceScrollTop(tab: ResearchContextTab): number {
    if (tab.kind === "publication") return this.element("publication-context-panel", PublicationContextPanel)?.scrollPosition ?? 0;
    if (tab.kind === "candidate") return this.element("candidate-review-panel", CandidateReviewPanel)?.scrollPosition ?? 0;
    return this.element("paper-reader", HTMLElement)?.scrollTop ?? 0;
  }

  present(sources: ContextResourceSources): ContextResourcePresentation {
    const activeLibraryArtifact = this.activeLibraryArtifact(sources);
    this.syncPdfPanels(sources, activeLibraryArtifact);
    this.presentCandidate(sources);
    this.presentProjectPdf(sources);
    return {
      privateHighlights: this.presentLibraryPdf(sources, activeLibraryArtifact),
      publicationPresented: this.presentPublication(sources),
    };
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

if (typeof customElements !== "undefined" && !customElements.get("context-resource-presenter")) {
  customElements.define("context-resource-presenter", ContextResourcePresenter);
}

declare global {
  interface HTMLElementTagNameMap {
    "context-resource-presenter": ContextResourcePresenter;
  }
}
