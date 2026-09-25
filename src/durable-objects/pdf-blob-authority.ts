import { DurableObject } from "cloudflare:workers";
import { isSha256Hex, sha256Bytes } from "../domain/sha256";
import { storePdfBlob, type StoredPdfBlob } from "../pdf-blob";
import { initializeCloudflareSQLiteMigrations } from "../persistence/sqlite/cloudflare";
import type { SQLiteMigration } from "../persistence/sqlite/migrations";

const migrations: readonly SQLiteMigration[] = [
  {
    version: 1,
    name: "register-shared-pdf-references",
    apply(sql): undefined {
      sql.exec("CREATE TABLE blob_identity (digest TEXT PRIMARY KEY)");
      sql.exec("CREATE TABLE blob_references (ref_key TEXT PRIMARY KEY, state TEXT NOT NULL CHECK (state IN ('pending', 'committed')))");
      return undefined;
    },
  },
  {
    version: 2,
    name: "track-legacy-pdf-migration",
    apply(sql): undefined {
      sql.exec("CREATE TABLE migration_progress (id INTEGER PRIMARY KEY CHECK (id = 1), cursor TEXT)");
      return undefined;
    },
  },
];

const collectionDelayMs = 24 * 60 * 60 * 1000;

export class PdfBlobAuthority extends DurableObject<Env> {
  private operation: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    initializeCloudflareSQLiteMigrations(ctx, migrations);
  }

  async reserve(digest: string, refKey: string, bytes: Uint8Array): Promise<StoredPdfBlob> {
    if (!isSha256Hex(digest) || refKey.length > 256 || !/^(library|project):.+:[0-9a-f-]{36}$/iu.test(refKey)) {
      throw new Error("Invalid shared PDF identity");
    }
    if ((await sha256Bytes(bytes)) !== digest) throw new Error("Shared PDF digest does not match upload bytes");
    return await this.exclusive(async () => {
      const sql = this.ctx.storage.sql;
      const identity = sql.exec<{ digest: string }>("SELECT digest FROM blob_identity LIMIT 1").toArray()[0];
      if (identity && identity.digest !== digest) throw new Error("Shared PDF authority identity changed");
      if (!identity) sql.exec("INSERT INTO blob_identity (digest) VALUES (?)", digest);
      sql.exec("INSERT OR IGNORE INTO blob_references (ref_key, state) VALUES (?, 'pending')", refKey);
      try {
        return await storePdfBlob(this.env.PAPERS, bytes);
      } catch (error) {
        sql.exec("DELETE FROM blob_references WHERE ref_key = ? AND state = 'pending'", refKey);
        throw error;
      }
    });
  }

  commit(refKey: string): void {
    const sql = this.ctx.storage.sql;
    const result = sql.exec("UPDATE blob_references SET state = 'committed' WHERE ref_key = ?", refKey);
    if (result.rowsWritten === 0) throw new Error("Shared PDF reservation is missing");
  }

  async release(refKey: string): Promise<void> {
    await this.exclusive(async () => {
      const sql = this.ctx.storage.sql;
      sql.exec("DELETE FROM blob_references WHERE ref_key = ?", refKey);
      if (sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM blob_references").one().count === 0) {
        await this.ctx.storage.setAlarm(Date.now() + collectionDelayMs);
      }
    });
  }

  override async alarm(): Promise<void> {
    await this.exclusive(async () => {
      const sql = this.ctx.storage.sql;
      if (sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM blob_references").one().count > 0) return;
      const identity = sql.exec<{ digest: string }>("SELECT digest FROM blob_identity LIMIT 1").toArray()[0];
      if (identity) await this.env.PAPERS.delete(`pdf-blobs/sha256/${identity.digest}.pdf`);
    });
  }

  referenceCount(): number {
    return this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM blob_references").one().count;
  }

  references(): Array<{ refKey: string; state: "pending" | "committed" }> {
    return this.ctx.storage.sql
      .exec<{ ref_key: string; state: "pending" | "committed" }>("SELECT ref_key, state FROM blob_references ORDER BY ref_key")
      .toArray()
      .map(({ ref_key, state }) => ({ refKey: ref_key, state }));
  }

  async scheduleCollectionIfUnused(): Promise<void> {
    await this.exclusive(async () => {
      if (this.referenceCount() === 0) await this.ctx.storage.setAlarm(Date.now() + collectionDelayMs);
    });
  }

  migrationCursor(): string | null {
    return (
      this.ctx.storage.sql.exec<{ cursor: string | null }>("SELECT cursor FROM migration_progress WHERE id = 1").toArray()[0]?.cursor ??
      null
    );
  }

  setMigrationCursor(cursor: string | null): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO migration_progress (id, cursor) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET cursor = excluded.cursor",
      cursor,
    );
  }

  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.operation;
    let finish: () => void = () => undefined;
    this.operation = new Promise<void>((resolve) => {
      finish = resolve;
    });
    await previous;
    try {
      return await action();
    } finally {
      finish();
    }
  }
}
