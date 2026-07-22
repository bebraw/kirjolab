import type { ReferenceLibrarySnapshot } from "./reference-library";
import type { ProjectTemplateRecord } from "./project-templates";
import type { ReviewAccessBackupState, ReviewCatalogRecord } from "./review-catalog";
import type { WorkspaceMember, WorkspaceSnapshot, WorkspaceSummary } from "./workspace";
import type { ReviewExportAuthority } from "./review-export";
import type { ReviewBackupReference } from "./review-backup";

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
