import { localOwnerId } from "../domain/workspace";

export interface AuthIdentity {
  subject: string;
  email: string;
  ownerKey: string;
  mode: "local" | "access";
}

export interface AuthEnvironment {
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
  AUTH_MODE: string;
}

export type AuthenticationResult = { ok: true; identity: AuthIdentity } | { ok: false; response: Response };

interface AccessJwtHeader {
  alg: "RS256";
  kid: string;
}

interface AccessJwtPayload {
  aud: string | string[];
  email: string;
  exp: number;
  iss: string;
  nbf?: number;
  sub: string;
}

interface AccessJsonWebKey extends JsonWebKey {
  alg?: string;
  kid: string;
}

interface JsonWebKeySet {
  keys: AccessJsonWebKey[];
}

interface AccessConfiguration {
  audience: string;
  teamDomain: string;
}

const defaultLocalEmail = "local@kirjolab.invalid";

export async function authenticateRequest(request: Request, env: AuthEnvironment): Promise<AuthenticationResult> {
  const mode: string = env.AUTH_MODE;
  if (mode === "local") return await authenticateLocalRequest(request);
  if (mode !== "access") return unavailable("Authentication mode is not configured");

  const configuration = accessConfiguration(env);
  if (!configuration) return unavailable("Cloudflare Access is not configured");
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return unauthorized("Cloudflare Access token is required");
  try {
    const keys = await loadAccessKeys(configuration.teamDomain);
    const payload = await verifyAccessJwt(token, keys, configuration);
    return {
      ok: true,
      identity: {
        subject: payload.sub,
        email: normalizeEmail(payload.email),
        ownerKey: await ownerKeyForEmail(payload.email),
        mode: "access",
      },
    };
  } catch {
    return unauthorized("Cloudflare Access token is invalid");
  }
}

export async function ownerKeyForEmail(email: string): Promise<string> {
  const normalized = normalizeEmail(email);
  if (normalized === defaultLocalEmail) return localOwnerId;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function isSameOriginMutation(request: Request): boolean {
  const isWebSocketUpgrade = request.method === "GET" && request.headers.get("upgrade")?.trim().toLowerCase() === "websocket";
  if (!isWebSocketUpgrade && (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS")) return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}

export async function verifyAccessJwt(
  token: string,
  keySet: JsonWebKeySet,
  configuration: AccessConfiguration,
  now = Math.floor(Date.now() / 1000),
): Promise<AccessJwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new Error("Malformed JWT");
  const header = parseHeader(parts[0]);
  const payload = parsePayload(parts[1]);
  const issuer = configuration.teamDomain.replace(/\/$/u, "");
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== issuer || !audiences.includes(configuration.audience)) throw new Error("JWT claims do not match");
  if (payload.exp <= now - 30 || (payload.nbf !== undefined && payload.nbf > now + 30)) throw new Error("JWT is not current");
  const key = keySet.keys.find((candidate) => candidate.kid === header.kid);
  if (!key || key.kty !== "RSA" || (key.alg !== undefined && key.alg !== "RS256")) throw new Error("JWT key is unavailable");
  const publicKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new Error("JWT signature is invalid");
  return payload;
}

async function authenticateLocalRequest(request: Request): Promise<AuthenticationResult> {
  const hostname = new URL(request.url).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "[::1]") {
    return unavailable("Local authentication is restricted to loopback hosts");
  }
  const requestedEmail = request.headers.get("x-kirjolab-local-user") ?? defaultLocalEmail;
  if (!isEmail(requestedEmail)) return unauthorized("Local user identity is invalid");
  const email = normalizeEmail(requestedEmail);
  return {
    ok: true,
    identity: { subject: `local:${email}`, email, ownerKey: await ownerKeyForEmail(email), mode: "local" },
  };
}

function accessConfiguration(env: AuthEnvironment): AccessConfiguration | null {
  const teamDomain: string = env.ACCESS_TEAM_DOMAIN;
  const audience: string = env.ACCESS_AUD;
  if (!audience || !/^https:\/\/[a-z0-9.-]+\.cloudflareaccess\.com$/iu.test(teamDomain)) return null;
  return { audience, teamDomain: teamDomain.replace(/\/$/u, "") };
}

async function loadAccessKeys(teamDomain: string): Promise<JsonWebKeySet> {
  const url = `${teamDomain}/cdn-cgi/access/certs`;
  const cache = typeof caches === "undefined" ? undefined : caches.default;
  const cacheRequest = new Request(url);
  let response = await cache?.match(cacheRequest);
  if (!response) {
    response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("Could not load Access signing keys");
    const cached = new Response(response.clone().body, response);
    cached.headers.set("cache-control", "public, max-age=3600");
    await cache?.put(cacheRequest, cached);
  }
  const value: unknown = await response.json();
  if (!isRecord(value) || !Array.isArray(value.keys)) throw new Error("Access signing keys are invalid");
  return {
    keys: value.keys.filter((key): key is AccessJsonWebKey => isRecord(key) && typeof key.kty === "string" && typeof key.kid === "string"),
  };
}

function parseHeader(value: string): AccessJwtHeader {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
  if (!isRecord(parsed) || parsed.alg !== "RS256" || typeof parsed.kid !== "string") throw new Error("JWT header is invalid");
  return { alg: "RS256", kid: parsed.kid };
}

function parsePayload(value: string): AccessJwtPayload {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
  if (
    !isRecord(parsed) ||
    !(typeof parsed.aud === "string" || (Array.isArray(parsed.aud) && parsed.aud.every((item) => typeof item === "string"))) ||
    !isEmail(parsed.email) ||
    typeof parsed.exp !== "number" ||
    typeof parsed.iss !== "string" ||
    (parsed.nbf !== undefined && typeof parsed.nbf !== "number") ||
    typeof parsed.sub !== "string" ||
    !parsed.sub
  ) {
    throw new Error("JWT payload is invalid");
  }
  return {
    aud: parsed.aud,
    email: normalizeEmail(parsed.email),
    exp: parsed.exp,
    iss: parsed.iss,
    ...(typeof parsed.nbf === "number" ? { nbf: parsed.nbf } : {}),
    sub: parsed.sub,
  };
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function unauthorized(error: string): AuthenticationResult {
  return { ok: false, response: Response.json({ error }, { status: 401, headers: { "cache-control": "no-store" } }) };
}

function unavailable(error: string): AuthenticationResult {
  return { ok: false, response: Response.json({ error }, { status: 503, headers: { "cache-control": "no-store" } }) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
