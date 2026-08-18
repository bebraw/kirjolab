import type { LatexArchiveInspection } from "./latex-archive.js";
import { analyzeLatexSemantics } from "./latex-analysis.js";
import {
  defaultLatexConversionOptions,
  latexConversionSchemaVersion,
  latexConverterVersion,
  latexRenderedFormat,
  type LatexConversionOptions,
  type LatexProjectConversion,
} from "./latex-contracts.js";
import { renderLatexProject, type LatexConversionSelection } from "./latex-renderer.js";
import { assertLatexSemanticRecordLimit, resolveMaximumSemanticRecords } from "./latex-semantic-limit.js";

export { defaultLatexConversionOptions, latexConversionMaximumSemanticRecords, latexConverterVersion } from "./latex-contracts.js";
export type { LatexConversionOptions, LatexProjectConversion } from "./latex-contracts.js";

export function convertLatexProject(
  inspection: LatexArchiveInspection,
  selection: LatexConversionSelection,
  options: LatexConversionOptions = defaultLatexConversionOptions,
): LatexProjectConversion {
  const maximumSemanticRecords = resolveMaximumSemanticRecords(options);
  const retainedSemanticRecords = assertLatexSemanticRecordLimit(inspection, selection, maximumSemanticRecords);
  const conversion = renderLatexProject(inspection, selection);
  const semanticAnalysis = analyzeLatexSemantics(
    inspection,
    conversion.report,
    maximumSemanticRecords - retainedSemanticRecords,
    maximumSemanticRecords,
  );
  const { provenanceDiagnostics, ...semantics } = semanticAnalysis;
  const diagnostics = conversion.report.diagnostics.map((diagnostic) => {
    const source = diagnostic.path ? inspection.files.find((file) => file.path === diagnostic.path)?.text : undefined;
    const exactRange =
      source !== undefined &&
      diagnostic.from !== undefined &&
      diagnostic.to !== undefined &&
      Number.isInteger(diagnostic.from) &&
      Number.isInteger(diagnostic.to) &&
      diagnostic.from >= 0 &&
      diagnostic.to >= diagnostic.from &&
      diagnostic.to <= source.length;
    return {
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      ...(diagnostic.path ? { sourcePath: diagnostic.path } : {}),
      ...(exactRange
        ? { range: { path: diagnostic.path!, start: diagnostic.from!, end: diagnostic.to!, unit: "utf16-code-unit" as const } }
        : {}),
    };
  });
  return {
    schemaVersion: latexConversionSchemaVersion,
    converterVersion: latexConverterVersion,
    options: Object.freeze({ maximumSemanticRecords }),
    rootPath: conversion.report.rootPath,
    bibliographyPath: conversion.report.bibliographyPath,
    sourceFiles: conversion.report.sourceFiles,
    ignoredFiles: conversion.report.ignoredFiles,
    bibliography: conversion.bibliography,
    files: conversion.files.map((file) => ({ ...file, renderedFormat: latexRenderedFormat })),
    folders: conversion.folders,
    assets: conversion.assets,
    diagnostics: [...diagnostics, ...provenanceDiagnostics],
    ...semantics,
  };
}
