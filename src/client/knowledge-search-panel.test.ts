import { describe, expect, it } from "vitest";
import type { KnowledgeSearchResult } from "../domain/knowledge";
import { KnowledgeSearchPanel, knowledgeSearchEvent, knowledgeSearchSelectEvent } from "./knowledge-search-panel";

const results: KnowledgeSearchResult[] = [
  { excerpt: "Evidence excerpt", kind: "claim", resourceId: "claim:1", score: 10, title: "Grounded claim" },
  { excerpt: "", kind: "section", resourceId: "section:1", score: 8, title: "Results" },
];

class TestKnowledgeSearchPanel extends KnowledgeSearchPanel {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  searchForTest(): void {
    this.search(new Event("submit"));
  }

  selectForTest(resourceId?: string): void {
    const event = new Event("click");
    Object.defineProperty(event, "currentTarget", { value: { dataset: resourceId ? { resourceId } : {} } });
    this.select(event);
  }
}

describe("knowledge search panel", () => {
  it("renders hidden, empty, populated, and error states", () => {
    const panel = new TestKnowledgeSearchPanel();
    expect(panel.renderForTest()).toBeDefined();
    panel.showResults([]);
    expect(panel.renderForTest()).toBeDefined();
    panel.showResults(results);
    expect(panel.renderForTest()).toBeDefined();
    panel.showError("Search failed");
    expect(panel.renderForTest()).toBeDefined();
    panel.clear();
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits trimmed query and selection intents", () => {
    const panel = new TestKnowledgeSearchPanel();
    const queries: string[] = [];
    const selections: string[] = [];
    panel.addEventListener(knowledgeSearchEvent, (event) => queries.push((event as CustomEvent<string>).detail));
    panel.addEventListener(knowledgeSearchSelectEvent, (event) => selections.push((event as CustomEvent<string>).detail));
    Object.defineProperty(panel, "querySelector", { value: () => ({ value: "  evidence  " }) });

    panel.searchForTest();
    panel.selectForTest();
    panel.selectForTest("claim:1");

    expect(queries).toEqual(["evidence"]);
    expect(selections).toEqual(["claim:1"]);
  });
});
