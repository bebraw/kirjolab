import { normalizeDoi } from "../domain/bibliography";
import { isValidDoi, normalizePublicationDoi } from "../domain/publication-intake";
import type { PublicationEnrichment } from "../domain/workspace";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const maximumDataCiteBytes = 1_000_000;

export async function fetchDataCiteWork(doiValue: string, mailto: string, fetcher: Fetcher = fetch): Promise<PublicationEnrichment> {
  if (!isValidDoi(doiValue)) throw new Error("Publication DOI is invalid");
  const doi = normalizePublicationDoi(doiValue);
  const url = new URL(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`);
  const contact = mailto.trim().toLowerCase();
  const response = await fetcher(url, {
    headers: {
      accept: "application/vnd.api+json",
      "user-agent": contact ? `Kirjolab/0.1 (mailto:${contact})` : "Kirjolab/0.1",
    },
  });
  if (!response.ok) throw new Error(response.status === 404 ? "DataCite has no record for this DOI" : "DataCite metadata request failed");
  const body = await readBoundedJson(response);
  if (!isRecord(body) || !isRecord(body.data) || !isRecord(body.data.attributes)) {
    throw new Error("DataCite returned invalid metadata");
  }
  const attributes = body.data.attributes;
  const title = dataCiteTitle(attributes.titles);
  if (!title) throw new Error("DataCite record has no title");
  return {
    type: mapEntryType(attributes.types),
    title: bound(title, 2_000),
    authors: Array.isArray(attributes.creators) ? attributes.creators.slice(0, 100).map(formatCreator).filter(Boolean) : [],
    year: typeof attributes.publicationYear === "number" ? String(attributes.publicationYear) : "",
    venue: bound(typeof attributes.publisher === "string" ? attributes.publisher.trim() : "", 2_000),
    doi: normalizeDoi(typeof attributes.doi === "string" ? attributes.doi : doi),
    url: bound(typeof attributes.url === "string" ? attributes.url : `https://doi.org/${doi}`, 2_000),
    abstract: bound(dataCiteAbstract(attributes.descriptions), 20_000),
  };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximumDataCiteBytes) throw new Error("DataCite metadata response is too large");
  if (!response.body) throw new Error("DataCite returned invalid metadata");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maximumDataCiteBytes) {
      await reader.cancel();
      throw new Error("DataCite metadata response is too large");
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
    throw new Error("DataCite returned invalid metadata");
  }
}

function dataCiteTitle(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const title = value.find((item) => isRecord(item) && typeof item.title === "string");
  return isRecord(title) && typeof title.title === "string" ? stripMarkup(title.title) : "";
}

function dataCiteAbstract(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const abstract = value.find((item) => isRecord(item) && item.descriptionType === "Abstract" && typeof item.description === "string");
  return isRecord(abstract) && typeof abstract.description === "string" ? stripMarkup(abstract.description) : "";
}

function formatCreator(value: unknown): string {
  if (!isRecord(value)) return "";
  const family = typeof value.familyName === "string" ? value.familyName.trim() : "";
  const given = typeof value.givenName === "string" ? value.givenName.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  return bound(family ? `${family}${given ? `, ${given}` : ""}` : name || given, 500);
}

function mapEntryType(value: unknown): string {
  if (!isRecord(value)) return "misc";
  if (typeof value.bibtex === "string") {
    const type = value.bibtex.toLocaleLowerCase();
    if (
      [
        "article",
        "book",
        "inbook",
        "incollection",
        "inproceedings",
        "manual",
        "mastersthesis",
        "misc",
        "phdthesis",
        "proceedings",
        "techreport",
        "unpublished",
      ].includes(type)
    ) {
      return type;
    }
  }
  if (value.resourceTypeGeneral === "Book") return "book";
  if (value.resourceTypeGeneral === "BookChapter") return "incollection";
  if (value.resourceTypeGeneral === "ConferencePaper") return "inproceedings";
  if (value.resourceTypeGeneral === "Dissertation") return "phdthesis";
  if (value.resourceTypeGeneral === "Report") return "techreport";
  if (value.resourceTypeGeneral === "JournalArticle") return "article";
  return "misc";
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

function bound(value: string, maximumLength: number): string {
  return value.slice(0, maximumLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
