import { normalizeDoi } from "../../domain/reference-library/bibliography";
import type {
  PdfReferenceAnalysisCandidate,
  PdfReferenceAnalysisResult,
  PdfReferenceMention,
} from "../../domain/reference-library/artifact-analysis";
import type { PdfAnalysisPage } from "./contracts";

const maximumCandidates = 128;
const referenceHeading = /^(?:\d+(?:\.\d+)*\.?\s+)?(?:references(?: and notes)?|bibliography|works cited|literature cited):?\s*$/iu;
const followingSectionHeading = /^(?:appendix|appendices|acknowledg(?:e)?ments?|author contributions?|supplement(?:ary|al).*)\s*$/iu;
const bracketedEntry = /^\[\d{1,4}\]\s+/u;
const numberedEntry = /^(?:\[\d{1,4}\]|\d{1,4}[.)])\s+/u;
const publicationYear = /\b(?:18|19|20)\d{2}[a-z]?\b/iu;
const doiPattern = /10\.\d{4,9}\/[._;()/:a-z0-9-]+/iu;
const urlPattern = /https?:\/\/[^\s<>]+/iu;
const numericMention = /\[([\d\s,;–—-]{1,40})\]/gu;

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
        return referenceResult(referenceLines, normalizedPages, pages.length, pagesTotal, start.page.page, pagesTotal > pages.length);
      }
      started = true;
      referenceLines.push({ line, page: page.page });
    }
  }
  return referenceResult(referenceLines, normalizedPages, pages.length, pagesTotal, start.page.page, pagesTotal > pages.length);
}

function referenceResult(
  lines: readonly { line: string; page: number }[],
  pages: readonly { page: number; lines: readonly string[] }[],
  pagesScanned: number,
  pagesTotal: number,
  referencesStartPage: number,
  pagesTruncated: boolean,
): PdfReferenceAnalysisResult {
  const entries = splitReferenceEntries(lines);
  const candidates = deduplicateReferences(
    entries.map(referenceCandidate).filter((value): value is PdfReferenceAnalysisCandidate => value !== null),
  );
  const boundedCandidates = candidates.slice(0, maximumCandidates);
  return {
    candidates: boundedCandidates,
    mentions: extractReferenceMentions(pages, referencesStartPage, lines, boundedCandidates),
    pagesScanned,
    pagesTotal,
    referencesStartPage,
    truncated: pagesTruncated || candidates.length > maximumCandidates,
  };
}

function extractReferenceMentions(
  pages: readonly { readonly page: number; readonly lines: readonly string[] }[],
  referencesStartPage: number,
  entries: readonly { readonly line: string; readonly page: number }[],
  candidates: readonly PdfReferenceAnalysisCandidate[],
): PdfReferenceMention[] {
  const candidateEntries = splitReferenceEntries(entries);
  const byNumber = new Map<number, PdfReferenceAnalysisCandidate>();
  for (const [index, entry] of candidateEntries.entries()) {
    const number = referenceNumber(entry.raw);
    const candidate = candidates.find((item) => item.id === referenceCandidate(entry)?.id);
    if (number !== null && candidate) byNumber.set(number, candidate);
    else if (candidate && entry.numbered) byNumber.set(index + 1, candidate);
  }
  const mentions: PdfReferenceMention[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    if (page.page >= referencesStartPage) continue;
    for (const source of page.lines) {
      const line = normalizeLine(source);
      if (!line) continue;
      for (const match of line.matchAll(numericMention)) {
        for (const number of citationNumbers(match[1] ?? "")) {
          const candidate = byNumber.get(number);
          if (candidate) addMention(mentions, seen, candidate.id, page.page, match[0], line, "numeric", 0.95);
        }
      }
      for (const candidate of candidates) {
        const surname = candidate.authors[0] ? authorSurname(candidate.authors[0]) : "";
        if (!surname || !candidate.year) continue;
        const pattern = new RegExp(`\\b${escapeRegExp(surname)}(?:\\s+et\\s+al\\.)?[,\\s]+${escapeRegExp(candidate.year)}\\b`, "iu");
        const match = pattern.exec(line);
        if (match) addMention(mentions, seen, candidate.id, page.page, match[0], line, "author-year", 0.8);
      }
      if (mentions.length >= 256) return mentions;
    }
  }
  return mentions;
}

function addMention(
  mentions: PdfReferenceMention[],
  seen: Set<string>,
  candidateId: string,
  page: number,
  raw: string,
  context: string,
  style: PdfReferenceMention["style"],
  confidence: number,
): void {
  const key = `${candidateId}:${page}:${raw}`;
  if (seen.has(key) || mentions.length >= 256) return;
  seen.add(key);
  mentions.push({
    id: `pdf-mention:${page}:${stableTextKey(key)}`,
    candidateId,
    page,
    raw: raw.slice(0, 2_000),
    context: context.slice(0, 2_000),
    style,
    confidence,
  });
}

function referenceNumber(raw: string): number | null {
  const match = /^(?:\[(\d{1,4})\]|(\d{1,4})[.)])\s+/u.exec(raw);
  const number = Number.parseInt(match?.[1] ?? match?.[2] ?? "", 10);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function citationNumbers(value: string): number[] {
  const numbers = new Set<number>();
  for (const part of value.split(/[,;]/u)) {
    const range = /^\s*(\d{1,4})\s*[–—-]\s*(\d{1,4})\s*$/u.exec(part);
    if (range) {
      const start = Number.parseInt(range[1] ?? "", 10);
      const end = Number.parseInt(range[2] ?? "", 10);
      if (end >= start && end - start <= 20) for (let number = start; number <= end; number += 1) numbers.add(number);
      continue;
    }
    const number = Number.parseInt(part.trim(), 10);
    if (Number.isInteger(number) && number > 0) numbers.add(number);
  }
  return [...numbers];
}

function authorSurname(author: string): string {
  const normalized = author.replaceAll(/[{}]/gu, "").trim();
  if (normalized.includes(",")) return normalized.split(",")[0]?.trim() ?? "";
  return normalized.split(/\s+/u).at(-1) ?? "";
}

function splitReferenceEntries(lines: readonly { line: string; page: number }[]): ReferenceEntry[] {
  const entries: ReferenceEntry[] = [];
  const entryStart = lines.some(({ line }) => bracketedEntry.test(line)) ? bracketedEntry : numberedEntry;
  let current: { lines: string[]; numbered: boolean; page: number } | null = null;
  let previousPage = lines[0]?.page ?? 0;
  let awaitingEntryStart = false;
  const flush = (): void => {
    if (!current) return;
    entries.push({ page: current.page, raw: current.lines.join(" ").replaceAll(/\s+/gu, " ").trim(), numbered: current.numbered });
    current = null;
  };
  for (const { line, page } of lines) {
    const numbered = entryStart.test(line);
    const unnumberedStart = !numbered && publicationYear.test(line) && likelyAuthorStart(line);
    if (page !== previousPage) {
      if (current && publicationYear.test(current.lines.join(" "))) {
        flush();
        awaitingEntryStart = true;
      }
      previousPage = page;
    }
    if (awaitingEntryStart) {
      if (!numbered && !unnumberedStart) continue;
      awaitingEntryStart = false;
    }
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
