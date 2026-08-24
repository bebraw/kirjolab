import { describe, expect, it, vi } from "vitest";
import type { ArtifactAnalysisKind, LibraryPdfArtifact } from "./domain/reference-library";
import { ingestLibraryPdf } from "./library-pdf-ingest";

describe("shared library PDF ingestion in the Workers runtime", () => {
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
      queueArtifactAnalysis: vi.fn(async (_artifactId: string, _kind: ArtifactAnalysisKind) => {
        throw new Error("Analysis must not run for a length mismatch");
      }),
      failArtifactAnalysis: vi.fn(async () => false),
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
