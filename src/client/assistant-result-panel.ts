import { html, LitElement, nothing, type TemplateResult } from "lit";
import type {
  ModelClarityQuestion,
  ModelClarityRewrites,
  ModelEvidenceItem,
  ModelIdeas,
  ModelPhrasingAlternatives,
  ModelProvider,
  ReferenceQueryRequest,
} from "./model-provider";
import type { PhrasingPurpose } from "../domain/phrasing-guidance";
import { isReferenceDiscoveryResults, referenceDiscoveryIdentifierUrl, type ReferenceDiscoveryResult } from "../domain/reference-discovery";
import type { ModelEvidenceReference } from "../domain/workspace";
import { errorMessage, expectOk, jsonFetch } from "./http";
import { importDiscoveredReference } from "./reference-discovery-import";

export interface AssistantAuthoringPassage {
  readonly fileId: string;
  readonly start: number;
  readonly end: number;
  readonly excerpt: string;
}

export interface AssistantRevisionContext {
  readonly passage: AssistantAuthoringPassage;
  readonly evidence: { readonly items: ModelEvidenceItem[]; readonly references: ModelEvidenceReference[] };
  readonly instruction: string;
  readonly sourceRevision: number;
}

export interface AssistantClarityContext extends AssistantRevisionContext {
  readonly provider: Pick<ModelProvider, "continueClarityDrill">;
  readonly question: ModelClarityQuestion;
}

export interface AssistantTableContext {
  readonly sourceRevision: number;
  readonly target: AssistantAuthoringPassage;
}

export interface AssistantRevisionChoice {
  readonly failureMessage: string;
  readonly instruction: string;
  readonly model: string;
  readonly providerLabel: string;
  readonly replacement: string;
  readonly successMessage: string;
}

export type AssistantResultActionDetail =
  | { readonly action: "continue-clarity"; readonly answer: string; readonly context: AssistantClarityContext }
  | { readonly action: "insert-table"; readonly context: AssistantTableContext; readonly markdown: string }
  | { readonly action: "choose-revision"; readonly choice: AssistantRevisionChoice; readonly context: AssistantRevisionContext };

export const assistantResultActionEvent = "assistant-result-action";
export const assistantReferenceRefreshEvent = "assistant-reference-refresh";

export interface AssistantReferenceRefresh {
  readonly index: number;
  readonly message: string;
  readonly requestId: number;
}

interface RevisionOption {
  readonly choice: AssistantRevisionChoice;
  readonly eyebrow?: string;
  readonly rationale?: string;
  readonly text: string;
  readonly title?: string;
}

type AssistantResultView =
  | { readonly kind: "empty" }
  | { readonly context: AssistantTableContext; readonly kind: "table"; readonly markdown: string }
  | { readonly context: AssistantClarityContext; readonly kind: "clarity-question" }
  | { readonly context: AssistantRevisionContext; readonly kind: "ideas"; readonly options: readonly RevisionOption[] }
  | {
      readonly kind: "references";
      readonly query: string;
      readonly rationale: string;
      readonly results: readonly ReferenceDiscoveryResult[];
    }
  | {
      readonly actionLabel: string;
      readonly context: AssistantRevisionContext;
      readonly kind: "revision-options";
      readonly options: readonly RevisionOption[];
    };

export class AssistantResultPanel extends LitElement {
  static override properties = {
    referenceSaveState: { state: true },
    referenceStatus: { state: true },
    view: { state: true },
  };

  declare private referenceSaveState: ReadonlyMap<number, "saving" | "saved">;
  declare private referenceStatus: string;
  declare private view: AssistantResultView;
  private readonly referenceRequestIds = new Map<number, number>();
  private nextReferenceRequestId = 0;

  constructor() {
    super();
    this.referenceSaveState = new Map();
    this.referenceStatus = "";
    this.view = { kind: "empty" };
  }

  clear(): void {
    this.referenceSaveState = new Map();
    this.referenceRequestIds.clear();
    this.referenceStatus = "";
    this.view = { kind: "empty" };
  }

  showTable(markdown: string, context: AssistantTableContext): void {
    this.view = { context, kind: "table", markdown };
  }

  showClarityQuestion(context: AssistantClarityContext): void {
    this.view = { context, kind: "clarity-question" };
    void this.updateComplete.then(() => {
      if (typeof this.querySelector === "function") this.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
  }

  async startClarityDrill(
    provider: Pick<ModelProvider, "startClarityDrill" | "continueClarityDrill">,
    context: AssistantRevisionContext,
  ): Promise<void> {
    const question = await provider.startClarityDrill({
      selectedPassage: context.passage.excerpt,
      instruction: context.instruction,
      evidence: context.evidence.items,
    });
    this.showClarityQuestion({ ...context, provider, question });
  }

  showIdeas(context: AssistantRevisionContext, result: ModelIdeas): void {
    this.view = {
      context,
      kind: "ideas",
      options: result.ideas.map((idea) => ({
        choice: {
          failureMessage: "Could not save the idea draft",
          instruction: `${context.instruction}\nChosen direction: ${idea.title}. ${idea.direction}`.slice(0, 4_000),
          model: result.model,
          providerLabel: result.providerLabel,
          replacement: idea.draft,
          successMessage: "Idea draft ready for exact before-and-after review.",
        },
        rationale: idea.direction,
        text: idea.draft,
        title: idea.title,
      })),
    };
  }

  showPhrasingAlternatives(context: AssistantRevisionContext, purpose: PhrasingPurpose, result: ModelPhrasingAlternatives): void {
    this.view = {
      actionLabel: "Review this alternative",
      context,
      kind: "revision-options",
      options: result.alternatives.map((alternative, index) => ({
        choice: {
          failureMessage: "Could not save the phrasing alternative",
          instruction: `${context.instruction}\nRhetorical purpose: ${purpose.label}`.slice(0, 4_000),
          model: result.model,
          providerLabel: result.providerLabel,
          replacement: alternative.text,
          successMessage: "Phrasing alternative ready for exact before-and-after review.",
        },
        eyebrow: `${purpose.label} · option ${index + 1}`,
        rationale: alternative.rationale,
        text: alternative.text,
      })),
    };
  }

  showClarityRewrites(context: AssistantRevisionContext, answer: string, result: ModelClarityRewrites): void {
    this.view = {
      actionLabel: "Review this revision",
      context,
      kind: "revision-options",
      options: result.rewrites.map((rewrite, index) => ({
        choice: {
          failureMessage: "Could not save the clarity revision",
          instruction: `${context.instruction}\nClarification: ${answer}`.slice(0, 4_000),
          model: result.model,
          providerLabel: result.providerLabel,
          replacement: rewrite.text,
          successMessage: "Clarity revision ready for exact before-and-after review.",
        },
        eyebrow: `Option ${index + 1}`,
        rationale: rewrite.rationale,
        text: rewrite.text,
      })),
    };
  }

  async completeClarityDrill(context: AssistantClarityContext, answer: string): Promise<void> {
    const result = await context.provider.continueClarityDrill({
      selectedPassage: context.passage.excerpt,
      instruction: context.instruction,
      evidence: context.evidence.items,
      issue: context.question.issue,
      question: context.question.question,
      answer,
    });
    this.showClarityRewrites(context, answer, result);
  }

  showReferences(query: string, rationale: string, results: readonly ReferenceDiscoveryResult[]): void {
    this.referenceSaveState = new Map();
    this.referenceRequestIds.clear();
    this.referenceStatus = "";
    this.view = { kind: "references", query, rationale, results };
  }

  async discoverReferences(provider: Pick<ModelProvider, "formulateReferenceQuery">, request: ReferenceQueryRequest): Promise<number> {
    const formulated = await provider.formulateReferenceQuery(request);
    const response = await jsonFetch("/api/library/discovery", { query: formulated.query });
    await expectOk(response);
    const value: unknown = await response.json();
    if (!isReferenceDiscoveryResults(value)) throw new Error("Reference provider returned invalid discovery results");
    this.showReferences(formulated.query, formulated.rationale, value);
    return value.length;
  }

  private setReferenceSaveState(index: number, state: "idle" | "saving" | "saved"): void {
    const next = new Map(this.referenceSaveState);
    if (state === "idle") next.delete(index);
    else next.set(index, state);
    this.referenceSaveState = next;
  }

  completeReferenceSave(index: number, requestId: number): void {
    if (this.referenceRequestIds.get(index) !== requestId) return;
    this.referenceRequestIds.delete(index);
    this.setReferenceSaveState(index, "saved");
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult | typeof nothing {
    if (this.view.kind === "empty") return nothing;
    if (this.view.kind === "table") {
      return html`
        <section class="resource-card">
          <p class="eyebrow">Validated GFM table</p>
          <pre class="mt-3 overflow-x-auto whitespace-pre text-xs">${this.view.markdown}</pre>
          <button class="button-primary mt-3" type="button" @click=${this.insertTable}>
            ${this.view.context.target.start !== this.view.context.target.end ? "Replace selection with table" : "Insert table"}
          </button>
        </section>
      `;
    }
    if (this.view.kind === "clarity-question") {
      return html`
        <section class="resource-card">
          <p class="eyebrow">One ambiguity</p>
          <p class="mt-2 text-sm text-app-text-soft">${this.view.context.question.issue}</p>
          <h3 class="mt-3 text-base font-semibold">${this.view.context.question.question}</h3>
          <textarea class="field mt-3 w-full" rows="3" maxlength="4000" placeholder="State the concrete meaning you intend…"></textarea>
          <button class="button-primary mt-3" type="button" @click=${this.continueClarity}>Show precise rewrites</button>
        </section>
      `;
    }
    if (this.view.kind === "ideas") {
      return html`<div class="grid gap-3">
        ${this.view.options.map(
          (option, index) => html`
            <section class="resource-card">
              <h3 class="text-base font-semibold">${option.title}</h3>
              <p class="mt-2 text-sm text-app-text-soft">${option.rationale}</p>
              <details class="mt-3">
                <summary class="cursor-pointer text-xs font-semibold">Preview complete draft</summary>
                <p class="mt-2 whitespace-pre-wrap text-sm">${option.text}</p>
              </details>
              <button class="button-secondary mt-3" type="button" data-index=${index} @click=${this.chooseRevision}>
                Review this direction
              </button>
            </section>
          `,
        )}
      </div>`;
    }
    if (this.view.kind === "references") return this.renderReferences(this.view);
    const view = this.view;
    return html`<div class="grid gap-3">
      ${view.options.map(
        (option, index) => html`
          <section class="resource-card">
            <p class="eyebrow">${option.eyebrow}</p>
            <p class="mt-2 whitespace-pre-wrap text-sm">${option.text}</p>
            <p class="mt-2 text-xs text-app-text-soft">${option.rationale}</p>
            <button class="button-secondary mt-3" type="button" data-index=${index} @click=${this.chooseRevision}>
              ${view.actionLabel}
            </button>
          </section>
        `,
      )}
    </div>`;
  }

  protected continueClarity(): void {
    if (this.view.kind !== "clarity-question") return;
    const answer = typeof this.querySelector === "function" ? (this.querySelector<HTMLTextAreaElement>("textarea")?.value ?? "") : "";
    this.dispatchAction({ action: "continue-clarity", answer, context: this.view.context });
  }

  protected insertTable(): void {
    if (this.view.kind === "table")
      this.dispatchAction({ action: "insert-table", context: this.view.context, markdown: this.view.markdown });
  }

  protected chooseRevision(event: Event): void {
    if (this.view.kind !== "ideas" && this.view.kind !== "revision-options") return;
    const index = Number((event.currentTarget as HTMLButtonElement).dataset.index);
    const option = this.view.options[index];
    if (option) this.dispatchAction({ action: "choose-revision", choice: option.choice, context: this.view.context });
  }

  protected async saveReference(event: Event): Promise<void> {
    if (this.view.kind !== "references") return;
    const index = Number((event.currentTarget as HTMLButtonElement).dataset.index);
    const result = this.view.results[index];
    if (!result || this.referenceSaveState.has(index)) return;
    const requestId = ++this.nextReferenceRequestId;
    this.referenceRequestIds.set(index, requestId);
    this.setReferenceSaveState(index, "saving");
    this.referenceStatus = "";
    try {
      await importDiscoveredReference(result);
      if (this.referenceRequestIds.get(index) !== requestId) return;
      this.dispatchEvent(
        new CustomEvent<AssistantReferenceRefresh>(assistantReferenceRefreshEvent, {
          bubbles: true,
          composed: true,
          detail: {
            index,
            message: "Reference saved. Use its Library card to add it to this project before citing.",
            requestId,
          },
        }),
      );
    } catch (error) {
      if (this.referenceRequestIds.get(index) !== requestId) return;
      this.referenceRequestIds.delete(index);
      this.setReferenceSaveState(index, "idle");
      this.referenceStatus = errorMessage(error, "Could not save the reference.");
    }
  }

  private renderReferences(view: Extract<AssistantResultView, { kind: "references" }>): TemplateResult {
    return html`<div class="grid gap-3">
      <section class="resource-card">
        <p class="eyebrow">Registry query</p>
        <p class="mt-2 text-sm font-semibold">${view.query}</p>
        <p class="mt-2 text-xs text-app-text-soft">${view.rationale}</p>
      </section>
      ${view.results.map((result, index) => {
        const identifier = result.identifiers[0]!;
        const state = this.referenceSaveState.get(index);
        return html`<article class="resource-card">
          <p class="eyebrow">${referenceProviderLabel(result)}</p>
          <h3 class="mt-2 text-base font-semibold">${result.metadata.title}</h3>
          <p class="mt-2 text-xs text-app-text-soft">
            ${[result.metadata.authors.join("; "), result.metadata.year, result.metadata.venue].filter(Boolean).join(" · ")}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <a class="button-secondary" href=${referenceDiscoveryIdentifierUrl(identifier)} target="_blank" rel="noopener noreferrer">
              Verify ${identifier.scheme === "semantic-scholar" ? "Semantic Scholar" : identifier.scheme.toUpperCase()}
            </a>
            <button class="button-primary" type="button" data-index=${index} ?disabled=${state !== undefined} @click=${this.saveReference}>
              ${state === "saved" ? "Saved to library" : state === "saving" ? "Saving…" : "Save to library"}
            </button>
          </div>
        </article>`;
      })}
      <p class="status-line" role="status" ?hidden=${!this.referenceStatus}>${this.referenceStatus}</p>
    </div>`;
  }

  private dispatchAction(detail: AssistantResultActionDetail): void {
    this.dispatchEvent(
      new CustomEvent<AssistantResultActionDetail>(assistantResultActionEvent, {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  }
}

function referenceProviderLabel(result: ReferenceDiscoveryResult): string {
  return result.providers
    .map(({ provider }) => (provider === "semantic-scholar" ? "Semantic Scholar" : provider === "openalex" ? "OpenAlex" : "Crossref"))
    .join(" + ");
}

if (typeof customElements !== "undefined" && !customElements.get("assistant-result-panel")) {
  customElements.define("assistant-result-panel", AssistantResultPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "assistant-result-panel": AssistantResultPanel;
  }
}
