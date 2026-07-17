import type { ReviewEvidenceSnapshot, EvidenceRecordState, ExtractedDataValue } from "./review-evidence";
import type { ReviewScreeningSnapshot } from "./review-screening";
import type { ReviewSearchSnapshot } from "./review-search";
import type { ReviewStudySnapshot } from "./review-study";

export interface ReviewSynthesis {
  readonly revision: number;
  readonly protocolRevision: number;
  readonly flow: {
    readonly identified: number;
    readonly duplicatesRemoved: number;
    readonly titleAbstractScreened: number;
    readonly titleAbstractExcluded: number;
    readonly fullTextAssessed: number;
    readonly fullTextExcluded: number;
    readonly included: number;
  };
  readonly sourceYields: readonly { readonly source: string; readonly imported: number; readonly uniqueOccurrences: number }[];
  readonly rqCoverage: readonly { readonly id: string; readonly question: string; readonly studies: number }[];
  readonly matrix: readonly Record<string, string | number | boolean | null>[];
  readonly extractionColumns: readonly string[];
}

export function buildReviewSynthesis(
  protocol: ReviewStudySnapshot,
  search: ReviewSearchSnapshot,
  screening: ReviewScreeningSnapshot,
  evidence: ReviewEvidenceSnapshot,
): ReviewSynthesis {
  const included = screening.records.filter((record) => record.fullText.outcome === "include");
  const sourceYields = search.runs.map((run) => ({
    source: run.sourceName,
    imported: run.occurrenceCount,
    uniqueOccurrences: new Set(
      search.occurrences.filter((occurrence) => occurrence.runId === run.id).map((occurrence) => occurrence.recordId),
    ).size,
  }));
  const extractionColumns = evidence.protocol.extractionFields.map((field) => field.label);
  const matrix = evidence.records.map((record) => synthesisRow(record, evidence));
  const rqCoverage = protocol.protocol.researchQuestions.map((question) => {
    const fieldIds = evidence.protocol.extractionFields
      .filter((field) => field.researchQuestionIds.includes(question.id))
      .map((field) => field.id);
    const studies = evidence.records.filter((record) =>
      latestExtraction(record).some((value) => fieldIds.includes(value.fieldId) && value.value !== null),
    ).length;
    return { id: question.id, question: question.text, studies };
  });
  return {
    revision: Math.max(protocol.revision, search.revision, screening.revision, evidence.revision),
    protocolRevision: protocol.protocol.revision,
    flow: {
      identified: search.counts.identified,
      duplicatesRemoved: search.counts.duplicatesRemoved,
      titleAbstractScreened: screening.records.length,
      titleAbstractExcluded: screening.records.filter((record) => record.titleAbstract.outcome === "exclude").length,
      fullTextAssessed: screening.records.filter((record) => record.titleAbstract.outcome === "include").length,
      fullTextExcluded: screening.records.filter((record) => record.fullText.outcome === "exclude").length,
      included: included.length,
    },
    sourceYields,
    rqCoverage,
    matrix,
    extractionColumns,
  };
}

export function reviewSynthesisCsv(synthesis: ReviewSynthesis): string {
  const columns = ["title", "authors", "year", "qualityScore", "qualityRejected", ...synthesis.extractionColumns];
  const rows = synthesis.matrix.map((row) => columns.map((column) => csvCell(row[column] ?? null)).join(","));
  return `${columns.map(csvCell).join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

export function reviewSynthesisMarkdown(synthesis: ReviewSynthesis): string {
  const flow = synthesis.flow;
  const sourceRows = synthesis.sourceYields
    .map((source) => `| ${escapeTable(source.source)} | ${source.imported} | ${source.uniqueOccurrences} |`)
    .join("\n");
  const rqRows = synthesis.rqCoverage.map((rq) => `| ${escapeTable(rq.id)} | ${escapeTable(rq.question)} | ${rq.studies} |`).join("\n");
  const matrixColumns = ["Study", "Year", "Quality", ...synthesis.extractionColumns];
  const matrixRows = synthesis.matrix
    .map((row) =>
      [row.title, row.year, row.qualityScore, ...synthesis.extractionColumns.map((column) => row[column])]
        .map((value) => escapeTable(value === null || value === undefined ? "Not reported" : String(value)))
        .join(" | "),
    )
    .map((row) => `| ${row} |`)
    .join("\n");
  return `# Review synthesis

> Derived from review revision ${synthesis.revision} and protocol revision ${synthesis.protocolRevision}. Regenerate after reviewing changed evidence.

## Study flow

- Records identified: ${flow.identified}
- Duplicates removed: ${flow.duplicatesRemoved}
- Title and abstract records screened: ${flow.titleAbstractScreened}
- Title and abstract exclusions: ${flow.titleAbstractExcluded}
- Full texts assessed: ${flow.fullTextAssessed}
- Full-text exclusions: ${flow.fullTextExcluded}
- Studies included: ${flow.included}

## Source yield

| Source | Imported | Unique before reviewed cross-source deduplication |
| --- | ---: | ---: |
${sourceRows}

## Research-question coverage

| RQ | Question | Studies with extracted evidence |
| --- | --- | ---: |
${rqRows}

## Evidence matrix

| ${matrixColumns.map(escapeTable).join(" | ")} |
| ${matrixColumns.map(() => "---").join(" | ")} |
${matrixRows}
`;
}

export function parseReviewSynthesis(value: unknown): ReviewSynthesis {
  if (
    !isRecord(value) ||
    !isRecord(value.flow) ||
    !Array.isArray(value.sourceYields) ||
    !Array.isArray(value.rqCoverage) ||
    !Array.isArray(value.matrix) ||
    !Array.isArray(value.extractionColumns)
  ) {
    throw new Error("Review synthesis is invalid");
  }
  return {
    revision: integer(value.revision),
    protocolRevision: integer(value.protocolRevision),
    flow: {
      identified: integer(value.flow.identified),
      duplicatesRemoved: integer(value.flow.duplicatesRemoved),
      titleAbstractScreened: integer(value.flow.titleAbstractScreened),
      titleAbstractExcluded: integer(value.flow.titleAbstractExcluded),
      fullTextAssessed: integer(value.flow.fullTextAssessed),
      fullTextExcluded: integer(value.flow.fullTextExcluded),
      included: integer(value.flow.included),
    },
    sourceYields: value.sourceYields.map((item) => {
      if (!isRecord(item)) throw new Error("Review source yield is invalid");
      return { source: text(item.source), imported: integer(item.imported), uniqueOccurrences: integer(item.uniqueOccurrences) };
    }),
    rqCoverage: value.rqCoverage.map((item) => {
      if (!isRecord(item)) throw new Error("Review RQ coverage is invalid");
      return { id: text(item.id), question: text(item.question), studies: integer(item.studies) };
    }),
    matrix: value.matrix.map((row) => {
      if (
        !isRecord(row) ||
        !Object.values(row).every(
          (cell) => cell === null || typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean",
        )
      ) {
        throw new Error("Review synthesis matrix is invalid");
      }
      const parsed: Record<string, string | number | boolean | null> = {};
      for (const [key, cell] of Object.entries(row)) {
        if (cell === null || typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") parsed[key] = cell;
      }
      return parsed;
    }),
    extractionColumns: value.extractionColumns.map(text),
  };
}

function synthesisRow(record: EvidenceRecordState, evidence: ReviewEvidenceSnapshot): Record<string, string | number | boolean | null> {
  const latest = new Map(latestExtraction(record).map((value) => [value.fieldId, value] as const));
  const row: Record<string, string | number | boolean | null> = {
    title: record.record.metadata.title,
    authors: record.record.metadata.authors.join("; "),
    year: record.record.metadata.year,
    qualityScore: record.qualityScore,
    qualityRejected: record.qualityRejected,
  };
  for (const field of evidence.protocol.extractionFields) {
    const value = latest.get(field.id);
    row[field.label] = value?.value ?? (value?.missingReason ? `Missing: ${value.missingReason}` : null);
  }
  return row;
}

function latestExtraction(record: EvidenceRecordState): ExtractedDataValue[] {
  const latest = new Map<string, ExtractedDataValue>();
  for (const value of record.extractionValues) latest.set(value.fieldId, value);
  return [...latest.values()];
}

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll(/\s+/gu, " ").trim();
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Review synthesis count is invalid");
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Review synthesis text is invalid");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
