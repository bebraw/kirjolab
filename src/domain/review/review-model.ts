import * as v from "valibot";
import {
  parseEvidencePointer,
  parseExtractionValueShape,
  validateExtractionValue,
  type ExtractionValue,
  type ReviewEvidencePointer,
} from "./review-evidence";
import type { ExtractionFieldDefinition } from "./review-study";
import type { ScreeningDecisionValue } from "./review-screening";
import { isRecord } from "../unknown-value";

const reviewModelOperationSchema = v.picklist(["screen-record", "extract-field"]);
const reviewModelDispositionSchema = v.picklist(["pending", "accepted", "rejected"]);
const screeningStageSchema = v.nullable(v.picklist(["title-abstract", "full-text"]));
const reviewModelCandidateEnvelopeSchema = v.object({
  id: v.string(),
  operation: reviewModelOperationSchema,
  recordId: v.string(),
  stage: screeningStageSchema,
  provider: v.string(),
  model: v.string(),
  promptTemplateVersion: v.string(),
  sourceScope: v.array(v.string()),
  result: v.unknown(),
  createdAt: v.string(),
  createdBy: v.string(),
  disposition: reviewModelDispositionSchema,
  disposedAt: v.nullable(v.string()),
  disposedBy: v.nullable(v.string()),
});
const reviewModelSnapshotEnvelopeSchema = v.object({
  revision: v.pipe(v.number(), v.safeInteger()),
  candidates: v.array(v.unknown()),
});
const reviewModelCandidateRequestSchema = v.object({
  expectedRevision: v.pipe(v.number(), v.safeInteger()),
  operation: reviewModelOperationSchema,
  recordId: v.string(),
  stage: screeningStageSchema,
  provider: v.string(),
  model: v.string(),
  promptTemplateVersion: v.string(),
  sourceScope: v.array(v.string()),
  result: v.unknown(),
});
const screeningModelResultEnvelopeSchema = v.object({
  decision: v.picklist(["include", "exclude", "uncertain"]),
  criterion: v.unknown(),
  rationale: v.unknown(),
  evidence: v.unknown(),
});
const storedExtractionEnvelopeSchema = v.object({
  fieldId: v.string(),
  value: v.unknown(),
  missingReason: v.nullable(v.string()),
  evidence: v.unknown(),
  rationale: v.string(),
});

export type ReviewModelOperation = v.InferOutput<typeof reviewModelOperationSchema>;

export interface ScreeningModelResult {
  readonly decision: ScreeningDecisionValue;
  readonly criterion: string;
  readonly rationale: string;
  readonly evidence: string;
}

export interface ExtractionModelResult {
  readonly fieldId: string;
  readonly value: ExtractionValue | null;
  readonly missingReason: string | null;
  readonly evidence: ReviewEvidencePointer | null;
  readonly rationale: string;
}

type ReviewModelCandidateEnvelope = v.InferOutput<typeof reviewModelCandidateEnvelopeSchema>;

export type ReviewModelCandidate = Readonly<Omit<ReviewModelCandidateEnvelope, "result">> & {
  readonly result: ScreeningModelResult | ExtractionModelResult;
};

export interface ReviewModelSnapshot {
  readonly revision: number;
  readonly candidates: readonly ReviewModelCandidate[];
}

export function parseReviewModelSnapshot(value: unknown): ReviewModelSnapshot {
  const parsed = v.safeParse(reviewModelSnapshotEnvelopeSchema, value);
  if (!parsed.success) throw new Error("Review model snapshot is invalid");
  return { revision: parsed.output.revision, candidates: parsed.output.candidates.map(parseCandidate) };
}

export function parseReviewModelCandidateRequest(value: unknown): v.InferOutput<typeof reviewModelCandidateRequestSchema> {
  const parsed = v.safeParse(reviewModelCandidateRequestSchema, value);
  if (!parsed.success) throw new Error("Review model candidate request is invalid");
  return parsed.output;
}

export function parseScreeningModelResult(value: unknown): ScreeningModelResult {
  const parsed = v.safeParse(screeningModelResultEnvelopeSchema, value);
  if (!parsed.success) throw new Error("Screening model result is invalid");
  return {
    decision: parsed.output.decision,
    criterion: bounded(parsed.output.criterion, "Screening criterion", 1_000, true),
    rationale: bounded(parsed.output.rationale, "Screening rationale", 2_000),
    evidence: bounded(parsed.output.evidence, "Screening evidence", 20_000),
  };
}

export function parseExtractionModelResult(
  value: unknown,
  field: ExtractionFieldDefinition,
  allowLegacyEvidence = false,
): ExtractionModelResult {
  if (!isRecord(value) || value.fieldId !== field.id) throw new Error("Extraction model result is invalid");
  const missingReason = value.missingReason === null ? null : bounded(value.missingReason, "Missing reason", 2_000);
  const validated = validateExtractionValue(field, value.value, missingReason);
  const extractionValue = validated.value;
  const evidence = value.evidence === null ? null : parseEvidencePointer(value.evidence, false, allowLegacyEvidence);
  if (extractionValue !== null && !evidence) throw new Error("Extraction candidate value requires exact evidence");
  if (missingReason !== null && evidence) throw new Error("Missing extraction candidate cannot cite invented evidence");
  return {
    fieldId: field.id,
    value: extractionValue,
    missingReason: validated.missingReason,
    evidence,
    rationale: bounded(value.rationale, "Extraction rationale", 2_000),
  };
}

function bounded(value: unknown, label: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > maximum || (!allowEmpty && !value.trim())) throw new Error(`${label} is invalid`);
  return value.trim();
}

function parseCandidate(value: unknown): ReviewModelCandidate {
  const parsed = v.safeParse(reviewModelCandidateEnvelopeSchema, value);
  if (!parsed.success) throw new Error("Review model candidate is invalid");
  const { result: rawResult, ...candidate } = parsed.output;
  const result = candidate.operation === "screen-record" ? parseScreeningModelResult(rawResult) : parseStoredExtraction(rawResult);
  return { ...candidate, result };
}

function parseStoredExtraction(value: unknown): ExtractionModelResult {
  const parsed = v.safeParse(storedExtractionEnvelopeSchema, value);
  if (!parsed.success) throw new Error("Review extraction candidate is invalid");
  let extractionValue: ExtractionValue;
  try {
    extractionValue = parseExtractionValueShape(parsed.output.value);
  } catch {
    throw new Error("Review extraction candidate is invalid");
  }
  return {
    fieldId: parsed.output.fieldId,
    value: extractionValue,
    missingReason: parsed.output.missingReason,
    evidence: parsed.output.evidence === null ? null : parseEvidencePointer(parsed.output.evidence, false, true),
    rationale: parsed.output.rationale,
  };
}
