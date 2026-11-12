import type { CompositionSourceSpan } from "../../domain/project/project-files";
import { previewOffsetsForSourceLocation, sourceLocationForPreviewOffset } from "../preview/source-preview-sync";

export interface OutlineSourceRange {
  readonly fileId: string;
  readonly from: number;
  readonly to: number;
}

/** Only navigate a range when its complete composition mapping is contiguous. */
export function outlineSourceRange(
  sourceMap: readonly CompositionSourceSpan[],
  entryFileId: string,
  from: number,
  to: number,
): OutlineSourceRange | null {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) return null;
  if (sourceMap.length === 0) return { fileId: entryFileId, from, to };
  const start = sourceLocationForPreviewOffset(sourceMap, from);
  if (!start) return null;
  let cursor = from;
  while (cursor < to) {
    const span = sourceMap.find((item) => item.outputStart <= cursor && cursor < item.outputEnd);
    if (!span || span.fileId !== start.fileId || span.sourceStart + cursor - span.outputStart !== start.offset + cursor - from) {
      return null;
    }
    cursor = Math.min(to, span.outputEnd);
  }
  return { fileId: start.fileId, from: start.offset, to: start.offset + to - from };
}

/** A repeated include follows the occurrence already being viewed in the outline. */
export function outlineOffset(
  sourceMap: readonly CompositionSourceSpan[],
  fileId: string,
  sourceOffset: number,
  previous: number | null,
): number | null {
  if (sourceMap.length === 0) return sourceOffset;
  const offsets = previewOffsetsForSourceLocation(sourceMap, fileId, sourceOffset);
  return offsets.reduce<number | null>(
    (nearest, offset) => (nearest === null || Math.abs(offset - (previous ?? 0)) < Math.abs(nearest - (previous ?? 0)) ? offset : nearest),
    null,
  );
}
