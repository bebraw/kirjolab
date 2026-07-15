import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

const maximumRequestBytes = 256 * 1_024;
const maximumResponseBytes = 256 * 1_024;
const requestTimeoutMilliseconds = 120_000;

export interface ModelCompanionConfig {
  readonly upstream: URL;
  readonly allowedOrigin: string;
  readonly port: number;
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function readModelCompanionConfig(environment: Readonly<Record<string, string | undefined>>): ModelCompanionConfig {
  const upstream = loopbackUrl(environment.KIRJOLAB_MODEL_UPSTREAM, "KIRJOLAB_MODEL_UPSTREAM");
  const allowedOrigin = exactOrigin(environment.KIRJOLAB_MODEL_COMPANION_ORIGIN ?? "http://127.0.0.1:8787");
  const portValue = environment.KIRJOLAB_MODEL_COMPANION_PORT ?? "8790";
  const port = Number(portValue);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("KIRJOLAB_MODEL_COMPANION_PORT must be a valid TCP port");
  }
  return { upstream, allowedOrigin, port };
}

export async function handleModelCompanionRequest(
  request: Request,
  config: ModelCompanionConfig,
  fetcher: Fetch = (input, init) => fetch(input, init),
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") {
    return Response.json({ ok: true, upstream: config.upstream.origin }, { headers: { "cache-control": "no-store" } });
  }
  const servesCompletions = url.pathname === "/v1/chat/completions";
  const servesModels = url.pathname === "/v1/models";
  if (!servesCompletions && !servesModels) return jsonError("Route not found", 404);

  const origin = request.headers.get("origin");
  if (!origin || !isAllowedBrowserOrigin(origin, config.allowedOrigin)) return jsonError("Origin not allowed", 403);
  const cors = corsHeaders(origin, request.headers.get("access-control-request-private-network") === "true");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (servesModels) {
    if (request.method !== "GET") return jsonError("Method not allowed", 405, cors);
    return proxyModelList(config, cors, fetcher);
  }
  if (request.method !== "POST") return jsonError("Method not allowed", 405, cors);
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return jsonError("Content type must be application/json", 415, cors);
  }

  let body: Uint8Array;
  try {
    body = await readBoundedBody(request, maximumRequestBytes);
    validateOpenAICompatibleRequest(JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body)));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid model request", 400, cors);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
  try {
    const upstream = await fetcher(config.upstream, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
    });
    const responseBody = await readBoundedBody(upstream, maximumResponseBytes);
    const headers = new Headers(cors);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(responseBody, { status: upstream.status, headers });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError" ? "Local model request timed out" : "Local model unavailable";
    return jsonError(message, 502, cors);
  } finally {
    clearTimeout(timeout);
  }
}

async function proxyModelList(config: ModelCompanionConfig, cors: Headers, fetcher: Fetch): Promise<Response> {
  const upstream = modelListUpstream(config.upstream);
  if (!upstream) return jsonError("Configured provider does not expose the standard model-list route", 404, cors);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
  try {
    const response = await fetcher(upstream, {
      method: "GET",
      redirect: "error",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const responseBody = await readBoundedBody(response, maximumResponseBytes);
    const headers = new Headers(cors);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(responseBody, { status: response.status, headers });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError" ? "Local model discovery timed out" : "Local model unavailable";
    return jsonError(message, 502, cors);
  } finally {
    clearTimeout(timeout);
  }
}

function modelListUpstream(completionUpstream: URL): URL | null {
  const suffix = "/chat/completions";
  if (!completionUpstream.pathname.endsWith(suffix)) return null;
  const upstream = new URL(completionUpstream);
  upstream.pathname = `${upstream.pathname.slice(0, -suffix.length)}/models`;
  return upstream;
}

export function startModelCompanion(config: ModelCompanionConfig): Server {
  const server = createServer((request, response) => void serveNodeRequest(request, response, config));
  server.listen(config.port, "127.0.0.1", () => {
    process.stdout.write(
      `Kirjolab model companion listening at http://127.0.0.1:${config.port}\nForwarding to ${config.upstream.href}\nAllowed origin: ${config.allowedOrigin}\n`,
    );
  });
  return server;
}

async function serveNodeRequest(request: IncomingMessage, response: ServerResponse, config: ModelCompanionConfig): Promise<void> {
  try {
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readNodeBody(request);
    const webRequest = new Request(`http://127.0.0.1:${config.port}${request.url ?? "/"}`, {
      method: request.method ?? "GET",
      headers: nodeHeaders(request),
      ...(body ? { body } : {}),
    });
    const result = await handleModelCompanionRequest(webRequest, config);
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Companion request failed";
    response.writeHead(400, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ error: message }));
  }
}

async function readNodeBody(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    length += chunk.byteLength;
    if (length > maximumRequestBytes) throw new RangeError(`Model request exceeds ${maximumRequestBytes} bytes`);
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function nodeHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

async function readBoundedBody(message: Request | Response, maximumBytes: number): Promise<Uint8Array> {
  const declared = Number(message.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new RangeError(`Model payload exceeds ${maximumBytes} bytes`);
  if (!message.body) return new Uint8Array();
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maximumBytes) throw new RangeError(`Model payload exceeds ${maximumBytes} bytes`);
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function validateOpenAICompatibleRequest(value: unknown): void {
  if (!isRecord(value) || typeof value.model !== "string" || !value.model.trim() || value.model.length > 256) {
    throw new TypeError("Model identifier is invalid");
  }
  if (value.stream !== false || typeof value.temperature !== "number" || value.temperature < 0 || value.temperature > 2) {
    throw new TypeError("Model parameters are invalid");
  }
  if (
    value.reasoning_effort !== undefined &&
    value.reasoning_effort !== "none" &&
    value.reasoning_effort !== "low" &&
    value.reasoning_effort !== "medium" &&
    value.reasoning_effort !== "high"
  ) {
    throw new TypeError("Model reasoning effort is invalid");
  }
  if (value.response_format !== undefined) {
    const format = value.response_format;
    if (
      !isRecord(format) ||
      format.type !== "json_schema" ||
      !isRecord(format.json_schema) ||
      typeof format.json_schema.name !== "string" ||
      !format.json_schema.name.trim() ||
      format.json_schema.name.length > 128 ||
      format.json_schema.strict !== true ||
      !isRecord(format.json_schema.schema)
    ) {
      throw new TypeError("Model response format is invalid");
    }
  }
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 16) {
    throw new TypeError("Model messages are invalid");
  }
  let combinedLength = 0;
  for (const message of value.messages) {
    if (
      !isRecord(message) ||
      (message.role !== "system" && message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string"
    ) {
      throw new TypeError("Model message is invalid");
    }
    combinedLength += message.content.length;
  }
  if (combinedLength > 128 * 1_024) throw new RangeError("Combined model messages are too large");
}

function loopbackUrl(value: string | undefined, label: string): URL {
  if (!value) throw new TypeError(`${label} is required`);
  const url = new URL(value);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !isLoopbackHost(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError(`${label} must be a credential-free HTTP(S) loopback URL`);
  }
  return url;
}

function exactOrigin(value: string): string {
  const url = new URL(value);
  if (url.origin !== value || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new TypeError("KIRJOLAB_MODEL_COMPANION_ORIGIN must be an exact HTTP(S) origin");
  }
  return url.origin;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized === "::1";
}

function isAllowedBrowserOrigin(origin: string, configuredOrigin: string): boolean {
  if (origin === configuredOrigin) return true;
  try {
    const candidate = new URL(origin);
    const configured = new URL(configuredOrigin);
    return (
      candidate.origin === origin &&
      candidate.protocol === configured.protocol &&
      candidate.port === configured.port &&
      isLoopbackHost(candidate.hostname) &&
      isLoopbackHost(configured.hostname)
    );
  } catch {
    return false;
  }
}

function corsHeaders(origin: string, privateNetwork: boolean): Headers {
  const headers = new Headers({
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  });
  if (privateNetwork) headers.set("access-control-allow-private-network", "true");
  return headers;
}

function jsonError(error: string, status: number, headers?: Headers): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("cache-control", "no-store");
  return Response.json({ error }, { status, headers: responseHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) startModelCompanion(readModelCompanionConfig(process.env));
