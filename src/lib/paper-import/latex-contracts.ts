import type { LatexImportDiagnosticCode } from "./latex-archive.js";
import type { LatexConversionAsset } from "./latex-renderer.js";

export const latexConversionSchemaVersion = 2 as const;
export const latexConverterVersion = "latex-converter-v3" as const;
export const latexRenderedFormat = "scholarmark-v1" as const;
export const latexConversionMaximumSemanticRecords = 50_000;
export const latexMaximumCitationKeys = 1_000;
export const latexMaximumListNestingDepth = 1_024;
export const latexMaximumTikzBlocks = 32;
export const latexMaximumTikzBytes = 128 * 1024;
export const latexMaximumFigureProvenanceCodeUnits = 16 * 1024 * 1024;
export const latexMaximumProseProvenanceCodeUnits = 32 * 1024 * 1024;
export const latexMaximumTableColumns = 256;
export const latexMaximumTableRows = 1_000;
export const latexMaximumRenderedTableCodeUnits = 1024 * 1024;
export const latexMaximumRenderedFolders = 10_000;
export const latexMaximumRenderedFolderCodeUnits = 1024 * 1024;
export const latexMaximumRenderedFileCodeUnits = 4 * 1024 * 1024;
export const latexMaximumRenderedProjectCodeUnits = 16 * 1024 * 1024;

export type LatexConversionErrorCode =
  | "image-resolution-limit"
  | "invalid-bibliography-selection"
  | "invalid-conversion-options"
  | "invalid-root-selection"
  | "provenance-limit"
  | "render-limit"
  | "semantic-record-limit"
  | "unsupported-environment";

export class LatexConversionError extends Error {
  readonly code: LatexConversionErrorCode;

  constructor(code: LatexConversionErrorCode, message: string) {
    super(message);
    this.name = "LatexConversionError";
    this.code = code;
  }
}

export interface LatexConversionOptions {
  readonly maximumSemanticRecords?: number;
}

export type LatexPreviewOptionValue = boolean | number | string;
export type LatexEffectiveConversionOptions = Readonly<Required<LatexConversionOptions>>;

export const defaultLatexConversionOptions: LatexEffectiveConversionOptions = Object.freeze({
  maximumSemanticRecords: latexConversionMaximumSemanticRecords,
});

export interface PaperSourceRange {
  readonly path: string;
  readonly start: number;
  readonly end: number;
  readonly unit: "utf16-code-unit";
}

export interface SourcedLatexValue {
  readonly value: string;
  readonly source: string;
  readonly range: PaperSourceRange;
}

export interface LatexDocumentMetadata {
  readonly title?: SourcedLatexValue;
  readonly authors: readonly SourcedLatexValue[];
  readonly date?: SourcedLatexValue;
  readonly institutes: readonly SourcedLatexValue[];
}

export interface LatexSectionInventory {
  readonly id: string;
  readonly parentId: string | null;
  readonly level: 1 | 2 | 3 | 4;
  readonly title: string;
  readonly label?: string;
  readonly source: string;
  readonly range: PaperSourceRange;
}

export interface LatexProseBlockInventory {
  readonly id: string;
  readonly kind: "paragraph" | "list-item";
  readonly sectionId: string | null;
  readonly text: string;
  readonly source: string;
  readonly range: PaperSourceRange;
}

export interface LatexCitationInventory {
  readonly mode: "narrative" | "parenthetical" | "unspecified";
  readonly keys: readonly string[];
  readonly source: string;
  readonly range: PaperSourceRange;
}

export interface LatexBibliographyEntryInventory {
  readonly type: string;
  readonly citationKey: string;
  readonly source: string;
  readonly range: PaperSourceRange;
}

export interface LatexLabelInventory {
  readonly id: string;
  readonly source: string;
  readonly range: PaperSourceRange;
}

export interface LatexReferenceInventory {
  readonly target: string;
  readonly source: string;
  readonly range: PaperSourceRange;
}

export interface LatexEquationInventory extends SourcedLatexValue {
  readonly display: true;
}

export interface LatexTableInventory {
  readonly environment: "tabular" | "tabularx";
  readonly source: string;
  readonly range: PaperSourceRange;
}

export interface LatexCodeBlockInventory extends SourcedLatexValue {
  readonly environment: "lstlisting" | "minted" | "verbatim";
  readonly language?: string;
}

export interface LatexFigureResolutionDiagnostic {
  readonly code: "ambiguous-image" | "missing-image";
  readonly severity: "warning";
  readonly message: string;
}

export interface LatexFigureInventory {
  readonly sourcePath: string;
  readonly requestedPath: string;
  readonly archivePath: string | null;
  readonly resolvedAssetPath: string | null;
  readonly contentHash: string | null;
  readonly mediaType: LatexConversionAsset["mediaType"] | null;
  readonly caption?: SourcedLatexValue;
  readonly label?: SourcedLatexValue;
  readonly source: string;
  readonly referenceRange: PaperSourceRange;
  readonly figureSource?: string;
  readonly figureRange?: PaperSourceRange;
  readonly resolutionDiagnostics: readonly LatexFigureResolutionDiagnostic[];
}

export interface LatexConversionDiagnostic {
  readonly code: LatexImportDiagnosticCode;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly sourcePath?: string;
  readonly range?: PaperSourceRange;
}

export interface LatexSourceFingerprint {
  readonly path: string;
  readonly kind: "tex" | "bibtex" | "image" | "ignored";
  readonly bytes: number;
  readonly sha256: string;
}

export interface LatexConvertedFile {
  readonly sourcePath: string;
  readonly path: string;
  readonly renderedFormat: typeof latexRenderedFormat;
  readonly content: string;
}

export interface LatexProjectConversion {
  readonly schemaVersion: typeof latexConversionSchemaVersion;
  readonly converterVersion: typeof latexConverterVersion;
  readonly options: LatexEffectiveConversionOptions;
  readonly rootPath: string;
  readonly bibliographyPath: string | null;
  readonly sourceFiles: readonly string[];
  readonly ignoredFiles: readonly string[];
  readonly bibliography: string;
  readonly files: readonly LatexConvertedFile[];
  readonly folders: readonly string[];
  readonly assets: readonly LatexConversionAsset[];
  readonly diagnostics: readonly LatexConversionDiagnostic[];
  readonly metadata: LatexDocumentMetadata;
  readonly abstracts: readonly SourcedLatexValue[];
  readonly sections: readonly LatexSectionInventory[];
  readonly proseBlocks: readonly LatexProseBlockInventory[];
  readonly citations: readonly LatexCitationInventory[];
  readonly bibliographyEntries: readonly LatexBibliographyEntryInventory[];
  readonly labels: readonly LatexLabelInventory[];
  readonly references: readonly LatexReferenceInventory[];
  readonly equations: readonly LatexEquationInventory[];
  readonly tables: readonly LatexTableInventory[];
  readonly codeBlocks: readonly LatexCodeBlockInventory[];
  readonly footnotes: readonly SourcedLatexValue[];
  readonly figures: readonly LatexFigureInventory[];
  readonly sourceFingerprints: readonly LatexSourceFingerprint[];
}
