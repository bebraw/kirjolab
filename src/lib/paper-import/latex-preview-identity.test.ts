import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  createLatexConversionManifest,
  createLatexPreviewIdentity,
  digestLatexArchiveManifest,
  digestLatexConversionManifest,
  digestLatexPreviewIdentity,
  inspectLatexArchive,
  convertLatexProject,
  latexConversionMaximumSemanticRecords,
  latexPreviewIdentitySchemaVersion,
  type LatexPreviewIdentityV1,
} from "./index";

const identityVector = {
  schemaVersion: 1,
  archiveSha256: "a".repeat(64),
  rootPath: "main.tex",
  bibliographyPath: "refs.bib",
  converterVersion: "latex-converter-v5",
  options: { maximumSemanticRecords: 50_000 },
  archiveManifestSha256: "b".repeat(64),
  conversionManifestSha256: "c".repeat(64),
} satisfies LatexPreviewIdentityV1;

function expectHashedText(actual: unknown, value: string): void {
  expect(actual).toEqual({
    utf16CodeUnits: value.length,
    byteCount: new TextEncoder().encode(value).byteLength,
    sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
  });
}

describe("neutral LaTeX preview identity", () => {
  it.each([
    ["archive bytes", { ...identityVector, archiveSha256: "d".repeat(64) }],
    ["selected root", { ...identityVector, rootPath: "alternate.tex" }],
    ["selected bibliography", { ...identityVector, bibliographyPath: "alternate.bib" }],
    ["conversion options", { ...identityVector, options: { maximumSemanticRecords: 49_999 } }],
    ["identity schema", { ...identityVector, schemaVersion: 2 as 1 }],
    ["converter version", { ...identityVector, converterVersion: "latex-converter-v6" }],
    ["archive manifest", { ...identityVector, archiveManifestSha256: "e".repeat(64) }],
    ["neutral conversion", { ...identityVector, conversionManifestSha256: "f".repeat(64) }],
  ] satisfies ReadonlyArray<readonly [string, LatexPreviewIdentityV1]>)("changes the preview digest when %s changes", (_field, changed) => {
    expect(digestLatexPreviewIdentity(changed)).not.toBe(digestLatexPreviewIdentity(identityVector));
  });

  it("constructs and digests the complete reviewed interpretation deterministically", async () => {
    const archive = zipSync({
      "main.tex": strToU8("\\documentclass{article}\\begin{document}\\section{Result}Evidence \\cite{x}.\\end{document}"),
    });
    const inspection = await inspectLatexArchive(archive);
    const conversion = convertLatexProject(inspection, { rootPath: "main.tex" }, { maximumSemanticRecords: 100 });
    const identity = createLatexPreviewIdentity({
      archive,
      files: inspection.files,
      conversion,
    });

    expect(identity).toEqual({
      schemaVersion: 1,
      archiveSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      rootPath: "main.tex",
      bibliographyPath: null,
      converterVersion: "latex-converter-v5",
      options: { maximumSemanticRecords: 100 },
      archiveManifestSha256: digestLatexArchiveManifest(inspection.files),
      conversionManifestSha256: digestLatexConversionManifest(conversion),
    });
    expect(latexPreviewIdentitySchemaVersion).toBe(1);
    expect(digestLatexArchiveManifest(inspection.files)).toBe(digestLatexArchiveManifest([...inspection.files].reverse()));
    expect(digestLatexPreviewIdentity(identity)).toMatch(/^[a-f0-9]{64}$/u);
    expect(digestLatexPreviewIdentity({ ...identity, options: { maximumSemanticRecords: 100 } })).toBe(
      digestLatexPreviewIdentity(identity),
    );
  });

  it("canonicalizes option key order and binds normalized effective limits", async () => {
    expect(digestLatexPreviewIdentity({ ...identityVector, options: { alpha: "x", beta: 1 } })).toBe(
      digestLatexPreviewIdentity({ ...identityVector, options: { beta: 1, alpha: "x" } }),
    );

    const archive = zipSync({
      "main.tex": strToU8("\\documentclass{article}\\begin{document}Sparse.\\end{document}"),
    });
    const inspection = await inspectLatexArchive(archive);
    const defaultConversion = convertLatexProject(inspection, { rootPath: "main.tex" });
    const clampedConversion = convertLatexProject(
      inspection,
      { rootPath: "main.tex" },
      { maximumSemanticRecords: latexConversionMaximumSemanticRecords + 1 },
    );

    expect(clampedConversion.options).toEqual({ maximumSemanticRecords: latexConversionMaximumSemanticRecords });
    expect(
      digestLatexPreviewIdentity(createLatexPreviewIdentity({ archive, files: inspection.files, conversion: clampedConversion })),
    ).toBe(digestLatexPreviewIdentity(createLatexPreviewIdentity({ archive, files: inspection.files, conversion: defaultConversion })));
  });

  it("changes the conversion manifest when neutral output changes without serializing asset bytes", async () => {
    const archive = zipSync({
      "main.tex": strToU8("\\documentclass{article}\\begin{document}Evidence.\\includegraphics{plot}\\end{document}"),
      "plot.png": new Uint8Array([137, 80, 78, 71]),
    });
    const inspection = await inspectLatexArchive(archive);
    const conversion = convertLatexProject(inspection, { rootPath: "main.tex" });
    const digest = digestLatexConversionManifest(conversion);
    const manifest = createLatexConversionManifest(conversion);

    expect(manifest.assets[0]).not.toHaveProperty("bytes");
    expect(JSON.stringify(manifest)).not.toContain(JSON.stringify([...conversion.assets[0]!.bytes]));

    expect(
      digestLatexConversionManifest({
        ...conversion,
        options: { maximumSemanticRecords: conversion.options.maximumSemanticRecords - 1 },
      }),
    ).not.toBe(digest);
    expect(
      digestLatexConversionManifest({
        ...conversion,
        proseBlocks: conversion.proseBlocks.map((block) => ({ ...block, text: `${block.text} changed` })),
      }),
    ).not.toBe(digest);
    expect(
      digestLatexConversionManifest({
        ...conversion,
        assets: conversion.assets.map((asset) => ({ ...asset, bytes: new Uint8Array([...asset.bytes, 1]) })),
      }),
    ).not.toBe(digest);
  });

  it("hashes repeated enclosing-figure provenance without quadratic canonical JSON", async () => {
    const references = "\\includegraphics{plot}\n".repeat(300);
    const archive = zipSync({
      "main.tex": strToU8(
        `\\documentclass{article}\\begin{document}\\begin{figure}${references}\\caption{${"c".repeat(512)}}` +
          "\\label{fig:plot}\\end{figure}\\end{document}",
      ),
      "plot.png": new Uint8Array([137, 80, 78, 71]),
    });
    const inspection = await inspectLatexArchive(archive);
    const conversion = convertLatexProject(inspection, { rootPath: "main.tex" });
    const manifest = createLatexConversionManifest(conversion);
    const serialized = JSON.stringify(manifest);
    const figure = conversion.figures[0];
    const manifestFigure = manifest.semantics.figures[0];

    expect(conversion.figures).toHaveLength(300);
    expect(figure?.figureSource).toBeTypeOf("string");
    expect(figure?.caption).toBeDefined();
    expect(figure?.label).toBeDefined();
    expectHashedText(manifestFigure?.source, figure?.source ?? "");
    expectHashedText(manifestFigure?.figureSource, figure?.figureSource ?? "");
    expectHashedText(manifestFigure?.caption?.value, figure?.caption?.value ?? "");
    expectHashedText(manifestFigure?.caption?.source, figure?.caption?.source ?? "");
    expectHashedText(manifestFigure?.label?.value, figure?.label?.value ?? "");
    expectHashedText(manifestFigure?.label?.source, figure?.label?.source ?? "");
    expect(serialized.length).toBeLessThan((inspection.files.find(({ path }) => path === "main.tex")?.text?.length ?? 0) * 80);
  });

  it("hashes overlapping nested-list provenance without quadratic canonical JSON", async () => {
    const depth = 300;
    const nested =
      Array.from({ length: depth }, (_, index) => `\\begin{itemize}\\item Level ${index}.`).join("") + "\\end{itemize}".repeat(depth);
    const archive = zipSync({
      "main.tex": strToU8(`\\documentclass{article}\\begin{document}${nested}\\end{document}`),
    });
    const inspection = await inspectLatexArchive(archive);
    const conversion = convertLatexProject(inspection, { rootPath: "main.tex" });
    const manifest = createLatexConversionManifest(conversion);
    const serialized = JSON.stringify(manifest);
    const sourceLength = inspection.files.find(({ path }) => path === "main.tex")?.text?.length ?? 0;
    const outerSource = conversion.proseBlocks[0]?.source;

    expect(conversion.proseBlocks).toHaveLength(depth);
    expect(outerSource).toBeTypeOf("string");
    expectHashedText(manifest.semantics.proseBlocks[0]?.source, outerSource ?? "");
    expect(serialized.length).toBeLessThan(sourceLength * 80);
    expect(
      digestLatexConversionManifest({
        ...conversion,
        proseBlocks: conversion.proseBlocks.map((block, index) =>
          index === 0 ? { ...block, source: `${block.source.slice(0, -1)}x` } : block,
        ),
      }),
    ).not.toBe(digestLatexConversionManifest(conversion));
  });
});
