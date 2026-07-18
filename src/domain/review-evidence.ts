import {
  defaultReviewProtocol,
  parseReviewProtocolContent,
  type ExtractionFieldDefinition,
  type QualityAnswerOption,
  type ReviewProtocolRevision,
} from "./review-study";
import type { ReviewRecord } from "./review-search";

export interface ReviewEvidencePointer {
  readonly quote: string;
  readonly page: number | null;
  readonly location: string;
}

export interface QualityAssessmentValue {
  readonly id: string;
  readonly recordId: string;
  readonly questionId: string;
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

export type ExtractionValue = string | number | boolean | null;

export interface ExtractedDataValue {
  readonly id: string;
  readonly recordId: string;
  readonly fieldId: string;
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

export function parseEvidencePointer(value: unknown, required: boolean): ReviewEvidencePointer | null {
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
  return { quote, page: value.page, location };
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
  if (field.type === "string" && typeof value === "string" && value.trim() && value.length <= 20_000)
    return { value: value.trim(), missingReason: null };
  if (field.type === "integer" && typeof value === "number" && Number.isSafeInteger(value)) return { value, missingReason: null };
  if (field.type === "boolean" && typeof value === "boolean") return { value, missingReason: null };
  if (field.type === "enum" && typeof value === "string" && field.values.includes(value)) return { value, missingReason: null };
  throw new Error("Extraction value does not match its field type");
}

export function summarizeEvidenceRecord(
  record: ReviewRecord,
  protocol: Pick<ReviewProtocolRevision, "qualityAssessment" | "extractionFields">,
  qualityValues: readonly QualityAssessmentValue[],
  extractionValues: readonly ExtractedDataValue[],
): EvidenceRecordState {
  const latestQuality = latestBy(qualityValues, (value) => value.questionId);
  const latestExtraction = latestBy(extractionValues, (value) => value.fieldId);
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
    extractionComplete: protocol.extractionFields.every((field) => latestExtraction.some((value) => value.fieldId === field.id)),
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
  return {
    revision: integer(value.revision),
    protocolRevision: integer(value.protocolRevision),
    protocol: {
      researchQuestions: protocolContent.researchQuestions,
      qualityAssessment: protocolContent.qualityAssessment,
      extractionFields: protocolContent.extractionFields,
    },
    records: value.records.map((item) => parseEvidenceRecordState(item, protocolContent)),
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
  const qualityValues = value.qualityValues.map(parseQualityValue);
  const extractionValues = value.extractionValues.map(parseExtractionValue);
  return summarizeEvidenceRecord(record, protocol, qualityValues, extractionValues);
}

function parseQualityValue(value: unknown): QualityAssessmentValue {
  if (!isRecord(value)) throw new Error("Quality assessment value is invalid");
  return {
    id: text(value.id),
    recordId: text(value.recordId),
    questionId: text(value.questionId),
    answerId: text(value.answerId),
    evidence: parseEvidencePointer(value.evidence, false),
    rationale: text(value.rationale),
    reviewer: text(value.reviewer),
    createdAt: text(value.createdAt),
  };
}

function parseExtractionValue(value: unknown): ExtractedDataValue {
  if (
    !isRecord(value) ||
    (value.value !== null && typeof value.value !== "string" && typeof value.value !== "number" && typeof value.value !== "boolean") ||
    (value.missingReason !== null && typeof value.missingReason !== "string")
  ) {
    throw new Error("Extracted data value is invalid");
  }
  return {
    id: text(value.id),
    recordId: text(value.recordId),
    fieldId: text(value.fieldId),
    value: value.value,
    missingReason: value.missingReason,
    evidence: parseEvidencePointer(value.evidence, false),
    reviewer: text(value.reviewer),
    createdAt: text(value.createdAt),
  };
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
