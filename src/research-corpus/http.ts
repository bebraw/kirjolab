import { readBoundedRequestBytes } from "../api/request-body";
import type { ArtifactAnalysisKind } from "../domain/reference-library";
import { normalizePdfFilename } from "../library-pdf-ingest";
import { CorpusInvalidCursorError, CorpusNotFoundError, CorpusNotReadyError, type CorpusApplication } from "./service";
import { corpusArtifactDocument, corpusArtifactPageDocument } from "./representation";
import { isCorpusOriginAllowed, withCorpusCors } from "./origin";

const extractionKinds = new Set<ArtifactAnalysisKind>(["pdf-highlights", "pdf-references", "pdf-text"]);
const maximumCommandBytes = 1_024;
const maximumPdfBytes = 25 * 1_024 * 1_024;

export async function handleCorpusHttp(
  request: Request,
  service: CorpusApplication,
  allowedOrigins: ReadonlySet<string>,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && !isCorpusOriginAllowed(request, origin, allowedOrigins)) {
    return jsonError("Cross-origin corpus request denied", 403);
  }
  if (request.method === "OPTIONS") return corsResponse(origin);

  try {
    const response = await routeCorpusRequest(request, service);
    return origin ? withCorpusCors(response, origin) : response;
  } catch (error) {
    const response = corpusErrorResponse(error);
    if (!response) throw error;
    return origin ? withCorpusCors(response, origin) : response;
  }
}

async function routeCorpusRequest(request: Request, service: CorpusApplication): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/v1/artifacts") {
    if (request.method === "GET") {
      const limitValue = url.searchParams.get("limit");
      const limit = limitValue === null ? undefined : Number(limitValue);
      const after = url.searchParams.get("after");
      const page = await service.listArtifacts({ ...(after === null ? {} : { after }), ...(limit === undefined ? {} : { limit }) });
      return json(corpusArtifactPageDocument(page, url.origin), 200);
    }
    if (request.method === "POST") {
      const input = pdfUpload(request);
      const result = await service.ingestPdf(input);
      return json({ artifact: corpusArtifactDocument(result.artifact, url.origin), created: result.created }, result.created ? 201 : 200);
    }
    return methodNotAllowed("GET, POST, OPTIONS");
  }

  const artifactMatch = /^\/v1\/artifacts\/([0-9a-f-]{36})$/iu.exec(url.pathname);
  if (artifactMatch?.[1]) {
    if (request.method !== "GET") return methodNotAllowed("GET, OPTIONS");
    return json(corpusArtifactDocument(await service.getArtifact(artifactMatch[1]), url.origin), 200);
  }

  const originalMatch = /^\/v1\/artifacts\/([0-9a-f-]{36})\/representations\/original$/iu.exec(url.pathname);
  if (originalMatch?.[1]) {
    if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed("GET, HEAD, OPTIONS");
    const response = await service.openOriginal(request, originalMatch[1]);
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers })
      : response;
  }

  const extractionMatch = /^\/v1\/artifacts\/([0-9a-f-]{36})\/extractions\/(pdf-highlights|pdf-references|pdf-text)$/iu.exec(url.pathname);
  if (extractionMatch?.[1] && isExtractionKind(extractionMatch[2])) {
    if (request.method === "GET") {
      const extraction = await service.getExtraction(extractionMatch[1], extractionMatch[2]);
      return extraction ? json(extraction, 200) : jsonError("Extraction not found", 404);
    }
    if (request.method === "POST") {
      const retryFailed = await readRetryFailed(request);
      const extraction = await service.startExtraction(extractionMatch[1], extractionMatch[2], retryFailed);
      const status = extraction.status === "queued" || extraction.status === "running" ? 202 : 200;
      return json(extraction, status);
    }
    return methodNotAllowed("GET, POST, OPTIONS");
  }

  const pageMatch = /^\/v1\/artifacts\/([0-9a-f-]{36})\/extractions\/pdf-text\/pages\/(\d{1,3})$/iu.exec(url.pathname);
  if (pageMatch?.[1] && pageMatch[2]) {
    if (request.method !== "GET") return methodNotAllowed("GET, OPTIONS");
    return json(await service.readPdfTextPage(pageMatch[1], Number(pageMatch[2])), 200);
  }

  return jsonError("Corpus route not found", 404);
}

function pdfUpload(request: Request): { readonly body: ReadableStream<Uint8Array>; readonly name: string; readonly size: number } {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase() !== "application/pdf") {
    throw new CorpusUnsupportedMediaTypeError("Only PDF uploads are supported");
  }
  if (!request.body) throw new CorpusInvalidRequestError("PDF body is required", 400);
  const header = request.headers.get("content-length");
  const size = header === null ? Number.NaN : Number(header);
  if (!Number.isSafeInteger(size) || size <= 0) throw new CorpusInvalidRequestError("Content-Length is required", 411);
  if (size > maximumPdfBytes) throw new CorpusRequestTooLargeError("PDF exceeds the 25 MB limit");
  return {
    body: request.body,
    name: normalizePdfFilename(request.headers.get("x-file-name") ?? "paper.pdf"),
    size,
  };
}

async function readRetryFailed(request: Request): Promise<boolean> {
  if (!request.body) return false;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new CorpusUnsupportedMediaTypeError("Extraction command must use application/json");
  }
  const declaredBytes = Number(request.headers.get("content-length") ?? "0");
  if (declaredBytes > maximumCommandBytes) throw new CorpusRequestTooLargeError("Extraction command is too large");
  const bytes = await readBoundedRequestBytes(request.body, {
    maximumBytes: maximumCommandBytes,
    tooLarge: () => new CorpusRequestTooLargeError("Extraction command is too large"),
    preserveLimitErrorOnCancelFailure: true,
  });
  if (bytes.byteLength === 0) return false;
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new SyntaxError("Extraction command is invalid");
  }
  if (!isRetryCommand(value)) throw new SyntaxError("Extraction command is invalid");
  return value.retryFailed === true;
}

function isRetryCommand(value: unknown): value is { readonly retryFailed?: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => key === "retryFailed") &&
    (!("retryFailed" in value) || typeof value.retryFailed === "boolean")
  );
}

function isExtractionKind(value: string | undefined): value is ArtifactAnalysisKind {
  return typeof value === "string" && extractionKinds.has(value as ArtifactAnalysisKind);
}

function corpusErrorResponse(error: unknown): Response | null {
  if (error instanceof CorpusNotFoundError) return jsonError(error.message, 404);
  if (error instanceof CorpusNotReadyError) return jsonError(error.message, 409);
  if (error instanceof CorpusRequestTooLargeError) return jsonError(error.message, 413);
  if (error instanceof CorpusInvalidRequestError) return jsonError(error.message, error.status);
  if (error instanceof CorpusUnsupportedMediaTypeError) return jsonError(error.message, 415);
  if (error instanceof CorpusInvalidCursorError || error instanceof RangeError || error instanceof SyntaxError) {
    return jsonError(error.message, 400);
  }
  return null;
}

function corsResponse(origin: string | null): Response {
  const response = new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-headers": "Content-Type, X-File-Name, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
      "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
      "access-control-max-age": "600",
    },
  });
  return origin ? withCorpusCors(response, origin) : response;
}

function json(value: unknown, status: number): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}

function jsonError(error: string, status: number): Response {
  return json({ error }, status);
}

function methodNotAllowed(allow: string): Response {
  const response = jsonError("Method not allowed", 405);
  response.headers.set("allow", allow);
  return response;
}

class CorpusRequestTooLargeError extends RangeError {}
class CorpusUnsupportedMediaTypeError extends Error {}
class CorpusInvalidRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
