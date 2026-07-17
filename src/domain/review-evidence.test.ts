import { describe, expect, it } from "vitest";
import { defaultReviewProtocol, materializeProtocolRevision } from "./review-study";
import {
  parseEvidencePointer,
  parseReviewEvidenceSnapshot,
  summarizeEvidenceRecord,
  validateExtractionValue,
  validateQualityAssessment,
} from "./review-evidence";

describe("review appraisal and extraction evidence", () => {
  it("requires an exact quotation for appraisal evidence", () => {
    expect(parseEvidencePointer(null, false)).toBeNull();
    expect(parseEvidencePointer({ quote: "Observed result", page: 4, location: "Results" }, true)).toEqual({
      quote: "Observed result",
      page: 4,
      location: "Results",
    });
    expect(() => parseEvidencePointer({ quote: "", page: null, location: "" }, true)).toThrow("pointer");
    expect(() => parseEvidencePointer({ quote: "Evidence", page: 0, location: "Results" }, true)).toThrow("page");
  });

  it("accepts an explicit rationale for a negative appraisal answer", () => {
    const answers = defaultReviewProtocol().qualityAssessment.answers;
    expect(() => validateQualityAssessment(answers.find((answer) => answer.id === "yes")!, null, "")).toThrow("pointer");
    expect(validateQualityAssessment(answers.find((answer) => answer.id === "no")!, null, "No limitations section was found.")).toEqual({
      evidence: null,
      rationale: "No limitations section was found.",
    });
    expect(() => validateQualityAssessment(answers.find((answer) => answer.id === "no")!, null, "")).toThrow("rationale");
  });

  it("validates typed values and explicit missingness", () => {
    const integer = { id: "year", label: "Year", type: "integer" as const, values: [], researchQuestionIds: [] };
    expect(validateExtractionValue(integer, 2026, null)).toEqual({ value: 2026, missingReason: null });
    expect(validateExtractionValue(integer, null, "Not reported")).toEqual({ value: null, missingReason: "Not reported" });
    expect(() => validateExtractionValue(integer, "2026", null)).toThrow("field type");
    expect(validateExtractionValue({ ...integer, type: "boolean" }, true, null)).toEqual({ value: true, missingReason: null });
    expect(validateExtractionValue({ ...integer, type: "enum", values: ["survey"] }, "survey", null)).toEqual({
      value: "survey",
      missingReason: null,
    });
    expect(validateExtractionValue({ ...integer, type: "string" }, "  finding  ", null)).toEqual({
      value: "finding",
      missingReason: null,
    });
    expect(() => validateExtractionValue(integer, 2026, "also missing")).toThrow("cannot have");
    expect(() => validateExtractionValue(integer, null, null)).toThrow("require a reason");
    expect(() => validateExtractionValue(integer, null, "x".repeat(2_001))).toThrow("missingness");
  });

  it("derives checklist score, rejection, and completion", () => {
    const protocol = materializeProtocolRevision(
      {
        ...defaultReviewProtocol(),
        qualityAssessment: {
          questions: [
            { id: "q1", text: "Clear method?" },
            { id: "q2", text: "Valid data?" },
          ],
          answers: defaultReviewProtocol().qualityAssessment.answers,
          minimumScore: 1,
        },
      },
      1,
      "frozen",
      "Ready",
      "owner",
    );
    const record = {
      id: "record",
      state: "active" as const,
      mergedInto: null,
      metadata: {
        citationKey: "record",
        type: "article",
        title: "Study",
        authors: [],
        year: "",
        venue: "",
        doi: "",
        url: "",
        abstract: "",
        identity: "work:study||",
        warnings: [],
      },
    };
    const evidence = { quote: "Evidence", page: 1, location: "Methods" };
    const qualityValues = [
      { id: "a", recordId: "record", questionId: "q1", answerId: "yes", evidence, rationale: "", reviewer: "r", createdAt: "1" },
      { id: "b", recordId: "record", questionId: "q2", answerId: "reject", evidence, rationale: "", reviewer: "r", createdAt: "2" },
    ];
    expect(summarizeEvidenceRecord(record, protocol, qualityValues, [])).toMatchObject({
      qualityScore: 1,
      qualityRejected: true,
      qualityComplete: true,
    });
  });

  it("parses a browser-bound evidence snapshot without trusting derived flags", () => {
    const value = {
      revision: 6,
      protocolRevision: 2,
      protocol: {
        qualityAssessment: {
          questions: [{ id: "q1", text: "Clear?" }],
          answers: [{ id: "yes", label: "Yes", weight: 1, rejects: false }],
          minimumScore: 1,
        },
        extractionFields: [{ id: "year", label: "Year", type: "integer", values: [], researchQuestionIds: [] }],
      },
      records: [
        {
          record: {
            id: "record",
            state: "active",
            mergedInto: null,
            metadata: {
              citationKey: "record",
              type: "article",
              title: "Study",
              authors: ["Doe, Jane"],
              year: "2026",
              venue: "Journal",
              doi: "",
              url: "",
              abstract: "Evidence",
              identity: "work:study|2026|doe jane",
              warnings: [],
            },
          },
          qualityValues: [
            {
              id: "quality",
              recordId: "record",
              questionId: "q1",
              answerId: "yes",
              evidence: { quote: "Clear method", page: 2, location: "Methods" },
              rationale: "",
              reviewer: "reviewer",
              createdAt: "2026-07-17",
            },
          ],
          extractionValues: [
            {
              id: "extraction",
              recordId: "record",
              fieldId: "year",
              value: 2026,
              missingReason: null,
              evidence: { quote: "Published 2026", page: 1, location: "Front" },
              reviewer: "reviewer",
              createdAt: "2026-07-17",
            },
          ],
        },
      ],
    };
    expect(parseReviewEvidenceSnapshot(value)).toMatchObject({
      revision: 6,
      records: [{ qualityScore: 1, qualityComplete: true, extractionComplete: true }],
    });
    expect(() => parseReviewEvidenceSnapshot({ protocol: {}, records: "bad" })).toThrow("invalid");
    expect(() =>
      parseReviewEvidenceSnapshot({
        ...value,
        records: [{ ...value.records[0], record: { ...value.records[0]!.record, metadata: { authors: "bad", warnings: [] } } }],
      }),
    ).toThrow("metadata");
  });
});
