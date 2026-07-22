import { serializeBibTeX, type BibTeXEntry } from "./bibliography";
import type { ReviewEvidenceSnapshot, ReviewSourceSelectorValue } from "./review-evidence";
import type { ScreeningRecordState } from "./review-screening";
import type { ReviewExportAuthority } from "./review-export-types";

type ExtractionEntry = ReviewEvidenceSnapshot["records"][number]["extractionValues"][number];
type ExtractionEvidence = ExtractionEntry["evidence"];

export function reviewExtractionCsv(authority: ReviewExportAuthority): string {
  const columns = [
    "recordId",
    "title",
    "protocolRevision",
    "fieldId",
    "criterionId",
    "criterionText",
    "field",
    "value",
    "valueSelectorKind",
    "valueResourceId",
    "valueSelectorId",
    "missingReason",
    "evidenceSelectorKind",
    "evidenceResourceId",
    "evidenceSelectorId",
    "quote",
    "page",
    "location",
    "reviewer",
    "createdAt",
  ];
  const fields = new Map(authority.evidence.protocol.extractionFields.map((field) => [field.id, field.label] as const));
  const rows = authority.evidence.records.flatMap((record) =>
    record.extractionValues.map((entry) => extractionRow(record.record.id, record.record.metadata.title, entry, fields)),
  );
  return `${columns.map(csvCell).join(",")}\n${rows.map((row) => row.map(csvCell).join(",")).join("\n")}${rows.length ? "\n" : ""}`;
}

function extractionRow(recordId: string, title: string, entry: ExtractionEntry, fields: ReadonlyMap<string, string>): readonly string[] {
  const selector = sourceSelector(entry.value);
  const evidence = evidenceCells(entry.evidence);
  return [
    recordId,
    title,
    String(entry.protocolRevision),
    entry.fieldId,
    entry.criterionId,
    entry.criterionText,
    fields.get(entry.fieldId) ?? entry.fieldId,
    extractionCell(entry.value),
    selector?.kind ?? "",
    selector?.resourceId ?? "",
    selector?.selectorId ?? "",
    entry.missingReason ?? "",
    ...evidence,
    entry.reviewer,
    entry.createdAt,
  ];
}

function evidenceCells(evidence: ExtractionEvidence): readonly string[] {
  if (!evidence) return ["", "", "", "", "", ""];
  const page = evidence.page === null ? "" : String(evidence.page);
  return [evidence.kind, evidence.resourceId, evidence.selectorId, evidence.quote, page, evidence.location];
}

export function reviewBibliographyBibTeX(authority: ReviewExportAuthority): string {
  const stateByRecord = new Map(authority.screening.records.map((record) => [record.record.id, record] as const));
  const entries: BibTeXEntry[] = authority.search.records
    .filter((record) => record.state === "active")
    .map((record) => {
      const metadata = record.metadata;
      const venueField = metadata.type === "inproceedings" ? "booktitle" : "journal";
      const fields: Record<string, string> = {
        title: metadata.title,
        author: metadata.authors.join(" and "),
        year: metadata.year,
        [venueField]: metadata.venue,
        doi: metadata.doi,
        url: metadata.url,
        abstract: metadata.abstract,
        kirjolab_status: screeningStatus(stateByRecord.get(record.id)),
        kirjolab_record_id: record.id,
      };
      return {
        type: metadata.type || "article",
        citationKey: `${metadata.citationKey}_${record.id.slice(0, 8)}`,
        fields: Object.fromEntries(Object.entries(fields).filter(([, value]) => value.trim())),
      };
    });
  return serializeBibTeX(entries);
}

function extractionCell(value: ReviewEvidenceSnapshot["records"][number]["extractionValues"][number]["value"]): string {
  if (value === null) return "";
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sourceSelector(
  value: ReviewEvidenceSnapshot["records"][number]["extractionValues"][number]["value"],
): { readonly kind: string; readonly resourceId: string; readonly selectorId: string } | null {
  if (value === null || typeof value !== "object" || !("kind" in value)) return null;
  return value satisfies ReviewSourceSelectorValue;
}

function screeningStatus(record: ScreeningRecordState | undefined): string {
  if (!record) return "unclassified";
  if (record.finalInclusion.outcome === "include") return "included";
  if (record.finalInclusion.outcome === "exclude") return "excluded-final";
  if (record.fullText.outcome === "include") return "awaiting-final-inclusion";
  if (record.fullText.outcome === "exclude") return "excluded-full-text";
  if (record.titleAbstract.outcome === "exclude") return "excluded-title-abstract";
  return record.titleAbstract.outcome;
}

function csvCell(value: string): string {
  const escaped = /^[=+@-]/u.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(escaped) ? `"${escaped.replaceAll('"', '""')}"` : escaped;
}
