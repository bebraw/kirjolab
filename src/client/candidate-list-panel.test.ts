import { afterEach, describe, expect, it, vi } from "vitest";
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
const annotationEvidence = {
  comment: "Working note",
  createdAt: revision.createdAt,
  id: "annotation:1",
  kind: "annotation" as const,
  page: 2,
  pdfId: "pdf:1",
  prefix: "Before",
  quote: "Evidence",
  rects: [{ height: 0.1, width: 0.2, x: 0.1, y: 0.2 }],
  suffix: "After",
  updatedAt: revision.createdAt,
  version: revision.createdAt,
};
const claim: ModelCandidate = {
  createdAt: revision.createdAt,
  evidence: [annotationEvidence],
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

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("owns typed revision and claim candidate persistence", async () => {
    const panel = new TestCandidateListPanel();
    panel.configure("/api/workspaces/workspace");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(revision))
      .mockResolvedValueOnce(Response.json(claim));
    const revisionInput = {
      evidence: [],
      instruction: revision.instruction,
      model: revision.model,
      proposedReplacement: revision.proposedReplacement,
      providerLabel: revision.providerLabel,
      target: { end: 16, excerpt: "Original passage", fileId: "main", sourceRevision: 3, start: 0 },
    };
    const claimInput = {
      evidence: [{ id: annotationEvidence.id, kind: annotationEvidence.kind, version: annotationEvidence.version }],
      instruction: claim.instruction,
      model: claim.model,
      proposedNote: claim.proposedNote,
      proposedText: claim.proposedText,
      providerLabel: claim.providerLabel,
      relation: claim.relation,
    };

    await expect(panel.createRevision(revisionInput)).resolves.toEqual(revision);
    await expect(panel.createClaim(claimInput)).resolves.toEqual(claim);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/workspaces/workspace/candidates",
      expect.objectContaining({
        body: JSON.stringify({ ...revisionInput, promptVersion: "revise-selection-v1", providerAdapter: "openai-compatible" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/workspaces/workspace/claim-candidates",
      expect.objectContaining({
        body: JSON.stringify({ ...claimInput, promptVersion: "draft-claim-v1", providerAdapter: "openai-compatible" }),
      }),
    );
  });

  it("rejects malformed and mismatched candidate responses", async () => {
    const panel = new TestCandidateListPanel();
    panel.configure("/api/workspaces/workspace");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ invalid: true }))
      .mockResolvedValueOnce(Response.json(claim));
    const input = {
      evidence: [],
      instruction: revision.instruction,
      model: revision.model,
      proposedReplacement: revision.proposedReplacement,
      providerLabel: revision.providerLabel,
      target: { end: 16, excerpt: "Original passage", fileId: "main", sourceRevision: 3, start: 0 },
    };

    await expect(panel.createRevision(input)).rejects.toThrow("Candidate endpoint returned an invalid candidate");
    await expect(panel.createRevision(input)).rejects.toThrow("Candidate endpoint returned an invalid targeted revision");
  });
});
