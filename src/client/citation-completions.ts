export interface CitationCompletionContext {
  readonly query: string;
  readonly start: number;
  readonly end: number;
}

export interface CitationCompletionCandidate {
  readonly key: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly scope: "project" | "library";
  readonly referenceId: string;
}

export function citationCompletionContext(source: string, position: number): CitationCompletionContext | null {
  const caret = Math.max(0, Math.min(position, source.length));
  const before = source.slice(0, caret);
  const match = /(?:^|[^:]):(?:cite|citet|citep)\[([^\]\r\n]*)$/iu.exec(before);
  if (!match) return null;

  const content = match[1] ?? "";
  const tokenOffset = content.lastIndexOf(",") + 1;
  const token = content.slice(tokenOffset);
  const leadingWhitespace = /^\s*/u.exec(token)?.[0].length ?? 0;
  const start = caret - token.length + leadingWhitespace;
  const trailing = /^[^,\]\r\n]*/u.exec(source.slice(caret))?.[0] ?? "";
  const end = caret + trailing.length;
  const query = source.slice(start, caret).trim();
  return /\s/u.test(query) ? null : { query, start, end };
}

export function rankCitationCompletionCandidates(
  candidates: readonly CitationCompletionCandidate[],
  query: string,
  limit = 8,
): CitationCompletionCandidate[] {
  const normalizedQuery = normalize(query);
  return candidates
    .map((candidate, index) => ({ candidate, index, score: citationCandidateScore(candidate, normalizedQuery) }))
    .filter((item) => item.score !== null)
    .sort(
      (left, right) =>
        (left.score ?? 0) - (right.score ?? 0) ||
        Number(left.candidate.scope === "library") - Number(right.candidate.scope === "library") ||
        left.candidate.key.localeCompare(right.candidate.key) ||
        left.index - right.index,
    )
    .slice(0, limit)
    .map((item) => item.candidate);
}

export function applyCitationCompletion(source: string, context: CitationCompletionContext, key: string): string {
  return `${source.slice(0, context.start)}${key}${source.slice(context.end)}`;
}

function citationCandidateScore(candidate: CitationCompletionCandidate, query: string): number | null {
  if (!query) return candidate.scope === "project" ? 50 : 60;
  const key = normalize(candidate.key);
  if (key === query) return 0;
  if (key.startsWith(query)) return 10;
  if (key.includes(query)) return 20;
  const authors = normalize(candidate.authors.join(" "));
  const title = normalize(candidate.title);
  if (authors.startsWith(query)) return 30;
  if (authors.includes(query)) return 35;
  if (title.startsWith(query)) return 40;
  if (title.includes(query)) return 45;
  return null;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
