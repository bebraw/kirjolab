import { DurableObject } from "cloudflare:workers";
import { maximumOwnerBackupBytes, ownerBackupSchemaVersion, parseOwnerBackupManifest } from "../domain/backups";
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
] as const satisfies readonly SQLiteMigration[];

interface RecoveredReviewRow extends Record<string, SqlStorageValue> {
  workspace_id: string;
  recovery_identity: string;
  payload_digest: string;
  authority_digest: string;
  review_revision: number;
  protocol_revision: number;
  history_floor_revision: number;
}

export interface RecoveredReviewStudy {
  readonly workspaceId: string;
  readonly recoveryIdentity: string;
  readonly payloadDigest: string;
  readonly authorityDigest: string;
  readonly reviewRevision: number;
  readonly protocolRevision: number;
  readonly historyFloorRevision: number;
}

export class BackupRecovery extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      runSQLiteMigrations(this.ctx.storage, migrations);
    });
  }

  async restoreManifest(manifestJson: string): Promise<void> {
    if (new TextEncoder().encode(manifestJson).byteLength > maximumOwnerBackupBytes)
      throw new Error("Owner backup manifest exceeds 10 MiB");
    const manifest = parseOwnerBackupManifest(manifestJson);
    this.ctx.storage.sql.exec("DELETE FROM recovered_review_studies");
    const recoveredReviews: RecoveredReviewStudy[] = [];
    if (manifest.schemaVersion === ownerBackupSchemaVersion) {
      const workspaceIds = new Set<string>();
      for (const workspace of manifest.state.workspaces) {
        const workspaceId = workspace.summary.id;
        if (!workspaceId || workspaceIds.has(workspaceId)) throw new Error("Review recovery workspace identity is invalid");
        workspaceIds.add(workspaceId);
        if (!workspace.reviewPayload) continue;
        await this.#assertPayloadAvailable(workspace.reviewPayload);
        const recoveryIdentity = reviewRecoveryIdentity(manifest.state.ownerKey, manifest.digest, workspaceId);
        const study = this.env.REVIEW_STUDIES.getByName(recoveryIdentity);
        await study.restoreBackupPayload(manifest.state.ownerKey, workspace.reviewPayload);
        const verification = await study.getBackupVerification();
        assertReviewVerification(workspace.reviewPayload, verification);
        recoveredReviews.push({ workspaceId, recoveryIdentity, ...verification });
      }
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
           (workspace_id, recovery_identity, payload_digest, authority_digest, review_revision, protocol_revision, history_floor_revision)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          review.workspaceId,
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
  }

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

  getRestoredReviewStudies(): RecoveredReviewStudy[] {
    return this.ctx.storage.sql
      .exec<RecoveredReviewRow>("SELECT * FROM recovered_review_studies ORDER BY workspace_id ASC")
      .toArray()
      .map((row) => ({
        workspaceId: row.workspace_id,
        recoveryIdentity: row.recovery_identity,
        payloadDigest: row.payload_digest,
        authorityDigest: row.authority_digest,
        reviewRevision: row.review_revision,
        protocolRevision: row.protocol_revision,
        historyFloorRevision: row.history_floor_revision,
      }));
  }

  async #assertPayloadAvailable(reference: ReviewBackupReference): Promise<void> {
    const object = await this.env.PAPERS.head(reference.backupKey);
    if (!object || object.size !== reference.byteCount) {
      throw new Error("A review backup payload is unavailable or has the wrong size");
    }
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

function reviewRecoveryIdentity(ownerKey: string, manifestDigest: string, workspaceId: string): string {
  return `review-drill:${ownerKey}:${manifestDigest}:${workspaceId}`;
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
