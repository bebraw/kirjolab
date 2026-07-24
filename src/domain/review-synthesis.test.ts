import { describe, expect, it } from "vitest";
import type { ReviewEvidenceSnapshot } from "./review-evidence";
import { materializeReviewFinding } from "./review-findings";
import type { ReviewScreeningSnapshot, ScreeningDecision } from "./review-screening";
import type { ReviewSearchSnapshot } from "./review-search";
import {
  blockingReviewSynthesisDiagnostics,
  buildReviewSynthesis,
  parseReviewSynthesis,
  reviewAnalysisDefinitionSchemaVersion,
  reviewSynthesisCsv,
  reviewSynthesisMarkdown,
  reviewSynthesisReportDefinition,
} from "./review-synthesis";
import { defaultReviewProtocol, materializeProtocolRevision, type ReviewStudySnapshot } from "./review-study";

describe("review synthesis", () => {
  it("derives immutable definitions, contributor IDs, flow, coverage, CSV, and Markdown", () => {
    const input = fixture();
    const synthesis = buildReviewSynthesis(input.protocol, input.search, input.screening, input.evidence);

    expect(synthesis).toMatchObject({ revision: 5, flow: { identified: 1, included: 1 }, rqCoverage: [{ id: "rq1", studies: 1 }] });
    expect(synthesis.definitions).toHaveLength(3);
    expect(synthesis.definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "review-evidence-synthesis",
          revision: 1,
          reviewRevision: 5,
          protocolRevision: 2,
          generatorSchema: reviewAnalysisDefinitionSchemaVersion,
        }),
      ]),
    );
    expect(synthesis.definitions.find(({ id }) => id === "review-evidence-synthesis")?.filters).toContainEqual({
      field: "screening.finalInclusion.outcome",
      operator: "equals",
      value: "include",
    });
    expect(synthesis.definitions.find(({ id }) => id === "review-evidence-synthesis")?.filters).not.toContainEqual(
      expect.objectContaining({ field: "screening.fullText.outcome" }),
    );
    expect(synthesis.contributors).toEqual([
      {
        recordId: "record",
        occurrenceIds: ["occ"],
        screeningDecisionIds: ["final-inclusion", "screen-full-text", "screen-title-abstract"],
        screeningAdjudicationIds: [],
        appraisalValueIds: ["appraisal"],
        extractionValueIds: ["value"],
      },
    ]);
    expect(JSON.stringify(synthesis.contributors)).not.toContain("reviewer@example.com");
    expect(blockingReviewSynthesisDiagnostics(synthesis)).toEqual([]);
    expect(reviewSynthesisReportDefinition(synthesis)).toMatchObject({ id: "review-synthesis-report", revision: 1 });
    expect(reviewSynthesisCsv(synthesis)).toContain("Improves quality");
    expect(reviewSynthesisMarkdown(synthesis)).toContain("# Review synthesis");
    expect(parseReviewSynthesis(synthesis)).toEqual(synthesis);
    expect(() => parseReviewSynthesis({ flow: {}, sourceYields: [], rqCoverage: [], matrix: [], extractionColumns: [] })).toThrow("count");
  });

  it("reports blocking draft, revision, conflict, incomplete, and provenance diagnostics", () => {
    const input = fixture();
    const evidenceRecord = input.evidence.records[0]!;
    const synthesis = buildReviewSynthesis(
      { ...input.protocol, protocol: { ...input.protocol.protocol, status: "draft" } },
      {
        ...input.search,
        revision: 4,
        duplicateCandidates: [
          {
            id: "duplicate",
            leftId: "record",
            rightId: "other",
            signals: ["title-year"],
            confidence: "probable",
            status: "pending",
            resolvedAt: null,
            resolvedBy: null,
          },
        ],
      },
      {
        ...input.screening,
        records: [
          {
            ...input.screening.records[0]!,
            titleAbstract: { ...input.screening.records[0]!.titleAbstract, outcome: "conflict" },
          },
        ],
      },
      {
        ...input.evidence,
        protocolRevision: 1,
        records: [
          {
            ...evidenceRecord,
            qualityComplete: false,
            extractionComplete: false,
            qualityValues: [{ ...evidenceRecord.qualityValues[0]!, evidence: null }],
            extractionValues: [{ ...evidenceRecord.extractionValues[0]!, evidence: null }],
          },
        ],
      },
    );

    expect(synthesis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "review-revision-mismatch",
      "protocol-draft",
      "protocol-revision-mismatch",
      "duplicate-resolution-incomplete",
      "screening-conflict",
      "appraisal-incomplete",
      "extraction-incomplete",
      "appraisal-provenance-missing",
      "extraction-provenance-missing",
    ]);
    expect(blockingReviewSynthesisDiagnostics(synthesis).every((diagnostic) => diagnostic.severity === "error")).toBe(true);
  });

  it("escapes spreadsheet formula prefixes in synthesis CSV", () => {
    const input = fixture();
    const synthesis = buildReviewSynthesis(input.protocol, input.search, input.screening, input.evidence);
    const dangerous = {
      ...synthesis,
      matrix: synthesis.matrix.map((row) => ({ ...row, title: "=CMD()", Finding: "+SUM(1,1)" })),
    };

    expect(reviewSynthesisCsv(dangerous)).toContain("'=CMD()");
    expect(reviewSynthesisCsv(dangerous)).toContain('"\'+SUM(1,1)"');
  });

  it("projects effective single and repeatable extraction values into scalar output", () => {
    const input = fixture();
    const finding = input.evidence.protocol.extractionFields[0]!;
    const theme = {
      ...finding,
      id: "theme",
      label: "Theme",
      cardinality: "repeatable" as const,
      researchQuestionIds: [],
    };
    const evidenceRecord = input.evidence.records[0]!;
    const extractionValue = evidenceRecord.extractionValues[0]!;
    const synthesis = buildReviewSynthesis(input.protocol, input.search, input.screening, {
      ...input.evidence,
      protocol: { ...input.evidence.protocol, extractionFields: [finding, theme] },
      records: [
        {
          ...evidenceRecord,
          extractionValues: [
            extractionValue,
            { ...extractionValue, id: "theme-1", fieldId: "theme", value: "Trust" },
            { ...extractionValue, id: "theme-2", fieldId: "theme", value: "Control" },
          ],
        },
      ],
    });

    expect(synthesis.matrix[0]).toMatchObject({ Finding: "Improves quality", Theme: "Trust; Control" });
    expect(synthesis.contributors[0]?.extractionValueIds).toEqual(["theme-1", "theme-2", "value"]);
    expect(synthesis.definitions.find(({ id }) => id === "review-evidence-synthesis")?.filters).toContainEqual({
      field: "extraction.fieldId",
      operator: "effective-by-cardinality",
      value: "fieldId",
    });
  });

  it("carries evidence-linked RQ findings into the pinned report", () => {
    const input = fixture();
    const extraction = input.evidence.records[0]!.extractionValues[0]!;
    const finding = materializeReviewFinding(
      {
        researchQuestionId: "rq1",
        statement: "Quality improved across the included study.",
        interpretation: "The available evidence supports a cautious benefit claim.",
        extractionValueIds: [extraction.id],
        appraisalValueIds: [],
        evidence: [{ contributorKind: "extraction", contributorId: extraction.id, pointer: extraction.evidence! }],
        supersedesId: null,
      },
      {
        id: "finding-1",
        reviewRevision: 5,
        protocolRevision: 2,
        createdBy: "reviewer@example.com",
        createdAt: "2026-07-19T10:00:00.000Z",
      },
    );
    const synthesis = buildReviewSynthesis(input.protocol, input.search, input.screening, input.evidence, {
      revision: 5,
      findings: [finding],
    });

    expect(synthesis.findings).toEqual([finding]);
    expect(reviewSynthesisMarkdown(synthesis)).toContain("Quality improved across the included study.");
    expect(parseReviewSynthesis(synthesis)).toEqual(synthesis);
  });

  it("blocks publication while amendment reassessment obligations remain open", () => {
    const input = fixture();
    const synthesis = buildReviewSynthesis(input.protocol, input.search, input.screening, input.evidence, undefined, {
      revision: 5,
      obligations: [
        {
          id: "reassessment-1",
          amendmentProtocolRevision: 2,
          stage: "extraction",
          recordId: "record",
          status: "open",
          createdRevision: 5,
          completedRevision: null,
          completedAt: null,
          completedBy: null,
          completionRationale: null,
        },
      ],
    });

    expect(blockingReviewSynthesisDiagnostics(synthesis)).toContainEqual({
      code: "protocol-reassessment-open",
      severity: "error",
      blocking: true,
      message: "1 protocol amendment reassessment obligation remains open.",
      recordIds: ["record"],
      contributorIds: ["reassessment-1"],
    });
    expect(parseReviewSynthesis(synthesis)).toEqual(synthesis);
  });

  it("uses final inclusion as authority and diagnoses incomplete review state", () => {
    const input = fixture();
    const record = input.screening.records[0]!;
    const excluded = buildReviewSynthesis(
      input.protocol,
      input.search,
      {
        ...input.screening,
        records: [
          {
            ...record,
            finalInclusion: {
              outcome: "exclude",
              decision: { ...record.finalInclusion.decision!, id: "final-exclusion", outcome: "exclude" },
            },
          },
        ],
      },
      input.evidence,
    );
    expect(excluded.flow).toMatchObject({ fullTextExcluded: 1, included: 0 });
    expect(excluded.matrix).toEqual([]);
    expect(excluded.rqCoverage).toEqual([{ id: "rq1", question: "What works?", studies: 0 }]);

    const pending = buildReviewSynthesis(
      input.protocol,
      input.search,
      {
        ...input.screening,
        records: [{ ...record, finalInclusion: { outcome: "pending", decision: null } }],
      },
      input.evidence,
    );
    expect(pending.diagnostics).toContainEqual(expect.objectContaining({ code: "screening-incomplete", recordIds: ["record"] }));

    const missing = buildReviewSynthesis(input.protocol, { ...input.search, occurrences: [] }, input.screening, {
      ...input.evidence,
      records: [],
    });
    expect(missing.diagnostics.map(({ code }) => code)).toEqual(["included-evidence-missing", "record-provenance-missing"]);
  });

  it("fails closed on every persisted synthesis collection and scalar boundary", () => {
    const input = fixture();
    const synthesis = buildReviewSynthesis(input.protocol, input.search, input.screening, input.evidence);
    for (const value of [
      null,
      [],
      { ...synthesis, flow: null },
      { ...synthesis, sourceYields: null },
      { ...synthesis, rqCoverage: null },
      { ...synthesis, matrix: null },
      { ...synthesis, extractionColumns: null },
    ]) {
      expect(() => parseReviewSynthesis(value)).toThrow("Review synthesis is invalid");
    }
    for (const value of [-1, 1.5, Number.NaN, "1"]) {
      expect(() => parseReviewSynthesis({ ...synthesis, revision: value })).toThrow("Review synthesis count is invalid");
    }
    for (const field of [
      "identified",
      "duplicatesRemoved",
      "titleAbstractScreened",
      "titleAbstractExcluded",
      "fullTextAssessed",
      "fullTextExcluded",
      "included",
    ] as const) {
      expect(() => parseReviewSynthesis({ ...synthesis, flow: { ...synthesis.flow, [field]: -1 } })).toThrow(
        "Review synthesis count is invalid",
      );
    }
    expect(() => parseReviewSynthesis({ ...synthesis, sourceYields: [null] })).toThrow("Review source yield is invalid");
    expect(() => parseReviewSynthesis({ ...synthesis, sourceYields: [{ source: 1, imported: 1, uniqueOccurrences: 1 }] })).toThrow(
      "Review synthesis text is invalid",
    );
    expect(() => parseReviewSynthesis({ ...synthesis, sourceYields: [{ source: "Source", imported: -1, uniqueOccurrences: 1 }] })).toThrow(
      "Review synthesis count is invalid",
    );
    expect(() => parseReviewSynthesis({ ...synthesis, rqCoverage: [null] })).toThrow("Review RQ coverage is invalid");
    expect(() => parseReviewSynthesis({ ...synthesis, rqCoverage: [{ id: "rq", question: 1, studies: 1 }] })).toThrow(
      "Review synthesis text is invalid",
    );
    expect(() => parseReviewSynthesis({ ...synthesis, matrix: [null] })).toThrow("Review synthesis matrix is invalid");
    expect(() => parseReviewSynthesis({ ...synthesis, matrix: [{ invalid: [] }] })).toThrow("Review synthesis matrix is invalid");
    expect(() => parseReviewSynthesis({ ...synthesis, extractionColumns: [1] })).toThrow("Review synthesis text is invalid");
  });

  it("validates persisted analysis definitions, filters, diagnostics, and contributors", () => {
    const input = fixture();
    const synthesis = buildReviewSynthesis(input.protocol, input.search, input.screening, input.evidence);
    const definition = synthesis.definitions[0]!;
    for (const changed of [
      null,
      { ...definition, id: "other" },
      { ...definition, revision: 2 },
      { ...definition, type: "other" },
      { ...definition, generatorSchema: "old" },
      { ...definition, filters: null },
      { ...definition, columns: null },
      { ...definition, dimensions: null },
    ]) {
      expect(() => parseReviewSynthesis({ ...synthesis, definitions: [changed] })).toThrow("Review analysis definition is invalid");
    }
    for (const filter of [null, { field: "field", operator: "other", value: "value" }]) {
      expect(() => parseReviewSynthesis({ ...synthesis, definitions: [{ ...definition, filters: [filter] }] })).toThrow(
        "Review analysis filter is invalid",
      );
    }
    expect(
      parseReviewSynthesis({
        ...synthesis,
        definitions: [{ ...definition, filters: [{ field: "field", operator: "latest-by", value: "value" }] }],
      }).definitions[0]!.filters,
    ).toEqual([{ field: "field", operator: "effective-by-cardinality", value: "value" }]);

    const diagnosticCodes = [
      "review-revision-mismatch",
      "protocol-draft",
      "protocol-revision-mismatch",
      "protocol-reassessment-open",
      "duplicate-resolution-incomplete",
      "screening-incomplete",
      "screening-conflict",
      "included-evidence-missing",
      "appraisal-incomplete",
      "extraction-incomplete",
      "appraisal-provenance-missing",
      "extraction-provenance-missing",
      "record-provenance-missing",
    ] as const;
    const diagnostics = diagnosticCodes.map((code) => ({
      code,
      severity: "warning" as const,
      blocking: false,
      message: code,
      recordIds: [],
      contributorIds: [],
    }));
    expect(parseReviewSynthesis({ ...synthesis, diagnostics }).diagnostics.map(({ code }) => code)).toEqual(diagnosticCodes);
    for (const diagnostic of [
      null,
      { ...diagnostics[0], code: "other" },
      { ...diagnostics[0], severity: "other" },
      { ...diagnostics[0], blocking: "false" },
      { ...diagnostics[0], recordIds: null },
      { ...diagnostics[0], contributorIds: null },
    ]) {
      expect(() => parseReviewSynthesis({ ...synthesis, diagnostics: [diagnostic] })).toThrow("Review synthesis diagnostic is invalid");
    }

    const contributor = synthesis.contributors[0]!;
    for (const changed of [
      null,
      { ...contributor, occurrenceIds: null },
      { ...contributor, screeningDecisionIds: null },
      { ...contributor, screeningAdjudicationIds: null },
      { ...contributor, appraisalValueIds: null },
      { ...contributor, extractionValueIds: null },
    ]) {
      expect(() => parseReviewSynthesis({ ...synthesis, contributors: [changed] })).toThrow("Review synthesis contributor is invalid");
    }
  });

  it("binds the report definition to both persisted revisions", () => {
    const input = fixture();
    const synthesis = buildReviewSynthesis(input.protocol, input.search, input.screening, input.evidence);
    expect(() => reviewSynthesisReportDefinition({ ...synthesis, definitions: [] })).toThrow(
      "Review synthesis report definition is not bound to the synthesis revision",
    );
    expect(() =>
      reviewSynthesisReportDefinition({
        ...synthesis,
        definitions: synthesis.definitions.map((definition) =>
          definition.id === "review-synthesis-report" ? { ...definition, reviewRevision: synthesis.revision + 1 } : definition,
        ),
      }),
    ).toThrow("Review synthesis report definition is not bound to the synthesis revision");
    expect(() =>
      reviewSynthesisReportDefinition({
        ...synthesis,
        definitions: synthesis.definitions.map((definition) =>
          definition.id === "review-synthesis-report" ? { ...definition, protocolRevision: synthesis.protocolRevision + 1 } : definition,
        ),
      }),
    ).toThrow("Review synthesis report definition is not bound to the synthesis revision");
  });

  it("renders exact CSV cells and normalized Markdown table values", () => {
    const input = fixture();
    const synthesis = buildReviewSynthesis(input.protocol, input.search, input.screening, input.evidence);
    const customized = {
      ...synthesis,
      sourceYields: [{ source: "Database | primary\n index", imported: 2, uniqueOccurrences: 1 }],
      rqCoverage: [{ id: "rq|1", question: "What  works?\nExactly", studies: 1 }],
      matrix: [
        {
          ...synthesis.matrix[0],
          title: 'A "quoted", title\nnext',
          year: null,
          Finding: true,
        },
      ],
    };

    expect(reviewSynthesisCsv(customized)).toBe(
      "recordId,title,authors,year,qualityScore,qualityRejected,Finding\n" +
        'record,"A ""quoted"", title\nnext","Doe, Jane",,1,false,true\n',
    );
    const markdown = reviewSynthesisMarkdown(customized);
    expect(markdown).toContain("| Database \\| primary index | 2 | 1 |");
    expect(markdown).toContain("| rq\\|1 | What works? Exactly | 1 |");
    expect(markdown).toContain('| A "quoted", title next | Not reported | 1 | true |');
  });

  it("uses exact plural diagnostics for two affected review records", () => {
    const input = fixture();
    const firstRecord = input.screening.records[0]!.record;
    const secondRecord = { ...firstRecord, id: "record-2", metadata: { ...firstRecord.metadata, citationKey: "study-2" } };
    const screeningRecords = input.screening.records.map((record) => ({
      ...record,
      titleAbstract: { ...record.titleAbstract, outcome: "conflict" as const },
    }));
    screeningRecords.push({
      ...screeningRecords[0]!,
      record: secondRecord,
      titleAbstract: {
        ...screeningRecords[0]!.titleAbstract,
        decisions: screeningRecords[0]!.titleAbstract.decisions.map((value) => ({
          ...value,
          id: `${value.id}-2`,
          recordId: secondRecord.id,
        })),
      },
      fullText: {
        ...screeningRecords[0]!.fullText,
        decisions: screeningRecords[0]!.fullText.decisions.map((value) => ({
          ...value,
          id: `${value.id}-2`,
          recordId: secondRecord.id,
        })),
      },
      finalInclusion: {
        ...screeningRecords[0]!.finalInclusion,
        decision: { ...screeningRecords[0]!.finalInclusion.decision!, id: "final-inclusion-2", recordId: secondRecord.id },
      },
    });
    const evidenceRecords = input.evidence.records.map((record) => ({
      ...record,
      qualityComplete: false,
      extractionComplete: false,
      qualityValues: record.qualityValues.map((value) => ({ ...value, evidence: null })),
      extractionValues: record.extractionValues.map((value) => ({ ...value, evidence: null })),
    }));
    evidenceRecords.push({
      ...evidenceRecords[0]!,
      record: secondRecord,
      qualityValues: evidenceRecords[0]!.qualityValues.map((value) => ({
        ...value,
        id: `${value.id}-2`,
        recordId: secondRecord.id,
      })),
      extractionValues: evidenceRecords[0]!.extractionValues.map((value) => ({
        ...value,
        id: `${value.id}-2`,
        recordId: secondRecord.id,
      })),
    });
    const duplicate = {
      id: "duplicate-1",
      leftId: firstRecord.id,
      rightId: secondRecord.id,
      signals: ["title-year" as const],
      confidence: "probable" as const,
      status: "pending" as const,
      resolvedAt: null,
      resolvedBy: null,
    };
    const synthesis = buildReviewSynthesis(
      input.protocol,
      {
        ...input.search,
        records: [firstRecord, secondRecord],
        occurrences: [],
        duplicateCandidates: [duplicate, { ...duplicate, id: "duplicate-2" }],
      },
      { ...input.screening, records: screeningRecords },
      { ...input.evidence, records: evidenceRecords },
    );
    const messages = new Map(synthesis.diagnostics.map(({ code, message }) => [code, message]));

    expect(messages.get("duplicate-resolution-incomplete")).toBe("2 duplicate candidates are unresolved.");
    expect(messages.get("screening-conflict")).toBe("2 records have an unresolved screening conflict.");
    expect(messages.get("appraisal-incomplete")).toBe("2 included records have incomplete appraisal.");
    expect(messages.get("extraction-incomplete")).toBe("2 included records have incomplete extraction.");
    expect(messages.get("appraisal-provenance-missing")).toBe("2 appraisal values lack evidence provenance.");
    expect(messages.get("extraction-provenance-missing")).toBe("2 extracted values lack evidence provenance.");
    expect(messages.get("record-provenance-missing")).toBe("2 included records have no import occurrence.");
  });

  it("returns only blocking diagnostics and rejects mixed-validity matrix rows", () => {
    const input = fixture();
    const synthesis = buildReviewSynthesis(input.protocol, input.search, input.screening, input.evidence);
    const blocking = {
      code: "protocol-draft" as const,
      severity: "error" as const,
      blocking: true,
      message: "blocking",
      recordIds: [],
      contributorIds: [],
    };
    const advisory = { ...blocking, blocking: false, message: "advisory" };

    expect(blockingReviewSynthesisDiagnostics({ ...synthesis, diagnostics: [advisory, blocking] })).toEqual([blocking]);
    expect(() => parseReviewSynthesis({ ...synthesis, matrix: [{ valid: "value", invalid: [] }] })).toThrow(
      "Review synthesis matrix is invalid",
    );
  });
});

function fixture(): {
  readonly protocol: ReviewStudySnapshot;
  readonly search: ReviewSearchSnapshot;
  readonly screening: ReviewScreeningSnapshot;
  readonly evidence: ReviewEvidenceSnapshot;
} {
  const defaults = defaultReviewProtocol();
  const content = {
    ...defaults,
    researchQuestions: [{ id: "rq1", text: "What works?" }],
    qualityAssessment: { ...defaults.qualityAssessment, questions: [{ id: "quality", text: "Is the study credible?" }] },
    extractionFields: [
      {
        id: "finding",
        label: "Finding",
        type: "text" as const,
        values: [],
        researchQuestionIds: ["rq1"],
        requiredness: "required" as const,
        cardinality: "single" as const,
        condition: null,
      },
    ],
  };
  const protocolRevision = materializeProtocolRevision(content, 2, "frozen", "Ready", "owner");
  const protocol = { revision: 5, protocol: protocolRevision, protocolHistory: [protocolRevision] };
  const record = {
    id: "record",
    state: "active" as const,
    mergedInto: null,
    metadata: {
      citationKey: "study",
      type: "article",
      title: "Study",
      authors: ["Doe, Jane"],
      year: "2025",
      venue: "Venue",
      doi: "",
      url: "",
      abstract: "",
      identity: "work:study|2025|doe jane",
      warnings: [],
    },
  };
  const search: ReviewSearchSnapshot = {
    revision: 5,
    runs: [
      {
        id: "run",
        protocolRevision: 2,
        sourceId: "source",
        sourceName: "Scopus",
        query: "q",
        searchedAt: "",
        importedAt: "",
        importedBy: "owner",
        digest: "x",
        reportedResultCount: 1,
        detectedEntries: 1,
        skippedEntries: 0,
        occurrenceCount: 1,
        importBatchIds: ["batch"],
      },
    ],
    batches: [
      {
        id: "batch",
        runId: "run",
        format: "bibtex",
        filename: "source.bib",
        mediaType: "application/x-bibtex",
        byteCount: 1,
        digest: "x",
        parserVersion: "kirjolab-bibtex-v1",
        reportedResultCount: 1,
      },
    ],
    occurrences: [{ id: "occ", runId: "run", batchId: "batch", recordId: "record", citationKey: "study", imported: record.metadata }],
    records: [record],
    duplicateCandidates: [],
    counts: { identified: 1, unique: 1, duplicatesRemoved: 0 },
  };
  const titleDecision = decision("title-abstract");
  const fullTextDecision = decision("full-text");
  const screening: ReviewScreeningSnapshot = {
    revision: 5,
    reviewersPerStage: 1,
    blinded: false,
    records: [
      {
        record,
        titleAbstract: { outcome: "include", decisions: [titleDecision], adjudication: null },
        fullText: { outcome: "include", decisions: [fullTextDecision], adjudication: null },
        finalInclusion: {
          outcome: "include",
          decision: {
            id: "final-inclusion",
            recordId: "record",
            protocolRevision: 2,
            outcome: "include",
            reason: "Eligible after appraisal",
            criterionId: null,
            criterionText: "",
            reviewer: "reviewer@example.com",
            createdAt: "2026-07-17",
          },
        },
      },
    ],
    counts: {
      titleAbstractPending: 0,
      titleAbstractIncluded: 1,
      fullTextPending: 0,
      fullTextIncluded: 1,
      finalInclusionPending: 0,
      finalInclusionIncluded: 1,
      finalInclusionExcluded: 0,
      conflicts: 0,
    },
  };
  const evidence: ReviewEvidenceSnapshot = {
    revision: 5,
    protocolRevision: 2,
    protocol: {
      researchQuestions: protocolRevision.researchQuestions,
      qualityAssessment: protocolRevision.qualityAssessment,
      extractionFields: protocolRevision.extractionFields,
    },
    records: [
      {
        record,
        qualityValues: [
          {
            id: "appraisal",
            recordId: "record",
            protocolRevision: 2,
            questionId: "quality",
            criterionId: "quality",
            criterionText: "Is the study credible?",
            answerId: "yes",
            evidence: {
              kind: "pdf-annotation",
              resourceId: "pdf-1",
              selectorId: "annotation-method",
              quote: "The method was valid",
              page: 2,
              location: "Methods",
            },
            rationale: "",
            reviewer: "reviewer@example.com",
            createdAt: "2026-07-17",
          },
        ],
        qualityScore: 1,
        qualityRejected: false,
        qualityComplete: true,
        extractionValues: [
          {
            id: "value",
            recordId: "record",
            protocolRevision: 2,
            fieldId: "finding",
            criterionId: "finding",
            criterionText: "Finding",
            value: "Improves quality",
            missingReason: null,
            evidence: {
              kind: "pdf-annotation",
              resourceId: "pdf-1",
              selectorId: "annotation-result",
              quote: "Quality improved",
              page: 4,
              location: "Results",
            },
            reviewer: "reviewer@example.com",
            createdAt: "2026-07-17",
          },
        ],
        extractionComplete: true,
      },
    ],
  };
  return { protocol, search, screening, evidence };
}

function decision(stage: "title-abstract" | "full-text"): ScreeningDecision {
  return {
    id: `screen-${stage}`,
    recordId: "record",
    stage,
    protocolRevision: 2,
    reviewer: "reviewer@example.com",
    decision: "include",
    reason: "Eligible",
    criterionId: null,
    criterionText: "",
    createdAt: "2026-07-17",
  };
}
