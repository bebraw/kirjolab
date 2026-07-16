import { describe, expect, it } from "vitest";
import { isReferenceDiscoveryQuery, isReferenceDiscoveryResults } from "./reference-discovery";

describe("reference discovery results", () => {
  const result = {
    provider: "crossref",
    score: 12.5,
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
    expect(isReferenceDiscoveryResults([{ ...result, provider: "model" }])).toBe(false);
    expect(isReferenceDiscoveryResults([{ ...result, metadata: { ...result.metadata, doi: "" } }])).toBe(false);
    expect(isReferenceDiscoveryResults([{ ...result, score: Number.POSITIVE_INFINITY }])).toBe(false);
    expect(isReferenceDiscoveryResults([{ ...result, metadata: { ...result.metadata, title: "" } }])).toBe(false);
    expect(isReferenceDiscoveryResults(Array.from({ length: 13 }, () => result))).toBe(false);
    expect(isReferenceDiscoveryResults(null)).toBe(false);
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
