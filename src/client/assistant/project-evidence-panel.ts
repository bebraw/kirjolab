import { html, nothing, type TemplateResult } from "lit";
import { LightDomElement } from "../platform/light-dom-controller";
import type {
  AnnotationResource,
  CreatePassageLinkInput,
  ManuscriptAnchorSelector,
  PassageLink,
  PdfResource,
  UpdateAnnotationFragmentInput,
  WorkspaceSnapshot,
} from "../../domain/workspace/workspace";
import { formatBytes } from "../platform/format";
import { errorMessage, expectOk, jsonFetch } from "../platform/http";
import { focusFirstModelEvidence } from "./model-evidence-focus";
import { adjustSelectionRects, type HighlightGeometryAdjustment } from "../pdf/pdf-selection";
import {
  accessibleEvidenceExcerpt,
  anchorActionLabel,
  anchorMatchState,
  modelEvidenceKey,
} from "../context/research-resource-presentation";

export interface ProjectEvidenceBinding {
  readonly annotationRemoved: (annotationId: string, message: string) => void;
  readonly completeMutation: (message: string) => void;
  readonly editAnnotation: (annotation: AnnotationResource) => void;
  readonly fragmentRemoved: (result: ProjectEvidenceFragmentRemoval) => Promise<void>;
  readonly linkAnnotation: (annotationId: string) => void;
  readonly notice: (message: string) => void;
  readonly openPassage: (anchor: ManuscriptAnchorSelector) => void;
  readonly openPdf: (pdf: PdfResource, page?: number, annotationId?: string) => void;
}

export interface ProjectEvidenceFragmentRemoval {
  readonly annotationDeleted: boolean;
  readonly annotationId: string;
  readonly announce: boolean;
}

type ProjectEvidenceSnapshot = Pick<WorkspaceSnapshot, "annotations" | "claimEvidenceLinks" | "links" | "pdfs" | "publicationPdfLinks">;

type ProjectEvidenceData = Omit<ProjectEvidenceSnapshot, "links"> & {
  readonly links: readonly PassageLink[];
  readonly selectedEvidenceKeys: ReadonlySet<string>;
};

export class ProjectEvidencePanel extends LightDomElement {
  static override properties = {
    data: { state: true },
    evidenceOpen: { state: true },
    expandedPdfs: { state: true },
    mutationKey: { state: true },
    status: { state: true },
    uploadBusy: { state: true },
  };

  declare private data: ProjectEvidenceData;
  declare private evidenceOpen: boolean;
  declare private expandedPdfs: ReadonlySet<string>;
  declare private mutationKey: string;
  declare private status: string;
  declare private uploadBusy: boolean;
  private apiBase = "";
  private binding: ProjectEvidenceBinding | undefined;
  private selectModelEvidence: ((key: string, selected: boolean) => void) | undefined;

  constructor() {
    super();
    this.data = { annotations: [], claimEvidenceLinks: [], links: [], pdfs: [], publicationPdfLinks: [], selectedEvidenceKeys: new Set() };
    this.evidenceOpen = false;
    this.expandedPdfs = new Set();
    this.mutationKey = "";
    this.status = "";
    this.uploadBusy = false;
  }

  configure(apiBase: string): void {
    this.apiBase = apiBase;
  }

  bind(binding: ProjectEvidenceBinding): void {
    this.binding = binding;
  }

  bindEvidenceSelection(selectEvidence: (key: string, selected: boolean) => void): void {
    this.selectModelEvidence = selectEvidence;
  }

  setEvidence(snapshot: ProjectEvidenceSnapshot, selectedEvidenceKeys: ReadonlySet<string>): void {
    const data = {
      annotations: snapshot.annotations,
      claimEvidenceLinks: snapshot.claimEvidenceLinks,
      links: snapshot.links,
      pdfs: snapshot.pdfs,
      publicationPdfLinks: snapshot.publicationPdfLinks,
      selectedEvidenceKeys,
    };
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

  focusEvidence(): boolean {
    return focusFirstModelEvidence(this);
  }

  revealAnnotation(annotationId: string): boolean {
    const card = [...this.querySelectorAll<HTMLElement>("[data-annotation-resource-id]")].find(
      ({ dataset }) => dataset.annotationResourceId === annotationId,
    );
    if (!card) return false;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }

  async linkPassage(input: CreatePassageLinkInput): Promise<void> {
    this.status = "Linking highlight to passage…";
    try {
      const response = await jsonFetch(`${this.apiBase}/links`, input);
      await expectOk(response);
      this.status = "";
      this.binding?.completeMutation("Annotation linked to the selected passage.");
    } catch (error) {
      this.status = errorMessage(error, "Could not link the annotation to the selected passage.");
    }
  }

  async removeFragment(annotationId: string, fragmentId: string, announce = false): Promise<boolean> {
    if (this.mutationKey) return false;
    this.mutationKey = `fragment:${fragmentId}`;
    this.status = "Erasing highlight stroke…";
    try {
      const response = await fetch(
        `${this.apiBase}/annotations/${encodeURIComponent(annotationId)}/fragments/${encodeURIComponent(fragmentId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      await expectOk(response);
      this.status = "";
      await this.binding?.fragmentRemoved({ annotationDeleted: response.status === 204, annotationId, announce });
      return true;
    } catch (error) {
      this.status = errorMessage(error, "Could not erase the highlight stroke.");
      return false;
    } finally {
      this.mutationKey = "";
    }
  }

  async updateFragment(annotationId: string, fragmentId: string, input: UpdateAnnotationFragmentInput): Promise<boolean> {
    const quote = input.quote.trim();
    if (!quote) {
      this.status = "A highlight stroke needs enough text to find the idea again.";
      return false;
    }
    if (this.mutationKey) return false;
    this.mutationKey = `fragment:${fragmentId}`;
    this.status = "Adjusting highlight stroke…";
    try {
      const response = await jsonFetch(
        `${this.apiBase}/annotations/${encodeURIComponent(annotationId)}/fragments/${encodeURIComponent(fragmentId)}`,
        { ...input, quote },
        "PUT",
      );
      await expectOk(response);
      this.status = "";
      return true;
    } catch (error) {
      this.status = errorMessage(error, "Could not adjust the highlight stroke.");
      return false;
    } finally {
      this.mutationKey = "";
    }
  }

  protected override render(): TemplateResult {
    const total = this.data.pdfs.length + this.data.annotations.length;
    const assigned = new Set(this.data.pdfs.map((pdf) => pdf.id));
    const unassigned = this.data.annotations.filter((annotation) => !assigned.has(annotation.pdfId));
    return html`
      <input
        class="sr-only"
        id="pdf-upload"
        type="file"
        accept="application/pdf"
        aria-label="Upload project PDF"
        ?disabled=${this.uploadBusy}
        @change=${this.selectPdf}
      />
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
      <p class="status-line px-1" role="status" ?hidden=${!this.status}>${this.status}</p>
    `;
  }

  protected selectPdf(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    void this.uploadPdf(input.files?.[0] ?? null).finally(() => {
      input.value = "";
    });
  }

  async uploadPdf(file: File | null): Promise<void> {
    if (!file || this.uploadBusy) return;
    if (file.type !== "application/pdf") {
      this.status = "Choose a PDF file.";
      return;
    }
    this.uploadBusy = true;
    this.status = `Importing ${file.name}…`;
    try {
      const response = await fetch(`${this.apiBase}/pdfs`, {
        method: "POST",
        headers: { "content-type": "application/pdf", "x-file-name": encodeURIComponent(file.name) },
        body: file,
      });
      await expectOk(response);
      this.status = "";
      this.binding?.completeMutation("PDF imported without modifying the source file.");
    } catch (error) {
      this.status = errorMessage(error, `Could not import ${file.name}.`);
    } finally {
      this.uploadBusy = false;
    }
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
    if (button.dataset.pdfAction === "remove") void this.removePdf(pdf);
    else if (button.dataset.pdfAction === "open") this.binding?.openPdf(pdf);
  }

  protected async removePdf(pdf: PdfResource): Promise<void> {
    if (this.mutationKey) return;
    const annotations = this.data.annotations.filter((annotation) => annotation.pdfId === pdf.id).length;
    const references = this.data.publicationPdfLinks.filter((link) => link.pdfId === pdf.id).length;
    if (annotations + references > 0) {
      const message = `Cannot remove ${pdf.name}: remove ${annotations} highlight(s) and ${references} reference link(s) first.`;
      this.status = message;
      this.binding?.notice(message);
      return;
    }
    if (!globalThis.confirm(`Remove ${pdf.name} from this project? The imported PDF bytes will be deleted.`)) return;
    this.mutationKey = `pdf:${pdf.id}`;
    this.status = `Removing ${pdf.name}…`;
    try {
      const response = await fetch(`${this.apiBase}/pdfs/${encodeURIComponent(pdf.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      await expectOk(response);
      this.status = "";
      this.binding?.completeMutation(`${pdf.name} removed from the project.`);
    } catch (error) {
      this.status = errorMessage(error, `Could not remove ${pdf.name}.`);
    } finally {
      this.mutationKey = "";
    }
  }

  protected selectEvidence(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const key = input.dataset.modelEvidenceKey;
    if (key) this.selectModelEvidence?.(key, input.checked);
  }

  protected actOnAnnotation(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const annotation = this.data.annotations.find((item) => item.id === button.dataset.annotationId);
    if (!annotation) return;
    const action = button.dataset.annotationAction;
    if (action === "link") this.binding?.linkAnnotation(annotation.id);
    else if (action === "edit") this.binding?.editAnnotation(annotation);
    else if (action === "delete") void this.removeAnnotation(annotation);
    else if (action === "open") {
      const pdf = this.data.pdfs.find((item) => item.id === annotation.pdfId);
      if (pdf) this.binding?.openPdf(pdf, annotation.page, annotation.id);
    }
  }

  protected async removeAnnotation(annotation: AnnotationResource): Promise<void> {
    if (this.mutationKey) return;
    const claims = this.data.claimEvidenceLinks.filter((link) => link.annotationId === annotation.id).length;
    if (claims > 0) {
      const message = `Remove this highlight from ${claims} claim(s) before deleting it.`;
      this.status = message;
      this.binding?.notice(message);
      return;
    }
    const passages = this.data.links.filter((link) => link.annotationId === annotation.id).length;
    if (!globalThis.confirm(`Delete this highlight and its ${passages} manuscript link(s)?`)) return;
    this.mutationKey = `annotation:${annotation.id}`;
    this.status = "Deleting highlight…";
    try {
      const response = await fetch(`${this.apiBase}/annotations/${encodeURIComponent(annotation.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      await expectOk(response);
      this.status = "";
      this.binding?.annotationRemoved(annotation.id, "Highlight deleted; the PDF remains unchanged.");
    } catch (error) {
      this.status = errorMessage(error, "Could not delete the highlight.");
    } finally {
      this.mutationKey = "";
    }
  }

  protected openPassage(event: Event): void {
    const annotationId = (event.currentTarget as HTMLButtonElement).dataset.annotationId;
    const link = this.data.links.find((item) => item.annotationId === annotationId);
    if (link) this.binding?.openPassage(link.anchor);
  }

  protected async actOnFragment(event: Event): Promise<void> {
    const button = event.currentTarget as HTMLButtonElement;
    const annotation = this.data.annotations.find((item) => item.id === button.dataset.annotationId);
    const fragment = annotation?.fragments.find((item) => item.id === button.dataset.fragmentId);
    if (!annotation || !fragment) return;
    const section = button.closest("section");
    const quote = section?.querySelector<HTMLTextAreaElement>("textarea")?.value ?? fragment.quote;
    section?.closest("details")?.removeAttribute("open");
    if (button.dataset.fragmentAction === "remove") {
      await this.removeFragment(annotation.id, fragment.id, true);
      return;
    }
    const adjustment = button.dataset.fragmentAdjustment as HighlightGeometryAdjustment | undefined;
    const updated = await this.updateFragment(annotation.id, fragment.id, {
      prefix: fragment.prefix,
      quote,
      rects: [...(adjustment ? adjustSelectionRects(fragment.rects, adjustment) : fragment.rects)],
      suffix: fragment.suffix,
    });
    if (updated) this.binding?.completeMutation("Highlight stroke adjusted.");
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
            ?disabled=${Boolean(this.mutationKey)}
            @click=${this.actOnPdf}
          >
            ${this.mutationKey === `pdf:${pdf.id}` ? "Removing…" : "Remove"}
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
    const removing = action === "delete" && this.mutationKey === `annotation:${annotation.id}`;
    return html`<button
      type="button"
      class="button-secondary w-full justify-center"
      data-annotation-id=${annotation.id}
      data-annotation-action=${action}
      ?disabled=${action === "delete" && Boolean(this.mutationKey)}
      @click=${this.actOnAnnotation}
    >
      ${removing ? "Deleting…" : label}
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
}

if (typeof customElements !== "undefined" && !customElements.get("project-evidence-panel")) {
  customElements.define("project-evidence-panel", ProjectEvidencePanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "project-evidence-panel": ProjectEvidencePanel;
  }
}
