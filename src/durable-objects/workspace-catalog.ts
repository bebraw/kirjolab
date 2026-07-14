import { DurableObject } from "cloudflare:workers";
import { demoWorkspaceId, type WorkspaceSummary } from "../domain/workspace";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";
import { currentRecoveryBookmark } from "./recovery";

const migrations = [
  {
    version: 1,
    name: "create-workspace-catalog",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      const now = new Date().toISOString();
      sql.exec(
        "INSERT OR IGNORE INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        demoWorkspaceId,
        "Evidence becomes prose",
        now,
        now,
      );
      return undefined;
    },
  },
  {
    version: 2,
    name: "archive-workspaces",
    apply(sql): undefined {
      sql.exec("ALTER TABLE workspaces ADD COLUMN archived_at TEXT");
      return undefined;
    },
  },
  {
    version: 3,
    name: "add-public-share-locators",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE workspace_share_locators (
          workspace_id TEXT PRIMARY KEY,
          locator TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        );
      `);
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];

interface WorkspaceCatalogRow extends Record<string, SqlStorageValue> {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export class WorkspaceCatalog extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      runSQLiteMigrations(this.ctx.storage, migrations);
    });
  }

  listWorkspaces(): WorkspaceSummary[] {
    const demo = this.ctx.storage.sql.exec<WorkspaceCatalogRow>("SELECT * FROM workspaces WHERE id = ?", demoWorkspaceId).toArray()[0];
    const recent = this.ctx.storage.sql
      .exec<WorkspaceCatalogRow>("SELECT * FROM workspaces WHERE id <> ? ORDER BY updated_at DESC, title ASC LIMIT 199", demoWorkspaceId)
      .toArray();
    return [...(demo ? [demo] : []), ...recent].map(summaryFromRow);
  }

  async getBackupSnapshot(): Promise<{ workspaces: WorkspaceSummary[]; bookmark: string | null }> {
    const workspaces = this.listWorkspaces();
    return { workspaces, bookmark: await currentRecoveryBookmark(this.ctx.storage, this.env.AUTH_MODE) };
  }

  registerWorkspace(id: string, title: string): WorkspaceSummary {
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at`,
      id,
      title,
      now,
      now,
    );
    return summaryFromRow(this.ctx.storage.sql.exec<WorkspaceCatalogRow>("SELECT * FROM workspaces WHERE id = ?", id).one());
  }

  getWorkspace(id: string): WorkspaceSummary | null {
    const row = this.ctx.storage.sql.exec<WorkspaceCatalogRow>("SELECT * FROM workspaces WHERE id = ?", id).toArray()[0];
    return row ? summaryFromRow(row) : null;
  }

  getOrCreateShareLocator(workspaceId: string): string {
    if (!this.getWorkspace(workspaceId)) throw new Error("Workspace not found");
    if (workspaceId !== demoWorkspaceId) return workspaceId;
    const existing = this.ctx.storage.sql
      .exec<{ locator: string }>("SELECT locator FROM workspace_share_locators WHERE workspace_id = ?", workspaceId)
      .toArray()[0];
    if (existing) return existing.locator;
    const locator = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      "INSERT INTO workspace_share_locators (workspace_id, locator, created_at) VALUES (?, ?, ?)",
      workspaceId,
      locator,
      new Date().toISOString(),
    );
    return locator;
  }

  updateWorkspace(id: string, title: string | null, archived: boolean | null): WorkspaceSummary {
    const current = this.getWorkspace(id);
    if (!current) throw new Error("Workspace not found");
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      "UPDATE workspaces SET title = ?, archived_at = ?, updated_at = ? WHERE id = ?",
      title ?? current.title,
      archived === null ? current.archivedAt : archived ? now : null,
      now,
      id,
    );
    return summaryFromRow(this.ctx.storage.sql.exec<WorkspaceCatalogRow>("SELECT * FROM workspaces WHERE id = ?", id).one());
  }

  removeWorkspace(id: string): void {
    this.ctx.storage.sql.exec("DELETE FROM workspaces WHERE id = ?", id);
  }
}

function summaryFromRow(row: WorkspaceCatalogRow): WorkspaceSummary {
  return {
    id: row.id,
    title: row.title,
    href: `/workspaces/${row.id}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}
