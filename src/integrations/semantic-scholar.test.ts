import { describe, expect, it, vi } from "vitest";
import { fetchSemanticScholarWork, searchSemanticScholarWorks } from "./semantic-scholar";

function semanticScholarPaper(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    paperId: "paper-1",
    externalIds: { DOI: "10.1000/EXAMPLE" },
    title: "Inspectable evidence",
    abstract: "A bounded abstract.",
    authors: [{ name: "Jane Doe" }, { name: "Research Collective" }],
    year: 2026,
    venue: "Journal of Testing",
    publicationTypes: ["JournalArticle"],
    ...overrides,
  };
}

describe("Semantic Scholar metadata integration", () => {
  it("maps a DOI paper and uses the optional API key", async () => {
    let observedUrl = "";
    let observedHeaders: HeadersInit | undefined;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      observedUrl = String(input);
      observedHeaders = init?.headers;
      return Response.json(semanticScholarPaper());
    });
    await expect(fetchSemanticScholarWork("https://doi.org/10.1000/example", " secret ", fetcher)).resolves.toEqual({
      type: "article",
      title: "Inspectable evidence",
      authors: ["Jane Doe", "Research Collective"],
      year: "2026",
      venue: "Journal of Testing",
      doi: "10.1000/example",
      url: "https://doi.org/10.1000/example",
      abstract: "A bounded abstract.",
    });
    const url = new URL(observedUrl);
    expect(url.origin + url.pathname).toBe("https://api.semanticscholar.org/graph/v1/paper/DOI:10.1000%2Fexample");
    expect(url.searchParams.get("fields")).toContain("externalIds");
    expect(observedHeaders).toEqual({ accept: "application/json", "user-agent": "Kirjolab/0.1", "x-api-key": "secret" });
  });

  it("searches DOI-backed papers with bounded bibliographic hints", async () => {
    let observedUrl = "";
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      observedUrl = String(input);
      expect(init?.headers).toEqual({ accept: "application/json", "user-agent": "Kirjolab/0.1" });
      return Response.json({
        data: [
          semanticScholarPaper(),
          semanticScholarPaper({ title: "Duplicate" }),
          semanticScholarPaper({ externalIds: {} }),
          semanticScholarPaper({ paperId: "paper-2", externalIds: { DOI: "10.1000/second" }, title: "Second" }),
          semanticScholarPaper({ externalIds: { DOI: "10.1000/no-title" }, title: "" }),
        ],
      });
    });
    await expect(
      searchSemanticScholarWorks({ title: " Evidence-based methods ", authors: [" Doe "], year: " 2026 " }, "", fetcher),
    ).resolves.toEqual([
      {
        metadata: expect.objectContaining({ doi: "10.1000/example", title: "Inspectable evidence" }),
        score: null,
        identifiers: [
          { scheme: "doi", value: "10.1000/example" },
          { scheme: "semantic-scholar", value: "paper-1" },
        ],
      },
      {
        metadata: expect.objectContaining({ doi: "", url: "https://www.semanticscholar.org/paper/paper-1" }),
        score: null,
        identifiers: [{ scheme: "semantic-scholar", value: "paper-1" }],
      },
      {
        metadata: expect.objectContaining({ doi: "10.1000/second", title: "Second" }),
        score: null,
        identifiers: [
          { scheme: "doi", value: "10.1000/second" },
          { scheme: "semantic-scholar", value: "paper-2" },
        ],
      },
    ]);
    const url = new URL(observedUrl);
    expect(url.searchParams.get("query")).toBe("Evidence based methods Doe");
    expect(url.searchParams.get("year")).toBe("2026");
    expect(url.searchParams.get("limit")).toBe("5");
    await expect(searchSemanticScholarWorks({ title: "", authors: [], year: "" }, "", fetcher)).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    [["Book"], "book"],
    [["BookSection"], "incollection"],
    [["Conference"], "inproceedings"],
    [["Review"], "article"],
    [["Dataset"], "misc"],
    [null, "misc"],
  ])("maps Semantic Scholar publication types", async (publicationTypes, type) => {
    await expect(
      fetchSemanticScholarWork("10.1000/type", "", async () => Response.json(semanticScholarPaper({ publicationTypes }))),
    ).resolves.toMatchObject({ type });
  });

  it("uses DOI and field fallbacks while bounding values", async () => {
    const metadata = await fetchSemanticScholarWork("10.1000/fallback", "", async () =>
      Response.json(
        semanticScholarPaper({
          externalIds: { DOI: "invalid" },
          title: "t".repeat(2_100),
          abstract: "a".repeat(20_100),
          authors: [{ name: ` ${"n".repeat(600)} ` }, null],
          year: 2026.5,
          venue: 4,
        }),
      ),
    );
    expect(metadata).toMatchObject({ doi: "10.1000/fallback", year: "", venue: "" });
    expect(metadata.title).toHaveLength(2_000);
    expect(metadata.abstract).toHaveLength(20_000);
    expect(metadata.authors).toEqual(["n".repeat(500)]);
  });

  it("rejects failed, malformed, missing-title, and oversized responses", async () => {
    const ok = async () => Response.json(semanticScholarPaper());
    await expect(fetchSemanticScholarWork("invalid", "", ok)).rejects.toThrow("DOI is invalid");
    await expect(fetchSemanticScholarWork("10.1000/missing", "", async () => new Response(null, { status: 404 }))).rejects.toThrow(
      "no record",
    );
    await expect(fetchSemanticScholarWork("10.1000/error", "", async () => new Response(null, { status: 429 }))).rejects.toThrow(
      "request failed",
    );
    await expect(fetchSemanticScholarWork("10.1000/invalid", "", async () => Response.json([]))).rejects.toThrow("invalid metadata");
    await expect(
      fetchSemanticScholarWork("10.1000/no-title", "", async () => Response.json(semanticScholarPaper({ title: "" }))),
    ).rejects.toThrow("no title");
    await expect(
      fetchSemanticScholarWork("10.1000/large", "", async () => new Response("{}", { headers: { "content-length": "1000001" } })),
    ).rejects.toThrow("too large");
    await expect(fetchSemanticScholarWork("10.1000/large", "", async () => new Response("x".repeat(1_000_001)))).rejects.toThrow(
      "too large",
    );
    await expect(fetchSemanticScholarWork("10.1000/malformed", "", async () => new Response("{"))).rejects.toThrow("invalid metadata");
    await expect(
      searchSemanticScholarWorks(
        { title: "Evidence", authors: [], year: "not-a-year" },
        "",
        async () => new Response(null, { status: 500 }),
      ),
    ).rejects.toThrow("search failed");
    await expect(
      searchSemanticScholarWorks({ title: "Evidence", authors: [], year: "" }, "", async () => Response.json({ data: null })),
    ).rejects.toThrow("invalid search metadata");
  });
});
