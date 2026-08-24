import { describe, expect, it, vi } from "vitest";
import type { ArtifactAnalysis } from "./domain/reference-library";
import { enqueueArtifactAnalysis } from "./artifact-analysis-job";

const requestedAt = "2026-08-24T08:00:00.000Z";
const artifactId = "22222222-2222-4222-8222-222222222222";
const analysis: ArtifactAnalysis = {
  artifactId,
  fingerprint: "sha256:paper",
  kind: "pdf-text",
  status: "queued",
  result: null,
  error: "",
  requestedAt,
  startedAt: null,
  completedAt: null,
};

describe("artifact analysis job submission", () => {
  it("sends only the versioned locator and immutable fingerprint", async () => {
    const library = libraryFixture();
    const queue = { send: vi.fn(async () => undefined) };

    await enqueueArtifactAnalysis("owner-key", artifactId, "pdf-text", queue, library, false, () => requestedAt);

    expect(queue.send).toHaveBeenCalledWith(
      {
        version: 1,
        ownerKey: "owner-key",
        artifactId,
        fingerprint: "sha256:paper",
        kind: "pdf-text",
        requestedAt,
      },
      { contentType: "json" },
    );
    expect(JSON.stringify(queue.send.mock.calls)).not.toContain("objectKey");
  });

  it("does not submit a job when the authority returns an existing state", async () => {
    const library = libraryFixture({ ...analysis, status: "ready", completedAt: requestedAt });
    const queue = { send: vi.fn(async () => undefined) };

    const result = await enqueueArtifactAnalysis("owner-key", artifactId, "pdf-text", queue, library);

    expect(result.status).toBe("ready");
    expect(queue.send).not.toHaveBeenCalled();
  });

  it("records a bounded failed state when queue submission fails", async () => {
    const library = libraryFixture();
    const queue = { send: vi.fn(async () => Promise.reject(new Error("x".repeat(1_500)))) };

    const result = await enqueueArtifactAnalysis("owner-key", artifactId, "pdf-text", queue, library);

    expect(library.failArtifactAnalysis).toHaveBeenCalledWith(artifactId, "pdf-text", "sha256:paper", expect.any(String), expect.any(String));
    expect(result.status).toBe("failed");
    expect(result.error).toHaveLength(1_000);
  });

  it("returns an explicit failed state when the queue capability is absent", async () => {
    const library = libraryFixture();

    const result = await enqueueArtifactAnalysis("owner-key", artifactId, "pdf-text", undefined, library, false, () => requestedAt);

    expect(result).toEqual(expect.objectContaining({ status: "failed", error: "Artifact analysis queue is unavailable" }));
    expect(library.queueArtifactAnalysis).not.toHaveBeenCalled();
  });
});

function libraryFixture(value: ArtifactAnalysis = analysis) {
  return {
    queueArtifactAnalysis: vi.fn(async () => value),
    failArtifactAnalysis: vi.fn(async () => true),
  };
}
