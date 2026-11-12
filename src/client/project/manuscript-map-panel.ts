import { html, nothing, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import type * as Y from "yjs";
import { runEditingPass, type EditingPass } from "../../domain/manuscript/editing-passes";
import {
  buildManuscriptMap,
  buildManuscriptOutline,
  type ManuscriptOutlineItem,
  type ManuscriptOutlineParagraph,
  type ManuscriptOutlineSection,
} from "../../domain/manuscript/manuscript-map";
import { composeProject, type CompositionSourceSpan, type ProjectFile } from "../../domain/project/project-files";
import { LightDomElement } from "../platform/light-dom-controller";
import { researchQuestionsPath } from "../../domain/manuscript/research-questions";
import { reviewerResponsePath } from "../../domain/manuscript/reviewer-response";
import type { WorkspaceSnapshot } from "../../domain/workspace/workspace";
import { researchDiaryPath } from "../../domain/manuscript/writing-workflows";
import { outlineOffset, outlineSourceRange } from "./outline-position";
import { ParagraphAnalysisController } from "./paragraph-analysis";
import { modelProviderChangeEvent } from "../assistant/model-provider-settings";
import type { ModelProvider } from "../assistant/model-provider";
import type { ResearchDiarySummary } from "../context/research-diary-summary";
import {
  researchQuestionWorkflowData,
  reviewerResponseWorkflowData,
  type WritingWorkflowPanel,
  type WritingWorkflowData,
  type WritingWorkflowDocument,
} from "../editor/writing-workflow-panel";

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

export type ManuscriptMapApplicationPresentation = ManuscriptMapProjectPresentation & {
  readonly projectFileDialog: ManuscriptMapProjectPresentation["projectFileDialog"] &
    WritingWorkflowDocument & {
      readonly activeFileId: string | null;
      readonly project: WorkspaceSnapshot | null;
      projectFiles(): ProjectFile[];
    };
  readonly source: Pick<HTMLTextAreaElement, "value" | "selectionStart" | "addEventListener">;
  readonly previewSyncControls: { sourceScrollOffsetAtCenter(): number };
  readonly modelProviderSettings: Pick<EventTarget, "addEventListener"> & { provider(): Pick<ModelProvider, "analyzeParagraph"> };
  readonly researchDiaryPanel: Pick<ResearchDiarySummary, "bindProject" | "setContent">;
  readonly researchQuestionPanel: Pick<WritingWorkflowPanel, "bindProject" | "setData">;
  readonly reviewerResponsePanel: Pick<WritingWorkflowPanel, "bindProject" | "setData">;
  readonly toast: { show(message: string): void };
};

export class ManuscriptMapPanel extends LightDomElement {
  private pass: EditingPass = "structure";
  private source = "";
  private map = buildManuscriptMap("");
  private outline = buildManuscriptOutline("");
  private editingCues = runEditingPass("", "structure");
  private entryFileId = "";
  private projectPresentation: ManuscriptMapProjectPresentation | null = null;
  private sourceMap: readonly CompositionSourceSpan[] = [];
  private application: ManuscriptMapApplicationPresentation | null = null;
  private document: Y.Doc | null = null;
  private sourceAbort: AbortController | null = null;
  private readonly analysis = new ParagraphAnalysisController();
  private unsubscribeAnalysis: (() => void) | null = null;
  private activeOffset: number | null = null;
  private readingOffset: number | null = null;
  private collapsed = new Set<string>();
  private sectionKeys = new Map<number, string>();
  private paragraphNumbers = new Map<number, number>();
  private wholeDocument = false;
  private follow = false;
  private visible = false;
  private composing = false;
  private aiEnabled = false;
  private scrollFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private layoutVisible = true;

  setSource(source: string): void {
    if (source === this.source) return;
    this.source = source;
    this.map = buildManuscriptMap(source);
    this.outline = buildManuscriptOutline(source);
    this.editingCues = runEditingPass(source, this.pass);
    const occurrences = new Map<string, number>();
    this.sectionKeys = new Map(
      this.outline.sections.map((section) => {
        const identity = `${section.level}:${section.title}`;
        const occurrence = (occurrences.get(identity) ?? 0) + 1;
        occurrences.set(identity, occurrence);
        return [section.from, `${identity}:${occurrence}`];
      }),
    );
    const keys = new Set(this.sectionKeys.values());
    this.collapsed = new Set([...this.collapsed].filter((key) => keys.has(key)));
    this.paragraphNumbers = new Map(this.outline.paragraphs.map((paragraph, index) => [paragraph.from, index + 1]));
    this.updateAnalysis();
    this.requestUpdate();
  }

  bindApplication(presentation: ManuscriptMapApplicationPresentation, document: Y.Doc): void {
    this.disconnectSource();
    this.application = presentation;
    this.document = document;
    this.bindProjectPresentation(presentation);
    presentation.researchDiaryPanel.bindProject(presentation.projectFileDialog);
    for (const panel of [presentation.researchQuestionPanel, presentation.reviewerResponsePanel]) {
      panel.bindProject(presentation.projectFileDialog, presentation.toast);
    }
    this.connectSource();
  }

  bindProjectPresentation(presentation: ManuscriptMapProjectPresentation): void {
    this.projectPresentation = presentation;
  }

  presentProject({ fallbackSource, files, snapshot, source }: ManuscriptMapProjectRequest): void {
    // Preview rendering may complete after another edit. Always read live files when bound.
    const project = this.application?.projectFileDialog;
    if (project) {
      snapshot = project.project;
      files = project.projectFiles();
      source = undefined;
      fallbackSource = this.application?.source.value ?? fallbackSource;
    }
    const composition = snapshot ? composeProject(files, snapshot.entryFileId, {}, snapshot.reviewArtifactPins) : null;
    this.entryFileId = snapshot?.entryFileId ?? "";
    this.sourceMap = composition?.sourceMap ?? [];
    this.setSource(source ?? composition?.content ?? fallbackSource);
    this.syncEditorPosition();
    const presentation = this.projectPresentation;
    if (!presentation) return;
    presentation.researchDiaryPanel.setContent(files.find((file) => file.path === researchDiaryPath)?.content ?? null);
    presentation.researchQuestionPanel.setData(researchQuestionWorkflowData(files.find((file) => file.path === researchQuestionsPath)));
    presentation.reviewerResponsePanel.setData(reviewerResponseWorkflowData(files.find((file) => file.path === reviewerResponsePath)));
  }

  setEditorPosition(fileId: string, offset: number, readingOffset?: number): void {
    this.activeOffset = this.composing ? null : outlineOffset(this.sourceMap, fileId, offset, this.activeOffset);
    if (readingOffset !== undefined)
      this.readingOffset = this.composing ? null : outlineOffset(this.sourceMap, fileId, readingOffset, this.readingOffset);
    this.updateAnalysis();
    this.requestUpdate();
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.syncEditorPosition();
    this.updateAnalysis();
  }

  setAnalysisEnabled(enabled: boolean): void {
    this.aiEnabled = enabled;
    this.updateProvider();
    this.updateAnalysis();
    this.analysis.setEnabled(enabled);
    this.requestUpdate();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.connectSource();
  }

  override disconnectedCallback(): void {
    this.disconnectSource();
    this.analysis.update(null);
    super.disconnectedCallback();
  }

  private get activeParagraph(): ManuscriptOutlineParagraph | undefined {
    const offset = this.activeOffset;
    return offset === null ? undefined : this.outline.paragraphs.find((item) => item.from <= offset && offset <= item.to);
  }

  protected override render(): TemplateResult {
    const paragraph = this.activeParagraph;
    const section =
      this.activeOffset === null
        ? undefined
        : this.outline.sections.find((item) => item.from <= this.activeOffset! && this.activeOffset! < item.to);
    const target = paragraph ?? section;
    const cues = this.wholeDocument
      ? this.editingCues
      : target
        ? this.editingCues.filter((cue) => cue.from < target.to && cue.to > target.from)
        : [];
    const shownCues = cues.slice(0, this.wholeDocument ? 20 : 3);
    return html`
      <div class="outline-toolbar">
        <label><input type="checkbox" .checked=${this.follow} @change=${this.changeFollow} /> Follow reading position</label>
        <button class="button-secondary" type="button" @click=${this.showCurrent}>Show current passage</button>
      </div>
      <nav id="manuscript-map-outline" aria-label="Manuscript outline" class="manuscript-outline">
        ${
          this.outline.items.length
            ? html`<ol>
                ${this.renderItems(this.outline.items, paragraph)}
              </ol>`
            : html`<p class="empty-state">Add headings or prose to build the outline.</p>`
        }
      </nav>
      <section class="outline-hints" aria-label="Writing hints">
        <div class="outline-hints-heading">
          <h2>Writing hints</h2>
          <label><input type="checkbox" .checked=${this.wholeDocument} @change=${this.changeScope} /> Whole document</label>
        </div>
        <p class="outline-target">
          ${paragraph ? `Paragraph ${this.paragraphNumbers.get(paragraph.from)}${section ? ` · ${section.title}` : ""}` : (section?.title ?? "Place the caret in a manuscript passage to see contextual hints.")}
        </p>
        <label class="field-label" for="editing-pass">Review purpose</label>
        <select class="field mt-2" id="editing-pass" .value=${this.pass} @change=${this.changePass}>
          <option value="structure">Structure</option>
          <option value="order">Order</option>
          <option value="clarity">Clarity</option>
          <option value="evidence">Evidence</option>
          <option value="length">Length</option>
        </select>
        <div class="outline-cues" id="editing-pass-cues">
          ${
            shownCues.length
              ? shownCues.map(
                  (cue) =>
                    html`<button
                      class="manuscript-map-item"
                      type="button"
                      data-range-from=${cue.from}
                      data-range-to=${cue.to}
                      ?disabled=${this.composing}
                      @click=${this.selectRange}
                    >
                      <span>${cue.message}<small>${cue.detail}</small></span>
                    </button>`,
                )
              : html`<p class="outline-status">No ${this.pass} hints for ${this.wholeDocument ? "this document" : "this passage"}.</p>`
          }
        </div>
        <p class="outline-status">
          <span id="editing-pass-cue-count">${cues.length}</span> advisory
          cues${shownCues.length < cues.length ? ` · showing ${shownCues.length}` : ""}. Review these in the context of your research.
        </p>
        ${this.renderAnalysis()}
      </section>
      <div class="manuscript-map-summary" id="manuscript-map-summary">
        ${this.metric(this.map.words, "words")} ${this.metric(this.outline.sections.length, "sections")}
        ${this.metric(this.map.citations, "citations")}
      </div>
    `;
  }

  private renderItems(items: readonly ManuscriptOutlineItem[], activeParagraph: ManuscriptOutlineParagraph | undefined): TemplateResult[] {
    return items.map((item) =>
      item.kind === "section" ? this.renderSection(item, activeParagraph) : this.renderParagraph(item, activeParagraph === item),
    );
  }

  private renderSection(item: ManuscriptOutlineSection, activeParagraph: ManuscriptOutlineParagraph | undefined): TemplateResult {
    const key = this.sectionKeys.get(item.from) ?? "";
    const collapsed = this.collapsed.has(key);
    const active = this.activeOffset !== null && item.from <= this.activeOffset && this.activeOffset < item.to;
    const reading = this.readingOffset !== null && item.from <= this.readingOffset && this.readingOffset < item.to;
    return html`<li>
      <div class="outline-heading-row">
        <button
          class="outline-toggle"
          type="button"
          aria-label=${`${collapsed ? "Expand" : "Collapse"} ${item.title}`}
          aria-expanded=${String(!collapsed)}
          data-heading-key=${key}
          @click=${this.toggleSection}
        >
          ${collapsed ? "▸" : "▾"}
        </button>
        <button
          class="outline-heading"
          type="button"
          aria-pressed=${String(active && !activeParagraph)}
          aria-current=${ifDefined(reading ? "location" : undefined)}
          data-range-from=${item.from}
          data-range-to=${item.headingTo}
          ?disabled=${this.composing}
          @click=${this.selectRange}
        >
          <span>${item.title}</span><small title="Words including subsections">${item.subtreeWords}w</small>
        </button>
      </div>
      ${
        collapsed
          ? nothing
          : html`<ol>
              ${this.renderItems(item.children, activeParagraph)}
            </ol>`
      }
    </li>`;
  }

  private renderParagraph(item: ManuscriptOutlineParagraph, active: boolean): TemplateResult {
    const reading = this.readingOffset !== null && item.from <= this.readingOffset && this.readingOffset <= item.to;
    return html`<li>
      <button
        class="outline-paragraph"
        type="button"
        aria-pressed=${String(active)}
        aria-current=${ifDefined(reading ? "location" : undefined)}
        data-range-from=${item.from}
        data-range-to=${item.to}
        ?disabled=${this.composing}
        @click=${this.selectRange}
      >
        <small>Paragraph ${this.paragraphNumbers.get(item.from)}</small
        ><span>${item.text.slice(0, 110)}${item.text.length > 110 ? "…" : ""}</span>
      </button>
    </li>`;
  }

  private renderAnalysis(): TemplateResult {
    const snapshot = this.analysis.snapshot;
    const status = {
      off: "Enable AI guidance to interpret this paragraph’s purpose and suggest improvements.",
      unavailable: "Select a supported paragraph and configure a model in Writing assistant.",
      pending: snapshot.result ? "Updating · previous AI interpretation is outdated." : "Updating AI interpretation…",
      stale: "Passage changed · previous AI interpretation is outdated.",
      current: "Current · AI interpretation",
      unclear: "AI interpretation · purpose unclear",
      failed: "AI analysis unavailable. Editing and local hints remain available.",
    }[snapshot.status];
    return html`<section class="outline-analysis" aria-label="Paragraph purpose">
      <label><input type="checkbox" .checked=${this.aiEnabled} @change=${this.changeAI} /> AI paragraph guidance</label>
      <p class="outline-status">
        When enabled, the current paragraph and nearby context are sent to your configured model after a typing pause. Enabled for this
        session only.
      </p>
      <p class="outline-status" role="status">${status}</p>
      ${
        snapshot.result
          ? html`<p class="outline-purpose">${snapshot.result.purpose ?? "The paragraph’s purpose is unclear."}</p>
              <ul>
                ${snapshot.result.hints.map((hint) => html`<li>${hint}</li>`)}
              </ul>`
          : nothing
      }
      ${snapshot.status === "failed" ? html`<button class="button-secondary" type="button" @click=${this.retryAnalysis}>Retry analysis</button>` : nothing}
    </section>`;
  }

  protected changePass(event: Event): void {
    this.pass = readEditingPass((event.currentTarget as HTMLSelectElement).value);
    this.editingCues = runEditingPass(this.source, this.pass);
    this.requestUpdate();
  }

  protected selectRange(event: Event): void {
    if (this.composing) return;
    const button = event.currentTarget as HTMLButtonElement;
    const range = outlineSourceRange(this.sourceMap, this.entryFileId, Number(button.dataset.rangeFrom), Number(button.dataset.rangeTo));
    if (!range) return;
    this.activeOffset = Number(button.dataset.rangeFrom);
    this.projectPresentation?.projectFileDialog.focusRange(range.fileId, range.from, range.to);
    // Repeated includes can select identical authored offsets without a native select event.
    this.updateAnalysis();
    this.requestUpdate();
  }

  private readonly toggleSection = (event: Event): void => {
    const key = (event.currentTarget as HTMLButtonElement).dataset.headingKey;
    if (key === undefined) return;
    if (this.collapsed.has(key)) this.collapsed.delete(key);
    else this.collapsed.add(key);
    this.requestUpdate();
  };
  private readonly changeScope = (event: Event): void => {
    this.wholeDocument = (event.currentTarget as HTMLInputElement).checked;
    this.requestUpdate();
  };
  private readonly changeFollow = (event: Event): void => {
    this.follow = (event.currentTarget as HTMLInputElement).checked;
    if (this.follow) void this.revealReadingPosition();
  };
  private readonly showCurrent = (): void => {
    void this.revealReadingPosition();
  };
  private readonly changeAI = (event: Event): void => {
    this.setAnalysisEnabled((event.currentTarget as HTMLInputElement).checked);
  };
  private readonly retryAnalysis = (): void => {
    this.analysis.retry();
  };

  private updateAnalysis(): void {
    const paragraph = this.activeParagraph;
    if (!this.visible || !this.layoutVisible || this.composing || !paragraph || paragraph.text.length > 8_000) {
      this.analysis.update(null);
      return;
    }
    const index = this.outline.paragraphs.indexOf(paragraph);
    const range = outlineSourceRange(this.sourceMap, this.entryFileId, paragraph.from, paragraph.to);
    if (!range) {
      this.analysis.update(null);
      return;
    }
    const section = this.outline.sections.find((item) => item.from <= paragraph.from && paragraph.from < item.to);
    this.analysis.update({
      key: `${range.fileId}:${range.from}`,
      request: {
        selectedPassage: paragraph.text,
        sectionTitle: section?.title.slice(0, 500) ?? "",
        previousParagraph: this.outline.paragraphs[index - 1]?.text.slice(-2_000) ?? "",
        nextParagraph: this.outline.paragraphs[index + 1]?.text.slice(0, 2_000) ?? "",
      },
    });
  }

  private readonly updateProvider = (): void => {
    try {
      this.analysis.setProvider(this.application?.modelProviderSettings.provider() ?? null);
    } catch {
      this.analysis.setProvider(null);
    }
  };

  private connectSource(): void {
    const application = this.application;
    if (!application) return;
    this.disconnectSource();
    this.unsubscribeAnalysis = this.analysis.subscribe(() => this.requestUpdate());
    this.sourceAbort = new AbortController();
    const options = { signal: this.sourceAbort.signal };
    for (const name of ["click", "select", "selectionchange", "keyup"])
      application.source.addEventListener(name, this.syncEditorPosition, options);
    application.source.addEventListener("input", this.sourceChanged, options);
    application.source.addEventListener("compositionstart", this.compositionStart, options);
    application.source.addEventListener("compositionend", this.compositionEnd, options);
    application.source.addEventListener("scroll", this.sourceScrolled, { ...options, passive: true });
    application.modelProviderSettings.addEventListener(modelProviderChangeEvent, this.updateProvider, options);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.layoutVisible = this.getClientRects().length > 0;
        this.updateAnalysis();
      });
      this.resizeObserver.observe(this);
    }
    this.document?.on("update", this.sourceChanged);
    this.updateProvider();
    this.sourceChanged();
  }

  private disconnectSource(): void {
    this.sourceAbort?.abort();
    this.sourceAbort = null;
    this.document?.off("update", this.sourceChanged);
    this.unsubscribeAnalysis?.();
    this.unsubscribeAnalysis = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.scrollFrame !== null) cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = null;
  }

  private readonly sourceChanged = (): void => {
    const application = this.application;
    if (!application || this.composing) {
      this.analysis.update(null);
      return;
    }
    this.presentProject({
      files: application.projectFileDialog.projectFiles(),
      snapshot: application.projectFileDialog.project,
      fallbackSource: application.source.value,
    });
  };

  private readonly syncEditorPosition = (): void => {
    const application = this.application;
    if (!application) return;
    this.setEditorPosition(
      application.projectFileDialog.activeFileId ?? this.entryFileId,
      application.source.selectionStart,
      application.previewSyncControls.sourceScrollOffsetAtCenter(),
    );
  };

  private readonly compositionStart = (): void => {
    this.composing = true;
    this.activeOffset = null;
    this.readingOffset = null;
    this.analysis.update(null);
    this.requestUpdate();
  };
  private readonly compositionEnd = (): void => {
    this.composing = false;
    this.sourceChanged();
  };

  private readonly sourceScrolled = (): void => {
    if (this.scrollFrame !== null || this.composing) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = null;
      const application = this.application;
      if (!application) return;
      this.readingOffset = outlineOffset(
        this.sourceMap,
        application.projectFileDialog.activeFileId ?? this.entryFileId,
        application.previewSyncControls.sourceScrollOffsetAtCenter(),
        this.readingOffset,
      );
      this.requestUpdate();
      if (this.follow && this.visible) void this.revealReadingPosition();
    });
  };

  private async revealReadingPosition(): Promise<void> {
    const offset = this.readingOffset ?? this.activeOffset;
    if (offset === null) return;
    for (const section of this.outline.sections)
      if (section.from <= offset && offset < section.subtreeTo) this.collapsed.delete(this.sectionKeys.get(section.from) ?? "");
    this.requestUpdate();
    await this.updateComplete;
    const scroller = this.querySelector<HTMLElement>(".manuscript-outline");
    const target =
      scroller?.querySelector<HTMLElement>('[aria-current="location"].outline-paragraph') ??
      scroller?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!scroller || !target) return;
    const bounds = scroller.getBoundingClientRect();
    const item = target.getBoundingClientRect();
    if (item.top < bounds.top) scroller.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) scroller.scrollTop += item.bottom - bounds.bottom;
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
