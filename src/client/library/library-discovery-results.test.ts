import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReferenceDiscoveryResult } from "../../domain/reference-library/reference-discovery";
import { LibraryDiscoveryResults, libraryDiscoveryRefreshEvent, type LibraryDiscoveryRefresh } from "./library-discovery-results";

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

  saveForTest(index: string): Promise<void> {
    return this.save(eventWithTarget({ dataset: { resultIndex: index } }));
  }
}

function eventWithTarget(target: object): Event {
  const event = new Event("test");
  Object.defineProperty(event, "currentTarget", { value: target });
  return event;
}

afterEach(() => vi.restoreAllMocks());

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

  it("persists only idle, known results and requests a refresh", async () => {
    const panel = new TestLibraryDiscoveryResults();
    const refreshes: LibraryDiscoveryRefresh[] = [];
    panel.addEventListener(libraryDiscoveryRefreshEvent, (event) => refreshes.push((event as CustomEvent<LibraryDiscoveryRefresh>).detail));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    panel.setResults([result]);

    await panel.saveForTest("missing");
    await panel.saveForTest("4");
    await panel.saveForTest("0");
    await panel.saveForTest("0");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/import/csl-json",
      expect.objectContaining({
        body: JSON.stringify([
          {
            id: "10.5555/result",
            type: "article-journal",
            title: "A discovered paper",
            author: [{ literal: "Ada Author" }],
            URL: "https://doi.org/10.5555/result",
            issued: { "date-parts": [["2026"]] },
            "container-title": "Journal",
            DOI: "10.5555/result",
          },
        ]),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshes).toEqual([{ index: 0, message: "Reference saved to the private Library.", requestId: 1 }]);
    panel.complete(0, 0);
    panel.complete(0, 1);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("reports failed imports and permits a retry", async () => {
    const panel = new TestLibraryDiscoveryResults();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    panel.setResults([result]);

    await panel.saveForTest("0");
    expect(panel.renderForTest()).toBeDefined();
    await panel.saveForTest("0");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a completed request after results are replaced", async () => {
    const panel = new TestLibraryDiscoveryResults();
    const refreshes: LibraryDiscoveryRefresh[] = [];
    let respond = (_response: Response): void => undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockReturnValue(pendingResponse);
    panel.addEventListener(libraryDiscoveryRefreshEvent, (event) => refreshes.push((event as CustomEvent<LibraryDiscoveryRefresh>).detail));
    panel.setResults([result]);

    const save = panel.saveForTest("0");
    panel.setResults([result]);
    respond(new Response(null, { status: 200 }));
    await save;

    expect(refreshes).toEqual([]);
  });
});
