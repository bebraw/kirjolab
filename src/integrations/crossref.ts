import { normalizeDoi } from "../domain/bibliography";
import { isValidDoi, normalizePublicationDoi } from "../domain/publication-intake";
import type { PublicationEnrichment } from "../domain/workspace";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const maximumCrossrefBytes = 1_000_000;

export async function fetchCrossrefWork(doiValue: string, mailto: string, fetcher: Fetcher = fetch): Promise<PublicationEnrichment> {
  if (!isValidDoi(doiValue)) throw new Error("Publication DOI is invalid");
  const doi = normalizePublicationDoi(doiValue);
  const url = new URL(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  const contact = mailto.trim().toLowerCase();
  if (contact) url.searchParams.set("mailto", contact);
  const response = await fetcher(url, {
    headers: {
      accept: "application/vnd.crossref-api-message+json",
      "user-agent": contact ? `Kirjolab/0.1 (mailto:${contact})` : "Kirjolab/0.1",
    },
  });
  if (!response.ok) throw new Error(response.status === 404 ? "Crossref has no record for this DOI" : "Crossref metadata request failed");
  const body = await readBoundedJson(response);
  if (!isRecord(body) || !isRecord(body.message)) throw new Error("Crossref returned invalid metadata");
  const message = body.message;
  const title = firstString(message.title);
  if (!title) throw new Error("Crossref record has no title");
  return {
    type: mapEntryType(message.type),
    title: bound(title, 2_000),
    authors: Array.isArray(message.author) ? message.author.slice(0, 100).map(formatAuthor).filter(Boolean) : [],
    year: extractYear(message),
    venue: bound(firstString(message["container-title"]), 2_000),
    doi: normalizeDoi(typeof message.DOI === "string" ? message.DOI : doi),
    url: bound(typeof message.URL === "string" ? message.URL : `https://doi.org/${doi}`, 2_000),
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

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximumCrossrefBytes) throw new Error("Crossref metadata response is too large");
  if (!response.body) throw new Error("Crossref returned invalid metadata");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maximumCrossrefBytes) {
      await reader.cancel();
      throw new Error("Crossref metadata response is too large");
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
    throw new Error("Crossref returned invalid metadata");
  }
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

function stripMarkup(value: string): string {
  return value
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll(/&lt;/gu, "<")
    .replaceAll(/&gt;/gu, ">")
    .replaceAll(/&amp;/gu, "&")
    .replaceAll(/\s+/gu, " ")
    .trim();
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

function bound(value: string, maximumLength: number): string {
  return value.slice(0, maximumLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
