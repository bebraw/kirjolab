import { html, LitElement, nothing, svg, type TemplateResult } from "lit";
import type { CitationAssertionView, CitationNetwork } from "../domain/citation-assertions";
import type { CitationExpansionCandidate, CitationExpansionResult } from "../domain/citation-expansion-types";

export const citationNetworkActionEvent = "citation-network-action";

export type CitationNetworkAction =
  | { readonly action: "expand"; readonly referenceId: string }
  | {
      readonly action: "record";
      readonly citedReferenceId: string;
      readonly citingReferenceId: string;
      readonly polarity: "cites" | "does-not-cite";
    }
  | { readonly action: "review"; readonly assertionId: string; readonly decision: "confirmed" | "rejected" }
  | {
      readonly action: "save-candidate";
      readonly candidate: CitationExpansionCandidate;
      readonly expansion: CitationExpansionResult;
    };

interface CitationNetworkData {
  readonly expansion: CitationExpansionResult | null;
  readonly filterProject: boolean;
  readonly network: CitationNetwork | null;
  readonly referenceTitles: Readonly<Record<string, string>>;
}

interface CitationReferenceChoice {
  readonly id: string;
  readonly title: string;
}

export class CitationNetworkPanel extends LitElement {
  static override properties = {
    data: { state: true },
    citedReferenceId: { state: true },
    citingReferenceId: { state: true },
    polarity: { state: true },
    references: { state: true },
    savingDois: { state: true },
  };

  declare private citedReferenceId: string;
  declare private citingReferenceId: string;
  declare private data: CitationNetworkData;
  declare private polarity: "cites" | "does-not-cite";
  declare private references: readonly CitationReferenceChoice[];
  declare private savingDois: ReadonlySet<string>;

  constructor() {
    super();
    this.citedReferenceId = "";
    this.citingReferenceId = "";
    this.data = { expansion: null, filterProject: false, network: null, referenceTitles: {} };
    this.polarity = "cites";
    this.references = [];
    this.savingDois = new Set();
  }

  setData(data: CitationNetworkData): void {
    this.data = data;
  }

  setReferences(references: readonly CitationReferenceChoice[]): void {
    this.references = references;
    if (!references.some(({ id }) => id === this.citingReferenceId)) this.citingReferenceId = "";
    if (!references.some(({ id }) => id === this.citedReferenceId)) this.citedReferenceId = "";
  }

  setCandidateSaving(doi: string, saving: boolean): void {
    const next = new Set(this.savingDois);
    if (saving) next.add(doi);
    else next.delete(doi);
    this.savingDois = next;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const network = this.data.network;
    return html`
      <form
        class="mt-4 grid gap-3 border-y border-app-line py-4 md:grid-cols-[1fr_auto_1fr_auto]"
        id="citation-assertion-form"
        @submit=${this.record}
      >
        <label class="field-label"
          >Citing source
          <select class="field" id="citation-assertion-citing" required .value=${this.citingReferenceId} @change=${this.changeSource}>
            <option value="">Choose source…</option>
            ${this.references.map(({ id, title }) => html`<option value=${id}>${title}</option>`)}
          </select>
        </label>
        <label class="field-label"
          >Relationship
          <select class="field" id="citation-assertion-polarity" .value=${this.polarity} @change=${this.changePolarity}>
            <option value="cites">Cites</option>
            <option value="does-not-cite">Does not cite</option>
          </select>
        </label>
        <label class="field-label"
          >Cited source
          <select class="field" id="citation-assertion-cited" required .value=${this.citedReferenceId} @change=${this.changeSource}>
            <option value="">Choose source…</option>
            ${this.references.map(({ id, title }) => html`<option value=${id}>${title}</option>`)}
          </select>
        </label>
        <div class="flex items-end"><button class="button-primary w-full justify-center" type="submit">Record assertion</button></div>
      </form>
      <div class="mt-4 overflow-hidden border border-app-line bg-app-paper">
        <svg class="block min-h-72 w-full" id="citation-network-graph" viewBox="0 0 800 360" role="img" aria-label="Citation network graph">
          ${network ? this.graph(network) : nothing}
        </svg>
      </div>
      <div class="mt-4 space-y-3" id="citation-network-list" aria-live="polite">
        ${network ? this.networkList(network) : html`<div class="empty-state">Loading citation assertions…</div>`}
      </div>
    `;
  }

  protected record(event: Event): void {
    event.preventDefault();
    this.emit({
      action: "record",
      citedReferenceId: this.citedReferenceId,
      citingReferenceId: this.citingReferenceId,
      polarity: this.polarity,
    });
  }

  protected changeSource(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    if (select.id === "citation-assertion-citing") this.citingReferenceId = select.value;
    else this.citedReferenceId = select.value;
  }

  protected changePolarity(event: Event): void {
    this.polarity = (event.currentTarget as HTMLSelectElement).value === "does-not-cite" ? "does-not-cite" : "cites";
  }

  protected act(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const action = button.dataset.citationAction;
    if (action === "expand" && button.dataset.referenceId) {
      this.emit({ action, referenceId: button.dataset.referenceId });
      return;
    }
    if (
      action === "review" &&
      button.dataset.assertionId &&
      (button.dataset.decision === "confirmed" || button.dataset.decision === "rejected")
    ) {
      this.emit({ action, assertionId: button.dataset.assertionId, decision: button.dataset.decision });
      return;
    }
    if (action !== "save-candidate" || !button.dataset.candidateDoi || !this.data.expansion) return;
    const candidate = this.data.expansion.unmatched.find(({ doi }) => doi === button.dataset.candidateDoi);
    if (candidate && !this.savingDois.has(candidate.doi)) this.emit({ action, candidate, expansion: this.data.expansion });
  }

  private networkList(network: CitationNetwork): TemplateResult {
    if (network.nodes.length === 0) {
      return html`
        ${this.expansion()}
        <div class="empty-state">
          ${this.data.filterProject
            ? "No citation assertions touch references in this project yet."
            : "No source-to-source citation assertions yet. Record one or expand a DOI-backed source."}
        </div>
      `;
    }
    const labels = new Map(network.nodes.map((node) => [node.id, node.label]));
    return html`
      ${this.expansion()}
      <section class="grid gap-3">
        ${network.nodes.map(
          (node) => html`
            <article class="resource-card">
              ${this.label(node.inProject ? "Current project" : "Shared library")}
              <h4 class="mt-1 text-base font-semibold">${node.label}</h4>
              <p class="mt-2 text-xs text-app-text-soft">${[node.authors.join("; "), node.year, node.doi].filter(Boolean).join(" · ")}</p>
              ${node.doi
                ? html`
                    <button
                      type="button"
                      class="button-secondary mt-3"
                      data-citation-action="expand"
                      data-reference-id=${node.referenceId}
                      @click=${this.act}
                    >
                      Expand references
                    </button>
                  `
                : nothing}
            </article>
          `,
        )}
      </section>
      ${network.edges.length
        ? html`
            <h4 class="eyebrow mt-3">Assertions${network.truncated ? " · first 512" : ""}</h4>
            ${network.edges.map(
              (edge) => html`
                <article class="resource-card">
                  ${this.label(edge.state)}
                  <h4 class="mt-1 text-base font-semibold">${labels.get(edge.from) ?? edge.from} → ${labels.get(edge.to) ?? edge.to}</h4>
                  ${edge.assertions.map((assertion) => this.assertion(assertion))}
                </article>
              `,
            )}
          `
        : nothing}
    `;
  }

  private expansion(): TemplateResult | typeof nothing {
    const expansion = this.data.expansion;
    if (!expansion) return nothing;
    const seedTitle = this.data.referenceTitles[expansion.seedReferenceId] ?? "selected source";
    return html`
      <section class="resource-card border-app-accent">
        ${this.label("Backward snowball · Crossref")}
        <h4 class="mt-1 text-base font-semibold">References from ${seedTitle}</h4>
        <p class="mt-2 text-xs leading-5 text-app-text-soft">
          ${expansion.unmatched.length
            ? `${expansion.unmatched.length} new DOI candidate${expansion.unmatched.length === 1 ? "" : "s"} to review${
                expansion.truncated ? " · provider list truncated" : ""
              }.`
            : "No unseen DOI candidates in this round. This seed may be saturated for backward snowballing."}
        </p>
        ${expansion.unmatched.map((candidate) => this.candidate(candidate))}
      </section>
    `;
  }

  private candidate(candidate: CitationExpansionCandidate): TemplateResult {
    const saving = this.savingDois.has(candidate.doi);
    return html`
      <article class="mt-3 border-t border-app-line pt-3">
        <h5 class="text-sm font-semibold">${candidate.title || candidate.unstructured || candidate.doi}</h5>
        <p class="mt-1 text-xs leading-5 text-app-text-soft">
          ${[candidate.authors, candidate.year, candidate.doi].filter(Boolean).join(" · ")}
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <a class="button-secondary" href=${`https://doi.org/${candidate.doi}`} target="_blank" rel="noopener noreferrer"> Verify DOI </a>
          <button
            class="button-primary"
            type="button"
            data-citation-action="save-candidate"
            data-candidate-doi=${candidate.doi}
            ?disabled=${saving}
            @click=${this.act}
          >
            ${saving ? "Saving…" : "Save candidate"}
          </button>
        </div>
      </article>
    `;
  }

  private assertion(assertion: CitationAssertionView): TemplateResult {
    return html`
      <div class="mt-3 border-t border-app-line pt-3">
        <p class="font-sans text-xs leading-5">${assertion.polarity} · ${assertion.state} · ${assertion.method}</p>
        <p class="mt-1 text-xs leading-5 text-app-text-soft">
          ${[
            assertion.assertedBy,
            formatTimestamp(assertion.observedAt),
            assertion.sourceKind,
            assertion.sourceId,
            assertion.sourceLocator,
            assertion.confidence === null ? "" : `confidence ${assertion.confidence.toFixed(2)}`,
            assertion.review ? `${assertion.review.decision} by ${assertion.review.reviewer}` : "unreviewed",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        ${assertion.review
          ? nothing
          : html`
              <div class="mt-2 flex gap-2">
                ${(["confirmed", "rejected"] as const).map(
                  (decision) => html`
                    <button
                      type="button"
                      class="button-secondary"
                      data-citation-action="review"
                      data-assertion-id=${assertion.id}
                      data-decision=${decision}
                      @click=${this.act}
                    >
                      ${decision === "confirmed" ? "Confirm" : "Reject"}
                    </button>
                  `,
                )}
              </div>
            `}
      </div>
    `;
  }

  private graph(network: CitationNetwork): ReturnType<typeof svg> {
    if (network.nodes.length === 0) {
      return svg`<text x="400" y="180" text-anchor="middle" fill="currentColor">No citation assertions to draw</text>`;
    }
    const positions = new Map(
      network.nodes.map((node, index) => {
        const angle = (index / network.nodes.length) * Math.PI * 2 - Math.PI / 2;
        return [node.id, { x: 400 + Math.cos(angle) * 270, y: 180 + Math.sin(angle) * 125 }] as const;
      }),
    );
    return svg`
      <defs>
        <marker id="citation-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"></path>
        </marker>
      </defs>
      ${network.edges.map((edge) => {
        const from = positions.get(edge.from);
        const to = positions.get(edge.to);
        return from && to
          ? svg`<line
              x1=${from.x}
              y1=${from.y}
              x2=${to.x}
              y2=${to.y}
              stroke=${citationStateColor(edge.state)}
              stroke-width=${edge.state === "confirmed" ? 3 : 2}
              marker-end="url(#citation-arrow)"
              stroke-dasharray=${edge.state === "inferred" ? "6 5" : nothing}
            ></line>`
          : nothing;
      })}
      ${network.nodes.map((node) => {
        const position = positions.get(node.id)!;
        return svg`
          <g>
            <circle
              cx=${position.x}
              cy=${position.y}
              r=${node.inProject ? 19 : 15}
              fill=${node.inProject ? "var(--color-app-accent)" : "var(--color-app-paper)"}
              stroke="var(--color-app-ink)"
            ></circle>
            <text x=${position.x} y=${position.y + 34} text-anchor="middle" font-size="11" fill="currentColor">
              ${node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label}
            </text>
            <title>${node.label}</title>
          </g>
        `;
      })}
    `;
  }

  private label(value: string): TemplateResult {
    return html`<p class="eyebrow">${value}</p>`;
  }

  private emit(detail: CitationNetworkAction): void {
    this.dispatchEvent(new CustomEvent(citationNetworkActionEvent, { bubbles: true, composed: true, detail }));
  }
}

function citationStateColor(state: CitationNetwork["edges"][number]["state"]): string {
  if (state === "confirmed") return "var(--color-app-graph-confirmed)";
  if (state === "extracted") return "var(--color-app-graph-extracted)";
  if (state === "conflicting") return "var(--color-app-graph-conflicting)";
  return "var(--color-app-graph-inferred)";
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

if (typeof customElements !== "undefined" && !customElements.get("citation-network-panel")) {
  customElements.define("citation-network-panel", CitationNetworkPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "citation-network-panel": CitationNetworkPanel;
  }
}
