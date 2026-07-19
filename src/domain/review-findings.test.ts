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
