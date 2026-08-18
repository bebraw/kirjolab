import { describe, expect, it } from "vitest";
import * as paperImport from "./index";
import { createPaperImportConformanceCorpusV2, paperImportConformanceCorpusVersion } from "./conformance";
import {
  convertLatexProject,
  createPdfTextExtractor,
  defaultLatexConversionOptions,
  inspectLatexArchive,
  latexArchiveMaximumCompressedBytes,
  latexArchiveMaximumEntries,
  latexArchiveMaximumExpandedBytes,
  latexArchiveMaximumPathCodeUnits,
  latexArchiveMaximumPathSegments,
  latexArchiveMaximumStructuralRecords,
  latexArchiveMaximumTextBytes,
  latexConversionMaximumSemanticRecords,
  latexConversionSchemaVersion,
  latexConverterVersion,
  latexImageMaximumCandidateProbes,
  latexImageMaximumRequestedPathCodeUnits,
  latexImageMaximumSearchFolderCodeUnits,
  latexImageMaximumSearchFolders,
  latexMaximumCitationKeys,
  latexMaximumFigureProvenanceCodeUnits,
  latexMaximumListNestingDepth,
  latexMaximumProseProvenanceCodeUnits,
  latexMaximumRenderedFileCodeUnits,
  latexMaximumRenderedFolderCodeUnits,
  latexMaximumRenderedFolders,
  latexMaximumRenderedProjectCodeUnits,
  latexMaximumRenderedTableCodeUnits,
  latexMaximumTableColumns,
  latexMaximumTableRows,
  latexMaximumTikzBlocks,
  latexMaximumTikzBytes,
  pdfTextHardMaximumDocumentTextCodeUnits,
  pdfTextHardMaximumInputBytes,
  pdfTextHardMaximumPages,
  pdfTextHardMaximumPageTextCodeUnits,
  type LatexConversionSelection,
  type PdfTextExtractionLimits,
  type PdfTextRuntime,
} from "./index";

describe("paper-import public entry point", () => {
  it("exposes the neutral archive, conversion, PDF, and conformance seams together", async () => {
    const corpus = createPaperImportConformanceCorpusV2();
    const selection: LatexConversionSelection = corpus.latex.reviewedPaper.selection;
    const inspection = await inspectLatexArchive(corpus.latex.reviewedPaper.archive);
    const conversion = convertLatexProject(inspection, selection, defaultLatexConversionOptions);
    const limits: PdfTextExtractionLimits = corpus.pdf.twoPageNativeText.limits;
    const runtime: PdfTextRuntime = {
      getDocument: () => ({
        promise: Promise.resolve({ numPages: 0, getPage: async () => await Promise.reject(new Error("unreachable")) }),
        destroy: async () => undefined,
      }),
    };

    expect(conversion).toMatchObject({
      schemaVersion: latexConversionSchemaVersion,
      converterVersion: latexConverterVersion,
      rootPath: selection.rootPath,
    });
    expect(createPdfTextExtractor(runtime)).toBeTypeOf("function");
    expect(limits.maximumPages).toBeGreaterThan(0);
    expect(paperImportConformanceCorpusVersion).toBe(2);
    expect(latexArchiveMaximumCompressedBytes).toBe(20 * 1_024 * 1_024);
    expect(latexArchiveMaximumExpandedBytes).toBe(64 * 1_024 * 1_024);
    expect(latexArchiveMaximumEntries).toBe(1_024);
    expect(latexArchiveMaximumPathCodeUnits).toBe(1_024);
    expect(latexArchiveMaximumPathSegments).toBe(64);
    expect(latexArchiveMaximumStructuralRecords).toBe(10_000);
    expect(latexArchiveMaximumTextBytes).toBe(2 * 1_024 * 1_024);
    expect(latexConversionMaximumSemanticRecords).toBe(50_000);
    expect(latexImageMaximumCandidateProbes).toBe(100_000);
    expect(latexImageMaximumRequestedPathCodeUnits).toBe(1_024);
    expect(latexImageMaximumSearchFolderCodeUnits).toBe(65_536);
    expect(latexImageMaximumSearchFolders).toBe(256);
    expect(latexMaximumCitationKeys).toBe(1_000);
    expect(latexMaximumFigureProvenanceCodeUnits).toBe(16 * 1_024 * 1_024);
    expect(latexMaximumListNestingDepth).toBe(1_024);
    expect(latexMaximumProseProvenanceCodeUnits).toBe(32 * 1_024 * 1_024);
    expect(latexMaximumTableColumns).toBe(256);
    expect(latexMaximumTableRows).toBe(1_000);
    expect(latexMaximumRenderedTableCodeUnits).toBe(1_024 * 1_024);
    expect(latexMaximumRenderedFolders).toBe(10_000);
    expect(latexMaximumRenderedFolderCodeUnits).toBe(1_024 * 1_024);
    expect(latexMaximumRenderedFileCodeUnits).toBe(4 * 1_024 * 1_024);
    expect(latexMaximumRenderedProjectCodeUnits).toBe(16 * 1_024 * 1_024);
    expect(latexMaximumTikzBlocks).toBe(32);
    expect(latexMaximumTikzBytes).toBe(128 * 1_024);
    expect(pdfTextHardMaximumInputBytes).toBe(25 * 1_024 * 1_024);
    expect(pdfTextHardMaximumPages).toBe(200);
    expect(pdfTextHardMaximumPageTextCodeUnits).toBe(100_000);
    expect(pdfTextHardMaximumDocumentTextCodeUnits).toBe(20_000_000);
    expect(paperImport).not.toHaveProperty("analyzeLatexArchiveFiles");
    expect(paperImport).not.toHaveProperty("renderLatexProject");
    expect(paperImport).not.toHaveProperty("createPaperImportConformanceCorpusV2");
  });
});
