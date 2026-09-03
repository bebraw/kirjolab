import { strToU8 } from "fflate";
import { expect, it } from "vitest";
import { describeOutsideMutation } from "../../test-support/mutation";
import { analyzeLatexArchiveFiles, type LatexArchiveFile } from "./latex-archive";
import {
  LatexConversionError,
  latexMaximumFigureProvenanceCodeUnits,
  latexMaximumListNestingDepth,
  latexMaximumProseProvenanceCodeUnits,
} from "./latex-contracts";
import { convertLatexProject } from "./latex-conversion";

const tex = (path: string, source: string): LatexArchiveFile => ({ path, kind: "tex", bytes: strToU8(source), text: source });

function nestedListSource(depth: number, innermostSuffix = ""): string {
  const nested =
    Array.from({ length: depth }, (_, index) => `\\begin{itemize}\\item Level ${index}.${index === depth - 1 ? innermostSuffix : ""}`).join(
      "",
    ) + "\\end{itemize}".repeat(depth);
  return `\\documentclass{article}\\begin{document}${nested}\\end{document}`;
}

function captureFailure(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describeOutsideMutation("LaTeX provenance limits", () => {
  it("allows prose provenance above the independent figure ceiling", () => {
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", nestedListSource(1_000))]), {
      rootPath: "paper.tex",
    });
    const retainedCodeUnits = conversion.proseBlocks.reduce((total, block) => total + block.source.length + block.text.length, 0);

    expect(retainedCodeUnits).toBeGreaterThan(latexMaximumFigureProvenanceCodeUnits);
    expect(retainedCodeUnits).toBeLessThan(latexMaximumProseProvenanceCodeUnits);
    expect(conversion.proseBlocks).toHaveLength(1_000);
  });

  it("rejects prose provenance above its aggregate ceiling", () => {
    const failure = captureFailure(() =>
      convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", nestedListSource(1_000, "x".repeat(16_000)))]), {
        rootPath: "paper.tex",
      }),
    );

    expect(failure).toBeInstanceOf(LatexConversionError);
    expect(failure).toMatchObject({ code: "provenance-limit" });
  });

  it("rejects excessive list nesting with a typed error before recursive rendering", () => {
    const failure = captureFailure(() =>
      convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", nestedListSource(latexMaximumListNestingDepth + 1))]), {
        rootPath: "paper.tex",
      }),
    );

    expect(failure).toBeInstanceOf(LatexConversionError);
    expect(failure).toMatchObject({ code: "render-limit" });
  });

  it("rejects repeated figure provenance above its aggregate ceiling", () => {
    const references = "\\includegraphics{plot}\n".repeat(1_000);
    const source =
      `\\documentclass{article}\\begin{document}\\begin{figure}${references}` +
      `\\caption{${"c".repeat(1_024)}}\\end{figure}\\end{document}`;
    const image: LatexArchiveFile = {
      path: "plot.png",
      kind: "image",
      bytes: new Uint8Array([137, 80, 78, 71]),
    };
    const failure = captureFailure(() =>
      convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source), image]), { rootPath: "paper.tex" }),
    );

    expect(failure).toBeInstanceOf(LatexConversionError);
    expect(failure).toMatchObject({ code: "provenance-limit" });
  });
});
