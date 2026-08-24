import { describe, expect, it, vi } from "vitest";
import type { ArtifactAnalysisKind } from "../domain/reference-library";
import type { CorpusApplication, CorpusArtifact, CorpusExtraction, CorpusPdfTextPage } from "./service";
import { CorpusNotFoundError, CorpusNotReadyError } from "./service";
import { handleCorpusHttp } from "./http";

const artifactId = "22222222-2222-4222-8222-222222222222";
const createdAt = "2026-08-24T08:00:00.000Z";

describe("Research Corpus HTTP adapter", () => {
  it("lists safe artifacts with versioned representation links", async () => {
    const service = serviceFixture();

    const response = await handleCorpusHttp(
      new Request("https://corpus.example/v1/artifacts?limit=25"),
      service,
      new Set(["https://writer.example"]),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(service.listArtifacts).toHaveBeenCalledWith({ after: undefined, limit: 25 });
    await expect(response.json()).resolves.toEqual({
      artifacts: [
        expect.objectContaining({
          id: artifactId,
          links: expect.objectContaining({
            original: `https://corpus.example/v1/artifacts/${artifactId}/representations/original`,
          }),
        }),
      ],
      next: null,
    });
  });

  it("preserves protected range metadata and strips the body for HEAD", async () => {
    const service = serviceFixture();
    service.openOriginal = vi.fn(async () =>
      new Response("partial", {
        status: 206,
        headers: { "content-range": "bytes 0-6/42", etag: '"fingerprint"', "content-type": "application/pdf" },
      }),
    );

    const response = await handleCorpusHttp(
      new Request(`https://corpus.example/v1/artifacts/${artifactId}/representations/original`, { method: "HEAD" }),
      service,
      new Set(),
    );

    expect(response.status).toBe(206);
    expect(response.body).toBeNull();
    expect(response.headers.get("content-range")).toBe("bytes 0-6/42");
  });

  it("returns extraction status without embedding the extraction result", async () => {
    const service = serviceFixture();

    const response = await handleCorpusHttp(
      new Request(`https://corpus.example/v1/artifacts/${artifactId}/extractions/pdf-text`),
      service,
      new Set(),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ artifactId, status: "queued" }));
    expect(JSON.stringify(body)).not.toContain("pages");
  });

  it("queues extraction asynchronously and retries only from a bounded explicit body", async () => {
    const service = serviceFixture();
    const response = await handleCorpusHttp(
      new Request(`https://corpus.example/v1/artifacts/${artifactId}/extractions/pdf-text`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://writer.example" },
        body: JSON.stringify({ retryFailed: true }),
      }),
      service,
      new Set(["https://writer.example"]),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://writer.example");
    expect(service.startExtraction).toHaveBeenCalledWith(artifactId, "pdf-text", true);
  });

  it("returns one extracted text page and maps incomplete extraction to conflict", async () => {
    const service = serviceFixture();
    const ready = await handleCorpusHttp(
      new Request(`https://corpus.example/v1/artifacts/${artifactId}/extractions/pdf-text/pages/2`),
      service,
      new Set(),
    );
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual(expect.objectContaining({ page: 2, text: "Second page" }));

    service.readPdfTextPage = vi.fn(async () => {
      throw new CorpusNotReadyError("PDF text extraction is not ready");
    });
    const pending = await handleCorpusHttp(
      new Request(`https://corpus.example/v1/artifacts/${artifactId}/extractions/pdf-text/pages/2`),
      service,
      new Set(),
    );
    expect(pending.status).toBe(409);
  });

  it("rejects unconfigured browser origins before reading private data", async () => {
    const service = serviceFixture();

    const response = await handleCorpusHttp(
      new Request("https://corpus.example/v1/artifacts", { headers: { origin: "https://evil.example" } }),
      service,
      new Set(["https://writer.example"]),
    );

    expect(response.status).toBe(403);
    expect(service.listArtifacts).not.toHaveBeenCalled();
  });

  it("maps absent resources and unsupported methods without leaking errors", async () => {
    const service = serviceFixture();
    service.getArtifact = vi.fn(async () => {
      throw new CorpusNotFoundError("Artifact not found");
    });

    const absent = await handleCorpusHttp(
      new Request(`https://corpus.example/v1/artifacts/${artifactId}`),
      service,
      new Set(),
    );
    const method = await handleCorpusHttp(
      new Request("https://corpus.example/v1/artifacts", { method: "DELETE" }),
      service,
      new Set(),
    );

    expect(absent.status).toBe(404);
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("GET, OPTIONS");
  });
});

function serviceFixture(): CorpusApplication & {
  listArtifacts: ReturnType<typeof vi.fn<CorpusApplication["listArtifacts"]>>;
  getArtifact: ReturnType<typeof vi.fn<CorpusApplication["getArtifact"]>>;
  getExtraction: ReturnType<typeof vi.fn<CorpusApplication["getExtraction"]>>;
  startExtraction: ReturnType<typeof vi.fn<CorpusApplication["startExtraction"]>>;
  readPdfTextPage: ReturnType<typeof vi.fn<CorpusApplication["readPdfTextPage"]>>;
  openOriginal: ReturnType<typeof vi.fn<CorpusApplication["openOriginal"]>>;
} {
  const artifact = artifactFixture();
  const extraction = extractionFixture("pdf-text");
  const page: CorpusPdfTextPage = {
    artifactId,
    fingerprint: artifact.fingerprint,
    page: 2,
    text: "Second page",
    source: "ocr",
    pagesScanned: 2,
    pagesTotal: 2,
    truncated: false,
  };
  return {
    listArtifacts: vi.fn(async () => ({ artifacts: [artifact], next: null })),
    getArtifact: vi.fn(async () => artifact),
    getExtraction: vi.fn(async () => extraction),
    startExtraction: vi.fn(async () => extraction),
    readPdfTextPage: vi.fn(async () => page),
    openOriginal: vi.fn(async () => new Response("pdf", { headers: { "content-type": "application/pdf" } })),
  };
}

function artifactFixture(): CorpusArtifact {
  return {
    id: artifactId,
    referenceId: null,
    name: "paper.pdf",
    contentType: "application/pdf",
    size: 42,
    fingerprint: "sha256:paper",
    rights: "private",
    createdAt,
    source: null,
  };
}

function extractionFixture(kind: ArtifactAnalysisKind): CorpusExtraction {
  return {
    artifactId,
    fingerprint: "sha256:paper",
    kind,
    status: "queued",
    error: "",
    requestedAt: createdAt,
    startedAt: null,
    completedAt: null,
  };
}
