import { env, runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { sha256Bytes } from "./domain/sha256";
import { migrateLegacyPdfBlobKey, reconcileSharedPdfBlobKey } from "./pdf-blob-migration";

describe("legacy PDF blob migration", () => {
  it("reconciles a logical reference lost after a cross-authority failure", async () => {
    const bytes = new TextEncoder().encode(`%PDF-1.7\n${crypto.randomUUID()}`);
    const digest = await sha256Bytes(bytes);
    const authority = env.PDF_BLOBS.getByName(digest);
    const refKey = `library:${crypto.randomUUID()}:${crypto.randomUUID()}`;
    const blob = await authority.reserve(digest, refKey, bytes);
    await authority.commit(refKey);

    await reconcileSharedPdfBlobKey(env, blob.objectKey);

    await expect(authority.referenceCount()).resolves.toBe(0);
    expect(await runDurableObjectAlarm(authority)).toBe(true);
    expect(await env.PAPERS.get(blob.objectKey)).toBeNull();
  });

  it("moves a project PDF resource and its retained revision pointers", async () => {
    const workspaceId = crypto.randomUUID();
    const pdfId = crypto.randomUUID();
    const oldKey = `${workspaceId}/${pdfId}.pdf`;
    const bytes = new TextEncoder().encode("%PDF-1.7\nproject legacy");
    await env.PAPERS.put(oldKey, bytes, { httpMetadata: { contentType: "application/pdf" } });
    const room = env.DOCUMENT_ROOMS.getByName(workspaceId);
    await room.getSnapshot(workspaceId);
    await room.registerPdf({
      id: pdfId,
      name: "legacy.pdf",
      contentType: "application/pdf",
      size: bytes.byteLength,
      objectKey: oldKey,
      fingerprint: "r2-etag:legacy",
      createdAt: new Date().toISOString(),
    });
    const profile = (await room.getSnapshot(workspaceId)).publicationProfile;
    await room.updatePublicationProfile({ ...profile, locale: "fi-FI" });

    expect(await migrateLegacyPdfBlobKey(env, oldKey)).toBe("migrated");
    const pdf = (await room.getSnapshot(workspaceId)).pdfs.find(({ id }) => id === pdfId);
    expect(pdf?.objectKey).toMatch(/^pdf-blobs\/sha256\/[a-f0-9]{64}\.pdf$/u);
    expect((await room.listRetainedPdfResources(workspaceId)).every(({ objectKey }) => objectKey !== oldKey)).toBe(true);
    expect(await env.PAPERS.get(oldKey)).toBeNull();
  });

  it("moves a private Library artifact to verified shared bytes before removing its old object", async () => {
    const owner = crypto.randomUUID();
    const artifactId = crypto.randomUUID();
    const oldKey = `libraries/${owner}/${artifactId}.pdf`;
    const bytes = new TextEncoder().encode("%PDF-1.7\nlegacy");
    await env.PAPERS.put(oldKey, bytes, { httpMetadata: { contentType: "application/pdf" } });
    const library = env.REFERENCE_LIBRARIES.getByName(owner);
    const draft = await library.createPdfDraft(
      {
        id: artifactId,
        referenceId: null,
        name: "legacy.pdf",
        contentType: "application/pdf",
        size: bytes.byteLength,
        objectKey: oldKey,
        fingerprint: "r2-etag:legacy",
        rights: "private",
        createdAt: new Date().toISOString(),
      },
      "owner@example.test",
    );
    expect(draft.created).toBe(true);

    expect(await migrateLegacyPdfBlobKey(env, oldKey)).toBe("migrated");
    const artifact = (await library.getSnapshot(true)).artifacts.find(({ id }) => id === artifactId);
    expect(artifact?.objectKey).toMatch(/^pdf-blobs\/sha256\/[a-f0-9]{64}\.pdf$/u);
    expect(artifact?.fingerprint).toBe(`sha256:${artifact?.objectKey.slice(17, -4)}`);
    expect(await env.PAPERS.get(oldKey)).toBeNull();
    expect(await env.PAPERS.get(artifact!.objectKey)).not.toBeNull();
    const repeat = await library.createPdfDraft(
      { ...artifact!, id: crypto.randomUUID(), referenceId: null, name: "repeat.pdf" },
      "owner@example.test",
    );
    expect(repeat).toMatchObject({ created: false, artifact: { id: artifactId } });
    const otherId = crypto.randomUUID();
    await library.registerPdf({ ...artifact!, id: otherId, referenceId: null });
    expect((await library.getSnapshot(true)).artifacts.find(({ id }) => id === otherId)?.objectKey).toBe(artifact?.objectKey);
  });
});
