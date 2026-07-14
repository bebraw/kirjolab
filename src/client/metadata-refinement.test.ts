import { describe, expect, it } from "vitest";
import type { MetadataRefinementCandidate } from "../domain/reference-library";
import { groupMetadataCandidates, metadataFieldValue } from "./metadata-refinement";

const candidate = (provider: MetadataRefinementCandidate["provider"], doi: string, title: string): MetadataRefinementCandidate => ({
  provider,
  match: "doi",
  score: null,
  metadata: { type: "article", title, authors: ["Doe, Jane"], year: "2026", venue: "Journal", doi, url: "", abstract: "" },
  metadataFingerprint: provider[0]!.repeat(64),
});

describe("metadata refinement choices", () => {
  it("groups provider records by normalized DOI without losing provider order", () => {
    const groups = groupMetadataCandidates([
      candidate("openalex", "https://doi.org/10.5555/SHARED", "OpenAlex title"),
      candidate("crossref", "10.5555/shared", "Crossref title"),
      candidate("semantic-scholar", "10.5555/other", "Other work"),
    ]);

    expect(groups.map((group) => [group.doi, group.candidates.map(({ provider }) => provider)])).toEqual([
      ["10.5555/shared", ["openalex", "crossref"]],
      ["10.5555/other", ["semantic-scholar"]],
    ]);
  });

  it("formats scalar and author values consistently for comparison", () => {
    const record = candidate("crossref", "10.5555/shared", "Compared title").metadata;
    expect(metadataFieldValue(record, "title")).toBe("Compared title");
    expect(metadataFieldValue(record, "authors")).toBe("Doe, Jane");
  });
});
