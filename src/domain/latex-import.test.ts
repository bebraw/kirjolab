import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  analyzeLatexArchiveFiles,
  inspectLatexArchive,
  LatexArchiveFailure,
  latexArchiveMaximumCompressedBytes,
  latexArchiveMaximumExpandedBytes,
  latexArchiveMaximumTextBytes,
  type LatexArchiveFile,
} from "./latex-import";

const text = (path: string, source: string, kind: "tex" | "bibtex" = "tex"): LatexArchiveFile => ({
  path,
  kind,
  bytes: strToU8(source),
  text: source,
});

describe("LaTeX archive import", () => {
  it("inspects a bounded multi-file Overleaf archive without expanding comments", async () => {
    const archive = zipSync({
      "_main.tex": strToU8(String.raw`\documentclass{article}
\begin{document}
% \input{missing}
\input{sections/introduction}
\bibliography{references/web}
\end{document}`),
      "sections/introduction.tex": strToU8(String.raw`\section{Introduction}
Escaped \% sign.
% \bibliography{ignored}`),
      "references/web.bib": strToU8("@article{doe2026, title={Study}}"),
      "references/unused.bib": strToU8("@misc{unused, title={Unused}}"),
      "figures/result.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      "journal.cls": strToU8("publisher layout"),
    });

    const result = await inspectLatexArchive(archive);

    expect(result.selectedRoot).toBe("_main.tex");
    expect(result.rootCandidates).toEqual(["_main.tex"]);
    expect(result.includes).toEqual([
      expect.objectContaining({
        sourcePath: "_main.tex",
        requestedPath: "sections/introduction",
        resolvedPath: "sections/introduction.tex",
      }),
    ]);
    expect(result.includes[0]?.from).toBe(
      String.raw`\documentclass{article}
\begin{document}
% \input{missing}
`.length,
    );
    expect(result.bibliographies).toEqual([
      expect.objectContaining({ sourcePath: "_main.tex", requestedPath: "references/web", resolvedPath: "references/web.bib" }),
    ]);
    expect(result.files.map(({ path, kind }) => ({ path, kind }))).toEqual([
      { path: "_main.tex", kind: "tex" },
      { path: "figures/result.png", kind: "image" },
      { path: "journal.cls", kind: "ignored" },
      { path: "references/unused.bib", kind: "bibtex" },
      { path: "references/web.bib", kind: "bibtex" },
      { path: "sections/introduction.tex", kind: "tex" },
    ]);
    expect(result.diagnostics).toEqual([
      {
        code: "unreferenced-bibliography",
        severity: "warning",
        message: "Bibliography is present but not referenced by a LaTeX file: references/unused.bib",
        path: "references/unused.bib",
      },
    ]);
  });

  it("requires explicit root selection and reports unsafe or missing references", () => {
    const files = [
      text("a.tex", String.raw`\documentclass{article}\begin{document}\input{missing}\end{document}`),
      text("nested/b.tex", String.raw`\documentclass{article}\begin{document}\input{../../private}\end{document}`),
      text("references.bib", "@misc{x, title={X}}", "bibtex"),
      text("bibliography.tex", String.raw`\addbibresource{missing.bib}\bibliography{../private}`),
    ];

    const result = analyzeLatexArchiveFiles(files);

    expect(result.selectedRoot).toBeNull();
    expect(result.rootCandidates).toEqual(["a.tex", "nested/b.tex"]);
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "ambiguous-root",
      "missing-include",
      "unsafe-include",
      "missing-bibliography",
      "unsafe-bibliography",
      "unreferenced-bibliography",
    ]);
  });

  it("reports a missing root and resolves exact extensions and comma-separated bibliographies", () => {
    const files = [
      text("chapters/main.tex", String.raw`\input{part.tex}\bibliography{../a.bib,../b}`),
      text("chapters/part.tex", "Part"),
      text("a.bib", "@misc{a, title={A}}", "bibtex"),
      text("b.bib", "@misc{b, title={B}}", "bibtex"),
    ];
    const result = analyzeLatexArchiveFiles(files);
    expect(result.diagnostics).toEqual([{ code: "missing-root", severity: "error", message: "No LaTeX root document was found" }]);
    expect(result.includes[0]?.resolvedPath).toBe("chapters/part.tex");
    expect(result.bibliographies.map((item) => item.resolvedPath)).toEqual(["a.bib", "b.bib"]);
  });

  it("rejects empty, oversized, malformed, and unsafe archives", async () => {
    await expect(inspectLatexArchive(new Uint8Array())).rejects.toMatchObject({ code: "archive-size" });
    await expect(inspectLatexArchive(new Uint8Array(latexArchiveMaximumCompressedBytes + 1))).rejects.toMatchObject({
      code: "archive-size",
    });
    await expect(inspectLatexArchive(strToU8("not a zip"))).rejects.toMatchObject({ code: "archive-format" });
    await expect(inspectLatexArchive(zipSync({ "../main.tex": strToU8("unsafe") }))).rejects.toMatchObject({ code: "archive-path" });
    await expect(inspectLatexArchive(zipSync({ "MAIN.tex": strToU8("a"), "main.tex": strToU8("b") }))).rejects.toMatchObject({
      code: "archive-path",
    });
  });

  it("rejects invalid UTF-8 and bounded text or expanded-size violations", async () => {
    await expect(inspectLatexArchive(zipSync({ "main.tex": new Uint8Array([0xff, 0xfe]) }))).rejects.toMatchObject({
      code: "archive-text-encoding",
    });
    await expect(inspectLatexArchive(zipSync({ "main.tex": new Uint8Array(latexArchiveMaximumTextBytes + 1) }))).rejects.toMatchObject({
      code: "archive-text-size",
    });
    const expanded = zipSync({
      "main.tex": strToU8(String.raw`\documentclass{article}\begin{document}\end{document}`),
      "large.bin": new Uint8Array(latexArchiveMaximumExpandedBytes),
    });
    await expect(inspectLatexArchive(expanded)).rejects.toMatchObject({ code: "archive-expanded-size" });
  });

  it("exposes stable typed failures", () => {
    const failure = new LatexArchiveFailure("archive-format", "Broken");
    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe("LatexArchiveFailure");
    expect(failure.code).toBe("archive-format");
    expect(failure.message).toBe("Broken");
  });
});
