import * as v from "valibot";
import { serializeBibTeX, type BibTeXEntry } from "./bibliography";
import type { BibliographicRecord, ReferenceLibrarySnapshot } from "../reference-library";

export const libraryArchiveVersion = "kirjolab-library-v1" as const;

const optionalCslNamePart = v.optional(v.pipe(v.string(), v.maxLength(500)));
const cslNameSchema = v.pipe(
  v.object({
    family: optionalCslNamePart,
    given: optionalCslNamePart,
    literal: optionalCslNamePart,
  }),
  v.check((name) => name.family !== undefined || name.given !== undefined || name.literal !== undefined),
);
const cslDatePartSchema = v.pipe(
  v.array(v.union([v.pipe(v.string(), v.maxLength(20)), v.pipe(v.number(), v.finite())])),
  v.minLength(1),
  v.maxLength(3),
);
const cslJsonItemSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  type: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(2_000)),
  author: v.optional(v.array(cslNameSchema)),
  issued: v.optional(
    v.object({
      "date-parts": v.pipe(v.array(cslDatePartSchema), v.minLength(1), v.maxLength(4)),
    }),
  ),
  "container-title": v.optional(v.pipe(v.string(), v.maxLength(4_096))),
  DOI: v.optional(v.pipe(v.string(), v.maxLength(4_096))),
  URL: v.optional(v.pipe(v.string(), v.maxLength(4_096))),
  abstract: v.optional(v.pipe(v.string(), v.maxLength(20_000))),
});
const cslJsonSchema = v.pipe(v.array(cslJsonItemSchema), v.minLength(1), v.maxLength(2_000));
const plainRecordSchema = v.custom<Record<string, unknown>>(
  (value) => typeof value === "object" && value !== null && !Array.isArray(value),
);
const researchFacetSchema = v.pipe(
  v.intersect([plainRecordSchema, v.record(v.string(), v.pipe(v.array(v.pipe(v.string(), v.maxLength(120))), v.maxLength(32)))]),
  v.check((facets) => Object.keys(facets).length <= 2_000),
);
const portableResearchSchema = v.object({
  version: v.literal(libraryArchiveVersion),
  tags: researchFacetSchema,
  collections: researchFacetSchema,
  notes: v.pipe(
    v.array(
      v.object({
        referenceId: v.string(),
        body: v.pipe(v.string(), v.maxLength(20_000)),
        createdAt: v.string(),
        updatedAt: v.string(),
      }),
    ),
    v.maxLength(10_000),
  ),
  reading: v.pipe(
    v.array(
      v.object({
        referenceId: v.string(),
        status: v.picklist(["unread", "reading", "read"]),
        rating: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5))),
        priority: v.picklist(["low", "normal", "high"]),
        updatedAt: v.string(),
      }),
    ),
    v.maxLength(2_000),
  ),
});

type CslName = Readonly<v.InferInput<typeof cslNameSchema>>;
export type CslJsonItem = Readonly<v.InferInput<typeof cslJsonItemSchema>>;
export type PortableLibraryResearch = Readonly<v.InferInput<typeof portableResearchSchema>>;

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
  if (!v.is(cslJsonSchema, value)) throw new Error("CSL JSON is invalid or exceeds supported bounds");
  return value;
}

export function portableResearch(snapshot: ReferenceLibrarySnapshot): PortableLibraryResearch {
  return {
    version: libraryArchiveVersion,
    tags: mutableFacets(snapshot.tags),
    collections: mutableFacets(snapshot.collections),
    notes: snapshot.notes.map(({ referenceId, body, createdAt, updatedAt }) => ({ referenceId, body, createdAt, updatedAt })),
    reading: snapshot.reading.map(({ referenceId, status, rating, priority, updatedAt }) => ({
      referenceId,
      status,
      rating,
      priority,
      updatedAt,
    })),
  };
}

export function parsePortableResearch(value: unknown): PortableLibraryResearch {
  if (!v.is(portableResearchSchema, value)) {
    throw new Error("Portable library research metadata is invalid");
  }
  return value;
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

function mutableFacets(facets: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(facets).map(([referenceId, values]) => [referenceId, [...values]]));
}
