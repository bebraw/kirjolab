import { DurableObject } from "cloudflare:workers";
import { demoWorkspaceId, type WorkspaceSummary } from "../domain/workspace";

interface WorkspaceCatalogRow extends Record<string, SqlStorageValue> {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export class WorkspaceCatalog extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      const now = new Date().toISOString();
      this.ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        demoWorkspaceId,
        "Evidence becomes prose",
        now,
        now,
      );
    });
  }

  listWorkspaces(): WorkspaceSummary[] {
    return this.ctx.storage.sql
      .exec<WorkspaceCatalogRow>("SELECT * FROM workspaces ORDER BY updated_at DESC, title ASC LIMIT 200")
      .toArray()
      .map(summaryFromRow);
  }

  registerWorkspace(id: string, title: string): WorkspaceSummary {
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec("INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)", id, title, now, now);
    return { id, title, href: `/workspaces/${id}`, createdAt: now, updatedAt: now };
  }

  getWorkspace(id: string): WorkspaceSummary | null {
    const row = this.ctx.storage.sql.exec<WorkspaceCatalogRow>("SELECT * FROM workspaces WHERE id = ?", id).toArray()[0];
    return row ? summaryFromRow(row) : null;
  }
}

function summaryFromRow(row: WorkspaceCatalogRow): WorkspaceSummary {
  return {
    id: row.id,
    title: row.title,
    href: `/workspaces/${row.id}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
