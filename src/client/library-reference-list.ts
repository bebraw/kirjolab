import { html, LitElement, type TemplateResult } from "lit";
import { bibTeXDisplayText } from "../domain/bibliography";
import type { BibliographicRecord, ReferenceLibrarySnapshot, ResearchShareSnapshot } from "../domain/reference-library";
import type { ProjectReferenceLink } from "../domain/workspace";
import { LibraryReferenceMetadataEditor } from "./library-reference-metadata-editor";
import type { LibraryReferencePdfAction } from "./library-reference-pdf-rows";
import { LibraryReferencePersonalFields } from "./library-reference-personal-fields";
import { LibraryReferenceResearchRows } from "./library-reference-research-rows";
import { LibraryReferenceSummary } from "./library-reference-summary";

export interface LibraryReferenceListData {
  readonly library: ReferenceLibrarySnapshot;
  readonly projectApiBase: string | null;
  readonly projectReferences: readonly ProjectReferenceLink[];
  readonly references: readonly BibliographicRecord[];
  readonly researchShares: readonly ResearchShareSnapshot[];
}

interface FocusOptions {
  readonly block: ScrollLogicalPosition;
  readonly expand?: boolean;
}

export class LibraryReferenceList extends LitElement {
  static override properties = { data: { state: true } };

  declare private data: LibraryReferenceListData | null;
  private readonly expandedReferenceIds = new Set<string>();

  constructor() {
    super();
    this.data = null;
  }

  setData(data: LibraryReferenceListData): void {
    this.data = data;
  }

  async settled(): Promise<void> {
    await this.updateComplete;
    const components = this.querySelectorAll<
      LibraryReferenceSummary | LibraryReferenceMetadataEditor | LibraryReferencePersonalFields | LibraryReferenceResearchRows
    >("library-reference-summary, library-reference-metadata-editor, library-reference-personal-fields, library-reference-research-rows");
    await Promise.all([...components].map(({ updateComplete }) => updateComplete));
    const pdfRows = this.querySelectorAll("library-reference-pdf-rows");
    await Promise.all([...pdfRows].map(({ updateComplete }) => updateComplete));
  }

  async focusReference(referenceId: string, options: FocusOptions): Promise<boolean> {
    if (options.expand) {
      this.expandedReferenceIds.add(referenceId);
      this.requestUpdate();
    }
    await this.settled();
    const card = [...this.querySelectorAll<HTMLElement>("[data-reference-id]")].find(({ dataset }) => dataset.referenceId === referenceId);
    if (!card) return false;
    card.tabIndex = -1;
    card.scrollIntoView({ block: options.block });
    card.focus({ preventScroll: true });
    return true;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const data = this.data;
    if (!data) return html``;
    if (data.references.length === 0) {
      return html`<div class="empty-state">
        ${data.library.references.length === 0 ? "No references. Use Add reference to begin." : "No matching references."}
      </div>`;
    }
    return html`${data.references.map((reference) => this.renderReference(reference))}`;
  }

  protected override updated(): void {
    const data = this.data;
    if (!data) return;
    const cards = this.querySelectorAll<HTMLElement>("[data-reference-id]");
    for (const [index, reference] of data.references.entries()) {
      const card = cards[index];
      if (!card) continue;
      const artifacts = data.library.artifacts.filter((artifact) => artifact.referenceId === reference.id);
      const linked = data.projectReferences.find((item) => item.referenceId === reference.id);
      const displayTitle = bibTeXDisplayText(reference.title) || "Untitled reference";
      card.querySelector("library-reference-summary")?.setData({
        keyState: data.library.referenceKeyStates[reference.id] ?? "final",
        linkedCitationAlias: linked?.citationAlias ?? null,
        primaryArtifact: artifacts[0] ?? null,
        projectApiBase: data.projectApiBase,
        reference,
      });
      card.querySelector("library-reference-metadata-editor")?.setData(reference, displayTitle, artifacts[0] ?? null);
      card.querySelector("library-reference-personal-fields")?.setData({
        archived: reference.archivedAt !== null,
        collections: data.library.collections[reference.id] ?? [],
        displayTitle,
        reading: data.library.reading.find((item) => item.referenceId === reference.id) ?? null,
        referenceId: reference.id,
        tags: data.library.tags[reference.id] ?? [],
      });
      const webSource = data.library.webSources.find((source) => source.referenceId === reference.id);
      const webSnapshots = data.library.webSnapshots
        .filter((snapshot) => snapshot.referenceId === reference.id)
        .sort((left, right) => right.accessedAt.localeCompare(left.accessedAt));
      card.querySelector("library-reference-research-rows")?.setData({
        artifacts,
        canonicalUrl: webSource?.canonicalUrl ?? null,
        highlights: data.library.highlights.filter((highlight) => highlight.referenceId === reference.id),
        linkedSnapshotId: linked?.snapshot.webSnapshot?.id ?? null,
        notes: data.library.notes.filter((note) => note.referenceId === reference.id),
        projectApiBase: data.projectApiBase,
        reference,
        referenceLinked: linked !== undefined,
        researchShares: data.researchShares,
        webSnapshots,
      });
    }
  }

  protected refinePdf(event: Event): void {
    const detail = (event as CustomEvent<LibraryReferencePdfAction>).detail;
    if (detail.action !== "refine") return;
    const editor = (event.currentTarget as HTMLElement).querySelector<LibraryReferenceMetadataEditor>("library-reference-metadata-editor");
    if (!editor) return;
    event.stopImmediatePropagation();
    void editor.refineMetadata(detail.reference, detail.artifact);
  }

  private renderReference(reference: BibliographicRecord): TemplateResult {
    return html`<article class="library-reference-row" data-reference-id=${reference.id} @library-reference-pdf-action=${this.refinePdf}>
      <library-reference-summary class="contents"></library-reference-summary>
      <details
        class="library-reference-details"
        .open=${this.expandedReferenceIds.has(reference.id)}
        @toggle=${(event: Event) => this.rememberExpanded(reference.id, event.currentTarget as HTMLDetailsElement)}
      >
        <summary title="Edit metadata, organization, reading state, and attached research">Details</summary>
        <div class="library-reference-detail-body">
          <library-reference-metadata-editor class="contents"></library-reference-metadata-editor>
          <library-reference-personal-fields class="contents"></library-reference-personal-fields>
          <library-reference-research-rows class="contents"></library-reference-research-rows>
        </div>
      </details>
    </article>`;
  }

  private rememberExpanded(referenceId: string, details: HTMLDetailsElement): void {
    if (details.open) this.expandedReferenceIds.add(referenceId);
    else this.expandedReferenceIds.delete(referenceId);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("library-reference-list")) {
  customElements.define("library-reference-list", LibraryReferenceList);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-reference-list": LibraryReferenceList;
  }
}
