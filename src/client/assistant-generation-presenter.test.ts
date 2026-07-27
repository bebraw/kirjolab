import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantGenerationPresenter, type AssistantGenerationInput } from "./assistant-generation-presenter";
import { assistantOperationDefinition } from "./assistant-operations";
import { AssistantResultPanel } from "./assistant-result-panel";
import { AssistantTaskPanel } from "./assistant-task-panel";
import { AssistantWorkflowStatus } from "./assistant-workflow-status";
import { CandidateListPanel } from "./candidate-list-panel";
import { CandidateReviewPanel } from "./candidate-review-panel";
import { OpenAICompatibleBrowserProvider } from "./model-provider";
import { ModelProviderSettings } from "./model-provider-settings";
import type { ModelClaimCandidate, ModelRevisionCandidate } from "../domain/workspace";

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
});
