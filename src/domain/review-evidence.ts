import {
  defaultReviewProtocol,
  parseReviewProtocolContent,
  type ExtractionFieldDefinition,
  type QualityAnswerOption,
  type ReviewProtocolRevision,
} from "./review-study";
import type { ReviewRecord } from "./review-search";

export type ReviewSourceSelectorKind = "pdf-annotation" | "web-passage";
export type ReviewEvidenceSelectorKind = ReviewSourceSelectorKind | "legacy-unresolved";

export interface ReviewEvidencePointer {
  readonly kind: ReviewEvidenceSelectorKind;
  readonly resourceId: string;
  readonly selectorId: string;
  readonly quote: string;
  readonly page: number | null;
  readonly location: string;
}

export interface QualityAssessmentValue {
  readonly id: string;
  readonly recordId: string;
  readonly protocolRevision: number;
  readonly questionId: string;
  readonly criterionId: string;
  readonly criterionText: string;
  readonly answerId: string;
  readonly evidence: ReviewEvidencePointer | null;
  readonly rationale: string;
  readonly reviewer: string;
  readonly createdAt: string;
}

export function validateQualityAssessment(
  answer: QualityAnswerOption,
  evidence: unknown,
  rationale: unknown,
): { readonly evidence: ReviewEvidencePointer | null; readonly rationale: string } {
  const rationaleValue = typeof rationale === "string" ? rationale.trim() : "";
  if (rationaleValue.length > 2_000) throw new Error("Quality assessment rationale is invalid");
  const positive = answer.weight > 0 && !answer.rejects;
  if (!positive && evidence === null && !rationaleValue)
    throw new Error("Negative quality answers require an absence rationale or evidence");
  const pointer = parseEvidencePointer(evidence, positive);
  if (!positive && pointer === null && !rationaleValue)
    throw new Error("Negative quality answers require an absence rationale or evidence");
  return { evidence: pointer, rationale: rationaleValue };
}

export interface ReviewSourceSelectorValue {
  readonly kind: ReviewSourceSelectorKind;
  readonly resourceId: string;
  readonly selectorId: string;
}

export type ExtractionValue = string | number | boolean | readonly string[] | ReviewSourceSelectorValue | null;

export interface ExtractedDataValue {
  readonly id: string;
  readonly recordId: string;
  readonly protocolRevision: number;
  readonly fieldId: string;
  readonly criterionId: string;
  readonly criterionText: string;
  readonly value: ExtractionValue;
  readonly missingReason: string | null;
  readonly evidence: ReviewEvidencePointer | null;
  readonly reviewer: string;
  readonly createdAt: string;
}

export interface EvidenceRecordState {
  readonly record: ReviewRecord;
  readonly qualityValues: readonly QualityAssessmentValue[];
  readonly qualityScore: number;
  readonly qualityRejected: boolean;
  readonly qualityComplete: boolean;
  readonly extractionValues: readonly ExtractedDataValue[];
  readonly extractionComplete: boolean;
}

export interface ReviewEvidenceSnapshot {
  readonly revision: number;
  readonly protocolRevision: number;
  readonly protocol: Pick<ReviewProtocolRevision, "researchQuestions" | "qualityAssessment" | "extractionFields">;
  readonly records: readonly EvidenceRecordState[];
}

export function parseEvidencePointer(value: unknown, required: boolean, allowLegacy = false): ReviewEvidencePointer | null {
  if (value === null && !required) return null;
  if (!isRecord(value) || typeof value.quote !== "string" || typeof value.location !== "string") {
    throw new Error("Review evidence pointer is invalid");
  }
  const quote = value.quote.trim();
  const location = value.location.trim();
  if (!quote || quote.length > 20_000 || location.length > 1_000) throw new Error("Review evidence pointer is invalid");
  if (
    value.page !== null &&
    (typeof value.page !== "number" || !Number.isSafeInteger(value.page) || value.page < 1 || value.page > 100_000)
  ) {
    throw new Error("Review evidence page is invalid");
  }
  if (value.kind === undefined && value.resourceId === undefined && value.selectorId === undefined && allowLegacy) {
    return {
      kind: "legacy-unresolved",
      resourceId: "legacy-unresolved",
      selectorId: "legacy-unresolved",
      quote,
      page: value.page,
      location,
    };
  }
  if (
    allowLegacy &&
    value.kind === "legacy-unresolved" &&
    value.resourceId === "legacy-unresolved" &&
    value.selectorId === "legacy-unresolved"
  ) {
    return {
      kind: "legacy-unresolved",
      resourceId: "legacy-unresolved",
      selectorId: "legacy-unresolved",
      quote,
      page: value.page,
      location,
    };
  }
  const selector = parseSourceSelectorValue({ kind: value.kind, resourceId: value.resourceId, selectorId: value.selectorId });
  return { ...selector, quote, page: value.page, location };
}

export function validateExtractionValue(
  field: ExtractionFieldDefinition,
  value: unknown,
  missingReason: unknown,
): {
  value: ExtractionValue;
  missingReason: string | null;
} {
  const reason = typeof missingReason === "string" && missingReason.trim() ? missingReason.trim() : null;
  if (reason && reason.length > 2_000) throw new Error("Extraction missingness reason is invalid");
  if (value === null) {
    if (!reason) throw new Error("Missing extraction values require a reason");
    return { value: null, missingReason: reason };
  }
  if (reason) throw new Error("Present extraction values cannot have a missingness reason");
  if (field.type === "text" && typeof value === "string" && value.trim() && value.length <= 20_000)
    return { value: value.trim(), missingReason: null };
  if (field.type === "integer" && typeof value === "number" && Number.isSafeInteger(value)) return { value, missingReason: null };
  if (field.type === "decimal" && typeof value === "number" && Number.isFinite(value)) return { value, missingReason: null };
  if (field.type === "boolean" && typeof value === "boolean") return { value, missingReason: null };
  if (field.type === "date" && typeof value === "string" && isCalendarDate(value)) return { value, missingReason: null };
  if (field.type === "single-choice" && typeof value === "string" && field.values.includes(value)) {
    return { value, missingReason: null };
  }
  if (
    field.type === "multiple-choice" &&
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= field.values.length &&
    value.every((entry): entry is string => typeof entry === "string" && field.values.includes(entry)) &&
    new Set(value).size === value.length
  ) {
    return { value: [...value], missingReason: null };
  }
  if (field.type === "source-selector") return { value: parseSourceSelectorValue(value), missingReason: null };
  throw new Error("Extraction value does not match its field type");
}

export function parseExtractionValueShape(value: unknown): ExtractionValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 128 &&
    value.every((entry): entry is string => typeof entry === "string") &&
    new Set(value).size === value.length
  ) {
    return [...value];
  }
  if (isRecord(value)) return parseSourceSelectorValue(value);
  throw new Error("Extracted data value is invalid");
}

export function effectiveExtractionValues(
  values: readonly ExtractedDataValue[],
  fields: readonly ExtractionFieldDefinition[],
): ExtractedDataValue[] {
  return fields.flatMap((field) => {
    const matching = values.filter((value) => value.fieldId === field.id);
    if (field.cardinality === "repeatable") return matching;
    return matching.length > 0 ? [matching.at(-1)!] : [];
  });
}

export function summarizeEvidenceRecord(
  record: ReviewRecord,
  protocol: Pick<ReviewProtocolRevision, "qualityAssessment" | "extractionFields">,
  qualityValues: readonly QualityAssessmentValue[],
  extractionValues: readonly ExtractedDataValue[],
): EvidenceRecordState {
  const latestQuality = latestBy(qualityValues, (value) => value.questionId);
  const effectiveExtraction = effectiveExtractionValues(extractionValues, protocol.extractionFields);
  const answerById = new Map(protocol.qualityAssessment.answers.map((answer) => [answer.id, answer] as const));
  const selectedAnswers = latestQuality
    .map((value) => answerById.get(value.answerId))
    .filter((answer): answer is QualityAnswerOption => Boolean(answer));
  return {
    record,
    qualityValues,
    qualityScore: selectedAnswers.reduce((total, answer) => total + answer.weight, 0),
    qualityRejected: selectedAnswers.some((answer) => answer.rejects),
    qualityComplete: protocol.qualityAssessment.questions.every((question) =>
      latestQuality.some((value) => value.questionId === question.id),
    ),
    extractionValues,
    extractionComplete: protocol.extractionFields.every(
      (field) => field.requiredness === "optional" || effectiveExtraction.some((value) => value.fieldId === field.id),
    ),
  };
}

export function parseReviewEvidenceSnapshot(value: unknown): ReviewEvidenceSnapshot {
  if (!isRecord(value) || !isRecord(value.protocol) || !Array.isArray(value.records))
    throw new Error("Review evidence snapshot is invalid");
  const protocolContent = parseReviewProtocolContent({
    ...defaultReviewProtocol(),
    researchQuestions: value.protocol.researchQuestions,
    qualityAssessment: value.protocol.qualityAssessment,
    extractionFields: value.protocol.extractionFields,
  });
  const protocolRevision = integer(value.protocolRevision);
  if (protocolRevision < 1) throw new Error("Review evidence protocol revision is invalid");
  return {
    revision: integer(value.revision),
    protocolRevision,
    protocol: {
      researchQuestions: protocolContent.researchQuestions,
      qualityAssessment: protocolContent.qualityAssessment,
      extractionFields: protocolContent.extractionFields,
    },
    records: value.records.map((item) => parseEvidenceRecordState(item, protocolContent, protocolRevision)),
  };
}

function latestBy<Value>(values: readonly Value[], key: (value: Value) => string): Value[] {
  const latest = new Map<string, Value>();
  for (const value of values) latest.set(key(value), value);
  return [...latest.values()];
}

function parseEvidenceRecordState(
  value: unknown,
  protocol: Pick<ReviewProtocolRevision, "qualityAssessment" | "extractionFields">,
  protocolRevision: number,
): EvidenceRecordState {
  if (
    !isRecord(value) ||
    !isRecord(value.record) ||
    !isRecord(value.record.metadata) ||
    !Array.isArray(value.qualityValues) ||
    !Array.isArray(value.extractionValues)
  ) {
    throw new Error("Review evidence record is invalid");
  }
  const metadata = value.record.metadata;
  if (
    !Array.isArray(metadata.authors) ||
    !metadata.authors.every((author) => typeof author === "string") ||
    !Array.isArray(metadata.warnings) ||
    !metadata.warnings.every((warning) => typeof warning === "string")
  ) {
    throw new Error("Review evidence metadata is invalid");
  }
  const record: ReviewRecord = {
    id: text(value.record.id),
    state: value.record.state === "merged" ? "merged" : "active",
    mergedInto: value.record.mergedInto === null ? null : text(value.record.mergedInto),
    metadata: {
      citationKey: text(metadata.citationKey),
      type: text(metadata.type),
      title: text(metadata.title),
      authors: metadata.authors,
      year: text(metadata.year),
      venue: text(metadata.venue),
      doi: text(metadata.doi),
      url: text(metadata.url),
      abstract: text(metadata.abstract),
      identity: text(metadata.identity),
      warnings: metadata.warnings,
    },
  };
  const questionById = new Map(protocol.qualityAssessment.questions.map((question) => [question.id, question] as const));
  const qualityValues = value.qualityValues.map((item) => parseQualityValue(item, protocolRevision, questionById));
  const fieldById = new Map(protocol.extractionFields.map((field) => [field.id, field] as const));
  const extractionValues = value.extractionValues.map((item) => {
    if (!isRecord(item) || typeof item.fieldId !== "string") throw new Error("Extracted data value is invalid");
    const field = fieldById.get(item.fieldId);
    if (!field) throw new Error("Extracted data value references an unavailable field");
    return parseExtractionValue(item, field, protocolRevision);
  });
  return summarizeEvidenceRecord(record, protocol, qualityValues, extractionValues);
}

function parseQualityValue(
  value: unknown,
  protocolRevision: number,
  questionById: ReadonlyMap<string, { readonly id: string; readonly text: string }>,
): QualityAssessmentValue {
  if (!isRecord(value)) throw new Error("Quality assessment value is invalid");
  const questionId = text(value.questionId);
  const question = questionById.get(questionId);
  if (!question) throw new Error("Quality assessment value references an unavailable question");
  return {
    id: text(value.id),
    recordId: text(value.recordId),
    protocolRevision: storedProtocolRevision(value.protocolRevision, protocolRevision),
    questionId,
    criterionId: value.criterionId === undefined ? question.id : text(value.criterionId),
    criterionText: value.criterionText === undefined ? question.text : text(value.criterionText),
    answerId: text(value.answerId),
    evidence: parseEvidencePointer(value.evidence, false, true),
    rationale: text(value.rationale),
    reviewer: text(value.reviewer),
    createdAt: text(value.createdAt),
  };
}

function parseExtractionValue(value: unknown, field: ExtractionFieldDefinition, protocolRevision: number): ExtractedDataValue {
  if (!isRecord(value) || (value.missingReason !== null && typeof value.missingReason !== "string")) {
    throw new Error("Extracted data value is invalid");
  }
  const validated = validateExtractionValue(field, value.value, value.missingReason);
  return {
    id: text(value.id),
    recordId: text(value.recordId),
    protocolRevision: storedProtocolRevision(value.protocolRevision, protocolRevision),
    fieldId: field.id,
    criterionId: value.criterionId === undefined ? field.id : text(value.criterionId),
    criterionText: value.criterionText === undefined ? field.label : text(value.criterionText),
    value: validated.value,
    missingReason: validated.missingReason,
    evidence: parseEvidencePointer(value.evidence, false, true),
    reviewer: text(value.reviewer),
    createdAt: text(value.createdAt),
  };
}

function storedProtocolRevision(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const revision = integer(value);
  if (revision < 1) throw new Error("Review evidence protocol revision is invalid");
  return revision;
}

function parseSourceSelectorValue(value: unknown): ReviewSourceSelectorValue {
  if (
    !isRecord(value) ||
    (value.kind !== "pdf-annotation" && value.kind !== "web-passage") ||
    typeof value.resourceId !== "string" ||
    !value.resourceId.trim() ||
    value.resourceId.length > 128 ||
    typeof value.selectorId !== "string" ||
    !value.selectorId.trim() ||
    value.selectorId.length > 128 ||
    Object.keys(value).some((key) => key !== "kind" && key !== "resourceId" && key !== "selectorId")
  ) {
    throw new Error("Review source selector value is invalid");
  }
  return { kind: value.kind, resourceId: value.resourceId.trim(), selectorId: value.selectorId.trim() };
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= monthLengths[month - 1]!;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Review evidence revision is invalid");
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Review evidence text is invalid");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
