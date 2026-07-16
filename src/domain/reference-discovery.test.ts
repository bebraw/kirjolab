import { describe, expect, it } from "vitest";
import { isReferenceDiscoveryQuery, isReferenceDiscoveryResults, mergeReferenceDiscoveryCandidates } from "./reference-discovery";

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
  };

  it("accepts bounded provider records with DOI identity", () => {
    expect(isReferenceDiscoveryResults([result])).toBe(true);
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
});
