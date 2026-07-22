import {
  legacyOwnerBackupSchemaVersion,
  ownerBackupSchemaVersion,
  projectAssociatedReviewOwnerBackupSchemaVersion,
  type BackupBinaryObject,
  type BackupBinaryReferences,
  type LegacyOwnerBackupState,
  type OwnerBackupState,
  type ParsedOwnerBackupManifest,
  type ProjectAssociatedReviewOwnerBackupState,
} from "./backup-types";
import { canonicalJson } from "./canonical-json";
import { sha256Text } from "./sha256";

export async function ownerBackupDigest(
  state: OwnerBackupState | ProjectAssociatedReviewOwnerBackupState | LegacyOwnerBackupState,
  binaries: readonly BackupBinaryObject[],
  schemaVersion:
    | typeof ownerBackupSchemaVersion
    | typeof projectAssociatedReviewOwnerBackupSchemaVersion
    | typeof legacyOwnerBackupSchemaVersion = ownerBackupSchemaVersion,
): Promise<string> {
  return await sha256Text(
    canonicalJson({
      schemaVersion,
      state,
      binaries: binaries.map(({ sourceKey, sourceEtag, size, backupKey }) => ({ sourceKey, sourceEtag, size, backupKey })),
    }),
  );
}

export async function backupBlobKey(ownerKey: string, sourceKey: string, sourceEtag: string, size: number): Promise<string> {
  const identity = await sha256Text(`${sourceKey}\u0000${sourceEtag}\u0000${size}`);
  return `backups/blobs/${ownerKey}/${identity}`;
}

export function ownerBackupManifestKey(ownerKey: string, createdAt: string, digest: string): string {
  const timestamp = createdAt.replaceAll(/[^0-9]/gu, "").slice(0, 17);
  return `backups/manifests/${ownerKey}/${timestamp}-${digest}.json`;
}

export function ownerBackupManifestJson(manifest: ParsedOwnerBackupManifest): string {
  return `${canonicalJson(manifest)}\n`;
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
