import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReferenceDiscoveryQuery, ReferenceDiscoveryResult } from "../../domain/reference-library/reference-discovery";
import { LibraryDiscoverySearch, libraryDiscoveryResultsEvent } from "./library-discovery-search";

const query: ReferenceDiscoveryQuery = {
  author: "Author",
  query: "evidence synthesis",
  type: "article",
  year: "2026",
};
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

class TestLibraryDiscoverySearch extends LibraryDiscoverySearch {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  async searchForTest(): Promise<void> {
    await this.search(new Event("submit") as SubmitEvent);
  }

  protected override get query(): ReferenceDiscoveryQuery {
    return query;
  }
}

class DomLibraryDiscoverySearch extends LibraryDiscoverySearch {
  readonly values = new Map<string, string>([
    ["library-discovery-query", "evidence synthesis"],
    ["library-discovery-author", "Author"],
    ["library-discovery-year", "2026"],
    ["library-discovery-type", "article"],
  ]);

  queryForTest(): ReferenceDiscoveryQuery {
    return this.query;
  }

  protected override input(id: string): HTMLInputElement {
    const value = this.values.get(id);
    if (value === undefined) throw new Error(`Library discovery input ${id} is unavailable`);
    return { value } as HTMLInputElement;
  }

  protected override select(id: string): HTMLSelectElement {
    const value = this.values.get(id);
    if (value === undefined) throw new Error(`Library discovery select ${id} is unavailable`);
    return { value } as HTMLSelectElement;
  }
}

class MissingLibraryDiscoverySearchElements extends LibraryDiscoverySearch {
  override querySelector<E extends Element = Element>(_selector: string): E | null {
    return null;
  }

  inputForTest(): HTMLInputElement {
    return this.input("missing-input");
  }

  selectForTest(): HTMLSelectElement {
    return this.select("missing-select");
  }
}

describe("library discovery search", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders initial, result, empty, and error states", () => {
    const panel = new TestLibraryDiscoverySearch();
    expect(panel.rootForTest()).toBe(panel);
    expect(panel.renderForTest()).toBeDefined();
    panel.showResults(1);
    expect(panel.renderForTest()).toBeDefined();
    panel.showResults(3);
    expect(panel.renderForTest()).toBeDefined();
    panel.showResults(0);
    expect(panel.renderForTest()).toBeDefined();
    panel.showError("Reference search failed");
    expect(panel.renderForTest()).toBeDefined();
  });

  it("searches once while busy and emits validated results", async () => {
    const panel = new TestLibraryDiscoverySearch();
    const results: (readonly ReferenceDiscoveryResult[])[] = [];
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    panel.addEventListener(libraryDiscoveryResultsEvent, (event) => {
      results.push((event as CustomEvent<readonly ReferenceDiscoveryResult[]>).detail);
    });

    const search = panel.searchForTest();
    await panel.searchForTest();
    resolveResponse?.(Response.json([result]));
    await search;

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/discovery",
      expect.objectContaining({ body: JSON.stringify(query), method: "POST" }),
    );
    expect(results).toEqual([[], [result]]);
  });

  it("contains provider and malformed-result failures", async () => {
    const panel = new TestLibraryDiscoverySearch();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "Provider unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await panel.searchForTest();
    await panel.searchForTest();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(panel.renderForTest()).toBeDefined();
  });

  it("collects the rendered form values and reports missing inputs", () => {
    const panel = new DomLibraryDiscoverySearch();
    expect(panel.queryForTest()).toEqual(query);
    panel.values.delete("library-discovery-query");
    expect(() => panel.queryForTest()).toThrow("Library discovery input library-discovery-query is unavailable");
    panel.values.set("library-discovery-query", query.query);
    panel.values.delete("library-discovery-type");
    expect(() => panel.queryForTest()).toThrow("Library discovery select library-discovery-type is unavailable");
  });

  it("reports missing rendered controls clearly", () => {
    const panel = new MissingLibraryDiscoverySearchElements();
    expect(() => panel.inputForTest()).toThrow("Library discovery input missing-input is unavailable");
    expect(() => panel.selectForTest()).toThrow("Library discovery select missing-select is unavailable");
  });
});
