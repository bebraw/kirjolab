import { html, nothing, type TemplateResult } from "lit";
import {
  isReferenceMergeResult,
  isReferenceReconciliationReport,
  type BibliographicRecord,
  type ReferenceReconciliationCandidate,
  type ReferenceReconciliationReport,
} from "../../domain/reference-library";
import { errorMessage, expectOk, jsonFetch } from "../platform/http";
import { LightDomElement } from "../platform/light-dom-controller";

export const referenceReconciliationOutcomeEvent = "reference-reconciliation-outcome";

export interface ReferenceReconciliationOutcome {
  readonly action: "library-refresh";
  readonly message: string;
}

export class ReferenceReconciliationPanel extends LightDomElement {
  static override properties = {
    loading: { state: true },
    report: { state: true },
    savingReferenceId: { state: true },
    status: { state: true },
  };

  declare private loading: boolean;
  declare private report: ReferenceReconciliationReport | null;
  declare private savingReferenceId: string;
  declare private status: string;

  constructor() {
    super();
    this.loading = false;
    this.report = null;
    this.savingReferenceId = "";
    this.status = "";
  }

  async open(): Promise<void> {
    this.hidden = false;
    await this.refresh();
    if (typeof this.scrollIntoView === "function") this.scrollIntoView({ block: "start" });
  }

  protected override render(): TemplateResult {
    return html`
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="eyebrow">Library maintenance</p>
          <h3 class="mt-1 text-lg font-semibold" id="reference-reconciliation-heading">Possible duplicate references</h3>
          <p class="mt-2 max-w-2xl text-xs leading-5 text-app-text-soft">
            Review exact DOI or title–year–author matches. Choose the canonical record explicitly; metadata and private research move
            atomically.
          </p>
        </div>
        <button class="button-secondary" type="button" @click=${this.close}>Close</button>
      </div>
      ${this.status ? html`<p class="status-text mt-3" role="status">${this.status}</p>` : nothing}
      <div class="mt-4 grid gap-4" id="reference-reconciliation-list">
        ${this.report?.candidates.length
          ? this.report.candidates.map((candidate) => this.renderCandidate(candidate))
          : this.loading
            ? nothing
            : html`<div class="empty-state">No strong duplicate candidates found.</div>`}
      </div>
    `;
  }

  protected close(): void {
    this.hidden = true;
  }

  protected async refresh(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.status = "Checking strong duplicate signals…";
    try {
      const response = await fetch("/api/library/reconciliation", { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isReferenceReconciliationReport(value)) throw new Error("The server returned an invalid reconciliation report");
      this.report = value;
      this.status = value.truncated ? "Showing the first 100 candidates from the first 512 references." : "";
    } catch (error) {
      this.report = null;
      this.status = errorMessage(error, "Could not check duplicate references.");
    } finally {
      this.loading = false;
    }
  }

  protected async merge(
    candidate: ReferenceReconciliationCandidate,
    canonical: BibliographicRecord,
    duplicate: BibliographicRecord,
  ): Promise<void> {
    if (this.savingReferenceId || blockers(candidate, duplicate.id).length > 0) return;
    if (!window.confirm(`Keep “${canonical.title}” and merge “${duplicate.title}” into it?`)) return;
    this.savingReferenceId = duplicate.id;
    this.status = "Merging duplicate research and provenance…";
    try {
      const response = await jsonFetch("/api/library/reconciliation/merge", {
        canonicalReferenceId: canonical.id,
        duplicateReferenceId: duplicate.id,
        expectedCanonicalUpdatedAt: canonical.updatedAt,
        expectedDuplicateUpdatedAt: duplicate.updatedAt,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isReferenceMergeResult(value)) throw new Error("The server returned an invalid reference merge result");
      await this.refresh();
      this.dispatchEvent(
        new CustomEvent<ReferenceReconciliationOutcome>(referenceReconciliationOutcomeEvent, {
          bubbles: true,
          composed: true,
          detail: { action: "library-refresh", message: `Merged duplicate into ${value.canonicalReference.referenceKey}.` },
        }),
      );
    } catch (error) {
      this.status = errorMessage(error, "Could not merge the duplicate reference.");
    } finally {
      this.savingReferenceId = "";
    }
  }

  private renderCandidate(candidate: ReferenceReconciliationCandidate): TemplateResult {
    return html`
      <article class="resource-card">
        <p class="eyebrow">${candidate.reason === "doi" ? "Exact DOI" : "Exact title · year · first author"}</p>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          ${this.renderChoice(candidate, candidate.left, candidate.right)} ${this.renderChoice(candidate, candidate.right, candidate.left)}
        </div>
      </article>
    `;
  }

  private renderChoice(
    candidate: ReferenceReconciliationCandidate,
    canonical: BibliographicRecord,
    duplicate: BibliographicRecord,
  ): TemplateResult {
    const duplicateBlockers = blockers(candidate, duplicate.id);
    const saving = this.savingReferenceId === duplicate.id;
    return html`
      <section class="border border-app-line bg-app-surface p-3">
        <h4 class="text-base font-semibold">${canonical.title}</h4>
        <p class="mt-1 text-xs leading-5 text-app-text-soft">
          ${[canonical.authors.join("; "), canonical.year, canonical.doi, canonical.referenceKey].filter(Boolean).join(" · ")}
        </p>
        ${duplicateBlockers.length
          ? html`<p class="mt-3 text-xs leading-5 text-app-text-soft">Cannot merge the other record: ${duplicateBlockers.join(" · ")}.</p>`
          : html`
              <button
                class="button-primary mt-3"
                type="button"
                ?disabled=${Boolean(this.savingReferenceId)}
                @click=${() => void this.merge(candidate, canonical, duplicate)}
              >
                ${saving ? "Merging…" : `Keep ${canonical.referenceKey}`}
              </button>
            `}
      </section>
    `;
  }
}

function blockers(candidate: ReferenceReconciliationCandidate, referenceId: string): readonly string[] {
  return candidate.left.id === referenceId ? candidate.leftBlockers : candidate.rightBlockers;
}

if (typeof customElements !== "undefined" && !customElements.get("reference-reconciliation-panel")) {
  customElements.define("reference-reconciliation-panel", ReferenceReconciliationPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "reference-reconciliation-panel": ReferenceReconciliationPanel;
  }
}
