export type PublicationTableAlignment = "left" | "center" | "right";

export interface PublicationTable {
  readonly startLine: number;
  readonly endLine: number;
  readonly header: readonly string[];
  readonly alignments: readonly PublicationTableAlignment[];
  readonly rows: readonly (readonly string[])[];
}

export interface PublicationFootnote {
  readonly id: string;
  readonly number: number;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface PublicationStructure {
  readonly tablesByStartLine: ReadonlyMap<number, PublicationTable>;
  readonly tableLines: ReadonlySet<number>;
  readonly footnotesById: ReadonlyMap<string, PublicationFootnote>;
  readonly footnoteDefinitionLines: ReadonlySet<number>;
  readonly footnotes: readonly PublicationFootnote[];
}

interface FootnoteDefinition {
  readonly id: string;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
}

const fenceLine = /^[ \t]*```/u;
const footnoteDefinition = /^\[\^(?<id>[^\]\s]{1,100})\]:[ \t]*(?<content>.*)$/u;
const footnoteReference = /(?<!\\)\[\^(?<id>[^\]\s]{1,100})\]/gu;

export function projectPublicationStructure(markdown: string): PublicationStructure {
  const lines = markdown.split(/\r?\n/u);
  const literalLines = fencedLiteralLines(lines);
  const definitions = new Map<string, FootnoteDefinition>();
  const footnoteDefinitionLines = new Set<number>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (literalLines.has(lineIndex)) continue;
    const match = footnoteDefinition.exec(lines[lineIndex] ?? "");
    const id = match?.groups?.id;
    if (!id || definitions.has(id)) continue;
    const content = [match.groups?.content ?? ""];
    const startLine = lineIndex;
    footnoteDefinitionLines.add(lineIndex);
    while (lineIndex + 1 < lines.length && /^(?: {2,}|\t)\S/u.test(lines[lineIndex + 1] ?? "")) {
      lineIndex += 1;
      footnoteDefinitionLines.add(lineIndex);
      content.push((lines[lineIndex] ?? "").trim());
    }
    definitions.set(id, { id, content: content.filter(Boolean).join(" "), startLine, endLine: lineIndex });
  }

  const orderedIds: string[] = [];
  const seenIds = new Set<string>();
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (literalLines.has(lineIndex) || footnoteDefinitionLines.has(lineIndex)) continue;
    for (const match of (lines[lineIndex] ?? "").matchAll(footnoteReference)) {
      const id = match.groups?.id;
      if (!id || seenIds.has(id) || !definitions.has(id)) continue;
      seenIds.add(id);
      orderedIds.push(id);
    }
  }
  const footnotes = orderedIds.map((id, index) => {
    const definition = definitions.get(id)!;
    return { ...definition, number: index + 1 } satisfies PublicationFootnote;
  });
  const footnotesById = new Map(footnotes.map((note) => [note.id, note]));

  const tablesByStartLine = new Map<number, PublicationTable>();
  const tableLines = new Set<number>();
  for (let lineIndex = 0; lineIndex + 1 < lines.length; lineIndex += 1) {
    if (literalLines.has(lineIndex) || footnoteDefinitionLines.has(lineIndex)) continue;
    const table = tableAt(lines, lineIndex, literalLines, footnoteDefinitionLines);
    if (!table) continue;
    tablesByStartLine.set(lineIndex, table);
    for (let consumed = table.startLine; consumed <= table.endLine; consumed += 1) tableLines.add(consumed);
    lineIndex = table.endLine;
  }

  return { tablesByStartLine, tableLines, footnotesById, footnoteDefinitionLines, footnotes };
}

export function replacePublicationFootnoteReferences(
  value: string,
  footnotes: ReadonlyMap<string, PublicationFootnote>,
  replacement: (footnote: PublicationFootnote) => string,
): string {
  return value.replace(footnoteReference, (match, ...values: unknown[]) => {
    const groups = values.at(-1);
    const id = isStringRecord(groups) ? groups.id : undefined;
    const note = id ? footnotes.get(id) : undefined;
    return note ? replacement(note) : match;
  });
}

function fencedLiteralLines(lines: readonly string[]): Set<number> {
  const literalLines = new Set<number>();
  let literal = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (fenceLine.test(lines[lineIndex] ?? "")) {
      literalLines.add(lineIndex);
      literal = !literal;
    } else if (literal) literalLines.add(lineIndex);
  }
  return literalLines;
}

function tableAt(
  lines: readonly string[],
  startLine: number,
  literalLines: ReadonlySet<number>,
  footnoteDefinitionLines: ReadonlySet<number>,
): PublicationTable | undefined {
  const header = splitPipeRow(lines[startLine] ?? "");
  const delimiter = splitPipeRow(lines[startLine + 1] ?? "");
  if (!header || !delimiter || header.length !== delimiter.length) return undefined;
  const alignments = delimiter.map(delimiterAlignment);
  if (alignments.some((alignment) => alignment === undefined)) return undefined;

  const rows: string[][] = [];
  let endLine = startLine + 1;
  for (let lineIndex = startLine + 2; lineIndex < lines.length; lineIndex += 1) {
    if (literalLines.has(lineIndex) || footnoteDefinitionLines.has(lineIndex)) break;
    const row = splitPipeRow(lines[lineIndex] ?? "");
    if (!row || row.length > header.length) break;
    rows.push([...row, ...Array.from({ length: header.length - row.length }, () => "")]);
    endLine = lineIndex;
  }
  return {
    startLine,
    endLine,
    header,
    alignments: alignments as PublicationTableAlignment[],
    rows,
  };
}

function splitPipeRow(value: string): string[] | undefined {
  let source = value.trim();
  if (!source.includes("|")) return undefined;
  if (source.startsWith("|")) source = source.slice(1);
  if (hasUnescapedTrailingPipe(source)) source = source.slice(0, -1);

  const cells: string[] = [];
  let cell = "";
  let separatorCount = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    const next = source[index + 1];
    if (character === "\\" && next === "|") {
      cell += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
      separatorCount += 1;
    } else cell += character;
  }
  cells.push(cell.trim());
  return separatorCount > 0 || value.trim().startsWith("|") ? cells : undefined;
}

function hasUnescapedTrailingPipe(value: string): boolean {
  if (!value.endsWith("|")) return false;
  let backslashes = 0;
  for (let index = value.length - 2; index >= 0 && value[index] === "\\"; index -= 1) backslashes += 1;
  return backslashes % 2 === 0;
}

function delimiterAlignment(value: string): PublicationTableAlignment | undefined {
  if (!/^:?-{3,}:?$/u.test(value)) return undefined;
  if (value.startsWith(":") && value.endsWith(":")) return "center";
  if (value.endsWith(":")) return "right";
  return "left";
}

function isStringRecord(value: unknown): value is Record<string, string | undefined> {
  return typeof value === "object" && value !== null;
}
