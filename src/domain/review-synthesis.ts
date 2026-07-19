import {
  effectiveExtractionValues,
  type ExtractionValue,
  type ReviewEvidenceSnapshot,
  type EvidenceRecordState,
  type ExtractedDataValue,
  type ReviewSourceSelectorValue,
} from "./review-evidence";
import { currentReviewFindings, parseReviewFindingsSnapshot, type ReviewFinding, type ReviewFindingsSnapshot } from "./review-findings";
import type { ReviewScreeningSnapshot } from "./review-screening";
import type { ReviewSearchSnapshot } from "./review-search";
import type { ReviewReassessmentSnapshot, ReviewStudySnapshot } from "./review-study";

export const reviewAnalysisDefinitionSchemaVersion = "kirjolab-review-analysis-v1" as const;

export type ReviewAnalysisType = "process" | "evidence" | "report";

export interface ReviewAnalysisFilter {
  readonly field: string;
  readonly operator: "equals" | "effective-by-cardinality";
  readonly value: string;
}

export interface ReviewAnalysisDefinition {
  readonly id: "review-process-analysis" | "review-evidence-synthesis" | "review-synthesis-report";
  readonly revision: 1;
  readonly type: ReviewAnalysisType;
  readonly reviewRevision: number;
  readonly protocolRevision: number;
  readonly generatorSchema: typeof reviewAnalysisDefinitionSchemaVersion;
  readonly filters: readonly ReviewAnalysisFilter[];
  readonly columns: readonly string[];
  readonly dimensions: readonly string[];
}

export type ReviewSynthesisDiagnosticCode =
  | "review-revision-mismatch"
  | "protocol-draft"
  | "protocol-revision-mismatch"
  | "protocol-reassessment-open"
  | "duplicate-resolution-incomplete"
  | "screening-incomplete"
  | "screening-conflict"
  | "included-evidence-missing"
  | "appraisal-incomplete"
  | "extraction-incomplete"
  | "appraisal-provenance-missing"
  | "extraction-provenance-missing"
  | "record-provenance-missing";

export interface ReviewSynthesisDiagnostic {
  readonly code: ReviewSynthesisDiagnosticCode;
  readonly severity: "error" | "warning";
  readonly blocking: boolean;
  readonly message: string;
  readonly recordIds: readonly string[];
  readonly contributorIds: readonly string[];
}

export interface ReviewSynthesisContributor {
  readonly recordId: string;
  readonly occurrenceIds: readonly string[];
  readonly screeningDecisionIds: readonly string[];
  readonly screeningAdjudicationIds: readonly string[];
  readonly appraisalValueIds: readonly string[];
  readonly extractionValueIds: readonly string[];
}

export interface ReviewSynthesis {
  readonly revision: number;
  readonly protocolRevision: number;
  readonly definitions: readonly ReviewAnalysisDefinition[];
  readonly diagnostics: readonly ReviewSynthesisDiagnostic[];
  readonly contributors: readonly ReviewSynthesisContributor[];
  readonly findings: readonly ReviewFinding[];
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
  findings?: ReviewFindingsSnapshot,
  reassessment?: ReviewReassessmentSnapshot,
): ReviewSynthesis {
  const revision = Math.max(
    protocol.revision,
    search.revision,
    screening.revision,
    evidence.revision,
    findings?.revision ?? 0,
    reassessment?.revision ?? 0,
  );
  const included = screening.records.filter((record) => record.finalInclusion.outcome === "include");
  const includedIds = new Set(included.map((record) => record.record.id));
  const sourceYields = search.runs.map((run) => ({
    source: run.sourceName,
    imported: run.occurrenceCount,
    uniqueOccurrences: new Set(
      search.occurrences.filter((occurrence) => occurrence.runId === run.id).map((occurrence) => occurrence.recordId),
    ).size,
  }));
  const extractionColumns = evidence.protocol.extractionFields.map((field) => field.label);
  const matrix = evidence.records.filter((record) => includedIds.has(record.record.id)).map((record) => synthesisRow(record, evidence));
  const rqCoverage = protocol.protocol.researchQuestions.map((question) => {
    const fieldIds = evidence.protocol.extractionFields
      .filter((field) => field.researchQuestionIds.includes(question.id))
      .map((field) => field.id);
    const studies = evidence.records.filter(
      (record) =>
        includedIds.has(record.record.id) &&
        synthesisExtraction(record, evidence).some((value) => fieldIds.includes(value.fieldId) && value.value !== null),
    ).length;
    return { id: question.id, question: question.text, studies };
  });
  return {
    revision,
    protocolRevision: protocol.protocol.revision,
    definitions: analysisDefinitions(revision, protocol.protocol.revision, evidence),
    diagnostics: synthesisDiagnostics(protocol, search, screening, evidence, findings, reassessment),
    contributors: synthesisContributors(search, screening, evidence),
    findings: findings ? currentReviewFindings(findings) : [],
    flow: {
      identified: search.counts.identified,
      duplicatesRemoved: search.counts.duplicatesRemoved,
      titleAbstractScreened: screening.records.length,
      titleAbstractExcluded: screening.records.filter((record) => record.titleAbstract.outcome === "exclude").length,
      fullTextAssessed: screening.records.filter((record) => record.titleAbstract.outcome === "include").length,
      fullTextExcluded: screening.records.filter(
        (record) => record.fullText.outcome === "exclude" || record.finalInclusion.outcome === "exclude",
      ).length,
      included: included.length,
    },
    sourceYields,
    rqCoverage,
    matrix,
    extractionColumns,
  };
}

export function reviewSynthesisCsv(synthesis: ReviewSynthesis): string {
  const columns = ["recordId", "title", "authors", "year", "qualityScore", "qualityRejected", ...synthesis.extractionColumns];
  const rows = synthesis.matrix.map((row) => columns.map((column) => csvCell(row[column] ?? null)).join(","));
  return `${columns.map(csvCell).join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

export function reviewSynthesisMarkdown(synthesis: ReviewSynthesis): string {
  const flow = synthesis.flow;
  const sourceRows = synthesis.sourceYields
    .map((source) => `| ${escapeTable(source.source)} | ${source.imported} | ${source.uniqueOccurrences} |`)
    .join("\n");
  const rqRows = synthesis.rqCoverage.map((rq) => `| ${escapeTable(rq.id)} | ${escapeTable(rq.question)} | ${rq.studies} |`).join("\n");
  const findingRows = synthesis.findings
    .map(
      (finding) =>
        `| ${escapeTable(finding.researchQuestionId)} | ${escapeTable(finding.statement)} | ${escapeTable(finding.interpretation || "—")} | ${finding.extractionValueIds.length + finding.appraisalValueIds.length} |`,
    )
    .join("\n");
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

## Evidence-linked findings

| RQ | Finding | Interpretation | Contributing values |
| --- | --- | --- | ---: |
${findingRows}

## Evidence matrix

| ${matrixColumns.map(escapeTable).join(" | ")} |
| ${matrixColumns.map(() => "---").join(" | ")} |
${matrixRows}
`;
}

export function blockingReviewSynthesisDiagnostics(synthesis: ReviewSynthesis): readonly ReviewSynthesisDiagnostic[] {
  return synthesis.diagnostics.filter((diagnostic) => diagnostic.blocking);
}

export function reviewSynthesisReportDefinition(synthesis: ReviewSynthesis): ReviewAnalysisDefinition {
  const definition = synthesis.definitions.find((candidate) => candidate.id === "review-synthesis-report");
  if (!definition || definition.reviewRevision !== synthesis.revision || definition.protocolRevision !== synthesis.protocolRevision) {
    throw new Error("Review synthesis report definition is not bound to the synthesis revision");
  }
  return definition;
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
  const revision = integer(value.revision);
  const protocolRevision = integer(value.protocolRevision);
  const extractionColumns = value.extractionColumns.map(text);
  return {
    revision,
    protocolRevision,
    definitions: Array.isArray(value.definitions)
      ? value.definitions.map(parseAnalysisDefinition)
      : legacyAnalysisDefinitions(revision, protocolRevision, extractionColumns),
    diagnostics: Array.isArray(value.diagnostics) ? value.diagnostics.map(parseSynthesisDiagnostic) : [],
    contributors: Array.isArray(value.contributors) ? value.contributors.map(parseSynthesisContributor) : [],
    findings: Array.isArray(value.findings) ? parseReviewFindingsSnapshot({ revision, findings: value.findings }).findings : [],
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
    extractionColumns,
  };
}

function analysisDefinitions(
  reviewRevision: number,
  protocolRevision: number,
  evidence: ReviewEvidenceSnapshot,
): readonly ReviewAnalysisDefinition[] {
  const extractionColumns = evidence.protocol.extractionFields.map((field) => field.id);
  const researchQuestionDimensions = evidence.protocol.researchQuestions.map((question) => question.id);
  const binding = {
    revision: 1 as const,
    reviewRevision,
    protocolRevision,
    generatorSchema: reviewAnalysisDefinitionSchemaVersion,
  };
  return [
    {
      ...binding,
      id: "review-process-analysis",
      type: "process",
      filters: [],
      columns: ["identified", "duplicatesRemoved", "titleAbstractScreened", "fullTextAssessed", "included"],
      dimensions: ["source", "screeningStage"],
    },
    {
      ...binding,
      id: "review-evidence-synthesis",
      type: "evidence",
      filters: [
        { field: "record.state", operator: "equals", value: "active" },
        { field: "screening.finalInclusion.outcome", operator: "equals", value: "include" },
        { field: "extraction.fieldId", operator: "effective-by-cardinality", value: "fieldId" },
      ],
      columns: ["recordId", "title", "authors", "year", "qualityScore", "qualityRejected", ...extractionColumns],
      dimensions: ["researchQuestion", ...researchQuestionDimensions],
    },
    {
      ...binding,
      id: "review-synthesis-report",
      type: "report",
      filters: [{ field: "diagnostic.blocking", operator: "equals", value: "false" }],
      columns: ["studyFlow", "sourceYield", "researchQuestionCoverage", "evidenceLinkedFindings", "evidenceMatrix"],
      dimensions: ["process", "evidence", "researchQuestionFinding"],
    },
  ];
}

function legacyAnalysisDefinitions(
  reviewRevision: number,
  protocolRevision: number,
  extractionColumns: readonly string[],
): readonly ReviewAnalysisDefinition[] {
  return analysisDefinitions(reviewRevision, protocolRevision, {
    revision: reviewRevision,
    protocolRevision,
    protocol: {
      researchQuestions: [],
      qualityAssessment: { questions: [], answers: [], minimumScore: null },
      extractionFields: extractionColumns.map((label) => ({
        id: label,
        label,
        type: "text",
        values: [],
        researchQuestionIds: [],
        requiredness: "required",
        cardinality: "single",
        condition: null,
      })),
    },
    records: [],
  });
}

function synthesisDiagnostics(
  protocol: ReviewStudySnapshot,
  search: ReviewSearchSnapshot,
  screening: ReviewScreeningSnapshot,
  evidence: ReviewEvidenceSnapshot,
  findings?: ReviewFindingsSnapshot,
  reassessment?: ReviewReassessmentSnapshot,
): readonly ReviewSynthesisDiagnostic[] {
  const diagnostics: ReviewSynthesisDiagnostic[] = [];
  const revisions = [
    protocol.revision,
    search.revision,
    screening.revision,
    evidence.revision,
    ...(findings ? [findings.revision] : []),
    ...(reassessment ? [reassessment.revision] : []),
  ];
  if (new Set(revisions).size !== 1) {
    diagnostics.push(diagnostic("review-revision-mismatch", `Review inputs do not share one exact revision (${revisions.join(", ")}).`));
  }
  if (protocol.protocol.status !== "frozen") {
    diagnostics.push(diagnostic("protocol-draft", "The review protocol must be frozen before derived output is published."));
  }
  if (evidence.protocolRevision !== protocol.protocol.revision) {
    diagnostics.push(
      diagnostic(
        "protocol-revision-mismatch",
        `Evidence uses protocol revision ${evidence.protocolRevision}, but the review uses protocol revision ${protocol.protocol.revision}.`,
      ),
    );
  }

  const openReassessments = reassessment?.obligations.filter((obligation) => obligation.status === "open") ?? [];
  if (openReassessments.length > 0) {
    diagnostics.push(
      diagnostic(
        "protocol-reassessment-open",
        `${openReassessments.length} protocol amendment reassessment obligation${openReassessments.length === 1 ? " remains" : "s remain"} open.`,
        openReassessments.flatMap((obligation) => (obligation.recordId === null ? [] : [obligation.recordId])),
        openReassessments.map((obligation) => obligation.id),
      ),
    );
  }

  const pendingDuplicates = search.duplicateCandidates.filter((candidate) => candidate.status === "pending");
  if (pendingDuplicates.length > 0) {
    diagnostics.push(
      diagnostic(
        "duplicate-resolution-incomplete",
        `${pendingDuplicates.length} duplicate candidate${pendingDuplicates.length === 1 ? " is" : "s are"} unresolved.`,
        pendingDuplicates.flatMap((candidate) => [candidate.leftId, candidate.rightId]),
        pendingDuplicates.map((candidate) => candidate.id),
      ),
    );
  }

  const conflicts = screening.records.filter(
    (record) => record.titleAbstract.outcome === "conflict" || record.fullText.outcome === "conflict",
  );
  if (conflicts.length > 0) {
    diagnostics.push(
      diagnostic(
        "screening-conflict",
        `${conflicts.length} record${conflicts.length === 1 ? " has" : "s have"} an unresolved screening conflict.`,
        conflicts.map((record) => record.record.id),
        conflicts.flatMap(screeningContributorIds),
      ),
    );
  }
  const incompleteScreening = screening.records.filter(
    (record) =>
      record.titleAbstract.outcome === "pending" ||
      record.titleAbstract.outcome === "uncertain" ||
      (record.titleAbstract.outcome === "include" && (record.fullText.outcome === "pending" || record.fullText.outcome === "uncertain")) ||
      (record.fullText.outcome === "include" && record.finalInclusion.outcome === "pending"),
  );
  if (incompleteScreening.length > 0) {
    diagnostics.push(
      diagnostic(
        "screening-incomplete",
        `${incompleteScreening.length} record${incompleteScreening.length === 1 ? " has" : "s have"} incomplete screening.`,
        incompleteScreening.map((record) => record.record.id),
        incompleteScreening.flatMap(screeningContributorIds),
      ),
    );
  }

  const includedIds = new Set(
    screening.records.filter((record) => record.finalInclusion.outcome === "include").map((record) => record.record.id),
  );
  const evidenceByRecord = new Map(evidence.records.map((record) => [record.record.id, record] as const));
  const missingEvidenceRecords = [...includedIds].filter((recordId) => !evidenceByRecord.has(recordId));
  if (missingEvidenceRecords.length > 0) {
    diagnostics.push(
      diagnostic(
        "included-evidence-missing",
        `${missingEvidenceRecords.length} included record${missingEvidenceRecords.length === 1 ? " has" : "s have"} no evidence state.`,
        missingEvidenceRecords,
      ),
    );
  }
  const includedEvidence = evidence.records.filter((record) => includedIds.has(record.record.id));
  const appraisalIncomplete = includedEvidence.filter((record) => !record.qualityComplete);
  if (appraisalIncomplete.length > 0) {
    diagnostics.push(
      diagnostic(
        "appraisal-incomplete",
        `${appraisalIncomplete.length} included record${appraisalIncomplete.length === 1 ? " has" : "s have"} incomplete appraisal.`,
        appraisalIncomplete.map((record) => record.record.id),
        appraisalIncomplete.flatMap((record) => latestValues(record.qualityValues, (value) => value.questionId).map((value) => value.id)),
      ),
    );
  }
  const extractionIncomplete = includedEvidence.filter((record) => !record.extractionComplete);
  if (extractionIncomplete.length > 0) {
    diagnostics.push(
      diagnostic(
        "extraction-incomplete",
        `${extractionIncomplete.length} included record${extractionIncomplete.length === 1 ? " has" : "s have"} incomplete extraction.`,
        extractionIncomplete.map((record) => record.record.id),
        extractionIncomplete.flatMap((record) => synthesisExtraction(record, evidence).map((value) => value.id)),
      ),
    );
  }
  const appraisalWithoutProvenance = includedEvidence.flatMap((record) =>
    latestValues(record.qualityValues, (value) => value.questionId)
      .filter((value) => value.evidence === null)
      .map((value) => ({ recordId: record.record.id, valueId: value.id })),
  );
  if (appraisalWithoutProvenance.length > 0) {
    diagnostics.push(
      diagnostic(
        "appraisal-provenance-missing",
        `${appraisalWithoutProvenance.length} appraisal value${appraisalWithoutProvenance.length === 1 ? " lacks" : "s lack"} evidence provenance.`,
        appraisalWithoutProvenance.map((value) => value.recordId),
        appraisalWithoutProvenance.map((value) => value.valueId),
      ),
    );
  }
  const extractionWithoutProvenance = includedEvidence.flatMap((record) =>
    synthesisExtraction(record, evidence)
      .filter((value) => value.value !== null && value.evidence === null)
      .map((value) => ({ recordId: record.record.id, valueId: value.id })),
  );
  if (extractionWithoutProvenance.length > 0) {
    diagnostics.push(
      diagnostic(
        "extraction-provenance-missing",
        `${extractionWithoutProvenance.length} extracted value${extractionWithoutProvenance.length === 1 ? " lacks" : "s lack"} evidence provenance.`,
        extractionWithoutProvenance.map((value) => value.recordId),
        extractionWithoutProvenance.map((value) => value.valueId),
      ),
    );
  }
  const occurrenceRecordIds = new Set(search.occurrences.map((occurrence) => occurrence.recordId));
  const recordsWithoutProvenance = [...includedIds].filter((recordId) => !occurrenceRecordIds.has(recordId));
  if (recordsWithoutProvenance.length > 0) {
    diagnostics.push(
      diagnostic(
        "record-provenance-missing",
        `${recordsWithoutProvenance.length} included record${recordsWithoutProvenance.length === 1 ? " has" : "s have"} no import occurrence.`,
        recordsWithoutProvenance,
      ),
    );
  }
  return diagnostics;
}

function diagnostic(
  code: ReviewSynthesisDiagnosticCode,
  message: string,
  recordIds: readonly string[] = [],
  contributorIds: readonly string[] = [],
): ReviewSynthesisDiagnostic {
  return {
    code,
    severity: "error",
    blocking: true,
    message,
    recordIds: sortedStrings(recordIds),
    contributorIds: sortedStrings(contributorIds),
  };
}

function synthesisContributors(
  search: ReviewSearchSnapshot,
  screening: ReviewScreeningSnapshot,
  evidence: ReviewEvidenceSnapshot,
): readonly ReviewSynthesisContributor[] {
  const recordIds = new Set([
    ...search.records.map((record) => record.id),
    ...screening.records.map((record) => record.record.id),
    ...evidence.records.map((record) => record.record.id),
  ]);
  const screeningByRecord = new Map(screening.records.map((record) => [record.record.id, record] as const));
  const evidenceByRecord = new Map(evidence.records.map((record) => [record.record.id, record] as const));
  return sortedStrings(recordIds).map((recordId) => {
    const screeningRecord = screeningByRecord.get(recordId);
    const evidenceRecord = evidenceByRecord.get(recordId);
    const stages = screeningRecord ? [screeningRecord.titleAbstract, screeningRecord.fullText] : [];
    return {
      recordId,
      occurrenceIds: sortedStrings(search.occurrences.filter((value) => value.recordId === recordId).map((value) => value.id)),
      screeningDecisionIds: sortedStrings([
        ...stages.flatMap((stage) => stage.decisions.map((value) => value.id)),
        ...(screeningRecord?.finalInclusion.decision ? [screeningRecord.finalInclusion.decision.id] : []),
      ]),
      screeningAdjudicationIds: sortedStrings(stages.flatMap((stage) => (stage.adjudication ? [stage.adjudication.id] : []))),
      appraisalValueIds: sortedStrings(
        evidenceRecord ? latestValues(evidenceRecord.qualityValues, (value) => value.questionId).map((value) => value.id) : [],
      ),
      extractionValueIds: sortedStrings(evidenceRecord ? synthesisExtraction(evidenceRecord, evidence).map((value) => value.id) : []),
    };
  });
}

function screeningContributorIds(record: ReviewScreeningSnapshot["records"][number]): string[] {
  return [record.titleAbstract, record.fullText]
    .flatMap((stage) => [...stage.decisions.map((decision) => decision.id), ...(stage.adjudication ? [stage.adjudication.id] : [])])
    .concat(record.finalInclusion.decision ? [record.finalInclusion.decision.id] : []);
}

function synthesisRow(record: EvidenceRecordState, evidence: ReviewEvidenceSnapshot): Record<string, string | number | boolean | null> {
  const effective = synthesisExtraction(record, evidence);
  const row: Record<string, string | number | boolean | null> = {
    recordId: record.record.id,
    title: record.record.metadata.title,
    authors: record.record.metadata.authors.join("; "),
    year: record.record.metadata.year,
    qualityScore: record.qualityScore,
    qualityRejected: record.qualityRejected,
  };
  for (const field of evidence.protocol.extractionFields) {
    row[field.label] = synthesisCell(effective.filter((value) => value.fieldId === field.id));
  }
  return row;
}

function synthesisExtraction(record: EvidenceRecordState, evidence: ReviewEvidenceSnapshot): ExtractedDataValue[] {
  return effectiveExtractionValues(record.extractionValues, evidence.protocol.extractionFields);
}

function synthesisCell(values: readonly ExtractedDataValue[]): string | number | boolean | null {
  if (values.length === 0) return null;
  const rendered = values.map((value) =>
    value.value === null ? (value.missingReason ? `Missing: ${value.missingReason}` : null) : extractionValueText(value.value),
  );
  if (rendered.length === 1) return rendered[0] ?? null;
  return rendered.map((value) => (value === null ? "Not reported" : String(value))).join("; ");
}

function extractionValueText(value: Exclude<ExtractionValue, null>): string | number | boolean {
  if (isSourceSelectorValue(value)) return `${value.kind}:${value.resourceId}#${value.selectorId}`;
  if (typeof value === "object") return value.join("; ");
  return value;
}

function isSourceSelectorValue(value: Exclude<ExtractionValue, null>): value is ReviewSourceSelectorValue {
  return typeof value === "object" && !Array.isArray(value);
}

function csvCell(value: string | number | boolean | null): string {
  const text = spreadsheetSafeText(value === null ? "" : String(value));
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseAnalysisDefinition(value: unknown): ReviewAnalysisDefinition {
  if (
    !isRecord(value) ||
    !isAnalysisDefinitionId(value.id) ||
    value.revision !== 1 ||
    !isAnalysisType(value.type) ||
    value.generatorSchema !== reviewAnalysisDefinitionSchemaVersion ||
    !Array.isArray(value.filters) ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.dimensions)
  ) {
    throw new Error("Review analysis definition is invalid");
  }
  return {
    id: value.id,
    revision: 1,
    type: value.type,
    reviewRevision: integer(value.reviewRevision),
    protocolRevision: integer(value.protocolRevision),
    generatorSchema: reviewAnalysisDefinitionSchemaVersion,
    filters: value.filters.map((filter) => {
      if (
        !isRecord(filter) ||
        (filter.operator !== "equals" && filter.operator !== "effective-by-cardinality" && filter.operator !== "latest-by")
      ) {
        throw new Error("Review analysis filter is invalid");
      }
      return {
        field: text(filter.field),
        operator: filter.operator === "latest-by" ? "effective-by-cardinality" : filter.operator,
        value: text(filter.value),
      };
    }),
    columns: value.columns.map(text),
    dimensions: value.dimensions.map(text),
  };
}

function parseSynthesisDiagnostic(value: unknown): ReviewSynthesisDiagnostic {
  if (
    !isRecord(value) ||
    !isDiagnosticCode(value.code) ||
    (value.severity !== "error" && value.severity !== "warning") ||
    typeof value.blocking !== "boolean" ||
    !Array.isArray(value.recordIds) ||
    !Array.isArray(value.contributorIds)
  ) {
    throw new Error("Review synthesis diagnostic is invalid");
  }
  return {
    code: value.code,
    severity: value.severity,
    blocking: value.blocking,
    message: text(value.message),
    recordIds: value.recordIds.map(text),
    contributorIds: value.contributorIds.map(text),
  };
}

function parseSynthesisContributor(value: unknown): ReviewSynthesisContributor {
  if (
    !isRecord(value) ||
    !Array.isArray(value.occurrenceIds) ||
    !Array.isArray(value.screeningDecisionIds) ||
    !Array.isArray(value.screeningAdjudicationIds) ||
    !Array.isArray(value.appraisalValueIds) ||
    !Array.isArray(value.extractionValueIds)
  ) {
    throw new Error("Review synthesis contributor is invalid");
  }
  return {
    recordId: text(value.recordId),
    occurrenceIds: value.occurrenceIds.map(text),
    screeningDecisionIds: value.screeningDecisionIds.map(text),
    screeningAdjudicationIds: value.screeningAdjudicationIds.map(text),
    appraisalValueIds: value.appraisalValueIds.map(text),
    extractionValueIds: value.extractionValueIds.map(text),
  };
}

function latestValues<Value>(values: readonly Value[], key: (value: Value) => string): Value[] {
  const latest = new Map<string, Value>();
  for (const value of values) latest.set(key(value), value);
  return [...latest.values()];
}

function sortedStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function spreadsheetSafeText(value: string): string {
  return /^[=+@-]/u.test(value) ? `'${value}` : value;
}

function isAnalysisDefinitionId(value: unknown): value is ReviewAnalysisDefinition["id"] {
  return value === "review-process-analysis" || value === "review-evidence-synthesis" || value === "review-synthesis-report";
}

function isAnalysisType(value: unknown): value is ReviewAnalysisType {
  return value === "process" || value === "evidence" || value === "report";
}

function isDiagnosticCode(value: unknown): value is ReviewSynthesisDiagnosticCode {
  return (
    value === "review-revision-mismatch" ||
    value === "protocol-draft" ||
    value === "protocol-revision-mismatch" ||
    value === "protocol-reassessment-open" ||
    value === "duplicate-resolution-incomplete" ||
    value === "screening-incomplete" ||
    value === "screening-conflict" ||
    value === "included-evidence-missing" ||
    value === "appraisal-incomplete" ||
    value === "extraction-incomplete" ||
    value === "appraisal-provenance-missing" ||
    value === "extraction-provenance-missing" ||
    value === "record-provenance-missing"
  );
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
