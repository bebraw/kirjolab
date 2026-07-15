import { describe, expect, it } from "vitest";
import {
  assistantOperationDefinition,
  assistantOperationDefinitions,
  assistantTargetScopeLabel,
  resolveAssistantTarget,
  type AssistantTargetScope,
} from "./assistant-operations";

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

  it("keeps every capability contract explicit", () => {
    expect(assistantOperationDefinitions()).toMatchObject([
      {
        id: "revise-selection",
        defaultScope: "sentence",
        scopes: ["sentence", "paragraph", "section"],
        evidence: "required",
        enabled: true,
      },
      { id: "draft-claim", defaultScope: null, scopes: [], evidence: "annotations", enabled: true },
      { id: "clarity-drill", defaultScope: "sentence", scopes: ["sentence", "paragraph", "section"], evidence: "optional", enabled: true },
      { id: "ideate", defaultScope: "section", scopes: ["selection", "paragraph", "section"], evidence: "optional", enabled: true },
      { id: "find-references", defaultScope: "sentence", scopes: ["sentence", "selection", "paragraph"], evidence: "none", enabled: true },
      { id: "build-table", defaultScope: "caret", scopes: ["caret", "selection"], evidence: "optional", enabled: true },
    ]);
    for (const definition of assistantOperationDefinitions()) {
      for (const value of [
        definition.label,
        definition.eyebrow,
        definition.title,
        definition.description,
        definition.instructionLabel,
        definition.defaultInstruction,
        definition.actionLabel,
      ]) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it("labels every target scope", () => {
    const scopes: AssistantTargetScope[] = ["caret", "selection", "sentence", "paragraph", "section"];
    expect(scopes.map(assistantTargetScopeLabel)).toEqual([
      "Insert at caret",
      "Selected text",
      "Sentence at target",
      "Paragraph at target",
      "Section at target",
    ]);
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

  it("resolves preamble and top-level section boundaries", () => {
    const document = "Preamble text.\n\n# One\n\nBody.\n\n## Child\n\nNested.\n\n# Two\n\nEnd.";
    expect(resolveAssistantTarget(document, 3, 3, "section").text).toBe("Preamble text.\n\n");
    const caret = document.indexOf("Body");
    expect(resolveAssistantTarget(document, caret, caret, "section").text).toBe("# One\n\nBody.\n\n## Child\n\nNested.");
  });

  it("returns an empty insertion target at the caret", () => {
    expect(resolveAssistantTarget(source, 8, 8, "caret")).toEqual({ start: 8, end: 8, text: "", scope: "caret" });
  });

  it("clamps invalid offsets", () => {
    expect(resolveAssistantTarget("abc", -4, 99, "sentence")).toEqual({ start: 0, end: 3, text: "abc", scope: "selection" });
  });
});
