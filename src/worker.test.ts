import { describe, expect, it } from "vitest";
import { exampleRoutes } from "./app-routes";
import worker, { handleRequest } from "./worker";
import { ensureGeneratedStylesheet } from "./test-support";

ensureGeneratedStylesheet();

describe("worker", () => {
  it("renders the local design-system inventory", async () => {
    const response = await handleRequest(new Request("http://example.com/__ui"));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("data-ui-inventory");
  });

  it("renders the Kirjolab dashboard without the editor application shell", async () => {
    const response = await handleRequest(new Request("http://example.com/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("cross-origin-embedder-policy")).toBeNull();
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'self' ws://example.com");
    expect(response.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(response.headers.get("content-security-policy")).not.toContain("wasm-unsafe-eval");

    const body = await response.text();
    expect(body).toContain("KIRJOLAB");
    expect(body).toContain('data-app-mode="dashboard"');
    expect(body).toContain('id="recent-work-heading"');
    expect(body).not.toContain('<script type="module" src="/app.js"></script>');
    expect(body).not.toContain('id="context-preview-tab"');
    expect(body).not.toContain('id="workspace-surfaces"');
  });

  it("redirects the editor index to the default project and preserves its query", async () => {
    const response = await handleRequest(new Request("http://example.com/editor"));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/editor/demo");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const createResponse = await handleRequest(new Request("http://example.com/editor?create=1"));
    expect(createResponse.status).toBe(302);
    expect(createResponse.headers.get("location")).toBe("/editor/demo?create=1");
  });

  it("renders a stable writing-project editor", async () => {
    const response = await handleRequest(new Request("http://example.com/editor/abc-123"));

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('data-workspace-id="abc-123"');
    expect(body).toContain("/api/workspaces/abc-123/export/document.md");
    expect(body).toContain('<a class="primary-navigation-link" href="/editor/abc-123" aria-current="page">Editor</a>');
  });

  it("permanently redirects legacy workspace links while preserving route state", async () => {
    const response = await handleRequest(new Request("http://example.com/workspaces/abc-123?rail=research&context=pdf%3Apaper-1&page=3"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/editor/abc-123?rail=research&context=pdf%3Apaper-1&page=3");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("renders the evidence-review hub", async () => {
    const response = await handleRequest(new Request("http://example.com/review"));

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('data-app-mode="review-index"');
    expect(body).toContain('id="independent-reviews-heading"');
    expect(body).toContain('href="/review/00000000-0000-4000-8000-000000000151"');
    expect(body).toContain('method="post" action="/review"');
    expect(body).not.toContain('<script type="module" src="/review-app.js"></script>');
  });

  it("redirects the legacy review route to a canonical review resource", async () => {
    const response = await handleRequest(new Request("http://example.com/review/demo?stage=screen"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/review/00000000-0000-4000-8000-000000000151?stage=screen");
  });

  it("renders a standalone independent evidence review", async () => {
    const response = await handleRequest(new Request("http://example.com/review/00000000-0000-4000-8000-000000000151"));

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('data-app-mode="review" data-review-id="00000000-0000-4000-8000-000000000151"');
    expect(body).toContain('<script type="module" src="/review-app.js"></script>');
    expect(body).toContain("Explicit project links");
    expect(body).toContain('<a href="/editor/demo">Open in Editor');
    expect(body).toContain('id="review-protocol-form"');
  });

  it("renders the private library without a workspace resource", async () => {
    const response = await handleRequest(new Request("http://example.com/library"));

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('data-app-mode="library"');
    expect(body).toContain('href="/library" aria-current="page"');
    expect(body).toContain('id="export-library-annotated-pdf"');
  });

  it("renders a directly addressed private library PDF through the library shell", async () => {
    const response = await handleRequest(new Request("http://example.com/library/pdfs/artifact-id?page=3"));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-app-mode="library"');
  });

  it("returns a JSON health response", async () => {
    const response = await handleRequest(new Request("http://example.com/api/health"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      name: "kirjolab",
      routes: exampleRoutes.map((route) => route.path),
    });
  });

  it("serves the public phrasing source ledger", async () => {
    const response = await handleRequest(new Request("http://example.com/phrasing-guidance/sources.json"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    const body = (await response.json()) as { inventoryVersion: string; sources: Array<{ id: string; license: string }> };
    expect(body.inventoryVersion).toBe("2026-07-17.2");
    expect(body.sources[0]).toMatchObject({ id: "plos-biology-2002212", license: "CC-BY-4.0" });
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

  it("serves the SVG favicon and legacy browser fallback", async () => {
    for (const path of ["/favicon.svg", "/favicon.ico"]) {
      const response = await handleRequest(new Request(`http://example.com${path}`));

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/svg+xml");
      expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
      await expect(response.text()).resolves.toContain('fill="#0b6b51"');
    }
  });

  it("serves the generated typed client", async () => {
    const response = await handleRequest(new Request("http://example.com/app.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
    await expect(response.text()).resolves.toBe("export {};");
  });

  it("serves the standalone review client", async () => {
    const response = await handleRequest(new Request("http://example.com/review-app.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    await expect(response.text()).resolves.toBe("export {};");
  });

  it("serves the generated offline service worker", async () => {
    const response = await handleRequest(new Request("http://example.com/service-worker.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    await expect(response.text()).resolves.toContain("addEventListener");
  });

  it("serves the capability-aware shared editor client", async () => {
    const response = await handleRequest(new Request("http://example.com/shared-editor.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    const body = await response.text();
    expect(body).toContain("new WebSocket");
    expect(body).toContain('method: "PATCH"');
    expect(body).toContain('root.dataset.sharedEditorMode === "edit"');
    expect((await handleRequest(new Request("http://example.com/read-only-share.js"))).status).toBe(404);
    expect((await handleRequest(new Request("http://example.com/edit-share.js"))).status).toBe(404);
  });

  it("serves the generated PDF worker", async () => {
    const response = await handleRequest(new Request("http://example.com/pdf.worker.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    await expect(response.text()).resolves.toBe("export {};");
  });

  it("requires runtime assets for the lazy PDF.js module", async () => {
    const response = await handleRequest(new Request("http://example.com/pdfjs-module-0123456789abcdef.js"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Worker bindings unavailable" });
  });

  it("requires runtime assets for the lazy Markdown module", async () => {
    const response = await handleRequest(new Request("http://example.com/markdown-module-fedcba9876543210.js"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Worker bindings unavailable" });
  });

  it("does not treat unversioned browser modules as immutable runtime assets", async () => {
    const response = await handleRequest(new Request("http://example.com/markdown-module-1.js"));

    expect(response.status).toBe(404);
  });

  it("rejects workspace API requests without runtime bindings", async () => {
    const response = await handleRequest(new Request("http://example.com/api/workspaces/demo"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Worker bindings unavailable" });
  });
});
