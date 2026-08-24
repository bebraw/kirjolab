import { authenticateRequest } from "../security/auth";
import { createCloudflareCorpusService, type CorpusCloudflareEnvironment } from "./cloudflare-adapter";
import { handleCorpusHttp, handleCorpusHttpPreflight } from "./http";
import { handleCorpusMcp, handleCorpusMcpPreflight } from "./mcp";
import { isCorpusOriginAllowed, withCorpusCors } from "./origin";

export interface ResearchCorpusEnvironment
  extends
    Pick<ResearchCorpusBindings, "ACCESS_AUD" | "ACCESS_TEAM_DOMAIN" | "AUTH_MODE" | "CORPUS_ALLOWED_ORIGINS">,
    CorpusCloudflareEnvironment {}

type CorpusRoute = "http" | "mcp";
type CorpusOriginConfiguration =
  { readonly ok: true; readonly allowedOrigins: ReadonlySet<string> } | { readonly ok: false; readonly response: Response };

export default {
  async fetch(request: Request, env: ResearchCorpusEnvironment): Promise<Response> {
    return await handleResearchCorpusRequest(request, env);
  },
} satisfies ExportedHandler<ResearchCorpusEnvironment>;

export async function handleResearchCorpusRequest(request: Request, env: ResearchCorpusEnvironment): Promise<Response> {
  const route = corpusRoute(new URL(request.url).pathname);
  const preflight = configuredCorpusPreflight(request, route, env.CORPUS_ALLOWED_ORIGINS);
  if (preflight) return preflight;

  const authentication = await authenticateRequest(request, env);
  if (!authentication.ok) return authentication.response;

  const originConfiguration = corpusOriginConfiguration(env.CORPUS_ALLOWED_ORIGINS);
  if (!originConfiguration.ok) return originConfiguration.response;
  if (!route) return corpusJsonError("Corpus route not found", 404);

  const service = createCloudflareCorpusService(authentication.identity.ownerKey, authentication.identity.email, env);
  try {
    return await dispatchCorpusRequest(request, route, service, originConfiguration.allowedOrigins);
  } catch (error) {
    return corpusRequestFailure(request, error, originConfiguration.allowedOrigins);
  }
}

function corpusRoute(pathname: string): CorpusRoute | null {
  if (pathname.startsWith("/v1/")) return "http";
  return pathname === "/mcp" ? "mcp" : null;
}

function configuredCorpusPreflight(request: Request, route: CorpusRoute | null, configuredOrigins: string): Response | null {
  if (request.method !== "OPTIONS" || !route) return null;
  const configuration = corpusOriginConfiguration(configuredOrigins);
  if (!configuration.ok) return configuration.response;
  return route === "mcp"
    ? handleCorpusMcpPreflight(request, configuration.allowedOrigins)
    : handleCorpusHttpPreflight(request, configuration.allowedOrigins);
}

function corpusOriginConfiguration(value: string): CorpusOriginConfiguration {
  try {
    return { ok: true, allowedOrigins: parseCorpusAllowedOrigins(value) };
  } catch {
    return { ok: false, response: corpusJsonError("Research Corpus origin configuration is invalid", 503) };
  }
}

async function dispatchCorpusRequest(
  request: Request,
  route: CorpusRoute,
  service: ReturnType<typeof createCloudflareCorpusService>,
  allowedOrigins: ReadonlySet<string>,
): Promise<Response> {
  return route === "mcp"
    ? await handleCorpusMcp(request, service, allowedOrigins)
    : await handleCorpusHttp(request, service, allowedOrigins);
}

function corpusRequestFailure(request: Request, error: unknown, allowedOrigins: ReadonlySet<string>): Response {
  console.error("Research Corpus request failed", error);
  const response = corpusJsonError("Research Corpus request failed", 500);
  const origin = request.headers.get("origin");
  return origin && isCorpusOriginAllowed(request, origin, allowedOrigins) ? withCorpusCors(response, origin) : response;
}

export function parseCorpusAllowedOrigins(value: string): ReadonlySet<string> {
  const origins = new Set<string>();
  for (const item of value
    .split(",")
    .map((candidate) => candidate.trim())
    .filter(Boolean)) {
    const url = new URL(item);
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      item !== url.origin
    ) {
      throw new Error("Corpus origin must be a canonical HTTPS or loopback origin");
    }
    origins.add(url.origin);
  }
  return origins;
}

function corpusJsonError(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
