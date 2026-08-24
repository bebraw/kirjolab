import { describe, expect, it, vi } from "vitest";
import type { ArtifactAnalysis, ArtifactAnalysisJob, BibliographicRecord, LibraryPdfArtifact } from "./domain/reference-library";
import { ingestLibraryPdf } from "./library-pdf-ingest";

const createdAt = "2026-08-24T08:00:00.000Z";

describe("shared library PDF ingestion", () => {
  it("stores one owner-scoped PDF, creates its draft, and queues all extraction kinds", async () => {
    const { authority, queue, storage, stored } = fixture();

    const result = await ingestLibraryPdf(
      { actor: "writer@example.test", body: new Blob(["%PDF"]).stream(), name: "draft.pdf", ownerKey: "owner-key", size: 4 },
      dependencies(authority, queue, storage),
    );

    expect(result.created).toBe(true);
    expect(stored.get("libraries/owner-key/22222222-2222-4222-8222-222222222222.pdf")).toEqual(new TextEncoder().encode("%PDF"));
    expect(authority.createPdfDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "22222222-2222-4222-8222-222222222222",
        name: "draft.pdf",
        fingerprint: "r2-etag:stored-etag",
      }),
      "writer@example.test",
    );
    expect(queue.send).toHaveBeenCalledTimes(3);
    expect(queue.send.mock.calls.map(([message]) => message.kind)).toEqual(["pdf-highlights", "pdf-references", "pdf-text"]);
    expect(JSON.stringify(queue.send.mock.calls)).not.toContain("libraries/owner-key");
  });

  it("deletes a redundant upload when the authority resolves an existing draft", async () => {
    const { authority, queue, storage, stored } = fixture({ created: false });

    await ingestLibraryPdf(
      { actor: "writer@example.test", body: new Blob(["%PDF"]).stream(), name: "repeat.pdf", ownerKey: "owner-key", size: 4 },
      dependencies(authority, queue, storage),
    );

    expect(stored.size).toBe(0);
    expect(queue.send).toHaveBeenCalledTimes(3);
  });

  it("removes the uploaded object if draft creation fails", async () => {
    const { authority, queue, storage, stored } = fixture();
    authority.createPdfDraft.mockRejectedValueOnce(new Error("authority failed"));

    await expect(
      ingestLibraryPdf(
        { actor: "writer@example.test", body: new Blob(["%PDF"]).stream(), name: "draft.pdf", ownerKey: "owner-key", size: 4 },
        dependencies(authority, queue, storage),
      ),
    ).rejects.toThrow("authority failed");

    expect(stored.size).toBe(0);
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
    objectKey: "libraries/owner-key/22222222-2222-4222-8222-222222222222.pdf",
    fingerprint: "r2-etag:stored-etag",
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
    failArtifactAnalysis: vi.fn(async () => true),
  };
  const stored = new Map<string, Uint8Array>();
  const storage = {
    put: vi.fn(async (key: string, value: ReadableStream) => {
      stored.set(key, new Uint8Array(await new Response(value).arrayBuffer()));
      return { etag: '"stored-etag"' };
    }),
    delete: vi.fn(async (key: string) => {
      stored.delete(key);
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
    createFixedLengthStream: () => new TransformStream<Uint8Array, Uint8Array>(),
    now: () => new Date(createdAt),
    randomUUID: () => "22222222-2222-4222-8222-222222222222",
  };
}
