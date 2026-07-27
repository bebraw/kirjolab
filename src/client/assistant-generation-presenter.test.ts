import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantGenerationPresenter, type AssistantGenerationInput } from "./assistant-generation-presenter";
import { assistantOperationDefinition } from "./assistant-operations";
import { AssistantResultPanel, assistantReferenceRefreshEvent, assistantResultActionEvent } from "./assistant-result-panel";
import { AssistantTaskPanel, assistantTaskChangeEvent, assistantTaskGenerateEvent } from "./assistant-task-panel";
import { AssistantWorkflowStatus, assistantWorkflowActionEvent } from "./assistant-workflow-status";
import { CandidateListPanel, candidateListOpenEvent } from "./candidate-list-panel";
import {
  CandidateReviewPanel,
  candidateDecisionEvent,
  candidateDecisionOutcomeEvent,
  candidateEvidenceEvent,
  type CandidateDecisionOutcome,
} from "./candidate-review-panel";
import { ClaimListPanel } from "./claim-list-panel";
import { OpenAICompatibleBrowserProvider } from "./model-provider";
import { ModelProviderSettings, modelProviderChangeEvent } from "./model-provider-settings";
import type { ModelAnnotationEvidence, ModelClaimCandidate, ModelClaimEvidence, ModelRevisionCandidate } from "../domain/workspace";
import { workspaceSnapshotFixture } from "../test-support/workspace-fixture";

const passage = { end: 18, excerpt: "Target manuscript", fileId: "main.md", start: 1 };
const provider = new OpenAICompatibleBrowserProvider({
  endpoint: "http://127.0.0.1:1234/v1",
  fetcher: vi.fn(),
  model: "local-model",
  providerLabel: "Local",
});
const revisionCandidate: ModelRevisionCandidate = {
  createdAt: "created",
  evidence: [],
  id: "candidate:revision",
  instruction: "Revise",
  model: "local-model",
  operation: "revise-selection",
  promptVersion: "revise-selection-v1",
  proposedReplacement: "Revised passage",
  providerAdapter: "openai-compatible",
  providerLabel: "Local",
  sourceRevision: 7,
  status: "pending",
  target: {
    anchor: {
      anchoredRevision: 7,
      exact: passage.excerpt,
      fileId: passage.fileId,
      originalRange: { end: passage.end, start: passage.start },
      prefix: "",
      relativeEnd: "AQ",
      relativeStart: "AA",
      suffix: "",
      version: 1,
    },
    resolution: { end: passage.end, exactMatch: true, start: passage.start, status: "resolved", text: passage.excerpt },
  },
};
const claimCandidate: ModelClaimCandidate = {
  createdAt: "created",
  evidence: [],
  id: "candidate:claim",
  instruction: "Draft claim",
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
const annotationEvidence: ModelAnnotationEvidence = {
  comment: "Working note",
  createdAt: "created",
  id: "annotation:1",
  kind: "annotation",
  page: 2,
  pdfId: "pdf:1",
  prefix: "Before",
  quote: "Evidence",
  rects: [],
  suffix: "After",
  updatedAt: "updated",
  version: "updated",
};
const claimEvidence: ModelClaimEvidence = {
  createdAt: "created",
  id: "claim:1",
  kind: "claim",
  note: "",
  text: "Grounded claim",
  updatedAt: "updated",
  version: "updated",
};

function input(operationId: string): AssistantGenerationInput {
  return {
    evidence: { annotationItems: [], annotationReferences: [], items: [], references: [] },
    insertionTarget: passage,
    instruction: "Keep the result precise.",
    manuscript: "Before\n\nTarget manuscript\n\nAfter",
    operation: assistantOperationDefinition(operationId),
    passage,
    provider,
    sourceRevision: 7,
  };
}

function setup() {
  const presenter = new AssistantGenerationPresenter();
  const elements = {
    "assistant-interactive-result": new AssistantResultPanel(),
    "assistant-task-panel": new AssistantTaskPanel(),
    "assistant-workflow-status": new AssistantWorkflowStatus(),
    "candidate-list-panel": new CandidateListPanel(),
    "candidate-review-panel": new CandidateReviewPanel(),
    "claim-list-panel": new ClaimListPanel(),
    "model-provider-settings": new ModelProviderSettings(),
  };
  Object.defineProperty(presenter, "ownerDocument", {
    value: { getElementById: (id: string) => elements[id as keyof typeof elements] ?? null },
  });
  return { elements, presenter };
}

describe("assistant generation presenter", () => {
  beforeEach(() => vi.stubGlobal("HTMLElement", class {}));
  afterEach(() => vi.unstubAllGlobals());

  it("routes table generation and returns review presentation", async () => {
    const { elements, presenter } = setup();
    vi.spyOn(elements["assistant-task-panel"], "tableRequirements", "get").mockReturnValue({
      caption: "Results",
      columns: ["Measure", "Value"],
      rows: [
        ["", ""],
        ["", ""],
      ],
    });
    const generateTable = vi.spyOn(elements["assistant-interactive-result"], "generateTable").mockResolvedValue();

    await expect(presenter.generate(input("build-table"))).resolves.toEqual({
      status: "Table syntax ready. Review it before inserting at the visible target.",
      workflow: "REVIEW",
    });
    expect(generateTable).toHaveBeenCalledWith(
      provider,
      expect.objectContaining({ caption: "Results", instruction: "Keep the result precise.", manuscriptContext: "Target manuscript" }),
      { sourceRevision: 7, target: passage },
    );
  });

  it("routes phrasing, ideas, and clarity generation", async () => {
    const { elements, presenter } = setup();
    const result = elements["assistant-interactive-result"];
    const generatePhrasing = vi.spyOn(result, "generatePhrasing").mockResolvedValue();
    const generateIdeas = vi.spyOn(result, "generateIdeas").mockResolvedValue();
    const startClarityDrill = vi.spyOn(result, "startClarityDrill").mockResolvedValue();

    await expect(presenter.generate(input("phrase-passage"))).resolves.toMatchObject({ workflow: "REVIEW" });
    await expect(presenter.generate(input("ideate"))).resolves.toMatchObject({ workflow: "REVIEW" });
    await expect(presenter.generate(input("clarity-drill"))).resolves.toEqual({
      status: "Answer one focused question to make the intended meaning explicit.",
      workflow: "AWAIT_INPUT",
    });
    expect(generatePhrasing).toHaveBeenCalledOnce();
    expect(generateIdeas).toHaveBeenCalledOnce();
    expect(startClarityDrill).toHaveBeenCalledOnce();
  });

  it("projects reference discovery counts", async () => {
    const { elements, presenter } = setup();
    const discoverReferences = vi
      .spyOn(elements["assistant-interactive-result"], "discoverReferences")
      .mockResolvedValueOnce(1)
      .mockResolvedValue(0);

    await expect(presenter.generate(input("find-references"))).resolves.toMatchObject({
      status: "Found 1 verifiable registry record. Review before saving.",
    });
    await expect(presenter.generate(input("find-references"))).resolves.toMatchObject({
      status: "No verifiable registry records matched this query. Refine the search focus and try again.",
    });
    expect(discoverReferences).toHaveBeenCalledTimes(2);
  });

  it("routes revision and claim candidates for coordinator refresh", async () => {
    const { elements, presenter } = setup();
    const candidates = elements["candidate-list-panel"];
    const generateRevision = vi.spyOn(candidates, "generateRevision").mockResolvedValue(revisionCandidate);
    const generateClaim = vi.spyOn(candidates, "generateClaim").mockResolvedValue(claimCandidate);

    await expect(presenter.generate(input("revise-selection"))).resolves.toMatchObject({
      candidate: revisionCandidate,
      workflow: "COMPLETE",
    });
    await expect(presenter.generate(input("draft-claim"))).resolves.toMatchObject({
      candidate: claimCandidate,
      workflow: "COMPLETE",
    });

    expect(generateRevision).toHaveBeenCalledWith(provider, expect.objectContaining({ target: { ...passage, sourceRevision: 7 } }));
    expect(generateClaim).toHaveBeenCalledWith(provider, expect.objectContaining({ relation: "supports" }));
  });

  it("persists a promoted revision through the candidate owner", async () => {
    const { elements, presenter } = setup();
    const createRevision = vi.spyOn(elements["candidate-list-panel"], "createRevision").mockResolvedValue(revisionCandidate);

    await expect(
      presenter.createRevisionCandidate({
        evidence: [{ id: annotationEvidence.id, kind: "annotation", version: annotationEvidence.version }],
        instruction: revisionCandidate.instruction,
        model: revisionCandidate.model,
        passage,
        providerLabel: revisionCandidate.providerLabel,
        replacement: revisionCandidate.proposedReplacement,
        sourceRevision: revisionCandidate.sourceRevision,
      }),
    ).resolves.toBe(revisionCandidate);
    expect(createRevision).toHaveBeenCalledWith({
      evidence: [{ id: annotationEvidence.id, kind: "annotation", version: annotationEvidence.version }],
      instruction: revisionCandidate.instruction,
      model: revisionCandidate.model,
      proposedReplacement: revisionCandidate.proposedReplacement,
      providerLabel: revisionCandidate.providerLabel,
      target: { ...passage, sourceRevision: revisionCandidate.sourceRevision },
    });
  });

  it("projects canonical availability across assistant owners", () => {
    const { elements, presenter } = setup();
    const settings = elements["model-provider-settings"];
    const task = elements["assistant-task-panel"];
    const review = elements["candidate-review-panel"];
    const setDiscoveryAvailable = vi.spyOn(settings, "setDiscoveryAvailable");
    const setGenerationAvailability = vi.spyOn(task, "setGenerationAvailability");
    const setReviewAvailability = vi.spyOn(review, "setAvailability");

    presenter.presentAvailability({
      candidateDecisionBusy: true,
      hasInsertionTarget: true,
      hasPassage: false,
      stableDocument: true,
      workflowBusy: false,
    });

    expect(setDiscoveryAvailable).toHaveBeenCalledWith(true);
    expect(setGenerationAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        hasInsertionTarget: true,
        hasPassage: false,
        stableDocument: true,
        workflowBusy: false,
      }),
    );
    expect(setReviewAvailability).toHaveBeenCalledWith(true, true);
  });

  it("prepares validated generation context from assistant-owned controls", () => {
    const { elements, presenter } = setup();
    const operation = assistantOperationDefinition("revise-selection");
    const evidence = { annotationItems: [], annotationReferences: [], items: [], references: [] };
    vi.spyOn(elements["assistant-task-panel"], "value", "get").mockReturnValue({
      instruction: "Clarify the passage",
      operation,
      phrasingPurposeId: "",
      relation: "supports",
      tableCaption: "",
      tableColumns: "",
      tableRows: "",
      targetScope: "selection",
    });
    vi.spyOn(elements["assistant-workflow-status"], "modelEvidence").mockReturnValue(evidence);
    const validateGeneration = vi.spyOn(elements["assistant-workflow-status"], "validateGeneration").mockReturnValue(true);
    vi.spyOn(elements["model-provider-settings"], "provider").mockReturnValue(provider);

    expect(
      presenter.prepareGeneration({
        insertionTarget: passage,
        passage,
        snapshotAvailable: true,
        sourceRevision: 7,
        stableDocument: true,
      }),
    ).toEqual({
      evidence,
      insertionTarget: null,
      instruction: "Clarify the passage",
      operation,
      passage,
      provider,
      sourceRevision: 7,
    });
    expect(validateGeneration).toHaveBeenCalledWith({
      evidence,
      hasInsertionTarget: false,
      hasPassage: true,
      operation,
      snapshotAvailable: true,
      stableDocument: true,
    });
  });

  it("owns assistant task reset, scope, and target presentation", () => {
    const { elements, presenter } = setup();
    const task = elements["assistant-task-panel"];
    const result = elements["assistant-interactive-result"];
    const status = elements["assistant-workflow-status"];
    const setOperation = vi.spyOn(status, "setOperation");
    const clear = vi.spyOn(result, "clear");
    const showTarget = vi.spyOn(task, "showTarget");

    presenter.presentTask(true);
    presenter.presentTarget("Selected target", { end: 12, start: 3 });

    expect(setOperation).toHaveBeenCalledWith("revise-selection");
    expect(clear).toHaveBeenCalledOnce();
    expect(showTarget).toHaveBeenCalledWith({ passage: "Selected target", scope: "selection", target: { end: 12, start: 3 } });
    expect(presenter.targetScope()).toBe("sentence");
  });

  it("owns local assistant control wiring", () => {
    const { elements, presenter } = setup();
    const callbacks = {
      chooseEvidence: vi.fn(),
      generate: vi.fn(),
      refreshAvailability: vi.fn(),
      refreshTarget: vi.fn(),
    };
    const openSettings = vi.spyOn(elements["model-provider-settings"], "open").mockImplementation(() => undefined);
    const clearResult = vi.spyOn(elements["assistant-interactive-result"], "clear");
    presenter.bindControls(callbacks);
    for (const callback of Object.values(callbacks)) callback.mockClear();

    elements["model-provider-settings"].dispatchEvent(new CustomEvent(modelProviderChangeEvent, { detail: "Provider ready" }));
    expect(elements["assistant-workflow-status"].status).toBe("Provider ready");
    elements["assistant-workflow-status"].dispatchEvent(new CustomEvent(assistantWorkflowActionEvent, { detail: "choose-evidence" }));
    elements["assistant-workflow-status"].dispatchEvent(new CustomEvent(assistantWorkflowActionEvent, { detail: "open-settings" }));
    elements["assistant-task-panel"].dispatchEvent(new CustomEvent(assistantTaskChangeEvent, { detail: "operation" }));
    elements["assistant-task-panel"].dispatchEvent(new CustomEvent(assistantTaskGenerateEvent));

    expect(callbacks.chooseEvidence).toHaveBeenCalledOnce();
    expect(callbacks.generate).toHaveBeenCalledOnce();
    expect(callbacks.refreshAvailability).toHaveBeenCalledTimes(2);
    expect(callbacks.refreshTarget).toHaveBeenCalledOnce();
    expect(openSettings).toHaveBeenCalledOnce();
    expect(clearResult).toHaveBeenCalledOnce();
  });

  it("owns transient result and reference-refresh wiring", async () => {
    const { elements, presenter } = setup();
    const result = elements["assistant-interactive-result"];
    const handleAction = vi.fn();
    const refreshLibrary = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("offline"));
    const completeReferenceSave = vi.spyOn(result, "completeReferenceSave").mockImplementation(() => undefined);
    presenter.bindResults({
      clarityState: () => "ready",
      completeClarity: vi.fn(),
      failClarity: vi.fn(),
      handleAction,
      refreshLibrary,
      startClarity: vi.fn(),
    });
    const action = { action: "insert-table", context: { sourceRevision: 7, target: passage }, markdown: "| Result |" } as const;

    result.dispatchEvent(new CustomEvent(assistantResultActionEvent, { detail: action }));
    result.dispatchEvent(
      new CustomEvent(assistantReferenceRefreshEvent, { detail: { index: 2, message: "Reference saved.", requestId: 4 } }),
    );
    await vi.waitFor(() => expect(completeReferenceSave).toHaveBeenCalledWith(2, 4));
    expect(elements["assistant-workflow-status"].status).toBe("Reference saved.");

    result.dispatchEvent(new CustomEvent(assistantReferenceRefreshEvent, { detail: { index: 3, message: "Saved again.", requestId: 5 } }));
    await vi.waitFor(() => expect(completeReferenceSave).toHaveBeenCalledWith(3, 5));

    expect(handleAction).toHaveBeenCalledWith(action);
    expect(refreshLibrary).toHaveBeenCalledTimes(2);
    expect(elements["assistant-workflow-status"].status).toBe("The reference was saved, but the refreshed Library could not be loaded.");
  });

  it("owns clarity continuation and status presentation", async () => {
    const { elements, presenter } = setup();
    const result = elements["assistant-interactive-result"];
    const clarityState = vi.fn<() => "busy" | "ready" | "stale">().mockReturnValue("ready");
    const completeClarity = vi.fn();
    const failClarity = vi.fn();
    const startClarity = vi.fn();
    const completeClarityDrill = vi.spyOn(result, "completeClarityDrill").mockResolvedValue();
    presenter.bindResults({
      clarityState,
      completeClarity,
      failClarity,
      handleAction: vi.fn(),
      refreshLibrary: vi.fn().mockResolvedValue(undefined),
      startClarity,
    });
    const context = {
      evidence: { items: [], references: [] },
      instruction: "Clarify",
      passage,
      provider,
      question: {
        issue: "The subject is vague.",
        model: "local-model",
        providerLabel: "Local",
        question: "Who performs the review?",
      },
      sourceRevision: 7,
    };

    result.dispatchEvent(new CustomEvent(assistantResultActionEvent, { detail: { action: "continue-clarity", answer: "  ", context } }));
    expect(elements["assistant-workflow-status"].status).toBe("Answer the clarity question first.");
    result.dispatchEvent(
      new CustomEvent(assistantResultActionEvent, { detail: { action: "continue-clarity", answer: " Editors do. ", context } }),
    );
    await vi.waitFor(() => expect(completeClarity).toHaveBeenCalledOnce());

    expect(startClarity).toHaveBeenCalledOnce();
    expect(completeClarityDrill).toHaveBeenCalledWith(context, "Editors do.");
    expect(elements["assistant-workflow-status"].status).toBe(
      "Choose the wording that best matches your meaning; it will still open for review.",
    );
    expect(failClarity).not.toHaveBeenCalled();

    clarityState.mockReturnValue("stale");
    result.dispatchEvent(
      new CustomEvent(assistantResultActionEvent, { detail: { action: "continue-clarity", answer: "Editors do.", context } }),
    );
    expect(elements["assistant-workflow-status"].status).toBe(
      "The manuscript changed. Start the clarity drill again for the current target.",
    );

    const failure = new Error("offline");
    clarityState.mockReturnValue("ready");
    completeClarityDrill.mockRejectedValueOnce(failure);
    result.dispatchEvent(
      new CustomEvent(assistantResultActionEvent, { detail: { action: "continue-clarity", answer: "Editors do.", context } }),
    );
    await vi.waitFor(() => expect(failClarity).toHaveBeenCalledWith(failure));
    expect(startClarity).toHaveBeenCalledTimes(2);
    expect(completeClarity).toHaveBeenCalledOnce();
  });

  it("owns candidate decision and evidence wiring", () => {
    const { elements, presenter } = setup();
    const review = elements["candidate-review-panel"];
    const outcome: CandidateDecisionOutcome = { action: "apply", failure: null, message: "Candidate applied." };
    const pdf = {
      contentType: "application/pdf" as const,
      createdAt: "created",
      fingerprint: "fingerprint",
      id: annotationEvidence.pdfId,
      name: "paper.pdf",
      objectKey: "pdfs/paper.pdf",
      size: 1024,
    };
    const snapshot = {
      ...workspaceSnapshotFixture,
      annotations: [{ ...annotationEvidence, fragments: [], rects: [...annotationEvidence.rects] }],
      claims: [{ ...claimEvidence }],
      pdfs: [pdf],
    };
    const callbacks = {
      completeDecision: vi.fn(),
      openCandidate: vi.fn(),
      openPaper: vi.fn(),
      snapshot: () => snapshot,
      startDecision: vi.fn(),
    };
    const revealClaim = vi.spyOn(elements["claim-list-panel"], "revealClaim").mockReturnValue(true);
    const configureCandidates = vi.spyOn(elements["candidate-list-panel"], "configure");
    const configureReview = vi.spyOn(review, "configure");
    presenter.bindCandidate("/api/workspaces/workspace", callbacks);

    elements["candidate-list-panel"].dispatchEvent(new CustomEvent(candidateListOpenEvent, { detail: revisionCandidate }));
    review.dispatchEvent(new CustomEvent(candidateDecisionEvent, { detail: { action: "apply", candidateId: revisionCandidate.id } }));
    review.dispatchEvent(new CustomEvent(candidateDecisionOutcomeEvent, { detail: outcome }));
    review.dispatchEvent(new CustomEvent(candidateEvidenceEvent, { detail: annotationEvidence }));
    review.dispatchEvent(new CustomEvent(candidateEvidenceEvent, { detail: claimEvidence }));

    expect(configureCandidates).toHaveBeenCalledWith("/api/workspaces/workspace");
    expect(configureReview).toHaveBeenCalledWith("/api/workspaces/workspace");
    expect(callbacks.openCandidate).toHaveBeenCalledWith(revisionCandidate);
    expect(callbacks.startDecision).toHaveBeenCalledWith({ action: "apply", candidateId: revisionCandidate.id });
    expect(callbacks.completeDecision).toHaveBeenCalledWith(outcome);
    expect(callbacks.openPaper).toHaveBeenCalledWith(pdf, annotationEvidence);
    expect(revealClaim).toHaveBeenCalledWith(claimEvidence.id, true);
  });
});
