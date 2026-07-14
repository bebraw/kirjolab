import { describe, expect, it, vi } from "vitest";
import { fetchOpenAlexWork, searchOpenAlexWorks } from "./openalex";

function openAlexWork(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "https://openalex.org/W1",
    doi: "https://doi.org/10.1000/EXAMPLE",
    title: "Inspectable evidence",
    publication_year: 2026,
    type: "article",
    authorships: [{ author: { display_name: "Jane Doe" } }, { author: { display_name: "Research Collective" } }],
    primary_location: { source: { display_name: "Journal of Testing" } },
    abstract_inverted_index: { Evidence: [1], Inspectable: [0], works: [2] },
    ...overrides,
  };
}

describe("OpenAlex metadata integration", () => {
  it("maps a bounded DOI work and authenticates the request", async () => {
    let observedUrl = "";
    let observedHeaders: HeadersInit | undefined;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      observedUrl = String(input);
      observedHeaders = init?.headers;
      return Response.json(openAlexWork());
    });

    await expect(fetchOpenAlexWork("https://doi.org/10.1000/example", " secret ", fetcher)).resolves.toEqual({
      type: "article",
      title: "Inspectable evidence",
      authors: ["Jane Doe", "Research Collective"],
      year: "2026",
      venue: "Journal of Testing",
      doi: "10.1000/example",
      url: "https://doi.org/10.1000/example",
      abstract: "Inspectable Evidence works",
    });
    const url = new URL(observedUrl);
    expect(url.origin + url.pathname).toBe("https://api.openalex.org/works/doi:10.1000%2Fexample");
    expect(url.searchParams.get("api_key")).toBe("secret");
    expect(url.searchParams.get("select")).toContain("authorships");
    expect(observedHeaders).toEqual({ accept: "application/json", "user-agent": "Kirjolab/0.1" });
  });

  it("returns up to five unique DOI-backed search matches", async () => {
    let observedUrl = "";
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      observedUrl = String(input);
      return Response.json({
        results: [
          openAlexWork({ relevance_score: 91.5 }),
          openAlexWork({ title: "Duplicate" }),
          openAlexWork({ doi: null }),
          openAlexWork({ doi: "https://doi.org/10.1000/second", title: "Second", relevance_score: "high" }),
          openAlexWork({ doi: "https://doi.org/10.1000/no-title", title: "", display_name: "" }),
        ],
      });
    });
    await expect(searchOpenAlexWorks({ title: " Evidence ", authors: [" Doe "], year: " 2026 " }, "key", fetcher)).resolves.toEqual([
      { metadata: expect.objectContaining({ doi: "10.1000/example", title: "Inspectable evidence" }), score: 91.5 },
      { metadata: expect.objectContaining({ doi: "10.1000/second", title: "Second" }), score: null },
    ]);
    const url = new URL(observedUrl);
    expect(url.searchParams.get("search")).toBe("Evidence Doe 2026");
    expect(url.searchParams.get("per_page")).toBe("5");
    await expect(searchOpenAlexWorks({ title: "", authors: [], year: "" }, "key", fetcher)).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    ["book", "book"],
    ["book-chapter", "incollection"],
    ["dissertation", "phdthesis"],
    ["report", "techreport"],
    ["dataset", "misc"],
  ])("maps OpenAlex type %s to BibTeX type %s", async (sourceType, expectedType) => {
    await expect(
      fetchOpenAlexWork("10.1000/type", "key", async () => Response.json(openAlexWork({ type: sourceType }))),
    ).resolves.toMatchObject({
      type: expectedType,
    });
  });

  it("uses safe fallbacks and bounds mapped fields", async () => {
    const metadata = await fetchOpenAlexWork("10.1000/fallback", "key", async () =>
      Response.json(
        openAlexWork({
          doi: "invalid",
          title: undefined,
          display_name: "t".repeat(2_100),
          publication_year: 2026.5,
          authorships: [{ author: { display_name: ` ${"a".repeat(600)} ` } }, { author: null }, "bad"],
          primary_location: null,
          abstract_inverted_index: { valid: [0], ignored: [-1, 1.5, "2"] },
        }),
      ),
    );
    expect(metadata).toMatchObject({ doi: "10.1000/fallback", year: "", venue: "", abstract: "valid" });
    expect(metadata.title).toHaveLength(2_000);
    expect(metadata.authors).toEqual(["a".repeat(500)]);
  });

  it("rejects missing configuration, upstream failures, malformed records, and oversized bodies", async () => {
    const ok = async () => Response.json(openAlexWork());
    await expect(fetchOpenAlexWork("invalid", "key", ok)).rejects.toThrow("DOI is invalid");
    await expect(fetchOpenAlexWork("10.1000/item", "", ok)).rejects.toThrow("key is not configured");
    await expect(fetchOpenAlexWork("10.1000/missing", "key", async () => new Response(null, { status: 404 }))).rejects.toThrow("no record");
    await expect(fetchOpenAlexWork("10.1000/error", "key", async () => new Response(null, { status: 500 }))).rejects.toThrow(
      "request failed",
    );
    await expect(fetchOpenAlexWork("10.1000/invalid", "key", async () => Response.json([]))).rejects.toThrow("invalid metadata");
    await expect(
      fetchOpenAlexWork("10.1000/no-title", "key", async () => Response.json(openAlexWork({ title: "", display_name: "" }))),
    ).rejects.toThrow("no title");
    await expect(
      fetchOpenAlexWork("10.1000/large", "key", async () => new Response("{}", { headers: { "content-length": "1000001" } })),
    ).rejects.toThrow("too large");
    await expect(fetchOpenAlexWork("10.1000/large", "key", async () => new Response("x".repeat(1_000_001)))).rejects.toThrow("too large");
    await expect(fetchOpenAlexWork("10.1000/malformed", "key", async () => new Response("{"))).rejects.toThrow("invalid metadata");
    await expect(
      searchOpenAlexWorks({ title: "Evidence", authors: [], year: "" }, "key", async () => new Response(null, { status: 500 })),
    ).rejects.toThrow("search failed");
    await expect(
      searchOpenAlexWorks({ title: "Evidence", authors: [], year: "" }, "key", async () => Response.json({ results: null })),
    ).rejects.toThrow("invalid search metadata");
  });
});
