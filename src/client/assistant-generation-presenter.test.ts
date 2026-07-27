import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantGenerationPresenter, type AssistantGenerationInput } from "./assistant-generation-presenter";
import { assistantOperationDefinition } from "./assistant-operations";
import { AssistantResultPanel } from "./assistant-result-panel";
import { AssistantTaskPanel } from "./assistant-task-panel";
import { CandidateListPanel } from "./candidate-list-panel";
import { OpenAICompatibleBrowserProvider } from "./model-provider";
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
    "candidate-list-panel": new CandidateListPanel(),
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
});
