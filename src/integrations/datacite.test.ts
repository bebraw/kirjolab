import { describe, expect, it, vi } from "vitest";
import { fetchDataCiteWork } from "./datacite";

describe("DataCite metadata integration", () => {
  it("maps a bounded DOI record and identifies the public request", async () => {
    let observedUrl = "";
    let observedHeaders: HeadersInit | undefined;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      observedUrl = String(input);
      observedHeaders = init?.headers;
      return Response.json({
        data: {
          attributes: {
            doi: "10.5438/EXAMPLE",
            url: "https://example.test/dataset",
            titles: [{ title: "<i>Inspectable</i> dataset" }],
            creators: [{ familyName: "Doe", givenName: "Jane", name: "Doe, Jane" }, { name: "Research Collective" }],
            publicationYear: 2026,
            publisher: "Open Data Archive",
            types: { resourceTypeGeneral: "Dataset", bibtex: "misc" },
            descriptions: [{ descriptionType: "Abstract", description: "<p>Open &amp; reusable.</p>" }],
          },
        },
      });
    });

    await expect(fetchDataCiteWork("https://doi.org/10.5438/example", " Contact@Example.org ", fetcher)).resolves.toEqual({
      type: "misc",
      title: "Inspectable dataset",
      authors: ["Doe, Jane", "Research Collective"],
      year: "2026",
      venue: "Open Data Archive",
      doi: "10.5438/example",
      url: "https://example.test/dataset",
      abstract: "Open & reusable.",
    });
    expect(observedUrl).toBe("https://api.datacite.org/dois/10.5438%2Fexample");
    expect(observedHeaders).toEqual({
      accept: "application/vnd.api+json",
      "user-agent": "Kirjolab/0.1 (mailto:contact@example.org)",
    });
  });

  it("maps fallbacks, types, malformed records, failures, and size limits", async () => {
    let publicHeaders: HeadersInit | undefined;
    await expect(
      fetchDataCiteWork("10.5438/book", "", async (_input, init) => {
        publicHeaders = init?.headers;
        return Response.json({
          data: {
            attributes: {
              titles: [{ title: "Book" }],
              creators: [{ givenName: "Solo" }, null],
              types: { resourceTypeGeneral: "Book" },
            },
          },
        });
      }),
    ).resolves.toMatchObject({
      type: "book",
      authors: ["Solo"],
      year: "",
      venue: "",
      doi: "10.5438/book",
      url: "https://doi.org/10.5438/book",
      abstract: "",
    });
    expect(publicHeaders).toEqual({ accept: "application/vnd.api+json", "user-agent": "Kirjolab/0.1" });
    await expect(fetchDataCiteWork("invalid", "", async () => Response.json({}))).rejects.toThrow("DOI is invalid");
    await expect(fetchDataCiteWork("10.5438/missing", "", async () => new Response(null, { status: 404 }))).rejects.toThrow(
      "DataCite has no record",
    );
    await expect(fetchDataCiteWork("10.5438/error", "", async () => new Response(null, { status: 500 }))).rejects.toThrow("request failed");
    await expect(fetchDataCiteWork("10.5438/invalid", "", async () => Response.json({ data: null }))).rejects.toThrow("invalid metadata");
    await expect(
      fetchDataCiteWork("10.5438/no-title", "", async () => Response.json({ data: { attributes: { titles: [] } } })),
    ).rejects.toThrow("no title");
    await expect(
      fetchDataCiteWork("10.5438/large", "", async () => new Response("{}", { headers: { "content-length": "1000001" } })),
    ).rejects.toThrow("too large");
    await expect(fetchDataCiteWork("10.5438/malformed", "", async () => new Response("{"))).rejects.toThrow("invalid metadata");
    await expect(fetchDataCiteWork("10.5438/body-limit", "", async () => new Response("x".repeat(1_000_001)))).rejects.toThrow("too large");
  });

  it.each([
    ["ARTICLE", "article"],
    ["book", "book"],
    ["inbook", "inbook"],
    ["incollection", "incollection"],
    ["inproceedings", "inproceedings"],
    ["manual", "manual"],
    ["mastersthesis", "mastersthesis"],
    ["misc", "misc"],
    ["phdthesis", "phdthesis"],
    ["proceedings", "proceedings"],
    ["techreport", "techreport"],
    ["unpublished", "unpublished"],
  ])("preserves supported DataCite BibTeX type %s as %s", async (bibtex, expected) => {
    await expect(fetchDataCiteWork("10.5438/type", "", async () => dataCiteJson({ types: { bibtex } }))).resolves.toMatchObject({
      type: expected,
    });
  });

  it.each([
    ["BookChapter", "incollection"],
    ["ConferencePaper", "inproceedings"],
    ["Dissertation", "phdthesis"],
    ["Report", "techreport"],
    ["JournalArticle", "article"],
    ["Dataset", "misc"],
  ])("maps DataCite resource type %s to %s", async (resourceTypeGeneral, expected) => {
    await expect(
      fetchDataCiteWork("10.5438/type", "", async () => dataCiteJson({ types: { resourceTypeGeneral } })),
    ).resolves.toMatchObject({ type: expected });
  });

  it("filters malformed fields, selects the abstract, and enforces field bounds", async () => {
    const metadata = await fetchDataCiteWork("10.5438/bounds", "", async () =>
      dataCiteJson({
        doi: "10.5438/BOUNDS",
        url: `https://example.test/${"u".repeat(2_100)}`,
        titles: [null, { title: 4 }, { title: `<i>${"t".repeat(2_100)}</i>` }],
        creators: [
          null,
          { familyName: 4, givenName: " Solo " },
          { familyName: " Family ", givenName: " Given ", name: "Ignored" },
          ...Array.from({ length: 99 }, () => ({ name: "Collective" })),
        ],
        publicationYear: "2026",
        publisher: ` ${"v".repeat(2_100)} `,
        descriptions: [
          { descriptionType: "Other", description: "Wrong description" },
          null,
          { descriptionType: "Abstract", description: 4 },
          { descriptionType: "Abstract", description: `<p>${"a".repeat(20_100)} &amp; open</p>` },
        ],
        types: { bibtex: "unsupported", resourceTypeGeneral: "Dataset" },
      }),
    );

    expect(metadata.title).toHaveLength(2_000);
    expect(metadata.authors).toHaveLength(99);
    expect(metadata.authors.slice(0, 2)).toEqual(["Solo", "Family, Given"]);
    expect(metadata.year).toBe("");
    expect(metadata.venue).toHaveLength(2_000);
    expect(metadata.doi).toBe("10.5438/bounds");
    expect(metadata.url).toHaveLength(2_000);
    expect(metadata.abstract).toHaveLength(20_000);
    expect(metadata.abstract).not.toContain("Wrong description");
  });

  it("reassembles streamed JSON and accepts a response exactly at the byte limit", async () => {
    const source = JSON.stringify({ data: { attributes: { titles: [{ title: "Chunked" }] } } });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(source.slice(0, 20)));
        controller.enqueue(new TextEncoder().encode(source.slice(20)));
        controller.close();
      },
    });
    await expect(fetchDataCiteWork("10.5438/chunked", "", async () => new Response(stream))).resolves.toMatchObject({
      title: "Chunked",
    });

    const padded = `${source}${" ".repeat(1_000_000 - source.length)}`;
    await expect(
      fetchDataCiteWork("10.5438/exact-limit", "", async () => new Response(padded, { headers: { "content-length": "1000000" } })),
    ).resolves.toMatchObject({ title: "Chunked" });
  });
});

function dataCiteJson(attributes: Record<string, unknown>): Response {
  return Response.json({ data: { attributes: { titles: [{ title: "Typed work" }], ...attributes } } });
}
