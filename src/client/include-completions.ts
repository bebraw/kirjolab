import { projectMarkdownComments } from "../domain/markdown-comments";

export interface IncludeCompletionContext {
  readonly query: string;
  readonly start: number;
  readonly end: number;
}

export interface IncludeCompletionCandidate {
  readonly reference: string;
  readonly path: string;
}

export function includeCompletionContext(source: string, position: number): IncludeCompletionContext | null {
  const caret = Math.max(0, Math.min(position, source.length));
  const lineStart = Math.max(source.lastIndexOf("\n", caret - 1), source.lastIndexOf("\r", caret - 1)) + 1;
  const before = projectMarkdownComments(source).masked.slice(lineStart, caret);
  const match = /^[ \t]*::include\[([^\]\r\n]*)$/u.exec(before);
  if (!match) return null;
  const token = match[1] ?? "";
  const leadingWhitespace = /^\s*/u.exec(token)?.[0].length ?? 0;
  const start = caret - token.length + leadingWhitespace;
  const trailing = /^[^\]\r\n]*/u.exec(source.slice(caret))?.[0] ?? "";
  return { query: source.slice(start, caret).trim(), start, end: caret + trailing.length };
}

export function rankIncludeCompletionCandidates(
  candidates: readonly IncludeCompletionCandidate[],
  query: string,
  limit = 8,
): IncludeCompletionCandidate[] {
  const normalizedQuery = normalize(query);
  return candidates
    .map((candidate) => ({ candidate, score: includeCandidateScore(candidate, normalizedQuery) }))
    .filter((item) => item.score !== null)
    .sort(
      (left, right) =>
        (left.score ?? 0) - (right.score ?? 0) ||
        left.candidate.reference.localeCompare(right.candidate.reference) ||
        left.candidate.path.localeCompare(right.candidate.path),
    )
    .slice(0, limit)
    .map((item) => item.candidate);
}

function includeCandidateScore(candidate: IncludeCompletionCandidate, query: string): number | null {
  if (!query) return 30;
  const reference = normalize(candidate.reference);
  const path = normalize(candidate.path);
  const name = path.split("/").at(-1) ?? path;
  if (reference === query) return 0;
  if (reference.startsWith(query)) return 10;
  if (reference.includes(query)) return 15;
  if (name.startsWith(query)) return 20;
  if (name.includes(query) || path.includes(query)) return 25;
  return null;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
