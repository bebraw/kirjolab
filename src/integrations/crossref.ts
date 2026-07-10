import { normalizeDoi } from "../domain/bibliography";
import type { PublicationEnrichment } from "../domain/workspace";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function fetchCrossrefWork(doiValue: string, mailto: string, fetcher: Fetcher = fetch): Promise<PublicationEnrichment> {
  const doi = normalizeDoi(doiValue);
  if (!/^10\.\d{4,9}\/\S+$/u.test(doi)) throw new Error("Publication DOI is invalid");
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
  const body: unknown = await response.json();
  if (!isRecord(body) || !isRecord(body.message)) throw new Error("Crossref returned invalid metadata");
  const message = body.message;
  const title = firstString(message.title);
  if (!title) throw new Error("Crossref record has no title");
  return {
    title,
    authors: Array.isArray(message.author) ? message.author.map(formatAuthor).filter(Boolean) : [],
    year: extractYear(message),
    venue: firstString(message["container-title"]),
    doi: normalizeDoi(typeof message.DOI === "string" ? message.DOI : doi),
    url: typeof message.URL === "string" ? message.URL : `https://doi.org/${doi}`,
    abstract: typeof message.abstract === "string" ? stripMarkup(message.abstract) : "",
  };
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
  return family ? `${family}${given ? `, ${given}` : ""}` : given;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
