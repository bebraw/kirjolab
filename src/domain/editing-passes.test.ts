import { describe, expect, it } from "vitest";
import { runEditingPass } from "./editing-passes";

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
    expect(runEditingPass("# Result\n\nThe study reported a result :cite[source].", "evidence")).toEqual([]);
  });
});
