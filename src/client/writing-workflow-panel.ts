import { html, LitElement, type TemplateResult } from "lit";
import type { ProjectFile } from "../domain/project-files";
import { parseResearchQuestions } from "../domain/research-questions";
import { parseReviewerResponses } from "../domain/reviewer-response";

export type WritingWorkflowKind = "research-questions" | "reviewer-responses";

export interface WritingWorkflowItem {
  readonly from: number;
  readonly id: string;
  readonly label: string;
  readonly meta: string;
  readonly to: number;
}

export interface WritingWorkflowData {
  readonly fileId: string | null;
  readonly items: readonly WritingWorkflowItem[];
  readonly kind: WritingWorkflowKind;
}

export type WritingWorkflowActionDetail =
  | { readonly action: "open" | "download"; readonly kind: WritingWorkflowKind }
  | {
      readonly action: "select";
      readonly fileId: string;
      readonly from: number;
      readonly kind: WritingWorkflowKind;
      readonly to: number;
    };

export const writingWorkflowActionEvent = "writing-workflow-action";

export function researchQuestionWorkflowData(file: ProjectFile | undefined): WritingWorkflowData {
  const questions = file ? parseResearchQuestions(file.content) : [];
  return {
    fileId: file?.id ?? null,
    items: questions.map((question) => ({
      from: question.from,
      id: question.id,
      label: question.question,
      meta: `${question.status} · ${question.sections.length}s · ${question.claims.length}c`,
      to: question.to,
    })),
    kind: "research-questions",
  };
}

export function reviewerResponseWorkflowData(file: ProjectFile | undefined): WritingWorkflowData {
  const responses = file ? parseReviewerResponses(file.content) : [];
  return {
    fileId: file?.id ?? null,
    items: responses.map((response) => ({
      from: response.from,
      id: response.id,
      label: response.summary,
      meta: `${response.status} · ${response.manuscriptLinks.length} links`,
      to: response.to,
    })),
    kind: "reviewer-responses",
  };
}

export class WritingWorkflowPanel extends LitElement {
  static override properties = {
    data: { state: true },
  };

  declare private data: WritingWorkflowData;

  constructor() {
    super();
    this.data = { fileId: null, items: [], kind: "research-questions" };
  }

  setData(data: WritingWorkflowData): void {
    this.data = data;
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const reviewerResponses = this.data.kind === "reviewer-responses";
    const countId = reviewerResponses ? "reviewer-response-count" : "research-question-count";
    const listId = reviewerResponses ? "reviewer-response-list" : "research-question-list";
    const openId = reviewerResponses ? "open-reviewer-response" : "open-research-questions";
    const title = reviewerResponses ? "Reviewer responses" : "Research questions";
    return html`
      <details class="rail-collection mt-4" open>
        <summary><span>${title}</span><span class="count-badge" id=${countId}>${this.data.items.length}</span></summary>
        <div class="rail-collection-body">
          <div class="grid gap-2" id=${listId}>${this.renderItems()}</div>
          ${reviewerResponses
            ? html`<div class="mt-3 grid grid-cols-2 gap-2">
                <button class="button-secondary justify-center" id=${openId} type="button" @click=${this.open}>
                  ${this.data.fileId ? "Open matrix" : "Start matrix"}
                </button>
                <button
                  class="button-secondary justify-center"
                  id="download-reviewer-response"
                  type="button"
                  ?disabled=${!this.data.fileId || this.data.items.length === 0}
                  @click=${this.download}
                >
                  Export letter
                </button>
              </div>`
            : html`<button class="button-secondary mt-3 w-full justify-center" id=${openId} type="button" @click=${this.open}>
                ${this.data.fileId ? "Open question ledger" : "Start question ledger"}
              </button>`}
        </div>
      </details>
    `;
  }

  protected request(action: "open" | "download"): void {
    this.dispatchAction({ action, kind: this.data.kind });
  }

  protected open(): void {
    this.request("open");
  }

  protected download(): void {
    this.request("download");
  }

  protected select(item: WritingWorkflowItem): void {
    if (!this.data.fileId) return;
    this.dispatchAction({
      action: "select",
      fileId: this.data.fileId,
      from: item.from,
      kind: this.data.kind,
      to: item.to,
    });
  }

  private renderItems(): TemplateResult | readonly TemplateResult[] {
    if (!this.data.fileId) {
      return html`<div class="empty-state">
        ${this.data.kind === "reviewer-responses"
          ? "Track external review feedback separately from collaborator comments."
          : "Record the study's questions, methods, and manuscript coverage."}
      </div>`;
    }
    if (this.data.items.length === 0) {
      return html`<div class="empty-state">
        ${this.data.kind === "reviewer-responses" ? "Add an ## R1.1: … heading to the matrix." : "Add an ## RQ1: … heading to the ledger."}
      </div>`;
    }
    return this.data.items.map(
      (item, index) => html`
        <button class="manuscript-map-item" type="button" data-index=${index} @click=${this.selectFromEvent}>
          <span><strong>${item.id} · </strong>${item.label}</span>
          <small>${item.meta}</small>
        </button>
      `,
    );
  }

  private dispatchAction(detail: WritingWorkflowActionDetail): void {
    this.dispatchEvent(
      new CustomEvent<WritingWorkflowActionDetail>(writingWorkflowActionEvent, {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  }

  protected selectFromEvent(event: Event): void {
    const index = Number((event.currentTarget as HTMLButtonElement).dataset.index);
    const item = this.data.items[index];
    if (item) this.select(item);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("writing-workflow-panel")) {
  customElements.define("writing-workflow-panel", WritingWorkflowPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "writing-workflow-panel": WritingWorkflowPanel;
  }
}
