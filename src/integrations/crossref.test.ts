import { describe, expect, it, vi } from "vitest";
import { fetchCrossrefReferences, fetchCrossrefWork, fingerprintPublicationMetadata, searchCrossrefWorks } from "./crossref";

describe("Crossref metadata integration", () => {
  it("maps a DOI singleton response into bounded publication metadata", async () => {
    const { fetcher, request } = captureJsonRequest({
      message: {
        DOI: "10.1000/EXAMPLE",
        URL: "https://doi.org/10.1000/example",
        type: "journal-article",
        title: ["<i>Inspectable</i> Evidence"],
        author: [{ family: "Doe", given: "Jane" }, { family: "Merton" }, { given: "Collective" }, null],
        "container-title": ["Journal of Testing"],
        "published-online": { "date-parts": [[2026, 7, 10]] },
        abstract: "<jats:p>Open &amp; inspectable.</jats:p>",
      },
    });

    await expect(fetchCrossrefWork("https://doi.org/10.1000/Example", " Contact@Example.org ", fetcher)).resolves.toEqual({
      type: "article",
      title: "Inspectable Evidence",
      authors: ["Doe, Jane", "Merton", "Collective"],
      year: "2026",
      venue: "Journal of Testing",
      doi: "10.1000/example",
      url: "https://doi.org/10.1000/example",
      abstract: "Open & inspectable.",
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(request.url).toBe("https://api.crossref.org/works/10.1000%2Fexample?mailto=contact%40example.org");
    expect(request.headers).toEqual({
      accept: "application/vnd.crossref-api-message+json",
      "user-agent": "Kirjolab/0.1 (mailto:contact@example.org)",
    });
  });

  it("handles public requests, fallbacks, and upstream failures", async () => {
    let observedUrl = "";
    let observedHeaders: HeadersInit | undefined;
    const minimal = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      observedUrl = String(input);
      observedHeaders = init?.headers;
      return Response.json({ message: { title: ["Title"], DOI: "10.2000/item", issued: { "date-parts": [[2020]] } } });
    });
    await expect(fetchCrossrefWork("10.2000/item", "", minimal)).resolves.toMatchObject({
      type: "misc",
      authors: [],
      year: "2020",
      venue: "",
      url: "https://doi.org/10.2000/item",
      abstract: "",
    });
    expect(observedHeaders).toEqual({
      accept: "application/vnd.crossref-api-message+json",
      "user-agent": "Kirjolab/0.1",
    });
    expect(new URL(observedUrl).searchParams.has("mailto")).toBe(false);
    await expect(fetchCrossrefWork("not-a-doi", "", minimal)).rejects.toThrow("Publication DOI is invalid");
    await expect(fetchCrossrefWork("prefix-10.2000/item", "", minimal)).rejects.toThrow("Publication DOI is invalid");
    await expect(fetchCrossrefWork("10.2000/item suffix", "", minimal)).rejects.toThrow("Publication DOI is invalid");
    await expect(fetchCrossrefWork("10.2000/missing", "", async () => new Response(null, { status: 404 }))).rejects.toThrow(
      "Crossref has no record",
    );
    await expect(fetchCrossrefWork("10.2000/error", "", async () => new Response(null, { status: 500 }))).rejects.toThrow(
      "Crossref metadata request failed",
    );
    await expect(fetchCrossrefWork("10.2000/invalid", "", async () => Response.json({ message: null }))).rejects.toThrow(
      "invalid metadata",
    );
    await expect(fetchCrossrefWork("10.2000/no-title", "", async () => Response.json({ message: { title: [] } }))).rejects.toThrow(
      "no title",
    );
  });

  it("uses date priority, trims authors, and decodes supported markup entities", async () => {
    const metadata = await fetchCrossrefWork("10.3000/item", "", async () =>
      Response.json({
        message: {
          title: ["A &lt;careful&gt; &amp; open title"],
          author: [{ family: " Doe ", given: " Jane " }, { family: 4, given: " Solo " }, "invalid"],
          "container-title": ["Venue"],
          "published-print": { "date-parts": [[2024]] },
          "published-online": { "date-parts": [[2025]] },
          issued: { "date-parts": [[2026]] },
          abstract: "<p>A &lt;bounded&gt; value &amp; source.</p>",
        },
      }),
    );
    expect(metadata).toEqual({
      type: "misc",
      title: "A <careful> & open title",
      authors: ["Doe, Jane", "Solo"],
      year: "2024",
      venue: "Venue",
      doi: "10.3000/item",
      url: "https://doi.org/10.3000/item",
      abstract: "A <bounded> value & source.",
    });

    await expect(
      fetchCrossrefWork("10.3000/no-year", "", async () =>
        Response.json({ message: { title: ["No year"], issued: { "date-parts": [["2024"]] } } }),
      ),
    ).resolves.toMatchObject({ year: "" });

    await expect(
      fetchCrossrefWork("10.3000/published", "", async () =>
        Response.json({
          message: {
            title: ["<b>Adjacent</b><i>markup</i>"],
            published: { "date-parts": [[2023]] },
          },
        }),
      ),
    ).resolves.toMatchObject({ title: "Adjacent markup", year: "2023" });
  });

  it.each([
    ["journal-article", "article"],
    ["proceedings-article", "inproceedings"],
    ["book-chapter", "incollection"],
    ["reference-entry", "incollection"],
    ["book", "book"],
    ["monograph", "book"],
    ["edited-book", "book"],
    ["reference-book", "book"],
    ["dissertation", "phdthesis"],
    ["report", "techreport"],
    ["dataset", "misc"],
  ])("maps Crossref type %s to BibTeX type %s", async (crossrefType, bibTeXType) => {
    await expect(
      fetchCrossrefWork("10.4000/type", "", async () =>
        Response.json({ message: { type: crossrefType, title: ["Typed work"], DOI: "10.4000/type" } }),
      ),
    ).resolves.toMatchObject({ type: bibTeXType });
  });

  it("bounds accepted Crossref fields and author counts", async () => {
    const metadata = await fetchCrossrefWork("10.5000/bounded", "", async () =>
      Response.json({
        message: {
          DOI: "10.5000/bounded",
          URL: `https://example.test/${"u".repeat(2_100)}`,
          title: ["t".repeat(2_100)],
          author: Array.from({ length: 101 }, () => ({ family: "f".repeat(400), given: "g".repeat(400) })),
          "container-title": ["v".repeat(2_100)],
          abstract: "a".repeat(20_100),
        },
      }),
    );

    expect(metadata.title).toHaveLength(2_000);
    expect(metadata.authors).toHaveLength(100);
    expect(metadata.authors[0]).toHaveLength(500);
    expect(metadata.venue).toHaveLength(2_000);
    expect(metadata.url).toHaveLength(2_000);
    expect(metadata.abstract).toHaveLength(20_000);
  });

  it("rejects oversized and malformed Crossref response bodies", async () => {
    const exactLimitBody = JSON.stringify({ message: { title: ["Exact limit"] } }).padEnd(1_000_000, " ");
    await expect(
      fetchCrossrefWork("10.6000/exact-limit", "", async () => new Response(exactLimitBody, { headers: { "content-length": "1000000" } })),
    ).resolves.toMatchObject({ title: "Exact limit" });
    await expect(
      fetchCrossrefWork("10.6000/header-limit", "", async () => new Response("{}", { headers: { "content-length": "1000001" } })),
    ).rejects.toThrow("too large");
    await expect(fetchCrossrefWork("10.6000/body-limit", "", async () => new Response("x".repeat(1_000_001)))).rejects.toThrow("too large");
    await expect(fetchCrossrefWork("10.6000/malformed", "", async () => new Response("{"))).rejects.toThrow("invalid metadata");
    await expect(fetchCrossrefWork("10.6000/empty", "", async () => new Response(null))).rejects.toThrow("invalid metadata");

    const splitBody = new TextEncoder().encode(JSON.stringify({ message: { title: ["Split body"] } }));
    const splitResponse = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(splitBody.slice(0, 10));
          controller.enqueue(splitBody.slice(10));
          controller.close();
        },
      }),
    );
    await expect(fetchCrossrefWork("10.6000/split", "", async () => splitResponse)).resolves.toMatchObject({ title: "Split body" });
  });

  it("returns up to five unique bibliographic matches for title, author, and year", async () => {
    const { fetcher, request } = captureJsonRequest({
      message: {
        items: [
          {
            DOI: "10.7000/FIRST",
            type: "journal-article",
            title: ["First match"],
            author: [{ family: "Doe", given: "Jane" }],
            issued: { "date-parts": [[2026]] },
            score: 91.5,
          },
          { DOI: "10.7000/first", title: ["Duplicate"] },
          { DOI: "not-a-doi", title: ["Invalid"] },
          { DOI: "10.7000/no-title", title: [] },
          { DOI: "10.7000/second", title: ["Second match"] },
          null,
          { DOI: "10.7000/beyond-limit", title: ["Beyond limit"] },
        ],
      },
    });

    await expect(
      searchCrossrefWorks({ title: " Evidence ", authors: [" Doe, Jane "], year: " 2026 " }, " Contact@Example.org ", fetcher),
    ).resolves.toEqual([
      {
        metadata: expect.objectContaining({ title: "First match", authors: ["Doe, Jane"], doi: "10.7000/first" }),
        score: 91.5,
        identifiers: [{ scheme: "doi", value: "10.7000/first" }],
      },
      {
        metadata: expect.objectContaining({ title: "Second match", doi: "10.7000/second" }),
        score: null,
        identifiers: [{ scheme: "doi", value: "10.7000/second" }],
      },
    ]);
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe("https://api.crossref.org/works");
    expect(url.searchParams.get("query.bibliographic")).toBe("Evidence Doe, Jane 2026");
    expect(url.searchParams.get("rows")).toBe("5");
    expect(url.searchParams.get("mailto")).toBe("contact@example.org");
    expect(request.headers).toEqual({
      accept: "application/vnd.crossref-api-message+json",
      "user-agent": "Kirjolab/0.1 (mailto:contact@example.org)",
    });
    await expect(searchCrossrefWorks({ title: "", authors: [], year: "" }, "", fetcher)).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("bounds the bibliographic query sent to Crossref", async () => {
    let observedUrl = "";
    await searchCrossrefWorks({ title: "x".repeat(4_100), authors: [], year: "" }, "", async (input, init) => {
      observedUrl = String(input);
      expect(init?.headers).toEqual({
        accept: "application/vnd.crossref-api-message+json",
        "user-agent": "Kirjolab/0.1",
      });
      return Response.json({ message: { items: [] } });
    });
    const url = new URL(observedUrl);
    expect(url.searchParams.get("query.bibliographic")).toHaveLength(4_000);
    expect(url.searchParams.has("mailto")).toBe(false);
  });

  it("rejects failed and malformed Crossref bibliographic searches", async () => {
    const query = { title: "Evidence", authors: [] as string[], year: "" };
    await expect(searchCrossrefWorks(query, "", async () => new Response(null, { status: 500 }))).rejects.toThrow("search failed");
    await expect(searchCrossrefWorks(query, "", async () => Response.json({ message: null }))).rejects.toThrow("invalid search metadata");
    await expect(searchCrossrefWorks(query, "", async () => Response.json({ message: { items: [null, 42] } }))).resolves.toEqual([]);
  });

  it("fingerprints normalized metadata stably and detects material changes", async () => {
    const metadata = {
      type: "article",
      title: "Inspectable evidence",
      authors: ["Doe, Jane", "Roe, Richard"],
      year: "2026",
      venue: "Journal of Testing",
      doi: "https://doi.org/10.7000/EXAMPLE",
      url: "https://example.test/work",
      abstract: "A bounded abstract.",
    };
    const fingerprint = await fingerprintPublicationMetadata(metadata);
    const { type: _type, ...metadataWithoutType } = metadata;

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    await expect(fingerprintPublicationMetadata({ ...metadata })).resolves.toBe(fingerprint);
    await expect(fingerprintPublicationMetadata({ ...metadata, doi: "10.7000/example" })).resolves.toBe(fingerprint);
    await expect(fingerprintPublicationMetadata({ ...metadata, title: "Changed title" })).resolves.not.toBe(fingerprint);
    await expect(fingerprintPublicationMetadata({ ...metadata, authors: [...metadata.authors].reverse() })).resolves.not.toBe(fingerprint);
    await expect(fingerprintPublicationMetadata({ ...metadata, type: "book" })).resolves.not.toBe(fingerprint);
    await expect(fingerprintPublicationMetadata({ ...metadata, abstract: "Changed abstract." })).resolves.not.toBe(fingerprint);
    await expect(fingerprintPublicationMetadata(metadataWithoutType)).resolves.not.toBe(fingerprint);
    await expect(fingerprintPublicationMetadata({ ...metadata, type: "misc" })).resolves.not.toBe(fingerprint);
    await expect(fingerprintPublicationMetadata(metadataWithoutType)).resolves.toBe(
      await fingerprintPublicationMetadata({ ...metadata, type: "misc" }),
    );
  });

  it("retrieves a bounded outgoing reference expansion with a reproducible provider-response identity", async () => {
    let observedHeaders: HeadersInit | undefined;
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      observedHeaders = init?.headers;
      return Response.json({
        message: {
          reference: [
            {
              DOI: "10.1000/TARGET",
              "article-title": "<i>Target</i> paper",
              author: "Doe, Jane",
              year: " 2020 ",
              unstructured: "Doe. <b>Target</b> paper.",
            },
            { DOI: "not-a-doi", unstructured: "Unmatched" },
            { unstructured: "No identifier" },
          ],
        },
      });
    });
    const first = await fetchCrossrefReferences("10.1000/source", " Contact@Example.org ", fetcher);
    const second = await fetchCrossrefReferences("10.1000/source", " Contact@Example.org ", fetcher);

    expect(first).toMatchObject({
      provider: "crossref",
      direction: "references",
      responseId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      sourceLocator: "https://api.crossref.org/works/10.1000%2Fsource?mailto=contact%40example.org",
      candidates: [
        {
          doi: "10.1000/target",
          title: "Target paper",
          authors: "Doe, Jane",
          year: "2020",
          unstructured: "Doe. Target paper.",
        },
      ],
      truncated: false,
    });
    expect(first.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(second.responseId).toBe(first.responseId);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(observedHeaders).toEqual({
      accept: "application/vnd.crossref-api-message+json",
      "user-agent": "Kirjolab/0.1 (mailto:contact@example.org)",
    });

    const changed = await fetchCrossrefReferences("10.1000/source", "", async () =>
      Response.json({ message: { reference: [{ DOI: "10.1000/changed" }] } }),
    );
    expect(changed.responseId).not.toBe(first.responseId);
  });

  it("bounds Crossref citation candidates and maps missing or invalid reference lists to an empty expansion", async () => {
    const references = Array.from({ length: 129 }, (_, index) => ({ DOI: `10.2000/${index}`, unstructured: `Reference ${index}` }));
    const bounded = await fetchCrossrefReferences("10.1000/source", "", async () => Response.json({ message: { reference: references } }));
    expect(bounded.candidates).toHaveLength(128);
    expect(bounded.truncated).toBe(true);

    const exactBoundary = await fetchCrossrefReferences("10.1000/source", "", async (_input, init) => {
      expect(init?.headers).toEqual({
        accept: "application/vnd.crossref-api-message+json",
        "user-agent": "Kirjolab/0.1",
      });
      return Response.json({ message: { reference: references.slice(0, 128) } });
    });
    expect(exactBoundary.truncated).toBe(false);
    expect(new URL(exactBoundary.sourceLocator).searchParams.has("mailto")).toBe(false);

    const optionalFields = await fetchCrossrefReferences("10.1000/source", "", async () =>
      Response.json({ message: { reference: [{ DOI: "10.2000/optional" }] } }),
    );
    expect(optionalFields.candidates).toEqual([{ doi: "10.2000/optional", title: "", authors: "", year: "", unstructured: "" }]);

    await expect(fetchCrossrefReferences("10.1000/source", "", async () => Response.json({ message: {} }))).resolves.toMatchObject({
      candidates: [],
      truncated: false,
    });
    await expect(fetchCrossrefReferences("invalid", "", async () => Response.json({ message: {} }))).rejects.toThrow("DOI is invalid");
    await expect(fetchCrossrefReferences("10.1000/missing", "", async () => new Response(null, { status: 404 }))).rejects.toThrow(
      "no record",
    );
    await expect(fetchCrossrefReferences("10.1000/error", "", async () => new Response(null, { status: 500 }))).rejects.toThrow(
      "request failed",
    );
    await expect(fetchCrossrefReferences("10.1000/invalid", "", async () => Response.json({ message: null }))).rejects.toThrow(
      "invalid metadata",
    );
  });
});

function captureJsonRequest(body: unknown) {
  const request: { url: string; headers: HeadersInit | undefined } = { url: "", headers: undefined };
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    request.url = String(input);
    request.headers = init?.headers;
    return Response.json(body);
  });
  return { fetcher, request };
}
