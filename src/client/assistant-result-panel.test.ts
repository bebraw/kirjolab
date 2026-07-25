import { describe, expect, it } from "vitest";
import {
  AssistantResultPanel,
  assistantResultActionEvent,
  referenceDiscoveryIdentifierUrl,
  type AssistantResultActionDetail,
} from "./assistant-result-panel";
import type { ReferenceDiscoveryResult } from "../domain/reference-discovery";

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

  saveForTest(index: string): void {
    const event = new Event("click");
    Object.defineProperty(event, "currentTarget", { value: { dataset: { index } } });
    this.saveReference(event);
  }
}

const provenance = { adapter: "openai-compatible" as const, model: "local-model", providerLabel: "Local model" };
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

describe("assistant result panel", () => {
  it("renders empty, table, and clarity-question states", () => {
    const panel = new TestAssistantResultPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.showTable("| A |\n| - |", false);
    expect(panel.renderForTest()).toBeDefined();
    panel.showTable("| B |\n| - |", true);
    expect(panel.renderForTest()).toBeDefined();
    panel.showClarityQuestion("The subject is vague.", "Who performs the review?");
    expect(panel.renderForTest()).toBeDefined();
    panel.clear();
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("adapts idea, phrasing, and clarity results into choices", () => {
    const panel = new TestAssistantResultPanel();
    panel.showIdeas("Explore", {
      ...provenance,
      ideas: [{ direction: "Compare duration.", draft: "Review was faster.", title: "Measure time" }],
    });
    expect(panel.renderForTest()).toBeDefined();
    panel.showPhrasingAlternatives(
      "Qualify",
      { description: "Keep uncertainty explicit.", id: "qualify-claim", label: "Qualify a claim" },
      {
        ...provenance,
        alternatives: [{ rationale: "Preserves uncertainty.", text: "The result may help." }],
      },
    );
    expect(panel.renderForTest()).toBeDefined();
    panel.showClarityRewrites("Clarify", "Editors perform it.", {
      ...provenance,
      rewrites: [{ rationale: "Names the actor.", text: "Editors perform the review." }],
    });
    expect(panel.renderForTest()).toBeDefined();
  });

  it("renders reference results and their local save progress", () => {
    const panel = new TestAssistantResultPanel();
    panel.showReferences("review time", "Find direct measurements.", [reference]);
    expect(panel.renderForTest()).toBeDefined();
    panel.setReferenceSaveState(0, "saving");
    expect(panel.renderForTest()).toBeDefined();
    panel.setReferenceSaveState(0, "saved");
    expect(panel.renderForTest()).toBeDefined();
    panel.setReferenceSaveState(0, "idle");
    expect(panel.renderForTest()).toBeDefined();

    expect(referenceDiscoveryIdentifierUrl(reference.identifiers[0]!)).toBe("https://doi.org/10.5555/result");
    expect(referenceDiscoveryIdentifierUrl({ scheme: "openalex", value: "W123" })).toBe("https://openalex.org/W123");
    expect(referenceDiscoveryIdentifierUrl({ scheme: "semantic-scholar", value: "paper id" })).toContain("paper%20id");
    expect(referenceDiscoveryIdentifierUrl({ scheme: "arxiv", value: "2601.00001" })).toContain("arxiv.org/abs");
    expect(referenceDiscoveryIdentifierUrl({ scheme: "pmid", value: "123" })).toContain("pubmed.ncbi.nlm.nih.gov/123");
  });

  it("emits bounded table, answer, and revision intents", () => {
    const panel = new TestAssistantResultPanel();
    const actions: AssistantResultActionDetail[] = [];
    panel.addEventListener(assistantResultActionEvent, (event) => {
      actions.push((event as CustomEvent<AssistantResultActionDetail>).detail);
    });

    panel.insertForTest();
    panel.showTable("| A |", false);
    panel.insertForTest();
    panel.showIdeas("Explore", {
      ...provenance,
      ideas: [{ direction: "Compare.", draft: "A draft.", title: "Direction" }],
    });
    panel.chooseForTest("0");
    panel.chooseForTest("9");
    panel.clear();
    panel.chooseForTest("0");
    panel.continueForTest();
    panel.showReferences("query", "reason", [reference]);
    panel.saveForTest("0");
    panel.saveForTest("9");
    panel.clear();
    panel.saveForTest("0");

    expect(actions).toEqual([
      { action: "insert-table", markdown: "| A |" },
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
      },
      { action: "continue-clarity", answer: "" },
      { action: "save-reference", index: 0, result: reference },
    ]);
  });
});
