import { describe, expect, it } from "vitest";
import {
  currentReviewFindings,
  materializeReviewFinding,
  parseReviewFindingInput,
  parseReviewFindingsSnapshot,
  reviewFindingLimits,
  type ReviewFinding,
  type ReviewFindingInput,
} from "./review-findings";

const timestamp = "2026-07-19T08:00:00.000Z";

describe("review findings", () => {
  it("publishes exact finding limits", () => {
    expect(reviewFindingLimits).toEqual({
      findings: 10_000,
      contributorsPerKind: 512,
      evidenceLinks: 1_024,
      statementCharacters: 4_000,
      interpretationCharacters: 20_000,
    });
  });

  it("materializes a revision-pinned, evidence-linked RQ finding", () => {
    const finding = materializeReviewFinding(input(), {
      id: "finding-1",
      reviewRevision: 12,
      protocolRevision: 3,
      createdBy: "author@example.com",
      createdAt: timestamp,
    });

    expect(finding).toEqual({
      id: "finding-1",
      reviewRevision: 12,
      protocolRevision: 3,
      researchQuestionId: "rq-1",
      statement: "Teams reported more consistent reviews.",
      interpretation: "The extracted observations suggest a consistency benefit.",
      extractionValueIds: ["extraction-1"],
      appraisalValueIds: ["appraisal-1"],
      evidence: [
        {
          contributorKind: "extraction",
          contributorId: "extraction-1",
          pointer: {
            kind: "pdf-annotation",
            resourceId: "shared-pdf",
            selectorId: "annotation-1",
            quote: "Reviews became consistent",
            page: 4,
            location: "Results",
          },
        },
        {
          contributorKind: "appraisal",
          contributorId: "appraisal-1",
          pointer: {
            kind: "pdf-annotation",
            resourceId: "shared-pdf",
            selectorId: "annotation-2",
            quote: "We triangulated observations",
            page: 6,
            location: "Validity",
          },
        },
      ],
      supersedesId: null,
      createdBy: "author@example.com",
      createdAt: timestamp,
    });
  });

  it("strictly validates bounds, contributors, and exact selectors", () => {
    expect(() => parseReviewFindingInput({ ...input(), statement: "x".repeat(reviewFindingLimits.statementCharacters + 1) })).toThrow(
      "statement",
    );
    expect(() => parseReviewFindingInput({ ...input(), extractionValueIds: [], appraisalValueIds: [], evidence: [] })).toThrow(
      "contributing",
    );
    expect(() => parseReviewFindingInput({ ...input(), evidence: [input().evidence[0]] })).toThrow("Every");
    expect(() =>
      parseReviewFindingInput({
        ...input(),
        evidence: [{ ...input().evidence[0]!, contributorId: "not-declared" }, input().evidence[1]],
      }),
    ).toThrow("undeclared");
    expect(() =>
      parseReviewFindingInput({
        ...input(),
        evidence: [input().evidence[0], input().evidence[0], input().evidence[1]],
      }),
    ).toThrow("unique");
    expect(() =>
      parseReviewFindingInput({
        ...input(),
        evidence: [
          {
            ...input().evidence[0]!,
            pointer: {
              kind: "pdf-annotation",
              resourceId: "shared-pdf",
              selectorId: "annotation-1",
              quote: "",
              page: 1,
              location: "Results",
            },
          },
          input().evidence[1],
        ],
      }),
    ).toThrow("pointer");
    expect(() => parseReviewFindingInput({ ...input(), unexpected: true })).toThrow("input");
  });

  it("parses append-only history and projects unsuperseded findings", () => {
    const original = finding("finding-1", 4);
    const replacement = finding("finding-2", 8, { supersedesId: original.id, statement: "Updated finding" });
    const independent = finding("finding-3", 6, { researchQuestionId: "rq-2", statement: "Independent finding" });
    const snapshot = parseReviewFindingsSnapshot({ revision: 10, findings: [replacement, original, independent] });

    expect(snapshot.findings.map(({ id }) => id)).toEqual(["finding-1", "finding-3", "finding-2"]);
    expect(currentReviewFindings(snapshot).map(({ id }) => id)).toEqual(["finding-3", "finding-2"]);
  });

  it("rejects invalid append and supersession histories", () => {
    const original = finding("finding-1", 4);
    expect(() => parseReviewFindingsSnapshot({ revision: 3, findings: [original] })).toThrow("future");
    expect(() => parseReviewFindingsSnapshot({ revision: 10, findings: [original, { ...original }] })).toThrow("unique");
    expect(() =>
      parseReviewFindingsSnapshot({ revision: 10, findings: [original, finding("finding-2", 8, { supersedesId: "missing" })] }),
    ).toThrow("unavailable");
    expect(() =>
      parseReviewFindingsSnapshot({ revision: 10, findings: [original, finding("finding-2", 4, { supersedesId: original.id })] }),
    ).toThrow("earlier");
    expect(() =>
      parseReviewFindingsSnapshot({
        revision: 10,
        findings: [original, finding("finding-2", 8, { researchQuestionId: "rq-2", supersedesId: original.id })],
      }),
    ).toThrow("different research question");
    expect(() =>
      parseReviewFindingsSnapshot({
        revision: 10,
        findings: [
          original,
          finding("finding-2", 8, { supersedesId: original.id }),
          finding("finding-3", 9, { supersedesId: original.id }),
        ],
      }),
    ).toThrow("branch");
    expect(() => parseReviewFindingsSnapshot({ revision: 10, findings: [], extra: true })).toThrow("snapshot");
  });

  it("rejects invalid event context", () => {
    expect(() =>
      materializeReviewFinding(input(), {
        id: "finding-1",
        reviewRevision: 0,
        protocolRevision: 1,
        createdBy: "author@example.com",
        createdAt: timestamp,
      }),
    ).toThrow("revision");
    expect(() =>
      materializeReviewFinding(input(), {
        id: "finding-1",
        reviewRevision: 1,
        protocolRevision: 1,
        createdBy: "author@example.com",
        createdAt: "2026-07-19",
      }),
    ).toThrow("time");
  });

  it("rejects malformed finding fields and event evidence", () => {
    expect(() => parseReviewFindingInput({ ...input(), evidence: [] })).toThrow("requires exact evidence");
    expect(() => parseReviewFindingInput({ ...input(), extractionValueIds: ["extraction-1", "extraction-1"] })).toThrow("unique");
    expect(() => parseReviewFindingInput({ ...input(), researchQuestionId: "?" })).toThrow("ID is invalid");
    expect(() => parseReviewFindingInput({ ...input(), statement: 3 })).toThrow("statement is invalid");

    const original = finding("finding-1", 4);
    expect(() => parseReviewFindingsSnapshot({ revision: 10, findings: [{ ...original, extra: true }] })).toThrow("finding is invalid");
    expect(() => parseReviewFindingsSnapshot({ revision: 10, findings: [{ ...original, evidence: [null] }] })).toThrow(
      "evidence link is invalid",
    );
    expect(() =>
      parseReviewFindingsSnapshot({
        revision: 10,
        findings: [{ ...original, evidence: [{ ...original.evidence[0], contributorKind: "code" }] }],
      }),
    ).toThrow("contributor kind is invalid");
    expect(() =>
      parseReviewFindingsSnapshot({
        revision: 10,
        findings: [{ ...original, evidence: [{ ...original.evidence[0], pointer: null }] }],
      }),
    ).toThrow("evidence pointer is invalid");
    expect(() => parseReviewFindingsSnapshot({ revision: 10, findings: [{ ...original, createdAt: "2026-07-19" }] })).toThrow(
      "time is invalid",
    );
  });

  it("trims authored values, accepts an empty interpretation, and materializes a supersession id", () => {
    const parsed = parseReviewFindingInput({
      ...input(),
      researchQuestionId: " rq-1 ",
      statement: " statement ",
      interpretation: "   ",
      supersedesId: " finding-0 ",
    });

    expect(parsed).toEqual({
      ...input(),
      researchQuestionId: "rq-1",
      statement: "statement",
      interpretation: "",
      supersedesId: "finding-0",
    });
  });

  it("accepts exact text and id boundaries and rejects each adjacent value", () => {
    const id = `a${"x".repeat(127)}`;
    expect(
      parseReviewFindingInput({
        ...input(),
        researchQuestionId: id,
        statement: "x".repeat(reviewFindingLimits.statementCharacters),
        interpretation: "x".repeat(reviewFindingLimits.interpretationCharacters),
      }),
    ).toMatchObject({ researchQuestionId: id });

    for (const [field, value, message] of [
      ["researchQuestionId", "", "Research question ID is invalid"],
      ["researchQuestionId", `a${"x".repeat(128)}`, "Research question ID is invalid"],
      ["researchQuestionId", "-starts-with-dash", "Research question ID is invalid"],
      ["researchQuestionId", "contains space", "Research question ID is invalid"],
      ["statement", "", "Review finding statement is invalid"],
      ["statement", "x".repeat(reviewFindingLimits.statementCharacters + 1), "Review finding statement is invalid"],
      ["interpretation", "x".repeat(reviewFindingLimits.interpretationCharacters + 1), "Review finding interpretation is invalid"],
      ["supersedesId", 1, "Superseded review finding ID is invalid"],
    ] as const) {
      expect(() => parseReviewFindingInput({ ...input(), [field]: value })).toThrow(message);
    }
  });

  it("rejects non-arrays, oversized arrays, and duplicate contributor kinds independently", () => {
    expect(() => parseReviewFindingInput({ ...input(), extractionValueIds: "extraction-1" })).toThrow(
      "Review finding extraction contributors are invalid",
    );
    expect(() =>
      parseReviewFindingInput({
        ...input(),
        extractionValueIds: Array.from({ length: reviewFindingLimits.contributorsPerKind + 1 }, (_, index) => `extraction-${index}`),
      }),
    ).toThrow("Review finding extraction contributors are invalid");
    expect(() => parseReviewFindingInput({ ...input(), appraisalValueIds: ["appraisal-1", "appraisal-1"] })).toThrow(
      "Review finding appraisal contributor IDs must be unique",
    );
    expect(() => parseReviewFindingInput({ ...input(), evidence: "evidence" })).toThrow("Review finding evidence links are invalid");
    expect(() =>
      parseReviewFindingInput({
        ...input(),
        evidence: Array.from({ length: reviewFindingLimits.evidenceLinks + 1 }, () => input().evidence[0]),
      }),
    ).toThrow("Review finding evidence links are invalid");
  });

  it("distinguishes evidence-link envelope and pointer failures", () => {
    const first = input().evidence[0]!;
    for (const [value, message] of [
      [{ ...first, extra: true }, "Review finding evidence link is invalid"],
      [{ ...first, contributorKind: "Extraction" }, "Review finding contributor kind is invalid"],
      [{ ...first, contributorId: "?" }, "Review finding contributor ID is invalid"],
      [{ ...first, pointer: { ...first.pointer, extra: true } }, "Review finding evidence pointer is invalid"],
      [{ ...first, pointer: { ...first.pointer, page: 0 } }, "Review evidence page is invalid"],
    ] as const) {
      expect(() =>
        parseReviewFindingInput({
          ...input(),
          evidence: [value, input().evidence[1]],
        }),
      ).toThrow(message);
    }
  });

  it("validates every finding context field and canonical timestamp", () => {
    const valid = {
      id: "finding-1",
      reviewRevision: 1,
      protocolRevision: 1,
      createdBy: "author@example.com",
      createdAt: timestamp,
    };
    for (const [field, value, message] of [
      ["id", "?", "Review finding ID is invalid"],
      ["reviewRevision", 1.5, "Review finding revision is invalid"],
      ["reviewRevision", Number.MAX_SAFE_INTEGER + 1, "Review finding revision is invalid"],
      ["protocolRevision", 0, "Review finding protocol revision is invalid"],
      ["createdBy", "", "Review finding author is invalid"],
      ["createdBy", "x".repeat(321), "Review finding author is invalid"],
      ["createdAt", 1, "Review finding time is invalid"],
      ["createdAt", "2026-02-30T08:00:00.000Z", "Review finding time is invalid"],
      ["createdAt", "2026-07-19T08:00:00Z", "Review finding time is invalid"],
    ] as const) {
      expect(() => materializeReviewFinding(input(), { ...valid, [field]: value })).toThrow(message);
    }
  });

  it("sorts equal-revision findings by timestamp and id and preserves an empty snapshot", () => {
    const later = finding("finding-z", 4);
    const earlier = { ...finding("finding-b", 4), createdAt: "2026-07-19T08:03:00.000Z" };
    const sameTimeEarlierId = { ...earlier, id: "finding-a" };

    expect(
      parseReviewFindingsSnapshot({ revision: 4, findings: [later, earlier, sameTimeEarlierId] }).findings.map(({ id }) => id),
    ).toEqual(["finding-a", "finding-b", "finding-z"]);
    expect(parseReviewFindingsSnapshot({ revision: 1, findings: [] })).toEqual({ revision: 1, findings: [] });
    expect(currentReviewFindings({ revision: 1, findings: [] })).toEqual([]);
  });

  it("rejects malformed snapshot envelopes, revisions, and oversized histories", () => {
    for (const value of [null, [], {}, { revision: 1 }, { revision: 1, findings: "items" }, { revision: 0, findings: [] }]) {
      expect(() => parseReviewFindingsSnapshot(value)).toThrow();
    }
    expect(() =>
      parseReviewFindingsSnapshot({
        revision: 1,
        findings: Array.from({ length: reviewFindingLimits.findings + 1 }, () => finding("finding-1", 1)),
      }),
    ).toThrow("Review finding findings are invalid");
  });
});

function input(): ReviewFindingInput {
  return {
    researchQuestionId: "rq-1",
    statement: "Teams reported more consistent reviews.",
    interpretation: "The extracted observations suggest a consistency benefit.",
    extractionValueIds: ["extraction-1"],
    appraisalValueIds: ["appraisal-1"],
    evidence: [
      {
        contributorKind: "extraction",
        contributorId: "extraction-1",
        pointer: {
          kind: "pdf-annotation",
          resourceId: "shared-pdf",
          selectorId: "annotation-1",
          quote: "Reviews became consistent",
          page: 4,
          location: "Results",
        },
      },
      {
        contributorKind: "appraisal",
        contributorId: "appraisal-1",
        pointer: {
          kind: "pdf-annotation",
          resourceId: "shared-pdf",
          selectorId: "annotation-2",
          quote: "We triangulated observations",
          page: 6,
          location: "Validity",
        },
      },
    ],
    supersedesId: null,
  };
}

function finding(id: string, reviewRevision: number, overrides: Partial<ReviewFindingInput> = {}): ReviewFinding {
  return materializeReviewFinding(
    { ...input(), ...overrides },
    {
      id,
      reviewRevision,
      protocolRevision: 3,
      createdBy: "author@example.com",
      createdAt: `2026-07-19T08:${String(reviewRevision).padStart(2, "0")}:00.000Z`,
    },
  );
}
