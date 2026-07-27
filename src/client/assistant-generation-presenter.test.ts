import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantGenerationPresenter, type AssistantGenerationInput } from "./assistant-generation-presenter";
import { assistantOperationDefinition } from "./assistant-operations";
import { AssistantResultPanel } from "./assistant-result-panel";
import { AssistantTaskPanel } from "./assistant-task-panel";
import { OpenAICompatibleBrowserProvider } from "./model-provider";

const passage = { end: 18, excerpt: "Target manuscript", fileId: "main.md", start: 1 };
const provider = new OpenAICompatibleBrowserProvider({
  endpoint: "http://127.0.0.1:1234/v1",
  fetcher: vi.fn(),
  model: "local-model",
  providerLabel: "Local",
});

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

  it("projects reference discovery counts and leaves candidate operations to the coordinator", async () => {
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
    await expect(presenter.generate(input("draft-claim"))).resolves.toBeNull();
    await expect(presenter.generate(input("revise-selection"))).resolves.toBeNull();
    expect(discoverReferences).toHaveBeenCalledTimes(2);
  });
});
