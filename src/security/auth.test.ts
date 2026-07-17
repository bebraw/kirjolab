import { describe, expect, it, vi } from "vitest";
import { authenticateRequest, isSameOriginMutation, ownerKeyForEmail, verifyAccessJwt } from "./auth";

const configuration = { audience: "kirjolab-audience", teamDomain: "https://kirjolab.cloudflareaccess.com" };

describe("authentication security boundary", () => {
  it("permits local identities only on loopback", async () => {
    const env = { AUTH_MODE: "local", ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "" };
    const local = await authenticateRequest(
      new Request("http://127.0.0.1/", { headers: { "x-kirjolab-local-user": "Person@Example.org" } }),
      env,
    );
    expect(local.ok ? local.identity : null).toMatchObject({ email: "person@example.org", mode: "local" });

    const deployed = await authenticateRequest(new Request("https://app.example/"), env);
    await expectAuthError(deployed, 503, "Local authentication is restricted to loopback hosts");
    const invalid = await authenticateRequest(new Request("http://localhost/", { headers: { "x-kirjolab-local-user": "invalid" } }), env);
    await expectAuthError(invalid, 401, "Local user identity is invalid");
    await expectAuthError(
      await authenticateRequest(
        new Request("http://localhost/", { headers: { "x-kirjolab-local-user": "prefix person@example.org" } }),
        env,
      ),
      401,
      "Local user identity is invalid",
    );
    await expectAuthError(
      await authenticateRequest(
        new Request("http://localhost/", { headers: { "x-kirjolab-local-user": "person@example.org suffix" } }),
        env,
      ),
      401,
      "Local user identity is invalid",
    );
    const unknownMode = await authenticateRequest(new Request("https://app.example/"), { ...env, AUTH_MODE: "unknown" });
    await expectAuthError(unknownMode, 503, "Authentication mode is not configured");
  });

  it("authenticates Access requests from verified remote keys", async () => {
    const pair = await createRsaPair();
    const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
    if (exported instanceof ArrayBuffer) throw new Error("Expected a JSON Web Key");
    const validKey = { ...exported, kid: "remote-key", alg: "RS256", use: "sig" };
    const keys = { keys: [null, {}, { kid: "remote-key" }, { kty: "RSA" }, validKey] };
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken(
      pair.privateKey,
      { alg: "RS256", kid: "remote-key" },
      {
        aud: configuration.audience,
        email: "person@example.org",
        exp: now + 300,
        iss: configuration.teamDomain,
        sub: "access-subject",
      },
    );
    const env = {
      AUTH_MODE: "access",
      ACCESS_TEAM_DOMAIN: configuration.teamDomain,
      ACCESS_AUD: configuration.audience,
    };
    const cacheMatch = vi.fn(async (): Promise<Response | undefined> => undefined);
    const cachePut = vi.fn(async (_request: Request, _response: Response): Promise<void> => undefined);
    const fetchKeys = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(`${configuration.teamDomain}/cdn-cgi/access/certs`);
      expect(init).toEqual({ headers: { accept: "application/json" } });
      return Response.json(keys);
    });
    vi.stubGlobal("caches", { default: { match: cacheMatch, put: cachePut } });
    vi.stubGlobal("fetch", fetchKeys);
    try {
      const authenticated = await authenticateRequest(
        new Request("https://app.example/", { headers: { "cf-access-jwt-assertion": token } }),
        env,
      );
      expect(authenticated.ok ? authenticated.identity : null).toMatchObject({
        email: "person@example.org",
        mode: "access",
        subject: "access-subject",
      });
      expect(cacheMatch).toHaveBeenCalledOnce();
      expect(cachePut).toHaveBeenCalledOnce();
      const cachedResponse: unknown = cachePut.mock.calls[0]?.[1];
      expect(cachedResponse).toBeInstanceOf(Response);
      expect(cachedResponse instanceof Response ? cachedResponse.headers.get("cache-control") : null).toBe("public, max-age=3600");

      cacheMatch.mockResolvedValueOnce(Response.json({ keys: [validKey] }));
      fetchKeys.mockClear();
      const cachedAuthentication = await authenticateRequest(
        new Request("https://app.example/", { headers: { "cf-access-jwt-assertion": token } }),
        env,
      );
      expect(cachedAuthentication.ok).toBe(true);
      expect(fetchKeys).not.toHaveBeenCalled();
      const missing = await authenticateRequest(new Request("https://app.example/"), env);
      await expectAuthError(missing, 401, "Cloudflare Access token is required");
      const invalid = await authenticateRequest(
        new Request("https://app.example/", { headers: { "cf-access-jwt-assertion": "invalid" } }),
        env,
      );
      await expectAuthError(invalid, 401, "Cloudflare Access token is invalid");
      const unconfigured = await authenticateRequest(new Request("https://app.example/"), {
        ...env,
        ACCESS_TEAM_DOMAIN: "",
      });
      await expectAuthError(unconfigured, 503, "Cloudflare Access is not configured");

      cacheMatch.mockResolvedValueOnce(undefined);
      fetchKeys.mockResolvedValueOnce(Response.json({ keys: [validKey] }, { status: 500 }));
      const unavailableKeys = await authenticateRequest(
        new Request("https://app.example/", { headers: { "cf-access-jwt-assertion": token } }),
        env,
      );
      await expectAuthError(unavailableKeys, 401, "Cloudflare Access token is invalid");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("derives stable non-plaintext owner keys", async () => {
    await expect(ownerKeyForEmail(" Local@Kirjolab.Invalid ")).resolves.toBe("local");
    const first = await ownerKeyForEmail("Researcher@Example.org");
    const second = await ownerKeyForEmail("researcher@example.org");
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(first).not.toContain("researcher");
  });

  it("requires same-origin browser mutations", () => {
    expect(isSameOriginMutation(new Request("https://app.example/api", { method: "GET" }))).toBe(true);
    expect(
      isSameOriginMutation(new Request("https://app.example/api", { method: "POST", headers: { origin: "https://app.example" } })),
    ).toBe(true);
    expect(isSameOriginMutation(new Request("https://app.example/api", { method: "POST" }))).toBe(false);
    expect(
      isSameOriginMutation(new Request("https://app.example/api", { method: "POST", headers: { origin: "https://attacker.example" } })),
    ).toBe(false);
    expect(
      isSameOriginMutation(
        new Request("https://app.example/api/workspaces/demo/socket", {
          headers: { origin: "https://app.example", upgrade: "websocket" },
        }),
      ),
    ).toBe(true);
    expect(isSameOriginMutation(new Request("https://app.example/api/workspaces/demo/socket", { headers: { upgrade: "websocket" } }))).toBe(
      false,
    );
    expect(
      isSameOriginMutation(
        new Request("https://app.example/api/workspaces/demo/socket", {
          headers: { origin: "https://attacker.example", upgrade: "websocket" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutation(
        new Request("https://app.example/api/workspaces/demo/socket", {
          headers: { origin: "https://app.example/", upgrade: "websocket" },
        }),
      ),
    ).toBe(false);
  });

  it("verifies Access signature, issuer, audience, and time claims", async () => {
    const pair = await createRsaPair();
    const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
    if (exported instanceof ArrayBuffer) throw new Error("Expected a JSON Web Key");
    const keys = { keys: [{ ...exported, kid: "access-key", alg: "RS256", use: "sig" }] };
    const now = 1_800_000_000;
    const payload = {
      aud: [configuration.audience],
      email: "Researcher@Example.org",
      exp: now + 300,
      iss: configuration.teamDomain,
      nbf: now - 10,
      sub: "subject-1",
    };
    const token = await signToken(pair.privateKey, { alg: "RS256", kid: "access-key", typ: "JWT" }, payload);

    await expect(verifyAccessJwt(token, keys, configuration, now)).resolves.toMatchObject({
      email: "researcher@example.org",
      sub: "subject-1",
    });
    await expect(verifyAccessJwt(token, keys, { ...configuration, audience: "wrong" }, now)).rejects.toThrow();
    await expect(
      verifyAccessJwt(token, keys, { ...configuration, teamDomain: "https://wrong.cloudflareaccess.com" }, now),
    ).rejects.toThrow();
    await expect(verifyAccessJwt(token, keys, configuration, now + 400)).rejects.toThrow();
    await expect(verifyAccessJwt(token, { keys: [] }, configuration, now)).rejects.toThrow();
    await expect(verifyAccessJwt(token, { keys: [{ ...keys.keys.at(-1)!, alg: "HS256" }] }, configuration, now)).rejects.toThrow();
    const { alg: removedAlgorithm, ...keyWithoutAlgorithm } = keys.keys.at(-1)!;
    expect(removedAlgorithm).toBe("RS256");
    await expect(verifyAccessJwt(token, { keys: [keyWithoutAlgorithm] }, configuration, now)).resolves.toBeDefined();

    const future = await signToken(pair.privateKey, { alg: "RS256", kid: "access-key" }, { ...payload, nbf: now + 100 });
    await expect(verifyAccessJwt(future, keys, configuration, now)).rejects.toThrow();
    const wrongAlgorithm = await signToken(pair.privateKey, { alg: "HS256", kid: "access-key" }, payload);
    await expect(verifyAccessJwt(wrongAlgorithm, keys, configuration, now)).rejects.toThrow();
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("Expected a three-part JWT");
    const tamperedSignature = `${encodedSignature.startsWith("a") ? "b" : "a"}${encodedSignature.slice(1)}`;
    const tampered = `${encodedHeader}.${encodedPayload}.${tamperedSignature}`;
    await expect(verifyAccessJwt(tampered, keys, configuration, now)).rejects.toThrow();
  });
});

async function expectAuthError(result: Awaited<ReturnType<typeof authenticateRequest>>, status: number, error: string): Promise<void> {
  if (result.ok) throw new Error("Expected authentication to fail");
  expect(result.response.status).toBe(status);
  expect(result.response.headers.get("cache-control")).toBe("no-store");
  await expect(result.response.json()).resolves.toEqual({ error });
}

async function createRsaPair(): Promise<CryptoKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  if (!("privateKey" in pair)) throw new Error("Expected an RSA key pair");
  return pair;
}

async function signToken(privateKey: CryptoKey, header: object, payload: object): Promise<string> {
  const encodedHeader = encodeJson(header);
  const encodedPayload = encodeJson(payload);
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(data));
  return `${data}.${toBase64Url(new Uint8Array(signature))}`;
}

function encodeJson(value: object): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}
