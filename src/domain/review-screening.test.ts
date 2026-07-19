import { describe, expect, it } from "vitest";
import { fullTextScreeningAllowed, parseReviewScreeningSnapshot, screeningStageState, type ScreeningDecision } from "./review-screening";

const first = decision("a@example.com", "include");
const second = decision("b@example.com", "exclude");

describe("review screening", () => {
  it("derives pending, decided, conflicted, and adjudicated stage outcomes", () => {
    expect(screeningStageState([first], null, 2).outcome).toBe("pending");
    expect(screeningStageState([first], null, 1).outcome).toBe("include");
    expect(screeningStageState([first, second], null, 2).outcome).toBe("conflict");
    expect(
      screeningStageState(
        [first, second],
        {
          id: "adjudication-1",
          recordId: "record-1",
          stage: "title-abstract",
          protocolRevision: 1,
          outcome: "include",
          reason: "Consensus",
          criterionId: null,
          criterionText: "",
          adjudicator: "lead@example.com",
          createdAt: "2026-07-17T00:01:00.000Z",
        },
        2,
      ).outcome,
    ).toBe("include");
  });

  it("parses attributed records and gates full text on title-and-abstract inclusion", () => {
    const snapshot = parseReviewScreeningSnapshot(screeningSnapshotInput());
    expect(snapshot).toMatchObject({ revision: 5, records: [{ record: { metadata: { title: "Study" } } }] });
    expect(fullTextScreeningAllowed(snapshot.records[0]!)).toBe(true);
    expect(
      fullTextScreeningAllowed({ ...snapshot.records[0]!, titleAbstract: { outcome: "exclude", decisions: [], adjudication: null } }),
    ).toBe(false);
    expect(() => parseReviewScreeningSnapshot({ reviewersPerStage: 3, records: [], counts: {} })).toThrow("invalid");
    expect(() =>
      parseReviewScreeningSnapshot({
        revision: 1,
        reviewersPerStage: 1,
        blinded: false,
        records: [{ record: null, titleAbstract: {}, fullText: {}, finalInclusion: {} }],
        counts: {
          titleAbstractPending: 0,
          titleAbstractIncluded: 0,
          fullTextPending: 0,
          fullTextIncluded: 0,
          finalInclusionPending: 0,
          finalInclusionIncluded: 0,
          finalInclusionExcluded: 0,
          conflicts: 0,
        },
      }),
    ).toThrow("bibliographic record");
    expect(() =>
      parseReviewScreeningSnapshot({
        revision: 1,
        reviewersPerStage: 1,
        blinded: false,
        records: [],
        counts: {
          titleAbstractPending: -1,
          titleAbstractIncluded: 0,
          fullTextPending: 0,
          fullTextIncluded: 0,
          finalInclusionPending: 0,
          finalInclusionIncluded: 0,
          finalInclusionExcluded: 0,
          conflicts: 0,
        },
      }),
    ).toThrow("count");
  });

  it("parses final inclusion and rejects malformed versioned decisions", () => {
    const input = screeningSnapshotInput();
    const included = {
      ...input,
      records: [
        {
          ...input.records[0],
          finalInclusion: {
            outcome: "include",
            decision: {
              id: "final-1",
              recordId: "record-1",
              protocolRevision: 2,
              outcome: "include",
              reason: "Meets all criteria",
              criterionId: null,
              criterionText: "",
              reviewer: "lead@example.com",
              createdAt: "2026-07-17T00:02:00.000Z",
            },
          },
        },
      ],
    };

    expect(parseReviewScreeningSnapshot(included).records[0]!.finalInclusion).toMatchObject({
      outcome: "include",
      decision: { protocolRevision: 2, reason: "Meets all criteria" },
    });
    expect(() => parseReviewScreeningSnapshot(null)).toThrow("snapshot");
    expect(() => parseReviewScreeningSnapshot({ ...input, records: [null] })).toThrow("record");
    expect(() =>
      parseReviewScreeningSnapshot({
        ...input,
        records: [{ ...input.records[0], titleAbstract: { outcome: "pending", decisions: null, adjudication: null } }],
      }),
    ).toThrow("stage");
    expect(() =>
      parseReviewScreeningSnapshot({
        ...input,
        records: [{ ...input.records[0], titleAbstract: { outcome: "invalid", decisions: [], adjudication: null } }],
      }),
    ).toThrow("outcome");
    expect(() =>
      parseReviewScreeningSnapshot({
        ...input,
        records: [{ ...input.records[0], titleAbstract: { outcome: "include", decisions: [null], adjudication: null } }],
      }),
    ).toThrow("decision");
    expect(() =>
      parseReviewScreeningSnapshot({
        ...input,
        records: [
          {
            ...input.records[0],
            titleAbstract: { outcome: "include", decisions: [], adjudication: { ...first, outcome: "uncertain" } },
          },
        ],
      }),
    ).toThrow("adjudication");
    expect(() =>
      parseReviewScreeningSnapshot({
        ...input,
        records: [{ ...input.records[0], finalInclusion: { outcome: "invalid", decision: null } }],
      }),
    ).toThrow("final-inclusion state");
    expect(() =>
      parseReviewScreeningSnapshot({
        ...input,
        records: [{ ...input.records[0], finalInclusion: { outcome: "pending", decision: included.records[0]!.finalInclusion.decision } }],
      }),
    ).toThrow("inconsistent");
    expect(() =>
      parseReviewScreeningSnapshot({
        ...input,
        records: [
          {
            ...input.records[0],
            finalInclusion: { outcome: "include", decision: { ...included.records[0]!.finalInclusion.decision, outcome: "uncertain" } },
          },
        ],
      }),
    ).toThrow("final-inclusion decision");
    expect(() =>
      parseReviewScreeningSnapshot({
        ...input,
        records: [
          {
            ...input.records[0],
            finalInclusion: { outcome: "include", decision: { ...included.records[0]!.finalInclusion.decision, protocolRevision: 0 } },
          },
        ],
      }),
    ).toThrow("revision");
    expect(() =>
      parseReviewScreeningSnapshot({
        ...input,
        records: [
          {
            ...input.records[0],
            record: { ...input.records[0]!.record, metadata: { ...input.records[0]!.record.metadata, warnings: [1] } },
          },
        ],
      }),
    ).toThrow("metadata");
    expect(() =>
      parseReviewScreeningSnapshot({
        ...input,
        records: [{ ...input.records[0], record: { ...input.records[0]!.record, id: 1 } }],
      }),
    ).toThrow("text");
  });
});

function screeningSnapshotInput() {
  return {
    revision: 5,
    reviewersPerStage: 1,
    blinded: false,
    records: [
      {
        record: {
          id: "record-1",
          state: "active",
          mergedInto: null,
          metadata: {
            citationKey: "study",
            type: "article",
            title: "Study",
            authors: ["Doe, Jane"],
            year: "2025",
            venue: "Journal",
            doi: "10.1/study",
            url: "",
            abstract: "Evidence",
            identity: "doi:10.1/study",
            warnings: [],
          },
        },
        titleAbstract: {
          outcome: "include",
          decisions: [first],
          adjudication: {
            id: "adjudication-1",
            recordId: "record-1",
            stage: "title-abstract",
            protocolRevision: 1,
            outcome: "include",
            reason: "Consensus",
            criterionId: null,
            criterionText: "",
            adjudicator: "lead@example.com",
            createdAt: "2026-07-17T00:01:00.000Z",
          },
        },
        fullText: { outcome: "pending", decisions: [], adjudication: null },
        finalInclusion: { outcome: "pending", decision: null },
      },
    ],
    counts: {
      titleAbstractPending: 0,
      titleAbstractIncluded: 1,
      fullTextPending: 1,
      fullTextIncluded: 0,
      finalInclusionPending: 0,
      finalInclusionIncluded: 0,
      finalInclusionExcluded: 0,
      conflicts: 0,
    },
  };
}

function decision(reviewer: string, value: "include" | "exclude"): ScreeningDecision {
  return {
    id: `decision-${reviewer}`,
    recordId: "record-1",
    stage: "title-abstract",
    protocolRevision: 1,
    reviewer,
    decision: value,
    reason: value === "include" ? "Relevant" : "Out of scope",
    criterionId: value === "exclude" ? "criterion-1" : null,
    criterionText: value === "exclude" ? "Criterion" : "",
    createdAt: "2026-07-17T00:00:00.000Z",
  };
}
