import { describe, expect, it } from "vitest";
import worker, { handleRequest } from "./worker";
import { ensureGeneratedStylesheet } from "./test-support";

ensureGeneratedStylesheet();

describe("worker", () => {
  it("renders the Kirjolab workspace", async () => {
    const response = await handleRequest(new Request("http://example.com/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'self' ws://example.com");
    expect(response.headers.get("content-security-policy")).toContain("script-src 'self' 'wasm-unsafe-eval'");

    const body = await response.text();
    expect(body).toContain("KIRJOLAB");
    expect(body).toContain('id="context-preview-tab"');
  });

  it("renders a stable workspace resource", async () => {
    const response = await handleRequest(new Request("http://example.com/workspaces/abc-123"));

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('data-workspace-id="abc-123"');
    expect(body).toContain("/api/workspaces/abc-123/export/document.md");
  });

  it("returns a JSON health response", async () => {
    const response = await handleRequest(new Request("http://example.com/api/health"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      name: "kirjolab",
      routes: [
        "/",
        "/workspaces/:id",
        "/share/:token",
        "/edit/:token",
        "/api/workspaces",
        "/api/workspaces/demo",
        "/api/session",
        "/api/health",
      ],
    });
  });

  it("returns the authenticated session representation", async () => {
    const response = await handleRequest(new Request("http://example.com/api/session"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ email: "local@kirjolab.invalid", mode: "local" });
  });

  it("rejects cross-origin mutations before routing", async () => {
    const response = await handleRequest(new Request("http://example.com/missing", { method: "POST" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Cross-origin mutation denied" });
  });

  it("rejects WebSocket upgrades without an exact same-origin Origin", async () => {
    const missingOrigin = await handleRequest(
      new Request("http://example.com/api/workspaces/demo/socket", { headers: { upgrade: "websocket" } }),
    );
    expect(missingOrigin.status).toBe(403);

    const foreignOrigin = await handleRequest(
      new Request("http://example.com/api/workspaces/demo/socket", {
        headers: { origin: "http://attacker.example", upgrade: "websocket" },
      }),
    );
    expect(foreignOrigin.status).toBe(403);

    const sameOrigin = await handleRequest(
      new Request("http://example.com/api/workspaces/demo/socket", {
        headers: { origin: "http://example.com", upgrade: "websocket" },
      }),
    );
    expect(sameOrigin.status).toBe(503);
  });

  it("returns a not found page for unknown routes", async () => {
    const response = await handleRequest(new Request("http://example.com/missing"));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.text();
    expect(body).toContain("Not Found");
    expect(body).toContain("/missing");
  });

  it("exposes the same behavior through the worker fetch entrypoint", async () => {
    const response = await worker.fetch(new Request("http://example.com/api/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it("serves generated styles", async () => {
    const response = await handleRequest(new Request("http://example.com/styles.css"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/css");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toContain("--color-app-canvas:#f3eee6");
  });

  it("serves the generated typed client", async () => {
    const response = await handleRequest(new Request("http://example.com/app.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    await expect(response.text()).resolves.toBe("export {};");
  });

  it("serves the lightweight read-only share client", async () => {
    const response = await handleRequest(new Request("http://example.com/read-only-share.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(await response.text()).toContain("new WebSocket");
  });

  it("serves the lightweight edit-share client", async () => {
    const response = await handleRequest(new Request("http://example.com/edit-share.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(await response.text()).toContain('method: "PATCH"');
  });

  it("serves the generated PDF worker", async () => {
    const response = await handleRequest(new Request("http://example.com/pdf.worker.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    await expect(response.text()).resolves.toBe("export {};");
  });

  it("requires runtime assets for Satteri browser modules", async () => {
    const response = await handleRequest(new Request("http://example.com/satteri_napi.wasm32-wasi.wasm"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Worker bindings unavailable" });
  });

  it("rejects workspace API requests without runtime bindings", async () => {
    const response = await handleRequest(new Request("http://example.com/api/workspaces/demo"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Worker bindings unavailable" });
  });
});
