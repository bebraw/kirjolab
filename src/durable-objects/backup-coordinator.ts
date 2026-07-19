import { DurableObject } from "cloudflare:workers";
import { ensureLegacyReviewResource, workspaceStorageKey } from "../api/reviews";
import {
  backupBlobKey,
  isOwnedBinaryKey,
  maximumOwnerBackupBytes,
  ownerBackupDigest,
  ownerBackupManifestJson,
  ownerBackupManifestKey,
  ownerBackupSchemaVersion,
  parseOwnerBackupManifest,
  projectAssociatedReviewOwnerBackupSchemaVersion,
  referencedBinaryKeys,
  type BackupBinaryObject,
  type OwnerBackupDrillStatus,
  type OwnerBackupManifest,
  type OwnerBackupRecovery,
  type OwnerBackupState,
  type OwnerBackupStatus,
  type OwnerReviewBackup,
  type OwnerWorkspaceBackup,
} from "../domain/backups";
import { localOwnerId } from "../domain/workspace";
import type { AuthIdentity } from "../security/auth";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";

const maximumOwnersPerRun = 50;
const maximumWorkspacesPerOwner = 200;

const migrations = [
  {
    version: 1,
    name: "create-backup-coordinator",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE backup_owners (
          owner_key TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          registered_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL
        );
        CREATE TABLE backup_status (
          owner_key TEXT PRIMARY KEY REFERENCES backup_owners(owner_key),
          outcome TEXT NOT NULL CHECK (outcome IN ('created', 'unchanged', 'failed')),
          digest TEXT,
          manifest_key TEXT,
          last_checked_at TEXT NOT NULL,
          last_backed_up_at TEXT,
          error TEXT
        );
      `);
      return undefined;
    },
  },
  {
    version: 2,
    name: "record-isolated-recovery-drills",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE backup_drills (
          owner_key TEXT PRIMARY KEY REFERENCES backup_owners(owner_key),
          outcome TEXT NOT NULL CHECK (outcome IN ('verified', 'failed')),
          digest TEXT,
          manifest_key TEXT,
          recovery_identity TEXT,
          checked_at TEXT NOT NULL,
          binaries_checked INTEGER NOT NULL,
          error TEXT
        );
      `);
      return undefined;
    },
  },
  {
    version: 3,
    name: "count-verified-review-recoveries",
    apply(sql): undefined {
      sql.exec("ALTER TABLE backup_drills ADD COLUMN reviews_checked INTEGER NOT NULL DEFAULT 0;");
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];

interface OwnerRow extends Record<string, SqlStorageValue> {
  owner_key: string;
  email: string;
  registered_at: string;
  last_seen_at: string;
}

interface StatusRow extends Record<string, SqlStorageValue> {
  owner_key: string;
  outcome: string;
  digest: string | null;
  manifest_key: string | null;
  last_checked_at: string;
  last_backed_up_at: string | null;
  error: string | null;
}

interface DrillRow extends Record<string, SqlStorageValue> {
  owner_key: string;
  outcome: string;
  digest: string | null;
  manifest_key: string | null;
  recovery_identity: string | null;
  checked_at: string;
  binaries_checked: number;
  reviews_checked: number;
  error: string | null;
}

export interface ScheduledBackupSummary {
  readonly checked: number;
  readonly created: number;
  readonly unchanged: number;
  readonly failed: number;
  readonly truncated: boolean;
}

export class BackupCoordinator extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      runSQLiteMigrations(this.ctx.storage, migrations);
    });
  }

  registerOwner(ownerKeyValue: string, emailValue: string): void {
    const ownerKey = normalizedOwnerKey(ownerKeyValue);
    const email = normalizedEmail(emailValue);
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO backup_owners (owner_key, email, registered_at, last_seen_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(owner_key) DO UPDATE SET email = excluded.email, last_seen_at = excluded.last_seen_at`,
      ownerKey,
      email,
      now,
      now,
    );
  }

  getStatus(ownerKeyValue: string): OwnerBackupStatus {
    const ownerKey = normalizedOwnerKey(ownerKeyValue);
    const row = this.ctx.storage.sql.exec<StatusRow>("SELECT * FROM backup_status WHERE owner_key = ?", ownerKey).toArray()[0];
    return row ? statusFromRow(row) : emptyStatus(ownerKey);
  }

  getRecoveryDrillStatus(ownerKeyValue: string): OwnerBackupDrillStatus {
    const ownerKey = normalizedOwnerKey(ownerKeyValue);
    const row = this.ctx.storage.sql.exec<DrillRow>("SELECT * FROM backup_drills WHERE owner_key = ?", ownerKey).toArray()[0];
    return row ? drillStatusFromRow(row) : emptyDrillStatus(ownerKey);
  }

  async runRecoveryDrill(ownerKeyValue: string): Promise<OwnerBackupDrillStatus> {
    const ownerKey = normalizedOwnerKey(ownerKeyValue);
    const checkedAt = new Date().toISOString();
    const backup = this.getStatus(ownerKey);
    let binariesChecked = 0;
    let reviewsChecked = 0;
    try {
      if (!backup.manifestKey || !backup.digest) throw new Error("No successful backup is available");
      const manifestObject = await this.env.PAPERS.get(backup.manifestKey);
      if (!manifestObject) throw new Error("The latest backup manifest is unavailable");
      if (manifestObject.size > maximumOwnerBackupBytes) throw new Error("Owner backup manifest exceeds 10 MiB");
      const manifestJson = await manifestObject.text();
      const manifest = parseOwnerBackupManifest(manifestJson);
      if (manifest.state.ownerKey !== ownerKey || manifest.digest !== backup.digest)
        throw new Error("Backup manifest identity does not match status");
      if ((await ownerBackupDigest(manifest.state, manifest.binaries, manifest.schemaVersion)) !== manifest.digest)
        throw new Error("Backup manifest digest verification failed");

      for (const binary of manifest.binaries) {
        const expectedKey = await backupBlobKey(ownerKey, binary.sourceKey, binary.sourceEtag, binary.size);
        if (binary.backupKey !== expectedKey) throw new Error("Backup binary identity verification failed");
        const object = await this.env.PAPERS.head(binary.backupKey);
        if (!object || object.size !== binary.size) throw new Error("A backup binary is unavailable or has the wrong size");
        binariesChecked += 1;
      }

      const recoveryIdentity = `drill:${ownerKey}:${manifest.digest}`;
      const recovery = this.env.BACKUP_RECOVERIES.getByName(recoveryIdentity);
      await recovery.restoreManifest(manifestJson);
      const restoredJson = await recovery.getRestoredManifest();
      if (!restoredJson) throw new Error("Recovered logical state is unavailable");
      const restored = parseOwnerBackupManifest(restoredJson);
      if ((await ownerBackupDigest(restored.state, restored.binaries, restored.schemaVersion)) !== manifest.digest) {
        throw new Error("Recovered logical state digest verification failed");
      }
      reviewsChecked = (await recovery.getRestoredReviewStudies()).length;
      const expectedReviews =
        manifest.schemaVersion === ownerBackupSchemaVersion
          ? manifest.state.reviews.filter((review) => review.reviewPayload !== null).length
          : manifest.schemaVersion === projectAssociatedReviewOwnerBackupSchemaVersion
            ? manifest.state.workspaces.filter((workspace) => workspace.reviewPayload !== null).length
            : 0;
      if (reviewsChecked !== expectedReviews) throw new Error("Recovered review study count verification failed");
      this.#recordDrill(
        ownerKey,
        "verified",
        manifest.digest,
        backup.manifestKey,
        recoveryIdentity,
        checkedAt,
        binariesChecked,
        reviewsChecked,
        null,
      );
    } catch (error) {
      this.#recordDrill(
        ownerKey,
        "failed",
        backup.digest,
        backup.manifestKey,
        null,
        checkedAt,
        binariesChecked,
        reviewsChecked,
        backupError(error),
      );
    }
    return this.getRecoveryDrillStatus(ownerKey);
  }

  async runOwnerBackup(ownerKeyValue: string, emailValue: string): Promise<OwnerBackupStatus> {
    const ownerKey = normalizedOwnerKey(ownerKeyValue);
    const email = normalizedEmail(emailValue);
    this.registerOwner(ownerKey, email);
    return await this.#backupOwner({
      owner_key: ownerKey,
      email,
      registered_at: "",
      last_seen_at: "",
    });
  }

  async runScheduledBackups(): Promise<ScheduledBackupSummary> {
    const owners = this.ctx.storage.sql
      .exec<OwnerRow>("SELECT * FROM backup_owners ORDER BY owner_key LIMIT ?", maximumOwnersPerRun + 1)
      .toArray();
    const summary = { checked: 0, created: 0, unchanged: 0, failed: 0, truncated: owners.length > maximumOwnersPerRun };
    for (const owner of owners.slice(0, maximumOwnersPerRun)) {
      const status = await this.#backupOwner(owner);
      summary.checked += 1;
      summary[status.outcome === "never" ? "failed" : status.outcome] += 1;
    }
    return summary;
  }

  async #backupOwner(owner: OwnerRow): Promise<OwnerBackupStatus> {
    const checkedAt = new Date().toISOString();
    try {
      const { state, recovery } = await this.#ownerState(owner);
      const binaries = await this.#binaryObjects(state);
      for (const binary of binaries) await this.#ensureBinaryCopy(binary);
      const digest = await ownerBackupDigest(state, binaries);
      const previous = this.getStatus(owner.owner_key);
      if (previous.digest === digest && previous.manifestKey) {
        this.#recordStatus(owner.owner_key, "unchanged", digest, previous.manifestKey, checkedAt, previous.lastBackedUpAt, null);
        return this.getStatus(owner.owner_key);
      }

      const manifest: OwnerBackupManifest = {
        schemaVersion: ownerBackupSchemaVersion,
        createdAt: checkedAt,
        digest,
        state,
        binaries,
        recovery,
      };
      const body = ownerBackupManifestJson(manifest);
      if (new TextEncoder().encode(body).byteLength > maximumOwnerBackupBytes) throw new Error("Owner backup manifest exceeds 10 MiB");
      const manifestKey = ownerBackupManifestKey(owner.owner_key, checkedAt, digest);
      await this.env.PAPERS.put(manifestKey, body, {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        customMetadata: { schemaVersion: ownerBackupSchemaVersion, digest },
      });
      this.#recordStatus(owner.owner_key, "created", digest, manifestKey, checkedAt, checkedAt, null);
      return this.getStatus(owner.owner_key);
    } catch (error) {
      const previous = this.getStatus(owner.owner_key);
      this.#recordStatus(
        owner.owner_key,
        "failed",
        previous.digest,
        previous.manifestKey,
        checkedAt,
        previous.lastBackedUpAt,
        backupError(error),
      );
      return this.getStatus(owner.owner_key);
    }
  }

  async #ownerState(owner: OwnerRow): Promise<{ state: OwnerBackupState; recovery: OwnerBackupRecovery }> {
    const catalog = this.env.WORKSPACE_CATALOGS.getByName(owner.owner_key);
    const reviewCatalog = this.env.REVIEW_CATALOGS.getByName(owner.owner_key);
    const library = this.env.REFERENCE_LIBRARIES.getByName(owner.owner_key);
    const templates = this.env.PROJECT_TEMPLATE_CATALOGS.getByName(owner.owner_key);
    const [catalogBackup, libraryBackup, templateBackup] = await Promise.all([
      catalog.getBackupSnapshot(),
      library.getBackupSnapshot(),
      templates.getBackupSnapshot(),
    ]);
    if (catalogBackup.workspaces.length > maximumWorkspacesPerOwner) throw new Error("Owner workspace catalog exceeds backup bound");
    const identity = backupIdentity(owner);
    for (const summary of catalogBackup.workspaces) {
      const storageKey = workspaceStorageKey(identity, summary.id);
      const role = await this.env.WORKSPACE_ACCESS.getByName(storageKey).getRole(owner.email);
      if (!role || !(await this.env.REVIEW_STUDIES.getByName(storageKey).hasReviewData())) continue;
      const registration = await ensureLegacyReviewResource(this.env, identity, summary.id, true);
      if (role === "owner" && !registration) throw new Error("Legacy review registration did not preserve owner access");
    }
    const reviewCatalogBackup = await reviewCatalog.getBackupSnapshot();

    const workspaces: OwnerWorkspaceBackup[] = [];
    const recoveryWorkspaces: OwnerBackupRecovery["workspaces"][number][] = [];
    for (const summary of catalogBackup.workspaces) {
      const storageKey = summary.id === "demo" ? `${owner.owner_key}:demo` : summary.id;
      const access = this.env.WORKSPACE_ACCESS.getByName(storageKey);
      if ((await access.getRole(owner.email)) !== "owner") continue;
      const room = this.env.DOCUMENT_ROOMS.getByName(storageKey);
      const [accessBackup, documentBackup] = await Promise.all([access.getBackupSnapshot(owner.email), room.getBackupSnapshot(summary.id)]);
      workspaces.push({
        summary,
        members: accessBackup.members,
        snapshot: documentBackup.snapshot,
        revisionSeed: documentBackup.revisionSeed,
      });
      recoveryWorkspaces.push({
        workspaceId: summary.id,
        access: accessBackup.bookmark,
        document: documentBackup.bookmark,
      });
    }

    const reviews: OwnerReviewBackup[] = [];
    const recoveryReviews: NonNullable<OwnerBackupRecovery["reviews"]>[number][] = [];
    for (const record of reviewCatalogBackup.records) {
      if (record.role !== "owner") continue;
      const access = this.env.REVIEW_ACCESS.getByName(record.locator.storageKey);
      if ((await access.getRole(owner.email)) !== "owner") throw new Error("Review catalog and access ownership do not match");
      const study = this.env.REVIEW_STUDIES.getByName(record.locator.storageKey);
      const [accessBackup, reviewBackup] = await Promise.all([
        access.getBackupSnapshot(owner.email),
        study.createBackupSnapshot(owner.owner_key),
      ]);
      if (accessBackup.reviewId !== record.id) throw new Error("Review catalog and access identities do not match");
      const { bookmark: accessBookmark, ...accessState } = accessBackup;
      reviews.push({
        catalogRecord: record,
        access: accessState,
        reviewPayload: reviewBackup.reference,
        reviewRevisionSeed: reviewBackup.revisionSeed,
      });
      recoveryReviews.push({
        reviewId: record.id,
        access: accessBookmark,
        study: reviewBackup.bookmark,
      });
    }
    workspaces.sort((left, right) => left.summary.id.localeCompare(right.summary.id));
    recoveryWorkspaces.sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
    reviews.sort((left, right) => left.catalogRecord.id.localeCompare(right.catalogRecord.id));
    recoveryReviews.sort((left, right) => left.reviewId.localeCompare(right.reviewId));
    return {
      state: {
        ownerKey: owner.owner_key,
        catalog: workspaces.map((workspace) => workspace.summary),
        library: libraryBackup.snapshot,
        templates: templateBackup.templates,
        workspaces,
        reviews,
      },
      recovery: {
        catalog: catalogBackup.bookmark,
        library: libraryBackup.bookmark,
        templates: templateBackup.bookmark,
        workspaces: recoveryWorkspaces,
        reviewCatalog: reviewCatalogBackup.bookmark,
        reviews: recoveryReviews,
      },
    };
  }

  async #binaryObjects(state: OwnerBackupState): Promise<BackupBinaryObject[]> {
    const workspaceIds = state.workspaces.map((workspace) => workspace.summary.id);
    const binaries: BackupBinaryObject[] = [];
    for (const sourceKey of referencedBinaryKeys(state)) {
      if (!isOwnedBinaryKey(state.ownerKey, workspaceIds, sourceKey)) throw new Error("Backup source key is outside owner scope");
      const source = await this.env.PAPERS.head(sourceKey);
      if (!source) throw new Error("A referenced backup source is missing");
      binaries.push({
        sourceKey,
        sourceEtag: source.etag,
        size: source.size,
        uploadedAt: source.uploaded.toISOString(),
        backupKey: await backupBlobKey(state.ownerKey, sourceKey, source.etag, source.size),
      });
    }
    return binaries;
  }

  async #ensureBinaryCopy(binary: BackupBinaryObject): Promise<void> {
    const existing = await this.env.PAPERS.head(binary.backupKey);
    if (existing) {
      if (existing.size !== binary.size) throw new Error("Backup binary size does not match its source");
      return;
    }
    const source = await this.env.PAPERS.get(binary.sourceKey);
    if (!source || source.etag !== binary.sourceEtag || source.size !== binary.size) {
      throw new Error("Backup source changed while it was being copied");
    }
    await this.env.PAPERS.put(binary.backupKey, source.body, {
      ...(source.httpMetadata ? { httpMetadata: source.httpMetadata } : {}),
      customMetadata: { sourceKey: binary.sourceKey, sourceEtag: binary.sourceEtag },
    });
  }

  #recordStatus(
    ownerKey: string,
    outcome: Exclude<OwnerBackupStatus["outcome"], "never">,
    digest: string | null,
    manifestKey: string | null,
    checkedAt: string,
    backedUpAt: string | null,
    error: string | null,
  ): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO backup_status
       (owner_key, outcome, digest, manifest_key, last_checked_at, last_backed_up_at, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_key) DO UPDATE SET
         outcome = excluded.outcome,
         digest = excluded.digest,
         manifest_key = excluded.manifest_key,
         last_checked_at = excluded.last_checked_at,
         last_backed_up_at = excluded.last_backed_up_at,
         error = excluded.error`,
      ownerKey,
      outcome,
      digest,
      manifestKey,
      checkedAt,
      backedUpAt,
      error,
    );
  }

  #recordDrill(
    ownerKey: string,
    outcome: Exclude<OwnerBackupDrillStatus["outcome"], "never">,
    digest: string | null,
    manifestKey: string | null,
    recoveryIdentity: string | null,
    checkedAt: string,
    binariesChecked: number,
    reviewsChecked: number,
    error: string | null,
  ): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO backup_drills
       (owner_key, outcome, digest, manifest_key, recovery_identity, checked_at, binaries_checked, reviews_checked, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_key) DO UPDATE SET
         outcome = excluded.outcome,
         digest = excluded.digest,
         manifest_key = excluded.manifest_key,
         recovery_identity = excluded.recovery_identity,
         checked_at = excluded.checked_at,
         binaries_checked = excluded.binaries_checked,
         reviews_checked = excluded.reviews_checked,
         error = excluded.error`,
      ownerKey,
      outcome,
      digest,
      manifestKey,
      recoveryIdentity,
      checkedAt,
      binariesChecked,
      reviewsChecked,
      error,
    );
  }
}

function statusFromRow(row: StatusRow): OwnerBackupStatus {
  const outcome = row.outcome === "created" || row.outcome === "unchanged" ? row.outcome : "failed";
  return {
    ownerKey: row.owner_key,
    outcome,
    digest: row.digest,
    manifestKey: row.manifest_key,
    lastCheckedAt: row.last_checked_at,
    lastBackedUpAt: row.last_backed_up_at,
    error: row.error,
  };
}

function emptyStatus(ownerKey: string): OwnerBackupStatus {
  return {
    ownerKey,
    outcome: "never",
    digest: null,
    manifestKey: null,
    lastCheckedAt: null,
    lastBackedUpAt: null,
    error: null,
  };
}

function drillStatusFromRow(row: DrillRow): OwnerBackupDrillStatus {
  return {
    ownerKey: row.owner_key,
    outcome: row.outcome === "verified" ? "verified" : "failed",
    digest: row.digest,
    manifestKey: row.manifest_key,
    recoveryIdentity: row.recovery_identity,
    checkedAt: row.checked_at,
    binariesChecked: row.binaries_checked,
    reviewsChecked: row.reviews_checked,
    error: row.error,
  };
}

function emptyDrillStatus(ownerKey: string): OwnerBackupDrillStatus {
  return {
    ownerKey,
    outcome: "never",
    digest: null,
    manifestKey: null,
    recoveryIdentity: null,
    checkedAt: null,
    binariesChecked: 0,
    reviewsChecked: 0,
    error: null,
  };
}

function normalizedOwnerKey(value: string): string {
  const ownerKey = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(ownerKey)) throw new Error("Backup owner key is invalid");
  return ownerKey;
}

function backupIdentity(owner: OwnerRow): AuthIdentity {
  return {
    subject: `backup:${owner.owner_key}`,
    email: owner.email,
    ownerKey: owner.owner_key,
    mode: owner.owner_key === localOwnerId ? "local" : "access",
  };
}

function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new Error("Backup owner email is invalid");
  return email;
}

function backupError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown backup failure").slice(0, 500);
}
