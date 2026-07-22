import { DurableObject } from "cloudflare:workers";
import {
  maximumOwnerBackupBytes,
  ownerBackupSchemaVersion,
  parseOwnerBackupManifest,
  projectAssociatedReviewOwnerBackupSchemaVersion,
  type OwnerBackupManifest,
  type ProjectAssociatedReviewOwnerBackupManifest,
} from "../domain/backups";
import { canonicalValue } from "../domain/canonical-value";
import type { ReviewAccessBackupState, ReviewCatalogRecord } from "../domain/review-catalog";
import type { ReviewBackupReference, ReviewBackupVerification } from "../domain/review-backup";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";

const migrations = [
  {
    version: 1,
    name: "create-isolated-backup-recovery",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE recovered_manifests (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          restored_at TEXT NOT NULL,
          chunk_count INTEGER NOT NULL
        );
        CREATE TABLE recovered_manifest_chunks (
          chunk_index INTEGER PRIMARY KEY,
          manifest_chunk TEXT NOT NULL
        );
      `);
      return undefined;
    },
  },
  {
    version: 2,
    name: "record-recovered-review-studies",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE recovered_review_studies (
          workspace_id TEXT PRIMARY KEY,
          recovery_identity TEXT NOT NULL,
          payload_digest TEXT NOT NULL,
          authority_digest TEXT NOT NULL,
          review_revision INTEGER NOT NULL,
          protocol_revision INTEGER NOT NULL,
          history_floor_revision INTEGER NOT NULL
        );
      `);
      return undefined;
    },
  },
  {
    version: 3,
    name: "address-independent-review-recoveries",
    apply(sql): undefined {
      sql.exec("ALTER TABLE recovered_review_studies ADD COLUMN review_id TEXT");
      sql.exec("ALTER TABLE recovered_review_studies ADD COLUMN catalog_recovery_identity TEXT");
      sql.exec("ALTER TABLE recovered_review_studies ADD COLUMN access_recovery_identity TEXT");
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];

interface RecoveredReviewRow extends Record<string, SqlStorageValue> {
  workspace_id: string;
  review_id: string | null;
  catalog_recovery_identity: string | null;
  access_recovery_identity: string | null;
  recovery_identity: string;
  payload_digest: string;
  authority_digest: string;
  review_revision: number;
  protocol_revision: number;
  history_floor_revision: number;
}

export interface RecoveredReviewStudy {
  readonly reviewId: string | null;
  readonly workspaceId: string | null;
  readonly catalogRecoveryIdentity: string | null;
  readonly accessRecoveryIdentity: string | null;
  readonly recoveryIdentity: string;
  readonly payloadDigest: string;
  readonly authorityDigest: string;
  readonly reviewRevision: number;
  readonly protocolRevision: number;
  readonly historyFloorRevision: number;
}

export type BackupManifestRestoreResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "review-payload-unavailable"; readonly error: string };

export class BackupRecovery extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      runSQLiteMigrations(this.ctx.storage, migrations);
    });
  }

  // Durable Object RPC entrypoint invoked through its namespace stub.
  // fallow-ignore-next-line unused-class-member
  async restoreManifest(manifestJson: string): Promise<BackupManifestRestoreResult> {
    if (new TextEncoder().encode(manifestJson).byteLength > maximumOwnerBackupBytes)
      throw new Error("Owner backup manifest exceeds 10 MiB");
    const manifest = parseOwnerBackupManifest(manifestJson);
    this.ctx.storage.sql.exec("DELETE FROM recovered_review_studies");
    let recoveredReviews: RecoveredReviewStudy[];
    try {
      recoveredReviews =
        manifest.schemaVersion === ownerBackupSchemaVersion
          ? await this.#restoreIndependentReviews(manifest)
          : manifest.schemaVersion === projectAssociatedReviewOwnerBackupSchemaVersion
            ? await this.#restoreProjectAssociatedReviews(manifest)
            : [];
    } catch (error) {
      if (error instanceof ReviewPayloadUnavailableError) {
        return { ok: false, code: "review-payload-unavailable", error: error.message };
      }
      throw error;
    }
    const chunks = manifestChunks(manifestJson);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM recovered_manifest_chunks");
      for (const [index, chunk] of chunks.entries()) {
        this.ctx.storage.sql.exec("INSERT INTO recovered_manifest_chunks (chunk_index, manifest_chunk) VALUES (?, ?)", index, chunk);
      }
      for (const review of recoveredReviews) {
        this.ctx.storage.sql.exec(
          `INSERT INTO recovered_review_studies
           (workspace_id, review_id, catalog_recovery_identity, access_recovery_identity, recovery_identity,
            payload_digest, authority_digest, review_revision, protocol_revision, history_floor_revision)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          review.reviewId ?? review.workspaceId,
          review.reviewId,
          review.catalogRecoveryIdentity,
          review.accessRecoveryIdentity,
          review.recoveryIdentity,
          review.payloadDigest,
          review.authorityDigest,
          review.reviewRevision,
          review.protocolRevision,
          review.historyFloorRevision,
        );
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO recovered_manifests (id, restored_at, chunk_count) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET restored_at = excluded.restored_at, chunk_count = excluded.chunk_count`,
        new Date().toISOString(),
        chunks.length,
      );
    });
    return { ok: true };
  }

  // Durable Object RPC entrypoint invoked through its namespace stub.
  // fallow-ignore-next-line unused-class-member
  getRestoredManifest(): string | null {
    const metadata = this.ctx.storage.sql
      .exec<{ chunk_count: number }>("SELECT chunk_count FROM recovered_manifests WHERE id = 1")
      .toArray()[0];
    if (!metadata) return null;
    const chunks = this.ctx.storage.sql
      .exec<{ manifest_chunk: string }>("SELECT manifest_chunk FROM recovered_manifest_chunks ORDER BY chunk_index")
      .toArray();
    return chunks.length === metadata.chunk_count ? chunks.map((row) => row.manifest_chunk).join("") : null;
  }

  // Durable Object RPC entrypoint invoked through its namespace stub.
  // fallow-ignore-next-line unused-class-member
  getRestoredReviewStudies(): RecoveredReviewStudy[] {
    return this.ctx.storage.sql
      .exec<RecoveredReviewRow>("SELECT * FROM recovered_review_studies ORDER BY workspace_id ASC")
      .toArray()
      .map((row) => ({
        reviewId: row.review_id,
        workspaceId: row.review_id === null ? row.workspace_id : null,
        catalogRecoveryIdentity: row.catalog_recovery_identity,
        accessRecoveryIdentity: row.access_recovery_identity,
        recoveryIdentity: row.recovery_identity,
        payloadDigest: row.payload_digest,
        authorityDigest: row.authority_digest,
        reviewRevision: row.review_revision,
        protocolRevision: row.protocol_revision,
        historyFloorRevision: row.history_floor_revision,
      }));
  }

  async #restoreIndependentReviews(manifest: OwnerBackupManifest): Promise<RecoveredReviewStudy[]> {
    const catalogRecoveryIdentity = independentReviewCatalogRecoveryIdentity(manifest.digest);
    const catalogRecords: ReviewCatalogRecord[] = [];
    const recoveredReviews: RecoveredReviewStudy[] = [];
    for (const review of manifest.state.reviews) {
      const recoveryIdentity = independentReviewRecoveryIdentity(manifest.digest, review.catalogRecord.id);
      await this.#restoreReviewAccess(recoveryIdentity, review.access);
      catalogRecords.push({
        ...review.catalogRecord,
        locator: { ...review.catalogRecord.locator, storageKey: recoveryIdentity },
      });
      if (!review.reviewPayload) continue;
      await this.#assertPayloadAvailable(review.reviewPayload);
      const study = this.env.REVIEW_STUDIES.getByName(recoveryIdentity);
      await study.restoreBackupPayload(manifest.state.ownerKey, review.reviewPayload);
      const verification = await study.getBackupVerification();
      assertReviewVerification(review.reviewPayload, verification);
      recoveredReviews.push({
        reviewId: review.catalogRecord.id,
        workspaceId: null,
        catalogRecoveryIdentity,
        accessRecoveryIdentity: recoveryIdentity,
        recoveryIdentity,
        ...verification,
      });
    }
    await this.#restoreReviewCatalog(catalogRecoveryIdentity, catalogRecords);
    return recoveredReviews;
  }

  async #restoreProjectAssociatedReviews(manifest: ProjectAssociatedReviewOwnerBackupManifest): Promise<RecoveredReviewStudy[]> {
    const recoveredReviews: RecoveredReviewStudy[] = [];
    const workspaceIds = new Set<string>();
    for (const workspace of manifest.state.workspaces) {
      const workspaceId = workspace.summary.id;
      if (!workspaceId || workspaceIds.has(workspaceId)) throw new Error("Review recovery workspace identity is invalid");
      workspaceIds.add(workspaceId);
      if (!workspace.reviewPayload) continue;
      await this.#assertPayloadAvailable(workspace.reviewPayload);
      const recoveryIdentity = projectAssociatedReviewRecoveryIdentity(manifest.state.ownerKey, manifest.digest, workspaceId);
      const study = this.env.REVIEW_STUDIES.getByName(recoveryIdentity);
      await study.restoreBackupPayload(manifest.state.ownerKey, workspace.reviewPayload);
      const verification = await study.getBackupVerification();
      assertReviewVerification(workspace.reviewPayload, verification);
      recoveredReviews.push({
        reviewId: null,
        workspaceId,
        catalogRecoveryIdentity: null,
        accessRecoveryIdentity: null,
        recoveryIdentity,
        ...verification,
      });
    }
    return recoveredReviews;
  }

  async #restoreReviewAccess(recoveryIdentity: string, expected: ReviewAccessBackupState): Promise<void> {
    const access = this.env.REVIEW_ACCESS.getByName(recoveryIdentity);
    const normalizedExpected = normalizedReviewAccessState(expected);
    const status = await access.getAccessStatus();
    if (status.reviewId === null) {
      await access.restoreBackupSnapshot(normalizedExpected);
      return;
    }
    const owner = normalizedExpected.members.find((member) => member.role === "owner");
    if (!owner) throw new Error("Review access backup requires one owner");
    const snapshot = await access.getBackupSnapshot(owner.email);
    const { bookmark: _bookmark, ...existing } = snapshot;
    if (!sameCanonicalValue(normalizedReviewAccessState(existing), normalizedExpected)) {
      throw new Error("Review access recovery target contains different state");
    }
  }

  async #restoreReviewCatalog(recoveryIdentity: string, expected: readonly ReviewCatalogRecord[]): Promise<void> {
    const catalog = this.env.REVIEW_CATALOGS.getByName(recoveryIdentity);
    const normalizedExpected = [...expected].sort((left, right) => left.id.localeCompare(right.id));
    const snapshot = await catalog.getBackupSnapshot();
    if (snapshot.records.length === 0) {
      await catalog.restoreBackupSnapshot(normalizedExpected);
      return;
    }
    if (!sameCanonicalValue(snapshot.records, normalizedExpected)) {
      throw new Error("Review catalog recovery target contains different state");
    }
  }

  async #assertPayloadAvailable(reference: ReviewBackupReference): Promise<void> {
    const object = await this.env.PAPERS.head(reference.backupKey);
    if (!object || object.size !== reference.byteCount) {
      throw new ReviewPayloadUnavailableError();
    }
  }
}

class ReviewPayloadUnavailableError extends Error {
  constructor() {
    super("A review backup payload is unavailable or has the wrong size");
    this.name = "ReviewPayloadUnavailableError";
  }
}

const maximumManifestChunkCharacters = 256 * 1024;

function manifestChunks(value: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < value.length; ) {
    let end = Math.min(start + maximumManifestChunkCharacters, value.length);
    if (end < value.length && isHighSurrogate(value.charCodeAt(end - 1))) end -= 1;
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function projectAssociatedReviewRecoveryIdentity(ownerKey: string, manifestDigest: string, workspaceId: string): string {
  return `review-drill:${ownerKey}:${manifestDigest}:${workspaceId}`;
}

function independentReviewCatalogRecoveryIdentity(manifestDigest: string): string {
  return `review-catalog-drill:${manifestDigest}`;
}

function independentReviewRecoveryIdentity(manifestDigest: string, reviewId: string): string {
  return `review-drill:${manifestDigest}:${reviewId}`;
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function normalizedReviewAccessState(state: ReviewAccessBackupState): ReviewAccessBackupState {
  return {
    ...state,
    members: [...state.members].sort((left, right) => left.id.localeCompare(right.id)),
    projectLinks: [...state.projectLinks].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function assertReviewVerification(reference: ReviewBackupReference, verification: ReviewBackupVerification): void {
  if (
    verification.payloadDigest !== reference.payloadDigest ||
    verification.authorityDigest !== reference.authorityDigest ||
    verification.reviewRevision !== reference.reviewRevision ||
    verification.protocolRevision !== reference.protocolRevision ||
    verification.historyFloorRevision !== reference.historyFloorRevision
  ) {
    throw new Error("Recovered review authority verification failed");
  }
}
