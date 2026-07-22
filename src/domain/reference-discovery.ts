import type { PublicationEnrichment } from "./workspace";

export type ReferenceDiscoveryProvider = "openalex" | "crossref" | "semantic-scholar";
export type ReferenceDiscoveryIdentifierScheme = "doi" | "openalex" | "semantic-scholar" | "arxiv" | "pmid";

const referenceDiscoveryTypes = ["", "article", "book", "incollection", "inproceedings", "phdthesis", "techreport"] as const;
export type ReferenceDiscoveryType = (typeof referenceDiscoveryTypes)[number];

export interface ReferenceDiscoveryQuery {
  readonly query: string;
  readonly author: string;
  readonly year: string;
  readonly type: ReferenceDiscoveryType;
}

export interface ReferenceDiscoveryIdentifier {
  readonly scheme: ReferenceDiscoveryIdentifierScheme;
  readonly value: string;
}

export interface ReferenceDiscoverySource {
  readonly provider: ReferenceDiscoveryProvider;
  readonly score: number | null;
}

export interface ReferenceDiscoveryCandidate extends ReferenceDiscoverySource {
  readonly identifiers: readonly ReferenceDiscoveryIdentifier[];
  readonly metadata: PublicationEnrichment;
}

export interface ReferenceDiscoveryResult {
  readonly providers: readonly ReferenceDiscoverySource[];
  readonly identifiers: readonly ReferenceDiscoveryIdentifier[];
  readonly metadata: PublicationEnrichment;
}

export function isReferenceDiscoveryQuery(value: unknown): value is ReferenceDiscoveryQuery {
  return (
    isRecord(value) &&
    typeof value.query === "string" &&
    value.query.trim().length > 0 &&
    value.query.length <= 4_000 &&
    typeof value.author === "string" &&
    value.author.length <= 500 &&
    typeof value.year === "string" &&
    (value.year === "" || /^\d{4}$/u.test(value.year)) &&
    typeof value.type === "string" &&
    referenceDiscoveryTypes.includes(value.type as ReferenceDiscoveryType)
  );
}

export function mergeReferenceDiscoveryCandidates(candidates: readonly ReferenceDiscoveryCandidate[]): readonly ReferenceDiscoveryResult[] {
  const groups: Array<{
    providers: ReferenceDiscoverySource[];
    identifiers: ReferenceDiscoveryIdentifier[];
    metadata: PublicationEnrichment[];
  }> = [];
  for (const candidate of candidates) {
    if (candidate.identifiers.length === 0) continue;
    const keys = new Set(candidate.identifiers.map(identifierKey));
    const matchingIndexes = groups.flatMap((group, index) =>
      group.identifiers.some((identifier) => keys.has(identifierKey(identifier))) ? [index] : [],
    );
    const targetIndex = matchingIndexes[0];
    if (targetIndex === undefined) {
      groups.push({
        providers: [{ provider: candidate.provider, score: candidate.score }],
        identifiers: [...candidate.identifiers],
        metadata: [candidate.metadata],
      });
      continue;
    }
    const target = groups[targetIndex]!;
    target.providers.push({ provider: candidate.provider, score: candidate.score });
    target.identifiers.push(...candidate.identifiers);
    target.metadata.push(candidate.metadata);
    for (const index of matchingIndexes.slice(1).reverse()) {
      const merged = groups[index]!;
      target.providers.push(...merged.providers);
      target.identifiers.push(...merged.identifiers);
      target.metadata.push(...merged.metadata);
      groups.splice(index, 1);
    }
  }
  return groups.slice(0, 12).map((group) => ({
    providers: uniqueProviders(group.providers),
    identifiers: uniqueIdentifiers(group.identifiers),
    metadata: mergeMetadata(group.metadata),
  }));
}

export function isReferenceDiscoveryResults(value: unknown): value is readonly ReferenceDiscoveryResult[] {
  return (
    Array.isArray(value) &&
    value.length <= 12 &&
    value.every(
      (item) =>
        isRecord(item) &&
        Array.isArray(item.providers) &&
        item.providers.length > 0 &&
        item.providers.length <= 3 &&
        item.providers.every(isDiscoverySource) &&
        Array.isArray(item.identifiers) &&
        item.identifiers.length > 0 &&
        item.identifiers.length <= 12 &&
        item.identifiers.every(isDiscoveryIdentifier) &&
        isDiscoveryMetadata(item.metadata),
    )
  );
}

function mergeMetadata(values: readonly PublicationEnrichment[]): PublicationEnrichment {
  const ranked = [...values].sort((left, right) => metadataCompleteness(right) - metadataCompleteness(left));
  const best = ranked[0]!;
  return {
    type: best.type ?? ranked.find((value) => value.type)?.type ?? "misc",
    title: best.title,
    authors: best.authors.length ? best.authors : (ranked.find((value) => value.authors.length)?.authors ?? []),
    year: best.year || ranked.find((value) => value.year)?.year || "",
    venue: best.venue || ranked.find((value) => value.venue)?.venue || "",
    doi: best.doi || ranked.find((value) => value.doi)?.doi || "",
    url: best.url || ranked.find((value) => value.url)?.url || "",
    abstract: best.abstract || ranked.find((value) => value.abstract)?.abstract || "",
  };
}

function metadataCompleteness(value: PublicationEnrichment): number {
  return [
    value.type,
    value.title,
    value.authors.length ? "authors" : "",
    value.year,
    value.venue,
    value.doi,
    value.url,
    value.abstract,
  ].filter(Boolean).length;
}

function uniqueProviders(values: readonly ReferenceDiscoverySource[]): readonly ReferenceDiscoverySource[] {
  const providers = new Map<ReferenceDiscoveryProvider, ReferenceDiscoverySource>();
  for (const value of values) {
    const existing = providers.get(value.provider);
    if (!existing || (value.score ?? Number.NEGATIVE_INFINITY) > (existing.score ?? Number.NEGATIVE_INFINITY)) {
      providers.set(value.provider, value);
    }
  }
  return [...providers.values()];
}

function uniqueIdentifiers(values: readonly ReferenceDiscoveryIdentifier[]): readonly ReferenceDiscoveryIdentifier[] {
  return [...new Map(values.map((value) => [identifierKey(value), value])).values()];
}

function identifierKey(value: ReferenceDiscoveryIdentifier): string {
  return `${value.scheme}:${value.value.trim().toLocaleLowerCase()}`;
}

function isDiscoverySource(value: unknown): value is ReferenceDiscoverySource {
  return (
    isRecord(value) &&
    (value.provider === "openalex" || value.provider === "crossref" || value.provider === "semantic-scholar") &&
    (value.score === null || (typeof value.score === "number" && Number.isFinite(value.score)))
  );
}

function isDiscoveryIdentifier(value: unknown): value is ReferenceDiscoveryIdentifier {
  return (
    isRecord(value) &&
    (value.scheme === "doi" ||
      value.scheme === "openalex" ||
      value.scheme === "semantic-scholar" ||
      value.scheme === "arxiv" ||
      value.scheme === "pmid") &&
    typeof value.value === "string" &&
    value.value.trim().length > 0 &&
    value.value.length <= 500
  );
}

function isDiscoveryMetadata(value: unknown): value is PublicationEnrichment {
  return (
    isRecord(value) &&
    (value.type === undefined || boundedString(value.type, 32, true)) &&
    boundedString(value.title, 2_000, true) &&
    Array.isArray(value.authors) &&
    value.authors.length <= 100 &&
    value.authors.every((author) => boundedString(author, 500, true)) &&
    boundedString(value.year, 32) &&
    boundedString(value.venue, 2_000) &&
    boundedString(value.doi, 500) &&
    boundedString(value.url, 2_000) &&
    boundedString(value.abstract, 20_000)
  );
}

function boundedString(value: unknown, maximumLength: number, required = false): value is string {
  return typeof value === "string" && value.length <= maximumLength && (!required || value.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
