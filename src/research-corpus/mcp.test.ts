import { describe, expect, it, vi } from "vitest";
import {
  CorpusInvalidCursorError,
  CorpusInvalidInputError,
  CorpusNotFoundError,
  CorpusNotReadyError,
  type CorpusApplication,
  type CorpusArtifact,
  type CorpusExtraction,
  type CorpusPdfTextPage,
} from "./service";
import { handleCorpusMcp } from "./mcp";
import { isRecord } from "../domain/unknown-value";

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

  it("advertises strict JSON schemas with the same bounds used by tool validation", async () => {
    const tools = await sendMcp(serviceFixture(), "tools/list", {});

    expect(tools).toMatchObject({
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "list_corpus_artifacts",
            inputSchema: expect.objectContaining({
              type: "object",
              additionalProperties: false,
              properties: expect.objectContaining({
                after: expect.objectContaining({ type: "string", format: "uuid" }),
                limit: expect.objectContaining({ type: "integer", minimum: 1, maximum: 100 }),
              }),
            }),
          }),
          expect.objectContaining({
            name: "start_extraction",
            inputSchema: expect.objectContaining({
              type: "object",
              additionalProperties: false,
              required: ["artifactId", "kind"],
              properties: expect.objectContaining({
                artifactId: expect.objectContaining({ type: "string", format: "uuid" }),
                kind: { type: "string", enum: ["pdf-highlights", "pdf-references", "pdf-text"] },
                retryFailed: { type: "boolean" },
              }),
            }),
          }),
          expect.objectContaining({
            name: "read_pdf_text_page",
            inputSchema: expect.objectContaining({
              type: "object",
              additionalProperties: false,
              required: ["artifactId", "page"],
              properties: expect.objectContaining({ page: { type: "integer", minimum: 1, maximum: 200 } }),
            }),
          }),
        ]),
      },
    });
  });

  it("distinguishes read-only tools from extraction requests in client discovery", async () => {
    const tools = await sendMcp(serviceFixture(), "tools/list", {});
    const readTools = ["list_corpus_artifacts", "get_corpus_artifact", "get_extraction_status", "read_pdf_text_page"];

    expect(tools).toMatchObject({
      result: {
        tools: expect.arrayContaining([
          ...readTools.map((name) =>
            expect.objectContaining({
              name,
              title: expect.stringMatching(/\S/u),
              description: expect.stringMatching(/\S/u),
              annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
            }),
          ),
          expect.objectContaining({
            name: "start_extraction",
            title: expect.stringMatching(/\S/u),
            description: expect.stringMatching(/\S/u),
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
          }),
        ]),
      },
    });
  });

  it("advertises the bounded catalog and page resources as JSON", async () => {
    const service = serviceFixture();

    const catalog = await sendMcp(service, "resources/list", {});
    const pages = await sendMcp(service, "resources/templates/list", {});

    expect(catalog).toMatchObject({
      result: {
        resources: [
          {
            name: "corpus-artifacts",
            uri: "corpus://artifacts",
            title: expect.stringMatching(/\S/u),
            description: expect.stringMatching(/\S/u),
            mimeType: "application/json",
          },
        ],
      },
    });
    expect(pages).toMatchObject({
      result: {
        resourceTemplates: [
          {
            name: "pdf-text-page",
            uriTemplate: "corpus://artifacts/{artifactId}/extractions/pdf-text/pages/{page}",
            title: expect.stringMatching(/\S/u),
            description: expect.stringMatching(/\S/u),
            mimeType: "application/json",
          },
        ],
      },
    });
  });

  it.each([
    { name: "list_corpus_artifacts", arguments: { limit: 0 } },
    { name: "list_corpus_artifacts", arguments: { limit: 101 } },
    { name: "list_corpus_artifacts", arguments: { limit: 1.5 } },
    { name: "list_corpus_artifacts", arguments: { limit: "25" } },
    { name: "list_corpus_artifacts", arguments: { after: "not-a-uuid" } },
    { name: "list_corpus_artifacts", arguments: { extra: true } },
    { name: "get_corpus_artifact", arguments: {} },
    { name: "get_corpus_artifact", arguments: { artifactId, extra: true } },
    { name: "get_extraction_status", arguments: { artifactId, kind: "pdf-summary" } },
    { name: "get_extraction_status", arguments: { artifactId, kind: "pdf-text", extra: true } },
    { name: "start_extraction", arguments: { artifactId, kind: "pdf-text", retryFailed: "true" } },
    { name: "start_extraction", arguments: { artifactId, kind: "pdf-text", extra: true } },
    { name: "read_pdf_text_page", arguments: { artifactId, page: 0 } },
    { name: "read_pdf_text_page", arguments: { artifactId, page: 201 } },
    { name: "read_pdf_text_page", arguments: { artifactId, page: 2.5 } },
    { name: "read_pdf_text_page", arguments: { artifactId, page: "2" } },
    { name: "read_pdf_text_page", arguments: { artifactId, page: 2, extra: true } },
  ])("rejects malformed $name arguments $arguments before invoking the service", async (params) => {
    const service = serviceFixture();

    const response = await sendMcp(service, "tools/call", params);

    expect(response).toMatchObject({ result: { isError: true } });
    expect(service.listArtifacts).not.toHaveBeenCalled();
    expect(service.getArtifact).not.toHaveBeenCalled();
    expect(service.getExtraction).not.toHaveBeenCalled();
    expect(service.startExtraction).not.toHaveBeenCalled();
    expect(service.readPdfTextPage).not.toHaveBeenCalled();
  });

  it.each(["22222222-2222-9222-8222-222222222222", "22222222-2222-4222-7222-222222222222", "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF"])(
    "rejects unsupported UUID variant %s in tools and resource variables",
    async (invalidId) => {
      const service = serviceFixture();

      const tool = await sendMcp(service, "tools/call", { name: "get_corpus_artifact", arguments: { artifactId: invalidId } });
      const resource = await sendMcp(service, "resources/read", {
        uri: `corpus://artifacts/${invalidId}/extractions/pdf-text/pages/2`,
      });

      expect(tool).toMatchObject({ result: { isError: true } });
      expect(resource).toMatchObject({ error: { code: -32_602, message: "Corpus resource parameters are invalid" } });
      expect(service.getArtifact).not.toHaveBeenCalled();
      expect(service.readPdfTextPage).not.toHaveBeenCalled();
    },
  );

  it.each(["00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff", "ABCDEFAB-ABCD-8ABC-BABC-ABCDEFABCDEF"])(
    "preserves supported UUID %s without normalizing it",
    async (id) => {
      const service = serviceFixture();

      await sendMcp(service, "tools/call", { name: "get_corpus_artifact", arguments: { artifactId: id } });
      await sendMcp(service, "resources/read", { uri: `corpus://artifacts/${id}/extractions/pdf-text/pages/0002` });

      expect(service.getArtifact).toHaveBeenCalledWith(id);
      expect(service.readPdfTextPage).toHaveBeenCalledWith(id, 2);
    },
  );

  it("preserves omitted options and accepts inclusive list and page bounds", async () => {
    const service = serviceFixture();

    await sendMcp(service, "tools/call", { name: "list_corpus_artifacts", arguments: {} });
    await sendMcp(service, "tools/call", { name: "start_extraction", arguments: { artifactId, kind: "pdf-highlights" } });
    for (const limit of [1, 100]) {
      await sendMcp(service, "tools/call", { name: "list_corpus_artifacts", arguments: { limit } });
      expect(service.listArtifacts).toHaveBeenCalledWith({ limit });
    }
    for (const page of [1, 200]) {
      await sendMcp(service, "tools/call", { name: "read_pdf_text_page", arguments: { artifactId, page } });
      expect(service.readPdfTextPage).toHaveBeenCalledWith(artifactId, page);
    }

    expect(service.listArtifacts).toHaveBeenCalledWith({});
    expect(service.startExtraction).toHaveBeenCalledWith(artifactId, "pdf-highlights", false);
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

    const expectedPage = {
      artifactId,
      fingerprint: "sha256:paper",
      page: 2,
      text: "Second page",
      source: "ocr",
      pagesScanned: 2,
      pagesTotal: 2,
      truncated: false,
    };
    expect(tool).toMatchObject({
      result: {
        content: [{ type: "text", text: expect.any(String) }],
        structuredContent: { page: expectedPage },
      },
    });
    expect(resource).toMatchObject({
      result: {
        contents: [
          {
            uri: `corpus://artifacts/${artifactId}/extractions/pdf-text/pages/2`,
            mimeType: "application/json",
            text: expect.any(String),
          },
        ],
      },
    });
    expect(readMcpJsonText(tool, "content")).toEqual({ page: expectedPage });
    expect(readMcpJsonText(resource, "contents")).toEqual(expectedPage);
    expect(service.readPdfTextPage).toHaveBeenCalledTimes(2);
  });

  it("classifies malformed resource template variables as invalid parameters", async () => {
    const service = serviceFixture();

    const response = await sendMcp(service, "resources/read", {
      uri: "corpus://artifacts/not-a-uuid/extractions/pdf-text/pages/2",
    });

    expect(response).toMatchObject({
      error: { code: -32_602, message: "Corpus resource parameters are invalid" },
    });
    expect(service.readPdfTextPage).not.toHaveBeenCalled();
  });

  it.each(["0x2", "2e0", "+2", "0", "201", "2.5"])("rejects invalid resource page variable %s", async (page) => {
    const service = serviceFixture();

    const response = await sendMcp(service, "resources/read", {
      uri: `corpus://artifacts/${artifactId}/extractions/pdf-text/pages/${page}`,
    });

    expect(response).toMatchObject({
      error: { code: -32_602, message: "Corpus resource parameters are invalid" },
    });
    expect(service.readPdfTextPage).not.toHaveBeenCalled();
  });

  it("rejects an unconfigured browser origin before invoking MCP", async () => {
    const service = serviceFixture();
    const response = await handleCorpusMcp(
      mcpRequest("tools/list", {}, { origin: "https://evil.example" }),
      service,
      new Set(["https://writer.example"]),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Cross-origin corpus request denied" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    expect(service.listArtifacts).not.toHaveBeenCalled();
  });

  it.each([null, "https://writer.example", "https://corpus.example"])("answers MCP preflight for origin %s", async (origin) => {
    const service = serviceFixture();
    const response = await handleCorpusMcp(
      new Request("https://corpus.example/mcp", { method: "OPTIONS", headers: origin ? { origin } : {} }),
      service,
      new Set(["https://writer.example"]),
    );

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
    expect(
      response.headers
        .get("access-control-allow-methods")
        ?.split(",")
        .map((method) => method.trim())
        .sort(),
    ).toEqual(["OPTIONS", "POST"]);
    expect(
      response.headers
        .get("access-control-allow-headers")
        ?.split(",")
        .map((header) => header.trim().toLowerCase())
        .sort(),
    ).toEqual(["authorization", "content-type", "mcp-method", "mcp-name", "mcp-protocol-version"]);
    expect(response.headers.get("access-control-max-age")).toBe("600");
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-credentials")).toBe(origin ? "true" : null);
    expect(response.headers.get("vary")).toBe(origin ? "Origin" : null);
    expect(service.listArtifacts).not.toHaveBeenCalled();
  });

  it("rejects unconfigured preflight origins before MCP initialization", async () => {
    const response = await handleCorpusMcp(
      new Request("https://corpus.example/mcp", { method: "OPTIONS", headers: { origin: "https://evil.example" } }),
      serviceFixture(),
      new Set(["https://writer.example"]),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Cross-origin corpus request denied" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });

  it.each(["https://writer.example", "https://corpus.example"])("preserves CORS on MCP responses to %s", async (origin) => {
    const response = await handleCorpusMcp(mcpRequest("tools/list", {}, { origin }), serviceFixture(), new Set(["https://writer.example"]));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("vary")).toContain("Origin");
    expect(await response.text()).toContain("list_corpus_artifacts");
  });

  it("does not return unexpected infrastructure errors to an MCP client", async () => {
    const service = serviceFixture();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    service.getArtifact = vi.fn(async () => {
      throw new RangeError("owners/private/paper.pdf");
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

  it("sanitizes unexpected failures from both MCP resource callbacks", async () => {
    const service = serviceFixture();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    service.listArtifacts = vi.fn(async () => {
      throw new Error("libraries/owner-key/private-catalog");
    });
    service.readPdfTextPage = vi.fn(async () => {
      throw new Error("libraries/owner-key/private-page");
    });

    const catalog = await sendMcp(service, "resources/read", { uri: "corpus://artifacts" });
    const page = await sendMcp(service, "resources/read", {
      uri: `corpus://artifacts/${artifactId}/extractions/pdf-text/pages/2`,
    });
    const payload = JSON.stringify([catalog, page]);

    expect(payload).toContain("Corpus resource operation failed");
    expect(payload).not.toContain("owner-key");
    expect(payload).not.toContain("private-catalog");
    expect(payload).not.toContain("private-page");
    for (const response of [catalog, page]) {
      expect(response).toMatchObject({ error: { code: -32_603, message: "Corpus resource operation failed" } });
    }
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it.each([
    new CorpusNotFoundError("Artifact not found"),
    new CorpusNotReadyError("Extraction is not ready"),
    new CorpusInvalidCursorError("Cursor is invalid"),
    new CorpusInvalidInputError("Input is invalid"),
  ])("returns owner-safe domain error %s from tools and resources without logging", async (failure) => {
    const service = serviceFixture();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    service.getArtifact = vi.fn(async () => {
      throw failure;
    });
    service.readPdfTextPage = vi.fn(async () => {
      throw failure;
    });

    const response = await sendMcp(service, "tools/call", {
      name: "get_corpus_artifact",
      arguments: { artifactId },
    });

    const resource = await sendMcp(service, "resources/read", { uri: `corpus://artifacts/${artifactId}/extractions/pdf-text/pages/2` });

    expect(response).toMatchObject({ result: { isError: true, content: [{ type: "text", text: failure.message }] } });
    expect(resource).toMatchObject({ error: { code: -32_602, message: failure.message } });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

function readMcpJsonText(response: unknown, key: "content" | "contents"): unknown {
  if (!isRecord(response) || !isRecord(response.result)) throw new Error("Expected an MCP result");
  const items = response.result[key];
  if (!Array.isArray(items) || items.length !== 1 || !isRecord(items[0]) || typeof items[0].text !== "string") {
    throw new Error("Expected one JSON text item");
  }
  return JSON.parse(items[0].text);
}

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
