import { reviewAuthorityJson, type ReviewExportAuthority } from "./review-export";
import { canonicalJson } from "./canonical-json";
import { isSha256Hex, sha256Text } from "./sha256";
import { compareText } from "./text-order";
import { assertReviewBackupPayloadByteCount, maximumReviewBackupPayloadBytes } from "./review-backup-limits";

export { maximumReviewBackupPayloadBytes } from "./review-backup-limits";

export const reviewBackupSchemaVersion = "kirjolab-review-backup-v1" as const;

export const reviewBackupTableNames = [
  "protocol_revisions",
  "search_runs",
  "review_import_batches",
  "review_records",
  "review_record_duplicate_keys",
  "imported_occurrences",
  "duplicate_candidates",
  "screening_decisions",
  "screening_adjudications",
  "final_inclusion_decisions",
  "review_reassessment_obligations",
  "quality_assessment_values",
  "extracted_data_values",
  "review_model_candidates",
  "review_findings",
] as const;

export type ReviewBackupTableName = (typeof reviewBackupTableNames)[number];
export type ReviewBackupCell = string | number | null;
export type ReviewBackupRow = Readonly<Record<string, ReviewBackupCell>>;

export interface ReviewBackupTable {
  readonly name: ReviewBackupTableName;
  readonly rows: readonly ReviewBackupRow[];
}

export interface ReviewStudyBackupPayload {
  readonly schemaVersion: typeof reviewBackupSchemaVersion;
  readonly reviewRevision: number;
  readonly protocolRevision: number;
  readonly historyFloorRevision: number;
  readonly tables: readonly ReviewBackupTable[];
}

export interface ReviewBackupReference {
  readonly schemaVersion: typeof reviewBackupSchemaVersion;
  readonly backupKey: string;
  readonly byteCount: number;
  readonly payloadDigest: string;
  readonly authorityDigest: string;
  readonly reviewRevision: number;
  readonly protocolRevision: number;
  readonly historyFloorRevision: number;
}

export interface ReviewBackupVerification {
  readonly payloadDigest: string;
  readonly authorityDigest: string;
  readonly reviewRevision: number;
  readonly protocolRevision: number;
  readonly historyFloorRevision: number;
}

export interface ReviewBackupArtifact {
  readonly body: string;
  readonly reference: ReviewBackupReference;
}

export function reviewBackupPayloadJson(payload: ReviewStudyBackupPayload): string {
  const normalized = normalizedPayload(payload);
  const body = `${canonicalJson(normalized)}\n`;
  assertReviewBackupPayloadByteCount(new TextEncoder().encode(body).byteLength);
  return body;
}

export function parseReviewBackupPayload(json: string): ReviewStudyBackupPayload {
  assertReviewBackupPayloadByteCount(new TextEncoder().encode(json).byteLength);
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("Review backup payload is invalid");
  }
  if (!isReviewBackupPayload(value)) throw new Error("Review backup payload is invalid");
  return normalizedPayload(value);
}

export function parseReviewBackupReference(value: unknown, ownerKey?: string): ReviewBackupReference {
  if (!isReviewBackupReference(value)) throw new Error("Review backup reference is invalid");
  if (ownerKey !== undefined && value.backupKey !== reviewBackupPayloadKey(ownerKey, value.payloadDigest)) {
    throw new Error("Review backup reference is outside owner scope");
  }
  return value;
}

export async function verifyReviewBackupPayload(
  ownerKey: string,
  referenceValue: unknown,
  body: string,
): Promise<ReviewStudyBackupPayload> {
  const reference = parseReviewBackupReference(referenceValue, ownerKey);
  if (new TextEncoder().encode(body).byteLength !== reference.byteCount) {
    throw new Error("Review backup payload byte count does not match reference");
  }
  if ((await sha256Text(body)) !== reference.payloadDigest) {
    throw new Error("Review backup payload digest does not match reference");
  }
  const payload = parseReviewBackupPayload(body);
  if (reviewBackupPayloadJson(payload) !== body) throw new Error("Review backup payload is not canonical");
  if (
    payload.reviewRevision !== reference.reviewRevision ||
    payload.protocolRevision !== reference.protocolRevision ||
    payload.historyFloorRevision !== reference.historyFloorRevision
  ) {
    throw new Error("Review backup payload revisions do not match reference");
  }
  return payload;
}

export async function reviewBackupPayloadDigest(payload: ReviewStudyBackupPayload): Promise<string> {
  return await sha256Text(reviewBackupPayloadJson(payload));
}

export async function reviewBackupAuthorityDigest(authority: ReviewExportAuthority): Promise<string> {
  return await sha256Text(reviewAuthorityJson(authority));
}

export async function materializeReviewBackupArtifact(
  ownerKey: string,
  payload: ReviewStudyBackupPayload,
  authority: ReviewExportAuthority,
): Promise<ReviewBackupArtifact> {
  if (
    authority.revision !== payload.reviewRevision ||
    authority.protocol.revision !== payload.reviewRevision ||
    authority.protocol.protocol.revision !== payload.protocolRevision
  ) {
    throw new Error("Review backup authority does not match payload revisions");
  }
  const body = reviewBackupPayloadJson(payload);
  const [payloadDigest, authorityDigest] = await Promise.all([sha256Text(body), reviewBackupAuthorityDigest(authority)]);
  return {
    body,
    reference: {
      schemaVersion: reviewBackupSchemaVersion,
      backupKey: reviewBackupPayloadKey(ownerKey, payloadDigest),
      byteCount: new TextEncoder().encode(body).byteLength,
      payloadDigest,
      authorityDigest,
      reviewRevision: payload.reviewRevision,
      protocolRevision: payload.protocolRevision,
      historyFloorRevision: payload.historyFloorRevision,
    },
  };
}

export function reviewBackupPayloadKey(ownerKeyValue: string, payloadDigestValue: string): string {
  const ownerKey = normalizedDigest(ownerKeyValue, "Review backup owner key");
  const payloadDigest = normalizedDigest(payloadDigestValue, "Review backup payload digest");
  return `backups/reviews/${ownerKey}/${payloadDigest}.json`;
}

function normalizedPayload(payload: ReviewStudyBackupPayload): ReviewStudyBackupPayload {
  if (!isReviewBackupPayload(payload)) throw new Error("Review backup payload is invalid");
  return {
    schemaVersion: reviewBackupSchemaVersion,
    reviewRevision: payload.reviewRevision,
    protocolRevision: payload.protocolRevision,
    historyFloorRevision: payload.historyFloorRevision,
    tables: [...payload.tables]
      .map((table) => ({
        name: table.name,
        rows: [...table.rows].map((row) => ({ ...row })).sort((left, right) => compareText(canonicalJson(left), canonicalJson(right))),
      }))
      .sort((left, right) => compareText(left.name, right.name)),
  };
}

function isReviewBackupPayload(value: unknown): value is ReviewStudyBackupPayload {
  if (
    !isRecord(value) ||
    value.schemaVersion !== reviewBackupSchemaVersion ||
    !integerAtLeast(value.reviewRevision, 1) ||
    !integerAtLeast(value.protocolRevision, 1) ||
    Number(value.protocolRevision) > Number(value.reviewRevision) ||
    !integerAtLeast(value.historyFloorRevision, 0) ||
    Number(value.historyFloorRevision) > Number(value.reviewRevision) ||
    !Array.isArray(value.tables)
  ) {
    return false;
  }
  const seenNames = new Set<ReviewBackupTableName>();
  for (const table of value.tables) {
    if (!isRecord(table) || !isReviewBackupTableName(table.name) || seenNames.has(table.name) || !Array.isArray(table.rows)) return false;
    if (!table.rows.every(isReviewBackupRow)) return false;
    seenNames.add(table.name);
  }
  return seenNames.size === reviewBackupTableNames.length;
}

function isReviewBackupReference(value: unknown): value is ReviewBackupReference {
  return (
    isRecord(value) &&
    value.schemaVersion === reviewBackupSchemaVersion &&
    typeof value.backupKey === "string" &&
    value.backupKey.length <= 1_024 &&
    integerAtLeast(value.byteCount, 1) &&
    Number(value.byteCount) <= maximumReviewBackupPayloadBytes &&
    isSha256Hex(value.payloadDigest) &&
    isSha256Hex(value.authorityDigest) &&
    integerAtLeast(value.reviewRevision, 1) &&
    integerAtLeast(value.protocolRevision, 1) &&
    Number(value.protocolRevision) <= Number(value.reviewRevision) &&
    integerAtLeast(value.historyFloorRevision, 0) &&
    Number(value.historyFloorRevision) <= Number(value.reviewRevision)
  );
}

function isReviewBackupRow(value: unknown): value is ReviewBackupRow {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    entries.every(([key, cell]) => /^[a-z][a-z0-9_]*$/u.test(key) && (cell === null || typeof cell === "string" || Number.isFinite(cell)))
  );
}

function isReviewBackupTableName(value: unknown): value is ReviewBackupTableName {
  return typeof value === "string" && (reviewBackupTableNames as readonly string[]).includes(value);
}

function normalizedDigest(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!isSha256Hex(normalized)) throw new Error(`${label} is invalid`);
  return normalized;
}

function integerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
