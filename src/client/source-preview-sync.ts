import type { CompositionSourceSpan } from "../domain/project-files";

export interface PreviewSourceLocation {
  readonly fileId: string;
  readonly offset: number;
}

export function sourceLocationForPreviewOffset(
  sourceMap: readonly CompositionSourceSpan[],
  previewOffset: number,
): PreviewSourceLocation | null {
  const span = sourceMap.find((candidate) => previewOffset >= candidate.outputStart && previewOffset < candidate.outputEnd);
  if (!span) return null;
  return {
    fileId: span.fileId,
    offset: span.sourceStart + previewOffset - span.outputStart,
  };
}

export function previewOffsetsForSourceLocation(
  sourceMap: readonly CompositionSourceSpan[],
  fileId: string,
  sourceOffset: number,
): readonly number[] {
  return sourceMap.flatMap((span) => {
    if (span.fileId !== fileId || sourceOffset < span.sourceStart || sourceOffset > span.sourceEnd) return [];
    return [span.outputStart + Math.min(sourceOffset - span.sourceStart, span.outputEnd - span.outputStart - 1)];
  });
}
