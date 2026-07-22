import { describe, expect, it } from "vitest";
import { parseExtractionModelResult, parseReviewModelSnapshot, parseScreeningModelResult, type ReviewModelCandidate } from "./review-model";

const field = {
  id: "year",
  label: "Year",
  type: "integer" as const,
  values: [],
  researchQuestionIds: [],
  requiredness: "required" as const,
  cardinality: "single" as const,
  condition: null,
};

describe("review model candidates", () => {
  it("validates bounded screening and evidence-linked extraction proposals", () => {
    expect(
      parseScreeningModelResult({ decision: "include", criterion: "Relevant", rationale: "Matches scope", evidence: "Exact title" }),
    ).toEqual({ decision: "include", criterion: "Relevant", rationale: "Matches scope", evidence: "Exact title" });
    expect(
      parseExtractionModelResult(
        {
          fieldId: "year",
          value: 2025,
          missingReason: null,
          evidence: {
            kind: "pdf-annotation",
            resourceId: "pdf-1",
            selectorId: "annotation-year",
            quote: "Published in 2025",
            page: 1,
            location: "Front matter",
          },
          rationale: "The year is explicit",
        },
        field,
      ),
    ).toMatchObject({ fieldId: "year", value: 2025, missingReason: null });
    expect(
      parseExtractionModelResult(
        { fieldId: "year", value: null, missingReason: "Not reported", evidence: null, rationale: "No year appears" },
        field,
      ),
    ).toMatchObject({ value: null, missingReason: "Not reported", evidence: null });
  });

  it("validates multiple-choice and source-selector proposals", () => {
    const multiple = {
      ...field,
      id: "methods",
      type: "multiple-choice" as const,
      values: ["survey", "interview"],
      cardinality: "repeatable" as const,
    };
    expect(
      parseExtractionModelResult(
        {
          fieldId: "methods",
          value: ["survey", "interview"],
          missingReason: null,
          evidence: {
            kind: "pdf-annotation",
            resourceId: "pdf-1",
            selectorId: "annotation-method",
            quote: "Survey and interviews",
            page: 2,
            location: "Method",
          },
          rationale: "Both methods are explicit",
        },
        multiple,
      ),
    ).toMatchObject({ value: ["survey", "interview"] });

    const selector = { ...field, id: "passage", type: "source-selector" as const };
    expect(
      parseExtractionModelResult(
        {
          fieldId: "passage",
          value: { kind: "web-passage", resourceId: "shared-web", selectorId: "passage-1" },
          missingReason: null,
          evidence: {
            kind: "web-passage",
            resourceId: "share-1",
            selectorId: "snapshot-1",
            quote: "Selected passage",
            page: null,
            location: "Results",
          },
          rationale: "The selected passage is relevant",
        },
        selector,
      ),
    ).toMatchObject({ value: { kind: "web-passage", resourceId: "shared-web", selectorId: "passage-1" } });
  });

  it("parses the auditable disclosure and rejects malformed or invented candidates", () => {
    const candidate: ReviewModelCandidate = {
      id: "candidate-1",
      operation: "screen-record",
      recordId: "record-1",
      stage: "title-abstract",
      provider: "Local",
      model: "model",
      promptTemplateVersion: "v1",
      sourceScope: ["title", "abstract"],
      result: { decision: "uncertain", criterion: "", rationale: "Insufficient", evidence: "Title" },
      createdAt: "2026-07-17T00:00:00.000Z",
      createdBy: "reviewer@example.com",
      disposition: "pending",
      disposedAt: null,
      disposedBy: null,
    };
    const extractionCandidate: ReviewModelCandidate = {
      ...candidate,
      id: "candidate-2",
      operation: "extract-field",
      stage: null,
      sourceScope: ["full-text"],
      result: {
        fieldId: "year",
        value: 2025,
        missingReason: null,
        evidence: {
          kind: "pdf-annotation",
          resourceId: "pdf-1",
          selectorId: "annotation-year",
          quote: "Published in 2025",
          page: 1,
          location: "Front matter",
        },
        rationale: "The publication year is explicit",
      },
      disposition: "accepted",
      disposedAt: "2026-07-17T00:05:00.000Z",
      disposedBy: "reviewer@example.com",
    };
    expect(parseReviewModelSnapshot({ revision: 4, candidates: [candidate, extractionCandidate] })).toEqual({
      revision: 4,
      candidates: [candidate, extractionCandidate],
    });
    expect(() => parseScreeningModelResult({ decision: "yes" })).toThrow("invalid");
    expect(() =>
      parseExtractionModelResult(
        {
          fieldId: "year",
          value: 2025,
          missingReason: null,
          evidence: null,
          rationale: "Unsupported",
        },
        field,
      ),
    ).toThrow("evidence");
    expect(() => parseReviewModelSnapshot({ revision: -1, candidates: "bad" })).toThrow("invalid");
    expect(() => parseReviewModelSnapshot({ revision: 1, candidates: [{ ...candidate, operation: "unknown" }] })).toThrow("candidate");
    expect(() =>
      parseReviewModelSnapshot({
        revision: 1,
        candidates: [{ ...extractionCandidate, result: { fieldId: "year", value: [], missingReason: null, rationale: "Bad" } }],
      }),
    ).toThrow("extraction candidate");
    expect(() =>
      parseReviewModelSnapshot({
        revision: 1,
        candidates: [{ ...extractionCandidate, result: { fieldId: "year", value: 2025, missingReason: null } }],
      }),
    ).toThrow("extraction candidate");
  });

  it("enforces exact screening and extraction text bounds", () => {
    expect(
      parseScreeningModelResult({
        decision: "exclude",
        criterion: ` ${"c".repeat(998)} `,
        rationale: ` ${"r".repeat(1_998)} `,
        evidence: ` ${"e".repeat(19_998)} `,
      }),
    ).toEqual({
      decision: "exclude",
      criterion: "c".repeat(998),
      rationale: "r".repeat(1_998),
      evidence: "e".repeat(19_998),
    });
    expect(parseScreeningModelResult({ decision: "uncertain", criterion: "", rationale: "Reason", evidence: "Evidence" })).toMatchObject({
      decision: "uncertain",
      criterion: "",
    });
    for (const [value, message] of [
      [{ decision: "include", criterion: 42, rationale: "Reason", evidence: "Evidence" }, "Screening criterion"],
      [{ decision: "include", criterion: "x".repeat(1_001), rationale: "Reason", evidence: "Evidence" }, "Screening criterion"],
      [{ decision: "include", criterion: "", rationale: " ", evidence: "Evidence" }, "Screening rationale"],
      [{ decision: "include", criterion: "", rationale: "x".repeat(2_001), evidence: "Evidence" }, "Screening rationale"],
      [{ decision: "include", criterion: "", rationale: "Reason", evidence: " " }, "Screening evidence"],
      [{ decision: "include", criterion: "", rationale: "Reason", evidence: "x".repeat(20_001) }, "Screening evidence"],
    ] as const) {
      expect(() => parseScreeningModelResult(value)).toThrow(`${message} is invalid`);
    }

    const evidence = {
      kind: "pdf-annotation",
      resourceId: "pdf-1",
      selectorId: "annotation-year",
      quote: "Published in 2025",
      page: 1,
      location: "Front matter",
    };
    expect(() =>
      parseExtractionModelResult({ fieldId: "wrong", value: 2025, missingReason: null, evidence, rationale: "Reason" }, field),
    ).toThrow("Extraction model result is invalid");
    expect(() =>
      parseExtractionModelResult({ fieldId: "year", value: null, missingReason: "Not reported", evidence, rationale: "Reason" }, field),
    ).toThrow("cannot cite invented evidence");
    expect(() =>
      parseExtractionModelResult(
        { fieldId: "year", value: null, missingReason: "x".repeat(2_001), evidence: null, rationale: "Reason" },
        field,
      ),
    ).toThrow("Missing reason is invalid");
    expect(() =>
      parseExtractionModelResult({ fieldId: "year", value: null, missingReason: "Not reported", evidence: null, rationale: " " }, field),
    ).toThrow("Extraction rationale is invalid");
    expect(() =>
      parseExtractionModelResult(
        { fieldId: "year", value: null, missingReason: "Not reported", evidence: null, rationale: "x".repeat(2_001) },
        field,
      ),
    ).toThrow("Extraction rationale is invalid");
    expect(
      parseExtractionModelResult(
        { fieldId: "year", value: null, missingReason: " Not reported ", evidence: null, rationale: " No year " },
        field,
      ),
    ).toMatchObject({ missingReason: "Not reported", evidence: null, rationale: "No year" });
  });

  it("distinguishes legacy extraction evidence from new exact selectors", () => {
    const legacyEvidence = { quote: "Published in 2025", page: 1, location: "Front matter" };
    const proposal = { fieldId: "year", value: 2025, missingReason: null, evidence: legacyEvidence, rationale: "Explicit" };
    expect(() => parseExtractionModelResult(proposal, field)).toThrow("Review source selector value is invalid");
    expect(parseExtractionModelResult(proposal, field, true)).toMatchObject({
      evidence: { kind: "legacy-unresolved", resourceId: "legacy-unresolved", selectorId: "legacy-unresolved" },
    });
  });

  it("validates every stored candidate envelope and extraction branch", () => {
    const candidate: ReviewModelCandidate = {
      id: "candidate-1",
      operation: "screen-record",
      recordId: "record-1",
      stage: "full-text",
      provider: "Local",
      model: "model",
      promptTemplateVersion: "v1",
      sourceScope: ["full-text"],
      result: { decision: "exclude", criterion: "Population", rationale: "Wrong population", evidence: "Methods" },
      createdAt: "2026-07-17T00:00:00.000Z",
      createdBy: "reviewer@example.com",
      disposition: "rejected",
      disposedAt: "2026-07-17T00:05:00.000Z",
      disposedBy: "reviewer@example.com",
    };
    expect(parseReviewModelSnapshot({ revision: 0, candidates: [candidate] })).toEqual({ revision: 0, candidates: [candidate] });
    for (const invalidSnapshot of [null, [], { revision: "0", candidates: [] }, { revision: 1.5, candidates: [] }]) {
      expect(() => parseReviewModelSnapshot(invalidSnapshot)).toThrow("snapshot is invalid");
    }
    for (const invalidCandidate of [
      null,
      [],
      { ...candidate, id: 42 },
      { ...candidate, recordId: 42 },
      { ...candidate, stage: "abstract" },
      { ...candidate, provider: 42 },
      { ...candidate, model: 42 },
      { ...candidate, promptTemplateVersion: 42 },
      { ...candidate, sourceScope: null },
      { ...candidate, sourceScope: ["title", 42] },
      { ...candidate, createdAt: 42 },
      { ...candidate, createdBy: 42 },
      { ...candidate, disposition: "disposed" },
      { ...candidate, disposedAt: 42 },
      { ...candidate, disposedBy: 42 },
    ]) {
      expect(() => parseReviewModelSnapshot({ revision: 1, candidates: [invalidCandidate] })).toThrow("candidate is invalid");
    }

    const extractionCandidate: ReviewModelCandidate = {
      ...candidate,
      operation: "extract-field",
      stage: null,
      result: {
        fieldId: "year",
        value: 2025,
        missingReason: null,
        evidence: null,
        rationale: "Stored reviewed result",
      },
      disposition: "accepted",
    };
    expect(parseReviewModelSnapshot({ revision: 1, candidates: [extractionCandidate] })).toMatchObject({
      candidates: [{ result: { value: 2025, evidence: null } }],
    });
    for (const result of [
      null,
      { ...extractionCandidate.result, fieldId: 42 },
      { ...extractionCandidate.result, missingReason: 42 },
      { ...extractionCandidate.result, rationale: 42 },
      { ...extractionCandidate.result, value: { invalid: true } },
      { ...extractionCandidate.result, evidence: { invalid: true } },
    ]) {
      expect(() => parseReviewModelSnapshot({ revision: 1, candidates: [{ ...extractionCandidate, result }] })).toThrow();
    }
  });
});
