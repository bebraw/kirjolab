import { describe, expect, it, vi } from "vitest";
import { handleBackupApi } from "./backups";
import type { OwnerBackupDrillStatus, OwnerBackupStatus } from "../domain/backups";

const identity = {
  subject: "subject",
  email: "owner@kirjolab.test",
  ownerKey: "a".repeat(64),
  mode: "access",
} as const;

const createdStatus: OwnerBackupStatus = {
  ownerKey: identity.ownerKey,
  outcome: "created",
  digest: "b".repeat(64),
  manifestKey: `backups/manifests/${identity.ownerKey}/manifest.json`,
  lastCheckedAt: "2026-07-13T00:00:00.000Z",
  lastBackedUpAt: "2026-07-13T00:00:00.000Z",
  error: null,
};

const verifiedDrill: OwnerBackupDrillStatus = {
  ownerKey: identity.ownerKey,
  outcome: "verified",
  digest: createdStatus.digest,
  manifestKey: createdStatus.manifestKey,
  recoveryIdentity: `drill:${identity.ownerKey}:${createdStatus.digest}`,
  checkedAt: "2026-07-13T01:00:00.000Z",
  binariesChecked: 2,
  reviewsChecked: 1,
  error: null,
};

describe("backup API", () => {
  it("returns private owner status and starts an explicit backup", async () => {
    const coordinator = {
      getStatus: vi.fn(async () => createdStatus),
      runOwnerBackup: vi.fn(async () => createdStatus),
    };
    const env = environment(coordinator);
    const status = await handleBackupApi(new Request("https://write.kirjolab.test/api/backups"), env, identity);
    expect(status.status).toBe(200);
    expect(status.headers.get("cache-control")).toBe("no-store");
    expect(await status.json()).toEqual(createdStatus);
    expect(coordinator.getStatus).toHaveBeenCalledWith(identity.ownerKey);

    const run = await handleBackupApi(new Request("https://write.kirjolab.test/api/backups", { method: "POST" }), env, identity);
    expect(run.status).toBe(200);
    expect(coordinator.runOwnerBackup).toHaveBeenCalledWith(identity.ownerKey, identity.email);
  });

  it("reports failed manual runs as unavailable without dropping prior status", async () => {
    const failed = { ...createdStatus, outcome: "failed", error: "source missing" } as const;
    const env = environment({ getStatus: vi.fn(async () => failed), runOwnerBackup: vi.fn(async () => failed) });
    const response = await handleBackupApi(new Request("https://write.kirjolab.test/api/backups", { method: "POST" }), env, identity);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(failed);
  });

  it("streams only the authenticated owner's latest manifest", async () => {
    const get = vi.fn(async (key: string) =>
      key === createdStatus.manifestKey ? { body: new Blob(['{"schemaVersion":"kirjolab-owner-backup-v1"}\n']).stream() } : null,
    );
    const env = environment({ getStatus: vi.fn(async () => createdStatus), runOwnerBackup: vi.fn(async () => createdStatus) }, get);
    const response = await handleBackupApi(new Request("https://write.kirjolab.test/api/backups/latest"), env, identity);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("kirjolab-owner-backup.json");
    expect(await response.text()).toContain("kirjolab-owner-backup-v1");
    expect(get).toHaveBeenCalledWith(createdStatus.manifestKey);
  });

  it("reports and starts an isolated recovery drill", async () => {
    const coordinator = coordinatorApi();
    const env = environment(coordinator);
    const status = await handleBackupApi(new Request("https://write.kirjolab.test/api/backups/drill"), env, identity);
    expect(await status.json()).toEqual(verifiedDrill);
    expect(coordinator.getRecoveryDrillStatus).toHaveBeenCalledWith(identity.ownerKey);

    const run = await handleBackupApi(new Request("https://write.kirjolab.test/api/backups/drill", { method: "POST" }), env, identity);
    expect(run.status).toBe(200);
    expect(coordinator.runRecoveryDrill).toHaveBeenCalledWith(identity.ownerKey);

    coordinator.runRecoveryDrill.mockResolvedValueOnce({ ...verifiedDrill, outcome: "failed", error: "binary missing" });
    expect(
      (await handleBackupApi(new Request("https://write.kirjolab.test/api/backups/drill", { method: "POST" }), env, identity)).status,
    ).toBe(503);
  });

  it("distinguishes missing status, missing objects, and unknown routes", async () => {
    const never = { ...createdStatus, outcome: "never", digest: null, manifestKey: null } as const;
    const missingStatus = environment({ getStatus: vi.fn(async () => never), runOwnerBackup: vi.fn(async () => never) });
    expect((await handleBackupApi(new Request("https://write.kirjolab.test/api/backups/latest"), missingStatus, identity)).status).toBe(
      404,
    );

    const missingObject = environment({ getStatus: vi.fn(async () => createdStatus), runOwnerBackup: vi.fn(async () => createdStatus) });
    expect((await handleBackupApi(new Request("https://write.kirjolab.test/api/backups/latest"), missingObject, identity)).status).toBe(
      503,
    );
    expect((await handleBackupApi(new Request("https://write.kirjolab.test/api/backups/unknown"), missingObject, identity)).status).toBe(
      404,
    );
  });
});

function environment(
  coordinator: Partial<BackupCoordinatorTestApi>,
  get: (key: string) => Promise<{ body: ReadableStream } | null> = async () => null,
) {
  const completeCoordinator = { ...coordinatorApi(), ...coordinator };
  return {
    BACKUP_COORDINATOR: { getByName: (_name: "primary") => completeCoordinator },
    PAPERS: { get },
  };
}

interface BackupCoordinatorTestApi {
  getStatus(ownerKey: string): Promise<OwnerBackupStatus>;
  runOwnerBackup(ownerKey: string, email: string): Promise<OwnerBackupStatus>;
  getRecoveryDrillStatus(ownerKey: string): Promise<OwnerBackupDrillStatus>;
  runRecoveryDrill(ownerKey: string): Promise<OwnerBackupDrillStatus>;
}

function coordinatorApi() {
  return {
    getStatus: vi.fn(async () => createdStatus),
    runOwnerBackup: vi.fn(async () => createdStatus),
    getRecoveryDrillStatus: vi.fn(async () => verifiedDrill),
    runRecoveryDrill: vi.fn(async () => verifiedDrill),
  };
}
