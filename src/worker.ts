import { createHealthResponse } from "./api/health";
import { handleBackupApi } from "./api/backups";
import { renderExportPdf } from "./api/export-artifacts";
import { handleWorkspaceApi } from "./api/workspace";
import { handleReferenceLibraryApi } from "./api/reference-library";
import { exampleRoutes } from "./app-routes";
import { buildExportBundle } from "./domain/export-pipeline";
import { DocumentRoom } from "./durable-objects/document-room";
import { WorkspaceCatalog } from "./durable-objects/workspace-catalog";
import { WorkspaceAccess } from "./durable-objects/workspace-access";
import { ReferenceLibrary } from "./durable-objects/reference-library";
import { BackupCoordinator } from "./durable-objects/backup-coordinator";
import { BackupRecovery } from "./durable-objects/backup-recovery";
import { authenticateRequest, isSameOriginMutation, type AuthIdentity } from "./security/auth";
import { renderHomePage } from "./views/home";
import { renderNotFoundPage } from "./views/not-found";
import { renderReadOnlySharePage } from "./views/read-only-share";
import { cssResponse, htmlResponse, scriptResponse } from "./views/shared";

export { BackupCoordinator, BackupRecovery, DocumentRoom, ReferenceLibrary, WorkspaceAccess, WorkspaceCatalog };

export default {
  async fetch(request: Request, env?: Env, ctx?: ExecutionContext): Promise<Response> {
    return await handleRequest(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledBackups(env));
  },
} satisfies ExportedHandler<Env>;

export async function handleRequest(request: Request, env?: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/styles.css") {
    return cssResponse(await loadStylesheet());
  }

  if (url.pathname === "/app.js") {
    return scriptResponse(await loadClientScript());
  }

  if (url.pathname === "/read-only-share.js") {
    return scriptResponse(await loadReadOnlyShareScript());
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

  const readOnlyShare = /^\/share\/([a-z0-9-]{1,64})\.([A-Za-z0-9_-]{43})(\/document\.pdf|\/socket)?$/u.exec(url.pathname);
  if (readOnlyShare?.[1] && readOnlyShare[2]) {
    if (request.method !== "GET" && request.method !== "HEAD") return Response.json({ error: "Method not allowed" }, { status: 405 });
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    const locator = readOnlyShare[1];
    const resolved = await env.WORKSPACE_ACCESS.getByName(locator).resolveReadOnlyShare(readOnlyShare[2]);
    if (!resolved.valid) return htmlResponse(renderNotFoundPage("/share"), 404, url);
    const target = resolved.target ?? { storageKey: locator, workspaceId: locator };
    const room = env.DOCUMENT_ROOMS.getByName(target.storageKey);
    if (readOnlyShare[3] === "/socket") {
      if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin WebSocket denied" }, { status: 403 });
      const headers = new Headers(request.headers);
      headers.set("x-kirjolab-read-only", "1");
      return await room.fetch(new Request(request, { headers }));
    }
    const snapshot = await room.getSnapshot(target.workspaceId);
    if (readOnlyShare[3]) return sharedPdfResponse(await renderExportPdf(buildExportBundle(snapshot)));
    const sharePath = `/share/${locator}.${readOnlyShare[2]}`;
    return htmlResponse(renderReadOnlySharePage(snapshot, sharePath, url.searchParams.get("view")), 200, url, {
      allowSameOriginFrames: true,
      crossOriginIsolated: false,
    });
  }

  let identity: AuthIdentity = { subject: "test", email: "local@kirjolab.invalid", ownerKey: "local", mode: "local" };
  if (env) {
    const authentication = await authenticateRequest(request, env);
    if (!authentication.ok) return authentication.response;
    identity = authentication.identity;
    if (identity.mode === "access") {
      const registration = env.BACKUP_COORDINATOR.getByName("primary").registerOwner(identity.ownerKey, identity.email);
      if (ctx) ctx.waitUntil(registration);
      else await registration;
    }
  }
  if (!isSameOriginMutation(request)) return Response.json({ error: "Cross-origin mutation denied" }, { status: 403 });

  if (url.pathname === "/api/session") {
    return Response.json({ email: identity.email, mode: identity.mode }, { headers: { "cache-control": "no-store" } });
  }

  if (url.pathname === "/api/backups" || url.pathname.startsWith("/api/backups/")) {
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    return await handleBackupApi(request, env, identity);
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

  if (url.pathname === "/api/library" || url.pathname.startsWith("/api/library/")) {
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    return await handleReferenceLibraryApi(request, env, identity);
  }

  return htmlResponse(renderNotFoundPage(url.pathname), 404, url);
}

function sharedPdfResponse(body: Uint8Array): Response {
  const bytes = new Uint8Array(body);
  return new Response(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.byteLength),
      "content-disposition": 'inline; filename="kirjolab-document.pdf"',
      "cache-control": "no-store",
      "content-security-policy": "frame-ancestors 'self'",
      "cross-origin-resource-policy": "same-origin",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function runScheduledBackups(env: Env): Promise<void> {
  const summary = await env.BACKUP_COORDINATOR.getByName("primary").runScheduledBackups();
  console.log(JSON.stringify({ event: "scheduled-backup", ...summary }));
  if (summary.failed > 0 || summary.truncated) throw new Error("Scheduled backup did not process every registered owner successfully");
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

async function loadReadOnlyShareScript(): Promise<string> {
  // Stryker disable next-line ConditionalExpression: WebSocketPair is a Worker runtime primitive absent from Node unit tests.
  if (typeof WebSocketPair === "undefined") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return await readFile(fileURLToPath(new URL("./client/read-only-share.txt", import.meta.url).href), "utf8");
  }

  const script = await import("./client/read-only-share.txt");
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
