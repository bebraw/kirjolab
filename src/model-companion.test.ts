import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCodexModelBackend,
  handleModelCompanionRequest,
  readModelCompanionConfig,
  startModelCompanion,
  type CodexModelCompanionConfig,
  type ModelCompanionConfig,
} from "./model-companion";
import type { CodexGenerationRunner } from "./codex-model-backend";

const config: ModelCompanionConfig = {
  kind: "openai-compatible",
  upstream: new URL("http://127.0.0.1:1234/v1/chat/completions"),
  allowedOrigin: "https://kirjolab.example",
  port: 8790,
};
const codexToken = "codex-token-with-at-least-24-chars";
const codexConfig: CodexModelCompanionConfig = {
  kind: "codex",
  allowedOrigin: config.allowedOrigin,
  bearerToken: codexToken,
  codexHome: "/private/tmp/kirjolab-codex-home",
  model: "gpt-5.6-terra",
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
        KIRJOLAB_MODEL_PROVIDER: "openai-compatible",
        KIRJOLAB_MODEL_UPSTREAM: "http://localhost:1234/v1/chat/completions",
        KIRJOLAB_MODEL_COMPANION_ORIGIN: "https://kirjolab.example",
        KIRJOLAB_MODEL_COMPANION_PORT: "9000",
      }),
    ).toEqual({
      kind: "openai-compatible",
      upstream: new URL("http://localhost:1234/v1/chat/completions"),
      allowedOrigin: "https://kirjolab.example",
      port: 9000,
    });
    expect(readModelCompanionConfig({ KIRJOLAB_MODEL_UPSTREAM: "http://[::1]:1234/v1/chat/completions" })).toMatchObject({
      allowedOrigin: "http://127.0.0.1:8787",
      port: 8790,
    });
    for (const upstream of ["http://127.0.0.1/model", "https://localhost/model", "https://[::1]/model"]) {
      const parsed = readModelCompanionConfig({ KIRJOLAB_MODEL_UPSTREAM: upstream });
      expect(parsed.kind).toBe("openai-compatible");
      if (parsed.kind === "openai-compatible") expect(parsed.upstream.href).toBe(upstream);
    }
    for (const port of [1, 65_535]) {
      expect(
        readModelCompanionConfig({ KIRJOLAB_MODEL_UPSTREAM: "http://localhost/model", KIRJOLAB_MODEL_COMPANION_PORT: String(port) }).port,
      ).toBe(port);
    }
  });

  it("reads a fixed authenticated Codex backend without an HTTP upstream", () => {
    expect(
      readModelCompanionConfig({
        KIRJOLAB_MODEL_PROVIDER: "codex",
        KIRJOLAB_CODEX_HOME: "/private/tmp/kirjolab-codex-home",
        KIRJOLAB_CODEX_MODEL: "gpt-5.6-terra",
        KIRJOLAB_CODEX_TOKEN: codexToken,
        KIRJOLAB_MODEL_COMPANION_ORIGIN: "https://kirjolab.example",
        KIRJOLAB_MODEL_COMPANION_PORT: "9000",
      }),
    ).toEqual({
      kind: "codex",
      allowedOrigin: "https://kirjolab.example",
      bearerToken: codexToken,
      codexHome: "/private/tmp/kirjolab-codex-home",
      model: "gpt-5.6-terra",
      port: 9000,
    });
  });

  it.each([
    [{ KIRJOLAB_MODEL_PROVIDER: "unknown" }, "KIRJOLAB_MODEL_PROVIDER"],
    [{ KIRJOLAB_MODEL_PROVIDER: "codex" }, "KIRJOLAB_CODEX_HOME"],
    [
      {
        KIRJOLAB_MODEL_PROVIDER: "codex",
        KIRJOLAB_CODEX_HOME: "relative/home",
        KIRJOLAB_CODEX_MODEL: "gpt-5.6-terra",
        KIRJOLAB_CODEX_TOKEN: codexToken,
      },
      "absolute",
    ],
    [
      {
        KIRJOLAB_MODEL_PROVIDER: "codex",
        KIRJOLAB_CODEX_HOME: "/private/tmp/kirjolab-codex-home",
        KIRJOLAB_CODEX_TOKEN: codexToken,
      },
      "KIRJOLAB_CODEX_MODEL",
    ],
    [
      {
        KIRJOLAB_MODEL_PROVIDER: "codex",
        KIRJOLAB_CODEX_HOME: "/private/tmp/kirjolab-codex-home",
        KIRJOLAB_CODEX_MODEL: "gpt-5.6-terra",
        KIRJOLAB_CODEX_TOKEN: "short",
      },
      "24-512",
    ],
  ])("rejects unsafe Codex companion configuration %#", (environment, message) => {
    expect(() => readModelCompanionConfig(environment)).toThrow(message);
  });

  it.each([
    [{}, "required"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "https://example.com/model" }, "loopback"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "file:///tmp/model" }, "loopback"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://user:secret@localhost/model" }, "loopback"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://localhost/model?token=secret" }, "loopback"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://localhost/model#fragment" }, "loopback"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://localhost/model", KIRJOLAB_MODEL_COMPANION_ORIGIN: "https://example.com/" }, "exact"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://localhost/model", KIRJOLAB_MODEL_COMPANION_ORIGIN: "file://example.com" }, "exact"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://localhost/model", KIRJOLAB_MODEL_COMPANION_PORT: "0" }, "valid TCP port"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://localhost/model", KIRJOLAB_MODEL_COMPANION_PORT: "65536" }, "valid TCP port"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://localhost/model", KIRJOLAB_MODEL_COMPANION_PORT: "1.5" }, "valid TCP port"],
    [{ KIRJOLAB_MODEL_UPSTREAM: "http://localhost/model", KIRJOLAB_MODEL_COMPANION_PORT: "NaN" }, "valid TCP port"],
  ])("rejects unsafe companion configuration %#", (environment, message) => {
    expect(() => readModelCompanionConfig(environment)).toThrow(message);
  });

  it("answers health and a private-network CORS preflight without contacting the provider", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const health = await handleModelCompanionRequest(new Request("http://127.0.0.1:8790/health"), config, fetcher);
    expect(health.status).toBe(200);
    expect(health.headers.get("cache-control")).toBe("no-store");
    await expect(health.json()).resolves.toEqual({ ok: true, upstream: config.upstream.origin });
    const preflight = await handleModelCompanionRequest(
      request("OPTIONS", undefined, { "access-control-request-private-network": "true" }),
      config,
      fetcher,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(config.allowedOrigin);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
    expect(preflight.headers.get("access-control-allow-headers")).toBe("content-type");
    expect(preflight.headers.get("vary")).toBe("Origin");
    expect(preflight.headers.get("access-control-allow-private-network")).toBe("true");
    expect(await preflight.text()).toBe("");

    const ordinaryPreflight = await handleModelCompanionRequest(request("OPTIONS"), config, fetcher);
    expect(ordinaryPreflight.headers.has("access-control-allow-private-network")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts equivalent loopback browser aliases only on the configured scheme and port", async () => {
    const loopbackConfig = { ...config, allowedOrigin: "http://127.0.0.1:8787" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [] }));
    const accepted = await handleModelCompanionRequest(
      new Request("http://127.0.0.1:8790/v1/models", { headers: { origin: "http://localhost:8787" } }),
      loopbackConfig,
      fetcher,
    );
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("access-control-allow-origin")).toBe("http://localhost:8787");

    for (const origin of ["http://localhost:8788", "https://localhost:8787", "http://attacker.example:8787"]) {
      const denied = await handleModelCompanionRequest(
        new Request("http://127.0.0.1:8790/v1/models", { headers: { origin } }),
        loopbackConfig,
        fetcher,
      );
      expect(denied.status).toBe(403);
    }
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("proxies bounded model discovery to the configured provider origin", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [{ id: "qwen/qwen3.5-9b" }] }));
    const response = await handleModelCompanionRequest(
      new Request("http://127.0.0.1:8790/v1/models", { headers: { origin: config.allowedOrigin } }),
      config,
      fetcher,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(config.allowedOrigin);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ data: [{ id: "qwen/qwen3.5-9b" }] });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("http://127.0.0.1:1234/v1/models");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "error", headers: { accept: "application/json" } });
  });

  it("requires the Codex bearer token after origin-gated preflight and lists only the configured model", async () => {
    const runner: CodexGenerationRunner = { run: vi.fn() };
    const backend = createCodexModelBackend(codexConfig, runner);
    const health = await handleModelCompanionRequest(new Request("http://127.0.0.1:8790/health"), codexConfig, backend);
    expect(await health.clone().text()).not.toContain(codexToken);
    await expect(health.json()).resolves.toEqual({ ok: true, provider: "codex", model: codexConfig.model });
    const preflight = await handleModelCompanionRequest(
      new Request("http://127.0.0.1:8790/v1/models", {
        method: "OPTIONS",
        headers: { origin: codexConfig.allowedOrigin },
      }),
      codexConfig,
      backend,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toBe("authorization, content-type");

    for (const authorization of [undefined, "Bearer wrong-token-with-at-least-24-characters"]) {
      const denied = await handleModelCompanionRequest(
        new Request("http://127.0.0.1:8790/v1/models", {
          headers: {
            origin: codexConfig.allowedOrigin,
            ...(authorization ? { authorization } : {}),
          },
        }),
        codexConfig,
        backend,
      );
      expect(denied.status).toBe(401);
      expect(denied.headers.get("www-authenticate")).toBe("Bearer");
    }

    const response = await handleModelCompanionRequest(
      new Request("http://127.0.0.1:8790/v1/models", {
        headers: { authorization: `Bearer ${codexToken}`, origin: codexConfig.allowedOrigin },
      }),
      codexConfig,
      backend,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ object: "list", data: [{ id: "gpt-5.6-terra", object: "model" }] });
  });

  it("runs an authenticated structured completion through Codex and returns an OpenAI-compatible envelope", async () => {
    const run = vi.fn(async () => ({ finalResponse: '{"replacement":"Codex revision."}' }));
    const backend = createCodexModelBackend(codexConfig, { run });
    const payload = {
      ...validPayload,
      model: codexConfig.model,
      reasoning_effort: "none",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "revision",
          strict: true,
          schema: { type: "object", properties: { replacement: { type: "string" } }, required: ["replacement"] },
        },
      },
    };
    const response = await handleModelCompanionRequest(
      request("POST", payload, { authorization: `Bearer ${codexToken}` }),
      codexConfig,
      backend,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(codexConfig.allowedOrigin);
    await expect(response.json()).resolves.toMatchObject({
      object: "chat.completion",
      model: codexConfig.model,
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"replacement":"Codex revision."}' } }],
    });
    expect(run).toHaveBeenCalledWith({
      messages: validPayload.messages,
      model: codexConfig.model,
      outputSchema: payload.response_format.json_schema.schema,
      reasoningEffort: "none",
      signal: expect.any(AbortSignal),
    });
  });

  it("bounds Codex results, redacts provider failures, and aborts an active generation on close", async () => {
    const headers = { authorization: `Bearer ${codexToken}` };
    const payload = {
      ...validPayload,
      model: codexConfig.model,
      response_format: {
        type: "json_schema",
        json_schema: { name: "result", strict: true, schema: { type: "object" } },
      },
    };
    const failed = await handleModelCompanionRequest(
      request("POST", payload, headers),
      codexConfig,
      createCodexModelBackend(codexConfig, { run: vi.fn(async () => Promise.reject(new Error("private Codex detail"))) }),
    );
    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toEqual({ error: "Codex unavailable" });

    const oversized = await handleModelCompanionRequest(
      request("POST", payload, headers),
      codexConfig,
      createCodexModelBackend(codexConfig, { run: vi.fn(async () => ({ finalResponse: "x".repeat(256 * 1_024 + 1) })) }),
    );
    expect(oversized.status).toBe(502);
    await expect(oversized.json()).resolves.toEqual({ error: "Codex unavailable" });

    let signal: AbortSignal | undefined;
    const backend = createCodexModelBackend(codexConfig, {
      run: vi.fn(
        (request) =>
          new Promise<never>((_resolve, reject) => {
            signal = request.signal;
            request.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
          }),
      ),
    });
    const pending = handleModelCompanionRequest(request("POST", payload, headers), codexConfig, backend);
    await vi.waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
    backend.close?.();
    expect(signal?.aborted).toBe(true);
    expect((await pending).status).toBe(502);
  });

  it("rejects a different Codex model, a missing schema, and concurrent generations", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = vi.fn(async () => {
      await pending;
      return { finalResponse: "{}" };
    });
    const backend = createCodexModelBackend(codexConfig, { run });
    const headers = { authorization: `Bearer ${codexToken}` };
    const format = {
      type: "json_schema",
      json_schema: { name: "result", strict: true, schema: { type: "object" } },
    };

    expect(
      (
        await handleModelCompanionRequest(
          request("POST", { ...validPayload, model: "other", response_format: format }, headers),
          codexConfig,
          backend,
        )
      ).status,
    ).toBe(400);
    expect(
      (await handleModelCompanionRequest(request("POST", { ...validPayload, model: codexConfig.model }, headers), codexConfig, backend))
        .status,
    ).toBe(400);

    const first = handleModelCompanionRequest(
      request("POST", { ...validPayload, model: codexConfig.model, response_format: format }, headers),
      codexConfig,
      backend,
    );
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    const concurrent = await handleModelCompanionRequest(
      request("POST", { ...validPayload, model: codexConfig.model, response_format: format }, headers),
      codexConfig,
      backend,
    );
    expect(concurrent.status).toBe(429);
    release?.();
    expect((await first).status).toBe(200);
  });

  it("keeps model discovery inside the companion route and response limits", async () => {
    const wrongMethod = await handleModelCompanionRequest(
      new Request("http://127.0.0.1:8790/v1/models", { method: "POST", headers: { origin: config.allowedOrigin } }),
      config,
    );
    expect(wrongMethod.status).toBe(405);

    const denied = await handleModelCompanionRequest(
      new Request("http://127.0.0.1:8790/v1/models", { headers: { origin: "https://attacker.example" } }),
      config,
    );
    expect(denied.status).toBe(403);

    const unavailableRoute = await handleModelCompanionRequest(
      new Request("http://127.0.0.1:8790/v1/models", { headers: { origin: config.allowedOrigin } }),
      { ...config, upstream: new URL("http://127.0.0.1:1234/custom") },
    );
    expect(unavailableRoute.status).toBe(404);

    const providerFailure = await handleModelCompanionRequest(
      new Request("http://127.0.0.1:8790/v1/models", { headers: { origin: config.allowedOrigin } }),
      config,
      vi.fn<typeof fetch>().mockRejectedValue(new Error("private provider detail")),
    );
    expect(providerFailure.status).toBe(502);
    await expect(providerFailure.json()).resolves.toEqual({ error: "Local model unavailable" });

    const timedOut = await handleModelCompanionRequest(
      new Request("http://127.0.0.1:8790/v1/models", { headers: { origin: config.allowedOrigin } }),
      config,
      vi.fn<typeof fetch>().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );
    expect(timedOut.status).toBe(502);
    await expect(timedOut.json()).resolves.toEqual({ error: "Local model discovery timed out" });

    const exact = await handleModelCompanionRequest(
      new Request("http://127.0.0.1:8790/v1/models", { headers: { origin: config.allowedOrigin } }),
      config,
      vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(256 * 1_024))),
    );
    expect((await exact.arrayBuffer()).byteLength).toBe(256 * 1_024);

    const oversized = await handleModelCompanionRequest(
      new Request("http://127.0.0.1:8790/v1/models", { headers: { origin: config.allowedOrigin } }),
      config,
      vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(256 * 1_024 + 1))),
    );
    expect(oversized.status).toBe(502);
  });

  it("forwards a validated request only to the configured provider and bounds the response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ choices: [{ message: { content: "A reviewed replacement." } }] }, { status: 201 }));
    const response = await handleModelCompanionRequest(request("POST", validPayload), config, fetcher);

    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe(config.allowedOrigin);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ choices: [{ message: { content: "A reviewed replacement." } }] });
    expect(fetcher).toHaveBeenCalledOnce();
    const [upstream, init] = fetcher.mock.calls[0] ?? [];
    expect(String(upstream)).toBe(config.upstream.href);
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { "content-type": "application/json" } });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
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
      [request("POST", { ...validPayload, model: " ".repeat(4) }), 400],
      [request("POST", { ...validPayload, model: "x".repeat(257) }), 400],
      [request("POST", { ...validPayload, stream: true }), 400],
      [request("POST", { ...validPayload, temperature: -0.1 }), 400],
      [request("POST", { ...validPayload, temperature: 3 }), 400],
      [request("POST", { ...validPayload, reasoning_effort: "extreme" }), 400],
      [request("POST", { ...validPayload, response_format: "json" }), 400],
      [request("POST", { ...validPayload, response_format: { type: "json_schema", json_schema: {} } }), 400],
      [
        request("POST", {
          ...validPayload,
          response_format: { type: "text", json_schema: { name: "revision", strict: true, schema: {} } },
        }),
        400,
      ],
      [
        request("POST", {
          ...validPayload,
          response_format: { type: "json_schema", json_schema: { name: " ", strict: true, schema: {} } },
        }),
        400,
      ],
      [
        request("POST", {
          ...validPayload,
          response_format: { type: "json_schema", json_schema: { name: "x".repeat(129), strict: true, schema: {} } },
        }),
        400,
      ],
      [
        request("POST", {
          ...validPayload,
          response_format: { type: "json_schema", json_schema: { name: "revision", strict: false, schema: {} } },
        }),
        400,
      ],
      [
        request("POST", {
          ...validPayload,
          response_format: { type: "json_schema", json_schema: { name: "revision", strict: true, schema: [] } },
        }),
        400,
      ],
      [request("POST", { ...validPayload, messages: [] }), 400],
      [request("POST", { ...validPayload, messages: Array.from({ length: 17 }, () => ({ role: "user", content: "x" })) }), 400],
      [request("POST", { ...validPayload, messages: [{ role: "tool", content: "x" }] }), 400],
      [request("POST", { ...validPayload, messages: [{ role: "user", content: 1 }] }), 400],
      [request("POST", { ...validPayload, messages: [{ role: "user", content: "x".repeat(128 * 1_024 + 1) }] }), 400],
    ] as const;
    for (const [candidate, status] of cases) {
      const response = await handleModelCompanionRequest(candidate, config, fetcher);
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toHaveProperty("error");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts the exact model request boundaries", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [] }));
    for (const payload of [
      { ...validPayload, model: "x".repeat(256) },
      { ...validPayload, temperature: 0 },
      { ...validPayload, temperature: 2 },
      { ...validPayload, reasoning_effort: "none" },
      { ...validPayload, reasoning_effort: "low" },
      { ...validPayload, reasoning_effort: "medium" },
      { ...validPayload, reasoning_effort: "high" },
      {
        ...validPayload,
        response_format: {
          type: "json_schema",
          json_schema: { name: "x".repeat(128), strict: true, schema: { type: "object" } },
        },
      },
      { ...validPayload, messages: [{ role: "assistant", content: "x" }] },
      { ...validPayload, messages: Array.from({ length: 16 }, () => ({ role: "user", content: "x" })) },
      { ...validPayload, messages: [{ role: "user", content: "x".repeat(128 * 1_024) }] },
    ]) {
      expect((await handleModelCompanionRequest(request("POST", payload), config, fetcher)).status).toBe(200);
    }
    expect(fetcher).toHaveBeenCalledTimes(11);
  });

  it("rejects declared and streamed request bodies above the byte limit", async () => {
    const exact = request("POST", validPayload, { "content-length": String(256 * 1_024) });
    expect(
      (await handleModelCompanionRequest(exact, config, vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [] })))).status,
    ).toBe(200);

    const declared = request("POST", validPayload, { "content-length": String(256 * 1_024 + 1) });
    const declaredResponse = await handleModelCompanionRequest(declared, config);
    expect(declaredResponse.status).toBe(400);
    await expect(declaredResponse.json()).resolves.toEqual({ error: `Model payload exceeds ${256 * 1_024} bytes` });

    const streamed = new Request("http://127.0.0.1:8790/v1/chat/completions", {
      method: "POST",
      headers: { origin: config.allowedOrigin, "content-type": "application/json" },
      body: new Uint8Array(256 * 1_024 + 1),
    });
    expect((await handleModelCompanionRequest(streamed, config)).status).toBe(400);
  });

  it("does not expose provider errors or oversized responses", async () => {
    const unavailable = await handleModelCompanionRequest(
      request("POST", validPayload),
      config,
      vi.fn<typeof fetch>().mockRejectedValue(new Error("provider secret")),
    );
    expect(unavailable.status).toBe(502);
    await expect(unavailable.json()).resolves.toEqual({ error: "Local model unavailable" });

    const timedOut = await handleModelCompanionRequest(
      request("POST", validPayload),
      config,
      vi.fn<typeof fetch>().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );
    expect(timedOut.status).toBe(502);
    await expect(timedOut.json()).resolves.toEqual({ error: "Local model request timed out" });

    const exact = await handleModelCompanionRequest(
      request("POST", validPayload),
      config,
      vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(256 * 1_024))),
    );
    expect((await exact.arrayBuffer()).byteLength).toBe(256 * 1_024);

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
