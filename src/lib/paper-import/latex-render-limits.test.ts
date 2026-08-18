import { describe, expect, it } from "vitest";
import {
  addLatexRenderedFolder,
  addLatexRenderedProjectCodeUnits,
  addLatexRenderedTableLine,
  assertLatexRenderedFileCodeUnits,
} from "./latex-render-limits";

describe("LaTeX render limits", () => {
  it("accepts the exact file, aggregate, table, and derived-folder boundaries", () => {
    expect(() => assertLatexRenderedFileCodeUnits("paper.tex", 5, 5)).not.toThrow();
    expect(addLatexRenderedProjectCodeUnits(2, 3, 5)).toBe(5);
    expect(addLatexRenderedTableLine(2, 3, false, 5)).toBe(5);
    expect(addLatexRenderedFolder({ folders: 1, codeUnits: 2 }, "abc", 2, 5)).toEqual({ folders: 2, codeUnits: 5 });
  });

  it("rejects the first rendered code unit above each output boundary with a stable code", () => {
    expect(() => assertLatexRenderedFileCodeUnits("paper.tex", 6, 5)).toThrowError(
      expect.objectContaining({
        name: "LatexConversionError",
        code: "render-limit",
        message: "Rendered LaTeX file exceeds 5 UTF-16 code units: paper.tex",
      }),
    );
    expect(() => addLatexRenderedProjectCodeUnits(2, 4, 5)).toThrowError(
      expect.objectContaining({
        name: "LatexConversionError",
        code: "render-limit",
        message: "Rendered LaTeX project exceeds 5 UTF-16 code units",
      }),
    );
    expect(() => addLatexRenderedTableLine(2, 4, false, 5)).toThrowError(
      expect.objectContaining({
        name: "LatexConversionError",
        code: "render-limit",
        message: "Rendered LaTeX table exceeds 5 UTF-16 code units",
      }),
    );
  });

  it("aggregates project, table, and derived-folder budgets across additions", () => {
    const projectCodeUnits = addLatexRenderedProjectCodeUnits(0, 2, 5);
    expect(addLatexRenderedProjectCodeUnits(projectCodeUnits, 3, 5)).toBe(5);

    const tableCodeUnits = addLatexRenderedTableLine(1, 2, false, 5);
    expect(addLatexRenderedTableLine(tableCodeUnits, 1, true, 5)).toBe(5);
    expect(() => addLatexRenderedTableLine(2, 3, true, 5)).toThrowError(expect.objectContaining({ code: "render-limit" }));

    const firstFolder = addLatexRenderedFolder({ folders: 0, codeUnits: 0 }, "ab", 2, 4);
    expect(addLatexRenderedFolder(firstFolder, "cd", 2, 4)).toEqual({ folders: 2, codeUnits: 4 });
  });

  it("rejects derived-folder count and code-unit overflow independently", () => {
    expect(() => addLatexRenderedFolder({ folders: 1, codeUnits: 0 }, "a", 1, 10)).toThrowError(
      expect.objectContaining({
        name: "LatexConversionError",
        code: "render-limit",
        message: "Converted project exceeds the derived-folder limit",
      }),
    );
    expect(() => addLatexRenderedFolder({ folders: 0, codeUnits: 1 }, "ab", 10, 2)).toThrowError(
      expect.objectContaining({
        name: "LatexConversionError",
        code: "render-limit",
        message: "Converted project exceeds the derived-folder limit",
      }),
    );
  });
});
