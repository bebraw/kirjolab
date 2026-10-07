import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import {
  legacyOwnerBackupSchemaVersion,
  ownerBackupDigest,
  ownerBackupManifestJson,
  ownerBackupSchemaVersion,
  parseOwnerBackupManifest,
  projectAssociatedReviewOwnerBackupSchemaVersion,
  type LegacyOwnerBackupManifest,
  type ProjectAssociatedReviewOwnerBackupManifest,
  type ProjectAssociatedReviewOwnerBackupState,
} from "../domain/backup/backups";
import { builtInProjectTemplate } from "../domain/project/project-templates";
import { defaultReviewProtocol } from "../domain/review/review-study";
import { BackupCoordinator } from "./backup-coordinator";
import { BackupRecovery } from "./backup-recovery";
import { DocumentRoom } from "./document-room";

describe("BackupCoordinator in the Workers runtime", () => {
  it("backs up current state while explicitly recording a missing image from legacy-only history", async () => {
    const ownerKey = await sha256Hex(crypto.randomUUID());
    const ownerEmail = "legacy-image-owner@example.test";
    const workspaceId = crypto.randomUUID();
    const room = env.DOCUMENT_ROOMS.getByName(workspaceId);
    const coordinator = env.BACKUP_COORDINATOR.getByName(`legacy-image-${crypto.randomUUID()}`);
    await env.WORKSPACE_CATALOGS.getByName(ownerKey).registerWorkspace(workspaceId, "Legacy image fixture");
    await env.WORKSPACE_ACCESS.getByName(workspaceId).initializeOwner(ownerEmail);
    await room.initializeWorkspace("Legacy image fixture");
    const assetId = crypto.randomUUID();
    const sourceKey = `${workspaceId}/assets/${assetId}`;
    await room.registerProjectAsset(workspaceId, {
      id: assetId,
      path: "figures/legacy.png",
      mediaType: "image/png",
      size: 3,
      objectKey: sourceKey,
      fingerprint: "test:legacy-image",
      createdAt: "2026-07-17T08:07:37.000Z",
      updatedAt: "2026-07-17T08:07:37.000Z",
    });
    await room.deleteProjectAsset(workspaceId, assetId);
    await runInDurableObject(room, (_instance: DocumentRoom, state) => {
      state.storage.sql.exec("UPDATE project_revisions SET created_at = ?", "2026-07-17T08:31:51.000Z");
    });
    await coordinator.registerOwner(ownerKey, ownerEmail);

    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(coordinator.runScheduledBackups()).resolves.toEqual({
        checked: 1,
        created: 1,
        unchanged: 0,
        failed: 0,
        truncated: false,
        ownersWithHistoricalGaps: 1,
      });
      expect(warning).toHaveBeenCalledOnce();
      expect(JSON.parse(String(warning.mock.calls[0]?.[0]))).toEqual({
        event: "backup-owner-history-gap",
        ownerKey,
        sourceKeys: [sourceKey],
      });
    } finally {
      warning.mockRestore();
    }
    const created = await coordinator.getStatus(ownerKey);
    expect(created).toMatchObject({ outcome: "created", error: null, unavailableHistoricalBinaries: [sourceKey] });
    const object = await env.PAPERS.get(created.manifestKey!);
    if (!object) throw new Error("Expected a backup manifest despite the historical gap");
    const manifest = parseOwnerBackupManifest(await object.text());
    expect(manifest.state).toMatchObject({ unavailableHistoricalBinaries: [sourceKey] });
    expect(manifest.state.workspaces[0]?.snapshot.assets).toEqual([]);
    expect(manifest.binaries).toEqual([]);
    const artifacts = await backupArtifactCount(ownerKey);
    await expect(coordinator.runOwnerBackup(ownerKey, ownerEmail)).resolves.toMatchObject({
      outcome: "unchanged",
      manifestKey: created.manifestKey,
      unavailableHistoricalBinaries: [sourceKey],
    });
    expect(await backupArtifactCount(ownerKey)).toBe(artifacts);
    await expect(coordinator.runRecoveryDrill(ownerKey)).resolves.toMatchObject({
      outcome: "verified",
      error: null,
      binariesChecked: 0,
      unavailableHistoricalBinaries: [sourceKey],
    });

    await env.PAPERS.put(sourceKey, "png");
    const repaired = await coordinator.runOwnerBackup(ownerKey, ownerEmail);
    expect(repaired).toMatchObject({ outcome: "created", unavailableHistoricalBinaries: [] });
    expect(repaired.digest).not.toBe(created.digest);
    const repairedObject = await env.PAPERS.get(repaired.manifestKey!);
    if (!repairedObject) throw new Error("Expected a repaired backup manifest");
    const repairedManifest = parseOwnerBackupManifest(await repairedObject.text());
    expect(repairedManifest.state).not.toHaveProperty("unavailableHistoricalBinaries");
    expect(repairedManifest.binaries).toEqual([expect.objectContaining({ sourceKey, size: 3 })]);
  });

  it.each([
    { lastReferencedAt: "2026-07-17T08:31:51.000Z", deleted: false, mixedHistory: false, legacyReference: false },
    { lastReferencedAt: "2026-07-31T00:00:00.000Z", deleted: true, mixedHistory: false, legacyReference: false },
    { lastReferencedAt: "2026-10-07T00:00:00.000Z", deleted: true, mixedHistory: false, legacyReference: false },
    { lastReferencedAt: "invalid", deleted: true, mixedHistory: false, legacyReference: false },
    { lastReferencedAt: "123", deleted: true, mixedHistory: false, legacyReference: false },
    { lastReferencedAt: "2026-02-31T00:00:00.000Z", deleted: true, mixedHistory: false, legacyReference: false },
    { lastReferencedAt: "2026-10-07T00:00:00.000Z", deleted: true, mixedHistory: true, legacyReference: true },
    { lastReferencedAt: "2026-10-07T00:00:00.000Z", deleted: true, mixedHistory: false, legacyReference: true },
  ])(
    "fails missing current images and newer or unclassifiable history: $lastReferencedAt, deleted=$deleted, mixed=$mixedHistory, legacy=$legacyReference",
    async ({ lastReferencedAt, deleted, mixedHistory, legacyReference }) => {
      const ownerKey = await sha256Hex(crypto.randomUUID());
      const ownerEmail = "required-image-owner@example.test";
      const workspaceId = crypto.randomUUID();
      const room = env.DOCUMENT_ROOMS.getByName(workspaceId);
      const coordinator = env.BACKUP_COORDINATOR.getByName(`required-image-${crypto.randomUUID()}`);
      await env.WORKSPACE_CATALOGS.getByName(ownerKey).registerWorkspace(workspaceId, "Required image fixture");
      await env.WORKSPACE_ACCESS.getByName(workspaceId).initializeOwner(ownerEmail);
      await room.initializeWorkspace("Required image fixture");
      const assetId = crypto.randomUUID();
      const sourceKey = `${workspaceId}/assets/${assetId}`;
      await room.registerProjectAsset(workspaceId, {
        id: assetId,
        path: "figures/required.png",
        mediaType: "image/png",
        size: 3,
        objectKey: sourceKey,
        fingerprint: "test:required-image",
        createdAt: "2026-07-17T08:07:37.000Z",
        updatedAt: "2026-07-17T08:07:37.000Z",
      });
      if (mixedHistory) await room.renameWorkspace("Later required image fixture");
      if (deleted) await room.deleteProjectAsset(workspaceId, assetId);
      await runInDurableObject(room, (_instance: DocumentRoom, state) => {
        state.storage.sql.exec("UPDATE project_revisions SET created_at = ?", lastReferencedAt);
        if (legacyReference) {
          state.storage.sql.exec(
            "UPDATE project_revisions SET created_at = ? WHERE revision = (SELECT MIN(revision) FROM project_revisions WHERE instr(snapshot_json, ?) > 0)",
            "2026-07-17T08:31:51.000Z",
            sourceKey,
          );
        }
      });
      await expect(coordinator.runOwnerBackup(ownerKey, ownerEmail)).resolves.toMatchObject({
        outcome: "failed",
        error: `A referenced backup source is missing: ${sourceKey}`,
        unavailableHistoricalBinaries: [],
      });
      expect(await backupArtifactCount(ownerKey)).toBe(0);
    },
  );

  it("creates immutable owner backups only when state changes and reports source failures", async () => {
    const ownerKey = await sha256Hex(crypto.randomUUID());
    const ownerEmail = "owner@example.test";
    const workspaceId = crypto.randomUUID();
    const pdfId = crypto.randomUUID();
    const sourceKey = `pdf-blobs/sha256/${await sha256Hex("pdf fixture")}.pdf`;
    const catalog = env.WORKSPACE_CATALOGS.getByName(ownerKey);
    const access = env.WORKSPACE_ACCESS.getByName(workspaceId);
    const room = env.DOCUMENT_ROOMS.getByName(workspaceId);
    const review = env.REVIEW_STUDIES.getByName(workspaceId);
    const reviewAccess = env.REVIEW_ACCESS.getByName(workspaceId);
    const reviewCatalog = env.REVIEW_CATALOGS.getByName(ownerKey);
    const coordinator = env.BACKUP_COORDINATOR.getByName(`backup-${crypto.randomUUID()}`);
    const templates = env.PROJECT_TEMPLATE_CATALOGS.getByName(ownerKey);

    await catalog.registerWorkspace(workspaceId, "Backup fixture");
    const workspaceOwner = await access.initializeOwner(ownerEmail);
    await room.initializeWorkspace("Backup fixture");
    const legacyReview = await reviewAccess.initializeLegacyMembers([workspaceOwner]);
    const projectLink = await reviewAccess.createProjectLink(ownerEmail, workspaceId);
    await reviewCatalog.registerLegacyReview({
      reviewId: legacyReview.reviewId,
      title: "Backup fixture review",
      profile: "slr",
      role: "owner",
      storageKey: workspaceId,
      legacyWorkspaceId: workspaceId,
    });
    const initialReview = await review.getSnapshot("slr", ownerEmail);
    await review.replaceProtocol({
      expectedRevision: initialReview.revision,
      content: { ...defaultReviewProtocol(), objective: "Backed-up review" },
      actor: ownerEmail,
    });
    await env.PAPERS.put(sourceKey, new TextEncoder().encode("pdf fixture"), {
      httpMetadata: { contentType: "application/pdf" },
    });
    await room.registerPdf({
      id: pdfId,
      name: "fixture.pdf",
      contentType: "application/pdf",
      size: 11,
      objectKey: sourceKey,
      fingerprint: "test:fixture",
      createdAt: new Date().toISOString(),
    });
    const personalTemplate = await templates.saveTemplate({
      name: "Backed-up template",
      description: "Portable structure",
      seed: builtInProjectTemplate("builtin-blank")!.seed,
    });

    const created = await coordinator.runOwnerBackup(ownerKey, ownerEmail);
    expect(created).toMatchObject({ outcome: "created", error: null });
    expect(created.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(created.manifestKey).toMatch(new RegExp(`^backups/manifests/${ownerKey}/`, "u"));

    const manifestObject = await env.PAPERS.get(created.manifestKey!);
    expect(manifestObject).not.toBeNull();
    const manifestJson = await manifestObject!.text();
    const manifest = parseOwnerBackupManifest(manifestJson);
    if (manifest.schemaVersion !== ownerBackupSchemaVersion) throw new Error("Expected a v3 backup manifest");
    expect(manifest).toMatchObject({
      schemaVersion: ownerBackupSchemaVersion,
      digest: created.digest,
      state: { ownerKey, catalog: [{ id: workspaceId, title: "Backup fixture" }] },
      recovery: { catalog: null, library: null },
    });
    expect(manifest.state.workspaces).toHaveLength(1);
    expect(manifest.state.reviews).toHaveLength(1);
    expect(manifest.state.templates).toEqual([expect.objectContaining({ id: personalTemplate.id, name: "Backed-up template" })]);
    expect(manifest.state.workspaces[0]?.members).toEqual([expect.objectContaining({ email: ownerEmail, role: "owner" })]);
    expect(manifest.state.workspaces[0]).not.toHaveProperty("reviewPayload");
    expect(manifest.state.workspaces[0]).not.toHaveProperty("reviewRevisionSeed");
    const reviewBackup = manifest.state.reviews[0];
    expect(reviewBackup).toMatchObject({
      catalogRecord: {
        id: legacyReview.reviewId,
        title: "Backup fixture review",
        profile: "slr",
        role: "owner",
        locator: { storageKey: workspaceId, legacyWorkspaceId: workspaceId },
      },
      access: {
        reviewId: legacyReview.reviewId,
        members: [expect.objectContaining({ email: ownerEmail, role: "owner" })],
        projectLinks: [projectLink],
      },
    });
    const reviewPayload = reviewBackup?.reviewPayload;
    expect(reviewPayload).toMatchObject({
      schemaVersion: "kirjolab-review-backup-v1",
      backupKey: expect.stringMatching(`^backups/reviews/${ownerKey}/[a-f0-9]{64}\\.json$`),
      reviewRevision: 2,
      protocolRevision: 2,
    });
    if (!reviewPayload) throw new Error("Expected a review backup payload");
    expect(manifestJson).not.toContain("Backed-up review");
    const reviewPayloadObject = await env.PAPERS.get(reviewPayload.backupKey);
    expect(reviewPayloadObject).not.toBeNull();
    const reviewPayloadBody = await reviewPayloadObject!.text();
    expect(reviewPayloadBody).toContain("Backed-up review");
    expect(reviewBackup?.reviewRevisionSeed).toBe("review:2:protocol:2");
    expect(manifest.binaries).toEqual([
      expect.objectContaining({ sourceKey, size: 11, backupKey: expect.stringMatching(`^backups/blobs/${ownerKey}/`) }),
    ]);
    expect(await env.PAPERS.head(manifest.binaries[0]!.backupKey)).not.toBeNull();

    const artifactCount = await backupArtifactCount(ownerKey);
    const unchanged = await coordinator.runOwnerBackup(ownerKey, ownerEmail);
    expect(unchanged).toMatchObject({ outcome: "unchanged", digest: created.digest, manifestKey: created.manifestKey, error: null });
    expect(await backupArtifactCount(ownerKey)).toBe(artifactCount);

    await room.deletePdf(pdfId);
    await room.renameWorkspace("Changed backup fixture");
    const changed = await coordinator.runOwnerBackup(ownerKey, ownerEmail);
    expect(changed).toMatchObject({ outcome: "created", error: null });
    expect(changed.digest).not.toBe(created.digest);
    expect(changed.manifestKey).not.toBe(created.manifestKey);
    const changedManifestObject = await env.PAPERS.get(changed.manifestKey!);
    if (!changedManifestObject) throw new Error("Expected a changed backup manifest");
    const changedManifest = parseOwnerBackupManifest(await changedManifestObject.text());
    expect(changedManifest.state.workspaces[0]?.snapshot.pdfs).toEqual([]);
    expect(changedManifest.binaries).toEqual([
      expect.objectContaining({ sourceKey, size: 11, backupKey: expect.stringMatching(`^backups/blobs/${ownerKey}/`) }),
    ]);

    const drill = await coordinator.runRecoveryDrill(ownerKey);
    expect(drill).toMatchObject({
      outcome: "verified",
      digest: changed.digest,
      manifestKey: changed.manifestKey,
      binariesChecked: 1,
      reviewsChecked: 1,
      error: null,
    });
    expect(drill.recoveryIdentity).toMatch(new RegExp(`^drill:${ownerKey}:`, "u"));
    const recovery = env.BACKUP_RECOVERIES.getByName(drill.recoveryIdentity!);
    expect(await recovery.getRestoredManifest()).toContain(`"digest":"${changed.digest}"`);
    expect(
      await runInDurableObject(recovery, (_instance: BackupRecovery, durableState) =>
        durableState.storage.sql
          .exec<{ version: number; name: string }>("SELECT version, name FROM _kirjolab_migrations ORDER BY version")
          .toArray(),
      ),
    ).toEqual([
      { version: 1, name: "create-isolated-backup-recovery" },
      { version: 2, name: "record-recovered-review-studies" },
      { version: 3, name: "address-independent-review-recoveries" },
    ]);
    const recoveredReviews = await recovery.getRestoredReviewStudies();
    const reviewRecoveryIdentity = `review-drill:${changed.digest}:${legacyReview.reviewId}`;
    const reviewCatalogRecoveryIdentity = `review-catalog-drill:${changed.digest}`;
    expect(recoveredReviews).toEqual([
      expect.objectContaining({
        reviewId: legacyReview.reviewId,
        workspaceId: null,
        catalogRecoveryIdentity: reviewCatalogRecoveryIdentity,
        accessRecoveryIdentity: reviewRecoveryIdentity,
        recoveryIdentity: reviewRecoveryIdentity,
        payloadDigest: reviewPayload.payloadDigest,
        authorityDigest: reviewPayload.authorityDigest,
        reviewRevision: reviewPayload.reviewRevision,
      }),
    ]);
    expect((await env.REVIEW_CATALOGS.getByName(reviewCatalogRecoveryIdentity).getBackupSnapshot()).records).toEqual([
      expect.objectContaining({
        id: legacyReview.reviewId,
        locator: { reviewId: legacyReview.reviewId, storageKey: reviewRecoveryIdentity, legacyWorkspaceId: workspaceId },
      }),
    ]);
    const recoveredAccess = await env.REVIEW_ACCESS.getByName(reviewRecoveryIdentity).getBackupSnapshot(ownerEmail);
    expect(recoveredAccess).toMatchObject({
      reviewId: legacyReview.reviewId,
      members: [expect.objectContaining({ email: ownerEmail, role: "owner" })],
      projectLinks: [projectLink],
    });
    const recoveredReview = env.REVIEW_STUDIES.getByName(recoveredReviews[0]!.recoveryIdentity);
    expect(await recoveredReview.getBackupVerification()).toEqual({
      payloadDigest: reviewPayload.payloadDigest,
      authorityDigest: reviewPayload.authorityDigest,
      reviewRevision: reviewPayload.reviewRevision,
      protocolRevision: reviewPayload.protocolRevision,
      historyFloorRevision: reviewPayload.historyFloorRevision,
    });
    expect((await review.getSnapshot()).protocol.objective).toBe("Backed-up review");
    const chunkedManifest = JSON.stringify({
      ...manifest,
      state: { ...manifest.state, library: { ...manifest.state.library, recoveryPadding: `${"x".repeat(300_000)}😀` } },
    });
    await expect(recovery.restoreManifest(chunkedManifest)).resolves.toEqual({ ok: true });
    expect(await recovery.getRestoredManifest()).toBe(chunkedManifest);

    await env.PAPERS.delete(reviewPayload.backupKey);
    expect(await coordinator.runRecoveryDrill(ownerKey)).toMatchObject({
      outcome: "failed",
      digest: changed.digest,
      manifestKey: changed.manifestKey,
      binariesChecked: 1,
      reviewsChecked: 0,
      error: "A review backup payload is unavailable or has the wrong size",
    });
    await env.PAPERS.put(reviewPayload.backupKey, reviewPayloadBody, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });

    await env.PAPERS.delete(manifest.binaries[0]!.backupKey);
    expect(await coordinator.runRecoveryDrill(ownerKey)).toMatchObject({
      outcome: "failed",
      digest: changed.digest,
      manifestKey: changed.manifestKey,
      binariesChecked: 0,
      reviewsChecked: 0,
      error: "A backup binary is unavailable or has the wrong size",
    });

    await env.PAPERS.delete(sourceKey);
    const failed = await coordinator.runOwnerBackup(ownerKey, ownerEmail);
    expect(failed).toMatchObject({
      outcome: "failed",
      digest: changed.digest,
      manifestKey: changed.manifestKey,
      lastBackedUpAt: changed.lastBackedUpAt,
      error: `A referenced backup source is missing: ${sourceKey}`,
    });

    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(coordinator.runScheduledBackups()).resolves.toEqual({
        checked: 1,
        created: 0,
        unchanged: 0,
        failed: 1,
        truncated: false,
        ownersWithHistoricalGaps: 0,
      });
      expect(errorLog).toHaveBeenCalledOnce();
      expect(JSON.parse(String(errorLog.mock.calls[0]?.[0]))).toEqual({
        event: "backup-owner-failed",
        ownerKey,
        error: `A referenced backup source is missing: ${sourceKey}`,
      });
      expect(String(errorLog.mock.calls[0]?.[0])).not.toContain(ownerEmail);
    } finally {
      errorLog.mockRestore();
    }
  });

  it("registers unregistered legacy studies from archived projects before scheduled v3 backups", async () => {
    const ownerKey = await sha256Hex(crypto.randomUUID());
    const ownerEmail = `archived-review-owner-${crypto.randomUUID()}@example.test`;
    const workspaceId = crypto.randomUUID();
    const catalog = env.WORKSPACE_CATALOGS.getByName(ownerKey);
    const access = env.WORKSPACE_ACCESS.getByName(workspaceId);
    const room = env.DOCUMENT_ROOMS.getByName(workspaceId);
    const study = env.REVIEW_STUDIES.getByName(workspaceId);
    const coordinator = env.BACKUP_COORDINATOR.getByName(`archived-review-backup-${crypto.randomUUID()}`);

    await catalog.registerWorkspace(workspaceId, "Archived legacy review");
    await access.initializeOwner(ownerEmail);
    await room.initializeWorkspace("Archived legacy review");
    const initial = await study.getSnapshot("mlr", ownerEmail);
    await study.replaceProtocol({
      expectedRevision: initial.revision,
      content: { ...defaultReviewProtocol("mlr"), objective: "Preserve archived legacy evidence" },
      actor: ownerEmail,
    });
    const archived = await catalog.updateWorkspace(workspaceId, null, true);
    expect(archived.archivedAt).not.toBeNull();
    await expect(env.REVIEW_CATALOGS.getByName(ownerKey).getBackupSnapshot()).resolves.toMatchObject({ records: [] });

    await coordinator.registerOwner(ownerKey, ownerEmail);
    await expect(coordinator.runScheduledBackups()).resolves.toEqual({
      checked: 1,
      created: 1,
      unchanged: 0,
      failed: 0,
      truncated: false,
      ownersWithHistoricalGaps: 0,
    });
    const status = await coordinator.getStatus(ownerKey);
    expect(status).toMatchObject({ outcome: "created", error: null });
    if (!status.manifestKey) throw new Error("Expected the archived-review backup manifest");
    const manifestObject = await env.PAPERS.get(status.manifestKey);
    if (!manifestObject) throw new Error("Expected the archived-review backup object");
    const manifest = parseOwnerBackupManifest(await manifestObject.text());
    if (manifest.schemaVersion !== ownerBackupSchemaVersion) throw new Error("Expected a v3 backup manifest");
    expect(manifest.state.catalog).toEqual([expect.objectContaining({ id: workspaceId, archivedAt: archived.archivedAt })]);
    expect(manifest.state.reviews).toEqual([
      expect.objectContaining({
        catalogRecord: expect.objectContaining({
          title: "Archived legacy review",
          profile: "mlr",
          role: "owner",
          locator: expect.objectContaining({ storageKey: workspaceId, legacyWorkspaceId: workspaceId }),
        }),
        reviewPayload: expect.objectContaining({ reviewRevision: 2, protocolRevision: 2 }),
      }),
    ]);
    const registered = (await env.REVIEW_CATALOGS.getByName(ownerKey).getBackupSnapshot()).records[0];
    expect(registered?.id).toBe(manifest.state.reviews[0]?.catalogRecord.id);
    await expect(room.listReviewLinks(workspaceId)).resolves.toEqual([
      expect.objectContaining({ reviewId: registered?.id, status: "active" }),
    ]);
  });

  it("restores independent review catalog and access state when no study payload exists", async () => {
    const ownerKey = await sha256Hex(crypto.randomUUID());
    const ownerEmail = "blank-review-owner@example.test";
    const catalog = env.REVIEW_CATALOGS.getByName(ownerKey);
    const review = await catalog.createReview({ title: "Blank independent review", profile: "mlr" });
    const access = env.REVIEW_ACCESS.getByName(review.locator.storageKey);
    await access.initializeOwner(review.id, ownerEmail);
    const coordinator = env.BACKUP_COORDINATOR.getByName(`blank-review-backup-${crypto.randomUUID()}`);

    const backup = await coordinator.runOwnerBackup(ownerKey, ownerEmail);
    expect(backup).toMatchObject({ outcome: "created", error: null });
    if (!backup.digest || !backup.manifestKey) throw new Error("Expected blank-review backup identities");
    const manifestObject = await env.PAPERS.get(backup.manifestKey);
    if (!manifestObject) throw new Error("Expected the blank-review manifest");
    const manifest = parseOwnerBackupManifest(await manifestObject.text());
    if (manifest.schemaVersion !== ownerBackupSchemaVersion) throw new Error("Expected a v3 backup manifest");
    expect(manifest.state.reviews).toEqual([
      expect.objectContaining({
        catalogRecord: expect.objectContaining({ id: review.id, title: review.title, profile: "mlr" }),
        access: expect.objectContaining({ reviewId: review.id }),
        reviewPayload: null,
        reviewRevisionSeed: null,
      }),
    ]);

    const drill = await coordinator.runRecoveryDrill(ownerKey);
    expect(drill).toMatchObject({ outcome: "verified", reviewsChecked: 0, error: null });
    const catalogRecoveryIdentity = `review-catalog-drill:${backup.digest}`;
    const reviewRecoveryIdentity = `review-drill:${backup.digest}:${review.id}`;
    expect((await env.REVIEW_CATALOGS.getByName(catalogRecoveryIdentity).getBackupSnapshot()).records).toEqual([
      expect.objectContaining({
        id: review.id,
        locator: { reviewId: review.id, storageKey: reviewRecoveryIdentity, legacyWorkspaceId: null },
      }),
    ]);
    expect(await env.REVIEW_ACCESS.getByName(reviewRecoveryIdentity).getBackupSnapshot(ownerEmail)).toMatchObject({
      reviewId: review.id,
      members: [expect.objectContaining({ email: ownerEmail, role: "owner" })],
      projectLinks: [],
    });
    expect(await env.REVIEW_STUDIES.getByName(reviewRecoveryIdentity).hasReviewData()).toBe(false);
  });

  it("excludes retained review deletion locators from logical backups", async () => {
    const ownerKey = await sha256Hex(crypto.randomUUID());
    const ownerEmail = `deleted-review-owner-${crypto.randomUUID()}@example.test`;
    const catalog = env.REVIEW_CATALOGS.getByName(ownerKey);
    const review = await catalog.createReview({ title: "Deleted review retry locator", profile: "slr" });
    const access = env.REVIEW_ACCESS.getByName(review.locator.storageKey);
    await access.initializeOwner(review.id, ownerEmail);
    await access.beginReviewDeletion(ownerEmail);
    const coordinator = env.BACKUP_COORDINATOR.getByName(`deleted-review-backup-${crypto.randomUUID()}`);

    const backup = await coordinator.runOwnerBackup(ownerKey, ownerEmail);
    expect(backup).toMatchObject({ outcome: "created", error: null });
    if (!backup.manifestKey) throw new Error("Expected a deleted-review backup manifest");
    const manifestObject = await env.PAPERS.get(backup.manifestKey);
    if (!manifestObject) throw new Error("Expected a deleted-review backup object");
    const manifest = parseOwnerBackupManifest(await manifestObject.text());
    if (manifest.schemaVersion !== ownerBackupSchemaVersion) throw new Error("Expected a v3 backup manifest");
    expect(manifest.state.reviews).toEqual([]);
    await expect(catalog.getReview(review.id)).resolves.toEqual(review);
  });

  it("keeps v2 project-associated review recovery drills compatible", async () => {
    const ownerKey = await sha256Hex(crypto.randomUUID());
    const ownerEmail = "v2-owner@example.test";
    const workspaceId = crypto.randomUUID();
    const coordinator = env.BACKUP_COORDINATOR.getByName(`v2-backup-${crypto.randomUUID()}`);
    const catalog = env.WORKSPACE_CATALOGS.getByName(ownerKey);
    const access = env.WORKSPACE_ACCESS.getByName(workspaceId);
    const room = env.DOCUMENT_ROOMS.getByName(workspaceId);
    const review = env.REVIEW_STUDIES.getByName(workspaceId);

    await catalog.registerWorkspace(workspaceId, "Legacy review project");
    await access.initializeOwner(ownerEmail);
    await room.initializeWorkspace("Legacy review project");
    const initialReview = await review.getSnapshot("slr", ownerEmail);
    await review.replaceProtocol({
      expectedRevision: initialReview.revision,
      content: { ...defaultReviewProtocol(), objective: "Legacy v2 review" },
      actor: ownerEmail,
    });
    const [catalogBackup, accessBackup, documentBackup, reviewBackup] = await Promise.all([
      catalog.getBackupSnapshot(),
      access.getBackupSnapshot(ownerEmail),
      room.getBackupSnapshot(workspaceId),
      review.createBackupSnapshot(ownerKey),
    ]);
    if (!reviewBackup.reference || !reviewBackup.revisionSeed) throw new Error("Expected a v2 review backup payload");
    const summary = catalogBackup.workspaces.find((workspace) => workspace.id === workspaceId);
    if (!summary) throw new Error("Expected the v2 workspace summary");
    const state: ProjectAssociatedReviewOwnerBackupState = {
      ownerKey,
      catalog: [summary],
      library: {
        references: [],
        referenceKeyStates: {},
        artifacts: [],
        webSources: [],
        webSnapshots: [],
        notes: [],
        highlights: [],
        tags: {},
        collections: {},
        reading: [],
      },
      templates: [],
      workspaces: [
        {
          summary,
          members: accessBackup.members,
          snapshot: documentBackup.snapshot,
          revisionSeed: documentBackup.revisionSeed,
          reviewPayload: reviewBackup.reference,
          reviewRevisionSeed: reviewBackup.revisionSeed,
        },
      ],
    };
    const digest = await ownerBackupDigest(state, [], projectAssociatedReviewOwnerBackupSchemaVersion);
    const manifest: ProjectAssociatedReviewOwnerBackupManifest = {
      schemaVersion: projectAssociatedReviewOwnerBackupSchemaVersion,
      createdAt: "2026-07-18T00:00:00.000Z",
      digest,
      state,
      binaries: [],
      recovery: {
        catalog: catalogBackup.bookmark,
        library: null,
        templates: null,
        workspaces: [
          {
            workspaceId,
            access: accessBackup.bookmark,
            document: documentBackup.bookmark,
            review: reviewBackup.bookmark,
          },
        ],
      },
    };
    const manifestKey = `backups/manifests/${ownerKey}/v2.json`;
    await env.PAPERS.put(manifestKey, ownerBackupManifestJson(manifest));
    await coordinator.registerOwner(ownerKey, ownerEmail);
    await runInDurableObject(coordinator, (_instance: BackupCoordinator, durableState) => {
      durableState.storage.sql.exec(
        `INSERT INTO backup_status
         (owner_key, outcome, digest, manifest_key, last_checked_at, last_backed_up_at, error)
         VALUES (?, 'created', ?, ?, ?, ?, NULL)`,
        ownerKey,
        digest,
        manifestKey,
        manifest.createdAt,
        manifest.createdAt,
      );
    });

    const drill = await coordinator.runRecoveryDrill(ownerKey);
    expect(drill).toMatchObject({
      outcome: "verified",
      digest,
      manifestKey,
      binariesChecked: 0,
      reviewsChecked: 1,
      error: null,
    });
    const recovered = await env.BACKUP_RECOVERIES.getByName(drill.recoveryIdentity!).getRestoredReviewStudies();
    expect(recovered).toEqual([
      expect.objectContaining({
        reviewId: null,
        workspaceId,
        catalogRecoveryIdentity: null,
        accessRecoveryIdentity: null,
        recoveryIdentity: `review-drill:${ownerKey}:${digest}:${workspaceId}`,
        payloadDigest: reviewBackup.reference.payloadDigest,
      }),
    ]);
  });

  it("keeps v1 manifest-only recovery drills compatible", async () => {
    const ownerKey = await sha256Hex(crypto.randomUUID());
    const ownerEmail = "legacy-owner@example.test";
    const coordinator = env.BACKUP_COORDINATOR.getByName(`legacy-backup-${crypto.randomUUID()}`);
    const state = {
      ownerKey,
      catalog: [],
      library: {
        references: [],
        referenceKeyStates: {},
        artifacts: [],
        webSources: [],
        webSnapshots: [],
        notes: [],
        highlights: [],
        tags: {},
        collections: {},
        reading: [],
      },
      workspaces: [],
    };
    const digest = await ownerBackupDigest(state, [], legacyOwnerBackupSchemaVersion);
    const manifest: LegacyOwnerBackupManifest = {
      schemaVersion: legacyOwnerBackupSchemaVersion,
      createdAt: "2026-07-17T00:00:00.000Z",
      digest,
      state,
      binaries: [],
      recovery: { catalog: null, library: null, workspaces: [] },
    };
    const manifestKey = `backups/manifests/${ownerKey}/legacy.json`;
    await env.PAPERS.put(manifestKey, ownerBackupManifestJson(manifest));
    await coordinator.registerOwner(ownerKey, ownerEmail);
    await runInDurableObject(coordinator, (_instance: BackupCoordinator, durableState) => {
      durableState.storage.sql.exec(
        `INSERT INTO backup_status
         (owner_key, outcome, digest, manifest_key, last_checked_at, last_backed_up_at, error)
         VALUES (?, 'created', ?, ?, ?, ?, NULL)`,
        ownerKey,
        digest,
        manifestKey,
        manifest.createdAt,
        manifest.createdAt,
      );
    });

    await expect(coordinator.runRecoveryDrill(ownerKey)).resolves.toMatchObject({
      outcome: "verified",
      digest,
      manifestKey,
      binariesChecked: 0,
      reviewsChecked: 0,
      error: null,
    });
    expect(
      await runInDurableObject(coordinator, (_instance: BackupCoordinator, durableState) =>
        durableState.storage.sql
          .exec<{ version: number; name: string }>("SELECT version, name FROM _kirjolab_migrations ORDER BY version")
          .toArray(),
      ),
    ).toEqual([
      { version: 1, name: "create-backup-coordinator" },
      { version: 2, name: "record-isolated-recovery-drills" },
      { version: 3, name: "count-verified-review-recoveries" },
      { version: 4, name: "report-unavailable-legacy-history-images" },
    ]);
  });
});

async function backupArtifactCount(ownerKey: string): Promise<number> {
  const [manifests, blobs, reviews] = await Promise.all([
    env.PAPERS.list({ prefix: `backups/manifests/${ownerKey}/` }),
    env.PAPERS.list({ prefix: `backups/blobs/${ownerKey}/` }),
    env.PAPERS.list({ prefix: `backups/reviews/${ownerKey}/` }),
  ]);
  return manifests.objects.length + blobs.objects.length + reviews.objects.length;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
