import { describe, expect, it, vi } from "vitest";
import type { ArtifactAnalysis, ArtifactAnalysisJob, BibliographicRecord, LibraryPdfArtifact } from "./domain/reference-library";
import { ingestLibraryPdf } from "./library-pdf-ingest";

const createdAt = "2026-08-24T08:00:00.000Z";
const blobKey = "pdf-blobs/sha256/315d429b7714cedb6ad04ac31240145257692630457f3c88253c5beceac76027.pdf";

describe("shared library PDF ingestion", () => {
  it("stores one shared PDF, creates its owner-scoped draft, and queues all extraction kinds", async () => {
    const { authority, queue, storage, stored } = fixture();

    const result = await ingestLibraryPdf(
      { actor: "writer@example.test", body: new Blob(["%PDF"]).stream(), name: "draft.pdf", ownerKey: "owner-key", size: 4 },
      dependencies(authority, queue, storage),
    );

    expect(result.created).toBe(true);
    expect(stored.get(blobKey)).toEqual(new TextEncoder().encode("%PDF"));
    expect(authority.createPdfDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "22222222-2222-4222-8222-222222222222",
        name: "draft.pdf",
        fingerprint: `sha256:${blobKey.slice("pdf-blobs/sha256/".length, -4)}`,
      }),
      "writer@example.test",
    );
    expect(queue.send).toHaveBeenCalledTimes(3);
    expect(queue.send.mock.calls.map(([message]) => message.kind)).toEqual(["pdf-highlights", "pdf-references", "pdf-text"]);
    expect(JSON.stringify(queue.send.mock.calls)).not.toContain(blobKey);
  });

  it("retains shared bytes when the owner authority resolves an existing draft", async () => {
    const { authority, queue, storage, stored } = fixture({ created: false });

    await ingestLibraryPdf(
      { actor: "writer@example.test", body: new Blob(["%PDF"]).stream(), name: "repeat.pdf", ownerKey: "owner-key", size: 4 },
      dependencies(authority, queue, storage),
    );

    expect(stored.size).toBe(1);
    expect(queue.send).toHaveBeenCalledTimes(3);
  });

  it("retains immutable shared bytes for retry if draft creation fails", async () => {
    const { authority, queue, storage, stored } = fixture();
    authority.createPdfDraft.mockRejectedValueOnce(new Error("authority failed"));

    await expect(
      ingestLibraryPdf(
        { actor: "writer@example.test", body: new Blob(["%PDF"]).stream(), name: "draft.pdf", ownerKey: "owner-key", size: 4 },
        dependencies(authority, queue, storage),
      ),
    ).rejects.toThrow("authority failed");

    expect(stored.size).toBe(1);
    expect(queue.send).not.toHaveBeenCalled();
  });
});

function fixture(options: { readonly created?: boolean } = {}) {
  const artifact: LibraryPdfArtifact = {
    id: "22222222-2222-4222-8222-222222222222",
    referenceId: null,
    name: "draft.pdf",
    contentType: "application/pdf",
    size: 4,
    objectKey: blobKey,
    fingerprint: `sha256:${blobKey.slice("pdf-blobs/sha256/".length, -4)}`,
    rights: "private",
    createdAt,
  };
  const reference: BibliographicRecord = {
    id: "11111111-1111-4111-8111-111111111111",
    referenceKey: "draft",
    type: "article",
    title: "Draft",
    authors: [],
    year: "",
    venue: "",
    doi: "",
    url: "",
    abstract: "",
    provenance: {},
    archivedAt: null,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
  const analysis = (kind: ArtifactAnalysis["kind"]): ArtifactAnalysis => ({
    artifactId: artifact.id,
    fingerprint: artifact.fingerprint,
    kind,
    status: "queued",
    result: null,
    error: "",
    requestedAt: createdAt,
    startedAt: null,
    completedAt: null,
  });
  const authority = {
    createPdfDraft: vi.fn(async () => ({ reference, artifact, created: options.created ?? true })),
    reserveArtifactAnalysisQueuePublication: vi.fn(async (_artifactId: string, kind: ArtifactAnalysis["kind"]) => ({
      analysis: analysis(kind),
      shouldPublish: true,
    })),
    confirmArtifactAnalysisQueuePublication: vi.fn(async () => true),
  };
  const stored = new Map<string, Uint8Array>();
  const storage = {
    put: vi.fn(async (key: string, value: Uint8Array) => {
      if (stored.has(key)) return null;
      stored.set(key, Uint8Array.from(value));
      return { etag: '"stored-etag"' };
    }),
    get: vi.fn(async (key: string) => {
      const value = stored.get(key);
      return value ? { arrayBuffer: async () => Uint8Array.from(value).buffer } : null;
    }),
  };
  const queue = { send: vi.fn(async (_message: ArtifactAnalysisJob) => undefined) };
  return { authority, queue, storage, stored };
}

function dependencies(
  authority: ReturnType<typeof fixture>["authority"],
  queue: ReturnType<typeof fixture>["queue"],
  storage: ReturnType<typeof fixture>["storage"],
) {
  return {
    authority,
    queue,
    storage,
    now: () => new Date(createdAt),
    randomUUID: () => "22222222-2222-4222-8222-222222222222",
  };
}
