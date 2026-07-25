import { describe, expect, it } from "vitest";
import {
  researchQuestionWorkflowData,
  reviewerResponseWorkflowData,
  WritingWorkflowPanel,
  writingWorkflowActionEvent,
  type WritingWorkflowActionDetail,
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
  renderForTest() {
    return this.render();
  }

  openForTest(): void {
    this.open();
  }

  downloadForTest(): void {
    this.download();
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
  });

  it("renders missing, empty, and populated workflow states", () => {
    const panel = new TestWritingWorkflowPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({ fileId: null, items: [], kind: "reviewer-responses" });
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({ fileId: "questions", items: [], kind: "research-questions" });
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({ fileId: "responses", items: [], kind: "reviewer-responses" });
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({ fileId: "questions", items: [item], kind: "research-questions" });
    expect(panel.renderForTest()).toBeDefined();
    panel.setData({ fileId: "responses", items: [{ ...item, id: "R1.1" }], kind: "reviewer-responses" });
    expect(panel.renderForTest()).toBeDefined();
  });

  it("emits open, download, and bounded selection intents", () => {
    const panel = new TestWritingWorkflowPanel();
    const actions: WritingWorkflowActionDetail[] = [];
    panel.addEventListener(writingWorkflowActionEvent, (event) => {
      actions.push((event as CustomEvent<WritingWorkflowActionDetail>).detail);
    });

    panel.selectForTest(item);
    panel.setData({ fileId: "responses", items: [item], kind: "reviewer-responses" });
    panel.openForTest();
    panel.downloadForTest();
    panel.selectEventForTest("0");
    panel.selectEventForTest("99");

    expect(actions).toEqual([
      { action: "open", kind: "reviewer-responses" },
      { action: "download", kind: "reviewer-responses" },
      { action: "select", fileId: "responses", from: 10, kind: "reviewer-responses", to: 30 },
    ]);
    expect(panel.rootForTest()).toBe(panel);
  });
});
