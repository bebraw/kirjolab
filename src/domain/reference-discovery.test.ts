import { describe, expect, it } from "vitest";
import { isReferenceDiscoveryResults } from "./reference-discovery";

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
