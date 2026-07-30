import { html, type PropertyValues, type TemplateResult } from "lit";
import { bibTeXDisplayText } from "../../domain/reference-library/bibliography";
import { LightDomElement } from "../platform/light-dom-controller";
import { isCitationNetwork, type CitationNetwork } from "../../domain/citation/citation-assertions";
import { isCitationCandidateAcceptance, isCitationCandidateBatchAcceptance } from "../../domain/citation/citation-expansion-acceptance";
import { isCitationExpansionResult } from "../../domain/citation/citation-expansion";
import type { CitationExpansionCandidate, CitationExpansionResult } from "../../domain/citation/citation-expansion-types";
import { isCitationResearchQueue } from "../../domain/citation/citation-research-queue";
import type { LibraryPdfArtifact } from "../../domain/reference-library";
import { errorMessage, expectOk, jsonFetch } from "../platform/http";
import {
  citationNetworkActionEvent,
  type CitationNetworkAction,
  type CitationNetworkData,
  type CitationNetworkPanel,
  type CitationReferenceChoice,
} from "./citation-network-panel";

export const citationNetworkOutcomeEvent = "citation-network-outcome";

export type CitationNetworkOutcome =
  | { readonly action: "notice"; readonly message: string }
  | { readonly action: "library-refresh"; readonly message: string }
  | { readonly action: "route"; readonly referenceId: string };

type CitationNetworkPresentation = Omit<CitationNetworkData, "filterProject" | "focusedReferenceId">;

const emptyData: CitationNetworkPresentation = { expansion: null, network: null, pdfArtifactIds: [], queue: [], referenceTitles: {} };

export class CitationNetworkWorkspace extends LightDomElement {
  static override properties = {
    data: { state: true },
    filterProject: { state: true },
    focusedReferenceId: { state: true },
    references: { state: true },
    status: { state: true },
  };

  declare private data: CitationNetworkPresentation;
  declare filterProject: boolean;
  declare private focusedReferenceId: string | null;
  declare private references: readonly CitationReferenceChoice[];
  declare private status: string;
  private requestId = 0;
  private workspaceId = "";

  constructor() {
    super();
    this.data = emptyData;
    this.filterProject = false;
    this.focusedReferenceId = null;
    this.references = [];
    this.status = "";
  }

  configure(workspaceId: string): void {
    this.workspaceId = workspaceId;
  }

  async open(referenceId: string | null = null): Promise<void> {
    this.focusedReferenceId = referenceId;
    this.hidden = false;
    await Promise.all([this.refresh(), this.refreshQueue()]);
    if (typeof this.scrollIntoView === "function") this.scrollIntoView({ block: "start" });
  }

  async refresh(): Promise<void> {
    const requestId = ++this.requestId;
    this.status = "Loading citation assertions…";
    try {
      const filter = this.filterProject ? `?projectId=${encodeURIComponent(this.workspaceId)}` : "";
      const response = await fetch(`/api/library/citation-network${filter}`, { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isCitationNetwork(value)) throw new Error("Citation network returned an invalid representation");
      if (requestId !== this.requestId) return;
      this.setNetwork(value, Object.fromEntries(this.references.map(({ id, title }) => [id, title])));
      this.status = "";
    } catch (error) {
      if (requestId === this.requestId) this.status = errorMessage(error, "Could not load the citation network.");
    }
  }

  async refreshQueue(): Promise<void> {
    try {
      const response = await fetch("/api/library/citation-research-queue", { credentials: "same-origin" });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isCitationResearchQueue(value)) throw new Error("Citation research queue returned an invalid representation");
      this.data = { ...this.data, queue: value };
    } catch (error) {
      this.emitOutcome({ action: "notice", message: errorMessage(error, "Could not load the citation research queue.") });
    }
  }

  setData(data: CitationNetworkPresentation): void {
    this.data = data;
  }

  setNetwork(network: CitationNetwork, referenceTitles: Readonly<Record<string, string>>): void {
    this.data = { ...this.data, network, referenceTitles };
  }

  setExpansion(expansion: CitationExpansionResult): void {
    this.data = { ...this.data, expansion };
  }

  setReferences(references: readonly CitationReferenceChoice[]): void {
    this.references = references.map(({ id, title }) => ({ id, title: bibTeXDisplayText(title) }));
  }

  setArtifacts(artifacts: readonly LibraryPdfArtifact[]): void {
    this.data = { ...this.data, pdfArtifactIds: artifacts.map(({ id }) => id) };
  }

  setCandidateSaving(doi: string, saving: boolean): void {
    this.panel()?.setCandidateSaving(doi, saving);
  }

  setExpansionSaving(saving: boolean): void {
    this.panel()?.setExpansionSaving(saving);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(citationNetworkActionEvent, this.handleActionEvent);
  }

  override disconnectedCallback(): void {
    this.removeEventListener(citationNetworkActionEvent, this.handleActionEvent);
    super.disconnectedCallback();
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has("references")) this.panel()?.setReferences(this.references);
    if (changed.has("data") || changed.has("filterProject") || changed.has("focusedReferenceId")) {
      this.panel()?.setData({ ...this.data, filterProject: this.filterProject, focusedReferenceId: this.focusedReferenceId });
    }
  }

  protected override render(): TemplateResult {
    return html`
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="eyebrow">Guided snowballing</p>
          <h3 class="mt-1 text-lg font-semibold" id="citation-network-heading">Reference trail</h3>
          <p class="mt-2 max-w-2xl text-xs leading-5 text-app-text-soft">
            Follow references from trusted seeds, review each candidate, and retain how every source was found.
          </p>
          ${
            this.focusedReferenceId
              ? html`
                  <p class="mt-2 text-xs text-app-text-soft">
                    Focused on ${this.data.referenceTitles[this.focusedReferenceId] ?? "selected source"}
                  </p>
                `
              : ""
          }
        </div>
        <div class="flex gap-2">
          <button
            class="button-secondary"
            id="filter-project-citations"
            type="button"
            aria-pressed=${String(this.filterProject)}
            @click=${this.toggleProjectFilter}
          >
            Current project
          </button>
          <button class="button-secondary" id="close-citation-network" type="button" @click=${this.close}>Close network</button>
        </div>
      </div>
      ${this.status ? html`<p class="status-text mt-3" role="status">${this.status}</p>` : ""}
      <citation-network-panel id="citation-network-panel"></citation-network-panel>
    `;
  }

  protected toggleProjectFilter(): void {
    this.filterProject = !this.filterProject;
    void this.refresh();
  }

  protected close(): void {
    this.requestId += 1;
    this.hidden = true;
  }

  protected async handleAction(action: CitationNetworkAction): Promise<void> {
    if (action.action === "focus") this.focusReference(action.referenceId);
    else if (action.action === "expand") await this.expand(action.referenceId, action.direction);
    else if (action.action === "record") await this.recordAssertion(action);
    else if (action.action === "review") await this.reviewAssertion(action.assertionId, action.decision);
    else if (action.action === "save-candidate") await this.acceptCandidate(action.expansion, action.candidate);
    else if (action.action === "save-all-candidates") await this.acceptCandidates(action.expansion);
    else if (action.action === "queue") await this.queueReference(action.referenceId, action.seedReferenceId, action.direction);
    else await this.dequeueReference(action.referenceId);
  }

  private focusReference(referenceId: string): void {
    this.focusedReferenceId = referenceId;
    this.data = { ...this.data, expansion: null };
    this.emitOutcome({ action: "route", referenceId });
    if (typeof this.scrollIntoView === "function") this.scrollIntoView({ block: "start" });
  }

  protected readonly handleActionEvent = (event: Event): void => {
    void this.handleAction((event as CustomEvent<CitationNetworkAction>).detail);
  };

  private async recordAssertion(action: Extract<CitationNetworkAction, { readonly action: "record" }>): Promise<void> {
    const { citedReferenceId, citingReferenceId, polarity } = action;
    if (!citingReferenceId || !citedReferenceId || citingReferenceId === citedReferenceId) {
      this.emitOutcome({ action: "notice", message: "Choose two different sources for the citation assertion." });
      return;
    }
    try {
      await expectOk(
        await jsonFetch("/api/library/citation-assertions", {
          citingReferenceId,
          citedReferenceId,
          polarity,
          evidenceState: "confirmed",
          method: "manual",
          observedAt: new Date().toISOString(),
          sourceKind: "researcher",
          sourceId: `manual:${crypto.randomUUID()}`,
          sourceLocator: "Kirjolab researcher assertion",
          confidence: null,
        }),
      );
      await this.refresh();
      this.emitOutcome({ action: "notice", message: "Citation assertion recorded with researcher provenance." });
    } catch (error) {
      this.emitOutcome({ action: "notice", message: errorMessage(error, "Could not record the citation assertion.") });
    }
  }

  private async reviewAssertion(assertionId: string, decision: "confirmed" | "rejected"): Promise<void> {
    const note = window.prompt(`${decision === "confirmed" ? "Confirmation" : "Rejection"} note (optional)`) ?? "";
    try {
      await expectOk(await jsonFetch(`/api/library/citation-assertions/${encodeURIComponent(assertionId)}/review`, { decision, note }));
      await this.refresh();
      this.emitOutcome({ action: "notice", message: `Citation assertion ${decision}.` });
    } catch (error) {
      this.emitOutcome({ action: "notice", message: errorMessage(error, "Could not review the citation assertion.") });
    }
  }

  private async expand(referenceId: string, direction: "references" | "citations"): Promise<void> {
    try {
      const response = await jsonFetch(`/api/library/references/${encodeURIComponent(referenceId)}/citation-expansions`, { direction });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isCitationExpansionResult(value)) throw new Error("Citation expansion returned an invalid representation");
      this.setExpansion(value);
      await this.refresh();
      this.emitOutcome({
        action: "notice",
        message:
          value.unmatched.length > 0
            ? `Review ${value.unmatched.length} new reference${value.unmatched.length === 1 ? "" : "s"} from this seed.`
            : `Known ${value.provider === "crossref" ? "Crossref" : "Semantic Scholar"} relationships added to the shared citation network.`,
      });
    } catch (error) {
      this.emitOutcome({ action: "notice", message: errorMessage(error, "Could not expand the citation reference.") });
    }
  }

  private async acceptCandidate(expansion: CitationExpansionResult, candidate: CitationExpansionCandidate): Promise<void> {
    this.setCandidateSaving(candidate.doi, true);
    try {
      const response = await jsonFetch(`/api/library/references/${encodeURIComponent(expansion.seedReferenceId)}/citation-candidates`, {
        doi: candidate.doi,
        responseId: expansion.responseId,
        direction: expansion.direction,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isCitationCandidateAcceptance(value)) throw new Error("Citation candidate returned an invalid representation");
      this.setExpansion({
        ...expansion,
        assertions: [...expansion.assertions, value.assertion],
        unmatched: expansion.unmatched.filter((item) => item.doi !== candidate.doi),
      });
      await this.refresh();
      this.emitOutcome({
        action: "library-refresh",
        message: value.created ? "Reference saved with its discovery trail." : "Existing reference linked to its discovery trail.",
      });
    } catch (error) {
      this.setCandidateSaving(candidate.doi, false);
      this.emitOutcome({ action: "notice", message: errorMessage(error, "Could not save citation candidate") });
    }
  }

  private async acceptCandidates(expansion: CitationExpansionResult): Promise<void> {
    const candidates = expansion.unmatched.slice(0, 25);
    if (candidates.length === 0) return;
    this.setExpansionSaving(true);
    try {
      const response = await jsonFetch(`/api/library/references/${encodeURIComponent(expansion.seedReferenceId)}/citation-candidates`, {
        dois: candidates.map(({ doi }) => doi),
        responseId: expansion.responseId,
        direction: expansion.direction,
      });
      await expectOk(response);
      const value: unknown = await response.json();
      if (!isCitationCandidateBatchAcceptance(value)) throw new Error("Citation candidate batch returned an invalid representation");
      const acceptedDois = new Set(value.accepted.map(({ reference }) => reference.doi));
      this.setExpansion({
        ...expansion,
        assertions: [...expansion.assertions, ...value.accepted.map(({ assertion }) => assertion)],
        unmatched: expansion.unmatched.filter(({ doi }) => !acceptedDois.has(doi)),
      });
      this.setExpansionSaving(false);
      await this.refresh();
      const created = value.accepted.filter((item) => item.created).length;
      this.emitOutcome({
        action: "library-refresh",
        message: `Saved ${created} new and reused ${value.accepted.length - created} existing reference${value.accepted.length === 1 ? "" : "s"} with their discovery trails.`,
      });
    } catch (error) {
      this.setExpansionSaving(false);
      this.emitOutcome({ action: "notice", message: errorMessage(error, "Could not save citation candidates") });
    }
  }

  private async queueReference(referenceId: string, seedReferenceId: string, direction: "references" | "citations"): Promise<void> {
    try {
      const response = await jsonFetch(
        `/api/library/references/${encodeURIComponent(referenceId)}/research-queue`,
        { seedReferenceId, direction },
        "PUT",
      );
      await expectOk(response);
      await this.refreshQueue();
      this.emitOutcome({ action: "notice", message: "Reference queued for this research trail." });
    } catch (error) {
      this.emitOutcome({ action: "notice", message: errorMessage(error, "Could not queue the reference.") });
    }
  }

  private async dequeueReference(referenceId: string): Promise<void> {
    try {
      const response = await fetch(`/api/library/references/${encodeURIComponent(referenceId)}/research-queue`, {
        credentials: "same-origin",
        method: "DELETE",
      });
      await expectOk(response);
      this.data = { ...this.data, queue: this.data.queue.filter((item) => item.referenceId !== referenceId) };
      this.emitOutcome({ action: "notice", message: "Reference removed from the research queue." });
    } catch (error) {
      this.emitOutcome({ action: "notice", message: errorMessage(error, "Could not update the research queue.") });
    }
  }

  private emitOutcome(outcome: CitationNetworkOutcome): void {
    this.dispatchEvent(new CustomEvent<CitationNetworkOutcome>(citationNetworkOutcomeEvent, { bubbles: true, detail: outcome }));
  }

  private panel(): CitationNetworkPanel | null {
    return this.querySelector<CitationNetworkPanel>("#citation-network-panel");
  }
}

if (typeof customElements !== "undefined" && !customElements.get("citation-network-workspace")) {
  customElements.define("citation-network-workspace", CitationNetworkWorkspace);
}

declare global {
  interface HTMLElementTagNameMap {
    "citation-network-workspace": CitationNetworkWorkspace;
  }
}
