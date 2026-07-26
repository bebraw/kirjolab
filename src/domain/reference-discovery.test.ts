import { describe, expect, it } from "vitest";
import {
  isReferenceDiscoveryQuery,
  isReferenceDiscoveryResults,
  mergeReferenceDiscoveryCandidates,
  referenceDiscoveryCslRecord,
  referenceDiscoveryIdentifierUrl,
  referenceDiscoveryTypes,
  type ReferenceDiscoveryResult,
} from "./reference-discovery";

describe("reference discovery results", () => {
  const result = {
    providers: [{ provider: "crossref", score: 12.5 }],
    identifiers: [{ scheme: "doi", value: "10.1000/example" }],
    metadata: {
      type: "article",
      title: "Inspectable evidence",
      authors: ["Doe, Jane"],
      year: "2026",
      venue: "Research Systems",
      doi: "10.1000/example",
      url: "https://doi.org/10.1000/example",
      abstract: "A verified registry record.",
    },
  } satisfies ReferenceDiscoveryResult;

  it("accepts bounded provider records with DOI identity", () => {
    expect(isReferenceDiscoveryResults([result])).toBe(true);
  });

  it("projects discovered metadata into CSL JSON", () => {
    expect(referenceDiscoveryCslRecord(result)).toEqual({
      id: "10.1000/example",
      type: "article-journal",
      title: "Inspectable evidence",
      author: [{ literal: "Doe, Jane" }],
      URL: "https://doi.org/10.1000/example",
      issued: { "date-parts": [["2026"]] },
      "container-title": "Research Systems",
      DOI: "10.1000/example",
      abstract: "A verified registry record.",
    });
  });

  it("resolves verification URLs for every supported identifier", () => {
    expect(referenceDiscoveryIdentifierUrl({ scheme: "doi", value: "10.1/test" })).toBe("https://doi.org/10.1/test");
    expect(referenceDiscoveryIdentifierUrl({ scheme: "openalex", value: "W1" })).toBe("https://openalex.org/W1");
    expect(referenceDiscoveryIdentifierUrl({ scheme: "semantic-scholar", value: "paper/id" })).toBe(
      "https://www.semanticscholar.org/paper/paper%2Fid",
    );
    expect(referenceDiscoveryIdentifierUrl({ scheme: "arxiv", value: "1234/5" })).toBe("https://arxiv.org/abs/1234%2F5");
    expect(referenceDiscoveryIdentifierUrl({ scheme: "pmid", value: "123" })).toBe("https://pubmed.ncbi.nlm.nih.gov/123/");
  });

  it("rejects invented or incomplete result shapes", () => {
    expect(isReferenceDiscoveryResults([{ ...result, providers: [{ provider: "model", score: null }] }])).toBe(false);
    expect(isReferenceDiscoveryResults([{ ...result, identifiers: [] }])).toBe(false);
    expect(isReferenceDiscoveryResults([{ ...result, providers: [{ provider: "crossref", score: Number.POSITIVE_INFINITY }] }])).toBe(
      false,
    );
    expect(isReferenceDiscoveryResults([{ ...result, metadata: { ...result.metadata, title: "" } }])).toBe(false);
    expect(isReferenceDiscoveryResults(Array.from({ length: 13 }, () => result))).toBe(false);
    expect(isReferenceDiscoveryResults(null)).toBe(false);
  });

  it("validates every collection, provider, identifier, and metadata boundary independently", () => {
    const valid = structuredClone(result);
    const invalid: unknown[] = [
      {},
      [null],
      [{ ...valid, providers: "crossref" }],
      [{ ...valid, providers: [] }],
      [{ ...valid, providers: Array.from({ length: 4 }, () => valid.providers[0]) }],
      [{ ...valid, providers: [null] }],
      [{ ...valid, providers: [{ provider: "crossref", score: "1" }] }],
      [{ ...valid, providers: [{ provider: "crossref", score: Number.NaN }] }],
      [{ ...valid, identifiers: "doi" }],
      [{ ...valid, identifiers: Array.from({ length: 13 }, () => valid.identifiers[0]) }],
      [{ ...valid, identifiers: [null] }],
      [{ ...valid, identifiers: [{ scheme: "isbn", value: "x" }] }],
      [{ ...valid, identifiers: [{ scheme: "doi", value: 1 }] }],
      [{ ...valid, identifiers: [{ scheme: "doi", value: " " }] }],
      [{ ...valid, identifiers: [{ scheme: "doi", value: "x".repeat(501) }] }],
      [{ ...valid, metadata: null }],
      [{ ...valid, metadata: { ...valid.metadata, type: 1 } }],
      [{ ...valid, metadata: { ...valid.metadata, type: "" } }],
      [{ ...valid, metadata: { ...valid.metadata, type: "x".repeat(33) } }],
      [{ ...valid, metadata: { ...valid.metadata, title: 1 } }],
      [{ ...valid, metadata: { ...valid.metadata, title: "x".repeat(2_001) } }],
      [{ ...valid, metadata: { ...valid.metadata, authors: "Doe" } }],
      [{ ...valid, metadata: { ...valid.metadata, authors: Array.from({ length: 101 }, () => "Doe") } }],
      [{ ...valid, metadata: { ...valid.metadata, authors: [""] } }],
      [{ ...valid, metadata: { ...valid.metadata, authors: ["x".repeat(501)] } }],
      [{ ...valid, metadata: { ...valid.metadata, year: "x".repeat(33) } }],
      [{ ...valid, metadata: { ...valid.metadata, venue: "x".repeat(2_001) } }],
      [{ ...valid, metadata: { ...valid.metadata, doi: "x".repeat(501) } }],
      [{ ...valid, metadata: { ...valid.metadata, url: "x".repeat(2_001) } }],
      [{ ...valid, metadata: { ...valid.metadata, abstract: "x".repeat(20_001) } }],
    ];

    for (const value of invalid) expect(isReferenceDiscoveryResults(value), JSON.stringify(value)).toBe(false);
    for (const scheme of ["doi", "openalex", "semantic-scholar", "arxiv", "pmid"] as const) {
      expect(isReferenceDiscoveryResults([{ ...valid, identifiers: [{ scheme, value: "id" }] }])).toBe(true);
    }
  });
});

describe("reference discovery identity", () => {
  const metadata = {
    type: "article",
    title: "Shared work",
    authors: ["Doe, Jane"],
    year: "2026",
    venue: "",
    doi: "10.1000/shared",
    url: "https://doi.org/10.1000/shared",
    abstract: "",
  };

  it("merges provider records transitively by any shared identifier", () => {
    const merged = mergeReferenceDiscoveryCandidates([
      { provider: "crossref", score: 50, identifiers: [{ scheme: "doi", value: "10.1000/shared" }], metadata },
      {
        provider: "openalex",
        score: 80,
        identifiers: [
          { scheme: "doi", value: "10.1000/SHARED" },
          { scheme: "openalex", value: "W123" },
        ],
        metadata: { ...metadata, venue: "Open venue" },
      },
      {
        provider: "semantic-scholar",
        score: null,
        identifiers: [
          { scheme: "openalex", value: "W123" },
          { scheme: "semantic-scholar", value: "paper-123" },
        ],
        metadata: { ...metadata, doi: "", abstract: "Full abstract" },
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      providers: [{ provider: "crossref" }, { provider: "openalex" }, { provider: "semantic-scholar" }],
      metadata: { doi: "10.1000/shared", venue: "Open venue", abstract: "Full abstract" },
    });
    expect(merged[0]?.identifiers).toHaveLength(3);
  });

  it("retains works with a provider identifier and no DOI", () => {
    const merged = mergeReferenceDiscoveryCandidates([
      {
        provider: "openalex",
        score: 20,
        identifiers: [{ scheme: "openalex", value: "W404" }],
        metadata: { ...metadata, doi: "", url: "https://openalex.org/W404" },
      },
    ]);
    expect(isReferenceDiscoveryResults(merged)).toBe(true);
    expect(merged[0]?.metadata.doi).toBe("");
  });

  it("drops unidentified candidates, bounds results, and keeps groups distinct", () => {
    const candidates = Array.from({ length: 14 }, (_, index) => ({
      provider: "openalex" as const,
      score: index,
      identifiers: index === 0 ? [] : [{ scheme: "openalex" as const, value: `W${index}` }],
      metadata: { ...metadata, title: `Work ${index}`, doi: "", url: "" },
    }));

    const merged = mergeReferenceDiscoveryCandidates(candidates);

    expect(merged).toHaveLength(12);
    expect(merged.map(({ identifiers }) => identifiers[0]?.value)).toEqual(Array.from({ length: 12 }, (_, index) => `W${index + 1}`));
  });

  it("merges bridge records across existing groups, deduplicates identifiers, and keeps the best provider score", () => {
    const sparse = { title: "Sparse", authors: [], year: "", venue: "", doi: "", url: "", abstract: "" };
    const rich = { ...metadata, title: "Rich", authors: ["Rich, Rita"], year: "2025", venue: "Venue", abstract: "Abstract" };
    const merged = mergeReferenceDiscoveryCandidates([
      {
        provider: "crossref",
        score: null,
        identifiers: [{ scheme: "doi", value: " 10.1/A " }],
        metadata: sparse,
      },
      {
        provider: "openalex",
        score: 1,
        identifiers: [{ scheme: "openalex", value: "W1" }],
        metadata: { ...sparse, title: "Second" },
      },
      {
        provider: "crossref",
        score: 3,
        identifiers: [
          { scheme: "doi", value: "10.1/a" },
          { scheme: "openalex", value: "w1" },
          { scheme: "doi", value: "10.1/A" },
        ],
        metadata: rich,
      },
    ]);

    expect(merged).toEqual([
      {
        providers: [
          { provider: "crossref", score: 3 },
          { provider: "openalex", score: 1 },
        ],
        identifiers: [
          { scheme: "doi", value: "10.1/A" },
          { scheme: "openalex", value: "W1" },
        ],
        metadata: rich,
      },
    ]);
  });

  it("fills each sparse metadata field from the best available candidate", () => {
    const complete = {
      type: "book",
      title: "Best title",
      authors: [],
      year: "",
      venue: "",
      doi: "",
      url: "",
      abstract: "",
    };
    const fallback = {
      title: "Fallback title",
      authors: ["Doe, Jane"],
      year: "2024",
      venue: "Journal",
      doi: "10.1/x",
      url: "https://example.com",
      abstract: "Abstract",
    };
    const merged = mergeReferenceDiscoveryCandidates([
      { provider: "crossref", score: 2, identifiers: [{ scheme: "doi", value: "10.1/x" }], metadata: complete },
      { provider: "openalex", score: 1, identifiers: [{ scheme: "doi", value: "10.1/x" }], metadata: fallback },
    ]);

    expect(merged[0]?.metadata).toEqual({
      type: "book",
      title: "Fallback title",
      authors: ["Doe, Jane"],
      year: "2024",
      venue: "Journal",
      doi: "10.1/x",
      url: "https://example.com",
      abstract: "Abstract",
    });
  });
});

describe("reference discovery query", () => {
  it("accepts bounded manual search facets", () => {
    expect(isReferenceDiscoveryQuery({ query: "causal inference", author: "Pearl", year: "2009", type: "book" })).toBe(true);
    expect(isReferenceDiscoveryQuery({ query: "causal inference", author: "", year: "", type: "" })).toBe(true);
  });

  it("rejects empty, malformed, or unsupported facets", () => {
    expect(isReferenceDiscoveryQuery({ query: "", author: "", year: "", type: "" })).toBe(false);
    expect(isReferenceDiscoveryQuery({ query: "evidence", author: "", year: "20", type: "" })).toBe(false);
    expect(isReferenceDiscoveryQuery({ query: "evidence", author: "", year: "2026", type: "dataset" })).toBe(false);
  });

  it("validates every query field and exact size boundary", () => {
    const valid = { query: "q", author: "", year: "", type: "" };
    for (const type of referenceDiscoveryTypes) expect(isReferenceDiscoveryQuery({ ...valid, type })).toBe(true);
    for (const value of [
      null,
      [],
      {},
      { ...valid, query: 1 },
      { ...valid, query: " " },
      { ...valid, query: "x".repeat(4_001) },
      { ...valid, author: 1 },
      { ...valid, author: "x".repeat(501) },
      { ...valid, year: 2026 },
      { ...valid, year: "000" },
      { ...valid, year: "20260" },
      { ...valid, year: "abcd" },
      { ...valid, type: 1 },
    ]) {
      expect(isReferenceDiscoveryQuery(value)).toBe(false);
    }
    expect(isReferenceDiscoveryQuery({ ...valid, query: "x".repeat(4_000), author: "x".repeat(500), year: "0000" })).toBe(true);
  });
});
