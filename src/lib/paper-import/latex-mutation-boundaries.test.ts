import { strToU8 } from "fflate";
import { describe, expect, it, vi } from "vitest";

vi.mock("./latex-contracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./latex-contracts")>()),
  latexMaximumFigureProvenanceCodeUnits: 64,
  latexMaximumListNestingDepth: 2,
  latexMaximumProseProvenanceCodeUnits: 1_024,
}));

import { analyzeLatexArchiveFiles, type LatexArchiveFile } from "./latex-archive";
import { convertLatexProject } from "./latex-conversion";

const tex = (source: string): LatexArchiveFile => ({ path: "paper.tex", kind: "tex", bytes: strToU8(source), text: source });

function document(body: string): string {
  return `\\documentclass{article}\\begin{document}${body}\\end{document}`;
}

function convert(source: string, additionalFiles: LatexArchiveFile[] = []) {
  return convertLatexProject(analyzeLatexArchiveFiles([tex(source), ...additionalFiles]), { rootPath: "paper.tex" });
}

function image(path: string): LatexArchiveFile {
  return { path, kind: "image", bytes: new Uint8Array([137, 80, 78, 71]) };
}

describe("LaTeX mutation boundary fixtures", () => {
  it("accepts exact prose provenance and rejects the first larger value", () => {
    expect(convert(document("x".repeat(512))).proseBlocks[0]?.text).toHaveLength(512);
    expect(() => convert(document("x".repeat(513)))).toThrowError(
      expect.objectContaining({
        code: "provenance-limit",
        message: "LaTeX prose provenance exceeds 1024 retained UTF-16 code units",
      }),
    );
  });

  it("accepts exact figure provenance and rejects the first larger reference", () => {
    expect(convert(document("\\begin{figure}\\includegraphics{x}\\end{figure}"), [image("x.png")]).figures).toHaveLength(1);
    expect(() => convert(document("\\begin{figure}\\includegraphics{xx}\\end{figure}"), [image("xx.png")])).toThrowError(
      expect.objectContaining({
        code: "provenance-limit",
        message: "LaTeX figure provenance exceeds 64 retained UTF-16 code units",
      }),
    );
  });

  it("accepts exact list nesting and rejects the first deeper environment", () => {
    const nested = (depth: number) => `${"\\begin{itemize}\\item x".repeat(depth)}${"\\end{itemize}".repeat(depth)}`;

    expect(() => convert(document(nested(2)))).not.toThrow();
    expect(() => convert(document(nested(3)))).toThrowError(
      expect.objectContaining({
        code: "render-limit",
        message: "LaTeX list nesting exceeds 2 environments",
      }),
    );
  });
});
