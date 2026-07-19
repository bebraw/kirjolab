import type { ReferenceLibrarySnapshot } from "./reference-library";
import type { ProjectTemplateRecord } from "./project-templates";
import {
  isIsoTimestamp,
  isReviewId,
  isReviewProfile,
  isReviewRole,
  isReviewStorageKey,
  isWorkspaceRouteId,
  reviewResourceLimits,
  type ReviewAccessBackupState,
  type ReviewCatalogRecord,
} from "./review-catalog";
import type { WorkspaceMember, WorkspaceSnapshot, WorkspaceSummary } from "./workspace";
import type { ReviewExportAuthority } from "./review-export";
import { parseReviewBackupReference, type ReviewBackupReference } from "./review-backup";

export const ownerBackupSchemaVersion = "kirjolab-owner-backup-v3" as const;
export const projectAssociatedReviewOwnerBackupSchemaVersion = "kirjolab-owner-backup-v2" as const;
export const legacyOwnerBackupSchemaVersion = "kirjolab-owner-backup-v1" as const;
export const maximumOwnerBackupBytes = 10 * 1024 * 1024;

export interface OwnerWorkspaceBackup {
  readonly summary: WorkspaceSummary;
  readonly members: readonly WorkspaceMember[];
  readonly snapshot: WorkspaceSnapshot;
  readonly revisionSeed: string;
}

export interface OwnerReviewBackup {
  readonly catalogRecord: ReviewCatalogRecord;
  readonly access: ReviewAccessBackupState;
  readonly reviewPayload: ReviewBackupReference | null;
  readonly reviewRevisionSeed: string | null;
}

export interface OwnerBackupState {
  readonly ownerKey: string;
  readonly catalog: readonly WorkspaceSummary[];
  readonly library: ReferenceLibrarySnapshot;
  readonly templates?: readonly ProjectTemplateRecord[];
  readonly workspaces: readonly OwnerWorkspaceBackup[];
  readonly reviews: readonly OwnerReviewBackup[];
}

export interface ProjectAssociatedReviewOwnerWorkspaceBackup {
  readonly summary: WorkspaceSummary;
  readonly members: readonly WorkspaceMember[];
  readonly snapshot: WorkspaceSnapshot;
  readonly revisionSeed: string;
  readonly reviewPayload: ReviewBackupReference | null;
  readonly reviewRevisionSeed: string | null;
}

export interface ProjectAssociatedReviewOwnerBackupState {
  readonly ownerKey: string;
  readonly catalog: readonly WorkspaceSummary[];
  readonly library: ReferenceLibrarySnapshot;
  readonly templates?: readonly ProjectTemplateRecord[];
  readonly workspaces: readonly ProjectAssociatedReviewOwnerWorkspaceBackup[];
}

export interface LegacyOwnerWorkspaceBackup {
  readonly summary: WorkspaceSummary;
  readonly members: readonly WorkspaceMember[];
  readonly snapshot: WorkspaceSnapshot;
  readonly revisionSeed: string;
  readonly review?: ReviewExportAuthority | null;
  readonly reviewRevisionSeed?: string | null;
}

export interface LegacyOwnerBackupState {
  readonly ownerKey: string;
  readonly catalog: readonly WorkspaceSummary[];
  readonly library: ReferenceLibrarySnapshot;
  readonly templates?: readonly ProjectTemplateRecord[];
  readonly workspaces: readonly LegacyOwnerWorkspaceBackup[];
}

export interface BackupBinaryObject {
  readonly sourceKey: string;
  readonly sourceEtag: string;
  readonly size: number;
  readonly uploadedAt: string;
  readonly backupKey: string;
}

export interface OwnerBackupRecovery {
  readonly catalog: string | null;
  readonly library: string | null;
  readonly templates?: string | null;
  readonly workspaces: readonly {
    readonly workspaceId: string;
    readonly access: string | null;
    readonly document: string | null;
    readonly review?: string | null;
  }[];
  readonly reviewCatalog?: string | null;
  readonly reviews?: readonly {
    readonly reviewId: string;
    readonly access: string | null;
    readonly study: string | null;
  }[];
}

export interface OwnerBackupManifest {
  readonly schemaVersion: typeof ownerBackupSchemaVersion;
  readonly createdAt: string;
  readonly digest: string;
  readonly state: OwnerBackupState;
  readonly binaries: readonly BackupBinaryObject[];
  readonly recovery: OwnerBackupRecovery;
}

export interface ProjectAssociatedReviewOwnerBackupManifest {
  readonly schemaVersion: typeof projectAssociatedReviewOwnerBackupSchemaVersion;
  readonly createdAt: string;
  readonly digest: string;
  readonly state: ProjectAssociatedReviewOwnerBackupState;
  readonly binaries: readonly BackupBinaryObject[];
  readonly recovery: OwnerBackupRecovery;
}

export interface LegacyOwnerBackupManifest {
  readonly schemaVersion: typeof legacyOwnerBackupSchemaVersion;
  readonly createdAt: string;
  readonly digest: string;
  readonly state: LegacyOwnerBackupState;
  readonly binaries: readonly BackupBinaryObject[];
  readonly recovery: OwnerBackupRecovery;
}

export type ParsedOwnerBackupManifest = OwnerBackupManifest | ProjectAssociatedReviewOwnerBackupManifest | LegacyOwnerBackupManifest;

export interface OwnerBackupStatus {
  readonly ownerKey: string;
  readonly outcome: "never" | "created" | "unchanged" | "failed";
  readonly digest: string | null;
  readonly manifestKey: string | null;
  readonly lastCheckedAt: string | null;
  readonly lastBackedUpAt: string | null;
  readonly error: string | null;
}

export interface OwnerBackupDrillStatus {
  readonly ownerKey: string;
  readonly outcome: "never" | "verified" | "failed";
  readonly digest: string | null;
  readonly manifestKey: string | null;
  readonly recoveryIdentity: string | null;
  readonly checkedAt: string | null;
  readonly binariesChecked: number;
  readonly reviewsChecked: number;
  readonly error: string | null;
}

export interface BackupBinaryReferences {
  readonly library: {
    readonly artifacts: readonly { readonly objectKey: string }[];
    readonly webSnapshots: readonly {
      readonly rawObjectKey: string | null;
      readonly readableObjectKey: string | null;
    }[];
  };
  readonly workspaces: readonly {
    readonly snapshot: {
      readonly pdfs: readonly { readonly objectKey: string }[];
      readonly assets?: readonly { readonly objectKey: string }[];
    };
  }[];
}

export async function ownerBackupDigest(
  state: OwnerBackupState | ProjectAssociatedReviewOwnerBackupState | LegacyOwnerBackupState,
  binaries: readonly BackupBinaryObject[],
  schemaVersion:
    | typeof ownerBackupSchemaVersion
    | typeof projectAssociatedReviewOwnerBackupSchemaVersion
    | typeof legacyOwnerBackupSchemaVersion = ownerBackupSchemaVersion,
): Promise<string> {
  return await sha256Hex(
    canonicalJson({
      schemaVersion,
      state,
      binaries: binaries.map(({ sourceKey, sourceEtag, size, backupKey }) => ({ sourceKey, sourceEtag, size, backupKey })),
    }),
  );
}

export async function backupBlobKey(ownerKey: string, sourceKey: string, sourceEtag: string, size: number): Promise<string> {
  const identity = await sha256Hex(`${sourceKey}\u0000${sourceEtag}\u0000${size}`);
  return `backups/blobs/${ownerKey}/${identity}`;
}

export function ownerBackupManifestKey(ownerKey: string, createdAt: string, digest: string): string {
  const timestamp = createdAt.replaceAll(/[^0-9]/gu, "").slice(0, 17);
  return `backups/manifests/${ownerKey}/${timestamp}-${digest}.json`;
}

export function ownerBackupManifestJson(manifest: ParsedOwnerBackupManifest): string {
  return `${canonicalJson(manifest)}\n`;
}

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

export function referencedBinaryKeys(state: BackupBinaryReferences): string[] {
  const keys = new Set<string>();
  for (const artifact of state.library.artifacts) keys.add(artifact.objectKey);
  for (const snapshot of state.library.webSnapshots) {
    if (snapshot.rawObjectKey) keys.add(snapshot.rawObjectKey);
    if (snapshot.readableObjectKey) keys.add(snapshot.readableObjectKey);
  }
  for (const workspace of state.workspaces) {
    for (const pdf of workspace.snapshot.pdfs) keys.add(pdf.objectKey);
    for (const asset of workspace.snapshot.assets ?? []) keys.add(asset.objectKey);
  }
  return [...keys].sort();
}

export function isOwnedBinaryKey(ownerKey: string, workspaceIds: readonly string[], value: string): boolean {
  if (!value || value.startsWith("/") || value.includes("\\") || value.split("/").some((segment) => segment === "..")) return false;
  if (value.startsWith(`libraries/${ownerKey}/`)) return true;
  return workspaceIds.some((workspaceId) => value.startsWith(`${workspaceId}/`) || value.startsWith(`${ownerKey}:${workspaceId}/`));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]),
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
  if (value.catalogRecord.role !== "owner" || value.access.deletedAt !== null) return false;
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
  if (!isRecord(value) || !isRecord(value.locator)) return false;
  return (
    typeof value.id === "string" &&
    isReviewId(value.id) &&
    typeof value.title === "string" &&
    value.title === value.title.trim() &&
    value.title.length > 0 &&
    value.title.length <= reviewResourceLimits.titleCharacters &&
    isReviewProfile(value.profile) &&
    value.href === `/review/${value.id}` &&
    isReviewRole(value.role) &&
    typeof value.createdAt === "string" &&
    isIsoTimestamp(value.createdAt) &&
    typeof value.updatedAt === "string" &&
    isIsoTimestamp(value.updatedAt) &&
    (value.archivedAt === null || (typeof value.archivedAt === "string" && isIsoTimestamp(value.archivedAt))) &&
    value.locator.reviewId === value.id &&
    typeof value.locator.storageKey === "string" &&
    isReviewStorageKey(value.locator.storageKey) &&
    (value.locator.legacyWorkspaceId === null ||
      (typeof value.locator.legacyWorkspaceId === "string" && isWorkspaceRouteId(value.locator.legacyWorkspaceId)))
  );
}

function isReviewAccessBackupState(value: unknown, reviewId: string): value is ReviewAccessBackupState {
  if (
    !isRecord(value) ||
    value.reviewId !== reviewId ||
    (value.legacySeededAt !== null && (typeof value.legacySeededAt !== "string" || !isIsoTimestamp(value.legacySeededAt))) ||
    (value.deletedAt !== null && (typeof value.deletedAt !== "string" || !isIsoTimestamp(value.deletedAt))) ||
    !Array.isArray(value.members) ||
    value.members.length > reviewResourceLimits.members ||
    !Array.isArray(value.projectLinks) ||
    value.projectLinks.length > reviewResourceLimits.projectLinks
  ) {
    return false;
  }
  const members = value.members.filter((member): member is Record<string, unknown> => isRecord(member));
  const links = value.projectLinks.filter((link): link is Record<string, unknown> => isRecord(link));
  if (
    members.length !== value.members.length ||
    links.length !== value.projectLinks.length ||
    !members.every(isReviewBackupMember) ||
    !links.every((link) => isReviewBackupProjectLink(link, reviewId))
  ) {
    return false;
  }
  if (new Set(members.map((member) => member.id)).size !== members.length) return false;
  if (new Set(members.map((member) => member.email)).size !== members.length) return false;
  if (new Set(links.map((link) => link.id)).size !== links.length) return false;
  const activeWorkspaceIds = links.filter((link) => link.status === "active").map((link) => link.workspaceId);
  if (new Set(activeWorkspaceIds).size !== activeWorkspaceIds.length) return false;
  const ownerCount = members.filter((member) => member.role === "owner").length;
  return value.deletedAt === null ? ownerCount === 1 : members.length === 0 && !links.some((link) => link.status === "active");
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
