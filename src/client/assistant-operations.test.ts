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
    expect(
      assistantOperationDefinitions().map(({ label, eyebrow, title, description, instructionLabel, defaultInstruction, actionLabel }) => [
        label,
        eyebrow,
        title,
        description,
        instructionLabel,
        defaultInstruction,
        actionLabel,
      ]),
    ).toEqual([
      [
        "Revise passage",
        "Manuscript target",
        "Draft a reviewable revision",
        "Uses the visible editor target and chosen evidence. Review the exact replacement in Context before applying it.",
        "Revision instruction",
        "Improve clarity while preserving the claim and citation syntax.",
        "Draft revision",
      ],
      [
        "Draft evidence-backed claim",
        "Selected annotations",
        "Draft a reviewable claim",
        "Uses only chosen annotation snapshots. Review the proposition and note in Context before creating a claim.",
        "Research instruction",
        "Draft one precise claim supported by the selected annotations.",
        "Draft claim",
      ],
      [
        "Drill unclear writing",
        "Focused clarification",
        "Clarify one fuzzy claim at a time",
        "Identifies an unclear sentence, asks one focused question, and turns the agreed meaning into a reviewable revision.",
        "Clarity goal",
        "Find the least concrete claim and help me state exactly what I mean.",
        "Start drill",
      ],
      [
        "Ideate",
        "Writing directions",
        "Generate focused possibilities",
        "Produces distinct ideas grounded in the surrounding manuscript; a chosen idea can become a reviewable draft.",
        "Ideation prompt",
        "Suggest concrete directions that deepen the argument without repeating the current text.",
        "Generate ideas",
      ],
      [
        "Find references",
        "Verifiable sources",
        "Find sources for the current claim",
        "Derives a focused query from the manuscript target, then returns records that can be verified before citation.",
        "Search focus",
        "Find primary or authoritative sources that directly support or challenge this claim.",
        "Find references",
      ],
      [
        "Build table or syntax",
        "Structured authoring",
        "Create complex manuscript syntax",
        "Collects structured requirements and produces validated syntax for insertion at the caret or replacement of a selection.",
        "Content guidance",
        "Create a concise table from the structured fields below.",
        "Build syntax",
      ],
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
