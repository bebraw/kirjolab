export interface BibTeXEntry {
  citationKey: string;
  fields: Record<string, string>;
  type: string;
}

const preferredFields = [
  "author",
  "title",
  "year",
  "journal",
  "booktitle",
  "publisher",
  "volume",
  "number",
  "pages",
  "doi",
  "url",
  "abstract",
];

export function parseBibTeX(source: string): BibTeXEntry[] {
  const entries: BibTeXEntry[] = [];
  const header = /@([a-z]+)\s*([({])/giu;
  let consumedUntil = 0;
  for (const match of source.matchAll(header)) {
    const type = match[1]?.toLowerCase();
    const opening = match[2];
    if (!type || !opening || match.index === undefined || match.index < consumedUntil) continue;
    const bodyStart = match.index + match[0].length;
    const bodyEnd = findEntryEnd(source, bodyStart, opening === "{" ? "}" : ")");
    if (bodyEnd < 0) continue;
    consumedUntil = bodyEnd + 1;
    if (type === "comment" || type === "preamble" || type === "string") continue;
    const body = source.slice(bodyStart, bodyEnd);
    const keyEnd = findTopLevelComma(body);
    if (keyEnd < 0) continue;
    const citationKey = body.slice(0, keyEnd).trim();
    if (!/^[a-z0-9:._+-]{1,200}$/iu.test(citationKey)) continue;
    entries.push({ type, citationKey, fields: parseFields(body.slice(keyEnd + 1)) });
  }
  return entries;
}

export function mergeBibTeX(current: string, incoming: string): { entries: BibTeXEntry[]; source: string } {
  const byKey = new Map(parseBibTeX(current).map((entry) => [entry.citationKey.toLowerCase(), entry]));
  for (const entry of parseBibTeX(incoming)) byKey.set(entry.citationKey.toLowerCase(), entry);
  const entries = [...byKey.values()].sort((left, right) => left.citationKey.localeCompare(right.citationKey));
  return { entries, source: serializeBibTeX(entries) };
}

export function serializeBibTeX(entries: BibTeXEntry[]): string {
  if (entries.length === 0) return "";
  return `${entries
    .map((entry) => {
      const names = Object.keys(entry.fields).sort(fieldOrder);
      const fields = names.map((name) => `  ${name} = {${entry.fields[name] ?? ""}}`).join(",\n");
      return `@${entry.type}{${entry.citationKey},\n${fields}\n}`;
    })
    .join("\n\n")}\n`;
}

export function normalizeDoi(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")
    .toLowerCase();
}

function parseFields(source: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let index = 0;
  while (index < source.length) {
    index = skipSeparators(source, index);
    const nameMatch = /^[a-z][a-z0-9_-]*/iu.exec(source.slice(index));
    if (!nameMatch?.[0]) break;
    const name = nameMatch[0].toLowerCase();
    index += nameMatch[0].length;
    index = skipWhitespace(source, index);
    if (source[index] !== "=") break;
    index = skipWhitespace(source, index + 1);
    const parsed = readValue(source, index);
    if (!parsed) break;
    fields[name] = parsed.value.replaceAll(/\s+/gu, " ").trim();
    index = parsed.end;
  }
  return fields;
}

function readValue(source: string, start: number): { value: string; end: number } | null {
  const opening = source[start];
  if (opening === "{") {
    let depth = 1;
    for (let index = start + 1; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      if (depth === 0) return { value: source.slice(start + 1, index), end: index + 1 };
    }
    return null;
  }
  if (opening === '"') {
    for (let index = start + 1; index < source.length; index += 1) {
      if (source[index] === '"' && source[index - 1] !== "\\") return { value: source.slice(start + 1, index), end: index + 1 };
    }
    return null;
  }
  const end = source.indexOf(",", start);
  return { value: source.slice(start, end < 0 ? source.length : end), end: end < 0 ? source.length : end };
}

function findEntryEnd(source: string, start: number, closing: string): number {
  let depth = 1;
  let quoted = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && source[index - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (character === "{") depth += 1;
    if (character === "}" || (closing === ")" && character === ")")) depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function findTopLevelComma(value: string): number {
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"' && value[index - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (character === "," && depth === 0) return index;
  }
  return -1;
}

function skipSeparators(value: string, start: number): number {
  let index = start;
  while (index < value.length && (value[index] === "," || /\s/u.test(value[index] ?? ""))) index += 1;
  return index;
}

function skipWhitespace(value: string, start: number): number {
  let index = start;
  while (index < value.length && /\s/u.test(value[index] ?? "")) index += 1;
  return index;
}

function fieldOrder(left: string, right: string): number {
  const leftIndex = preferredFields.indexOf(left);
  const rightIndex = preferredFields.indexOf(right);
  if (leftIndex >= 0 || rightIndex >= 0)
    return (leftIndex < 0 ? preferredFields.length : leftIndex) - (rightIndex < 0 ? preferredFields.length : rightIndex);
  return left.localeCompare(right);
}
