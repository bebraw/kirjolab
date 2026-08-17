export function maskedLatex(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      for (let index = 0; index < line.length; index += 1) {
        if (line[index] !== "%") continue;
        let backslashes = 0;
        for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) backslashes += 1;
        if (backslashes % 2 === 0) return `${line.slice(0, index)}${" ".repeat(line.length - index)}`;
      }
      return line;
    })
    .join("\n");
}

const literalEnvironments = ["lstlisting", "minted", "verbatim"] as const;
const sourceControlEnvironments = ["comment", ...literalEnvironments] as const;
export type LatexLiteralEnvironment = (typeof literalEnvironments)[number];

export interface LatexDisplayMathOccurrence {
  readonly start: number;
  readonly end: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
}

export interface LatexLiteralEnvironmentOccurrence {
  readonly environment: LatexLiteralEnvironment;
  readonly start: number;
  readonly end: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly options?: string;
}

export interface LatexLiteralEnvironmentRange extends LatexLiteralEnvironmentOccurrence {
  readonly closed: boolean;
}

export interface LatexSourceProjections {
  readonly percentMasked: string;
  readonly active: string;
  readonly structural: string;
  readonly semantic: string;
  readonly literals: readonly LatexLiteralEnvironmentOccurrence[];
  readonly literalRanges: readonly LatexLiteralEnvironmentRange[];
}

export function latexSourceProjections(source: string): LatexSourceProjections {
  const percentMasked = maskedLatex(source);
  const controls = sourceControlOccurrences(source, percentMasked);
  const active = maskSourceRanges(
    percentMasked,
    controls.filter((occurrence) => occurrence.environment === "comment").map(({ start, end }) => ({ start, end })),
  );
  const literalRanges = controls.filter(isLiteralOccurrence).map(literalRange);
  const literals = controls.filter(isClosedLiteralOccurrence).map(literalOccurrence);
  const structural = maskSourceRanges(
    active,
    controls.filter((occurrence) => occurrence.environment !== "comment").map(({ bodyStart: start, bodyEnd: end }) => ({ start, end })),
  );
  return {
    percentMasked,
    active,
    structural,
    semantic: maskEnvironmentBodies(structural, ["tikzpicture"]),
    literals,
    literalRanges,
  };
}

export function structuralLatexSource(source: string): string {
  return latexSourceProjections(source).structural;
}

export function semanticLatexSource(source: string): string {
  return latexSourceProjections(source).semantic;
}

export function imageLatexSource(source: string): string {
  return semanticLatexSource(source);
}

export function literalEnvironmentOccurrences(
  source: string,
  percentMasked = maskedLatex(source),
  start = 0,
  end = source.length,
): readonly LatexLiteralEnvironmentOccurrence[] {
  return sourceControlOccurrences(source, percentMasked)
    .filter(isClosedLiteralOccurrence)
    .filter((occurrence) => occurrence.start >= start && occurrence.end <= end)
    .map(literalOccurrence);
}

export function displayMathOccurrences(source: string, start = 0, end = source.length): readonly LatexDisplayMathOccurrence[] {
  const occurrences: LatexDisplayMathOccurrence[] = [];
  let cursor = start;
  while (cursor < end) {
    const open = source.indexOf("\\[", cursor);
    if (open < 0 || open >= end) break;
    const close = source.indexOf("\\]", open + 2);
    if (close < 0 || close + 2 > end) break;
    occurrences.push({ start: open, end: close + 2, bodyStart: open + 2, bodyEnd: close });
    cursor = close + 2;
  }
  return occurrences;
}

function maskEnvironmentBodies(source: string, environments: readonly string[]): string {
  const ranges: SourceMaskRange[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const open = findEnvironmentBegin(source, environments, cursor);
    if (!open) break;
    const bodyStart = environmentBodyStart(source, open.end);
    const close = findEnvironmentCommand(source, "end", open.environment, bodyStart);
    const bodyEnd = close?.start ?? source.length;
    if (bodyStart < bodyEnd) ranges.push({ start: bodyStart, end: bodyEnd });
    cursor = close?.end ?? source.length;
  }
  return maskSourceRanges(source, ranges);
}

interface SourceMaskRange {
  readonly start: number;
  readonly end: number;
}

type SourceControlEnvironment = (typeof sourceControlEnvironments)[number];

interface SourceControlOccurrence {
  readonly environment: SourceControlEnvironment;
  readonly start: number;
  readonly end: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly closed: boolean;
  readonly options?: string;
}

function sourceControlOccurrences(source: string, percentMasked: string): readonly SourceControlOccurrence[] {
  const occurrences: SourceControlOccurrence[] = [];
  let cursor = 0;
  while (cursor < percentMasked.length) {
    const open = findEnvironmentBegin(percentMasked, sourceControlEnvironments, cursor);
    if (!open) break;
    const close = findEnvironmentCommand(percentMasked, "end", open.environment, open.end);
    const closed = close !== null;
    const bodyEnd = close?.start ?? percentMasked.length;
    let bodyStart = open.end;
    let options: string | undefined;
    if (open.environment !== "comment" && percentMasked[bodyStart] === "[") {
      const optionsEnd = balancedLatexGroupEnd(percentMasked, bodyStart, "[", "]", bodyEnd);
      if (optionsEnd !== null) {
        options = source.slice(bodyStart + 1, optionsEnd - 1);
        bodyStart = optionsEnd;
      }
    }
    occurrences.push({
      environment: open.environment,
      start: open.start,
      end: close?.end ?? percentMasked.length,
      bodyStart,
      bodyEnd,
      closed,
      ...(options !== undefined ? { options } : {}),
    });
    cursor = close?.end ?? percentMasked.length;
  }
  return occurrences;
}

function isClosedLiteralOccurrence(
  occurrence: SourceControlOccurrence,
): occurrence is SourceControlOccurrence & { readonly environment: LatexLiteralEnvironment; readonly closed: true } {
  return occurrence.environment !== "comment" && occurrence.closed;
}

function isLiteralOccurrence(
  occurrence: SourceControlOccurrence,
): occurrence is SourceControlOccurrence & { readonly environment: LatexLiteralEnvironment } {
  return occurrence.environment !== "comment";
}

function literalRange(
  occurrence: SourceControlOccurrence & { readonly environment: LatexLiteralEnvironment },
): LatexLiteralEnvironmentRange {
  return {
    ...literalOccurrenceFields(occurrence),
    closed: occurrence.closed,
  };
}

function literalOccurrence(
  occurrence: SourceControlOccurrence & { readonly environment: LatexLiteralEnvironment; readonly closed: true },
): LatexLiteralEnvironmentOccurrence {
  return literalOccurrenceFields(occurrence);
}

function literalOccurrenceFields(
  occurrence: SourceControlOccurrence & { readonly environment: LatexLiteralEnvironment },
): LatexLiteralEnvironmentOccurrence {
  return {
    environment: occurrence.environment,
    start: occurrence.start,
    end: occurrence.end,
    bodyStart: occurrence.bodyStart,
    bodyEnd: occurrence.bodyEnd,
    ...(occurrence.options !== undefined ? { options: occurrence.options } : {}),
  };
}

interface EnvironmentCommandOccurrence {
  readonly start: number;
  readonly end: number;
}

interface EnvironmentBeginOccurrence<Environment extends string = string> extends EnvironmentCommandOccurrence {
  readonly environment: Environment;
}

interface CommandSearchPosition {
  readonly start: number;
  readonly brace: number;
  readonly next: number;
}

function findEnvironmentBegin<Environment extends string>(
  source: string,
  environments: readonly Environment[],
  start: number,
): EnvironmentBeginOccurrence<Environment> | null {
  const commandText = "\\begin";
  let cursor = start;
  while (cursor < source.length) {
    const position = findCommandPosition(source, commandText, cursor);
    if (!position) return null;
    if (source[position.brace] === "{") {
      const environment = environments.find(
        (candidate) => source.startsWith(candidate, position.brace + 1) && source[position.brace + 1 + candidate.length] === "}",
      );
      if (environment) return { start: position.start, end: position.brace + environment.length + 2, environment };
    }
    cursor = position.next;
  }
  return null;
}

function findEnvironmentCommand(
  source: string,
  command: "begin" | "end",
  environment: string,
  start: number,
): EnvironmentCommandOccurrence | null {
  const commandText = `\\${command}`;
  let cursor = start;
  while (cursor < source.length) {
    const position = findCommandPosition(source, commandText, cursor);
    if (!position) return null;
    const environmentStart = position.brace + 1;
    const environmentEnd = environmentStart + environment.length;
    if (source[position.brace] === "{" && source.startsWith(environment, environmentStart) && source[environmentEnd] === "}") {
      return { start: position.start, end: environmentEnd + 1 };
    }
    cursor = position.next;
  }
  return null;
}

function findCommandPosition(source: string, command: string, start: number): CommandSearchPosition | null {
  const commandStart = source.indexOf(command, start);
  if (commandStart < 0) return null;
  const brace = skipWhitespace(source, commandStart + command.length);
  return { start: commandStart, brace, next: Math.max(brace, commandStart + command.length) };
}

function environmentBodyStart(source: string, beginEnd: number): number {
  let bodyStart = beginEnd;
  if (source[bodyStart] === "[") {
    const optional = flatDelimitedGroupEnd(source, bodyStart, "[", "]", true);
    if (optional === null) return bodyStart;
    bodyStart = optional;
  }
  const bracedStart = skipWhitespace(source, bodyStart);
  if (source[bracedStart] !== "{") return bodyStart;
  return flatDelimitedGroupEnd(source, bracedStart, "{", "}", false) ?? bodyStart;
}

function flatDelimitedGroupEnd(source: string, start: number, open: "[" | "{", close: "]" | "}", allowNewlines: boolean): number | null {
  if (source[start] !== open) return null;
  for (let cursor = start + 1; cursor < source.length; cursor += 1) {
    const character = source[cursor]!;
    if ((!allowNewlines && (character === "\r" || character === "\n")) || character === open) return null;
    if (character === close) return cursor + 1;
  }
  return null;
}

export function balancedLatexGroupEnd(source: string, start: number, open: "[" | "{", close: "]" | "}", limit: number): number | null {
  if (source[start] !== open) return null;
  let depth = 1;
  for (let cursor = start + 1; cursor < limit; cursor += 1) {
    if (source[cursor] === open) depth += 1;
    else if (source[cursor] === close) depth -= 1;
    if (depth === 0) return cursor + 1;
  }
  return null;
}

export function latexDocumentWindow(
  source: string,
  active = structuralLatexSource(source),
): { readonly start: number; readonly end: number } {
  const begin = /\\begin\s*\{document\}/u.exec(active);
  if (!begin) return { start: 0, end: source.length };
  const start = begin.index + begin[0].length;
  const end = /\\end\s*\{document\}/u.exec(active.slice(start));
  return { start, end: end ? start + end.index : source.length };
}

function skipWhitespace(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length && /\s/u.test(source[cursor]!)) cursor += 1;
  return cursor;
}

function maskSourceRanges(source: string, ranges: readonly SourceMaskRange[]): string {
  if (ranges.length === 0) return source;
  const merged: SourceMaskRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end) {
      merged.push(range);
      continue;
    }
    if (range.end > previous.end) merged[merged.length - 1] = { start: previous.start, end: range.end };
  }
  const parts: string[] = [];
  let cursor = 0;
  for (const range of merged) {
    parts.push(source.slice(cursor, range.start), source.slice(range.start, range.end).replace(/[^\r\n]/g, " "));
    cursor = range.end;
  }
  parts.push(source.slice(cursor));
  return parts.join("");
}
