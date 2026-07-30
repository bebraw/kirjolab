import { html, type TemplateResult } from "lit";
import { bibTeXDisplayText } from "../../domain/reference-library/bibliography";
import { LightDomElement } from "../platform/light-dom-controller";
import type { LibraryPdfArtifact, ReferenceLibrarySnapshot } from "../../domain/reference-library";
import { formatBytes } from "../platform/format";
import { errorMessage, expectOk, jsonFetch } from "../platform/http";

interface UnidentifiedPdfReference {
  readonly id: string;
  readonly title: string;
}

export interface UnidentifiedPdfRefresh {
  readonly message: string;
  readonly requestId: number;
}

export const unidentifiedPdfRefreshEvent = "unidentified-pdf-refresh";

export class UnidentifiedPdfList extends LightDomElement {
  static override properties = {
    artifacts: { state: true },
    references: { state: true },
    savingArtifactId: { state: true },
    status: { state: true },
  };

  declare private artifacts: readonly LibraryPdfArtifact[];
  declare private references: readonly UnidentifiedPdfReference[];
  declare private savingArtifactId: string;
  declare private status: string;
  private readonly selections = new Map<string, string>();
  private requestId = 0;

  constructor() {
    super();
    this.artifacts = [];
    this.references = [];
    this.savingArtifactId = "";
    this.status = "";
  }

  complete(requestId: number): void {
    if (requestId !== this.requestId) return;
    this.savingArtifactId = "";
  }

  setLibrary(library: Pick<ReferenceLibrarySnapshot, "artifacts" | "references">): void {
    this.artifacts = library.artifacts.filter(({ referenceId }) => referenceId === null);
    this.references = library.references;
    const artifactIds = new Set(this.artifacts.map(({ id }) => id));
    const referenceIds = new Set(this.references.map(({ id }) => id));
    for (const [artifactId, referenceId] of this.selections) {
      if (!artifactIds.has(artifactId) || !referenceIds.has(referenceId)) this.selections.delete(artifactId);
    }
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
        <p class="status-line" role="status" ?hidden=${!this.status}>${this.status}</p>
      </section>
    `;
  }

  protected chooseReference(artifactId: string, event: Event): void {
    this.selections.set(artifactId, (event.currentTarget as HTMLSelectElement).value);
  }

  protected async identify(artifactId: string): Promise<void> {
    const referenceId = this.selections.get(artifactId);
    if (!referenceId || this.savingArtifactId) return;
    const requestId = ++this.requestId;
    this.savingArtifactId = artifactId;
    this.status = "Identifying PDF…";
    try {
      await expectOk(await jsonFetch(`/api/library/pdfs/${encodeURIComponent(artifactId)}/identify`, { referenceId }));
      this.status = "";
      this.dispatchEvent(
        new CustomEvent<UnidentifiedPdfRefresh>(unidentifiedPdfRefreshEvent, {
          bubbles: true,
          detail: { message: "PDF identified and attached to the private source record.", requestId },
        }),
      );
    } catch (error) {
      this.savingArtifactId = "";
      this.status = errorMessage(error, "Could not identify the PDF.");
    }
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
          ?disabled=${this.references.length === 0 || Boolean(this.savingArtifactId)}
          @click=${() => this.identify(artifact.id)}
        >
          ${this.savingArtifactId === artifact.id ? "Identifying…" : "Identify PDF"}
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
