import {
  buildProjectArchive,
  inspectProjectArchive,
  projectArchiveBinaryKeys,
  projectArchiveExclusions,
  projectArchiveSummary,
  ProjectArchiveError,
  type ProjectArchiveInspection,
} from "../domain/project/project-archive";
import {
  projectArchiveIdentityProvenance,
  projectArchiveRevisionSeed,
  remapProjectArchive,
  replaceProjectArchiveBinaries,
} from "../domain/project/project-archive-seed";
import { isSha256Hex, sha256Bytes, sha256Text } from "../domain/sha256";
import { isCreateWorkspaceInput, type WorkspaceSnapshot } from "../domain/workspace/workspace";
import type { DocumentRoom } from "../durable-objects/document-room";
import type { ReferenceLibrary } from "../durable-objects/reference-library";
import type { NativeProjectImportClaim, WorkspaceCatalog } from "../durable-objects/workspace-catalog";
import type { WorkspaceAccess } from "../durable-objects/workspace-access";
import { digestFromPdfBlobKey, reservePdfBlob, type PdfBlobReservation, type PdfBlobAuthorityNamespace } from "../pdf-blob";
import type { AuthIdentity } from "../security/auth";
import { readBoundedRequestBytes } from "./request-body";

const maximumBytes = 20 * 1024 * 1024;
type NativeInspection = Extract<ProjectArchiveInspection, { kind: "native" }>;
type RpcMethods<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never };
type ImportRoom = RpcMethods<
  Pick<
    DocumentRoom,
    "getSnapshot" | "seedFromRevision" | "listRetainedPdfResources" | "deleteWorkspaceData" | "listLibrarySourceLinks" | "registerPdf"
  >
>;
interface ProjectImportEnvironment {
  readonly DOCUMENT_ROOMS: { getByName(name: string): ImportRoom };
  readonly REFERENCE_LIBRARIES: {
    getByName(
      name: string,
    ): RpcMethods<
      Pick<ReferenceLibrary, "previewProjectArchiveReferences" | "stageProjectArchiveReferences" | "rollbackProjectArchiveReferences">
    >;
  };
  readonly WORKSPACE_CATALOGS: {
    getByName(
      name: string,
    ): RpcMethods<
      Pick<
        WorkspaceCatalog,
        | "getWorkspace"
        | "claimNativeProjectImport"
        | "completeNativeProjectImport"
        | "failNativeProjectImport"
        | "acknowledgeNativeProjectImportCleanup"
      >
    >;
  };
  readonly WORKSPACE_ACCESS: {
    getByName(name: string): RpcMethods<Pick<WorkspaceAccess, "getRole" | "initializeOwner" | "deleteWorkspaceAccess">>;
  };
  readonly PDF_BLOBS: PdfBlobAuthorityNamespace;
  readonly PAPERS: {
    get(key: string): Promise<{ readonly size: number; readonly etag: string; readonly body: ReadableStream<Uint8Array> } | null>;
    put(
      key: string,
      bytes: Uint8Array,
      options?: {
        readonly customMetadata?: Readonly<Record<string, string>>;
        readonly httpMetadata?: { readonly contentType: string };
      },
    ): Promise<{ readonly etag: string } | null>;
    list(options: {
      readonly prefix: string;
      readonly cursor?: string;
    }): Promise<{ readonly objects: readonly { readonly key: string }[]; readonly truncated: boolean; readonly cursor?: string }>;
    delete(keys: string | string[]): Promise<void>;
  };
}

export async function handleProjectImportApi(request: Request, env: ProjectImportEnvironment, identity: AuthIdentity): Promise<Response> {
  const url = new URL(request.url);
  if (!["/api/project-import-previews", "/api/project-imports"].includes(url.pathname))
    return failure("Project import route not found", 404);
  if (request.method !== "POST") return failure("Method not allowed", 405);
  if (!["application/zip", "application/x-zip-compressed"].includes(request.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? ""))
    return failure("Project import requires a ZIP archive", 415);
  if (Number(request.headers.get("content-length")) > maximumBytes) return failure("Project archive exceeds 20 MiB", 413);
  try {
    const bytes = request.body
      ? await readBoundedRequestBytes(request.body, {
          maximumBytes,
          tooLarge: () => new ProjectArchiveError("Project archive exceeds 20 MiB", 413),
          preserveLimitErrorOnCancelFailure: true,
        })
      : new Uint8Array();
    const inspection = await inspectProjectArchive(bytes);
    if (url.pathname === "/api/project-import-previews") {
      if (inspection.kind === "legacy")
        return json({
          kind: "legacy",
          summary: inspection.summary,
          archiveSha256: inspection.archiveSha256,
          previewDigest: null,
          reusedReferences: 0,
          newReferences: 0,
        });
      return json(await previewImport(inspection, env, identity));
    }
    if (inspection.kind !== "native")
      return failure(
        "Legacy source archives cannot restore a complete project. Export a Kirjolab project ZIP from the original project.",
        422,
      );
    return await confirmImport(url, inspection, env, identity);
  } catch (error) {
    return failure(
      error instanceof ProjectArchiveError ? error.message : "Project import could not finish. Retry the same import.",
      error instanceof ProjectArchiveError ? error.status : 503,
    );
  }
}

async function previewImport(inspection: NativeInspection, env: ProjectImportEnvironment, identity: AuthIdentity) {
  let matches;
  try {
    matches = await env.REFERENCE_LIBRARIES.getByName(identity.ownerKey).previewProjectArchiveReferences(
      inspection.project.projectReferences,
    );
  } catch (error) {
    throw new ProjectArchiveError(error instanceof Error ? error.message : "Library references require reconciliation", 409);
  }
  const previewDigest = await sha256Text(JSON.stringify({ archiveSha256: inspection.archiveSha256, matches }));
  return {
    kind: "native" as const,
    summary: inspection.summary,
    archiveSha256: inspection.archiveSha256,
    previewDigest,
    reusedReferences: matches.filter(({ referenceId }) => referenceId !== null).length,
    newReferences: matches.filter(({ referenceId }) => referenceId === null).length,
    matches,
  };
}

interface ImportConfirmation {
  readonly title: string;
  readonly expectedHash: string;
  readonly expectedPreview: string;
  readonly attemptId: string;
}
type ClaimedImport = Extract<NativeProjectImportClaim, { status: "claimed" }>;

function importConfirmation(url: URL, inspection: NativeInspection): ImportConfirmation {
  const title = url.searchParams.get("title")?.trim() ?? "";
  const expectedHash = url.searchParams.get("archiveSha256") ?? "";
  const expectedPreview = url.searchParams.get("previewDigest") ?? "";
  const attemptId = url.searchParams.get("attemptId") ?? "";
  if (
    !isCreateWorkspaceInput({ title }) ||
    !isSha256Hex(expectedHash) ||
    !isSha256Hex(expectedPreview) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(attemptId)
  )
    throw new ProjectArchiveError("Invalid project import confirmation", 400);
  if (expectedHash !== inspection.archiveSha256) throw new ProjectArchiveError("The archive changed after preview. Preview it again.", 409);
  return { title, expectedHash, expectedPreview, attemptId };
}

async function confirmImport(
  url: URL,
  inspection: NativeInspection,
  env: ProjectImportEnvironment,
  identity: AuthIdentity,
): Promise<Response> {
  const confirmation = importConfirmation(url, inspection);
  const { title, expectedHash, expectedPreview, attemptId } = confirmation;
  const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
  const digest = await sha256Text(JSON.stringify({ expectedHash, expectedPreview, title }));
  let claim;
  try {
    claim = await catalog.claimNativeProjectImport(attemptId, digest);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Import attempt is unavailable", 409);
  }
  if (claim.status === "complete") return json({ workspace: claim.workspace });
  if (claim.status === "busy") return failure("This import is still running. Retry the same import shortly.", 409);
  const { projectId, claimId } = claim;
  const reservations: PdfBlobReservation[] = [];
  try {
    const mapped = await stageImportProject(inspection, env, identity, { confirmation, claim, reservations });
    const workspace = await catalog.completeNativeProjectImport(
      attemptId,
      claimId,
      title,
      inspection.project.id,
      inspection.project.revision,
      inspection.archiveSha256,
      projectArchiveIdentityProvenance(inspection.project, mapped),
    );
    return json({ workspace }, 201);
  } catch (error) {
    // A successful publication whose RPC response was lost must never be rolled back.
    const published = await catalog.getWorkspace(projectId);
    if (published) return json({ workspace: published });
    const released = await Promise.allSettled(reservations.map(async (reservation) => await reservation.release()));
    await cleanupImport(env, identity, projectId);
    const releaseFailure = released.find((result) => result.status === "rejected");
    if (releaseFailure?.status === "rejected") throw releaseFailure.reason;
    await catalog.failNativeProjectImport(attemptId, claimId);
    throw error;
  }
}

interface ImportStaging {
  readonly confirmation: ImportConfirmation;
  readonly claim: ClaimedImport;
  readonly reservations: PdfBlobReservation[];
}

async function stageImportProject(
  inspection: NativeInspection,
  env: ProjectImportEnvironment,
  identity: AuthIdentity,
  staging: ImportStaging,
): Promise<NativeInspection["project"]> {
  const { title, expectedPreview, attemptId } = staging.confirmation;
  const { projectId, claimId, abandonedProjectIds } = staging.claim;
  for (const abandonedId of abandonedProjectIds) await cleanupImport(env, identity, abandonedId);
  if (abandonedProjectIds.length)
    await env.WORKSPACE_CATALOGS.getByName(identity.ownerKey).acknowledgeNativeProjectImportCleanup(attemptId, claimId);
  const preview = await previewImport(inspection, env, identity);
  if (preview.previewDigest !== expectedPreview)
    throw new ProjectArchiveError("Library matches changed after preview. Preview the archive again.", 409);
  // Establish ownership before any other project-local writes so cleanup can always revoke access.
  await env.WORKSPACE_ACCESS.getByName(projectId).initializeOwner(identity.email);
  const library = env.REFERENCE_LIBRARIES.getByName(identity.ownerKey);
  let matches;
  try {
    matches = await library.stageProjectArchiveReferences(projectId, inspection.project.projectReferences, identity.email, preview.matches);
  } catch (error) {
    throw new ProjectArchiveError(error instanceof Error ? error.message : "Library matches changed; preview again", 409);
  }
  const placeholders = new Map(
    projectArchiveBinaryKeys(inspection.project).map((key) => [key, { objectKey: key, fingerprint: `archive:${key}` }]),
  );
  const mapped = remapProjectArchive(
    inspection.project,
    projectId,
    new Map(matches.map(({ sourceId, referenceId }) => [sourceId, referenceId])),
    placeholders,
  );
  const binaries = await storeImportBinaries(inspection, env, mapped, staging.reservations);
  const project = { ...replaceProjectArchiveBinaries(mapped, binaries), title };
  await env.DOCUMENT_ROOMS.getByName(projectId).seedFromRevision(projectId, title, projectArchiveRevisionSeed(project), {
    assets: project.assets.map(({ id, objectKey, fingerprint, updatedAt }) => ({ id, objectKey, fingerprint, updatedAt })),
    pdfs: project.pdfs.map(({ id, objectKey, fingerprint }) => ({ id, objectKey, fingerprint })),
  });
  for (const reservation of staging.reservations) await reservation.commit();
  return mapped;
}

async function storeImportBinaries(
  inspection: NativeInspection,
  env: ProjectImportEnvironment,
  mapped: NativeInspection["project"],
  reservations: PdfBlobReservation[],
): Promise<Map<string, { objectKey: string; fingerprint: string }>> {
  const binaries = new Map<string, { objectKey: string; fingerprint: string }>();
  const room = env.DOCUMENT_ROOMS.getByName(mapped.id);
  for (const pdf of mapped.pdfs) {
    const bytes = inspection.payloads.get(pdf.objectKey)!;
    const digest = await sha256Bytes(bytes);
    // Retain the cleanup identity before reserving bytes, including if the RPC response is lost.
    await room.registerPdf({ ...pdf, objectKey: `pdf-blobs/sha256/${digest}.pdf`, fingerprint: `sha256:${digest}` });
    const reservation = await reservePdfBlob(env.PDF_BLOBS, bytes, `project:${mapped.id}:${pdf.id}`);
    reservations.push(reservation);
    binaries.set(pdf.objectKey, reservation.blob);
  }
  for (const key of projectArchiveBinaryKeys(mapped)) {
    if (binaries.has(key)) continue;
    const objectKey = `${mapped.id}/archive/${crypto.randomUUID()}`;
    const bytes = inspection.payloads.get(key)!;
    const stored = await env.PAPERS.put(objectKey, bytes, importBinaryMetadata(mapped, key));
    if (!stored) throw new Error("Project binary could not be stored");
    binaries.set(key, { objectKey, fingerprint: `r2-etag:${stored.etag.replaceAll('"', "")}` });
  }
  return binaries;
}

function importBinaryMetadata(mapped: NativeInspection["project"], key: string) {
  const rawWebShare = mapped.researchShares.find(({ content }) => content.kind === "web-snapshot" && content.rawObjectKey === key);
  const sharedPdf = mapped.researchShares.some(({ content }) => content.kind === "artifact" && content.objectKey === key);
  const mediaType = mapped.assets.find((asset) => asset.objectKey === key)?.mediaType;
  return {
    httpMetadata: { contentType: sharedPdf ? "application/pdf" : (mediaType ?? "application/octet-stream") },
    ...(rawWebShare?.content.kind === "web-snapshot" ? { customMetadata: { contentHash: rawWebShare.content.contentHash } } : {}),
  };
}

async function cleanupImport(env: ProjectImportEnvironment, identity: AuthIdentity, projectId: string): Promise<void> {
  const catalog = env.WORKSPACE_CATALOGS.getByName(identity.ownerKey);
  if (await catalog.getWorkspace(projectId)) return;
  const room = env.DOCUMENT_ROOMS.getByName(projectId);
  const cleanup = await Promise.allSettled([
    (async () => {
      for (const pdf of await room.listRetainedPdfResources(projectId)) {
        const digest = digestFromPdfBlobKey(pdf.objectKey);
        if (digest) await env.PDF_BLOBS.getByName(digest).release(`project:${projectId}:${pdf.id}`);
      }
    })(),
    (async () => {
      let cursor: string | undefined;
      do {
        const page = await env.PAPERS.list({ prefix: `${projectId}/`, ...(cursor ? { cursor } : {}) });
        if (page.objects.length) await env.PAPERS.delete(page.objects.map(({ key }) => key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    })(),
    env.REFERENCE_LIBRARIES.getByName(identity.ownerKey).rollbackProjectArchiveReferences(projectId),
  ]);
  const failed = cleanup.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  await room.deleteWorkspaceData();
  const access = env.WORKSPACE_ACCESS.getByName(projectId);
  if ((await access.getRole(identity.email)) === "owner") await access.deleteWorkspaceAccess(identity.email);
}

export async function exportNativeProject(
  suffix: string,
  workspaceId: string,
  room: Pick<ImportRoom, "getSnapshot" | "listLibrarySourceLinks">,
  env: ProjectImportEnvironment,
): Promise<Response> {
  try {
    const snapshot = await room.getSnapshot(workspaceId);
    const externalLinks = await room.listLibrarySourceLinks(workspaceId);
    const exclusions = [
      ...projectArchiveExclusions,
      `${externalLinks.length} live Library source grants excluded; contributor PDFs remain in their private Libraries`,
    ];
    if (suffix === "/export/project-preview") return json(projectArchiveSummary(snapshot, exclusions));
    const binaries = new Map<string, Uint8Array>();
    let total = 0;
    for (const key of projectArchiveBinaryKeys(snapshot)) {
      const object = await env.PAPERS.get(key);
      if (!object) throw new ProjectArchiveError("A required project binary is missing. The archive was not created.", 409);
      total += object.size;
      if (total > maximumBytes) throw new ProjectArchiveError("Project archive exceeds 20 MiB", 413);
      const bytes = await readBoundedRequestBytes(object.body, {
        maximumBytes: object.size,
        tooLarge: () => new ProjectArchiveError("A project binary changed during export", 409),
        preserveLimitErrorOnCancelFailure: true,
      });
      await verifyExportBinary(snapshot, key, bytes, object.etag);
      binaries.set(key, bytes);
    }
    const archive = await buildProjectArchive(snapshot, binaries, exclusions);
    return new Response(Uint8Array.from(archive).buffer, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="kirjolab-project.zip"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return failure(
      error instanceof ProjectArchiveError ? error.message : "Project export could not finish. Retry the export.",
      error instanceof ProjectArchiveError ? error.status : 503,
    );
  }
}

async function verifyExportBinary(snapshot: WorkspaceSnapshot, key: string, bytes: Uint8Array, etag: string): Promise<void> {
  const resources = [
    ...snapshot.assets,
    ...snapshot.pdfs,
    ...snapshot.researchShares.flatMap((share) => (share.content.kind === "artifact" ? [share.content] : [])),
  ];
  for (const resource of resources.filter(({ objectKey }) => objectKey === key)) {
    if (
      resource.size !== bytes.byteLength ||
      (resource.fingerprint.startsWith("sha256:") && resource.fingerprint !== `sha256:${await sha256Bytes(bytes)}`) ||
      (resource.fingerprint.startsWith("r2-etag:") && resource.fingerprint !== `r2-etag:${etag.replaceAll('"', "")}`)
    )
      throw new ProjectArchiveError("A project binary changed during export", 409);
  }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}
function failure(error: string, status: number): Response {
  return json({ error }, status);
}
