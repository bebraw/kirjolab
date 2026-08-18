import { describe, expect, it } from "vitest";
import { itOutsideMutation } from "../../test-support/mutation";
import { inspectLatexArchive } from "./latex-archive";
import { convertLatexProject } from "./latex-conversion";
import { createPdfTextExtractor, type PdfTextRuntime } from "./pdf-text";
import { sha256Hex } from "./sha256";
import {
  createAmbiguousFigureConformanceFixtureV1,
  createLatexArchiveFailureConformanceFixturesV1,
  createLatexGraphConformanceFixtureV1,
  createPaperImportConformanceCorpusV1,
  createReviewedLatexConformanceFixtureV1,
  createTwoPagePdfConformanceFixtureV1,
  paperImportConformanceCorpusVersion,
  type LatexArchiveFailureConformanceFixtureV1,
  type LatexArchiveFailureConformanceIdV1,
} from "./conformance-corpus";

const archiveFailureFixtureIds = [
  "empty-archive",
  "malformed-archive",
  "traversal-path",
  "absolute-path",
  "windows-absolute-path",
  "backslash-path",
  "prototype-poisoning-path",
  "case-folded-duplicate",
  "symbolic-link",
  "encrypted-entry",
  "zip64-archive",
  "expansion-ratio",
  "invalid-utf8",
  "oversized-source",
] satisfies readonly LatexArchiveFailureConformanceIdV1[];

const archiveFailureFixtureSha256 = [
  { id: "empty-archive", sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  { id: "malformed-archive", sha256: "a3989126344744ef800dbc88bf7e744853f3f2eac75c9ab3301f4e845ef22078" },
  { id: "traversal-path", sha256: "82b1f83be2da0c3f9f329a9d556d8d4dd2ce3030345fbba63a255cef9db606f4" },
  { id: "absolute-path", sha256: "cac90b089b43ff04db190147eb7f4e8ca763dd32d5b34af8c462a07810df077e" },
  { id: "windows-absolute-path", sha256: "f48fc1d80e203000878c096f6aaec0ccdf905ac3667581d85f3fe7f05a79a8fa" },
  { id: "backslash-path", sha256: "43545d4a78fbf6a333403e7c48b853113624f6dbba37121442a9558058beb420" },
  { id: "prototype-poisoning-path", sha256: "41f3450bcb36992f8c8b0134f5368821fca72b1370efbb99e4b595f0be203f45" },
  { id: "case-folded-duplicate", sha256: "1c18caabf67e7e99551c62dd6ff56b701d7de93e6b8c34a7cefeb2b8af8ecffc" },
  { id: "symbolic-link", sha256: "021760cf877aff5dd048f742db1df575bf54a8f699115aef37c0f8ae1c623a1c" },
  { id: "encrypted-entry", sha256: "09813e28380d607ffe92b915a40c93becd70aa1ceceae3dab90e3bc93d01ecce" },
  { id: "zip64-archive", sha256: "599b4e307c41c712b5d9c616fa14d3b4fc2a634a5db0a40d74d47080fc602870" },
  { id: "expansion-ratio", sha256: "9de45096e35437ea743beba9dbff45ee6711e60abd787e6b28bc2c797ad71b98" },
  { id: "invalid-utf8", sha256: "d63b152ea7d94000590d7fee312ae710ac29b5dc7cee40d19feb9e733f9a24c5" },
  { id: "oversized-source", sha256: "e53094444a19cb06d6ea67b04ab57d9bef7c373a38019b90f1bb4aff3f88ff0a" },
] satisfies ReadonlyArray<{ readonly id: LatexArchiveFailureConformanceIdV1; readonly sha256: string }>;

async function expectArchiveFailure(fixture: LatexArchiveFailureConformanceFixtureV1): Promise<void> {
  await expect(inspectLatexArchive(fixture.archive)).rejects.toMatchObject({
    name: "LatexArchiveFailure",
    code: fixture.expected.code,
    message: fixture.expected.message,
  });
}

describe("paper-import conformance corpus", () => {
  it("exposes one versioned consumer entry point without application authorities", () => {
    const corpus = createPaperImportConformanceCorpusV1();

    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.latex.reviewedPaper.id).toBe("reviewed-latex-paper-v1");
    expect(corpus.latex.includeGraph.canonical.id).toBe("latex-include-graph-v1");
    expect(corpus.latex.includeGraph.reordered.id).toBe("latex-include-graph-v1");
    expect(corpus.latex.ambiguousFigure.id).toBe("latex-ambiguous-figure-v1");
    expect(corpus.latex.archiveFailures).toHaveLength(14);
    expect(corpus.pdf.twoPageNativeText.id).toBe("two-page-native-text-pdf-v1");
  });

  it("publishes a versioned deterministic reviewed-paper fixture with literal expectations", () => {
    const first = createReviewedLatexConformanceFixtureV1();
    const second = createReviewedLatexConformanceFixtureV1();

    expect(paperImportConformanceCorpusVersion).toBe(1);
    expect(first.archive).toEqual(second.archive);
    expect(sha256Hex(first.archive)).toBe(first.expected.archiveSha256);
    expect(first).toMatchObject({
      id: "reviewed-latex-paper-v1",
      selection: { rootPath: "main.tex", bibliographyPath: "refs.bib" },
      expected: {
        rootCandidates: ["alternate.tex", "main.tex"],
        selectedRoot: null,
        convertedFilePaths: ["main.md", "sections/results.md"],
        bibliographyPath: "refs.bib",
      },
    });
  });

  it("runs the reviewed multi-file archive through the neutral public seams", async () => {
    const fixture = createReviewedLatexConformanceFixtureV1();
    const inspection = await inspectLatexArchive(fixture.archive);
    const conversion = convertLatexProject(inspection, fixture.selection);

    expect({
      rootCandidates: inspection.rootCandidates,
      selectedRoot: inspection.selectedRoot,
      convertedFilePaths: conversion.files.map(({ path }) => path),
      schemaVersion: conversion.schemaVersion,
      converterVersion: conversion.converterVersion,
      rootPath: conversion.rootPath,
      bibliographyPath: conversion.bibliographyPath,
      assets: conversion.assets.map(({ path, mediaType }) => ({ path, mediaType })),
      title: conversion.metadata.title?.value,
      authors: conversion.metadata.authors.map(({ value }) => value),
      abstracts: conversion.abstracts.map(({ value }) => value),
      sections: conversion.sections.map(({ title, label }) => ({ title, label })),
      citations: conversion.citations.map(({ mode, keys }) => ({ mode, keys })),
      bibliographyEntries: conversion.bibliographyEntries.map(({ type, citationKey }) => ({ type, citationKey })),
      labels: conversion.labels.map(({ id }) => id),
      references: conversion.references.map(({ target }) => target),
      equations: conversion.equations.map(({ value }) => value),
      tables: conversion.tables.map(({ environment }) => environment),
      codeBlocks: conversion.codeBlocks.map(({ environment, language, value }) => ({ environment, language, value })),
      footnotes: conversion.footnotes.map(({ value }) => value),
      figures: conversion.figures.map(({ requestedPath, archivePath, resolvedAssetPath, caption, label, resolutionDiagnostics }) => ({
        requestedPath,
        archivePath,
        resolvedAssetPath,
        caption: caption?.value,
        label: label?.value,
        resolutionDiagnostics: resolutionDiagnostics.map(({ code }) => code),
      })),
      diagnosticCodes: conversion.diagnostics.map(({ code }) => code),
    }).toEqual(fixture.expected.conversion);
  });

  it("round-trips every reviewed Unicode and CRLF source range into original decoded text", async () => {
    const fixture = createReviewedLatexConformanceFixtureV1();
    const inspection = await inspectLatexArchive(fixture.archive);
    const conversion = convertLatexProject(inspection, fixture.selection);
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
      ...conversion.figures.flatMap((figure) => [{ source: figure.source, range: figure.referenceRange }, figure.caption, figure.label]),
    ].filter((item) => item !== undefined);

    expect(inspection.includes.map(({ requestedPath }) => requestedPath)).toEqual(["sections/results"]);
    expect(inspection.files.find(({ path }) => path === "main.tex")?.text).toBe(fixture.sourceByPath["main.tex"]);
    for (const item of ranged) {
      expect(item.range.unit).toBe("utf16-code-unit");
      expect(fixture.sourceByPath[item.range.path]?.slice(item.range.start, item.range.end)).toBe(item.source);
    }
    expect(ranged.map(({ source, range: { path, start, end } }) => ({ path, start, end, source }))).toEqual(fixture.expected.ranges);
  });

  it("keeps include diagnostics and the full extracted manifest deterministic across ZIP entry order", async () => {
    const canonical = createLatexGraphConformanceFixtureV1("canonical");
    const reordered = createLatexGraphConformanceFixtureV1("reordered");
    const firstInspection = await inspectLatexArchive(canonical.archive);
    const secondInspection = await inspectLatexArchive(reordered.archive);
    const firstConversion = convertLatexProject(firstInspection, canonical.selection);
    const secondConversion = convertLatexProject(secondInspection, reordered.selection);
    const inspectionSummary = (inspection: typeof firstInspection) => ({
      manifest: inspection.files.map(({ path, kind, bytes }) => ({ path, kind, bytes: bytes.byteLength })),
      diagnostics: inspection.diagnostics,
    });
    const conversionSummary = (conversion: typeof firstConversion) => ({
      diagnostics: conversion.diagnostics,
      sourceFingerprints: conversion.sourceFingerprints,
    });

    expect(inspectionSummary(firstInspection)).toEqual(canonical.expected.inspection);
    expect(inspectionSummary(secondInspection)).toEqual(canonical.expected.inspection);
    expect(conversionSummary(firstConversion)).toEqual(canonical.expected.conversion);
    expect(conversionSummary(secondConversion)).toEqual(canonical.expected.conversion);
  });

  it("reports an ambiguous figure with literal null provenance instead of choosing an asset", async () => {
    const fixture = createAmbiguousFigureConformanceFixtureV1();
    const inspection = await inspectLatexArchive(fixture.archive);
    const conversion = convertLatexProject(inspection, fixture.selection);

    expect(
      conversion.figures.map(
        ({ requestedPath, archivePath, resolvedAssetPath, contentHash, mediaType, source, referenceRange, resolutionDiagnostics }) => ({
          requestedPath,
          archivePath,
          resolvedAssetPath,
          contentHash,
          mediaType,
          source,
          referenceRange,
          resolutionDiagnostics,
        }),
      ),
    ).toEqual(fixture.expected.figures);
    expect(conversion.diagnostics).toEqual(fixture.expected.diagnostics);
    expect(conversion.assets).toEqual([]);
  });

  it("pins and rejects every compact archive-security fixture with its literal stable failure", async () => {
    const fixtures = createLatexArchiveFailureConformanceFixturesV1();

    expect(fixtures.map(({ id }) => id)).toEqual(archiveFailureFixtureIds);
    const compactFixtures = fixtures.filter(({ id }) => id !== "oversized-source");
    expect(compactFixtures).toHaveLength(13);
    expect(compactFixtures.map(({ id, archive }) => ({ id, sha256: sha256Hex(archive) }))).toEqual(
      archiveFailureFixtureSha256.filter(({ id }) => id !== "oversized-source"),
    );
    for (const fixture of compactFixtures) {
      await expectArchiveFailure(fixture);
    }
  });

  itOutsideMutation("pins and rejects the exact oversized archive-security fixture", async () => {
    const fixtures = createLatexArchiveFailureConformanceFixturesV1();

    const oversizedSource = fixtures.find(({ id }) => id === "oversized-source");
    if (!oversizedSource) throw new Error("Missing oversized-source conformance fixture");
    expect({ id: oversizedSource.id, sha256: sha256Hex(oversizedSource.archive) }).toEqual(
      archiveFailureFixtureSha256.find(({ id }) => id === "oversized-source"),
    );
    await expectArchiveFailure(oversizedSource);
  });

  it("pins the deterministic two-page PDF fixture bytes", () => {
    const fixture = createTwoPagePdfConformanceFixtureV1();

    expect({ schemaVersion: fixture.schemaVersion, id: fixture.id, sha256: sha256Hex(fixture.bytes) }).toEqual({
      schemaVersion: 1,
      id: "two-page-native-text-pdf-v1",
      sha256: "19ac21175b4b299831fb1a7d7e8bd046ca5bdab709f592aeb6c39384a2a01dc6",
    });
  });

  itOutsideMutation("extracts the deterministic two-page PDF fixture through the neutral byte seam", async () => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const fixture = createTwoPagePdfConformanceFixtureV1();
    const repeated = createTwoPagePdfConformanceFixtureV1();
    const cleanedPages: number[] = [];
    const runtime: PdfTextRuntime = {
      getDocument({ data }) {
        const task = getDocument({
          data,
          standardFontDataUrl: new URL("../../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).href,
        });
        return {
          promise: task.promise.then((documentModel) => ({
            numPages: documentModel.numPages,
            getPage: async (pageNumber) => {
              const page = await documentModel.getPage(pageNumber);
              return {
                streamTextContent: () => page.streamTextContent(),
                cleanup: () => {
                  cleanedPages.push(pageNumber);
                  page.cleanup();
                },
              };
            },
          })),
          destroy: async () => await task.destroy(),
        };
      },
    };

    expect(fixture.bytes).toEqual(repeated.bytes);
    await expect(createPdfTextExtractor(runtime)(fixture.bytes, fixture.limits)).resolves.toEqual(fixture.expected);
    expect(cleanedPages).toEqual([1, 2]);
  });
});
