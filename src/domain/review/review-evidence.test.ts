import { describe, expect, it } from "vitest";
import { defaultReviewProtocol, materializeProtocolRevision, type ExtractionFieldDefinition } from "./review-study";
import {
  effectiveExtractionValues,
  parseEvidencePointer,
  parseExtractionValueShape,
  parseReviewEvidenceSnapshot,
  summarizeEvidenceRecord,
  validateExtractionValue,
  validateQualityAssessment,
} from "./review-evidence";

describe("review appraisal and extraction evidence", () => {
  it("requires an exact quotation for appraisal evidence", () => {
    expect(parseEvidencePointer(null, false)).toBeNull();
    expect(
      parseEvidencePointer(
        {
          kind: "pdf-annotation",
          resourceId: "pdf-1",
          selectorId: "annotation-1",
          quote: "Observed result",
          page: 4,
          location: "Results",
        },
        true,
      ),
    ).toEqual({
      kind: "pdf-annotation",
      resourceId: "pdf-1",
      selectorId: "annotation-1",
      quote: "Observed result",
      page: 4,
      location: "Results",
    });
    expect(() => parseEvidencePointer({ quote: "Observed result", page: 4, location: "Results" }, true)).toThrow("source selector");
    expect(parseEvidencePointer({ quote: "Observed result", page: 4, location: "Results" }, true, true)).toMatchObject({
      kind: "legacy-unresolved",
    });
    expect(
      parseEvidencePointer(
        {
          kind: "legacy-unresolved",
          resourceId: "legacy-unresolved",
          selectorId: "legacy-unresolved",
          quote: "Observed result",
          page: 4,
          location: "Results",
        },
        true,
        true,
      ),
    ).toMatchObject({ kind: "legacy-unresolved", quote: "Observed result" });
    expect(() => parseEvidencePointer({ quote: "", page: null, location: "" }, true)).toThrow("pointer");
    expect(() => parseEvidencePointer({ quote: "Evidence", page: 0, location: "Results" }, true)).toThrow("page");
  });

  it("accepts an explicit rationale for a negative appraisal answer", () => {
    const answers = defaultReviewProtocol().qualityAssessment.answers;
    expect(() =>
      validateQualityAssessment(
        answers.find((answer) => answer.id === "yes")!,
        null,
        "",
      ),
    ).toThrow("pointer");
    expect(
      validateQualityAssessment(
        answers.find((answer) => answer.id === "no")!,
        null,
        "No limitations section was found.",
      ),
    ).toEqual({
      evidence: null,
      rationale: "No limitations section was found.",
    });
    expect(() =>
      validateQualityAssessment(
        answers.find((answer) => answer.id === "no")!,
        null,
        "",
      ),
    ).toThrow("rationale");
  });

  it("validates typed values and explicit missingness", () => {
    const integer = extractionField({ id: "year", label: "Year", type: "integer" });
    expect(validateExtractionValue(integer, 2026, null)).toEqual({ value: 2026, missingReason: null });
    expect(validateExtractionValue(integer, null, "Not reported")).toEqual({ value: null, missingReason: "Not reported" });
    expect(() => validateExtractionValue(integer, "2026", null)).toThrow("field type");
    expect(validateExtractionValue({ ...integer, type: "boolean" }, true, null)).toEqual({ value: true, missingReason: null });
    expect(validateExtractionValue({ ...integer, type: "decimal" }, 2.5, null)).toEqual({ value: 2.5, missingReason: null });
    expect(validateExtractionValue({ ...integer, type: "date" }, "2024-02-29", null)).toEqual({
      value: "2024-02-29",
      missingReason: null,
    });
    expect(() => validateExtractionValue({ ...integer, type: "date" }, "2023-02-29", null)).toThrow("field type");
    expect(validateExtractionValue({ ...integer, type: "single-choice", values: ["survey"] }, "survey", null)).toEqual({
      value: "survey",
      missingReason: null,
    });
    expect(
      validateExtractionValue({ ...integer, type: "multiple-choice", values: ["survey", "experiment"] }, ["experiment", "survey"], null),
    ).toEqual({ value: ["experiment", "survey"], missingReason: null });
    expect(() => validateExtractionValue({ ...integer, type: "multiple-choice", values: ["survey"] }, ["survey", "survey"], null)).toThrow(
      "field type",
    );
    expect(validateExtractionValue({ ...integer, type: "text" }, "  finding  ", null)).toEqual({
      value: "finding",
      missingReason: null,
    });
    expect(
      validateExtractionValue(
        { ...integer, type: "source-selector" },
        { kind: "pdf-annotation", resourceId: "shared-pdf", selectorId: "annotation-1" },
        null,
      ),
    ).toEqual({
      value: { kind: "pdf-annotation", resourceId: "shared-pdf", selectorId: "annotation-1" },
      missingReason: null,
    });
    expect(() =>
      validateExtractionValue(
        { ...integer, type: "source-selector" },
        { kind: "private-file", resourceId: "shared-pdf", selectorId: "annotation-1" },
        null,
      ),
    ).toThrow("source selector");
    expect(() => validateExtractionValue(integer, 2026, "also missing")).toThrow("cannot have");
    expect(() => validateExtractionValue(integer, null, null)).toThrow("require a reason");
    expect(() => validateExtractionValue(integer, null, "x".repeat(2_001))).toThrow("missingness");
  });

  it("parses each transport-safe extraction value shape", () => {
    expect(parseExtractionValueShape(null)).toBeNull();
    expect(parseExtractionValueShape("finding")).toBe("finding");
    expect(parseExtractionValueShape(true)).toBe(true);
    expect(parseExtractionValueShape(2.5)).toBe(2.5);
    expect(parseExtractionValueShape(["survey", "experiment"])).toEqual(["survey", "experiment"]);
    expect(parseExtractionValueShape({ kind: "web-passage", resourceId: " page-1 ", selectorId: " passage-1 " })).toEqual({
      kind: "web-passage",
      resourceId: "page-1",
      selectorId: "passage-1",
    });
    expect(() => parseExtractionValueShape([])).toThrow("Extracted data value");
    expect(() => parseExtractionValueShape(["survey", "survey"])).toThrow("Extracted data value");
    expect(() => parseExtractionValueShape(Number.POSITIVE_INFINITY)).toThrow("Extracted data value");
  });

  it("derives required, optional, conditional, single, and repeatable completion", () => {
    const required = extractionField({ id: "required", label: "Required", type: "text" });
    const optional = extractionField({ id: "optional", label: "Optional", type: "text", requiredness: "optional" });
    const conditional = extractionField({
      id: "conditional",
      label: "Conditional",
      type: "text",
      requiredness: "conditional",
      condition: "When a comparison is reported",
    });
    const repeatable = extractionField({ id: "theme", label: "Theme", type: "text", cardinality: "repeatable" });
    const record = evidenceRecord();
    const value = (id: string, fieldId: string, entry: string) => ({
      id,
      recordId: record.id,
      protocolRevision: 1,
      fieldId,
      criterionId: fieldId,
      criterionText: fieldId,
      value: entry,
      missingReason: null,
      evidence: {
        kind: "pdf-annotation" as const,
        resourceId: "pdf-1",
        selectorId: "annotation-1",
        quote: entry,
        page: 1,
        location: "Results",
      },
      reviewer: "reviewer",
      createdAt: id,
    });
    const values = [
      value("required-1", "required", "old"),
      value("required-2", "required", "new"),
      value("theme-1", "theme", "one"),
      value("theme-2", "theme", "two"),
    ];
    const protocol = {
      qualityAssessment: defaultReviewProtocol().qualityAssessment,
      extractionFields: [required, optional, conditional, repeatable],
    };

    expect(effectiveExtractionValues(values, protocol.extractionFields).map(({ id }) => id)).toEqual(["required-2", "theme-1", "theme-2"]);
    expect(summarizeEvidenceRecord(record, protocol, [], values).extractionComplete).toBe(false);
    expect(
      summarizeEvidenceRecord(record, protocol, [], [...values, value("conditional-1", "conditional", "resolved")]).extractionComplete,
    ).toBe(true);
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
    const evidence = {
      kind: "pdf-annotation" as const,
      resourceId: "pdf-1",
      selectorId: "annotation-1",
      quote: "Evidence",
      page: 1,
      location: "Methods",
    };
    const qualityValues = [
      {
        id: "a",
        recordId: "record",
        protocolRevision: 1,
        questionId: "q1",
        criterionId: "q1",
        criterionText: "Clear method?",
        answerId: "yes",
        evidence,
        rationale: "",
        reviewer: "r",
        createdAt: "1",
      },
      {
        id: "b",
        recordId: "record",
        protocolRevision: 1,
        questionId: "q2",
        criterionId: "q2",
        criterionText: "Valid data?",
        answerId: "reject",
        evidence,
        rationale: "",
        reviewer: "r",
        createdAt: "2",
      },
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
        researchQuestions: [{ id: "rq1", text: "What changed?" }],
        qualityAssessment: {
          questions: [{ id: "q1", text: "Clear?" }],
          answers: [{ id: "yes", label: "Yes", weight: 1, rejects: false }],
          minimumScore: 1,
        },
        extractionFields: [{ id: "year", label: "Year", type: "integer", values: [], researchQuestionIds: ["rq1"] }],
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
              protocolRevision: 1,
              fieldId: "year",
              criterionId: "publication-year",
              criterionText: "Original publication year wording",
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
      protocol: {
        researchQuestions: [{ id: "rq1", text: "What changed?" }],
        extractionFields: [{ id: "year", researchQuestionIds: ["rq1"] }],
      },
      records: [{ qualityScore: 1, qualityComplete: true, extractionComplete: true }],
    });
    expect(parseReviewEvidenceSnapshot(value).records[0]).toMatchObject({
      qualityValues: [{ protocolRevision: 2, criterionId: "q1", criterionText: "Clear?" }],
      extractionValues: [{ protocolRevision: 1, criterionId: "publication-year", criterionText: "Original publication year wording" }],
    });
    expect(() => parseReviewEvidenceSnapshot({ protocol: {}, records: "bad" })).toThrow("invalid");
    expect(() =>
      parseReviewEvidenceSnapshot({
        ...value,
        records: [{ ...value.records[0], record: { ...value.records[0]!.record, metadata: { authors: "bad", warnings: [] } } }],
      }),
    ).toThrow("metadata");
  });

  it("validates every evidence pointer field and exact boundary", () => {
    const pointer = {
      kind: "pdf-annotation",
      resourceId: "pdf-1",
      selectorId: "annotation-1",
      quote: " Evidence ",
      page: 1,
      location: " Results ",
    };
    expect(parseEvidencePointer(pointer, true)).toMatchObject({ quote: "Evidence", location: "Results", page: 1 });
    expect(parseEvidencePointer({ ...pointer, kind: "web-passage", page: 100_000 }, true)).toMatchObject({
      kind: "web-passage",
      page: 100_000,
    });
    for (const value of [
      null,
      [],
      { ...pointer, quote: 1 },
      { ...pointer, quote: " " },
      { ...pointer, quote: "x".repeat(20_001) },
      { ...pointer, location: 1 },
      { ...pointer, location: "x".repeat(1_001) },
    ]) {
      expect(() => parseEvidencePointer(value, true)).toThrow("Review evidence pointer is invalid");
    }
    for (const page of [0, 100_001, 1.5, "1"]) {
      expect(() => parseEvidencePointer({ ...pointer, page }, true)).toThrow("Review evidence page is invalid");
    }
    for (const selector of [
      { ...pointer, kind: "other" },
      { ...pointer, resourceId: "" },
      { ...pointer, resourceId: "x".repeat(129) },
      { ...pointer, selectorId: "" },
      { ...pointer, selectorId: "x".repeat(129) },
    ]) {
      expect(() => parseEvidencePointer(selector, true)).toThrow("Review source selector value is invalid");
    }
    expect(() => parseEvidencePointer(null, true)).toThrow("Review evidence pointer is invalid");
  });

  it("distinguishes all calendar boundaries and extraction collection constraints", () => {
    const date = extractionField({ id: "date", label: "Date", type: "date" });
    for (const valid of ["0001-01-01", "2000-02-29", "2024-12-31"]) {
      expect(validateExtractionValue(date, valid, null)).toEqual({ value: valid, missingReason: null });
    }
    for (const invalid of [
      "2024-01-01suffix",
      "prefix2024-01-01",
      "0000-01-01",
      "2024-00-01",
      "2024-13-01",
      "2024-01-00",
      "1900-02-29",
      "2023-04-31",
    ]) {
      expect(() => validateExtractionValue(date, invalid, null)).toThrow("Extraction value does not match its field type");
    }
    const multiple = extractionField({ id: "choice", label: "Choice", type: "multiple-choice", values: ["a", "b"] });
    for (const invalid of [[], ["a", "b", "c"], ["a", 1], ["unknown"], ["a", "a"]]) {
      expect(() => validateExtractionValue(multiple, invalid, null)).toThrow("Extraction value does not match its field type");
    }
    expect(() => validateExtractionValue({ ...date, type: "text" }, " ", null)).toThrow("Extraction value does not match its field type");
    expect(() => validateExtractionValue({ ...date, type: "text" }, "x".repeat(20_001), null)).toThrow(
      "Extraction value does not match its field type",
    );
    expect(() => validateExtractionValue({ ...date, type: "integer" }, 1.5, null)).toThrow(
      "Extraction value does not match its field type",
    );
    expect(() => validateExtractionValue({ ...date, type: "decimal" }, Number.NaN, null)).toThrow(
      "Extraction value does not match its field type",
    );
  });

  it("rejects every unsafe transport extraction shape", () => {
    expect(parseExtractionValueShape(0)).toBe(0);
    expect(parseExtractionValueShape(["x"])).toEqual(["x"]);
    expect(parseExtractionValueShape(Array.from({ length: 128 }, (_, index) => `value-${index}`))).toHaveLength(128);
    for (const invalid of [
      undefined,
      Number.NaN,
      [],
      Array.from({ length: 129 }, (_, index) => `value-${index}`),
      ["x", 1],
      ["x", "x"],
      { kind: "pdf-annotation", resourceId: "resource", selectorId: "selector", extra: true },
      { kind: "pdf-annotation", resourceId: " ", selectorId: "selector" },
      { kind: "pdf-annotation", resourceId: "resource", selectorId: " " },
    ]) {
      expect(() => parseExtractionValueShape(invalid)).toThrow();
    }
  });

  it("distinguishes legacy pointer fields and exact rationale/value boundaries", () => {
    const pointer = {
      kind: "pdf-annotation" as const,
      resourceId: "r".repeat(128),
      selectorId: "s".repeat(128),
      quote: "q".repeat(20_000),
      page: null,
      location: "l".repeat(1_000),
    };
    const answers = defaultReviewProtocol().qualityAssessment.answers;
    const positive = answers.find((answer) => answer.id === "yes")!;
    const negative = answers.find((answer) => answer.id === "no")!;

    expect(validateQualityAssessment(positive, pointer, "r".repeat(2_000))).toEqual({
      evidence: pointer,
      rationale: "r".repeat(2_000),
    });
    expect(validateQualityAssessment(negative, pointer, "")).toEqual({ evidence: pointer, rationale: "" });
    expect(() => validateQualityAssessment(positive, pointer, "r".repeat(2_001))).toThrow("Quality assessment rationale is invalid");

    for (const partial of [
      { quote: "Evidence", page: null, location: "Results", resourceId: "legacy-unresolved", selectorId: "legacy-unresolved" },
      { quote: "Evidence", page: null, location: "Results", kind: "legacy-unresolved", selectorId: "legacy-unresolved" },
      { quote: "Evidence", page: null, location: "Results", kind: "legacy-unresolved", resourceId: "legacy-unresolved" },
      {
        quote: "Evidence",
        page: null,
        location: "Results",
        kind: "legacy-unresolved",
        resourceId: "different",
        selectorId: "legacy-unresolved",
      },
    ]) {
      expect(() => parseEvidencePointer(partial, true, true)).toThrow("Review source selector value is invalid");
    }

    const text = extractionField({ id: "text", label: "Text", type: "text" });
    expect(validateExtractionValue(text, "x".repeat(20_000), "   ")).toEqual({
      value: "x".repeat(20_000),
      missingReason: null,
    });
    expect(validateExtractionValue(text, null, "m".repeat(2_000))).toEqual({
      value: null,
      missingReason: "m".repeat(2_000),
    });
    expect(
      validateExtractionValue(
        { ...text, type: "source-selector" },
        { kind: "web-passage", resourceId: ` ${"r".repeat(126)} `, selectorId: ` ${"s".repeat(126)} ` },
        null,
      ),
    ).toEqual({
      value: { kind: "web-passage", resourceId: "r".repeat(126), selectorId: "s".repeat(126) },
      missingReason: null,
    });
  });

  it("counts answered questions independently from recognized scoring options", () => {
    const defaults = defaultReviewProtocol();
    const protocol = {
      qualityAssessment: {
        ...defaults.qualityAssessment,
        questions: [{ id: "quality", text: "Quality?" }],
      },
      extractionFields: [],
    };
    const unknownAnswer = {
      id: "value",
      recordId: "record",
      protocolRevision: 1,
      questionId: "quality",
      criterionId: "quality",
      criterionText: "Quality?",
      answerId: "retired-answer",
      evidence: null,
      rationale: "Legacy answer",
      reviewer: "reviewer",
      createdAt: "2026-07-24",
    };

    expect(summarizeEvidenceRecord(evidenceRecord(), protocol, [unknownAnswer], [])).toMatchObject({
      qualityScore: 0,
      qualityRejected: false,
      qualityComplete: true,
      extractionComplete: true,
    });
  });
});

function extractionField(overrides: Partial<ExtractionFieldDefinition> & Pick<ExtractionFieldDefinition, "id" | "label" | "type">) {
  return {
    values: [],
    researchQuestionIds: [],
    requiredness: "required",
    cardinality: "single",
    condition: null,
    ...overrides,
  } satisfies ExtractionFieldDefinition;
}

function evidenceRecord() {
  return {
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
}
