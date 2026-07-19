import { DurableObject } from "cloudflare:workers";
import {
  isIsoTimestamp,
  isReviewId,
  isReviewProfile,
  isReviewRole,
  isReviewStorageKey,
  isWorkspaceRouteId,
  normalizeReviewTitle,
  reviewResourceLimits,
  type CreateReviewCatalogInput,
  type RegisterLegacyReviewInput,
  type RegisterReviewCatalogInput,
  type ReviewCatalogBackupSnapshot,
  type ReviewCatalogRecord,
  type ReviewSummary,
  type UpdateReviewCatalogInput,
} from "../domain/review-catalog";
import { runSQLiteMigrations, type SQLiteMigration } from "./migrations";
import { currentRecoveryBookmark } from "./recovery";

const migrations = [
  {
    version: 1,
    name: "create-review-catalog",
    apply(sql): undefined {
      sql.exec(`
        CREATE TABLE reviews (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          profile TEXT NOT NULL CHECK (profile IN ('slr', 'mlr')),
          role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
          storage_key TEXT NOT NULL UNIQUE,
          legacy_workspace_id TEXT UNIQUE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        );
        CREATE INDEX reviews_activity ON reviews(archived_at, updated_at DESC, title COLLATE NOCASE);
      `);
      return undefined;
    },
  },
] as const satisfies readonly SQLiteMigration[];

interface ReviewCatalogRow extends Record<string, SqlStorageValue> {
  id: string;
  title: string;
  profile: string;
  role: string;
  storage_key: string;
  legacy_workspace_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export class ReviewCatalog extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      runSQLiteMigrations(this.ctx.storage, migrations);
    });
  }

  createReview(input: CreateReviewCatalogInput): ReviewCatalogRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    return this.registerReview({
      id,
      title: input.title,
      profile: input.profile,
      role: "owner",
      storageKey: `review:${id}`,
      legacyWorkspaceId: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
  }

  registerReview(input: RegisterReviewCatalogInput): ReviewCatalogRecord {
    const normalized = normalizedRegistration(input);
    const existing = this.getReview(normalized.id);
    if (existing) {
      if (existing.locator.storageKey !== normalized.storageKey || existing.locator.legacyWorkspaceId !== normalized.legacyWorkspaceId) {
        throw new Error("Review catalog identity conflicts with its existing locator");
      }
      if (existing.profile !== normalized.profile) {
        throw new Error("Review method profile cannot change after creation");
      }
      this.ctx.storage.sql.exec(
        "UPDATE reviews SET title = ?, role = ?, updated_at = ?, archived_at = ? WHERE id = ?",
        normalized.title,
        normalized.role,
        normalized.updatedAt,
        normalized.archivedAt,
        normalized.id,
      );
      return this.requiredReview(normalized.id);
    }
    if (normalized.legacyWorkspaceId !== null) {
      const legacy = this.getReviewByLegacyWorkspaceId(normalized.legacyWorkspaceId);
      if (legacy && legacy.id !== normalized.id) throw new Error("Legacy workspace is already registered to another review");
    }
    const count = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM reviews").one().count;
    if (count >= reviewResourceLimits.catalogEntries) throw new Error("Review catalog limit reached");
    this.ctx.storage.sql.exec(
      `INSERT INTO reviews (
         id, title, profile, role, storage_key, legacy_workspace_id, created_at, updated_at, archived_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      normalized.id,
      normalized.title,
      normalized.profile,
      normalized.role,
      normalized.storageKey,
      normalized.legacyWorkspaceId,
      normalized.createdAt,
      normalized.updatedAt,
      normalized.archivedAt,
    );
    return this.requiredReview(normalized.id);
  }

  registerLegacyReview(input: RegisterLegacyReviewInput): ReviewCatalogRecord {
    if (!isWorkspaceRouteId(input.legacyWorkspaceId)) throw new Error("Legacy review workspace identity is invalid");
    const existing = this.getReviewByLegacyWorkspaceId(input.legacyWorkspaceId);
    if (existing && input.reviewId && existing.id !== input.reviewId) {
      throw new Error("Legacy workspace is already registered to another review");
    }
    if (existing && existing.locator.storageKey !== input.storageKey) {
      throw new Error("Legacy review storage locator cannot change");
    }
    const now = new Date().toISOString();
    return this.registerReview({
      id: existing?.id ?? input.reviewId ?? crypto.randomUUID(),
      title: input.title,
      profile: input.profile,
      role: input.role,
      storageKey: input.storageKey,
      legacyWorkspaceId: input.legacyWorkspaceId,
      createdAt: existing?.createdAt ?? input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
      archivedAt: input.archivedAt ?? null,
    });
  }

  listReviews(): ReviewSummary[] {
    return this.ctx.storage.sql
      .exec<ReviewCatalogRow>(
        `SELECT * FROM reviews
         ORDER BY CASE WHEN archived_at IS NULL THEN 0 ELSE 1 END, updated_at DESC, title COLLATE NOCASE
         LIMIT ?`,
        reviewResourceLimits.catalogEntries,
      )
      .toArray()
      .map(summaryFromRow);
  }

  async getBackupSnapshot(): Promise<ReviewCatalogBackupSnapshot> {
    const records = this.ctx.storage.sql.exec<ReviewCatalogRow>("SELECT * FROM reviews ORDER BY id ASC").toArray().map(recordFromRow);
    return { records, bookmark: await currentRecoveryBookmark(this.ctx.storage, this.env.AUTH_MODE) };
  }

  restoreBackupSnapshot(records: readonly ReviewCatalogRecord[]): void {
    const count = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM reviews").one().count;
    if (count !== 0) throw new Error("Review catalog restore target is not empty");
    if (records.length > reviewResourceLimits.catalogEntries) throw new Error("Review catalog backup is invalid");
    const registrations = records.map(registrationFromRecord);
    assertUnique(
      registrations.map((record) => record.id),
      "Review catalog backup identities must be unique",
    );
    assertUnique(
      registrations.map((record) => record.storageKey),
      "Review catalog backup locators must be unique",
    );
    assertUnique(
      registrations.flatMap((record) => (record.legacyWorkspaceId === null ? [] : [record.legacyWorkspaceId])),
      "Review catalog legacy locators must be unique",
    );
    this.ctx.storage.transactionSync(() => {
      for (const registration of registrations) this.registerReview(registration);
    });
  }

  getReview(id: string): ReviewCatalogRecord | null {
    if (!isReviewId(id)) return null;
    const row = this.ctx.storage.sql.exec<ReviewCatalogRow>("SELECT * FROM reviews WHERE id = ?", id).toArray()[0];
    return row ? recordFromRow(row) : null;
  }

  getReviewByLegacyWorkspaceId(workspaceId: string): ReviewCatalogRecord | null {
    if (!isWorkspaceRouteId(workspaceId)) return null;
    const row = this.ctx.storage.sql
      .exec<ReviewCatalogRow>("SELECT * FROM reviews WHERE legacy_workspace_id = ?", workspaceId)
      .toArray()[0];
    return row ? recordFromRow(row) : null;
  }

  updateReview(id: string, input: UpdateReviewCatalogInput): ReviewCatalogRecord {
    const current = this.requiredReview(id);
    const title = input.title === undefined ? current.title : normalizeReviewTitle(input.title);
    const archivedAt = input.archived === undefined ? current.archivedAt : input.archived ? new Date().toISOString() : null;
    this.ctx.storage.sql.exec(
      "UPDATE reviews SET title = ?, updated_at = ?, archived_at = ? WHERE id = ?",
      title,
      new Date().toISOString(),
      archivedAt,
      id,
    );
    return this.requiredReview(id);
  }

  removeReview(id: string): void {
    if (!isReviewId(id)) return;
    this.ctx.storage.sql.exec("DELETE FROM reviews WHERE id = ?", id);
  }

  private requiredReview(id: string): ReviewCatalogRecord {
    const review = this.getReview(id);
    if (!review) throw new Error("Review not found");
    return review;
  }
}

function normalizedRegistration(input: RegisterReviewCatalogInput): RegisterReviewCatalogInput {
  if (
    !isReviewId(input.id) ||
    !isReviewProfile(input.profile) ||
    !isReviewRole(input.role) ||
    !isReviewStorageKey(input.storageKey) ||
    (input.legacyWorkspaceId !== null && !isWorkspaceRouteId(input.legacyWorkspaceId)) ||
    !isIsoTimestamp(input.createdAt) ||
    !isIsoTimestamp(input.updatedAt) ||
    (input.archivedAt !== null && !isIsoTimestamp(input.archivedAt))
  ) {
    throw new Error("Review catalog registration is invalid");
  }
  return { ...input, title: normalizeReviewTitle(input.title) };
}

function summaryFromRow(row: ReviewCatalogRow): ReviewSummary {
  const record = recordFromRow(row);
  return {
    id: record.id,
    title: record.title,
    profile: record.profile,
    href: record.href,
    role: record.role,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt,
  };
}

function recordFromRow(row: ReviewCatalogRow): ReviewCatalogRecord {
  if (!isReviewProfile(row.profile) || !isReviewRole(row.role)) throw new Error("Stored review catalog record is invalid");
  return {
    id: row.id,
    title: row.title,
    profile: row.profile,
    href: `/review/${row.id}`,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    locator: { reviewId: row.id, storageKey: row.storage_key, legacyWorkspaceId: row.legacy_workspace_id },
  };
}

function registrationFromRecord(record: ReviewCatalogRecord): RegisterReviewCatalogInput {
  if (record.href !== `/review/${record.id}` || record.locator.reviewId !== record.id) {
    throw new Error("Review catalog backup is invalid");
  }
  return normalizedRegistration({
    id: record.id,
    title: record.title,
    profile: record.profile,
    role: record.role,
    storageKey: record.locator.storageKey,
    legacyWorkspaceId: record.locator.legacyWorkspaceId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt,
  });
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message);
}
