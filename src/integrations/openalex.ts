import { normalizeDoi } from "../domain/bibliography";
import { isValidDoi, normalizePublicationDoi } from "../domain/publication-intake";
import type { PublicationEnrichment } from "../domain/workspace";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const maximumOpenAlexBytes = 1_000_000;
const maximumMetadataMatches = 5;
const selectedFields = "id,doi,title,display_name,publication_year,type,authorships,primary_location,abstract_inverted_index";

export interface OpenAlexMetadataMatch {
  readonly metadata: PublicationEnrichment;
  readonly score: number | null;
}

export async function fetchOpenAlexWork(doiValue: string, apiKey: string, fetcher: Fetcher = fetch): Promise<PublicationEnrichment> {
  if (!isValidDoi(doiValue)) throw new Error("Publication DOI is invalid");
  const key = requiredApiKey(apiKey);
  const doi = normalizePublicationDoi(doiValue);
  const url = new URL(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`);
  url.searchParams.set("select", selectedFields);
  url.searchParams.set("api_key", key);
  const response = await fetcher(url, { headers: { accept: "application/json", "user-agent": "Kirjolab/0.1" } });
  if (!response.ok) throw new Error(response.status === 404 ? "OpenAlex has no record for this DOI" : "OpenAlex metadata request failed");
  const body = await readBoundedJson(response);
  if (!isRecord(body)) throw new Error("OpenAlex returned invalid metadata");
  return mapOpenAlexWork(body, doi);
}

export async function searchOpenAlexWorks(
  query: { readonly title: string; readonly authors: readonly string[]; readonly year: string },
  apiKey: string,
  fetcher: Fetcher = fetch,
): Promise<readonly OpenAlexMetadataMatch[]> {
  const key = requiredApiKey(apiKey);
  const bibliographicQuery = [query.title.trim(), query.authors[0]?.trim() ?? "", query.year.trim()].filter(Boolean).join(" ");
  if (!bibliographicQuery) return [];
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", bibliographicQuery.slice(0, 4_000));
  url.searchParams.set("per_page", String(maximumMetadataMatches));
  url.searchParams.set("select", `${selectedFields},relevance_score`);
  url.searchParams.set("api_key", key);
  const response = await fetcher(url, { headers: { accept: "application/json", "user-agent": "Kirjolab/0.1" } });
  if (!response.ok) throw new Error("OpenAlex metadata search failed");
  const body = await readBoundedJson(response);
  if (!isRecord(body) || !Array.isArray(body.results)) throw new Error("OpenAlex returned invalid search metadata");
  const seen = new Set<string>();
  return body.results.slice(0, maximumMetadataMatches).flatMap((value): OpenAlexMetadataMatch[] => {
    if (!isRecord(value)) return [];
    const doi = openAlexDoi(value.doi);
    if (!doi || seen.has(doi)) return [];
    try {
      const metadata = mapOpenAlexWork(value, doi);
      seen.add(doi);
      return [{ metadata, score: finiteNumber(value.relevance_score) }];
    } catch {
      return [];
    }
  });
}

function mapOpenAlexWork(work: Record<string, unknown>, fallbackDoi: string): PublicationEnrichment {
  const title = typeof work.title === "string" ? work.title.trim() : typeof work.display_name === "string" ? work.display_name.trim() : "";
  if (!title) throw new Error("OpenAlex record has no title");
  const doi = openAlexDoi(work.doi) || fallbackDoi;
  return {
    type: mapEntryType(work.type),
    title: bound(title, 2_000),
    authors: Array.isArray(work.authorships) ? work.authorships.slice(0, 100).map(formatAuthorship).filter(Boolean) : [],
    year: typeof work.publication_year === "number" && Number.isSafeInteger(work.publication_year) ? String(work.publication_year) : "",
    venue: bound(openAlexVenue(work.primary_location), 2_000),
    doi,
    url: `https://doi.org/${doi}`,
    abstract: bound(reconstructAbstract(work.abstract_inverted_index), 20_000),
  };
}

function openAlexDoi(value: unknown): string {
  if (typeof value !== "string") return "";
  const doi = normalizeDoi(value);
  return isValidDoi(doi) ? doi : "";
}

function openAlexVenue(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.source) || typeof value.source.display_name !== "string") return "";
  return value.source.display_name.trim();
}

function formatAuthorship(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.author) || typeof value.author.display_name !== "string") return "";
  return bound(value.author.display_name.trim(), 500);
}

function reconstructAbstract(value: unknown): string {
  if (!isRecord(value)) return "";
  const positioned: Array<{ word: string; position: number }> = [];
  for (const [word, positions] of Object.entries(value)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (typeof position === "number" && Number.isSafeInteger(position) && position >= 0 && positioned.length < 10_000) {
        positioned.push({ word, position });
      }
    }
  }
  return positioned
    .sort((left, right) => left.position - right.position)
    .map(({ word }) => word)
    .join(" ");
}

function mapEntryType(value: unknown): string {
  if (value === "article") return "article";
  if (value === "book") return "book";
  if (value === "book-chapter") return "incollection";
  if (value === "dissertation") return "phdthesis";
  if (value === "report") return "techreport";
  return "misc";
}

function requiredApiKey(value: string): string {
  const key = value.trim();
  if (!key) throw new Error("OpenAlex API key is not configured");
  return key;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximumOpenAlexBytes) throw new Error("OpenAlex metadata response is too large");
  if (!response.body) throw new Error("OpenAlex returned invalid metadata");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maximumOpenAlexBytes) {
      await reader.cancel();
      throw new Error("OpenAlex metadata response is too large");
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("OpenAlex returned invalid metadata");
  }
}

function bound(value: string, maximumLength: number): string {
  return value.slice(0, maximumLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
