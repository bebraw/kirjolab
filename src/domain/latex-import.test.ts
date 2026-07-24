import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  analyzeLatexArchiveFiles,
  inspectLatexArchive,
  LatexArchiveFailure,
  latexArchiveMaximumCompressedBytes,
  latexArchiveMaximumExpandedBytes,
  latexArchiveMaximumEntries,
  latexArchiveMaximumTextBytes,
  type LatexArchiveFile,
} from "./latex-import";

const text = (path: string, source: string, kind: "tex" | "bibtex" = "tex"): LatexArchiveFile => ({
  path,
  kind,
  bytes: strToU8(source),
  text: source,
});

const zip = (path = "main.tex", contents = String.raw`\documentclass{article}\begin{document}\end{document}`) =>
  zipSync({ [path]: strToU8(contents) }, { level: 0 });

const signatureOffset = (bytes: Uint8Array, signature: number): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset <= bytes.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) === signature) return offset;
  }
  throw new Error(`ZIP signature ${signature.toString(16)} was not found`);
};

const patchedZip = (edit: (view: DataView, centralOffset: number, eocdOffset: number, bytes: Uint8Array) => void): Uint8Array => {
  const bytes = zip().slice();
  const centralOffset = signatureOffset(bytes, 0x02014b50);
  const eocdOffset = signatureOffset(bytes, 0x06054b50);
  edit(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), centralOffset, eocdOffset, bytes);
  return bytes;
};

const expectArchiveFailure = async (archive: Uint8Array, code: LatexArchiveFailure["code"], message: string): Promise<void> => {
  await expect(inspectLatexArchive(archive)).rejects.toMatchObject({
    name: "LatexArchiveFailure",
    code,
    message,
  });
};

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

  it("falls back to safe project-root inputs used by Overleaf chapters", () => {
    const files = [
      text("main.tex", String.raw`\documentclass{article}\begin{document}\input{chapters/results}\end{document}`),
      text("chapters/results.tex", String.raw`\input{tables/results}`),
      text("tables/results.tex", "Result table"),
    ];

    const result = analyzeLatexArchiveFiles(files);

    expect(result.includes.map((reference) => reference.resolvedPath)).toEqual(["chapters/results.tex", "tables/results.tex"]);
    expect(result.diagnostics).toEqual([]);
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
    await expect(
      inspectLatexArchive(zipSync({ "main.tex": new Uint8Array(latexArchiveMaximumTextBytes + 1) }, { level: 0 })),
    ).rejects.toMatchObject({ code: "archive-text-size" });
    const expanded = zipSync({
      "main.tex": strToU8(String.raw`\documentclass{article}\begin{document}\end{document}`),
      "large.bin": new Uint8Array(latexArchiveMaximumExpandedBytes),
    });
    await expect(inspectLatexArchive(expanded)).rejects.toMatchObject({ code: "archive-expanded-size" });
    const expansionBomb = zipSync({ "repeated.bin": new Uint8Array(2 * 1024 * 1024) }, { level: 9 });
    await expect(inspectLatexArchive(expansionBomb)).rejects.toMatchObject({ code: "archive-expanded-size" });
  });

  it("exposes stable typed failures", () => {
    const failure = new LatexArchiveFailure("archive-format", "Broken");
    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe("LatexArchiveFailure");
    expect(failure.code).toBe("archive-format");
    expect(failure.message).toBe("Broken");
  });

  it("classifies supported file extensions case-insensitively and normalizes Windows newlines", async () => {
    const archive = zipSync({
      "MAIN.TEX": strToU8("\\documentclass{article}\r\n\\begin{document}\r\n\\end{document}\r\n"),
      "sources.BIB": strToU8("@misc{x,\r\n title={X}\r\n}\r\n"),
      "a.AVIF": new Uint8Array([1]),
      "b.GIF": new Uint8Array([2]),
      "c.JPEG": new Uint8Array([3]),
      "d.JPG": new Uint8Array([4]),
      "e.PNG": new Uint8Array([5]),
      "f.SVG": new Uint8Array([6]),
      "g.WEBP": new Uint8Array([7]),
      "no-extension": new Uint8Array([8]),
      "unsupported.bmp": new Uint8Array([9]),
    });

    const result = await inspectLatexArchive(archive);

    expect(result.files.map(({ path, kind }) => [path, kind])).toEqual([
      ["a.AVIF", "image"],
      ["b.GIF", "image"],
      ["c.JPEG", "image"],
      ["d.JPG", "image"],
      ["e.PNG", "image"],
      ["f.SVG", "image"],
      ["g.WEBP", "image"],
      ["MAIN.TEX", "tex"],
      ["no-extension", "ignored"],
      ["sources.BIB", "bibtex"],
      ["unsupported.bmp", "ignored"],
    ]);
    expect(result.files.find(({ path }) => path === "MAIN.TEX")?.text).toBe(
      "\\documentclass{article}\n\\begin{document}\n\\end{document}\n",
    );
    expect(result.files.find(({ path }) => path === "sources.BIB")?.text).toBe("@misc{x,\n title={X}\n}\n");
  });

  it("preserves escaped percent signs while removing active comments at the original offsets", () => {
    const source = String.raw`\documentclass[twocolumn]{article}
\begin {document}
\input { visible }
escaped \% \input{also-visible}
double \\% \input{commented}
triple \\\% \include{third}
\end{document}`;
    const result = analyzeLatexArchiveFiles([
      text("main.tex", source),
      text("visible.tex", "visible"),
      text("also-visible.tex", "also"),
      text("third.tex", "third"),
    ]);

    expect(result.selectedRoot).toBe("main.tex");
    expect(result.includes).toEqual([
      {
        sourcePath: "main.tex",
        requestedPath: "visible",
        resolvedPath: "visible.tex",
        from: source.indexOf(String.raw`\input { visible }`),
        to: source.indexOf(String.raw`\input { visible }`) + String.raw`\input { visible }`.length,
      },
      {
        sourcePath: "main.tex",
        requestedPath: "also-visible",
        resolvedPath: "also-visible.tex",
        from: source.indexOf(String.raw`\input{also-visible}`),
        to: source.indexOf(String.raw`\input{also-visible}`) + String.raw`\input{also-visible}`.length,
      },
      {
        sourcePath: "main.tex",
        requestedPath: "third",
        resolvedPath: "third.tex",
        from: source.indexOf(String.raw`\include{third}`),
        to: source.indexOf(String.raw`\include{third}`) + String.raw`\include{third}`.length,
      },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("parses both bibliography commands, trims every selection, and reports exact spans", () => {
    const source =
      String.raw`\documentclass{article}\begin{document}` +
      String.raw`\bibliography{ first , nested/second.bib }` +
      String.raw`\addbibresource[location=remote]{third}` +
      String.raw`\end{document}`;
    const result = analyzeLatexArchiveFiles([
      text("chapters/main.tex", source),
      text("chapters/first.bib", "first", "bibtex"),
      text("nested/second.bib", "second", "bibtex"),
      text("chapters/third.bib", "third", "bibtex"),
    ]);
    const bibliographyStart = source.indexOf(String.raw`\bibliography`);
    const resourceStart = source.indexOf(String.raw`\addbibresource`);

    expect(result.bibliographies).toEqual([
      {
        sourcePath: "chapters/main.tex",
        requestedPath: "first",
        resolvedPath: "chapters/first.bib",
        from: bibliographyStart,
        to: bibliographyStart + String.raw`\bibliography{ first , nested/second.bib }`.length,
      },
      {
        sourcePath: "chapters/main.tex",
        requestedPath: "nested/second.bib",
        resolvedPath: "nested/second.bib",
        from: bibliographyStart,
        to: bibliographyStart + String.raw`\bibliography{ first , nested/second.bib }`.length,
      },
      {
        sourcePath: "chapters/main.tex",
        requestedPath: "third",
        resolvedPath: "chapters/third.bib",
        from: resourceStart,
        to: resourceStart + String.raw`\addbibresource[location=remote]{third}`.length,
      },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("never resolves syntactically unsafe references even when a matching archive path exists", () => {
    const result = analyzeLatexArchiveFiles([
      text("nested/main.tex", String.raw`\input{C:/root}\addbibresource{C:/references}`),
      text("nested/C:/root.tex", "unsafe target"),
      text("nested/C:/references.bib", "unsafe target", "bibtex"),
    ]);

    expect(result.includes[0]).toMatchObject({ requestedPath: "C:/root", resolvedPath: null });
    expect(result.bibliographies[0]).toMatchObject({ requestedPath: "C:/references", resolvedPath: null });
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "missing-root",
      "unsafe-include",
      "unsafe-bibliography",
      "unreferenced-bibliography",
    ]);
  });

  it("does not mistake an embedded drive-like segment for an absolute Windows path", () => {
    const result = analyzeLatexArchiveFiles([
      text("nested/main.tex", String.raw`\input{folder/C:/root}\bibliography{folder/C:/references}`),
      text("nested/folder/C:/root.tex", "target"),
      text("nested/folder/C:/references.bib", "target", "bibtex"),
    ]);

    expect(result.includes[0]?.resolvedPath).toBe("nested/folder/C:/root.tex");
    expect(result.bibliographies[0]?.resolvedPath).toBe("nested/folder/C:/references.bib");
    expect(result.diagnostics).toEqual([{ code: "missing-root", severity: "error", message: "No LaTeX root document was found" }]);
  });

  it.each([
    ["/root", "unsafe-include", "Include escapes or uses an unsafe archive path: /root"],
    ["C:/root", "unsafe-include", "Include escapes or uses an unsafe archive path: C:/root"],
    [String.raw`nested\root`, "unsafe-include", String.raw`Include escapes or uses an unsafe archive path: nested\root`],
    ["../../root", "unsafe-include", "Include escapes or uses an unsafe archive path: ../../root"],
  ] as const)("diagnoses an include reference %j precisely", (requestedPath, code, message) => {
    const command = `\\input{${requestedPath}}`;
    const result = analyzeLatexArchiveFiles([text("nested/main.tex", command)]);

    expect(result.includes).toEqual([
      {
        sourcePath: "nested/main.tex",
        requestedPath,
        resolvedPath: null,
        from: 0,
        to: command.length,
      },
    ]);
    expect(result.diagnostics).toContainEqual({
      code,
      severity: "error",
      message,
      path: "nested/main.tex",
      from: 0,
      to: command.length,
    });
  });

  it.each([
    ["/root", "unsafe-bibliography", "Bibliography escapes or uses an unsafe archive path: /root"],
    ["C:/root", "unsafe-bibliography", "Bibliography escapes or uses an unsafe archive path: C:/root"],
    [String.raw`nested\root`, "unsafe-bibliography", String.raw`Bibliography escapes or uses an unsafe archive path: nested\root`],
    ["../../root", "unsafe-bibliography", "Bibliography escapes or uses an unsafe archive path: ../../root"],
  ] as const)("diagnoses a bibliography reference %j precisely", (requestedPath, code, message) => {
    const command = `\\addbibresource{${requestedPath}}`;
    const result = analyzeLatexArchiveFiles([text("nested/main.tex", command)]);

    expect(result.bibliographies).toEqual([
      {
        sourcePath: "nested/main.tex",
        requestedPath,
        resolvedPath: null,
        from: 0,
        to: command.length,
      },
    ]);
    expect(result.diagnostics).toContainEqual({
      code,
      severity: "error",
      message,
      path: "nested/main.tex",
      from: 0,
      to: command.length,
    });
  });

  it("rejects every unsafe archive-path form with the exact offending path", async () => {
    for (const path of [
      "/main.tex",
      String.raw`nested\main.tex`,
      "C:/main.tex",
      "nested//main.tex",
      "nested/./main.tex",
      "nested/../main.tex",
    ]) {
      await expectArchiveFailure(zip(path), "archive-path", `Unsafe archive path: ${path}`);
    }
  });

  it("validates the ZIP end record and central-directory envelope", async () => {
    await expectArchiveFailure(
      patchedZip((view, _central, eocd) => view.setUint16(eocd + 4, 1, true)),
      "archive-format",
      "Multi-disk ZIP archives are not supported",
    );
    await expectArchiveFailure(
      patchedZip((view, _central, eocd) => view.setUint16(eocd + 6, 1, true)),
      "archive-format",
      "Multi-disk ZIP archives are not supported",
    );
    await expectArchiveFailure(
      patchedZip((view, _central, eocd) => view.setUint16(eocd + 8, 2, true)),
      "archive-format",
      "Multi-disk ZIP archives are not supported",
    );
    await expectArchiveFailure(
      patchedZip((view, _central, eocd) => {
        view.setUint16(eocd + 8, 0xffff, true);
        view.setUint16(eocd + 10, 0xffff, true);
      }),
      "archive-format",
      "ZIP64 archives are not supported",
    );
    await expectArchiveFailure(
      patchedZip((view, _central, eocd) => view.setUint32(eocd + 12, 0xffffffff, true)),
      "archive-format",
      "ZIP64 archives are not supported",
    );
    await expectArchiveFailure(
      patchedZip((view, _central, eocd) => view.setUint32(eocd + 16, 0xffffffff, true)),
      "archive-format",
      "ZIP64 archives are not supported",
    );
    await expectArchiveFailure(
      patchedZip((view, _central, eocd) => {
        view.setUint16(eocd + 8, 0, true);
        view.setUint16(eocd + 10, 0, true);
      }),
      "archive-too-many-entries",
      "LaTeX archive must contain 1–1,024 entries",
    );
    await expectArchiveFailure(
      patchedZip((view, _central, eocd) => {
        view.setUint16(eocd + 8, latexArchiveMaximumEntries + 1, true);
        view.setUint16(eocd + 10, latexArchiveMaximumEntries + 1, true);
      }),
      "archive-too-many-entries",
      "LaTeX archive must contain 1–1,024 entries",
    );
    await expectArchiveFailure(
      patchedZip((view, _central, eocd) => view.setUint32(eocd + 12, eocd + 1, true)),
      "archive-format",
      "Invalid ZIP central directory",
    );
  });

  it("validates each central-directory entry before expansion", async () => {
    await expectArchiveFailure(
      patchedZip((view, central) => view.setUint32(central, 0, true)),
      "archive-format",
      "Invalid ZIP central-directory entry",
    );
    await expectArchiveFailure(
      patchedZip((view, central) => view.setUint16(central + 28, 0xffff, true)),
      "archive-format",
      "Truncated ZIP central-directory entry",
    );
    await expectArchiveFailure(
      patchedZip((view, central) => view.setUint16(central + 8, 1, true)),
      "archive-encrypted",
      "Encrypted ZIP entries are not supported",
    );
    await expectArchiveFailure(
      patchedZip((view, central) => view.setUint16(central + 10, 7, true)),
      "archive-unsupported-compression",
      "ZIP entries must use store or deflate compression",
    );
    await expectArchiveFailure(
      patchedZip((view, central, _eocd, bytes) => {
        bytes[central + 46] = 0xff;
      }),
      "archive-path",
      "ZIP entry names must be UTF-8",
    );
    await expectArchiveFailure(
      patchedZip((view, central) => {
        view.setUint16(central + 4, 3 << 8, true);
        view.setUint32(central + 38, 0o120000 << 16, true);
      }),
      "archive-symlink",
      "Symbolic links are not supported: main.tex",
    );
    await expectArchiveFailure(
      patchedZip((view, central) => view.setUint32(central + 24, latexArchiveMaximumExpandedBytes + 1, true)),
      "archive-expanded-size",
      "Expanded LaTeX archive exceeds 64 MiB",
    );
    await expectArchiveFailure(
      patchedZip((view, central) => {
        view.setUint32(central + 20, 0, true);
        view.setUint32(central + 24, 1024 * 1024, true);
      }),
      "archive-expanded-size",
      "ZIP entry has an excessive expansion ratio: main.tex",
    );
    await expectArchiveFailure(
      patchedZip((view, central) => {
        view.setUint32(central + 20, 1024, true);
        view.setUint32(central + 24, 1024 * 1024 + 1, true);
      }),
      "archive-expanded-size",
      "ZIP entry has an excessive expansion ratio: main.tex",
    );
    await expectArchiveFailure(
      patchedZip((view, _central, eocd) => view.setUint32(eocd + 12, view.getUint32(eocd + 12, true) - 1, true)),
      "archive-format",
      "ZIP central-directory size is invalid",
    );
  });

  it("distinguishes compressed and expanded size boundaries", async () => {
    await expectArchiveFailure(
      new Uint8Array(latexArchiveMaximumCompressedBytes + 1),
      "archive-size",
      "LaTeX archive must be between 1 byte and 20 MiB",
    );
    await expectArchiveFailure(
      zipSync({ "main.tex": new Uint8Array(latexArchiveMaximumTextBytes + 1) }, { level: 0 }),
      "archive-text-size",
      "LaTeX text file exceeds 2 MiB: main.tex",
    );
    await expectArchiveFailure(
      patchedZip((view, central) => {
        view.setUint32(central + 20, 1_049, true);
        view.setUint32(central + 24, 1024 * 1024, true);
      }),
      "archive-text-encoding",
      "LaTeX text file must be UTF-8: main.tex",
    );
  });
});
