import { describe, expect, it } from "vitest";
import { defaultReviewProtocol, materializeProtocolRevision } from "./review-study";
import { parseEvidencePointer, summarizeEvidenceRecord, validateExtractionValue } from "./review-evidence";

describe("review appraisal and extraction evidence", () => {
  it("requires an exact quotation for appraisal evidence", () => {
    expect(parseEvidencePointer({ quote: "Observed result", page: 4, location: "Results" }, true)).toEqual({
      quote: "Observed result",
      page: 4,
      location: "Results",
    });
    expect(() => parseEvidencePointer({ quote: "", page: null, location: "" }, true)).toThrow("pointer");
  });

  it("validates typed values and explicit missingness", () => {
    const integer = { id: "year", label: "Year", type: "integer" as const, values: [] };
    expect(validateExtractionValue(integer, 2026, null)).toEqual({ value: 2026, missingReason: null });
    expect(validateExtractionValue(integer, null, "Not reported")).toEqual({ value: null, missingReason: "Not reported" });
    expect(() => validateExtractionValue(integer, "2026", null)).toThrow("field type");
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
      { id: "a", recordId: "record", questionId: "q1", answerId: "yes", evidence, reviewer: "r", createdAt: "1" },
      { id: "b", recordId: "record", questionId: "q2", answerId: "reject", evidence, reviewer: "r", createdAt: "2" },
    ];
    expect(summarizeEvidenceRecord(record, protocol, qualityValues, [])).toMatchObject({
      qualityScore: 1,
      qualityRejected: true,
      qualityComplete: true,
    });
  });
});
