import { html, LitElement, nothing, type TemplateResult } from "lit";
import type { AnnotationResource, ManuscriptAnchorSelector, PassageLink, PdfResource, PdfSelectionRect } from "../domain/workspace";
import { formatBytes } from "./format";
import { adjustSelectionRects, type HighlightGeometryAdjustment } from "./pdf-selection";
import { accessibleEvidenceExcerpt, anchorActionLabel, anchorMatchState, modelEvidenceKey } from "./research-resource-presentation";

export const projectEvidenceActionEvent = "project-evidence-action";

export type ProjectEvidenceAction =
  | { readonly action: "delete-annotation"; readonly annotation: AnnotationResource }
  | { readonly action: "edit-annotation"; readonly annotation: AnnotationResource }
  | { readonly action: "evidence"; readonly key: string; readonly selected: boolean }
  | { readonly action: "link-annotation"; readonly annotationId: string }
  | { readonly action: "open-passage"; readonly anchor: ManuscriptAnchorSelector }
  | { readonly action: "open-pdf"; readonly annotationId?: string; readonly page?: number; readonly pdf: PdfResource }
  | { readonly action: "remove-fragment"; readonly annotationId: string; readonly fragmentId: string }
  | { readonly action: "remove-pdf"; readonly pdf: PdfResource }
  | {
      readonly action: "update-fragment";
      readonly annotationId: string;
      readonly fragmentId: string;
      readonly prefix: string;
      readonly quote: string;
      readonly rects: readonly PdfSelectionRect[];
      readonly suffix: string;
    };

interface ProjectEvidenceData {
  readonly annotations: readonly AnnotationResource[];
  readonly links: readonly PassageLink[];
  readonly pdfs: readonly PdfResource[];
  readonly selectedEvidenceKeys: ReadonlySet<string>;
}

export class ProjectEvidencePanel extends LitElement {
  static override properties = {
    data: { state: true },
    evidenceOpen: { state: true },
    expandedPdfs: { state: true },
  };

  declare private data: ProjectEvidenceData;
  declare private evidenceOpen: boolean;
  declare private expandedPdfs: ReadonlySet<string>;

  constructor() {
    super();
    this.data = { annotations: [], links: [], pdfs: [], selectedEvidenceKeys: new Set() };
    this.evidenceOpen = false;
    this.expandedPdfs = new Set();
  }

  setEvidence(data: ProjectEvidenceData): void {
    const previousTotal = this.data.pdfs.length + this.data.annotations.length;
    this.data = data;
    const total = data.pdfs.length + data.annotations.length;
    if (previousTotal === 0 && total > 0) this.evidenceOpen = true;
    else if (total === 0) this.evidenceOpen = false;
    const pdfIds = new Set(data.pdfs.map((pdf) => pdf.id));
    this.expandedPdfs = new Set([...this.expandedPdfs].filter((id) => pdfIds.has(id)));
  }

  setPassageLinks(links: readonly PassageLink[]): void {
    this.data = { ...this.data, links };
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const total = this.data.pdfs.length + this.data.annotations.length;
    const assigned = new Set(this.data.pdfs.map((pdf) => pdf.id));
    const unassigned = this.data.annotations.filter((annotation) => !assigned.has(annotation.pdfId));
    return html`
      <details
        class="rail-collection"
        id="project-evidence"
        ?hidden=${total === 0}
        .open=${this.evidenceOpen}
        @toggle=${this.toggleEvidence}
      >
        <summary>
          <span>Project evidence</span>
          <span
            class="count-badge"
            id="project-evidence-count"
            title=${`${this.data.pdfs.length} ${this.data.pdfs.length === 1 ? "paper" : "papers"}, ${this.data.annotations.length} ${
              this.data.annotations.length === 1 ? "highlight" : "highlights"
            }`}
            >${total}</span
          >
        </summary>
        <div class="rail-collection-body" id="annotation-list">
          <div class="project-evidence-list" id="pdf-list">${this.data.pdfs.map((pdf) => this.renderPdf(pdf))}</div>
          <div class="project-evidence-orphans" id="unassigned-annotation-list" ?hidden=${unassigned.length === 0}>
            ${unassigned.map((annotation) => this.renderAnnotation(annotation))}
          </div>
        </div>
      </details>
    `;
  }

  protected toggleEvidence(event: Event): void {
    this.evidenceOpen = (event.currentTarget as HTMLDetailsElement).open;
  }

  protected togglePdf(event: Event): void {
    const details = event.currentTarget as HTMLDetailsElement;
    const pdfId = details.dataset.pdfAnnotationGroup;
    if (!pdfId) return;
    const expanded = new Set(this.expandedPdfs);
    if (details.open) expanded.add(pdfId);
    else expanded.delete(pdfId);
    this.expandedPdfs = expanded;
  }

  protected actOnPdf(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const pdf = this.data.pdfs.find((item) => item.id === button.dataset.pdfId);
    if (!pdf) return;
    if (button.dataset.pdfAction === "remove") this.emit({ action: "remove-pdf", pdf });
    else if (button.dataset.pdfAction === "open") this.emit({ action: "open-pdf", pdf });
  }

  protected selectEvidence(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const key = input.dataset.modelEvidenceKey;
    if (key) this.emit({ action: "evidence", key, selected: input.checked });
  }

  protected actOnAnnotation(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const annotation = this.data.annotations.find((item) => item.id === button.dataset.annotationId);
    if (!annotation) return;
    const action = button.dataset.annotationAction;
    if (action === "link") this.emit({ action: "link-annotation", annotationId: annotation.id });
    else if (action === "edit") this.emit({ action: "edit-annotation", annotation });
    else if (action === "delete") this.emit({ action: "delete-annotation", annotation });
    else if (action === "open") {
      const pdf = this.data.pdfs.find((item) => item.id === annotation.pdfId);
      if (pdf) this.emit({ action: "open-pdf", annotationId: annotation.id, page: annotation.page, pdf });
    }
  }

  protected openPassage(event: Event): void {
    const annotationId = (event.currentTarget as HTMLButtonElement).dataset.annotationId;
    const link = this.data.links.find((item) => item.annotationId === annotationId);
    if (link) this.emit({ action: "open-passage", anchor: link.anchor });
  }

  protected actOnFragment(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const annotation = this.data.annotations.find((item) => item.id === button.dataset.annotationId);
    const fragment = annotation?.fragments.find((item) => item.id === button.dataset.fragmentId);
    if (!annotation || !fragment) return;
    const section = button.closest("section");
    const quote = section?.querySelector<HTMLTextAreaElement>("textarea")?.value ?? fragment.quote;
    section?.closest("details")?.removeAttribute("open");
    if (button.dataset.fragmentAction === "remove") {
      this.emit({ action: "remove-fragment", annotationId: annotation.id, fragmentId: fragment.id });
      return;
    }
    const adjustment = button.dataset.fragmentAdjustment as HighlightGeometryAdjustment | undefined;
    this.emit({
      action: "update-fragment",
      annotationId: annotation.id,
      fragmentId: fragment.id,
      prefix: fragment.prefix,
      quote,
      rects: adjustment ? adjustSelectionRects(fragment.rects, adjustment) : fragment.rects,
      suffix: fragment.suffix,
    });
  }

  private renderPdf(pdf: PdfResource): TemplateResult {
    const annotations = this.data.annotations.filter((annotation) => annotation.pdfId === pdf.id);
    return html`
      <article class="project-evidence-paper" data-pdf-resource-id=${pdf.id}>
        <div class="project-evidence-paper-row">
          <button type="button" class="project-evidence-paper-open" data-pdf-id=${pdf.id} data-pdf-action="open" @click=${this.actOnPdf}>
            <span class="eyebrow block">PDF · ${formatBytes(pdf.size)}</span>
            <span class="mt-1 block text-sm leading-5 text-app-text">${pdf.name}</span>
          </button>
          <button
            type="button"
            class="project-evidence-remove"
            data-pdf-id=${pdf.id}
            data-pdf-action="remove"
            aria-label="Remove from project"
            title="Remove this legacy project PDF"
            @click=${this.actOnPdf}
          >
            Remove
          </button>
        </div>
        <details
          class="project-evidence-highlights"
          data-pdf-annotation-group=${pdf.id}
          ?hidden=${annotations.length === 0}
          .open=${this.expandedPdfs.has(pdf.id)}
          @toggle=${this.togglePdf}
        >
          <summary>
            <span>Highlights</span>
            <span class="count-badge" data-pdf-annotation-count=${pdf.id}>${annotations.length}</span>
          </summary>
          <div class="project-evidence-highlight-list" data-pdf-annotations=${pdf.id}>
            ${annotations.map((annotation) => this.renderAnnotation(annotation))}
          </div>
        </details>
      </article>
    `;
  }

  private renderAnnotation(annotation: AnnotationResource): TemplateResult {
    const passage = this.data.links.find((link) => link.annotationId === annotation.id);
    const evidenceKey = modelEvidenceKey("annotation", annotation.id);
    return html`
      <article class="resource-card" data-annotation-resource-id=${annotation.id}>
        <label class="flex items-start gap-2">
          <input
            type="checkbox"
            class="mt-1 accent-app-accent"
            data-annotation-id=${annotation.id}
            data-model-evidence-key=${evidenceKey}
            aria-label=${`Use annotation “${accessibleEvidenceExcerpt(annotation.quote)}” on page ${annotation.page} as model evidence`}
            .checked=${this.data.selectedEvidenceKeys.has(evidenceKey)}
            @change=${this.selectEvidence}
          />
          <span class="min-w-0">
            <span class="eyebrow block">Page ${annotation.page}</span>
            <span class="mt-1 block text-sm leading-5 text-app-text">“${annotation.quote}”</span>
            ${annotation.comment
              ? html`<span class="mt-2 block font-sans text-xs text-app-text-soft">${annotation.comment}</span>`
              : nothing}
          </span>
        </label>
        <div class="mt-3 grid gap-2">
          ${this.annotationButton(annotation, "open", "Open evidence")} ${this.annotationButton(annotation, "edit", "Edit note")}
          ${this.annotationButton(annotation, "link", "Link selected manuscript text")}
          ${this.annotationButton(annotation, "delete", "Delete highlight")}
          ${passage
            ? html`<button
                type="button"
                class="button-secondary w-full justify-center"
                data-annotation-id=${annotation.id}
                data-anchor-link-id=${passage.id}
                data-anchor-status=${passage.resolution.status}
                data-anchor-match=${anchorMatchState(passage.resolution)}
                ?disabled=${passage.resolution.status !== "resolved"}
                @click=${this.openPassage}
              >
                ${anchorActionLabel(passage.resolution)}
              </button>`
            : nothing}
        </div>
        ${this.renderStrokeEditor(annotation)}
      </article>
    `;
  }

  private annotationButton(annotation: AnnotationResource, action: string, label: string): TemplateResult {
    return html`<button
      type="button"
      class="button-secondary w-full justify-center"
      data-annotation-id=${annotation.id}
      data-annotation-action=${action}
      @click=${this.actOnAnnotation}
    >
      ${label}
    </button>`;
  }

  private renderStrokeEditor(annotation: AnnotationResource): TemplateResult {
    return html`
      <details class="mt-3 border-t border-app-line pt-3" .open=${false}>
        <summary class="cursor-pointer font-sans text-xs font-semibold">
          Adjust ${annotation.fragments.length} stroke${annotation.fragments.length === 1 ? "" : "s"}
        </summary>
        ${annotation.fragments.map((fragment, index) => this.renderStroke(annotation, fragment, index))}
      </details>
    `;
  }

  private renderStroke(annotation: AnnotationResource, fragment: AnnotationResource["fragments"][number], index: number): TemplateResult {
    const adjustments = [
      ["←", "left"],
      ["↑", "up"],
      ["↓", "down"],
      ["→", "right"],
      ["Wider", "wider"],
      ["Narrower", "narrower"],
      ["Taller", "taller"],
      ["Shorter", "shorter"],
    ] as const;
    return html`
      <section class="mt-3 border border-app-line bg-app-paper p-3">
        <textarea
          class="field min-h-16"
          maxlength="20000"
          aria-label=${`Text for highlight stroke ${index + 1}`}
          .value=${fragment.quote}
        ></textarea>
        <div class="touch-adjustments mt-2 flex flex-wrap gap-2">
          ${adjustments.map(
            ([label, adjustment]) =>
              html`<button
                type="button"
                class="button-secondary"
                data-annotation-id=${annotation.id}
                data-fragment-id=${fragment.id}
                data-fragment-adjustment=${adjustment}
                aria-label=${`${label} highlight stroke ${index + 1}`}
                @click=${this.actOnFragment}
              >
                ${label}
              </button>`,
          )}
          <button
            type="button"
            class="button-primary"
            data-annotation-id=${annotation.id}
            data-fragment-id=${fragment.id}
            data-fragment-action="save"
            @click=${this.actOnFragment}
          >
            Save text
          </button>
          <button
            type="button"
            class="button-secondary"
            data-annotation-id=${annotation.id}
            data-fragment-id=${fragment.id}
            data-fragment-action="remove"
            @click=${this.actOnFragment}
          >
            Erase stroke
          </button>
        </div>
      </section>
    `;
  }

  private emit(detail: ProjectEvidenceAction): void {
    this.dispatchEvent(new CustomEvent(projectEvidenceActionEvent, { bubbles: true, composed: true, detail }));
  }
}

if (typeof customElements !== "undefined" && !customElements.get("project-evidence-panel")) {
  customElements.define("project-evidence-panel", ProjectEvidencePanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-evidence-panel": ProjectEvidencePanel;
  }
}
