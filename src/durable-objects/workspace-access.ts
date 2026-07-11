import { DurableObject } from "cloudflare:workers";
import type { WorkspaceMember, WorkspaceRole } from "../domain/workspace";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";

const migrations = [
  {
    version: 1,
    name: "create-workspace-access",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE IF NOT EXISTS members (
          email TEXT PRIMARY KEY,
          role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
          added_at TEXT NOT NULL
        );
      `);
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];

interface MemberRow extends Record<string, SqlStorageValue> {
  email: string;
  role: string;
  added_at: string;
}

export class WorkspaceAccess extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      runSQLiteMigrations(this.ctx.storage, migrations);
    });
  }

  initializeOwner(email: string): WorkspaceMember {
    const existing = this.ctx.storage.sql.exec<MemberRow>("SELECT * FROM members WHERE role = 'owner'").toArray()[0];
    if (existing) return memberFromRow(existing);
    const member: WorkspaceMember = { email: normalizeEmail(email), role: "owner", addedAt: new Date().toISOString() };
    this.ctx.storage.sql.exec("INSERT INTO members (email, role, added_at) VALUES (?, 'owner', ?)", member.email, member.addedAt);
    return member;
  }

  getRole(email: string): WorkspaceRole | null {
    const row = this.ctx.storage.sql.exec<MemberRow>("SELECT * FROM members WHERE email = ?", normalizeEmail(email)).toArray()[0];
    return row?.role === "owner" || row?.role === "member" ? row.role : null;
  }

  listMembers(requesterEmail: string): WorkspaceMember[] {
    if (!this.getRole(requesterEmail)) throw new Error("Workspace access denied");
    return this.ctx.storage.sql
      .exec<MemberRow>("SELECT * FROM members ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, added_at ASC")
      .toArray()
      .map(memberFromRow);
  }

  addMember(requesterEmail: string, memberEmail: string): WorkspaceMember {
    if (this.getRole(requesterEmail) !== "owner") throw new Error("Only the workspace owner can invite members");
    const email = normalizeEmail(memberEmail);
    const existing = this.ctx.storage.sql.exec<MemberRow>("SELECT * FROM members WHERE email = ?", email).toArray()[0];
    if (existing) return memberFromRow(existing);
    const member: WorkspaceMember = { email, role: "member", addedAt: new Date().toISOString() };
    this.ctx.storage.sql.exec("INSERT INTO members (email, role, added_at) VALUES (?, 'member', ?)", member.email, member.addedAt);
    return member;
  }
}

function memberFromRow(row: MemberRow): WorkspaceMember {
  return { email: row.email, role: row.role === "owner" ? "owner" : "member", addedAt: row.added_at };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
