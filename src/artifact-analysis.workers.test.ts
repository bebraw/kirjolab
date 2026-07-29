import { env } from "cloudflare:workers";
import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { consumeArtifactAnalysisBatch } from "./artifact-analysis";
import type { ArtifactAnalysisJob } from "./domain/reference-library";

const queueName = "kirjolab-artifact-analysis";

describe("artifact analysis queue", () => {
  it("acknowledges invalid and stale messages without launching analysis", async () => {
    const stale: ArtifactAnalysisJob = {
      version: 1,
      ownerKey: `stale-${crypto.randomUUID()}`,
      artifactId: crypto.randomUUID(),
      fingerprint: "etag:missing",
      kind: "pdf-highlights",
      requestedAt: "2026-07-29T00:00:00.000Z",
    };
    const batch = createMessageBatch(queueName, [
      { id: "invalid", timestamp: new Date(), attempts: 1, body: { version: 2 } },
      { id: "stale", timestamp: new Date(), attempts: 1, body: stale },
    ]);
    await consumeArtifactAnalysisBatch(batch, env);
    const result = await getQueueResult(batch, createExecutionContext());
    expect(result.ackAll).toBe(false);
    expect(result.explicitAcks).toEqual(["invalid", "stale"]);
    expect(result.retryBatch).toEqual({ retry: false });
  });

  it("retries a queued analysis when its private R2 object is temporarily unavailable", async () => {
    const ownerKey = `retry-${crypto.randomUUID()}`;
    const library = env.REFERENCE_LIBRARIES.getByName(ownerKey);
    const artifactId = crypto.randomUUID();
    const draft = await library.createPdfDraft(
      {
        id: artifactId,
        referenceId: null,
        name: "missing.pdf",
        contentType: "application/pdf",
        size: 100,
        objectKey: `libraries/${ownerKey}/${artifactId}.pdf`,
        fingerprint: `etag:${artifactId}`,
        rights: "private",
        createdAt: "2026-07-29T00:00:00.000Z",
      },
      "owner@example.test",
    );
    const requestedAt = "2026-07-29T00:00:01.000Z";
    await library.queueArtifactAnalysis(draft.artifact.id, "pdf-highlights", requestedAt);
    const job: ArtifactAnalysisJob = {
      version: 1,
      ownerKey,
      artifactId: draft.artifact.id,
      fingerprint: draft.artifact.fingerprint,
      kind: "pdf-highlights",
      requestedAt,
    };
    const batch = createMessageBatch(queueName, [{ id: "retry", timestamp: new Date(), attempts: 1, body: job }]);
    await consumeArtifactAnalysisBatch(batch, env);
    const result = await getQueueResult(batch, createExecutionContext());
    expect(result.retryMessages).toEqual([{ msgId: "retry" }]);
    expect(await library.getArtifactAnalysis(draft.artifact.id, "pdf-highlights")).toMatchObject({
      status: "failed",
      error: "PDF artifact content was not found",
    });
  });
});
