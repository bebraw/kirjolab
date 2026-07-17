import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildReviewSynthesis } from "./review-synthesis";
import { defaultReviewProtocol, materializeProtocolRevision } from "./review-study";
import {
  buildReviewPackage,
  reviewBibliographyBibTeX,
  reviewExtractionCsv,
  reviewPrismaData,
  reviewPrismaSvg,
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
    expect(manifest.files).toHaveLength(8);
    expect(manifest.files.every((file) => /^[a-f0-9]{64}$/u.test(file.sha256) && file.bytes > 0)).toBe(true);
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
    protocol: { qualityAssessment: protocolRevision.qualityAssessment, extractionFields: protocolRevision.extractionFields },
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
