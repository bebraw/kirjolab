import { describe, expect, it, vi } from "vitest";
import type { ArtifactAnalysisKind, BibliographicRecord, LibraryPdfArtifact } from "./domain/reference-library";
import { ingestLibraryPdf } from "./library-pdf-ingest";

describe("shared library PDF ingestion in the Workers runtime", () => {
  it("accepts a body that exactly matches its declared length", async () => {
    const stored = vi.fn(async (_key: string, value: ReadableStream<Uint8Array>) => {
      expect(new Uint8Array(await new Response(value).arrayBuffer())).toEqual(new TextEncoder().encode("%PDF"));
      return { etag: '"stored"' };
    });
    const reference: BibliographicRecord = {
      id: crypto.randomUUID(),
      referenceKey: "paper",
      type: "misc",
      title: "paper.pdf",
      authors: [],
      year: "",
      venue: "",
      doi: "",
      url: "",
      abstract: "",
      provenance: {},
      archivedAt: null,
      deletedAt: null,
      createdAt: "2026-08-24T08:00:00.000Z",
      updatedAt: "2026-08-24T08:00:00.000Z",
    };
    const createPdfDraft = vi.fn(async (artifact: LibraryPdfArtifact) => ({ reference, artifact, created: true }));
    const authority = {
      createPdfDraft,
      reserveArtifactAnalysisQueuePublication: vi.fn(async () => {
        throw new Error("Queue authority must not run without a Queue binding");
      }),
      confirmArtifactAnalysisQueuePublication: vi.fn(async () => true),
    };

    const result = await ingestLibraryPdf(
      { actor: "writer@example.test", body: new Blob(["%PDF"]).stream(), name: "paper.pdf", ownerKey: "owner", size: 4 },
      {
        authority,
        storage: { put: stored, delete: vi.fn(async () => undefined) },
        now: () => new Date("2026-08-24T08:00:00.000Z"),
        randomUUID: () => "22222222-2222-4222-8222-222222222222",
      },
    );

    expect(result).toMatchObject({ created: true, artifact: { size: 4, fingerprint: "r2-etag:stored" } });
    expect(stored).toHaveBeenCalledOnce();
    expect(createPdfDraft).toHaveBeenCalledOnce();
  });

  it.each([
    ["shorter", 5],
    ["longer", 3],
  ])("rejects a body %s than its declared exact length", async (_case, size) => {
    const createPdfDraft = vi.fn(async (_artifact: LibraryPdfArtifact, _actor: string) => {
      throw new Error("Draft creation must not run for a length mismatch");
    });
    const storage = {
      put: vi.fn(async (_key: string, value: ReadableStream<Uint8Array>) => {
        await new Response(value).arrayBuffer();
        return { etag: '"stored"' };
      }),
      delete: vi.fn(async (_key: string) => undefined),
    };
    const authority = {
      createPdfDraft,
      reserveArtifactAnalysisQueuePublication: vi.fn(async (_artifactId: string, _kind: ArtifactAnalysisKind) => {
        throw new Error("Analysis must not run for a length mismatch");
      }),
      confirmArtifactAnalysisQueuePublication: vi.fn(async () => true),
    };

    await expect(
      ingestLibraryPdf(
        { actor: "writer@example.test", body: new Blob(["%PDF"]).stream(), name: "paper.pdf", ownerKey: "owner", size },
        { authority, storage },
      ),
    ).rejects.toBeDefined();

    expect(storage.put).toHaveBeenCalledOnce();
    expect(createPdfDraft).not.toHaveBeenCalled();
  });
});
