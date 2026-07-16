import { describe, expect, it } from "vitest";
import { buildManuscriptMap } from "./manuscript-map";

describe("manuscript map", () => {
  it("summarizes headings, citations, and review cues", () => {
    const map = buildManuscriptMap(
      `# Paper\n\nOpening sentence.\n\n### Results\n\nThe result is supported :cite[paper].\n\nTODO explain the limitation.\n`,
    );
    expect(map.sections).toEqual([
      expect.objectContaining({ level: 1, title: "Paper", citations: 0 }),
      expect.objectContaining({ level: 3, title: "Results", citations: 1 }),
    ]);
    expect(map.cues.map((cue) => cue.kind)).toEqual(["heading-jump", "orphan-paragraph", "placeholder"]);
    expect(map.citations).toBe(1);
  });

  it("ignores comments, front matter, and fenced examples", () => {
    const map = buildManuscriptMap(
      `---\ntitle: TODO\n---\n\n# Real\n\n::: comment\n## Hidden TODO\n:::\n\n\`\`\`md\n### Example TODO\n\`\`\`\n\nDeveloped prose has two sentences. It is intentionally complete.\n`,
    );
    expect(map.sections.map((section) => section.title)).toEqual(["Real"]);
    expect(map.cues).toEqual([]);
  });
});
