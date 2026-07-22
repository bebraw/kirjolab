export interface BibliographicRecordFields {
  readonly referenceKey: string;
  readonly type: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly venue: string;
  readonly doi: string;
  readonly url: string;
  readonly abstract: string;
  readonly provenance: Readonly<Record<string, unknown>>;
}

export function hasBibliographicRecordFields(value: Record<string, unknown>): value is Record<string, unknown> & BibliographicRecordFields {
  return (
    typeof value.referenceKey === "string" &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.authors) &&
    value.authors.every((author) => typeof author === "string") &&
    typeof value.year === "string" &&
    typeof value.venue === "string" &&
    typeof value.doi === "string" &&
    typeof value.url === "string" &&
    typeof value.abstract === "string" &&
    isRecord(value.provenance)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
