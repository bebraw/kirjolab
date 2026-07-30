import type { ReviewImportRecord } from "../../domain/review/review-search";

export function parseStoredReviewImportRecord(value: string): ReviewImportRecord {
  const parsed: unknown = JSON.parse(value);
  if (!isReviewImportRecord(parsed)) throw new Error("Stored review import record is invalid");
  return parsed;
}

function isReviewImportRecord(value: unknown): value is ReviewImportRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "citationKey" in value &&
    typeof value.citationKey === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "authors" in value &&
    Array.isArray(value.authors) &&
    value.authors.every((author) => typeof author === "string") &&
    "year" in value &&
    typeof value.year === "string" &&
    "doi" in value &&
    typeof value.doi === "string" &&
    "warnings" in value &&
    Array.isArray(value.warnings)
  );
}
