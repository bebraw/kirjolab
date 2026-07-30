import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelAnnotationEvidence, ModelCandidate, ModelEvidence } from "../../domain/workspace/workspace";
import {
  CandidateReviewPanel,
  candidateDecisionEvent,
  candidateDecisionOutcomeEvent,
  candidateEvidenceEvent,
  type CandidateDecisionOutcome,
  type CandidateDecisionRequest,
  type CandidateReviewSources,
} from "./candidate-review-panel";

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

function data(candidate: ModelCandidate = revision, overrides: Partial<CandidateReviewSources> = {}): CandidateReviewSources {
  return {
    candidateId: candidate.id,
    decision: null,
    snapshot: {
      annotations: [{ ...annotation, updatedAt: annotation.version }],
      candidates: [candidate],
      claims: [],
    },
    sourceRevision: 3,
    stableDocument: true,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("candidate review panel", () => {
  it("resolves candidates from canonical snapshots", () => {
    const panel = new TestCandidateReviewPanel();

    expect(panel.setCandidate(data())).toBe(true);
    expect(panel.setCandidate(data(revision, { candidateId: "missing" }))).toBe(false);
    expect(panel.setCandidate(data(revision, { snapshot: null }))).toBe(false);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("renders empty, revision, busy, stale, and failure states", () => {
    const panel = new TestCandidateReviewPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.setCandidate(data());
    panel.setAvailability(false, true);
    expect(panel.renderForTest()).toBeDefined();
    panel.setCandidate(
      data(revision, {
        decision: { action: "apply", id: revision.id },
        sourceRevision: 4,
        stableDocument: false,
      }),
    );
    expect(panel.renderForTest()).toBeDefined();
    panel.showFailure("Could not apply revision");
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("renders claim candidates and terminal statuses", () => {
    const panel = new TestCandidateReviewPanel();
    panel.setCandidate(data(claim));
    expect(panel.renderForTest()).toBeDefined();
    panel.setCandidate(data({ ...claim, status: "rejected" }, { decision: { action: "reject", id: claim.id } }));
    expect(panel.renderForTest()).toBeDefined();
    panel.setCandidate(
      data({ ...claim, status: "pending" }, { snapshot: { annotations: [], candidates: [{ ...claim, status: "pending" }], claims: [] } }),
    );
    expect(panel.renderForTest()).toBeDefined();
  });

  it("derives revision and claim applicability from canonical inputs", () => {
    const panel = new TestCandidateReviewPanel();
    const decisions: CandidateDecisionRequest[] = [];
    panel.addEventListener(candidateDecisionEvent, (event) => decisions.push((event as CustomEvent<CandidateDecisionRequest>).detail));
    if (revision.operation !== "revise-selection" || revision.target.resolution.status !== "resolved") throw new Error("Invalid fixture");

    panel.setCandidate(data(revision, { sourceRevision: 4 }));
    panel.applyForTest();
    panel.setCandidate(
      data({ ...revision, target: { ...revision.target, resolution: { ...revision.target.resolution, exactMatch: false } } }),
    );
    panel.applyForTest();
    panel.setCandidate(
      data({ ...claim, status: "pending" }, { snapshot: { annotations: [], candidates: [{ ...claim, status: "pending" }], claims: [] } }),
    );
    panel.applyForTest();
    panel.setCandidate(data({ ...claim, status: "pending" }));
    panel.applyForTest();

    expect(decisions).toEqual([{ action: "apply", candidateId: claim.id }]);
  });

  it("emits decision and available evidence intents", () => {
    const panel = new TestCandidateReviewPanel();
    const decisions: CandidateDecisionRequest[] = [];
    const evidence: ModelEvidence[] = [];
    panel.addEventListener(candidateDecisionEvent, (event) => decisions.push((event as CustomEvent<CandidateDecisionRequest>).detail));
    panel.addEventListener(candidateEvidenceEvent, (event) => evidence.push((event as CustomEvent<ModelEvidence>).detail));
    panel.setCandidate(data());

    panel.applyForTest();
    panel.rejectForTest();
    panel.openForTest();
    panel.openForTest("missing");
    panel.openForTest("annotation:1");

    expect(decisions).toEqual([
      { action: "apply", candidateId: revision.id },
      { action: "reject", candidateId: revision.id },
    ]);
    expect(evidence).toEqual([annotation]);
  });

  it("owns encoded decision transport and emits completed outcomes", async () => {
    const panel = new TestCandidateReviewPanel();
    const outcomes: CandidateDecisionOutcome[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    panel.setCandidate(data({ ...revision, id: "candidate/1" }));
    panel.addEventListener(candidateDecisionOutcomeEvent, (event) => {
      outcomes.push((event as CustomEvent<CandidateDecisionOutcome>).detail);
    });

    await panel.decide("apply");
    panel.setCandidate(data({ ...claim, status: "pending" }));
    await panel.decide("apply");
    await panel.decide("reject");

    expect(fetchMock).toHaveBeenCalledWith("/api/workspaces/workspace/candidates/candidate%2F1/apply", { method: "POST" });
    expect(outcomes.map(({ action, message }) => ({ action, message }))).toEqual([
      { action: "apply", message: "Candidate applied to canonical Markdown." },
      { action: "apply", message: "Evidence-backed claim created." },
      { action: "reject", message: "Claim draft rejected; no claim created." },
    ]);
  });

  it("keeps decision failures local across same-candidate refresh and permits retry", async () => {
    const panel = new TestCandidateReviewPanel();
    const outcomes: CandidateDecisionOutcome[] = [];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "Denied" }, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.configure("/api/workspaces/workspace");
    panel.setCandidate(data());
    panel.addEventListener(candidateDecisionOutcomeEvent, (event) => {
      outcomes.push((event as CustomEvent<CandidateDecisionOutcome>).detail);
    });

    await panel.decide("reject");
    panel.setCandidate(data());
    expect(panel.renderForTest()).toBeDefined();
    await panel.decide("reject");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(outcomes[0]).toEqual({
      action: "reject",
      failure: "Denied",
      message: "Candidate rejected; manuscript unchanged.",
    });
    expect(outcomes[1]).toEqual({
      action: "reject",
      failure: null,
      message: "Candidate rejected; manuscript unchanged.",
    });
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
