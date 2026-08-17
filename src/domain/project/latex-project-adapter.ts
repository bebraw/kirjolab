import type { LatexProjectConversion } from "../../lib/paper-import/latex-conversion";
import type { LatexImportDiagnostic } from "../../lib/paper-import/latex-archive";
import type { LatexConversionAsset, LatexConversionReport } from "../../lib/paper-import/latex-renderer";
import type { ProjectTemplateSeed } from "./project-templates";
import { defaultProjectPublicationProfile } from "../workspace/workspace";

export interface KirjolabLatexConversion {
  readonly seed: ProjectTemplateSeed;
  readonly assets: readonly LatexConversionAsset[];
  readonly report: LatexConversionReport;
}

export function adaptLatexProjectToSeed(conversion: LatexProjectConversion): KirjolabLatexConversion {
  const diagnostics: LatexImportDiagnostic[] = conversion.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.sourcePath ? { path: diagnostic.sourcePath } : {}),
    ...(diagnostic.range ? { from: diagnostic.range.start, to: diagnostic.range.end } : {}),
  }));
  return {
    seed: {
      schemaVersion: 1,
      entryPath: "main.md",
      files: conversion.files.map(({ path, content }) => ({ path, content })),
      folders: conversion.folders,
      bibliography: conversion.bibliography,
      publicationProfile: defaultProjectPublicationProfile,
    },
    assets: conversion.assets satisfies readonly LatexConversionAsset[],
    report: {
      schemaVersion: 1,
      rootPath: conversion.rootPath,
      bibliographyPath: conversion.bibliographyPath,
      sourceFiles: conversion.sourceFiles,
      ignoredFiles: conversion.ignoredFiles,
      diagnostics,
    },
  };
}
