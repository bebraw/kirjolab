import { normalizeDoi } from "../domain/bibliography";
import { isValidDoi, normalizePublicationDoi } from "../domain/publication-intake";
import { isRecord } from "../domain/unknown-value";
import type { PublicationEnrichment } from "../domain/workspace";
import type { ReferenceDiscoveryIdentifier } from "../domain/reference-discovery";
import type { CitationExpansionCandidate } from "../domain/citation-expansion-types";
import { readBoundedResponseJson } from "./bounded-response";
import { boundProviderText as bound } from "./provider-text";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const maximumSemanticScholarBytes = 1_000_000;
const maximumMetadataMatches = 5;
const maximumCitationCandidates = 128;
const selectedFields = "title,abstract,authors,year,venue,url,externalIds,publicationTypes";
const semanticScholarRetryDelayMilliseconds = 250;

export class SemanticScholarUnavailableError extends Error {
  constructor() {
    super("Semantic Scholar is temporarily unavailable; try again shortly");
    this.name = "SemanticScholarUnavailableError";
  }
}

export interface SemanticScholarMetadataMatch {
  readonly metadata: PublicationEnrichment;
  readonly score: number | null;
  readonly identifiers: readonly ReferenceDiscoveryIdentifier[];
}

export interface SemanticScholarCitationExpansion {
  readonly provider: "semantic-scholar";
  readonly direction: "citations";
  readonly retrievedAt: string;
  readonly responseId: string;
  readonly sourceLocator: string;
  readonly candidates: readonly CitationExpansionCandidate[];
  readonly truncated: boolean;
}

export async function fetchSemanticScholarCitations(
  doiValue: string,
  apiKey: string,
  fetcher: Fetcher = fetch,
): Promise<SemanticScholarCitationExpansion> {
  if (!isValidDoi(doiValue)) throw new Error("Publication DOI is invalid");
  const doi = normalizePublicationDoi(doiValue);
  const url = new URL(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}/citations`);
  url.searchParams.set("limit", String(maximumCitationCandidates));
  url.searchParams.set("fields", "title,authors,year,externalIds");
  const response = await fetchSemanticScholar(url, apiKey, fetcher, true);
  if (!response.ok) {
    throw new Error(response.status === 404 ? "Semantic Scholar has no record for this DOI" : "Semantic Scholar citations request failed");
  }
  const body = await readSemanticScholarJson(response);
  if (!isRecord(body) || !Array.isArray(body.data)) throw new Error("Semantic Scholar returned invalid citation metadata");
  const seen = new Set<string>();
  const candidates = body.data.slice(0, maximumCitationCandidates).flatMap((entry): CitationExpansionCandidate[] => {
    if (!isRecord(entry) || !isRecord(entry.citingPaper)) return [];
    const candidateDoi = semanticScholarDoi(entry.citingPaper.externalIds);
    if (!candidateDoi || candidateDoi === doi || seen.has(candidateDoi)) return [];
    seen.add(candidateDoi);
    return [
      {
        doi: candidateDoi,
        title: bound(typeof entry.citingPaper.title === "string" ? entry.citingPaper.title.trim() : "", 2_000),
        authors: Array.isArray(entry.citingPaper.authors)
          ? bound(entry.citingPaper.authors.slice(0, 100).map(formatAuthor).filter(Boolean).join("; "), 2_000)
          : "",
        year:
          typeof entry.citingPaper.year === "number" && Number.isSafeInteger(entry.citingPaper.year) ? String(entry.citingPaper.year) : "",
        unstructured: "",
      },
    ];
  });
  const retrievedAt = new Date().toISOString();
  const canonical = JSON.stringify({ doi, candidates });
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)));
  return {
    provider: "semantic-scholar",
    direction: "citations",
    retrievedAt,
    responseId: `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
    sourceLocator: url.toString(),
    candidates,
    truncated: typeof body.next === "number" || body.data.length > maximumCitationCandidates,
  };
}

export async function fetchSemanticScholarWork(
  doiValue: string,
  apiKey: string,
  fetcher: Fetcher = fetch,
  retryUnavailable = false,
): Promise<PublicationEnrichment> {
  if (!isValidDoi(doiValue)) throw new Error("Publication DOI is invalid");
  const doi = normalizePublicationDoi(doiValue);
  const url = new URL(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}`);
  url.searchParams.set("fields", selectedFields);
  const response = await fetchSemanticScholar(url, apiKey, fetcher, retryUnavailable);
  if (!response.ok) {
    throw new Error(response.status === 404 ? "Semantic Scholar has no record for this DOI" : "Semantic Scholar metadata request failed");
  }
  const body = await readSemanticScholarJson(response);
  if (!isRecord(body)) throw new Error("Semantic Scholar returned invalid metadata");
  return mapSemanticScholarPaper(body, doi);
}

export async function searchSemanticScholarWorks(
  query: { readonly title: string; readonly authors: readonly string[]; readonly year: string },
  apiKey: string,
  fetcher: Fetcher = fetch,
): Promise<readonly SemanticScholarMetadataMatch[]> {
  const bibliographicQuery = [query.title.trim(), query.authors[0]?.trim() ?? ""].filter(Boolean).join(" ").replaceAll("-", " ");
  if (!bibliographicQuery) return [];
  const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  url.searchParams.set("query", bibliographicQuery.slice(0, 4_000));
  url.searchParams.set("limit", String(maximumMetadataMatches));
  url.searchParams.set("fields", selectedFields);
  if (/^\d{4}$/u.test(query.year.trim())) url.searchParams.set("year", query.year.trim());
  const response = await fetcher(url, { headers: semanticScholarHeaders(apiKey) });
  if (!response.ok) throw new Error("Semantic Scholar metadata search failed");
  const body = await readSemanticScholarJson(response);
  if (!isRecord(body) || !Array.isArray(body.data)) throw new Error("Semantic Scholar returned invalid search metadata");
  const seen = new Set<string>();
  return body.data.slice(0, maximumMetadataMatches).flatMap((value): SemanticScholarMetadataMatch[] => {
    if (!isRecord(value)) return [];
    const identifiers = semanticScholarIdentifiers(value);
    const identity = identifiers[0] ? `${identifiers[0].scheme}:${identifiers[0].value.toLocaleLowerCase()}` : "";
    const doi = identifiers.find((identifier) => identifier.scheme === "doi")?.value ?? "";
    if (!identity || seen.has(identity)) return [];
    try {
      const metadata = mapSemanticScholarPaper(value, doi);
      seen.add(identity);
      return [{ metadata, score: null, identifiers }];
    } catch {
      return [];
    }
  });
}

function mapSemanticScholarPaper(paper: Record<string, unknown>, fallbackDoi: string): PublicationEnrichment {
  const title = typeof paper.title === "string" ? paper.title.trim() : "";
  if (!title) throw new Error("Semantic Scholar record has no title");
  const doi = semanticScholarDoi(paper.externalIds) || fallbackDoi;
  return {
    type: mapEntryType(paper.publicationTypes),
    title: bound(title, 2_000),
    authors: Array.isArray(paper.authors) ? paper.authors.slice(0, 100).map(formatAuthor).filter(Boolean) : [],
    year: typeof paper.year === "number" && Number.isSafeInteger(paper.year) ? String(paper.year) : "",
    venue: bound(typeof paper.venue === "string" ? paper.venue.trim() : "", 2_000),
    doi,
    url: doi
      ? `https://doi.org/${doi}`
      : typeof paper.url === "string" && paper.url.trim()
        ? bound(paper.url.trim(), 2_000)
        : typeof paper.paperId === "string"
          ? `https://www.semanticscholar.org/paper/${encodeURIComponent(paper.paperId)}`
          : "",
    abstract: bound(typeof paper.abstract === "string" ? paper.abstract.trim() : "", 20_000),
  };
}

function semanticScholarIdentifiers(paper: Record<string, unknown>): ReferenceDiscoveryIdentifier[] {
  const identifiers: ReferenceDiscoveryIdentifier[] = [];
  const doi = semanticScholarDoi(paper.externalIds);
  if (doi) identifiers.push({ scheme: "doi", value: doi });
  if (isRecord(paper.externalIds)) {
    if (typeof paper.externalIds.ArXiv === "string" && paper.externalIds.ArXiv.trim()) {
      identifiers.push({ scheme: "arxiv", value: paper.externalIds.ArXiv.trim().slice(0, 500) });
    }
    if (typeof paper.externalIds.PubMed === "string" && /^\d+$/u.test(paper.externalIds.PubMed.trim())) {
      identifiers.push({ scheme: "pmid", value: paper.externalIds.PubMed.trim() });
    }
  }
  if (typeof paper.paperId === "string" && paper.paperId.trim()) {
    identifiers.push({ scheme: "semantic-scholar", value: paper.paperId.trim().slice(0, 500) });
  }
  return identifiers;
}

function semanticScholarDoi(value: unknown): string {
  if (!isRecord(value) || typeof value.DOI !== "string") return "";
  const doi = normalizeDoi(value.DOI);
  return isValidDoi(doi) ? doi : "";
}

function formatAuthor(value: unknown): string {
  return isRecord(value) && typeof value.name === "string" ? bound(value.name.trim(), 500) : "";
}

function mapEntryType(value: unknown): string {
  if (!Array.isArray(value)) return "misc";
  if (value.includes("JournalArticle")) return "article";
  if (value.includes("Book")) return "book";
  if (value.includes("BookSection")) return "incollection";
  if (value.includes("Conference")) return "inproceedings";
  if (value.includes("Review")) return "article";
  return "misc";
}

function semanticScholarHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json", "user-agent": "Kirjolab/0.1" };
  const key = apiKey.trim();
  if (key) headers["x-api-key"] = key;
  return headers;
}

async function fetchSemanticScholar(url: URL, apiKey: string, fetcher: Fetcher, retryUnavailable: boolean): Promise<Response> {
  if (!retryUnavailable) return await fetcher(url, { headers: semanticScholarHeaders(apiKey) });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, { headers: semanticScholarHeaders(apiKey) });
    } catch {
      if (attempt === 1) throw new SemanticScholarUnavailableError();
      await wait(semanticScholarRetryDelayMilliseconds);
      continue;
    }
    if (response.ok || response.status === 404) return response;
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt === 1) throw new SemanticScholarUnavailableError();
    await response.body?.cancel();
    await wait(semanticScholarRetryDelayMilliseconds);
  }
  throw new SemanticScholarUnavailableError();
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function readSemanticScholarJson(response: Response): Promise<unknown> {
  return await readBoundedResponseJson(
    response,
    maximumSemanticScholarBytes,
    () => new Error("Semantic Scholar metadata response is too large"),
    () => new Error("Semantic Scholar returned invalid metadata"),
  );
}
