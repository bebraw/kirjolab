import { describe, expect, it } from "vitest";
import {
  applyCitationCompletion,
  citationCompletionContext,
  rankCitationCompletionCandidates,
  type CitationCompletionCandidate,
} from "./citation-completions";

const candidates: CitationCompletionCandidate[] = [
  {
    key: "merton1942",
    title: "The Normative Structure of Science",
    authors: ["Robert K. Merton"],
    year: "1942",
    scope: "project",
    referenceId: "one",
  },
  { key: "smith2024", title: "Research Workflows", authors: ["Jane Smith"], year: "2024", scope: "project", referenceId: "two" },
  { key: "merton1968", title: "Social Theory", authors: ["Robert K. Merton"], year: "1968", scope: "library", referenceId: "three" },
];

describe("citation completion", () => {
  it("finds the active token in citation aliases and grouped citations", () => {
    expect(citationCompletionContext(":cite[mer", 9)).toEqual({ query: "mer", start: 6, end: 9 });
    expect(citationCompletionContext(":citet[smith2024, mer]", 21)).toEqual({ query: "mer", start: 18, end: 21 });
    expect(citationCompletionContext(":citep[merton1942]", 13)).toEqual({ query: "merton", start: 7, end: 17 });
    expect(citationCompletionContext(":cite[  mer]", 11)).toEqual({ query: "mer", start: 8, end: 11 });
    expect(citationCompletionContext(":cite[first, ]", 13)).toEqual({ query: "", start: 13, end: 13 });
  });

  it("does not complete outside a citation key or across a line", () => {
    expect(citationCompletionContext("Text mer", 8)).toBeNull();
    expect(citationCompletionContext("::cite[mer", 10)).toBeNull();
    expect(citationCompletionContext(":cite[mer\nnext", 14)).toBeNull();
    expect(citationCompletionContext(":cite[two words", 15)).toBeNull();
    expect(citationCompletionContext(":cite[key]", -4)).toBeNull();
    expect(citationCompletionContext(":cite[key]", 100)).toBeNull();
  });

  it("ranks keys before metadata and project references before library ties", () => {
    expect(rankCitationCompletionCandidates(candidates, "mert").map((candidate) => candidate.key)).toEqual(["merton1942", "merton1968"]);
    expect(rankCitationCompletionCandidates(candidates, "robert").map((candidate) => candidate.key)).toEqual(["merton1942", "merton1968"]);
    expect(rankCitationCompletionCandidates(candidates, "workflow").map((candidate) => candidate.key)).toEqual(["smith2024"]);
    expect(rankCitationCompletionCandidates(candidates, "MERTON1942 ").map((candidate) => candidate.key)).toEqual(["merton1942"]);
    expect(rankCitationCompletionCandidates(candidates, "missing")).toEqual([]);
  });

  it("orders every matching tier and applies the requested result limit", () => {
    const tiered: CitationCompletionCandidate[] = [
      { key: "query", title: "Z", authors: ["Z"], year: "", scope: "library", referenceId: "exact" },
      { key: "query-prefix", title: "Z", authors: ["Z"], year: "", scope: "project", referenceId: "prefix" },
      { key: "has-query-key", title: "Z", authors: ["Z"], year: "", scope: "project", referenceId: "key-contains" },
      { key: "author-start", title: "Z", authors: ["Query Person"], year: "", scope: "project", referenceId: "author-start" },
      { key: "author-contains", title: "Z", authors: ["A Query Person"], year: "", scope: "project", referenceId: "author-contains" },
      { key: "title-start", title: "Query Methods", authors: ["Z"], year: "", scope: "project", referenceId: "title-start" },
      { key: "title-contains", title: "A Query Study", authors: ["Z"], year: "", scope: "project", referenceId: "title-contains" },
    ];
    expect(rankCitationCompletionCandidates(tiered, "query").map((candidate) => candidate.referenceId)).toEqual([
      "exact",
      "prefix",
      "key-contains",
      "author-start",
      "author-contains",
      "title-start",
      "title-contains",
    ]);
    expect(rankCitationCompletionCandidates(tiered, "query", 2).map((candidate) => candidate.referenceId)).toEqual(["exact", "prefix"]);
  });

  it("keeps project results ahead of library ties and sorts equal matches by key", () => {
    const tied: CitationCompletionCandidate[] = [
      { key: "z-key", title: "", authors: [], year: "", scope: "library", referenceId: "library" },
      { key: "b-key", title: "", authors: [], year: "", scope: "project", referenceId: "project-b" },
      { key: "a-key", title: "", authors: [], year: "", scope: "project", referenceId: "project-a" },
      { key: "a-key", title: "", authors: [], year: "", scope: "project", referenceId: "project-a-duplicate" },
    ];
    expect(rankCitationCompletionCandidates(tied, "").map((candidate) => candidate.referenceId)).toEqual([
      "project-a",
      "project-a-duplicate",
      "project-b",
      "library",
    ]);
  });

  it("replaces only the active token", () => {
    const source = ":cite[smith2024, mert]";
    const context = citationCompletionContext(source, 21);
    expect(context && applyCitationCompletion(source, context, "merton1942")).toBe(":cite[smith2024, merton1942]");
    expect(applyCitationCompletion("before :cite[old] after", { query: "old", start: 13, end: 16 }, "new")).toBe("before :cite[new] after");
  });
});
