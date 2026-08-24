import { describe, expect, it, vi } from "vitest";
import type { ArtifactAnalysis, LibraryPdfArtifact, ReferenceLibrarySnapshot } from "../domain/reference-library";
import { createCloudflareCorpusService, type CorpusCloudflareEnvironment, type CorpusLibraryAuthority } from "./cloudflare-adapter";

const artifactId = "22222222-2222-4222-8222-222222222222";
const createdAt = "2026-08-24T08:00:00.000Z";
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
  it("selects exactly the authenticated owner's authority and submits the shared job contract", async () => {
    const { env, getByName, queue } = fixture();
    const service = createCloudflareCorpusService("owner-key", env);

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
    const service = createCloudflareCorpusService("owner-key", env);

    await expect(service.listArtifacts()).rejects.toThrow("invalid snapshot");
  });

  it("treats invalid persisted extraction state as an authority failure", async () => {
    const { env, library } = fixture();
    library.getArtifactAnalysis.mockResolvedValue({ ...queued, status: "mystery" });
    const service = createCloudflareCorpusService("owner-key", env);

    await expect(service.getExtraction(artifactId, "pdf-text")).rejects.toThrow("invalid extraction state");
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
  };
  const getByName = vi.fn(() => library);
  const queue = { send: vi.fn(async () => undefined) };
  const env: CorpusCloudflareEnvironment = {
    REFERENCE_LIBRARIES: { getByName },
    ARTIFACT_ANALYSIS_QUEUE: queue,
    PAPERS: { get: vi.fn(async () => null) },
  };
  return { env, getByName, library, queue };
}

function snapshot(): ReferenceLibrarySnapshot {
  return {
    references: [],
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
