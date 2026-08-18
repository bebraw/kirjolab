import { describe, expect, it } from "vitest";
import type { LatexArchiveFile } from "./latex-import";
import { latexArchiveManifestSha256, latexConverterVersion, latexPreviewDigest, type LatexPreviewIdentity } from "./latex-preview-identity";

const identity = {
  schemaVersion: 1,
  archiveSha256: "a".repeat(64),
  rootPath: "main.tex",
  bibliographyPath: "refs.bib",
  converterVersion: latexConverterVersion,
  options: { preserveComments: false, maxFigureCount: 32 },
  manifestSha256: "b".repeat(64),
} satisfies LatexPreviewIdentity;

describe("LaTeX preview identity", () => {
  it("digests the canonical reviewed interpretation", async () => {
    await expect(latexPreviewDigest(identity)).resolves.toBe("8f8b30c1eccfd9266be4de28e9aab6ca557c419075bc8ef054cd2d694f229c54");
    await expect(latexPreviewDigest({ ...identity, options: { maxFigureCount: 32, preserveComments: false } })).resolves.toBe(
      "8f8b30c1eccfd9266be4de28e9aab6ca557c419075bc8ef054cd2d694f229c54",
    );
  });

  it.each([
    ["archive", { ...identity, archiveSha256: "c".repeat(64) }],
    ["root", { ...identity, rootPath: "alternate.tex" }],
    ["bibliography", { ...identity, bibliographyPath: "alternate.bib" }],
    ["options", { ...identity, options: { ...identity.options, preserveComments: true } }],
    ["converter version", { ...identity, converterVersion: "latex-converter-v2" }],
    ["schema version", { ...identity, schemaVersion: 2 }],
    ["manifest", { ...identity, manifestSha256: "d".repeat(64) }],
  ] satisfies ReadonlyArray<readonly [string, LatexPreviewIdentity]>)("changes when the %s changes", async (_field, changed) => {
    await expect(latexPreviewDigest(changed)).resolves.not.toBe(await latexPreviewDigest(identity));
  });

  it("digests a deterministic normalized archive manifest", async () => {
    const files: LatexArchiveFile[] = [
      { path: "main.tex", kind: "tex", bytes: new TextEncoder().encode("paper"), text: "paper" },
      { path: "figure.png", kind: "image", bytes: new Uint8Array([137, 80]) },
    ];

    await expect(latexArchiveManifestSha256(files)).resolves.toBe("451a544cad59c92350306ae330670be39f55999a97278df692604e03ff882ae1");
    await expect(latexArchiveManifestSha256([...files].reverse())).resolves.toBe(
      "451a544cad59c92350306ae330670be39f55999a97278df692604e03ff882ae1",
    );
  });
});
