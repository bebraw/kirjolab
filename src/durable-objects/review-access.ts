import { DurableObject } from "cloudflare:workers";
import {
  isIsoTimestamp,
  isReviewId,
  isReviewRole,
  isWorkspaceRouteId,
  normalizeReviewEmail,
  reviewResourceLimits,
  type ProjectReviewLink,
  type ReviewAccessBackupSnapshot,
  type ReviewAccessBackupState,
  type ReviewAccessStatus,
  type ReviewDeletionBoundary,
  type ReviewDeletionSnapshot,
  type ReviewLegacyInitialization,
  type ReviewMember,
  type ReviewMemberSeed,
  type ReviewRole,
} from "../domain/review-catalog";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";
import { currentRecoveryBookmark } from "./recovery";

const migrations = [
  {
    version: 1,
    name: "create-review-access",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE review_access_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          review_id TEXT NOT NULL UNIQUE,
          legacy_seeded_at TEXT,
          deleted_at TEXT
        );
        CREATE TABLE review_members (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
          added_at TEXT NOT NULL
        );
        CREATE TABLE project_review_links (
          id TEXT PRIMARY KEY,
          review_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('active', 'unlinked')),
          unlinked_at TEXT,
          unlinked_by TEXT,
          CHECK (
            (status = 'active' AND unlinked_at IS NULL AND unlinked_by IS NULL) OR
            (status = 'unlinked' AND unlinked_at IS NOT NULL AND unlinked_by IS NOT NULL)
          )
        );
        CREATE UNIQUE INDEX active_project_review_link
          ON project_review_links(workspace_id) WHERE status = 'active';
        CREATE INDEX project_review_link_history
          ON project_review_links(workspace_id, created_at DESC);
      `);
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];

interface ReviewAccessStateRow extends Record<string, SqlStorageValue> {
  review_id: string;
  legacy_seeded_at: string | null;
  deleted_at: string | null;
}

interface ReviewMemberRow extends Record<string, SqlStorageValue> {
  id: string;
  email: string;
  role: string;
  added_at: string;
}

interface ProjectReviewLinkRow extends Record<string, SqlStorageValue> {
  id: string;
  review_id: string;
  workspace_id: string;
  created_by: string;
  created_at: string;
  status: string;
  unlinked_at: string | null;
  unlinked_by: string | null;
}

export class ReviewAccess extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      runSQLiteMigrations(this.ctx.storage, migrations);
    });
  }

  initializeOwner(reviewId: string, emailValue: string): ReviewMember {
    assertReviewId(reviewId);
    const email = normalizeReviewEmail(emailValue);
    const state = this.state();
    this.assertCompatibleState(state, reviewId);
    const existingOwner = this.owner();
    if (existingOwner) {
      if (existingOwner.email !== email) throw new Error("Review owner identity cannot change");
      return existingOwner;
    }
    if (this.memberRows().length > 0) throw new Error("Review membership has no owner");
    const member: ReviewMember = {
      id: crypto.randomUUID(),
      email,
      role: "owner",
      addedAt: new Date().toISOString(),
    };
    this.ctx.storage.transactionSync(() => {
      if (!state) {
        this.ctx.storage.sql.exec(
          "INSERT INTO review_access_state (singleton, review_id, legacy_seeded_at, deleted_at) VALUES (1, ?, NULL, NULL)",
          reviewId,
        );
      }
      this.insertMember(member);
    });
    return member;
  }

  initializeLegacyMembers(seeds: readonly ReviewMemberSeed[]): ReviewLegacyInitialization {
    const state = this.state();
    if (state && state.deleted_at !== null) throw new Error("Review access was deleted");
    if (state?.legacy_seeded_at) return legacyInitializationFromState(state, this.memberRows());
    if (this.memberRows().length > 0) throw new Error("Review membership was initialized before legacy seeding");
    const normalized = normalizeLegacySeeds(seeds);
    const reviewId = state?.review_id ?? crypto.randomUUID();
    const seededAt = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      if (state) {
        this.ctx.storage.sql.exec("UPDATE review_access_state SET legacy_seeded_at = ? WHERE singleton = 1", seededAt);
      } else {
        this.ctx.storage.sql.exec(
          "INSERT INTO review_access_state (singleton, review_id, legacy_seeded_at, deleted_at) VALUES (1, ?, ?, NULL)",
          reviewId,
          seededAt,
        );
      }
      for (const member of normalized) this.insertMember(member);
    });
    return { reviewId, members: this.memberRows().map(memberFromRow), legacySeededAt: seededAt };
  }

  getAccessStatus(): ReviewAccessStatus {
    const state = this.state();
    return {
      reviewId: state?.review_id ?? null,
      legacySeededAt: state?.legacy_seeded_at ?? null,
      deletedAt: state?.deleted_at ?? null,
    };
  }

  getRole(emailValue: string): ReviewRole | null {
    const state = this.state();
    if (!state) return null;
    const email = normalizeReviewEmail(emailValue);
    const row = this.ctx.storage.sql.exec<ReviewMemberRow>("SELECT * FROM review_members WHERE email = ?", email).toArray()[0];
    if (row?.role !== "owner" && row?.role !== "member") return null;
    return state.deleted_at === null || row.role === "owner" ? row.role : null;
  }

  listMembers(requesterEmail: string): ReviewMember[] {
    this.requireRole(requesterEmail);
    return this.memberRows().map(memberFromRow);
  }

  beginReviewDeletion(requesterEmail: string): ReviewDeletionSnapshot {
    const boundary = this.deleteReviewAccess(requesterEmail);
    return {
      ...boundary,
      members: this.memberRows().map(memberFromRow),
      projectLinks: this.projectLinkRows().map(projectLinkFromRow),
    };
  }

  async getBackupSnapshot(ownerEmail: string): Promise<ReviewAccessBackupSnapshot> {
    this.requireOwner(ownerEmail);
    const state = this.activeState();
    return {
      reviewId: state.review_id,
      legacySeededAt: state.legacy_seeded_at,
      deletedAt: state.deleted_at,
      members: this.memberRows().map(memberFromRow),
      projectLinks: this.projectLinkRows().map(projectLinkFromRow),
      bookmark: await currentRecoveryBookmark(this.ctx.storage, this.env.AUTH_MODE),
    };
  }

  restoreBackupSnapshot(snapshot: ReviewAccessBackupState): void {
    const normalized = normalizedBackupState(snapshot);
    this.ctx.storage.transactionSync(() => {
      const memberCount = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM review_members").one().count;
      const linkCount = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM project_review_links").one().count;
      if (this.state() || memberCount !== 0 || linkCount !== 0) throw new Error("Review access restore target is not empty");
      this.ctx.storage.sql.exec(
        `INSERT INTO review_access_state (singleton, review_id, legacy_seeded_at, deleted_at)
         VALUES (1, ?, ?, ?)`,
        normalized.reviewId,
        normalized.legacySeededAt,
        normalized.deletedAt,
      );
      for (const member of normalized.members) this.insertMember(member);
      for (const link of normalized.projectLinks) this.insertProjectLink(link);
    });
  }

  addMember(requesterEmail: string, memberEmailValue: string): ReviewMember {
    this.requireOwner(requesterEmail);
    const email = normalizeReviewEmail(memberEmailValue);
    const existing = this.ctx.storage.sql.exec<ReviewMemberRow>("SELECT * FROM review_members WHERE email = ?", email).toArray()[0];
    if (existing) return memberFromRow(existing);
    if (this.memberRows().length >= reviewResourceLimits.members) throw new Error("Review member limit reached");
    const member: ReviewMember = {
      id: crypto.randomUUID(),
      email,
      role: "member",
      addedAt: new Date().toISOString(),
    };
    this.insertMember(member);
    return member;
  }

  removeMember(requesterEmail: string, memberEmailValue: string): void {
    this.requireOwner(requesterEmail);
    const email = normalizeReviewEmail(memberEmailValue);
    const row = this.ctx.storage.sql.exec<ReviewMemberRow>("SELECT * FROM review_members WHERE email = ?", email).toArray()[0];
    if (!row) return;
    if (row.role === "owner") throw new Error("Review owner cannot be removed");
    this.ctx.storage.sql.exec("DELETE FROM review_members WHERE email = ?", email);
  }

  createProjectLink(requesterEmail: string, workspaceId: string): ProjectReviewLink {
    const actor = this.requireOwner(requesterEmail).email;
    if (!isWorkspaceRouteId(workspaceId)) throw new Error("Review project identity is invalid");
    const existing = this.ctx.storage.sql
      .exec<ProjectReviewLinkRow>("SELECT * FROM project_review_links WHERE workspace_id = ? AND status = 'active'", workspaceId)
      .toArray()[0];
    if (existing) return projectLinkFromRow(existing);
    const count = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM project_review_links").one().count;
    if (count >= reviewResourceLimits.projectLinks) throw new Error("Review project-link limit reached");
    const state = this.activeState();
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO project_review_links (
         id, review_id, workspace_id, created_by, created_at, status, unlinked_at, unlinked_by
       ) VALUES (?, ?, ?, ?, ?, 'active', NULL, NULL)`,
      id,
      state.review_id,
      workspaceId,
      actor,
      createdAt,
    );
    return this.requiredProjectLink(id);
  }

  listProjectLinks(requesterEmail: string, includeUnlinked = false): ProjectReviewLink[] {
    this.requireRole(requesterEmail);
    return this.ctx.storage.sql
      .exec<ProjectReviewLinkRow>(
        includeUnlinked
          ? "SELECT * FROM project_review_links ORDER BY created_at ASC, id ASC"
          : "SELECT * FROM project_review_links WHERE status = 'active' ORDER BY created_at ASC, id ASC",
      )
      .toArray()
      .map(projectLinkFromRow);
  }

  getProjectLink(requesterEmail: string, linkId: string): ProjectReviewLink | null {
    this.requireRole(requesterEmail);
    if (!isReviewId(linkId)) return null;
    const row = this.ctx.storage.sql.exec<ProjectReviewLinkRow>("SELECT * FROM project_review_links WHERE id = ?", linkId).toArray()[0];
    return row ? projectLinkFromRow(row) : null;
  }

  unlinkProject(requesterEmail: string, linkId: string): ProjectReviewLink {
    const actor = this.requireOwner(requesterEmail).email;
    const link = this.requiredProjectLink(linkId);
    if (link.status === "unlinked") return link;
    this.unlinkActiveLinks("id = ?", [linkId], actor);
    return this.requiredProjectLink(linkId);
  }

  unlinkProjectsForDeletedWorkspace(workspaceId: string, actorValue: string): ProjectReviewLink[] {
    if (!isWorkspaceRouteId(workspaceId)) throw new Error("Review project identity is invalid");
    const actor = normalizeReviewEmail(actorValue);
    const state = this.state();
    if (!state) return [];
    const active = this.ctx.storage.sql
      .exec<ProjectReviewLinkRow>("SELECT * FROM project_review_links WHERE workspace_id = ? AND status = 'active'", workspaceId)
      .toArray();
    if (active.length === 0) return [];
    this.unlinkActiveLinks("workspace_id = ?", [workspaceId], actor);
    return active.map((row) => this.requiredProjectLink(row.id));
  }

  deleteReviewAccess(requesterEmail: string): ReviewDeletionBoundary {
    const { owner, state } = this.requireDeletionOwner(requesterEmail);
    if (state.deleted_at !== null) return this.deletionBoundary(state, owner.email);
    const activeLinks = this.ctx.storage.sql
      .exec<ProjectReviewLinkRow>("SELECT * FROM project_review_links WHERE status = 'active' ORDER BY workspace_id ASC")
      .toArray();
    const deletedAt = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "UPDATE project_review_links SET status = 'unlinked', unlinked_at = ?, unlinked_by = ? WHERE status = 'active'",
        deletedAt,
        owner.email,
      );
      this.ctx.storage.sql.exec("UPDATE review_access_state SET deleted_at = ? WHERE singleton = 1", deletedAt);
    });
    return {
      reviewId: state.review_id,
      deletedAt,
      unlinkedProjectIds: activeLinks.map((link) => link.workspace_id),
    };
  }

  private deletionBoundary(state: ReviewAccessStateRow, ownerEmail: string): ReviewDeletionBoundary {
    if (state.deleted_at === null) throw new Error("Review access is not deleted");
    return {
      reviewId: state.review_id,
      deletedAt: state.deleted_at,
      unlinkedProjectIds: this.projectLinkRows()
        .filter((link) => link.unlinked_at === state.deleted_at && link.unlinked_by === ownerEmail)
        .map((link) => link.workspace_id),
    };
  }

  private state(): ReviewAccessStateRow | null {
    return this.ctx.storage.sql.exec<ReviewAccessStateRow>("SELECT * FROM review_access_state WHERE singleton = 1").toArray()[0] ?? null;
  }

  private activeState(): ReviewAccessStateRow {
    const state = this.state();
    if (!state) throw new Error("Review access is not initialized");
    if (state.deleted_at !== null) throw new Error("Review access was deleted");
    return state;
  }

  private assertCompatibleState(state: ReviewAccessStateRow | null, reviewId: string): void {
    if (!state) return;
    if (state.review_id !== reviewId) throw new Error("Review access identity cannot change");
    if (state.deleted_at !== null) throw new Error("Review access was deleted");
  }

  private requireRole(emailValue: string): ReviewMember {
    this.activeState();
    const email = normalizeReviewEmail(emailValue);
    const row = this.ctx.storage.sql.exec<ReviewMemberRow>("SELECT * FROM review_members WHERE email = ?", email).toArray()[0];
    if (!row) throw new Error("Review access denied");
    return memberFromRow(row);
  }

  private requireOwner(emailValue: string): ReviewMember {
    const member = this.requireRole(emailValue);
    if (member.role !== "owner") throw new Error("Only the review owner can manage review access");
    return member;
  }

  private requireDeletionOwner(emailValue: string): { owner: ReviewMember; state: ReviewAccessStateRow } {
    const state = this.state();
    if (!state) throw new Error("Review access is not initialized");
    const email = normalizeReviewEmail(emailValue);
    const row = this.ctx.storage.sql.exec<ReviewMemberRow>("SELECT * FROM review_members WHERE email = ?", email).toArray()[0];
    if (!row || row.role !== "owner") throw new Error("Only the review owner can manage review access");
    return { owner: memberFromRow(row), state };
  }

  private owner(): ReviewMember | null {
    const row = this.ctx.storage.sql.exec<ReviewMemberRow>("SELECT * FROM review_members WHERE role = 'owner'").toArray()[0];
    return row ? memberFromRow(row) : null;
  }

  private memberRows(): ReviewMemberRow[] {
    return this.ctx.storage.sql
      .exec<ReviewMemberRow>("SELECT * FROM review_members ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, added_at ASC, id ASC")
      .toArray();
  }

  private projectLinkRows(): ProjectReviewLinkRow[] {
    return this.ctx.storage.sql.exec<ProjectReviewLinkRow>("SELECT * FROM project_review_links ORDER BY created_at ASC, id ASC").toArray();
  }

  private insertMember(member: ReviewMember): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO review_members (id, email, role, added_at) VALUES (?, ?, ?, ?)",
      member.id,
      member.email,
      member.role,
      member.addedAt,
    );
  }

  private insertProjectLink(link: ProjectReviewLink): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO project_review_links (
         id, review_id, workspace_id, created_by, created_at, status, unlinked_at, unlinked_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      link.id,
      link.reviewId,
      link.workspaceId,
      link.createdBy,
      link.createdAt,
      link.status,
      link.unlinkedAt,
      link.unlinkedBy,
    );
  }

  private requiredProjectLink(linkId: string): ProjectReviewLink {
    if (!isReviewId(linkId)) throw new Error("Review project link not found");
    const row = this.ctx.storage.sql.exec<ProjectReviewLinkRow>("SELECT * FROM project_review_links WHERE id = ?", linkId).toArray()[0];
    if (!row) throw new Error("Review project link not found");
    return projectLinkFromRow(row);
  }

  private unlinkActiveLinks(predicate: string, bindings: readonly SqlStorageValue[], actor: string): void {
    this.ctx.storage.sql.exec(
      `UPDATE project_review_links
       SET status = 'unlinked', unlinked_at = ?, unlinked_by = ?
       WHERE status = 'active' AND ${predicate}`,
      new Date().toISOString(),
      actor,
      ...bindings,
    );
  }
}

function legacyInitializationFromState(state: ReviewAccessStateRow, rows: readonly ReviewMemberRow[]): ReviewLegacyInitialization {
  if (!state.legacy_seeded_at) throw new Error("Legacy review membership is not initialized");
  return {
    reviewId: state.review_id,
    members: rows.map(memberFromRow),
    legacySeededAt: state.legacy_seeded_at,
  };
}

function normalizedBackupState(snapshot: ReviewAccessBackupState): ReviewAccessBackupState {
  if (
    !isReviewId(snapshot.reviewId) ||
    (snapshot.legacySeededAt !== null && !isIsoTimestamp(snapshot.legacySeededAt)) ||
    (snapshot.deletedAt !== null && !isIsoTimestamp(snapshot.deletedAt)) ||
    !Array.isArray(snapshot.members) ||
    !Array.isArray(snapshot.projectLinks) ||
    snapshot.members.length > reviewResourceLimits.members ||
    snapshot.projectLinks.length > reviewResourceLimits.projectLinks
  ) {
    throw new Error("Review access backup is invalid");
  }

  const members = snapshot.members.map(normalizedBackupMember);
  const projectLinks = snapshot.projectLinks.map((link) => normalizedBackupProjectLink(link, snapshot.reviewId));
  assertUnique(
    members.map((member) => member.id),
    "Review backup member identities must be unique",
  );
  assertUnique(
    members.map((member) => member.email),
    "Review backup member emails must be unique",
  );
  assertUnique(
    projectLinks.map((link) => link.id),
    "Review backup project-link identities must be unique",
  );
  assertUnique(
    projectLinks.filter((link) => link.status === "active").map((link) => link.workspaceId),
    "Review backup active project links must be unique",
  );

  const ownerCount = members.filter((member) => member.role === "owner").length;
  if (snapshot.deletedAt === null && ownerCount !== 1) throw new Error("Review access backup requires one owner");
  if (snapshot.deletedAt !== null && (members.length !== 0 || projectLinks.some((link) => link.status === "active"))) {
    throw new Error("Deleted review access backup is invalid");
  }

  return {
    reviewId: snapshot.reviewId,
    legacySeededAt: snapshot.legacySeededAt,
    deletedAt: snapshot.deletedAt,
    members,
    projectLinks,
  };
}

function normalizedBackupMember(member: ReviewMember): ReviewMember {
  if (
    !isPersonId(member.id) ||
    normalizeReviewEmail(member.email) !== member.email ||
    !isReviewRole(member.role) ||
    !isIsoTimestamp(member.addedAt)
  ) {
    throw new Error("Review backup member is invalid");
  }
  return { id: member.id, email: member.email, role: member.role, addedAt: member.addedAt };
}

function normalizedBackupProjectLink(link: ProjectReviewLink, reviewId: string): ProjectReviewLink {
  const hasValidUnlink =
    link.status === "active"
      ? link.unlinkedAt === null && link.unlinkedBy === null
      : link.status === "unlinked" &&
        link.unlinkedAt !== null &&
        isIsoTimestamp(link.unlinkedAt) &&
        link.unlinkedBy !== null &&
        normalizeReviewEmail(link.unlinkedBy) === link.unlinkedBy;
  if (
    !isReviewId(link.id) ||
    link.reviewId !== reviewId ||
    !isWorkspaceRouteId(link.workspaceId) ||
    normalizeReviewEmail(link.createdBy) !== link.createdBy ||
    !isIsoTimestamp(link.createdAt) ||
    !hasValidUnlink
  ) {
    throw new Error("Review backup project link is invalid");
  }
  return {
    id: link.id,
    reviewId: link.reviewId,
    workspaceId: link.workspaceId,
    createdBy: link.createdBy,
    createdAt: link.createdAt,
    status: link.status,
    unlinkedAt: link.unlinkedAt,
    unlinkedBy: link.unlinkedBy,
  };
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function normalizeLegacySeeds(seeds: readonly ReviewMemberSeed[]): ReviewMember[] {
  if (seeds.length === 0 || seeds.length > reviewResourceLimits.members) throw new Error("Legacy review members are invalid");
  const now = new Date().toISOString();
  const members = seeds.map((seed) => {
    const id = seed.id ?? crypto.randomUUID();
    const addedAt = seed.addedAt ?? now;
    if (!isPersonId(id) || !isReviewRole(seed.role) || !isIsoTimestamp(addedAt)) throw new Error("Legacy review member is invalid");
    return { id, email: normalizeReviewEmail(seed.email), role: seed.role, addedAt };
  });
  if (members.filter((member) => member.role === "owner").length !== 1) throw new Error("Legacy review members require one owner");
  if (new Set(members.map((member) => member.id)).size !== members.length)
    throw new Error("Legacy review member identities must be unique");
  if (new Set(members.map((member) => member.email)).size !== members.length) throw new Error("Legacy review member emails must be unique");
  return members;
}

function memberFromRow(row: ReviewMemberRow): ReviewMember {
  if (!isReviewRole(row.role)) throw new Error("Stored review member is invalid");
  return { id: row.id, email: row.email, role: row.role, addedAt: row.added_at };
}

function projectLinkFromRow(row: ProjectReviewLinkRow): ProjectReviewLink {
  if (row.status !== "active" && row.status !== "unlinked") throw new Error("Stored review project link is invalid");
  return {
    id: row.id,
    reviewId: row.review_id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    status: row.status,
    unlinkedAt: row.unlinked_at,
    unlinkedBy: row.unlinked_by,
  };
}

function assertReviewId(value: string): void {
  if (!isReviewId(value)) throw new Error("Review identity is invalid");
}

function isPersonId(value: string): boolean {
  return isReviewId(value) || /^[a-f0-9]{32}$/iu.test(value);
}
