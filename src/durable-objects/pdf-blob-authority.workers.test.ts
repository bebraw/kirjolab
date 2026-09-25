import { env, runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { sha256Bytes } from "../domain/sha256";

describe("shared PDF blob authority", () => {
  it("retains one verified blob while either logical resource still refers to it", async () => {
    const bytes = new TextEncoder().encode(`%PDF-1.7\n${crypto.randomUUID()}`);
    const digest = await sha256Bytes(bytes);
    const blob = env.PDF_BLOBS.getByName(digest);
    const libraryRef = `library:owner:${crypto.randomUUID()}`;
    const projectRef = `project:workspace:${crypto.randomUUID()}`;

    const first = await blob.reserve(digest, libraryRef, bytes);
    const second = await blob.reserve(digest, projectRef, bytes);
    expect(second.objectKey).toBe(first.objectKey);
    await expect(blob.referenceCount()).resolves.toBe(2);
    await blob.commit(libraryRef);
    await blob.commit(projectRef);
    await blob.release(libraryRef);
    expect(await env.PAPERS.get(first.objectKey)).not.toBeNull();
    await blob.release(projectRef);
    expect(await runDurableObjectAlarm(blob)).toBe(true);
    expect(await env.PAPERS.get(first.objectKey)).toBeNull();
  });
});
