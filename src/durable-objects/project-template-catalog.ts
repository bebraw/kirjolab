import { DurableObject } from "cloudflare:workers";
import {
  isPersonalProjectTemplateId,
  isProjectTemplateSeed,
  type ProjectTemplateRecord,
  type ProjectTemplateSeed,
  type ProjectTemplateSummary,
} from "../domain/project-templates";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";
import { currentRecoveryBookmark } from "./recovery";

const maximumPersonalTemplates = 50;

const migrations = [
  {
    version: 1,
    name: "store-personal-project-templates",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE project_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          description TEXT NOT NULL,
          seed_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];

interface ProjectTemplateRow extends Record<string, SqlStorageValue> {
  id: string;
  name: string;
  description: string;
  seed_json: string;
  created_at: string;
  updated_at: string;
}

export interface SavePersonalProjectTemplate {
  readonly id?: string;
  readonly name: string;
  readonly description: string;
  readonly seed: ProjectTemplateSeed;
}

export class ProjectTemplateCatalog extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      runSQLiteMigrations(this.ctx.storage, migrations);
    });
  }

  listTemplates(): ProjectTemplateSummary[] {
    return this.ctx.storage.sql
      .exec<ProjectTemplateRow>("SELECT * FROM project_templates ORDER BY updated_at DESC, name ASC LIMIT ?", maximumPersonalTemplates)
      .toArray()
      .map(summaryFromRow);
  }

  getTemplate(id: string): ProjectTemplateRecord | null {
    if (!isPersonalProjectTemplateId(id)) return null;
    const row = this.ctx.storage.sql.exec<ProjectTemplateRow>("SELECT * FROM project_templates WHERE id = ?", id).toArray()[0];
    return row ? recordFromRow(row) : null;
  }

  saveTemplate(input: SavePersonalProjectTemplate): ProjectTemplateSummary {
    const name = input.name.trim();
    const description = input.description.trim();
    if (!name || name.length > 120 || description.length > 500 || !isProjectTemplateSeed(input.seed)) {
      throw new Error("Personal project template is invalid");
    }
    const now = new Date().toISOString();
    if (input.id) {
      if (!isPersonalProjectTemplateId(input.id) || !this.getTemplate(input.id)) throw new Error("Personal project template not found");
      this.ctx.storage.sql.exec(
        "UPDATE project_templates SET name = ?, description = ?, seed_json = ?, updated_at = ? WHERE id = ?",
        name,
        description,
        JSON.stringify(input.seed),
        now,
        input.id,
      );
      return summaryFromRow(this.ctx.storage.sql.exec<ProjectTemplateRow>("SELECT * FROM project_templates WHERE id = ?", input.id).one());
    }
    const count = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM project_templates").one().count;
    if (count >= maximumPersonalTemplates) throw new Error("Personal project template limit reached");
    const id = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      "INSERT INTO project_templates (id, name, description, seed_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      name,
      description,
      JSON.stringify(input.seed),
      now,
      now,
    );
    return summaryFromRow(this.ctx.storage.sql.exec<ProjectTemplateRow>("SELECT * FROM project_templates WHERE id = ?", id).one());
  }

  deleteTemplate(id: string): void {
    if (!this.getTemplate(id)) throw new Error("Personal project template not found");
    this.ctx.storage.sql.exec("DELETE FROM project_templates WHERE id = ?", id);
  }

  async getBackupSnapshot(): Promise<{ templates: ProjectTemplateRecord[]; bookmark: string | null }> {
    const rows = this.ctx.storage.sql.exec<ProjectTemplateRow>("SELECT * FROM project_templates ORDER BY id").toArray();
    return { templates: rows.map(recordFromRow), bookmark: await currentRecoveryBookmark(this.ctx.storage, this.env.AUTH_MODE) };
  }
}

function summaryFromRow(row: ProjectTemplateRow): ProjectTemplateSummary {
  return {
    id: row.id,
    source: "personal",
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordFromRow(row: ProjectTemplateRow): ProjectTemplateRecord {
  const seed: unknown = JSON.parse(row.seed_json);
  if (!isProjectTemplateSeed(seed)) throw new Error("Stored project template seed is invalid");
  return { ...summaryFromRow(row), seed };
}
