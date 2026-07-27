import { describe, expect, it } from "vitest";
import {
  researchQuestionWorkflowData,
  reviewerResponseWorkflowData,
  WritingWorkflowPanel,
  type WritingWorkflowItem,
} from "./writing-workflow-panel";
import type { ProjectFile } from "../domain/project-files";

const item: WritingWorkflowItem = {
  from: 10,
  id: "RQ1",
  label: "What changed?",
  meta: "open · 1s · 2c",
  to: 30,
};

const file: ProjectFile = {
  content: "",
  createdAt: "t1",
  id: "workflow",
  mediaType: "text/markdown",
  path: "workflow.md",
  updatedAt: "t1",
};

class TestWritingWorkflowPanel extends WritingWorkflowPanel {
  downloads: { content: string; name: string }[] = [];

  renderForTest() {
    return this.render();
  }

  openForTest(): void {
    this.open();
  }

  downloadForTest(): void {
    this.download();
  }

  protected override downloadFile(name: string, content: string): void {
    this.downloads.push({ content, name });
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  selectEventForTest(index: string): void {
    const event = new Event("click");
    Object.defineProperty(event, "currentTarget", { value: { dataset: { index } } });
    this.selectFromEvent(event);
  }

  selectForTest(value: WritingWorkflowItem): void {
    this.select(value);
  }
}

describe("writing workflow presentation", () => {
  it("adapts portable workflow Markdown into presentation items", () => {
    const questions = researchQuestionWorkflowData({
      ...file,
      content: "## RQ1: What changed?\n\n- **Status:** active\n- **Manuscript sections:** #results\n- **Claims:** claim-1\n",
    });
    const responses = reviewerResponseWorkflowData({
      ...file,
      content: "## R1.1: Clarify the result\n\n- **Status:** addressed\n- **Manuscript links:** #results\n",
    });

    expect(researchQuestionWorkflowData(undefined).items).toEqual([]);
    expect(reviewerResponseWorkflowData(undefined).items).toEqual([]);
    expect(questions.items[0]).toMatchObject({ id: "RQ1", label: "What changed?", meta: "active · 1s · 1c" });
    expect(responses.items[0]).toMatchObject({ id: "R1.1", label: "Clarify the result", meta: "addressed · 1 links" });
    expect(responses.letter).toContain("# Response to reviewers");
  });

  it("renders missing, empty, and populated workflow states", () => {
    const panel = new TestWritingWorkflowPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({ fileId: null, items: [], kind: "reviewer-responses", letter: null });
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({ fileId: "questions", items: [], kind: "research-questions", letter: null });
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({ fileId: "responses", items: [], kind: "reviewer-responses", letter: "letter" });
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({ fileId: "questions", items: [item], kind: "research-questions", letter: null });
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({ fileId: "responses", items: [{ ...item, id: "R1.1" }], kind: "reviewer-responses", letter: "letter" });
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns download and binds open, notice, and bounded selection actions", () => {
    const panel = new TestWritingWorkflowPanel();
    const actions: unknown[] = [];
    panel.bind({
      notice: (message) => actions.push({ action: "notice", message }),
      open: (kind) => actions.push({ action: "open", kind }),
      select: (fileId, from, to) => actions.push({ action: "select", fileId, from, to }),
    });

    panel.selectForTest(item);
    panel.setData({ fileId: "responses", items: [item], kind: "reviewer-responses", letter: "letter" });
    panel.openForTest();
    panel.downloadForTest();
    panel.selectEventForTest("0");
    panel.selectEventForTest("99");

    expect(actions).toEqual([
      { action: "open", kind: "reviewer-responses" },
      { action: "notice", message: "Response letter exported." },
      { action: "select", fileId: "responses", from: 10, to: 30 },
    ]);
    expect(panel.downloads).toEqual([{ content: "letter", name: "response-to-reviewers.md" }]);
    expect(panel.rootForTest()).toBe(panel);
  });
});
