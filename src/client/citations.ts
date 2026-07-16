export interface CitationInsertion {
  readonly index: number;
  readonly text: string;
  readonly caret: number;
}

export interface CitationContext {
  readonly keys: string[];
  readonly locator?: string;
}

const citationDirectivePattern = /(?<!:):(?:cite|citet|citep)\[([^\]]*)\](?:\{[^}]*\})?/giu;
const unsafeCitationKeyPattern = /[\s,[\]]/u;
const unsafeCitationLocatorPattern = /["{}\\]/u;
const citationLocatorAttributePattern = /\blocator\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))/iu;
const citationPageLocatorPattern = /^(?:(?:p|pp|page|pages)\.?\s*)?(\d+)(?:\s*[-\u2013\u2014]\s*(\d+))?$/iu;
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
  return citationContextAtPosition(source, position)?.keys ?? [];
}

export function citationContextAtPosition(source: string, position: number): CitationContext | null {
  const caret = clamp(position, 0, source.length);
  for (const match of source.matchAll(citationDirectivePattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (caret < start || caret > end) continue;
    const keys = parseCitationKeys(match[1] ?? "");
    if (keys.length === 0) return null;
    const locatorMatch = citationLocatorAttributePattern.exec(match[0]);
    const locator = locatorMatch?.[1] ?? locatorMatch?.[2] ?? locatorMatch?.[3];
    return { keys, ...(locator?.trim() ? { locator: locator.trim() } : {}) };
  }
  return null;
}

export function citationPageFromLocator(locator: string | undefined): number | null {
  if (!locator) return null;
  const match = citationPageLocatorPattern.exec(locator.trim());
  if (!match?.[1]) return null;
  const page = Number(match[1]);
  const endPage = match[2] ? Number(match[2]) : page;
  return Number.isSafeInteger(page) && Number.isSafeInteger(endPage) && page > 0 && endPage >= page ? page : null;
}

export function createCitationInsertion(source: string, position: number, citationKey: string, locator?: string): CitationInsertion | null {
  const key = citationKey.trim();
  if (!key || unsafeCitationKeyPattern.test(key)) return null;
  const normalizedLocator = locator?.trim();
  if (normalizedLocator && !isSafeCitationLocator(normalizedLocator)) return null;
  const index = clamp(position, 0, source.length);
  const before = source[index - 1];
  const after = source[index];
  const leading = before && !leadingBoundaryPattern.test(before) ? " " : "";
  const trailing = after && !trailingBoundaryPattern.test(after) ? " " : "";
  const attributes = normalizedLocator ? `{locator="${normalizedLocator}"}` : "";
  const text = `${leading}:cite[${key}]${attributes}${trailing}`;
  return { index, text, caret: index + text.length - trailing.length };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isSafeCitationLocator(locator: string): boolean {
  return (
    locator.length <= 128 &&
    !unsafeCitationLocatorPattern.test(locator) &&
    ![...locator].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f);
    })
  );
}
