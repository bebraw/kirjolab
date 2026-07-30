export interface BibTeXEntry {
  citationKey: string;
  fields: Record<string, string>;
  type: string;
}

export interface BibTeXPublicationProjection {
  readonly citationKey: string;
  readonly type: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly venue: string;
  readonly doi: string;
  readonly url: string;
  readonly abstract: string;
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

const bibTeXAccentMarks: Readonly<Record<string, string>> = {
  '"': "\u0308",
  "'": "\u0301",
  "`": "\u0300",
  "^": "\u0302",
  "~": "\u0303",
  "=": "\u0304",
  ".": "\u0307",
  u: "\u0306",
  v: "\u030c",
  H: "\u030b",
  c: "\u0327",
  k: "\u0328",
  r: "\u030a",
};

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

export function bibTeXDisplayText(value: string): string {
  const decodeAccent = (_match: string, accent: string, letter: string): string =>
    `${letter}${bibTeXAccentMarks[accent] ?? ""}`.normalize("NFC");
  const decoded = value
    .replace(/\{\\(["'`^~=.uvHckr])([A-Za-z])\}/gu, decodeAccent)
    .replace(/\\(["'`^~=.uvHckr])\{([A-Za-z])\}/gu, decodeAccent)
    .replace(/\\(LaTeX|TeX)\b/gu, "$1")
    .replaceAll("\\textendash", "–")
    .replaceAll("\\textemdash", "—");
  let display = "";
  for (let index = 0; index < decoded.length; index += 1) {
    const character = decoded[index] ?? "";
    const escaped = decoded[index + 1];
    if (character === "\\" && escaped && "{}%&_#".includes(escaped)) {
      display += escaped;
      index += 1;
    } else if (character !== "{" && character !== "}") {
      display += character;
    }
  }
  return display.replaceAll(/\s+/gu, " ").trim();
}

export function projectBibTeXPublication(entry: BibTeXEntry): BibTeXPublicationProjection {
  return {
    citationKey: entry.citationKey,
    type: entry.type,
    title: entry.fields.title ?? "Untitled publication",
    authors: (entry.fields.author ?? "")
      .split(/\s+and\s+/iu)
      .map((author) => author.trim())
      .filter(Boolean),
    year: entry.fields.year ?? "",
    venue: entry.fields.journal ?? entry.fields.booktitle ?? entry.fields.publisher ?? "",
    doi: normalizeDoi(entry.fields.doi ?? ""),
    url: entry.fields.url ?? "",
    abstract: entry.fields.abstract ?? "",
  };
}

export function bibTeXPublicationProjectionsEqual(left: BibTeXPublicationProjection, right: BibTeXPublicationProjection): boolean {
  return (
    left.citationKey === right.citationKey &&
    left.type === right.type &&
    left.title === right.title &&
    left.authors.length === right.authors.length &&
    left.authors.every((author, index) => author === right.authors[index]) &&
    left.year === right.year &&
    left.venue === right.venue &&
    left.doi === right.doi &&
    left.url === right.url &&
    left.abstract === right.abstract
  );
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
