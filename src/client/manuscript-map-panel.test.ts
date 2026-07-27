import { describe, expect, it, vi } from "vitest";
import { ManuscriptMapPanel, type ManuscriptMapSelection } from "./manuscript-map-panel";
import { researchQuestionsPath } from "../domain/research-questions";
import { reviewerResponsePath } from "../domain/reviewer-response";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";
import { researchDiaryPath } from "../domain/writing-workflows";

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

describe("manuscript map panel", () => {
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
    const selections: ManuscriptMapSelection[] = [];
    panel.bindNavigation((selection) => selections.push(selection));

    panel.selectForTest("2", "9");
    panel.selectForTest("-1", "4");
    panel.selectForTest("8", "4");
    panel.selectForTest("missing", "4");

    expect(selections).toEqual([{ fileId: "", from: 2, to: 9 }]);
  });

  it("projects the canonical project into the writing-guide siblings", () => {
    const panel = new TestManuscriptMapPanel();
    const researchDiaryPanel = { setContent: vi.fn() };
    const researchQuestionPanel = { setData: vi.fn() };
    const reviewerResponsePanel = { setData: vi.fn() };
    const selections: ManuscriptMapSelection[] = [];
    const files = [
      { ...workspaceSnapshotFixture.files[0]!, content: "# Composed manuscript" },
      { ...workspaceSnapshotFixture.files[0]!, id: "diary", path: researchDiaryPath, content: "## 2026-07-27" },
      { ...workspaceSnapshotFixture.files[0]!, id: "questions", path: researchQuestionsPath, content: "## RQ1: Does it work?" },
      { ...workspaceSnapshotFixture.files[0]!, id: "responses", path: reviewerResponsePath, content: "## R1.1: Clarify" },
    ];
    panel.bindProjectPresentation({ researchDiaryPanel, researchQuestionPanel, reviewerResponsePanel });
    panel.bindNavigation((selection) => selections.push(selection));

    panel.presentProject({ fallbackSource: "fallback", files, snapshot: { ...workspaceSnapshotFixture, files } });
    panel.selectForTest("0", "5");

    expect(researchDiaryPanel.setContent).toHaveBeenCalledWith("## 2026-07-27");
    expect(researchQuestionPanel.setData).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "questions", kind: "research-questions" }),
    );
    expect(reviewerResponsePanel.setData).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "responses", kind: "reviewer-responses" }),
    );
    expect(selections).toEqual([{ fileId: workspaceSnapshotFixture.entryFileId, from: 0, to: 21 }]);
    expect(panel.renderForTest()).toBeDefined();
  });
});
