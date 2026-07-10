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

    const body = await response.text();
    expect(body).toContain("KIRJOLAB");
    expect(body).toContain("Fast preview");
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
      routes: ["/", "/workspaces/:id", "/api/workspaces", "/api/workspaces/demo", "/api/health"],
    });
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

  it("serves the generated PDF worker", async () => {
    const response = await handleRequest(new Request("http://example.com/pdf.worker.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    await expect(response.text()).resolves.toBe("export {};");
  });

  it("rejects workspace API requests without runtime bindings", async () => {
    const response = await handleRequest(new Request("http://example.com/api/workspaces/demo"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Worker bindings unavailable" });
  });
});
