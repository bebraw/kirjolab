import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { analyzeLatexArchiveFiles, type LatexArchiveFile } from "./latex-import";
import { convertLatexInspection, LatexConversionError } from "./latex-converter";

const tex = (path: string, source: string): LatexArchiveFile => ({ path, kind: "tex", bytes: strToU8(source), text: source });
const bib = (path: string, source: string): LatexArchiveFile => ({ path, kind: "bibtex", bytes: strToU8(source), text: source });

describe("LaTeX conversion", () => {
  it("converts a selected multi-file manuscript into a bounded project seed", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex(
        "_main.tex",
        String.raw`\documentclass{article}
\input{publisher-preamble}
\begin{document}
\input{meta}
\input{sections/introduction}
\bibliography{references/web}
\end{document}`,
      ),
      tex("publisher-preamble.tex", String.raw`\input{missing-package-file}`),
      tex("meta.tex", String.raw`\begin{opening}\title{HTML First}\author{Researcher}\end{opening}`),
      tex(
        "sections/introduction.tex",
        String.raw`\section{Introduction}\label{sec:introduction}
As \citet{one} argues, compare \citep{two, three}. See \autoref{sec:method}.
\begin{enumerate}\item First \item Second\end{enumerate}
Text with \textbf{weight}, \emph{emphasis}, and \footnote{A note}.
\begin{lstlisting}{html}
<p>Hello</p>
\end{lstlisting}`,
      ),
      bib("references/web.bib", "@article{one, title={One}}"),
      bib("unused.bib", "@misc{unused, title={Unused}}"),
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "_main.tex" });

    expect(result.seed.entryPath).toBe("main.md");
    expect(result.seed.files.map((file) => file.path)).toEqual(["main.md", "meta.md", "sections/introduction.md"]);
    expect(result.seed.folders).toEqual(["sections"]);
    expect(result.seed.bibliography).toContain("@article{one");
    expect(result.seed.files[0]?.content).toContain("::include[meta.md]");
    expect(result.seed.files[0]?.content).toContain("::include[sections/introduction.md]");
    expect(result.seed.files[0]?.content).toContain("::bibliography[]");
    expect(result.seed.files[2]?.content).toContain("## Introduction {#sec:introduction}");
    expect(result.seed.files[2]?.content).toContain(":citet[one]");
    expect(result.seed.files[2]?.content).toContain(":citep[two, three]");
    expect(result.seed.files[2]?.content).toContain(":ref[sec:method]");
    expect(result.seed.files[2]?.content).toContain("1. First");
    expect(result.seed.files[2]?.content).toContain("**weight**");
    expect(result.seed.files[2]?.content).toContain("[^latex-1]");
    expect(result.seed.files[2]?.content).toContain("[^latex-1]: A note");
    expect(result.seed.files[2]?.content).toContain("```\n<p>Hello</p>\n```");
    expect(result.report.sourceFiles).not.toContain("publisher-preamble.tex");
    expect(result.report.ignoredFiles).toContain("unused.bib");
    expect(result.report.diagnostics).not.toEqual(expect.arrayContaining([expect.objectContaining({ path: "publisher-preamble.tex" })]));
  });

  it("preserves TikZ source and reports that it is not rendered", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex(
        "main.tex",
        String.raw`\documentclass{article}\begin{document}
\begin{tikzpicture}
\begin{axis}\addplot coordinates {(0,0) (1,1)};\end{axis}
\end{tikzpicture}
\end{document}`,
      ),
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "main.tex" });

    expect(result.seed.files[0]?.content).toContain("```tikz");
    expect(result.seed.files[0]?.content).toContain("\\begin{axis}");
    expect(result.report.diagnostics).toContainEqual(expect.objectContaining({ code: "tikz-preserved", severity: "info" }));
  });

  it("reports include cycles and keeps the converted files reviewable", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex("main.tex", String.raw`\documentclass{article}\begin{document}\input{part}\end{document}`),
      tex("part.tex", String.raw`Part\input{main}`),
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "main.tex" });

    expect(result.report.diagnostics).toContainEqual(expect.objectContaining({ code: "include-cycle", severity: "error" }));
  });

  it("rejects unavailable root and bibliography selections", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex("main.tex", String.raw`\documentclass{article}\begin{document}\bibliography{refs}\end{document}`),
      bib("refs.bib", "@misc{x, title={X}}"),
    ]);

    expect(() => convertLatexInspection(inspection, { rootPath: "missing.tex" })).toThrow(
      expect.objectContaining<Partial<LatexConversionError>>({ code: "invalid-root-selection" }),
    );
    expect(() => convertLatexInspection(inspection, { rootPath: "main.tex", bibliographyPath: "missing.bib" })).toThrow(
      expect.objectContaining<Partial<LatexConversionError>>({ code: "invalid-bibliography-selection" }),
    );
  });
});
