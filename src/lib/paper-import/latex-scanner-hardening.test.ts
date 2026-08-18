import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { itOutsideMutation } from "../../test-support/mutation";
import { inspectLatexArchive } from "./latex-archive";
import { convertLatexProject } from "./latex-conversion";
import {
  acceptLatexImageCandidateProbe,
  latexImageMaximumCandidateProbes,
  latexImageMaximumSearchFolderCodeUnits,
  latexImageMaximumSearchFolders,
  resolveLatexImageReferences,
} from "./latex-images";
import { displayMathOccurrences, literalEnvironmentOccurrences, semanticLatexSource, structuralLatexSource } from "./latex-source";

describe("LaTeX source scanner hardening", () => {
  it("masks literal and TikZ bodies once without moving UTF-16 offsets or display math", () => {
    const source =
      "Before 😀\r\n" +
      "\\begin{lstlisting}[language=TeX]\r\n\\input{hidden}\r\n\\end{lstlisting}\r\n" +
      "\\begin{tikzpicture}\r\n\\includegraphics{hidden}\r\n\\end{tikzpicture}\r\n" +
      "\\[x + y\\]\r\n";
    const structural = structuralLatexSource(source);
    const semantic = semanticLatexSource(source);
    const literalReference = source.indexOf("\\input{hidden}");
    const tikzReference = source.indexOf("\\includegraphics{hidden}");

    expect(structural).toHaveLength(source.length);
    expect(semantic).toHaveLength(source.length);
    expect(structural.slice(literalReference, literalReference + "\\input{hidden}".length)).toBe(" ".repeat("\\input{hidden}".length));
    expect(structural.slice(tikzReference, tikzReference + "\\includegraphics{hidden}".length)).toBe("\\includegraphics{hidden}");
    expect(semantic.slice(tikzReference, tikzReference + "\\includegraphics{hidden}".length)).toBe(
      " ".repeat("\\includegraphics{hidden}".length),
    );
    expect([...semantic].filter((character) => character === "\n")).toHaveLength(
      [...source].filter((character) => character === "\n").length,
    );

    const display = displayMathOccurrences(source);
    expect(display).toEqual([
      {
        start: source.indexOf("\\[x + y\\]"),
        end: source.indexOf("\\[x + y\\]") + "\\[x + y\\]".length,
        bodyStart: source.indexOf("\\[x + y\\]") + 2,
        bodyEnd: source.indexOf("\\[x + y\\]") + "\\[x + y".length,
      },
    ]);
  });

  it("recognizes comment and literal openers only after an even-length preceding backslash run", () => {
    const escapedComment = String.raw`\\begin{comment}\input{escaped-comment-visible}\\end{comment}`;
    const activeComment = String.raw`\\\begin{comment}\input{active-comment-hidden}\end{comment}`;
    const escapedLiteral = String.raw`\\begin{verbatim}\input{escaped-literal-visible}\\end{verbatim}`;
    const activeLiteral = String.raw`\\\begin{verbatim}\input{active-literal-hidden}\end{verbatim}`;
    const source = `Before 😀\r\n${escapedComment}\r\n${activeComment}\r\n${escapedLiteral}\r\n${activeLiteral}\r\n`;
    const structural = structuralLatexSource(source);
    const literals = literalEnvironmentOccurrences(source);
    const escapedCommentReference = source.indexOf("\\input{escaped-comment-visible}");
    const activeCommentReference = source.indexOf("\\input{active-comment-hidden}");
    const escapedLiteralReference = source.indexOf("\\input{escaped-literal-visible}");
    const activeLiteralReference = source.indexOf("\\input{active-literal-hidden}");

    expect(structural.slice(escapedCommentReference, escapedCommentReference + "\\input{escaped-comment-visible}".length)).toBe(
      "\\input{escaped-comment-visible}",
    );
    expect(structural.slice(activeCommentReference, activeCommentReference + "\\input{active-comment-hidden}".length)).toBe(
      " ".repeat("\\input{active-comment-hidden}".length),
    );
    expect(structural.slice(escapedLiteralReference, escapedLiteralReference + "\\input{escaped-literal-visible}".length)).toBe(
      "\\input{escaped-literal-visible}",
    );
    expect(structural.slice(activeLiteralReference, activeLiteralReference + "\\input{active-literal-hidden}".length)).toBe(
      " ".repeat("\\input{active-literal-hidden}".length),
    );
    expect(literals).toHaveLength(1);
    expect(source.slice(literals[0]?.start, literals[0]?.end)).toBe(
      String.raw`\begin{verbatim}\input{active-literal-hidden}\end{verbatim}`,
    );
  });

  it("skips escaped comment and literal closers until the next active closer", () => {
    const comment = String.raw`\begin{comment}\input{comment-hidden}\\end{comment}\input{comment-still-hidden}\end{comment}`;
    const literal = String.raw`\begin{verbatim}\input{literal-hidden}\\end{verbatim}\input{literal-still-hidden}\end{verbatim}`;
    const source = `${comment}\\input{after-comment}${literal}\\input{after-literal}`;
    const structural = structuralLatexSource(source);
    const literals = literalEnvironmentOccurrences(source);

    for (const hidden of [
      "\\input{comment-hidden}",
      "\\input{comment-still-hidden}",
      "\\input{literal-hidden}",
      "\\input{literal-still-hidden}",
    ]) {
      const start = source.indexOf(hidden);
      expect(structural.slice(start, start + hidden.length)).toBe(" ".repeat(hidden.length));
    }
    for (const visible of ["\\input{after-comment}", "\\input{after-literal}"]) {
      const start = source.indexOf(visible);
      expect(structural.slice(start, start + visible.length)).toBe(visible);
    }
    expect(literals).toHaveLength(1);
    expect(source.slice(literals[0]?.start, literals[0]?.end)).toBe(literal);
  });

  it("preserves Unicode CRLF offsets while applying slash-run parity to display-math openers and closers", () => {
    const escapedOpen = String.raw`\\[ignored\]`;
    const activeAfterPair = String.raw`\\\[kept\]`;
    const escapedClose = String.raw`\[left \\] right 😀\]`;
    const source = `Résumé 😀\r\n${escapedOpen}\r\n${activeAfterPair}\r\n${escapedClose}\r\n`;
    const occurrences = displayMathOccurrences(source);
    const afterPairStart = source.indexOf(activeAfterPair) + 2;
    const escapedCloseStart = source.indexOf(escapedClose);

    expect(
      occurrences.map(({ start, end, bodyStart, bodyEnd }) => ({
        start,
        end,
        bodyStart,
        bodyEnd,
        source: source.slice(start, end),
      })),
    ).toEqual([
      {
        start: afterPairStart,
        end: afterPairStart + String.raw`\[kept\]`.length,
        bodyStart: afterPairStart + 2,
        bodyEnd: afterPairStart + String.raw`\[kept`.length,
        source: String.raw`\[kept\]`,
      },
      {
        start: escapedCloseStart,
        end: escapedCloseStart + escapedClose.length,
        bodyStart: escapedCloseStart + 2,
        bodyEnd: escapedCloseStart + escapedClose.length - 2,
        source: escapedClose,
      },
    ]);
  });

  it("applies slash-run parity to graphic paths and image references", async () => {
    const source =
      String.raw`\documentclass{article}\begin{document}` +
      String.raw`\\graphicspath{{fake/}}` +
      String.raw`\\\graphicspath{{images/}}` +
      String.raw`\includegraphics{active}` +
      String.raw`\\includegraphics{fake}` +
      String.raw`\\\includegraphics{triple}` +
      String.raw`\end{document}`;
    const archive = zipSync({
      "main.tex": strToU8(source),
      "images/active.png": new Uint8Array([137, 80, 78, 71]),
      "images/triple.png": new Uint8Array([137, 80, 78, 71, 1]),
      "fake/fake.png": new Uint8Array([137, 80, 78, 71, 2]),
    });
    const inspection = await inspectLatexArchive(archive);
    const conversion = convertLatexProject(inspection, { rootPath: "main.tex" });

    expect(conversion.figures.map(({ requestedPath, archivePath }) => ({ requestedPath, archivePath }))).toEqual([
      { requestedPath: "active", archivePath: "images/active.png" },
      { requestedPath: "triple", archivePath: "images/triple.png" },
    ]);
    expect(conversion.assets.map(({ path }) => path)).toEqual(["figures/active.png", "figures/triple.png"]);
  });

  itOutsideMutation(
    "masks a dense below-cap sequence of literal environments with stable length and delimiters",
    () => {
      const block = "\\begin{verbatim}\r\nx\r\n\\end{verbatim}\r\n";
      const source = block.repeat(2_000);
      const masked = structuralLatexSource(source);

      expect(masked).toHaveLength(source.length);
      expect(masked.startsWith("\\begin{verbatim}\r\n ")).toBe(true);
      expect(masked.endsWith("\\end{verbatim}\r\n")).toBe(true);
      expect(masked.includes("\r\nx\r\n")).toBe(false);
    },
    20_000,
  );

  it("reports outermost cross-type literal blocks once in source order with exact ranges", () => {
    const nested = "\\begin{minted}[linenos]{python}\n" + "\\begin{lstlisting}nested\\end{lstlisting}\n" + "\\end{minted}";
    const topLevel = "\\begin{verbatim}plain\\end{verbatim}";
    const source = `before\n${nested}\nafter\n${topLevel}`;
    const occurrences = literalEnvironmentOccurrences(source);
    const nestedStart = source.indexOf(nested);
    const optionsEnd = source.indexOf("]", nestedStart) + 1;
    const topLevelStart = source.indexOf(topLevel);

    expect(occurrences).toEqual([
      {
        environment: "minted",
        start: nestedStart,
        end: nestedStart + nested.length,
        bodyStart: optionsEnd,
        bodyEnd: nestedStart + nested.lastIndexOf("\\end{minted}"),
        options: "linenos",
      },
      {
        environment: "verbatim",
        start: topLevelStart,
        end: topLevelStart + topLevel.length,
        bodyStart: topLevelStart + "\\begin{verbatim}".length,
        bodyEnd: topLevelStart + topLevel.indexOf("\\end{verbatim}"),
      },
    ]);
  });

  it("rejects an oversized image reference without retaining or reflecting its authored value", async () => {
    const requestedPath = "a".repeat(1_025);
    const source = `\\documentclass{article}\\begin{document}\\includegraphics{${requestedPath}}\\end{document}`;
    const inspection = await inspectLatexArchive(zipSync({ "main.tex": strToU8(source) }));

    expect(() => convertLatexProject(inspection, { rootPath: "main.tex" })).toThrowError(
      expect.objectContaining({
        name: "LatexConversionError",
        code: "image-resolution-limit",
        message: "LaTeX image reference exceeds 1,024 UTF-16 code units",
      }),
    );
  });

  it("stops image scanning at an unmatched optional argument instead of reinterpreting its suffix", async () => {
    const source = "\\documentclass{article}\\begin{document}" + "\\includegraphics[broken \\includegraphics{visible}" + "\\end{document}";
    const inspection = await inspectLatexArchive(zipSync({ "main.tex": strToU8(source) }));
    const conversion = convertLatexProject(inspection, { rootPath: "main.tex" });

    expect(conversion.figures).toEqual([]);
  });

  it("stops graphic-path scanning at an unmatched group instead of applying a nested suffix command", async () => {
    const source =
      "\\documentclass{article}\\graphicspath{{broken \\graphicspath{{images/}}" +
      "\\begin{document}\\includegraphics{plot}\\end{document}";
    const inspection = await inspectLatexArchive(
      zipSync({
        "main.tex": strToU8(source),
        "images/plot.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      }),
    );
    const conversion = convertLatexProject(inspection, { rootPath: "main.tex" });

    expect(conversion.figures).toMatchObject([{ requestedPath: "plot", archivePath: null }]);
  });

  it("rejects an oversized graphic search path without reflecting its authored value", async () => {
    const folder = "a".repeat(1_025);
    const source = `\\documentclass{article}\\graphicspath{{${folder}}}` + "\\begin{document}\\includegraphics{plot}\\end{document}";
    const inspection = await inspectLatexArchive(zipSync({ "main.tex": strToU8(source) }));

    expect(() => convertLatexProject(inspection, { rootPath: "main.tex" })).toThrowError(
      expect.objectContaining({
        name: "LatexConversionError",
        code: "image-resolution-limit",
        message: "LaTeX image search path exceeds 1,024 UTF-16 code units",
      }),
    );
  });

  it("bounds retained graphic search folders by count before candidate probing", async () => {
    expect(latexImageMaximumSearchFolders).toBe(256);
    const convertWithFolderCount = async (folderCount: number) => {
      const folders = "{}".repeat(folderCount);
      const source = `\\documentclass{article}\\graphicspath{${folders}}\\begin{document}text\\end{document}`;
      const inspection = await inspectLatexArchive(zipSync({ "main.tex": strToU8(source) }));
      return convertLatexProject(inspection, { rootPath: "main.tex" });
    };

    await expect(convertWithFolderCount(256)).resolves.toMatchObject({ figures: [] });
    await expect(convertWithFolderCount(257)).rejects.toMatchObject({
      name: "LatexConversionError",
      code: "image-resolution-limit",
      message: "LaTeX image search paths exceed the 256-folder limit",
    });
  });

  it("bounds retained graphic search-folder text before candidate probing", async () => {
    expect(latexImageMaximumSearchFolderCodeUnits).toBe(65_536);
    const convertWithFolderLengths = async (folderLengths: readonly number[]) => {
      const folders = folderLengths.map((length) => `{${"a".repeat(length)}}`).join("");
      const source = `\\documentclass{article}\\graphicspath{${folders}}\\begin{document}text\\end{document}`;
      const inspection = await inspectLatexArchive(zipSync({ "main.tex": strToU8(source) }));
      return convertLatexProject(inspection, { rootPath: "main.tex" });
    };

    await expect(convertWithFolderLengths(Array.from({ length: 64 }, () => 1_024))).resolves.toMatchObject({ figures: [] });
    await expect(convertWithFolderLengths([...Array.from({ length: 64 }, () => 1_024), 1])).rejects.toMatchObject({
      name: "LatexConversionError",
      code: "image-resolution-limit",
      message: "LaTeX image search paths exceed the 65,536 UTF-16 code-unit limit",
    });
  });

  itOutsideMutation(
    "scans a dense below-cap malformed graphic-path suffix once and retains no nested search folders",
    async () => {
      const source =
        `\\documentclass{article}${"\\graphicspath{{".repeat(20_000)}` + "\\begin{document}\\includegraphics{plot}\\end{document}";
      const inspection = await inspectLatexArchive(zipSync({ "main.tex": strToU8(source) }));

      expect(resolveLatexImageReferences(inspection, "main.tex", ["main.tex"])).toMatchObject([{ requestedPath: "plot", candidates: [] }]);
    },
    20_000,
  );

  itOutsideMutation(
    "allows exactly the aggregate image candidate-probe budget and rejects the next probe batch",
    async () => {
      expect(latexImageMaximumCandidateProbes).toBe(100_000);
      const convertWithImageCount = async (imageCount: number) => {
        const folders = Array.from({ length: 248 }, (_, index) => `{f${index}/}`).join("");
        const source =
          `\\documentclass{article}\\graphicspath{${folders}}` +
          `\\begin{document}${"\\includegraphics{plot}".repeat(imageCount)}\\end{document}`;
        const inspection = await inspectLatexArchive(zipSync({ "nested/main.tex": strToU8(source) }));
        return convertLatexProject(inspection, { rootPath: "nested/main.tex" });
      };

      const atBoundary = await convertWithImageCount(50);
      expect(atBoundary.figures).toHaveLength(50);
      await expect(convertWithImageCount(51)).rejects.toMatchObject({
        name: "LatexConversionError",
        code: "image-resolution-limit",
        message: "LaTeX image resolution exceeds the 100,000 candidate-probe limit",
      });
    },
    20_000,
  );

  it("accumulates image candidate probes against a small mutation-test budget", () => {
    let candidateProbes = 0;
    candidateProbes = acceptLatexImageCandidateProbe(candidateProbes, 2);
    candidateProbes = acceptLatexImageCandidateProbe(candidateProbes, 2);

    expect(candidateProbes).toBe(2);
    expect(() => acceptLatexImageCandidateProbe(candidateProbes, 2)).toThrowError(
      expect.objectContaining({
        name: "LatexConversionError",
        code: "image-resolution-limit",
        message: "LaTeX image resolution exceeds the 100,000 candidate-probe limit",
      }),
    );
  });
});
