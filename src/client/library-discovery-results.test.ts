import { describe, expect, it } from "vitest";
import type { ReferenceDiscoveryResult } from "../domain/reference-discovery";
import { LibraryDiscoveryResults, libraryDiscoverySaveEvent, type LibraryDiscoverySaveDetail } from "./library-discovery-results";

const result: ReferenceDiscoveryResult = {
  identifiers: [{ scheme: "doi", value: "10.5555/result" }],
  metadata: {
    abstract: "",
    authors: ["Ada Author"],
    doi: "10.5555/result",
    title: "A discovered paper",
    type: "article",
    url: "",
    venue: "Journal",
    year: "2026",
  },
  providers: [{ provider: "crossref", score: 1 }],
};

class TestLibraryDiscoveryResults extends LibraryDiscoveryResults {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  saveForTest(index: string): void {
    this.save(eventWithTarget({ dataset: { resultIndex: index } }));
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

describe("library discovery results", () => {
  it("renders provider combinations and all save states", () => {
    const panel = new TestLibraryDiscoveryResults();
    expect(panel.renderForTest()).toBeDefined();
    panel.setResults([
      result,
      {
        ...result,
        identifiers: [{ scheme: "semantic-scholar", value: "paper-id" }],
        providers: [
          { provider: "semantic-scholar", score: 1 },
          { provider: "openalex", score: 0.9 },
        ],
      },
    ]);
    expect(panel.renderForTest()).toBeDefined();
    panel.setSaveState(0, "saving");
    panel.setSaveState(1, "saved");
    panel.setSaveState(4, "saved");
    expect(panel.renderForTest()).toBeDefined();
    expect(panel.rootForTest()).toBe(panel);
  });

  it("emits only idle, known result selections", () => {
    const panel = new TestLibraryDiscoveryResults();
    const actions: LibraryDiscoverySaveDetail[] = [];
    panel.addEventListener(libraryDiscoverySaveEvent, (event) => actions.push((event as CustomEvent<LibraryDiscoverySaveDetail>).detail));
    panel.setResults([result]);

    panel.saveForTest("missing");
    panel.saveForTest("4");
    panel.saveForTest("0");
    panel.setSaveState(0, "saving");
    panel.saveForTest("0");
    panel.setSaveState(0, "idle");
    panel.saveForTest("0");

    expect(actions).toEqual([
      { index: 0, result },
      { index: 0, result },
    ]);
  });
});
