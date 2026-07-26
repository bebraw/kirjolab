import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssistantResultPanel,
  assistantReferenceRefreshEvent,
  assistantResultActionEvent,
  type AssistantReferenceRefresh,
  type AssistantClarityContext,
  type AssistantResultActionDetail,
  type AssistantRevisionContext,
  type AssistantTableContext,
} from "./assistant-result-panel";
import { referenceDiscoveryIdentifierUrl, type ReferenceDiscoveryResult } from "../domain/reference-discovery";

class TestAssistantResultPanel extends AssistantResultPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  continueForTest(): void {
    this.continueClarity();
  }

  insertForTest(): void {
    this.insertTable();
  }

  chooseForTest(index: string): void {
    const event = new Event("click");
    Object.defineProperty(event, "currentTarget", { value: { dataset: { index } } });
    this.chooseRevision(event);
  }

  saveForTest(index: string): Promise<void> {
    const event = new Event("click");
    Object.defineProperty(event, "currentTarget", { value: { dataset: { index } } });
    return this.saveReference(event);
  }
}

const provenance = { adapter: "openai-compatible" as const, model: "local-model", providerLabel: "Local model" };
const passage = { end: 12, excerpt: "Selected text", fileId: "file-1", start: 0 };
const revisionContext: AssistantRevisionContext = {
  evidence: { items: [], references: [] },
  instruction: "Explore",
  passage,
  sourceRevision: 3,
};
const clarityContext: AssistantClarityContext = {
  ...revisionContext,
  provider: {
    continueClarityDrill: async () => ({ ...provenance, rewrites: [] }),
  },
  question: { ...provenance, issue: "The subject is vague.", question: "Who performs the review?" },
};
const tableContext: AssistantTableContext = { sourceRevision: 3, target: passage };
const reference: ReferenceDiscoveryResult = {
  identifiers: [{ scheme: "doi", value: "10.5555/result" }],
  metadata: {
    abstract: "A result.",
    authors: ["Doe, Jane"],
    doi: "10.5555/result",
    title: "Verified result",
    type: "article",
    url: "https://doi.org/10.5555/result",
    venue: "Research Systems",
    year: "2026",
  },
  providers: [
    { provider: "crossref", score: 10 },
    { provider: "openalex", score: 9 },
    { provider: "semantic-scholar", score: 8 },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("assistant result panel", () => {
  it("renders empty, table, and clarity-question states", () => {
    const panel = new TestAssistantResultPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.showTable("| A |\n| - |", { ...tableContext, target: { ...passage, end: 0, excerpt: "" } });
    expect(panel.renderForTest()).toBeDefined();
    panel.showTable("| B |\n| - |", tableContext);
    expect(panel.renderForTest()).toBeDefined();
    panel.showClarityQuestion(clarityContext);
    expect(panel.renderForTest()).toBeDefined();
    panel.clear();
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("adapts idea, phrasing, and clarity results into choices", () => {
    const panel = new TestAssistantResultPanel();
    panel.showIdeas(revisionContext, {
      ...provenance,
      ideas: [{ direction: "Compare duration.", draft: "Review was faster.", title: "Measure time" }],
    });
    expect(panel.renderForTest()).toBeDefined();
    panel.showPhrasingAlternatives(
      { ...revisionContext, instruction: "Qualify" },
      { description: "Keep uncertainty explicit.", id: "qualify-claim", label: "Qualify a claim" },
      {
        ...provenance,
        alternatives: [{ rationale: "Preserves uncertainty.", text: "The result may help." }],
      },
    );
    expect(panel.renderForTest()).toBeDefined();
    panel.showClarityRewrites({ ...revisionContext, instruction: "Clarify" }, "Editors perform it.", {
      ...provenance,
      rewrites: [{ rationale: "Names the actor.", text: "Editors perform the review." }],
    });
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns ideation and phrasing provider requests", async () => {
    const panel = new TestAssistantResultPanel();
    const ideate = vi.fn().mockResolvedValue({
      ...provenance,
      ideas: [{ direction: "Compare duration.", draft: "Review was faster.", title: "Measure time" }],
    });
    const phrasePassage = vi.fn().mockResolvedValue({
      ...provenance,
      alternatives: [{ rationale: "Preserves uncertainty.", text: "The result may help." }],
    });
    const purpose = { description: "Keep uncertainty explicit.", id: "qualify-claim" as const, label: "Qualify a claim" };

    await panel.generateIdeas({ ideate }, revisionContext);
    expect(ideate).toHaveBeenCalledWith({ selectedPassage: passage.excerpt, instruction: "Explore", evidence: [] });
    await panel.generatePhrasing({ phrasePassage }, revisionContext, purpose);
    expect(phrasePassage).toHaveBeenCalledWith({
      selectedPassage: passage.excerpt,
      instruction: "Explore",
      evidence: [],
      purpose,
      patterns: expect.any(Array),
    });
    expect(panel.renderForTest()).toBeDefined();
  });

  it("owns clarity question and rewrite provider requests", async () => {
    const panel = new TestAssistantResultPanel();
    const startClarityDrill = vi.fn().mockResolvedValue(clarityContext.question);
    const continueClarityDrill = vi.fn().mockResolvedValue({
      ...provenance,
      rewrites: [{ rationale: "Names the actor.", text: "Editors perform the review." }],
    });
    const provider = { startClarityDrill, continueClarityDrill };

    await panel.startClarityDrill(provider, { ...revisionContext, instruction: "Clarify" });
    expect(startClarityDrill).toHaveBeenCalledWith({
      selectedPassage: passage.excerpt,
      instruction: "Clarify",
      evidence: [],
    });
    await panel.completeClarityDrill({ ...clarityContext, provider }, "Editors perform it.");
    expect(continueClarityDrill).toHaveBeenCalledWith({
      selectedPassage: passage.excerpt,
      instruction: revisionContext.instruction,
      evidence: [],
      issue: clarityContext.question.issue,
      question: clarityContext.question.question,
      answer: "Editors perform it.",
    });
    expect(panel.renderForTest()).toBeDefined();
  });

  it("renders reference results and verification links", () => {
    const panel = new TestAssistantResultPanel();
    panel.showReferences("review time", "Find direct measurements.", [reference]);
    expect(panel.renderForTest()).toBeDefined();

    expect(referenceDiscoveryIdentifierUrl(reference.identifiers[0]!)).toBe("https://doi.org/10.5555/result");
    expect(referenceDiscoveryIdentifierUrl({ scheme: "openalex", value: "W123" })).toBe("https://openalex.org/W123");
    expect(referenceDiscoveryIdentifierUrl({ scheme: "semantic-scholar", value: "paper id" })).toContain("paper%20id");
    expect(referenceDiscoveryIdentifierUrl({ scheme: "arxiv", value: "2601.00001" })).toContain("arxiv.org/abs");
    expect(referenceDiscoveryIdentifierUrl({ scheme: "pmid", value: "123" })).toContain("pubmed.ncbi.nlm.nih.gov/123");
  });

  it("owns model-formulated reference discovery and validates results", async () => {
    const panel = new TestAssistantResultPanel();
    const formulateReferenceQuery = vi.fn().mockResolvedValue({ ...provenance, query: "review time", rationale: "Measure duration." });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([reference]));

    const count = await panel.discoverReferences(
      { formulateReferenceQuery },
      { selectedPassage: passage.excerpt, instruction: "Find evidence", evidence: [] },
    );

    expect(formulateReferenceQuery).toHaveBeenCalledWith({
      selectedPassage: passage.excerpt,
      instruction: "Find evidence",
      evidence: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/discovery",
      expect.objectContaining({ body: JSON.stringify({ query: "review time" }), method: "POST" }),
    );
    expect(count).toBe(1);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("rejects malformed assistant discovery results", async () => {
    const panel = new TestAssistantResultPanel();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ results: [reference] }));

    await expect(
      panel.discoverReferences(
        { formulateReferenceQuery: async () => ({ ...provenance, query: "review time", rationale: "Measure duration." }) },
        { selectedPassage: passage.excerpt, instruction: "Find evidence", evidence: [] },
      ),
    ).rejects.toThrow("Reference provider returned invalid discovery results");
  });

  it("emits bounded table, answer, and revision intents", () => {
    const panel = new TestAssistantResultPanel();
    const actions: AssistantResultActionDetail[] = [];
    panel.addEventListener(assistantResultActionEvent, (event) => {
      actions.push((event as CustomEvent<AssistantResultActionDetail>).detail);
    });

    panel.insertForTest();
    panel.showTable("| A |", tableContext);
    panel.insertForTest();
    panel.showIdeas(revisionContext, {
      ...provenance,
      ideas: [{ direction: "Compare.", draft: "A draft.", title: "Direction" }],
    });
    panel.chooseForTest("0");
    panel.chooseForTest("9");
    panel.clear();
    panel.chooseForTest("0");
    panel.continueForTest();
    panel.showClarityQuestion(clarityContext);
    panel.continueForTest();
    expect(actions).toEqual([
      { action: "insert-table", context: tableContext, markdown: "| A |" },
      {
        action: "choose-revision",
        choice: {
          failureMessage: "Could not save the idea draft",
          instruction: "Explore\nChosen direction: Direction. Compare.",
          model: "local-model",
          providerLabel: "Local model",
          replacement: "A draft.",
          successMessage: "Idea draft ready for exact before-and-after review.",
        },
        context: revisionContext,
      },
      { action: "continue-clarity", answer: "", context: clarityContext },
    ]);
  });

  it("persists assistant references and requests a canonical refresh", async () => {
    const panel = new TestAssistantResultPanel();
    const refreshes: AssistantReferenceRefresh[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.addEventListener(assistantReferenceRefreshEvent, (event) =>
      refreshes.push((event as CustomEvent<AssistantReferenceRefresh>).detail),
    );
    panel.showReferences("query", "reason", [reference]);

    await panel.saveForTest("9");
    await panel.saveForTest("0");
    await panel.saveForTest("0");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/import/csl-json",
      expect.objectContaining({
        body: JSON.stringify([
          {
            id: "10.5555/result",
            type: "article-journal",
            title: "Verified result",
            author: [{ literal: "Doe, Jane" }],
            URL: "https://doi.org/10.5555/result",
            issued: { "date-parts": [["2026"]] },
            "container-title": "Research Systems",
            DOI: "10.5555/result",
            abstract: "A result.",
          },
        ]),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshes).toEqual([
      {
        index: 0,
        message: "Reference saved. Use its Library card to add it to this project before citing.",
        requestId: 1,
      },
    ]);
    panel.completeReferenceSave(0, 0);
    panel.completeReferenceSave(0, 1);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("reports failed reference imports and permits a retry", async () => {
    const panel = new TestAssistantResultPanel();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.showReferences("query", "reason", [reference]);

    await panel.saveForTest("0");
    expect(panel.renderForTest()).toBeDefined();
    await panel.saveForTest("0");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a reference import completed after the panel is cleared", async () => {
    const panel = new TestAssistantResultPanel();
    const refreshes: AssistantReferenceRefresh[] = [];
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    panel.addEventListener(assistantReferenceRefreshEvent, (event) =>
      refreshes.push((event as CustomEvent<AssistantReferenceRefresh>).detail),
    );
    panel.showReferences("query", "reason", [reference]);

    const save = panel.saveForTest("0");
    panel.clear();
    respond(new Response(null, { status: 200 }));
    await save;

    expect(refreshes).toEqual([]);
  });
});
