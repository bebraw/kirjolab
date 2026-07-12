import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleModelCompanionRequest, readModelCompanionConfig, startModelCompanion, type ModelCompanionConfig } from "./model-companion";

const config: ModelCompanionConfig = {
  upstream: new URL("http://127.0.0.1:1234/v1/chat/completions"),
  allowedOrigin: "https://kirjolab.example",
  port: 8790,
};

const validPayload = {
  model: "local-model",
  temperature: 0.2,
  stream: false,
  messages: [
    { role: "system", content: "Return only a replacement." },
    { role: "user", content: "Revise this selected passage." },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("local model companion", () => {
  it("reads a fixed loopback upstream, exact browser origin, and bounded port", () => {
    expect(
      readModelCompanionConfig({
        KIRJOLAB_MODEL_UPSTREAM: "http://localhost:1234/v1/chat/completions",
        KIRJOLAB_MODEL_COMPANION_ORIGIN: "https://kirjolab.example",
        KIRJOLAB_MODEL_COMPANION_PORT: "9000",
      }),
    ).toEqual({
      upstream: new URL("http://localhost:1234/v1/chat/completions"),
      allowedOrigin: "https://kirjolab.example",
      port: 9000,
    });
    expect(readModelCompanionConfig({ KIRJOLAB_MODEL_UPSTREAM: "http://[::1]:1234/v1/chat/completions" })).toMatchObject({
      allowedOrigin: "http://127.0.0.1:8787",
      port: 8790,
    });
  });

  it.each([
    [{}, "required"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "https://example.com/model" }, "loopback"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "file:///tmp/model" }, "loopback"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://user:secret@localhost/model" }, "loopback"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://localhost/model?token=secret" }, "loopback"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://localhost/model", KIRJOLAB_MODEL_COMPANION_ORIGIN: "https://example.com/" }, "exact"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://localhost/model", KIRJOLAB_MODEL_COMPANION_PORT: "0" }, "valid TCP port"],
  ])("rejects unsafe companion configuration %#", (environment, message) => {
    expect(() => readModelCompanionConfig(environment)).toThrow(message);
  });

  it("answers health and a private-network CORS preflight without contacting the provider", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(handleModelCompanionRequest(new Request("http://127.0.0.1:8790/health"), config, fetcher)).resolves.toMatchObject({
      status: 200,
    });
    const preflight = await handleModelCompanionRequest(
      request("OPTIONS", undefined, { "access-control-request-private-network": "true" }),
      config,
      fetcher,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(config.allowedOrigin);
    expect(preflight.headers.get("access-control-allow-private-network")).toBe("true");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("forwards a validated request only to the configured provider and bounds the response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ choices: [{ message: { content: "A reviewed replacement." } }] }, { status: 201 }));
    const response = await handleModelCompanionRequest(request("POST", validPayload), config, fetcher);

    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe(config.allowedOrigin);
    await expect(response.json()).resolves.toEqual({ choices: [{ message: { content: "A reviewed replacement." } }] });
    expect(fetcher).toHaveBeenCalledOnce();
    const [upstream, init] = fetcher.mock.calls[0] ?? [];
    expect(String(upstream)).toBe(config.upstream.href);
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { "content-type": "application/json" } });
    expect(JSON.parse(new TextDecoder().decode(init?.body as Uint8Array))).toEqual(validPayload);
  });

  it("fails closed on routes, origins, methods, media types, and malformed task shapes", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const cases = [
      [new Request("http://127.0.0.1:8790/missing"), 404],
      [request("POST", validPayload, { origin: "https://attacker.example" }), 403],
      [request("GET"), 405],
      [request("POST", validPayload, { "content-type": "text/plain" }), 415],
      [request("POST", { ...validPayload, model: "" }), 400],
      [request("POST", { ...validPayload, stream: true }), 400],
      [request("POST", { ...validPayload, temperature: 3 }), 400],
      [request("POST", { ...validPayload, messages: [] }), 400],
      [request("POST", { ...validPayload, messages: [{ role: "tool", content: "x" }] }), 400],
      [request("POST", { ...validPayload, messages: [{ role: "user", content: "x".repeat(128 * 1_024 + 1) }] }), 400],
    ] as const;
    for (const [candidate, status] of cases) {
      expect((await handleModelCompanionRequest(candidate, config, fetcher)).status).toBe(status);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not expose provider errors or oversized responses", async () => {
    const unavailable = await handleModelCompanionRequest(
      request("POST", validPayload),
      config,
      vi.fn<typeof fetch>().mockRejectedValue(new Error("provider secret")),
    );
    expect(unavailable.status).toBe(502);
    await expect(unavailable.json()).resolves.toEqual({ error: "Local model unavailable" });

    const oversized = new Response(new Uint8Array(256 * 1_024 + 1));
    const bounded = await handleModelCompanionRequest(
      request("POST", validPayload),
      config,
      vi.fn<typeof fetch>().mockResolvedValue(oversized),
    );
    expect(bounded.status).toBe(502);
  });

  it("serves the real Node loopback boundary", async () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const server = startModelCompanion({ ...config, port: 0 });
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP companion address");
    try {
      const health = await fetch(`http://127.0.0.1:${address.port}/health`);
      await expect(health.json()).resolves.toEqual({ ok: true, upstream: "http://127.0.0.1:1234" });
      const denied = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
        method: "POST",
        headers: { origin: "https://attacker.example", "content-type": "application/json" },
        body: JSON.stringify(validPayload),
      });
      expect(denied.status).toBe(403);
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});

function request(method: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://127.0.0.1:8790/v1/chat/completions", {
    method,
    headers: {
      origin: config.allowedOrigin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
