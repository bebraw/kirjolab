import { createHealthResponse } from "./api/health";
import { handleBackupApi } from "./api/backups";
import { handleEditShareRequest } from "./api/edit-share";
import { renderExportPdf } from "./api/export-artifacts";
import { handleWorkspaceApi } from "./api/workspace";
import { handleProjectTemplateApi } from "./api/project-templates";
import { handleGitHubConnectionApi } from "./api/github-connection";
import { handleGitHubImportApi } from "./api/github-sync";
import { handleLatexImportApi } from "./api/latex-import";
import { handleReferenceLibraryApi } from "./api/reference-library";
import {
  createReviewResource,
  discoverLegacyReviews,
  ensureLegacyReviewResource,
  handleReviewsApi,
  publicReview,
  resolveReviewResource,
  reviewProjectLinkViews,
} from "./api/reviews";
import { exampleRoutes } from "./app-routes";
import { buildExportBundle } from "./domain/export-pipeline";
import { DocumentRoom } from "./durable-objects/document-room";
import { WorkspaceCatalog } from "./durable-objects/workspace-catalog";
import { ProjectTemplateCatalog } from "./durable-objects/project-template-catalog";
import { ReviewAccess } from "./durable-objects/review-access";
import { ReviewCatalog } from "./durable-objects/review-catalog";
import { ReviewStudy } from "./durable-objects/review-study";
import { WorkspaceAccess } from "./durable-objects/workspace-access";
import { ReferenceLibrary } from "./durable-objects/reference-library";
import { BackupCoordinator } from "./durable-objects/backup-coordinator";
import { BackupRecovery } from "./durable-objects/backup-recovery";
import { authenticateRequest, isSameOriginMutation, type AuthIdentity } from "./security/auth";
import { renderHomePage } from "./views/home";
import { renderDashboardPage } from "./views/dashboard";
import { renderNotFoundPage } from "./views/not-found";
import { renderReadOnlySharePage } from "./views/read-only-share";
import { renderReviewPage, renderReviewsPage } from "./views/reviews";
import { cssResponse, faviconResponse, htmlResponse, pdfResponse, scriptResponse } from "./views/shared";
import { renderUiInventoryPage } from "./views/ui-inventory";
import phrasingGuidanceSources from "../phrasing-guidance/sources.json";

export {
  BackupCoordinator,
  BackupRecovery,
  DocumentRoom,
  ProjectTemplateCatalog,
  ReferenceLibrary,
  ReviewAccess,
  ReviewCatalog,
  ReviewStudy,
  WorkspaceAccess,
  WorkspaceCatalog,
};

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

  if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") {
    return faviconResponse();
  }

  if (url.pathname === "/app.js") {
    return scriptResponse(await loadClientScript());
  }

  if (url.pathname === "/review-app.js") {
    return scriptResponse(await loadReviewClientScript());
  }

  if (url.pathname === "/service-worker.js") {
    return scriptResponse(await loadServiceWorkerScript());
  }

  if (url.pathname === "/shared-editor.js") {
    return scriptResponse(await loadSharedEditorScript());
  }

  if (url.pathname === "/pdf.worker.js") {
    return scriptResponse(await loadPdfWorkerScript());
  }

  if (/^\/(?:markdown-module|pdfjs-module)-[a-f0-9]{16}\.js$/u.test(url.pathname)) {
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    return await loadBrowserRuntimeAsset(request, env);
  }

  if (url.pathname === "/api/health") {
    return createHealthResponse(exampleRoutes.map((route) => route.path));
  }

  if (url.pathname === "/phrasing-guidance/sources.json") {
    if (request.method !== "GET" && request.method !== "HEAD") return Response.json({ error: "Method not allowed" }, { status: 405 });
    return Response.json(phrasingGuidanceSources, {
      headers: { "cache-control": "public, max-age=3600", "content-disposition": 'inline; filename="sources.json"' },
    });
  }

  if (url.pathname === "/__ui") {
    const authMode: string | undefined = env?.AUTH_MODE;
    return authMode === "access"
      ? htmlResponse(renderNotFoundPage(url.pathname), 404, url)
      : htmlResponse(renderUiInventoryPage(), 200, url);
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
    if (readOnlyShare[3]) return pdfResponse(await renderExportPdf(buildExportBundle(snapshot)));
    const sharePath = `/share/${locator}.${readOnlyShare[2]}`;
    return htmlResponse(
      renderReadOnlySharePage(snapshot, sharePath, url.searchParams.get("file"), url.searchParams.get("view")),
      200,
      url,
      { allowSameOriginFrames: true },
    );
  }

  const editShareResponse = await handleEditShareRequest(request, env);
  if (editShareResponse) return editShareResponse;

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

  if (url.pathname === "/api/project-templates" || url.pathname.startsWith("/api/project-templates/")) {
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    return await handleProjectTemplateApi(request, env, identity);
  }

  if (url.pathname === "/api/github/import-previews" || url.pathname === "/api/github/imports") {
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    return await handleGitHubImportApi(request, env, identity);
  }

  if (url.pathname === "/api/latex-import-previews" || url.pathname === "/api/latex-imports") {
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    return await handleLatexImportApi(request, env, identity);
  }

  if (
    url.pathname === "/api/github/connection" ||
    url.pathname === "/api/github/connect" ||
    url.pathname === "/api/github/callback" ||
    url.pathname === "/api/github/install" ||
    url.pathname === "/api/github/setup" ||
    url.pathname === "/api/github/installations" ||
    url.pathname.startsWith("/api/github/installations/")
  ) {
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    return await handleGitHubConnectionApi(request, env, identity);
  }

  if (url.pathname === "/") {
    const [workspaces, library, reviews] = env
      ? await Promise.all([
          env.WORKSPACE_CATALOGS.getByName(identity.ownerKey).listWorkspaces(),
          env.REFERENCE_LIBRARIES.getByName(identity.ownerKey).getSnapshot(),
          discoverLegacyReviews(env, identity),
        ])
      : [fallbackWorkspaces(), null, fallbackReviews()];
    return htmlResponse(renderDashboardPage(workspaces, library, reviews, identity.email, identity.mode), 200, url);
  }

  if (url.pathname === "/library" || /^\/library\/pdfs\/[^/]+$/u.test(url.pathname)) {
    return htmlResponse(renderHomePage(exampleRoutes, "demo", identity.email, identity.mode, "library"), 200, url);
  }

  if (url.pathname === "/editor") {
    const workspaceId = env ? firstActiveWorkspaceId(await env.WORKSPACE_CATALOGS.getByName(identity.ownerKey).listWorkspaces()) : "demo";
    return redirectResponse(`/editor/${encodeURIComponent(workspaceId)}${url.search}`, 302);
  }

  const legacyWorkspacePage = /^\/workspaces\/([a-z0-9-]{1,64})$/iu.exec(url.pathname);
  if (legacyWorkspacePage?.[1]) {
    return redirectResponse(`/editor/${encodeURIComponent(legacyWorkspacePage[1])}${url.search}`, 308);
  }

  const editorPage = /^\/editor\/([a-z0-9-]{1,64})$/iu.exec(url.pathname);
  if (editorPage?.[1]) {
    return htmlResponse(renderHomePage(exampleRoutes, editorPage[1], identity.email, identity.mode), 200, url);
  }

  if (url.pathname === "/review") {
    if (request.method === "POST") {
      if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
      try {
        const form = await request.formData();
        const title = String(form.get("title") ?? "").trim();
        const profile = form.get("profile");
        if (!title || title.length > 120 || (profile !== "slr" && profile !== "mlr")) {
          return Response.json({ error: "Review creation request is invalid" }, { status: 400 });
        }
        const resource = await createReviewResource(env, identity, title, profile);
        return redirectResponse(resource.record.href, 303);
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Review creation failed" }, { status: 400 });
      }
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    const reviews = env ? await discoverLegacyReviews(env, identity) : fallbackReviews();
    return htmlResponse(renderReviewsPage(reviews, identity.email, identity.mode), 200, url);
  }

  const reviewProjectLinksPage = /^\/review\/([a-f0-9-]{36})\/project-links$/iu.exec(url.pathname);
  if (reviewProjectLinksPage?.[1]) {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    const form = await request.formData();
    const workspaceId = String(form.get("workspaceId") ?? "");
    const apiRequest = new Request(`${url.origin}/api/reviews/${reviewProjectLinksPage[1]}/project-links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    const response = await handleReviewsApi(apiRequest, env, identity);
    if (response.ok) return redirectResponse(`/review/${reviewProjectLinksPage[1]}`, 303);
    return response;
  }

  const reviewPage = /^\/review\/([a-z0-9-]{1,64})$/iu.exec(url.pathname);
  if (reviewPage?.[1]) {
    if (!env) {
      if (reviewPage[1] === "demo") return redirectResponse(`/review/${fallbackReviewId}${url.search}`, 308);
      const review = fallbackReviews().find((candidate) => candidate.id === reviewPage[1]);
      if (!review) return htmlResponse(renderNotFoundPage(url.pathname), 404, url);
      return htmlResponse(
        renderReviewPage(review, fallbackReviewMembers(), fallbackReviewProjectLinks(), identity.email, identity.mode),
        200,
        url,
      );
    }
    try {
      const resource = await resolveReviewResource(env, identity, reviewPage[1]);
      if (!resource) {
        const legacy = await ensureLegacyReviewResource(env, identity, reviewPage[1]);
        if (!legacy) return htmlResponse(renderNotFoundPage(url.pathname), 404, url);
        return redirectResponse(`${legacy.record.href}${url.search}`, 308);
      }
      const [members, projectLinks, workspaces] = await Promise.all([
        resource.access.listMembers(identity.email),
        reviewProjectLinkViews(env, identity, resource.access),
        env.WORKSPACE_CATALOGS.getByName(identity.ownerKey).listWorkspaces(),
      ]);
      const activeWorkspaceIds = new Set(projectLinks.filter((link) => link.status === "active").map((link) => link.workspaceId));
      const linkableProjects = workspaces.filter((workspace) => workspace.archivedAt === null && !activeWorkspaceIds.has(workspace.id));
      return htmlResponse(
        renderReviewPage(publicReview(resource.record), members, projectLinks, identity.email, identity.mode, linkableProjects),
        200,
        url,
      );
    } catch {
      return htmlResponse(renderNotFoundPage(url.pathname), 404, url);
    }
  }

  if (url.pathname === "/api/reviews" || url.pathname.startsWith("/api/reviews/")) {
    if (!env) return Response.json({ error: "Worker bindings unavailable" }, { status: 503 });
    return await handleReviewsApi(request, env, identity);
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

function fallbackWorkspaces() {
  const now = new Date().toISOString();
  return [{ id: "demo", title: "Evidence becomes prose", href: "/editor/demo", createdAt: now, updatedAt: now, archivedAt: null }];
}

const fallbackReviewId = "00000000-0000-4000-8000-000000000151";

function fallbackReviews() {
  const now = new Date().toISOString();
  return [
    {
      id: fallbackReviewId,
      title: "Evidence becomes prose",
      profile: "slr" as const,
      href: `/review/${fallbackReviewId}`,
      role: "owner" as const,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    },
  ];
}

function fallbackReviewMembers() {
  return [
    {
      id: "00000000-0000-4000-8000-000000000001",
      email: "local@kirjolab.invalid",
      role: "owner" as const,
      addedAt: new Date().toISOString(),
    },
  ];
}

function fallbackReviewProjectLinks() {
  const createdAt = new Date().toISOString();
  return [
    {
      id: "00000000-0000-4000-8000-000000000002",
      reviewId: fallbackReviewId,
      workspaceId: "demo",
      createdBy: "local@kirjolab.invalid",
      createdAt,
      status: "active" as const,
      unlinkedAt: null,
      unlinkedBy: null,
      project: { id: "demo", title: "Evidence becomes prose", href: "/editor/demo" },
      permission: "available" as const,
    },
  ];
}

function firstActiveWorkspaceId(workspaces: readonly { readonly id: string; readonly archivedAt: string | null }[]): string {
  return workspaces.find((workspace) => workspace.archivedAt === null)?.id ?? "demo";
}

function redirectResponse(location: string, status: 302 | 303 | 308): Response {
  return new Response(null, { status, headers: { location, "cache-control": "no-store" } });
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

async function loadReviewClientScript(): Promise<string> {
  // Stryker disable next-line ConditionalExpression: WebSocketPair is a Worker runtime primitive absent from Node unit tests.
  if (typeof WebSocketPair === "undefined") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return await readFile(fileURLToPath(new URL("../.generated/review-app.txt", import.meta.url).href), "utf8");
  }

  const script = await import("../.generated/review-app.txt");
  return script.default;
}

async function loadServiceWorkerScript(): Promise<string> {
  // Stryker disable next-line ConditionalExpression: WebSocketPair is a Worker runtime primitive absent from Node unit tests.
  if (typeof WebSocketPair === "undefined") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return await readFile(fileURLToPath(new URL("../.generated/service-worker.txt", import.meta.url).href), "utf8");
  }

  const script = await import("../.generated/service-worker.txt");
  return script.default;
}

async function loadSharedEditorScript(): Promise<string> {
  // Stryker disable next-line ConditionalExpression: WebSocketPair is a Worker runtime primitive absent from Node unit tests.
  if (typeof WebSocketPair === "undefined") {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return await readFile(fileURLToPath(new URL("./client/shared-editor.txt", import.meta.url).href), "utf8");
  }

  const script = await import("./client/shared-editor.txt");
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

async function loadBrowserRuntimeAsset(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  const headers = new Headers(asset.headers);
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}
