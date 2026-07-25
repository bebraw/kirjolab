import { describe, expect, it } from "vitest";
import type { ReferenceDiscoveryQuery } from "../domain/reference-discovery";
import { LibraryDiscoverySearch, libraryDiscoverySearchEvent } from "./library-discovery-search";

const query: ReferenceDiscoveryQuery = {
  author: "Author",
  query: "evidence synthesis",
  type: "article",
  year: "2026",
};

class TestLibraryDiscoverySearch extends LibraryDiscoverySearch {
  renderForTest() {
    return this.render();
  }

  rootForTest(): HTMLElement {
    return this.createRenderRoot();
  }

  searchForTest(): void {
    this.search(new Event("submit") as SubmitEvent);
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
  it("renders initial, busy, result, empty, and error states", () => {
    const panel = new TestLibraryDiscoverySearch();
    expect(panel.rootForTest()).toBe(panel);
    expect(panel.renderForTest()).toBeDefined();
    panel.searchForTest();
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

  it("emits one typed query while busy", () => {
    const panel = new TestLibraryDiscoverySearch();
    const searches: ReferenceDiscoveryQuery[] = [];
    panel.addEventListener(libraryDiscoverySearchEvent, (event) => searches.push((event as CustomEvent<ReferenceDiscoveryQuery>).detail));

    panel.searchForTest();
    panel.searchForTest();

    expect(searches).toEqual([query]);
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
