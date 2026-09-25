import { demoWorkspaceId } from "./domain/workspace/workspace";
import { digestFromPdfBlobKey, reservePdfBlob } from "./pdf-blob";

type MigrationResult = "migrated" | "skipped";

export interface PdfBlobMigrationBatch {
  readonly examined: number;
  readonly migrated: number;
  readonly deferred: number;
  readonly remaining: boolean;
}

export async function runScheduledPdfBlobMigration(env: Env): Promise<PdfBlobMigrationBatch> {
  const progress = env.PDF_BLOBS.getByName("__migration__");
  const cursor = await progress.migrationCursor();
  let page: R2Objects;
  try {
    page = await env.PAPERS.list({ limit: 25, ...(cursor ? { cursor } : {}) });
  } catch (error) {
    if (!cursor) throw error;
    await progress.setMigrationCursor(null);
    return { examined: 0, migrated: 0, deferred: 0, remaining: true };
  }
  let migrated = 0;
  let deferred = 0;
  for (const object of page.objects) {
    try {
      if (digestFromPdfBlobKey(object.key)) await reconcileSharedPdfBlobKey(env, object.key);
      else if ((await migrateLegacyPdfBlobKey(env, object.key)) === "migrated") migrated += 1;
    } catch {
      deferred += 1;
    }
  }
  await progress.setMigrationCursor(page.truncated ? page.cursor : null);
  return { examined: page.objects.length, migrated, deferred, remaining: page.truncated };
}

export async function reconcileSharedPdfBlobKey(env: Env, objectKey: string): Promise<void> {
  const digest = digestFromPdfBlobKey(objectKey);
  if (!digest) return;
  const authority = env.PDF_BLOBS.getByName(digest);
  for (const { refKey, state } of await authority.references()) {
    const first = refKey.indexOf(":");
    const last = refKey.lastIndexOf(":");
    if (first < 0 || last <= first) continue;
    const kind = refKey.slice(0, first);
    const owner = refKey.slice(first + 1, last);
    const pdfId = refKey.slice(last + 1);
    const retained =
      kind === "library"
        ? (await env.REFERENCE_LIBRARIES.getByName(owner).getSnapshot(true)).artifacts.some(
            ({ id, objectKey: key }) => id === pdfId && key === objectKey,
          )
        : kind === "project"
          ? (await env.DOCUMENT_ROOMS.getByName(owner).listRetainedPdfResources(owner.endsWith(":demo") ? demoWorkspaceId : owner)).some(
              ({ id, objectKey: key }) => id === pdfId && key === objectKey,
            )
          : true;
    if (retained && state === "pending") await authority.commit(refKey);
    if (!retained) await authority.release(refKey);
  }
  await authority.scheduleCollectionIfUnused();
}

export async function migrateLegacyPdfBlobKey(env: Env, key: string): Promise<MigrationResult> {
  const library = /^libraries\/([^/]+)\/([0-9a-f-]{36})\.pdf$/iu.exec(key);
  const project = library ? null : /^([^/]+)\/([0-9a-f-]{36})\.pdf$/iu.exec(key);
  if (!library && !project) return "skipped";
  const source = await env.PAPERS.get(key);
  if (!source) return "skipped";
  if (source.size === 0 || source.size > 25 * 1024 * 1024) throw new Error("Legacy PDF exceeds the 25 MB limit");

  const owner = (library ?? project)![1]!;
  const pdfId = (library ?? project)![2]!;
  const refKey = `${library ? "library" : "project"}:${owner}:${pdfId}`;
  const reservation = await reservePdfBlob(env.PDF_BLOBS, new Uint8Array(await source.arrayBuffer()), refKey);
  const { objectKey, fingerprint } = reservation.blob;
  const outcome = library
    ? await env.REFERENCE_LIBRARIES.getByName(owner).migratePdfBlob(pdfId, key, objectKey, fingerprint)
    : await env.DOCUMENT_ROOMS.getByName(owner).migratePdfBlob(
        owner.endsWith(":demo") ? demoWorkspaceId : owner,
        pdfId,
        key,
        objectKey,
        fingerprint,
      );
  if (outcome === "missing") {
    if (library) {
      await env.REFERENCE_LIBRARIES.getByName(owner).retainMigratedDeletedPdfIdentity(
        `r2-etag:${source.etag.replaceAll('"', "")}`,
        fingerprint,
      );
    }
    await reservation.release();
    await env.PAPERS.delete(key);
    return "skipped";
  }
  await reservation.commit();
  await env.PAPERS.delete(key);
  return "migrated";
}
