import { html, LitElement, type TemplateResult } from "lit";
import type { LibraryPdfArtifact, ProjectReferencePdf } from "../domain/reference-library";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { CandidateReviewPanel } from "./candidate-review-panel";
import { LibraryPdfInspector } from "./library-pdf-inspector";
import { ProjectAnnotationForm } from "./project-annotation-form";
import { PublicationContextPanel } from "./publication-context-panel";
import { PublicationIntakePanel } from "./publication-intake-panel";
import type { ResearchResourceTab } from "./research-context";

export interface ContextResourceSources {
  readonly activeTab: ResearchResourceTab | undefined;
  readonly candidateDecision: { readonly action: "apply" | "reject"; readonly id: string } | null;
  readonly libraryArtifacts: readonly LibraryPdfArtifact[];
  readonly referencePdfs: readonly ProjectReferencePdf[];
  readonly snapshot: WorkspaceSnapshot | null;
  readonly sourceRevision: number;
  readonly stableDocument: boolean;
}

export interface ContextResourcePresentation {
  readonly activeLibraryArtifact: LibraryPdfArtifact | undefined;
  readonly publicationPresented: boolean;
}

export class ContextResourcePresenter extends LitElement {
  present(sources: ContextResourceSources): ContextResourcePresentation {
    const activeLibraryArtifact = this.activeLibraryArtifact(sources);
    this.syncPdfPanels(sources, activeLibraryArtifact);
    this.presentCandidate(sources);
    this.presentProjectPdf(sources);
    return {
      activeLibraryArtifact,
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
        libraryArtifacts: sources.libraryArtifacts,
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
    return tab?.kind === "library-pdf" ? sources.libraryArtifacts.find(({ id }) => id === tab.id) : undefined;
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
