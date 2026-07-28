import { html, LitElement, type TemplateResult } from "lit";
import { researchDiaryPath, researchDiaryTemplate, summarizeResearchDiary } from "../domain/writing-workflows";
import type { WritingWorkflowDocument } from "./writing-workflow-panel";

export class ResearchDiarySummary extends LitElement {
  static override properties = { content: { state: true } };

  declare private content: string | null;
  private document: Pick<WritingWorkflowDocument, "openWorkflowFile"> | null = null;

  constructor() {
    super();
    this.content = null;
  }

  setContent(content: string | null): void {
    this.content = content;
  }

  bindProject(document: Pick<WritingWorkflowDocument, "openWorkflowFile">): void {
    this.document = document;
  }

  protected emitOpen(): void {
    void this.document?.openWorkflowFile(researchDiaryPath, () => researchDiaryTemplate(new Date().toISOString().slice(0, 10)));
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const summary = this.content === null ? null : summarizeResearchDiary(this.content);
    const copy = summary
      ? `${summary.entries} dated ${summary.entries === 1 ? "entry" : "entries"} · ${summary.openQuestions} open ${summary.openQuestions === 1 ? "question" : "questions"} · ${summary.nextActions} next ${summary.nextActions === 1 ? "action" : "actions"}`
      : "Keep progress, discoveries, questions, and the next action in portable Markdown.";
    return html`<details class="rail-collection mt-4" open>
      <summary>
        <span>Research diary</span><span class="count-badge" id="research-diary-entry-count">${summary?.entries ?? 0}</span>
      </summary>
      <div class="rail-collection-body">
        <p class="px-1 text-xs leading-5 text-app-text-soft" id="research-diary-summary">${copy}</p>
        <button class="button-secondary mt-3 w-full justify-center" id="open-research-diary" type="button" @click=${this.emitOpen}>
          ${summary ? "Open diary" : "Start diary"}
        </button>
      </div>
    </details>`;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("research-diary-summary")) {
  customElements.define("research-diary-summary", ResearchDiarySummary);
}

declare global {
  interface HTMLElementTagNameMap {
    "research-diary-summary": ResearchDiarySummary;
  }
}
