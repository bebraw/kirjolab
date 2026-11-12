import { afterEach, describe, expect, it, vi } from "vitest";
import { isTemplateResult } from "lit/directive-helpers.js";
import * as Y from "yjs";
import { ManuscriptMapPanel } from "./manuscript-map-panel";
import { researchQuestionsPath } from "../../domain/manuscript/research-questions";
import { reviewerResponsePath } from "../../domain/manuscript/reviewer-response";
import { workspaceSnapshotFixture } from "../../test-support/workspace-fixture";
import { researchDiaryPath } from "../../domain/manuscript/writing-workflows";
import { modelProviderChangeEvent } from "../assistant/model-provider-settings";
import type { ModelParagraphAnalysis } from "../assistant/model-provider";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function livePanel(
  initialSource = "# Study\n\nThis study examines a clear question.\n\nA second passage explains the method.",
  initialSelection = 10,
) {
  const document = new Y.Doc();
  const text = document.getText("source");
  text.insert(0, initialSource);
  const source = Object.assign(new EventTarget(), { value: text.toString(), selectionStart: initialSelection });
  const file = { ...workspaceSnapshotFixture.files[0]!, content: text.toString() };
  const result: ModelParagraphAnalysis = {
    purpose: "Introduces the research question.",
    hints: ["Name the study population."],
    adapter: "openai-compatible",
    providerLabel: "Test model",
    model: "test",
  };
  const analyzeParagraph = vi.fn().mockResolvedValue(result);
  const settings = Object.assign(new EventTarget(), { provider: vi.fn(() => ({ analyzeParagraph })) });
  const panel = new TestManuscriptMapPanel();
  const focusRange = vi.fn();
  const projectFileDialog = {
    focusRange,
    openWorkflowFile: vi.fn(),
    activeFileId: file.id,
    project: { ...workspaceSnapshotFixture, files: [file] },
    projectFiles: () => [{ ...file, content: text.toString() }],
  };
  panel.bindApplication(
    {
      source,
      projectFileDialog,
      previewSyncControls: { sourceScrollOffsetAtCenter: () => source.selectionStart },
      modelProviderSettings: settings,
      researchDiaryPanel: { bindProject: vi.fn(), setContent: vi.fn() },
      researchQuestionPanel: { bindProject: vi.fn(), setData: vi.fn() },
      reviewerResponsePanel: { bindProject: vi.fn(), setData: vi.fn() },
      toast: { show: vi.fn() },
    },
    document,
  );
  return { panel, document, text, source, analyzeParagraph, settings, focusRange, result, projectFileDialog, file };
}

function renderedText(value: unknown): string {
  if (Array.isArray(value)) return value.map(renderedText).join("");
  if (
    typeof value === "object" &&
    value !== null &&
    "strings" in value &&
    "values" in value &&
    Array.isArray(value.strings) &&
    Array.isArray(value.values)
  ) {
    const values: unknown[] = value.values;
    return value.strings.map((part: unknown, index: number) => `${String(part)}${renderedText(values[index])}`).join("");
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

class TestManuscriptMapPanel extends ManuscriptMapPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  changePassForTest(value: string): void {
    this.changePass(eventWithTarget({ value }));
  }

  selectForTest(from?: string, to?: string): void {
    this.selectRange(eventWithTarget({ dataset: { rangeFrom: from, rangeTo: to } }));
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

function renderedEvent(value: unknown, marker: string, label: string): ((event: Event) => void) | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const callback = renderedEvent(item, marker, label);
      if (callback) return callback;
    }
  }
  if (!isTemplateResult(value, 1)) return null;
  for (const [index, part] of value.strings.entries()) {
    if (part.includes(marker) && value.strings[index + 1]?.includes(label)) {
      const callback = value.values[index];
      if (typeof callback === "function") return (event) => callback(event);
    }
    const nested = renderedEvent(value.values[index], marker, label);
    if (nested) return nested;
  }
  return null;
}

function interact(panel: TestManuscriptMapPanel, marker: string, label: string, target: object = {}): void {
  const callback = renderedEvent(panel.renderForTest(), marker, label);
  if (!callback) throw new Error(`Missing rendered control: ${label}`);
  callback(eventWithTarget(target));
}

describe("manuscript map panel", () => {
  it("sends the exact active paragraph with bounded heading and adjacent context", async () => {
    vi.useFakeTimers();
    const heading = `${"H".repeat(500)} omitted heading suffix`;
    const previous = `omitted previous prefix ${"p".repeat(1_999)}Z`;
    const active = "The active paragraph explains the sampling choice.";
    const next = `N${"n".repeat(1_999)} omitted next suffix`;
    const manuscript = `# ${heading}\n\n${previous}\n\n${active}\n\n${next}\n`;
    const { panel, analyzeParagraph } = livePanel(manuscript, manuscript.indexOf(active));
    panel.setVisible(true);
    panel.setAnalysisEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenCalledExactlyOnceWith(
      {
        selectedPassage: active,
        sectionTitle: "H".repeat(500),
        previousParagraph: `${"p".repeat(1_999)}Z`,
        nextParagraph: `N${"n".repeat(1_999)}`,
      },
      { signal: expect.any(AbortSignal) },
    );
    panel.disconnectedCallback();
  });

  it("uses empty context at document boundaries and never invents a section heading", async () => {
    vi.useFakeTimers();
    const first = "An opening passage before any heading.";
    const last = "The final passage closes the argument.";
    const manuscript = `${first}\n\n${last}\n`;
    const { panel, source, analyzeParagraph } = livePanel(manuscript, 0);
    panel.setVisible(true);
    panel.setAnalysisEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenLastCalledWith(
      { selectedPassage: first, sectionTitle: "", previousParagraph: "", nextParagraph: last },
      expect.anything(),
    );
    source.selectionStart = manuscript.indexOf(last);
    source.dispatchEvent(new Event("select"));
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenLastCalledWith(
      { selectedPassage: last, sectionTitle: "", previousParagraph: first, nextParagraph: "" },
      expect.anything(),
    );
    panel.disconnectedCallback();
  });

  it("analyzes an 8000-character paragraph but refuses longer passages without truncating them", async () => {
    vi.useFakeTimers();
    const manuscript = `# Study\n\n${"A".repeat(8_000)}`;
    const { panel, source, text, document, analyzeParagraph } = livePanel(manuscript);
    panel.setVisible(true);
    panel.setAnalysisEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenCalledExactlyOnceWith(
      { selectedPassage: "A".repeat(8_000), sectionTitle: "Study", previousParagraph: "", nextParagraph: "" },
      expect.anything(),
    );
    source.value = `${manuscript}B`;
    document.transact(() => text.insert(text.length, "B"));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(analyzeParagraph).toHaveBeenCalledOnce();
    expect(renderedText(panel.renderForTest())).not.toContain("Introduces the research question.");
    expect(renderedText(panel.renderForTest())).toContain("Select a supported paragraph");
    panel.disconnectedCallback();
  });

  it("pauses analysis when the selected Context pane has no layout and resumes on reveal", async () => {
    vi.useFakeTimers();
    let reportResize = (): void => {
      throw new Error("Observer not connected");
    };
    const observe = vi.fn();
    const disconnect = vi.fn();
    class TestResizeObserver implements ResizeObserver {
      observe = observe;
      unobserve = vi.fn();
      disconnect = disconnect;
      constructor(callback: ResizeObserverCallback) {
        reportResize = () => callback([], this);
      }
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const { panel, source, text, analyzeParagraph } = livePanel();
    let rectCount = 0;
    Object.defineProperty(panel, "getClientRects", { value: () => ({ length: rectCount }) });
    expect(observe).toHaveBeenCalledExactlyOnceWith(panel);
    reportResize();
    panel.setVisible(true);
    panel.setAnalysisEnabled(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(analyzeParagraph).not.toHaveBeenCalled();

    rectCount = 1;
    reportResize();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenCalledOnce();
    rectCount = 0;
    reportResize();
    source.value = text.toString().replace("This study", "This expanded study");
    text.insert(14, "expanded ");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(analyzeParagraph).toHaveBeenCalledOnce();
    expect(renderedText(panel.renderForTest())).not.toContain("Introduces the research question.");

    rectCount = 1;
    reportResize();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenCalledTimes(2);
    panel.disconnectedCallback();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("lets rendered controls enable analysis, retry a failure, and turn guidance off", async () => {
    vi.useFakeTimers();
    const { panel, analyzeParagraph, result } = livePanel();
    analyzeParagraph.mockRejectedValueOnce(new Error("Model unavailable"));
    analyzeParagraph.mockResolvedValueOnce({ ...result, purpose: null, hints: [] });
    panel.setVisible(true);
    expect(renderedText(panel.renderForTest())).toContain("Enable AI guidance");
    interact(panel, "@change=", "AI paragraph guidance", { checked: true });
    await vi.advanceTimersByTimeAsync(1_500);
    const failed = renderedText(panel.renderForTest());
    expect(failed).toContain("AI analysis unavailable. Editing and local hints remain available.");
    expect(failed).toContain("Retry analysis");

    interact(panel, "@click=", "Retry analysis");
    expect(renderedText(panel.renderForTest())).toContain("Updating AI interpretation");
    await vi.advanceTimersByTimeAsync(1_500);
    const unclear = renderedText(panel.renderForTest());
    expect(unclear).toContain("AI interpretation · purpose unclear");
    expect(unclear).toContain("The paragraph’s purpose is unclear.");
    expect(unclear).not.toContain("Retry analysis");
    expect(unclear).not.toContain("Name the study population.");

    interact(panel, "@change=", "AI paragraph guidance", { checked: false });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(analyzeParagraph).toHaveBeenCalledTimes(2);
    expect(renderedText(panel.renderForTest())).toContain("Enable AI guidance");
    expect(renderedText(panel.renderForTest())).not.toContain("The paragraph’s purpose is unclear.");
    panel.disconnectedCallback();
  });

  it("ignores an obsolete preview projection and analyzes the current canonical file", async () => {
    vi.useFakeTimers();
    const { panel, file, analyzeParagraph } = livePanel();
    const stale = { ...file, content: "# Obsolete\n\nThis stale projection must never enter model context." };
    panel.presentProject({
      files: [stale],
      snapshot: { ...workspaceSnapshotFixture, files: [stale] },
      fallbackSource: stale.content,
      source: stale.content,
    });
    panel.setVisible(true);
    panel.setAnalysisEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenCalledExactlyOnceWith(
      {
        selectedPassage: "This study examines a clear question.",
        sectionTitle: "Study",
        previousParagraph: "",
        nextParagraph: "A second passage explains the method.",
      },
      expect.anything(),
    );
    panel.disconnectedCallback();
  });

  it("keeps previous interpretation visibly outdated while its replacement is still in flight", async () => {
    vi.useFakeTimers();
    const { panel, source, text, analyzeParagraph, result } = livePanel();
    panel.setVisible(true);
    panel.setAnalysisEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    let finishReplacement: (value: ModelParagraphAnalysis) => void = () => {
      throw new Error("Analysis has not started");
    };
    analyzeParagraph.mockImplementationOnce(
      () =>
        new Promise<ModelParagraphAnalysis>((resolve) => {
          finishReplacement = resolve;
        }),
    );
    source.value = text.toString().replace("This study", "This expanded study");
    text.insert(14, "expanded ");
    await vi.advanceTimersByTimeAsync(1_500);
    const pending = renderedText(panel.renderForTest());
    expect(pending).toContain("Updating · previous AI interpretation is outdated.");
    expect(pending).toContain("Introduces the research question.");
    expect(pending).not.toContain("Current · AI interpretation");
    finishReplacement({ ...result, purpose: "Introduces the expanded question.", hints: [] });
    await vi.advanceTimersByTimeAsync(0);
    const current = renderedText(panel.renderForTest());
    expect(current).toContain("Current · AI interpretation");
    expect(current).toContain("Introduces the expanded question.");
    expect(current).not.toContain("Introduces the research question.");
    panel.disconnectedCallback();
  });

  it("refreshes paragraph context when another include occurrence selects the same authored range", async () => {
    vi.useFakeTimers();
    const { panel, source, analyzeParagraph, projectFileDialog, file, focusRange } = livePanel();
    const shared = { ...file, id: "shared", path: "shared.md", content: "Repeated paragraph.\n" };
    const main = {
      ...file,
      path: "main.md",
      content: "# First\n\n::include[shared.md]\n\n# Second\n\nDifferent lead.\n\n::include[shared.md]\n",
    };
    const files = [main, shared];
    projectFileDialog.project = { ...projectFileDialog.project, files };
    projectFileDialog.projectFiles = () => files;
    projectFileDialog.activeFileId = shared.id;
    source.value = shared.content;
    source.selectionStart = 0;
    panel.presentProject({ files, snapshot: projectFileDialog.project, fallbackSource: "" });
    panel.setVisible(true);
    panel.setAnalysisEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenLastCalledWith(expect.objectContaining({ sectionTitle: "First" }), expect.anything());
    const secondOffset = "# First\n\nRepeated paragraph.\n\n# Second\n\nDifferent lead.\n\n".length;
    panel.selectForTest(String(secondOffset), String(secondOffset + "Repeated paragraph.".length));
    await vi.advanceTimersByTimeAsync(1_500);
    expect(focusRange).toHaveBeenCalledWith("shared", 0, "Repeated paragraph.".length);
    expect(analyzeParagraph).toHaveBeenCalledTimes(2);
    expect(analyzeParagraph).toHaveBeenLastCalledWith(
      expect.objectContaining({ sectionTitle: "Second", previousParagraph: "Different lead." }),
      expect.anything(),
    );
    panel.disconnectedCallback();
  });
  it("requires opt-in, follows live collaborator edits, and suspends hidden paragraph analysis", async () => {
    vi.useFakeTimers();
    const { panel, text, analyzeParagraph, source } = livePanel();
    panel.setVisible(true);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(analyzeParagraph).not.toHaveBeenCalled();
    panel.setAnalysisEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenCalledTimes(1);
    expect(renderedText(panel.renderForTest())).toContain("Introduces the research question.");
    expect(renderedText(panel.renderForTest())).toContain("Name the study population.");

    text.insert(10, "updated ");
    source.value = text.toString();
    expect(renderedText(panel.renderForTest())).toContain("previous AI interpretation is outdated");
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedPassage: expect.stringContaining("updated") }),
      expect.anything(),
    );
    panel.setVisible(false);
    text.insert(10, "hidden ");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(analyzeParagraph).toHaveBeenCalledTimes(2);
    panel.setVisible(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenCalledTimes(3);
    panel.disconnectedCallback();
  });

  it("does not navigate or analyze during composition and invalidates when the provider changes", async () => {
    vi.useFakeTimers();
    const { panel, source, analyzeParagraph, settings, focusRange } = livePanel();
    panel.setVisible(true);
    panel.setAnalysisEnabled(true);
    source.dispatchEvent(new Event("compositionstart"));
    panel.selectForTest("9", "20");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(focusRange).not.toHaveBeenCalled();
    expect(analyzeParagraph).not.toHaveBeenCalled();
    source.dispatchEvent(new Event("compositionend"));
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenCalledOnce();
    settings.provider.mockImplementation(() => {
      throw new Error("Missing model");
    });
    settings.dispatchEvent(new Event(modelProviderChangeEvent));
    expect(renderedText(panel.renderForTest())).not.toContain("Introduces the research question.");
    expect(renderedText(panel.renderForTest())).toContain("configure a model");
    panel.disconnectedCallback();
  });

  it("keeps scrolling independent from the active passage and tears down listeners", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16));
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    const { panel, source, analyzeParagraph } = livePanel();
    panel.setVisible(true);
    panel.setAnalysisEnabled(true);
    await vi.advanceTimersByTimeAsync(1_500);
    source.selectionStart = source.value.indexOf("A second");
    source.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(analyzeParagraph).toHaveBeenCalledOnce();
    source.dispatchEvent(new Event("selectionchange"));
    await vi.advanceTimersByTimeAsync(1_500);
    expect(analyzeParagraph).toHaveBeenCalledTimes(2);
    expect(analyzeParagraph).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedPassage: "A second passage explains the method." }),
      expect.anything(),
    );
    panel.disconnectedCallback();
    source.selectionStart = 10;
    source.dispatchEvent(new Event("click"));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(analyzeParagraph).toHaveBeenCalledTimes(2);
  });
  it("shows paragraph structure and scopes local hints to the active passage", () => {
    const panel = new TestManuscriptMapPanel();
    const source =
      "# Introduction\n\nThis study reports an important finding.\n\n## Method\n\nWe explain the sampling. The design is reproducible.\n";
    panel.setSource(source);
    panel.setEditorPosition("", source.indexOf("We explain"));
    panel.changePassForTest("clarity");
    const active = renderedText(panel.renderForTest());
    expect(active).toContain("Paragraph 2");
    expect(active).toContain("No clarity hints for this passage.");
    expect(active).not.toContain("Check whether the opening reference");

    panel.setEditorPosition("", source.indexOf("This study"));
    expect(renderedText(panel.renderForTest())).toContain("Check whether the opening reference");
  });

  it("clears the active passage when its source file is outside the composed manuscript", () => {
    const panel = new TestManuscriptMapPanel();
    const file = { ...workspaceSnapshotFixture.files[0]!, content: "# Study\n\nA passage to consider." };
    panel.presentProject({ fallbackSource: "", files: [file], snapshot: { ...workspaceSnapshotFixture, files: [file] } });
    panel.setEditorPosition("notes", 12);
    expect(renderedText(panel.renderForTest())).toContain("Place the caret in a manuscript passage");
  });
  it("renders empty and populated manuscript maps with each editing pass", () => {
    const panel = new TestManuscriptMapPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setSource("## Introduction\n\nThis study reports a result.\n\n### Detail\n\nShort text.\n");
    for (const pass of ["structure", "order", "clarity", "evidence", "length"]) {
      panel.changePassForTest(pass);
      expect(panel.renderForTest()).toBeDefined();
    }
    panel.changePassForTest("unknown");
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits only valid source-range selections", () => {
    const panel = new TestManuscriptMapPanel();
    const projectFileDialog = { focusRange: vi.fn() };
    panel.bindProjectPresentation({
      projectFileDialog,
      researchDiaryPanel: { setContent: vi.fn() },
      researchQuestionPanel: { setData: vi.fn() },
      reviewerResponsePanel: { setData: vi.fn() },
    });

    panel.selectForTest("2", "9");
    panel.selectForTest("-1", "4");
    panel.selectForTest("8", "4");
    panel.selectForTest("missing", "4");

    expect(projectFileDialog.focusRange).toHaveBeenCalledOnce();
    expect(projectFileDialog.focusRange).toHaveBeenCalledWith("", 2, 9);
  });

  it("projects the canonical project into the writing-guide siblings", () => {
    const panel = new TestManuscriptMapPanel();
    const researchDiaryPanel = { setContent: vi.fn() };
    const researchQuestionPanel = { setData: vi.fn() };
    const reviewerResponsePanel = { setData: vi.fn() };
    const projectFileDialog = { focusRange: vi.fn() };
    const files = [
      { ...workspaceSnapshotFixture.files[0]!, content: "# Composed manuscript" },
      { ...workspaceSnapshotFixture.files[0]!, id: "diary", path: researchDiaryPath, content: "## 2026-07-27" },
      { ...workspaceSnapshotFixture.files[0]!, id: "questions", path: researchQuestionsPath, content: "## RQ1: Does it work?" },
      { ...workspaceSnapshotFixture.files[0]!, id: "responses", path: reviewerResponsePath, content: "## R1.1: Clarify" },
    ];
    panel.bindProjectPresentation({ projectFileDialog, researchDiaryPanel, researchQuestionPanel, reviewerResponsePanel });

    panel.presentProject({ fallbackSource: "fallback", files, snapshot: { ...workspaceSnapshotFixture, files } });
    panel.selectForTest("0", "5");

    expect(researchDiaryPanel.setContent).toHaveBeenCalledWith("## 2026-07-27");
    expect(researchQuestionPanel.setData).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "questions", kind: "research-questions" }),
    );
    expect(reviewerResponsePanel.setData).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "responses", kind: "reviewer-responses" }),
    );
    expect(projectFileDialog.focusRange).toHaveBeenCalledWith(workspaceSnapshotFixture.entryFileId, 0, 5);
    expect(panel.renderForTest()).toBeDefined();
  });
});
