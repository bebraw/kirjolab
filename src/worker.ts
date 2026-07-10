import { createHealthResponse } from "./api/health";
import { handleWorkspaceApi } from "./api/workspace";
import { exampleRoutes } from "./app-routes";
import { DocumentRoom } from "./durable-objects/document-room";
import { WorkspaceCatalog } from "./durable-objects/workspace-catalog";
import { WorkspaceAccess } from "./durable-objects/workspace-access";
import { authenticateRequest, isSameOriginMutation, type AuthIdentity } from "./security/auth";
import { renderHomePage } from "./views/home";
import { renderNotFoundPage } from "./views/not-found";
import { cssResponse, htmlResponse, scriptResponse } from "./views/shared";

export { DocumentRoom, WorkspaceAccess, WorkspaceCatalog };

export default {
  async fetch(request: Request, env?: Env): Promise<Response> {
    return await handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;

export async function handleRequest(request: Request, env?: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/styles.css") {
    return cssResponse(await loadStylesheet());
  }

  if (url.pathname === "/app.js") {
    return scriptResponse(await loadClientScript());
  }

  if (url.pathname === "/pdf.worker.js") {
    return scriptResponse(await loadPdfWorkerScript());
  }

  if (url.pathname === "/satteri_napi.wasm32-wasi.wasm" || url.pathname === "/satteri-wasi-worker.mjs") {
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    return await loadSatteriAsset(request, env);
  }

  if (url.pathname === "/api/health") {
    return createHealthResponse(exampleRoutes.map((route) => route.path));
  }

  let identity: AuthIdentity = { subject: "test", email: "local@kirjolab.invalid", ownerKey: "local", mode: "local" };
  if (env) {
    const authentication = await authenticateRequest(request, env);
    if (!authentication.ok) return authentication.response;
    identity = authentication.identity;
  }
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin mutation denied" }, { status: 403 });

  if (url.pathname === "/api/session") {
    return Response.json({ email: identity.email, mode: identity.mode }, { headers: { "cache-control": "no-store" } });
  }

  if (url.pathname === "/") {
    return htmlResponse(renderHomePage(exampleRoutes, "demo", identity.email), 200, url);
  }

  const workspacePage = /^\/workspaces\/([a-z0-9-]{1,64})$/iu.exec(url.pathname);
  if (workspacePage?.[1]) {
    return htmlResponse(renderHomePage(exampleRoutes, workspacePage[1], identity.email), 200, url);
  }

  if (url.pathname === "/api/workspaces" || url.pathname.startsWith("/api/workspaces/")) {
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    return await handleWorkspaceApi(request, env, identity);
  }

  return htmlResponse(renderNotFoundPage(url.pathname), 404, url);
}

async function loadStylesheet(): Promise<string> {
  // Stryker disable next-line ConditionalExpression: WebSocketPair is a Worker runtime primitive absent from Node unit tests.
  if (typeof WebSocketPair === "undefined") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return await readFile(fileURLToPath(new URL("../.generated/styles.css", import.meta.url).href), "utf8");
  }

  const styles = await import("../.generated/styles.css");
  return styles.default;
}

async function loadClientScript(): Promise<string> {
  // Stryker disable next-line ConditionalExpression: WebSocketPair is a Worker runtime primitive absent from Node unit tests.
  if (typeof WebSocketPair === "undefined") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return await readFile(fileURLToPath(new URL("../.generated/app.txt", import.meta.url).href), "utf8");
  }

  const script = await import("../.generated/app.txt");
  return script.default;
}

async function loadPdfWorkerScript(): Promise<string> {
  // Stryker disable next-line ConditionalExpression: WebSocketPair is a Worker runtime primitive absent from Node unit tests.
  if (typeof WebSocketPair === "undefined") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return await readFile(fileURLToPath(new URL("../.generated/pdf-worker.txt", import.meta.url).href), "utf8");
  }

  const script = await import("../.generated/pdf-worker.txt");
  return script.default;
}

async function loadSatteriAsset(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  const headers = new Headers(asset.headers);
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}
