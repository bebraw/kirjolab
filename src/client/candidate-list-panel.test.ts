import { describe, expect, it } from "vitest";
import type { ModelCandidate } from "../domain/workspace";
import { CandidateListPanel, candidateListOpenEvent } from "./candidate-list-panel";

const revision: ModelCandidate = {
  createdAt: "2026-07-25T00:00:00.000Z",
  evidence: [],
  id: "candidate:1",
  instruction: "Clarify the finding",
  model: "local-model",
  operation: "revise-selection",
  promptVersion: "revise-selection-v1",
  proposedReplacement: "Clear replacement",
  providerAdapter: "openai-compatible",
  providerLabel: "Local",
  sourceRevision: 3,
  status: "pending",
  target: {
    anchor: {
      anchoredRevision: 3,
      exact: "Original passage",
      fileId: "main",
      originalRange: { end: 16, start: 0 },
      prefix: "",
      relativeEnd: "AQ",
      relativeStart: "AA",
      suffix: "",
      version: 1,
    },
    resolution: { end: 16, exactMatch: true, start: 0, status: "resolved", text: "Original passage" },
  },
};
const claim: ModelCandidate = {
  createdAt: revision.createdAt,
  evidence: [],
  id: "candidate:2",
  instruction: "Draft a claim",
  model: "local-model",
  operation: "draft-claim",
  promptVersion: "draft-claim-v1",
  proposedNote: "",
  proposedText: "Grounded claim",
  providerAdapter: "openai-compatible",
  providerLabel: "Local",
  relation: "supports",
  status: "pending",
};

class TestCandidateListPanel extends CandidateListPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  openForTest(candidateId?: string): void {
    const event = new Event("test");
    Object.defineProperty(event, "currentTarget", { value: { dataset: candidateId ? { candidateId } : {} } });
    this.openCandidate(event);
  }
}

describe("candidate list panel", () => {
  it("renders empty, revision, and claim candidate states", () => {
    const panel = new TestCandidateListPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setCandidates([revision, claim]);
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits only known candidate selections", () => {
    const panel = new TestCandidateListPanel();
    const opened: ModelCandidate[] = [];
    panel.addEventListener(candidateListOpenEvent, (event) => opened.push((event as CustomEvent<ModelCandidate>).detail));
    panel.setCandidates([revision]);

    panel.openForTest();
    panel.openForTest("missing");
    panel.openForTest(revision.id);

    expect(opened).toEqual([revision]);
  });
});
