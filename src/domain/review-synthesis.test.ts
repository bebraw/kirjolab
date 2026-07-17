import { describe, expect, it } from "vitest";
import { buildReviewSynthesis, reviewSynthesisCsv, reviewSynthesisMarkdown } from "./review-synthesis";
import { defaultReviewProtocol, materializeProtocolRevision } from "./review-study";

describe("review synthesis", () => {
  it("derives flow, RQ coverage, CSV, and manuscript Markdown", () => {
    const content = {
      ...defaultReviewProtocol(),
      researchQuestions: [{ id: "rq1", text: "What works?" }],
      extractionFields: [{ id: "finding", label: "Finding", type: "string" as const, values: [], researchQuestionIds: ["rq1"] }],
    };
    const protocol = materializeProtocolRevision(content, 2, "frozen", "Ready", "owner");
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
    const stage = { outcome: "include" as const, decisions: [], adjudication: null };
    const extraction = {
      id: "value",
      recordId: "record",
      fieldId: "finding",
      value: "Improves quality",
      missingReason: null,
      evidence: { quote: "Quality improved", page: 4, location: "Results" },
      reviewer: "reviewer",
      createdAt: "2026-07-17",
    };
    const synthesis = buildReviewSynthesis(
      { revision: 2, protocol, protocolHistory: [protocol] },
      {
        revision: 3,
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
            detectedEntries: 1,
            skippedEntries: 0,
            occurrenceCount: 1,
          },
        ],
        occurrences: [{ id: "occ", runId: "run", recordId: "record", citationKey: "study", imported: record.metadata }],
        records: [record],
        duplicateCandidates: [],
        counts: { identified: 1, unique: 1, duplicatesRemoved: 0 },
      },
      {
        revision: 4,
        reviewersPerStage: 1,
        blinded: false,
        records: [{ record, titleAbstract: stage, fullText: stage }],
        counts: { titleAbstractPending: 0, titleAbstractIncluded: 1, fullTextPending: 0, fullTextIncluded: 1, conflicts: 0 },
      },
      {
        revision: 5,
        protocolRevision: 2,
        protocol: { qualityAssessment: protocol.qualityAssessment, extractionFields: protocol.extractionFields },
        records: [
          {
            record,
            qualityValues: [],
            qualityScore: 0,
            qualityRejected: false,
            qualityComplete: true,
            extractionValues: [extraction],
            extractionComplete: true,
          },
        ],
      },
    );
    expect(synthesis).toMatchObject({ revision: 5, flow: { identified: 1, included: 1 }, rqCoverage: [{ id: "rq1", studies: 1 }] });
    expect(reviewSynthesisCsv(synthesis)).toContain("Improves quality");
    expect(reviewSynthesisMarkdown(synthesis)).toContain("# Review synthesis");
  });
});
