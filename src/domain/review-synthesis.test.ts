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
