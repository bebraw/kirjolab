import { describe, expect, it, vi } from "vitest";
import { fetchCrossrefWork } from "./crossref";

describe("Crossref metadata integration", () => {
  it("maps a DOI singleton response into bounded publication metadata", async () => {
    let observedUrl = "";
    let observedHeaders: HeadersInit | undefined;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      observedUrl = String(input);
      observedHeaders = init?.headers;
      return Response.json({
        message: {
          DOI: "10.1000/EXAMPLE",
          URL: "https://doi.org/10.1000/example",
          title: ["<i>Inspectable</i> Evidence"],
          author: [{ family: "Doe", given: "Jane" }, { family: "Merton" }, { given: "Collective" }, null],
          "container-title": ["Journal of Testing"],
          "published-online": { "date-parts": [[2026, 7, 10]] },
          abstract: "<jats:p>Open &amp; inspectable.</jats:p>",
        },
      });
    });

    await expect(fetchCrossrefWork("https://doi.org/10.1000/Example", " Contact@Example.org ", fetcher)).resolves.toEqual({
      title: "Inspectable Evidence",
      authors: ["Doe, Jane", "Merton", "Collective"],
      year: "2026",
      venue: "Journal of Testing",
      doi: "10.1000/example",
      url: "https://doi.org/10.1000/example",
      abstract: "Open & inspectable.",
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(observedUrl).toBe("https://api.crossref.org/works/10.1000%2Fexample?mailto=contact%40example.org");
    expect(observedHeaders).toEqual({
      accept: "application/vnd.crossref-api-message+json",
      "user-agent": "Kirjolab/0.1 (mailto:contact@example.org)",
    });
  });

  it("handles public requests, fallbacks, and upstream failures", async () => {
    let observedHeaders: HeadersInit | undefined;
    const minimal = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      observedHeaders = init?.headers;
      return Response.json({ message: { title: ["Title"], DOI: "10.2000/item", issued: { "date-parts": [[2020]] } } });
    });
    await expect(fetchCrossrefWork("10.2000/item", "", minimal)).resolves.toMatchObject({
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
  });
});
