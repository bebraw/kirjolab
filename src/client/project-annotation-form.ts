import { html, LitElement, type TemplateResult } from "lit";
import type { AnnotationResource, PdfResource } from "../domain/workspace";

export const projectAnnotationSaveEvent = "project-annotation-save";

export interface ProjectAnnotationSave {
  comment: string;
  link: boolean;
}

type AnnotationDraft = Pick<AnnotationResource, "comment" | "page" | "prefix" | "quote" | "suffix">;
type PdfChoice = Pick<PdfResource, "id" | "name">;

export class ProjectAnnotationForm extends LitElement {
  static override properties = {
    comment: { state: true },
    page: { state: true },
    pdfs: { state: true },
    quotePrefix: { state: true },
    quote: { state: true },
    selectedPdfId: { state: true },
    status: { state: true },
    quoteSuffix: { state: true },
  };

  declare private comment: string;
  declare private page: number;
  declare private pdfs: readonly PdfChoice[];
  declare private quotePrefix: string;
  declare private quote: string;
  declare private selectedPdfId: string;
  declare private status: string;
  declare private quoteSuffix: string;

  constructor() {
    super();
    this.comment = "";
    this.page = 1;
    this.pdfs = [];
    this.quotePrefix = "";
    this.quote = "";
    this.selectedPdfId = "";
    this.status = "Select text in the paper to capture its quotation, context, page, and geometry.";
    this.quoteSuffix = "";
  }

  setPdfs(pdfs: readonly PdfChoice[], selectedPdfId = this.selectedPdfId): void {
    this.pdfs = pdfs;
    this.selectedPdfId = pdfs.some((pdf) => pdf.id === selectedPdfId) ? selectedPdfId : (pdfs[0]?.id ?? "");
  }

  selectPdf(pdfId: string): void {
    if (this.pdfs.some((pdf) => pdf.id === pdfId)) this.selectedPdfId = pdfId;
  }

  showCapture(capture: Pick<AnnotationDraft, "page" | "prefix" | "quote" | "suffix">): void {
    this.page = capture.page;
    this.quotePrefix = capture.prefix;
    this.quote = capture.quote;
    this.quoteSuffix = capture.suffix;
  }

  showAnnotation(annotation: AnnotationDraft): void {
    this.comment = annotation.comment;
    this.showCapture(annotation);
  }

  setStatus(status: string): void {
    this.status = status;
  }

  /* v8 ignore start -- exercised by browser fallback rendering */
  override connectedCallback(): void {
    if (!this.hasUpdated && typeof this.replaceChildren === "function") this.replaceChildren();
    super.connectedCallback();
  }
  /* v8 ignore stop */

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
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
          <input class="field" id="annotation-page" type="number" min="1" required .value=${String(this.page)} @input=${this.changePage} />
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
    `;
  }

  protected save(event: SubmitEvent): void {
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent<ProjectAnnotationSave>(projectAnnotationSaveEvent, {
        bubbles: true,
        detail: {
          comment: this.comment,
          link: (event.submitter as HTMLElement | null)?.id === "save-and-link-annotation",
        },
      }),
    );
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
