import { describe, expect, it } from "vitest";
import type { ProjectRevisionContent, ProjectRevisionDiff, ProjectRevisionSummary } from "../domain/project-history";
import type { ProjectHistoryOperation } from "./project-history-machine";
import {
  ProjectHistoryPanel,
  projectHistoryActionEvent,
  projectHistoryCloseEvent,
  renderComparison,
  renderRevision,
} from "./project-history-panel";

const revisions: readonly ProjectRevisionSummary[] = [
  {
    createdAt: "2026-07-25T00:00:00.000Z",
    fileCount: 2,
    milestones: [{ createdAt: "t2", description: "", id: "m1", name: "Submitted", revision: 2 }],
    reason: "checkpoint",
    revision: 2,
    title: "Paper",
  },
  {
    createdAt: "invalid",
    fileCount: 1,
    milestones: [],
    reason: "created",
    revision: 1,
    title: "Paper",
  },
];

const content: ProjectRevisionContent = {
  annotations: [],
  assets: [],
  bibliography: "",
  claims: [],
  comments: [],
  entryFileId: "main",
  files: [{ content: "# Paper", createdAt: "t1", id: "main", mediaType: "text/markdown", path: "main.md", updatedAt: "t1" }],
  folders: [],
  pdfs: [],
  projectReferences: [],
  publicationPdfLinks: [],
  relationships: { annotationPassages: 0, claimEvidence: 0, claimPassages: 0, comments: 0 },
  researchShares: [],
  revision: 2,
  reviewArtifactPins: [],
  source: "# Paper",
  title: "Paper",
};

const comparison: ProjectRevisionDiff = {
  binaries: [{ after: null, before: null, id: "pdf", status: "unchanged" }],
  composed: { addedLines: 2, afterWords: 12, beforeWords: 10, hunks: [], removedLines: 1, wordDelta: 2 },
  files: [
    {
      addedLines: 2,
      afterPath: "main.md",
      beforePath: "main.md",
      hunks: [],
      id: "main",
      removedLines: 1,
      status: "modified",
    },
  ],
  fromRevision: 1,
  toRevision: 2,
};

class TestProjectHistoryPanel extends ProjectHistoryPanel {
  renderForTest() {
    return this.render();
  }

  requestForTest(operation: ProjectHistoryOperation): void {
    this.requestAction(operation);
  }

  compareForTest(): void {
    this.compare(new Event("submit") as SubmitEvent);
  }

  closeForTest(): void {
    this.close();
  }

  selectForTest(from: string, to: string): void {
    const fromEvent = new Event("change");
    Object.defineProperty(fromEvent, "currentTarget", { value: { value: from } });
    this.updateFromRevision(fromEvent);
    const toEvent = new Event("change");
    Object.defineProperty(toEvent, "currentTarget", { value: { value: to } });
    this.updateToRevision(toEvent);
  }
}

describe("project history presentation", () => {
  it("renders timeline, busy, error, revision, and comparison states", () => {
    const panel = new TestProjectHistoryPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.showTimeline(revisions);
    expect(panel.renderForTest()).toBeDefined();
    panel.setBusy(true);
    expect(panel.renderForTest()).toBeDefined();
    panel.showError("Unavailable");
    expect(panel.renderForTest()).toBeDefined();
    panel.showLoading();
    panel.showRevision(content);
    expect(panel.renderForTest()).toBeDefined();
    panel.showComparison(comparison);
    expect(panel.renderForTest()).toBeDefined();
    expect(renderRevision(content)).toBeDefined();
    expect(renderComparison(comparison)).toBeDefined();
  });

  it("emits typed revision and close intents", () => {
    const panel = new TestProjectHistoryPanel();
    const actions: ProjectHistoryOperation[] = [];
    let closed = false;
    panel.addEventListener(projectHistoryActionEvent, (event) => {
      actions.push((event as CustomEvent<ProjectHistoryOperation>).detail);
    });
    panel.addEventListener(projectHistoryCloseEvent, () => {
      closed = true;
    });

    panel.showTimeline(revisions);
    panel.selectForTest("2", "1");
    panel.requestForTest({ kind: "inspect", revision: 2 });
    panel.compareForTest();
    panel.closeForTest();

    expect(actions).toEqual([
      { kind: "inspect", revision: 2 },
      { from: 2, kind: "compare", to: 1 },
    ]);
    expect(closed).toBe(true);
  });
});
