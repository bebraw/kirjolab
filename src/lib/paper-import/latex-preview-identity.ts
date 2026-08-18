import type { LatexArchiveFile } from "./latex-archive.js";
import { type LatexConversionOptions, type LatexPreviewOptionValue, type LatexProjectConversion } from "./latex-contracts.js";
import { comparePortableText } from "./portable-path.js";
import { sha256Hex } from "./sha256.js";

export const latexPreviewIdentitySchemaVersion = 1 as const;
export const latexConversionManifestSchemaVersion = 1 as const;
export const latexArchiveManifestSchemaVersion = 1 as const;

export type { LatexPreviewOptionValue } from "./latex-contracts.js";

export interface LatexPreviewIdentityV1 {
  readonly schemaVersion: typeof latexPreviewIdentitySchemaVersion;
  readonly archiveSha256: string;
  readonly rootPath: string;
  readonly bibliographyPath: string | null;
  readonly converterVersion: string;
  readonly options: Readonly<Record<string, LatexPreviewOptionValue>>;
  readonly archiveManifestSha256: string;
  readonly conversionManifestSha256: string;
}

export interface CreateLatexPreviewIdentityInputV1 {
  readonly archive: Uint8Array;
  readonly files: readonly LatexArchiveFile[];
  readonly conversion: LatexProjectConversion;
}

interface LatexHashedTextV1 {
  readonly utf16CodeUnits: number;
  readonly byteCount: number;
  readonly sha256: string;
}

interface LatexArchiveManifestEntryV1 {
  readonly path: string;
  readonly kind: LatexArchiveFile["kind"];
  readonly byteCount: number;
  readonly sha256: string;
}

interface LatexRenderedFileManifestEntryV1 extends LatexHashedTextV1 {
  readonly sourcePath: string;
  readonly path: string;
  readonly renderedFormat: LatexProjectConversion["files"][number]["renderedFormat"];
}

interface LatexAssetManifestEntryV1 {
  readonly path: string;
  readonly mediaType: LatexProjectConversion["assets"][number]["mediaType"];
  readonly byteCount: number;
  readonly sha256: string;
}

interface LatexSourcedValueManifestV1 {
  readonly value: LatexHashedTextV1;
  readonly source: LatexHashedTextV1;
  readonly range: LatexProjectConversion["figures"][number]["referenceRange"];
}

type LatexFigureManifestEntryV1 = Omit<LatexProjectConversion["figures"][number], "caption" | "figureSource" | "label" | "source"> & {
  readonly caption?: LatexSourcedValueManifestV1;
  readonly figureSource?: LatexHashedTextV1;
  readonly label?: LatexSourcedValueManifestV1;
  readonly source: LatexHashedTextV1;
};

type LatexProseBlockManifestEntryV1 = Omit<LatexProjectConversion["proseBlocks"][number], "source"> & {
  readonly source: LatexHashedTextV1;
};

interface LatexSemanticConversionManifestV1 extends Pick<
  LatexProjectConversion,
  | "metadata"
  | "abstracts"
  | "sections"
  | "citations"
  | "bibliographyEntries"
  | "labels"
  | "references"
  | "equations"
  | "tables"
  | "codeBlocks"
  | "footnotes"
> {
  readonly proseBlocks: readonly LatexProseBlockManifestEntryV1[];
  readonly figures: readonly LatexFigureManifestEntryV1[];
}

export interface LatexConversionManifestV1 {
  readonly schemaVersion: typeof latexConversionManifestSchemaVersion;
  readonly conversionSchemaVersion: LatexProjectConversion["schemaVersion"];
  readonly converterVersion: string;
  readonly options: LatexProjectConversion["options"];
  readonly rootPath: string;
  readonly bibliographyPath: string | null;
  readonly sourceFiles: readonly string[];
  readonly ignoredFiles: readonly string[];
  readonly bibliography: LatexHashedTextV1;
  readonly renderedFiles: readonly LatexRenderedFileManifestEntryV1[];
  readonly folders: readonly string[];
  readonly assets: readonly LatexAssetManifestEntryV1[];
  readonly diagnostics: LatexProjectConversion["diagnostics"];
  readonly semantics: LatexSemanticConversionManifestV1;
  readonly sourceFingerprints: LatexProjectConversion["sourceFingerprints"];
}

export function createLatexPreviewIdentity(input: CreateLatexPreviewIdentityInputV1): LatexPreviewIdentityV1 {
  const options = normalizePreviewOptions(input.conversion.options);
  return {
    schemaVersion: latexPreviewIdentitySchemaVersion,
    archiveSha256: sha256Hex(input.archive),
    rootPath: input.conversion.rootPath,
    bibliographyPath: input.conversion.bibliographyPath,
    converterVersion: input.conversion.converterVersion,
    options,
    archiveManifestSha256: digestLatexArchiveManifest(input.files),
    conversionManifestSha256: digestLatexConversionManifest(input.conversion),
  };
}

export function digestLatexPreviewIdentity(identity: LatexPreviewIdentityV1): string {
  return sha256Text(canonicalJson(identity));
}

export function digestLatexArchiveManifest(files: readonly LatexArchiveFile[]): string {
  const entries: LatexArchiveManifestEntryV1[] = [...files]
    .sort((left, right) => comparePortableText(left.path, right.path))
    .map((file) => ({
      path: file.path,
      kind: file.kind,
      byteCount: file.bytes.byteLength,
      sha256: sha256Hex(file.bytes),
    }));
  return sha256Text(canonicalJson({ schemaVersion: latexArchiveManifestSchemaVersion, files: entries }));
}

export function createLatexConversionManifest(conversion: LatexProjectConversion): LatexConversionManifestV1 {
  return {
    schemaVersion: latexConversionManifestSchemaVersion,
    conversionSchemaVersion: conversion.schemaVersion,
    converterVersion: conversion.converterVersion,
    options: conversion.options,
    rootPath: conversion.rootPath,
    bibliographyPath: conversion.bibliographyPath,
    sourceFiles: conversion.sourceFiles,
    ignoredFiles: conversion.ignoredFiles,
    bibliography: hashedText(conversion.bibliography),
    renderedFiles: conversion.files.map((file) => ({
      sourcePath: file.sourcePath,
      path: file.path,
      renderedFormat: file.renderedFormat,
      ...hashedText(file.content),
    })),
    folders: conversion.folders,
    assets: [...conversion.assets]
      .sort((left, right) => comparePortableText(left.path, right.path))
      .map((asset) => ({
        path: asset.path,
        mediaType: asset.mediaType,
        byteCount: asset.bytes.byteLength,
        sha256: sha256Hex(asset.bytes),
      })),
    diagnostics: conversion.diagnostics,
    semantics: {
      metadata: conversion.metadata,
      abstracts: conversion.abstracts,
      sections: conversion.sections,
      proseBlocks: conversion.proseBlocks.map(({ source, ...block }) => ({ ...block, source: hashedText(source) })),
      citations: conversion.citations,
      bibliographyEntries: conversion.bibliographyEntries,
      labels: conversion.labels,
      references: conversion.references,
      equations: conversion.equations,
      tables: conversion.tables,
      codeBlocks: conversion.codeBlocks,
      footnotes: conversion.footnotes,
      figures: conversion.figures.map(({ caption, figureSource, label, source, ...figure }) => ({
        ...figure,
        source: hashedText(source),
        ...(caption ? { caption: hashedSourcedValue(caption) } : {}),
        ...(label ? { label: hashedSourcedValue(label) } : {}),
        ...(figureSource ? { figureSource: hashedText(figureSource) } : {}),
      })),
    },
    sourceFingerprints: conversion.sourceFingerprints,
  };
}

export function digestLatexConversionManifest(conversion: LatexProjectConversion): string {
  return sha256Text(canonicalJson(createLatexConversionManifest(conversion)));
}

function normalizePreviewOptions(
  options: Readonly<Record<string, LatexPreviewOptionValue>> | LatexConversionOptions,
): Readonly<Record<string, LatexPreviewOptionValue>> {
  const normalized: Record<string, LatexPreviewOptionValue> = {};
  for (const [key, value] of Object.entries(options).sort(([left], [right]) => comparePortableText(left, right))) {
    if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError(`LaTeX preview option must be finite: ${key}`);
    normalized[key] = value;
  }
  return Object.freeze(normalized);
}

function hashedText(value: string): LatexHashedTextV1 {
  const bytes = new TextEncoder().encode(value);
  return { utf16CodeUnits: value.length, byteCount: bytes.byteLength, sha256: sha256Hex(bytes) };
}

function hashedSourcedValue(value: NonNullable<LatexProjectConversion["figures"][number]["caption"]>): LatexSourcedValueManifestV1 {
  return { value: hashedText(value.value), source: hashedText(value.source), range: value.range };
}

function sha256Text(value: string): string {
  return sha256Hex(new TextEncoder().encode(value));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  const keys = Object.keys(value).sort(comparePortableText);
  const entries: Array<readonly [string, unknown]> = [];
  for (const key of keys) {
    const item = (value as Record<string, unknown>)[key];
    if (item !== undefined) entries.push([key, canonicalValue(item)]);
  }
  return Object.fromEntries(entries);
}
