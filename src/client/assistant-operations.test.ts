import { describe, expect, it } from "vitest";
import { assistantOperationDefinition, assistantOperationDefinitions, resolveAssistantTarget } from "./assistant-operations";

describe("assistant operation registry", () => {
  it("defines each capability once", () => {
    const definitions = assistantOperationDefinitions();
    expect(definitions.map(({ id }) => id)).toEqual([
      "revise-selection",
      "draft-claim",
      "clarity-drill",
      "ideate",
      "find-references",
      "build-table",
    ]);
    expect(new Set(definitions.map(({ id }) => id)).size).toBe(definitions.length);
  });

  it("falls back to revision for an unknown persisted value", () => {
    expect(assistantOperationDefinition("removed-operation").id).toBe("revise-selection");
  });
});

describe("assistant target resolution", () => {
  const source = "# Introduction\n\nFirst claim. Second claim is here!\n\n## Detail\n\nA detail paragraph.\n\n# End\n\nDone.";

  it("always prefers a non-empty selection", () => {
    const start = source.indexOf("First claim");
    const end = start + "First claim".length;
    expect(resolveAssistantTarget(source, start, end, "section")).toEqual({
      start,
      end,
      text: "First claim",
      scope: "selection",
    });
  });

  it("resolves the sentence containing the caret", () => {
    const caret = source.indexOf("Second") + 3;
    const start = source.indexOf("Second");
    const end = source.indexOf("!", start) + 1;
    expect(resolveAssistantTarget(source, caret, caret, "sentence")).toEqual({
      start,
      end,
      text: "Second claim is here!",
      scope: "sentence",
    });
  });

  it("resolves paragraph and nested section boundaries", () => {
    const caret = source.indexOf("detail paragraph");
    expect(resolveAssistantTarget(source, caret, caret, "paragraph").text).toBe("A detail paragraph.");
    expect(resolveAssistantTarget(source, caret, caret, "section").text).toBe("## Detail\n\nA detail paragraph.");
  });

  it("returns an empty insertion target at the caret", () => {
    expect(resolveAssistantTarget(source, 8, 8, "caret")).toEqual({ start: 8, end: 8, text: "", scope: "caret" });
  });

  it("clamps invalid offsets", () => {
    expect(resolveAssistantTarget("abc", -4, 99, "sentence")).toEqual({ start: 0, end: 3, text: "abc", scope: "selection" });
  });
});
