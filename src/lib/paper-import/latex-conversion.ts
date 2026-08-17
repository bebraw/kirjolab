import type { LatexArchiveInspection } from "./latex-archive";
import { analyzeLatexSemantics } from "./latex-analysis";
import {
  LatexConversionError,
  defaultLatexConversionOptions,
  latexConversionMaximumSemanticRecords,
  latexConversionSchemaVersion,
  latexConverterVersion,
  type LatexConversionOptions,
  type LatexProjectConversion,
} from "./latex-contracts";
import { renderLatexProject, type LatexConversionSelection } from "./latex-renderer";
import { assertLatexSemanticRecordLimit } from "./latex-semantic-limit";

export {
  defaultLatexConversionOptions,
  latexConversionMaximumSemanticRecords,
  latexConversionSchemaVersion,
  latexConverterVersion,
} from "./latex-contracts";
export type { LatexConversionOptions, LatexConvertedFile, LatexProjectConversion } from "./latex-contracts";

export function convertLatexProject(
  inspection: LatexArchiveInspection,
  selection: LatexConversionSelection,
  options: LatexConversionOptions = defaultLatexConversionOptions,
): LatexProjectConversion {
  const maximumSemanticRecords = resolveMaximumSemanticRecords(options);
  assertLatexSemanticRecordLimit(inspection, selection, maximumSemanticRecords);
  const conversion = renderLatexProject(inspection, selection);
  const semantics = analyzeLatexSemantics(inspection, conversion.report);
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
    rootPath: conversion.report.rootPath,
    bibliographyPath: conversion.report.bibliographyPath,
    sourceFiles: conversion.report.sourceFiles,
    ignoredFiles: conversion.report.ignoredFiles,
    bibliography: conversion.bibliography,
    files: conversion.files,
    folders: conversion.folders,
    assets: conversion.assets,
    diagnostics,
    ...semantics,
  };
}

function resolveMaximumSemanticRecords(options: LatexConversionOptions): number {
  const value = options.maximumSemanticRecords ?? latexConversionMaximumSemanticRecords;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new LatexConversionError("invalid-conversion-options", "maximumSemanticRecords must be a positive safe integer");
  }
  return Math.min(value, latexConversionMaximumSemanticRecords);
}
