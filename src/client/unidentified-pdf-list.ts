import { html, LitElement, type TemplateResult } from "lit";
import { bibTeXDisplayText } from "../domain/bibliography";
import type { LibraryPdfArtifact } from "../domain/reference-library";
import { formatBytes } from "./format";

export interface UnidentifiedPdfReference {
  readonly id: string;
  readonly title: string;
}

export interface UnidentifiedPdfSelection {
  readonly artifactId: string;
  readonly referenceId: string;
}

export const unidentifiedPdfIdentifyEvent = "unidentified-pdf-identify";

export class UnidentifiedPdfList extends LitElement {
  static override properties = {
    artifacts: { state: true },
    references: { state: true },
  };

  declare private artifacts: readonly LibraryPdfArtifact[];
  declare private references: readonly UnidentifiedPdfReference[];
  private readonly selections = new Map<string, string>();

  constructor() {
    super();
    this.artifacts = [];
    this.references = [];
  }

  setData(artifacts: readonly LibraryPdfArtifact[], references: readonly UnidentifiedPdfReference[]): void {
    this.artifacts = artifacts;
    this.references = references;
    const artifactIds = new Set(artifacts.map(({ id }) => id));
    const referenceIds = new Set(references.map(({ id }) => id));
    for (const [artifactId, referenceId] of this.selections) {
      if (!artifactIds.has(artifactId) || !referenceIds.has(referenceId)) this.selections.delete(artifactId);
    }
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    return html`
      <section class="mt-6 border-t border-app-line pt-5" id="unidentified-pdf-section" ?hidden=${this.artifacts.length === 0}>
        <div class="flex items-center justify-between gap-3">
          <p class="eyebrow">PDFs awaiting identification</p>
          <span class="count-badge" id="unidentified-pdf-count">${this.artifacts.length}</span>
        </div>
        <div class="mt-3 grid gap-3" id="unidentified-pdf-list">
          ${this.artifacts.length === 0
            ? html`<div class="empty-state">No unidentified PDFs.</div>`
            : this.artifacts.map((artifact) => this.renderArtifact(artifact))}
        </div>
      </section>
    `;
  }

  protected chooseReference(artifactId: string, event: Event): void {
    this.selections.set(artifactId, (event.currentTarget as HTMLSelectElement).value);
  }

  protected identify(artifactId: string): void {
    this.dispatchEvent(
      new CustomEvent<UnidentifiedPdfSelection>(unidentifiedPdfIdentifyEvent, {
        detail: { artifactId, referenceId: this.selections.get(artifactId) ?? "" },
      }),
    );
  }

  private renderArtifact(artifact: LibraryPdfArtifact): TemplateResult {
    return html`
      <article class="resource-card">
        <span class="resource-label">Private PDF · ${formatBytes(artifact.size)}</span>
        <strong class="resource-title">${artifact.name}</strong>
        <select
          class="field mt-3"
          aria-label=${`Identify ${artifact.name} as a reference`}
          @change=${(event: Event) => this.chooseReference(artifact.id, event)}
        >
          <option value="">Choose identified source…</option>
          ${this.references.map(
            (reference) => html`<option value=${reference.id}>${bibTeXDisplayText(reference.title) || "Untitled reference"}</option>`,
          )}
        </select>
        <button
          class="button-primary mt-2 w-full justify-center"
          type="button"
          ?disabled=${this.references.length === 0}
          @click=${() => this.identify(artifact.id)}
        >
          Identify PDF
        </button>
      </article>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("unidentified-pdf-list")) {
  customElements.define("unidentified-pdf-list", UnidentifiedPdfList);
}

declare global {
  interface HTMLElementTagNameMap {
    "unidentified-pdf-list": UnidentifiedPdfList;
  }
}
