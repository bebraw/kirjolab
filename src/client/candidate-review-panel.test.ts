import { describe, expect, it } from "vitest";
import type { ModelAnnotationEvidence, ModelCandidate, ModelEvidence } from "../domain/workspace";
import { CandidateReviewPanel, candidateDecisionEvent, candidateEvidenceEvent, type CandidateReviewData } from "./candidate-review-panel";

const annotation: ModelAnnotationEvidence = {
  comment: "",
  createdAt: "2026-07-25T00:00:00.000Z",
  id: "annotation:1",
  kind: "annotation",
  page: 2,
  pdfId: "pdf:1",
  prefix: "",
  quote: "Grounded evidence",
  rects: [],
  suffix: "",
  updatedAt: "2026-07-25T00:00:00.000Z",
  version: "2026-07-25T00:00:00.000Z",
};

const revision: ModelCandidate = {
  createdAt: "2026-07-25T00:00:00.000Z",
  evidence: [annotation],
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

class TestCandidateReviewPanel extends CandidateReviewPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  applyForTest(): void {
    this.apply();
  }

  rejectForTest(): void {
    this.reject();
  }

  openForTest(id?: string): void {
    const event = new Event("test");
    Object.defineProperty(event, "currentTarget", { value: { dataset: id ? { evidenceId: id } : {} } });
    this.openEvidence(event);
  }
}

function data(candidate: ModelCandidate = revision, overrides: Partial<CandidateReviewData> = {}): CandidateReviewData {
  return {
    applicable: true,
    availableEvidenceIds: new Set(["annotation:1"]),
    candidate,
    decisionBusy: false,
    stableDocument: true,
    ...overrides,
  };
}

describe("candidate review panel", () => {
  it("renders empty, revision, busy, stale, and failure states", () => {
    const panel = new TestCandidateReviewPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setCandidate(data());
    expect(panel.renderForTest()).toBeDefined();
    panel.setCandidate(data(revision, { applicable: false, currentAction: "apply", decisionBusy: true, stableDocument: false }));
    expect(panel.renderForTest()).toBeDefined();
    panel.showFailure("Could not apply revision");
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("renders claim candidates and terminal statuses", () => {
    const claim: ModelCandidate = {
      createdAt: revision.createdAt,
      evidence: [annotation],
      id: "candidate:claim",
      instruction: "Draft a claim",
      model: "local-model",
      operation: "draft-claim",
      promptVersion: "draft-claim-v1",
      proposedNote: "",
      proposedText: "Evidence-backed claim",
      providerAdapter: "openai-compatible",
      providerLabel: "Local",
      relation: "supports",
      status: "accepted",
    };
    const panel = new TestCandidateReviewPanel();
    panel.setCandidate(data(claim));
    expect(panel.renderForTest()).toBeDefined();
    panel.setCandidate(data({ ...claim, status: "rejected" }, { currentAction: "reject" }));
    expect(panel.renderForTest()).toBeDefined();
    panel.setCandidate(data({ ...claim, status: "pending" }, { applicable: false, availableEvidenceIds: new Set() }));
    expect(panel.renderForTest()).toBeDefined();
  });

  it("emits decision and available evidence intents", () => {
    const panel = new TestCandidateReviewPanel();
    const decisions: string[] = [];
    const evidence: ModelEvidence[] = [];
    panel.addEventListener(candidateDecisionEvent, (event) => decisions.push((event as CustomEvent<string>).detail));
    panel.addEventListener(candidateEvidenceEvent, (event) => evidence.push((event as CustomEvent<ModelEvidence>).detail));
    panel.setCandidate(data());

    panel.applyForTest();
    panel.rejectForTest();
    panel.openForTest();
    panel.openForTest("missing");
    panel.openForTest("annotation:1");

    expect(decisions).toEqual(["apply", "reject"]);
    expect(evidence).toEqual([annotation]);
  });

  it("owns its nested scroll position", () => {
    const panel = new TestCandidateReviewPanel();
    const scroll = { scrollTop: 12 };
    Object.defineProperty(panel, "querySelector", { value: () => scroll });
    expect(panel.scrollPosition).toBe(12);
    panel.scrollPosition = 24;
    expect(scroll.scrollTop).toBe(24);
  });
});
