import { describe, expect, it, vi } from "vitest";
import { CorpusNotFoundError, type CorpusApplication, type CorpusArtifact, type CorpusExtraction, type CorpusPdfTextPage } from "./service";
import { handleCorpusMcp } from "./mcp";

const artifactId = "22222222-2222-4222-8222-222222222222";
const createdAt = "2026-08-24T08:00:00.000Z";

describe("Research Corpus MCP adapter", () => {
  it("initializes a stateless MCP server and advertises its bounded tools", async () => {
    const service = serviceFixture();

    const initialized = await sendMcp(service, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "corpus-test", version: "1.0.0" },
    });
    const tools = await sendMcp(service, "tools/list", {});

    expect(JSON.stringify(initialized)).toContain("research-corpus");
    expect(JSON.stringify(tools)).toContain("list_corpus_artifacts");
    expect(JSON.stringify(tools)).toContain("read_pdf_text_page");
    expect(JSON.stringify(tools)).toContain("start_extraction");
  });

  it("returns safe structured artifact metadata and a protected HTTP link", async () => {
    const service = serviceFixture();

    const response = await sendMcp(service, "tools/call", {
      name: "get_corpus_artifact",
      arguments: { artifactId },
    });

    expect(JSON.stringify(response)).toContain(`https://corpus.example/v1/artifacts/${artifactId}/representations/original`);
    expect(JSON.stringify(response)).not.toContain("objectKey");
    expect(service.getArtifact).toHaveBeenCalledWith(artifactId);
  });

  it("lists artifacts, reports extraction status, and exposes the bounded artifact resource", async () => {
    const service = serviceFixture();
    const list = await sendMcp(service, "tools/call", {
      name: "list_corpus_artifacts",
      arguments: { after: artifactId, limit: 25 },
    });
    const status = await sendMcp(service, "tools/call", {
      name: "get_extraction_status",
      arguments: { artifactId, kind: "pdf-text" },
    });
    const resource = await sendMcp(service, "resources/read", { uri: "corpus://artifacts" });

    expect(JSON.stringify(list)).toContain("paper.pdf");
    expect(JSON.stringify(status)).toContain('"status":"queued"');
    expect(JSON.stringify(resource)).toContain("paper.pdf");
    expect(service.listArtifacts).toHaveBeenCalledWith({ after: artifactId, limit: 25 });
    expect(service.listArtifacts).toHaveBeenCalledWith({ limit: 50 });
    expect(service.getExtraction).toHaveBeenCalledWith(artifactId, "pdf-text");
  });

  it("starts an explicit asynchronous extraction through the application service", async () => {
    const service = serviceFixture();

    const response = await sendMcp(service, "tools/call", {
      name: "start_extraction",
      arguments: { artifactId, kind: "pdf-text", retryFailed: true },
    });

    expect(JSON.stringify(response)).toContain('"status":"queued"');
    expect(service.startExtraction).toHaveBeenCalledWith(artifactId, "pdf-text", true);
  });

  it("reads exactly one extracted page through both a tool and resource template", async () => {
    const service = serviceFixture();
    const tool = await sendMcp(service, "tools/call", {
      name: "read_pdf_text_page",
      arguments: { artifactId, page: 2 },
    });
    const resource = await sendMcp(service, "resources/read", {
      uri: `corpus://artifacts/${artifactId}/extractions/pdf-text/pages/2`,
    });

    expect(JSON.stringify(tool)).toContain("Second page");
    expect(JSON.stringify(resource)).toContain("Second page");
    expect(service.readPdfTextPage).toHaveBeenCalledTimes(2);
  });

  it("rejects an unconfigured browser origin before invoking MCP", async () => {
    const service = serviceFixture();
    const response = await handleCorpusMcp(
      mcpRequest("tools/list", {}, { origin: "https://evil.example" }),
      service,
      new Set(["https://writer.example"]),
    );

    expect(response.status).toBe(403);
    expect(service.listArtifacts).not.toHaveBeenCalled();
  });

  it("does not return unexpected infrastructure errors to an MCP client", async () => {
    const service = serviceFixture();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    service.getArtifact = vi.fn(async () => {
      throw new Error("owners/private/paper.pdf");
    });

    const response = await sendMcp(service, "tools/call", {
      name: "get_corpus_artifact",
      arguments: { artifactId },
    });

    expect(JSON.stringify(response)).toContain("Corpus operation failed");
    expect(JSON.stringify(response)).not.toContain("owners/private");
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("returns stable owner-safe domain errors to an MCP client", async () => {
    const service = serviceFixture();
    service.getArtifact = vi.fn(async () => {
      throw new CorpusNotFoundError("Artifact not found");
    });

    const response = await sendMcp(service, "tools/call", {
      name: "get_corpus_artifact",
      arguments: { artifactId },
    });

    expect(JSON.stringify(response)).toContain("Artifact not found");
  });
});

async function sendMcp(service: CorpusApplication, method: string, params: unknown): Promise<unknown> {
  const response = await handleCorpusMcp(mcpRequest(method, params), service, new Set(["https://writer.example"]));
  expect(response.status).toBe(200);
  const text = await response.text();
  const data = text
    .split("\n")
    .find((line) => line.startsWith("data:"))
    ?.slice("data:".length)
    .trim();
  return JSON.parse(data ?? text);
}

function mcpRequest(method: string, params: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://corpus.example/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      host: "corpus.example",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
  });
}

function serviceFixture(): CorpusApplication & {
  listArtifacts: ReturnType<typeof vi.fn<CorpusApplication["listArtifacts"]>>;
  ingestPdf: ReturnType<typeof vi.fn<CorpusApplication["ingestPdf"]>>;
  getArtifact: ReturnType<typeof vi.fn<CorpusApplication["getArtifact"]>>;
  getExtraction: ReturnType<typeof vi.fn<CorpusApplication["getExtraction"]>>;
  startExtraction: ReturnType<typeof vi.fn<CorpusApplication["startExtraction"]>>;
  readPdfTextPage: ReturnType<typeof vi.fn<CorpusApplication["readPdfTextPage"]>>;
  openOriginal: ReturnType<typeof vi.fn<CorpusApplication["openOriginal"]>>;
} {
  const artifact = artifactFixture();
  const extraction = extractionFixture();
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
    ingestPdf: vi.fn(async () => ({ artifact, created: true })),
    getArtifact: vi.fn(async () => artifact),
    getExtraction: vi.fn(async () => extraction),
    startExtraction: vi.fn(async () => extraction),
    readPdfTextPage: vi.fn(async () => page),
    openOriginal: vi.fn(async () => new Response("pdf")),
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

function extractionFixture(): CorpusExtraction {
  return {
    artifactId,
    fingerprint: "sha256:paper",
    kind: "pdf-text",
    status: "queued",
    error: "",
    requestedAt: createdAt,
    startedAt: null,
    completedAt: null,
  };
}
