import { html, type TemplateResult } from "lit";
import { libraryPdfRectsOverlap } from "../domain/reference-library";
import type { AnnotationResource, CreateAnnotationInput, PdfResource, PublicationPdfLink, PublicationResource } from "../domain/workspace";
import { isCreatedAnnotation } from "./app-contracts";
import { errorMessage, expectOk, jsonFetch } from "./http";
import { EagerLightDomElement } from "./light-dom-controller";
import "./publication-intake-panel";
import type { PublicationIntakeAction, PublicationIntakePanel } from "./publication-intake-panel";

export type ProjectHighlightTool = "paint" | "erase";
export interface ProjectAnnotationCompletion {
  readonly clearDraftSelection: boolean;
  readonly linkAnnotationId?: string;
  readonly notice?: string;
  readonly refreshResources: boolean;
}

export interface ProjectAnnotationOverlap {
  readonly annotation: AnnotationResource;
  readonly fragment: AnnotationResource["fragments"][number];
}

export interface ProjectAnnotationWorkflowBinding {
  readonly chooseTool: (tool: ProjectHighlightTool) => void;
  readonly completeWorkflow?: (completion: ProjectAnnotationCompletion) => Promise<void>;
  readonly citePage: () => void;
  readonly removeHighlight: (annotationId: string, fragmentId: string) => Promise<boolean>;
  readonly revealHighlight: (annotationId: string) => void;
}

export interface ProjectAnnotationIntakeBinding {
  readonly openPublication: (publication: PublicationResource) => void;
  readonly presentNotice: (message: string) => void;
  readonly publications: () => readonly PublicationResource[];
  readonly refresh: () => Promise<void>;
}

type AnnotationDraft = Pick<AnnotationResource, "comment" | "id" | "page" | "prefix" | "quote" | "suffix">;
type AnnotationCapture = Pick<CreateAnnotationInput, "page" | "prefix" | "quote" | "rects" | "suffix">;
type PdfChoice = Pick<PdfResource, "id" | "name">;
type UndoStroke = { readonly annotationId: string; readonly fragmentId: string };
interface IntakeContext {
  readonly pdfId: string;
  readonly publicationPdfLinks: readonly PublicationPdfLink[];
  readonly publications: readonly PublicationResource[];
}

export class ProjectAnnotationForm extends EagerLightDomElement {
  static override properties = {
    comment: { state: true },
    citationCount: { state: true },
    page: { state: true },
    pdfs: { state: true },
    quotePrefix: { state: true },
    quote: { state: true },
    selectedPdfId: { state: true },
    status: { state: true },
    tool: { state: true },
    undoStroke: { state: true },
    visible: { state: true },
    quoteSuffix: { state: true },
  };

  declare private comment: string;
  declare private citationCount: number;
  private editingAnnotationId: string | null = null;
  declare private page: number;
  declare private pdfs: readonly PdfChoice[];
  declare private quotePrefix: string;
  declare private quote: string;
  declare private selectedPdfId: string;
  declare private status: string;
  declare private tool: ProjectHighlightTool;
  declare private undoStroke: UndoStroke | null;
  declare private visible: boolean;
  declare private quoteSuffix: string;
  private apiBase = "";
  private intakeBinding: ProjectAnnotationIntakeBinding | undefined;
  private intakeContext: IntakeContext | undefined;
  private workflowBinding: ProjectAnnotationWorkflowBinding | undefined;

  constructor() {
    super();
    this.comment = "";
    this.citationCount = 0;
    this.page = 1;
    this.pdfs = [];
    this.quotePrefix = "";
    this.quote = "";
    this.selectedPdfId = "";
    this.status = "Select text in the paper to capture its quotation, context, page, and geometry.";
    this.tool = "paint";
    this.undoStroke = null;
    this.visible = true;
    this.quoteSuffix = "";
  }

  setPdfs(pdfs: readonly PdfChoice[], selectedPdfId = this.selectedPdfId): void {
    this.pdfs = pdfs;
    this.selectedPdfId = pdfs.some((pdf) => pdf.id === selectedPdfId) ? selectedPdfId : (pdfs[0]?.id ?? "");
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
    this.intake?.configure(apiBase);
  }

  bindIntake(binding: ProjectAnnotationIntakeBinding): void {
    this.intakeBinding = binding;
  }

  bindWorkflow(binding: ProjectAnnotationWorkflowBinding): void {
    this.workflowBinding = binding;
  }

  setIntakePdf(pdfId: string, publications: readonly PublicationResource[], links: readonly PublicationPdfLink[]): void {
    this.intakeContext = { pdfId, publications, publicationPdfLinks: links };
    this.syncIntake();
  }

  selectPdf(pdfId: string): void {
    if (this.pdfs.some((pdf) => pdf.id === pdfId)) this.selectedPdfId = pdfId;
  }

  showCapture(capture: AnnotationCapture): void {
    this.editingAnnotationId = null;
    this.applyCapture(capture);
    this.status =
      this.tool === "erase"
        ? "Erasing overlapping highlight strokes…"
        : `Captured ${capture.rects.length} ${capture.rects.length === 1 ? "line" : "lines"} from page ${capture.page}. Saving automatically…`;
  }

  overlappingFragments(annotations: readonly AnnotationResource[], pdfId: string, capture: AnnotationCapture): ProjectAnnotationOverlap[] {
    return annotations
      .filter((annotation) => annotation.pdfId === pdfId && annotation.page === capture.page)
      .flatMap((annotation) =>
        annotation.fragments
          .filter((fragment) => libraryPdfRectsOverlap(fragment.rects, capture.rects))
          .map((fragment) => ({ annotation, fragment })),
      );
  }

  async eraseOverlaps(overlaps: readonly ProjectAnnotationOverlap[]): Promise<boolean | null> {
    if (overlaps.length === 0) {
      this.status = "The eraser did not cross a saved highlight stroke.";
      return false;
    }
    const removeHighlight = this.workflowBinding?.removeHighlight;
    if (!removeHighlight) return null;
    for (const { annotation, fragment } of overlaps) {
      if (!(await removeHighlight(annotation.id, fragment.id))) return null;
    }
    this.status = `Removed ${overlaps.length} overlapping highlight ${overlaps.length === 1 ? "stroke" : "strokes"}.`;
    return true;
  }

  async persistCapture(annotations: readonly AnnotationResource[], pdfId: string, capture: AnnotationCapture): Promise<void> {
    const overlaps = this.overlappingFragments(annotations, pdfId, capture);
    if (this.tool === "erase") {
      const erased = await this.eraseOverlaps(overlaps);
      if (erased === null) return;
      await this.workflowBinding?.completeWorkflow?.({
        clearDraftSelection: true,
        ...(erased ? { notice: "Highlight content erased." } : {}),
        refreshResources: false,
      });
      return;
    }
    if (!(await this.saveCapture(pdfId, capture, overlaps[0]?.annotation.id))) return;
    await this.workflowBinding?.completeWorkflow?.({ clearDraftSelection: true, refreshResources: true });
  }

  async activateHighlight(annotations: readonly AnnotationResource[], annotationId: string, fragmentId: string): Promise<void> {
    if (this.tool === "erase") {
      if (await this.workflowBinding?.removeHighlight(annotationId, fragmentId)) await this.completeNotice("Highlight stroke erased.");
      return;
    }
    const annotation = annotations.find(({ id }) => id === annotationId);
    if (!annotation) return;
    this.showAnnotation(annotation);
    this.workflowBinding?.revealHighlight(annotationId);
  }

  private applyCapture(capture: Pick<AnnotationDraft, "page" | "prefix" | "quote" | "suffix">): void {
    this.page = capture.page;
    this.quotePrefix = capture.prefix;
    this.quote = capture.quote;
    this.quoteSuffix = capture.suffix;
  }

  showAnnotation(annotation: AnnotationDraft): void {
    this.editingAnnotationId = annotation.id;
    this.comment = annotation.comment;
    this.applyCapture(annotation);
  }

  clearAnnotation(annotationId: string): void {
    if (this.editingAnnotationId === annotationId) this.editingAnnotationId = null;
    if (this.undoStroke?.annotationId === annotationId) this.undoStroke = null;
  }

  setStatus(status: string): void {
    this.status = status;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  setTool(tool: ProjectHighlightTool): void {
    this.tool = tool;
    this.status =
      tool === "paint"
        ? "Paint PDF text to save or extend a highlight."
        : "Select across a saved highlight stroke or tap it to erase that content.";
  }

  setUndoStroke(stroke: UndoStroke | null): void {
    this.undoStroke = stroke;
  }

  setCitationContext(pdfId: string | null, links: readonly PublicationPdfLink[]): void {
    this.citationCount = pdfId ? links.filter((link) => link.pdfId === pdfId).length : 0;
  }

  async saveCapture(pdfId: string, capture: AnnotationCapture, targetId?: string): Promise<boolean> {
    this.status = targetId ? "Adding highlight stroke…" : "Saving highlight…";
    try {
      const response = targetId
        ? await jsonFetch(`${this.apiBase}/annotations/${encodeURIComponent(targetId)}/fragments`, capture)
        : await jsonFetch(`${this.apiBase}/annotations`, { pdfId, ...capture, comment: "" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isCreatedAnnotation(value)) throw new Error("Highlight endpoint returned an invalid resource");
      const fragment = value.fragments.at(-1);
      if (!fragment) throw new Error("Highlight endpoint omitted the saved stroke");
      this.setUndoStroke({ annotationId: value.id, fragmentId: fragment.id });
      this.showAnnotation(value);
      this.status = targetId
        ? `Added a stroke to the existing highlight. ${value.fragments.length} strokes saved automatically.`
        : "Highlight saved automatically. Add an optional note or link it to selected manuscript prose.";
      return true;
    } catch (error) {
      this.status = errorMessage(error, "Could not save the highlight.");
      return false;
    }
  }

  protected override firstUpdated(): void {
    this.intake?.configure(this.apiBase);
    this.syncIntake();
  }

  protected override render(): TemplateResult {
    return html`
      <aside class="annotation-composer" id="annotation-composer" aria-labelledby="annotation-composer-title" ?hidden=${!this.visible}>
        <details class="publication-intake" id="publication-intake">
          <summary><span id="publication-intake-heading">Identify reference</span><span class="count-badge">Optional</span></summary>
          <publication-intake-panel
            class="publication-intake-body"
            id="publication-intake-panel"
            @publication-intake-action=${this.handleIntake}
          ></publication-intake-panel>
        </details>
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p class="eyebrow">Evidence capture</p>
            <h2 class="mt-1 text-lg font-semibold tracking-[-0.035em]" id="annotation-composer-title">Annotate this paper</h2>
          </div>
          <button class="button-secondary" id="cite-active-pdf" type="button" ?disabled=${this.citationCount !== 1} @click=${this.citePage}>
            ${this.citationLabel}
          </button>
        </div>
        <div class="highlight-tools" role="group" aria-label="PDF highlight tool">
          <button
            class="button-secondary"
            id="highlight-paint-tool"
            type="button"
            aria-pressed=${String(this.tool === "paint")}
            @click=${() => this.chooseTool("paint")}
          >
            Paint
          </button>
          <button
            class="button-secondary"
            id="highlight-eraser-tool"
            type="button"
            aria-pressed=${String(this.tool === "erase")}
            @click=${() => this.chooseTool("erase")}
          >
            Eraser
          </button>
          <button class="button-secondary" id="undo-highlight" type="button" ?disabled=${!this.undoStroke} @click=${this.undoHighlight}>
            Undo last stroke
          </button>
        </div>
        <p class="mt-2 text-xs leading-5 text-app-text-soft" id="annotation-selection-status">${this.status}</p>
        <form class="mt-3 grid gap-3 sm:grid-cols-2" id="annotation-form" @submit=${this.save}>
          <label class="field-label sm:col-span-2"
            >Paper
            <select class="field" id="annotation-pdf" required disabled .value=${this.selectedPdfId}>
              ${this.pdfs.length === 0
                ? html`<option value="">Import a PDF first</option>`
                : this.pdfs.map((pdf) => html`<option value=${pdf.id}>${pdf.name}</option>`)}
            </select>
          </label>
          <label class="field-label"
            >Page
            <input
              class="field"
              id="annotation-page"
              type="number"
              min="1"
              required
              .value=${String(this.page)}
              @input=${this.changePage}
            />
          </label>
          <label class="field-label"
            >Your note
            <input
              class="field"
              id="annotation-comment"
              type="text"
              placeholder="Why this matters"
              .value=${this.comment}
              @input=${this.changeComment}
            />
          </label>
          <label class="field-label sm:col-span-2"
            >Exact quotation
            <textarea
              class="field min-h-20"
              id="annotation-quote"
              required
              readonly
              placeholder="Select a passage in the paper"
              .value=${this.quote}
            ></textarea>
          </label>
          <label class="field-label"
            >Text before
            <input
              class="field"
              id="annotation-prefix"
              type="text"
              placeholder="Context before selection"
              .value=${this.quotePrefix}
              @input=${this.changePrefix}
            />
          </label>
          <label class="field-label"
            >Text after
            <input
              class="field"
              id="annotation-suffix"
              type="text"
              placeholder="Context after selection"
              .value=${this.quoteSuffix}
              @input=${this.changeSuffix}
            />
          </label>
          <div class="grid gap-2 sm:col-span-2 sm:grid-cols-2">
            <button class="button-primary justify-center" type="submit">Save note</button>
            <button class="button-secondary justify-center" id="save-and-link-annotation" type="submit">Link highlight to selection</button>
          </div>
        </form>
      </aside>
    `;
  }

  private get citationLabel(): string {
    if (this.citationCount > 1) return "Choose reference to cite";
    return this.citationCount === 1 ? "Cite current page" : "Identify before citing";
  }

  protected chooseTool(tool: ProjectHighlightTool): void {
    this.setTool(tool);
    this.workflowBinding?.chooseTool(tool);
  }

  protected undoHighlight(): void {
    const stroke = this.undoStroke;
    if (stroke) void this.completeUndo(stroke);
  }

  private async completeUndo(stroke: UndoStroke): Promise<void> {
    if (!(await this.workflowBinding?.removeHighlight(stroke.annotationId, stroke.fragmentId))) return;
    this.setUndoStroke(null);
    await this.completeNotice("Last highlight stroke undone.");
  }

  private async completeNotice(notice: string): Promise<void> {
    await this.workflowBinding?.completeWorkflow?.({ clearDraftSelection: false, notice, refreshResources: false });
  }

  protected citePage(): void {
    this.workflowBinding?.citePage();
  }

  protected async handleIntake(event: CustomEvent<PublicationIntakeAction>): Promise<void> {
    const binding = this.intakeBinding;
    const intake = this.intake;
    if (!binding || !intake) return;
    const detail = event.detail;
    if (detail.action === "open-reference") {
      const publication = binding.publications().find(({ id }) => id === detail.publicationId);
      if (publication) binding.openPublication(publication);
      return;
    }
    try {
      await binding.refresh();
      const publication = binding.publications().find(({ doi }) => doi === detail.doi);
      if (!publication) throw new Error("The connected publication could not be found");
      if (!intake.completeAcceptance(detail.requestId)) return;
      binding.openPublication(publication);
      binding.presentNotice("Reference added and connected; the manuscript is unchanged.");
    } catch (error) {
      intake.failAcceptance(detail.requestId, error);
    }
  }

  protected async save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const annotationId = this.editingAnnotationId;
    if (!annotationId) {
      this.status = "Paint a highlight in the PDF before adding a note or manuscript link.";
      return;
    }
    this.status = "Saving highlight note…";
    try {
      const response = await jsonFetch(`${this.apiBase}/annotations/${encodeURIComponent(annotationId)}`, { comment: this.comment }, "PUT");
      await expectOk(response);
      const message = "Highlight note saved.";
      this.status = message;
      const link = (event.submitter as HTMLElement | null)?.id === "save-and-link-annotation";
      void this.workflowBinding?.completeWorkflow?.({
        clearDraftSelection: false,
        ...(link && { linkAnnotationId: annotationId }),
        ...(!link && { notice: message }),
        refreshResources: true,
      });
    } catch (error) {
      this.status = errorMessage(error, "Could not save the highlight note.");
    }
  }

  protected changeComment(event: Event): void {
    this.comment = inputValue(event);
  }

  protected changePage(event: Event): void {
    this.page = Number.parseInt(inputValue(event), 10);
  }

  protected changePrefix(event: Event): void {
    this.quotePrefix = inputValue(event);
  }

  protected changeSuffix(event: Event): void {
    this.quoteSuffix = inputValue(event);
  }

  private syncIntake(): void {
    const context = this.intakeContext;
    if (context) this.intake?.setPdf(context.pdfId, context.publications, context.publicationPdfLinks);
  }

  protected get intake(): PublicationIntakePanel | null {
    return this.querySelector<PublicationIntakePanel>("publication-intake-panel");
  }
}

function inputValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value;
}

if (typeof customElements !== "undefined" && !customElements.get("project-annotation-form")) {
  customElements.define("project-annotation-form", ProjectAnnotationForm);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-annotation-form": ProjectAnnotationForm;
  }
}
