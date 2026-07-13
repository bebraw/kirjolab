import type { OwnerBackupDrillStatus, OwnerBackupStatus } from "../domain/backups";
import type { AuthIdentity } from "../security/auth";

interface BackupCoordinatorApi {
  getStatus(ownerKey: string): Promise<OwnerBackupStatus>;
  runOwnerBackup(ownerKey: string, email: string): Promise<OwnerBackupStatus>;
  getRecoveryDrillStatus(ownerKey: string): Promise<OwnerBackupDrillStatus>;
  runRecoveryDrill(ownerKey: string): Promise<OwnerBackupDrillStatus>;
}

interface BackupApiEnvironment {
  readonly BACKUP_COORDINATOR: { getByName(name: "primary"): BackupCoordinatorApi };
  readonly PAPERS: { get(key: string): Promise<{ readonly body: ReadableStream } | null> };
}

export async function handleBackupApi(request: Request, env: BackupApiEnvironment, identity: AuthIdentity): Promise<Response> {
  const path = new URL(request.url).pathname;
  const coordinator = env.BACKUP_COORDINATOR.getByName("primary");
  if (path === "/api/backups" && request.method === "GET") {
    return Response.json(await coordinator.getStatus(identity.ownerKey), noStore());
  }
  if (path === "/api/backups" && request.method === "POST") {
    const status = await coordinator.runOwnerBackup(identity.ownerKey, identity.email);
    return Response.json(status, { status: status.outcome === "failed" ? 503 : 200, ...noStore() });
  }
  if (path === "/api/backups/latest" && request.method === "GET") {
    const status = await coordinator.getStatus(identity.ownerKey);
    if (!status.manifestKey) return jsonError("No successful backup is available", 404);
    const manifest = await env.PAPERS.get(status.manifestKey);
    if (!manifest) return jsonError("The latest backup manifest is unavailable", 503);
    const headers = new Headers({
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="kirjolab-owner-backup.json"',
      "cache-control": "no-store",
    });
    return new Response(manifest.body, { headers });
  }
  if (path === "/api/backups/drill" && request.method === "GET") {
    return Response.json(await coordinator.getRecoveryDrillStatus(identity.ownerKey), noStore());
  }
  if (path === "/api/backups/drill" && request.method === "POST") {
    const status = await coordinator.runRecoveryDrill(identity.ownerKey);
    return Response.json(status, { status: status.outcome === "failed" ? 503 : 200, ...noStore() });
  }
  return jsonError("Backup route not found", 404);
}

function noStore(): { headers: { "cache-control": "no-store" } } {
  return { headers: { "cache-control": "no-store" } };
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, ...noStore() });
}
