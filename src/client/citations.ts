export interface CitationInsertion {
  readonly index: number;
  readonly text: string;
  readonly caret: number;
}

const citationDirectivePattern = /(?<!:):(?:cite|citet|citep)\[([^\]]*)\](?:\{[^}]*\})?/giu;
const unsafeCitationKeyPattern = /[\s,[\]]/u;
const leadingBoundaryPattern = /[\s([{\u2014-]/u;
const trailingBoundaryPattern = /[\s)\]},.;:!?\u2014-]/u;

export function parseCitationKeys(value: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const key = part.trim();
    const normalized = key.toLocaleLowerCase();
    if (!key || seen.has(normalized)) continue;
    seen.add(normalized);
    keys.push(key);
  }
  return keys;
}

export function citationKeysAtPosition(source: string, position: number): string[] {
  const caret = clamp(position, 0, source.length);
  for (const match of source.matchAll(citationDirectivePattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (caret >= start && caret <= end) return parseCitationKeys(match[1] ?? "");
  }
  return [];
}

export function createCitationInsertion(source: string, position: number, citationKey: string): CitationInsertion | null {
  const key = citationKey.trim();
  if (!key || unsafeCitationKeyPattern.test(key)) return null;
  const index = clamp(position, 0, source.length);
  const before = source[index - 1];
  const after = source[index];
  const leading = before && !leadingBoundaryPattern.test(before) ? " " : "";
  const trailing = after && !trailingBoundaryPattern.test(after) ? " " : "";
  const text = `${leading}:cite[${key}]${trailing}`;
  return { index, text, caret: index + text.length - trailing.length };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
