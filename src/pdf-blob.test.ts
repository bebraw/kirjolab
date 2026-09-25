import { describe, expect, it, vi } from "vitest";
import { readExactPdfBytes, storePdfBlob, type PdfBlobStorage } from "./pdf-blob";

const bytes = new TextEncoder().encode("%PDF-1.7\nshared paper");
const digest = "73d2a813f0862b686ee891f334be89ad6c94ddfc779bf3c2e0e6dd7e0d678df4";

function storage(existing?: Uint8Array) {
  const put = vi.fn(async () => (existing ? null : { etag: "stored" }));
  const get = vi.fn(async () => (existing ? { arrayBuffer: async () => Uint8Array.from(existing).buffer } : null));
  return { put, get } satisfies PdfBlobStorage;
}

describe("shared PDF blob", () => {
  it("stores one immutable key from verified bytes without owner metadata", async () => {
    const bucket = storage();
    const result = await storePdfBlob(bucket, bytes);
    expect(result.objectKey).toBe(`pdf-blobs/sha256/${digest}.pdf`);
    expect(result.fingerprint).toBe(`sha256:${digest}`);
    expect(bucket.put).toHaveBeenCalledWith(result.objectKey, bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/pdf" },
    });
  });

  it("reuses a matching blob and rejects unexpected bytes at the content key", async () => {
    const duplicate = storage(bytes);
    expect(await storePdfBlob(duplicate, bytes)).toMatchObject({ fingerprint: `sha256:${digest}` });
    await expect(storePdfBlob(storage(new TextEncoder().encode("different")), bytes)).rejects.toThrow("does not match");
  });

  it("reads the declared complete body and rejects shorter or longer uploads", async () => {
    const stream = (value: Uint8Array) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(value);
          controller.close();
        },
      });
    expect(await readExactPdfBytes(stream(bytes), bytes.byteLength)).toEqual(bytes);
    await expect(readExactPdfBytes(stream(bytes), bytes.byteLength - 1)).rejects.toThrow("exceeds");
    await expect(readExactPdfBytes(stream(bytes), bytes.byteLength + 1)).rejects.toThrow("does not match");
  });
});
