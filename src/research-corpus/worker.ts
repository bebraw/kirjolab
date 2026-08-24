import { authenticateRequest, type AuthEnvironment } from "../security/auth";
import { createCloudflareCorpusService, type CorpusCloudflareEnvironment } from "./cloudflare-adapter";
import { handleCorpusHttp } from "./http";
import { handleCorpusMcp } from "./mcp";

export interface ResearchCorpusEnvironment extends AuthEnvironment, CorpusCloudflareEnvironment {
  readonly CORPUS_ALLOWED_ORIGINS: string;
}

export default {
  async fetch(request: Request, env: ResearchCorpusEnvironment): Promise<Response> {
    return await handleResearchCorpusRequest(request, env);
  },
} satisfies ExportedHandler<ResearchCorpusEnvironment>;

export async function handleResearchCorpusRequest(request: Request, env: ResearchCorpusEnvironment): Promise<Response> {
  const authentication = await authenticateRequest(request, env);
  if (!authentication.ok) return authentication.response;

  let allowedOrigins: ReadonlySet<string>;
  try {
    allowedOrigins = parseCorpusAllowedOrigins(env.CORPUS_ALLOWED_ORIGINS);
  } catch {
    return corpusJsonError("Research Corpus origin configuration is invalid", 503);
  }

  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/v1/") && pathname !== "/mcp") return corpusJsonError("Corpus route not found", 404);

  const service = createCloudflareCorpusService(authentication.identity.ownerKey, authentication.identity.email, env);
  try {
    if (pathname === "/mcp") return await handleCorpusMcp(request, service, allowedOrigins);
    return await handleCorpusHttp(request, service, allowedOrigins);
  } catch (error) {
    console.error("Research Corpus request failed", error);
    return corpusJsonError("Research Corpus request failed", 500);
  }
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
