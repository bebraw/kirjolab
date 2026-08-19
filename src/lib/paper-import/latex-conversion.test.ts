import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { itOutsideMutation } from "../../test-support/mutation";
import { adaptLatexProjectToSeed } from "../../domain/project/latex-project-adapter";
import { analyzeLatexArchiveFiles, latexArchiveMaximumTextBytes, type LatexArchiveFile } from "./latex-archive";
import {
  latexMaximumRenderedFileCodeUnits,
  latexMaximumRenderedFolders,
  latexMaximumRenderedProjectCodeUnits,
  latexMaximumRenderedTableCodeUnits,
  latexMaximumTableColumns,
  latexMaximumTableRows,
} from "./latex-contracts";
import {
  convertLatexProject,
  defaultLatexConversionOptions,
  latexConversionMaximumSemanticRecords,
  type LatexConversionOptions,
} from "./latex-conversion";
import { renderLatexProject } from "./latex-renderer";

const tex = (path: string, source: string): LatexArchiveFile => ({ path, kind: "tex", bytes: strToU8(source), text: source });
const bib = (path: string, source: string): LatexArchiveFile => ({ path, kind: "bibtex", bytes: strToU8(source), text: source });
const image = (path: string, bytes: Uint8Array): LatexArchiveFile => ({ path, kind: "image", bytes });

function expectOriginalRange(
  item: { readonly source: string; readonly range: { readonly path: string; readonly start: number; readonly end: number } },
  path: string,
  original: string,
  literal: string,
): void {
  const start = original.indexOf(literal);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(item.source).toBe(literal);
  expect(item.range).toMatchObject({ path, start, end: start + literal.length, unit: "utf16-code-unit" });
}

describe("product-neutral LaTeX conversion", () => {
  it("publishes one explicit immutable options value for the current converter", () => {
    const source = String.raw`\documentclass{article}\begin{document}Text.\end{document}`;
    const inspection = analyzeLatexArchiveFiles([tex("paper.tex", source)]);
    const options: LatexConversionOptions = defaultLatexConversionOptions;

    expect(Object.isFrozen(options)).toBe(true);
    expect(options).toEqual({ maximumSemanticRecords: 50_000 });
    expect(convertLatexProject(inspection, { rootPath: "paper.tex" }, options).converterVersion).toBe("latex-converter-v5");
  });

  it("enforces a typed aggregate semantic-record ceiling at and above the consumer boundary", () => {
    const source = String.raw`\documentclass{article}\begin{document}\section{One}\section{Two}\end{document}`;
    const inspection = analyzeLatexArchiveFiles([tex("paper.tex", source)]);

    expect(convertLatexProject(inspection, { rootPath: "paper.tex" }, { maximumSemanticRecords: 5 }).sections).toHaveLength(2);
    expect(() => convertLatexProject(inspection, { rootPath: "paper.tex" }, { maximumSemanticRecords: 4 })).toThrowError(
      expect.objectContaining({ name: "LatexConversionError", code: "semantic-record-limit" }),
    );
    expect(() => convertLatexProject(inspection, { rootPath: "paper.tex" }, { maximumSemanticRecords: 0 })).toThrowError(
      expect.objectContaining({ name: "LatexConversionError", code: "invalid-conversion-options" }),
    );
  });

  it("counts prose blocks against the aggregate semantic-record ceiling", () => {
    const source = String.raw`\documentclass{article}\begin{document}First paragraph.

Second paragraph.\end{document}`;
    const inspection = analyzeLatexArchiveFiles([tex("paper.tex", source)]);

    expect(convertLatexProject(inspection, { rootPath: "paper.tex" }, { maximumSemanticRecords: 5 }).proseBlocks).toHaveLength(2);
    expect(() => convertLatexProject(inspection, { rootPath: "paper.tex" }, { maximumSemanticRecords: 4 })).toThrowError(
      expect.objectContaining({ name: "LatexConversionError", code: "semantic-record-limit" }),
    );
  });

  itOutsideMutation("does not let conversion options loosen the hard semantic-record ceiling", () => {
    const citations = "\\cite{x}".repeat(latexConversionMaximumSemanticRecords + 1);
    const source = `\\documentclass{article}\\begin{document}${citations}\\end{document}`;
    const inspection = analyzeLatexArchiveFiles([tex("paper.tex", source)]);

    expect(() =>
      convertLatexProject(
        inspection,
        { rootPath: "paper.tex" },
        {
          maximumSemanticRecords: latexConversionMaximumSemanticRecords + 1,
        },
      ),
    ).toThrowError(expect.objectContaining({ name: "LatexConversionError", code: "semantic-record-limit" }));
  });

  it("bounds citation keys within one semantic command", () => {
    const atLimit = Array.from({ length: 1_000 }, (_, index) => `k${index}`).join(",");
    const accepted = `\\documentclass{article}\\begin{document}\\cite{${atLimit}}\\end{document}`;
    expect(
      convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", accepted)]), { rootPath: "paper.tex" }).citations[0]?.keys,
    ).toHaveLength(1_000);

    const rejected = `\\documentclass{article}\\begin{document}\\cite{${atLimit},overflow}\\end{document}`;
    expect(() => convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", rejected)]), { rootPath: "paper.tex" })).toThrowError(
      expect.objectContaining({ name: "LatexConversionError", code: "semantic-record-limit" }),
    );
  });

  it("does not inventory a citation introduced by an escaped backslash", () => {
    const source = String.raw`\documentclass{article}\begin{document}\\cite{fake}\end{document}`;
    const inspection = analyzeLatexArchiveFiles([tex("paper.tex", source)]);

    expect(convertLatexProject(inspection, { rootPath: "paper.tex" }).citations).toEqual([]);
  });

  it("applies backslash-run parity to semantic commands and environments without offset drift", () => {
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      "😀 \\cite{single}\r\n" +
      "\\\\cite{escaped}\r\n" +
      "\\\\\\cite{triple}\r\n" +
      "\\\\section{Escaped section}\r\n" +
      "\\section{Active section}\r\n" +
      "\\\\begin{equation}escaped environment\\\\end{equation}\r\n" +
      "\\begin{equation}before\\\\end{equation}after\\end{equation}\r\n" +
      "% \\cite{commented}\r\n" +
      "\\begin{verbatim}\\cite{literal}\\end{verbatim}\r\n" +
      "\\end{document}\r\n";
    const inspection = analyzeLatexArchiveFiles([tex("paper.tex", source)]);

    const conversion = convertLatexProject(inspection, { rootPath: "paper.tex" });

    expect(conversion.citations.map(({ keys }) => keys)).toEqual([["single"], ["triple"]]);
    expect(conversion.sections.map(({ title }) => title)).toEqual(["Active section"]);
    expect(conversion.equations).toHaveLength(1);
    expect(conversion.equations[0]?.value).toContain("before\\\\end{equation}after");
    expectOriginalRange(conversion.citations[0]!, "paper.tex", source, "\\cite{single}");
    expectOriginalRange(conversion.citations[1]!, "paper.tex", source, "\\cite{triple}");
    expect(conversion.files[0]?.content).not.toContain("## Escaped section");
  });

  it("keeps scanning until an active document closer after an escaped closer", () => {
    const body = "Before.\\\\end{document}\r\nAfter \\cite{kept}.";
    const source = `\\documentclass{article}\\begin{document}${body}\\end{document}`;
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.citations.map(({ keys }) => keys)).toEqual([["kept"]]);
    expect(conversion.files[0]?.content).toContain("After :cite[kept].");
  });

  it("counts citation keys against a tightened aggregate semantic ceiling", () => {
    const source = String.raw`\documentclass{article}\begin{document}\cite{a,b,c}\end{document}`;
    const inspection = analyzeLatexArchiveFiles([tex("paper.tex", source)]);

    expect(convertLatexProject(inspection, { rootPath: "paper.tex" }, { maximumSemanticRecords: 7 }).citations[0]?.keys).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(() => convertLatexProject(inspection, { rootPath: "paper.tex" }, { maximumSemanticRecords: 6 })).toThrowError(
      expect.objectContaining({ name: "LatexConversionError", code: "semantic-record-limit" }),
    );
  });

  itOutsideMutation("counts citation keys against the aggregate semantic ceiling", () => {
    const atLimit = Array.from({ length: 1_000 }, (_, index) => `k${index}`).join(",");
    const aggregate = `\\documentclass{article}\\begin{document}${`\\cite{${atLimit}}`.repeat(50)}\\end{document}`;
    expect(() => convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", aggregate)]), { rootPath: "paper.tex" })).toThrowError(
      expect.objectContaining({ name: "LatexConversionError", code: "semantic-record-limit" }),
    );
  });

  it("stops simple-command scanning at the first unmatched group", () => {
    const body = "\\textbf{broken \\textbf{nested}";
    const source = `\\documentclass{article}\\begin{document}${body}\\end{document}`;
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.files[0]?.content).toBe(`${body}\n`);
    expect(conversion.files[0]?.content).not.toContain("**nested**");
    expect(conversion.diagnostics).toContainEqual(
      expect.objectContaining({ code: "unsupported-command", message: "Unsupported LaTeX command remains for review: \\textbf" }),
    );
  });

  it("renders adjacent simple commands without offset drift", () => {
    const commands = "\\textbf{one}\\textbf{two}";
    const source = `\\documentclass{article}\\begin{document}${commands}\\end{document}`;
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.files[0]?.content).toBe("**one****two**\n");
  });

  it("associates adjacent sections with their own labels", () => {
    const sections = "\\section{One}\\label{one}\n\\section{Two}\\label{two}\n";
    const source = `\\documentclass{article}\\begin{document}${sections}\\end{document}`;

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.sections).toEqual([
      expect.objectContaining({ title: "One", label: "one" }),
      expect.objectContaining({ title: "Two", label: "two" }),
    ]);
  });

  it("stops semantic-command scanning at the first unmatched group", () => {
    const source = "\\documentclass{article}\\title{broken \\title{Nested}\\begin{document}tail\\end{document}";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.metadata.title).toBeUndefined();
    expect(conversion.files[0]?.content).toBe("tail\n");
  });

  it("skips command-looking content inside optional groups", () => {
    const body = "\\textbf[\\textbf{nested}]tail";
    const bodySource = `\\documentclass{article}\\begin{document}${body}\\end{document}`;
    expect(convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", bodySource)]), { rootPath: "paper.tex" }).files[0]?.content).toBe(
      `${body}\n`,
    );

    const preamble = "\\title[\\title{Nested}]tail";
    const preambleSource = `\\documentclass{article}${preamble}\\begin{document}tail\\end{document}`;
    expect(
      convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", preambleSource)]), { rootPath: "paper.tex" }).metadata.title,
    ).toBeUndefined();
  });

  it("stops renderer cleanup scanners at the first unmatched group", () => {
    const malformed = "\\bibliographystyle{\\href{\\section{\\caption{\\begin{x";
    const source = `\\documentclass{article}\\begin{document}${malformed}\\end{document}`;

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });
    expect(conversion.files[0]?.content).toContain("\\bibliographystyle{");
    expect(conversion.files[0]?.content).toContain("\\href{");
    expect(conversion.files[0]?.content).toContain("\\section{");
    expect(conversion.files[0]?.content).toContain("\\caption{");
    expect(conversion.files[0]?.content).toContain("\\begin{");
  });

  it("preserves an unmatched display-math opener", () => {
    const body = "before \\[broken";
    const source = `\\documentclass{article}\\begin{document}${body}\\end{document}`;
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.equations).toEqual([]);
    expect(conversion.files[0]?.content).toBe(`${body}\n`);
  });

  it("keeps an unmatched TikZ opener inert inside a literal figure block", () => {
    const literal = "\\begin{tikzpicture}tail";
    const source =
      `\\documentclass{article}\\begin{document}\\begin{figure}\\begin{lstlisting}${literal}` +
      "\\end{lstlisting}\\end{figure}\\end{document}";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.codeBlocks[0]?.value).toBe(literal);
    expect(conversion.diagnostics.filter(({ code }) => code === "unsupported-environment")).toEqual([]);
  });

  it("preserves a legal TikZ block with a malformed prepared boxplot", () => {
    const tikz = "\\begin{tikzpicture}\\begin{axis}[yticklabels={A}]\\addplot+[broken\\end{axis}\\end{tikzpicture}";
    const source = `\\documentclass{article}\\begin{document}${tikz}\\end{document}`;

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.diagnostics.filter(({ code }) => code === "tikz-preserved")).toHaveLength(1);
    expect(conversion.files[0]?.content.match(/```tikz/gu)).toHaveLength(1);
  });

  it("bounds rendered table rows and columns", () => {
    const convertTable = (body: string) => {
      const source = `\\documentclass{article}\\begin{document}\\begin{tabular}{c}${body}\\end{tabular}\\end{document}`;
      expect(strToU8(source).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);
      return convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });
    };
    const acceptedColumns = Array.from({ length: latexMaximumTableColumns }, () => "x").join(" & ");
    expect(convertTable(acceptedColumns).files[0]?.content).toContain("| x | x |");

    const tooManyColumns = `${acceptedColumns} & overflow`;
    expect(() => convertTable(tooManyColumns)).toThrowError(expect.objectContaining({ code: "render-limit" }));

    const tooManyRows = Array.from({ length: latexMaximumTableRows + 1 }, () => "x").join("\\\\");
    expect(() => convertTable(tooManyRows)).toThrowError(expect.objectContaining({ code: "render-limit" }));
  });

  itOutsideMutation("enforces the rendered-table output bound", () => {
    const cell = "x".repeat(Math.ceil(latexMaximumRenderedTableCodeUnits / latexMaximumTableColumns));
    const oversizedRow = Array.from({ length: latexMaximumTableColumns }, () => cell).join("&");
    const source = `\\documentclass{article}\\begin{document}\\begin{tabular}{c}${oversizedRow}\\end{tabular}\\end{document}`;
    expect(strToU8(source).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);
    expect(() => convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" })).toThrowError(
      expect.objectContaining({ code: "render-limit", message: expect.stringContaining(String(latexMaximumRenderedTableCodeUnits)) }),
    );
  });

  it("stops malformed table row options before later delimiters", () => {
    const body = String.raw`A\\[broken B\\C`;
    const source = `\\documentclass{article}\\begin{document}\\begin{tabular}{c}${body}\\end{tabular}\\end{document}`;

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });
    expect(conversion.tables).toHaveLength(1);
    expect(conversion.files[0]?.content).toContain("| A |");
    expect(conversion.files[0]?.content).not.toContain("broken B");
    expect(conversion.files[0]?.content).not.toContain("C");
  });

  it("stops malformed list and environment options", () => {
    const listBody = "\\item Kept\\item[broken \\item Hidden";
    const listSource = `\\documentclass{article}\\begin{document}\\begin{itemize}${listBody}\\end{itemize}\\end{document}`;
    const listConversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", listSource)]), { rootPath: "paper.tex" });
    expect(listConversion.files[0]?.content).toContain("- Kept");
    expect(listConversion.files[0]?.content).not.toContain("Hidden");

    const malformedEnvironments = "\\begin{abstract}[\\end{abstract}\\begin{abstract}Visible\\end{abstract}";
    const environmentSource = `\\documentclass{article}\\begin{document}${malformedEnvironments}\\end{document}`;
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", environmentSource)]), {
      rootPath: "paper.tex",
    });
    expect(conversion.abstracts).toEqual([]);
    expect(conversion.files[0]?.content).not.toContain("## Abstract");
  });

  it("selects a code fence longer than every authored run", () => {
    const separatedRuns = "`x``y```z";
    const accepted = `\\documentclass{article}\\begin{document}\\begin{verbatim}${separatedRuns}\\end{verbatim}\\end{document}`;
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", accepted)]), { rootPath: "paper.tex" });
    expect(conversion.codeBlocks[0]?.value).toBe(separatedRuns);
    expect(conversion.files[0]?.content).toBe(`\`\`\`\`\n${separatedRuns}\n\`\`\`\`\n`);
  });

  itOutsideMutation("enforces the rendered-file output bound", () => {
    const longRun = "`".repeat(1536 * 1024);
    const rejected = `\\documentclass{article}\\begin{document}\\begin{verbatim}${longRun}\\end{verbatim}\\end{document}`;
    expect(strToU8(rejected).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);
    expect(() => convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", rejected)]), { rootPath: "paper.tex" })).toThrowError(
      expect.objectContaining({
        code: "render-limit",
        message: expect.stringContaining(String(latexMaximumRenderedFileCodeUnits)),
      }),
    );
    expect(latexMaximumRenderedProjectCodeUnits).toBeGreaterThan(latexMaximumRenderedFileCodeUnits);
  });

  itOutsideMutation(
    "enforces the aggregate rendered-project bound",
    () => {
      const code = "`".repeat(1200 * 1024);
      const childSource = `\\begin{verbatim}${code}\\end{verbatim}`;
      expect(strToU8(childSource).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);
      const root = `\\documentclass{article}\\begin{document}${Array.from({ length: 5 }, (_, index) => `\\input{child-${index}}`).join(
        "",
      )}\\end{document}`;
      const aggregateFiles = [tex("main.tex", root), ...Array.from({ length: 5 }, (_, index) => tex(`child-${index}.tex`, childSource))];
      expect(() => renderLatexProject(analyzeLatexArchiveFiles(aggregateFiles), { rootPath: "main.tex" })).toThrowError(
        expect.objectContaining({
          code: "render-limit",
          message: expect.stringContaining(String(latexMaximumRenderedProjectCodeUnits)),
        }),
      );
    },
    20_000,
  );

  itOutsideMutation("enforces the aggregate derived-folder bound", () => {
    const directories = Array.from({ length: 16 }, (_, index) => `d${index}`).join("/");
    const paths = Array.from({ length: Math.ceil(latexMaximumRenderedFolders / 16) }, (_, index) => `p${index}/${directories}/child.tex`);
    const folderRoot = `\\documentclass{article}\\begin{document}${paths
      .map((path) => `\\input{${path.replace(/\\.tex$/u, "")}}`)
      .join("")}\\end{document}`;
    expect(strToU8(folderRoot).byteLength).toBeLessThanOrEqual(latexArchiveMaximumTextBytes);
    expect(() =>
      renderLatexProject(analyzeLatexArchiveFiles([tex("main.tex", folderRoot), ...paths.map((path) => tex(path, "x"))]), {
        rootPath: "main.tex",
      }),
    ).toThrowError(expect.objectContaining({ code: "render-limit", message: "Converted project exceeds the derived-folder limit" }));
  });

  it("keeps Kirjolab project policy in a separate seed adapter", () => {
    const source = String.raw`\documentclass{article}\begin{document}\section{Result}Evidence.\end{document}`;
    const inspection = analyzeLatexArchiveFiles([tex("paper.tex", source)]);

    const conversion = convertLatexProject(inspection, { rootPath: "paper.tex" });

    expect(conversion).not.toHaveProperty("seed");
    expect(conversion).not.toHaveProperty("publicationProfile");
    expect(conversion).not.toHaveProperty("report");
    expect(conversion.files).toEqual([
      { sourcePath: "paper.tex", path: "main.md", renderedFormat: "scholarmark-v1", content: "## Result\n\nEvidence.\n" },
    ]);

    const adapted = adaptLatexProjectToSeed(conversion);
    expect(adapted.seed.entryPath).toBe("main.md");
    expect(adapted.seed.files).toEqual([{ path: "main.md", content: "## Result\n\nEvidence.\n" }]);
    expect(adapted.seed.publicationProfile).toEqual({
      citationStyle: "apa",
      locale: "en-US",
      paperSize: "a4",
      submissionTemplate: "article",
    });
  });

  it("inventories the supported paper semantics with exact original UTF-16 ranges", () => {
    const source =
      "\\documentclass{article}\r\n" +
      "\\title{Ångström 😀 study}\r\n" +
      "\\author{Ada Lovelace}\r\n" +
      "\\begin{document}\r\n" +
      "% \\section{Ignored}\r\n" +
      "\\begin{abstract}Résumé 😀.\\end{abstract}\r\n" +
      "\\section{Results}\\label{sec:results}\r\n" +
      "\\subsection{Analysis}\r\n" +
      "Evidence \\citep{doe2026} refers to \\ref{sec:methods}.\\footnote{Exact note.}\r\n" +
      "\\bibliography{refs}\r\n" +
      "\\[x + y\\]\r\n" +
      "\\begin{tabular}{cc}A & B \\\\ 1 & 2\\end{tabular}\r\n" +
      "\\begin{lstlisting}[language=TypeScript]\r\nconst x = 1;\r\n\\end{lstlisting}\r\n" +
      "\\end{document}\r\n";
    const bibliography = "@article{doe2026, title={Evidence}}\r\n";
    const inspection = analyzeLatexArchiveFiles([tex("paper.tex", source), bib("refs.bib", bibliography)]);

    const conversion = convertLatexProject(inspection, { rootPath: "paper.tex", bibliographyPath: "refs.bib" });

    expect(conversion.metadata).toMatchObject({
      title: { value: "Ångström 😀 study" },
      authors: [{ value: "Ada Lovelace" }],
    });
    expect(conversion.abstracts.map(({ value }) => value)).toEqual(["Résumé 😀."]);
    expect(conversion.sections).toEqual([
      expect.objectContaining({ id: "paper.tex#section-1", parentId: null, level: 1, title: "Results", label: "sec:results" }),
      expect.objectContaining({
        id: "paper.tex#section-2",
        parentId: "paper.tex#section-1",
        level: 2,
        title: "Analysis",
      }),
    ]);
    expect(conversion.citations.map(({ mode, keys }) => ({ mode, keys }))).toEqual([{ mode: "parenthetical", keys: ["doe2026"] }]);
    expect(conversion.bibliographyEntries.map(({ type, citationKey }) => ({ type, citationKey }))).toEqual([
      { type: "article", citationKey: "doe2026" },
    ]);
    expect(conversion.labels.map(({ id }) => id)).toEqual(["sec:results"]);
    expect(conversion.references.map(({ target }) => target)).toEqual(["sec:methods"]);
    expect(conversion.equations.map(({ value }) => value)).toEqual(["x + y"]);
    expect(conversion.tables).toHaveLength(1);
    expect(conversion.codeBlocks).toEqual([expect.objectContaining({ language: "typescript", value: "const x = 1;" })]);
    expect(conversion.footnotes.map(({ value }) => value)).toEqual(["Exact note."]);
    expect(conversion.sourceFingerprints.map(({ path }) => path)).toEqual(["paper.tex", "refs.bib"]);
    for (const fingerprint of conversion.sourceFingerprints) expect(fingerprint.sha256).toMatch(/^[a-f0-9]{64}$/u);

    expectOriginalRange(conversion.metadata.title!, "paper.tex", source, "\\title{Ångström 😀 study}");
    expectOriginalRange(conversion.abstracts[0]!, "paper.tex", source, "\\begin{abstract}Résumé 😀.\\end{abstract}");
    expectOriginalRange(conversion.sections[0]!, "paper.tex", source, "\\section{Results}\\label{sec:results}");
    expectOriginalRange(conversion.sections[1]!, "paper.tex", source, "\\subsection{Analysis}");
    expectOriginalRange(conversion.citations[0]!, "paper.tex", source, "\\citep{doe2026}");
    expectOriginalRange(
      conversion.codeBlocks[0]!,
      "paper.tex",
      source,
      "\\begin{lstlisting}[language=TypeScript]\r\nconst x = 1;\r\n\\end{lstlisting}",
    );
    expectOriginalRange(conversion.bibliographyEntries[0]!, "refs.bib", bibliography, "@article{doe2026, title={Evidence}}");

    const originals = new Map([
      ["paper.tex", source],
      ["refs.bib", bibliography],
    ]);
    const ranged = [
      conversion.metadata.title,
      ...conversion.metadata.authors,
      ...conversion.abstracts,
      ...conversion.sections,
      ...conversion.citations,
      ...conversion.bibliographyEntries,
      ...conversion.labels,
      ...conversion.references,
      ...conversion.equations,
      ...conversion.tables,
      ...conversion.codeBlocks,
      ...conversion.footnotes,
    ].filter((value) => value !== undefined);
    for (const item of ranged) {
      expect(item.range.unit).toBe("utf16-code-unit");
      expect(originals.get(item.range.path)?.slice(item.range.start, item.range.end)).toBe(item.source);
    }
  });

  it("inventories ordinary paragraphs before and within a section with exact source ranges", () => {
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      "Lead 😀 paragraph with \\cite{lead}.\r\n\r\n" +
      "\\section{Results}\r\n" +
      "First result line with \\(x + y\\).\r\nContinued result.\r\n\r\n" +
      "Second result paragraph.\r\n" +
      "\\end{document}\r\n";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.proseBlocks).toMatchObject([
      { id: "paper.tex#prose-1", kind: "paragraph", sectionId: null, text: "Lead 😀 paragraph with \\cite{lead}." },
      {
        id: "paper.tex#prose-2",
        kind: "paragraph",
        sectionId: "paper.tex#section-1",
        text: "First result line with \\(x + y\\). Continued result.",
      },
      { id: "paper.tex#prose-3", kind: "paragraph", sectionId: "paper.tex#section-1", text: "Second result paragraph." },
    ]);
    for (const block of conversion.proseBlocks) {
      expect(source.slice(block.range.start, block.range.end)).toBe(block.source);
    }
  });

  it("retains paragraphs with prose before or after display math", () => {
    const paragraphs = ["leading prose \\[x\\]", "\\[y\\] trailing prose."];
    const source = `\\documentclass{article}\\begin{document}${paragraphs.join("\n\n")}\\end{document}`;
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(
      conversion.proseBlocks.map(({ kind, sectionId, text, source: exactSource }) => ({ kind, sectionId, text, source: exactSource })),
    ).toEqual(paragraphs.map((paragraph) => ({ kind: "paragraph", sectionId: null, text: paragraph, source: paragraph })));
  });

  it("uses active par commands as exact paragraph boundaries without splitting escaped commands", () => {
    const source =
      "\\documentclass{article}\\begin{document}" + "First paragraph.\\par\r\nSecond paragraph with \\\\par text." + "\\end{document}";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.proseBlocks.map(({ text, source: exactSource }) => ({ text, source: exactSource }))).toEqual([
      { text: "First paragraph.", source: "First paragraph." },
      { text: "Second paragraph with \\\\par text.", source: "Second paragraph with \\\\par text." },
    ]);
  });

  it("inventories nested standard lists at their own depth with exact source ranges", () => {
    const source =
      "\\documentclass{article}\\begin{document}" +
      "\\begin{itemize}\\item Outer.\\begin{enumerate}\\item Inner.\\end{enumerate}\\item Tail.\\end{itemize}" +
      "\\end{document}";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.proseBlocks.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "list-item", text: "Outer." },
      { kind: "list-item", text: "Inner." },
      { kind: "list-item", text: "Tail." },
    ]);
    for (const block of conversion.proseBlocks) {
      expect(source.slice(block.range.start, block.range.end)).toBe(block.source);
    }
    expect(conversion.files[0]?.content).toBe("- Outer.\n  1. Inner.\n- Tail.\n");
  });

  it("excludes nested figures from list-item retrieval text without changing exact provenance", () => {
    const itemSource =
      "\\item Before 😀.\r\n" +
      "\\begin{figure}\r\n" +
      "\\includegraphics{plot}\r\n" +
      "\\caption{Hidden 😀}\r\n" +
      "\\end{figure}\r\n" +
      "After Å.";
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      `\\begin{itemize}\r\n${itemSource}\r\n\\end{itemize}\r\n` +
      "\\end{document}\r\n";
    const conversion = convertLatexProject(
      analyzeLatexArchiveFiles([tex("paper.tex", source), image("plot.png", new Uint8Array([137, 80, 78, 71]))]),
      { rootPath: "paper.tex" },
    );

    expect(conversion.proseBlocks).toHaveLength(1);
    expect(conversion.proseBlocks[0]).toMatchObject({ kind: "list-item", text: "Before 😀. After Å." });
    expectOriginalRange(conversion.proseBlocks[0]!, "paper.tex", source, itemSource);
    expect(conversion.figures).toHaveLength(1);
    expect(conversion.figures[0]?.caption?.value).toBe("Hidden 😀");
  });

  it("does not traverse includes inside excluded figures as prose or split list-item provenance", () => {
    const itemSource = "\\item Before 😀.\r\n" + "\\begin{figure}\r\n" + "\\input{child}\r\n" + "\\end{figure}\r\n" + "After Å.";
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      `\\begin{itemize}\r\n${itemSource}\r\n\\end{itemize}\r\n` +
      "\\end{document}\r\n";
    const child =
      "Hidden child prose.\r\n" + "\\item Bare phantom item.\r\n" + "\\begin{itemize}\r\n\\item Nested phantom item.\r\n\\end{itemize}\r\n";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source), tex("child.tex", child)]), {
      rootPath: "paper.tex",
    });

    expect(conversion.proseBlocks).toEqual([
      expect.objectContaining({ id: "paper.tex#prose-1", kind: "list-item", text: "Before 😀. After Å." }),
    ]);
    expectOriginalRange(conversion.proseBlocks[0]!, "paper.tex", source, itemSource);
  });

  it("excludes sections inside figures before section and prose traversal", () => {
    const itemSource =
      "\\item Before 😀.\r\n" +
      "\\begin{figure}\r\n" +
      "Hidden figure text.\r\n" +
      "\\section{Hidden}\r\n" +
      "More hidden text.\r\n" +
      "\\end{figure}\r\n" +
      "After Å.";
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      "\\section{Visible}\r\n" +
      `\\begin{itemize}\r\n${itemSource}\r\n\\end{itemize}\r\n` +
      "\\subsection{Tail}\r\nTail prose.\r\n" +
      "\\end{document}\r\n";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.sections.map(({ id, parentId, title }) => ({ id, parentId, title }))).toEqual([
      { id: "paper.tex#section-1", parentId: null, title: "Visible" },
      { id: "paper.tex#section-2", parentId: "paper.tex#section-1", title: "Tail" },
    ]);
    expect(conversion.proseBlocks.map(({ kind, sectionId, text }) => ({ kind, sectionId, text }))).toEqual([
      { kind: "list-item", sectionId: "paper.tex#section-1", text: "Before 😀. After Å." },
      { kind: "paragraph", sectionId: "paper.tex#section-2", text: "Tail prose." },
    ]);
    expectOriginalRange(conversion.proseBlocks[0]!, "paper.tex", source, itemSource);
    expectOriginalRange(conversion.sections[0]!, "paper.tex", source, "\\section{Visible}");
    expectOriginalRange(conversion.sections[1]!, "paper.tex", source, "\\subsection{Tail}");
  });

  it.each([
    ["abstract", ""],
    ["figure", ""],
    ["figure*", ""],
    ["table", ""],
    ["table*", ""],
    ["tabular", "{c}"],
    ["tabularx", "{\\linewidth}{X}"],
    ["lstlisting", ""],
    ["minted", "{text}"],
    ["verbatim", ""],
    ["tikzpicture", ""],
    ["equation", ""],
    ["equation*", ""],
    ["align", ""],
    ["align*", ""],
  ])("does not traverse prose or section events inside the excluded %s environment family", (environment, arguments_) => {
    const itemSource =
      "\\item Before 😀.\r\n" +
      `\\begin{${environment}}${arguments_}\r\n` +
      "\\section{Hidden direct section}\r\n" +
      "\\input{child}\r\n" +
      `\\end{${environment}}\r\n` +
      "After Å.";
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      "\\section{Visible parent}\r\n" +
      `\\begin{itemize}\r\n${itemSource}\r\n\\end{itemize}\r\n` +
      "\\subsection{Visible tail}\r\nTail prose.\r\n" +
      "\\end{document}\r\n";
    const child =
      "\\subsection{Hidden child section}\r\n" +
      "Hidden child prose.\r\n" +
      "\\item Bare phantom item.\r\n" +
      "\\begin{itemize}\r\n\\item Nested phantom item.\r\n\\end{itemize}\r\n" +
      "\\input{grandchild}\r\n";
    const grandchild = "\\subsubsection{Hidden grandchild section}\r\nHidden grandchild prose.\r\n";
    const conversion = convertLatexProject(
      analyzeLatexArchiveFiles([tex("paper.tex", source), tex("child.tex", child), tex("grandchild.tex", grandchild)]),
      { rootPath: "paper.tex" },
    );

    expect(conversion.sections.map(({ id, parentId, title }) => ({ id, parentId, title }))).toEqual([
      { id: "paper.tex#section-1", parentId: null, title: "Visible parent" },
      { id: "paper.tex#section-2", parentId: "paper.tex#section-1", title: "Visible tail" },
    ]);
    expect(conversion.proseBlocks.map(({ kind, sectionId, text }) => ({ kind, sectionId, text }))).toEqual([
      { kind: "list-item", sectionId: "paper.tex#section-1", text: "Before 😀. After Å." },
      { kind: "paragraph", sectionId: "paper.tex#section-2", text: "Tail prose." },
    ]);
    expectOriginalRange(conversion.proseBlocks[0]!, "paper.tex", source, itemSource);
    expectOriginalRange(conversion.sections[0]!, "paper.tex", source, "\\section{Visible parent}");
    expectOriginalRange(conversion.sections[1]!, "paper.tex", source, "\\subsection{Visible tail}");
  });

  it("still visits a child as prose when a visible include follows an excluded include", () => {
    const itemSource = "\\item Before.\r\n" + "\\begin{figure}\r\n\\input{child}\r\n\\end{figure}\r\n" + "After.";
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      `\\begin{itemize}\r\n${itemSource}\r\n\\end{itemize}\r\n` +
      "\\input{child}\r\n" +
      "\\end{document}\r\n";
    const childItemSource = "\\item Visible child item.";
    const child = `Visible child prose.\r\n\r\n\\begin{itemize}\r\n${childItemSource}\r\n\\end{itemize}\r\n`;
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source), tex("child.tex", child)]), {
      rootPath: "paper.tex",
    });

    expect(conversion.proseBlocks.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "list-item", text: "Before. After." },
      { kind: "paragraph", text: "Visible child prose." },
      { kind: "list-item", text: "Visible child item." },
    ]);
    expectOriginalRange(conversion.proseBlocks[0]!, "paper.tex", source, itemSource);
    expectOriginalRange(conversion.proseBlocks[1]!, "child.tex", child, "Visible child prose.");
    expectOriginalRange(conversion.proseBlocks[2]!, "child.tex", child, childItemSource);
  });

  it("omits a cross-file include inside a list item with an exact provenance diagnostic", () => {
    const includeSource = "\\input{child}";
    const itemSource = `\\item Before 😀.${includeSource}After Å.`;
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      `\\begin{itemize}\r\n${itemSource}\r\n\\end{itemize}\r\n` +
      "\\end{document}\r\n";
    const child = "Visible child prose.\r\n";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source), tex("child.tex", child)]), {
      rootPath: "paper.tex",
    });

    expect(conversion.proseBlocks.map(({ kind, text }) => ({ kind, text }))).toEqual([{ kind: "list-item", text: "Before 😀. After Å." }]);
    expectOriginalRange(conversion.proseBlocks[0]!, "paper.tex", source, itemSource);
    expect(conversion.diagnostics).toContainEqual({
      code: "prose-provenance-unavailable",
      severity: "warning",
      message: "Included prose was omitted because a cross-file list-item relationship cannot retain exact provenance",
      sourcePath: "paper.tex",
      range: {
        path: "paper.tex",
        start: source.indexOf(includeSource),
        end: source.indexOf(includeSource) + includeSource.length,
        unit: "utf16-code-unit",
      },
    });
  });

  it("omits visible includes from outer and nested list items without exposing raw item commands", () => {
    const outerInclude = "\\input{child}";
    const nestedInclude = "\\include{child.tex}";
    const nestedItemSource = `\\item[Named] Nested before.${nestedInclude}Nested after.`;
    const outerItemSource =
      `\\item Before 😀.${outerInclude}After Å.\r\n` + `\\begin{enumerate}\r\n${nestedItemSource}\r\n\\end{enumerate}\r\n` + "Outer tail.";
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      "\\section{Visible}\r\n" +
      `\\begin{itemize}\r\n${outerItemSource}\r\n\\end{itemize}\r\n` +
      "\\subsection{Tail}\r\nTail prose.\r\n" +
      "\\end{document}\r\n";
    const child =
      "\\section{Suppressed child section}\r\n" +
      "Visible child prose.\r\n" +
      "\\item Bare child item.\r\n" +
      "\\begin{itemize}\r\n\\item Child list item.\r\n\\end{itemize}\r\n";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source), tex("child.tex", child)]), {
      rootPath: "paper.tex",
    });

    expect(conversion.sections.map(({ id, parentId, title }) => ({ id, parentId, title }))).toEqual([
      { id: "paper.tex#section-1", parentId: null, title: "Visible" },
      { id: "paper.tex#section-2", parentId: "paper.tex#section-1", title: "Tail" },
    ]);
    expect(conversion.proseBlocks.map(({ kind, sectionId, text }) => ({ kind, sectionId, text }))).toEqual([
      { kind: "list-item", sectionId: "paper.tex#section-1", text: "Before 😀. After Å. Outer tail." },
      { kind: "list-item", sectionId: "paper.tex#section-1", text: "Nested before. Nested after." },
      { kind: "paragraph", sectionId: "paper.tex#section-2", text: "Tail prose." },
    ]);
    expect(conversion.proseBlocks.every(({ kind, text }) => kind !== "paragraph" || !text.includes("\\item"))).toBe(true);
    expectOriginalRange(conversion.proseBlocks[0]!, "paper.tex", source, outerItemSource);
    expectOriginalRange(conversion.proseBlocks[1]!, "paper.tex", source, nestedItemSource);
    const expectedDiagnostic = (includeSource: string) => ({
      code: "prose-provenance-unavailable",
      severity: "warning",
      message: "Included prose was omitted because a cross-file list-item relationship cannot retain exact provenance",
      sourcePath: "paper.tex",
      range: {
        path: "paper.tex",
        start: source.indexOf(includeSource),
        end: source.indexOf(includeSource) + includeSource.length,
        unit: "utf16-code-unit",
      },
    });
    expect(conversion.diagnostics).toEqual(expect.arrayContaining([expectedDiagnostic(outerInclude), expectedDiagnostic(nestedInclude)]));
    for (const item of [...conversion.sections, ...conversion.proseBlocks]) {
      expect(source.slice(item.range.start, item.range.end)).toBe(item.source);
    }
  });

  it("defers repeated hidden and list-contained includes until an ordinary visible occurrence", () => {
    const listInclude = "\\input{shared}";
    const itemSource = `\\item Before.${listInclude}After.`;
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      "\\section{Before}\r\n" +
      "\\begin{figure}\\input{shared}\\end{figure}\r\n" +
      `\\begin{itemize}\r\n${itemSource}\r\n\\end{itemize}\r\n` +
      "\\section{Visible}\r\n" +
      "\\input{shared}\r\n" +
      "\\begin{table}\\input{shared}\\end{table}\r\n" +
      "\\end{document}\r\n";
    const childSectionSource = "\\subsection{Child section}";
    const childItemSource = "\\item Child item.";
    const child =
      `Child lead 😀.\r\n\r\n${childSectionSource}\r\nChild section prose.\r\n` +
      `\\begin{itemize}\r\n${childItemSource}\r\n\\end{itemize}\r\n`;
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source), tex("shared.tex", child)]), {
      rootPath: "paper.tex",
    });

    expect(conversion.sections.map(({ id, parentId, title }) => ({ id, parentId, title }))).toEqual([
      { id: "paper.tex#section-1", parentId: null, title: "Before" },
      { id: "paper.tex#section-2", parentId: null, title: "Visible" },
      { id: "shared.tex#section-1", parentId: "paper.tex#section-2", title: "Child section" },
    ]);
    expect(conversion.proseBlocks.map(({ kind, sectionId, text }) => ({ kind, sectionId, text }))).toEqual([
      { kind: "list-item", sectionId: "paper.tex#section-1", text: "Before. After." },
      { kind: "paragraph", sectionId: "paper.tex#section-2", text: "Child lead 😀." },
      { kind: "paragraph", sectionId: "shared.tex#section-1", text: "Child section prose." },
      { kind: "list-item", sectionId: "shared.tex#section-1", text: "Child item." },
    ]);
    expectOriginalRange(conversion.proseBlocks[0]!, "paper.tex", source, itemSource);
    expectOriginalRange(conversion.sections[2]!, "shared.tex", child, childSectionSource);
    expectOriginalRange(conversion.proseBlocks[3]!, "shared.tex", child, childItemSource);
    const originals = new Map([
      ["paper.tex", source],
      ["shared.tex", child],
    ]);
    for (const item of [...conversion.sections, ...conversion.proseBlocks]) {
      expect(originals.get(item.range.path)?.slice(item.range.start, item.range.end)).toBe(item.source);
    }
    const listIncludeStart = source.indexOf(listInclude, source.indexOf("\\begin{itemize}"));
    expect(conversion.diagnostics.filter(({ code }) => code === "prose-provenance-unavailable")).toEqual([
      expect.objectContaining({
        sourcePath: "paper.tex",
        range: expect.objectContaining({ start: listIncludeStart, end: listIncludeStart + listInclude.length }),
      }),
    ]);
  });

  it("filters every section command level inside an excluded environment", () => {
    const source =
      "\\documentclass{article}\\begin{document}" +
      "\\section{Visible}" +
      "\\begin{figure}" +
      "\\section{Hidden section}" +
      "\\subsection*{Hidden subsection}" +
      "\\subsubsection{Hidden subsubsection}" +
      "\\paragraph*{Hidden paragraph}" +
      "\\end{figure}" +
      "\\subsection{Tail}" +
      "Tail prose." +
      "\\end{document}";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.sections.map(({ id, parentId, level, title }) => ({ id, parentId, level, title }))).toEqual([
      { id: "paper.tex#section-1", parentId: null, level: 1, title: "Visible" },
      { id: "paper.tex#section-2", parentId: "paper.tex#section-1", level: 2, title: "Tail" },
    ]);
    expect(conversion.proseBlocks.map(({ kind, sectionId, text }) => ({ kind, sectionId, text }))).toEqual([
      { kind: "paragraph", sectionId: "paper.tex#section-2", text: "Tail prose." },
    ]);
  });

  it("omits paragraph prose containing an orphan item command", () => {
    const itemMarker = "\\item";
    const source =
      "\\documentclass{article}\\begin{document}" + "Lead paragraph.\r\n\r\n" + `${itemMarker} Orphan item text.` + "\\end{document}";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.proseBlocks.map(({ kind, text }) => ({ kind, text }))).toEqual([{ kind: "paragraph", text: "Lead paragraph." }]);
    expect(conversion.diagnostics).toContainEqual({
      code: "prose-provenance-unavailable",
      severity: "warning",
      message: "Ordinary prose was omitted because an item command occurred outside a recognized list",
      sourcePath: "paper.tex",
      range: {
        path: "paper.tex",
        start: source.indexOf(itemMarker),
        end: source.indexOf(itemMarker) + itemMarker.length,
        unit: "utf16-code-unit",
      },
    });
  });

  it("excludes bibliography commands from nested list-item text without changing exact provenance", () => {
    const nestedItemSource = "\\item Inner.\\addbibresource[location=remote]{nested.bib}Tail.";
    const outerItemSource =
      "\\item Before 😀.\\bibliography{refs}After Å.\r\n" +
      `\\begin{enumerate}\r\n${nestedItemSource}\r\n\\end{enumerate}\r\n` +
      "Outer end.\\bibliographystyle{plain}Done.";
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      `\\begin{itemize}\r\n${outerItemSource}\r\n\\end{itemize}\r\n` +
      "\\end{document}\r\n";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.proseBlocks.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "list-item", text: "Before 😀. After Å. Outer end. Done." },
      { kind: "list-item", text: "Inner. Tail." },
    ]);
    expectOriginalRange(conversion.proseBlocks[0]!, "paper.tex", source, outerItemSource);
    expectOriginalRange(conversion.proseBlocks[1]!, "paper.tex", source, nestedItemSource);
  });

  it("excludes multiple nested table, code, and math environments while retaining visible nested items", () => {
    const nestedItemSource = "\\item Nested before.\r\n" + "\\begin{align}\r\nhidden &= nested\r\n\\end{align}\r\n" + "Nested after.";
    const outerItemSource =
      "\\item Visible Ω.\r\n" +
      "\\begin{table}\r\n" +
      "\\begin{itemize}\r\n\\item Hidden table list.\r\n\\end{itemize}\r\n" +
      "\\item Hidden table marker.\r\n" +
      "\\begin{tabular}{c}\r\nHidden table.\r\n\\end{tabular}\r\n" +
      "\\end{table}\r\n" +
      "Between.\r\n" +
      "\\begin{lstlisting}\r\nconst hidden = true;\r\n\\end{lstlisting}\r\n" +
      "\\begin{equation}\r\nhidden = math\r\n\\end{equation}\r\n" +
      `\\begin{enumerate}\r\n${nestedItemSource}\r\n\\end{enumerate}\r\n` +
      "Tail.";
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      `\\begin{itemize}\r\n${outerItemSource}\r\n\\end{itemize}\r\n` +
      "\\end{document}\r\n";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.proseBlocks.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "list-item", text: "Visible Ω. Between. Tail." },
      { kind: "list-item", text: "Nested before. Nested after." },
    ]);
    expectOriginalRange(conversion.proseBlocks[0]!, "paper.tex", source, outerItemSource);
    expectOriginalRange(conversion.proseBlocks[1]!, "paper.tex", source, nestedItemSource);
    expect(conversion.tables.map(({ environment }) => environment)).toEqual(["tabular"]);
    expect(conversion.codeBlocks.map(({ value }) => value)).toEqual(["const hidden = true;"]);
    expect(conversion.equations.map(({ value }) => value)).toEqual(["hidden = math", "hidden &= nested"]);
  });

  it("does not leak prose from an excluded environment that crosses a nested list boundary", () => {
    const source =
      "\\documentclass{article}\\begin{document}" +
      "\\begin{itemize}\\item Outer before." +
      "\\begin{figure}\\begin{enumerate}\\item Hidden inside figure.\\end{figure}" +
      "\\item Visible after figure.\\end{enumerate}" +
      "Outer after.\\end{itemize}" +
      "\\end{document}";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.proseBlocks.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "list-item", text: "Outer before. Outer after." },
      { kind: "list-item", text: "Visible after figure." },
    ]);
    for (const block of conversion.proseBlocks) expect(source.slice(block.range.start, block.range.end)).toBe(block.source);

    const inverseSource =
      "\\documentclass{article}\\begin{document}" +
      "\\begin{itemize}\\item Outer before." +
      "\\begin{enumerate}\\item Visible before figure.\\begin{figure}Hidden figure content.\\end{enumerate}" +
      "\\end{figure}Outer after.\\end{itemize}" +
      "\\end{document}";
    const inverseConversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", inverseSource)]), {
      rootPath: "paper.tex",
    });

    expect(inverseConversion.proseBlocks.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "list-item", text: "Outer before. Outer after." },
      { kind: "list-item", text: "Visible before figure." },
    ]);
    for (const block of inverseConversion.proseBlocks) {
      expect(inverseSource.slice(block.range.start, block.range.end)).toBe(block.source);
    }
  });

  it("renders same-type nested lists without exposing raw item commands", () => {
    const source =
      "\\documentclass{article}\\begin{document}" +
      "\\begin{itemize}\\item Outer.\\begin{itemize}\\item Inner.\\end{itemize}\\item Tail.\\end{itemize}" +
      "\\end{document}";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.files[0]?.content).toBe("- Outer.\n  - Inner.\n- Tail.\n");
  });

  it("preserves section context through includes and inventories list items without literal or comment prose", () => {
    const root =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      "\\section{Methods}\r\nRoot introduction.\r\n\r\n" +
      "\\input{part}\r\n\r\nAfter included section.\r\n" +
      "\\end{document}\r\n";
    const part =
      "Inherited paragraph.\r\n\r\n" +
      "\\begin{itemize}\r\n" +
      "\\item First item with \\cite{one}.\r\n" +
      "\\item[Named] Second item with \\(y\\).\r\n" +
      "\\end{itemize}\r\n\r\n" +
      "\\section{Included results}\r\nIncluded result prose.\r\n\r\n" +
      "% Comment-only text must not become prose.\r\n" +
      "\\begin{verbatim}\r\nLiteral text must not become prose.\r\n\\end{verbatim}\r\n";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("main.tex", root), tex("part.tex", part)]), {
      rootPath: "main.tex",
    });

    expect(conversion.proseBlocks.map(({ id, kind, sectionId, text }) => ({ id, kind, sectionId, text }))).toEqual([
      { id: "main.tex#prose-1", kind: "paragraph", sectionId: "main.tex#section-1", text: "Root introduction." },
      { id: "part.tex#prose-1", kind: "paragraph", sectionId: "main.tex#section-1", text: "Inherited paragraph." },
      {
        id: "part.tex#prose-2",
        kind: "list-item",
        sectionId: "main.tex#section-1",
        text: "First item with \\cite{one}.",
      },
      {
        id: "part.tex#prose-3",
        kind: "list-item",
        sectionId: "main.tex#section-1",
        text: "Second item with \\(y\\).",
      },
      {
        id: "part.tex#prose-4",
        kind: "paragraph",
        sectionId: "part.tex#section-1",
        text: "Included result prose.",
      },
      {
        id: "main.tex#prose-2",
        kind: "paragraph",
        sectionId: "part.tex#section-1",
        text: "After included section.",
      },
    ]);
    for (const block of conversion.proseBlocks) {
      const original = block.range.path === "main.tex" ? root : part;
      expect(original.slice(block.range.start, block.range.end)).toBe(block.source);
    }
    expect(conversion.proseBlocks[2]?.source).toBe("\\item First item with \\cite{one}.");
    expect(conversion.proseBlocks[3]?.source).toBe("\\item[Named] Second item with \\(y\\).");
  });

  it("orders hierarchical sections at include positions while retaining source-local ranges", () => {
    const root =
      "\\documentclass{article}\r\n\\begin{document}\r\n" + "\\section{A}\r\n\\input{child}\r\n\\section{C}\r\n" + "\\end{document}\r\n";
    const child = "\\subsection{B}\r\n";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("main.tex", root), tex("child.tex", child)]), {
      rootPath: "main.tex",
    });

    expect(conversion.sections.map(({ id, parentId, title, range: { path } }) => ({ id, parentId, title, path }))).toEqual([
      { id: "main.tex#section-1", parentId: null, title: "A", path: "main.tex" },
      { id: "child.tex#section-1", parentId: "main.tex#section-1", title: "B", path: "child.tex" },
      { id: "main.tex#section-2", parentId: null, title: "C", path: "main.tex" },
    ]);
    expectOriginalRange(conversion.sections[0]!, "main.tex", root, "\\section{A}");
    expectOriginalRange(conversion.sections[1]!, "child.tex", child, "\\subsection{B}");
    expectOriginalRange(conversion.sections[2]!, "main.tex", root, "\\section{C}");
  });

  it("inventories starred section hierarchy and standard minted languages", () => {
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      "\\section*{Overview}\r\n\\subsection*{Details}\r\n" +
      "\\begin{minted}[linenos]{python}\r\nprint('ok')\r\n\\end{minted}\r\n" +
      "\\begin{lstlisting}{html}\r\n<div>ok</div>\r\n\\end{lstlisting}\r\n" +
      "\\end{document}\r\n";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("main.tex", source)]), { rootPath: "main.tex" });

    expect(conversion.sections.map(({ title, parentId }) => ({ title, parentId }))).toEqual([
      { title: "Overview", parentId: null },
      { title: "Details", parentId: "main.tex#section-1" },
    ]);
    expectOriginalRange(conversion.sections[0]!, "main.tex", source, "\\section*{Overview}");
    expectOriginalRange(conversion.sections[1]!, "main.tex", source, "\\subsection*{Details}");
    expect(conversion.codeBlocks[0]).toMatchObject({ environment: "minted", language: "python", value: "print('ok')" });
    expectOriginalRange(conversion.codeBlocks[0]!, "main.tex", source, "\\begin{minted}[linenos]{python}\r\nprint('ok')\r\n\\end{minted}");
    expect(conversion.codeBlocks[1]).toMatchObject({ environment: "lstlisting", language: "html", value: "<div>ok</div>" });
  });

  it("inventories complete BibTeX entries without commented or nested false positives", () => {
    const source = "\\documentclass{article}\\begin{document}\\bibliography{refs}\\end{document}";
    const bibliography =
      "% @article{commented, title={Ignore}}\r\n" +
      "@article{real, title={Mentions @article{nested, title={Not an entry}}}}\r\n" +
      "@book{second, title={Keep}}\r\n" +
      '@article(quoted, title="A ) character", note={Nested ) brace})\r\n';
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("main.tex", source), bib("refs.bib", bibliography)]), {
      rootPath: "main.tex",
      bibliographyPath: "refs.bib",
    });

    expect(conversion.bibliographyEntries.map(({ type, citationKey }) => ({ type, citationKey }))).toEqual([
      { type: "article", citationKey: "real" },
      { type: "book", citationKey: "second" },
      { type: "article", citationKey: "quoted" },
    ]);
    expectOriginalRange(
      conversion.bibliographyEntries[0]!,
      "refs.bib",
      bibliography,
      "@article{real, title={Mentions @article{nested, title={Not an entry}}}}",
    );
    expectOriginalRange(conversion.bibliographyEntries[1]!, "refs.bib", bibliography, "@book{second, title={Keep}}");
    expectOriginalRange(
      conversion.bibliographyEntries[2]!,
      "refs.bib",
      bibliography,
      '@article(quoted, title="A ) character", note={Nested ) brace})',
    );
  });

  it("keeps literal and TikZ image commands inert while preserving their exact code", () => {
    const listing = "😀 \\includegraphics{code-image}\r\n\\section{Not a section}\r\n\\cite{not-a-citation}";
    const tikz =
      "\\begin{tikzpicture}\r\n" +
      "\\node {\\includegraphics{tikz-image} \\section{Not a TikZ section} \\cite{not-a-tikz-citation}};\r\n" +
      "\\end{tikzpicture}";
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      `\\begin{lstlisting}\r\n${listing}\r\n\\end{lstlisting}\r\n` +
      `${tikz}\r\n` +
      "\\section{Real section}\\cite{real}\r\n\\end{document}\r\n";
    const conversion = convertLatexProject(
      analyzeLatexArchiveFiles([
        tex("main.tex", source),
        image("code-image.png", new Uint8Array([1])),
        image("tikz-image.png", new Uint8Array([2])),
      ]),
      { rootPath: "main.tex" },
    );

    expect(conversion.sections.map(({ title }) => title)).toEqual(["Real section"]);
    expect(conversion.citations.map(({ keys }) => keys)).toEqual([["real"]]);
    expectOriginalRange(conversion.sections[0]!, "main.tex", source, "\\section{Real section}");
    expectOriginalRange(conversion.citations[0]!, "main.tex", source, "\\cite{real}");
    expect(conversion.codeBlocks[0]?.value).toBe(listing);
    expect(conversion.figures).toEqual([]);
    expect(conversion.assets).toEqual([]);
    expect(conversion.files[0]?.content).toContain(listing);
    expect(conversion.files[0]?.content).toContain(tikz);
  });

  it("preserves balanced semantic environments and nested literal markers as exact code", () => {
    const listing =
      "before\n" +
      "\\begin{comment}comment-looking code\\end{comment}\n" +
      "\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\n" +
      "after";
    const minted = "\\begin{lstlisting}\ninner literal marker\n\\end{lstlisting}";
    const source =
      "\\documentclass{article}\\begin{document}\n" +
      `\\begin{lstlisting}\n${listing}\n\\end{lstlisting}\n` +
      `\\begin{minted}{text}\n${minted}\n\\end{minted}\n` +
      "\\end{document}";

    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });

    expect(conversion.codeBlocks).toEqual([
      expect.objectContaining({ environment: "lstlisting", value: listing }),
      expect.objectContaining({ environment: "minted", language: "text", value: minted }),
    ]);
    expect(conversion.files[0]?.content).toBe(`\`\`\`\n${listing}\n\`\`\`\n\n\`\`\`text\n${minted}\n\`\`\`\n`);
  });

  it("keeps an unmatched comment opener inside a literal block inert", () => {
    const source =
      "\\documentclass{article}\\begin{document}\\begin{lstlisting}\n" +
      "\\begin{comment}\ncode\n" +
      "\\end{lstlisting}\n\\section{Visible}\\end{document}";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("main.tex", source)]), { rootPath: "main.tex" });

    expect(conversion.codeBlocks).toEqual([expect.objectContaining({ environment: "lstlisting", value: "\\begin{comment}\ncode" })]);
    expectOriginalRange(conversion.codeBlocks[0]!, "main.tex", source, "\\begin{lstlisting}\n\\begin{comment}\ncode\n\\end{lstlisting}");
    expect(conversion.sections.map(({ title }) => title)).toEqual(["Visible"]);
    expect(conversion.files[0]?.content).toBe("```\n\\begin{comment}\ncode\n```\n\n## Visible\n");
    expect(conversion.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported-environment", message: expect.stringMatching(/comment|lstlisting/u) }),
      ]),
    );
  });

  it("keeps literal-looking environments inside an outer comment inert", () => {
    const source =
      "\\documentclass{article}\\begin{document}" +
      "\\begin{comment}\\begin{lstlisting}\\section{Hidden}\\end{lstlisting}\\end{comment}" +
      "\\section{Visible}\\end{document}";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("main.tex", source)]), { rootPath: "main.tex" });

    expect(conversion.codeBlocks).toEqual([]);
    expect(conversion.sections.map(({ title }) => title)).toEqual(["Visible"]);
    expect(conversion.files[0]?.content).toBe("## Visible\n");
  });

  it("keeps an unmatched literal environment inert through the source tail", () => {
    const tail = "\\begin{lstlisting}\n\\section{Hidden}\n\\begin{comment}\ncode";
    const source = `\\documentclass{article}\\begin{document}${tail}`;
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("main.tex", source)]), { rootPath: "main.tex" });

    expect(conversion.codeBlocks).toEqual([]);
    expect(conversion.sections).toEqual([]);
    expect(conversion.files[0]?.content).toBe(`${tail}\n`);
    expect(conversion.diagnostics).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "unsupported-environment" })]));
  });

  it("never exposes a converter offset into transformed text", () => {
    const source =
      "\\documentclass{article}\r\n\\begin{document}\r\n" +
      "% 😀 comment whose removal must not move the next range\r\n" +
      "\\includegraphics{missing}\r\n" +
      "\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\r\n" +
      "\\unknown\r\n\\end{document}\r\n";
    const conversion = convertLatexProject(analyzeLatexArchiveFiles([tex("paper.tex", source)]), { rootPath: "paper.tex" });
    const neutralMissing = conversion.diagnostics.find(({ code }) => code === "missing-image");
    const neutralTransformed = conversion.diagnostics.filter(({ code }) => code === "tikz-preserved" || code === "unsupported-command");

    expect(source.slice(neutralMissing?.range?.start, neutralMissing?.range?.end)).toBe("\\includegraphics{missing}");
    expect(neutralTransformed).toHaveLength(2);
    expect(neutralTransformed.every(({ range }) => range === undefined)).toBe(true);
  });

  it("retains exact figure provenance and resolution diagnostics", () => {
    const source =
      "\\documentclass{article}\r\n\\graphicspath{{images/}}\r\n\\begin{document}\r\n" +
      "% 😀 keep offsets anchored to this decoded source\r\n" +
      "\\begin{comment}😀 masked block\\end{comment}\r\n" +
      "\\begin{figure}\r\n" +
      "\\includegraphics[width=3cm]{plot}\r\n" +
      "\\caption{Résumé 😀 plot}\r\n" +
      "\\label{fig:plot}\r\n" +
      "\\end{figure}\r\n" +
      "\\includegraphics{missing}\r\n" +
      "\\end{document}\r\n";
    const conversion = convertLatexProject(
      analyzeLatexArchiveFiles([tex("paper.tex", source), image("images/plot.png", new Uint8Array([1, 2, 3]))]),
      { rootPath: "paper.tex" },
    );

    expect(conversion.figures).toEqual([
      expect.objectContaining({
        sourcePath: "paper.tex",
        requestedPath: "plot",
        archivePath: "images/plot.png",
        resolvedAssetPath: "figures/plot.png",
        contentHash: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
        caption: expect.objectContaining({ value: "Résumé 😀 plot" }),
        label: expect.objectContaining({ value: "fig:plot" }),
        resolutionDiagnostics: [],
      }),
      expect.objectContaining({
        sourcePath: "paper.tex",
        requestedPath: "missing",
        archivePath: null,
        resolvedAssetPath: null,
        contentHash: null,
        resolutionDiagnostics: [expect.objectContaining({ code: "missing-image", severity: "warning" })],
      }),
    ]);
    const resolved = conversion.figures[0]!;
    const referenceLiteral = "\\includegraphics[width=3cm]{plot}";
    const referenceStart = source.indexOf(referenceLiteral);
    expect(resolved.source).toBe(referenceLiteral);
    expect(resolved.referenceRange).toEqual({
      path: "paper.tex",
      start: referenceStart,
      end: referenceStart + referenceLiteral.length,
      unit: "utf16-code-unit",
    });
    expectOriginalRange(resolved.caption!, "paper.tex", source, "\\caption{Résumé 😀 plot}");
    expectOriginalRange(resolved.label!, "paper.tex", source, "\\label{fig:plot}");
    const figureLiteral =
      "\\begin{figure}\r\n" +
      "\\includegraphics[width=3cm]{plot}\r\n" +
      "\\caption{Résumé 😀 plot}\r\n" +
      "\\label{fig:plot}\r\n" +
      "\\end{figure}";
    const figureStart = source.indexOf(figureLiteral);
    expect(resolved.figureRange).toEqual({
      path: "paper.tex",
      start: figureStart,
      end: figureStart + figureLiteral.length,
      unit: "utf16-code-unit",
    });
    for (const figure of conversion.figures) {
      expect(source.slice(figure.referenceRange.start, figure.referenceRange.end)).toBe(figure.source);
      if (figure.caption) expect(source.slice(figure.caption.range.start, figure.caption.range.end)).toBe(figure.caption.source);
      if (figure.label) expect(source.slice(figure.label.range.start, figure.label.range.end)).toBe(figure.label.source);
    }
  });

  it("resolves figures in active source scope without importing inactive assets", () => {
    const root = String.raw`% \begin{document}
\documentclass{article}
\includegraphics{preamble}
\begin{document}
\input{a}
\input{b}
\begin{comment}\includegraphics{hidden}\end{comment}
\end{document}`;
    const inspection = analyzeLatexArchiveFiles([
      tex("main.tex", root),
      tex("a.tex", String.raw`\graphicspath{{a/}}\includegraphics{plot}`),
      tex("b.tex", String.raw`\graphicspath{{b/}}\includegraphics{plot}`),
      image("a/plot.png", new Uint8Array([1, 2, 3])),
      image("b/plot.png", new Uint8Array([1, 2, 3])),
      image("preamble.png", new Uint8Array([4])),
      image("hidden.png", new Uint8Array([5])),
    ]);

    const conversion = convertLatexProject(inspection, { rootPath: "main.tex" });

    expect(conversion.figures.map(({ archivePath }) => archivePath)).toEqual(["a/plot.png", "b/plot.png"]);
    expect(conversion.figures.every(({ resolutionDiagnostics }) => resolutionDiagnostics.length === 0)).toBe(true);
    expect(conversion.assets.map(({ path }) => path)).toEqual(["figures/plot.png"]);
  });

  it("propagates graphic search paths through includes in manuscript order", () => {
    const root = String.raw`\documentclass{article}
\begin{document}
\graphicspath{{root-images/}}
\input{first}
\input{graphics-config}
\input{second}
\end{document}`;
    const inspection = analyzeLatexArchiveFiles([
      tex("main.tex", root),
      tex("first.tex", String.raw`\includegraphics{first-plot}`),
      tex("graphics-config.tex", String.raw`\graphicspath{{configured-images/}}`),
      tex("second.tex", String.raw`\includegraphics{second-plot}`),
      image("root-images/first-plot.png", new Uint8Array([1])),
      image("configured-images/second-plot.png", new Uint8Array([2])),
    ]);

    const conversion = convertLatexProject(inspection, { rootPath: "main.tex" });

    expect(conversion.figures.map(({ sourcePath, archivePath }) => ({ sourcePath, archivePath }))).toEqual([
      { sourcePath: "first.tex", archivePath: "root-images/first-plot.png" },
      { sourcePath: "second.tex", archivePath: "configured-images/second-plot.png" },
    ]);
    expect(conversion.assets.map(({ path }) => path)).toEqual(["figures/first-plot.png", "figures/second-plot.png"]);
  });

  it("keys repeated figure rendering by source occurrence and preserves collision diagnostics", () => {
    const source = String.raw`\documentclass{article}
\begin{document}
\graphicspath{{a/}}
\includegraphics{plot}
\graphicspath{{b/}}
\includegraphics{plot}
\end{document}`;
    const conversion = convertLatexProject(
      analyzeLatexArchiveFiles([
        tex("main.tex", source),
        image("a/plot.png", new Uint8Array([1])),
        image("b/plot.png", new Uint8Array([2])),
      ]),
      { rootPath: "main.tex" },
    );

    expect(
      conversion.figures.map(({ archivePath, resolvedAssetPath, resolutionDiagnostics }) => ({
        archivePath,
        resolvedAssetPath,
        codes: resolutionDiagnostics.map(({ code }) => code),
      })),
    ).toEqual([
      { archivePath: "a/plot.png", resolvedAssetPath: "figures/plot.png", codes: [] },
      { archivePath: "b/plot.png", resolvedAssetPath: null, codes: ["ambiguous-image"] },
    ]);
    expect(conversion.files[0]?.content).toContain("![Imported figure](figures/plot.png)");
    expect(conversion.files[0]?.content).toContain("[Missing figure: plot]");
    expect(conversion.files[0]?.content.match(/!\[Imported figure\]/gu)).toHaveLength(1);
  });

  it("reuses the exact canonical asset path for case-folded identical figures", () => {
    const source = String.raw`\documentclass{article}\begin{document}
\graphicspath{{a/}}\includegraphics{Plot}
\graphicspath{{b/}}\includegraphics{plot}
\end{document}`;
    const bytes = new Uint8Array([1, 2, 3]);
    const conversion = convertLatexProject(
      analyzeLatexArchiveFiles([tex("main.tex", source), image("a/Plot.png", bytes), image("b/plot.png", bytes)]),
      { rootPath: "main.tex" },
    );

    expect(conversion.assets.map(({ path }) => path)).toEqual(["figures/Plot.png"]);
    expect(conversion.figures.map(({ resolvedAssetPath }) => resolvedAssetPath)).toEqual(["figures/Plot.png", "figures/Plot.png"]);
    expect(conversion.files[0]?.content.match(/figures\/Plot\.png/gu)).toHaveLength(2);
    expect(conversion.files[0]?.content).not.toContain("figures/plot.png");
  });
});
