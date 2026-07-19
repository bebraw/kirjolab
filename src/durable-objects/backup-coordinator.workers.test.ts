import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  legacyOwnerBackupSchemaVersion,
  ownerBackupDigest,
  ownerBackupManifestJson,
  ownerBackupSchemaVersion,
  parseOwnerBackupManifest,
  type LegacyOwnerBackupManifest,
} from "../domain/backups";
import { builtInProjectTemplate } from "../domain/project-templates";
import { defaultReviewProtocol } from "../domain/review-study";
import { BackupCoordinator } from "./backup-coordinator";
import { BackupRecovery } from "./backup-recovery";

describe("BackupCoordinator in the Workers runtime", () => {
  it("creates immutable owner backups only when state changes and reports source failures", async () => {
    const ownerKey = await sha256Hex(crypto.randomUUID());
    const ownerEmail = "owner@example.test";
    const workspaceId = crypto.randomUUID();
    const pdfId = crypto.randomUUID();
    const sourceKey = `${workspaceId}/${pdfId}.pdf`;
    const catalog = env.WORKSPACE_CATALOGS.getByName(ownerKey);
    const access = env.WORKSPACE_ACCESS.getByName(workspaceId);
    const room = env.DOCUMENT_ROOMS.getByName(workspaceId);
    const review = env.REVIEW_STUDIES.getByName(workspaceId);
    const coordinator = env.BACKUP_COORDINATOR.getByName(`backup-${crypto.randomUUID()}`);
    const templates = env.PROJECT_TEMPLATE_CATALOGS.getByName(ownerKey);

    await catalog.registerWorkspace(workspaceId, "Backup fixture");
    await access.initializeOwner(ownerEmail);
    await room.initializeWorkspace("Backup fixture");
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
    if (manifest.schemaVersion !== ownerBackupSchemaVersion) throw new Error("Expected a v2 backup manifest");
    expect(manifest).toMatchObject({
      schemaVersion: ownerBackupSchemaVersion,
      digest: created.digest,
      state: { ownerKey, catalog: [{ id: workspaceId, title: "Backup fixture" }] },
      recovery: { catalog: null, library: null },
    });
    expect(manifest.state.workspaces).toHaveLength(1);
    expect(manifest.state.templates).toEqual([expect.objectContaining({ id: personalTemplate.id, name: "Backed-up template" })]);
    expect(manifest.state.workspaces[0]?.members).toEqual([expect.objectContaining({ email: ownerEmail, role: "owner" })]);
    const reviewPayload = manifest.state.workspaces[0]?.reviewPayload;
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
    expect(manifest.state.workspaces[0]?.reviewRevisionSeed).toBe("review:2:protocol:2");
    expect(manifest.binaries).toEqual([
      expect.objectContaining({ sourceKey, size: 11, backupKey: expect.stringMatching(`^backups/blobs/${ownerKey}/`) }),
    ]);
    expect(await env.PAPERS.head(manifest.binaries[0]!.backupKey)).not.toBeNull();

    const artifactCount = await backupArtifactCount(ownerKey);
    const unchanged = await coordinator.runOwnerBackup(ownerKey, ownerEmail);
    expect(unchanged).toMatchObject({ outcome: "unchanged", digest: created.digest, manifestKey: created.manifestKey, error: null });
    expect(await backupArtifactCount(ownerKey)).toBe(artifactCount);

    await room.renameWorkspace("Changed backup fixture");
    const changed = await coordinator.runOwnerBackup(ownerKey, ownerEmail);
    expect(changed).toMatchObject({ outcome: "created", error: null });
    expect(changed.digest).not.toBe(created.digest);
    expect(changed.manifestKey).not.toBe(created.manifestKey);

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
    ]);
    const recoveredReviews = await recovery.getRestoredReviewStudies();
    expect(recoveredReviews).toEqual([
      expect.objectContaining({
        workspaceId,
        recoveryIdentity: `review-drill:${ownerKey}:${changed.digest}:${workspaceId}`,
        payloadDigest: reviewPayload.payloadDigest,
        authorityDigest: reviewPayload.authorityDigest,
        reviewRevision: reviewPayload.reviewRevision,
      }),
    ]);
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
    await recovery.restoreManifest(chunkedManifest);
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
      error: "A referenced backup source is missing",
    });
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
