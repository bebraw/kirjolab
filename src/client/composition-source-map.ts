import type { CompositionSourceSpan } from "../domain/project-files";

export function sourceSpanAt(sourceMap: readonly CompositionSourceSpan[], offset: number): CompositionSourceSpan | undefined {
  return sourceMap.find((span) => offset >= span.outputStart && offset < span.outputEnd);
}
