import { html, type TemplateResult } from "lit";
import { EagerLightDomElement } from "./light-dom-controller";
import type {
  LibraryHighlight,
  LibraryPdfArtifact,
  LibraryPdfMarkup,
  LibraryPdfNote,
  ReferenceLibrarySnapshot,
  ResearchShareSnapshot,
} from "../domain/reference-library";
import type { ProjectReferenceLink } from "../domain/workspace";
import type { LibraryHighlightDraft, LibraryPdfAnnotationForms } from "./library-pdf-annotation-forms";
import "./library-pdf-annotation-forms";
import type { LibraryPdfAnnotationList } from "./library-pdf-annotation-list";
import "./library-pdf-annotation-list";
import type { LibraryPdfNoteDraft } from "./library-pdf-markup-layer";
import type { LibraryPdfProjectUse } from "./library-pdf-project-use";
import "./library-pdf-project-use";
import type { PdfHighlightImportPanel } from "./pdf-highlight-import-panel";
import "./pdf-highlight-import-panel";
import { projectReferenceChangedEvent, type ProjectReferenceChanged } from "./project-reference-mutation";
import { projectResearchChangedEvent, type ProjectResearchChanged } from "./project-research-mutation";

export const libraryPdfInspectorCloseEvent = "library-pdf-inspector-close";

export interface LibraryPdfInspectorContext {
  readonly artifact: LibraryPdfArtifact;
  readonly library: ReferenceLibrarySnapshot;
  readonly projectApiBase: string | null;
  readonly projectReferences: readonly Pick<ProjectReferenceLink, "citationAlias" | "referenceId">[];
  readonly researchShares: readonly ResearchShareSnapshot[];
}

export interface LibraryPdfInspectorProjection {
  readonly artifactChanged: boolean;
  readonly highlights: readonly LibraryHighlight[];
  readonly markups: readonly LibraryPdfMarkup[];
}

export interface LibraryPdfInspectorDraftState {
  readonly highlight: boolean;
  readonly markup: boolean;
  readonly note: boolean;
}

export interface LibraryProjectMutations {
  applyProjectMutation(snapshot: ProjectReferenceChanged["snapshot"], message?: string): Promise<void>;
}

export class LibraryPdfInspector extends EagerLightDomElement {
  static override properties = {
    artifactId: { state: true },
    inspectorOpen: { state: true },
    status: { state: true },
    visible: { state: true },
  };

  declare private artifactId: string;
  declare private inspectorOpen: boolean;
  declare private status: string;
  declare private visible: boolean;
  private projectMutations: LibraryProjectMutations | null = null;

  constructor() {
    super();
    this.artifactId = "";
    this.inspectorOpen = false;
    this.status = "Select text to highlight.";
    this.visible = false;
    this.addEventListener(projectReferenceChangedEvent, (event) => {
      const { message, snapshot } = (event as CustomEvent<ProjectReferenceChanged>).detail;
      void this.projectMutations?.applyProjectMutation(snapshot, message);
    });
    this.addEventListener(projectResearchChangedEvent, (event) => {
      const { message, snapshot } = (event as CustomEvent<ProjectResearchChanged>).detail;
      void this.projectMutations?.applyProjectMutation(snapshot, message);
    });
  }

  bindProjectMutations(projectMutations: LibraryProjectMutations): void {
    this.projectMutations = projectMutations;
  }

  protected setArtifact(artifactId: string): void {
    this.artifactId = artifactId;
  }

  protected showsArtifact(artifactId: string): boolean {
    return this.artifactId === artifactId;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  setStatus(status: string): void {
    this.status = status;
  }

  setInspectorOpen(open: boolean, showAnnotations = false): void {
    this.inspectorOpen = open;
    if (showAnnotations) this.querySelector<HTMLDetailsElement>("#library-annotation-details")?.setAttribute("open", "");
  }

  setContext(context: LibraryPdfInspectorContext): LibraryPdfInspectorProjection {
    const { artifact, library, projectApiBase, projectReferences, researchShares } = context;
    const artifactChanged = !this.showsArtifact(artifact.id);
    if (artifactChanged) this.resetArtifact(artifact.id);
    this.projectUse.setContext({ artifact, projectApiBase, projectReferences, references: library.references });
    const highlights = library.highlights.filter((highlight) => highlight.artifactId === artifact.id);
    this.highlightImport.setContext(
      artifact.referenceId ? { artifactId: artifact.id, highlights, referenceId: artifact.referenceId } : null,
    );
    if (artifact.referenceId) {
      this.annotationForms.setHighlightContext({ artifactId: artifact.id, highlights, referenceId: artifact.referenceId });
    }
    const markups = (library.pdfMarkups ?? []).filter((markup) => markup.artifactId === artifact.id);
    this.annotationList.setData({
      artifact,
      highlights,
      linkedReferenceIds: new Set(projectReferences.map((item) => item.referenceId)),
      markups,
      projectApiBase,
      researchShares,
    });
    return { artifactChanged, highlights, markups };
  }

  beginHighlight(artifactId: string, draft: LibraryHighlightDraft): void {
    this.setArtifact(artifactId);
    this.annotationForms.showHighlight(draft);
    this.setStatus(`Page ${draft.page} selection ready.`);
  }

  editHighlight(highlight: LibraryHighlight): void {
    this.annotationForms.showHighlight({
      highlightId: highlight.id,
      page: highlight.page,
      quote: highlight.quote,
      comment: highlight.comment,
      rects: highlight.rects,
    });
    this.setStatus(`Editing the note for page ${highlight.page}.`);
    this.annotationForms.focusHighlightComment();
  }

  clearHighlight(page: number, message = "Selection cancelled. Nothing was saved."): void {
    this.annotationForms.clearHighlight(page);
    this.setStatus(message);
  }

  beginNote(draft: LibraryPdfNoteDraft & { readonly artifactId: string; readonly referenceId: string }): void {
    this.annotationForms.showNote("", draft);
    this.annotationForms.focusNote();
  }

  editNote(note: LibraryPdfNote): void {
    this.annotationForms.showNote(note.body, {
      artifactId: note.artifactId,
      editingId: note.id,
      page: note.page,
      referenceId: note.referenceId,
      x: note.x,
      y: note.y,
    });
    this.setStatus(`Editing the note on page ${note.page}.`);
    this.annotationForms.focusNote();
  }

  selectMarkup(markup: LibraryPdfMarkup): void {
    this.annotationForms.showMarkup({
      id: markup.id,
      label: markup.kind === "note" ? `Note on page ${markup.page} · drag its pin to move` : `Line on page ${markup.page}`,
      kind: markup.kind,
      referenceId: markup.referenceId,
      ...(markup.kind === "drawing" ? { color: markup.color, width: markup.width } : {}),
    });
    this.setStatus(
      markup.kind === "note"
        ? "Note selected. Drag the pin to move it, or edit its text below."
        : "Line selected. Adjust its style or delete it.",
    );
  }

  clearNote(): void {
    this.annotationForms.clearNote();
  }

  clearMarkup(): void {
    this.annotationForms.clearMarkup();
  }

  get draftState(): LibraryPdfInspectorDraftState {
    return {
      highlight: this.annotationForms.highlightOpen,
      markup: this.annotationForms.markupOpen,
      note: this.annotationForms.noteOpen,
    };
  }

  private resetArtifact(artifactId: string): void {
    this.highlightImport.reset();
    this.setArtifact(artifactId);
    this.annotationForms.clearHighlight(1);
    this.annotationForms.clearNote();
    this.annotationForms.clearMarkup();
    this.setStatus("Select text to highlight.");
    this.setInspectorOpen(false);
  }

  protected override render(): TemplateResult {
    return html`
      <aside
        class="annotation-composer library-pdf-tools"
        id="library-highlight-composer"
        aria-label="PDF annotation inspector"
        data-artifact-id=${this.artifactId}
        data-inspector-open=${String(this.inspectorOpen)}
        ?hidden=${!this.visible}
      >
        <header class="library-pdf-inspector-header">
          <div>
            <p class="eyebrow">PDF annotations</p>
            <p class="library-pdf-status ui-status" id="library-highlight-status" role="status" aria-live="polite">${this.status}</p>
          </div>
          <button
            class="library-pdf-inspector-close"
            id="close-library-pdf-inspector"
            type="button"
            aria-label="Close annotation inspector"
            title="Close annotation inspector"
            @click=${this.close}
          >
            ×
          </button>
        </header>
        <library-pdf-annotation-forms id="library-pdf-annotation-forms"></library-pdf-annotation-forms>
        <details class="library-annotation-details" id="library-annotation-details">
          <summary><span>Annotations</span></summary>
          <div class="library-annotation-details-body">
            <pdf-highlight-import-panel
              class="library-highlight-import"
              id="pdf-highlight-import-panel"
              aria-labelledby="library-highlight-import-title"
            ></pdf-highlight-import-panel>
            <library-pdf-annotation-list class="space-y-2" id="library-highlight-list"></library-pdf-annotation-list>
            <details class="library-project-details">
              <summary>Project sharing</summary>
              <library-pdf-project-use class="mt-2" id="library-project-use"></library-pdf-project-use>
            </details>
          </div>
        </details>
      </aside>
    `;
  }

  protected get annotationForms(): LibraryPdfAnnotationForms {
    const forms = this.querySelector<LibraryPdfAnnotationForms>("#library-pdf-annotation-forms");
    if (!forms) throw new Error("Library PDF annotation forms are unavailable");
    return forms;
  }

  protected get annotationList(): LibraryPdfAnnotationList {
    const list = this.querySelector<LibraryPdfAnnotationList>("#library-highlight-list");
    if (!list) throw new Error("Library PDF annotation list is unavailable");
    return list;
  }

  protected get highlightImport(): PdfHighlightImportPanel {
    const panel = this.querySelector<PdfHighlightImportPanel>("#pdf-highlight-import-panel");
    if (!panel) throw new Error("PDF highlight import panel is unavailable");
    return panel;
  }

  protected get projectUse(): LibraryPdfProjectUse {
    const projectUse = this.querySelector<LibraryPdfProjectUse>("#library-project-use");
    if (!projectUse) throw new Error("Library PDF project use is unavailable");
    return projectUse;
  }

  protected close(): void {
    this.dispatchEvent(new CustomEvent(libraryPdfInspectorCloseEvent, { bubbles: true }));
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-pdf-inspector")) {
  customElements.define("library-pdf-inspector", LibraryPdfInspector);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-pdf-inspector": LibraryPdfInspector;
  }
}
