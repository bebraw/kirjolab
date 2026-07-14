import { DurableObject } from "cloudflare:workers";
import type { WorkspaceMember, WorkspaceRole } from "../domain/workspace";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";
import { currentRecoveryBookmark } from "./recovery";

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
  {
    version: 2,
    name: "assign-stable-person-identities",
    apply(sql): undefined {
      sql.exec(`
        ALTER TABLE members RENAME TO members_v1;
        CREATE TABLE members (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
          added_at TEXT NOT NULL
        );
        INSERT INTO members (id, email, role, added_at)
          SELECT lower(hex(randomblob(16))), email, role, added_at FROM members_v1;
        DROP TABLE members_v1;
      `);
      return undefined;
    },
  },
  {
    version: 3,
    name: "create-read-only-share",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE read_only_share (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          token_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
      return undefined;
    },
  },
  {
    version: 4,
    name: "map-read-only-share-targets",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE read_only_share_target (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          storage_key TEXT NOT NULL,
          workspace_id TEXT NOT NULL
        );
      `);
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];

interface MemberRow extends Record<string, SqlStorageValue> {
  id: string;
  email: string;
  role: string;
  added_at: string;
}

interface ReadOnlyShareRow extends Record<string, SqlStorageValue> {
  token_hash: string;
  created_at: string;
}

interface ReadOnlyShareTargetRow extends Record<string, SqlStorageValue> {
  storage_key: string;
  workspace_id: string;
}

export interface ReadOnlyShareStatus {
  active: boolean;
  createdAt: string | null;
}

export interface CreatedReadOnlyShare {
  token: string;
  createdAt: string;
}

export interface ResolvedReadOnlyShare {
  readonly valid: boolean;
  readonly target: { readonly storageKey: string; readonly workspaceId: string } | null;
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
    const member: WorkspaceMember = {
      id: crypto.randomUUID(),
      email: normalizeEmail(email),
      role: "owner",
      addedAt: new Date().toISOString(),
    };
    this.ctx.storage.sql.exec(
      "INSERT INTO members (id, email, role, added_at) VALUES (?, ?, 'owner', ?)",
      member.id,
      member.email,
      member.addedAt,
    );
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

  async getBackupSnapshot(requesterEmail: string): Promise<{ members: WorkspaceMember[]; bookmark: string | null }> {
    const members = this.listMembers(requesterEmail);
    return { members, bookmark: await currentRecoveryBookmark(this.ctx.storage, this.env.AUTH_MODE) };
  }

  addMember(requesterEmail: string, memberEmail: string): WorkspaceMember {
    if (this.getRole(requesterEmail) !== "owner") throw new Error("Only the workspace owner can invite members");
    const email = normalizeEmail(memberEmail);
    const existing = this.ctx.storage.sql.exec<MemberRow>("SELECT * FROM members WHERE email = ?", email).toArray()[0];
    if (existing) return memberFromRow(existing);
    const member: WorkspaceMember = { id: crypto.randomUUID(), email, role: "member", addedAt: new Date().toISOString() };
    this.ctx.storage.sql.exec(
      "INSERT INTO members (id, email, role, added_at) VALUES (?, ?, 'member', ?)",
      member.id,
      member.email,
      member.addedAt,
    );
    return member;
  }

  async createReadOnlyShare(requesterEmail: string): Promise<CreatedReadOnlyShare> {
    if (this.getRole(requesterEmail) !== "owner") throw new Error("Only the workspace owner can manage read-only links");
    const token = randomToken();
    const createdAt = new Date().toISOString();
    const tokenHash = await hashToken(token);
    this.ctx.storage.sql.exec(
      "INSERT INTO read_only_share (singleton, token_hash, created_at) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at",
      tokenHash,
      createdAt,
    );
    return { token, createdAt };
  }

  async createMappedReadOnlyShare(storageKey: string, workspaceId: string): Promise<CreatedReadOnlyShare> {
    assertShareTarget(storageKey, workspaceId);
    const token = randomToken();
    const createdAt = new Date().toISOString();
    const tokenHash = await hashToken(token);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO read_only_share_target (singleton, storage_key, workspace_id) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET storage_key = excluded.storage_key, workspace_id = excluded.workspace_id",
        storageKey,
        workspaceId,
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO read_only_share (singleton, token_hash, created_at) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at",
        tokenHash,
        createdAt,
      );
    });
    return { token, createdAt };
  }

  getReadOnlyShareStatus(requesterEmail: string): ReadOnlyShareStatus {
    if (this.getRole(requesterEmail) !== "owner") throw new Error("Only the workspace owner can manage read-only links");
    const row = this.ctx.storage.sql
      .exec<ReadOnlyShareRow>("SELECT token_hash, created_at FROM read_only_share WHERE singleton = 1")
      .toArray()[0];
    return { active: row !== undefined, createdAt: row?.created_at ?? null };
  }

  async validateReadOnlyShare(token: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) return false;
    const tokenHash = await hashToken(token);
    const row = this.ctx.storage.sql
      .exec<ReadOnlyShareRow>("SELECT token_hash, created_at FROM read_only_share WHERE singleton = 1")
      .toArray()[0];
    return row?.token_hash === tokenHash;
  }

  async resolveReadOnlyShare(token: string): Promise<ResolvedReadOnlyShare> {
    if (!(await this.validateReadOnlyShare(token))) return { valid: false, target: null };
    const row = this.ctx.storage.sql
      .exec<ReadOnlyShareTargetRow>("SELECT storage_key, workspace_id FROM read_only_share_target WHERE singleton = 1")
      .toArray()[0];
    if (!row) return { valid: true, target: null };
    assertShareTarget(row.storage_key, row.workspace_id);
    return { valid: true, target: { storageKey: row.storage_key, workspaceId: row.workspace_id } };
  }

  getMappedReadOnlyShareStatus(): ReadOnlyShareStatus {
    return readOnlyShareStatus(this.ctx.storage.sql);
  }

  revokeMappedReadOnlyShare(): void {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM read_only_share");
      this.ctx.storage.sql.exec("DELETE FROM read_only_share_target");
    });
  }

  revokeReadOnlyShare(requesterEmail: string): void {
    if (this.getRole(requesterEmail) !== "owner") throw new Error("Only the workspace owner can manage read-only links");
    this.ctx.storage.sql.exec("DELETE FROM read_only_share WHERE singleton = 1");
  }

  async deleteWorkspaceAccess(requesterEmail: string): Promise<void> {
    if (this.getRole(requesterEmail) !== "owner") throw new Error("Only the workspace owner can delete workspace access");
    await this.ctx.storage.deleteAll();
  }
}

function readOnlyShareStatus(sql: SqlStorage): ReadOnlyShareStatus {
  const row = sql.exec<ReadOnlyShareRow>("SELECT token_hash, created_at FROM read_only_share WHERE singleton = 1").toArray()[0];
  return { active: row !== undefined, createdAt: row?.created_at ?? null };
}

function assertShareTarget(storageKey: string, workspaceId: string): void {
  if (!/^[a-z0-9:-]{1,128}$/iu.test(storageKey) || !/^[a-z0-9-]{1,64}$/iu.test(workspaceId)) {
    throw new TypeError("Read-only share target is invalid");
  }
}

function memberFromRow(row: MemberRow): WorkspaceMember {
  return { id: row.id, email: row.email, role: row.role === "owner" ? "owner" : "member", addedAt: row.added_at };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
