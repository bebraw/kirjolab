import { Codex } from "@openai/codex-sdk";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createCodexProcessOptions,
  createCodexSdkRunner,
  validateCodexCompanionHome,
  type CodexChatMessage,
  type CodexGenerationRequest,
  type CodexGenerationRunner,
  type KirjolabReasoningEffort,
} from "./codex-model-backend";
import { isRecord } from "./domain/unknown-value";

const maximumRequestBytes = 256 * 1_024;
const maximumResponseBytes = 256 * 1_024;
const requestTimeoutMilliseconds = 120_000;
const minimumBearerTokenLength = 24;
const maximumBearerTokenLength = 512;

interface CommonModelCompanionConfig {
  readonly allowedOrigin: string;
  readonly port: number;
}

export interface OpenAICompatibleModelCompanionConfig extends CommonModelCompanionConfig {
  readonly kind: "openai-compatible";
  readonly upstream: URL;
}

export interface CodexModelCompanionConfig extends CommonModelCompanionConfig {
  readonly kind: "codex";
  readonly bearerToken: string;
  readonly codexHome: string;
  readonly model: string;
}

export type ModelCompanionConfig = CodexModelCompanionConfig | OpenAICompatibleModelCompanionConfig;

interface ModelCompletionRequest {
  readonly messages: readonly CodexChatMessage[];
  readonly model: string;
  readonly outputSchema: Record<string, unknown> | null;
  readonly reasoningEffort: KirjolabReasoningEffort;
}

export interface ModelCompanionBackend {
  close?(): void;
  complete(request: ModelCompletionRequest, body: Uint8Array, signal: AbortSignal): Promise<Response>;
  listModels(signal: AbortSignal): Promise<Response>;
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ModelCompanionRuntime = Fetch | ModelCompanionBackend;

export function readModelCompanionConfig(environment: Readonly<Record<string, string | undefined>>): ModelCompanionConfig {
  const common = readCommonConfig(environment);
  const provider = environment.KIRJOLAB_MODEL_PROVIDER ?? "openai-compatible";
  if (provider === "openai-compatible") {
    return {
      ...common,
      kind: "openai-compatible",
      upstream: loopbackUrl(environment.KIRJOLAB_MODEL_UPSTREAM, "KIRJOLAB_MODEL_UPSTREAM"),
    };
  }
  if (provider !== "codex") {
    throw new TypeError("KIRJOLAB_MODEL_PROVIDER must be openai-compatible or codex");
  }
  return {
    ...common,
    kind: "codex",
    codexHome: codexHome(environment.KIRJOLAB_CODEX_HOME, environment),
    model: codexModel(environment.KIRJOLAB_CODEX_MODEL),
    bearerToken: bearerToken(environment.KIRJOLAB_CODEX_TOKEN),
  };
}

export async function handleModelCompanionRequest(
  request: Request,
  config: ModelCompanionConfig,
  runtime?: ModelCompanionRuntime,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") {
    return Response.json(healthPayload(config), { headers: { "cache-control": "no-store" } });
  }
  const servesCompletions = url.pathname === "/v1/chat/completions";
  const servesModels = url.pathname === "/v1/models";
  if (!servesCompletions && !servesModels) return jsonError("Route not found", 404);

  const origin = request.headers.get("origin");
  if (!origin || !isAllowedBrowserOrigin(origin, config.allowedOrigin)) return jsonError("Origin not allowed", 403);
  const cors = corsHeaders(origin, request.headers.get("access-control-request-private-network") === "true", config.kind === "codex");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (config.kind === "codex" && !isAuthorized(request, config.bearerToken)) {
    const headers = new Headers(cors);
    headers.set("www-authenticate", "Bearer");
    return jsonError("Codex companion authentication failed", 401, headers);
  }

  const backend = modelCompanionBackend(config, runtime);
  if (servesModels) {
    if (request.method !== "GET") return jsonError("Method not allowed", 405, cors);
    return runBackendRequest((signal) => backend.listModels(signal), config, cors, "discovery");
  }
  if (request.method !== "POST") return jsonError("Method not allowed", 405, cors);
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return jsonError("Content type must be application/json", 415, cors);
  }

  let body: Uint8Array;
  let completionRequest: ModelCompletionRequest;
  try {
    body = await readBoundedBody(request, maximumRequestBytes);
    completionRequest = validateOpenAICompatibleRequest(
      JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body)),
    );
    if (config.kind === "codex") {
      if (completionRequest.model !== config.model) throw new TypeError(`Codex companion permits only ${config.model}`);
      if (!completionRequest.outputSchema) throw new TypeError("Codex companion requires a JSON Schema response format");
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid model request", 400, cors);
  }

  return runBackendRequest((signal) => backend.complete(completionRequest, body, signal), config, cors, "request");
}

export function createCodexModelBackend(config: CodexModelCompanionConfig, runner: CodexGenerationRunner): ModelCompanionBackend {
  let activeGeneration = false;
  const activeControllers = new Set<AbortController>();
  return {
    close() {
      for (const controller of activeControllers) controller.abort();
    },
    async complete(request, _body, signal) {
      if (activeGeneration) return Response.json({ error: "Codex companion is busy" }, { status: 429 });
      if (!request.outputSchema) {
        return Response.json({ error: "Codex companion requires a JSON Schema response format" }, { status: 400 });
      }
      activeGeneration = true;
      const controller = new AbortController();
      activeControllers.add(controller);
      const abort = () => controller.abort(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      try {
        const codexRequest: CodexGenerationRequest = {
          messages: request.messages,
          model: config.model,
          outputSchema: request.outputSchema,
          reasoningEffort: request.reasoningEffort,
          signal: controller.signal,
        };
        const result = await runner.run(codexRequest);
        if (new TextEncoder().encode(result.finalResponse).byteLength > maximumResponseBytes) {
          throw new RangeError(`Model payload exceeds ${maximumResponseBytes} bytes`);
        }
        return Response.json({
          id: `chatcmpl-kirjolab-${randomUUID()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1_000),
          model: config.model,
          choices: [{ index: 0, message: { role: "assistant", content: result.finalResponse }, finish_reason: "stop" }],
        });
      } finally {
        signal.removeEventListener("abort", abort);
        activeControllers.delete(controller);
        activeGeneration = false;
      }
    },
    async listModels() {
      return Response.json({ object: "list", data: [{ id: config.model, object: "model" }] });
    },
  };
}

export function createModelCompanionBackend(
  config: ModelCompanionConfig,
  fetcher: Fetch = (input, init) => fetch(input, init),
): ModelCompanionBackend {
  if (config.kind === "openai-compatible") return createForwardingBackend(config, fetcher);
  const processOptions = createCodexProcessOptions(config.codexHome);
  const codex = new Codex(processOptions);
  return createCodexModelBackend(
    config,
    createCodexSdkRunner({
      startThread(options) {
        return codex.startThread(options);
      },
    }),
  );
}

export function startModelCompanion(config: ModelCompanionConfig, backend = createModelCompanionBackend(config)): Server {
  const server = createServer((request, response) => void serveNodeRequest(request, response, config, backend));
  server.once("close", () => backend.close?.());
  server.listen(config.port, "127.0.0.1", () => {
    process.stdout.write(startupMessage(config));
  });
  return server;
}

export async function runModelCompanion(environment: Readonly<Record<string, string | undefined>> = process.env): Promise<Server> {
  const config = readModelCompanionConfig(environment);
  if (config.kind === "codex") await validateCodexCompanionHome(config.codexHome);
  return startModelCompanion(config, createModelCompanionBackend(config));
}

function createForwardingBackend(config: OpenAICompatibleModelCompanionConfig, fetcher: Fetch): ModelCompanionBackend {
  return {
    complete(_request, body, signal) {
      return fetcher(config.upstream, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body,
        signal,
      });
    },
    listModels(signal) {
      const upstream = modelListUpstream(config.upstream);
      if (!upstream) {
        return Promise.resolve(
          Response.json({ error: "Configured provider does not expose the standard model-list route" }, { status: 404 }),
        );
      }
      return fetcher(upstream, { method: "GET", redirect: "error", headers: { accept: "application/json" }, signal });
    },
  };
}

function modelCompanionBackend(config: ModelCompanionConfig, runtime: ModelCompanionRuntime | undefined): ModelCompanionBackend {
  if (runtime && typeof runtime !== "function") return runtime;
  if (config.kind === "codex") return createModelCompanionBackend(config);
  return createForwardingBackend(config, runtime ?? ((input, init) => fetch(input, init)));
}

async function runBackendRequest(
  operation: (signal: AbortSignal) => Promise<Response>,
  config: ModelCompanionConfig,
  cors: Headers,
  action: "discovery" | "request",
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Response>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new DOMException("Model companion timed out", "AbortError"));
    }, requestTimeoutMilliseconds);
  });
  try {
    const response = await Promise.race([operation(controller.signal), timeout]);
    const responseBody = await readBoundedBody(response, maximumResponseBytes);
    const headers = new Headers(cors);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(responseBody, { status: response.status, headers });
  } catch (error) {
    const label = config.kind === "codex" ? "Codex" : "Local model";
    const timeoutMessage = action === "discovery" ? `${label} discovery timed out` : `${label} request timed out`;
    const unavailableMessage = `${label} unavailable`;
    const message = timedOut || (error instanceof DOMException && error.name === "AbortError") ? timeoutMessage : unavailableMessage;
    return jsonError(message, 502, cors);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function readCommonConfig(environment: Readonly<Record<string, string | undefined>>): CommonModelCompanionConfig {
  const allowedOrigin = exactOrigin(environment.KIRJOLAB_MODEL_COMPANION_ORIGIN ?? "http://127.0.0.1:8787");
  const portValue = environment.KIRJOLAB_MODEL_COMPANION_PORT ?? "8790";
  const port = Number(portValue);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError("KIRJOLAB_MODEL_COMPANION_PORT must be a valid TCP port");
  }
  return { allowedOrigin, port };
}

function healthPayload(config: ModelCompanionConfig): Record<string, unknown> {
  return config.kind === "codex" ? { ok: true, provider: "codex", model: config.model } : { ok: true, upstream: config.upstream.origin };
}

function startupMessage(config: ModelCompanionConfig): string {
  const backend = config.kind === "codex" ? `Codex model: ${config.model}` : `Forwarding to ${config.upstream.href}`;
  return `Kirjolab model companion listening at http://127.0.0.1:${config.port}\n${backend}\nAllowed origin: ${config.allowedOrigin}\n`;
}

async function serveNodeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: ModelCompanionConfig,
  backend: ModelCompanionBackend,
): Promise<void> {
  try {
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readNodeBody(request);
    const webRequest = new Request(`http://127.0.0.1:${config.port}${request.url ?? "/"}`, {
      method: request.method ?? "GET",
      headers: nodeHeaders(request),
      ...(body ? { body } : {}),
    });
    const result = await handleModelCompanionRequest(webRequest, config, backend);
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

function validateOpenAICompatibleRequest(value: unknown): ModelCompletionRequest {
  if (!isRecord(value) || typeof value.model !== "string" || !value.model.trim() || value.model.length > 256) {
    throw new TypeError("Model identifier is invalid");
  }
  if (value.stream !== false || typeof value.temperature !== "number" || value.temperature < 0 || value.temperature > 2) {
    throw new TypeError("Model parameters are invalid");
  }
  const reasoningEffort = readReasoningEffort(value.reasoning_effort);
  let outputSchema: Record<string, unknown> | null = null;
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
    outputSchema = format.json_schema.schema;
  }
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 16) {
    throw new TypeError("Model messages are invalid");
  }
  let combinedLength = 0;
  const messages: CodexChatMessage[] = [];
  for (const message of value.messages) {
    if (
      !isRecord(message) ||
      (message.role !== "system" && message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string"
    ) {
      throw new TypeError("Model message is invalid");
    }
    combinedLength += message.content.length;
    messages.push({ role: message.role, content: message.content });
  }
  if (combinedLength > 128 * 1_024) throw new RangeError("Combined model messages are too large");
  return { messages, model: value.model.trim(), outputSchema, reasoningEffort };
}

function readReasoningEffort(value: unknown): KirjolabReasoningEffort {
  if (value === undefined) return "provider-default";
  if (value === "none" || value === "low" || value === "medium" || value === "high") return value;
  throw new TypeError("Model reasoning effort is invalid");
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

function codexHome(value: string | undefined, environment: Readonly<Record<string, string | undefined>>): string {
  const path = value?.trim() ?? "";
  if (!path) throw new TypeError("KIRJOLAB_CODEX_HOME is required");
  if (path === "~" || path.startsWith("~/")) {
    const userHome = environment.HOME ?? environment.USERPROFILE;
    if (!userHome) throw new TypeError("KIRJOLAB_CODEX_HOME uses ~ but no user home is available");
    return resolve(userHome, path === "~" ? "." : path.slice(2));
  }
  if (!isAbsolute(path)) throw new TypeError("KIRJOLAB_CODEX_HOME must be absolute or start with ~/");
  return resolve(path);
}

function codexModel(value: string | undefined): string {
  const model = value?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) {
    throw new TypeError("KIRJOLAB_CODEX_MODEL must be a 1-128 character model identifier");
  }
  return model;
}

function bearerToken(value: string | undefined): string {
  if (
    value === undefined ||
    value.length < minimumBearerTokenLength ||
    value.length > maximumBearerTokenLength ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw new TypeError(
      `KIRJOLAB_CODEX_TOKEN must be ${minimumBearerTokenLength}-${maximumBearerTokenLength} printable characters without spaces`,
    );
  }
  return value;
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

function isAuthorized(request: Request, expectedToken: string): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization) return false;
  const match = /^Bearer ([^ ]+)$/i.exec(authorization);
  if (!match?.[1]) return false;
  const expected = Buffer.from(expectedToken, "utf8");
  const supplied = Buffer.from(match[1], "utf8");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function corsHeaders(origin: string, privateNetwork: boolean, authenticated: boolean): Headers {
  const headers = new Headers({
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": authenticated ? "authorization, content-type" : "content-type",
    vary: "Origin",
  });
  if (privateNetwork) headers.set("access-control-allow-private-network", "true");
  return headers;
}

function modelListUpstream(completionUpstream: URL): URL | null {
  const suffix = "/chat/completions";
  if (!completionUpstream.pathname.endsWith(suffix)) return null;
  const upstream = new URL(completionUpstream);
  upstream.pathname = `${upstream.pathname.slice(0, -suffix.length)}/models`;
  return upstream;
}

function jsonError(error: string, status: number, headers?: Headers): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("cache-control", "no-store");
  return Response.json({ error }, { status, headers: responseHeaders });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  runModelCompanion().catch((error: unknown) => {
    process.stderr.write(`Unable to start Kirjolab model companion: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
