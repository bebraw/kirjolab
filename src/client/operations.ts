import type { AnnotationResource } from "../domain/workspace";
export { calculateTextSplice, type TextSplice } from "../domain/text";

export function buildGroundedPrompt(source: string, selection: string, annotations: AnnotationResource[]): string {
  const evidence = annotations
    .map(
      (annotation, index) =>
        `[Evidence ${index + 1}, page ${annotation.page}]\nQuote: ${annotation.quote}\nBefore: ${annotation.prefix}\nAfter: ${annotation.suffix}\nResearcher note: ${annotation.comment}`,
    )
    .join("\n\n");
  return `Revise the selected passage in the Markdown document using only the supplied evidence.
Preserve the document's extended Markdown citations and references. Do not invent citation ids.
Return the complete revised Markdown document and nothing else.

Selected passage:
${selection}

Evidence:
${evidence}

Complete document:
${source}`;
}

export function extractCompletion(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices)) return null;
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== "string") return null;
  return stripMarkdownFence(choice.message.content);
}

export function stripMarkdownFence(value: string): string {
  const trimmed = value.trim();
  const match = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/iu.exec(trimmed);
  return (match?.[1] ?? trimmed).trimEnd() + "\n";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
