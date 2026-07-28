import { html, LitElement, type TemplateResult } from "lit";
import { runEditingPass, type EditingPass } from "../domain/editing-passes";
import { buildManuscriptMap } from "../domain/manuscript-map";
import { composeProject, type CompositionSourceSpan, type ProjectFile } from "../domain/project-files";
import { researchQuestionsPath } from "../domain/research-questions";
import { reviewerResponsePath } from "../domain/reviewer-response";
import type { WorkspaceSnapshot } from "../domain/workspace";
import { researchDiaryPath } from "../domain/writing-workflows";
import { sourceSpanAt } from "./composition-source-map";
import { researchQuestionWorkflowData, reviewerResponseWorkflowData, type WritingWorkflowData } from "./writing-workflow-panel";

interface ManuscriptMapProjectRequest {
  readonly fallbackSource: string;
  readonly files: readonly ProjectFile[];
  readonly snapshot: WorkspaceSnapshot | null;
  readonly source?: string | undefined;
}

interface ManuscriptMapProjectPresentation {
  readonly projectFileDialog: { focusRange(fileId: string | null, from: number, to: number): void };
  readonly researchDiaryPanel: { setContent(content: string | null): void };
  readonly researchQuestionPanel: { setData(data: WritingWorkflowData): void };
  readonly reviewerResponsePanel: { setData(data: WritingWorkflowData): void };
}

export class ManuscriptMapPanel extends LitElement {
  static override properties = {
    pass: { state: true },
    source: { state: true },
  };

  declare private pass: EditingPass;
  declare private source: string;
  private entryFileId = "";
  private projectPresentation: ManuscriptMapProjectPresentation | null = null;
  private sourceMap: readonly CompositionSourceSpan[] = [];

  constructor() {
    super();
    this.pass = "structure";
    this.source = "";
  }

  setSource(source: string): void {
    this.source = source;
  }

  bindProjectPresentation(presentation: ManuscriptMapProjectPresentation): void {
    this.projectPresentation = presentation;
  }

  presentProject({ fallbackSource, files, snapshot, source }: ManuscriptMapProjectRequest): void {
    const composition = snapshot ? composeProject(files, snapshot.entryFileId, {}, snapshot.reviewArtifactPins) : null;
    this.entryFileId = snapshot?.entryFileId ?? "";
    this.sourceMap = composition?.sourceMap ?? [];
    this.source = source ?? composition?.content ?? fallbackSource;
    const presentation = this.projectPresentation;
    if (!presentation) return;
    presentation.researchDiaryPanel.setContent(files.find((file) => file.path === researchDiaryPath)?.content ?? null);
    presentation.researchQuestionPanel.setData(researchQuestionWorkflowData(files.find((file) => file.path === researchQuestionsPath)));
    presentation.reviewerResponsePanel.setData(reviewerResponseWorkflowData(files.find((file) => file.path === reviewerResponsePath)));
  }

  override connectedCallback(): void {
    if (!this.hasUpdated) this.replaceChildren();
    super.connectedCallback();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const map = buildManuscriptMap(this.source);
    const editingCues = runEditingPass(this.source, this.pass);
    return html`
      <div class="manuscript-map-summary" id="manuscript-map-summary" aria-live="polite">
        ${this.metric(map.words, "words")} ${this.metric(map.sections.length, "sections")} ${this.metric(map.citations, "citations")}
      </div>
      <div class="mt-4 grid gap-2" id="manuscript-map-outline">
        ${map.sections.length === 0
          ? html`<div class="empty-state">Add headings to build the manuscript map.</div>`
          : map.sections.map(
              (section) => html`
                <button
                  type="button"
                  class="manuscript-map-item"
                  data-range-from=${section.from}
                  data-range-to=${section.to}
                  style=${`padding-inline-start: ${0.6 + Math.max(0, section.level - 1) * 0.55}rem`}
                  @click=${this.selectRange}
                >
                  <span>${section.title}</span>
                  <small>${section.words}w · ${section.citations}c</small>
                </button>
              `,
            )}
      </div>
      <details class="rail-collection mt-4" open>
        <summary><span>Review cues</span><span class="count-badge" id="manuscript-map-cue-count">${map.cues.length}</span></summary>
        <div class="rail-collection-body" id="manuscript-map-cues">
          ${map.cues.length === 0
            ? html`<div class="empty-state">No structural review cues.</div>`
            : map.cues.map(
                (cue) => html`
                  <button
                    type="button"
                    class="manuscript-map-item"
                    data-range-from=${cue.from}
                    data-range-to=${cue.to}
                    @click=${this.selectRange}
                  >
                    <span>${cue.message}</span>
                    <small>${cue.kind.replaceAll("-", " ")}</small>
                  </button>
                `,
              )}
        </div>
      </details>
      <details class="rail-collection mt-4" open>
        <summary><span>Editing pass</span><span class="count-badge" id="editing-pass-cue-count">${editingCues.length}</span></summary>
        <div class="rail-collection-body">
          <label class="field-label" for="editing-pass">Review purpose</label>
          <select class="field mt-2" id="editing-pass" .value=${this.pass} @change=${this.changePass}>
            <option value="structure">Structure</option>
            <option value="order">Order</option>
            <option value="clarity">Clarity</option>
            <option value="evidence">Evidence</option>
            <option value="length">Length</option>
          </select>
          <div class="mt-3 grid gap-2" id="editing-pass-cues">
            ${editingCues.length === 0
              ? html`<div class="empty-state">No ${this.pass} cues.</div>`
              : editingCues.map(
                  (cue) => html`
                    <button
                      type="button"
                      class="manuscript-map-item"
                      data-range-from=${cue.from}
                      data-range-to=${cue.to}
                      @click=${this.selectRange}
                    >
                      <span>${cue.message}</span>
                      <small>${cue.detail}</small>
                    </button>
                  `,
                )}
          </div>
        </div>
      </details>
    `;
  }

  protected changePass(event: Event): void {
    this.pass = readEditingPass((event.currentTarget as HTMLSelectElement).value);
  }

  protected selectRange(event: Event): void {
    const button = event.currentTarget as HTMLButtonElement;
    const from = Number(button.dataset.rangeFrom);
    const to = Number(button.dataset.rangeTo);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) return;
    const start = sourceSpanAt(this.sourceMap, from);
    const end = sourceSpanAt(this.sourceMap, Math.max(from, to - 1));
    const selection =
      start && end && start.fileId === end.fileId
        ? { fileId: start.fileId, from: start.sourceStart, to: end.sourceEnd }
        : { fileId: this.entryFileId, from, to };
    this.projectPresentation?.projectFileDialog.focusRange(selection.fileId, selection.from, selection.to);
  }

  private metric(value: number, label: string): TemplateResult {
    return html`<span><strong>${value.toLocaleString()}</strong><small>${label}</small></span>`;
  }
}

function readEditingPass(value: string): EditingPass {
  if (value === "order" || value === "clarity" || value === "evidence" || value === "length") return value;
  return "structure";
}

if (typeof customElements !== "undefined" && !customElements.get("manuscript-map-panel")) {
  customElements.define("manuscript-map-panel", ManuscriptMapPanel);
}

declare global {
  interface HTMLElementTagNameMap {
    "manuscript-map-panel": ManuscriptMapPanel;
  }
}
