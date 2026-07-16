import { describe, expect, it } from "vitest";

import { downloadR2Object } from "./r2-download";

describe("downloadR2Object", () => {
  it("returns a complete object and forwards request conditions to R2", async () => {
    const request = new Request("https://example.test/document.pdf", {
      headers: { "if-none-match": '"previous"' },
    });
    const bucket = new TestR2Bucket(r2ObjectBody(new Uint8Array([1, 2, 3, 4])));

    const response = await downloadR2Object(request, bucket, "document.pdf", {
      cacheControl: "private, no-store",
      contentDisposition: "inline",
    });

    expect(bucket.calls).toEqual([{ key: "document.pdf", options: { onlyIf: request.headers, range: request.headers } }]);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("accept-ranges")).toBe("bytes");
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(response?.headers.get("content-length")).toBe("4");
    expect(response?.headers.get("etag")).toBe('"test-etag"');
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("returns an HTTP partial response for an R2 byte range", async () => {
    const bucket = new TestR2Bucket(r2ObjectBody(new Uint8Array([2, 3]), { offset: 1, length: 2 }, 4));

    const response = await downloadR2Object(new Request("https://example.test/document.pdf"), bucket, "document.pdf", {
      cacheControl: "private, max-age=300",
      contentDisposition: "inline",
    });

    expect(response?.status).toBe(206);
    expect(response?.headers.get("content-range")).toBe("bytes 1-2/4");
    expect(response?.headers.get("content-length")).toBe("2");
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(new Uint8Array([2, 3]));
  });

  it("returns a precondition failure when R2 omits the body", async () => {
    const bucket = new TestR2Bucket(r2ObjectMetadata());

    const response = await downloadR2Object(new Request("https://example.test/document.pdf"), bucket, "document.pdf", {
      cacheControl: "private, no-store",
      contentDisposition: "inline",
    });

    expect(response?.status).toBe(412);
    expect(response?.headers.get("etag")).toBe('"test-etag"');
    expect(await response?.text()).toBe("");
  });

  it("returns null when the R2 object is missing", async () => {
    const response = await downloadR2Object(new Request("https://example.test/missing.pdf"), new TestR2Bucket(null), "missing.pdf", {
      cacheControl: "private, no-store",
      contentDisposition: "inline",
    });

    expect(response).toBeNull();
  });
});

class TestR2Bucket implements Pick<R2Bucket, "get"> {
  readonly calls: Array<{ key: string; options: R2GetOptions | undefined }> = [];

  constructor(private readonly result: R2ObjectBody | R2Object | null) {}

  get(key: string, options: R2GetOptions & { onlyIf: R2Conditional | Headers }): Promise<R2ObjectBody | R2Object | null>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  async get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | R2Object | null> {
    this.calls.push({ key, options });
    return this.result;
  }
}

function r2ObjectBody(bytes: Uint8Array, range?: R2Range, size = bytes.length): R2ObjectBody {
  const metadata = r2ObjectMetadata(size, range);
  return {
    ...metadata,
    writeHttpMetadata(headers: Headers): void {
      metadata.writeHttpMetadata(headers);
    },
    body: new Blob([bytes]).stream(),
    bodyUsed: false,
    arrayBuffer: async () => bytes.slice().buffer,
    bytes: async () => bytes.slice(),
    text: async () => new TextDecoder().decode(bytes),
    json: async () => JSON.parse(new TextDecoder().decode(bytes)),
    blob: async () => new Blob([bytes]),
  };
}

function r2ObjectMetadata(size = 4, range?: R2Range): R2Object {
  return {
    key: "document.pdf",
    version: "test-version",
    size,
    etag: "test-etag",
    httpEtag: '"test-etag"',
    checksums: { toJSON: () => ({}) },
    uploaded: new Date("2026-01-01T00:00:00.000Z"),
    httpMetadata: { contentType: "application/pdf" },
    storageClass: "Standard",
    ...(range ? { range } : {}),
    writeHttpMetadata(headers: Headers): void {
      headers.set("content-type", "application/pdf");
    },
  };
}
