import {
  parseEvidencePointer,
  parseExtractionValueShape,
  validateExtractionValue,
  type ExtractionValue,
  type ReviewEvidencePointer,
} from "./review-evidence";
import type { ExtractionFieldDefinition } from "./review-study";
import type { ScreeningDecisionValue, ScreeningStage } from "./review-screening";

export type ReviewModelOperation = "screen-record" | "extract-field";
export type ReviewModelDisposition = "pending" | "accepted" | "rejected";

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

export interface ReviewModelCandidate {
  readonly id: string;
  readonly operation: ReviewModelOperation;
  readonly recordId: string;
  readonly stage: ScreeningStage | null;
  readonly provider: string;
  readonly model: string;
  readonly promptTemplateVersion: string;
  readonly sourceScope: readonly string[];
  readonly result: ScreeningModelResult | ExtractionModelResult;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly disposition: ReviewModelDisposition;
  readonly disposedAt: string | null;
  readonly disposedBy: string | null;
}

export interface ReviewModelSnapshot {
  readonly revision: number;
  readonly candidates: readonly ReviewModelCandidate[];
}

export function parseReviewModelSnapshot(value: unknown): ReviewModelSnapshot {
  if (!isRecord(value) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || !Array.isArray(value.candidates)) {
    throw new Error("Review model snapshot is invalid");
  }
  return { revision: value.revision, candidates: value.candidates.map(parseCandidate) };
}

export function parseScreeningModelResult(value: unknown): ScreeningModelResult {
  if (!isRecord(value) || (value.decision !== "include" && value.decision !== "exclude" && value.decision !== "uncertain")) {
    throw new Error("Screening model result is invalid");
  }
  return {
    decision: value.decision,
    criterion: bounded(value.criterion, "Screening criterion", 1_000, true),
    rationale: bounded(value.rationale, "Screening rationale", 2_000),
    evidence: bounded(value.evidence, "Screening evidence", 20_000),
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
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.operation !== "screen-record" && value.operation !== "extract-field") ||
    typeof value.recordId !== "string" ||
    (value.stage !== null && value.stage !== "title-abstract" && value.stage !== "full-text") ||
    typeof value.provider !== "string" ||
    typeof value.model !== "string" ||
    typeof value.promptTemplateVersion !== "string" ||
    !Array.isArray(value.sourceScope) ||
    !value.sourceScope.every((entry) => typeof entry === "string") ||
    typeof value.createdAt !== "string" ||
    typeof value.createdBy !== "string" ||
    (value.disposition !== "pending" && value.disposition !== "accepted" && value.disposition !== "rejected") ||
    (value.disposedAt !== null && typeof value.disposedAt !== "string") ||
    (value.disposedBy !== null && typeof value.disposedBy !== "string")
  ) {
    throw new Error("Review model candidate is invalid");
  }
  const result = value.operation === "screen-record" ? parseScreeningModelResult(value.result) : parseStoredExtraction(value.result);
  return {
    id: value.id,
    operation: value.operation,
    recordId: value.recordId,
    stage: value.stage,
    provider: value.provider,
    model: value.model,
    promptTemplateVersion: value.promptTemplateVersion,
    sourceScope: value.sourceScope,
    result,
    createdAt: value.createdAt,
    createdBy: value.createdBy,
    disposition: value.disposition,
    disposedAt: value.disposedAt,
    disposedBy: value.disposedBy,
  };
}

function parseStoredExtraction(value: unknown): ExtractionModelResult {
  if (
    !isRecord(value) ||
    typeof value.fieldId !== "string" ||
    (value.missingReason !== null && typeof value.missingReason !== "string") ||
    typeof value.rationale !== "string"
  ) {
    throw new Error("Review extraction candidate is invalid");
  }
  let extractionValue: ExtractionValue;
  try {
    extractionValue = parseExtractionValueShape(value.value);
  } catch {
    throw new Error("Review extraction candidate is invalid");
  }
  return {
    fieldId: value.fieldId,
    value: extractionValue,
    missingReason: value.missingReason,
    evidence: value.evidence === null ? null : parseEvidencePointer(value.evidence, false, true),
    rationale: value.rationale,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
