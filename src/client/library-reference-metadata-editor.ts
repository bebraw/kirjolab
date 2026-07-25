import { html, LitElement, nothing, type TemplateResult } from "lit";
import {
  crossrefMetadataFields,
  type BibliographicRecord,
  type CrossrefMetadataField,
  type LibraryPdfArtifact,
  type MetadataRefinementCandidate,
  type MetadataRefinementPreview,
  type ReferenceMetadataField,
} from "../domain/reference-library";
import { groupMetadataCandidates, metadataFieldValue } from "./metadata-refinement";
import type { PdfMetadataCandidates } from "./pdf-metadata";

export type LibraryReferenceMetadataValue = Readonly<Record<ReferenceMetadataField, string>>;

export interface ProviderMetadataSelection {
  readonly candidateIndex: number;
  readonly fields: readonly CrossrefMetadataField[];
}

export type LibraryReferenceMetadataAction =
  | { readonly action: "save"; readonly referenceId: string; readonly value: LibraryReferenceMetadataValue }
  | { readonly action: "refine"; readonly reference: BibliographicRecord; readonly artifact: LibraryPdfArtifact }
  | {
      readonly action: "apply-pdf";
      readonly artifactId: string;
      readonly fields: Readonly<Partial<Record<ReferenceMetadataField, string | readonly string[]>>>;
      readonly referenceId: string;
    }
  | {
      readonly action: "apply-provider";
      readonly candidates: readonly MetadataRefinementCandidate[];
      readonly referenceId: string;
      readonly selections: readonly ProviderMetadataSelection[];
    };

export const libraryReferenceMetadataActionEvent = "library-reference-metadata-action";

interface MetadataReview {
  readonly kind: "review";
  readonly artifact: LibraryPdfArtifact;
  readonly local: PdfMetadataCandidates;
  readonly preview: MetadataRefinementPreview;
  readonly providerError: string;
  readonly reusedPreview: boolean;
}

type RefinementPresentation =
  | { readonly kind: "hidden" }
  | { readonly kind: "status"; readonly label: string; readonly message: string }
  | MetadataReview;

const emptyValue: LibraryReferenceMetadataValue = {
  type: "",
  title: "",
  authors: "",
  year: "",
  venue: "",
  doi: "",
  url: "",
  abstract: "",
};

const textFields = ["type", "title", "authors", "year", "venue", "doi", "url"] as const;
const pdfFields = ["title", "authors", "year", "doi"] as const;

export class LibraryReferenceMetadataEditor extends LitElement {
  static override properties = {
    value: { state: true },
    refinement: { state: true },
  };

  declare private value: LibraryReferenceMetadataValue;
  declare private refinement: RefinementPresentation;
  private reference: BibliographicRecord | null = null;
  private primaryArtifact: LibraryPdfArtifact | null = null;
  private displayTitle = "";
  private selectedWork = 0;
  private readonly pdfSelections = new Set<CrossrefMetadataField>();
  private readonly providerSelections = new Map<CrossrefMetadataField, number | null>();

  constructor() {
    super();
    this.value = emptyValue;
    this.refinement = { kind: "hidden" };
  }

  setData(reference: BibliographicRecord, displayTitle: string, primaryArtifact: LibraryPdfArtifact | null): void {
    this.reference = reference;
    this.displayTitle = displayTitle;
    this.primaryArtifact = primaryArtifact;
    this.value = {
      type: reference.type,
      title: reference.title,
      authors: reference.authors.join("; "),
      year: reference.year,
      venue: reference.venue,
      doi: reference.doi,
      url: reference.url,
      abstract: reference.abstract,
    };
    this.refinement = { kind: "hidden" };
  }

  showStatus(label: string, message: string): void {
    this.pdfSelections.clear();
    this.providerSelections.clear();
    this.refinement = { kind: "status", label, message };
  }

  showReview(
    artifact: LibraryPdfArtifact,
    local: PdfMetadataCandidates,
    preview: MetadataRefinementPreview,
    providerError = "",
    reusedPreview = false,
  ): void {
    this.refinement = { kind: "review", artifact, local, preview, providerError, reusedPreview };
    this.selectedWork = 0;
    this.pdfSelections.clear();
    for (const field of pdfFields) {
      const suggested = pdfCandidateValue(local, field);
      if (suggested && suggested !== this.currentValue(field)) this.pdfSelections.add(field);
    }
    this.resetProviderSelections();
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const referenceId = this.reference?.id ?? "";
    return html`
      ${textFields.map((field) => this.renderField(field, referenceId))} ${this.renderField("abstract", referenceId)}
      ${this.renderRefinement()}
      <div class="mt-2 flex flex-wrap gap-2">
        <button class="button-primary" type="button" @click=${() => this.save()}>Save details</button>
        ${this.primaryArtifact
          ? html`<button class="button-secondary" type="button" @click=${() => this.refine()}>Refine metadata</button>`
          : nothing}
      </div>
    `;
  }

  protected setField(field: ReferenceMetadataField, event: Event): void {
    this.value = { ...this.value, [field]: (event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value };
  }

  protected save(): void {
    if (this.reference) this.emitAction({ action: "save", referenceId: this.reference.id, value: this.value });
  }

  protected refine(): void {
    if (this.reference && this.primaryArtifact) {
      this.emitAction({ action: "refine", reference: this.reference, artifact: this.primaryArtifact });
    }
  }

  protected applyPdf(): void {
    if (!this.reference || this.refinement.kind !== "review") return;
    const fields: Partial<Record<ReferenceMetadataField, string | readonly string[]>> = {};
    for (const field of this.pdfSelections) {
      const candidate = pdfCandidateValue(this.refinement.local, field);
      if (!candidate) continue;
      fields[field] =
        field === "authors"
          ? candidate
              .split(";")
              .map((value) => value.trim())
              .filter(Boolean)
          : candidate.trim();
    }
    this.emitAction({
      action: "apply-pdf",
      artifactId: this.refinement.artifact.id,
      fields,
      referenceId: this.reference.id,
    });
  }

  protected applyProvider(): void {
    if (!this.reference || this.refinement.kind !== "review") return;
    const group = this.selectedProviderGroup();
    if (!group) return;
    const fields = new Map<number, CrossrefMetadataField[]>();
    for (const [field, index] of this.providerSelections) {
      if (index === null) continue;
      const selected = fields.get(index);
      if (selected) selected.push(field);
      else fields.set(index, [field]);
    }
    this.emitAction({
      action: "apply-provider",
      candidates: group.candidates,
      referenceId: this.reference.id,
      selections: [...fields].map(([candidateIndex, selectedFields]) => ({ candidateIndex, fields: selectedFields })),
    });
  }

  protected selectWork(event: Event): void {
    this.selectedWork = Number((event.currentTarget as HTMLSelectElement).value);
    this.resetProviderSelections();
    this.requestUpdate();
  }

  protected selectProvider(field: CrossrefMetadataField, event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    this.providerSelections.set(field, value ? Number(value) : null);
    this.requestUpdate();
  }

  protected selectPdf(field: CrossrefMetadataField, event: Event): void {
    if ((event.currentTarget as HTMLInputElement).checked) this.pdfSelections.add(field);
    else this.pdfSelections.delete(field);
    this.requestUpdate();
  }

  protected emitAction(action: LibraryReferenceMetadataAction): void {
    this.dispatchEvent(
      new CustomEvent<LibraryReferenceMetadataAction>(libraryReferenceMetadataActionEvent, { bubbles: true, detail: action }),
    );
  }

  private renderField(field: ReferenceMetadataField, referenceId: string): TemplateResult {
    const input =
      field === "abstract"
        ? html`<textarea
            class="field min-h-20"
            id=${`library-reference-${referenceId}-${field}`}
            name=${field}
            .value=${this.value[field]}
            placeholder=${field}
            aria-label=${`${field[0]!.toUpperCase()}${field.slice(1)} for ${this.displayTitle}`}
            @input=${(event: Event) => this.setField(field, event)}
          ></textarea>`
        : html`<input
            class="field mt-2"
            id=${`library-reference-${referenceId}-${field}`}
            name=${field}
            .value=${this.value[field]}
            placeholder=${field}
            aria-label=${`${field} for ${this.displayTitle}`}
            @input=${(event: Event) => this.setField(field, event)}
          />`;
    return html`
      <div class="library-metadata-field mt-2">
        ${input}
        <div class="library-metadata-suggestions" aria-live="polite">${this.renderSuggestions(field)}</div>
      </div>
    `;
  }

  private renderSuggestions(field: CrossrefMetadataField): TemplateResult | typeof nothing {
    if (this.refinement.kind !== "review") return nothing;
    const pdfValue = pdfCandidateValue(this.refinement.local, field);
    const pdfSuggestion =
      pdfValue && pdfValue !== this.currentValue(field)
        ? html`
            <label class="library-metadata-suggestion" data-metadata-suggestion="pdf">
              <input
                type="checkbox"
                aria-label=${`Use PDF suggestion for ${field}`}
                .checked=${this.pdfSelections.has(field)}
                @change=${(event: Event) => this.selectPdf(field, event)}
              />
              <span class="library-metadata-suggestion-label">PDF</span>
              <span class="library-metadata-suggestion-value">${pdfValue}</span>
            </label>
          `
        : nothing;
    const group = this.selectedProviderGroup();
    const options = group ? providerOptions(this.reference, group.candidates, field) : [];
    if (options.length === 0) return html`${pdfSuggestion}`;
    const selected = this.providerSelections.get(field) ?? null;
    const selectedCandidate = selected === null ? undefined : group?.candidates[selected];
    const proposed = selectedCandidate ? metadataFieldValue(selectedCandidate.metadata, field) : this.currentValue(field) || "—";
    return html`
      ${pdfSuggestion}
      <div class="library-metadata-suggestion" data-metadata-suggestion="provider">
        <div class="min-w-0 flex-1">
          <select
            class="library-metadata-suggestion-source"
            aria-label=${`Suggested source for ${field}`}
            .value=${selected === null ? "" : String(selected)}
            @change=${(event: Event) => this.selectProvider(field, event)}
          >
            <option value="">Keep current</option>
            ${options.map((option) => html`<option value=${String(option.index)}>${providerLabel(option.candidate.provider)}</option>`)}
          </select>
          <span class="library-metadata-suggestion-value">${proposed}</span>
        </div>
      </div>
    `;
  }

  private renderRefinement(): TemplateResult {
    if (this.refinement.kind === "hidden") return html`<section class="library-metadata-refinement hidden" aria-live="polite"></section>`;
    if (this.refinement.kind === "status") {
      return html`
        <section class="library-metadata-refinement" aria-live="polite">
          <p class="resource-label">${this.refinement.label}</p>
          <p class="status-text">${this.refinement.message}</p>
        </section>
      `;
    }
    const { local } = this.refinement;
    const hasPdfSuggestions = pdfFields.some((field) => {
      const proposed = pdfCandidateValue(local, field);
      return proposed && proposed !== this.currentValue(field);
    });
    return html`
      <section class="library-metadata-refinement" aria-live="polite">
        <p class="resource-label">Refine metadata · ${local.pagesScanned} PDF page${local.pagesScanned === 1 ? "" : "s"} scanned</p>
        <section class="library-metadata-refinement-actions">
          <p class="resource-label">PDF suggestions</p>
          ${local.diagnostics.map((diagnostic) => html`<p class="status-text">${diagnostic}</p>`)}
          ${hasPdfSuggestions
            ? html`<button class="button-primary mt-3" type="button" @click=${() => this.applyPdf()}>Apply selected metadata</button>`
            : html`<p class="status-text">No new metadata suggestions are available.</p>`}
        </section>
        ${this.renderProviderSection()}
      </section>
    `;
  }

  private renderProviderSection(): TemplateResult {
    if (this.refinement.kind !== "review") return html``;
    const groups = groupMetadataCandidates(this.refinement.preview.candidates);
    if (groups.length === 0) {
      const message = this.refinement.providerError
        ? `Provider lookup failed: ${this.refinement.providerError} You can still apply the PDF suggestions or edit details manually.`
        : "No provider matches were found. You can still apply the PDF suggestions or edit details manually.";
      return html`
        <section class="library-metadata-refinement-actions">
          <p class="resource-label">Scholarly metadata matches</p>
          <p class="status-text">${message}</p>
        </section>
      `;
    }
    const group = groups[this.selectedWork]!;
    const selectedCount = new Set([...this.providerSelections.values()].filter((value) => value !== null)).size;
    const sourceNames = group.candidates.map(({ provider }) => providerLabel(provider));
    const title = selectedCount === 0 ? "Keep current metadata" : `Apply from ${selectedCount} source${selectedCount === 1 ? "" : "s"}`;
    return html`
      <section class="library-metadata-refinement-actions">
        <p class="resource-label">Scholarly metadata matches</p>
        ${this.refinement.reusedPreview
          ? html`<p class="status-text">Recent preview reused · sources will be verified again before acceptance.</p>`
          : nothing}
        ${groups.length > 1
          ? html`
              <select
                class="field mt-2"
                aria-label=${`Scholarly work for ${this.reference?.title ?? ""}`}
                .value=${String(this.selectedWork)}
                @change=${(event: Event) => this.selectWork(event)}
              >
                ${groups.map((item, index) => {
                  const first = item.candidates[0]!;
                  const year = first.metadata.year ? ` · ${first.metadata.year}` : "";
                  const count = item.candidates.length;
                  return html`<option value=${String(index)}>
                    ${first.metadata.title}${year} · ${item.doi} · ${count} source${count === 1 ? "" : "s"}
                  </option>`;
                })}
              </select>
            `
          : nothing}
        <div><p class="status-text">${group.doi} · compare ${sourceNames.join(", ")}</p></div>
        ${selectedCount === 0
          ? html`<p class="status-text">These provider records match the current library metadata.</p>`
          : html`<button class="button-primary mt-3" type="button" @click=${() => this.applyProvider()}>${title}</button>`}
      </section>
    `;
  }

  private selectedProviderGroup() {
    if (this.refinement.kind !== "review") return undefined;
    return groupMetadataCandidates(this.refinement.preview.candidates)[this.selectedWork];
  }

  private currentValue(field: CrossrefMetadataField): string {
    return this.reference ? metadataFieldValue(this.reference, field) : "";
  }

  private resetProviderSelections(): void {
    this.providerSelections.clear();
    const group = this.selectedProviderGroup();
    if (!group) return;
    for (const field of crossrefMetadataFields) {
      const options = providerOptions(this.reference, group.candidates, field);
      this.providerSelections.set(field, options[0]?.index ?? null);
    }
  }
}

function pdfCandidateValue(candidates: PdfMetadataCandidates, field: CrossrefMetadataField): string {
  if (field === "authors") return candidates.authors.join("; ");
  if (field === "title" || field === "year" || field === "doi") return candidates[field];
  return "";
}

function providerOptions(
  reference: BibliographicRecord | null,
  candidates: readonly MetadataRefinementCandidate[],
  field: CrossrefMetadataField,
): Array<{ readonly candidate: MetadataRefinementCandidate; readonly index: number }> {
  if (!reference) return [];
  const current = metadataFieldValue(reference, field);
  return candidates.flatMap((candidate, index) => {
    const proposed = metadataFieldValue(candidate.metadata, field);
    return proposed && proposed !== current ? [{ candidate, index }] : [];
  });
}

function providerLabel(provider: MetadataRefinementCandidate["provider"]): string {
  if (provider === "openalex") return "OpenAlex";
  if (provider === "crossref") return "Crossref";
  if (provider === "datacite") return "DataCite";
  return "Semantic Scholar";
}

if (typeof customElements !== "undefined" && !customElements.get("library-reference-metadata-editor")) {
  customElements.define("library-reference-metadata-editor", LibraryReferenceMetadataEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    "library-reference-metadata-editor": LibraryReferenceMetadataEditor;
  }
}
