import { html, nothing, svg, type TemplateResult } from "lit";
import { LightDomElement } from "./light-dom-controller";
import type { CitationAssertionView, CitationNetwork } from "../domain/citation-assertions";
import type { CitationExpansionCandidate, CitationExpansionDirection, CitationExpansionResult } from "../domain/citation-expansion-types";
import { libraryPdfRoute } from "./library-ui-route";

export const citationNetworkActionEvent = "citation-network-action";

export type CitationNetworkAction =
  | { readonly action: "expand"; readonly referenceId: string; readonly direction: CitationExpansionDirection }
  | { readonly action: "focus"; readonly referenceId: string }
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

export interface CitationNetworkData {
  readonly expansion: CitationExpansionResult | null;
  readonly filterProject: boolean;
  readonly focusedReferenceId: string | null;
  readonly network: CitationNetwork | null;
  readonly pdfArtifactIds: readonly string[];
  readonly referenceTitles: Readonly<Record<string, string>>;
}

export interface CitationReferenceChoice {
  readonly id: string;
  readonly title: string;
}

export class CitationNetworkPanel extends LightDomElement {
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
    this.data = { expansion: null, filterProject: false, focusedReferenceId: null, network: null, pdfArtifactIds: [], referenceTitles: {} };
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

  protected override render(): TemplateResult {
    const network = this.data.network ? focusCitationNetwork(this.data.network, this.data.focusedReferenceId) : null;
    const focusedTitle = this.data.focusedReferenceId ? this.data.referenceTitles[this.data.focusedReferenceId] : null;
    return html`
      ${focusedTitle
        ? html`
            <div class="mt-4 border-y border-app-line py-3">
              <p class="eyebrow">Focused source</p>
              <p class="mt-1 text-sm font-semibold">${focusedTitle}</p>
              <p class="mt-1 text-xs leading-5 text-app-text-soft">Immediate incoming and outgoing citation relationships.</p>
            </div>
          `
        : nothing}
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
    if (
      action === "expand" &&
      button.dataset.referenceId &&
      (button.dataset.direction === "references" || button.dataset.direction === "citations")
    ) {
      this.emit({ action, referenceId: button.dataset.referenceId, direction: button.dataset.direction });
      return;
    }
    if (action === "focus" && button.dataset.referenceId) {
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
            : this.data.focusedReferenceId
              ? "No reviewed citation relationships connect this source yet. Expand its references or record an assertion."
              : "No source-to-source citation assertions yet. Record one or expand a DOI-backed source."}
        </div>
      `;
    }
    if (this.data.focusedReferenceId) return this.focusedNetworkList(network, this.data.focusedReferenceId);
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
                      data-direction="references"
                      @click=${this.act}
                    >
                      Expand references
                    </button>
                    <button
                      type="button"
                      class="button-secondary mt-3"
                      data-citation-action="expand"
                      data-reference-id=${node.referenceId}
                      data-direction="citations"
                      @click=${this.act}
                    >
                      Find citing works
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

  private focusedNetworkList(network: CitationNetwork, referenceId: string): TemplateResult {
    const focusedNodeId = `reference:${referenceId}`;
    const focusedNode = network.nodes.find(({ id }) => id === focusedNodeId);
    const labels = new Map(network.nodes.map((node) => [node.id, node.label]));
    const outgoing = network.edges.filter(({ from }) => from === focusedNodeId);
    const incoming = network.edges.filter(({ to }) => to === focusedNodeId);
    return html`
      ${this.expansion()}
      ${focusedNode?.doi
        ? html`
            <button
              type="button"
              class="button-secondary"
              data-citation-action="expand"
              data-reference-id=${focusedNode.referenceId}
              data-direction="references"
              @click=${this.act}
            >
              Expand references
            </button>
            <button
              type="button"
              class="button-secondary"
              data-citation-action="expand"
              data-reference-id=${focusedNode.referenceId}
              data-direction="citations"
              @click=${this.act}
            >
              Find citing works
            </button>
          `
        : nothing}
      ${this.relationshipSection("References cited", outgoing, labels, "to")}
      ${this.relationshipSection("Cited by", incoming, labels, "from")}
    `;
  }

  private relationshipSection(
    title: string,
    edges: CitationNetwork["edges"],
    labels: ReadonlyMap<string, string>,
    neighborEndpoint: "from" | "to",
  ): TemplateResult {
    return html`
      <section class="mt-4" aria-label=${title}>
        <div class="flex items-center gap-2">
          <h4 class="eyebrow">${title}</h4>
          <span class="count-badge">${edges.length}</span>
        </div>
        <div class="mt-2 grid gap-3">
          ${edges.length
            ? edges.map((edge) => {
                const neighborNodeId = edge[neighborEndpoint];
                const neighborReferenceId = neighborNodeId.slice("reference:".length);
                return html`
                  <article class="resource-card">
                    ${this.label(edge.state)}
                    <button
                      type="button"
                      class="mt-1 block w-full text-left text-base font-semibold text-app-accent-strong underline decoration-app-border underline-offset-4"
                      data-citation-action="focus"
                      data-reference-id=${neighborReferenceId}
                      @click=${this.act}
                    >
                      ${labels.get(neighborNodeId) ?? neighborReferenceId}
                    </button>
                    ${edge.assertions.map((assertion) => this.assertion(assertion))}
                  </article>
                `;
              })
            : html`<p class="empty-state">No ${title.toLocaleLowerCase()} relationships recorded.</p>`}
        </div>
      </section>
    `;
  }

  private expansion(): TemplateResult | typeof nothing {
    const expansion = this.data.expansion;
    if (!expansion) return nothing;
    const seedTitle = this.data.referenceTitles[expansion.seedReferenceId] ?? "selected source";
    return html`
      <section class="resource-card border-app-accent">
        ${this.label(expansion.direction === "references" ? "Backward snowball · Crossref" : "Forward snowball · Semantic Scholar")}
        <h4 class="mt-1 text-base font-semibold">
          ${expansion.direction === "references" ? `References from ${seedTitle}` : `Works citing ${seedTitle}`}
        </h4>
        <p class="mt-2 text-xs leading-5 text-app-text-soft">
          ${expansion.unmatched.length
            ? `${expansion.unmatched.length} new DOI candidate${expansion.unmatched.length === 1 ? "" : "s"} to review${
                expansion.truncated ? " · provider list truncated" : ""
              }.`
            : `No unseen DOI candidates in this round. This seed may be saturated for ${
                expansion.direction === "references" ? "backward" : "forward"
              } snowballing.`}
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
    const evidencePage = citationEvidencePage(assertion.sourceLocator);
    const evidenceHref =
      assertion.sourceKind === "pdf-artifact" && evidencePage && this.data.pdfArtifactIds.includes(assertion.sourceId)
        ? libraryPdfRoute(assertion.sourceId, evidencePage)
        : null;
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
        ${evidenceHref ? html`<a class="button-secondary mt-2" href=${evidenceHref}>Open evidence · page ${evidencePage}</a>` : nothing}
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

export function focusCitationNetwork(network: CitationNetwork, referenceId: string | null): CitationNetwork {
  if (!referenceId) return network;
  const focusedNodeId = `reference:${referenceId}`;
  const edges = network.edges.filter(({ from, to }) => from === focusedNodeId || to === focusedNodeId);
  const nodeIds = new Set([focusedNodeId, ...edges.flatMap(({ from, to }) => [from, to])]);
  return { ...network, edges, nodes: network.nodes.filter(({ id }) => nodeIds.has(id)) };
}

export function citationEvidencePage(sourceLocator: string): number | null {
  const match = /PDF mention pages? (\d+)|bibliography page (\d+)/iu.exec(sourceLocator);
  if (!match) return null;
  const page = Number.parseInt(match[1] ?? match[2] ?? "", 10);
  return Number.isFinite(page) && page > 0 ? page : null;
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
