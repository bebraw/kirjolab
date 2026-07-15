import { isPublicationEnrichment, type PublicationEnrichment } from "./workspace";

export type ReferenceDiscoveryProvider = "openalex" | "crossref" | "semantic-scholar";

export interface ReferenceDiscoveryResult {
  readonly provider: ReferenceDiscoveryProvider;
  readonly score: number | null;
  readonly metadata: PublicationEnrichment;
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
