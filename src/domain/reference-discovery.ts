import { isPublicationEnrichment, type PublicationEnrichment } from "./workspace";

export type ReferenceDiscoveryProvider = "openalex" | "crossref" | "semantic-scholar";

export const referenceDiscoveryTypes = ["", "article", "book", "incollection", "inproceedings", "phdthesis", "techreport"] as const;
export type ReferenceDiscoveryType = (typeof referenceDiscoveryTypes)[number];

export interface ReferenceDiscoveryQuery {
  readonly query: string;
  readonly author: string;
  readonly year: string;
  readonly type: ReferenceDiscoveryType;
}

export interface ReferenceDiscoveryResult {
  readonly provider: ReferenceDiscoveryProvider;
  readonly score: number | null;
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

export function isReferenceDiscoveryResults(value: unknown): value is readonly ReferenceDiscoveryResult[] {
  return (
    Array.isArray(value) &&
    value.length <= 12 &&
    value.every(
      (item) =>
        isRecord(item) &&
        (item.provider === "openalex" || item.provider === "crossref" || item.provider === "semantic-scholar") &&
        (item.score === null || (typeof item.score === "number" && Number.isFinite(item.score))) &&
        isPublicationEnrichment(item.metadata) &&
        Boolean(item.metadata.doi),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
