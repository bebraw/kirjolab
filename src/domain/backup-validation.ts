import {
  isIsoTimestamp,
  isReviewId,
  isReviewRole,
  isReviewStorageKey,
  isReviewSummary,
  isWorkspaceRouteId,
  reviewResourceLimits,
  type ReviewAccessBackupState,
  type ReviewCatalogRecord,
} from "./review-catalog";
import { parseReviewBackupReference } from "./review-backup";
import {
  legacyOwnerBackupSchemaVersion,
  maximumOwnerBackupBytes,
  ownerBackupSchemaVersion,
  projectAssociatedReviewOwnerBackupSchemaVersion,
  type BackupBinaryObject,
  type LegacyOwnerBackupManifest,
  type LegacyOwnerBackupState,
  type OwnerBackupManifest,
  type OwnerBackupState,
  type OwnerReviewBackup,
  type ParsedOwnerBackupManifest,
  type ProjectAssociatedReviewOwnerBackupManifest,
  type ProjectAssociatedReviewOwnerBackupState,
} from "./backup-types";

export function parseOwnerBackupManifest(json: string): ParsedOwnerBackupManifest {
  if (new TextEncoder().encode(json).byteLength > maximumOwnerBackupBytes) throw new Error("Owner backup manifest exceeds 10 MiB");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("Owner backup manifest is invalid");
  }
  if (!isOwnerBackupManifest(value) && !isProjectAssociatedReviewOwnerBackupManifest(value) && !isLegacyOwnerBackupManifest(value)) {
    throw new Error("Owner backup manifest is invalid");
  }
  return value;
}

function isOwnerBackupManifest(value: unknown): value is OwnerBackupManifest {
  if (!isRecord(value) || value.schemaVersion !== ownerBackupSchemaVersion) return false;
  if (!isManifestEnvelope(value) || !isOwnerBackupState(value.state)) return false;
  return value.binaries.every(isBackupBinary);
}

function isProjectAssociatedReviewOwnerBackupManifest(value: unknown): value is ProjectAssociatedReviewOwnerBackupManifest {
  if (!isRecord(value) || value.schemaVersion !== projectAssociatedReviewOwnerBackupSchemaVersion) return false;
  if (!isManifestEnvelope(value) || !isProjectAssociatedReviewOwnerBackupState(value.state)) return false;
  return value.binaries.every(isBackupBinary);
}

function isLegacyOwnerBackupManifest(value: unknown): value is LegacyOwnerBackupManifest {
  if (!isRecord(value) || value.schemaVersion !== legacyOwnerBackupSchemaVersion) return false;
  if (!isManifestEnvelope(value) || !isLegacyOwnerBackupState(value.state)) return false;
  return value.binaries.every(isBackupBinary);
}

function isManifestEnvelope(value: Record<string, unknown>): value is Record<string, unknown> & {
  readonly createdAt: string;
  readonly digest: string;
  readonly state: Record<string, unknown>;
  readonly binaries: readonly unknown[];
  readonly recovery: Record<string, unknown>;
} {
  return (
    typeof value.createdAt === "string" &&
    isDigest(value.digest) &&
    isRecord(value.state) &&
    Array.isArray(value.binaries) &&
    isRecord(value.recovery)
  );
}

function isOwnerBackupState(value: Record<string, unknown>): value is Record<string, unknown> & OwnerBackupState {
  if (!isBackupStateEnvelope(value) || !Array.isArray(value.reviews) || value.reviews.length > reviewResourceLimits.catalogEntries) {
    return false;
  }
  if (
    !value.workspaces.every(
      (workspace) =>
        isRecord(workspace) && !("review" in workspace) && !("reviewPayload" in workspace) && !("reviewRevisionSeed" in workspace),
    )
  ) {
    return false;
  }
  const reviews = value.reviews.filter((review): review is Record<string, unknown> => isRecord(review));
  if (reviews.length !== value.reviews.length) return false;
  const ownerReviews = reviews.filter((review): review is Record<string, unknown> & OwnerReviewBackup =>
    isOwnerReviewBackup(review, value.ownerKey),
  );
  if (ownerReviews.length !== reviews.length) return false;
  const ids = ownerReviews.map((review) => review.catalogRecord.id);
  const storageKeys = ownerReviews.map((review) => review.catalogRecord.locator.storageKey);
  const legacyWorkspaceIds = ownerReviews.flatMap((review) => {
    const workspaceId = review.catalogRecord.locator.legacyWorkspaceId;
    return workspaceId === null ? [] : [workspaceId];
  });
  return (
    new Set(ids).size === ids.length &&
    new Set(storageKeys).size === storageKeys.length &&
    new Set(legacyWorkspaceIds).size === legacyWorkspaceIds.length
  );
}

function isProjectAssociatedReviewOwnerBackupState(
  value: Record<string, unknown>,
): value is Record<string, unknown> & ProjectAssociatedReviewOwnerBackupState {
  if (!isBackupStateEnvelope(value)) return false;
  return value.workspaces.every((workspace) => {
    if (
      !isRecord(workspace) ||
      "review" in workspace ||
      !("reviewPayload" in workspace) ||
      !("reviewRevisionSeed" in workspace) ||
      (workspace.reviewRevisionSeed !== null && typeof workspace.reviewRevisionSeed !== "string")
    ) {
      return false;
    }
    if (workspace.reviewPayload === null) return workspace.reviewRevisionSeed === null;
    try {
      const reference = parseReviewBackupReference(workspace.reviewPayload, value.ownerKey);
      const seed = parseReviewRevisionSeed(workspace.reviewRevisionSeed);
      return seed !== null && seed.reviewRevision === reference.reviewRevision && seed.protocolRevision === reference.protocolRevision;
    } catch {
      return false;
    }
  });
}

function isOwnerReviewBackup(value: Record<string, unknown>, ownerKey: string): value is Record<string, unknown> & OwnerReviewBackup {
  if (!isReviewCatalogRecord(value.catalogRecord) || !isReviewAccessBackupState(value.access, value.catalogRecord.id)) return false;
  if (value.catalogRecord.role !== "owner") return false;
  if (value.reviewRevisionSeed !== null && typeof value.reviewRevisionSeed !== "string") return false;
  if (value.reviewPayload === null) return value.reviewRevisionSeed === null;
  try {
    const reference = parseReviewBackupReference(value.reviewPayload, ownerKey);
    const seed = parseReviewRevisionSeed(value.reviewRevisionSeed);
    return seed !== null && seed.reviewRevision === reference.reviewRevision && seed.protocolRevision === reference.protocolRevision;
  } catch {
    return false;
  }
}

function isReviewCatalogRecord(value: unknown): value is ReviewCatalogRecord {
  if (!isRecord(value) || !isRecord(value.locator) || !isReviewSummary(value)) return false;
  return (
    value.locator.reviewId === value.id &&
    typeof value.locator.storageKey === "string" &&
    isReviewStorageKey(value.locator.storageKey) &&
    (value.locator.legacyWorkspaceId === null ||
      (typeof value.locator.legacyWorkspaceId === "string" && isWorkspaceRouteId(value.locator.legacyWorkspaceId)))
  );
}

function isReviewAccessBackupState(value: unknown, reviewId: string): value is ReviewAccessBackupState {
  if (!isReviewAccessEnvelope(value, reviewId)) return false;
  const members = recordList(value.members);
  const links = recordList(value.projectLinks);
  if (!members || !links) return false;
  if (!members.every(isReviewBackupMember) || !links.every((link) => isReviewBackupProjectLink(link, reviewId))) return false;
  if (!hasUniqueValues(members, "id") || !hasUniqueValues(members, "email") || !hasUniqueValues(links, "id")) return false;
  const activeWorkspaceIds = links.filter((link) => link.status === "active").map((link) => link.workspaceId);
  if (new Set(activeWorkspaceIds).size !== activeWorkspaceIds.length) return false;
  return members.filter((member) => member.role === "owner").length === 1;
}

function isReviewAccessEnvelope(
  value: unknown,
  reviewId: string,
): value is Record<string, unknown> & {
  readonly deletedAt: null;
  readonly members: readonly unknown[];
  readonly projectLinks: readonly unknown[];
} {
  return (
    isRecord(value) &&
    value.reviewId === reviewId &&
    (value.legacySeededAt === null || (typeof value.legacySeededAt === "string" && isIsoTimestamp(value.legacySeededAt))) &&
    value.deletedAt === null &&
    Array.isArray(value.members) &&
    value.members.length <= reviewResourceLimits.members &&
    Array.isArray(value.projectLinks) &&
    value.projectLinks.length <= reviewResourceLimits.projectLinks
  );
}

function recordList(values: readonly unknown[]): Record<string, unknown>[] | null {
  const records = values.filter((value): value is Record<string, unknown> => isRecord(value));
  return records.length === values.length ? records : null;
}

function hasUniqueValues(values: readonly Record<string, unknown>[], key: string): boolean {
  return new Set(values.map((value) => value[key])).size === values.length;
}

function isReviewBackupMember(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === "string" &&
    (isReviewId(value.id) || /^[a-f0-9]{32}$/iu.test(value.id)) &&
    typeof value.email === "string" &&
    isNormalizedReviewEmail(value.email) &&
    isReviewRole(value.role) &&
    typeof value.addedAt === "string" &&
    isIsoTimestamp(value.addedAt)
  );
}

function isReviewBackupProjectLink(value: Record<string, unknown>, reviewId: string): boolean {
  if (
    typeof value.id !== "string" ||
    !isReviewId(value.id) ||
    value.reviewId !== reviewId ||
    typeof value.workspaceId !== "string" ||
    !isWorkspaceRouteId(value.workspaceId) ||
    typeof value.createdBy !== "string" ||
    !isNormalizedReviewEmail(value.createdBy) ||
    typeof value.createdAt !== "string" ||
    !isIsoTimestamp(value.createdAt)
  ) {
    return false;
  }
  return value.status === "active"
    ? value.unlinkedAt === null && value.unlinkedBy === null
    : value.status === "unlinked" &&
        typeof value.unlinkedAt === "string" &&
        isIsoTimestamp(value.unlinkedAt) &&
        typeof value.unlinkedBy === "string" &&
        isNormalizedReviewEmail(value.unlinkedBy);
}

function isNormalizedReviewEmail(value: string): boolean {
  return value === value.trim().toLowerCase() && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function isLegacyOwnerBackupState(value: Record<string, unknown>): value is Record<string, unknown> & LegacyOwnerBackupState {
  return isBackupStateEnvelope(value);
}

function isBackupStateEnvelope(value: Record<string, unknown>): value is Record<string, unknown> & {
  readonly ownerKey: string;
  readonly catalog: readonly unknown[];
  readonly library: Record<string, unknown>;
  readonly workspaces: readonly unknown[];
} {
  return isDigest(value.ownerKey) && Array.isArray(value.catalog) && isRecord(value.library) && Array.isArray(value.workspaces);
}

function isBackupBinary(binary: unknown): binary is BackupBinaryObject {
  return (
    isRecord(binary) &&
    typeof binary.sourceKey === "string" &&
    typeof binary.sourceEtag === "string" &&
    Number.isSafeInteger(binary.size) &&
    Number(binary.size) >= 0 &&
    typeof binary.uploadedAt === "string" &&
    typeof binary.backupKey === "string"
  );
}

function parseReviewRevisionSeed(value: unknown): { readonly reviewRevision: number; readonly protocolRevision: number } | null {
  if (typeof value !== "string") return null;
  const match = /^review:([1-9][0-9]*):protocol:([1-9][0-9]*)$/u.exec(value);
  if (!match) return null;
  const reviewRevision = Number(match[1]);
  const protocolRevision = Number(match[2]);
  return Number.isSafeInteger(reviewRevision) && Number.isSafeInteger(protocolRevision) ? { reviewRevision, protocolRevision } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}
