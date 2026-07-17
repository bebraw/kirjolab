import type { ReferenceLibrarySnapshot } from "./reference-library";
import type { ProjectTemplateRecord } from "./project-templates";
import type { WorkspaceMember, WorkspaceSnapshot, WorkspaceSummary } from "./workspace";
import type { ReviewExportAuthority } from "./review-export";

export const ownerBackupSchemaVersion = "kirjolab-owner-backup-v1" as const;
export const maximumOwnerBackupBytes = 10 * 1024 * 1024;

export interface OwnerWorkspaceBackup {
  readonly summary: WorkspaceSummary;
  readonly members: readonly WorkspaceMember[];
  readonly snapshot: WorkspaceSnapshot;
  readonly revisionSeed: string;
  readonly review?: ReviewExportAuthority | null;
  readonly reviewRevisionSeed?: string | null;
}

export interface OwnerBackupState {
  readonly ownerKey: string;
  readonly catalog: readonly WorkspaceSummary[];
  readonly library: ReferenceLibrarySnapshot;
  readonly templates?: readonly ProjectTemplateRecord[];
  readonly workspaces: readonly OwnerWorkspaceBackup[];
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
}

export interface OwnerBackupManifest {
  readonly schemaVersion: typeof ownerBackupSchemaVersion;
  readonly createdAt: string;
  readonly digest: string;
  readonly state: OwnerBackupState;
  readonly binaries: readonly BackupBinaryObject[];
  readonly recovery: OwnerBackupRecovery;
}

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

export async function ownerBackupDigest(state: OwnerBackupState, binaries: readonly BackupBinaryObject[]): Promise<string> {
  return await sha256Hex(
    canonicalJson({
      schemaVersion: ownerBackupSchemaVersion,
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

export function ownerBackupManifestJson(manifest: OwnerBackupManifest): string {
  return `${canonicalJson(manifest)}\n`;
}

export function parseOwnerBackupManifest(json: string): OwnerBackupManifest {
  if (new TextEncoder().encode(json).byteLength > maximumOwnerBackupBytes) throw new Error("Owner backup manifest exceeds 10 MiB");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("Owner backup manifest is invalid");
  }
  if (!isOwnerBackupManifest(value)) throw new Error("Owner backup manifest is invalid");
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
  if (typeof value.createdAt !== "string" || !isDigest(value.digest)) return false;
  if (
    !isRecord(value.state) ||
    !isDigest(value.state.ownerKey) ||
    !Array.isArray(value.state.catalog) ||
    !Array.isArray(value.state.workspaces)
  ) {
    return false;
  }
  if (!isRecord(value.state.library) || !Array.isArray(value.binaries) || !isRecord(value.recovery)) return false;
  return value.binaries.every(
    (binary) =>
      isRecord(binary) &&
      typeof binary.sourceKey === "string" &&
      typeof binary.sourceEtag === "string" &&
      Number.isSafeInteger(binary.size) &&
      Number(binary.size) >= 0 &&
      typeof binary.uploadedAt === "string" &&
      typeof binary.backupKey === "string",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}
