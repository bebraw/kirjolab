import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
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
      "bibliography.bib",
      "extraction.csv",
      "history.json",
      "manifest.json",
      "model-disclosure.json",
      "prisma.json",
      "prisma.svg",
      "review.json",
      "search-history.json",
    ]);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!)) as {
      reviewRevision: number;
      files: Array<{ path: string; sha256: string; bytes: number }>;
    };
    expect(manifest.reviewRevision).toBe(7);
    expect(manifest.files).toHaveLength(11);
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
          outcome: "exclude" as const,
          reason: "Wrong population",
          adjudicator: "lead@example.com",
          createdAt: "2026-07-17T11:00:00.000Z",
        },
      },
      fullText: { outcome: "pending" as const, decisions: [], adjudication: null },
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
});

function fixture(): ReviewExportAuthority {
  const content = {
    ...defaultReviewProtocol(),
    researchQuestions: [{ id: "rq1", text: "What works?" }],
    extractionFields: [{ id: "finding", label: "Finding", type: "string" as const, values: [], researchQuestionIds: ["rq1"] }],
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
        detectedEntries: 1,
        skippedEntries: 0,
        occurrenceCount: 1,
      },
    ],
    occurrences: [{ id: "occurrence-1", runId: "run-1", recordId: record.id, citationKey: "study", imported: record.metadata }],
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
      },
    ],
    counts: { titleAbstractPending: 0, titleAbstractIncluded: 1, fullTextPending: 0, fullTextIncluded: 1, conflicts: 0 },
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
            fieldId: "finding",
            value: "Effective",
            missingReason: null,
            evidence: { quote: "Exact, quoted evidence", page: 4, location: "Results" },
            reviewer: "reviewer@example.com",
            createdAt: timestamp,
          },
        ],
        extractionComplete: true,
      },
    ],
  };
  const model = { revision: 7, candidates: [] };
  const synthesis = buildReviewSynthesis(protocol, search, screening, evidence);
  return { revision: 7, protocol, search, screening, evidence, model, synthesis };
}

function decision(recordId: string, stage: "title-abstract" | "full-text"): ScreeningDecision {
  return {
    id: `decision-${stage}`,
    recordId,
    stage,
    reviewer: "reviewer@example.com",
    decision: "include",
    reason: "Eligible",
    criterion: "",
    createdAt: timestamp,
  };
}
