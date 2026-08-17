import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
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
} from "./conformance-corpus";

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

  it("rejects every versioned archive-security fixture with its literal stable failure", async () => {
    const first = createLatexArchiveFailureConformanceFixturesV1();
    const second = createLatexArchiveFailureConformanceFixturesV1();

    expect(first.map(({ id }) => id)).toEqual([
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
    ]);
    for (const [index, fixture] of first.entries()) {
      expect(fixture.archive).toEqual(second[index]?.archive);
      await expect(inspectLatexArchive(fixture.archive)).rejects.toMatchObject({
        name: "LatexArchiveFailure",
        code: fixture.expected.code,
        message: fixture.expected.message,
      });
    }
  }, 15_000);

  it("extracts the deterministic two-page PDF fixture through the neutral byte seam", async () => {
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
