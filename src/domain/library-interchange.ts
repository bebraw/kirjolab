import { serializeBibTeX, type BibTeXEntry } from "./bibliography";
import type { BibliographicRecord, ReferenceLibrarySnapshot } from "./reference-library";

export const libraryArchiveVersion = "kirjolab-library-v1" as const;

export interface CslName {
  readonly family?: string;
  readonly given?: string;
  readonly literal?: string;
}

export interface CslJsonItem {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly author?: readonly CslName[];
  readonly issued?: { readonly "date-parts": readonly (readonly (string | number)[])[] };
  readonly "container-title"?: string;
  readonly DOI?: string;
  readonly URL?: string;
  readonly abstract?: string;
}

export interface PortableLibraryResearch {
  readonly version: typeof libraryArchiveVersion;
  readonly tags: ReferenceLibrarySnapshot["tags"];
  readonly collections: ReferenceLibrarySnapshot["collections"];
  readonly notes: ReferenceLibrarySnapshot["notes"];
  readonly reading: ReferenceLibrarySnapshot["reading"];
}

export function referenceToCslJson(reference: BibliographicRecord): CslJsonItem {
  return {
    id: reference.id,
    type: cslType(reference.type),
    title: reference.title,
    ...(reference.authors.length > 0 ? { author: reference.authors.map(authorToCslName) } : {}),
    ...(reference.year ? { issued: { "date-parts": [[reference.year]] } } : {}),
    ...(reference.venue ? { "container-title": reference.venue } : {}),
    ...(reference.doi ? { DOI: reference.doi } : {}),
    ...(reference.url ? { URL: reference.url } : {}),
    ...(reference.abstract ? { abstract: reference.abstract } : {}),
  };
}

export function cslJsonToBibTeX(items: readonly CslJsonItem[]): string {
  const used = new Set<string>();
  const entries: BibTeXEntry[] = items.map((item, index) => {
    const base = safeCitationKey(item.id) || `source${index + 1}`;
    let citationKey = base;
    for (let suffix = 2; used.has(citationKey.toLocaleLowerCase()); suffix += 1) citationKey = `${base}${suffix}`;
    used.add(citationKey.toLocaleLowerCase());
    const year = String(item.issued?.["date-parts"][0]?.[0] ?? "");
    return {
      type: bibTeXType(item.type),
      citationKey,
      fields: {
        title: item.title,
        ...(item.author?.length ? { author: item.author.map(cslNameToAuthor).join(" and ") } : {}),
        ...(year ? { year } : {}),
        ...(item["container-title"] ? { journal: item["container-title"] } : {}),
        ...(item.DOI ? { doi: item.DOI } : {}),
        ...(item.URL ? { url: item.URL } : {}),
        ...(item.abstract ? { abstract: item.abstract } : {}),
      },
    };
  });
  return serializeBibTeX(entries);
}

export function parseCslJson(value: unknown): CslJsonItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2_000) throw new Error("CSL JSON must contain 1–2,000 items");
  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !item.id ||
      item.id.length > 200 ||
      typeof item.type !== "string" ||
      item.type.length > 64 ||
      typeof item.title !== "string" ||
      !item.title ||
      item.title.length > 2_000
    ) {
      throw new Error("CSL JSON item identity, type, and title are required");
    }
    if (item.author !== undefined && (!Array.isArray(item.author) || !item.author.every(isCslName)))
      throw new Error("CSL JSON authors are invalid");
    if (item.issued !== undefined && !isIssued(item.issued)) throw new Error("CSL JSON issued date is invalid");
    for (const field of ["container-title", "DOI", "URL", "abstract"] as const) {
      if (item[field] !== undefined && (typeof item[field] !== "string" || item[field].length > (field === "abstract" ? 20_000 : 4_096))) {
        throw new Error(`CSL JSON ${field} is invalid`);
      }
    }
    return item as unknown as CslJsonItem;
  });
}

export function portableResearch(snapshot: ReferenceLibrarySnapshot): PortableLibraryResearch {
  return {
    version: libraryArchiveVersion,
    tags: snapshot.tags,
    collections: snapshot.collections,
    notes: snapshot.notes,
    reading: snapshot.reading,
  };
}

export function parsePortableResearch(value: unknown): PortableLibraryResearch {
  if (
    !isRecord(value) ||
    value.version !== libraryArchiveVersion ||
    !isStringArrayRecord(value.tags) ||
    !isStringArrayRecord(value.collections) ||
    !Array.isArray(value.notes) ||
    value.notes.length > 10_000 ||
    !value.notes.every(isPortableNote) ||
    !Array.isArray(value.reading) ||
    value.reading.length > 2_000 ||
    !value.reading.every(isPortableReading)
  ) {
    throw new Error("Portable library research metadata is invalid");
  }
  return value as unknown as PortableLibraryResearch;
}

function authorToCslName(value: string): CslName {
  const [family, ...given] = value.split(",").map((part) => part.trim());
  return given.length > 0 ? { family: family || value, given: given.join(", ") } : { literal: value };
}

function cslNameToAuthor(value: CslName): string {
  if (value.literal) return value.literal;
  return [value.family ?? "", value.given ?? ""].filter(Boolean).join(", ");
}

function cslType(value: string): string {
  if (value === "article") return "article-journal";
  if (value === "inproceedings") return "paper-conference";
  if (value === "phdthesis" || value === "mastersthesis") return "thesis";
  return value === "book" ? "book" : "document";
}

function bibTeXType(value: string): string {
  if (value === "article-journal") return "article";
  if (value === "paper-conference") return "inproceedings";
  if (value === "book") return "book";
  if (value === "thesis") return "phdthesis";
  return "misc";
}

function safeCitationKey(value: string): string {
  return value.replaceAll(/[^a-z0-9:._+-]/giu, "").slice(0, 120);
}

function isCslName(value: unknown): value is CslName {
  return (
    isRecord(value) &&
    [value.family, value.given, value.literal].some((part) => typeof part === "string") &&
    [value.family, value.given, value.literal].every((part) => part === undefined || (typeof part === "string" && part.length <= 500))
  );
}

function isIssued(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value["date-parts"]) &&
    value["date-parts"].length <= 4 &&
    value["date-parts"].every(
      (part) =>
        Array.isArray(part) &&
        part.length > 0 &&
        part.length <= 3 &&
        part.every((item) => (typeof item === "string" && item.length <= 20) || (typeof item === "number" && Number.isFinite(item))),
    )
  );
}

function isStringArrayRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length <= 2_000 &&
    Object.values(value).every(
      (items) => Array.isArray(items) && items.length <= 32 && items.every((item) => typeof item === "string" && item.length <= 120),
    )
  );
}

function isPortableNote(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.referenceId === "string" &&
    typeof value.body === "string" &&
    value.body.length <= 20_000 &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isPortableReading(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.referenceId === "string" &&
    (value.status === "unread" || value.status === "reading" || value.status === "read") &&
    (value.rating === null || (Number.isInteger(value.rating) && Number(value.rating) >= 1 && Number(value.rating) <= 5)) &&
    (value.priority === "low" || value.priority === "normal" || value.priority === "high") &&
    typeof value.updatedAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
