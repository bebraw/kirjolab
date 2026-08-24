import { createMcpHandler } from "agents/mcp/server";
import { McpServer, ProtocolError, ProtocolErrorCode, ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";
import { CorpusInvalidCursorError, CorpusNotFoundError, CorpusNotReadyError, type CorpusApplication } from "./service";
import { corpusArtifactDocument, corpusArtifactPageDocument } from "./representation";
import { isCorpusOriginAllowed, withCorpusCors } from "./origin";

const artifactIdSchema = z.uuid();
const extractionKindSchema = z.enum(["pdf-highlights", "pdf-references", "pdf-text"]);
const pageSchema = z.number().int().min(1).max(200);

export async function handleCorpusMcp(
  request: Request,
  service: CorpusApplication,
  allowedOrigins: ReadonlySet<string>,
): Promise<Response> {
  const preflight = handleCorpusMcpPreflight(request, allowedOrigins);
  if (preflight) return preflight;

  const origin = request.headers.get("origin");
  if (origin && !isCorpusOriginAllowed(request, origin, allowedOrigins)) {
    return Response.json(
      { error: "Cross-origin corpus request denied" },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }
  const requestUrl = new URL(request.url);
  const handler = createMcpHandler(() => createCorpusMcpServer(service, requestUrl.origin), {
    route: "/mcp",
    corsOptions: false,
    allowedHostnames: [requestUrl.hostname],
    allowedOriginHostnames: "*",
    legacy: "stateless",
    onerror: (error) => console.error("Research Corpus MCP request failed", error),
  });
  const response = await handler.fetch(request);
  return origin ? withCorpusCors(response, origin) : response;
}

export function handleCorpusMcpPreflight(request: Request, allowedOrigins: ReadonlySet<string>): Response | null {
  if (request.method !== "OPTIONS") return null;
  const origin = request.headers.get("origin");
  if (origin && !isCorpusOriginAllowed(request, origin, allowedOrigins)) {
    return Response.json(
      { error: "Cross-origin corpus request denied" },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  }
  return mcpPreflight(origin);
}

export function createCorpusMcpServer(service: CorpusApplication, publicOrigin: string): McpServer {
  const server = new McpServer({ name: "kirjolab-research-corpus", version: "0.1.0" });

  server.registerResource(
    "corpus-artifacts",
    "corpus://artifacts",
    { title: "Research Corpus artifacts", description: "A bounded first page of safe artifact metadata", mimeType: "application/json" },
    async (uri) =>
      await resourceResult(async () => {
        const page = await service.listArtifacts({ limit: 50 });
        return {
          contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(corpusArtifactPageDocument(page, publicOrigin)) }],
        };
      }),
  );

  server.registerResource(
    "pdf-text-page",
    new ResourceTemplate("corpus://artifacts/{artifactId}/extractions/pdf-text/pages/{page}", { list: undefined }),
    { title: "Extracted PDF text page", description: "One bounded page of extracted PDF text", mimeType: "application/json" },
    async (uri, variables) =>
      await resourceResult(async () => {
        const artifactId = artifactIdSchema.parse(variables.artifactId);
        const page = pageSchema.parse(Number(variables.page));
        const result = await service.readPdfTextPage(artifactId, page);
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(result) }] };
      }),
  );

  server.registerTool(
    "list_corpus_artifacts",
    {
      title: "List corpus artifacts",
      description: "List one bounded page of safe artifact and source metadata.",
      inputSchema: z.object({ after: artifactIdSchema.optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ after, limit }) =>
      await toolResult(async () =>
        corpusArtifactPageDocument(await service.listArtifacts({ ...defined("after", after), ...defined("limit", limit) }), publicOrigin),
      ),
  );

  server.registerTool(
    "get_corpus_artifact",
    {
      title: "Get corpus artifact",
      description: "Get safe artifact metadata and a protected HTTP URL for the original representation.",
      inputSchema: z.object({ artifactId: artifactIdSchema }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ artifactId }) => await toolResult(async () => corpusArtifactDocument(await service.getArtifact(artifactId), publicOrigin)),
  );

  server.registerTool(
    "get_extraction_status",
    {
      title: "Get extraction status",
      description: "Get the current fingerprint-qualified asynchronous extraction state.",
      inputSchema: z.object({ artifactId: artifactIdSchema, kind: extractionKindSchema }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ artifactId, kind }) => await toolResult(async () => ({ extraction: await service.getExtraction(artifactId, kind) })),
  );

  server.registerTool(
    "start_extraction",
    {
      title: "Start extraction",
      description: "Request an asynchronous extraction without waiting for PDF processing.",
      inputSchema: z.object({ artifactId: artifactIdSchema, kind: extractionKindSchema, retryFailed: z.boolean().optional() }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ artifactId, kind, retryFailed }) =>
      await toolResult(async () => ({
        extraction: await service.startExtraction(artifactId, kind, retryFailed === true),
      })),
  );

  server.registerTool(
    "read_pdf_text_page",
    {
      title: "Read extracted PDF text page",
      description: "Read exactly one bounded page from a ready PDF text extraction.",
      inputSchema: z.object({ artifactId: artifactIdSchema, page: pageSchema }).strict(),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ artifactId, page }) => await toolResult(async () => ({ page: await service.readPdfTextPage(artifactId, page) })),
  );

  return server;
}

async function toolResult<Result extends object>(operation: () => Promise<Result>) {
  try {
    const result = await operation();
    const structuredContent = Object.fromEntries(Object.entries(result));
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent };
  } catch (error) {
    const expected =
      error instanceof CorpusNotFoundError ||
      error instanceof CorpusNotReadyError ||
      error instanceof CorpusInvalidCursorError ||
      error instanceof RangeError;
    if (!expected) console.error("Research Corpus MCP operation failed", error);
    const message = expected && error instanceof Error ? error.message : "Corpus operation failed";
    return { isError: true, content: [{ type: "text" as const, text: message }] };
  }
}

async function resourceResult<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    const expected =
      error instanceof CorpusNotFoundError ||
      error instanceof CorpusNotReadyError ||
      error instanceof CorpusInvalidCursorError ||
      error instanceof RangeError;
    if (!expected) console.error("Research Corpus MCP resource operation failed", error);
    throw new ProtocolError(
      expected ? ProtocolErrorCode.InvalidParams : ProtocolErrorCode.InternalError,
      expected && error instanceof Error ? error.message : "Corpus resource operation failed",
    );
  }
}

function defined<Key extends string, Value>(key: Key, value: Value | undefined): {} | Record<Key, Value> {
  return value === undefined ? {} : ({ [key]: value } as Record<Key, Value>);
}

function mcpPreflight(origin: string | null): Response {
  const response = new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-headers": "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-max-age": "600",
    },
  });
  return origin ? withCorpusCors(response, origin) : response;
}
