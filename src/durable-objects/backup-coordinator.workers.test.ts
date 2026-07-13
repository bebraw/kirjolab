import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { OwnerBackupManifest } from "../domain/backups";

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
    const coordinator = env.BACKUP_COORDINATOR.getByName(`backup-${crypto.randomUUID()}`);

    await catalog.registerWorkspace(workspaceId, "Backup fixture");
    await access.initializeOwner(ownerEmail);
    await room.initializeWorkspace("Backup fixture");
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

    const created = await coordinator.runOwnerBackup(ownerKey, ownerEmail);
    expect(created).toMatchObject({ outcome: "created", error: null });
    expect(created.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(created.manifestKey).toMatch(new RegExp(`^backups/manifests/${ownerKey}/`, "u"));

    const manifestObject = await env.PAPERS.get(created.manifestKey!);
    expect(manifestObject).not.toBeNull();
    const manifest = JSON.parse(await manifestObject!.text()) as OwnerBackupManifest;
    expect(manifest).toMatchObject({
      schemaVersion: "kirjolab-owner-backup-v1",
      digest: created.digest,
      state: { ownerKey, catalog: [{ id: workspaceId, title: "Backup fixture" }] },
      recovery: { catalog: null, library: null },
    });
    expect(manifest.state.workspaces).toHaveLength(1);
    expect(manifest.state.workspaces[0]?.members).toEqual([expect.objectContaining({ email: ownerEmail, role: "owner" })]);
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
});

async function backupArtifactCount(ownerKey: string): Promise<number> {
  const [manifests, blobs] = await Promise.all([
    env.PAPERS.list({ prefix: `backups/manifests/${ownerKey}/` }),
    env.PAPERS.list({ prefix: `backups/blobs/${ownerKey}/` }),
  ]);
  return manifests.objects.length + blobs.objects.length;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
