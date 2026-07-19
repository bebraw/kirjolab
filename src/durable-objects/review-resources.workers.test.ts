import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ReviewCatalogRecord } from "../domain/review-catalog";
import { ReviewAccess } from "./review-access";
import { ReviewCatalog } from "./review-catalog";

interface MigrationLedgerRow extends Record<string, SqlStorageValue> {
  name: string;
  version: number;
}

describe("ReviewCatalog in the Workers runtime", () => {
  it("creates, updates, lists, removes, and isolates independent reviews", async () => {
    const catalog = env.REVIEW_CATALOGS.getByName(`review-catalog-${crypto.randomUUID()}`);
    const other = env.REVIEW_CATALOGS.getByName(`review-catalog-${crypto.randomUUID()}`);
    const created = await catalog.createReview({ title: "  Evidence synthesis  ", profile: "slr" });

    expect(created).toMatchObject({
      title: "Evidence synthesis",
      profile: "slr",
      role: "owner",
      archivedAt: null,
      locator: { reviewId: created.id, storageKey: `review:${created.id}`, legacyWorkspaceId: null },
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(created.href).toBe(`/review/${created.id}`);
    expect(await catalog.getReview(created.id)).toEqual(created);
    expect(await catalog.listReviews()).toEqual([withoutLocator(created)]);
    expect(await other.listReviews()).toEqual([]);

    const archived = await catalog.updateReview(created.id, { title: "Reusable review", profile: "mlr", archived: true });
    expect(archived).toMatchObject({ id: created.id, title: "Reusable review", profile: "mlr" });
    expect(archived.archivedAt).not.toBeNull();
    const restored = await catalog.updateReview(created.id, { archived: false });
    expect(restored.archivedAt).toBeNull();

    await evictDurableObject(catalog);
    expect(await catalog.getReview(created.id)).toEqual(restored);
    expect(await runInDurableObject(catalog, (_instance: ReviewCatalog, state) => ledgerRows(state))).toEqual([
      { version: 1, name: "create-review-catalog" },
    ]);

    await catalog.removeReview(created.id);
    expect(await catalog.getReview(created.id)).toBeNull();
  });

  it("registers stable legacy locators idempotently and replicates canonical records", async () => {
    const ownerCatalog = env.REVIEW_CATALOGS.getByName(`legacy-owner-${crypto.randomUUID()}`);
    const memberCatalog = env.REVIEW_CATALOGS.getByName(`legacy-member-${crypto.randomUUID()}`);
    const createdAt = "2026-07-17T09:00:00.000Z";
    const legacy = await ownerCatalog.registerLegacyReview({
      title: "Legacy project review",
      profile: "slr",
      role: "owner",
      storageKey: "owner-key:demo",
      legacyWorkspaceId: "demo",
      createdAt,
      updatedAt: createdAt,
    });
    const repeated = await ownerCatalog.registerLegacyReview({
      title: "Renamed independent review",
      profile: "mlr",
      role: "owner",
      storageKey: "owner-key:demo",
      legacyWorkspaceId: "demo",
      updatedAt: "2026-07-19T09:00:00.000Z",
    });

    expect(repeated).toMatchObject({ id: legacy.id, title: "Renamed independent review", profile: "mlr", createdAt });
    expect(await ownerCatalog.getReviewByLegacyWorkspaceId("demo")).toEqual(repeated);
    await runInDurableObject(ownerCatalog, (instance: ReviewCatalog) => {
      expect(() =>
        instance.registerLegacyReview({
          reviewId: crypto.randomUUID(),
          title: "Conflicting review",
          profile: "slr",
          role: "owner",
          storageKey: "owner-key:demo",
          legacyWorkspaceId: "demo",
        }),
      ).toThrow("another review");
    });

    const memberRecord = await memberCatalog.registerReview({
      id: repeated.id,
      title: repeated.title,
      profile: repeated.profile,
      role: "member",
      storageKey: repeated.locator.storageKey,
      legacyWorkspaceId: repeated.locator.legacyWorkspaceId,
      createdAt: repeated.createdAt,
      updatedAt: repeated.updatedAt,
      archivedAt: repeated.archivedAt,
    });
    expect(memberRecord).toMatchObject({ id: repeated.id, role: "member", locator: repeated.locator });
    expect(await memberCatalog.listReviews()).toEqual([withoutLocator(memberRecord)]);
  });

  it("rejects malformed catalog identities and metadata", async () => {
    const catalog = env.REVIEW_CATALOGS.getByName(`review-catalog-bounds-${crypto.randomUUID()}`);
    await runInDurableObject(catalog, (instance: ReviewCatalog) => {
      expect(() => instance.createReview({ title: "", profile: "slr" })).toThrow("title");
      expect(() => instance.createReview({ title: "x".repeat(121), profile: "slr" })).toThrow("title");
      expect(() =>
        instance.registerLegacyReview({
          title: "Legacy",
          profile: "slr",
          role: "owner",
          storageKey: "invalid/storage/key",
          legacyWorkspaceId: "demo",
        }),
      ).toThrow("registration");
    });
    expect(await catalog.getReview("not-a-review")).toBeNull();
    expect(await catalog.getReviewByLegacyWorkspaceId("invalid/workspace")).toBeNull();
  });

  it("backs up internal locators and restores an empty catalog exactly", async () => {
    const source = env.REVIEW_CATALOGS.getByName(`review-catalog-backup-${crypto.randomUUID()}`);
    const target = env.REVIEW_CATALOGS.getByName(`review-catalog-restore-${crypto.randomUUID()}`);
    const record = await source.registerLegacyReview({
      reviewId: crypto.randomUUID(),
      title: "Restorable review",
      profile: "mlr",
      role: "owner",
      storageKey: "legacy:restorable-review",
      legacyWorkspaceId: "restorable-project",
      createdAt: "2026-07-17T09:00:00.000Z",
      updatedAt: "2026-07-18T09:00:00.000Z",
      archivedAt: "2026-07-19T09:00:00.000Z",
    });

    const backup = await source.getBackupSnapshot();
    expect(backup).toEqual({ records: [record], bookmark: null });
    expect(await source.listReviews()).toEqual([withoutLocator(record)]);

    await target.restoreBackupSnapshot(backup.records);
    expect(await target.getBackupSnapshot()).toEqual(backup);
    expect(await target.listReviews()).toEqual([withoutLocator(record)]);
    await runInDurableObject(target, (instance: ReviewCatalog) => {
      expect(() => instance.restoreBackupSnapshot(backup.records)).toThrow("not empty");
    });
  });
});

describe("ReviewAccess in the Workers runtime", () => {
  it("manages review membership independently from project membership", async () => {
    const access = env.REVIEW_ACCESS.getByName(`review-access-${crypto.randomUUID()}`);
    const reviewId = crypto.randomUUID();
    const owner = await access.initializeOwner(reviewId, " Owner@Example.TEST ");
    const member = await access.addMember(owner.email, " Member@Example.TEST ");

    expect(owner).toMatchObject({ email: "owner@example.test", role: "owner" });
    expect(member).toMatchObject({ email: "member@example.test", role: "member" });
    expect(await access.getRole(owner.email)).toBe("owner");
    expect(await access.getRole(member.email)).toBe("member");
    expect(await access.listMembers(member.email)).toEqual([owner, member]);
    await runInDurableObject(access, (instance: ReviewAccess) => {
      expect(() => instance.initializeOwner(reviewId, "different-owner@example.test")).toThrow("owner identity");
      expect(() => instance.addMember(member.email, "other@example.test")).toThrow("review owner");
      expect(() => instance.createProjectLink(member.email, "project-a")).toThrow("review owner");
      expect(() => instance.removeMember(owner.email, owner.email)).toThrow("cannot be removed");
    });

    await access.removeMember(owner.email, member.email);
    expect(await access.getRole(member.email)).toBeNull();
    await runInDurableObject(access, (instance: ReviewAccess) => {
      expect(() => instance.listMembers(member.email)).toThrow("denied");
    });

    await evictDurableObject(access);
    expect(await access.getRole(owner.email)).toBe("owner");
    expect(await runInDurableObject(access, (_instance: ReviewAccess, state) => ledgerRows(state))).toEqual([
      { version: 1, name: "create-review-access" },
    ]);
  });

  it("seeds legacy project members exactly once", async () => {
    const access = env.REVIEW_ACCESS.getByName(`legacy-review-access-${crypto.randomUUID()}`);
    const seeds = [
      { id: "a".repeat(32), email: "Owner@Example.TEST", role: "owner", addedAt: "2026-07-17T09:00:00.000Z" },
      { id: "b".repeat(32), email: "Member@Example.TEST", role: "member", addedAt: "2026-07-17T10:00:00.000Z" },
    ] as const;
    const [seeded, concurrent] = await Promise.all([access.initializeLegacyMembers(seeds), access.initializeLegacyMembers(seeds)]);
    const repeated = await access.initializeLegacyMembers([
      { email: "different-owner@example.test", role: "owner" },
      { email: "late-project-member@example.test", role: "member" },
    ]);

    expect(seeded.members.map((member) => member.email)).toEqual(["owner@example.test", "member@example.test"]);
    expect(concurrent).toEqual(seeded);
    expect(repeated).toEqual(seeded);
    expect(await access.getRole("late-project-member@example.test")).toBeNull();
    expect(await access.getAccessStatus()).toEqual({
      reviewId: seeded.reviewId,
      legacySeededAt: seeded.legacySeededAt,
      deletedAt: null,
    });

    const invalid = env.REVIEW_ACCESS.getByName(`invalid-legacy-access-${crypto.randomUUID()}`);
    await runInDurableObject(invalid, (instance: ReviewAccess) => {
      expect(() =>
        instance.initializeLegacyMembers([
          { email: "first@example.test", role: "owner" },
          { email: "second@example.test", role: "owner" },
        ]),
      ).toThrow("one owner");
    });
  });

  it("backs up all access state and restores exact identities into an empty target", async () => {
    const source = env.REVIEW_ACCESS.getByName(`review-access-backup-${crypto.randomUUID()}`);
    const target = env.REVIEW_ACCESS.getByName(`review-access-restore-${crypto.randomUUID()}`);
    const reviewId = crypto.randomUUID();
    const owner = await source.initializeOwner(reviewId, "owner@example.test");
    await source.addMember(owner.email, "member@example.test");
    const historical = await source.createProjectLink(owner.email, "project-history");
    await source.unlinkProject(owner.email, historical.id);
    await source.createProjectLink(owner.email, "project-active");

    const backup = await source.getBackupSnapshot(owner.email);
    expect(backup).toMatchObject({
      reviewId,
      legacySeededAt: null,
      deletedAt: null,
      members: [owner, expect.objectContaining({ email: "member@example.test", role: "member" })],
      projectLinks: [
        expect.objectContaining({ workspaceId: "project-history", status: "unlinked" }),
        expect.objectContaining({ workspaceId: "project-active", status: "active" }),
      ],
      bookmark: null,
    });

    const { bookmark: _bookmark, ...state } = backup;
    await target.restoreBackupSnapshot(state);
    expect(await target.getBackupSnapshot(owner.email)).toEqual(backup);
    expect(await target.listProjectLinks(owner.email, true)).toEqual(backup.projectLinks);
    await runInDurableObject(target, (instance: ReviewAccess) => {
      expect(() => instance.restoreBackupSnapshot(state)).toThrow("not empty");
    });
  });

  it("retains soft project-link history and isolates review deletion", async () => {
    const access = env.REVIEW_ACCESS.getByName(`linked-review-access-${crypto.randomUUID()}`);
    const reviewId = crypto.randomUUID();
    const owner = await access.initializeOwner(reviewId, "owner@example.test");
    const first = await access.createProjectLink(owner.email, "project-a");

    expect(await access.createProjectLink(owner.email, "project-a")).toEqual(first);
    expect(await access.listProjectLinks(owner.email)).toEqual([first]);
    const unlinked = await access.unlinkProject(owner.email, first.id);
    expect(unlinked).toMatchObject({ status: "unlinked", unlinkedBy: owner.email, unlinkedAt: expect.any(String) });
    expect(await access.listProjectLinks(owner.email)).toEqual([]);

    const replacement = await access.createProjectLink(owner.email, "project-a");
    const secondProject = await access.createProjectLink(owner.email, "project-b");
    expect(replacement.id).not.toBe(first.id);
    expect(await access.listProjectLinks(owner.email, true)).toHaveLength(3);

    const detached = await access.unlinkProjectsForDeletedWorkspace("project-b", "project-owner@example.test");
    expect(detached).toEqual([
      expect.objectContaining({ id: secondProject.id, status: "unlinked", unlinkedBy: "project-owner@example.test" }),
    ]);
    const boundary = await access.deleteReviewAccess(owner.email);
    expect(boundary).toEqual({ reviewId, deletedAt: expect.any(String), unlinkedProjectIds: ["project-a"] });
    expect(await access.getRole(owner.email)).toBeNull();
    expect(await access.getAccessStatus()).toEqual({ reviewId, legacySeededAt: null, deletedAt: boundary.deletedAt });
    await runInDurableObject(access, (instance: ReviewAccess) => {
      expect(() => instance.initializeOwner(reviewId, owner.email)).toThrow("deleted");
    });

    const retained = await runInDurableObject(access, (_instance: ReviewAccess, state) => ({
      memberCount: state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM review_members").one().count,
      links: state.storage.sql
        .exec<{
          workspace_id: string;
          status: string;
        }>("SELECT workspace_id, status FROM project_review_links ORDER BY created_at ASC, id ASC")
        .toArray(),
    }));
    expect(retained.memberCount).toBe(0);
    expect(retained.links).toEqual([
      { workspace_id: "project-a", status: "unlinked" },
      { workspace_id: "project-a", status: "unlinked" },
      { workspace_id: "project-b", status: "unlinked" },
    ]);
  });
});

function withoutLocator(record: ReviewCatalogRecord) {
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

function ledgerRows(state: DurableObjectState): MigrationLedgerRow[] {
  return state.storage.sql.exec<MigrationLedgerRow>("SELECT version, name FROM _kirjolab_migrations ORDER BY version ASC").toArray();
}
