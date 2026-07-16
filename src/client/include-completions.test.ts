import { describe, expect, it } from "vitest";
import { includeCompletionContext, rankIncludeCompletionCandidates, type IncludeCompletionCandidate } from "./include-completions";

const candidates: IncludeCompletionCandidate[] = [
  { reference: "../methods.md", path: "methods.md" },
  { reference: "introduction.md", path: "chapters/introduction.md" },
  { reference: "../appendices/data.md", path: "appendices/data.md" },
];

describe("include completion", () => {
  it("finds incomplete and complete include paths on directive lines", () => {
    expect(includeCompletionContext("::include[int", 13)).toEqual({ query: "int", start: 10, end: 13 });
    expect(includeCompletionContext("  ::include[  int]", 17)).toEqual({ query: "int", start: 14, end: 17 });
    expect(includeCompletionContext("Before\n::include[introduction.md]\n", 27)).toEqual({
      query: "introducti",
      start: 17,
      end: 32,
    });
  });

  it("rejects inline, closed, and multiline include contexts", () => {
    expect(includeCompletionContext("Text ::include[int", 18)).toBeNull();
    expect(includeCompletionContext("::include[int]\nnext", 20)).toBeNull();
    expect(includeCompletionContext("::include[int]", -1)).toBeNull();
    expect(includeCompletionContext("::include[int]", 100)).toBeNull();
  });

  it("ranks relative references before filename and full-path matches", () => {
    expect(rankIncludeCompletionCandidates(candidates, "../").map((candidate) => candidate.reference)).toEqual([
      "../appendices/data.md",
      "../methods.md",
    ]);
    expect(rankIncludeCompletionCandidates(candidates, "intro").map((candidate) => candidate.reference)).toEqual(["introduction.md"]);
    expect(rankIncludeCompletionCandidates(candidates, "data").map((candidate) => candidate.reference)).toEqual(["../appendices/data.md"]);
    expect(rankIncludeCompletionCandidates(candidates, "missing")).toEqual([]);
  });

  it("sorts empty and tied matches and honors a result limit", () => {
    const tied = [
      { reference: "z.md", path: "z.md" },
      { reference: "a.md", path: "z/a.md" },
      { reference: "a.md", path: "a.md" },
    ];
    expect(rankIncludeCompletionCandidates(tied, "").map((candidate) => candidate.path)).toEqual(["a.md", "z/a.md", "z.md"]);
    expect(rankIncludeCompletionCandidates(tied, "", 2).map((candidate) => candidate.path)).toEqual(["a.md", "z/a.md"]);
    expect(rankIncludeCompletionCandidates(tied, " A.MD ").map((candidate) => candidate.path)).toEqual(["a.md", "z/a.md"]);
  });
});
