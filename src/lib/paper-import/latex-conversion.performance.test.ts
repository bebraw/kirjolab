import { strToU8 } from "fflate";
import { expect, it } from "vitest";
import { describeOutsideMutation } from "../../test-support/mutation";
import { analyzeLatexArchiveFiles, latexArchiveMaximumTextBytes, type LatexArchiveFile } from "./latex-archive";
import { LatexConversionError } from "./latex-contracts";
import { convertLatexProject } from "./latex-conversion";

const tex = (path: string, source: string): LatexArchiveFile => ({ path, kind: "tex", bytes: strToU8(source), text: source });

// Stryker's per-expression instrumentation invalidates wall-clock performance
// measurements. The mutation-selected suite keeps small behavioral counterparts
// for each scanner; normal unit and coverage runs execute these near-cap cases.
describeOutsideMutation("product-neutral LaTeX conversion performance regressions", () => {
  it("renders a dense below-cap run of valid simple commands in one pass", () => {
    const commands = "\\textbf{x}".repeat(40_000);
    const source = `\\documentclass{article}\\begin{document}${commands}\\end{document}`;

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });
    expect(conversion.files[0]?.content).toBe(`${"**x**".repeat(40_000)}\n`);
  }, 10_000);

  it("inventories dense adjacent section labels without copying every source suffix", () => {
    const body = `body${"x".repeat(48)}`;
    const sections = Array.from({ length: 20_000 }, (_, index) => {
      const label = index === 0 || index === 19_999 ? `\\label{l${index}}` : "";
      return `\\section{s${index}}${label}\n${body}\n`;
    }).join("");
    const source = `\\documentclass{article}\\begin{document}${sections}\\end{document}`;
    expect(strToU8(source).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });
    expect(conversion.sections).toHaveLength(20_000);
    expect(conversion.sections[0]).toMatchObject({ title: "s0", label: "l0" });
    expect(conversion.sections.at(-1)).toMatchObject({ title: "s19999", label: "l19999" });
    expect(conversion.proseBlocks).toHaveLength(20_000);
  }, 10_000);

  it("preserves a below-cap run of unmatched simple-command openers without unbounded rescanning", () => {
    const malformed = "\\textbf{".repeat(49_000);
    const body = `${malformed}${"x".repeat(1536 * 1024)}`;
    const source = `\\documentclass{article}\\begin{document}${body}\\end{document}`;
    expect(strToU8(source).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.files[0]?.content).toBe(`${body}\n`);
  }, 10_000);

  it("omits below-cap unmatched semantic command groups without rescanning every suffix", () => {
    const malformed = "\\title{".repeat(49_000);
    const source = `\\documentclass{article}${malformed}${"x".repeat(1536 * 1024)}\\begin{document}tail\\end{document}`;
    expect(strToU8(source).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.metadata.title).toBeUndefined();
    expect(conversion.files[0]?.content).toBe("tail\n");
  }, 10_000);

  it("preserves malformed optional command groups after one suffix scan", () => {
    const body = `${"\\textbf[".repeat(49_000)}]${"x".repeat(1650 * 1024)}`;
    const bodySource = `\\documentclass{article}\\begin{document}${body}\\end{document}`;
    expect(strToU8(bodySource).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);
    expect(convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", bodySource)]), { rootPath: "paper.tex" }).files[0]?.content).toBe(
      `${body}\n`,
    );

    const preamble = `${"\\title[".repeat(49_000)}]${"x".repeat(1650 * 1024)}`;
    const preambleSource = `\\documentclass{article}${preamble}\\begin{document}tail\\end{document}`;
    expect(strToU8(preambleSource).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);
    expect(
      convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", preambleSource)]), { rootPath: "paper.tex" }).metadata.title,
    ).toBeUndefined();
  }, 10_000);

  it("bounds malformed renderer cleanup command groups", () => {
    const malformed =
      "\\bibliographystyle{".repeat(8_000) +
      "\\href{".repeat(8_000) +
      "\\section{".repeat(8_000) +
      "\\caption{".repeat(8_000) +
      "\\begin{".repeat(8_000) +
      "x".repeat(1024 * 1024);
    const source = `\\documentclass{article}\\begin{document}${malformed}\\end{document}`;
    expect(strToU8(source).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });
    for (const command of ["bibliographystyle", "href", "section", "caption", "begin"]) {
      expect(conversion.files[0]?.content).toContain(`\\${command}{`);
    }
  }, 10_000);

  it("preserves below-cap unmatched display-math openers with one linear scan", () => {
    const malformed = "\\[".repeat(49_000);
    const body = `${malformed}${"x".repeat(1800 * 1024)}`;
    const source = `\\documentclass{article}\\begin{document}${body}\\end{document}`;
    expect(strToU8(source).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });
    expect(conversion.equations).toEqual([]);
    expect(conversion.files[0]?.content).toBe(`${body}\n`);
  }, 10_000);

  it("filters a near-cap even backslash run before a command without unbounded rescanning", () => {
    const escapedRun = "\\".repeat(1536 * 1024);
    const body = `${escapedRun}cite{inactive}`;
    const source = `\\documentclass{article}\\begin{document}${body}\\end{document}`;
    expect(strToU8(source).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.citations).toEqual([]);
    expect(conversion.files[0]?.content.endsWith("cite{inactive}\n")).toBe(true);
  }, 10_000);

  it("fails repeated enclosing-figure provenance before canonical hashing can amplify it", () => {
    const references = "\\includegraphics{plot}\n".repeat(1_000);
    const source =
      `\\documentclass{article}\\begin{document}\\begin{figure}${references}` +
      `\\caption{${"c".repeat(1_024)}}\\end{figure}\\end{document}`;
    const image: LatexArchiveFile = {
      path: "plot.png",
      kind: "image",
      bytes: new Uint8Array([137, 80, 78, 71]),
    };
    let failure: unknown;

    try {
      convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source), image]), { rootPath: "paper.tex" });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(LatexConversionError);
    expect(failure).toMatchObject({ code: "provenance-limit" });
  }, 10_000);

  it("fails deeply overlapping list provenance before retained source can amplify it", () => {
    const depth = 1_000;
    const nested =
      Array.from(
        { length: depth },
        (_, index) => `\\begin{itemize}\\item Level ${index}.${index === depth - 1 ? "x".repeat(16_000) : ""}`,
      ).join("") + "\\end{itemize}".repeat(depth);
    const source = `\\documentclass{article}\\begin{document}${nested}\\end{document}`;
    let failure: unknown;

    try {
      convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(LatexConversionError);
    expect(failure).toMatchObject({ code: "provenance-limit" });
  }, 10_000);

  it("keeps a near-cap literal block inert during TikZ scanning", () => {
    const malformed = "\\begin{tikzpicture}".repeat(49_000);
    const filler = "x".repeat(1024 * 1024);
    const source =
      `\\documentclass{article}\\begin{document}\\begin{figure}\\begin{lstlisting}${malformed}${filler}` +
      "\\end{lstlisting}\\end{figure}\\end{document}";
    expect(strToU8(source).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });
    expect(conversion.codeBlocks[0]?.value).toBe(`${malformed}${filler}`);
    expect(conversion.diagnostics.filter(({ code }) => code === "unsupported-environment")).toEqual([]);
  }, 10_000);

  it("bounds malformed prepared-boxplot scans across legal TikZ blocks", () => {
    const malformedSummaries = "\\addplot+[".repeat(8_000);
    const tikz =
      "\\begin{tikzpicture}\\begin{axis}[yticklabels={A}]" + `${malformedSummaries}${"x".repeat(40_000)}` + "\\end{axis}\\end{tikzpicture}";
    const body = tikz.repeat(16);
    const source = `\\documentclass{article}\\begin{document}${body}\\end{document}`;
    expect(strToU8(source).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });
    expect(conversion.diagnostics.filter(({ code }) => code === "tikz-preserved")).toHaveLength(16);
    expect(conversion.files[0]?.content.match(/```tikz/gu)).toHaveLength(16);
  }, 10_000);

  it("stops near-cap malformed table, list, and environment option scans", () => {
    const tableBody = `${"\\\\[".repeat(49_000)}${"x".repeat(1800 * 1024)}`;
    const tableSource = `\\documentclass{article}\\begin{document}\\begin{tabular}{c}${tableBody}\\end{tabular}\\end{document}`;
    expect(strToU8(tableSource).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);
    expect(convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", tableSource)]), { rootPath: "paper.tex" }).tables).toHaveLength(
      1,
    );

    const listBody = `${"\\item[".repeat(49_000)}${"x".repeat(1700 * 1024)}`;
    const listSource = `\\documentclass{article}\\begin{document}\\begin{itemize}${listBody}\\end{itemize}\\end{document}`;
    expect(strToU8(listSource).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);
    expect(convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", listSource)]), { rootPath: "paper.tex" }).files[0]?.content).toBe(
      "\n",
    );

    const malformedEnvironments = "\\begin{abstract}[\\end{abstract}".repeat(20_000);
    const environmentSource = `\\documentclass{article}\\begin{document}${malformedEnvironments}\\end{document}`;
    expect(strToU8(environmentSource).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);
    expect(
      convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", environmentSource)]), { rootPath: "paper.tex" }).abstracts,
    ).toEqual([]);
  }, 10_000);

  it("streams a near-cap number of separated code-fence runs", () => {
    const separatedRuns = "`x".repeat(130_000);
    const source = `\\documentclass{article}\\begin{document}\\begin{verbatim}${separatedRuns}\\end{verbatim}\\end{document}`;
    expect(strToU8(source).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);

    expect(convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" }).codeBlocks[0]?.value).toBe(
      separatedRuns,
    );
  }, 10_000);
});
