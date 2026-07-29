import { normalizeDoi } from "../../domain/bibliography";
import type { PdfReferenceAnalysisCandidate, PdfReferenceAnalysisResult } from "../../domain/reference-library/artifact-analysis";
import type { PdfAnalysisPage } from "./contracts";

const maximumCandidates = 128;
const referenceHeading = /^(?:\d+(?:\.\d+)*\.?\s+)?(?:references(?: and notes)?|bibliography|works cited|literature cited):?\s*$/iu;
const followingSectionHeading = /^(?:appendix|appendices|acknowledg(?:e)?ments?|author contributions?|supplement(?:ary|al).*)\s*$/iu;
const numberedEntry = /^(?:\[\d{1,4}\]|\d{1,4}[.)])\s+/u;
const publicationYear = /\b(?:18|19|20)\d{2}[a-z]?\b/iu;
const doiPattern = /10\.\d{4,9}\/[._;()/:a-z0-9-]+/iu;
const urlPattern = /https?:\/\/[^\s<>]+/iu;

interface ReferenceEntry {
  readonly page: number;
  readonly raw: string;
  readonly numbered: boolean;
}

export function analyzePdfReferencePages(
  pages: readonly Pick<PdfAnalysisPage, "page" | "text">[],
  pagesTotal: number,
): PdfReferenceAnalysisResult {
  const normalizedPages = pages.map((page) => ({
    page: page.page,
    lines: page.text.split("\n"),
  }));
  const start = normalizedPages
    .flatMap((page) => page.lines.map((line, lineIndex) => ({ line: normalizeLine(line), lineIndex, page })))
    .find(({ line }) => referenceHeading.test(line));
  if (!start) {
    return { candidates: [], pagesScanned: pages.length, pagesTotal, referencesStartPage: null, truncated: pagesTotal > pages.length };
  }

  const referenceLines: { line: string; page: number }[] = [];
  let started = false;
  for (const page of normalizedPages) {
    if (page.page < start.page.page) continue;
    const firstLine = page.page === start.page.page ? start.lineIndex + 1 : 0;
    for (const source of page.lines.slice(firstLine)) {
      const line = normalizeLine(source);
      if (!line) continue;
      if (started && followingSectionHeading.test(line)) {
        return referenceResult(referenceLines, pages.length, pagesTotal, start.page.page, pagesTotal > pages.length);
      }
      started = true;
      referenceLines.push({ line, page: page.page });
    }
  }
  return referenceResult(referenceLines, pages.length, pagesTotal, start.page.page, pagesTotal > pages.length);
}

function referenceResult(
  lines: readonly { line: string; page: number }[],
  pagesScanned: number,
  pagesTotal: number,
  referencesStartPage: number,
  pagesTruncated: boolean,
): PdfReferenceAnalysisResult {
  const entries = splitReferenceEntries(lines);
  const candidates = deduplicateReferences(
    entries.map(referenceCandidate).filter((value): value is PdfReferenceAnalysisCandidate => value !== null),
  );
  return {
    candidates: candidates.slice(0, maximumCandidates),
    pagesScanned,
    pagesTotal,
    referencesStartPage,
    truncated: pagesTruncated || candidates.length > maximumCandidates,
  };
}

function splitReferenceEntries(lines: readonly { line: string; page: number }[]): ReferenceEntry[] {
  const entries: ReferenceEntry[] = [];
  let current: { lines: string[]; numbered: boolean; page: number } | null = null;
  const flush = (): void => {
    if (!current) return;
    entries.push({ page: current.page, raw: current.lines.join(" ").replaceAll(/\s+/gu, " ").trim(), numbered: current.numbered });
    current = null;
  };
  for (const { line, page } of lines) {
    const numbered = numberedEntry.test(line);
    const unnumberedStart = !numbered && publicationYear.test(line) && likelyAuthorStart(line);
    if (numbered || (unnumberedStart && current && publicationYear.test(current.lines.join(" ")))) flush();
    if (!current) current = { lines: [], numbered, page };
    current.lines.push(line);
  }
  flush();
  return entries;
}

function referenceCandidate(entry: ReferenceEntry): PdfReferenceAnalysisCandidate | null {
  const raw = entry.raw.replace(numberedEntry, "").trim().slice(0, 8_000);
  const doiMatch = doiPattern.exec(raw);
  const doi = doiMatch ? normalizeDoi(doiMatch[0].replace(/[),.;]+$/u, "")) : "";
  const yearMatch = publicationYear.exec(raw);
  const year = yearMatch?.[0] ?? "";
  const urlMatch = urlPattern.exec(raw);
  const url = (urlMatch?.[0] ?? "").replace(/[),.;]+$/u, "").slice(0, 2_000);
  const confidence = Math.min(1, 0.4 + (entry.numbered ? 0.1 : 0) + (year ? 0.2 : 0) + (doi ? 0.3 : 0) + (url ? 0.1 : 0));
  if (raw.length < 12 || confidence < 0.55) return null;
  const beforeYear = yearMatch
    ? raw
        .slice(0, yearMatch.index)
        .replace(/[.,;(\s]+$/u, "")
        .trim()
    : "";
  const afterYear = yearMatch
    ? raw
        .slice(yearMatch.index + year.length)
        .replace(/^[).,;:\s]+/u, "")
        .trim()
    : raw;
  return {
    id: doi ? `doi:${doi}` : `pdf-reference:${entry.page}:${stableTextKey(raw)}`,
    page: entry.page,
    raw,
    title: titleFromCitation(afterYear, doi, url),
    authors: beforeYear ? splitAuthors(beforeYear) : [],
    year,
    doi,
    url,
    confidence,
  };
}

function titleFromCitation(value: string, doi: string, url: string): string {
  let candidate = value;
  if (doi) candidate = candidate.replace(new RegExp(escapeRegExp(doi), "iu"), "");
  if (url) candidate = candidate.replace(url, "");
  candidate = candidate.replace(/\bdoi\s*:\s*$/iu, "").trim();
  const sentence = candidate.split(/\.\s+(?=[A-Z])/u)[0] ?? candidate;
  return sentence
    .replace(/^["“”']|[."“”']$/gu, "")
    .trim()
    .slice(0, 2_000);
}

function splitAuthors(value: string): string[] {
  const authors = value
    .split(/\s+(?:and|&)\s+|\s*;\s*/iu)
    .map((author) => author.trim())
    .filter(Boolean);
  return (authors.length > 0 ? authors : [value]).slice(0, 50).map((author) => author.slice(0, 500));
}

function likelyAuthorStart(line: string): boolean {
  return /^[A-ZÀ-ÖØ-Þ][\p{L}'’-]+(?:,|\s+[A-Z])/u.test(line);
}

function deduplicateReferences(candidates: readonly PdfReferenceAnalysisCandidate[]): PdfReferenceAnalysisCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.doi ? `doi:${candidate.doi}` : candidate.raw.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stableTextKey(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeLine(value: string): string {
  return value.replaceAll(/\s+/gu, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
