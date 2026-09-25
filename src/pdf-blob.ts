import { sha256Bytes } from "./domain/sha256";

const blobPrefix = "pdf-blobs/sha256/";
const maximumPdfBytes = 25 * 1024 * 1024;

export function digestFromPdfBlobKey(objectKey: string): string | null {
  const match = /^pdf-blobs\/sha256\/([a-f0-9]{64})\.pdf$/u.exec(objectKey);
  return match?.[1] ?? null;
}

export interface PdfBlobStorage {
  put(
    key: string,
    value: Uint8Array,
    options: {
      readonly onlyIf: { readonly etagDoesNotMatch: "*" };
      readonly httpMetadata: { readonly contentType: "application/pdf" };
    },
  ): Promise<unknown | null>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

export interface StoredPdfBlob {
  readonly objectKey: string;
  readonly fingerprint: string;
}

export interface PdfBlobReservation {
  readonly blob: StoredPdfBlob;
  commit(): Promise<void>;
  release(): Promise<void>;
}

export interface PdfBlobAuthorityNamespace {
  getByName(name: string): {
    reserve(digest: string, refKey: string, bytes: Uint8Array): Promise<StoredPdfBlob>;
    commit(refKey: string): Promise<void> | void;
    release(refKey: string): Promise<void>;
  };
}

export async function reservePdfBlob(authority: PdfBlobAuthorityNamespace, bytes: Uint8Array, refKey: string): Promise<PdfBlobReservation> {
  const digest = await sha256Bytes(bytes);
  const stub = authority.getByName(digest);
  const blob = await stub.reserve(digest, refKey, bytes);
  return {
    blob,
    commit: async () => await stub.commit(refKey),
    release: async () => await stub.release(refKey),
  };
}

export async function storePdfBlob(storage: PdfBlobStorage, bytes: Uint8Array): Promise<StoredPdfBlob> {
  if (bytes.byteLength === 0 || bytes.byteLength > maximumPdfBytes) throw new Error("PDF exceeds the 25 MB limit");
  const digest = await sha256Bytes(bytes);
  const objectKey = `${blobPrefix}${digest}.pdf`;
  const stored = await storage.put(objectKey, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/pdf" },
  });
  if (!stored) {
    const existing = await storage.get(objectKey);
    if (!existing || (await sha256Bytes(new Uint8Array(await existing.arrayBuffer()))) !== digest) {
      throw new Error("The shared PDF blob does not match its content identity");
    }
  }
  return { objectKey, fingerprint: `sha256:${digest}` };
}

export async function readExactPdfBytes(body: ReadableStream<Uint8Array>, expectedSize: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > maximumPdfBytes) {
    throw new Error("PDF exceeds the 25 MB limit");
  }
  const reader = body.getReader();
  const bytes = new Uint8Array(expectedSize);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > expectedSize) throw new Error("PDF body exceeds Content-Length");
      bytes.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== expectedSize) throw new Error("PDF body does not match Content-Length");
  return bytes;
}
