import { DurableObject } from "cloudflare:workers";
import { maximumOwnerBackupBytes, parseOwnerBackupManifest } from "../domain/backups";
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
] as const satisfies readonly SQLiteMigration[];

export class BackupRecovery extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      runSQLiteMigrations(this.ctx.storage, migrations);
    });
  }

  restoreManifest(manifestJson: string): void {
    if (new TextEncoder().encode(manifestJson).byteLength > maximumOwnerBackupBytes)
      throw new Error("Owner backup manifest exceeds 10 MiB");
    parseOwnerBackupManifest(manifestJson);
    const chunks = manifestChunks(manifestJson);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM recovered_manifest_chunks");
      for (const [index, chunk] of chunks.entries()) {
        this.ctx.storage.sql.exec("INSERT INTO recovered_manifest_chunks (chunk_index, manifest_chunk) VALUES (?, ?)", index, chunk);
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
