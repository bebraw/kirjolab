import { normalizeDoi } from "../domain/reference-library/bibliography";
import { isValidDoi, normalizePublicationDoi } from "../domain/publication/publication-intake";
import type { PublicationEnrichment } from "../domain/workspace/workspace";
import type { ReferenceDiscoveryIdentifier } from "../domain/reference-library/reference-discovery";
import type { CitationExpansionCandidate } from "../domain/citation/citation-expansion-types";
import { isRecord } from "../domain/unknown-value";
import { readBoundedResponseJson } from "./bounded-response";
import { boundProviderText as bound, stripProviderMarkup as stripMarkup } from "./provider-text";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const maximumCrossrefBytes = 1_000_000;
const maximumCitationCandidates = 128;
const maximumMetadataMatches = 5;
const crossrefRetryDelayMilliseconds = 250;

export class CrossrefUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossrefUnavailableError";
  }
}

export interface CrossrefMetadataMatch {
  readonly metadata: PublicationEnrichment;
  readonly score: number | null;
  readonly identifiers: readonly ReferenceDiscoveryIdentifier[];
}

export interface CrossrefCitationExpansion {
  readonly provider: "crossref";
  readonly direction: "references";
  readonly retrievedAt: string;
  readonly responseId: string;
  readonly sourceLocator: string;
  readonly candidates: readonly CitationExpansionCandidate[];
  readonly truncated: boolean;
}

export async function fetchCrossrefWork(doiValue: string, mailto: string, fetcher: Fetcher = fetch): Promise<PublicationEnrichment> {
  if (!isValidDoi(doiValue)) throw new Error("Publication DOI is invalid");
  const doi = normalizePublicationDoi(doiValue);
  const url = new URL(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  const contact = mailto.trim().toLowerCase();
  if (contact) url.searchParams.set("mailto", contact);
  const response = await fetchCrossref(url, contact, fetcher);
  if (!response.ok) throw new Error(response.status === 404 ? "Crossref has no record for this DOI" : "Crossref metadata request failed");
  const body = await readCrossrefJson(response);
  if (!isRecord(body) || !isRecord(body.message)) throw new Error("Crossref returned invalid metadata");
  return mapCrossrefMessage(body.message, doi);
}

export async function searchCrossrefWorks(
  query: { readonly title: string; readonly authors: readonly string[]; readonly year: string },
  mailto: string,
  fetcher: Fetcher = fetch,
): Promise<readonly CrossrefMetadataMatch[]> {
  const bibliographicQuery = [query.title.trim(), query.authors[0]?.trim() ?? "", query.year.trim()].filter(Boolean).join(" ");
  if (!bibliographicQuery) return [];
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query.bibliographic", bibliographicQuery.slice(0, 4_000));
  url.searchParams.set("rows", String(maximumMetadataMatches));
  const contact = mailto.trim().toLowerCase();
  if (contact) url.searchParams.set("mailto", contact);
  const response = await fetchCrossref(url, contact, fetcher);
  if (!response.ok) throw new Error("Crossref metadata search failed");
  const body = await readCrossrefJson(response);
  if (!isRecord(body) || !isRecord(body.message) || !Array.isArray(body.message.items)) {
    throw new Error("Crossref returned invalid search metadata");
  }
  const seen = new Set<string>();
  return body.message.items.slice(0, maximumMetadataMatches).flatMap((item): CrossrefMetadataMatch[] => {
    if (!isRecord(item) || typeof item.DOI !== "string" || !isValidDoi(item.DOI)) return [];
    const doi = normalizePublicationDoi(item.DOI);
    if (seen.has(doi)) return [];
    try {
      const metadata = mapCrossrefMessage(item, doi);
      seen.add(doi);
      return [
        {
          metadata,
          score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : null,
          identifiers: [{ scheme: "doi", value: doi }],
        },
      ];
    } catch {
      return [];
    }
  });
}

function mapCrossrefMessage(message: Record<string, unknown>, fallbackDoi: string): PublicationEnrichment {
  const title = firstString(message.title);
  if (!title) throw new Error("Crossref record has no title");
  return {
    type: mapEntryType(message.type),
    title: bound(title, 2_000),
    authors: Array.isArray(message.author) ? message.author.slice(0, 100).map(formatAuthor).filter(Boolean) : [],
    year: extractYear(message),
    venue: bound(firstString(message["container-title"]), 2_000),
    doi: normalizeDoi(typeof message.DOI === "string" ? message.DOI : fallbackDoi),
    url: bound(typeof message.URL === "string" ? message.URL : `https://doi.org/${fallbackDoi}`, 2_000),
    abstract: bound(typeof message.abstract === "string" ? stripMarkup(message.abstract) : "", 20_000),
  };
}

export async function fingerprintPublicationMetadata(metadata: PublicationEnrichment): Promise<string> {
  const canonical = JSON.stringify({
    type: metadata.type ?? "misc",
    title: metadata.title,
    authors: metadata.authors,
    year: metadata.year,
    venue: metadata.venue,
    doi: normalizeDoi(metadata.doi),
    url: metadata.url,
    abstract: metadata.abstract,
  });
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fetchCrossrefReferences(
  doiValue: string,
  mailto: string,
  fetcher: Fetcher = fetch,
): Promise<CrossrefCitationExpansion> {
  if (!isValidDoi(doiValue)) throw new Error("Publication DOI is invalid");
  const doi = normalizePublicationDoi(doiValue);
  const url = new URL(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  const contact = mailto.trim().toLowerCase();
  if (contact) url.searchParams.set("mailto", contact);
  const response = await fetchCrossref(url, contact, fetcher, true);
  if (!response.ok) throw new Error(response.status === 404 ? "Crossref has no record for this DOI" : "Crossref metadata request failed");
  const body = await readCrossrefJson(response);
  if (!isRecord(body) || !isRecord(body.message)) throw new Error("Crossref returned invalid metadata");
  const references = Array.isArray(body.message.reference) ? body.message.reference : [];
  const candidates = references.slice(0, maximumCitationCandidates).flatMap((value): CitationExpansionCandidate[] => {
    if (!isRecord(value) || typeof value.DOI !== "string" || !isValidDoi(value.DOI)) return [];
    return [
      {
        doi: normalizeDoi(value.DOI),
        title: bound(typeof value["article-title"] === "string" ? stripMarkup(value["article-title"]) : "", 2_000),
        authors: bound(typeof value.author === "string" ? stripMarkup(value.author) : "", 2_000),
        year: bound(typeof value.year === "string" ? value.year.trim() : "", 100),
        unstructured: bound(typeof value.unstructured === "string" ? stripMarkup(value.unstructured) : "", 4_000),
      },
    ];
  });
  const retrievedAt = new Date().toISOString();
  const canonical = JSON.stringify({ doi, candidates });
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)));
  return {
    provider: "crossref",
    direction: "references",
    retrievedAt,
    responseId: `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
    sourceLocator: url.toString(),
    candidates,
    truncated: references.length > maximumCitationCandidates,
  };
}

async function readCrossrefJson(response: Response): Promise<unknown> {
  return await readBoundedResponseJson(
    response,
    maximumCrossrefBytes,
    () => new Error("Crossref metadata response is too large"),
    () => new Error("Crossref returned invalid metadata"),
  );
}

function extractYear(message: Record<string, unknown>): string {
  for (const key of ["published-print", "published-online", "published", "issued"]) {
    const value = message[key];
    if (!isRecord(value) || !Array.isArray(value["date-parts"])) continue;
    const year = value["date-parts"][0];
    if (Array.isArray(year) && typeof year[0] === "number") return String(year[0]);
  }
  return "";
}

function formatAuthor(value: unknown): string {
  if (!isRecord(value)) return "";
  const family = typeof value.family === "string" ? value.family.trim() : "";
  const given = typeof value.given === "string" ? value.given.trim() : "";
  return bound(family ? `${family}${given ? `, ${given}` : ""}` : given, 500);
}

function firstString(value: unknown): string {
  return Array.isArray(value) && typeof value[0] === "string" ? stripMarkup(value[0]) : "";
}

function mapEntryType(value: unknown): string {
  if (value === "journal-article") return "article";
  if (value === "proceedings-article") return "inproceedings";
  if (value === "book-chapter" || value === "reference-entry") return "incollection";
  if (value === "book" || value === "monograph" || value === "edited-book" || value === "reference-book") return "book";
  if (value === "dissertation") return "phdthesis";
  if (value === "report") return "techreport";
  return "misc";
}

function crossrefHeaders(contact: string): Record<string, string> {
  return {
    accept: "application/vnd.crossref-api-message+json",
    "user-agent": contact ? `Kirjolab/0.1 (mailto:${contact})` : "Kirjolab/0.1",
  };
}

async function fetchCrossref(url: URL, contact: string, fetcher: Fetcher, retryUnavailable = false): Promise<Response> {
  if (!retryUnavailable) return await fetcher(url, { headers: crossrefHeaders(contact) });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, { headers: crossrefHeaders(contact) });
    } catch {
      if (attempt === 1) throw new CrossrefUnavailableError("Crossref is temporarily unavailable; try again shortly");
      await wait(crossrefRetryDelayMilliseconds);
      continue;
    }
    if (response.ok || response.status === 404) return response;
    if (!isRetryableCrossrefStatus(response.status) || attempt === 1) {
      throw new CrossrefUnavailableError("Crossref is temporarily unavailable; try again shortly");
    }
    await response.body?.cancel();
    await wait(crossrefRetryDelay(response));
  }
  throw new CrossrefUnavailableError("Crossref is temporarily unavailable; try again shortly");
}

function isRetryableCrossrefStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function crossrefRetryDelay(response: Response): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter) && retryAfter >= 0 ? Math.min(retryAfter * 1_000, 2_000) : crossrefRetryDelayMilliseconds;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
