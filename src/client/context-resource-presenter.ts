import { html, LitElement, type TemplateResult } from "lit";
import type { LibraryHighlight, LibraryPdfArtifact, ProjectReferencePdf, ReferenceLibrarySnapshot } from "../domain/reference-library";
import type { AnnotationResource, WorkspaceSnapshot } from "../domain/workspace";
import { AssistantWorkflowStatus } from "./assistant-workflow-status";
import { CandidateListPanel } from "./candidate-list-panel";
import { CandidateReviewPanel } from "./candidate-review-panel";
import { ClaimListPanel } from "./claim-list-panel";
import { LibraryPdfAnnotationToolbar } from "./library-pdf-annotation-toolbar";
import { LibraryPdfInspector } from "./library-pdf-inspector";
import { LibraryPdfMarkupLayer, type PdfAnnotationTool } from "./library-pdf-markup-layer";
import { ManuscriptCommentList } from "./manuscript-comment-list";
import { ProjectAnnotationForm } from "./project-annotation-form";
import { ProjectEvidencePanel } from "./project-evidence-panel";
import { PublicationContextPanel } from "./publication-context-panel";
import { PublicationIntakePanel } from "./publication-intake-panel";
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

export class ContextResourcePresenter extends LitElement {
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
    this.element("publication-intake-panel", PublicationIntakePanel)?.setPdf(
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
