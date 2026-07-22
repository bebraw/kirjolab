import { describe, expect, it } from "vitest";
import { runEditingPass } from "./editing-passes";

const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");

describe("purposeful editing passes", () => {
  it("keeps each pass focused on its stated purpose", () => {
    const source = `# Paper\n\n## Results\n\nThis study shows a material effect across the complete observed sample.\n\n## Methods\n\nTODO describe the setup.\n`;
    expect(runEditingPass(source, "structure").some((cue) => cue.message.includes("placeholder"))).toBe(true);
    expect(runEditingPass(source, "order")).toHaveLength(1);
    expect(runEditingPass(source, "clarity").some((cue) => cue.detail === "implicit opening")).toBe(true);
    expect(runEditingPass(source, "evidence")).toHaveLength(1);
    expect(runEditingPass(source, "length")).toEqual([]);
  });

  it("does not flag research language that has an inline citation", () => {
    expect(runEditingPass("# Result\n\nThe study reported one two three four five :cite[source].", "evidence")).toEqual([]);
  });

  it("preserves structure cue labels", () => {
    expect(runEditingPass("# Paper\n\n### Results\n", "structure")).toContainEqual(
      expect.objectContaining({ message: "Heading jumps from level 1 to 3", detail: "heading jump" }),
    );
  });

  it("flags only sections that move backward in conventional order", () => {
    expect(runEditingPass("## Introduction\n\n## Methods\n\n## Results\n\n## Discussion\n", "order")).toEqual([]);
    expect(runEditingPass("## Background\n\n## Literature Review\n\n## Results\n", "order")).toEqual([]);
    expect(runEditingPass("## Results\n\n## Methods\n", "order")).toEqual([
      expect.objectContaining({
        message: "Review whether “Methods” belongs after “Results”",
        detail: "conventional section order",
      }),
    ]);
  });

  it("uses exact clarity thresholds and requires an implicit opening", () => {
    expect(runEditingPass(words(120), "clarity")).toEqual([]);
    expect(runEditingPass(words(121), "clarity")).toEqual([
      expect.objectContaining({ message: "Review this dense paragraph for one clear theme", detail: "121 words" }),
    ]);
    expect(runEditingPass("A sentence mentions This without opening implicitly.", "clarity")).toEqual([]);
    expect(runEditingPass("These findings need a named subject.", "clarity")).toEqual([
      expect.objectContaining({
        message: "Check whether the opening reference names its subject explicitly",
        detail: "implicit opening",
      }),
    ]);
  });

  it("uses exact evidence thresholds and recognizes research-language variants", () => {
    expect(runEditingPass("The study found one two three four.", "evidence")).toEqual([]);
    expect(runEditingPass("The study found one two three four five.", "evidence")).toEqual([
      expect.objectContaining({
        message: "Review the evidence basis for this assertion",
        detail: "research-language cue without an inline citation",
      }),
    ]);
    expect(runEditingPass("Eight ordinary words make no empirical assertion at all.", "evidence")).toEqual([]);
    for (const statement of [
      "The finding supports one two three four five.",
      "The result supports one two three four five.",
      "The data show one two three four five.",
    ]) {
      expect(runEditingPass(statement, "evidence")).toHaveLength(1);
    }
  });

  it("uses exact section and paragraph length thresholds", () => {
    const sectionAtLimit = `## Results\n\n${Array.from({ length: 6 }, () => words(200)).join("\n\n")}`;
    const sectionOverLimit = `${sectionAtLimit} extra`;
    expect(runEditingPass(sectionAtLimit, "length")).toEqual([]);
    expect(runEditingPass(sectionOverLimit, "length")).toEqual([
      expect.objectContaining({ message: "Review whether “Results” should be divided", detail: "1201 section words" }),
    ]);
    expect(runEditingPass(words(250), "length")).toEqual([]);
    expect(runEditingPass(words(251), "length")).toEqual([
      expect.objectContaining({ message: "Review whether this paragraph should be divided", detail: "251 paragraph words" }),
    ]);
  });
});
