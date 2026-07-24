import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { analyzeLatexArchiveFiles, type LatexArchiveFile } from "./latex-import";
import { convertLatexInspection, LatexConversionError } from "./latex-converter";
import { renderWorkspaceMarkdown } from "./markdown";

const tex = (path: string, source: string): LatexArchiveFile => ({ path, kind: "tex", bytes: strToU8(source), text: source });
const bib = (path: string, source: string): LatexArchiveFile => ({ path, kind: "bibtex", bytes: strToU8(source), text: source });
const image = (path: string, bytes = new Uint8Array([1])): LatexArchiveFile => ({ path, kind: "image", bytes });

const convertSource = (source: string, extras: readonly LatexArchiveFile[] = []) =>
  convertLatexInspection(
    analyzeLatexArchiveFiles([tex("main.tex", String.raw`\documentclass{article}\begin{document}${source}\end{document}`), ...extras]),
    { rootPath: "main.tex" },
  );

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
Text with \textbf{weight}, \emph{emphasis}, and \footnote{A \texttt{nested} note}.
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
    expect(result.seed.files[2]?.content).toContain("[^latex-sections-introduction-1]");
    expect(result.seed.files[2]?.content).toContain("[^latex-sections-introduction-1]: A `nested` note");
    expect(result.seed.files[2]?.content).toContain("```html\n<p>Hello</p>\n```");
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
% retain this authored comment
\begin{axis}
\addplot+[boxplot prepared={median=10, upper quartile=12, lower quartile=8}] coordinates {};
\end{axis}
\end{tikzpicture}
\end{document}`,
      ),
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "main.tex" });

    expect(result.seed.files[0]?.content).toContain("```tikz");
    expect(result.seed.files[0]?.content).toContain("\\begin{axis}");
    expect(result.seed.files[0]?.content).toContain("boxplot prepared={median=10");
    expect(result.seed.files[0]?.content).toContain("% retain this authored comment");
    expect(result.report.diagnostics).toContainEqual(expect.objectContaining({ code: "tikz-preserved", severity: "info" }));
  });

  it("preserves code listings in figures with their language and authored contents", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex(
        "main.tex",
        String.raw`\documentclass{article}\begin{document}
The example at \autoref{fig:summary} based on \cite{mozilladetails2025} illustrates the usage.

\begin{figure}[h]
% https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details
%\begin{minted}{html}
\begin{lstlisting}{html}
<details>
  <summary>What is HTML First?</summary>
  A paradigm that favors the usage of HTML before other
  technologies.
</details>
\end{lstlisting}
%\end{minted}
    \caption{\texttt{details} and \texttt{summary} elements work in tandem to enable foldable containers using pure HTML.}
    %\Description{Details and summary elements work in tandem to enable foldable containers using pure HTML.}
    \label{fig:summary}
\end{figure}
\end{document}`,
      ),
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "main.tex" });
    const markdown = result.seed.files[0]?.content ?? "";

    expect(markdown).toContain(":ref[fig:summary]");
    expect(markdown).toContain(":cite[mozilladetails2025]");
    expect(markdown).toContain(
      "```html\n<details>\n  <summary>What is HTML First?</summary>\n  A paradigm that favors the usage of HTML before other\n  technologies.\n</details>\n```",
    );
    expect(markdown).toContain("`details` and `summary` elements work in tandem");
    expect(markdown).toContain("::anchor[fig:summary]");
    expect(markdown).not.toContain("Description");
    expect(markdown).not.toContain("minted");
  });

  it("recognizes standard listing language options and uses a safe Markdown fence", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex(
        "main.tex",
        String.raw`\documentclass{article}\begin{document}
\begin{lstlisting}[language=JavaScript]
const fence = ${"```"};
\end{lstlisting}
\end{document}`,
      ),
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "main.tex" });

    expect(result.seed.files[0]?.content).toContain("````javascript\nconst fence = ```;\n````");
  });

  it("translates a bounded horizontal prepared boxplot to a native figure", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex(
        "main.tex",
        String.raw`\documentclass{article}\begin{document}
\begin{figure}
\begin{tikzpicture}
\begin{axis}[
xlabel=$Time (ms)$,
ylabel=$Variant$,
yticklabels={SSR -- FCP, Islands -- FCP}
]
\addplot+[boxplot prepared={lower whisker=1613, lower quartile=1627, median=1628, upper quartile=1632, upper whisker=1641}] coordinates {};
\addplot+[boxplot prepared={lower whisker=838, lower quartile=838, median=838, upper quartile=846, upper whisker=858}] coordinates {};
\end{axis}
\end{tikzpicture}
\caption{FCP and SRT behavior across five runs.}
\label{graph:fcp-summary}
\end{figure}
\end{document}`,
      ),
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "main.tex" });
    const markdown = result.seed.files[0]?.content ?? "";

    expect(markdown).toContain(':::figure{#graph:fcp-summary kind="boxplot" version=1 x-label="Time (ms)" y-label="Variant"}');
    expect(markdown).toContain("::box[SSR – FCP]{min=1613 q1=1627 median=1628 q3=1632 max=1641}");
    expect(markdown).toContain("::caption[FCP and SRT behavior across five runs.]");
    expect(markdown.match(/FCP and SRT behavior across five runs\./gu)).toHaveLength(1);
    expect(markdown).not.toContain("```tikz");
    expect(result.report.diagnostics).toContainEqual(expect.objectContaining({ code: "tikz-translated", severity: "info" }));
    expect(result.report.diagnostics).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "tikz-preserved" })]));
    const rendered = renderWorkspaceMarkdown(markdown, "");
    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.html).toContain('<figure id="graph:fcp-summary" class="native-figure native-figure-boxplot"');
  });

  it("does not preserve TikZ disabled by a LaTeX comment environment", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex(
        "main.tex",
        String.raw`\documentclass{article}\begin{document}
\begin{comment}\begin{tikzpicture}\draw (0,0)--(1,1);\end{tikzpicture}\end{comment}
Visible
\end{document}`,
      ),
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "main.tex" });

    expect(result.seed.files[0]?.content).toBe("Visible\n");
    expect(result.report.diagnostics).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "tikz-preserved" })]));
  });

  it("resolves graphic search paths into project assets and relative Markdown links", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const inspection = analyzeLatexArchiveFiles([
      tex(
        "main.tex",
        String.raw`\documentclass{article}\usepackage{graphicx}\graphicspath{{./images/}}\begin{document}\input{sections/result}\end{document}`,
      ),
      tex("sections/result.tex", String.raw`\includegraphics[width=3cm]{plot}`),
      { path: "images/plot.png", kind: "image", bytes: png },
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "main.tex" });

    expect(result.assets).toEqual([{ path: "figures/plot.png", mediaType: "image/png", bytes: png }]);
    expect(result.seed.files[1]?.content).toContain("![Imported figure](../figures/plot.png)");
  });

  it("converts ordinary tabular data and discards LaTeX comment environments", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex(
        "main.tex",
        String.raw`\documentclass{article}\begin{document}
\begin{comment}Hidden draft\end{comment}
\begin{table}\caption{Results}\begin{tabular}{cl}
\toprule Variant & Score \\
\midrule Original & 58 \\
Modified & 90 \\
\bottomrule
\end{tabular}\end{table}
\end{document}`,
      ),
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "main.tex" });
    const markdown = result.seed.files[0]!.content;

    expect(markdown).toContain("| Variant | Score |");
    expect(markdown).toContain("| --- | --- |");
    expect(markdown).toContain("| Modified | 90 |");
    expect(markdown).not.toContain("Hidden draft");
    expect(result.report.diagnostics).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining("tabular") })]),
    );
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

  it("converts every supported inline command, section level, list style, math block, and abstract", () => {
    const result = convertSource(String.raw`
\section*{ First }\label{ sec:first }
\subsection{Second}
\subsubsection{Third}
\paragraph{Fourth}
\begin{abstract} Summary text. \end{abstract}
\begin{itemize}\item[one] Alpha \item Beta\end{itemize}
\begin{enumerate}\item Alpha \item Beta\end{enumerate}
\textbf{bold} \bf{also bold} \textit{italics} \emph{emphasis} \textsl{slanted} \texttt{code}
\citet[page 1]{ a, b } \citep{ c ,, d } \cite{e}
\autoref{ first } \cref{second} \Cref{third} \ref{fourth}
\label{standalone}
\url{ https://example.com/a } \href{https://example.com/b}{ Link }
\[
x + y
\]
\begin{center}\begin{description}Description\end{description}\end{center}
\caption{Caption}\keywords{Keywords}\institute{Institute}\author{Author}\title{Title}\runningtitle{Running title}\runningauthor{Running author}
\maketitle\centering\noindent\medskip\smallskip\bigskip\newpage\clearpage\vfill
Escapes: \% \& \# \_ \$ and \textbackslash{} plus~space.`);
    const markdown = result.seed.files[0]!.content;

    expect(markdown).toContain("## First {#sec:first}");
    expect(markdown).toContain("### Second");
    expect(markdown).toContain("#### Third");
    expect(markdown).toContain("##### Fourth");
    expect(markdown).toContain("## Abstract {#abstract}\n\nSummary text.");
    expect(markdown).toContain("- Alpha\n- Beta");
    expect(markdown).toContain("1. Alpha\n2. Beta");
    expect(markdown).toContain("**bold** **also bold** *italics* *emphasis* *slanted* `code`");
    expect(markdown).toContain(":citet[a, b] :citep[c, d] :cite[e]");
    expect(markdown).toContain(":ref[first] :ref[second] :ref[third] :ref[fourth]");
    expect(markdown).toContain("::anchor[standalone]");
    expect(markdown).toContain("<https://example.com/a> [ Link ](https://example.com/b)");
    expect(markdown).toContain("$$\nx + y\n$$");
    expect(markdown).toContain("Description");
    expect(markdown).toContain("CaptionKeywordsInstituteAuthorTitleRunning titleRunning author");
    expect(markdown).toContain("Escapes: % & # _ $ and \\ plus space.");
    expect(markdown).not.toMatch(/\\(?:maketitle|centering|noindent|medskip|smallskip|bigskip|newpage|clearpage|vfill)/u);
    expect(result.report.diagnostics).toEqual([
      expect.objectContaining({
        code: "unsupported-command",
        message: "Unsupported LaTeX command remains for review: \\textbackslash",
      }),
    ]);
  });

  it("preserves nested command bodies, skips malformed braces, and numbers footnotes across aliases", () => {
    const result = convertSource(String.raw`\textbf{outer \emph{inner \{ brace\}}} \textbf{unclosed
\footnote{ First \texttt{note} } and \footnote[ignored]{Second}.
\unknown{one} then \unknown{two} and \other@command.`);
    const markdown = result.seed.files[0]!.content;

    expect(markdown).toContain("**outer *inner \\{ brace\\}***");
    expect(markdown).toContain(String.raw`\textbf{unclosed`);
    expect(markdown).toContain("[^latex-main-1] and [^latex-main-2]");
    expect(markdown).toContain("[^latex-main-1]: First `note`");
    expect(markdown).toContain("[^latex-main-2]: Second");
    expect(result.report.diagnostics).toEqual([
      {
        code: "unsupported-command",
        severity: "warning",
        path: "main.tex",
        from: expect.any(Number),
        to: expect.any(Number),
        message: "Unsupported LaTeX command remains for review: \\textbf",
      },
      {
        code: "unsupported-command",
        severity: "warning",
        path: "main.tex",
        from: expect.any(Number),
        to: expect.any(Number),
        message: "Unsupported LaTeX command remains for review: \\unknown",
      },
      {
        code: "unsupported-command",
        severity: "warning",
        path: "main.tex",
        from: expect.any(Number),
        to: expect.any(Number),
        message: "Unsupported LaTeX command remains for review: \\other@command",
      },
    ]);
  });

  it("reduces unknown environments to contents and reports each unique unsupported command once", () => {
    const result = convertSource(String.raw`before
\begin{mystery}[option]\foo one \foo two\end{mystery}
\begin{another}\bar\end{another}
after`);

    expect(result.seed.files[0]?.content).toBe("before\n\n[option]\\foo one \\foo two\n\n\\bar\n\nafter\n");
    expect(result.report.diagnostics.map(({ code, message }) => [code, message])).toEqual([
      ["unsupported-environment", "Unsupported LaTeX environment was reduced to its contents: mystery"],
      ["unsupported-environment", "Unsupported LaTeX environment was reduced to its contents: mystery"],
      ["unsupported-environment", "Unsupported LaTeX environment was reduced to its contents: another"],
      ["unsupported-environment", "Unsupported LaTeX environment was reduced to its contents: another"],
      ["unsupported-command", "Unsupported LaTeX command remains for review: \\foo"],
      ["unsupported-command", "Unsupported LaTeX command remains for review: \\bar"],
    ]);
    for (const diagnostic of result.report.diagnostics) {
      expect(diagnostic.path).toBe("main.tex");
      expect(diagnostic.to).toBeGreaterThan(diagnostic.from ?? -1);
    }
  });

  it("converts tabularx arguments, padded rows, escaped pipes, and empty tables", () => {
    const result = convertSource(String.raw`
\begin{tabularx}{\textwidth}{lc}
Name & Value & Note\\[2pt]
Alpha & 1\\
Pipe | value & 2 & spaced   words
\end{tabularx}
\begin{tabular}{c}\toprule\midrule\bottomrule\end{tabular}`);
    const markdown = result.seed.files[0]!.content;

    expect(markdown).toContain("| Name | Value | Note |");
    expect(markdown).toContain("| --- | --- | --- |");
    expect(markdown).toContain("| Alpha | 1 |  |");
    expect(markdown).toContain("| Pipe \\| value | 2 | spaced words |");
    expect(markdown).not.toContain("toprule");
  });

  it.each([
    ["verbatim", "", "", "raw <value>", "```\nraw <value>\n```"],
    ["minted", "", "{TypeScript}", "const value = 1;", "```typescript\nconst value = 1;\n```"],
    ["minted", "[ignored]", "{C++}", "int main() {}", "```c++\nint main() {}\n```"],
    ["lstlisting", "[language={Rust}]", "", "fn main() {}", "```rust\nfn main() {}\n```"],
    ["lstlisting", "[language=not valid!]", "", "source", "```\nsource\n```"],
  ])("converts a %s listing with options %s and positional language %s", (environment, options, positional, body, expected) => {
    const result = convertSource(`\\begin{${environment}}${options}\n${positional}${body}\n\\end{${environment}}`);

    expect(result.seed.files[0]?.content).toBe(`${expected}\n`);
    expect(result.report.diagnostics).toEqual([]);
  });

  it("selects one reachable bibliography automatically and requires a choice among several", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex(
        "main.tex",
        String.raw`\documentclass{article}\bibliography{preamble}\begin{document}\input{chapter}\bibliography{first,second}\end{document}`,
      ),
      tex("chapter.tex", String.raw`\bibliography{chapter}`),
      bib("preamble.bib", "preamble"),
      bib("first.bib", "first"),
      bib("second.bib", "second"),
      bib("chapter.bib", "chapter"),
    ]);

    const unselected = convertLatexInspection(inspection, { rootPath: "main.tex" });
    const selected = convertLatexInspection(inspection, { rootPath: "main.tex", bibliographyPath: "second.bib" });

    expect(unselected.report.bibliographyPath).toBeNull();
    expect(unselected.seed.bibliography).toBe("");
    expect(selected.report.bibliographyPath).toBe("second.bib");
    expect(selected.seed.bibliography).toBe("second");
    expect(selected.report.sourceFiles).toEqual(["main.tex", "chapter.tex"]);
    expect(selected.report.ignoredFiles).toEqual(["preamble.bib", "first.bib", "chapter.bib"]);
    expect(selected.report.diagnostics).toEqual([]);
  });

  it("automatically imports the only reachable bibliography and filters unreachable diagnostics", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex("main.tex", String.raw`\documentclass{article}\begin{document}\input{used}\end{document}`),
      tex("used.tex", String.raw`\bibliography{refs}`),
      tex("unused.tex", String.raw`\input{missing}\bibliography{missing}`),
      bib("refs.bib", "@misc{x, title={X}}"),
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "main.tex" });

    expect(result.report.bibliographyPath).toBe("refs.bib");
    expect(result.seed.bibliography).toBe("@misc{x, title={X}}");
    expect(result.report.sourceFiles).toEqual(["main.tex", "used.tex"]);
    expect(result.report.ignoredFiles).toEqual(["unused.tex"]);
    expect(result.report.diagnostics).toEqual([]);
  });

  it("ignores preamble includes, follows each reachable file once, and reports an exact cycle", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex("main.tex", String.raw`\documentclass{article}\input{preamble}\begin{document}\input{a}\input{a}\end{document}\input{after}`),
      tex("preamble.tex", "preamble"),
      tex("after.tex", "after"),
      tex("a.tex", String.raw`A\input{b}`),
      tex("b.tex", String.raw`B\input{a}`),
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "main.tex" });

    expect(result.report.sourceFiles).toEqual(["main.tex", "a.tex", "b.tex"]);
    expect(result.report.ignoredFiles).toEqual(["preamble.tex", "after.tex"]);
    expect(result.seed.files.map(({ path }) => path)).toEqual(["main.md", "a.md", "b.md"]);
    expect(result.report.diagnostics).toContainEqual({
      code: "include-cycle",
      severity: "error",
      path: "a.tex",
      message: "LaTeX include cycle reaches a.tex",
    });
  });

  it("converts sources without document markers and roots with no closing document marker", () => {
    const plainInspection = {
      ...analyzeLatexArchiveFiles([tex("main.tex", String.raw`\documentclass{article}\begin{document}unused\end{document}`)]),
      rootCandidates: ["main.tex"],
      files: [tex("main.tex", String.raw`\section{Whole source}`)],
    };
    const openInspection = {
      ...analyzeLatexArchiveFiles([tex("main.tex", String.raw`\documentclass{article}\begin{document}Body`)]),
      rootCandidates: ["main.tex"],
    };

    expect(convertLatexInspection(plainInspection, { rootPath: "main.tex" }).seed.files[0]?.content).toBe("## Whole source\n");
    expect(convertLatexInspection(openInspection, { rootPath: "main.tex" }).seed.files[0]?.content).toBe("Body\n");
  });

  it("rejects case-insensitive converted Markdown path collisions with an exact typed error", () => {
    const main = tex("main.tex", String.raw`\documentclass{article}\begin{document}\input{A}\input{a}\end{document}`);
    const upper = tex("A.tex", "Upper");
    const lower = tex("a.TEX", "Lower");
    const inspection = {
      files: [main, upper, lower],
      rootCandidates: ["main.tex"],
      selectedRoot: "main.tex",
      includes: [
        { sourcePath: "main.tex", requestedPath: "A", resolvedPath: "A.tex", from: main.text!.indexOf("\\input{A}"), to: 0 },
        { sourcePath: "main.tex", requestedPath: "a", resolvedPath: "a.TEX", from: main.text!.indexOf("\\input{a}"), to: 0 },
      ],
      bibliographies: [],
      diagnostics: [],
    } as const;

    expect(() => convertLatexInspection(inspection, { rootPath: "main.tex" })).toThrow(
      expect.objectContaining<Partial<LatexConversionError>>({
        name: "LatexConversionError",
        code: "invalid-root-selection",
        message: "Converted Markdown path collides: a.md",
      }),
    );
  });

  it("imports every supported image type, sorts assets, and preserves existing figure folders", () => {
    const extras = [
      image("z.PNG", new Uint8Array([1])),
      image("nested/a.JPEG", new Uint8Array([2])),
      image("b.jpg", new Uint8Array([3])),
      image("c.gif", new Uint8Array([4])),
      image("d.webp", new Uint8Array([5])),
      image("e.avif", new Uint8Array([6])),
      image("figures/f.svg", new Uint8Array([7])),
    ];
    const result = convertSource(
      String.raw`\includegraphics{z.PNG}
\includegraphics{nested/a.JPEG}
\includegraphics{b.jpg}
\includegraphics{c.gif}
\includegraphics{d.webp}
\includegraphics{e.avif}
\includegraphics{figures/f.svg}`,
      extras,
    );

    expect(result.assets.map(({ path, mediaType }) => [path, mediaType])).toEqual([
      ["figures/a.JPEG", "image/jpeg"],
      ["figures/b.jpg", "image/jpeg"],
      ["figures/c.gif", "image/gif"],
      ["figures/d.webp", "image/webp"],
      ["figures/e.avif", "image/avif"],
      ["figures/f.svg", "image/svg+xml"],
      ["figures/z.PNG", "image/png"],
    ]);
    expect(result.seed.files[0]?.content.match(/!\[Imported figure\]/gu)).toHaveLength(7);
    expect(result.report.diagnostics).toEqual([]);
  });

  it("reports missing, unsafe, and ambiguous images with exact source ranges", () => {
    const source = String.raw`\includegraphics{missing}
\includegraphics{/absolute}
\includegraphics{../escape}
\includegraphics{plot}`;
    const result = convertSource(source, [image("plot.png"), image("plot.jpg")]);

    expect(result.seed.files[0]?.content).toContain("[Missing figure: missing]");
    expect(result.seed.files[0]?.content).toContain("[Missing figure: /absolute]");
    expect(result.seed.files[0]?.content).toContain("[Missing figure: ../escape]");
    expect(result.seed.files[0]?.content).toContain("[Missing figure: plot]");
    expect(result.report.diagnostics.map(({ code, message }) => [code, message])).toEqual([
      ["missing-image", "Referenced figure was not found: missing"],
      ["missing-image", "Referenced figure was not found: /absolute"],
      ["missing-image", "Referenced figure was not found: ../escape"],
      ["ambiguous-image", "Referenced figure matches more than one archive file: plot"],
    ]);
    let priorOffset = -1;
    for (const diagnostic of result.report.diagnostics) {
      expect(diagnostic.path).toBe("main.tex");
      expect(diagnostic.from).toBeGreaterThan(priorOffset);
      expect(diagnostic.to).toBeGreaterThan(diagnostic.from ?? -1);
      priorOffset = diagnostic.from ?? priorOffset;
    }
  });

  it("deduplicates identical image destinations and reports differing basename collisions", () => {
    const source = String.raw`\graphicspath{{one/}{two/}}
\includegraphics{one/same.png}
\includegraphics{two/same.png}`;
    const identical = convertSource(source, [image("one/same.png", new Uint8Array([1, 2])), image("two/same.png", new Uint8Array([1, 2]))]);
    const differing = convertSource(source, [image("one/same.png", new Uint8Array([1, 2])), image("two/same.png", new Uint8Array([1, 3]))]);

    expect(identical.assets).toHaveLength(1);
    expect(identical.report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unsupported-command", message: "Unsupported LaTeX command remains for review: \\graphicspath" }),
    );
    expect(differing.assets).toHaveLength(1);
    expect(differing.report.diagnostics).toContainEqual({
      code: "ambiguous-image",
      severity: "warning",
      path: "main.tex",
      message: "Referenced figures collide at project path: figures/same.png",
    });
  });

  it("rejects an imported figure path that collides with converted Markdown", () => {
    const inspection = {
      ...analyzeLatexArchiveFiles([
        tex(
          "main.tex",
          String.raw`\documentclass{article}\begin{document}\input{figures/foo}\includegraphics{figures/foo.md}\end{document}`,
        ),
        tex("figures/foo.tex", "text"),
      ]),
      files: [
        tex(
          "main.tex",
          String.raw`\documentclass{article}\begin{document}\input{figures/foo}\includegraphics{figures/foo.md}\end{document}`,
        ),
        tex("figures/foo.tex", "text"),
        image("figures/foo.md"),
      ],
    };

    expect(() => convertLatexInspection(inspection, { rootPath: "main.tex" })).toThrow(
      expect.objectContaining<Partial<LatexConversionError>>({
        code: "unsupported-environment",
        message: "Figure path collides with converted Markdown: figures/foo.md",
      }),
    );
  });

  it("translates optional boxplot metadata, numeric formats, and default captions", () => {
    const result = convertSource(String.raw`\begin{tikzpicture}
\begin{axis}[boxplot/draw direction=x,xlabel={Latency \& cost},ylabel=$Variant$,title=Benchmark -- result,yticklabels={A -- one,B}]
\addplot+[boxplot prepared={lower whisker=-1.5e2,lower quartile=-.5,median=0.,upper quartile=+2,upper whisker=1e12}] coordinates {};
\addplot+[boxplot prepared={lower whisker=1,lower quartile=2,median=3,upper quartile=4,upper whisker=5}] coordinates {};
\end{axis}
\end{tikzpicture}`);

    expect(result.seed.files[0]?.content).toBe(
      ':::figure{kind="boxplot" version=1 x-label="Latency & cost" y-label="Variant"}\n' +
        "::box[A – one]{min=-150 q1=-0.5 median=0 q3=2 max=1000000000000}\n" +
        "::box[B]{min=1 q1=2 median=3 q3=4 max=5}\n" +
        "::caption[Benchmark – result]\n:::\n",
    );
    expect(result.report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "tikz-translated", severity: "info", path: "main.tex" }),
    );
  });

  it.each([
    ["missing axis", String.raw`\draw (0,0)--(1,1);`],
    [
      "vertical direction",
      String.raw`\begin{axis}[boxplot/draw direction=y,yticklabels={A}]\addplot+[boxplot prepared={lower whisker=1,lower quartile=2,median=3,upper quartile=4,upper whisker=5}] coordinates {};\end{axis}`,
    ],
    [
      "missing labels",
      String.raw`\begin{axis}[xlabel=X]\addplot+[boxplot prepared={lower whisker=1,lower quartile=2,median=3,upper quartile=4,upper whisker=5}] coordinates {};\end{axis}`,
    ],
    [
      "unsafe label",
      String.raw`\begin{axis}[yticklabels={A\command}]\addplot+[boxplot prepared={lower whisker=1,lower quartile=2,median=3,upper quartile=4,upper whisker=5}] coordinates {};\end{axis}`,
    ],
    ["no summaries", String.raw`\begin{axis}[yticklabels={A}]\end{axis}`],
    [
      "label count mismatch",
      String.raw`\begin{axis}[yticklabels={A,B}]\addplot+[boxplot prepared={lower whisker=1,lower quartile=2,median=3,upper quartile=4,upper whisker=5}] coordinates {};\end{axis}`,
    ],
    [
      "missing prepared values",
      String.raw`\begin{axis}[yticklabels={A}]\addplot+[boxplot prepared={lower whisker=1,median=3,upper whisker=5}] coordinates {};\end{axis}`,
    ],
    [
      "invalid number",
      String.raw`\begin{axis}[yticklabels={A}]\addplot+[boxplot prepared={lower whisker=one,lower quartile=2,median=3,upper quartile=4,upper whisker=5}] coordinates {};\end{axis}`,
    ],
    [
      "non-finite number",
      String.raw`\begin{axis}[yticklabels={A}]\addplot+[boxplot prepared={lower whisker=1e999,lower quartile=2,median=3,upper quartile=4,upper whisker=5}] coordinates {};\end{axis}`,
    ],
    [
      "out-of-range number",
      String.raw`\begin{axis}[yticklabels={A}]\addplot+[boxplot prepared={lower whisker=-1000000000001,lower quartile=2,median=3,upper quartile=4,upper whisker=5}] coordinates {};\end{axis}`,
    ],
    [
      "unordered summary",
      String.raw`\begin{axis}[yticklabels={A}]\addplot+[boxplot prepared={lower whisker=2,lower quartile=1,median=3,upper quartile=4,upper whisker=5}] coordinates {};\end{axis}`,
    ],
    [
      "unsafe axis text",
      String.raw`\begin{axis}[xlabel={bad " quote},yticklabels={A}]\addplot+[boxplot prepared={lower whisker=1,lower quartile=2,median=3,upper quartile=4,upper whisker=5}] coordinates {};\end{axis}`,
    ],
  ])("preserves a boxplot that cannot be translated: %s", (_reason, tikz) => {
    const result = convertSource(`\\begin{tikzpicture}${tikz}\\end{tikzpicture}`);

    expect(result.seed.files[0]?.content).toContain("```tikz");
    expect(result.report.diagnostics).toContainEqual(expect.objectContaining({ code: "tikz-preserved" }));
    expect(result.report.diagnostics).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "tikz-translated" })]));
  });

  it("translates eligible TikZ blocks individually when a figure contains several", () => {
    const prepared =
      String.raw`\begin{tikzpicture}\begin{axis}[yticklabels={A}]` +
      String.raw`\addplot+[boxplot prepared={lower whisker=1,lower quartile=2,median=3,upper quartile=4,upper whisker=5}] coordinates {};` +
      String.raw`\end{axis}\end{tikzpicture}`;
    const multiple = convertSource(`\\begin{figure}${prepared}${prepared}\\caption{Two}\\end{figure}`);
    const single = convertSource(`\\begin{figure}${prepared}\\caption{ Caption -- safe }\\label{fig:safe}\\end{figure}`);

    expect(multiple.seed.files[0]?.content.match(/:::figure/gu)).toHaveLength(2);
    expect(multiple.report.diagnostics.filter(({ code }) => code === "tikz-translated")).toHaveLength(2);
    expect(multiple.seed.files[0]?.content).toContain("Two");
    expect(single.seed.files[0]?.content).toContain(':::figure{#fig:safe kind="boxplot" version=1}');
    expect(single.seed.files[0]?.content).toContain("::caption[Caption – safe]");
    expect(single.report.diagnostics).toContainEqual(expect.objectContaining({ code: "tikz-translated" }));
  });

  it("falls back to a safe boxplot caption when figure metadata is invalid", () => {
    const prepared =
      String.raw`\begin{tikzpicture}\begin{axis}[yticklabels={A}]` +
      String.raw`\addplot+[boxplot prepared={lower whisker=1,lower quartile=2,median=3,upper quartile=4,upper whisker=5}] coordinates {};` +
      String.raw`\end{axis}\end{tikzpicture}`;
    const result = convertSource(`\\begin{figure}${prepared}\\caption{bad \\ command}\\label{INVALID LABEL}\\end{figure}`);

    expect(result.seed.files[0]?.content).toContain(':::figure{kind="boxplot" version=1}');
    expect(result.seed.files[0]?.content).toContain("::caption[Imported PGFPlots boxplot.]");
  });

  it("rejects oversized and excessive TikZ blocks with exact typed errors", () => {
    const oversized = `\\begin{tikzpicture}${"x".repeat(128 * 1024)}\\end{tikzpicture}`;
    expect(() => convertSource(oversized)).toThrow(
      expect.objectContaining<Partial<LatexConversionError>>({
        name: "LatexConversionError",
        code: "unsupported-environment",
        message: "TikZ block exceeds 128 KiB in main.tex",
      }),
    );

    const excessive = Array.from({ length: 33 }, () => String.raw`\begin{tikzpicture}x\end{tikzpicture}`).join("\n");
    expect(() => convertSource(excessive)).toThrow(
      expect.objectContaining<Partial<LatexConversionError>>({
        code: "unsupported-environment",
        message: "LaTeX import contains more than 32 TikZ blocks",
      }),
    );
  });

  it("accepts the exact TikZ count and byte boundaries", () => {
    const exactCount = Array.from({ length: 32 }, () => String.raw`\begin{tikzpicture}x\end{tikzpicture}`).join("\n");
    const counted = convertSource(exactCount);
    expect(counted.seed.files[0]?.content.match(/```tikz/gu)).toHaveLength(32);
    expect(counted.report.diagnostics.filter(({ code }) => code === "tikz-preserved")).toHaveLength(32);

    const opening = String.raw`\begin{tikzpicture}`;
    const closing = String.raw`\end{tikzpicture}`;
    const exactBytes = `${opening}${"x".repeat(128 * 1024 - opening.length - closing.length)}${closing}`;
    expect(new TextEncoder().encode(exactBytes)).toHaveLength(128 * 1024);
    expect(convertSource(exactBytes).seed.files[0]?.content).toContain("```tikz");
  });

  it("accepts exact boxplot label and caption bounds", () => {
    const prepared =
      String.raw`\begin{tikzpicture}\begin{axis}[yticklabels={A},xlabel={` +
      "x".repeat(120) +
      String.raw`}]\addplot+[boxplot prepared={lower whisker=1,lower quartile=2,median=3,upper quartile=4,upper whisker=5}] coordinates {};\end{axis}\end{tikzpicture}`;
    const caption = "c".repeat(500);
    const accepted = convertSource(`\\begin{figure}${prepared}\\caption{${caption}}\\end{figure}`);
    expect(accepted.seed.files[0]?.content).toContain(`x-label="${"x".repeat(120)}"`);
    expect(accepted.seed.files[0]?.content).toContain(`::caption[${caption}]`);

    const rejectedLabel = convertSource(prepared.replace("x".repeat(120), "x".repeat(121)));
    expect(rejectedLabel.seed.files[0]?.content).toContain("```tikz");
    const rejectedCaption = convertSource(`\\begin{figure}${prepared}\\caption{${"c".repeat(501)}}\\end{figure}`);
    expect(rejectedCaption.seed.files[0]?.content).toContain("::caption[Imported PGFPlots boxplot.]");
  });

  it("builds relative include links and all nested project folders deterministically", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex("root/main.tex", String.raw`\documentclass{article}\begin{document}\input{chapters/one}\input{../shared/two}\end{document}`),
      tex("root/chapters/one.tex", String.raw`\input{../../shared/deep/three}`),
      tex("shared/two.tex", "Two"),
      tex("shared/deep/three.tex", "Three"),
    ]);

    const result = convertLatexInspection(inspection, { rootPath: "root/main.tex" });

    expect(result.seed.entryPath).toBe("main.md");
    expect(result.seed.files.map(({ path }) => path)).toEqual(["main.md", "root/chapters/one.md", "shared/deep/three.md", "shared/two.md"]);
    expect(result.seed.files[0]?.content).toContain("::include[root/chapters/one.md]");
    expect(result.seed.files[0]?.content).toContain("::include[shared/two.md]");
    expect(result.seed.files[1]?.content).toContain("::include[../../shared/deep/three.md]");
    expect(result.seed.folders).toEqual(["root", "root/chapters", "shared", "shared/deep"]);
  });

  it("requires the selected root and bibliography to have the exact archive kinds", () => {
    const root = tex("main.tex", String.raw`\begin{document}\bibliography{notes}\end{document}`);
    const notes = tex("notes.bib", "not actually BibTeX");
    const inspection = {
      files: [root, notes],
      rootCandidates: ["main.tex"],
      selectedRoot: "main.tex",
      includes: [],
      bibliographies: [
        {
          sourcePath: "main.tex",
          requestedPath: "notes",
          resolvedPath: "notes.bib",
          from: root.text!.indexOf("\\bibliography"),
          to: root.text!.length,
        },
      ],
      diagnostics: [],
    } as const;

    expect(() => convertLatexInspection({ ...inspection, files: [bib("main.tex", "not TeX"), notes] }, { rootPath: "main.tex" })).toThrow(
      expect.objectContaining<Partial<LatexConversionError>>({
        code: "invalid-root-selection",
        message: "Selected LaTeX root is unavailable: main.tex",
      }),
    );
    expect(() => convertLatexInspection(inspection, { rootPath: "main.tex", bibliographyPath: "notes.bib" })).toThrow(
      expect.objectContaining<Partial<LatexConversionError>>({
        code: "invalid-bibliography-selection",
        message: "Selected bibliography is unavailable: notes.bib",
      }),
    );
  });

  it("filters setup diagnostics and keeps only reachable source diagnostics", () => {
    const inspection = analyzeLatexArchiveFiles([
      tex("main.tex", String.raw`\documentclass{article}\begin{document}\input{used}\end{document}`),
      tex("used.tex", "Used"),
      tex("unused.tex", "Unused"),
    ]);
    const result = convertLatexInspection(
      {
        ...inspection,
        diagnostics: [
          { code: "ambiguous-root", severity: "warning", message: "setup" },
          { code: "unreferenced-bibliography", severity: "warning", path: "main.tex", message: "setup" },
          { code: "missing-include", severity: "warning", path: "used.tex", message: "reachable" },
          { code: "missing-include", severity: "warning", path: "unused.tex", message: "unreachable" },
          { code: "missing-include", severity: "warning", message: "global" },
        ],
      },
      { rootPath: "main.tex" },
    );

    expect(result.report.diagnostics.map(({ message }) => message)).toEqual(["reachable", "global"]);
  });

  it("rejects backslash image references and resolves explicit relative extensions exactly", () => {
    const result = convertSource(
      String.raw`\includegraphics{folder\plot}
\includegraphics{./plot.png}
\includegraphics{plot}`,
      [image("plot.png", new Uint8Array([1, 2])), image("plot.svg", new Uint8Array([1, 3]))],
    );

    expect(result.assets).toEqual([{ path: "figures/plot.png", mediaType: "image/png", bytes: new Uint8Array([1, 2]) }]);
    expect(result.seed.files[0]?.content).toContain("[Missing figure: folder\\plot]");
    expect(result.seed.files[0]?.content).toContain("![Imported figure](figures/plot.png)");
    expect(result.seed.files[0]?.content).toContain("[Missing figure: plot]");
    expect(result.report.diagnostics.map(({ code }) => code)).toEqual(["missing-image", "ambiguous-image", "unsupported-command"]);
  });

  it("honors escaped comment parity around environments and ordinary text", () => {
    const result = convertSource(String.raw`one \% retained
two \\% removed with the rest
three \\\% retained
\% \begin{comment}not a real environment\end{comment}
visible`);

    expect(result.seed.files[0]?.content).toContain("one % retained");
    expect(result.seed.files[0]?.content).toContain(String.raw`three \\% retained`);
    expect(result.seed.files[0]?.content).toContain("visible");
    expect(result.seed.files[0]?.content).not.toContain("not a real environment");
    expect(result.seed.files[0]?.content).not.toContain("removed with the rest");
  });

  it("translates boxplots with equal boundaries and flexible canonical whitespace", () => {
    const result = convertSource(String.raw`\begin{tikzpicture}
\begin {axis} [ boxplot / draw direction = x, xlabel = X, yticklabels = {Same} ]
\addplot+ [ boxplot prepared = { lower whisker = 1, lower quartile = 1, median = 1, upper quartile = 1, upper whisker = 1 } ] coordinates { } ;
\end{axis}
\end{tikzpicture}`);

    expect(result.seed.files[0]?.content).toBe(
      ':::figure{kind="boxplot" version=1 x-label="X"}\n' +
        "::box[Same]{min=1 q1=1 median=1 q3=1 max=1}\n" +
        "::caption[Imported PGFPlots boxplot.]\n:::\n",
    );
    expect(result.report.diagnostics.map(({ code }) => code)).toEqual(["tikz-translated"]);
  });

  it("handles multi-character spacing and options across structural commands", () => {
    const result = convertSource(String.raw`\bibliographystyle  {plainnat-long}
\addbibresource[location=remote]  {references-long.bib}
\href  {https://example.com/long}  {Long link}
\[x+y\]
\begin  {figure*}[placement=wide]Figure body\end  {figure*}
\begin  {table}[placement=wide]Table body\end  {table}
\begin{tabular}{ccc}
A&B  &   C\\
one & two words & pipe | value
\end{tabular}`);
    const markdown = result.seed.files[0]!.content;

    expect(markdown).toContain("::bibliography[]");
    expect(markdown).toContain("[Long link](https://example.com/long)");
    expect(markdown).toContain("$$\nx+y\n$$");
    expect(markdown).toContain("Figure body");
    expect(markdown).toContain("Table body");
    expect(markdown).toContain("| A | B | C |");
    expect(markdown).toContain("| one | two words | pipe \\| value |");
    expect(markdown).not.toContain("plainnat-long");
    expect(markdown).not.toContain("placement=wide");
  });

  it.each([
    ["quartile above median", "lower whisker=1,lower quartile=3,median=2,upper quartile=4,upper whisker=5"],
    ["median above upper quartile", "lower whisker=1,lower quartile=2,median=4,upper quartile=3,upper whisker=5"],
    ["upper quartile above whisker", "lower whisker=1,lower quartile=2,median=3,upper quartile=5,upper whisker=4"],
    ["numeric prefix", "lower whisker=x1,lower quartile=2,median=3,upper quartile=4,upper whisker=5"],
    ["numeric suffix", "lower whisker=1x,lower quartile=2,median=3,upper quartile=4,upper whisker=5"],
  ])("preserves a prepared boxplot with a strict invalid boundary: %s", (_reason, values) => {
    const result = convertSource(
      String.raw`\begin{tikzpicture}\begin{axis}[yticklabels={A}]` +
        `\\addplot+[boxplot prepared={${values}}] coordinates {};` +
        String.raw`\end{axis}\end{tikzpicture}`,
    );

    expect(result.seed.files[0]?.content).toContain("```tikz");
    expect(result.report.diagnostics.map(({ code }) => code)).toEqual(["tikz-preserved"]);
  });
});
