import { describe, expect, it, vi } from "vitest";
import {
  fetchSemanticScholarCitations,
  fetchSemanticScholarWork,
  searchSemanticScholarWorks,
  SemanticScholarUnavailableError,
} from "./semantic-scholar";

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
  it("retrieves bounded DOI-backed forward citations", async () => {
    let observedUrl = "";
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      observedUrl = String(input);
      expect(init?.headers).toEqual({ accept: "application/json", "user-agent": "Kirjolab/0.1", "x-api-key": "secret" });
      return Response.json({
        next: 128,
        data: [
          { citingPaper: semanticScholarPaper({ paperId: "citing-1", externalIds: { DOI: "10.1000/CITING" } }) },
          { citingPaper: semanticScholarPaper({ paperId: "duplicate", externalIds: { DOI: "10.1000/citing" } }) },
          { citingPaper: semanticScholarPaper({ paperId: "seed", externalIds: { DOI: "10.1000/seed" } }) },
          { citingPaper: semanticScholarPaper({ paperId: "missing", externalIds: {} }) },
        ],
      });
    });

    await expect(fetchSemanticScholarCitations("10.1000/seed", " secret ", fetcher)).resolves.toMatchObject({
      provider: "semantic-scholar",
      direction: "citations",
      responseId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      candidates: [
        {
          doi: "10.1000/citing",
          title: "Inspectable evidence",
          authors: "Jane Doe; Research Collective",
          year: "2026",
          unstructured: "",
        },
      ],
      truncated: true,
    });
    const url = new URL(observedUrl);
    expect(url.origin + url.pathname).toBe("https://api.semanticscholar.org/graph/v1/paper/DOI:10.1000%2Fseed/citations");
    expect(url.searchParams.get("limit")).toBe("128");
    expect(url.searchParams.get("fields")).toBe("title,authors,year,externalIds");
  });

  it("retries transient forward-citation failures once", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => new Response(null, { status: 429 }));
      const request = fetchSemanticScholarCitations("10.1000/seed", "", fetcher);
      const rejection = expect(request).rejects.toBeInstanceOf(SemanticScholarUnavailableError);
      await vi.runAllTimersAsync();
      await rejection;
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid and unsuccessful forward-citation requests precisely", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [] }));
    await expect(fetchSemanticScholarCitations("invalid", "", fetcher)).rejects.toThrow("Publication DOI is invalid");
    expect(fetcher).not.toHaveBeenCalled();

    const missingFetcher = vi.fn(async () => new Response(null, { status: 404 }));
    await expect(fetchSemanticScholarCitations("10.1000/missing", "", missingFetcher)).rejects.toThrow(
      "Semantic Scholar has no record for this DOI",
    );
    expect(missingFetcher).toHaveBeenCalledOnce();

    const rejectedFetcher = vi.fn(async () => new Response(null, { status: 400 }));
    await expect(fetchSemanticScholarCitations("10.1000/rejected", "", rejectedFetcher)).rejects.toThrow(
      "Semantic Scholar citations request failed",
    );
    expect(rejectedFetcher).toHaveBeenCalledOnce();
  });

  it("rejects malformed forward-citation metadata", async () => {
    await expect(fetchSemanticScholarCitations("10.1000/seed", "", async () => Response.json([]))).rejects.toThrow(
      "Semantic Scholar returned invalid citation metadata",
    );
    await expect(fetchSemanticScholarCitations("10.1000/seed", "", async () => Response.json({ data: null }))).rejects.toThrow(
      "Semantic Scholar returned invalid citation metadata",
    );
  });

  it("filters malformed citation rows and normalizes optional fields", async () => {
    const expansion = await fetchSemanticScholarCitations("10.1000/seed", "", async () =>
      Response.json({
        data: [
          null,
          {},
          { citingPaper: null },
          {
            citingPaper: semanticScholarPaper({
              authors: [null, { name: " Alice Example " }],
              externalIds: { DOI: "10.1000/normalized" },
              title: " Normalized title ",
              year: 2026.5,
            }),
          },
        ],
      }),
    );

    expect(expansion).toMatchObject({
      candidates: [
        {
          authors: "Alice Example",
          doi: "10.1000/normalized",
          title: "Normalized title",
          year: "",
        },
      ],
      truncated: false,
    });
  });

  it("bounds forward citations and fingerprints their canonical content", async () => {
    const data = Array.from({ length: 129 }, (_, index) => ({
      citingPaper: semanticScholarPaper({
        externalIds: { DOI: `10.1000/citing-${index}` },
        paperId: `citing-${index}`,
      }),
    }));
    const first = await fetchSemanticScholarCitations("10.1000/seed", "", async () => Response.json({ data }));
    const second = await fetchSemanticScholarCitations("10.1000/seed", "", async () =>
      Response.json({ data: [{ citingPaper: semanticScholarPaper({ externalIds: { DOI: "10.1000/different" } }) }] }),
    );

    expect(first.candidates).toHaveLength(128);
    expect(first.truncated).toBe(true);
    expect(first.responseId).not.toBe(second.responseId);
  });

  it("classifies exhausted provider retries", async () => {
    const error = new SemanticScholarUnavailableError();
    expect(error).toMatchObject({
      message: "Semantic Scholar is temporarily unavailable; try again shortly",
      name: "SemanticScholarUnavailableError",
    });

    vi.useFakeTimers();
    try {
      const networkFetcher = vi.fn(async (): Promise<Response> => {
        throw new Error("network unavailable");
      });
      const request = fetchSemanticScholarCitations("10.1000/seed", "", networkFetcher);
      const rejection = expect(request).rejects.toBeInstanceOf(SemanticScholarUnavailableError);
      await vi.runAllTimersAsync();
      await rejection;
      expect(networkFetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

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

  it("maps every supported identifier and URL fallback exactly", async () => {
    let observedUrl = "";
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      observedUrl = String(input);
      return Response.json({
        data: [
          semanticScholarPaper({
            paperId: " paper/id ",
            externalIds: { ArXiv: " 2607.12345 ", PubMed: "12345678" },
            url: " https://example.test/paper ",
          }),
          semanticScholarPaper({
            paperId: "paper-2",
            externalIds: { ArXiv: "", PubMed: "pmid-2" },
            title: "Fallback paper",
            url: "",
          }),
          null,
        ],
      });
    });

    await expect(searchSemanticScholarWorks({ title: "Evidence", authors: [], year: "2026x" }, "", fetcher)).resolves.toEqual([
      {
        metadata: expect.objectContaining({
          doi: "",
          url: "https://example.test/paper",
        }),
        score: null,
        identifiers: [
          { scheme: "arxiv", value: "2607.12345" },
          { scheme: "pmid", value: "12345678" },
          { scheme: "semantic-scholar", value: "paper/id" },
        ],
      },
      {
        metadata: expect.objectContaining({
          doi: "",
          title: "Fallback paper",
          url: "https://www.semanticscholar.org/paper/paper-2",
        }),
        score: null,
        identifiers: [{ scheme: "semantic-scholar", value: "paper-2" }],
      },
    ]);
    expect(new URL(observedUrl).searchParams.has("year")).toBe(false);
  });

  it("requires a complete four-digit search year", async () => {
    for (const year of ["x2026", "2026x", " 2026-2027 "]) {
      let observedUrl = "";
      await searchSemanticScholarWorks({ title: "Evidence", authors: [], year }, "", async (input) => {
        observedUrl = String(input);
        return Response.json({ data: [] });
      });
      expect(new URL(observedUrl).searchParams.has("year"), year).toBe(false);
    }
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

  it("maps missing author and abstract fields to empty values", async () => {
    await expect(
      fetchSemanticScholarWork("10.1000/fallback", "", async () =>
        Response.json(
          semanticScholarPaper({
            externalIds: {},
            paperId: "paper-id",
            url: `  https://example.test/${"x".repeat(2_100)}  `,
            authors: "unknown",
            abstract: null,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      authors: [],
      abstract: "",
      url: "https://doi.org/10.1000/fallback",
    });
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
    await expect(
      fetchSemanticScholarWork(
        "10.1000/exact",
        "",
        async () => new Response("x".repeat(1_000_000), { headers: { "content-length": "1000000" } }),
      ),
    ).rejects.toThrow("invalid metadata");
    await expect(fetchSemanticScholarWork("10.1000/no-body", "", async () => new Response(null))).rejects.toThrow("invalid metadata");
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
