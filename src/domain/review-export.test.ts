import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { materializeReviewFinding } from "./review-findings";
import { buildReviewSynthesis } from "./review-synthesis";
import { defaultReviewProtocol, materializeProtocolRevision } from "./review-study";
import {
  buildReviewPackage,
  reviewBibliographyBibTeX,
  reviewExtractionCsv,
  reviewHistoryJson,
  reviewPrismaData,
  reviewPrismaSvg,
  stableReviewJson,
  type ReviewExportAuthority,
} from "./review-export";
import type { ReviewRecord, ReviewSearchSnapshot } from "./review-search";
import type { ReviewScreeningSnapshot, ScreeningDecision } from "./review-screening";
import type { ReviewEvidenceSnapshot } from "./review-evidence";

const timestamp = "2026-07-17T10:00:00.000Z";

describe("review reproducibility export", () => {
  it("derives interoperable artifacts and a deterministic digest manifest from one revision", async () => {
    const authority = fixture();
    expect(reviewExtractionCsv(authority)).toContain('"Exact, quoted evidence"');
    expect(reviewBibliographyBibTeX(authority)).toContain("kirjolab_status = {included}");
    const prisma = reviewPrismaData(authority);
    expect(prisma).toMatchObject({ reviewRevision: 7, identified: 1, included: 1 });
    expect(reviewPrismaSvg(prisma)).toContain('role="img" aria-labelledby="title description"');

    const first = await buildReviewPackage("workspace-1", authority);
    const second = await buildReviewPackage("workspace-1", authority);
    expect(first).toEqual(second);
    const files = unzipSync(first);
    expect(Object.keys(files).sort()).toEqual([
      "analysis-contributors.json",
      "analysis-definitions.json",
      "analysis-diagnostics.json",
      "analysis-findings.json",
      "bibliography.bib",
      "extraction.csv",
      "finding-history.json",
      "history.json",
      "manifest.json",
      "model-disclosure.json",
      "prisma.json",
      "prisma.svg",
      "reassessment.json",
      "review.json",
      "search-history.json",
    ]);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!)) as {
      reviewRevision: number;
      files: Array<{ path: string; sha256: string; bytes: number }>;
    };
    expect(manifest.reviewRevision).toBe(7);
    expect(manifest.files).toHaveLength(14);
    expect(manifest.files.every((file) => /^[a-f0-9]{64}$/u.test(file.sha256) && file.bytes > 0)).toBe(true);
    const analysisDefinitions = JSON.parse(strFromU8(files["analysis-definitions.json"]!)) as {
      definitions: Array<Record<string, unknown>>;
    };
    expect(analysisDefinitions).toMatchObject({
      schemaVersion: "kirjolab-review-analysis-v1",
      reviewRevision: 7,
      protocolRevision: 2,
    });
    expect(analysisDefinitions.definitions[0]).toMatchObject({
      id: "review-process-analysis",
      revision: 1,
      reviewRevision: 7,
      protocolRevision: 2,
    });
    expect(JSON.parse(strFromU8(files["analysis-diagnostics.json"]!))).toMatchObject({ diagnostics: [] });
    expect(strFromU8(files["analysis-contributors.json"]!)).not.toContain("reviewer@example.com");
    expect(JSON.parse(strFromU8(files["analysis-findings.json"]!))).toMatchObject({
      findings: [{ id: "finding-current", supersedesId: "finding-original" }],
    });
    expect(JSON.parse(strFromU8(files["finding-history.json"]!))).toMatchObject({
      findings: [{ id: "finding-original" }, { id: "finding-current", supersedesId: "finding-original" }],
    });
    expect(JSON.parse(strFromU8(files["reassessment.json"]!))).toMatchObject({
      revision: 7,
      obligations: [{ id: "reassessment-1", status: "completed" }],
    });
    expect(JSON.parse(strFromU8(files["review.json"]!))).toMatchObject({
      reassessment: { obligations: [{ id: "reassessment-1" }] },
      findings: { findings: [{ id: "finding-original" }, { id: "finding-current" }] },
    });
    expect(reviewHistoryJson(authority)).toContain("finding-original");
    expect(reviewHistoryJson(authority)).toContain("reassessment-completion");
  });

  it("reports exclusions, adjudications, model disclosure, and empty extraction tables", () => {
    const authority = fixture();
    const record = authority.screening.records[0]!;
    const excluded = {
      ...record,
      titleAbstract: {
        outcome: "exclude" as const,
        decisions: [{ ...record.titleAbstract.decisions[0]!, decision: "exclude" as const, reason: "Wrong population" }],
        adjudication: {
          id: "adjudication-1",
          recordId: record.record.id,
          stage: "title-abstract" as const,
          protocolRevision: 2,
          outcome: "exclude" as const,
          reason: "Wrong population",
          criterionId: "wrong-population",
          criterionText: "Wrong population",
          adjudicator: "lead@example.com",
          createdAt: "2026-07-17T11:00:00.000Z",
        },
      },
      fullText: { outcome: "pending" as const, decisions: [], adjudication: null },
      finalInclusion: { outcome: "pending" as const, decision: null },
    };
    const changed: ReviewExportAuthority = {
      ...authority,
      screening: { ...authority.screening, records: [excluded] },
      evidence: { ...authority.evidence, records: [] },
      model: {
        revision: 7,
        candidates: [
          {
            id: "model-1",
            operation: "screen-record",
            recordId: record.record.id,
            stage: "title-abstract",
            provider: "Local",
            model: "review-model",
            promptTemplateVersion: "v1",
            sourceScope: ["title", "abstract"],
            result: { decision: "exclude", criterion: "Population", rationale: "Not eligible", evidence: "Title" },
            createdAt: timestamp,
            createdBy: "reviewer@example.com",
            disposition: "rejected",
            disposedAt: "2026-07-17T11:05:00.000Z",
            disposedBy: "reviewer@example.com",
          },
        ],
      },
    };

    expect(reviewPrismaData(changed).exclusionReasons.titleAbstract).toEqual({ "Wrong population": 1 });
    expect(reviewBibliographyBibTeX(changed)).toContain("kirjolab_status = {excluded-title-abstract}");
    expect(reviewExtractionCsv(changed)).toMatch(/^recordId,/u);
    expect(reviewHistoryJson(changed)).toContain("screening-adjudication");
    expect(reviewHistoryJson(changed)).toContain("model-candidate");
    expect(stableReviewJson({ z: 1, a: { y: 2, x: 1 } })).toBe('{\n  "a": {\n    "x": 1,\n    "y": 2\n  },\n  "z": 1\n}\n');

    const fullTextExcluded: ReviewExportAuthority = {
      ...authority,
      screening: {
        ...authority.screening,
        records: [
          {
            ...record,
            finalInclusion: { outcome: "pending", decision: null },
            fullText: {
              outcome: "exclude",
              decisions: [{ ...record.fullText.decisions[0]!, decision: "exclude", reason: "No full text" }],
              adjudication: null,
            },
          },
        ],
      },
    };
    expect(reviewBibliographyBibTeX(fullTextExcluded)).toContain("kirjolab_status = {excluded-full-text}");
  });

  it("escapes formula-looking CSV cells before spreadsheet import", () => {
    const authority = fixture();
    const record = authority.evidence.records[0]!;
    const dangerous: ReviewExportAuthority = {
      ...authority,
      evidence: {
        ...authority.evidence,
        records: [
          {
            ...record,
            record: { ...record.record, id: "@record", metadata: { ...record.record.metadata, title: "=CMD()" } },
            extractionValues: [{ ...record.extractionValues[0]!, fieldId: "-field", value: "+SUM(1,1)", reviewer: "@reviewer" }],
          },
        ],
      },
    };

    const csv = reviewExtractionCsv(dangerous);
    expect(csv).toContain("'@record");
    expect(csv).toContain("'=CMD()");
    expect(csv).toContain("'-field");
    expect(csv).toContain('"\'+SUM(1,1)"');
    expect(csv).toContain("'@reviewer");
  });

  it("exports final exclusions, exact selectors, and append-only audit events", async () => {
    const authority = fixture();
    const record = authority.screening.records[0]!;
    const extraction = authority.evidence.records[0]!.extractionValues[0]!;
    const screening: ReviewScreeningSnapshot = {
      ...authority.screening,
      records: [
        {
          ...record,
          fullText: {
            ...record.fullText,
            adjudication: {
              id: "adjudication-full-text",
              recordId: record.record.id,
              stage: "full-text",
              protocolRevision: 2,
              outcome: "include",
              reason: "Eligible after discussion",
              criterionId: null,
              criterionText: "",
              adjudicator: "lead@example.com",
              createdAt: "2026-07-17T11:30:00.000Z",
            },
          },
          finalInclusion: {
            outcome: "exclude",
            decision: {
              id: "final-exclusion",
              recordId: record.record.id,
              protocolRevision: 2,
              outcome: "exclude",
              reason: "Below the appraisal threshold",
              criterionId: "quality-threshold",
              criterionText: "Fails quality threshold",
              reviewer: "lead@example.com",
              createdAt: "2026-07-17T14:00:00.000Z",
            },
          },
        },
      ],
      counts: {
        ...authority.screening.counts,
        finalInclusionIncluded: 0,
        finalInclusionExcluded: 1,
      },
    };
    const evidence: ReviewEvidenceSnapshot = {
      ...authority.evidence,
      records: [
        {
          ...authority.evidence.records[0]!,
          qualityValues: [
            {
              id: "quality-1",
              recordId: record.record.id,
              protocolRevision: 2,
              questionId: "method-quality",
              criterionId: "method-quality",
              criterionText: "Is the method credible?",
              answerId: "yes",
              evidence: null,
              rationale: "Reported clearly",
              reviewer: "reviewer@example.com",
              createdAt: "2026-07-17T11:45:00.000Z",
            },
          ],
          extractionValues: [
            extraction,
            { ...extraction, id: "value-array", value: ["Alpha", "Beta"], evidence: null },
            {
              ...extraction,
              id: "value-selector",
              value: { kind: "web-passage", resourceId: "share-1", selectorId: "snapshot-1" },
              evidence: {
                kind: "web-passage",
                resourceId: "share-1",
                selectorId: "snapshot-1",
                quote: "A cited web passage",
                page: null,
                location: "Results",
              },
            },
            { ...extraction, id: "value-missing", value: null, missingReason: "Not reported", evidence: null },
          ],
        },
      ],
    };
    const changed: ReviewExportAuthority = {
      ...authority,
      search: {
        ...authority.search,
        duplicateCandidates: [
          {
            id: "duplicate-resolved",
            leftId: record.record.id,
            rightId: "record-2",
            signals: ["title-year"],
            confidence: "probable",
            status: "distinct",
            resolvedAt: "2026-07-17T11:15:00.000Z",
            resolvedBy: "lead@example.com",
          },
        ],
      },
      screening,
      evidence,
      model: {
        revision: 7,
        candidates: [
          {
            id: "model-pending",
            operation: "screen-record",
            recordId: record.record.id,
            stage: "title-abstract",
            provider: "Local",
            model: "review-model",
            promptTemplateVersion: "v1",
            sourceScope: ["title"],
            result: { decision: "include", criterion: "", rationale: "Likely eligible", evidence: "Title" },
            createdAt: "2026-07-17T12:15:00.000Z",
            createdBy: "reviewer@example.com",
            disposition: "pending",
            disposedAt: null,
            disposedBy: null,
          },
        ],
      },
      reassessment: {
        revision: 7,
        obligations: [
          {
            id: "reassessment-open",
            amendmentProtocolRevision: 2,
            stage: "title-abstract",
            recordId: null,
            status: "open",
            createdRevision: 7,
            completedRevision: null,
            completedAt: null,
            completedBy: null,
            completionRationale: null,
          },
          {
            id: "reassessment-complete",
            amendmentProtocolRevision: 2,
            stage: "extraction",
            recordId: record.record.id,
            status: "completed",
            createdRevision: 6,
            completedRevision: 7,
            completedAt: "2026-07-17T13:00:00.000Z",
            completedBy: "lead@example.com",
            completionRationale: null,
          },
        ],
      },
    };

    expect(reviewPrismaData(changed).exclusionReasons.fullText).toEqual({ "Fails quality threshold": 1 });
    expect(reviewBibliographyBibTeX(changed)).toContain("kirjolab_status = {excluded-final}");
    const csv = reviewExtractionCsv(changed);
    expect(csv).toContain('"[""Alpha"",""Beta""]"');
    expect(csv).toContain("web-passage,share-1,snapshot-1");
    expect(csv).toContain("Not reported");

    const history = JSON.parse(reviewHistoryJson(changed)) as {
      events: Array<{ kind: string; subject: string; detail: string }>;
    };
    expect(history.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "duplicate-resolution", subject: "duplicate-resolved" }),
        expect.objectContaining({ kind: "screening-adjudication", subject: "adjudication-full-text" }),
        expect.objectContaining({ kind: "final-inclusion-decision", subject: "final-exclusion", detail: "exclude" }),
        expect.objectContaining({ kind: "quality-value", subject: "quality-1" }),
        expect.objectContaining({ kind: "model-candidate", subject: "model-pending", detail: "screen-record:pending" }),
        expect.objectContaining({ kind: "reassessment-completion", subject: "reassessment-complete", detail: "extraction:" }),
      ]),
    );
    expect(history.events).not.toContainEqual(expect.objectContaining({ subject: "reassessment-open" }));

    const files = unzipSync(await buildReviewPackage("workspace-1", changed));
    expect(JSON.parse(strFromU8(files["manifest.json"]!))).toMatchObject({ generatedAt: "2026-07-17T14:00:00.000Z" });
  });
});

function fixture(): ReviewExportAuthority {
  const content = {
    ...defaultReviewProtocol(),
    researchQuestions: [{ id: "rq1", text: "What works?" }],
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
  const protocolRevision = materializeProtocolRevision(content, 2, "frozen", "Frozen", "owner@example.com", timestamp);
  const protocol = { revision: 7, protocol: protocolRevision, protocolHistory: [protocolRevision] };
  const record: ReviewRecord = {
    id: "record-1",
    state: "active",
    mergedInto: null,
    metadata: {
      citationKey: "study",
      type: "article",
      title: "Included Study",
      authors: ["Doe, Jane"],
      year: "2025",
      venue: "Journal",
      doi: "10.1/study",
      url: "https://example.test/study",
      abstract: "Relevant evidence.",
      identity: "doi:10.1/study",
      warnings: [],
    },
  };
  const search: ReviewSearchSnapshot = {
    revision: 7,
    runs: [
      {
        id: "run-1",
        protocolRevision: 2,
        sourceId: "source",
        sourceName: "Source",
        query: "evidence",
        searchedAt: timestamp,
        importedAt: timestamp,
        importedBy: "owner@example.com",
        digest: "a".repeat(64),
        reportedResultCount: 1,
        detectedEntries: 1,
        skippedEntries: 0,
        occurrenceCount: 1,
        importBatchIds: ["batch-1"],
      },
    ],
    batches: [
      {
        id: "batch-1",
        runId: "run-1",
        format: "bibtex",
        filename: "source.bib",
        mediaType: "application/x-bibtex",
        byteCount: 128,
        digest: "a".repeat(64),
        parserVersion: "kirjolab-bibtex-v1",
        reportedResultCount: 1,
      },
    ],
    occurrences: [
      { id: "occurrence-1", runId: "run-1", batchId: "batch-1", recordId: record.id, citationKey: "study", imported: record.metadata },
    ],
    records: [record],
    duplicateCandidates: [],
    counts: { identified: 1, unique: 1, duplicatesRemoved: 0 },
  };
  const titleDecision = decision(record.id, "title-abstract");
  const fullDecision = decision(record.id, "full-text");
  const screening: ReviewScreeningSnapshot = {
    revision: 7,
    reviewersPerStage: 1,
    blinded: false,
    records: [
      {
        record,
        titleAbstract: { outcome: "include", decisions: [titleDecision], adjudication: null },
        fullText: { outcome: "include", decisions: [fullDecision], adjudication: null },
        finalInclusion: {
          outcome: "include",
          decision: {
            id: "final-inclusion",
            recordId: record.id,
            protocolRevision: 2,
            outcome: "include",
            reason: "Eligible after appraisal",
            criterionId: null,
            criterionText: "",
            reviewer: "reviewer@example.com",
            createdAt: timestamp,
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
    revision: 7,
    protocolRevision: 2,
    protocol: {
      researchQuestions: protocolRevision.researchQuestions,
      qualityAssessment: protocolRevision.qualityAssessment,
      extractionFields: protocolRevision.extractionFields,
    },
    records: [
      {
        record,
        qualityValues: [],
        qualityScore: 0,
        qualityRejected: false,
        qualityComplete: true,
        extractionValues: [
          {
            id: "value-1",
            recordId: record.id,
            protocolRevision: 2,
            fieldId: "finding",
            criterionId: "finding",
            criterionText: "Finding",
            value: "Effective",
            missingReason: null,
            evidence: {
              kind: "pdf-annotation",
              resourceId: "pdf-1",
              selectorId: "annotation-1",
              quote: "Exact, quoted evidence",
              page: 4,
              location: "Results",
            },
            reviewer: "reviewer@example.com",
            createdAt: timestamp,
          },
        ],
        extractionComplete: true,
      },
    ],
  };
  const model = { revision: 7, candidates: [] };
  const extraction = evidence.records[0]!.extractionValues[0]!;
  const originalFinding = materializeReviewFinding(
    {
      researchQuestionId: "rq1",
      statement: "The included study reports an effect.",
      interpretation: "Initial interpretation.",
      extractionValueIds: [extraction.id],
      appraisalValueIds: [],
      evidence: [{ contributorKind: "extraction", contributorId: extraction.id, pointer: extraction.evidence! }],
      supersedesId: null,
    },
    {
      id: "finding-original",
      reviewRevision: 6,
      protocolRevision: 2,
      createdBy: "reviewer@example.com",
      createdAt: "2026-07-17T11:00:00.000Z",
    },
  );
  const currentFinding = materializeReviewFinding(
    {
      researchQuestionId: "rq1",
      statement: "The included study reports an effective result.",
      interpretation: "Revised interpretation.",
      extractionValueIds: [extraction.id],
      appraisalValueIds: [],
      evidence: [{ contributorKind: "extraction", contributorId: extraction.id, pointer: extraction.evidence! }],
      supersedesId: originalFinding.id,
    },
    {
      id: "finding-current",
      reviewRevision: 7,
      protocolRevision: 2,
      createdBy: "reviewer@example.com",
      createdAt: "2026-07-17T12:00:00.000Z",
    },
  );
  const findings = { revision: 7, findings: [originalFinding, currentFinding] };
  const reassessment = {
    revision: 7,
    obligations: [
      {
        id: "reassessment-1",
        amendmentProtocolRevision: 2,
        stage: "extraction" as const,
        recordId: record.id,
        status: "completed" as const,
        createdRevision: 6,
        completedRevision: 7,
        completedAt: "2026-07-17T12:30:00.000Z",
        completedBy: "reviewer@example.com",
        completionRationale: "Rechecked extracted values.",
      },
    ],
  };
  const synthesis = buildReviewSynthesis(protocol, search, screening, evidence, findings, reassessment);
  return { revision: 7, protocol, reassessment, search, screening, evidence, model, findings, synthesis };
}

function decision(recordId: string, stage: "title-abstract" | "full-text"): ScreeningDecision {
  return {
    id: `decision-${stage}`,
    recordId,
    stage,
    protocolRevision: 2,
    reviewer: "reviewer@example.com",
    decision: "include",
    reason: "Eligible",
    criterionId: null,
    criterionText: "",
    createdAt: timestamp,
  };
}
