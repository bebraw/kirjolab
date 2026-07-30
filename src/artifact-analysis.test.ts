import { afterEach, describe, expect, it, vi } from "vitest";
import {
  artifactAnalysisPageUrl,
  consumeArtifactAnalysisBatch,
  loadGeneratedTextAsset,
  markdownToPlainText,
  respondToArtifactRequest,
} from "./artifact-analysis";
import type { ArtifactAnalysisJob } from "./domain/reference-library";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("artifact analysis support", () => {
  it("normalizes OCR markdown to searchable plain text", () => {
    expect(markdownToPlainText("# Heading\n\n- A [reference](https://example.test) with **weight**.\n![scan](scan.png)")).toBe(
      "Heading A reference with weight.",
    );
  });

  it("uses the filesystem fallback outside the Workers runtime", async () => {
    const bundled = vi.fn(async () => "bundled");
    const disk = vi.fn(async () => "disk");
    await expect(loadGeneratedTextAsset(bundled, disk)).resolves.toBe("disk");
    expect(bundled).not.toHaveBeenCalled();
  });

  it("uses the bundled asset inside the Workers runtime", async () => {
    vi.stubGlobal("WebSocketPair", class WebSocketPair {});
    const bundled = vi.fn(async () => "bundled");
    const disk = vi.fn(async () => "disk");
    await expect(loadGeneratedTextAsset(bundled, disk)).resolves.toBe("bundled");
    expect(disk).not.toHaveBeenCalled();
  });

  it("acknowledges invalid jobs and retries recoverable failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failed = vi.fn(async () => undefined);
    const library = {
      startArtifactAnalysis: vi.fn(async () => {
        throw new Error("temporary failure");
      }),
      failArtifactAnalysis: failed,
    };
    const invalid = message("invalid", { version: 2 }, 1);
    const retry = message("retry", job(), 1);
    await consumeArtifactAnalysisBatch(
      { messages: [invalid, retry] } as never,
      {
        REFERENCE_LIBRARIES: { getByName: () => library },
      } as never,
    );

    expect(invalid.ack).toHaveBeenCalledOnce();
    expect(retry.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(failed).toHaveBeenCalledWith("artifact-id", "pdf-text", "etag:test", "2026-07-30T00:00:00.000Z", "temporary failure");
  });

  it("acknowledges a final failed attempt and bounds non-error details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failed = vi.fn(async () => undefined);
    const library = {
      startArtifactAnalysis: vi.fn(async () => {
        throw "unavailable";
      }),
      failArtifactAnalysis: failed,
    };
    const finalAttempt = message("final", job(), 4);
    await consumeArtifactAnalysisBatch(
      { messages: [finalAttempt] } as never,
      {
        REFERENCE_LIBRARIES: { getByName: () => library },
      } as never,
    );

    expect(finalAttempt.ack).toHaveBeenCalledOnce();
    expect(finalAttempt.retry).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith("artifact-id", "pdf-text", "etag:test", "2026-07-30T00:00:00.000Z", "Artifact analysis failed");
  });

  it("acknowledges stale jobs before reading their artifacts", async () => {
    const queued = message("stale", job(), 1);
    const library = {
      startArtifactAnalysis: vi.fn(async () => false),
      getSnapshot: vi.fn(),
    };
    await consumeArtifactAnalysisBatch(
      { messages: [queued] } as never,
      {
        REFERENCE_LIBRARIES: { getByName: () => library },
      } as never,
    );

    expect(queued.ack).toHaveBeenCalledOnce();
    expect(library.getSnapshot).not.toHaveBeenCalled();
  });

  it("reports artifacts that disappeared or lost their R2 content", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failed = vi.fn(async () => undefined);
    const missingArtifact = message("missing-artifact", job(), 4);
    const missingObject = message("missing-object", job(), 4);
    const libraries = [
      {
        startArtifactAnalysis: vi.fn(async () => true),
        getSnapshot: vi.fn(async () => ({ artifacts: [] })),
        failArtifactAnalysis: failed,
      },
      {
        startArtifactAnalysis: vi.fn(async () => true),
        getSnapshot: vi.fn(async () => ({ artifacts: [{ id: "artifact-id", fingerprint: "etag:test", objectKey: "paper.pdf" }] })),
        failArtifactAnalysis: failed,
      },
    ];
    let activeLibrary = libraries[0];
    const env = {
      REFERENCE_LIBRARIES: { getByName: () => activeLibrary },
      PAPERS: { get: vi.fn(async () => null) },
    };

    await consumeArtifactAnalysisBatch({ messages: [missingArtifact] } as never, env as never);
    activeLibrary = libraries[1];
    await consumeArtifactAnalysisBatch({ messages: [missingObject] } as never, env as never);

    expect(missingArtifact.ack).toHaveBeenCalledOnce();
    expect(missingObject.ack).toHaveBeenCalledOnce();
    expect(failed).toHaveBeenCalledTimes(2);
    expect(failed.mock.calls.map((call) => call.at(-1))).toEqual([
      "PDF artifact no longer matches the queued analysis",
      "PDF artifact content was not found",
    ]);
  });

  it("serves only the isolated analyzer document, PDF, and worker", async () => {
    const pdf = new Uint8Array([1, 2, 3]);
    const pageRequest = request(artifactAnalysisPageUrl);
    const pdfRequest = request(new URL("/input.pdf", artifactAnalysisPageUrl).href);
    const workerRequest = request(new URL("/pdf.worker.js", artifactAnalysisPageUrl).href);
    const externalRequest = request("https://example.test/tracker.js");

    await respondToArtifactRequest(pageRequest as never, pdf, "worker code");
    await respondToArtifactRequest(pdfRequest as never, pdf, "worker code");
    await respondToArtifactRequest(workerRequest as never, pdf, "worker code");
    await respondToArtifactRequest(externalRequest as never, pdf, "worker code");

    expect(pageRequest.respond).toHaveBeenCalledWith(expect.objectContaining({ status: 200, contentType: "text/html; charset=utf-8" }));
    expect(pdfRequest.respond).toHaveBeenCalledWith(expect.objectContaining({ body: pdf, contentType: "application/pdf" }));
    expect(workerRequest.respond).toHaveBeenCalledWith(expect.objectContaining({ body: "worker code" }));
    expect(externalRequest.abort).toHaveBeenCalledWith("blockedbyclient");
  });
});

function job(): ArtifactAnalysisJob {
  return {
    version: 1,
    ownerKey: "owner-key",
    artifactId: "artifact-id",
    fingerprint: "etag:test",
    kind: "pdf-text",
    requestedAt: "2026-07-30T00:00:00.000Z",
  };
}

function message(id: string, body: unknown, attempts: number) {
  return { id, body, attempts, ack: vi.fn(), retry: vi.fn() };
}

function request(url: string) {
  return { url: () => url, respond: vi.fn(async () => undefined), abort: vi.fn(async () => undefined) };
}
