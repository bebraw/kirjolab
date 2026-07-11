import { normalizeDoi } from "./bibliography";
import type { PublicationEnrichment } from "./workspace";

const maximumDoiInputLength = 512;
const maximumDoiLength = 255;
const maximumCitationKeyLength = 200;
const normalizedDoiPattern = /^10\.\d{4,9}\/[^\s\p{C}]+$/u;
const citationKeyPattern = /^[a-z0-9:._+-]{1,200}$/iu;

export function normalizePublicationDoi(value: string): string {
  return normalizeDoi(value.trim().replace(/^doi:\s*/iu, ""));
}

export function isValidDoi(value: string): boolean {
  if (value.length === 0 || value.length > maximumDoiInputLength) return false;
  const normalized = normalizePublicationDoi(value);
  return normalized.length <= maximumDoiLength && normalizedDoiPattern.test(normalized);
}

export function isValidCitationKey(value: string): boolean {
  return citationKeyPattern.test(value);
}

export function suggestCitationKey(metadata: Pick<PublicationEnrichment, "authors" | "year">, reservedKeys: Iterable<string>): string {
  const family = normalizeCitationKeyPart(firstAuthorFamily(metadata.authors));
  const year = /^\d{4}$/u.test(metadata.year.trim()) ? metadata.year.trim() : "";
  const base = `${family || "reference"}${year}`.slice(0, maximumCitationKeyLength);
  const reserved = new Set(Array.from(reservedKeys, (key) => key.trim().toLowerCase()));

  for (let index = 0; ; index += 1) {
    const suffix = index === 0 ? "" : alphabeticalSuffix(index);
    const candidate = `${base.slice(0, maximumCitationKeyLength - suffix.length)}${suffix}`;
    if (!reserved.has(candidate.toLowerCase())) return candidate;
  }
}

function firstAuthorFamily(authors: readonly string[]): string {
  const author = authors.find((candidate) => candidate.trim().length > 0)?.trim() ?? "";
  if (!author) return "";
  const comma = author.indexOf(",");
  if (comma >= 0) return author.slice(0, comma).trim();
  return author.split(/\s+/u).at(-1) ?? "";
}

function normalizeCitationKeyPart(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("œ", "oe")
    .replaceAll("ø", "o")
    .replaceAll("ł", "l")
    .replaceAll("đ", "d")
    .replaceAll("ð", "d")
    .replaceAll("þ", "th")
    .replaceAll("ß", "ss")
    .normalize("NFKD")
    .replaceAll(/\p{M}+/gu, "")
    .replaceAll(/[^a-z0-9]/gu, "");
}

function alphabeticalSuffix(index: number): string {
  let remaining = index;
  let suffix = "";
  while (remaining > 0) {
    remaining -= 1;
    suffix = String.fromCharCode(97 + (remaining % 26)) + suffix;
    remaining = Math.floor(remaining / 26);
  }
  return suffix;
}
