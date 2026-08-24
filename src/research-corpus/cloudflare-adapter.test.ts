import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtifactAnalysis, BibliographicRecord, LibraryPdfArtifact, ReferenceLibrarySnapshot } from "../domain/reference-library";
import { createCloudflareCorpusService, type CorpusCloudflareEnvironment, type CorpusLibraryAuthority } from "./cloudflare-adapter";

const artifactId = "22222222-2222-4222-8222-222222222222";
const createdAt = "2026-08-24T08:00:00.000Z";
const reference: BibliographicRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  referenceKey: "paper",
  type: "article",
  title: "Paper",
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
const artifact: LibraryPdfArtifact = {
  id: artifactId,
  referenceId: null,
  name: "paper.pdf",
  contentType: "application/pdf",
  size: 42,
  objectKey: "owners/private/paper.pdf",
  fingerprint: "sha256:paper",
  rights: "private",
  createdAt,
};
const queued: ArtifactAnalysis = {
  artifactId,
  fingerprint: artifact.fingerprint,
  kind: "pdf-text",
  status: "queued",
  result: null,
  error: "",
  requestedAt: createdAt,
  startedAt: null,
  completedAt: null,
};

describe("Research Corpus Cloudflare adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("selects exactly the authenticated owner's authority and submits the shared job contract", async () => {
    const { env, getByName, queue } = fixture();
    const service = createCloudflareCorpusService("owner-key", "writer@example.test", env);

    await service.startExtraction(artifactId, "pdf-text");

    expect(getByName).toHaveBeenCalledWith("owner-key");
    expect(queue.send).toHaveBeenCalledWith(
      expect.objectContaining({ ownerKey: "owner-key", artifactId, fingerprint: artifact.fingerprint, kind: "pdf-text" }),
      { contentType: "json" },
    );
    expect(JSON.stringify(queue.send.mock.calls)).not.toContain(artifact.objectKey);
  });

  it("rejects an invalid authority snapshot before projecting private state", async () => {
    const { env, library } = fixture();
    library.getSnapshot.mockResolvedValue({ artifacts: [artifact] });
    const service = createCloudflareCorpusService("owner-key", "writer@example.test", env);

    await expect(service.listArtifacts()).rejects.toThrow("invalid snapshot");
  });

  it("treats invalid persisted extraction state as an authority failure", async () => {
    const { env, library } = fixture();
    library.getArtifactAnalysis.mockResolvedValue({ ...queued, status: "mystery" });
    const service = createCloudflareCorpusService("owner-key", "writer@example.test", env);

    await expect(service.getExtraction(artifactId, "pdf-text")).rejects.toThrow("invalid extraction state");
  });

  it("writes new PDFs through the shared authority with the authenticated actor", async () => {
    vi.stubGlobal("FixedLengthStream", TestFixedLengthStream);
    const { env, library, queue, papers } = fixture();
    const service = createCloudflareCorpusService("owner-key", "writer@example.test", env);

    const result = await service.ingestPdf({ body: new Blob(["%PDF"]).stream(), name: "draft.pdf", size: 4 });

    expect(result).toEqual({ artifact: expect.objectContaining({ id: artifactId }), created: true });
    expect(library.createPdfDraft).toHaveBeenCalledWith(expect.objectContaining({ name: "draft.pdf" }), "writer@example.test");
    expect(papers.put).toHaveBeenCalledWith(
      expect.stringMatching(/^libraries\/owner-key\/[0-9a-f-]{36}\.pdf$/u),
      expect.any(ReadableStream),
      { httpMetadata: { contentType: "application/pdf" } },
    );
    expect(queue.send).toHaveBeenCalledTimes(3);
  });
});

function fixture() {
  const library: CorpusLibraryAuthority & {
    getSnapshot: ReturnType<typeof vi.fn<CorpusLibraryAuthority["getSnapshot"]>>;
    getArtifactAnalysis: ReturnType<typeof vi.fn<CorpusLibraryAuthority["getArtifactAnalysis"]>>;
    queueArtifactAnalysis: ReturnType<typeof vi.fn<CorpusLibraryAuthority["queueArtifactAnalysis"]>>;
    failArtifactAnalysis: ReturnType<typeof vi.fn<CorpusLibraryAuthority["failArtifactAnalysis"]>>;
  } = {
    getSnapshot: vi.fn(async () => snapshot()),
    getArtifactAnalysis: vi.fn(async () => null),
    queueArtifactAnalysis: vi.fn(async () => queued),
    failArtifactAnalysis: vi.fn(async () => true),
    createPdfDraft: vi.fn(async () => ({ reference, artifact, created: true })),
  };
  const getByName = vi.fn(() => library);
  const queue = { send: vi.fn(async () => undefined) };
  const papers = new TestPapers();
  const env: CorpusCloudflareEnvironment = {
    REFERENCE_LIBRARIES: { getByName },
    ARTIFACT_ANALYSIS_QUEUE: queue,
    PAPERS: papers,
  };
  return { env, getByName, library, queue, papers };
}

function unusedR2Object(): R2Object {
  return {
    key: "unused",
    version: "unused",
    size: 0,
    etag: "unused",
    httpEtag: '"unused"',
    checksums: { toJSON: () => ({}) },
    uploaded: new Date(createdAt),
    storageClass: "Standard",
    writeHttpMetadata: () => undefined,
  };
}

class TestPapers implements Pick<R2Bucket, "delete" | "get" | "put"> {
  readonly delete = vi.fn(async (_keys: string | string[]) => undefined);
  readonly get = vi.fn(async (_key: string) => null);
  readonly put = vi.fn(
    async (
      _key: string,
      value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
      _options?: R2PutOptions,
    ): Promise<R2Object> => {
      if (value instanceof ReadableStream) await new Response(value).arrayBuffer();
      return unusedR2Object();
    },
  );
}

class TestFixedLengthStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(_expectedLength: number) {
    super();
  }
}

function snapshot(): ReferenceLibrarySnapshot {
  return {
    references: [reference],
    referenceKeyStates: {},
    artifacts: [artifact],
    webSources: [],
    webSnapshots: [],
    notes: [],
    highlights: [],
    tags: {},
    collections: {},
    reading: [],
  };
}
